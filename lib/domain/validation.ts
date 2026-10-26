import { z } from "zod";
import { calendarEventSchema } from "./calendar";
import { idSchema, revisionRefSchema } from "./common";
import { documentSchema } from "./document";
import { coachSchema, teamSchema } from "./people";
import { exerciseSchema, sessionSchema, templateSchema } from "./session";
import { tacticalSceneSchema } from "./tactical-scene";

type Ref = z.infer<typeof revisionRefSchema>;
/** Key a pinned revision without colliding with another logical record. */
const refKey = (ref: Ref) => `${ref.id}@${ref.revision}`;

/** Build one lookup per collection so reference validation scales linearly. */
const indexRevisions = <T extends Ref>(records: T[]) =>
  new Map(records.map((record) => [refKey(record), record]));

/** A complete, single-organization interchange snapshot; partial patches are not imports. */
export const domainBundleSchema = z
  .strictObject({
    format: z.literal("football-formation-domain"),
    schemaVersion: z.literal("1.0"),
    organizationId: idSchema,
    teams: z.array(teamSchema),
    coaches: z.array(coachSchema),
    events: z.array(calendarEventSchema),
    sessions: z.array(sessionSchema),
    templates: z.array(templateSchema),
    exercises: z.array(exerciseSchema),
    scenes: z.array(tacticalSceneSchema),
    documents: z.array(documentSchema),
  })
  .superRefine((bundle, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: "custom", path, message });
    const collections = [
      "teams",
      "coaches",
      "events",
      "sessions",
      "templates",
      "exercises",
      "scenes",
      "documents",
    ] as const;
    for (const collection of collections) {
      const keys = new Set<string>();
      bundle[collection].forEach((record, index) => {
        const key = "revision" in record ? refKey(record) : record.id;
        if (keys.has(key))
          issue(
            [collection, index, "id"],
            "Duplicate record identity/revision",
          );
        keys.add(key);
        if (record.organizationId !== bundle.organizationId)
          issue(
            [collection, index, "organizationId"],
            "Cross-organization record",
          );
      });
    }
    const teams = new Set(bundle.teams.map((team) => team.id));
    const coaches = new Map(bundle.coaches.map((coach) => [coach.id, coach]));
    const sessions = indexRevisions(bundle.sessions);
    const templates = indexRevisions(bundle.templates);
    const exercises = indexRevisions(bundle.exercises);
    const scenes = indexRevisions(bundle.scenes);
    const documents = indexRevisions(bundle.documents);
    const teamExists = (id: string, path: (string | number)[]) => {
      if (!teams.has(id)) issue(path, "Missing team");
    };
    const resolve = <T extends Ref>(
      records: ReadonlyMap<string, T>,
      ref: Ref,
      path: (string | number)[],
    ): T | undefined => {
      const record = records.get(refKey(ref));
      if (!record) issue(path, "Missing exact revision reference");
      return record;
    };
    bundle.coaches.forEach((coach, i) =>
      coach.teamIds.forEach((id, j) =>
        teamExists(id, ["coaches", i, "teamIds", j]),
      ),
    );
    const checkContent = (
      content: z.infer<typeof templateSchema>["content"],
      path: (string | number)[],
    ) => {
      content.activities.forEach((activity, ai) => {
        const ap = [...path, "activities", ai];
        if (activity.sourceExercise)
          resolve(exercises, activity.sourceExercise, [
            ...ap,
            "sourceExercise",
          ]);
        checkDiagrams(activity.content.diagrams, [
          ...ap,
          "content",
          "diagrams",
        ]);
      });
    };
    const checkDiagrams = (
      diagrams: z.infer<typeof exerciseSchema>["content"]["diagrams"],
      path: (string | number)[],
    ) => {
      diagrams.forEach((diagram, i) => {
        const scene = resolve(scenes, diagram.scene, [...path, i, "scene"]);
        if (
          scene &&
          diagram.representativeSeconds >
            scene.stages.reduce((sum, stage) => sum + stage.durationSeconds, 0)
        )
          issue(
            [...path, i, "representativeSeconds"],
            "Representative time exceeds scene duration",
          );
      });
    };
    bundle.exercises.forEach((exercise, i) =>
      checkDiagrams(exercise.content.diagrams, [
        "exercises",
        i,
        "content",
        "diagrams",
      ]),
    );
    bundle.templates.forEach((template, i) =>
      checkContent(template.content, ["templates", i, "content"]),
    );
    bundle.sessions.forEach((session, i) => {
      teamExists(session.teamId, ["sessions", i, "teamId"]);
      session.coaches.forEach((assignment, j) => {
        const coach = coaches.get(assignment.coachId);
        if (!coach?.teamIds.includes(session.teamId))
          issue(
            ["sessions", i, "coaches", j],
            "Coach must belong to the session team",
          );
      });
      if (session.sourceTemplate)
        resolve(templates, session.sourceTemplate, [
          "sessions",
          i,
          "sourceTemplate",
        ]);
      session.documents.forEach((ref, j) =>
        resolve(documents, ref, ["sessions", i, "documents", j]),
      );
      checkContent(session.content, ["sessions", i, "content"]);
    });
    bundle.events.forEach((event, i) => {
      teamExists(event.teamId, ["events", i, "teamId"]);
      if (
        (event.kind === "training" || event.kind === "testing") &&
        event.session
      ) {
        const session = resolve(sessions, event.session, [
          "events",
          i,
          "session",
        ]);
        if (session && session.teamId !== event.teamId)
          issue(
            ["events", i, "teamId"],
            "Booking and session must belong to the same team",
          );
        if (
          session &&
          event.kind === "testing" &&
          session.content.kind !== "testing"
        )
          issue(
            ["events", i, "session"],
            "Testing events must reference a testing session revision",
          );
      }
    });
    bundle.documents.forEach((document, i) => {
      if (document.source.kind === "generated-guide") {
        const session = resolve(sessions, document.source.session, [
          "documents",
          i,
          "source",
          "session",
        ]);
        document.source.scenes.forEach((ref, j) =>
          resolve(scenes, ref, ["documents", i, "source", "scenes", j]),
        );
        if (session) {
          const expected = new Set(
            session.content.activities.flatMap((activity) =>
              activity.content.diagrams.map((diagram) => refKey(diagram.scene)),
            ),
          );
          const actual = new Set(document.source.scenes.map(refKey));
          if (
            expected.size !== actual.size ||
            [...expected].some((key) => !actual.has(key))
          )
            issue(
              ["documents", i, "source", "scenes"],
              "Guide must capture exactly the session's scene revisions",
            );
        }
      }
    });
  });

export type DomainBundle = z.infer<typeof domainBundleSchema>;
export const MAX_DOMAIN_JSON_BYTES = 10 * 1024 * 1024;

/** Validate an untrusted JSON snapshot before any future persistence/import operation. */
export function parseDomainJson(json: string): DomainBundle {
  if (
    json.length > MAX_DOMAIN_JSON_BYTES ||
    new TextEncoder().encode(json).byteLength > MAX_DOMAIN_JSON_BYTES
  )
    throw new Error("Domain JSON exceeds 10 MiB");
  return domainBundleSchema.parse(JSON.parse(json) as unknown);
}

/** Validate before export as well, retaining nulls, identifiers and explicit revision pins. */
export function serializeDomain(bundle: DomainBundle): string {
  const json = JSON.stringify(domainBundleSchema.parse(bundle), null, 2);
  if (new TextEncoder().encode(json).byteLength > MAX_DOMAIN_JSON_BYTES)
    throw new Error("Domain JSON exceeds 10 MiB");
  return json;
}
