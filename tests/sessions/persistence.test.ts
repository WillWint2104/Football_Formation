import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { coachingSample } from "../../lib/coaching/sample";
import { newSession, reviseCoach, reviseExercise, reviseSession, reviseTemplate } from "../../lib/coaching/sessions";
import { eventSession, latestEvents, wallTimeCandidates } from "../../lib/calendar/schedule";
import { domainBundleSchema, type DomainBundle } from "../../lib/domain/validation";
import { scheduleSessionCopy, sessionCopyIds } from "../../lib/coaching/session-copy";

test("production SQL stores edited activities, independent templates/exercises, staff and exact booking revisions atomically", async () => {
  const db = new PGlite();
  const actor = "00000000-0000-4000-8000-000000000001";
  try {
    await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth,public to anon,authenticated,service_role;
      insert into auth.users values ('${actor}');`);
    await db.exec(await readFile("supabase/migrations/202610260001_coaching_persistence.sql", "utf8"));
    const initial = coachingSample();
    await db.query("insert into public.organizations(id,name) values ($1,'Synthetic coaching test')", [initial.organizationId]);
    await db.query("insert into public.organization_memberships(organization_id,user_id,role) values ($1,$2,'owner')", [initial.organizationId, actor]);
    const save = async (version: number, bundle: DomainBundle) => db.transaction(async (tx) => {
      await tx.exec("set local role service_role");
      return tx.query<{ version: number }>("select public.save_coaching_bundle($1,$2,$3,$4::jsonb) as version", [bundle.organizationId, actor, version, JSON.stringify(domainBundleSchema.parse(bundle))]);
    });
    assert.equal((await save(0, initial)).rows[0].version, 1);
    let next = reviseCoach(initial, { schemaVersion: "1.0", organizationId: initial.organizationId, id: "new-specialist", displayName: "Synthetic testing coach", teamIds: ["first-team"], membershipId: null });
    const template = structuredClone(next.templates[0]); template.content.objective = "New reusable objective";
    next = reviseTemplate(next, template);
    const exercise = structuredClone(next.exercises[0]); exercise.content.instructions = ["New reusable instruction"];
    next = reviseExercise(next, exercise);
    const copy = newSession(next, "first-team", initial.templates[0], () => "new-independent-plan");
    copy.coaches = [{ coachId: "new-specialist", role: "specialist" }];
    next = reviseSession(next, copy).bundle;
    const event = latestEvents(next).find((e) => e.title === "Rondos & Positional Play")!;
    const draft = structuredClone(eventSession(next, event)!);
    draft.content.activities.reverse(); draft.content.activities[0].durationMinutes = null;
    draft.content.objective = "Revised dated session";
    next = reviseSession(next, draft, event.id).bundle;
    assert.equal((await save(1, next)).rows[0].version, 2);
    const read = await db.transaction(async (tx) => {
      await tx.exec("set local role authenticated");
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [actor]);
      return tx.query<{ bundle: unknown }>("select bundle from public.organization_snapshots where organization_id=$1 and version=2", [initial.organizationId]);
    });
    const reopened = domainBundleSchema.parse(read.rows[0].bundle);
    assert.deepEqual(reopened, next);
    assert.equal(eventSession(reopened, latestEvents(reopened).find((e) => e.id === event.id)!)!.content.activities[0].durationMinutes, null);
    assert.deepEqual(reopened.sessions.find((s) => s.id === copy.id)!.sourceTemplate, { id: initial.templates[0].id, revision: 1 });
    assert.deepEqual(reopened.templates.find((t) => t.revision === 1), initial.templates[0]);
    assert.deepEqual(reopened.exercises.find((e) => e.revision === 1), initial.exercises[0]);
    await assert.rejects(save(1, next), (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "40001");
    assert.equal((await db.query<{ count: number }>("select count(*)::int as count from public.organization_snapshots")).rows[0].count, 2);
    const original = eventSession(next, latestEvents(next).find((e) => e.id === event.id)!)!;
    const request = { organizationId: next.organizationId, source: { id: original.id, revision: original.revision }, requestId: "44444444-4444-4444-8444-444444444444" };
    const slot = { title: original.content.title, kind: original.content.kind, teamId: original.teamId, coachId: "", date: "2026-11-11", start: "17:00", endDate: "2026-11-11", end: "18:00", timeZone: "Australia/Sydney",
      startInstant: wallTimeCandidates("2026-11-11", "17:00", "Australia/Sydney")[0], endInstant: wallTimeCandidates("2026-11-11", "18:00", "Australia/Sydney")[0], venue: "", areaLabel: "" };
    const scheduledCopy = scheduleSessionCopy(next, slot, request);
    // A real database error during event insertion must roll back the whole proposed graph.
    await db.exec(`create function public.reject_synthetic_copy() returns trigger language plpgsql as $$ begin if new.id like 'scheduled-event-%' then raise exception 'Synthetic write failure'; end if; return new; end $$;
      create trigger reject_copy before insert on public.calendar_events for each row execute function public.reject_synthetic_copy();`);
    await assert.rejects(save(2, scheduledCopy.bundle), /Synthetic write failure/);
    assert.equal((await db.query<{ count: number }>("select count(*)::int as count from public.session_revisions where id=$1", [sessionCopyIds(request).sessionId])).rows[0].count, 0);
    assert.equal((await db.query<{ version: number }>("select version from public.organizations where id=$1", [next.organizationId])).rows[0].version, 2);
    await db.exec("drop trigger reject_copy on public.calendar_events; drop function public.reject_synthetic_copy();");
    assert.equal((await save(2, scheduledCopy.bundle)).rows[0].version, 3);
    const savedCopy = await db.query<{ bundle: unknown }>("select bundle from public.organization_snapshots where organization_id=$1 and version=3", [next.organizationId]);
    const readback = domainBundleSchema.parse(savedCopy.rows[0].bundle);
    assert.deepEqual(readback, scheduledCopy.bundle); assert.deepEqual(readback.sessions.find((s) => s.id === original.id && s.revision === original.revision), original);
    assert.throws(() => scheduleSessionCopy(readback, slot, request), /already been used/);
    await assert.rejects(save(2, scheduledCopy.bundle));
    assert.equal((await db.query<{ count: number }>("select count(*)::int as count from public.calendar_events where id=$1", [scheduledCopy.event.id])).rows[0].count, 1);
  } finally { await db.close(); }
});
