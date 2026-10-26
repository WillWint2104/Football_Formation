import assert from "node:assert/strict";
import test from "node:test";
import { calendarDates, eventSession, latestEvents, localParts, scheduleChange, schedulingConflicts, wallTimeCandidates, type ScheduleInput } from "../../lib/calendar/schedule";
import { sampleCalendar } from "../../lib/calendar/sample";
import { domainBundleSchema } from "../../lib/domain/validation";

/** Stable form payload with explicitly resolved instants, independent of the machine time zone. */
function input(overrides: Partial<ScheduleInput> = {}): ScheduleInput {
  const value = { title: "Independent conditioning", teamId: "first-team", kind: "conditioning" as const,
    coachId: "coach-carter", date: "2026-11-03", start: "10:30", endDate: "2026-11-03", end: "11:00",
    timeZone: "Australia/Sydney", startInstant: "", endInstant: "", venue: "Training Ground A", areaLabel: "Zone B", ...overrides };
  value.startInstant ||= wallTimeCandidates(value.date, value.start, value.timeZone)[0];
  value.endInstant ||= wallTimeCandidates(value.endDate, value.end, value.timeZone)[0];
  return value;
}

test("month, week and day remain Monday-first across year, leap-year and DST boundaries", () => {
  assert.equal(calendarDates("2026-11-03", "month")[0], "2026-10-26");
  assert.equal(calendarDates("2026-11-03", "month").at(-1), "2026-12-06");
  assert.deepEqual(calendarDates("2026-01-01", "week"), ["2025-12-29", "2025-12-30", "2025-12-31", "2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04"]);
  assert.ok(calendarDates("2028-02-01", "month").includes("2028-02-29"));
  assert.deepEqual(calendarDates("2026-10-04", "day"), ["2026-10-04"]);
});

test("nonexistent Sydney and New York local times are rejected; repeated hours retain both UTC candidates", () => {
  assert.deepEqual(wallTimeCandidates("2026-10-04", "02:30", "Australia/Sydney"), []);
  assert.deepEqual(wallTimeCandidates("2026-04-05", "02:30", "Australia/Sydney"), ["2026-04-04T15:30:00Z", "2026-04-04T16:30:00Z"]);
  assert.equal(wallTimeCandidates("2026-11-01", "01:30", "America/New_York").length, 2);
  assert.deepEqual(wallTimeCandidates("2026-03-08", "02:30", "America/New_York"), []);
  assert.equal(wallTimeCandidates("2026-11-03", "10:00", "Asia/Kathmandu")[0], "2026-11-03T04:15:00Z");
  assert.throws(() => wallTimeCandidates("2026-11-31", "10:00", "UTC"));
  assert.throws(() => wallTimeCandidates("2026-11-03", "25:00", "UTC"));
});

test("new sessions are independent, graph-valid drafts with staff and exact version pins", () => {
  const bundle = sampleCalendar(); const original = structuredClone(bundle);
  let id = 0;
  const result = scheduleChange(bundle, input(), undefined, () => `new-${++id}`);
  assert.deepEqual(bundle, original);
  assert.equal(result.bundle.sessions.length, bundle.sessions.length + 1);
  const session = eventSession(result.bundle, result.event)!;
  assert.equal(session.content.kind, "conditioning");
  assert.deepEqual(session.coaches, [{ coachId: "coach-carter", role: "lead" }]);
  assert.equal(result.event.status, "draft");
  assert.equal(domainBundleSchema.safeParse(result.bundle).success, true);
  assert.throws(() => scheduleChange(bundle, input({ teamId: "youth-team", coachId: "coach-lopez" })));
});

test("rescheduling appends booking history and preserves exact pinned session content and unrelated siblings", () => {
  const bundle = sampleCalendar();
  const event = latestEvents(bundle).find((e) => e.title === "Rondos & Positional Play")!;
  const result = scheduleChange(bundle, input({ date: "2026-11-04", endDate: "2026-11-04" }), event.id);
  assert.equal(result.event.revision, 2);
  assert.equal(result.event.localDate, "2026-11-04");
  assert.deepEqual(result.bundle.events.find((e) => e.id === event.id && e.revision === 1), event);
  assert.deepEqual(result.event.session, event.session);
  assert.deepEqual(result.bundle.sessions, bundle.sessions);
  assert.equal(latestEvents(result.bundle).filter((e) => e.id === event.id).length, 1);
  assert.equal(eventSession(result.bundle, result.event)?.content.activities.length, 4);
});

test("overlaps use instants, staff/team/resource links, exclude the booking itself and allow adjacent slots", () => {
  const bundle = sampleCalendar();
  const result = scheduleChange(bundle, input());
  assert.equal(schedulingConflicts(result.bundle, result.event).length, 1);
  const adjacent = scheduleChange(bundle, input({ start: "12:15", end: "13:00" }));
  assert.equal(schedulingConflicts(adjacent.bundle, adjacent.event).length, 0);
  const crossTeam = scheduleChange(bundle, input({ teamId: "youth-team", venue: "Other ground" }));
  assert.equal(schedulingConflicts(crossTeam.bundle, crossTeam.event).length, 1);
  const original = latestEvents(bundle)[0];
  assert.ok(!schedulingConflicts(bundle, original).some((e) => e.id === original.id));
});

test("overnight bookings keep the start local date and reject stale IDs, reversed instants and forged DST choices", () => {
  const bundle = sampleCalendar();
  const result = scheduleChange(bundle, input({ start: "23:30", endDate: "2026-11-04", end: "00:30" }));
  assert.equal(result.event.localDate, "2026-11-03");
  assert.equal(localParts(result.event.endsAt!, result.event.timeZone).date, "2026-11-04");
  assert.throws(() => scheduleChange(bundle, input({ end: "09:00" })));
  assert.throws(() => scheduleChange(bundle, input(), "missing-event"));
  assert.throws(() => scheduleChange(bundle, input({ startInstant: "2026-11-03T10:30:00Z" })));
});
