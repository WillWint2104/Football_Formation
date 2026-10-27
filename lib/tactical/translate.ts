import type { TacticalScene } from "../domain/tactical-scene";

/** Translate all authored points explicitly; used for local fixture construction and reversible editor conversions. */
export function translateScene(source: TacticalScene, dx: number, dy: number): TacticalScene {
  const scene = structuredClone(source), move = (p: { x: number; y: number }) => ({ x: p.x + dx, y: p.y + dy });
  scene.entities.forEach((e) => { e.position = move(e.position); });
  scene.stages.forEach((s) => s.tracks.forEach((t) => {
    if (t.kind !== "annotation") t.keyframes.forEach((f) => { f.position = move(f.position); });
    else if (t.annotation.kind === "arrow") { t.annotation.from = move(t.annotation.from); t.annotation.to = move(t.annotation.to); }
    else if (t.annotation.kind === "area") t.annotation.area.origin = move(t.annotation.area.origin);
    else t.annotation.position = move(t.annotation.position);
  }));
  return scene;
}
