import test from "node:test";
import assert from "node:assert/strict";
import { tacticalExamples } from "../../lib/tactical/examples";
import { drawScene, serializeDrawing } from "../../lib/tactical/drawing";
import { coachingExerciseArea } from "../../lib/tactical/coaching-view";
import { areaBounds, contentBounds, fitViewport, screenToWorld, worldToScreen } from "../../lib/tactical/viewport";
import { coachingLightPalette, tacticalPalette } from "../../lib/tactical/palette";
import { contextArea } from "../../lib/tactical/context";

test("light paint changes presentation while preserving evaluated geometry, time, revision and projection", () => {
  for (const { scene } of tacticalExamples) {
    const before = structuredClone(scene), options = { width: 1000, height: 500, seconds: 2, fit: "exercise" as const, exerciseArea: coachingExerciseArea(scene), gridMetres: 1 };
    const dark = drawScene(scene, options), light = drawScene(scene, { ...options, paint: "coaching-light" });
    assert.deepEqual(light.view, dark.view); assert.deepEqual(light.anchors, dark.anchors);
    assert.equal(light.sceneId, dark.sceneId); assert.equal(light.revision, dark.revision); assert.equal(light.seconds, dark.seconds);
    assert.deepEqual(scene, before); assert.equal(light.nodes[0].attrs.fill, coachingLightPalette.field);
    assert.equal(dark.nodes[0].attrs.fill, scene.context?.kind === "neutral" ? tacticalPalette.field : tacticalPalette.surround);
    assert.notEqual(serializeDrawing(light), serializeDrawing(dark));
  }
});

test("small legacy exercises fit all stages and notes; full football scenes retain context", () => {
  const small = tacticalExamples[0].scene, bounds = contentBounds(small), area = areaBounds(coachingExerciseArea(small));
  assert.ok(area.minX <= bounds.minX && area.maxX >= bounds.maxX && area.minY <= bounds.minY && area.maxY >= bounds.maxY);
  assert.ok(area.maxY >= 28, "future-stage notes must not disappear from the held frame");
  const options = { width: 900, height: 400, fit: "exercise" as const };
  assert.ok(fitViewport(small, { ...options, exerciseArea: coachingExerciseArea(small) }).scale > fitViewport(small, { ...options, fit: "pitch" }).scale * 3);
  const full = tacticalExamples[4].scene;
  assert.deepEqual(coachingExerciseArea(full), contextArea(full));
});

test("light authoring projection remains uniform and invertible under pan, zoom and quarter-turn rotation", () => {
  const scene = tacticalExamples[0].scene;
  for (const rotation of [0, 90, 180, 270] as const) {
    const view = fitViewport(scene, { width: 750, height: 420, fit: "exercise", exerciseArea: coachingExerciseArea(scene), rotation, camera: { center: { x: 26.5, y: 22.5 }, zoom: 1.25 } });
    const a = worldToScreen({ x: 21.25, y: 18.5 }, view), b = screenToWorld(a, view);
    assert.ok(Math.abs(b.x - 21.25) < 1e-8 && Math.abs(b.y - 18.5) < 1e-8);
    const c = worldToScreen({ x: 22.25, y: 18.5 }, view);
    assert.ok(Math.abs(Math.hypot(c.x - a.x, c.y - a.y) - view.scale) < 1e-8);
  }
});

test("light tactical arrows have contrasting outlines and distinct semantic paints; defaults remain opt-in", () => {
  const light = serializeDrawing(drawScene(tacticalExamples[0].scene, { width: 900, height: 500, paint: "coaching-light", seconds: 2 }));
  assert.ok(light.includes(coachingLightPalette.pass)); assert.ok(light.includes(coachingLightPalette.press));
  assert.equal(new Set([coachingLightPalette.pass, coachingLightPalette.run, coachingLightPalette.press, coachingLightPalette.rotation, coachingLightPalette.dribble]).size, 5);
  assert.equal(tacticalPalette.field, "#285a3b"); assert.equal(tacticalPalette.pass, "#72dce8");
});
