import type { DesignerDocument } from "./contract";

/** Display-only rollup: sum repeated names within an activity, then take the largest known activity quantity. */
export function equipmentOverview(activities: DesignerDocument["session"]["activities"]) {
  const result = new Map<string, { name: string; quantity: number | null; unknown: boolean }>();
  for (const activity of activities) {
    const local = new Map<string, { quantity: number; known: boolean; unknown: boolean }>();
    for (const item of activity.equipment) {
      const name = item.name.trim(); if (!name) continue;
      const row = local.get(name) ?? { quantity: 0, known: false, unknown: false };
      if (item.quantity === null) row.unknown = true;
      else { row.quantity += item.quantity; row.known = true; }
      local.set(name, row);
    }
    for (const [name, value] of local) {
      const row = result.get(name) ?? { name, quantity: null, unknown: false };
      if (value.known) row.quantity = row.quantity === null ? value.quantity : Math.max(row.quantity, value.quantity);
      row.unknown ||= value.unknown;
      result.set(name, row);
    }
  }
  return [...result.values()];
}

/** Unknown timing breaks subsequent exact elapsed offsets; no booking or duration is manufactured. */
export function runningOrder(activities: DesignerDocument["session"]["activities"]) {
  let elapsed: number | null = 0;
  return activities.map((activity) => {
    const start = elapsed;
    elapsed = start === null || activity.durationMinutes === null ? null : start + activity.durationMinutes;
    return { id: activity.id, start, end: elapsed };
  });
}
