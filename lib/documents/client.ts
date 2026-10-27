import { z } from "zod";
import { CalendarApiError, type CalendarSnapshot } from "../calendar/client";
import { idSchema, revisionRefSchema } from "../domain/common";
import { documentEndpoint, MAX_PDF_BYTES, pdfFilenameSchema, type GuideReference } from "./contracts";
import { exportAcknowledgement, exportEndpoint } from "./export-contracts";

/** Preserve status identity so revoked access clears private drafts through the shared provider. */
export class GuideExportApiError extends CalendarApiError {
  constructor(status: number) {
    super(status);
    this.message = status === 409 ? "Saved information changed. Reload before exporting."
      : status === 413 ? "This guide exceeds the export size or complexity limit. Split it into smaller saved sessions."
      : status === 400 ? "The exact guide could not be exported. Check its saved reference, diagram framing and supported text characters."
      : status === 401 ? "Sign in again, then reload saved records." : status === 404 ? "This saved guide is unavailable."
      : "Export could not be confirmed. Reload before trying again.";
  }
}

/** Export one exact saved guide; a failed or uncertain POST is never retried automatically. */
export async function generateGuidePdf(base: CalendarSnapshot, reference: GuideReference) {
  const headers: Record<string, string> = { "x-expected-version": String(base.version) };
  if (reference.event) { headers["x-booking-id"] = reference.event; headers["x-booking-revision"] = String(reference.bookingRevision); }
  const response = await fetch(exportEndpoint(base.bundle.organizationId, reference), { method: "POST", headers, credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new GuideExportApiError(response.status);
  const result = exportAcknowledgement.parse(await response.json());
  if (result.version !== base.version + 1) throw new Error("Unexpected export acknowledgement. Reload before trying again.");
  return result;
}

const acknowledgement = z.strictObject({ version: z.number().int().positive(), session: revisionRefSchema, event: revisionRefSchema.nullable() });

/** Carry redacted PDF errors through the shared authentication/uncertain-save boundary. */
export class DocumentApiError extends CalendarApiError {
  constructor(status: number) {
    super(status);
    this.message = status === 400 || status === 415 ? "Choose a readable, unencrypted PDF without forms, scripts, links or embedded files."
      : status === 413 ? "Choose a PDF up to 3 MiB." : status === 409 ? "Saved information changed. Reload before uploading."
      : status === 401 ? "Sign in again, then reload your saved records." : status === 404 ? "This session or document is unavailable."
      : "Document operation could not be confirmed. Reload before retrying.";
  }
}

/** Upload raw bounded bytes, not multipart paths; no actor, object key or URL is accepted from the browser. */
export async function uploadPdf(base: CalendarSnapshot, reference: GuideReference, file: File) {
  if (!pdfFilenameSchema.safeParse(file.name).success || file.type !== "application/pdf") throw new Error("Choose a PDF filename without paths and an application/pdf file type.");
  if (!file.size || file.size > MAX_PDF_BYTES) throw new Error("Choose a PDF up to 3 MiB.");
  const headers: Record<string, string> = { "Content-Type": "application/pdf", "x-expected-version": String(base.version), "x-document-filename": encodeURIComponent(file.name) };
  if (reference.event) { headers["x-booking-id"] = reference.event; headers["x-booking-revision"] = String(reference.bookingRevision); }
  const response = await fetch(documentEndpoint(base.bundle.organizationId, reference.session, reference.revision), {
    method: "POST", headers, body: file, credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new DocumentApiError(response.status);
  const result = acknowledgement.parse(await response.json());
  if (result.version !== base.version + 1 || result.session.id !== reference.session || result.session.revision <= reference.revision || result.event?.id !== reference.event)
    throw new Error("Unexpected attachment acknowledgement. Reload before retrying.");
  return result;
}

/** Download through fresh server authorization and release the temporary browser object URL after saving. */
export async function downloadPdf(organization: string, reference: GuideReference, document: { id: string; revision: number; filename: string }) {
  const pin = revisionRefSchema.parse({ id: document.id, revision: document.revision }), id = idSchema.parse(pin.id);
  const response = await fetch(`${documentEndpoint(organization, reference.session, reference.revision)}/${id}/${pin.revision}`, { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new DocumentApiError(response.status);
  if (response.headers.get("content-type")?.split(";")[0] !== "application/pdf") throw new Error("Invalid document response");
  const blob = await response.blob();
  if (!blob.size || blob.size > MAX_PDF_BYTES) throw new Error("Invalid document response size");
  const url = URL.createObjectURL(blob), anchor = window.document.createElement("a");
  anchor.href = url; anchor.download = document.filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
