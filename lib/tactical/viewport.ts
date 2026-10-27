import { areaSchema, type TacticalScene, type TrainingArea, type TacticalEntity } from "../domain/tactical-scene";
import { prepareScene, type Point } from "./evaluate";
import { contextArea } from "./context";

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
export type FitMode = "exercise" | "all" | "pitch" | "context" | "attacking-half" | "defensive-half" | "custom";
export type Rotation = 0 | 90 | 180 | 270;
export type Camera = { center: Point; zoom: number };
export type Projection = { width: number; height: number; scale: number; center: Point; bounds: Bounds; target: Bounds; padding: number; rotation: Rotation };

/** Convert an explicit metre area into unchanged world bounds. */
export function areaBounds(area: TrainingArea): Bounds {
  const value = areaSchema.parse(area);
  if (value.length < 0.01 || value.width < 0.01) throw new RangeError("Framing area is too small");
  const bounds = { minX: value.origin.x, minY: value.origin.y, maxX: value.origin.x + value.length, maxY: value.origin.y + value.width };
  if (Object.values(bounds).some((n) => Math.abs(n) > 10_000)) throw new RangeError("Framing area exceeds renderer limits");
  return bounds;
}

/** Equipment anchors remain world coordinates; goal/ladder footprints are physical rather than decorative screen rectangles. */
export function equipmentFootprint(entity: TacticalEntity): Point[] {
  const offsets = entity.kind === "equipment" && entity.equipment === "goal" ? [[-2, -3.66], [0, -3.66], [0, 3.66], [-2, 3.66]]
    : entity.kind === "equipment" && entity.equipment === "ladder" ? [[-2, -0.3], [2, -0.3], [2, 0.3], [-2, 0.3]] : [[0, 0]];
  const angle = entity.headingDegrees * Math.PI / 180;
  return offsets.map(([x, y]) => ({ x: entity.position.x + x * Math.cos(angle) - y * Math.sin(angle), y: entity.position.y + x * Math.sin(angle) + y * Math.cos(angle) }));
}

/** Fit All includes every authored stage, including hidden/future overlays, so framing never jumps while time changes. */
export function contentBounds(scene: TacticalScene, exerciseArea?: TrainingArea): Bounds {
  const points: Point[] = scene.entities.flatMap(equipmentFootprint);
  const addArea = (area: TrainingArea) => { const box = areaBounds(area); points.push({ x: box.minX, y: box.minY }, { x: box.maxX, y: box.maxY }); };
  if (exerciseArea) addArea(exerciseArea);
  for (const stage of scene.stages) for (const track of stage.tracks) {
    if (track.kind !== "annotation") points.push(...track.keyframes.map((frame) => frame.position));
    else if (track.annotation.kind === "area") addArea(track.annotation.area);
    else if (track.annotation.kind === "note") points.push(track.annotation.position);
    else points.push(track.annotation.from, track.annotation.to);
  }
  if (!points.length) return { minX: 0, minY: 0, maxX: scene.field.length, maxY: scene.field.width };
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const point of points) { bounds.minX = Math.min(bounds.minX, point.x); bounds.maxX = Math.max(bounds.maxX, point.x); bounds.minY = Math.min(bounds.minY, point.y); bounds.maxY = Math.max(bounds.maxY, point.y); }
  if (bounds.maxX - bounds.minX < 2) { bounds.minX -= 1; bounds.maxX += 1; }
  if (bounds.maxY - bounds.minY < 2) { bounds.minY -= 1; bounds.maxY += 1; }
  return bounds;
}

/** Uniform projection respects length/width proportions, explicit framing, pixel gutters and a separate view-only camera. */
export function fitViewport(input: unknown, options: { width: number; height: number; fit: FitMode; exerciseArea?: TrainingArea; customArea?: TrainingArea; padding?: number; camera?: Camera; rotation?: Rotation; setPieceFocus?: "delivery" | "box" }): Projection {
  const scene = prepareScene(input), { width, height } = options;
  if (![width, height].every((value) => Number.isFinite(value) && value >= 120 && value <= 8192)) throw new RangeError("Viewport dimensions must be between 120 and 8192 pixels");
  let target: Bounds;
  if (options.fit === "context" || options.fit === "exercise" && scene.context && !options.exerciseArea) target = areaBounds(contextArea(scene, options.setPieceFocus));
  else if (options.fit === "pitch") target = { minX: 0, minY: 0, maxX: scene.field.length, maxY: scene.field.width };
  else if (options.fit === "attacking-half" || options.fit === "defensive-half") target = { minX: options.fit === "attacking-half" ? scene.field.length / 2 : 0, minY: 0, maxX: options.fit === "attacking-half" ? scene.field.length : scene.field.length / 2, maxY: scene.field.width };
  else if (options.fit === "custom") { if (!options.customArea) throw new RangeError("Custom framing needs an explicit area"); target = areaBounds(options.customArea); }
  else if (options.fit === "exercise" && options.exerciseArea) target = areaBounds(options.exerciseArea);
  else if (options.fit === "exercise" || options.fit === "all") target = contentBounds(scene, options.exerciseArea);
  else throw new RangeError("Unsupported fit mode");
  const padding = options.padding ?? Math.min(42, Math.min(width, height) / 4);
  if (!Number.isFinite(padding) || padding < 8 || padding > Math.min(width, height) / 3) throw new RangeError("Invalid viewport padding");
  const zoom = options.camera?.zoom ?? 1;
  const center = options.camera?.center ?? { x: (target.minX + target.maxX) / 2, y: (target.minY + target.maxY) / 2 };
  if (!Number.isFinite(zoom) || zoom < 0.1 || zoom > 8 || ![center.x, center.y].every((n) => Number.isFinite(n) && Math.abs(n) <= 20_000)) throw new RangeError("Camera exceeds view limits");
  const rotation = options.rotation ?? 0;
  if (![0, 90, 180, 270].includes(rotation)) throw new RangeError("Only quarter-turn view rotations are supported");
  const swapped = rotation === 90 || rotation === 270, dx = target.maxX - target.minX, dy = target.maxY - target.minY;
  const scale = Math.min((width - 2 * padding) / (swapped ? dy : dx), (height - 2 * padding) / (swapped ? dx : dy)) * zoom;
  return { width, height, scale, rotation, center: { ...center }, padding, target: { ...target }, bounds: { minX: center.x - (swapped ? height : width) / (2 * scale), maxX: center.x + (swapped ? height : width) / (2 * scale), minY: center.y - (swapped ? width : height) / (2 * scale), maxY: center.y + (swapped ? width : height) / (2 * scale) } };
}

/** Map metres to SVG pixels; SVG y increases down the width of the field. */
export function worldToScreen(point: Point, view: Projection): Point {
  const angle = view.rotation * Math.PI / 180, x = point.x - view.center.x, y = point.y - view.center.y;
  return { x: view.width / 2 + (x * Math.cos(angle) - y * Math.sin(angle)) * view.scale, y: view.height / 2 + (x * Math.sin(angle) + y * Math.cos(angle)) * view.scale };
}
/** Exact inverse used by later editors; resizing never rewrites a scene coordinate. */
export function screenToWorld(point: Point, view: Projection): Point {
  const angle = view.rotation * Math.PI / 180, x = (point.x - view.width / 2) / view.scale, y = (point.y - view.height / 2) / view.scale;
  return { x: view.center.x + x * Math.cos(angle) + y * Math.sin(angle), y: view.center.y - x * Math.sin(angle) + y * Math.cos(angle) };
}
/** Axis-aligned bounds of a quarter-turned world rectangle, shared by markings and zones. */
export function screenRectangle(origin: Point, length: number, width: number, view: Projection) {
  const corners = [{ ...origin }, { x: origin.x + length, y: origin.y }, { x: origin.x + length, y: origin.y + width }, { x: origin.x, y: origin.y + width }].map((p) => worldToScreen(p, view));
  const x = Math.min(...corners.map((p) => p.x)), y = Math.min(...corners.map((p) => p.y));
  return { x, y, width: Math.max(...corners.map((p) => p.x)) - x, height: Math.max(...corners.map((p) => p.y)) - y };
}

/** Produce bounded square metric guides anchored at world zero and clipped to the actual field. */
export function metricGrid(view: Projection, field: TacticalScene["field"], requested: number) {
  if (!Number.isFinite(requested) || requested < 0.1 || requested > 1000) throw new RangeError("Invalid metric spacing");
  const minX = Math.max(0, view.bounds.minX), maxX = Math.min(field.length, view.bounds.maxX), minY = Math.max(0, view.bounds.minY), maxY = Math.min(field.width, view.bounds.maxY);
  const multiplier = Math.max(1, Math.ceil(8 / (requested * view.scale)), Math.ceil(Math.max(maxX - minX, maxY - minY) / (requested * 200)));
  const spacing = requested * multiplier;
  const values = (min: number, max: number) => { const result: number[] = []; for (let index = Math.ceil(min / spacing); index * spacing <= max && result.length <= 200; index++) result.push(index * spacing); return result; };
  return { spacing, x: minX <= maxX ? values(minX, maxX) : [], y: minY <= maxY ? values(minY, maxY) : [] };
}

/** Liang–Barsky clipping keeps line endpoints finite and is available to non-SVG consumers too. */
export function clipSegment(from: Point, to: Point, bounds: Bounds): [Point, Point] | null {
  let start = 0, end = 1; const dx = to.x - from.x, dy = to.y - from.y;
  for (const [p, q] of [[-dx, from.x - bounds.minX], [dx, bounds.maxX - from.x], [-dy, from.y - bounds.minY], [dy, bounds.maxY - from.y]]) {
    if (p === 0) { if (q < 0) return null; continue; }
    const ratio = q / p;
    if (p < 0) start = Math.max(start, ratio); else end = Math.min(end, ratio);
    if (start > end) return null;
  }
  return [{ x: from.x + start * dx, y: from.y + start * dy }, { x: from.x + end * dx, y: from.y + end * dy }];
}
