import {
  instantiateTemplate,
  type SessionTemplate,
} from "../../lib/domain/session";
import type { DomainBundle } from "../../lib/domain/validation";

/** Synthetic fixture covering a reusable small-sided drill and two independent bookings. */
export function fixture(): DomainBundle {
  const record = { schemaVersion: "1.0" as const, organizationId: "club-demo" };
  const template: SessionTemplate = {
    ...record,
    id: "template-rondo",
    revision: 1,
    content: {
      title: "Rondos",
      kind: "possession",
      objective: "Create passing angles",
      focus: ["Support"],
      activities: [
        {
          id: "activity-rondo",
          role: "exercise",
          durationMinutes: null,
          sourceExercise: { id: "exercise-rondo", revision: 1 },
          content: {
            title: "5v2 rondo",
            area: { origin: { x: 20, y: 15 }, length: 12, width: 12 },
            playerCount: 7,
            equipment: [
              { name: "Balls", quantity: null },
              { name: "Cones", quantity: 4 },
            ],
            instructions: ["Keep possession"],
            coachingPoints: ["Scan before receiving"],
            progressions: [],
            regressions: [],
            variations: [],
            diagrams: [
              {
                scene: { id: "scene-rondo", revision: 1 },
                representativeSeconds: 0,
              },
            ],
          },
        },
      ],
    },
  };
  const sessionA = instantiateTemplate(template, {
    id: "session-a",
    teamId: "team-first",
    coaches: [{ coachId: "coach-a", role: "lead" }],
  });
  const sessionB = instantiateTemplate(template, {
    id: "session-b",
    teamId: "team-first",
    coaches: [],
  });
  return {
    format: "football-formation-domain",
    schemaVersion: "1.0",
    organizationId: "club-demo",
    teams: [
      { ...record, id: "team-first", name: "Demo First Team", ageGroup: null },
    ],
    coaches: [
      {
        ...record,
        id: "coach-a",
        displayName: "Demo Coach",
        teamIds: ["team-first"],
        membershipId: null,
      },
    ],
    templates: [template],
    sessions: [sessionA, sessionB],
    exercises: [
      {
        ...record,
        id: "exercise-rondo",
        revision: 1,
        content: structuredClone(template.content.activities[0].content),
      },
    ],
    events: ["a", "b"].map((suffix, i) => ({
      ...record,
      id: `event-${suffix}`,
      revision: 1,
      kind: "training" as const,
      teamId: "team-first",
      title: "Rondos",
      status: "confirmed" as const,
      localDate: "2026-11-03",
      startsAt: `2026-11-03T0${i}:00:00Z`,
      endsAt: `2026-11-03T0${i}:30:00Z`,
      timeZone: "Australia/Sydney",
      venue: "Demo pitch",
      areaLabel: null,
      session: { id: `session-${suffix}`, revision: 1 },
    })),
    scenes: [
      {
        ...record,
        id: "scene-rondo",
        revision: 1,
        units: "metres",
        field: { length: 105, width: 68 },
        entities: [
          {
            id: "player-a",
            kind: "player",
            position: { x: 22, y: 17 },
            headingDegrees: 90,
            team: "a",
            number: 6,
            positionLabel: "DM",
          },
          {
            id: "ball-a",
            kind: "ball",
            position: { x: 23, y: 17 },
            headingDegrees: 0,
          },
        ],
        stages: [
          {
            id: "stage-1",
            title: "Receive",
            durationSeconds: 3,
            tracks: [
              {
                id: "path-a",
                kind: "player",
                entityId: "player-a",
                movement: "run",
                keyframes: [
                  { seconds: 0, position: { x: 22, y: 17 } },
                  { seconds: 3, position: { x: 25, y: 17 } },
                ],
              },
              {
                id: "note-a",
                kind: "annotation",
                visibleFrom: 0,
                visibleUntil: 2,
                annotation: {
                  kind: "note",
                  position: { x: 25, y: 17 },
                  text: "Support",
                },
              },
            ],
          },
        ],
      },
    ],
    documents: [],
  };
}
