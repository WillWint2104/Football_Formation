import type { TacticalScene, TrainingArea } from "../domain/tactical-scene";
import { fitViewport, type Projection } from "../tactical/viewport";
import { actionFrame } from "../tactical/framing";
import { evaluateScene } from "../tactical/evaluate";
import type { CameraView } from "./contracts";
export type View = Pick<CameraView, "area" | "center" | "zoom" | "rotation" | "framing">;
export function overviewView(scene: TacticalScene): View {
  const p = fitViewport(scene, { width: 960, height: 600, fit: "exercise" });
  const area = { origin: { x: p.target.minX, y: p.target.minY }, length: p.target.maxX - p.target.minX, width: p.target.maxY - p.target.minY };
  return { area, center: { x: (p.target.minX + p.target.maxX) / 2, y: (p.target.minY + p.target.maxY) / 2 }, zoom: 1, rotation: 0, framing: "overview" };
}
export function areaView(area: TrainingArea, framing: View["framing"], rotation: View["rotation"] = 0): View {
  return { area, center: { x: area.origin.x + area.length / 2, y: area.origin.y + area.width / 2 }, zoom: 1, rotation, framing };
}
export function focusView(scene: TacticalScene, seconds: number, selected: string[], rotation: View["rotation"]): View | null {
  const state = evaluateScene(scene, seconds);
  if (state.stage) { const framed = actionFrame(scene, state.stage.id, selected); if (framed) return areaView(framed.area, "detail", rotation); }
  const points = state.entities.filter(e => selected.includes(`entity:${e.id}`) && !state.hiddenEntityIds.includes(e.id)).map(e => e.position);
  if (!points.length) return null;
  const xs = points.map(p => p.x), ys = points.map(p => p.y), x = Math.max(-10000, Math.min(...xs) - 3), y = Math.max(-10000, Math.min(...ys) - 3);
  return areaView({ origin: { x, y }, length: Math.min(10000, Math.max(...xs) + 3) - x, width: Math.min(10000, Math.max(...ys) + 3) - y }, "detail", rotation);
}
/** Pan uses the inverse of the actual projection, including quarter-turn rotations. */
export function viewFromProjection(view: Projection, current: View): View { return { ...current, center: { ...view.center } }; }
/** Interpolate view-only world extents. Quarter-turn changes are explicit cuts. */
export function interpolateView(a: View, b: View, fraction: number): View {
  if (a.rotation !== b.rotation) return b;
  const t = Math.max(0, Math.min(1, fraction)), u = t * t * (3 - 2 * t), mix = (x: number, y: number) => x + (y - x) * u;
  return { ...b, area: { origin: { x: mix(a.area.origin.x, b.area.origin.x), y: mix(a.area.origin.y, b.area.origin.y) }, length: mix(a.area.length, b.area.length), width: mix(a.area.width, b.area.width) }, center: { x: mix(a.center.x, b.center.x), y: mix(a.center.y, b.center.y) }, zoom: Math.exp(mix(Math.log(a.zoom), Math.log(b.zoom))) };
}
