import assert from "node:assert/strict";
import { test } from "node:test";
import { calendarEventSchema } from "../../lib/domain/calendar";
import {
  domainBundleSchema,
  parseDomainJson,
  serializeDomain,
} from "../../lib/domain/validation";
import { testingFixture } from "./fixture";

test("confirmed testing programme round-trips ordinary activities, staff, diagrams and PDFs", () => {
  const data = parseDomainJson(serializeDomain(testingFixture()));
  const event = data.events[0];
  const session = data.sessions[0];
  assert.equal(event.kind, "testing");
  assert.deepEqual(event.session, { id: session.id, revision: 1 });
  assert.equal(session.content.kind, "testing");
  assert.deepEqual(
    session.content.activities.map((activity) => [
      activity.content.title,
      activity.durationMinutes,
    ]),
    [
      ["Acceleration assessment", 15],
      ["Change-of-direction assessment", 20],
    ],
  );
  assert.equal(session.content.activities[0].content.instructions.length, 2);
  assert.equal(session.content.activities[0].content.area?.length, 40);
  assert.equal(
    session.content.activities[0].content.equipment[0].name,
    "Timing gates",
  );
  assert.equal(
    session.content.activities[0].content.diagrams[0].scene.revision,
    1,
  );
  assert.equal(session.coaches[0].coachId, "coach-a");
  assert.equal(session.documents.length, 2);
  assert.equal(data.documents[1].source.kind, "generated-guide");
});

test("date-only draft testing placeholders round-trip without a prepared session", () => {
  const data = testingFixture();
  const placeholder = {
    ...data.events[0],
    kind: "testing" as const,
    status: "draft" as const,
    startsAt: null,
    endsAt: null,
    session: null,
  };
  data.events[0] = placeholder;
  const saved = parseDomainJson(serializeDomain(data));
  assert.equal(saved.events[0].session, null);
  assert.equal(saved.events[0].localDate, "2026-11-03");
  assert.equal(
    calendarEventSchema.safeParse({ ...placeholder, status: "cancelled" })
      .success,
    true,
  );
  data.events[0] = {
    ...placeholder,
    session: { id: "session-a", revision: 1 },
  };
  assert.equal(domainBundleSchema.safeParse(data).success, true);
});

test("confirmed testing requires a session while unrelated event kinds remain unlinked", () => {
  const event = testingFixture().events[0];
  const missing = calendarEventSchema.safeParse({ ...event, session: null });
  assert.equal(missing.success, false);
  if (!missing.success)
    assert.ok(
      missing.error.issues.some((issue) => issue.path.join(".") === "session"),
    );
  assert.equal(
    calendarEventSchema.safeParse({ ...event, kind: "meeting" }).success,
    false,
  );
  assert.equal(
    calendarEventSchema.safeParse({ ...event, kind: "meeting", session: null })
      .success,
    true,
  );
});

test("testing references reject missing IDs and missing exact revisions even on drafts", () => {
  for (const status of ["draft", "confirmed", "cancelled"] as const) {
    for (const session of [
      { id: "missing-session", revision: 1 },
      { id: "session-a", revision: 2 },
    ]) {
      const data = testingFixture();
      data.events[0] = { ...data.events[0], kind: "testing", status, session };
      const result = domainBundleSchema.safeParse(data);
      assert.equal(result.success, false);
      if (!result.success)
        assert.ok(
          result.error.issues.some(
            (issue) => issue.path.join(".") === "events.0.session",
          ),
        );
    }
  }
});

test("testing events cannot link a different session kind", () => {
  const data = testingFixture();
  data.events[0] = {
    ...data.events[0],
    kind: "testing",
    session: { id: "session-b", revision: 1 },
  };
  const result = domainBundleSchema.safeParse(data);
  assert.equal(result.success, false);
  if (!result.success)
    assert.ok(
      result.error.issues.some(
        (issue) =>
          issue.message ===
          "Testing events must reference a testing session revision",
      ),
    );
});

test("testing references retain team and organization consistency checks", () => {
  const wrongTeam = testingFixture();
  wrongTeam.teams.push({ ...wrongTeam.teams[0], id: "team-youth" });
  wrongTeam.events[0].teamId = "team-youth";
  const teamResult = domainBundleSchema.safeParse(wrongTeam);
  assert.equal(teamResult.success, false);
  if (!teamResult.success)
    assert.ok(
      teamResult.error.issues.some(
        (issue) => issue.path.join(".") === "events.0.teamId",
      ),
    );
  for (const collection of ["events", "sessions"] as const) {
    const data = testingFixture();
    data[collection][0].organizationId = "other-club";
    const result = domainBundleSchema.safeParse(data);
    assert.equal(result.success, false);
    if (!result.success)
      assert.ok(
        result.error.issues.some(
          (issue) => issue.path.join(".") === `${collection}.0.organizationId`,
        ),
      );
  }
});
