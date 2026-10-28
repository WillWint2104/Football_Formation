import { tacticalSceneSchema, type TacticalScene, type TacticalEntity, type MovementTrack } from "../domain/tactical-scene";

export type Point = { x: number; y: number };
export type EntityTrack = Exclude<MovementTrack, { kind: "annotation" }>;
export type AnnotationTrack = Extract<MovementTrack, { kind: "annotation" }>;
export const RENDER_LIMITS = { entities: 512, stages: 128, tracks: 4096, keyframes: 16_384, coordinate: 10_000, duration: 21_600 } as const;

/** Validate the existing schema and bound operational work without changing persisted domain contracts. */
export function prepareScene(input: unknown): TacticalScene {
  const candidate = input as { entities?: unknown; stages?: unknown } | null;
  if ((Array.isArray(candidate?.entities) && candidate.entities.length > RENDER_LIMITS.entities) || (Array.isArray(candidate?.stages) && candidate.stages.length > RENDER_LIMITS.stages))
    throw new RangeError("Scene exceeds renderer entity/stage limits");
  // Reject oversized arrays before Zod clones/traverses the payload. Malformed shapes still go through the strict schema.
  let rawTracks = 0, rawFrames = 0;
  if (Array.isArray(candidate?.stages)) for (const stage of candidate.stages) {
    if (stage && typeof stage === "object" && Array.isArray(stage.hiddenEntityIds) && stage.hiddenEntityIds.length > RENDER_LIMITS.entities) throw new RangeError("Stage visibility exceeds renderer entity limits");
    if (!stage || typeof stage !== "object" || !Array.isArray(stage.tracks)) continue;
    rawTracks += stage.tracks.length;
    if (rawTracks > RENDER_LIMITS.tracks) throw new RangeError("Scene exceeds renderer track limits");
    for (const track of stage.tracks) {
      if (track && typeof track === "object" && Array.isArray(track.keyframes)) rawFrames += track.keyframes.length;
      if (rawFrames > RENDER_LIMITS.keyframes) throw new RangeError("Scene exceeds renderer keyframe limits");
    }
  }
  const scene = tacticalSceneSchema.parse(input);
  let tracks = 0, keyframes = 0;
  const check = (point: Point) => { if (Math.abs(point.x) > RENDER_LIMITS.coordinate || Math.abs(point.y) > RENDER_LIMITS.coordinate) throw new RangeError("Coordinates exceed renderer limits"); };
  const area = (value: { origin: Point; length: number; width: number }) => { check(value.origin); check({ x: value.origin.x + value.length, y: value.origin.y + value.width }); };
  area({ origin: { x: 0, y: 0 }, ...scene.field });
  if (scene.field.length < 0.01 || scene.field.width < 0.01) throw new RangeError("Field is too small to render");
  scene.entities.forEach((entity) => check(entity.position));
  for (const stage of scene.stages) {
    if (stage.durationSeconds < 0.000001) throw new RangeError("Stage is too short to evaluate");
    tracks += stage.tracks.length;
    for (const track of stage.tracks) {
      if (track.kind !== "annotation") { keyframes += track.keyframes.length; track.keyframes.forEach((frame) => check(frame.position)); }
      else if (track.annotation.kind === "area") area(track.annotation.area);
      else if (track.annotation.kind === "note") check(track.annotation.position);
      else { check(track.annotation.from); check(track.annotation.to); }
    }
  }
  if (tracks > RENDER_LIMITS.tracks || keyframes > RENDER_LIMITS.keyframes || sceneDuration(scene) > RENDER_LIMITS.duration)
    throw new RangeError("Scene exceeds renderer track/time limits");
  return scene;
}

/** Stages use cumulative starts; a scene without stages is a static time-zero snapshot. */
export function sceneDuration(scene: TacticalScene): number { return scene.stages.reduce((sum, stage) => sum + stage.durationSeconds, 0); }

/** Interpolate from the carried stage-start position when a first authored keyframe occurs after zero. */
export function positionAt(track: EntityTrack, seconds: number, baseline: Point): Point {
  if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError("Track time must be finite and nonnegative");
  let before = { seconds: 0, position: baseline };
  for (const frame of track.keyframes) {
    if (seconds < frame.seconds) {
      const ratio = (seconds - before.seconds) / (frame.seconds - before.seconds);
      return { x: before.position.x + (frame.position.x - before.position.x) * ratio, y: before.position.y + (frame.position.y - before.position.y) * ratio };
    }
    before = frame;
  }
  return { ...before.position };
}

export type EvaluatedScene = {
  sceneId: string; revision: number; seconds: number; duration: number;
  stage: { id: string; title: string; index: number; localSeconds: number } | null;
  entities: TacticalEntity[];
  paths: { id: string; entityId: string; movement: EntityTrack["movement"]; points: Point[]; active: boolean }[];
  annotations: AnnotationTrack[];
  hiddenEntityIds: string[];
};

/** Pure right-continuous evaluation: carry completed movements, clamp finite time, and use half-open annotation windows. */
export function evaluateScene(input: unknown, requestedSeconds: number): EvaluatedScene {
  if (!Number.isFinite(requestedSeconds)) throw new RangeError("Snapshot time must be finite");
  const scene = prepareScene(input), duration = sceneDuration(scene), seconds = Math.max(0, Math.min(duration, requestedSeconds));
  const positions = new Map(scene.entities.map((entity) => [entity.id, { ...entity.position }]));
  const result: EvaluatedScene = { sceneId: scene.id, revision: scene.revision, seconds, duration, stage: null, entities: [], paths: [], annotations: [], hiddenEntityIds: [] };
  let start = 0;
  for (let index = 0; index < scene.stages.length; index++) {
    const stage = scene.stages[index], end = start + stage.durationSeconds;
    if (seconds >= end && index < scene.stages.length - 1) {
      for (const track of stage.tracks) if (track.kind !== "annotation") positions.set(track.entityId, { ...track.keyframes.at(-1)!.position });
      start = end; continue;
    }
    const localSeconds = seconds - start;
    result.stage = { id: stage.id, title: stage.title, index, localSeconds };
    result.hiddenEntityIds = [...(stage.hiddenEntityIds ?? [])];
    for (const track of stage.tracks) {
      if (track.kind === "annotation") {
        if (localSeconds >= track.visibleFrom && localSeconds < track.visibleUntil) result.annotations.push(structuredClone(track));
      } else {
        const baseline = positions.get(track.entityId)!;
        const points = track.keyframes[0].seconds > 0 ? [{ ...baseline }, ...track.keyframes.map((frame) => ({ ...frame.position }))] : track.keyframes.map((frame) => ({ ...frame.position }));
        positions.set(track.entityId, positionAt(track, localSeconds, baseline));
        if (seconds < duration) result.paths.push({ id: track.id, entityId: track.entityId, movement: track.movement, points, active: localSeconds < track.keyframes.at(-1)!.seconds });
      }
    }
    break;
  }
  result.entities = scene.entities.map((entity) => ({ ...entity, position: { ...positions.get(entity.id)! } }));
  return result;
}
