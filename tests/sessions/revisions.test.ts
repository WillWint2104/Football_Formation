import assert from "node:assert/strict";
import test from "node:test";
import { domainBundleSchema } from "../../lib/domain/validation";
import { coachingSample } from "../../lib/coaching/sample";
import { activityTotals, latest, newActivity, newSession, reviseCoach, reviseExercise, reviseSession, reviseTemplate } from "../../lib/coaching/sessions";
import { eventSession, latestEvents, wallTimeCandidates, type ScheduleInput } from "../../lib/calendar/schedule";
import { scheduleSession } from "../../lib/coaching/scheduling";

test("editing one scheduled session advances its exact booking pin while retaining every prior revision and sibling", () => {
  const bundle = coachingSample(); const before = structuredClone(bundle);
  const event = latestEvents(bundle).find((e) => e.title === "Rondos & Positional Play")!;
  const source = eventSession(bundle, event)!;
  const draft = structuredClone(source); draft.content.objective = "Edited support objective";
  draft.content.activities.reverse(); draft.content.activities[0].durationMinutes = null;
  const result = reviseSession(bundle, draft, event.id);
  assert.deepEqual(bundle, before);
  assert.equal(result.session.revision, 2); assert.equal(result.event!.revision, 2);
  assert.deepEqual(result.event!.session, { id: source.id, revision: 2 });
  assert.equal(result.event!.startsAt, event.startsAt); assert.equal(result.event!.endsAt, event.endsAt);
  assert.deepEqual(result.bundle.sessions.find((s) => s.id === source.id && s.revision === 1), source);
  assert.deepEqual(result.bundle.sessions.filter((s) => s.id !== source.id), before.sessions.filter((s) => s.id !== source.id));
  assert.deepEqual(result.bundle.templates, before.templates);
  assert.throws(() => reviseSession(result.bundle, draft, event.id), /Booking changed/);
  assert.throws(() => reviseSession(bundle, draft), /specific booking/);
});

test("template application deep-copies independent sessions and preserves source versions through future edits", () => {
  const bundle = coachingSample(); const template = bundle.templates[0];
  let id = 0;
  const a = newSession(bundle, "first-team", template, () => `copy-${++id}`);
  const b = newSession(bundle, "first-team", template, () => `copy-${++id}`);
  const first = reviseSession(bundle, a).bundle;
  const second = reviseSession(first, b).bundle;
  a.content.activities[0].content.instructions.push("Independent instruction");
  const next = reviseSession(second, a).bundle;
  assert.equal(next.sessions.find((s) => s.id === a.id && s.revision === 2)!.content.activities[0].content.instructions.at(-1), "Independent instruction");
  assert.notEqual(next.sessions.find((s) => s.id === b.id)!.content.activities[0].content.instructions.at(-1), "Independent instruction");
  assert.deepEqual(next.templates[0], template);
  const edited = structuredClone(template); edited.content.title = "Updated reusable title";
  const revised = reviseTemplate(next, edited);
  assert.equal(latest(revised.templates)[0].revision, 2);
  assert.deepEqual(revised.sessions, next.sessions);
  assert.throws(() => reviseTemplate(revised, template), /newer template/);
  assert.throws(() => newSession(bundle, "first-team", { ...template, organizationId: "another-club" }));
});

test("exercise snapshots retain provenance, nullable quantities and durations when reusable source content changes", () => {
  const bundle = coachingSample(); const exercise = bundle.exercises[0];
  const a = newActivity(exercise, () => "activity-a"); const b = newActivity(exercise, () => "activity-b");
  a.content.instructions.push("Only activity A");
  assert.notDeepEqual(a.content.instructions, b.content.instructions);
  assert.deepEqual(a.sourceExercise, { id: exercise.id, revision: 1 });
  assert.equal(a.durationMinutes, null);
  a.content.equipment[0].quantity = null;
  const session = newSession(bundle, "first-team", undefined, () => "exercise-copy-session");
  session.content.activities = [a, b];
  const saved = reviseSession(bundle, session).bundle;
  const changed = structuredClone(exercise); changed.content.instructions.push("New source instruction");
  const next = reviseExercise(saved, changed);
  assert.deepEqual(next.sessions, saved.sessions);
  assert.equal(next.exercises.at(-1)!.revision, 2);
  assert.deepEqual(activityTotals([a, b]), { minutes: 0, unknown: 2 });
  assert.equal(next.sessions.at(-1)!.content.activities[0].content.equipment[0].quantity, null);
});

test("testing sessions share activities/staff and keep testing event pins valid when their content is edited", () => {
  const bundle = coachingSample(); const event = latestEvents(bundle).find((e) => e.kind === "testing")!;
  const draft = structuredClone(eventSession(bundle, event)!);
  draft.content.activities = [newActivity(bundle.exercises[0], () => "testing-instruction")];
  draft.coaches = [{ coachId: "coach-lopez", role: "specialist" }];
  const saved = reviseSession(bundle, draft, event.id);
  assert.equal(saved.event!.kind, "testing");
  assert.equal(domainBundleSchema.safeParse(saved.bundle).success, true);
  draft.content.kind = "conditioning";
  const changed = reviseSession(bundle, draft, event.id);
  assert.equal(changed.event!.kind, "training");
  assert.equal(bundle.events.find((e) => e.id === event.id)!.kind, "testing");
});

test("coach directory preserves historical team/account links while allowing new staff and additional teams", () => {
  const bundle = coachingSample(); const existing = structuredClone(bundle.coaches[0]);
  existing.displayName = "Updated directory coach";
  assert.equal(reviseCoach(bundle, existing).coaches[0].displayName, existing.displayName);
  assert.throws(() => reviseCoach(bundle, { ...existing, membershipId: "unapproved-account" }), /administrator/);
  assert.throws(() => reviseCoach(bundle, { ...existing, teamIds: [] }), /historical/);
  const next = reviseCoach(bundle, { ...existing, id: "new-directory-coach", membershipId: null, teamIds: ["first-team"] });
  assert.equal(next.coaches.at(-1)!.displayName, existing.displayName);
  assert.deepEqual(next.sessions, bundle.sessions);
});

/** Scheduling fixture with explicit UTC choices resolved using the same public UI contract. */
function slot(): ScheduleInput {
  return { title: "New scheduled copy", kind: "possession", teamId: "first-team", coachId: "coach-carter", date: "2026-11-11", start: "10:00", endDate: "2026-11-11", end: "11:00", timeZone: "Australia/Sydney",
    startInstant: wallTimeCandidates("2026-11-11", "10:00", "Australia/Sydney")[0], endInstant: wallTimeCandidates("2026-11-11", "11:00", "Australia/Sydney")[0], venue: "Main pitch", areaLabel: "Zone A" };
}

test("calendar scheduling links an existing independent plan or snapshots a template without modifying its source", () => {
  const bundle = coachingSample();
  const plan = newSession(bundle, "first-team", bundle.templates[0], () => "unscheduled-plan");
  const withPlan = reviseSession(bundle, plan).bundle;
  const scheduled = scheduleSession(withPlan, slot(), { kind: "session", id: plan.id });
  assert.deepEqual(scheduled.event.session, { id: plan.id, revision: 1 });
  assert.equal(scheduled.bundle.sessions.length, withPlan.sessions.length);
  assert.throws(() => scheduleSession(scheduled.bundle, slot(), { kind: "session", id: plan.id }), /unscheduled/);
  const copy = scheduleSession(bundle, slot(), { kind: "template", id: bundle.templates[0].id });
  assert.deepEqual(eventSession(copy.bundle, copy.event)!.sourceTemplate, { id: bundle.templates[0].id, revision: 1 });
  assert.deepEqual(bundle.templates, copy.bundle.templates);
  assert.equal(eventSession(copy.bundle, copy.event)!.content.title, "New scheduled copy");
});

test("blank editor lines are normalized only on save and unrelated pinned metadata is retained", () => {
  const bundle = coachingSample(); const plan = newSession(bundle, "first-team", bundle.templates[0], () => "cleaned-plan");
  plan.content.activities[0].content.instructions = ["  Setup the area  ", "", "   ", "Deliver the exercise"];
  plan.content.focus = ["Possession", " "]; plan.content.objective = "   ";
  const saved = reviseSession(bundle, plan).session;
  assert.deepEqual(saved.content.activities[0].content.instructions, ["Setup the area", "Deliver the exercise"]);
  assert.deepEqual(saved.content.focus, ["Possession"]); assert.equal(saved.content.objective, null);
  assert.equal(plan.content.activities[0].content.instructions.length, 4);
});
