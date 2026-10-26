import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { SupabaseCoachingStore } from "../../lib/server/repositories/coaching";
import { verifiedUser } from "../../lib/server/auth";
import { fixture } from "../domain/fixture";

const actor = "00000000-0000-4000-8000-000000000001";

test("a compact request that exceeds the serialized bundle limit returns 413 before privileged access", async () => {
  const bundle = fixture();
  bundle.sessions[0].content.focus = Array.from({ length: 760_000 }, () => "x");
  assert.ok(
    Buffer.byteLength(JSON.stringify(bundle), "utf8") < 10 * 1024 * 1024,
  );
  let writerAcquired = false;
  const reader = createClient("http://127.0.0.1:54321", "public-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const store = new SupabaseCoachingStore(reader, () => {
    writerAcquired = true;
    throw new Error("Writer must not be acquired");
  });
  await assert.rejects(store.save("club-demo", actor, 0, bundle), {
    status: 413,
  });
  assert.equal(writerAcquired, false);
});

test("real Supabase SDK separates user-scoped reads from server-only RPC writes", async () => {
  const calls: {
    path: string;
    key: string | null;
    authorization: string | null;
    body: unknown;
  }[] = [];
  const client = (key: string, authorization: string) =>
    createClient("http://127.0.0.1:54321", key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: { Authorization: authorization },
        fetch: async (input, init) => {
          const url = new URL(String(input));
          const headers = new Headers(init?.headers);
          calls.push({
            path: url.pathname + url.search,
            key: headers.get("apikey"),
            authorization: headers.get("authorization"),
            body: init?.body ? JSON.parse(String(init.body)) : null,
          });
          if (url.pathname.endsWith("/organizations"))
            return Response.json({ version: 1 });
          if (url.pathname.endsWith("/organization_snapshots"))
            return Response.json({ version: 1, bundle: fixture() });
          if (url.pathname.endsWith("/save_coaching_bundle"))
            return Response.json(2);
          throw new Error("Unexpected SDK endpoint");
        },
      },
    });
  const reader = client("public-test-key", "Bearer user-test-token");
  const writer = client("private-test-key", "Bearer private-test-key");
  const store = new SupabaseCoachingStore(reader, () => writer);
  const saved = await store.load("club-demo");
  assert.deepEqual(saved, { version: 1, bundle: fixture() });
  assert.equal(await store.save("club-demo", actor, 1, fixture()), 2);
  assert.ok(calls[0].path.includes("id=eq.club-demo"));
  assert.ok(calls[1].path.includes("organization_id=eq.club-demo"));
  assert.ok(calls[1].path.includes("version=eq.1"));
  for (const call of calls.slice(0, 2)) {
    assert.equal(call.key, "public-test-key");
    assert.equal(call.authorization, "Bearer user-test-token");
  }
  assert.equal(calls[2].path, "/rest/v1/rpc/save_coaching_bundle");
  assert.equal(calls[2].key, "private-test-key");
  assert.deepEqual(calls[2].body, {
    p_organization_id: "club-demo",
    p_actor: actor,
    p_expected_version: 1,
    p_bundle: fixture(),
  });
});

test("Auth verification uses the provider's user endpoint rather than trusting local session data", async () => {
  let path = "";
  const client = createClient("http://127.0.0.1:54321", "public-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input) => {
        path = new URL(String(input)).pathname;
        return Response.json({
          id: actor,
          aud: "authenticated",
          role: "authenticated",
          email: "coach@example.com",
          app_metadata: {},
          user_metadata: {},
          created_at: "2026-01-01T00:00:00Z",
        });
      },
    },
  });
  // Explicit-token getUser exercises the actual SDK transport without fabricating a persisted cookie.
  assert.equal(
    await verifiedUser({
      getUser: () => client.auth.getUser("test-provider-token"),
    }),
    actor,
  );
  assert.equal(path, "/auth/v1/user");
});
