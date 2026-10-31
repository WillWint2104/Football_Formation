import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { addAnnotation, addEntity, arrangeObjects, convertSpace, moveObjects, recordEdit, removeObjects, snapPoint, travel, type History } from "../../lib/tactical/authoring";
import { editorExamples } from "../../lib/tactical/editor-examples";
import { tacticalExamples } from "../../lib/tactical/examples";
import { coachingSample } from "../../lib/coaching/sample";
import { resolveDiagramTarget, saveDiagram, type DiagramTarget } from "../../lib/tactical/persistence";
import { domainBundleSchema } from "../../lib/domain/validation";
import { eventSession, latestEvents } from "../../lib/calendar/schedule";
import { animationExamples } from "../../lib/tactical/animation-examples";
import { setStageVisible } from "../../lib/tactical/animation";

const fixture = () => structuredClone(editorExamples[3].scene);
function target(): DiagramTarget { return { kind: "session", id: "sample-3", revision: 1, activity: "activity-1", event: "sample-4", booking: 1, diagram: null }; }
function draft(bundle = coachingSample()) { return { ...fixture(), id: "new-scene", organizationId: bundle.organizationId }; }

test("entity movement translates associated keyframes in every stage and undo/redo restores the exact scene", () => {
  const source = tacticalExamples[0].scene, moving = source.stages.flatMap((s) => s.tracks).find((t) => t.kind !== "annotation")!;
  assert.notEqual(moving.kind, "annotation");
  const id = moving.entityId, next = moveObjects(source, [`entity:${id}`], 2, 3);
  next.stages.forEach((s, si) => s.tracks.forEach((t, ti) => { const prior = source.stages[si].tracks[ti]; if (t.kind !== "annotation" && prior.kind !== "annotation" && t.entityId === id) t.keyframes.forEach((f, i) => assert.deepEqual(f.position, { x: prior.keyframes[i].position.x + 2, y: prior.keyframes[i].position.y + 3 })); }));
  let history: History = recordEdit({ past: [], present: source, future: [] }, next);
  history = travel(history, "undo"); assert.deepEqual(history.present, source);
  history = travel(history, "redo"); assert.deepEqual(history.present, next);
  history = recordEdit(travel(history, "undo"), moveObjects(source, [`entity:${id}`], 1, 0)); assert.equal(history.future.length, 0);
});
test("a group drag is a single history operation and keeps relative metric distances", () => {
  const source = fixture(), ids = source.entities.slice(0, 3).map((e) => `entity:${e.id}`), next = moveObjects(source, ids, 3.5, -2);
  const history = recordEdit({ past: [], present: next, future: [] }, next, source);
  assert.equal(history.past.length, 1); assert.deepEqual(travel(history, "undo").present, source);
  for (let i = 0; i < 3; i++) assert.deepEqual(next.entities[i].position, { x: source.entities[i].position.x + 3.5, y: source.entities[i].position.y - 2 });
});
test("snapping selects nearby nonselected anchors before rounding in world metres", () => {
  const scene = fixture(), e = scene.entities[0];
  assert.deepEqual(snapPoint({ x: e.position.x + .01, y: e.position.y + .01 }, scene, [], 5, true, .1), e.position);
  assert.deepEqual(snapPoint({ x: 2.4, y: 7.6 }, scene, [], 5, false, 1), { x: 0, y: 10 });
  assert.deepEqual(snapPoint({ x: 2.4, y: 7.6 }, scene, [], null, false, 1), { x: 2.4, y: 7.6 });
});
test("alignment and configurable distribution use metric entity centres", () => {
  let scene = fixture(); scene.entities = scene.entities.slice(0, 3); const ids = scene.entities.map((e) => `entity:${e.id}`);
  scene = arrangeObjects(scene, ids, "y"); assert.equal(new Set(scene.entities.map((e) => e.position.y)).size, 1);
  scene = arrangeObjects(scene, ids, "x", true, 4); const xs = scene.entities.map((e) => e.position.x).sort((a, b) => a - b);
  assert.equal(xs[1] - xs[0], 4); assert.equal(xs[2] - xs[1], 4); assert.throws(() => arrangeObjects(scene, ids, "x", true, -1));
});
test("all object and static overlay kinds can be created, moved and deleted without flattening animation", () => {
  let scene = fixture(), id = 0; const allocate = () => `object-${++id}`;
  for (const kind of ["player", "ball", "cone", "goal", "pole", "marker", "ladder", "mannequin"] as const) scene = addEntity(scene, { x: 2, y: 3 }, kind, "neutral", allocate);
  for (const movement of ["pass", "run", "press", "rotation"] as const) scene = addAnnotation(scene, { kind: "arrow", from: { x: 2, y: 3 }, to: { x: 5, y: 6 }, movement }, allocate);
  scene = addAnnotation(scene, { kind: "area", area: { origin: { x: 1, y: 1 }, length: 5, width: 3 }, label: "Zone" }, allocate);
  scene = addAnnotation(scene, { kind: "note", position: { x: 1, y: 1 }, text: "Scan early" }, allocate);
  const annotationId = `annotation:${scene.stages[0].tracks.at(-1)!.id}`;
  const shifted = moveObjects(scene, [annotationId], 2, 3); assert.notDeepEqual(shifted.stages, scene.stages);
  const deleted = removeObjects(shifted, [annotationId, `entity:${scene.entities.at(-1)!.id}`]);
  assert.equal(deleted.entities.length, scene.entities.length - 1); assert.equal(deleted.stages[0].tracks.length, scene.stages[0].tracks.length - 1);
});
test("neutral/pitch conversion requires explicit translation and reverses all authored geometry", () => {
  const source = fixture(), origin = { x: 35, y: 20 };
  const placed = convertSpace(source, origin, { length: 105, width: 68 }, { kind: "pitch", region: "custom", attack: "positive-x", area: { origin, length: 12, width: 12 } }, true);
  const restored = convertSpace(placed, origin, source.field, source.context!, false);
  assert.deepEqual(restored, source);
});
test("saving a scene appends exact scene/session/booking revisions and preserves templates, siblings and history", () => {
  const initial = coachingSample(), frozen = structuredClone(initial), t = target(), saved = saveDiagram(initial, t, draft(initial));
  assert.deepEqual(initial, frozen); assert.equal(saved.scene.revision, 1); assert.equal(saved.target.revision, 2); assert.equal(saved.target.booking, 2);
  const resolved = resolveDiagramTarget(saved.bundle, saved.target); assert.deepEqual(resolved.scene, saved.scene); assert.equal(resolved.readOnly, false);
  const session = eventSession(saved.bundle, latestEvents(saved.bundle).find((e) => e.id === t.event)!)!;
  assert.deepEqual(session.content.activities[0], initial.sessions.find((s) => s.id === t.id)!.content.activities[0]);
  assert.deepEqual(saved.bundle.templates, initial.templates); assert.deepEqual(saved.bundle.exercises, initial.exercises);
  assert.deepEqual(saved.bundle.sessions.find((s) => s.id === t.id && s.revision === 1), initial.sessions.find((s) => s.id === t.id));
  const changed = moveObjects(saved.scene, [`entity:${saved.scene.entities[0].id}`], 2, 0), again = saveDiagram(saved.bundle, saved.target, changed);
  assert.equal(again.scene.revision, 2); assert.equal(again.target.revision, 3);
  assert.deepEqual(resolveDiagramTarget(again.bundle, saved.target).scene, saved.scene); assert.equal(resolveDiagramTarget(again.bundle, saved.target).readOnly, true);
  assert.throws(() => saveDiagram(again.bundle, saved.target, changed), /current saved owner/);
});
test("exercise/template diagrams are independent snapshots and invalid source/booking/organisation pins are rejected", () => {
  const bundle = coachingSample(), exercise: DiagramTarget = { kind: "exercise", id: bundle.exercises[0].id, revision: 1, diagram: null };
  const a = saveDiagram(bundle, exercise, draft(bundle)); assert.equal(a.target.revision, 2); assert.deepEqual(a.bundle.sessions, bundle.sessions);
  const template: DiagramTarget = { kind: "template", id: bundle.templates[0].id, revision: 1, activity: "activity-1", diagram: null };
  const b = saveDiagram(bundle, template, draft(bundle)); assert.equal(b.target.revision, 2); assert.deepEqual(b.bundle.sessions, bundle.sessions);
  assert.throws(() => resolveDiagramTarget(bundle, { ...target(), booking: 42 }), /mismatch/);
  assert.throws(() => resolveDiagramTarget(bundle, { ...exercise, revision: 99 }), /unavailable/);
  assert.throws(() => saveDiagram(bundle, exercise, { ...draft(bundle), organizationId: "other-club" }), /Organisation/);
  assert.throws(() => saveDiagram(a.bundle, a.target, { ...a.scene, id: "substitution" }), /pinned source/);
});
test("production SQL round-trips animation stages, visibility, context and colours with immutable pins and optimistic concurrency", async () => {
  const db = new PGlite(), actor = "00000000-0000-4000-8000-000000000001", initial = coachingSample();
  try {
    await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
      create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth,public to anon,authenticated,service_role; insert into auth.users values ('${actor}');`);
    await db.exec(await readFile("supabase/migrations/202610260001_coaching_persistence.sql", "utf8"));
    await db.exec(await readFile("supabase/migrations/20261031115109_coaching_revision_conflict_pt409.sql", "utf8"));
    await db.query("insert into public.organizations(id,name) values ($1,'Synthetic scene test')", [initial.organizationId]);
    await db.query("insert into public.organization_memberships(organization_id,user_id,role) values ($1,$2,'owner')", [initial.organizationId, actor]);
    const animated = { ...structuredClone(animationExamples[2].scene), id: "new-scene", organizationId: initial.organizationId };
    const scene = setStageVisible(animated, animated.stages[0].id, ["ball"], false), player = scene.entities.find((e) => e.kind === "player")!; if (player.kind === "player") player.color = "#123abc";
    const first = saveDiagram(initial, target(), scene), second = saveDiagram(first.bundle, first.target, moveObjects(first.scene, [`entity:${player.id}`], 1, 0));
    const save = (v: number, bundle: typeof initial) => db.transaction(async (tx) => { await tx.exec("set local role service_role"); return tx.query("select public.save_coaching_bundle($1,$2,$3,$4::jsonb)", [initial.organizationId, actor, v, JSON.stringify(domainBundleSchema.parse(bundle))]); });
    await save(0, first.bundle); await save(1, second.bundle);
    const read = await db.transaction(async (tx) => { await tx.exec("set local role authenticated"); await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [actor]); return tx.query<{ bundle: unknown }>("select bundle from public.organization_snapshots where organization_id=$1 and version=2", [initial.organizationId]); });
    const reopened = domainBundleSchema.parse(read.rows[0].bundle); assert.deepEqual(reopened, second.bundle);
    assert.deepEqual(resolveDiagramTarget(reopened, first.target).scene, first.scene); assert.deepEqual(resolveDiagramTarget(reopened, second.target).scene, second.scene);
    await assert.rejects(save(1, second.bundle), (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "PT409");
  } finally { await db.close(); }
});
