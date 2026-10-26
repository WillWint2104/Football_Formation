import { z } from "zod";
import { idSchema, revisionSchema } from "../domain/common";

export const MAX_PDF_BYTES = 3 * 1024 * 1024;
export const DOCUMENT_BUCKET = "coaching-documents";
export const pdfFilenameSchema = z.string().max(190).regex(/^[\p{L}\p{N}][\p{L}\p{N} ._()-]*\.pdf$/iu)
  .refine((name) => !name.includes(".."), "Use a PDF filename without paths");
export const guideReferenceSchema = z.strictObject({ session: idSchema, revision: revisionSchema,
  event: idSchema.optional(), bookingRevision: revisionSchema.optional() })
  .refine((ref) => !!ref.event === !!ref.bookingRevision, "Booking identity and revision must be supplied together");
export type GuideReference = z.infer<typeof guideReferenceSchema>;

/** Preserve exact session and booking revisions in every guide link. */
export function guideHref(reference: GuideReference): string {
  const ref = guideReferenceSchema.parse(reference);
  const query = new URLSearchParams({ session: ref.session, revision: String(ref.revision) });
  if (ref.event) { query.set("event", ref.event); query.set("bookingRevision", String(ref.bookingRevision)); }
  return `/guides?${query}`;
}

/** Downloads address domain identities only, never object-store paths or public URLs. */
export function documentEndpoint(organization: string, session: string, revision: number): string {
  return `/api/organizations/${idSchema.parse(organization)}/sessions/${idSchema.parse(session)}/${revisionSchema.parse(revision)}/documents`;
}
