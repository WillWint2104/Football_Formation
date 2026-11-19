import type { TacticalScene, TrainingArea } from "../domain/tactical-scene";
import type { EvaluatedScene, Point } from "./evaluate";
import { areaBounds, contentBounds, equipmentFootprint, type Bounds } from "./viewport";

export type GridArrangement = "row" | "grid";
export type GridStation = { id: string; label: string; offset: Point; extent: Bounds; area?: TrainingArea; kind: "source" | "repeat" | "authored" };
export type GridPlan = { stations: GridStation[]; extent: Bounds; source: Bounds; authored: boolean; clearance: number | null };
export type InventoryItem = { name: string; quantity: number | null };

export const gridWidth = (b: Bounds) => b.maxX - b.minX;
export const gridDepth = (b: Bounds) => b.maxY - b.minY;

export function mergeBounds(a: Bounds, b: Bounds): Bounds {
  return {
    minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY),
  };
}

export function shiftBounds(bounds: Bounds, offset: Point): Bounds {
  return { minX: bounds.minX + offset.x, minY: bounds.minY + offset.y,
    maxX: bounds.maxX + offset.x, maxY: bounds.maxY + offset.y };
}

export function boundsAsArea(b: Bounds): TrainingArea {
  return { origin:{x:b.minX,y:b.minY}, length:Math.max(.1,gridWidth(b)), width:Math.max(.1,gridDepth(b)) };
}

/** contentBounds includes current and future stage tracks, raw annotation geometry, and goal/ladder footprints. */
export function sourceGridExtent(scene: TacticalScene, area?: TrainingArea): Bounds {
  let extent = contentBounds(scene, area);
  for (const e of scene.entities) {
    if (e.kind !== "equipment" || equipmentFootprint(e).length > 1) continue;
    // Round out point-only equipment to a conservative .25 m planning allowance on each side.
    const { x, y } = e.position;
    extent = mergeBounds(extent,{ minX:x-.25, minY:y-.25, maxX:x+.25, maxY:y+.25 });
  }
  return extent;
}

function rectanglesOverlap(a: Bounds, b: Bounds) {
  return a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;
}

/** Disjoint visible area annotations can be shown together. Nested zones stay part of their single scene. */
export function authoredGridAreas(pose: EvaluatedScene): GridStation[] {
  const candidates = pose.annotations.flatMap(({ id, annotation }) => annotation.kind === "area"
    ? [{ id, label:annotation.label, area:annotation.area, extent:areaBounds(annotation.area) }] : []);
  if (candidates.length < 2 || candidates.some((area,i) =>
    candidates.slice(i+1).some(other=>rectanglesOverlap(area.extent,other.extent)))) return [];
  return candidates.map((area,i) => ({
    ...area, id: "authored-" + area.id, label: area.label || "Area " + (i+1), offset:{x:0,y:0}, kind:"authored",
  }));
}

export function gridPlan(scene: TacticalScene, pose: EvaluatedScene, area: TrainingArea | undefined,
  count: number, arrangement: GridArrangement, clearance: number): GridPlan {
  const source = sourceGridExtent(scene,area);
  const authored = authoredGridAreas(pose);
  if (authored.length > 1) return {stations:authored, extent:source, source, authored:true, clearance:null};
  if (!Number.isInteger(count) || count < 1 || count > 4 || !Number.isFinite(clearance) || clearance < 0 || clearance > 20) {
    throw new RangeError("Use one to four stations with clear spacing from 0 to 20 metres.");
  }
  const columns = arrangement === "grid" ? Math.ceil(Math.sqrt(count)) : count;
  const stations: GridStation[] = Array.from({length:count},(_,index)=>{
    const offset = {
      x:(index % columns) * (gridWidth(source) + clearance),
      y:Math.floor(index / columns) * (gridDepth(source) + clearance),
    };
    return {id:"planning-"+(index+1), label:"Station "+String.fromCharCode(65+index), area,
      kind:index===0?"source":"repeat", offset, extent:shiftBounds(source,offset)};
  });
  return {stations, extent:stations.map(s=>s.extent).reduce(mergeBounds), source, authored:false, clearance:count>1?clearance:null};
}

export function planInventory(equipment: readonly InventoryItem[], count: number) {
  return equipment.map(item => ({
    ...item,
    total:item.quantity === null || !Number.isSafeInteger(item.quantity * count) ? null : item.quantity * count,
  }));
}

