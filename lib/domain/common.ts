import { z } from "zod";

/** Opaque stable identifiers; allocation belongs to the future persistence layer. */
export const idSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/);
export const revisionSchema = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);
export const textSchema = z.string().trim().min(1).max(10_000);
export const revisionRefSchema = z.strictObject({
  id: idSchema,
  revision: revisionSchema,
});
export const recordShape = {
  schemaVersion: z.literal("1.0"),
  organizationId: idSchema,
  id: idSchema,
};

/** Record uniqueness checks also work for nested activities, stages and entities. */
export function duplicateIds(values: readonly { id: string }[]): boolean {
  return new Set(values.map((value) => value.id)).size !== values.length;
}

export type RevisionRef = z.infer<typeof revisionRefSchema>;
