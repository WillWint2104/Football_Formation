import { test } from "node:test";
import assert from "node:assert/strict";
import { attachmentCandidate, previewAttachment, sameDocument } from "../../lib/designer/attachments";
import { parseSessionPackageJson, serializeSessionPackageJson } from "../../lib/designer/package";
import { companionExample } from "../fixtures/companion";

test("first attachment copies only the exact selected revision, preserving namespace and both inputs", () => {
  const source = companionExample(), draft = structuredClone(source.document); draft.session.activities[0].diagrams = [];
  source.scenes.push({ ...structuredClone(source.scenes[0]), revision: 2 }); const before = structuredClone({ source, draft });
  const next = attachmentCandidate(draft, null, source, { activityId: "activity-1", index: null, pin: { scene: { id: "movement", revision: 1 }, representativeSeconds: 0.75 } });
  assert.equal(next.sceneNamespace, "file-namespace"); assert.deepEqual(next.scenes.map((s) => s.revision), [1]);
  assert.equal(next.document.session.activities[0].diagrams[0].representativeSeconds, 0.75); assert.deepEqual({ source, draft }, before);
});
test("multiple pins support exact replacement/removal without affecting other activities or scene revisions", () => {
  const p = companionExample(); p.document.session.activities.push({ ...structuredClone(p.document.session.activities[0]), id: "other" });
  let n = attachmentCandidate(p.document, p, p, { activityId: "activity-1", index: null, pin: { scene: { id: "movement", revision: 1 }, representativeSeconds: 2 } });
  assert.equal(n.document.session.activities[0].diagrams.length, 2);
  n = attachmentCandidate(n.document, n, p, { activityId: "activity-1", index: 0, pin: { scene: { id: "movement", revision: 1 }, representativeSeconds: 0 } });
  n = attachmentCandidate(n.document, n, undefined, { activityId: "activity-1", index: 1, pin: null });
  assert.equal(n.document.session.activities[0].diagrams[0].representativeSeconds, 0);
  assert.deepEqual(n.document.session.activities[1], p.document.session.activities[1]); assert.deepEqual(n.scenes, p.scenes);
});
test("unknown activity and stale attachment indices fail instead of editing another activity", () => {
  const p = companionExample();
  assert.throws(() => attachmentCandidate(p.document, p, undefined, { activityId: "missing", index: 0, pin: null }), /no longer exists/);
  assert.throws(() => attachmentCandidate(p.document, p, undefined, { activityId: "activity-1", index: 2, pin: null }), /no longer exists/);
});
test("namespace, missing revision, immutable revision conflicts and out-of-range time are never substituted", () => {
  const p = companionExample(), pin = p.document.session.activities[0].diagrams[0], foreign = structuredClone(p);
  foreign.sceneNamespace = foreign.scenes[0].organizationId = "other";
  assert.throws(() => attachmentCandidate(p.document, p, foreign, { activityId: "activity-1", index: 0, pin }), /namespace/);
  const conflict = structuredClone(p); conflict.scenes[0].field.length = 30;
  assert.throws(() => attachmentCandidate(p.document, p, conflict, { activityId: "activity-1", index: 0, pin }), /immutable/);
  for (const invalid of [{ ...pin, scene: { id: "movement", revision: 9 } }, { ...pin, representativeSeconds: 3 }, { ...pin, representativeSeconds: -1 }, { ...pin, representativeSeconds: NaN }])
    assert.equal(previewAttachment(p, "activity-1", invalid).ok, false);
});
test("reference-only drafts cannot silently adopt a namespace from a new source", () => {
  const p = companionExample(); assert.throws(() => attachmentCandidate(p.document, null, p), /reference-only/);
});
test("unfinished coaching text remains previewable but cannot enter a complete saved snapshot", () => {
  const p = companionExample(), draft = structuredClone(p.document); draft.session.activities[0].name = "";
  assert.equal(previewAttachment(p, "activity-1", draft.session.activities[0].diagrams[0]).ok, true);
  assert.throws(() => attachmentCandidate(draft, p)); assert.equal(draft.session.activities[0].name, "");
});
test("the existing per-activity 20-diagram limit and B1 package limits remain authoritative", () => {
  const p = companionExample(); p.document.session.activities[0].diagrams = Array.from({ length: 20 }, () => structuredClone(p.document.session.activities[0].diagrams[0]));
  assert.throws(() => attachmentCandidate(p.document, p, p, { activityId: "activity-1", index: null, pin: p.document.session.activities[0].diagrams[0] }));
});
test("complete round trip retains exact pins; comparison ignores object keys but respects activity and pin order", () => {
  const p = companionExample(), text = serializeSessionPackageJson(attachmentCandidate(p.document, p)); assert.equal(text.ok, true);
  if (!text.ok) return;
  const back = parseSessionPackageJson(text.value); assert.equal(back.ok, true); if (back.ok) assert.deepEqual(back.value, p);
  assert.equal(sameDocument({ b: 1, a: [1, 2] }, { a: [1, 2], b: 1 }), true);
  assert.equal(sameDocument([1, 2], [2, 1]), false);
});
