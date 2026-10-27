import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { createGuidePdf, PDF_RENDERER_VERSION } from "../../lib/server/guide-pdf";
import { handleGuideExport } from "../../lib/server/guide-export-http";
import { handleDocument } from "../../lib/server/document-http";
import { validatePdf } from "../../lib/server/pdf-validation";
import { PersistenceError } from "../../lib/server/errors";
import { domainBundleSchema } from "../../lib/domain/validation";
import type { ObjectRecord, DocumentStore } from "../../lib/server/repositories/documents";
import type { CoachingStore } from "../../lib/server/repositories/coaching";
import { exportCases, exportFixture } from "./export-fixtures";

for (const entry of exportCases) test(`illustrated PDF: exact ${entry.id} guide produces passive A4 pages with source provenance`, async () => {
  const { bundle, reference } = exportFixture(entry.id), before = structuredClone(bundle), generated = await createGuidePdf(bundle, reference);
  await validatePdf(generated.filename, generated.bytes);
  const pdf = await PDFDocument.load(generated.bytes), manifest = JSON.parse(pdf.getSubject()!);
  assert.deepEqual(manifest, generated.manifest); assert.equal(manifest.session.revision, 1); assert.equal(manifest.rendererVersion, PDF_RENDERER_VERSION);
  assert.ok(pdf.getPages().every((page) => Math.abs(page.getWidth() - 595.28) < .1 && Math.abs(page.getHeight() - 841.89) < .1));
  assert.ok(generated.pageCount >= (entry.id === "long-session" ? 3 : 1)); assert.ok(generated.bytes.length < 3 * 1024 * 1024);
  if (entry.id === "long-session") assert.ok(generated.pageCount <= 12, "short coaching notes must not create a separate mostly-empty page per activity");
  if (entry.id === "no-diagrams") assert.equal(manifest.diagrams.length, 0);
  if (entry.id === "historical") assert.equal(manifest.diagrams[0].seconds, 5);
  assert.deepEqual(bundle, before);
});

/** In-memory journal contracts exercise the real generator/handlers; no hosted service is represented. */
function fixture() {
  const initial = exportFixture("possession"), actor = "00000000-0000-4000-8000-000000000001";
  let bundle = initial.bundle, version = 4, writes = 0, puts = 0, registrations = 0;
  const records = new Map<string, ObjectRecord>(), blobs = new Map<string, Uint8Array>();
  const store: CoachingStore = { load: async (organization) => { if (organization !== bundle.organizationId) throw new PersistenceError(404, "Organisation unavailable"); return { version, bundle }; },
    save: async (_organization, user, expected, next) => { assert.equal(user, actor); assert.equal(expected, version); writes++; bundle = domainBundleSchema.parse(next); return ++version; } };
  const files: DocumentStore = { register: async (_actor, record) => { registrations++; assert.ok(!records.has(record.id)); records.set(record.id, record); },
    put: async (record, bytes) => { puts++; assert.ok(!blobs.has(record.object_key)); blobs.set(record.object_key, new Uint8Array(bytes)); },
    get: async (_organization, id) => records.get(id)!, download: async (record) => blobs.get(record.object_key)! };
  const route = { organizationId: bundle.organizationId, sessionId: initial.reference.session, revision: "1" };
  const request = (headers: Record<string, string> = {}) => new Request("https://football.example/export", { method: "POST", headers: { Origin: "https://football.example", "x-expected-version": String(version), "x-booking-id": initial.reference.event!, "x-booking-revision": "1", ...headers } });
  const authenticate = async () => ({ actor, store, documents: () => files });
  return { initial, route, request, authenticate, store, files, records, blobs, bundle: () => bundle, counts: () => ({ writes, puts, registrations }) };
}

test("private generation appends only exact document metadata; downloads retain original bytes after later session edits", async () => {
  const f = fixture(), before = structuredClone(f.bundle());
  const response = await handleGuideExport(f.request(), f.route, "https://football.example", f.authenticate); assert.equal(response.status, 200);
  const ack = await response.json(), saved = f.bundle(); assert.equal(ack.version, 5);
  assert.deepEqual(saved.sessions, before.sessions); assert.deepEqual(saved.events, before.events); assert.deepEqual(saved.scenes, before.scenes); assert.deepEqual(saved.templates, before.templates);
  const doc = saved.documents.find((candidate) => candidate.id === ack.document.id)!;
  assert.deepEqual(doc.source, { kind: "generated-guide", session: { id: f.route.sessionId, revision: 1 }, scenes: [{ id: "export-possession", revision: 1 }], rendererVersion: PDF_RENDERER_VERSION });
  const downloadRoute = { ...f.route, documentId: doc.id, documentRevision: "1" };
  const first = await handleDocument(new Request("https://football.example/download"), downloadRoute, "https://football.example", f.authenticate); assert.equal(first.status, 200);
  const bytes = new Uint8Array(await first.arrayBuffer());
  saved.sessions.push({ ...structuredClone(saved.sessions.find((s) => s.id === f.route.sessionId)!), revision: 2 });
  const again = await handleDocument(new Request("https://football.example/download"), downloadRoute, "https://football.example", f.authenticate);
  assert.deepEqual(new Uint8Array(await again.arrayBuffer()), bytes);
  assert.equal((await handleDocument(new Request("https://football.example/download"), { ...downloadRoute, revision: "2" }, "https://football.example", f.authenticate)).status, 404);
  assert.equal((await handleGuideExport(f.request(), f.route, "https://football.example", f.authenticate)).status, 200);
  assert.equal(f.bundle().documents.length, before.documents.length + 2); assert.equal(new Set([...f.records.values()].map((record) => record.object_key)).size, 2);
});

test("export auth, origin, organization, exact pins and stale version failures cannot acquire object capability", async () => {
  const f = fixture(), deny = async () => { throw new PersistenceError(401, "Sign in"); };
  assert.equal((await handleGuideExport(f.request(), f.route, "https://football.example", deny)).status, 401);
  assert.equal((await handleGuideExport(f.request({ Origin: "https://other.example" }), f.route, "https://football.example", f.authenticate)).status, 403);
  for (const [route, headers, status] of [[{ ...f.route, organizationId: "other-club" }, {}, 404], [{ ...f.route, revision: "99" }, {}, 404], [f.route, { "x-expected-version": "3" }, 409], [f.route, { "x-booking-revision": "99" }, 404]] as const)
    assert.equal((await handleGuideExport(f.request(headers), route, "https://football.example", f.authenticate)).status, status);
  const body = new Request("https://football.example/export", { method: "POST", headers: { Origin: "https://football.example" }, body: "forged content" });
  assert.equal((await handleGuideExport(body, f.route, "https://football.example", f.authenticate)).status, 400);
  assert.deepEqual(f.counts(), { writes: 0, puts: 0, registrations: 0 });
});

test("uncertain generated-export saves never retry, overwrite or delete potentially committed bytes", async () => {
  const f = fixture(); f.store.save = async () => { throw new Error("private-provider-error"); };
  const response = await handleGuideExport(f.request(), f.route, "https://football.example", f.authenticate);
  assert.equal(response.status, 503); assert.ok(!(await response.text()).includes("private-provider-error"));
  assert.deepEqual(f.counts(), { writes: 0, puts: 1, registrations: 1 }); assert.equal(f.blobs.size, 1);
  assert.equal(f.bundle().documents.length, f.initial.bundle.documents.length);
});

test("invalid snapshots, unsupported text and excessive guide complexity fail before private object writes", async () => {
  const { bundle, reference } = exportFixture("possession");
  await assert.rejects(createGuidePdf(bundle, { ...reference, revision: 99 }), /Exact guide/);
  bundle.sessions.find((session) => session.id === reference.session)!.content.title = "Unsupported 🦄";
  await assert.rejects(createGuidePdf(bundle, reference), /unsupported by the export font/);
  const large = exportFixture("long-session"), session = large.bundle.sessions.find((s) => s.id === large.reference.session)!;
  session.content.activities = Array.from({ length: 101 }, (_, index) => ({ ...structuredClone(session.content.activities[0]), id: `large-${index}` }));
  await assert.rejects(createGuidePdf(large.bundle, large.reference), /complexity/);
});
