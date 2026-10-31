import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { domainBundleSchema } from "../../lib/domain/validation";
import { fixture as baseFixture } from "../domain/fixture";

/** Populate every protected domain table, including document metadata, before isolation checks. */
function fixture() {
  const data = baseFixture();
  data.documents.push({
    schemaVersion: "1.0",
    organizationId: data.organizationId,
    id: "doc-protocol",
    revision: 1,
    filename: "protocol.pdf",
    mimeType: "application/pdf",
    byteLength: 1000,
    storageKey: "club-demo/protocol.pdf",
    state: "ready",
    source: { kind: "upload" },
  });
  data.sessions[0].documents.push({ id: "doc-protocol", revision: 1 });
  return data;
}

const migrationPath =
  "supabase/migrations/202610260001_coaching_persistence.sql";
const rollbackPath = "supabase/rollback/202610260001_empty_database_only.sql";
const alice = "00000000-0000-4000-8000-000000000001";
const bob = "00000000-0000-4000-8000-000000000002";
const member = "00000000-0000-4000-8000-000000000003";
const bootstrap = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
  grant usage on schema auth, public to anon, authenticated, service_role;
  insert into auth.users values ('${alice}'),('${bob}'),('${member}');
`;

/** Apply the exact production migration, substituting only Supabase's existing Auth scaffolding. */
async function initialize(db: PGlite) {
  await db.exec(bootstrap);
  await db.exec(await readFile(migrationPath, "utf8"));
  await db.exec(await readFile("supabase/migrations/20261031115109_coaching_revision_conflict_pt409.sql", "utf8"));
}

/** Simulate PostgREST's verified role/claim context; this is an RLS test, not an Auth-server substitute. */
async function asRole<T>(
  db: PGlite,
  role: "anon" | "authenticated" | "service_role",
  user: string,
  operation: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`);
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
      user,
    ]);
    return operation(tx);
  });
}

/** Exercise the same privileged RPC used by the server repository. */
async function save(
  db: PGlite,
  actor: string,
  version: number,
  bundle = fixture(),
) {
  return asRole(db, "service_role", "", async (tx) => {
    const result = await tx.query<{ version: number }>(
      "select public.save_coaching_bundle($1,$2,$3,$4::jsonb) as version",
      [bundle.organizationId, actor, version, JSON.stringify(bundle)],
    );
    return result.rows[0].version;
  });
}

test("production SQL: persistence, RLS isolation and immutable revisions", async (t) => {
  const db = new PGlite();
  try {
    await initialize(db);
    await db.exec(`insert into public.organizations(id,name) values ('club-demo','Club A'),('club-b','Club B');
      insert into public.organization_memberships(organization_id,user_id,role) values
      ('club-demo','${alice}','owner'),('club-b','${bob}','owner'),('club-demo','${member}','member');`);

    await t.test(
      "atomic initial save and validated reload through a second authenticated reader",
      async () => {
        assert.equal(Number(await save(db, alice, 0)), 1);
        const saved = await asRole(db, "authenticated", alice, (tx) =>
          tx.query<{ bundle: unknown }>(
            "select bundle from public.organization_snapshots where organization_id='club-demo' and version=1",
          ),
        );
        assert.deepEqual(
          domainBundleSchema.parse(saved.rows[0].bundle),
          fixture(),
        );
        const colleague = await asRole(db, "authenticated", member, (tx) =>
          tx.query("select id from public.teams"),
        );
        assert.equal(colleague.rows.length, 1);
      },
    );

    await t.test(
      "two clubs and signed-out users cannot enumerate each other's rows, even with guessed IDs",
      async () => {
        const other = fixture();
        other.organizationId = "club-b";
        for (const key of [
          "teams",
          "coaches",
          "events",
          "sessions",
          "templates",
          "exercises",
          "scenes",
          "documents",
        ] as const)
          other[key].forEach((record) => {
            record.organizationId = "club-b";
          });
        await save(db, bob, 0, other);
        for (const table of [
          "organizations",
          "teams",
          "coaches",
          "calendar_events",
          "session_revisions",
          "template_revisions",
          "exercise_revisions",
          "scene_revisions",
          "document_revisions",
          "organization_snapshots",
        ]) {
          const column = table === "organizations" ? "id" : "organization_id";
          const visible = await asRole(db, "authenticated", alice, (tx) =>
            tx.query(
              `select * from public.${table} where ${column}='club-demo'`,
            ),
          );
          assert.ok(visible.rows.length > 0, `positive read control: ${table}`);
          const hidden = await asRole(db, "authenticated", bob, (tx) =>
            tx.query(
              `select * from public.${table} where ${column}='club-demo'`,
            ),
          );
          assert.equal(hidden.rows.length, 0, table);
          const anonymous = await asRole(db, "anon", "", (tx) =>
            tx.query(`select * from public.${table}`),
          );
          assert.equal(anonymous.rows.length, 0, table);
        }
        const own = await asRole(db, "authenticated", bob, (tx) =>
          tx.query("select id from public.organizations"),
        );
        assert.deepEqual(own.rows, [{ id: "club-b" }]);
      },
    );

    await t.test(
      "browser roles cannot write rows, self-enroll or call the privileged RPC with a forged actor",
      async () => {
        await assert.rejects(
          asRole(db, "authenticated", bob, (tx) =>
            tx.query(
              "select public.save_coaching_bundle('club-demo',$1,1,$2::jsonb)",
              [alice, JSON.stringify(fixture())],
            ),
          ),
          /permission denied/,
        );
        await assert.rejects(
          asRole(db, "authenticated", bob, (tx) =>
            tx.query(
              "insert into public.organization_memberships(organization_id,user_id,role,active) values ('club-demo',$1,'owner',true)",
              [bob],
            ),
          ),
          /permission denied/,
        );
        await assert.rejects(
          asRole(db, "authenticated", alice, (tx) =>
            tx.query(
              "update public.teams set payload=payload where organization_id='club-demo'",
            ),
          ),
          /permission denied/,
        );
        await assert.rejects(save(db, bob, 1), /Organization unavailable/);
      },
    );

    await t.test(
      "append a session/event revision without changing previously saved versions",
      async () => {
        const next = fixture();
        const session = structuredClone(next.sessions[0]);
        session.revision = 2;
        session.content.title = "Revised session";
        next.sessions.push(session);
        const event = structuredClone(next.events[0]);
        event.revision = 2;
        event.session = { id: session.id, revision: 2 };
        next.events.push(event);
        domainBundleSchema.parse(next);
        assert.equal(Number(await save(db, member, 1, next)), 2);
        const rows = await db.query<{ revision: number; payload: unknown }>(
          "select revision,payload from public.session_revisions where organization_id='club-demo' and id='session-a' order by revision",
        );
        assert.equal(rows.rows.length, 2);
        assert.deepEqual(rows.rows[0].payload, fixture().sessions[0]);
        await assert.rejects(
          db.query(
            "update public.session_revisions set payload=payload where organization_id='club-demo'",
          ),
          /immutable/,
        );
        await assert.rejects(
          db.query(
            "delete from public.organization_snapshots where organization_id='club-demo'",
          ),
          /immutable/,
        );
      },
    );

    await t.test(
      "stale writes and attempted history rewrites fail atomically",
      async () => {
        await assert.rejects(save(db, alice, 1), { code: "PT409", message: "Revision conflict" });
        const rewritten = fixture();
        rewritten.sessions[0].content.title = "Overwrite revision one";
        await assert.rejects(
          save(db, alice, 2, rewritten),
          /history cannot be removed or changed/,
        );
        const org = await db.query<{ version: number }>(
          "select version from public.organizations where id='club-demo'",
        );
        assert.equal(Number(org.rows[0].version), 2);
        const snapshots = await db.query(
          "select version from public.organization_snapshots where organization_id='club-demo'",
        );
        assert.equal(snapshots.rows.length, 2);
      },
    );

    await t.test(
      "invalid/cross-organization rows roll back the entire write transaction",
      async () => {
        const bad = fixture();
        bad.organizationId = "club-b"; // contained records still belong to A
        await assert.rejects(save(db, bob, 1, bad), /Invalid record identity/);
        const org = await db.query<{ version: number }>(
          "select version from public.organizations where id='club-b'",
        );
        assert.equal(Number(org.rows[0].version), 1);
      },
    );

    await t.test(
      "coach account links must resolve to membership in the same club",
      async () => {
        const latest = await db.query<{ bundle: unknown }>(
          "select bundle from public.organization_snapshots where organization_id='club-demo' and version=2",
        );
        const bundle = domainBundleSchema.parse(latest.rows[0].bundle);
        const identities = await db.query<{ id: string; user_id: string }>(
          "select id,user_id from public.organization_memberships",
        );
        bundle.coaches[0].membershipId = identities.rows.find(
          (row) => row.user_id === bob,
        )!.id;
        await assert.rejects(
          save(db, alice, 2, bundle),
          /Invalid coach membership reference/,
        );
        bundle.coaches[0].membershipId = "missing-membership";
        await assert.rejects(
          save(db, alice, 2, bundle),
          /Invalid coach membership reference/,
        );
        bundle.coaches[0].membershipId = identities.rows.find(
          (row) => row.user_id === alice,
        )!.id;
        assert.equal(Number(await save(db, alice, 2, bundle)), 3);
      },
    );

    await t.test(
      "revoked membership loses both read and write access immediately",
      async () => {
        await db.query(
          "update public.organization_memberships set active=false where user_id=$1",
          [member],
        );
        const hidden = await asRole(db, "authenticated", member, (tx) =>
          tx.query("select * from public.organization_snapshots"),
        );
        assert.equal(hidden.rows.length, 0);
        await assert.rejects(save(db, member, 3), /Organization unavailable/);
      },
    );

    await t.test(
      "rollback refuses to discard saved coaching records",
      async () => {
        await assert.rejects(
          db.exec(await readFile(rollbackPath, "utf8")),
          /Rollback refused/,
        );
        await db.exec("rollback");
        const count = await db.query<{ count: string }>(
          "select count(*) from public.organization_snapshots",
        );
        assert.equal(Number(count.rows[0].count), 4);
      },
    );
  } finally {
    await db.close();
  }
});

test("empty migration rollback and re-application succeed", async () => {
  const db = new PGlite();
  try {
    await initialize(db);
    await db.exec(await readFile(rollbackPath, "utf8"));
    await db.exec(await readFile(migrationPath, "utf8"));
    const tables = await db.query("select * from public.organizations");
    assert.equal(tables.rows.length, 0);
  } finally {
    await db.close();
  }
});

test("saved coaching data survives closing and reopening a filesystem-backed PostgreSQL database", async () => {
  const directory = await mkdtemp(join(tmpdir(), "football-persistence-"));
  try {
    const run = promisify(execFile);
    const worker = "tests/persistence/reopen-worker.ts";
    await run(process.execPath, ["--import", "tsx", worker, "save", directory]);
    const loaded = await run(process.execPath, [
      "--import",
      "tsx",
      worker,
      "load",
      directory,
    ]);
    assert.deepEqual(
      domainBundleSchema.parse(JSON.parse(loaded.stdout)),
      baseFixture(),
    );
  } finally {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith("football-persistence-"));
    await rm(directory, { recursive: true, force: true });
  }
});
