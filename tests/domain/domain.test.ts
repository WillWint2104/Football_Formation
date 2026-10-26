import assert from "node:assert/strict";
import { test } from "node:test";
import { calendarEventSchema } from "../../lib/domain/calendar";
import { documentSchema } from "../../lib/domain/document";
import { sessionKindSchema } from "../../lib/domain/session";
import {
  tacticalSceneSchema,
  viewportSchema,
} from "../../lib/domain/tactical-scene";
import {
  domainBundleSchema,
  parseDomainJson,
  serializeDomain,
} from "../../lib/domain/validation";
import { fixture } from "./fixture";

test("JSON round trip retains stable IDs, revision pins and unknown quantities/timings", () => {
  const data = fixture();
  assert.deepEqual(parseDomainJson(serializeDomain(data)), data);
  assert.equal(data.sessions[0].content.activities[0].durationMinutes, null);
  assert.equal(
    data.sessions[0].content.activities[0].content.equipment[0].quantity,
    null,
  );
});

test("editing a dated session cannot mutate its template, exercise or sibling session", () => {
  const data = fixture();
  data.sessions[0].content.activities[0].content.instructions[0] =
    "Play one touch";
  for (const content of [data.templates[0].content, data.sessions[1].content])
    assert.equal(
      content.activities[0].content.instructions[0],
      "Keep possession",
    );
  assert.equal(data.exercises[0].content.instructions[0], "Keep possession");
  assert.equal(domainBundleSchema.safeParse(data).success, true);
});

test("multiple independent session types and bookings can coexist on one date", () => {
  for (const kind of [
    "conditioning",
    "possession",
    "goalkeeper",
    "technical",
    "tactical",
    "recovery",
    "combined",
    "other",
  ])
    assert.equal(sessionKindSchema.safeParse(kind).success, true);
  const data = fixture();
  data.sessions[1].content.kind = "goalkeeper";
  assert.equal(domainBundleSchema.safeParse(data).success, true);
  assert.notEqual(data.events[0].id, data.events[1].id);
  assert.notDeepEqual(data.events[0].session, data.events[1].session);
});

test("unsupported versions, unknown nested keys and malformed JSON fail closed", () => {
  const data = fixture();
  assert.throws(() => parseDomainJson("{"));
  assert.equal(
    domainBundleSchema.safeParse({ ...data, schemaVersion: "2.0" }).success,
    false,
  );
  assert.equal(
    domainBundleSchema.safeParse({ ...data, silentlyDropped: true }).success,
    false,
  );
  assert.equal(
    tacticalSceneSchema.safeParse({ ...data.scenes[0], schemaVersion: "2.0" })
      .success,
    false,
  );
  assert.equal(
    tacticalSceneSchema.safeParse({
      ...data.scenes[0],
      field: { ...data.scenes[0].field, pixelWidth: 500 },
    }).success,
    false,
  );
});

test("missing exact revisions and duplicate logical record revisions are rejected", () => {
  const data = fixture();
  data.sessions[0].sourceTemplate!.revision = 2;
  assert.equal(domainBundleSchema.safeParse(data).success, false);
  const duplicate = fixture();
  duplicate.sessions.push(structuredClone(duplicate.sessions[0]));
  assert.equal(domainBundleSchema.safeParse(duplicate).success, false);
  duplicate.sessions[2].revision = 2;
  assert.equal(domainBundleSchema.safeParse(duplicate).success, true);
});

test("cross-organization records, missing teams and unrelated coach assignments are rejected", () => {
  const cross = fixture();
  cross.coaches[0].organizationId = "other-club";
  assert.equal(domainBundleSchema.safeParse(cross).success, false);
  const missing = fixture();
  missing.sessions[0].teamId = "missing-team";
  assert.equal(domainBundleSchema.safeParse(missing).success, false);
  const unrelated = fixture();
  unrelated.coaches[0].teamIds = [];
  assert.equal(domainBundleSchema.safeParse(unrelated).success, false);
  const absent = fixture();
  absent.sessions[0].coaches[0].coachId = "missing-coach";
  assert.equal(domainBundleSchema.safeParse(absent).success, false);
});

test("booking and pinned session must belong to the same team", () => {
  const data = fixture();
  data.teams.push({ ...data.teams[0], id: "team-youth" });
  data.events[0].teamId = "team-youth";
  assert.equal(domainBundleSchema.safeParse(data).success, false);
});

test("draft unknown instants stay null; confirmed bookings require ordered UTC instants", () => {
  const event = {
    ...fixture().events[0],
    status: "draft",
    startsAt: null,
    endsAt: null,
  };
  assert.equal(calendarEventSchema.safeParse(event).success, true);
  assert.equal(
    calendarEventSchema.safeParse({ ...event, status: "confirmed" }).success,
    false,
  );
  const confirmed = fixture().events[0];
  assert.equal(
    calendarEventSchema.safeParse({ ...confirmed, endsAt: confirmed.startsAt })
      .success,
    false,
  );
  assert.equal(
    calendarEventSchema.safeParse({
      ...confirmed,
      startsAt: "2026-11-03T10:00:00",
    }).success,
    false,
  );
  assert.equal(
    calendarEventSchema.safeParse({ ...confirmed, timeZone: "Not/AZone" })
      .success,
    false,
  );
  assert.equal(
    calendarEventSchema.safeParse({ ...confirmed, startsAt: "invalid" })
      .success,
    false,
  );
});

test("DST overlap instants are distinct and nonexistent local wall-clock input is not accepted", () => {
  const event = fixture().events[0];
  // New York's repeated 01:30 has two distinct UTC instants, both valid bookings.
  for (const startsAt of ["2026-11-01T05:30:00Z", "2026-11-01T06:30:00Z"])
    assert.equal(
      calendarEventSchema.safeParse({
        ...event,
        localDate: "2026-11-01",
        timeZone: "America/New_York",
        startsAt,
        endsAt: "2026-11-01T07:30:00Z",
      }).success,
      true,
    );
  assert.equal(
    calendarEventSchema.safeParse({
      ...event,
      startsAt: "2026-03-08T02:30:00",
      timeZone: "America/New_York",
    }).success,
    false,
  );
});

test("a date-only draft survives saving and inconsistent local dates are rejected", () => {
  const event = fixture().events[0];
  assert.equal(
    calendarEventSchema.parse({
      ...event,
      status: "draft",
      startsAt: null,
      endsAt: null,
    }).localDate,
    "2026-11-03",
  );
  assert.equal(
    calendarEventSchema.safeParse({ ...event, localDate: "2026-11-04" })
      .success,
    false,
  );
  assert.equal(
    calendarEventSchema.safeParse({ ...event, localDate: "2026-02-30" })
      .success,
    false,
  );
});

test("camera settings and field resizing preserve metre coordinates, including out-of-bounds entities", () => {
  const scene = fixture().scenes[0];
  const before = structuredClone(scene.entities);
  viewportSchema.parse({
    center: { x: 24, y: 19 },
    zoom: 4,
    guides: {
      gridMetres: 1,
      editing: true,
      presenting: false,
      snapToGrid: true,
      snapToObjects: false,
    },
  });
  const resized = tacticalSceneSchema.parse({
    ...scene,
    field: { length: 12, width: 12 },
  });
  assert.deepEqual(resized.entities, before);
  assert.equal(
    tacticalSceneSchema.safeParse({ ...scene, units: "pixels" }).success,
    false,
  );
  assert.equal(
    tacticalSceneSchema.safeParse({ ...scene, field: { length: 0, width: 68 } })
      .success,
    false,
  );
});

test("movement/annotation timing must be ordered, finite and contained in its stage", () => {
  const scene = fixture().scenes[0];
  scene.stages[0].durationSeconds = 1;
  assert.equal(tacticalSceneSchema.safeParse(scene).success, false);
  const reverse = fixture().scenes[0];
  const track = reverse.stages[0].tracks[0];
  assert.ok(track.kind !== "annotation");
  track.keyframes.reverse();
  assert.equal(tacticalSceneSchema.safeParse(reverse).success, false);
  const nonfinite = fixture().scenes[0];
  nonfinite.entities[0].position.x = Infinity;
  assert.equal(tacticalSceneSchema.safeParse(nonfinite).success, false);
});

test("tracks cannot target missing/wrong entity kinds or create competing movements", () => {
  const scene = fixture().scenes[0];
  const track = scene.stages[0].tracks[0];
  assert.ok(track.kind !== "annotation");
  track.entityId = "ball-a";
  assert.equal(tacticalSceneSchema.safeParse(scene).success, false);
  track.entityId = "missing";
  assert.equal(tacticalSceneSchema.safeParse(scene).success, false);
  track.entityId = "player-a";
  scene.stages[0].tracks.push({ ...track, id: "competing" });
  assert.equal(tacticalSceneSchema.safeParse(scene).success, false);
});

test("diagram pins reject missing revisions and times beyond the saved timeline", () => {
  const data = fixture();
  data.sessions[0].content.activities[0].content.diagrams[0].scene.revision = 9;
  assert.equal(domainBundleSchema.safeParse(data).success, false);
  const late = fixture();
  late.sessions[0].content.activities[0].content.diagrams[0].representativeSeconds = 4;
  assert.equal(domainBundleSchema.safeParse(late).success, false);
});

test("PDF metadata uses private keys and pins the exact session/scene snapshot", () => {
  const data = fixture();
  const document = {
    schemaVersion: "1.0" as const,
    organizationId: data.organizationId,
    id: "doc-guide",
    revision: 1,
    filename: "guide.pdf",
    mimeType: "application/pdf" as const,
    byteLength: 1000,
    storageKey: "club-demo/guide.pdf",
    state: "ready" as const,
    source: {
      kind: "generated-guide" as const,
      session: { id: "session-a", revision: 1 },
      scenes: [{ id: "scene-rondo", revision: 1 }],
      rendererVersion: "future-1",
    },
  };
  data.documents.push(document);
  data.sessions[0].documents.push({ id: document.id, revision: 1 });
  assert.equal(domainBundleSchema.safeParse(data).success, true);
  document.source.scenes = [];
  assert.equal(domainBundleSchema.safeParse(data).success, false);
  for (const storageKey of [
    "https://example.com/doc.pdf",
    "../guide.pdf",
    "/guide.pdf",
    "club\\guide.pdf",
  ])
    assert.equal(
      documentSchema.safeParse({ ...document, storageKey }).success,
      false,
    );
});

test("JSON boundary rejects oversized payloads before parsing", () => {
  assert.throws(
    () => parseDomainJson(" ".repeat(10 * 1024 * 1024 + 1)),
    /exceeds 10 MiB/,
  );
});

test("static scenes support time zero and duplicate nested identities fail validation", () => {
  const data = fixture();
  data.scenes[0].stages = [];
  assert.equal(domainBundleSchema.safeParse(data).success, true);
  data.scenes[0].entities.push(structuredClone(data.scenes[0].entities[0]));
  assert.equal(domainBundleSchema.safeParse(data).success, false);
  const activities = fixture();
  activities.sessions[0].content.activities.push(
    structuredClone(activities.sessions[0].content.activities[0]),
  );
  assert.equal(domainBundleSchema.safeParse(activities).success, false);
});
