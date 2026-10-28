import assert from "node:assert/strict";
import test from "node:test";
import { actionFrame } from "../../lib/tactical/framing";
import { animationExamples } from "../../lib/tactical/animation-examples";
import { evaluateScene } from "../../lib/tactical/evaluate";
import { stageRanges, setStageVisible } from "../../lib/tactical/animation";
import { addAnnotation } from "../../lib/tactical/authoring";
import { fitViewport, worldToScreen, screenToWorld } from "../../lib/tactical/viewport";
import { drawScene } from "../../lib/tactical/drawing";

for (const example of animationExamples) test(`stage framing: ${example.id} preserves geometry and fits complete actions in every orientation`, () => {
  const scene = example.scene, before = structuredClone(scene);
  for (const { stage, start, end } of stageRanges(scene)) {
    const frame = actionFrame(scene, stage.id)!;
    for (const [width, height] of [[790, 230], [1320, 542]]) for (const rotation of [0, 90, 180, 270] as const) {
      const options = { width, height, rotation, fit: "custom" as const, customArea: frame.area, padding: 32 };
      const view = fitViewport(scene, options);
      for (const point of frame.points) {
        const screen = worldToScreen(point, view);
        assert.ok(screen.x >= 31.99 && screen.x <= width - 31.99 && screen.y >= 31.99 && screen.y <= height - 31.99);
        const roundTrip = screenToWorld(screen, view); assert.ok(Math.hypot(point.x - roundTrip.x, point.y - roundTrip.y) < 1e-8);
      }
      for (const seconds of [start, (start + end) / 2, end - 1e-6]) {
        const drawing = drawScene(scene, { ...options, seconds }); assert.deepEqual(drawing.view, view);
        for (const id of frame.entityIds) {
          const anchor = drawing.anchors.find((a) => a.id === id)!; assert.ok(anchor.screen.x >= 31.99 && anchor.screen.x <= width - 31.99 && anchor.screen.y >= 31.99 && anchor.screen.y <= height - 31.99);
          assert.deepEqual(anchor.world, evaluateScene(scene, seconds).entities.find((e) => e.id === id)!.position);
        }
      }
    }
  }
  assert.deepEqual(scene, before);
});
test("action magnifies corner, passing, full-pitch and final-third movement relative to the original context", () => {
  for (const id of ["corner", "passing", "full", "third"]) {
    const scene = animationExamples.find((e) => e.id === `animation-${id}`)!.scene;
    const area = actionFrame(scene, scene.stages[0].id)!.area;
    const options = { width: 790, height: 230 };
    const after = Math.max(...([0, 270] as const).map((rotation) => fitViewport(scene, { ...options, rotation, padding: 32, fit: "custom", customArea: area }).scale));
    assert.ok(after > fitViewport(scene, { ...options, rotation: id === "corner" || id === "third" ? 270 : 0, padding: 24, fit: "context" }).scale, id);
  }
});
test("detail targets selected paths or complete areas; hidden, stale and empty selections are safe", () => {
  const scene = animationExamples.find((e) => e.id === "animation-corner")!.scene, stage = scene.stages[1];
  const action = actionFrame(scene, stage.id)!, detail = actionFrame(scene, stage.id, ["entity:a9", "entity:a8"])!;
  assert.ok(detail.area.width < action.area.width / 2); assert.deepEqual(new Set(detail.entityIds), new Set(["a9", "a8"]));
  const hidden = setStageVisible(scene, stage.id, ["a9"], false);
  assert.equal(actionFrame(hidden, stage.id, ["entity:a9"]), null);
  assert.equal(actionFrame(scene, "deleted-stage"), null); assert.equal(actionFrame(scene, stage.id, []), null); assert.equal(actionFrame(scene, stage.id, ["entity:deleted"]), null);
  const withArea = addAnnotation(scene, { kind: "area", area: { origin: { x: 90, y: 28 }, length: 8, width: 9 }, label: "Near-post zone" }, () => "focus-zone", stage.id);
  const zone = actionFrame(withArea, stage.id, ["annotation:focus-zone"])!;
  assert.ok(zone.area.origin.x <= 90 && zone.area.origin.y <= 28 && zone.area.length >= 8 && zone.area.width >= 9);
});
test("a held stage without any visible action falls back to context; bounded edge coordinates stay valid", () => {
  const scene = structuredClone(animationExamples[0].scene); scene.stages[0].tracks = []; scene.stages[0].hiddenEntityIds = scene.entities.map((e) => e.id);
  assert.equal(actionFrame(scene, scene.stages[0].id)!.area.length, scene.field.length);
  scene.stages[0].hiddenEntityIds = []; scene.entities.find((e) => e.id === "ball")!.position = { x: 10_000, y: -10_000 };
  const frame = actionFrame(scene, scene.stages[0].id, ["entity:ball"])!;
  assert.doesNotThrow(() => fitViewport(scene, { width: 120, height: 120, fit: "custom", customArea: frame.area, padding: 32 }));
});
test("close-up ghost labels stay inside the viewport and offscreen ghosts do not leave floating labels", () => {
  const scene = animationExamples[0].scene, area = { origin: { x: 0, y: 0 }, length: 4, width: 4 };
  const drawing = drawScene(scene, { width: 120, height: 120, fit: "custom", customArea: area, padding: 32, ghosts: [{ id: "end", position: { x: 4, y: 4 }, label: "End" }, { id: "offscreen", position: { x: 100, y: 100 }, label: "Start" }] });
  const ghost = drawing.nodes.find((n) => n.attrs["data-ghost-id"] === "end")!, label = ghost.children!.find((n) => n.tag === "text")!;
  assert.ok(Number(label.attrs.x) >= 4 && Number(label.attrs.x) + 18 <= 116 && Number(label.attrs.y) >= 12 && Number(label.attrs.y) <= 116);
  assert.ok(!drawing.nodes.some((n) => n.attrs["data-ghost-id"] === "offscreen"));
});
