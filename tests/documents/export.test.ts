import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { createGuidePdf, guideDiagramDrawing, PDF_RENDERER_VERSION } from "../../lib/server/guide-pdf";
import { handleGuideExport } from "../../lib/server/guide-export-http";
import { handleDocument } from "../../lib/server/document-http";
import { validatePdf } from "../../lib/server/pdf-validation";
import { PersistenceError } from "../../lib/server/errors";
import { domainBundleSchema } from "../../lib/domain/validation";
import type { ObjectRecord, DocumentStore } from "../../lib/server/repositories/documents";
import type { CoachingStore } from "../../lib/server/repositories/coaching";
import { exportCases, exportFixture } from "./export-fixtures";
import { syntheticDocumentBrand } from "./brand-fixtures";
import { exportBookingLabel } from "../../lib/documents/design-contracts";

for (const entry of exportCases) test(`illustrated PDF: exact ${entry.id} guide produces passive A4 pages with source provenance`, async () => {
  const { bundle, reference } = exportFixture(entry.id), before = structuredClone(bundle), generated = await createGuidePdf(bundle, reference);
  await validatePdf(generated.filename, generated.bytes);
  const pdf = await PDFDocument.load(generated.bytes), manifest = JSON.parse(pdf.getSubject()!);
  assert.deepEqual(manifest, generated.manifest); assert.equal(manifest.session.revision, 1); assert.equal(manifest.rendererVersion, PDF_RENDERER_VERSION);
  assert.ok(pdf.getPages().every((page) => Math.abs(page.getWidth() - 595.28) < .1 && Math.abs(page.getHeight() - 841.89) < .1));
  assert.ok(generated.pageCount >= (entry.id === "long-session" ? 3 : 1)); assert.ok(generated.bytes.length < 3 * 1024 * 1024);
  if (entry.id === "long-session") assert.ok(generated.pageCount <= 12, "short coaching notes must not create a separate mostly-empty page per activity");
  if (entry.id === "possession") assert.equal(generated.pageCount, 1, "a short illustrated practice must not get a separate overview page");
  if (entry.id === "no-diagrams") assert.equal(manifest.diagrams.length, 0);
  if (entry.id === "historical") assert.equal(manifest.diagrams[0].seconds, 5);
  assert.deepEqual(bundle, before);
});

test("shared document templates retain source pins, bounded synthetic marks and explicit cover selection", async () => {
  const { bundle, reference } = exportFixture("possession"), brand = await syntheticDocumentBrand(bundle.organizationId), before = structuredClone(bundle);
  const sheet = await createGuidePdf(bundle, reference, { template: "single-activity" }, brand);
  const cover = await createGuidePdf(bundle, reference, { template: "extended-pack", cover: true }, brand);
  assert.equal(sheet.manifest.design.template, "single-activity"); assert.equal(sheet.pageCount, 1);
  assert.equal(cover.manifest.design.cover, true); assert.ok(cover.pageCount > sheet.pageCount);
  assert.deepEqual(sheet.manifest.diagrams, cover.manifest.diagrams); assert.deepEqual(bundle, before);
  assert.equal((await PDFDocument.load(sheet.bytes)).getAuthor(), "SYNTHETIC REVIEW FC");
  assert.ok(!JSON.stringify(sheet.manifest).includes('"bytes"')); assert.match(JSON.stringify(sheet.manifest), /crestSHA256/);
  await assert.rejects(createGuidePdf(bundle, reference, {}, { ...brand, organizationId: "other-club" }), /branding unavailable/);
  await assert.rejects(createGuidePdf(bundle, reference, {}, { ...brand, primaryColour: "#ffffff" }), /contrast/);
  await assert.rejects(createGuidePdf(bundle, reference, { template: "single-activity", cover: true }), /dedicated cover/);
  const multi = exportFixture("session-guide");
  await assert.rejects(createGuidePdf(multi.bundle, multi.reference, { template: "single-activity" }), /at most one/);
});

test("multiple diagrams resolve each saved context instead of inheriting an unrelated activity framing area", () => {
  const { bundle, reference } = exportFixture("multiple-diagrams"), activity = bundle.sessions.find((session) => session.id === reference.session)!.content.activities[0];
  const scene = bundle.scenes.find((candidate) => candidate.id === activity.content.diagrams[1].scene.id)!, before = structuredClone(scene);
  const differentArea = structuredClone(activity); differentArea.content.area = { origin: { x: 500, y: 500 }, length: 2, width: 2 };
  const first = guideDiagramDrawing(scene, activity, 0, 515, 226), second = guideDiagramDrawing(scene, differentArea, 0, 515, 226);
  assert.deepEqual(first.view, second.view); assert.equal(first.clippedEntities, 0); assert.equal(first.view.rotation, 270); assert.deepEqual(scene, before);
  assert.ok(first.view.target.maxX - first.view.target.minX <= 38, "final-third context must not expand to the full 105 m pitch");
});

test("club marks cannot fetch URLs or embed SVG, animated, oversized or mismatched raster payloads", async () => {
  const { bundle, reference } = exportFixture("possession"), brand = await syntheticDocumentBrand(bundle.organizationId);
  await assert.rejects(createGuidePdf(bundle, reference, {}, { ...brand, crest: { ...brand.crest!, bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/>') } }), /single-frame/);
  await assert.rejects(createGuidePdf(bundle, reference, {}, { ...brand, crest: { ...brand.crest!, format: "jpeg" } }), /single-frame/);
  await assert.rejects(createGuidePdf(bundle, reference, {}, { ...brand, crest: { ...brand.crest!, bytes: new Uint8Array(256 * 1024 + 1) } }), /256 KiB/);
  await assert.rejects(createGuidePdf(bundle, reference, {}, { ...brand, url: "https://other.example/crest.png" } as typeof brand), /Unrecognized key/);
});

test("new export filenames distinguish original booking dates and revisions while legacy provenance stays unverified", async () => {
  const { bundle, reference } = exportFixture("possession"), first = await createGuidePdf(bundle, reference);
  assert.match(exportBookingLabel(first.filename), /Original booking 2026-11-03.*revision 1/);
  const old = structuredClone(bundle.events.find((e) => e.id === reference.event)!);
  if (old.kind !== "training" && old.kind !== "testing") throw new Error("Expected session booking");
  old.revision = 2; old.venue = "New training venue"; bundle.events.push(old);
  const later = await createGuidePdf(bundle, { ...reference, bookingRevision: 2 });
  assert.match(exportBookingLabel(later.filename), /revision 2/); assert.notEqual(later.filename, first.filename);
  assert.deepEqual(first.manifest.booking, { id: reference.event, revision: 1 });
  assert.match(exportBookingLabel("football-session-old-r1.pdf"), /unverified/);
  assert.match(exportBookingLabel((await createGuidePdf(bundle, { session: reference.session, revision: 1 })).filename), /no booking/);
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
  for (const headers of [{ "x-guide-template": "remote-template" }, { "x-guide-cover": "yes" }, { "x-guide-template": "single-activity", "x-guide-cover": "true" }] as Record<string, string>[])
    assert.equal((await handleGuideExport(f.request(headers), f.route, "https://football.example", f.authenticate)).status, 400);
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
