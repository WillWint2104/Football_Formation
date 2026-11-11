import assert from "node:assert/strict";
import test from "node:test";
import { coachingPresentationScene } from "../fixtures/coaching-presentation";
import { coachingDrawingOptions } from "../../lib/tactical/coaching-view";
import { drawScene, serializeDrawing, type SvgNode } from "../../lib/tactical/drawing";
import { editorExamples } from "../../lib/tactical/editor-examples";
import { screenToWorld } from "../../lib/tactical/viewport";

function flatten(nodes: SvgNode[]): SvgNode[] {
  return nodes.flatMap(node => [node, ...flatten(node.children ?? [])]);
}

test("compact mode projects directly into a Calendar thumbnail and retains exact scene identity and geometry", () => {
  const scene = coachingPresentationScene(6, 12);
  const before = structuredClone(scene);
  const options = { ...coachingDrawingOptions(scene, 1), width: 150, height: 82 };
  assert.throws(() => drawScene(scene, options), /between 120 and/);
  const drawing = drawScene(scene, { ...options, screen: { mode: "compact", id: "calendar" } });
  assert.equal(drawing.view.width, 150);
  assert.equal(drawing.view.height, 82);
  assert.equal(drawing.sceneId, scene.id);
  assert.equal(drawing.revision, scene.revision);
  assert.equal(drawing.seconds, 1);
  assert.equal(drawing.gridSpacing, null);
  assert.equal(drawing.clippedEntities, 0);
  assert.ok(drawing.screen!.numberSize >= 10);
  for (const anchor of drawing.anchors) {
    const restored = screenToWorld(anchor.screen, drawing.view);
    assert.ok(Math.abs(restored.x - anchor.world.x) < 1e-8 && Math.abs(restored.y - anchor.world.y) < 1e-8);
  }
  assert.deepEqual(scene, before);
  assert.throws(() => drawScene(scene, { ...options, height: 63, screen: { mode: "compact", id: "small" } }), /between 64 and/);
});

test("dense compact diagrams suppress number text while expanded inspection keeps every player and identity", () => {
  const scene = coachingPresentationScene(0, 12);
  const players = scene.entities.filter(entity => entity.kind === "player");
  for (const [i, player] of players.entries()) player.position = { x: 4 + i * .5, y: 6 };
  const options = coachingDrawingOptions(scene, 0);
  const compact = drawScene(scene, { ...options, width: 150, height: 82, screen: { mode: "compact", id: "compact" } });
  const expanded = drawScene(scene, { ...options, width: 900, height: 600, screen: { mode: "expanded", id: "expanded" } });
  assert.equal(compact.screen?.numbersHidden, true);
  assert.equal(compact.screen?.crowded, true);
  assert.equal(flatten(compact.nodes).filter(n => "data-player-number" in n.attrs).length, 0);
  assert.equal(flatten(expanded.nodes).filter(n => "data-player-number" in n.attrs).length, players.length);
  assert.deepEqual(compact.anchors.map(a => a.world), expanded.anchors.map(a => a.world));
  assert.ok(flatten(expanded.nodes).some(n => n.tag === "title" && n.text?.includes("#6")));
});

test("screen treatments keep full-pitch goals and use isolated local SVG definitions", () => {
  const scene = editorExamples.find(example => example.id === "full")!.scene;
  const options = { ...coachingDrawingOptions(scene, 0), width: 800, height: 440 };
  const first = drawScene(scene, { ...options, screen: { mode: "standard", id: "first" } });
  const second = drawScene(scene, { ...options, screen: { mode: "expanded", id: "second" } });
  assert.ok(first.view.target.minX <= 0 && first.view.target.maxX >= scene.field.length);
  assert.equal(first.clippedEntities, 0);
  assert.ok(flatten(first.nodes).some(n => n.attrs["data-equipment-detail"] === "net"));
  const svg = serializeDrawing(first);
  assert.match(svg, /patternUnits="userSpaceOnUse"/);
  assert.match(svg, /url\(#first-disc\)/);
  assert.doesNotMatch(serializeDrawing(second), /first-disc/);
  assert.doesNotMatch(serializeDrawing(drawScene(scene, options)), /<defs>|data-player-disc/);
});
