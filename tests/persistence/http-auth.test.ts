import assert from "node:assert/strict";
import { test } from "node:test";
import { verifiedUser } from "../../lib/server/auth";
import { requestSignInLink } from "../../lib/server/auth-flow";
import { backendConfigSchema } from "../../lib/server/config";
import { PersistenceError } from "../../lib/server/errors";
import { handlePersistence } from "../../lib/server/persistence-http";
import {
  databaseError,
  type CoachingStore,
} from "../../lib/server/repositories/coaching";
import { fixture } from "../domain/fixture";

const origin = "https://football.example";
const alice = "00000000-0000-4000-8000-000000000001";

/** Construct the request boundary while keeping real SQL/RLS verification in database.test.ts. */
function harness() {
  const calls: { org: string; actor: string; expected: number }[] = [];
  const store: CoachingStore = {
    load: async () => ({ version: 1, bundle: fixture() }),
    save: async (org, actor, expected) => {
      calls.push({ org, actor, expected });
      return expected + 1;
    },
  };
  const authenticate = async () => ({ actor: alice, store });
  const post = (data: unknown, headers: Record<string, string> = {}) =>
    new Request(`${origin}/api/organizations/club-demo/snapshot`, {
      method: "POST",
      headers: { origin, "content-type": "application/json", ...headers },
      body: JSON.stringify(data),
    });
  return { calls, store, authenticate, post };
}

test("Auth identity is remotely verified and absent/invalid users are rejected", async () => {
  assert.equal(
    await verifiedUser({
      getUser: async () => ({ data: { user: { id: alice } }, error: null }),
    }),
    alice,
  );
  for (const response of [
    { data: { user: null }, error: null },
    { data: { user: { id: alice } }, error: new Error("expired") },
    { data: { user: { id: "forged" } }, error: null },
  ])
    await assert.rejects(verifiedUser({ getUser: async () => response }), {
      status: 401,
    });
});

test("invite-only sign-in cannot auto-create accounts or take a user-supplied callback URL", async () => {
  let input: unknown;
  const auth = {
    signInWithOtp: async (value: unknown) => {
      input = value;
      return { error: null };
    },
  };
  assert.equal(
    await requestSignInLink(auth, "coach@example.com", origin),
    "check-email",
  );
  assert.deepEqual(input, {
    email: "coach@example.com",
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });
  assert.equal(
    await requestSignInLink(auth, "invalid", origin),
    "invalid-email",
  );
  assert.equal(
    await requestSignInLink(
      {
        signInWithOtp: async () => ({
          error: new Error("Account does not exist"),
        }),
      },
      "missing@example.com",
      origin,
    ),
    "check-email",
  );
  assert.equal(
    await requestSignInLink(
      {
        signInWithOtp: async () => {
          throw new Error("network");
        },
      },
      "coach@example.com",
      origin,
    ),
    "check-email",
  );
});

test("backend configuration rejects insecure remote endpoints and non-origin redirect values", () => {
  const config = {
    url: "https://example.supabase.co",
    publishableKey: "sb_publishable_example",
    serviceRoleKey: "sb_secret_example",
    origin,
  };
  assert.equal(backendConfigSchema.safeParse(config).success, true);
  assert.equal(
    backendConfigSchema.safeParse({
      ...config,
      origin: "https://football.example/path",
    }).success,
    false,
  );
  assert.equal(
    backendConfigSchema.safeParse({ ...config, url: "http://remote.example" })
      .success,
    false,
  );
  assert.equal(
    backendConfigSchema.safeParse({
      ...config,
      publishableKey: config.serviceRoleKey,
    }).success,
    false,
  );
});

test("signed-out HTTP requests return 401 without touching storage", async () => {
  const { post, calls } = harness();
  const response = await handlePersistence(
    post({ expectedVersion: 0, bundle: fixture() }),
    "club-demo",
    origin,
    async () => {
      throw new PersistenceError(401, "Sign in required");
    },
  );
  assert.equal(response.status, 401);
  assert.equal(calls.length, 0);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

test("a valid save takes actor identity exclusively from the authenticated server context", async () => {
  const { post, authenticate, calls } = harness();
  const response = await handlePersistence(
    post({ expectedVersion: 1, bundle: fixture() }),
    "club-demo",
    origin,
    authenticate,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { version: 2 });
  assert.deepEqual(calls, [{ org: "club-demo", actor: alice, expected: 1 }]);
  const spoof = await handlePersistence(
    post({ actor: "someone-else", expectedVersion: 1, bundle: fixture() }),
    "club-demo",
    origin,
    authenticate,
  );
  assert.equal(spoof.status, 400);
  assert.equal(calls.length, 1);
});

test("cross-origin and missing-Origin writes are denied before authentication", async () => {
  const { post } = harness();
  for (const badOrigin of ["https://attacker.example", "null", ""]) {
    const response = await handlePersistence(
      post({ expectedVersion: 0, bundle: fixture() }, { origin: badOrigin }),
      "club-demo",
      origin,
      async () => {
        throw new Error("Authentication must not run");
      },
    );
    assert.equal(response.status, 403);
  }
});

test("cross-organization bundles and broken domain references never reach the writer", async () => {
  const { post, calls, authenticate } = harness();
  const wrongOrg = await handlePersistence(
    post({ expectedVersion: 0, bundle: fixture() }),
    "club-other",
    origin,
    authenticate,
  );
  assert.equal(wrongOrg.status, 400);
  const broken = fixture();
  broken.sessions[0].teamId = "missing-team";
  const invalid = await handlePersistence(
    post({ expectedVersion: 0, bundle: broken }),
    "club-demo",
    origin,
    authenticate,
  );
  assert.equal(invalid.status, 400);
  assert.equal(calls.length, 0);
});

test("HTTP size limits count streamed bytes even when Content-Length is absent or false", async () => {
  const { authenticate } = harness();
  for (const advertised of [undefined, "1"]) {
    const request = new Request(`${origin}/snapshot`, {
      method: "POST",
      headers: {
        origin,
        "content-type": "application/json",
        ...(advertised ? { "content-length": advertised } : {}),
      },
      body: " ".repeat(10 * 1024 * 1024 + 1),
    });
    const response = await handlePersistence(
      request,
      "club-demo",
      origin,
      authenticate,
    );
    assert.equal(response.status, 413);
  }
});

test("invalid content types and malformed JSON are rejected without storing anything", async () => {
  const { post, calls, authenticate } = harness();
  const unsupported = await handlePersistence(
    post({}, { "content-type": "text/plain" }),
    "club-demo",
    origin,
    authenticate,
  );
  assert.equal(unsupported.status, 415);
  const malformed = new Request(`${origin}/snapshot`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: "{",
  });
  assert.equal(
    (await handlePersistence(malformed, "club-demo", origin, authenticate))
      .status,
    400,
  );
  assert.equal(calls.length, 0);
});

test("reads revalidate persisted records and never cache private data", async () => {
  const { authenticate, store } = harness();
  const request = new Request(`${origin}/snapshot`);
  const response = await handlePersistence(
    request,
    "club-demo",
    origin,
    authenticate,
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), { version: 1, bundle: fixture() });
  store.load = async () => ({
    version: 1,
    bundle: { ...fixture(), organizationId: "bad-club" },
  });
  assert.equal(
    (await handlePersistence(request, "club-demo", origin, authenticate))
      .status,
    503,
  );
});

test("conflicts are 409 and raw provider/SQL secrets never appear in responses", async () => {
  const { post, authenticate, store } = harness();
  store.save = async () => {
    throw databaseError({ code: "40001" });
  };
  assert.equal(
    (
      await handlePersistence(
        post({ expectedVersion: 0, bundle: fixture() }),
        "club-demo",
        origin,
        authenticate,
      )
    ).status,
    409,
  );
  store.save = async () => {
    throw new Error("service-key-super-secret: SQL internal row content");
  };
  const response = await handlePersistence(
    post({ expectedVersion: 0, bundle: fixture() }),
    "club-demo",
    origin,
    authenticate,
  );
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /secret|SQL|row content/);
  assert.equal(databaseError({ code: "42501" }).status, 404);
});
