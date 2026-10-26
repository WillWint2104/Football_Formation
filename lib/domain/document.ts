import { z } from "zod";
import {
  recordShape,
  revisionRefSchema,
  revisionSchema,
  textSchema,
} from "./common";

export const documentSchema = z
  .strictObject({
    ...recordShape,
    revision: revisionSchema,
    filename: textSchema,
    mimeType: z.enum(["application/pdf", "image/png", "image/jpeg"]),
    byteLength: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    // Private object identity, never a public URL or an expiring signed download URL.
    storageKey: z
      .string()
      .min(1)
      .max(1024)
      .refine(
        (key) =>
          !key.includes(":") &&
          !key.includes("\\") &&
          !key.startsWith("/") &&
          key
            .split("/")
            .every((part) => part !== ".." && part !== "." && part !== ""),
        "Expected a relative private storage key",
      ),
    state: z.enum(["pending", "ready", "rejected"]),
    source: z.discriminatedUnion("kind", [
      z.strictObject({ kind: z.literal("upload") }),
      z.strictObject({
        kind: z.literal("generated-guide"),
        session: revisionRefSchema,
        scenes: z.array(revisionRefSchema),
        rendererVersion: textSchema,
      }),
    ]),
  })
  .refine(
    (doc) =>
      doc.source.kind !== "generated-guide" ||
      doc.mimeType === "application/pdf",
    "Generated guides must be PDFs",
  );
export type CoachingDocument = z.infer<typeof documentSchema>;
