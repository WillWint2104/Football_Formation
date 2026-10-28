import type { TacticalScene } from "../domain/tactical-scene";
import { evaluateScene, prepareScene, sceneDuration, type EntityTrack, type Point } from "./evaluate";

/** Cumulative stage coordinates are derived, never a second persisted clock. */
export function stageRanges(scene: TacticalScene) {
  let start = 0;
  return scene.stages.map((stage, index) => { const range = { stage, index, start, end: start + stage.durationSeconds }; start = range.end; return range; });
}
/** Resolve a stage by identity so reordering cannot target a stale array index. */
function stageOf(scene: TacticalScene, id: string) { const stage = scene.stages.find((s) => s.id === id); if (!stage) throw new Error("Select an existing stage"); return stage; }
const round = (seconds: number) => Math.round(seconds * 1_000_000) / 1_000_000;
/** Reconnect authored starts to carried endpoints while preserving absolute destinations and existing static annotations. */
export function connectStages(input: TacticalScene): TacticalScene {
  const scene = structuredClone(input), positions = new Map(scene.entities.map((e) => [e.id, { ...e.position }]));
  for (const stage of scene.stages) for (const track of stage.tracks) if (track.kind !== "annotation") {
    const start = positions.get(track.entityId); if (!start) throw new Error("Movement requires an existing object");
    if (track.keyframes[0]?.seconds === 0) track.keyframes[0].position = { ...start };
    else track.keyframes.unshift({ seconds: 0, position: { ...start } });
    positions.set(track.entityId, { ...track.keyframes.at(-1)!.position });
  }
  return prepareScene(scene);
}
/** Return carried world positions immediately before a stage, including currently hidden entities. */
export function stageStart(scene: TacticalScene, id: string) {
  const index = scene.stages.findIndex((s) => s.id === id); if (index < 0) throw new Error("Select an existing stage");
  const prefix = { ...scene, stages: scene.stages.slice(0, index) };
  return evaluateScene(prefix, sceneDuration(prefix)).entities;
}
/** Append a held pose; no motion or annotation is invented for a new stage. */
export function appendStage(source: TacticalScene, allocate = () => crypto.randomUUID()): TacticalScene {
  const scene = structuredClone(source); scene.stages.push({ id: allocate(), title: `Stage ${scene.stages.length + 1}`, durationSeconds: 4, tracks: [] }); return connectStages(scene);
}
/** Scale local keyframe and annotation timing together; later cumulative starts follow automatically. */
export function updateStage(source: TacticalScene, id: string, title: string, durationSeconds: number): TacticalScene {
  if (!Number.isFinite(durationSeconds) || durationSeconds < .1 || durationSeconds > 3600) throw new Error("Stage duration must be 0.1–3600 seconds");
  const scene = structuredClone(source), stage = stageOf(scene, id), ratio = durationSeconds / stage.durationSeconds;
  stage.title = title; stage.durationSeconds = durationSeconds;
  stage.tracks.forEach((track) => { if (track.kind === "annotation") { track.visibleFrom = round(track.visibleFrom * ratio); track.visibleUntil = round(track.visibleUntil * ratio); } else track.keyframes.forEach((f) => { f.seconds = round(f.seconds * ratio); }); });
  return connectStages(scene);
}
/** Duplicate a stage independently; starts reconnect and saved absolute targets remain editable. */
export function duplicateStage(source: TacticalScene, id: string, allocate = () => crypto.randomUUID()): TacticalScene {
  const scene = structuredClone(source), stage = structuredClone(stageOf(scene, id));
  stage.id = allocate(); stage.title += " (copy)"; stage.tracks.forEach((t) => { t.id = allocate(); });
  scene.stages.splice(scene.stages.findIndex((s) => s.id === id) + 1, 0, stage); return connectStages(scene);
}
/** Delete/reorder stages by identity, retaining absolute targets and continuous carried poses. */
export function changeStageOrder(source: TacticalScene, id: string, action: "delete" | "earlier" | "later"): TacticalScene {
  const scene = structuredClone(source), index = scene.stages.findIndex((s) => s.id === id); stageOf(scene, id);
  if (action === "delete") scene.stages.splice(index, 1);
  else { const to = index + (action === "earlier" ? -1 : 1); if (to >= 0 && to < scene.stages.length) [scene.stages[index], scene.stages[to]] = [scene.stages[to], scene.stages[index]]; }
  return connectStages(scene);
}
/** Record one pose in world metres. A shared start boundary edits the prior endpoint instead of introducing a jump. */
export function setPose(source: TacticalScene, stageId: string, entityId: string, seconds: number, position: Point, movement?: EntityTrack["movement"], allocate = () => crypto.randomUUID()): TacticalScene {
  const scene = structuredClone(source), stage = stageOf(scene, stageId), entity = scene.entities.find((e) => e.id === entityId);
  if (!entity || entity.kind === "equipment") throw new Error("Animate players and balls; use Layout to position equipment");
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > stage.durationSeconds) throw new Error("Pose time must be within the selected stage");
  const time = Math.min(round(seconds), stage.durationSeconds);
  if (time === 0) {
    const index = scene.stages.indexOf(stage);
    if (!index) { entity.position = { ...position }; return connectStages(scene); }
    return setPose(scene, scene.stages[index - 1].id, entityId, scene.stages[index - 1].durationSeconds, position, movement, allocate);
  }
  let track = stage.tracks.find((t): t is EntityTrack => t.kind !== "annotation" && t.entityId === entityId);
  if (!track) {
    const base = { id: allocate(), entityId, keyframes: [{ seconds: 0, position: { ...stageStart(scene, stageId).find((e) => e.id === entityId)!.position } }, { seconds: time, position: { ...position } }] };
    track = entity.kind === "player" ? { ...base, kind: "player", movement: "run" } : { ...base, kind: "ball", movement: "pass" }; stage.tracks.push(track);
  } else {
    const existing = track.keyframes.find((f) => f.seconds === time);
    if (existing) existing.position = { ...position }; else track.keyframes.push({ seconds: time, position: { ...position } });
    track.keyframes.sort((a, b) => a.seconds - b.seconds);
  }
  if (movement) {
    if (track.kind === "player" && ["run", "press", "rotation"].includes(movement)) track.movement = movement as "run" | "press" | "rotation";
    else if (track.kind === "ball" && ["pass", "dribble"].includes(movement)) track.movement = movement as "pass" | "dribble";
    else throw new Error("Movement type must match the object");
  }
  return connectStages(scene);
}
/** A group pose drag is evaluated from one immutable gesture origin and committed as a single history entry. */
export function movePose(source: TacticalScene, stageId: string, seconds: number, ids: string[], dx: number, dy: number): TacticalScene {
  const range = stageRanges(source).find((r) => r.stage.id === stageId); if (!range) throw new Error("Select a stage");
  const evaluated = evaluateScene(source, range.start + seconds); let scene = source;
  for (const entity of evaluated.entities) if (ids.includes(`entity:${entity.id}`)) scene = setPose(scene, stageId, entity.id, seconds, { x: entity.position.x + dx, y: entity.position.y + dy });
  return scene;
}
/** Remove an authored keyframe; starts remain shared, and a track without a destination becomes a held pose. */
export function removeKeyframe(source: TacticalScene, stageId: string, entityId: string, seconds: number): TacticalScene {
  if (seconds <= 0) throw new Error("The start pose is shared; edit its position instead");
  const scene = structuredClone(source), stage = stageOf(scene, stageId);
  stage.tracks = stage.tracks.filter((track) => { if (track.kind === "annotation" || track.entityId !== entityId) return true; track.keyframes = track.keyframes.filter((f) => f.seconds !== seconds); return track.keyframes.length >= 2; });
  return connectStages(scene);
}
/** Hide an existing object in just one stage without deleting it or its carried movement. */
export function setStageVisible(source: TacticalScene, stageId: string, ids: string[], visible: boolean): TacticalScene {
  const scene = structuredClone(source), stage = stageOf(scene, stageId), hidden = new Set(stage.hiddenEntityIds ?? []);
  ids.forEach((id) => visible ? hidden.delete(id) : hidden.add(id));
  if (hidden.size) stage.hiddenEntityIds = [...hidden]; else delete stage.hiddenEntityIds;
  return prepareScene(scene);
}
/** Timed annotations stay on their selected stage and reuse the existing annotation contract. */
export function annotationWindow(source: TacticalScene, stageId: string, trackId: string, from: number, until: number): TacticalScene {
  const scene = structuredClone(source), track = stageOf(scene, stageId).tracks.find((t) => t.id === trackId);
  if (track?.kind !== "annotation") throw new Error("Select an annotation");
  track.visibleFrom = from; track.visibleUntil = until; return prepareScene(scene);
}
/** Move an existing destination in local time without silently merging or deleting another keyframe. */
export function retimeKeyframe(source: TacticalScene, stageId: string, entityId: string, from: number, until: number): TacticalScene {
  const scene = structuredClone(source), stage = stageOf(scene, stageId), time = round(until);
  const track = stage.tracks.find((t): t is EntityTrack => t.kind !== "annotation" && t.entityId === entityId);
  if (!track || from <= 0 || !Number.isFinite(time) || time <= 0 || time > stage.durationSeconds) throw new Error("Destination time must be within the selected stage");
  const frame = track.keyframes.find((f) => f.seconds === from); if (!frame) throw new Error("Keyframe unavailable");
  if (track.keyframes.some((f) => f !== frame && f.seconds === time)) throw new Error("A keyframe already exists at that time");
  frame.seconds = time; track.keyframes.sort((a, b) => a.seconds - b.seconds); return connectStages(scene);
}
