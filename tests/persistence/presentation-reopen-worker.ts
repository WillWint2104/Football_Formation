import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { presentationFixture } from "../presentations/fixture";
import { blankPresentation, createBlock, validatePresentation } from "../../lib/presentations/contracts";
import { overviewView } from "../../lib/presentations/camera";
import { domainBundleSchema } from "../../lib/domain/validation";
const actor = "00000000-0000-4000-8000-000000000001";
async function main() {
  const [phase, directory] = process.argv.slice(2), db = new PGlite(directory.replaceAll("\\", "/"));
  try {
    if (phase === "save") {
      await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
        create schema auth; create table auth.users(id uuid primary key);
        create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
        grant usage on schema auth,public to anon,authenticated,service_role; insert into auth.users values ('${actor}');`);
      for (const path of ["supabase/migrations/202610260001_coaching_persistence.sql", "supabase/migrations/202610280001_presentations.sql"]) await db.exec(await readFile(path, "utf8"));
      const bundle = presentationFixture(), org = bundle.organizationId, scene = bundle.scenes[1];
      await db.query("insert into public.organizations(id,name) values ($1,'Restart review')", [org]);
      await db.query("insert into public.organization_memberships(organization_id,user_id,role) values ($1,$2,'owner')", [org, actor]);
      await db.query("select public.save_coaching_bundle($1,$2,0,$3::jsonb)", [org, actor, JSON.stringify(bundle)]);
      const p = blankPresentation(org); p.id = "restart-presentation";
      p.blocks.push(createBlock("animation", "Passing restart proof", { kind: "scene", ref: { id: scene.id, revision: scene.revision }, seconds: 0 }));
      p.blocks[0].notes = "Independent saved coaching note";
      p.blocks[0].views.push({ ...overviewView(scene), id: "restart-camera", title: "Authored stage view", stageId: scene.stages[1].id, transitionSeconds: .7, zoom: 1.25, rotation: 270 });
      validatePresentation(p, bundle);
      await db.query("select public.save_presentation($1,$2,0,$3::jsonb)", [org, actor, JSON.stringify(p)]);
      process.stdout.write(JSON.stringify({ presentation: p, bundle }));
    } else if (phase === "load") {
      await db.exec(`set role authenticated; set request.jwt.claim.sub='${actor}'`);
      const saved = await db.query<{ bundle: unknown }>("select bundle from public.organization_snapshots where version=1");
      const bundle = domainBundleSchema.parse(saved.rows[0].bundle);
      const records = await db.query<{ payload: unknown }>("select payload from public.presentations_current where id='restart-presentation'");
      process.stdout.write(JSON.stringify({ presentation: validatePresentation(records.rows[0].payload, bundle), bundle }));
    } else throw new Error("Invalid restart phase");
  } finally { await db.close(); }
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
