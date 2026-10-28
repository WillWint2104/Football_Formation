import type { TacticalScene, TrainingArea } from "../domain/tactical-scene";
import { stageStart } from "./animation";
import { contextArea } from "./context";
import { prepareScene, type Point, type AnnotationTrack } from "./evaluate";
import { equipmentFootprint } from "./viewport";

/** A transient fit target, never part of an authored scene or its revision journal. */
export type ActionFrame = { area: TrainingArea; entityIds: string[]; points: Point[] };
function annotationPoints(track: AnnotationTrack): Point[] {
  const a = track.annotation;
  return a.kind === "note" ? [a.position] : a.kind === "arrow" ? [a.from, a.to]
    : [a.area.origin, { x: a.area.origin.x + a.area.length, y: a.area.origin.y + a.area.width }];
}
/** Include a small metre margin plus the existing projection's pixel gutter; never stretch or move objects. */
function framePoints(points: Point[]): TrainingArea {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  const x = (minX + maxX) / 2, y = (minY + maxY) / 2;
  const halfX = Math.max(2, (maxX - minX) / 2 + .5), halfY = Math.max(2, (maxY - minY) / 2 + .5);
  minX = Math.max(-10_000, x - halfX); maxX = Math.min(10_000, x + halfX);
  minY = Math.max(-10_000, y - halfY); maxY = Math.min(10_000, y + halfY);
  return { origin: { x: minX, y: minY }, length: maxX - minX, width: maxY - minY };
}
/** Whole-stage extents use carried starts, every path vertex and overlays, independent of the playhead. */
export function actionFrame(input: TacticalScene, stageId: string, selection?: string[]): ActionFrame | null {
  const scene = prepareScene(input), stage = scene.stages.find((s) => s.id === stageId);
  if (!stage) return null;
  const start = stageStart(scene, stage.id), hidden = new Set(stage.hiddenEntityIds ?? []), ids = new Set<string>(), points: Point[] = [];
  const selected = selection ? new Set(selection) : null;
  const includeEntity = (id: string) => {
    const entity = start.find((e) => e.id === id);
    if (!entity || hidden.has(id) || ids.has(id)) return;
    ids.add(id); points.push(...equipmentFootprint(entity));
    for (const track of stage.tracks) if (track.kind !== "annotation" && track.entityId === id) points.push(...track.keyframes.map((f) => f.position));
  };
  if (selected) for (const entity of start) { if (selected.has(`entity:${entity.id}`)) includeEntity(entity.id); }
  else {
    for (const track of stage.tracks) if (track.kind !== "annotation") includeEntity(track.entityId);
    for (const entity of start) if (entity.kind === "ball") includeEntity(entity.id);
  }
  for (const track of stage.tracks) if (track.kind === "annotation" && (!selected || selected.has(`annotation:${track.id}`))) points.push(...annotationPoints(track));
  if (!points.length) return selected ? null : { area: contextArea(scene), entityIds: [], points: [] };
  if (!selected) {
    // Nearby receiving/supporting players matter even when they have no movement track.
    // Compare to the original action, rather than recursively including an entire team.
    const core = [...points];
    for (const entity of start) if (entity.kind === "player" && core.some((p) => Math.hypot(p.x - entity.position.x, p.y - entity.position.y) <= 6)) includeEntity(entity.id);
    // Explicit local football contexts retain the relevant goal; a full-pitch action
    // includes a goal only when its action actually approaches that end.
    if (scene.context?.kind === "pitch") for (const right of [false, true]) {
      const position = { x: right ? scene.field.length : 0, y: scene.field.width / 2 };
      const local = scene.context.region !== "full" && (() => { const a = contextArea(scene); return position.x >= a.origin.x && position.x <= a.origin.x + a.length && position.y >= a.origin.y && position.y <= a.origin.y + a.width; })();
      if (local || core.some((p) => Math.hypot(p.x - position.x, p.y - position.y) <= 18)) points.push(...equipmentFootprint({ id: "frame-goal", kind: "equipment", equipment: "goal", position, headingDegrees: right ? 180 : 0 }));
    }
  }
  return { area: framePoints(points), entityIds: [...ids], points: points.map((p) => ({ ...p })) };
}
