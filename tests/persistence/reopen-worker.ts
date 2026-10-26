import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { fixture } from "../domain/fixture";

/** Run the two lifetime phases in separate processes, as on an application restart. */
async function main() {
  const [phase, directory] = process.argv.slice(2);
  const db = new PGlite(directory.replaceAll("\\", "/"));
  try {
    if (phase === "save") {
      await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
        create schema auth; create table auth.users(id uuid primary key);
        create function auth.uid() returns uuid language sql stable as
          $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
        grant usage on schema auth, public to anon, authenticated, service_role;
        insert into auth.users values ('00000000-0000-4000-8000-000000000001');`);
      await db.exec(
        await readFile(
          "supabase/migrations/202610260001_coaching_persistence.sql",
          "utf8",
        ),
      );
      await db.exec(`insert into public.organizations(id,name) values ('club-demo','Club A');
        insert into public.organization_memberships(organization_id,user_id,role,active) values ('club-demo','00000000-0000-4000-8000-000000000001','owner',true);`);
      await db.query(
        "select public.save_coaching_bundle('club-demo','00000000-0000-4000-8000-000000000001',0,$1::jsonb)",
        [JSON.stringify(fixture())],
      );
    } else if (phase === "load") {
      await db.exec(
        `set role authenticated; set request.jwt.claim.sub='00000000-0000-4000-8000-000000000001'`,
      );
      const result = await db.query<{ bundle: unknown }>(
        "select bundle from public.organization_snapshots where version=1",
      );
      process.stdout.write(JSON.stringify(result.rows[0].bundle));
    } else throw new Error("Invalid restart test phase");
  } finally {
    await db.close();
  }
}
main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
