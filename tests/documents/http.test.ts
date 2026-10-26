import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { coachingSample } from "../../lib/coaching/sample";
import { resolveGuide } from "../../lib/coaching/guide";
import { reviseSession } from "../../lib/coaching/sessions";
import { handleDocument, type DocumentRoute } from "../../lib/server/document-http";
import { PersistenceError } from "../../lib/server/errors";
import { validatePdf } from "../../lib/server/pdf-validation";
import type { ObjectRecord, DocumentStore } from "../../lib/server/repositories/documents";
import type { SavedSnapshot, CoachingStore } from "../../lib/server/repositories/coaching";
import { domainBundleSchema } from "../../lib/domain/validation";
import { MAX_PDF_BYTES, guideHref } from "../../lib/documents/contracts";

/** Create a real passive PDF fixture; the application does not implement guide export. */
export async function passivePdf() { const pdf = await PDFDocument.create(); pdf.addPage().drawText("Synthetic coaching attachment"); return new Uint8Array(await pdf.save()); }

/** Strict local storage-contract double: no hosted storage or Auth is represented by these tests. */
function fixture() {
  let saved: SavedSnapshot = { version: 4, bundle: coachingSample() };
  const session = saved.bundle.sessions.find((s) => s.content.title === "Rondos & Positional Play")!;
  const booking = saved.bundle.events.find((e) => e.session?.id === session.id)!;
  const route: DocumentRoute = { organizationId: saved.bundle.organizationId, sessionId: session.id, revision: "1" };
  let writes = 0, registrations = 0, puts = 0, downloads = 0;
  const records: ObjectRecord[] = [], blobs = new Map<string, Uint8Array>();
  const store: CoachingStore = { load: async (org) => { if (org !== saved.bundle.organizationId) throw new PersistenceError(404, "Organization unavailable"); return structuredClone(saved); },
    save: async (_org, actor, expected, bundle) => { assert.equal(actor, "00000000-0000-4000-8000-000000000001"); if (saved.version !== expected) throw new PersistenceError(409, "Reload before saving"); writes++; saved = { version: expected + 1, bundle: domainBundleSchema.parse(bundle) }; return saved.version; } };
  const documents: DocumentStore = { register: async (_actor, record) => { registrations++; records.push(structuredClone(record)); }, put: async (record, bytes) => { puts++; blobs.set(record.object_key, new Uint8Array(bytes)); },
    get: async (org, id, revision) => { const row = records.find((r) => r.organization_id === org && r.id === id && r.revision === revision); if (!row) throw new PersistenceError(404, "Document unavailable"); return row; },
    download: async (record) => { downloads++; const bytes = blobs.get(record.object_key); if (!bytes) throw new PersistenceError(404, "Document unavailable"); return bytes; } };
  const authenticate = async () => ({ actor: "00000000-0000-4000-8000-000000000001", store, documents: () => documents });
  const request = (body: Uint8Array, headers: Record<string, string> = {}) => new Request("https://football.example/upload", { method: "POST", body: new Uint8Array(body), headers: {
    Origin: "https://football.example", "Content-Type": "application/pdf", "x-document-filename": "coaching-plan.pdf", "x-expected-version": "4", "x-booking-id": booking.id, "x-booking-revision": "1", ...headers } });
  const call = (req: Request, params = route) => handleDocument(req, params, "https://football.example", authenticate);
  return { call, request, route, booking, session, store, documents, saved: () => saved, records, blobs, counts: () => ({ writes, registrations, puts, downloads }) };
}

test("PDF attachment appends exact session/booking pins, retains history and downloads unchanged bytes without storage paths", async () => {
  const f = fixture(), bytes = await passivePdf(), original = structuredClone(f.saved());
  const response = await f.call(f.request(bytes)); assert.equal(response.status, 200);
  const result = await response.json(); assert.equal(result.version, 5); assert.equal(result.session.revision, 2); assert.equal(result.event.revision, 2);
  assert.ok(!JSON.stringify(result).includes("object_key"));
  const attached = f.saved().bundle.sessions.find((s) => s.id === result.session.id && s.revision === 2)!;
  const doc = f.saved().bundle.documents.find((d) => d.id === attached.documents.at(-1)!.id)!;
  assert.equal(doc.storageKey, `attachment-${doc.id}`); assert.ok(!JSON.stringify(f.saved()).includes(f.records[0].object_key));
  assert.deepEqual(f.saved().bundle.sessions.find((s) => s.id === f.session.id && s.revision === 1), original.bundle.sessions.find((s) => s.id === f.session.id));
  const downloadRoute = { ...f.route, revision: "2", documentId: doc.id, documentRevision: "1" };
  const download = await f.call(new Request("https://football.example/download"), downloadRoute);
  assert.equal(download.status, 200); assert.deepEqual(new Uint8Array(await download.arrayBuffer()), bytes);
  assert.match(download.headers.get("content-disposition")!, /^attachment;/); assert.equal(download.headers.get("cache-control"), "private, no-store"); assert.equal(download.headers.get("x-content-type-options"), "nosniff");
  assert.equal((await f.call(new Request("https://football.example/download"), { ...downloadRoute, revision: "1" })).status, 404);
});

test("signed-out, cross-origin, inaccessible organisations and stale/mismatched references cannot reach object storage", async () => {
  const f = fixture(), bytes = await passivePdf();
  const denied = await handleDocument(f.request(bytes), f.route, "https://football.example", async () => { throw new PersistenceError(401, "Sign in required"); });
  assert.equal(denied.status, 401);
  const invalidHeaders: Record<string, string>[] = [{ Origin: "https://evil.example" }, { "x-expected-version": "3" }, { "x-booking-revision": "2" }, { "x-booking-id": "missing-booking" }];
  for (const headers of invalidHeaders)
    assert.ok([403, 409].includes((await f.call(f.request(bytes, headers))).status));
  assert.equal((await f.call(f.request(bytes), { ...f.route, organizationId: "other-club" })).status, 404);
  assert.equal((await f.call(f.request(bytes), { ...f.route, sessionId: "missing-session" })).status, 404);
  assert.equal((await f.call(f.request(bytes), { ...f.route, sessionId: "../private" })).status, 400);
  assert.deepEqual(f.counts(), { writes: 0, registrations: 0, puts: 0, downloads: 0 });
});

test("extension, MIME, magic, incomplete structure, active PDFs and encoded paths are rejected before any storage write", async () => {
  const f = fixture(), bytes = await passivePdf();
  for (const filename of ["../plan.pdf", "a\\plan.pdf", "%2e%2e%2fplan.pdf", "https://evil.example/a.pdf", "plan.html", "plan%00.pdf"]) {
    assert.equal((await f.call(f.request(bytes, { "x-document-filename": filename }))).status, 400);
  }
  assert.equal((await f.call(f.request(bytes, { "Content-Type": "image/png" }))).status, 415);
  assert.equal((await f.call(f.request(new TextEncoder().encode("<html>not a PDF</html>")))).status, 400);
  assert.equal((await f.call(f.request(new TextEncoder().encode("%PDF-1.7\n%%EOF")))).status, 400);
  const active = await PDFDocument.create(); active.addPage(); active.addJavaScript("run", "app.alert('unsupported')");
  assert.equal((await f.call(f.request(new Uint8Array(await active.save())))).status, 400);
  await assert.rejects(validatePdf("coaching.pdf", bytes.subarray(0, bytes.length - 20)));
  assert.equal(f.counts().registrations, 0);
});

test("actual upload byte limits apply with missing and forged Content-Length", async () => {
  const f = fixture(), large = new Uint8Array(MAX_PDF_BYTES + 1);
  for (const length of [undefined, "1", String(large.length)]) {
    assert.equal((await f.call(f.request(large, length ? { "Content-Length": length } : {}))).status, 413);
  }
  assert.equal(f.counts().puts, 0); assert.equal(f.counts().writes, 0);
});

test("failed uploads and metadata conflicts leave no attached revision, never retry and never delete potentially committed bytes", async () => {
  const bytes = await passivePdf(), failed = fixture();
  failed.documents.put = async () => { throw new Error("private-provider-key-must-not-leak"); };
  const response = await failed.call(failed.request(bytes)); assert.equal(response.status, 503); assert.ok(!(await response.text()).includes("private-provider")); assert.equal(failed.counts().writes, 0); assert.equal(failed.records.length, 1);
  const conflict = fixture(); conflict.store.save = async () => { throw new PersistenceError(409, "Reload before saving"); };
  assert.equal((await conflict.call(conflict.request(bytes))).status, 409); assert.equal(conflict.blobs.size, 1); assert.equal(conflict.saved().version, 4);
  const uncertain = fixture(), save = uncertain.store.save;
  uncertain.store.save = async (...args) => { await save(...args); throw new Error("lost acknowledgement"); };
  assert.equal((await uncertain.call(uncertain.request(bytes))).status, 503);
  assert.equal(uncertain.saved().version, 5); assert.equal(uncertain.blobs.size, 1); assert.equal(uncertain.counts().writes, 1);
});

test("download rejects wrong pins, pending metadata and tampered bytes without disclosing the physical mapping", async () => {
  const f = fixture(); await f.call(f.request(await passivePdf()));
  const doc = f.saved().bundle.documents.at(-1)!, params = { ...f.route, revision: "2", documentId: doc.id, documentRevision: "1" };
  assert.equal((await f.call(new Request("https://football.example/download"), { ...params, documentId: "guessed" })).status, 404);
  assert.equal((await f.call(new Request("https://football.example/download"), { ...params, documentRevision: "2" })).status, 404);
  f.blobs.set(f.records[0].object_key, new Uint8Array(f.records[0].byte_length));
  assert.equal((await f.call(new Request("https://football.example/download"), params)).status, 503);
  doc.state = "pending";
  assert.equal((await f.call(new Request("https://football.example/download"), params)).status, 404);
});

test("guide references require exact history and matching booking pins across every session type", () => {
  const bundle = coachingSample(), original = bundle.sessions[0], booking = bundle.events.find((e) => e.session?.id === original.id)!;
  for (const kind of ["conditioning", "possession", "goalkeeper", "technical", "tactical", "recovery", "testing"] as const) {
    const source = bundle.sessions.find((s) => s.content.kind === kind)!;
    assert.ok(source); assert.equal(resolveGuide(bundle, { session: source.id, revision: source.revision })!.session.content.kind, kind);
  }
  const draft = structuredClone(original); draft.content.objective = "Newer content";
  const edited = reviseSession(bundle, draft, booking.id).bundle;
  assert.deepEqual(resolveGuide(edited, { session: original.id, revision: 1, event: booking.id, bookingRevision: 1 })!.session, original);
  assert.equal(resolveGuide(edited, { session: original.id, revision: 1, event: booking.id, bookingRevision: 2 }), null);
  assert.equal(resolveGuide(edited, { session: original.id, revision: 99 }), null);
  assert.match(guideHref({ session: original.id, revision: 1 }), /revision=1/);
  assert.throws(() => guideHref({ session: original.id, revision: 1, event: booking.id }));
});
