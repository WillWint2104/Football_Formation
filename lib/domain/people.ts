import { z } from "zod";
import { idSchema, recordShape, textSchema } from "./common";

export const teamSchema = z.strictObject({
  ...recordShape,
  name: textSchema,
  ageGroup: textSchema.nullable(),
});

export const coachSchema = z.strictObject({
  ...recordShape,
  displayName: textSchema,
  teamIds: z
    .array(idSchema)
    .refine((ids) => new Set(ids).size === ids.length, "Duplicate team"),
  // Directory records can exist before account invitations or authentication.
  membershipId: idSchema.nullable(),
});

export const coachAssignmentSchema = z.strictObject({
  coachId: idSchema,
  role: z.enum(["lead", "assistant", "specialist"]),
});

export type Team = z.infer<typeof teamSchema>;
export type Coach = z.infer<typeof coachSchema>;
