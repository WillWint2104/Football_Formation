import type { TacticalScene, TrainingArea } from "../domain/tactical-scene";

/** Return a real field region; local training surfaces deliberately have no parent-pitch position. */
export function contextArea(scene: TacticalScene, focus: "delivery" | "box" = "delivery"): TrainingArea {
  const { length: l, width: w } = scene.field, c = scene.context;
  const box = (x: number, y: number, length: number, width: number) => ({ origin: { x, y }, length, width });
  if (!c || c.kind === "neutral" || c.region === "full") return box(0, 0, l, w);
  if (c.region === "custom") return c.area!;
  const right = c.attack === "positive-x";
  if (c.region === "midfield") return box(l / 3, 0, l / 3, w);
  if (c.region === "set-piece") {
    const s = c.setPiece!, targetRight = s.phase === "attacking" ? right : !right;
    const depth = Math.min(l / 2, 38), location = deliveryLocation(scene);
    const start = targetRight ? Math.min(l - depth, location.x) : 0;
    const end = targetRight ? l : Math.max(depth, location.x);
    const left = (s.side === "left") === targetRight;
    const minY = focus === "box" ? Math.max(0, w / 2 - 24) : left ? 0 : Math.max(0, w / 2 - 24);
    const maxY = focus === "box" ? Math.min(w, w / 2 + 24) : left ? Math.min(w, w / 2 + 24) : w;
    return box(start, minY, end - start, maxY - minY);
  }
  const attackRegion = c.region === "attacking-third" || c.region === "attacking-half";
  const atRight = attackRegion ? right : !right, depth = c.region.endsWith("half") ? l / 2 : l / 3;
  return box(atRight ? l - depth : 0, 0, depth, w);
}

/** Derive distinct left/right deliveries in parent-pitch coordinates, independent of camera orientation. */
export function deliveryLocation(scene: TacticalScene) {
  const { length: l, width: w } = scene.field, c = scene.context;
  if (c?.kind !== "pitch" || !c.setPiece) return { x: l / 2, y: w / 2 };
  const s = c.setPiece, right = (c.attack === "positive-x") === (s.phase === "attacking");
  if (s.type === "corner") return { x: right ? l : 0, y: (s.side === "left") === right ? 0 : w };
  if (s.location) return { ...s.location };
  const depth = s.type === "penalty" ? 11 : s.type === "wide-free-kick" ? 28 : 22;
  return { x: right ? l - depth : depth, y: s.type === "wide-free-kick" ? ((s.side === "left") === right ? 7 : w - 7) : w / 2 };
}
