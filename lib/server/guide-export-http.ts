import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { documentSchema } from "../domain/document";
import { idSchema, revisionSchema } from "../domain/common";
import { guideReferenceSchema } from "../documents/contracts";
import { decodeSavedSnapshot, versionSchema } from "./repositories/coaching";
import { errorResponse } from "./persistence-http";
import { PersistenceError } from "./errors";
import { createGuidePdf, PDF_RENDERER_VERSION } from "./guide-pdf";
import { validatePdf } from "./pdf-validation";
import type { DocumentContext, DocumentRoute } from "./document-http";

/** Authenticate, generate and journal a new export; never revise its source session, booking or scene. */
export async function handleGuideExport(request: Request, route: DocumentRoute, origin: string, authenticate: () => Promise<DocumentContext>): Promise<Response> {
  try {
    if (request.method !== "POST") throw new PersistenceError(405, "Method not allowed");
    if (request.headers.get("origin") !== origin) throw new PersistenceError(403, "Request origin rejected");
    if (request.body) {
      const reader = request.body.getReader();
      try { const first = await reader.read(); if (!first.done) { await reader.cancel(); throw new PersistenceError(400, "Exports do not accept client content"); } }
      finally { reader.releaseLock(); }
    }
    const organization = idSchema.parse(route.organizationId), sessionId = idSchema.parse(route.sessionId);
    const integer = (value: string | null) => value !== null && /^(0|[1-9][0-9]*)$/.test(value) ? Number(value) : NaN;
    const revision = revisionSchema.parse(integer(route.revision)), expected = versionSchema.parse(integer(request.headers.get("x-expected-version")));
    const event = request.headers.get("x-booking-id"), booking = request.headers.get("x-booking-revision");
    if (!!event !== !!booking) throw new PersistenceError(400, "Incomplete booking reference");
    const reference = guideReferenceSchema.parse({ session: sessionId, revision, ...(event ? { event, bookingRevision: integer(booking) } : {}) });
    const { actor, store, documents } = await authenticate(), saved = decodeSavedSnapshot(await store.load(organization), organization);
    if (saved.version !== expected) throw new PersistenceError(409, "Saved information changed; reload before exporting");
    const generated = await createGuidePdf(saved.bundle, reference);
    await validatePdf(generated.filename, generated.bytes);
    const id = randomUUID(), scenePins = [...new Map(generated.manifest.diagrams.map((diagram) => [`${diagram.scene.id}:${diagram.scene.revision}`, diagram.scene])).values()];
    const document = documentSchema.parse({ schemaVersion: "1.0", organizationId: organization, id, revision: 1, filename: generated.filename,
      mimeType: "application/pdf", byteLength: generated.bytes.length, storageKey: `attachment-${id}`, state: "ready",
      source: { kind: "generated-guide", session: generated.manifest.session, scenes: scenePins, rendererVersion: PDF_RENDERER_VERSION } });
    const next = structuredClone(saved.bundle); next.documents.push(document);
    const record = { organization_id: organization, id, revision: 1, object_key: `${organization}/${randomUUID()}.pdf`, filename: document.filename,
      byte_length: generated.bytes.length, sha256: createHash("sha256").update(generated.bytes).digest("hex") };
    const files = documents(); await files.register(actor, record); await files.put(record, generated.bytes);
    // A failed acknowledgement may conceal a committed save. Keep journaled bytes private; never delete or retry automatically.
    const version = await store.save(organization, actor, expected, next);
    if (version !== expected + 1) throw new PersistenceError(503, "Export save could not be confirmed; reload before retrying");
    return Response.json({ version, document: { id, revision: 1, filename: document.filename } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error instanceof z.ZodError ? new PersistenceError(400, "Invalid export reference") : error); }
}
