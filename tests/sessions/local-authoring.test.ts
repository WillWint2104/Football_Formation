import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptedLocalPackage, beginLocalAuthoring, candidatePackage, checkCurrentDocument, decodeAuthoringContext, encodeAuthoringContext, snapshotRef, verifyLocalCandidate } from "../../lib/designer/local-authoring";
import { CompanionRepository, CompanionStorageError, type CompanionRecord, type CompanionResult, type CompanionStorage } from "../../lib/designer/companion";
import { attachmentExample } from "../fixtures/attachments";

function value<T>(r: CompanionResult<T>): T { assert.ok(r.ok, JSON.stringify(r)); return r.value; }

test("confirmed activity dimensions initialize only a new independent scene; editing never resizes existing geometry", async () => {
  const repository = new CompanionRepository(new Storage()), pkg = attachmentExample(), origin = value(await repository.create(pkg));
  const created = await beginLocalAuthoring(origin, pkg.document, "activity-1", null, { length: 12, width: 15 });
  assert.deepEqual(created.initial.field, { length: 12, width: 15 });
  assert.deepEqual(created.initial.context, { kind: "neutral", boundary: true });
  assert.deepEqual(created.package, origin.package);
  const edited = await beginLocalAuthoring(origin, pkg.document, "activity-1", 0, { length: 1, width: 1 });
  assert.deepEqual(edited.initial.field, pkg.scenes[0].field);
  assert.deepEqual(edited.initial.entities, pkg.scenes[0].entities);
  const unknown = await beginLocalAuthoring(origin, pkg.document, "activity-1", null);
  assert.deepEqual(unknown.initial.field, { length: 105, width: 68 });
  assert.deepEqual(unknown.initial.context, { kind: "pitch", region: "full", attack: "positive-x" });
});
class Storage implements CompanionStorage {
  records: CompanionRecord[] = [];
  fault: "quota" | "interrupted" | "ack" | null = null;
  async transact<T>(_mode: "readonly" | "readwrite", f: (records: readonly unknown[]) => { value: T; put?: CompanionRecord }): Promise<T> {
    const r = f(structuredClone(this.records));
    if (r.put) {
      const fault = this.fault; this.fault = null;
      if (fault === "quota" || fault === "interrupted") throw new CompanionStorageError(fault, "Injected failure");
      this.records = [...this.records.filter((s) => s.documentId !== r.put!.documentId), structuredClone(r.put)];
      if (fault === "ack") throw new Error("Lost acknowledgement");
    }
    return r.value;
  }
}
async function setup(index: number | null = 0) {
  const storage = new Storage(), repo = new CompanionRepository(storage), origin = value(await repo.create(attachmentExample()));
  const opened = await beginLocalAuthoring(origin, origin.package.document, "activity-1", index);
  const pkg = candidatePackage(opened.package, null, opened.context, opened.initial), candidate = value(await repo.create(pkg));
  const context = { ...opened.context, candidate: snapshotRef(candidate) };
  return { storage, repo, origin, ...opened, candidate, context };
}
test("editing imported geometry forks native identity r1 without changing namespace, pins, dimensions or source", async () => {
  const s = await setup(), verified = await verifyLocalCandidate(s.repo, s.context);
  assert.notEqual(verified.scene.id, "example-rondo"); assert.equal(verified.scene.revision, 1);
  assert.equal(verified.scene.organizationId, s.origin.package.sceneNamespace);
  assert.deepEqual(verified.candidate.package.document, s.origin.package.document);
  assert.deepEqual(verified.candidate.package.scenes.slice(0, 3), s.origin.package.scenes);
  assert.deepEqual(value(await s.repo.read(s.origin.documentId)), { status: "ready", snapshot: s.origin });
  assert.deepEqual(decodeAuthoringContext(encodeAuthoringContext(s.context)), s.context);
});
test("explicit acceptance changes just the intended pin and preserves exact representative time", async () => {
  const s = await setup(), { scene } = await verifyLocalCandidate(s.repo, s.context);
  const accepted = acceptedLocalPackage(s.origin.package.document, s.candidate.package, s.context, scene, 2);
  const expected = structuredClone(s.origin.package.document); expected.session.activities[0].diagrams[0].scene = { id: scene.id, revision: 1 };
  assert.deepEqual(accepted.document, expected); assert.deepEqual(accepted.package.document, expected);
  const saved = value(await s.repo.save(s.origin.documentId, s.origin.ownerVersion, accepted.package));
  assert.equal(saved.ownerVersion, 2); assert.deepEqual(saved.package.scenes.slice(0, 3), s.origin.package.scenes);
});
test("multiple saves append immutable native revisions, and a stale candidate reference cannot select latest", async () => {
  const s = await setup(), second = candidatePackage(s.package, s.candidate.package, s.context, { ...s.initial, field: { length: 24, width: 18 } });
  const saved = value(await s.repo.save(s.candidate.documentId, 1, second));
  assert.deepEqual(saved.package.scenes.slice(0, 4), s.candidate.package.scenes);
  await assert.rejects(verifyLocalCandidate(s.repo, s.context), /changed in another tab/);
  const verified = await verifyLocalCandidate(s.repo, { ...s.context, candidate: snapshotRef(saved) });
  assert.equal(verified.scene.revision, 2); assert.equal(verified.scene.field.length, 24);
  assert.equal((await s.repo.save(saved.documentId, 1, second)).ok, false);
});
test("new diagram on a diagram-free plan creates an explicit local namespace and leaves original null namespace", async () => {
  const s = await setup(), p = attachmentExample(); p.sceneNamespace = null; p.scenes = []; p.document.session.activities.forEach((a) => a.diagrams = []);
  const origin = value(await s.repo.create(p)), opened = await beginLocalAuthoring(origin, p.document, "activity-1", null);
  assert.equal(origin.package.sceneNamespace, null); assert.match(opened.context.namespace, /^local-/);
  const pkg = candidatePackage(opened.package, null, opened.context, opened.initial), candidate = value(await s.repo.create(pkg));
  const verified = await verifyLocalCandidate(s.repo, { ...opened.context, candidate: snapshotRef(candidate) });
  assert.equal(verified.scene.organizationId, opened.context.namespace);
  assert.equal(acceptedLocalPackage(p.document, pkg, opened.context, verified.scene, 0).document.session.activities[0].diagrams.length, 1);
});
test("shortened animation requires a deliberate time; invalid/NaN times cannot silently clamp or reset", async () => {
  const s = await setup(), short = { ...s.initial, stages: [] };
  const pkg = candidatePackage(s.package, null, s.context, short);
  for (const time of [2, -1, NaN, Infinity]) assert.throws(() => acceptedLocalPackage(s.package.document, pkg, s.context, short, time), /explicit representative time/);
  assert.equal(acceptedLocalPackage(s.package.document, pkg, s.context, short, 0).document.session.activities[0].diagrams[0].representativeSeconds, 0);
});
test("incomplete text, changed text, missing/changed original pin and unknown activity fail safely", async () => {
  const s = await setup(), p = structuredClone(s.package.document); p.session.activities[0].name = "";
  await assert.rejects(beginLocalAuthoring(s.origin, p, "activity-1", 0));
  await assert.rejects(checkCurrentDocument(s.context, p), /changed/);
  p.session.activities[0].diagrams = [];
  await assert.rejects(checkCurrentDocument(s.context, p), /changed/);
  await assert.rejects(beginLocalAuthoring(s.origin, s.package.document, "missing", 0), /no longer exists/);
  await assert.rejects(beginLocalAuthoring(s.origin, s.package.document, "activity-1", 9), /no longer exists/);
});
test("untrusted malformed or unrelated return context cannot recover a different scene/namespace/owner", async () => {
  const s = await setup(); assert.throws(() => decodeAuthoringContext("x".repeat(6001))); assert.throws(() => decodeAuthoringContext("{}"));
  for (const context of [{ ...s.context, sceneId: crypto.randomUUID() }, { ...s.context, namespace: "other" }, { ...s.context, candidate: s.context.origin }, { ...s.context, candidate: null }, { ...s.context, documentDigest: "0".repeat(64) }])
    await assert.rejects(verifyLocalCandidate(s.repo, context));
  assert.throws(() => candidatePackage(s.package, null, s.context, { ...s.initial, id: "foreign" }), /identity/);
  assert.throws(() => candidatePackage(s.package, null, s.context, { ...s.initial, organizationId: "foreign" }), /namespace/);
});
test("source concurrency prevents candidate recovery and source CAS prevents acceptance", async () => {
  const s = await setup(), p = structuredClone(s.origin.package); p.document.session.name = "Other tab";
  value(await s.repo.save(s.origin.documentId, 1, p));
  await assert.rejects(verifyLocalCandidate(s.repo, s.context), /changed in another tab/);
  assert.equal((await s.repo.save(s.origin.documentId, 1, s.candidate.package)).ok, false);
});
test("missing and corrupt candidates never fall back to another revision", async () => {
  for (const mode of ["missing", "corrupt"] as const) {
    const s = await setup();
    if (mode === "missing") s.storage.records = s.storage.records.filter((r) => r.documentId !== s.candidate.documentId);
    else s.storage.records.find((r) => r.documentId === s.candidate.documentId)!.snapshots[0].packageJson = "{}";
    await assert.rejects(verifyLocalCandidate(s.repo, s.context), new RegExp(mode === "missing" ? "missing" : "invalid"));
    assert.deepEqual(value(await s.repo.read(s.origin.documentId)), { status: "ready", snapshot: s.origin });
  }
});
for (const fault of ["quota", "interrupted", "ack"] as const) test(`${fault} candidate write never changes source; uncertain commits remain discoverable without retry`, async () => {
  const s = await setup(), pkg = candidatePackage(s.package, s.candidate.package, s.context, s.initial); s.storage.fault = fault;
  const result = await s.repo.save(s.candidate.documentId, 1, pkg); assert.equal(result.ok, false);
  assert.deepEqual(value(await s.repo.read(s.origin.documentId)), { status: "ready", snapshot: s.origin });
  const read = value(await s.repo.read(s.candidate.documentId)); assert.equal(read.status, "ready");
  if (read.status === "ready") assert.equal(read.snapshot.ownerVersion, fault === "ack" ? 2 : 1);
});
