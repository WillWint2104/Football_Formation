import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { createClient } from "@supabase/supabase-js";
import { SupabaseCoachingStore } from "../../lib/server/repositories/coaching";
import { fixture } from "../domain/fixture";

const original = "supabase/migrations/202610260001_coaching_persistence.sql";
const recovery = "supabase/migrations/20261031115109_coaching_revision_conflict_pt409.sql";
const actor = "00000000-0000-4000-8000-000000000001";

test("additive recovery changes only the business SQLSTATE and preserves function security metadata", async () => {
  const originals = {
    [original]: "6bebc8ffff1fea620e1f2e78e081613cb1357983008614d4d6ad7fffd1cb2e6b",
    "supabase/migrations/202610260002_private_documents.sql": "afc8322871b3e5c4a5cb5d7f9b59776428e5d104d5f0a8db0dda359857417430",
    "supabase/migrations/202610280001_presentations.sql": "048c95bf3e910492478231b372c12486b272daa83ea952f8fac7dc312ee65ee5",
  };
  for (const [path, hash] of Object.entries(originals)) {
    // Normalize Git's Windows checkout line endings for portable, committed-content hashes.
    const sql = (await readFile(path, "utf8")).replaceAll("\r\n", "\n");
    assert.equal(createHash("sha256").update(sql).digest("hex"), hash, path);
  }
  const db = new PGlite();
  try {
    await db.exec(`create role anon nologin; create role authenticated nologin;
      create role service_role nologin bypassrls; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;`);
    await db.exec(await readFile(original, "utf8"));
    const definition = async () => (await db.query<{ source: string }>(
      "select pg_get_functiondef('public.save_coaching_bundle(text,uuid,bigint,jsonb)'::regprocedure) as source",
    )).rows[0].source;
    const security = async () => (await db.query(`select proowner,proacl,prosecdef,proconfig,oid
      from pg_proc where oid='public.save_coaching_bundle(text,uuid,bigint,jsonb)'::regprocedure`)).rows;
    const before = await definition(), permissions = await security();
    await db.exec(await readFile(recovery, "utf8"));
    assert.equal(await definition(), before.replace("errcode = '40001'", "errcode = 'PT409'"));
    assert.deepEqual(await security(), permissions);
  } finally { await db.close(); }
});

test("pinned Supabase JS POST RPCs send once for success, conflict, transient errors and transport rejection", async (t) => {
  assert.equal(JSON.parse(await readFile("node_modules/@supabase/supabase-js/package.json", "utf8")).version, "2.118.0");
  for (const outcome of ["success", "PT409", "40001", "503", "520", "network"] as const) {
    await t.test(outcome, async () => {
      let calls = 0;
      const client = createClient("http://127.0.0.1:54321", "public-test-key", {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { fetch: async (_input, init) => {
          calls++;
          assert.equal(init?.method, "POST");
          assert.equal(new Headers(init?.headers).has("x-retry-count"), false);
          if (outcome === "network") throw new TypeError("local transport rejection");
          if (outcome === "success") return Response.json(1);
          return Response.json({ code: outcome, message: "private provider details" }, {
            status: outcome === "PT409" ? 409 : outcome === "40001" ? 500 : Number(outcome),
          });
        } },
      });
      const store = new SupabaseCoachingStore(client, () => client);
      if (outcome === "success") assert.equal(await store.save("club-demo", actor, 0, fixture()), 1);
      else await assert.rejects(store.save("club-demo", actor, 0, fixture()), {
        status: outcome === "PT409" || outcome === "40001" ? 409 : 503,
      });
      assert.equal(calls, 1);
    });
  }
});

test("pinned client GET retry controls: 409 sends once, 503 retries by default and retry(false) disables it", async () => {
  for (const [status, retry, expected] of [[409, true, 1], [503, true, 4], [503, false, 1]] as const) {
    let calls = 0;
    const client = createClient("http://127.0.0.1:54321", "public-test-key", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: async (_input, init) => {
        calls++;
        assert.equal(init?.method, "GET");
        return Response.json({ code: "test", message: "local only" }, { status, headers: { "Retry-After": "0" } });
      } },
    });
    await client.from("organizations").select("version").retry(retry).abortSignal(AbortSignal.timeout(2000));
    assert.equal(calls, expected);
  }
});
