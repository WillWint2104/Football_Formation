import { type TacticalScene, type TacticalEntity, type FieldContext, type TrainingArea } from "../domain/tactical-scene";
import { prepareScene, type Point } from "./evaluate";
import { translateScene } from "./translate";

export type History = { past: TacticalScene[]; present: TacticalScene; future: TacticalScene[] };
/** Keep at most fifty immutable undo snapshots; a new edit invalidates redo. */
export function recordEdit(history: History, next: TacticalScene, before = history.present): History {
  const parsed = prepareScene(next);
  if (JSON.stringify(parsed) === JSON.stringify(before)) return { ...history, present: parsed };
  return { past: [...history.past, structuredClone(before)].slice(-50), present: parsed, future: [] };
}
/** Undo/redo swaps snapshots without allocating or publishing saved revisions. */
export function travel(history: History, direction: "undo" | "redo"): History {
  if (direction === "undo") return history.past.length ? { past: history.past.slice(0, -1), present: history.past.at(-1)!, future: [history.present, ...history.future] } : history;
  return history.future.length ? { past: [...history.past, history.present].slice(-50), present: history.future[0], future: history.future.slice(1) } : history;
}
/** Translate selected anchors and every associated movement keyframe; static annotations retain their stage timing. */
export function moveObjects(source: TacticalScene, selected: string[], dx: number, dy: number): TacticalScene {
  const scene = structuredClone(source), move = (p: Point) => ({ x: p.x + dx, y: p.y + dy });
  const entities = new Set(selected.filter((s) => s.startsWith("entity:")).map((s) => s.slice(7)));
  scene.entities.forEach((e) => { if (entities.has(e.id)) e.position = move(e.position); });
  scene.stages.forEach((s, index) => s.tracks.forEach((t) => {
    if (t.kind !== "annotation") { if (entities.has(t.entityId)) t.keyframes.forEach((f) => { f.position = move(f.position); }); }
    else if (index === 0 && selected.includes(`annotation:${t.id}`)) {
      const a = t.annotation;
      if (a.kind === "arrow") { a.from = move(a.from); a.to = move(a.to); }
      else if (a.kind === "area") a.area.origin = move(a.area.origin); else a.position = move(a.position);
    }
  }));
  return prepareScene(scene);
}
/** Remove selected objects and their motion tracks while leaving unrelated stages and annotations unchanged. */
export function removeObjects(source: TacticalScene, selected: string[]): TacticalScene {
  const scene = structuredClone(source), ids = new Set(selected.filter((s) => s.startsWith("entity:")).map((s) => s.slice(7)));
  scene.entities = scene.entities.filter((e) => !ids.has(e.id));
  scene.stages.forEach((s, index) => { s.tracks = s.tracks.filter((t) => t.kind === "annotation" ? index !== 0 || !selected.includes(`annotation:${t.id}`) : !ids.has(t.entityId)); });
  return prepareScene(scene);
}
/** Snap in world metres, with optional nearest object anchors taking precedence within the supplied world tolerance. */
export function snapPoint(point: Point, scene: TacticalScene, selected: string[], grid: number | null, objects: boolean, tolerance: number): Point {
  if (objects) {
    const near = scene.entities.filter((e) => !selected.includes(`entity:${e.id}`)).map((e) => ({ point: e.position, distance: Math.hypot(e.position.x - point.x, e.position.y - point.y) })).sort((a, b) => a.distance - b.distance)[0];
    if (near && near.distance <= tolerance) return { ...near.point };
  }
  return grid ? { x: Math.round(point.x / grid) * grid, y: Math.round(point.y / grid) * grid } : { ...point };
}
/** Align or distribute selected entity centres in metres, preserving their movement paths by the same translation. */
export function arrangeObjects(source: TacticalScene, selected: string[], axis: "x" | "y", distribute = false, spacing?: number): TacticalScene {
  const items = source.entities.filter((e) => selected.includes(`entity:${e.id}`)).sort((a, b) => a.position[axis] - b.position[axis]);
  if (items.length < 2) return source;
  if (spacing !== undefined && (!Number.isFinite(spacing) || spacing <= 0 || spacing > 1000)) throw new Error("Spacing must be between 0 and 1000 metres");
  let result = source;
  const minimum = items[0].position[axis], maximum = items.at(-1)!.position[axis];
  items.forEach((e, i) => {
    const value = distribute ? minimum + i * (spacing ?? (maximum - minimum) / (items.length - 1)) : (minimum + maximum) / 2;
    result = moveObjects(result, [`entity:${e.id}`], axis === "x" ? value - e.position.x : 0, axis === "y" ? value - e.position.y : 0);
  });
  return result;
}
/** Convert spaces only after an explicit coach action; the inverse translation plus prior field/context restores the source. */
export function convertSpace(source: TacticalScene, origin: Point, field: TacticalScene["field"], context: FieldContext, toPitch: boolean): TacticalScene {
  if (!Number.isFinite(origin.x) || !Number.isFinite(origin.y)) throw new Error("Conversion anchor must be finite");
  const moved = translateScene(source, toPitch ? origin.x : -origin.x, toPitch ? origin.y : -origin.y);
  return prepareScene({ ...moved, field: { ...field }, context });
}
/** Add a compact numbered player, a ball or one of the existing equipment kinds at a world anchor. */
export function addEntity(source: TacticalScene, at: Point, kind: "player" | "ball" | TacticalEntityEquipment, team: "a" | "b" | "neutral", allocate = () => crypto.randomUUID()): TacticalScene {
  const scene = structuredClone(source), id = allocate(), base = { id, position: { ...at }, headingDegrees: team === "b" ? 180 : 0 };
  if (kind === "player") {
    const used = new Set(scene.entities.flatMap((e) => e.kind === "player" && e.team === team ? [e.number] : [])), number = Array.from({ length: 99 }, (_, i) => i + 1).find((n) => !used.has(n));
    if (!number) throw new Error("Team already has numbers 1–99");
    scene.entities.push({ ...base, kind, team, number, positionLabel: null });
  } else if (kind === "ball") scene.entities.push({ ...base, kind });
  else scene.entities.push({ ...base, kind: "equipment", equipment: kind });
  return prepareScene(scene);
}
export type TacticalEntityEquipment = Extract<TacticalEntity, { kind: "equipment" }>["equipment"];
/** Author static overlays in the first stage without flattening existing animation stages or changing durations. */
export function addAnnotation(source: TacticalScene, annotation: { kind: "arrow"; from: Point; to: Point; movement: "pass" | "run" | "press" | "rotation" } | { kind: "area"; area: TrainingArea; label: string } | { kind: "note"; position: Point; text: string }, allocate = () => crypto.randomUUID()): TacticalScene {
  const scene = structuredClone(source);
  if (!scene.stages.length) scene.stages.push({ id: allocate(), title: "Static diagram", durationSeconds: 1, tracks: [] });
  scene.stages[0].tracks.push({ id: allocate(), kind: "annotation", visibleFrom: 0, visibleUntil: scene.stages[0].durationSeconds, annotation: structuredClone(annotation) });
  return prepareScene(scene);
}
