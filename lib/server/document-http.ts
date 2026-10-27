import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { idSchema, revisionSchema } from "../domain/common";
import { documentSchema } from "../domain/document";
import { reviseSession } from "../coaching/sessions";
import { latestEvents } from "../calendar/schedule";
import { PersistenceError } from "./errors";
import { errorResponse } from "./persistence-http";
import { decodeSavedSnapshot, versionSchema, type CoachingStore } from "./repositories/coaching";
import type { DocumentStore } from "./repositories/documents";
import { readPdf, validatePdf } from "./pdf-validation";

export type DocumentContext = { actor: string; store: CoachingStore; documents: () => DocumentStore };
export type DocumentRoute = { organizationId: string; sessionId: string; revision: string; documentId?: string; documentRevision?: string };
const integer = (value: string | null) => value !== null && /^(0|[1-9][0-9]*)$/.test(value) ? Number(value) : NaN;
const checksum = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** Attach validated bytes to one exact saved session; private object writes never accept client paths or actor IDs. */
export async function handleDocument(request: Request, route: DocumentRoute, origin: string, authenticate: () => Promise<DocumentContext>): Promise<Response> {
  try {
    const organization = idSchema.parse(route.organizationId), sessionId = idSchema.parse(route.sessionId);
    const revision = revisionSchema.parse(integer(route.revision));
    if (!["POST", "GET"].includes(request.method)) throw new PersistenceError(405, "Method not allowed");
    if (request.method === "POST" && request.headers.get("origin") !== origin) throw new PersistenceError(403, "Request origin rejected");
    const { actor, store, documents } = await authenticate();
    const saved = decodeSavedSnapshot(await store.load(organization), organization);
    const session = saved.bundle.sessions.find((s) => s.id === sessionId && s.revision === revision);
    if (!session) throw new PersistenceError(404, "Session revision unavailable");
    if (request.method === "GET") {
      const id = idSchema.parse(route.documentId), docRevision = revisionSchema.parse(integer(route.documentRevision ?? null));
      const doc = saved.bundle.documents.find((d) => d.id === id && d.revision === docRevision);
      if (!doc || doc.state !== "ready" || doc.mimeType !== "application/pdf") throw new PersistenceError(404, "Document unavailable");
      const allowed = doc.source.kind === "upload" ? session.documents.some((d) => d.id === id && d.revision === docRevision)
        : doc.source.session.id === sessionId && doc.source.session.revision === revision;
      if (!allowed) throw new PersistenceError(404, "Document unavailable");
      const files = documents(); const record = await files.get(organization, id, docRevision);
      if (record.organization_id !== organization || record.id !== id || record.revision !== docRevision || doc.storageKey !== `attachment-${id}` || doc.filename !== record.filename || doc.byteLength !== record.byte_length)
        throw new PersistenceError(404, "Document unavailable");
      const bytes = await files.download(record);
      if (bytes.length !== record.byte_length || checksum(bytes) !== record.sha256) throw new PersistenceError(503, "Document integrity check failed");
      return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "application/pdf", "Content-Length": String(bytes.length),
        "Content-Disposition": `attachment; filename="coaching-document.pdf"; filename*=UTF-8''${encodeURIComponent(record.filename).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)}`,
        "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'", "Referrer-Policy": "no-referrer" } });
    }
    const expected = versionSchema.parse(integer(request.headers.get("x-expected-version")));
    if (expected !== saved.version) throw new PersistenceError(409, "Saved information changed; reload before uploading");
    const eventId = request.headers.get("x-booking-id"), eventRevision = request.headers.get("x-booking-revision");
    if (!!eventId !== !!eventRevision) throw new PersistenceError(400, "Incomplete booking reference");
    if (eventId) {
      idSchema.parse(eventId); const pin = revisionSchema.parse(integer(eventRevision));
      const booking = latestEvents(saved.bundle).find((e) => e.id === eventId);
      if (!booking || booking.revision !== pin || booking.session?.id !== sessionId || booking.session.revision !== revision) throw new PersistenceError(409, "Booking changed; reopen its current session");
    }
    // Validate editability before accepting bytes or acquiring privileged object access.
    reviseSession(saved.bundle, session, eventId ?? undefined);
    let filename: string;
    try { filename = decodeURIComponent(request.headers.get("x-document-filename") ?? ""); }
    catch { throw new PersistenceError(400, "Invalid PDF filename"); }
    const bytes = await readPdf(request); await validatePdf(filename, bytes);
    const id = randomUUID();
    const record = { organization_id: organization, id, revision: 1, object_key: `${organization}/${randomUUID()}.pdf`, filename, byte_length: bytes.length, sha256: checksum(bytes) };
    const doc = documentSchema.parse({ schemaVersion: "1.0", organizationId: organization, id, revision: 1, filename, mimeType: "application/pdf", byteLength: bytes.length,
      storageKey: `attachment-${id}`, state: "ready", source: { kind: "upload" } });
    const bundle = structuredClone(saved.bundle); bundle.documents.push(doc);
    const draft = structuredClone(session); draft.documents.push({ id, revision: 1 });
    const result = reviseSession(bundle, draft, eventId ?? undefined);
    const files = documents();
    await files.register(actor, record); await files.put(record, bytes);
    // Never delete after an uncertain save: it may already have committed. Journaled orphans stay private for operator reconciliation.
    const version = await store.save(organization, actor, expected, result.bundle);
    if (version !== expected + 1) throw new PersistenceError(503, "Attachment save could not be confirmed; reload before retrying");
    return Response.json({ version, session: { id: result.session.id, revision: result.session.revision },
      event: result.event ? { id: result.event.id, revision: result.event.revision } : null }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error instanceof z.ZodError ? new PersistenceError(400, "Invalid document reference or upload fields") : error); }
}
