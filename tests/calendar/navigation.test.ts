import test from "node:test";
import assert from "node:assert/strict";
import { parseCalendarNavigation, calendarContextProblem, calendarHref, closeCalendarLibrary } from "../../lib/calendar/navigation";
import { libraryPreviewExample } from "../fixtures/library-preview";
import { filterCatalogue, sessionCatalogue } from "../../lib/coaching/catalogue";

test("calendar navigation preserves an exact scoped round trip without accepting a return URL", () => {
  const input = { date: "2026-11-11", view: "week", organization: "sample-club", team: "first-team", event: "sample-4", bookingRevision: "1", library: "1", session: "source", revision: "2", copy: "55555555-5555-4555-8555-555555555555", returnTo: "https://wrong.test" };
  const parsed = parseCalendarNavigation(input); assert.equal(parsed.success, true);
  if (!parsed.success) return;
  const href = calendarHref(parsed.data); assert.ok(href.startsWith("/calendar?")); assert.ok(!href.includes("wrong"));
  assert.deepEqual(parseCalendarNavigation(Object.fromEntries(new URL(href, "http://localhost").searchParams)).data, parsed.data);
  assert.deepEqual(closeCalendarLibrary(parsed.data), { date: input.date, view: "week", organization: input.organization, team: input.team, event: input.event, bookingRevision: 1 });
});

test("invalid or ambiguous context is rejected instead of coercing arrays or substituting revisions", () => {
  for (const query of [{ date: "2026-02-30" }, { view: "year" }, { team: ["a", "b"] }, { copy: "not-a-uuid" }, { library: "1", session: "source" }, { bookingRevision: "1" }, { organization: "x", library: "1", session: "source", revision: "1e1" }, { type: "invented" }, { library: "1", plan: "source" }])
    assert.equal(parseCalendarNavigation(query).success, false, JSON.stringify(query));
});

test("organization, team and stale booking links are checked against loaded records only", () => {
  const b = libraryPreviewExample(), event = b.events[0];
  assert.equal(calendarContextProblem(b, { organization: b.organizationId, team: event.teamId, event: event.id, bookingRevision: event.revision }), undefined);
  assert.match(calendarContextProblem(b, { organization: "another-club" })!, /different organisation/);
  assert.match(calendarContextProblem(b, { team: "missing" })!, /team is unavailable/);
  assert.match(calendarContextProblem(b, { event: event.id, team: "youth-team" })!, /booking is unavailable/);
  assert.match(calendarContextProblem(b, { event: event.id, bookingRevision: 999 })!, /has changed/);
  assert.match(calendarContextProblem(b, { plan: "missing-plan" })!, /No blank session was substituted/);
});

test("calendar and library share exact pinned catalogue entries and supported search metadata", () => {
  const b = libraryPreviewExample(), catalogue = sessionCatalogue(b);
  const rondo = catalogue.find((i) => i.session.content.title === "Rondos & Positional Play")!;
  b.sessions.push({ ...structuredClone(rondo.session), revision: 2 });
  assert.equal(sessionCatalogue(b).find((i) => i.key === rondo.key)!.session.revision, 1);
  assert.ok(filterCatalogue(catalogue, "5v2", "possession", "first-team").some((i) => i.key === rondo.key));
  assert.equal(filterCatalogue(catalogue, "5v2", "possession", "youth-team").length, 0);
  assert.ok(catalogue.every((i) => i.session.organizationId === b.organizationId));
});
