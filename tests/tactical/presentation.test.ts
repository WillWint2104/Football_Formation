import assert from "node:assert/strict";
import { test } from "node:test";
import { presentationFixture } from "../presentations/fixture";
import { blankPresentation, createBlock, fromSession, presentationSchema, resolveSource, validatePresentation } from "../../lib/presentations/contracts";
import { overviewView, areaView, focusView, interpolateView } from "../../lib/presentations/camera";
import { evaluateScene } from "../../lib/tactical/evaluate";
import { fitViewport, screenToWorld, worldToScreen } from "../../lib/tactical/viewport";
import { drawScene } from "../../lib/tactical/drawing";

test("session conversion includes only selected activities and never changes source history", () => {
  const bundle = presentationFixture(), before = JSON.stringify(bundle), session = bundle.sessions.find(s => s.content.activities.length >= 4)!;
  const selected = session.content.activities.slice(0, 2);
  const p = fromSession(bundle, { id: session.id, revision: session.revision }, selected.map(a => a.id), false, false);
  assert.equal(p.blocks.filter(b => b.kind === "guidance").length, 2);
  assert.deepEqual(p.blocks.filter(b => b.source?.kind === "scene").map(b => b.source?.ref.id), ["presentation-0", "presentation-1"]);
  for (const block of p.blocks) if (block.source?.kind === "activity") assert.ok(selected.map(a => a.id).includes(block.source.activityId));
  p.blocks.reverse(); p.blocks[0].notes = "Independent coaching note";
  assert.equal(JSON.stringify(bundle), before);
  const withOverview = fromSession(bundle, { id: session.id, revision: session.revision }, selected.map(a => a.id), true, true);
  assert.deepEqual(resolveSource(bundle, withOverview.blocks[0].source).session?.content.activities.map(a => a.id), selected.map(a => a.id));
  assert.throws(() => fromSession(bundle, { id: session.id, revision: 999 }, [], true, true));
  assert.throws(() => fromSession(bundle, { id: session.id, revision: 1 }, ["missing"], true, true));
});
test("strict presentation envelope, section sources and metric camera limits reject malformed content", () => {
  const b = presentationFixture(), p = blankPresentation(b.organizationId);
  p.blocks.push(createBlock("diagram", "Static rondo", { kind: "scene", ref: { id: "presentation-0", revision: 1 }, seconds: 0 }));
  assert.equal(validatePresentation(p, b).blocks[0].kind, "diagram");
  assert.throws(() => validatePresentation({ ...p, organizationId: "another-club" }, b));
  assert.throws(() => validatePresentation({ ...p, blocks: [{ ...p.blocks[0], kind: "animation" }] }, b));
  assert.throws(() => presentationSchema.parse({ ...p, arbitrarySlides: [] }));
  assert.throws(() => validatePresentation({ ...p, blocks: [...p.blocks, p.blocks[0]] }, b));
  const view = { ...overviewView(b.scenes[1]), id: "camera", title: "Establishing", stageId: null, transitionSeconds: 0 };
  p.blocks[0].views = [view]; assert.doesNotThrow(() => validatePresentation(p, b));
  p.blocks[0].views[0].area.length = 50000; assert.throws(() => validatePresentation(p, b));
});
test("exact pins survive newer scene/session revisions; missing sources/stages fail closed", () => {
  const b = presentationFixture(), p = blankPresentation(b.organizationId), scene = b.scenes[1];
  p.blocks.push(createBlock("animation", "Passing", { kind: "scene", ref: { id: scene.id, revision: 1 }, seconds: 0 }));
  b.scenes.push({ ...structuredClone(scene), revision: 2, entities: [] });
  assert.deepEqual(resolveSource(b, p.blocks[0].source).scene, scene);
  const v = { ...overviewView(scene), id: "camera", title: "Action", stageId: "missing", transitionSeconds: 0 };
  p.blocks[0].views.push(v); assert.throws(() => validatePresentation(p, b));
  v.stageId = scene.stages[0].id; assert.doesNotThrow(() => validatePresentation(p, b));
  const roundTrip = validatePresentation(JSON.parse(JSON.stringify(p)), b); assert.deepEqual(roundTrip, p);
  b.scenes = b.scenes.filter(s => !(s.id === scene.id && s.revision === 1)); assert.throws(() => validatePresentation(p, b));
});
test("camera transitions/pan/rotation are view-only and preserve deterministic stage evaluation", () => {
  const b = presentationFixture(), scene = b.scenes[1], original = JSON.stringify(scene), pose = evaluateScene(scene, 4), overview = overviewView(scene), detail = focusView(scene, 4, ["entity:ball"], 0)!;
  assert.ok(detail); assert.deepEqual(interpolateView(overview, detail, 0).area, overview.area);
  assert.deepEqual(interpolateView(overview, detail, 1).area, detail.area);
  assert.deepEqual(interpolateView(overview, { ...detail, rotation: 90 }, .5), { ...detail, rotation: 90 });
  for (const rotation of [0, 90, 180, 270] as const) {
    const view = interpolateView(overview, { ...detail, rotation: 0 }, .5);
    const projection = fitViewport(scene, { width: 1366, height: 650, fit: "custom", customArea: view.area, camera: { center: view.center, zoom: view.zoom }, rotation });
    const point = scene.entities[0].position, roundtrip = screenToWorld(worldToScreen(point, projection), projection);
    assert.ok(Math.abs(point.x - roundtrip.x) < 1e-9 && Math.abs(point.y - roundtrip.y) < 1e-9);
  }
  assert.deepEqual(evaluateScene(scene, 4), pose); assert.equal(JSON.stringify(scene), original);
  assert.equal(areaView(detail.area, "action").framing, "action");
  const corner = b.scenes[2], before = JSON.stringify(corner), v = overviewView(corner);
  const options = { width: 1366, height: 600, fit: "custom" as const, customArea: v.area, seconds: 4 };
  const plain = drawScene(corner, options), masked = drawScene(corner, { ...options, contextMask: true });
  assert.deepEqual(plain.anchors, masked.anchors); assert.deepEqual(plain.view, masked.view); assert.ok(masked.nodes.length > plain.nodes.length); assert.equal(JSON.stringify(corner), before);
});
