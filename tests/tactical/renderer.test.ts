import test from "node:test";
import assert from "node:assert/strict";
import { tacticalExamples } from "../../lib/tactical/examples";
import { prepareScene, evaluateScene, positionAt, sceneDuration } from "../../lib/tactical/evaluate";
import { fitViewport, worldToScreen, screenToWorld, contentBounds, metricGrid, clipSegment, equipmentFootprint, areaBounds } from "../../lib/tactical/viewport";
import { drawScene, serializeDrawing } from "../../lib/tactical/drawing";
const example = tacticalExamples[0], scene = example.scene;
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} differs from ${b}`);

test("all five representative fixtures validate against the existing saved-scene contract", () => {
  assert.equal(tacticalExamples.length, 5);
  tacticalExamples.forEach((e) => assert.deepEqual(prepareScene(e.scene), e.scene));
  assert.equal(tacticalExamples[4].scene.entities.filter((e) => e.kind === "player").length, 22);
  const types = new Set(tacticalExamples.flatMap((e) => e.scene.entities.flatMap((n) => n.kind === "equipment" ? [n.equipment] : [])));
  assert.equal(types.size, 6);
});
test("projection round trips preserve negative and fractional metre coordinates at desktop and laptop sizes", () => {
  for (const [width, height] of [[1920, 1080], [1366, 768], [120, 120]]) {
    const view = fitViewport(scene, { width, height, fit: "exercise", exerciseArea: example.area });
    for (const point of [{ x: -2.5, y: 0 }, { x: 35.6, y: 33.2 }, { x: 105, y: 68 }]) {
      const roundTrip = screenToWorld(worldToScreen(point, view), view); close(roundTrip.x, point.x); close(roundTrip.y, point.y);
    }
    const a = worldToScreen({ x: 0, y: 0 }, view), b = worldToScreen({ x: 10, y: 10 }, view); close(b.x - a.x, b.y - a.y);
  }
});
test("exercise framing makes a small drill legible without distorting pitch proportions", () => {
  const fit = (mode: "pitch" | "exercise") => fitViewport(scene, { width: 900, height: 600, fit: mode, exerciseArea: example.area });
  assert.ok(fit("exercise").scale > fit("pitch").scale * 4);
  close(fit("exercise").target.maxX - fit("exercise").target.minX, 12);
});
test("full, half and custom framing never rewrite the saved scene or revision", () => {
  const before = structuredClone(scene);
  for (const fit of ["pitch", "all", "attacking-half", "defensive-half", "custom"] as const) {
    const view = fitViewport(scene, { width: 900, height: 600, fit, customArea: { origin: { x: -2, y: 8 }, length: 30, width: 20 } });
    assert.ok(Number.isFinite(view.scale));
    if (fit === "attacking-half") assert.equal(view.target.minX, 52.5);
    if (fit === "defensive-half") assert.equal(view.target.maxX, 52.5);
  }
  assert.deepEqual(scene, before);
});
test("changing field dimensions preserves all entities, tracks and exact revision", () => {
  const changed = { ...structuredClone(scene), field: { length: 70, width: 50 } };
  const d = drawScene(changed, { width: 800, height: 500, fit: "pitch" });
  assert.deepEqual(changed.entities, scene.entities); assert.deepEqual(changed.stages, scene.stages); assert.equal(d.revision, scene.revision);
});
test("Fit All includes future paths, notes, custom areas and physical goal footprints", () => {
  const keeper = tacticalExamples[1], bounds = contentBounds(keeper.scene, keeper.area);
  assert.ok(bounds.minX <= -3); assert.ok(bounds.maxY >= 50);
  const goal = keeper.scene.entities.find((e) => e.id === "goal")!;
  assert.equal(Math.min(...equipmentFootprint(goal).map((q) => q.x)), -2);
  const view = fitViewport(scene, { width: 900, height: 600, fit: "all" });
  assert.ok(view.target.maxY >= 28, "future stage note must remain in stable framing");
});
test("operational bounds reject tiny/nonfinite framing, excessive coordinates, time and invalid cameras", () => {
  const options = { width: 900, height: 600, fit: "pitch" as const };
  assert.throws(() => fitViewport(scene, { ...options, width: Infinity }));
  assert.throws(() => areaBounds({ origin: { x: 0, y: 0 }, length: 1e-200, width: 12 }));
  assert.throws(() => fitViewport(scene, { ...options, camera: { center: { x: NaN, y: 0 }, zoom: 1 } }));
  assert.throws(() => fitViewport(scene, { ...options, camera: { center: { x: 0, y: 0 }, zoom: 100 } }));
  assert.throws(() => prepareScene({ ...scene, field: { length: 20000, width: 68 } }));
  assert.throws(() => prepareScene({ ...scene, entities: Array.from({ length: 513 }, () => scene.entities[0]) }));
  assert.throws(() => prepareScene({ ...scene, stages: [{ tracks: Array.from({ length: 4097 }, () => null) }] }), RangeError);
  assert.throws(() => prepareScene({ ...scene, stages: [{ tracks: [{ keyframes: Array.from({ length: 16385 }, () => null) }] }] }), RangeError);
  assert.throws(() => evaluateScene(scene, Infinity));
});
test("metric grid uses square world units, clips to field and coarsens explicitly at low scale", () => {
  const view = fitViewport(scene, { width: 900, height: 600, fit: "pitch" });
  const grid = metricGrid(view, scene.field, 5);
  assert.equal(grid.spacing, 5);
  grid.x.forEach((x) => { assert.equal(x % 5, 0); assert.ok(x >= 0 && x <= 105); });
  grid.y.forEach((y) => assert.ok(y >= 0 && y <= 68));
  const small = metricGrid({ ...view, scale: 0.01 }, scene.field, 0.1);
  assert.ok(small.spacing >= 800); assert.ok(small.x.length <= 201);
  assert.throws(() => metricGrid(view, scene.field, 0));
});
test("segment clipping handles crossings, rejected segments, boundaries and zero-length points", () => {
  const box = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
  assert.deepEqual(clipSegment({ x: -5, y: 5 }, { x: 15, y: 5 }, box), [{ x: 0, y: 5 }, { x: 10, y: 5 }]);
  assert.equal(clipSegment({ x: -5, y: -2 }, { x: -1, y: -2 }, box), null);
  assert.deepEqual(clipSegment({ x: 0, y: 0 }, { x: 0, y: 0 }, box), [{ x: 0, y: 0 }, { x: 0, y: 0 }]);
});
test("stage evaluation interpolates, carries prior movement and uses right-continuous boundaries", () => {
  const mid = evaluateScene(scene, 1.5), ball = mid.entities.find((e) => e.id === "ball")!;
  close(ball.position.x, 23.75); close(ball.position.y, 20.25);
  const boundary = evaluateScene(scene, 6); assert.equal(boundary.stage?.index, 1); assert.equal(boundary.stage?.localSeconds, 0);
  assert.deepEqual(boundary.entities.find((e) => e.id === "a1")!.position, { x: 23, y: 26 });
  assert.deepEqual(boundary.entities.find((e) => e.id === "ball")!.position, { x: 26, y: 16 });
});
test("annotations are half-open, only current stage paths appear, final frame has no permanent arrows", () => {
  assert.ok(evaluateScene(scene, 5.99).annotations.some((a) => a.id === "zone"));
  assert.ok(!evaluateScene(scene, 6).annotations.some((a) => a.id === "zone"));
  assert.ok(evaluateScene(scene, 6).paths.every((p) => ["second-pass", "run"].includes(p.id)));
  const end = evaluateScene(scene, 100); assert.equal(end.seconds, 12); assert.equal(end.paths.length, 0); assert.equal(end.annotations.length, 0);
  assert.equal(evaluateScene(scene, -100).seconds, 0);
});
test("implicit stage-start keyframe interpolates from carried baseline; completed tracks hold endpoint", () => {
  const track = { id: "t", entityId: "a1", kind: "player" as const, movement: "run" as const, keyframes: [{ seconds: 2, position: { x: 10, y: 0 } }, { seconds: 4, position: { x: 20, y: 0 } }] };
  assert.deepEqual(positionAt(track, 1, { x: 0, y: 0 }), { x: 5, y: 0 });
  assert.deepEqual(positionAt(track, 5, { x: 0, y: 0 }), { x: 20, y: 0 });
  assert.throws(() => positionAt(track, NaN, { x: 0, y: 0 }));
});
test("empty static scene renders field with zero duration; evaluation does not mutate inputs", () => {
  const before = structuredClone(scene); evaluateScene(scene, 3); drawScene(scene, { width: 800, height: 500, seconds: 9 }); assert.deepEqual(scene, before);
  const staticScene = { ...scene, stages: [], entities: [] };
  assert.equal(sceneDuration(staticScene), 0); assert.equal(evaluateScene(staticScene, 1).stage, null);
  assert.ok(serializeDrawing(drawScene(staticScene, { width: 800, height: 500 })).includes("<svg"));
});
test("portable drawing escapes hostile labels, has no external assets and preserves exact identity", () => {
  const hostile = structuredClone(scene); const player = hostile.entities.find((e) => e.kind === "player")!;
  if (player.kind === "player") player.positionLabel = '<script>alert("x")</script>';
  const svg = serializeDrawing(drawScene(hostile, { width: 900, height: 600, exerciseArea: example.area, labels: true }), '<img src=x onerror="alert(1)">');
  assert.ok(!svg.includes("<script>")); assert.ok(!svg.includes("<img")); assert.ok(svg.includes("&lt;script&gt;")); assert.ok(svg.includes("revision 1"));
  assert.ok(!svg.includes("<image")); assert.ok(!svg.includes("foreignObject"));
});
test("drawing keeps jersey numbers and screen-size glyphs stable through resizing", () => {
  const small = drawScene(scene, { width: 800, height: 500, exerciseArea: example.area, labels: true }), large = drawScene(scene, { width: 1600, height: 1000, exerciseArea: example.area, labels: true });
  assert.equal(small.labelCollisions, 0); assert.equal(large.labelCollisions, 0);
  assert.deepEqual(small.anchors.map((a) => a.world), large.anchors.map((a) => a.world));
  assert.ok(serializeDrawing(small).includes('r="13"')); assert.ok(serializeDrawing(large).includes('font-size="13"'));
});
test("area and position labels avoid markers across all fixtures at actual desktop diagram sizes", () => {
  for (const example of tacticalExamples) for (const [width, height] of [[816, 396], [1370, 708]]) {
    assert.equal(drawScene(example.scene, { width, height, exerciseArea: example.area, labels: true }).labelCollisions, 0, `${example.id} ${width}×${height}`);
  }
});
test("out-of-pitch anchors remain unchanged and explicit crop counts expose framing limits", () => {
  const outside = structuredClone(scene); outside.entities[1].position = { x: -20, y: -20 };
  const cropped = drawScene(outside, { width: 900, height: 600, fit: "pitch" }); assert.equal(cropped.outsideField, 1); assert.ok(cropped.clippedEntities > 0);
  const all = drawScene(outside, { width: 900, height: 600, fit: "all" }); assert.equal(all.clippedEntities, 0);
  assert.deepEqual(outside.entities[1].position, { x: -20, y: -20 });
});
test("path controls and guide visibility affect drawing only, not evaluation or world projection", () => {
  const base = { width: 900, height: 600, exerciseArea: example.area, seconds: 4 };
  const stage = drawScene(scene, { ...base, paths: "stage" }), active = drawScene(scene, { ...base, paths: "active" }), hidden = drawScene(scene, { ...base, paths: "none", guides: true, gridMetres: 1 });
  assert.ok(serializeDrawing(stage).match(/polyline/g)!.length > serializeDrawing(active).match(/polyline/g)!.length);
  assert.ok(!serializeDrawing(hidden).includes("<polyline")); assert.deepEqual(stage.anchors, hidden.anchors);
});
