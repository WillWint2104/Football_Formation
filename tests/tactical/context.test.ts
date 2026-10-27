import test from "node:test";
import assert from "node:assert/strict";
import { tacticalSceneSchema } from "../../lib/domain/tactical-scene";
import { tacticalExamples } from "../../lib/tactical/examples";
import { editorExamples, translateScene } from "../../lib/tactical/editor-examples";
import { contextArea, deliveryLocation } from "../../lib/tactical/context";
import { fitViewport, worldToScreen, screenToWorld, screenRectangle } from "../../lib/tactical/viewport";
import { drawScene, serializeDrawing } from "../../lib/tactical/drawing";

test("legacy records remain byte-equivalent without default-injected context or colors", () => {
  for (const e of tacticalExamples) assert.equal(JSON.stringify(tacticalSceneSchema.parse(e.scene)), JSON.stringify(e.scene));
  assert.equal(tacticalExamples[0].scene.context, undefined);
});
test("nine context fixtures use the unchanged versioned scene envelope and correct neutral modes", () => {
  assert.equal(editorExamples.length, 9);
  editorExamples.forEach((e) => assert.equal(tacticalSceneSchema.parse(e.scene).schemaVersion, "1.0"));
  const s = editorExamples[3].scene, svg = serializeDrawing(drawScene(s, { width: 900, height: 600, fit: "context", gridMetres: 1 }));
  assert.ok(!svg.includes("centre-circle")); assert.ok(!svg.includes("penalty-area")); assert.ok(!svg.includes('data-field-marking="goal"')); assert.ok(svg.includes("training-boundary"));
});
test("thirds and halves derive from physical attack direction without moving entities", () => {
  const s = structuredClone(editorExamples[1].scene), before = structuredClone(s.entities);
  assert.deepEqual(contextArea(s), { origin: { x: 70, y: 0 }, length: 35, width: 68 });
  if (s.context?.kind === "pitch") s.context.attack = "negative-x";
  assert.deepEqual(contextArea(s).origin, { x: 0, y: 0 });
  if (s.context?.kind === "pitch") s.context.region = "defensive-third";
  assert.equal(contextArea(s).origin.x, 70);
  if (s.context?.kind === "pitch") s.context.region = "attacking-half";
  assert.equal(contextArea(s).length, 52.5); assert.deepEqual(s.entities, before);
});
test("corner side and defending phase produce geometrically distinct deliveries", () => {
  const left = structuredClone(editorExamples[4].scene), right = editorExamples[5].scene;
  assert.deepEqual(deliveryLocation(left), { x: 105, y: 0 }); assert.deepEqual(deliveryLocation(right), { x: 105, y: 68 });
  if (left.context?.kind === "pitch" && left.context.setPiece) left.context.setPiece.phase = "defending";
  assert.deepEqual(deliveryLocation(left), { x: 0, y: 68 });
  const edge = deliveryLocation(editorExamples[6].scene); assert.equal(105 - edge.x, 22); assert.ok(edge.x < 105 - 16.5);
});
test("all camera quarter turns preserve distances, world geometry and inverse picking", () => {
  const s = editorExamples[1].scene, before = JSON.stringify(s);
  for (const rotation of [0, 90, 180, 270] as const) for (const [width, height] of [[900, 600], [1920, 1080]]) {
    const view = fitViewport(s, { width, height, fit: "context", rotation, camera: { center: { x: 80, y: 34 }, zoom: 1.5 } });
    const a = { x: 83.2, y: 25.7 }, b = { x: 86.2, y: 29.7 }, sa = worldToScreen(a, view), sb = worldToScreen(b, view), restored = screenToWorld(sa, view);
    assert.ok(Math.abs(restored.x - a.x) < 1e-9 && Math.abs(restored.y - a.y) < 1e-9);
    assert.ok(Math.abs(Math.hypot(sb.x - sa.x, sb.y - sa.y) / view.scale - 5) < 1e-9);
    const rect = screenRectangle({ x: 70, y: 0 }, 35, 68, view); assert.ok(rect.width > 0 && rect.height > 0);
  }
  assert.equal(JSON.stringify(s), before);
});
test("explicit translation covers every stage, zone and note and is reversible", () => {
  const s = tacticalExamples[0].scene, moved = translateScene(s, -20, -15), restored = translateScene(moved, 20, 15);
  assert.deepEqual(restored, s); assert.deepEqual(s.entities[0].position, { x: 21, y: 25 });
});
test("context and custom color validation rejects malformed locations without invalidating history", () => {
  const s = structuredClone(editorExamples[0].scene); const p = s.entities.find((e) => e.kind === "player")!;
  if (p.kind === "player") p.color = "#1a2B3c"; assert.ok(tacticalSceneSchema.safeParse(s).success);
  if (p.kind === "player") p.color = "url(https://bad)"; assert.ok(!tacticalSceneSchema.safeParse(s).success);
  assert.ok(!tacticalSceneSchema.safeParse({ ...s, context: { kind: "pitch", region: "custom", attack: "positive-x" } }).success);
  assert.ok(!tacticalSceneSchema.safeParse({ ...editorExamples[0].scene, schemaVersion: "2.0" }).success);
});
