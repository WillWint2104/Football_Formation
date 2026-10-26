import { z } from "zod";
import {
  duplicateIds,
  idSchema,
  recordShape,
  revisionRefSchema,
  revisionSchema,
  textSchema,
} from "./common";
import { coachAssignmentSchema } from "./people";
import { areaSchema } from "./tactical-scene";

export const sessionKindSchema = z.enum([
  "conditioning",
  "possession",
  "goalkeeper",
  "technical",
  "tactical",
  "recovery",
  "testing",
  "combined",
  "other",
]);
export const diagramRefSchema = z.strictObject({
  scene: revisionRefSchema,
  representativeSeconds: z.number().nonnegative().finite(),
});
export const exerciseContentSchema = z.strictObject({
  title: textSchema,
  area: areaSchema.nullable(),
  playerCount: z.number().int().positive().nullable(),
  equipment: z.array(
    z.strictObject({
      name: textSchema,
      quantity: z.number().int().nonnegative().nullable(),
    }),
  ),
  instructions: z.array(textSchema),
  coachingPoints: z.array(textSchema),
  progressions: z.array(textSchema),
  regressions: z.array(textSchema),
  variations: z.array(textSchema),
  diagrams: z.array(diagramRefSchema),
});
export const exerciseSchema = z.strictObject({
  ...recordShape,
  revision: revisionSchema,
  content: exerciseContentSchema,
});
export const activitySchema = z.strictObject({
  id: idSchema,
  role: z.enum(["warm-up", "exercise", "cool-down", "briefing"]),
  durationMinutes: z.number().positive().finite().nullable(),
  // Embedded content is the independent snapshot; provenance is not a live link.
  sourceExercise: revisionRefSchema.nullable(),
  content: exerciseContentSchema,
});
export const sessionContentSchema = z
  .strictObject({
    title: textSchema,
    kind: sessionKindSchema,
    objective: textSchema.nullable(),
    focus: z.array(textSchema),
    activities: z.array(activitySchema),
  })
  .refine(
    (content) => !duplicateIds(content.activities),
    "Duplicate activity ID",
  );
export const templateSchema = z.strictObject({
  ...recordShape,
  revision: revisionSchema,
  content: sessionContentSchema,
});
export const sessionSchema = z.strictObject({
  ...recordShape,
  revision: revisionSchema,
  teamId: idSchema,
  coaches: z
    .array(coachAssignmentSchema)
    .refine(
      (values) =>
        new Set(values.map((value) => value.coachId)).size === values.length,
      "Duplicate coach assignment",
    ),
  sourceTemplate: revisionRefSchema.nullable(),
  content: sessionContentSchema,
  documents: z.array(revisionRefSchema),
});

export type Session = z.infer<typeof sessionSchema>;
export type SessionTemplate = z.infer<typeof templateSchema>;
export type SessionKind = z.infer<typeof sessionKindSchema>;
export type SessionActivity = z.infer<typeof activitySchema>;
export type Exercise = z.infer<typeof exerciseSchema>;
export type ExerciseContent = z.infer<typeof exerciseContentSchema>;
export type DiagramReference = z.infer<typeof diagramRefSchema>;

/** Create revision one from a validated template without sharing mutable nested content. */
export function instantiateTemplate(
  template: SessionTemplate,
  target: Pick<Session, "id" | "teamId" | "coaches">,
): Session {
  const source = templateSchema.parse(template);
  return sessionSchema.parse({
    schemaVersion: "1.0",
    organizationId: source.organizationId,
    id: target.id,
    teamId: target.teamId,
    coaches: target.coaches,
    revision: 1,
    sourceTemplate: { id: source.id, revision: source.revision },
    content: structuredClone(source.content),
    documents: [],
  });
}
