import assert from "node:assert/strict";
import test from "node:test";
import { libraryPreviewExample } from "../fixtures/library-preview";
import { scheduleSessionCopy, sessionCopyIds, sessionCopyOccurrence, type SessionCopyRequest } from "../../lib/coaching/session-copy";
import { eventSession, wallTimeCandidates, type ScheduleInput } from "../../lib/calendar/schedule";
import { reviseSession } from "../../lib/coaching/sessions";

const bundle = () => libraryPreviewExample();
function request(b = bundle()): SessionCopyRequest {
  return { organizationId: b.organizationId, source: { id: b.sessions.find((s) => s.content.title === "Rondos & Positional Play")!.id, revision: 1 }, requestId: "33333333-3333-4333-8333-333333333333" };
}
function slot(): ScheduleInput {
  return { title: "Ignored stale form title", teamId: "first-team", coachId: "", kind: "other", date: "2026-11-11", start: "17:00", endDate: "2026-11-11", end: "18:15", timeZone: "Australia/Sydney",
    startInstant: wallTimeCandidates("2026-11-11", "17:00", "Australia/Sydney")[0], endInstant: wallTimeCandidates("2026-11-11", "18:15", "Australia/Sydney")[0], venue: "", areaLabel: "" };
}

test("independent scheduling copies exact content, provenance, staff and pins without changing its source or any previous booking", () => {
  const b = bundle(), before = structuredClone(b), r = request(b), source = b.sessions.find((s) => s.id === r.source.id)!;
  const result = scheduleSessionCopy(b, slot(), r);
  assert.deepEqual(b, before);
  assert.notEqual(result.session.id, source.id); assert.equal(result.session.revision, 1);
  assert.deepEqual(result.event.session, { id: result.session.id, revision: 1 });
  assert.equal(result.event.title, source.content.title); assert.equal(result.event.kind, "training");
  assert.equal(result.event.status, "draft"); assert.equal(result.event.venue, null);
  assert.deepEqual(result.session.content, source.content); assert.deepEqual(result.session.coaches, source.coaches);
  assert.deepEqual(result.session.sourceTemplate, source.sourceTemplate);
  assert.deepEqual(result.bundle.sessions.filter((s) => s.id !== result.session.id), b.sessions);
  assert.deepEqual(result.bundle.events.filter((e) => e.id !== result.event.id), b.events);
  assert.deepEqual(result.bundle.scenes, b.scenes);
  assert.equal(result.session.content.activities[0].durationMinutes, null);
  assert.equal(result.session.content.activities[1].content.equipment[0].quantity, null);
  result.session.content.activities[0].content.instructions.push("Only in copy"); assert.notDeepEqual(result.session.content, source.content);
});

test("source and occurrence edits append independent histories; old diagram revisions and other dates stay pinned", () => {
  const b = bundle(), r = request(b), originalEvent = b.events.find((e) => e.session?.id === r.source.id)!;
  const copied = scheduleSessionCopy(b, slot(), r), retained = structuredClone(copied.session);
  const original = structuredClone(b.sessions.find((s) => s.id === r.source.id)!); original.content.objective = "Changed original";
  const changedSource = reviseSession(copied.bundle, original, originalEvent.id);
  assert.deepEqual(eventSession(changedSource.bundle, copied.event), retained);
  const changed = structuredClone(copied.session); changed.content.objective = "Changed occurrence";
  const revised = reviseSession(changedSource.bundle, changed, copied.event.id);
  assert.deepEqual(eventSession(revised.bundle, copied.event), retained);
  assert.equal(revised.event!.session!.revision, 2);
  assert.equal(eventSession(revised.bundle, changedSource.event!)!.content.objective, "Changed original");
  assert.deepEqual(revised.session.content.activities[1].content.diagrams, retained.content.activities[1].content.diagrams);
});

test("a stable request UUID cannot append a duplicate, including after readback or a colliding partial identity", () => {
  const b = bundle(), r = request(b), copied = scheduleSessionCopy(b, slot(), r), before = structuredClone(copied.bundle);
  assert.throws(() => scheduleSessionCopy(copied.bundle, slot(), r), /already been used/);
  assert.deepEqual(copied.bundle, before);
  const collision = structuredClone(b); collision.sessions.push(copied.session);
  assert.throws(() => scheduleSessionCopy(collision, slot(), r), /already been used/);
  assert.deepEqual(sessionCopyIds(r), sessionCopyIds(structuredClone(r)));
});

test("copy rejects wrong organisation/team, stale/missing source and invalid scheduling without partial mutation", () => {
  const b = bundle(), r = request(b), before = structuredClone(b);
  assert.throws(() => scheduleSessionCopy(b, slot(), { ...r, organizationId: "different-club" }), /another organisation/);
  assert.throws(() => scheduleSessionCopy(b, { ...slot(), teamId: "youth-team" }, r), /source team/);
  assert.throws(() => scheduleSessionCopy(b, slot(), { ...r, source: { id: r.source.id, revision: 999 } }), /exact previewed/);
  const newer = structuredClone(b); newer.sessions.push({ ...structuredClone(newer.sessions.find((s) => s.id === r.source.id)!), revision: 2 });
  assert.throws(() => scheduleSessionCopy(newer, slot(), r), /source session changed/);
  assert.throws(() => scheduleSessionCopy(b, { ...slot(), endInstant: slot().startInstant, end: slot().start }, r), /End must follow/);
  assert.deepEqual(b, before);
});

test("testing copies retain testing event semantics and never inherit source document associations", () => {
  const b = bundle(), source = b.sessions.find((s) => s.content.kind === "testing")!;
  b.documents.push({ schemaVersion: "1.0", organizationId: b.organizationId, id: "source-guide", revision: 1, filename: "source.pdf", mimeType: "application/pdf", byteLength: 20, storageKey: "synthetic/source.pdf", state: "ready",
    source: { kind: "generated-guide", session: { id: source.id, revision: 1 }, scenes: [], rendererVersion: "test" } });
  source.documents = [{ id: "source-guide", revision: 1 }];
  const r = { ...request(b), source: { id: source.id, revision: 1 } };
  const result = scheduleSessionCopy(b, slot(), r);
  assert.equal(result.event.kind, "testing"); assert.equal(result.session.content.kind, "testing");
  assert.deepEqual(result.session.documents, []);
  assert.deepEqual(result.bundle.documents, b.documents); assert.equal(source.documents.length, 1);
});

test("recovery validates the request's exact source rather than treating any matching copy identity as success", () => {
  const b = bundle(), r = request(b), result = scheduleSessionCopy(b, slot(), r);
  assert.equal(sessionCopyOccurrence(result.bundle, r)!.id, result.event.id);
  assert.equal(sessionCopyOccurrence(result.bundle, { ...r, source: { id: b.sessions[0].id, revision: 1 } }), undefined);
  assert.equal(sessionCopyOccurrence(result.bundle, { ...r, organizationId: "another-club" }), undefined);
  const changed = structuredClone(result.session); changed.content.objective = "Occurrence changed after initial save";
  const revised = reviseSession(result.bundle, changed, result.event.id);
  assert.equal(sessionCopyOccurrence(revised.bundle, r)!.revision, 2);
});
