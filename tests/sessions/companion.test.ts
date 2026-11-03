import test from "node:test";
import assert from "node:assert/strict";
import { CompanionRepository, CompanionStorageError, COMPANION_LIMITS, planCompanionRecovery, type CompanionRecord, type CompanionResult, type CompanionStorage, type RecoveredCompanion } from "../../lib/designer/companion";
import { indexedDbCompanionStorage } from "../../lib/designer/companion-indexeddb";
import { DESIGNER_DRAFT_KEY, encodeDraft } from "../../lib/designer/drafts";
import { resolvePackageDiagram } from "../../lib/designer/package";
import { companionExample, maximumCompanionPackage } from "../fixtures/companion";

const now = 1_800_000_000_000;
function value<T>(result: CompanionResult<T>): T { assert.ok(result.ok, JSON.stringify(result)); return result.value; }
function rejected(result: CompanionResult<unknown>, code: string) { assert.equal(result.ok, false); if (!result.ok) assert.equal(result.error.code, code); }
class MemoryStorage implements CompanionStorage {
  records: unknown[] = [];
  failure: "before" | "after" | "quota" | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  writes = 0;
  transact<T>(mode: "readonly" | "readwrite", work: (records: readonly unknown[]) => { value: T; put?: CompanionRecord }): Promise<T> {
    const operation = this.queue.then(() => {
      const result = work(structuredClone(this.records));
      if (result.put) {
        assert.equal(mode, "readwrite"); this.writes++;
        const fault = this.failure; this.failure = null;
        if (fault === "before" || fault === "quota") throw new CompanionStorageError(fault === "quota" ? "quota" : "interrupted", "Injected transactional failure");
        const next = this.records.filter((r) => (r as CompanionRecord).documentId !== result.put!.documentId); next.push(structuredClone(result.put)); this.records = next;
        if (fault === "after") throw Error("Lost acknowledgement after durable commit");
      }
      return result.value;
    });
    this.queue = operation.catch(() => undefined); return operation;
  }
}
function setup() {
  const storage = new MemoryStorage(); let id = 0, time = now;
  return { storage, repo: new CompanionRepository(storage, { newId: () => `local-${++id}`, now: () => time++ }) };
}
async function saved() { const s = setup(); return { ...s, first: value(await s.repo.create(companionExample())) }; }
function snapshot(read: Awaited<ReturnType<CompanionRepository["read"]>>): RecoveredCompanion { const result = value(read); assert.equal(result.status, "ready"); if (result.status !== "ready") throw Error("Not ready"); return result.snapshot; }

test("initial coherent package reopens through a new repository without rewriting namespace, pins or the source", async () => {
  const { repo, storage } = setup(), p = companionExample(), before = JSON.stringify(p), initial = value(await repo.create(p));
  assert.equal(initial.ownerVersion, 1); assert.equal(initial.documentId, "local-1");
  const reopened = snapshot(await new CompanionRepository(storage).read(initial.documentId));
  assert.deepEqual(reopened, initial); assert.equal(JSON.stringify(p), before);
  const pin = resolvePackageDiagram(reopened.package, "activity-1", 0); assert.ok(pin.ok); assert.equal(pin.value.scene.revision, 1); assert.equal(pin.value.representativeSeconds, 1); assert.equal(pin.value.namespace, "file-namespace");
  reopened.package.document.session.name = "Caller copy"; assert.equal(snapshot(await repo.read(initial.documentId)).package.document.session.name, p.document.session.name);
});
test("import identities are independent, same-owner saves increment versions and retain only the latest two complete snapshots", async () => {
  const { repo, storage, first } = await saved(), second = value(await repo.create(first.package)); assert.notEqual(first.documentId, second.documentId);
  for (let i = 2; i <= 4; i++) { const p = companionExample(); p.document.session.name = `Edit ${i}`; assert.equal(value(await repo.save(first.documentId, i - 1, p)).ownerVersion, i); }
  const record = storage.records.find((r) => (r as CompanionRecord).documentId === first.documentId) as CompanionRecord;
  assert.deepEqual(record.snapshots.map((s) => s.ownerVersion), [4, 3]);
  assert.equal(snapshot(await repo.read(second.documentId)).ownerVersion, 1);
});
test("saved local identities can be discovered after reopening without a separate draft pointer or automatic selection", async () => {
  const { repo, storage, first } = await saved(); const second = value(await repo.create(first.package));
  const reopened = new CompanionRepository(storage), entries = value(await reopened.list());
  assert.deepEqual(entries.map((e) => e.documentId), [first.documentId, second.documentId]);
  assert.ok(entries.every((e) => e.status === "ready" && e.ownerVersion === 1));
  (storage.records[0] as CompanionRecord).snapshots[0].packageJson = "{";
  assert.equal(value(await reopened.list())[0].status, "invalid"); assert.equal(value(await reopened.list())[1].status, "ready");
});
test("missing, incompatible and invalid companions have distinct outcomes and are never silently recreated", async () => {
  const { repo, storage } = setup(); assert.deepEqual(value(await repo.read("missing")), { status: "missing", documentId: "missing" });
  rejected(await repo.save("missing", 1, companionExample()), "conflict");
  storage.records.push({ documentId: "bad", version: 2 }); assert.equal(value(await repo.read("bad")).status, "invalid");
  const before = JSON.stringify(storage.records); rejected(await repo.save("bad", 1, companionExample()), "invalid_record"); assert.equal(JSON.stringify(storage.records), before);
});
test("corrupt newest data exposes the previous complete snapshot explicitly and blocks in-place repair", async () => {
  const { repo, storage, first } = await saved(); value(await repo.save(first.documentId, 1, first.package));
  const record = storage.records[0] as CompanionRecord; record.snapshots[0].packageJson = "{";
  const before = JSON.stringify(record), recovered = value(await repo.read(first.documentId)); assert.equal(recovered.status, "invalid");
  if (recovered.status !== "invalid") throw Error("Invalid expected"); assert.equal(recovered.recoverable?.ownerVersion, 1);
  assert.equal(planCompanionRecovery(recovered, null, now).status, "choice");
  rejected(await repo.save(first.documentId, 2, first.package), "invalid_record"); assert.equal(JSON.stringify(storage.records[0]), before);
  const imported = value(await repo.create(recovered.recoverable!.package)); assert.notEqual(imported.documentId, first.documentId); assert.equal(imported.ownerVersion, 1);
});
test("valid JSON corruption is caught by the digest and incomplete package data cannot replace the last good snapshot", async () => {
  const { repo, storage, first } = await saved(); const p = companionExample(); p.scenes[0].revision = 2;
  const before = JSON.stringify(storage.records); rejected(await repo.save(first.documentId, 1, p), "invalid_package"); assert.equal(JSON.stringify(storage.records), before);
  const record = storage.records[0] as CompanionRecord; record.snapshots[0].packageJson = record.snapshots[0].packageJson.replace("Complete local plan", "Altered local plan");
  const r = value(await repo.read(first.documentId)); assert.equal(r.status, "invalid"); if (r.status === "invalid") assert.match(r.messages.join(), /integrity/);
});
test("retained scene revisions and namespace identity cannot be rewritten by a later owner save", async () => {
  const { repo, storage, first } = await saved(), before = JSON.stringify(storage.records), altered = companionExample(); altered.scenes[0].field.length = 25;
  rejected(await repo.save(first.documentId, 1, altered), "invalid_package");
  const foreign = companionExample(); foreign.sceneNamespace = foreign.scenes[0].organizationId = "another-namespace";
  rejected(await repo.save(first.documentId, 1, foreign), "invalid_package"); assert.equal(JSON.stringify(storage.records), before);
  altered.scenes[0].revision = 2; altered.document.session.activities[0].diagrams[0].scene.revision = 2;
  assert.equal(value(await repo.save(first.documentId, 1, altered)).ownerVersion, 2);
  // Revision 1 is still present in the previous coherent snapshot, even though current pins use revision 2.
  rejected(await repo.save(first.documentId, 2, { ...companionExample(), scenes: [{ ...companionExample().scenes[0], field: { length: 30, width: 20 } }] }), "invalid_package");
});
test("interrupted and quota-aborted writes retain the prior whole record, source data and independent plans", async () => {
  const { repo, storage, first } = await saved(); value(await repo.create(first.package)); const before = JSON.stringify(storage.records), p = companionExample(); p.document.session.name = "Unsaved edit";
  for (const fault of ["before", "quota"] as const) { storage.failure = fault; rejected(await repo.save(first.documentId, 1, p), fault === "before" ? "interrupted" : "quota"); assert.equal(JSON.stringify(storage.records), before); }
  assert.equal(p.document.session.name, "Unsaved edit"); assert.equal(snapshot(await repo.read(first.documentId)).ownerVersion, 1);
});
test("lost acknowledgement is indeterminate, never automatically retried, and reopening discovers the committed owner version", async () => {
  const { repo, storage, first } = await saved(); storage.failure = "after";
  rejected(await repo.save(first.documentId, 1, first.package), "unavailable"); assert.equal(storage.writes, 2);
  assert.equal(snapshot(await repo.read(first.documentId)).ownerVersion, 2); rejected(await repo.save(first.documentId, 1, first.package), "conflict"); assert.equal(storage.writes, 2);
});
test("concurrent repository instances from one base produce one winner, one conflict and no lost update", async () => {
  const { repo, storage, first } = await saved(), other = new CompanionRepository(storage, { now: () => now + 100 });
  const a = companionExample(), b = companionExample(); a.document.session.name = "Tab A"; b.document.session.name = "Tab B";
  const results = await Promise.all([repo.save(first.documentId, 1, a), other.save(first.documentId, 1, b)]);
  assert.equal(results.filter((r) => r.ok).length, 1); rejected(results.find((r) => !r.ok)!, "conflict");
  assert.equal(snapshot(await repo.read(first.documentId)).ownerVersion, 2); assert.equal(storage.writes, 2);
});
test("maximum 8 MiB packages round-trip, remain bounded in storage, and over-limit candidates are rejected before writes", async () => {
  const { repo, storage } = setup(), p = maximumCompanionPackage(), original = JSON.stringify(p);
  const first = value(await repo.create(p)); assert.equal(new TextEncoder().encode(first.packageJson).length, 8 * 1024 * 1024);
  assert.equal(snapshot(await new CompanionRepository(storage).read(first.documentId)).packageJson, first.packageJson);
  const over = maximumCompanionPackage(8 * 1024 * 1024 + 1); rejected(await repo.save(first.documentId, 1, over), "invalid_package"); assert.equal(storage.writes, 1); assert.equal(JSON.stringify(p), original);
});
test("local document count accepts 16 and rejects 17 without evicting existing work", async () => {
  const { repo, storage } = setup(); for (let i = 0; i < COMPANION_LIMITS.documents; i++) value(await repo.create(companionExample()));
  const before = JSON.stringify(storage.records); rejected(await repo.create(companionExample()), "quota"); assert.equal(JSON.stringify(storage.records), before);
});
test("64 MiB repository budget accepts the exact maximum and rejects the next UTF-8 byte", async () => {
  const { repo, storage } = setup(), max = maximumCompanionPackage(); value(await repo.create(max));
  const template = structuredClone(storage.records[0]) as CompanionRecord;
  storage.records = Array.from({ length: 7 }, (_, i) => ({ ...structuredClone(template), documentId: `full-${i}` }));
  value(await repo.create(max)); assert.equal(storage.records.length, 8);
  // 6 * 8 MiB + 4 MiB + (4 MiB + 1) leaves 8 MiB - 1: adding a maximum package exceeds by exactly one byte.
  storage.records = Array.from({ length: 6 }, (_, i) => ({ ...structuredClone(template), documentId: `full-${i}` }));
  for (const [i, size] of [4 * 1024 * 1024, 4 * 1024 * 1024 + 1].entries()) {
    const temporary = new MemoryStorage(); value(await new CompanionRepository(temporary, { newId: () => `half-${i}`, now: () => now }).create(maximumCompanionPackage(size)));
    // Pretty output must not inflate the intended quota fixture.
    const record = temporary.records[0] as CompanionRecord;
    const compact = JSON.stringify(maximumCompanionPackage(size)); record.snapshots[0].packageJson = compact;
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(compact)); record.snapshots[0].sha256 = Buffer.from(digest).toString("hex");
    storage.records.push(record);
  }
  assert.equal(storage.records.reduce<number>((sum, r) => sum + (r as CompanionRecord).snapshots.reduce((n, s) => n + new TextEncoder().encode(s.packageJson).length, 0), 0) + 8 * 1024 * 1024, COMPANION_LIMITS.bytes + 1);
  const before = JSON.stringify(storage.records); rejected(await repo.create(max), "quota"); assert.equal(JSON.stringify(storage.records), before);
});
test("legacy-only recovery and incomplete newer text remain separate without writing any legacy draft key", async () => {
  const { repo, first } = await saved(), r = value(await repo.read(first.documentId));
  const draft = encodeDraft(first.package.document, now); const absent = value(await repo.read("missing"));
  assert.equal(planCompanionRecovery(absent, draft, now).status, "legacy-only"); assert.equal(planCompanionRecovery(absent, null, now).status, "empty");
  assert.equal(planCompanionRecovery(r, draft, now).status, "complete");
  const incomplete = structuredClone(first.package.document); incomplete.session.activities[0].name = "";
  const newer = encodeDraft(incomplete, now + 1000), plan = planCompanionRecovery(r, newer, now + 1000);
  assert.equal(plan.status, "choice"); assert.equal(plan.options.length, 2); assert.match(plan.messages.join(), /newer text/);
  const option = plan.options.find((o) => o.kind === "reference-only-draft"); assert.equal(option?.kind, "reference-only-draft"); if (option?.kind === "reference-only-draft") assert.equal(option.draftJson, newer);
  assert.equal(encodeDraft(first.package.document, now), draft); assert.equal(DESIGNER_DRAFT_KEY, "football-formation.session-designer.v1");
});
test("differing older drafts require choice, malformed drafts stay untouched, and identical key order variants need no choice", async () => {
  const { repo, first } = await saved(), r = value(await repo.read(first.documentId)), p = structuredClone(first.package.document); p.session.name = "Older difference";
  assert.equal(planCompanionRecovery(r, encodeDraft(p, now - 1000), now).status, "choice");
  assert.equal(planCompanionRecovery(r, "{", now).messages.length, 1);
  assert.equal(planCompanionRecovery(value(await repo.read("missing")), "{", now).status, "blocked");
  const document = Object.fromEntries(Object.entries(first.package.document).reverse());
  assert.equal(planCompanionRecovery(r, JSON.stringify({ version: 1, savedAt: new Date(now).toISOString(), document }), now).status, "complete");
});
test("owner bounds, malformed identities, allocator collisions, clock rollback and denied storage cannot overwrite a plan", async () => {
  const { repo, storage, first } = await saved(), before = JSON.stringify(storage.records);
  for (const version of [0, -1, 0.5, NaN, Number.MAX_SAFE_INTEGER]) rejected(await repo.save(first.documentId, version, first.package), "invalid_target");
  rejected(await repo.read("bad id"), "invalid_target");
  rejected(await new CompanionRepository(storage, { newId: () => first.documentId }).create(first.package), "conflict");
  rejected(await new CompanionRepository(storage, { now: () => now - 1 }).save(first.documentId, 1, first.package), "invalid_record");
  const denied = new CompanionRepository({ transact: async () => { throw new DOMException("Denied", "SecurityError"); } }); rejected(await denied.read(first.documentId), "unavailable");
  assert.equal(JSON.stringify(storage.records), before);
});
test("unavailable IndexedDB is reported honestly without creating a legacy or companion fallback", async () => {
  const repo = new CompanionRepository(indexedDbCompanionStorage({ open: () => { throw new DOMException("Denied", "SecurityError"); } } as unknown as IDBFactory));
  rejected(await repo.create(companionExample()), "unavailable"); rejected(await repo.read("local-1"), "unavailable");
});
