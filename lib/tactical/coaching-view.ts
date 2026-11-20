import type { TacticalScene, TrainingArea } from "../domain/tactical-scene";
import { areaBounds, contentBounds, fitViewport, type Bounds, type FitMode } from "./viewport";
import { contextArea } from "./context";
import { sceneDuration } from "./evaluate";
import { drawScene, type DrawingOptions } from "./drawing";

/** Prefer an applicable declared practice/context; only legacy scenes use all-stage content extents.
 * A full-field formation retains its football context. No authored coordinates are rewritten. */
export function coachingExerciseArea(scene: TacticalScene, explicitArea?: TrainingArea | null): TrainingArea {
  if (explicitArea && !coachingAreaWarning(scene, explicitArea)) return structuredClone(explicitArea);
  if (scene.context) return contextArea(scene);
  const b = contentBounds(scene), length = b.maxX - b.minX, width = b.maxY - b.minY;
  if (length >= scene.field.length * .75 || width >= scene.field.width * .85) return contextArea(scene);
  return { origin: { x: b.minX - .5, y: b.minY - .5 }, length: length + 1, width: width + 1 };
}

/** Shared activity metadata can belong to another attached diagram. Never override authored full-field intent. */
export function coachingAreaWarning(scene: TacticalScene, area?: TrainingArea | null): string | null {
  if (!area) return null;
  let b: Bounds;
  try {
    b = areaBounds(area);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return "Activity dimensions cannot frame this diagram. Using the diagram’s own framing; scene coordinates are unchanged.";
  }
  if (!scene.context) return null;
  const c = areaBounds(contextArea(scene));
  const outside = b.minX < c.minX || b.minY < c.minY || b.maxX > c.maxX || b.maxY > c.maxY;
  const full = scene.context.kind === "pitch" && scene.context.region === "full" && (b.minX !== 0 || b.minY !== 0 || b.maxX !== scene.field.length || b.maxY !== scene.field.width);
  return outside || full ? "Activity dimensions differ from this diagram’s authored context. Showing its saved context; scene coordinates are unchanged." : null;
}

/** Shared read-only recipe; reject corrupt saved pins before the evaluator can clamp them. */
export function coachingDrawingOptions(scene: TacticalScene, seconds: number, explicitArea?: TrainingArea | null, fit: FitMode = "exercise"): Omit<DrawingOptions, "width" | "height"> {
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > sceneDuration(scene)) throw new RangeError("The exact representative time is unavailable. No substitute was selected.");
  const area = coachingExerciseArea(scene, explicitArea);
  return { paint: "coaching-light", fit, exerciseArea: area, seconds, padding: 26,
    rotation: area.width > area.length * 1.2 ? 270 : 0, paths: "stage", labels: true,
    gridMetres: Math.max(area.length, area.width) > 40 ? 5 : 1,
    markings: area.length < 70 && area.width < 45 && (!scene.context || scene.context.kind === "neutral" || scene.context.region === "full") ? "boundary" : "auto" };
}

/** A framing fallback is a camera target only. Draw a training boundary when the source provides it. */
export function coachingScreenOptions(scene: TacticalScene, seconds: number, explicitArea?: TrainingArea | null, fit: FitMode = "exercise") {
  const options = { ...coachingDrawingOptions(scene, seconds, explicitArea, fit), padding: 20 };
  const authoredArea = explicitArea && !coachingAreaWarning(scene, explicitArea) ? explicitArea
    : scene.context?.kind === "pitch" && scene.context.region === "custom" ? scene.context.area : undefined;
  if (fit === "pitch") return { ...options, authoredArea, gridMetres: undefined, markings: "auto" as const,
    rotation: (scene.field.width > scene.field.length * 1.2 ? 270 : 0) as 0 | 270 };
  return { ...options, authoredArea, gridMetres: undefined };
}

/** A viewer opens on the whole authored sequence when the exercise frame would omit content. */
export function coachingOpeningFrame(scene: TacticalScene, seconds: number, area?: TrainingArea | null) {
  const exercise = coachingScreenOptions(scene, seconds, area);
  const { target } = fitViewport(scene, { ...exercise, width: 480, height: 360, fit: "exercise" });
  const content = contentBounds(scene);
  const epsilon = 1e-6;
  const contains = content.minX >= target.minX - epsilon && content.minY >= target.minY - epsilon &&
    content.maxX <= target.maxX + epsilon && content.maxY <= target.maxY + epsilon;
  const disjoint = content.minX > target.maxX || content.minY > target.maxY ||
    content.maxX < target.minX || content.maxY < target.minY;
  // A disjoint activity area can belong to another legacy attachment. Keep it available in
  // Fit Exercise, but exclude it from Fit All so it doesn't shrink the actual diagram.
  const omitArea = disjoint && !scene.context;
  return { fit: contains ? "exercise" as const : "all" as const, omitArea,
    allRotation: omitArea ? (content.maxY - content.minY > (content.maxX - content.minX) * 1.2 ? 270 as const : 0 as const) : exercise.rotation };
}

/** Print cannot offer a Fit All control: include cropped authored content, or fail honestly. */
export function coachingPrintDrawing(scene: TacticalScene, seconds: number, width: number, height: number, explicitArea?: TrainingArea | null) {
  const options = { width, height, ...coachingDrawingOptions(scene, seconds, explicitArea) };
  let drawing = drawScene(scene, options);
  const expanded = !!(drawing.clippedEntities || drawing.croppedDetails);
  if (expanded) drawing = drawScene(scene, { ...options, fit: "all" });
  if (drawing.clippedEntities || drawing.croppedDetails) throw new RangeError("Diagram framing could not include all authored content");
  return { drawing, expanded };
}
