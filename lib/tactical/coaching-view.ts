import type { TacticalScene, TrainingArea } from "../domain/tactical-scene";
import { contentBounds } from "./viewport";
import { contextArea } from "./context";

/** Presentation-only fit: include all authored stages, equipment and notes, never one guessed zone.
 * A full-field formation retains its football context; a small exercise uses its actual extents. */
export function coachingExerciseArea(scene: TacticalScene): TrainingArea {
  if (scene.context?.kind === "neutral" || scene.context?.kind === "pitch" && scene.context.region !== "full") return contextArea(scene);
  const b = contentBounds(scene), length = b.maxX - b.minX, width = b.maxY - b.minY;
  if (length >= scene.field.length * .75 || width >= scene.field.width * .85) return contextArea(scene);
  return { origin: { x: b.minX - .5, y: b.minY - .5 }, length: length + 1, width: width + 1 };
}
