import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { PDFDocument } from "pdf-lib";
import { coachingSample } from "../../lib/coaching/sample";
import { domainBundleSchema } from "../../lib/domain/validation";
import { PersistenceError } from "../../lib/server/errors";
import { handleDocument } from "../../lib/server/document-http";
import type { CoachingStore } from "../../lib/server/repositories/coaching";
import type { DocumentStore, ObjectRecord } from "../../lib/server/repositories/documents";

test("production SQL journals immutable private objects and persists exact PDF attachment pins with RLS and safe rollback", async () => {
  const db = new PGlite(), actor = "00000000-0000-4000-8000-000000000001", outsider = "00000000-0000-4000-8000-000000000002";
  try {
    await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth,public to anon,authenticated,service_role;
      insert into auth.users values ('${actor}'),('${outsider}');`);
    await db.exec(await readFile("supabase/migrations/202610260001_coaching_persistence.sql", "utf8"));
    const migration = await readFile("supabase/migrations/202610260002_private_documents.sql", "utf8");
    await db.exec(migration);
    await db.exec(await readFile("supabase/rollback/202610260002_empty_documents_only.sql", "utf8"));
    await db.exec(migration);
    const initial = coachingSample(), organization = initial.organizationId;
    await db.query("insert into public.organizations(id,name) values($1,'Synthetic document test')", [organization]);
    await db.query("insert into public.organization_memberships(organization_id,user_id,role) values($1,$2,'owner')", [organization, actor]);
    let readerActor = actor;
    const store: CoachingStore = {
      load: async (id) => db.transaction(async (tx) => {
        await tx.exec("set local role authenticated"); await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [readerActor]);
        const org = await tx.query<{ version: number }>("select version from public.organizations where id=$1", [id]);
        if (!org.rows.length) throw new PersistenceError(404, "Organization unavailable");
        const rows = await tx.query<{ bundle: unknown }>("select bundle from public.organization_snapshots where organization_id=$1 and version=$2", [id, org.rows[0].version]);
        return { version: org.rows[0].version, bundle: domainBundleSchema.parse(rows.rows[0].bundle) };
      }),
      save: async (id, user, version, bundle) => db.transaction(async (tx) => { await tx.exec("set local role service_role"); return (await tx.query<{ version: number }>("select public.save_coaching_bundle($1,$2,$3,$4::jsonb) as version", [id, user, version, JSON.stringify(bundle)])).rows[0].version; }),
    };
    await store.save(organization, actor, 0, initial);
    const objects = new Map<string, Uint8Array>(); let objectReads = 0;
    const files: DocumentStore = {
      register: async (user, record) => { await db.transaction(async (tx) => { await tx.exec("set local role service_role"); await tx.query("select public.register_coaching_document($1,$2::jsonb)", [user, JSON.stringify(record)]); }); },
      put: async (record, bytes) => { objects.set(record.object_key, bytes); },
      get: async (org, id, revision) => { objectReads++; return db.transaction(async (tx) => { await tx.exec("set local role service_role"); return (await tx.query<ObjectRecord>("select organization_id,id,revision,object_key,filename,byte_length,sha256 from public.private_document_objects where organization_id=$1 and id=$2 and revision=$3", [org, id, revision])).rows[0]; }); },
      download: async (record) => objects.get(record.object_key)!,
    };
    const session = initial.sessions.find((s) => s.content.kind === "possession")!, event = initial.events.find((e) => e.session?.id === session.id)!;
    const params = { organizationId: organization, sessionId: session.id, revision: "1" };
    const pdf = await PDFDocument.create(); pdf.addPage().drawText("Synthetic authorised PDF"); const bytes = new Uint8Array(await pdf.save());
    const response = await handleDocument(new Request("https://football.example/upload", { method: "POST", body: bytes, headers: { Origin: "https://football.example", "Content-Type": "application/pdf", "x-expected-version": "1", "x-document-filename": "session-plan.pdf", "x-booking-id": event.id, "x-booking-revision": "1" } }), params, "https://football.example", async () => ({ actor, store, documents: () => files }));
    assert.equal(response.status, 200); const ack = await response.json(); assert.equal(ack.version, 2);
    const reopened = await store.load(organization), source = reopened.bundle.sessions.find((s) => s.id === session.id && s.revision === 1)!;
    assert.deepEqual(source, session); const edited = reopened.bundle.sessions.find((s) => s.id === session.id && s.revision === 2)!;
    const doc = edited.documents.at(-1)!;
    const route = { ...params, revision: "2", documentId: doc.id, documentRevision: "1" };
    const download = await handleDocument(new Request("https://football.example/download"), route, "https://football.example", async () => ({ actor, store, documents: () => files }));
    assert.equal(download.status, 200); assert.deepEqual(new Uint8Array(await download.arrayBuffer()), bytes);
    readerActor = outsider;
    const denied = await handleDocument(new Request("https://football.example/download"), route, "https://football.example", async () => ({ actor: outsider, store, documents: () => files }));
    assert.equal(denied.status, 404); assert.equal(objectReads, 1);
    for (const role of ["anon", "authenticated"]) {
      await assert.rejects(db.transaction(async (tx) => { await tx.exec(`set local role ${role}`); await tx.query("select * from public.private_document_objects"); }), /permission denied/);
      await assert.rejects(db.transaction(async (tx) => { await tx.exec(`set local role ${role}`); await tx.query("select public.register_coaching_document($1,'{}')", [actor]); }), /permission denied/);
    }
    const record = (await db.query<ObjectRecord>("select organization_id,id,revision,object_key,filename,byte_length,sha256 from public.private_document_objects")).rows[0];
    await assert.rejects(files.register(outsider, { ...record, id: "forged" }), /Organization unavailable/);
    await assert.rejects(db.exec("update public.private_document_objects set filename='rewritten.pdf'"), /immutable/);
    await assert.rejects(db.exec(await readFile("supabase/rollback/202610260002_empty_documents_only.sql", "utf8")), /Rollback refused/);
    await db.exec("rollback");
    await db.query("update public.organization_memberships set active=false where user_id=$1", [actor]);
    await assert.rejects(files.register(actor, { ...record, id: "revoked" }), /Organization unavailable/);
    readerActor = actor; await assert.rejects(store.load(organization), /Organization unavailable/);
  } finally { await db.close(); }
});
