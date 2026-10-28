import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { createClient } from "@supabase/supabase-js";
import { presentationFixture } from "../presentations/fixture";
import { blankPresentation, createBlock, validatePresentation, MAX_PRESENTATION_BYTES, type Presentation } from "../../lib/presentations/contracts";
import { handlePresentations, SupabasePresentationStore } from "../../lib/server/presentation-http";
import { PersistenceError } from "../../lib/server/errors";
const actor = "00000000-0000-4000-8000-000000000001", outsider = "00000000-0000-4000-8000-000000000002";
const origin = "https://football.example";
function setup() {
  const bundle = presentationFixture(), presentation = blankPresentation(bundle.organizationId); presentation.id = "review";
  presentation.blocks.push(createBlock("diagram", "Rondo", { kind: "scene", ref: { id: "presentation-0", revision: 1 }, seconds: 0 }));
  let writes = 0;
  const context = { actor, coaching: { load: async () => ({ version: 3, bundle }), save: async () => { throw new Error("Calendar must not be written"); } }, presentations: {
    list: async () => [presentation], save: async (_org: string, _actor: string, _expected: number, p: Presentation) => { writes++; return p.revision; },
  } };
  return { bundle, presentation, context, writes: () => writes };
}
test("presentation HTTP authenticates tenant, checks origin and source graph before write, never rewrites calendar", async () => {
  const f = setup(), before = JSON.stringify(f.bundle);
  const req = (p: unknown, requestOrigin = origin) => new Request(`${origin}/api/presentations`, { method: "POST", headers: { origin: requestOrigin, "Content-Type": "application/json" }, body: JSON.stringify(p) });
  const body = { expectedRevision: 0, presentation: f.presentation };
  const success = await handlePresentations(req(body), f.bundle.organizationId, origin, async () => f.context);
  assert.equal(success.status, 200); assert.deepEqual(await success.json(), { revision: 1 }); assert.match(success.headers.get("cache-control")!, /no-store/);
  assert.equal((await handlePresentations(req(body, "https://evil.example"), f.bundle.organizationId, origin, async () => { throw new Error("must not authenticate"); })).status, 403);
  assert.equal((await handlePresentations(req(body), f.bundle.organizationId, origin, async () => { throw new PersistenceError(401, "Sign in required"); })).status, 401);
  assert.equal((await handlePresentations(req({ ...body, expectedRevision: 2 }), f.bundle.organizationId, origin, async () => f.context)).status, 400);
  const invalid = structuredClone(f.presentation); invalid.organizationId = "another-org";
  assert.equal((await handlePresentations(req({ ...body, presentation: invalid }), f.bundle.organizationId, origin, async () => f.context)).status, 400);
  invalid.organizationId = f.bundle.organizationId; invalid.blocks[0].source!.ref.revision = 999;
  assert.equal((await handlePresentations(req({ ...body, presentation: invalid }), f.bundle.organizationId, origin, async () => f.context)).status, 400);
  assert.equal(f.writes(), 1); assert.equal(JSON.stringify(f.bundle), before);
});
test("presentation reads reject corrupt, cross-tenant and substituted revision results", async () => {
  const f = setup();
  const read = (query = "") => handlePresentations(new Request(`${origin}/api/presentations${query}`), f.bundle.organizationId, origin, async () => f.context);
  assert.equal((await read()).status, 200); assert.equal((await read("?revision=1")).status, 400);
  assert.equal((await read("?id=review&revision=2")).status, 503);
  f.presentation.organizationId = "other"; assert.equal((await read()).status, 503);
});
test("real Supabase SDK presentation reads use RLS reader and writes use isolated server RPC", async () => {
  const f = setup(), seen: { url: string; key: string | null; body: string }[] = [];
  const transport: typeof fetch = async (input, init) => {
    const r = new Request(input, init); seen.push({ url: r.url, key: r.headers.get("apikey"), body: await r.text() });
    return Response.json(r.url.includes("/rpc/") ? 1 : [{ payload: f.presentation }]);
  };
  const reader = createClient("https://db.example", "public-key", { global: { fetch: transport } });
  const writer = createClient("https://db.example", "private-key", { global: { fetch: transport } });
  const store = new SupabasePresentationStore(reader, () => writer);
  assert.equal((await store.list(f.bundle.organizationId)).length, 1);
  assert.equal(await store.save(f.bundle.organizationId, actor, 0, f.presentation), 1);
  assert.ok(seen[0].url.includes("presentations_current")); assert.equal(seen[0].key, "public-key");
  assert.ok(seen[1].url.endsWith("/rpc/save_presentation")); assert.equal(seen[1].key, "private-key");
  assert.equal(JSON.parse(seen[1].body).p_actor, actor); assert.equal(seen.some(s => s.url.includes("save_coaching_bundle")), false);
});
test("exact additive SQL migration enforces tenant RLS, revision CAS, immutable history and guarded rollback", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth,public to anon,authenticated,service_role; insert into auth.users values ('${actor}'),('${outsider}');`);
    await db.exec(await readFile("supabase/migrations/202610260001_coaching_persistence.sql", "utf8"));
    await db.exec(await readFile("supabase/migrations/202610280001_presentations.sql", "utf8"));
    const f = setup(), org = f.bundle.organizationId;
    await db.query("insert into public.organizations(id,name) values ($1,'Test'),('other-org','Other')", [org]);
    await db.query("insert into public.organization_memberships(organization_id,user_id,role,active) values ($1,$2,'owner',true),('other-org',$3,'owner',true)", [org, actor, outsider]);
    const save = (who: string, expected: number, p: Presentation) => db.query<{ revision: number }>("select public.save_presentation($1,$2,$3,$4::jsonb) as revision", [org, who, expected, JSON.stringify(p)]);
    assert.equal((await save(actor, 0, f.presentation)).rows[0].revision, 1);
    await assert.rejects(save(actor, 0, f.presentation), /Presentation changed/);
    await assert.rejects(save(outsider, 1, { ...f.presentation, revision: 2 }), /Organization unavailable/);
    await assert.rejects(save(actor, 1, { ...f.presentation, organizationId: "other-org", revision: 2 }), /Invalid presentation/);
    await save(actor, 1, { ...f.presentation, revision: 2, title: "Second saved revision" });
    const nearLimit = blankPresentation(org); nearLimit.id = "near-size-limit";
    while (JSON.stringify(nearLimit).length < MAX_PRESENTATION_BYTES - 100) { const b = createBlock("notes", "T".repeat(10000), null); b.notes = "N".repeat(10000); nearLimit.blocks.push(b); }
    let excess = JSON.stringify(nearLimit).length - (MAX_PRESENTATION_BYTES - 100);
    const last = nearLimit.blocks.at(-1)!; const removedNotes = Math.min(last.notes.length, excess); last.notes = last.notes.slice(removedNotes); excess -= removedNotes;
    if (excess) last.title = last.title.slice(excess);
    validatePresentation(nearLimit, f.bundle);
    const databaseBytes = await db.query<{ bytes: number }>("select octet_length($1::jsonb::text) as bytes", [JSON.stringify(nearLimit)]);
    assert.ok(databaseBytes.rows[0].bytes > MAX_PRESENTATION_BYTES, "jsonb formatting exceeds compact application size");
    await save(actor, 0, nearLimit);
    const readAs = (who: string) => db.transaction(async tx => { await tx.exec("set local role authenticated"); await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [who]); return tx.query("select payload from public.presentations_current"); });
    assert.equal((await readAs(actor)).rows.length, 2); assert.equal((await readAs(outsider)).rows.length, 0);
    await assert.rejects(db.transaction(async tx => { await tx.exec("set local role authenticated"); await tx.query("select public.save_presentation($1,$2,2,$3::jsonb)", [org, actor, JSON.stringify({ ...f.presentation, revision: 3 })]); }), /permission denied/);
    await assert.rejects(db.exec("update public.presentation_revisions set payload='{}'"));
    await assert.rejects(db.exec("delete from public.presentation_revisions"));
    assert.equal((await db.query<{ version: number }>("select version from public.organizations where id=$1", [org])).rows[0].version, 0);
    assert.equal((await db.query<{ count: number }>("select count(*)::int as count from public.organization_snapshots")).rows[0].count, 0);
    assert.equal((await db.query<{ payload: unknown }>("select payload from public.presentation_revisions where revision=1")).rows[0].payload instanceof Object, true);
    await assert.rejects(db.exec(await readFile("supabase/rollback/202610280001_empty_presentations_only.sql", "utf8")), /history exists/);
    await db.exec("rollback");
    assert.equal((await db.query<{ count: number }>("select count(*)::int as count from public.presentation_revisions")).rows[0].count, 3);
  } finally { await db.close(); }
});


