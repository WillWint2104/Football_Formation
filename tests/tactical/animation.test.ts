import assert from "node:assert/strict";
import test from "node:test";
import { animationExamples } from "../../lib/tactical/animation-examples";
import { annotationWindow, appendStage, changeStageOrder, duplicateStage, movePose, removeKeyframe, retimeKeyframe, setPose, setStageVisible, stageRanges, stageStart, updateStage } from "../../lib/tactical/animation";
import { evaluateScene, prepareScene, sceneDuration } from "../../lib/tactical/evaluate";
import { addAnnotation, recordEdit, removeObjects, travel } from "../../lib/tactical/authoring";
import { drawScene, serializeDrawing } from "../../lib/tactical/drawing";
import { editorExamples } from "../../lib/tactical/editor-examples";
import { saveDiagram, resolveDiagramTarget, type DiagramTarget } from "../../lib/tactical/persistence";
import { coachingSample } from "../../lib/coaching/sample";
import { domainBundleSchema } from "../../lib/domain/validation";
import sharp from "sharp";

for (const example of animationExamples) test(`animation acceptance: ${example.title} is deterministic, connected and immutable at every stage boundary`, () => {
  const scene = example.scene, before = structuredClone(scene); assert.deepEqual(prepareScene(scene), scene);
  for (const range of stageRanges(scene)) {
    const baseline = stageStart(scene, range.stage.id);
    for (const track of range.stage.tracks) if (track.kind !== "annotation") assert.deepEqual(track.keyframes[0].position, baseline.find((e) => e.id === track.entityId)!.position);
    for (const time of [range.start, range.start + range.stage.durationSeconds / 2, range.end - .000001, range.end]) {
      const first = evaluateScene(scene, time); evaluateScene(scene, 0); evaluateScene(scene, sceneDuration(scene)); assert.deepEqual(evaluateScene(scene, time), first);
      const drawing = serializeDrawing(drawScene(scene, { width: 1000, height: 600, fit: "all", seconds: time, paths: "active" }));
      for (const entity of first.entities) if (entity.kind === "player") assert.ok(drawing.includes(`>${entity.number}</text>`));
    }
    if (range.index) {
      const left = evaluateScene(scene, range.start - 1e-8), right = evaluateScene(scene, range.start);
      assert.equal(right.stage?.id, range.stage.id);
      left.entities.forEach((entity, i) => assert.ok(Math.hypot(entity.position.x - right.entities[i].position.x, entity.position.y - right.entities[i].position.y) < .000001));
    }
  }
  assert.deepEqual(scene, before);
});
test("duration editing scales local motion/annotation windows without changing endpoints or later stage durations", () => {
  const original = animationExamples[0].scene, stage = original.stages[0];
  const scene = annotationWindow(addAnnotation(original, { kind: "note", position: { x: 5, y: 5 }, text: "Receive" }, () => "retimed-note", stage.id), stage.id, "retimed-note", .5, 2), next = updateStage(scene, stage.id, "Slower reception", 6);
  assert.equal(next.stages[1].durationSeconds, scene.stages[1].durationSeconds);
  assert.deepEqual(evaluateScene(next, 2).entities, evaluateScene(scene, 1).entities);
  assert.deepEqual(evaluateScene(next, 6).entities, evaluateScene(scene, 3).entities);
  const note = next.stages[0].tracks.find((t) => t.id === "retimed-note")!; assert.equal(note.kind === "annotation" && note.visibleFrom, 1); assert.equal(note.kind === "annotation" && note.visibleUntil, 4);
  assert.throws(() => updateStage(scene, stage.id, "Invalid", NaN)); assert.throws(() => updateStage(scene, stage.id, "Invalid", 0));
});
test("numbered player markers stay above notes even when a dense viewport cannot avoid a label collision", async () => {
  const source = structuredClone(editorExamples[3].scene); source.entities = [{ id: "player", kind: "player", team: "a", number: 1, positionLabel: null, color: "#123abc", position: { x: 6, y: 6 }, headingDegrees: 0 }]; source.stages = [];
  const scene = addAnnotation(source, { kind: "note", position: { x: 6, y: 6 }, text: "A deliberately crowded annotation" }, () => "note");
  const drawing = drawScene(scene, { width: 120, height: 120, fit: "context" }), svg = serializeDrawing(drawing);
  assert.ok(drawing.labelCollisions > 0);
  const raster = await sharp(Buffer.from(svg)).removeAlpha().raw().toBuffer({ resolveWithObject: true }), offset = (60 * raster.info.width + 70) * raster.info.channels;
  assert.deepEqual([...raster.data.subarray(offset, offset + 3)], [0x12, 0x3a, 0xbc]);
});
test("stage copies have independent IDs and edits/reorder/deletion reconnect without changing source snapshots", () => {
  const scene = animationExamples[1].scene, before = structuredClone(scene); let id = 0;
  const copied = duplicateStage(scene, scene.stages[0].id, () => `copy-${++id}`); assert.equal(copied.stages.length, 3);
  assert.ok(copied.stages[1].tracks.every((t) => !scene.stages[0].tracks.some((s) => s.id === t.id)));
  const moved = changeStageOrder(copied, copied.stages[1].id, "later"), deleted = changeStageOrder(moved, copied.stages[1].id, "delete");
  assert.equal(deleted.stages.length, 2); assert.deepEqual(scene, before);
  for (const range of stageRanges(moved)) for (const track of range.stage.tracks) if (track.kind !== "annotation") assert.deepEqual(track.keyframes[0].position, stageStart(moved, range.stage.id).find((e) => e.id === track.entityId)!.position);
  assert.equal(appendStage(scene).stages.at(-1)!.tracks.length, 0);
});
test("pose edits record exact time, interpolate from carried start and update shared boundaries without jumps", () => {
  const source = animationExamples[0].scene, stage = source.stages[0], next = setPose(source, stage.id, "a3", 2, { x: 4, y: 6 }, "rotation");
  const baseline = source.entities.find((e) => e.id === "a3")!.position, mid = evaluateScene(next, 1).entities.find((e) => e.id === "a3")!.position;
  assert.deepEqual(mid, { x: (baseline.x + 4) / 2, y: (baseline.y + 6) / 2 });
  const boundary = setPose(next, next.stages[1].id, "a3", 0, { x: 7, y: 8 });
  assert.deepEqual(evaluateScene(boundary, stage.durationSeconds).entities.find((e) => e.id === "a3")!.position, { x: 7, y: 8 });
  assert.throws(() => setPose(source, stage.id, "ball", 1, { x: 1, y: 2 }, "press"));
  assert.throws(() => setPose(source, stage.id, "a3", Infinity, { x: 1, y: 2 }));
  assert.throws(() => setPose(source, stage.id, "a3", 1, { x: 10001, y: 2 }));
});
test("keyframe retiming, collision rejection and removal preserve valid held positions", () => {
  const source = animationExamples[0].scene, stage = source.stages[0], next = retimeKeyframe(source, stage.id, "ball", 2, 2.5);
  assert.deepEqual(evaluateScene(next, 2.5).entities.find((e) => e.id === "ball")!.position, evaluateScene(source, 2).entities.find((e) => e.id === "ball")!.position);
  const removed = removeKeyframe(next, stage.id, "ball", 2.5); assert.ok(!removed.stages[0].tracks.some((t) => t.kind === "ball"));
  assert.throws(() => removeKeyframe(source, stage.id, "ball", 0));
  const extra = setPose(source, stage.id, "ball", 1, { x: 1, y: 7 }); assert.throws(() => retimeKeyframe(extra, stage.id, "ball", 1, 2), /already/);
});
test("stage visibility hides markers and their routes but retains movement, later visibility and static compatibility", () => {
  const source = animationExamples[0].scene, stage = source.stages[0], hidden = setStageVisible(source, stage.id, ["ball"], false);
  assert.deepEqual(evaluateScene(hidden, 2).entities, evaluateScene(source, 2).entities);
  const svg = serializeDrawing(drawScene(hidden, { width: 1000, height: 600, fit: "all", seconds: 1 })); assert.ok(!svg.includes('data-entity-id="ball"'));
  assert.ok(serializeDrawing(drawScene(hidden, { width: 1000, height: 600, fit: "all", seconds: 3 })).includes('data-entity-id="ball"'));
  assert.throws(() => setStageVisible(source, stage.id, ["missing"], false));
  const removed = removeObjects(hidden, ["entity:ball"]); assert.ok(!removed.stages[0].hiddenEntityIds?.includes("ball"));
  const old = editorExamples[3].scene; assert.deepEqual(prepareScene(old), old); assert.ok(!old.stages[0].hiddenEntityIds);
});
test("timed annotations are authored and transformed in the selected stage with half-open visibility", () => {
  const source = animationExamples[0].scene, stage = source.stages[1];
  const next = addAnnotation(source, { kind: "note", position: { x: 5, y: 5 }, text: "Release now" }, () => "timed-note", stage.id);
  const timed = annotationWindow(next, stage.id, "timed-note", 1, 2);
  assert.ok(!evaluateScene(timed, 3.99).annotations.some((t) => t.id === "timed-note"));
  assert.ok(evaluateScene(timed, 4).annotations.some((t) => t.id === "timed-note")); assert.ok(!evaluateScene(timed, 5).annotations.some((t) => t.id === "timed-note"));
  assert.throws(() => annotationWindow(next, stage.id, "timed-note", 2, 1));
});
test("group pose movement is one immutable undo/redo transaction", () => {
  const source = animationExamples[1].scene, next = movePose(source, source.stages[0].id, 2, ["entity:a1", "entity:a3"], 2, -1);
  const old = evaluateScene(source, 2), moved = evaluateScene(next, 2);
  for (const id of ["a1", "a3"]) { const a = old.entities.find((e) => e.id === id)!, b = moved.entities.find((e) => e.id === id)!; assert.deepEqual(b.position, { x: a.position.x + 2, y: a.position.y - 1 }); }
  const history = recordEdit({ past: [], present: next, future: [] }, next, source); assert.equal(history.past.length, 1); assert.deepEqual(travel(history, "undo").present, source); assert.deepEqual(travel(travel(history, "undo"), "redo").present, next);
});
test("animated saves and JSON reopen keep exact historical scene/owner pins and unrelated templates intact", () => {
  const bundle = coachingSample(), target: DiagramTarget = { kind: "session", id: "sample-3", revision: 1, activity: "activity-1", event: "sample-4", booking: 1, diagram: null };
  const source = { ...structuredClone(animationExamples[2].scene), organizationId: bundle.organizationId, id: "saved-animation" };
  const first = saveDiagram(bundle, target, source), next = setStageVisible(first.scene, first.scene.stages[0].id, ["ball"], false), second = saveDiagram(first.bundle, first.target, next);
  const reopened = domainBundleSchema.parse(JSON.parse(JSON.stringify(second.bundle)));
  assert.deepEqual(resolveDiagramTarget(reopened, first.target).scene, first.scene); assert.equal(resolveDiagramTarget(reopened, first.target).readOnly, true);
  assert.deepEqual(resolveDiagramTarget(reopened, second.target).scene, second.scene); assert.deepEqual(reopened.templates, bundle.templates); assert.deepEqual(reopened.exercises, bundle.exercises);
  assert.throws(() => saveDiagram(reopened, first.target, first.scene), /current saved owner/);
});
