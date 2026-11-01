import { test } from "node:test";
import assert from "node:assert/strict";
import { blankDesignerDocument, type DesignerDocument } from "../../lib/designer/contract";
import { equipmentOverview, runningOrder } from "../../lib/designer/overview";

function activity(id: string, durationMinutes: number | null, equipment: { name: string; quantity: number | null }[] = []): DesignerDocument["session"]["activities"][number] {
  return { ...blankDesignerDocument().session, id, name: id, role: "exercise", durationMinutes, area: null, equipment, instructions: [], coachingPoints: [], progressions: [], regressions: [], variations: [], diagrams: [] };
}
test("equipment summary sums duplicate names within a practice and compares practices without summing a session kit", () => {
  const rows = equipmentOverview([activity("a", 1, [{ name: "Balls", quantity: 2 }, { name: "Balls", quantity: 3 }]), activity("b", 1, [{ name: "Balls", quantity: 4 }])]);
  assert.deepEqual(rows, [{ name: "Balls", quantity: 5, unknown: false }]);
});
test("equipment summary preserves zero, unknown quantities and separately named equipment", () => {
  assert.deepEqual(equipmentOverview([activity("a", 1, [{ name: "Balls", quantity: null }, { name: "balls", quantity: 0 }, { name: "Cones", quantity: 4 }]), activity("b", 1, [{ name: "Cones", quantity: null }])]), [
    { name: "Balls", quantity: null, unknown: true }, { name: "balls", quantity: 0, unknown: false }, { name: "Cones", quantity: 4, unknown: true },
  ]);
});
test("running order never invents an exact offset after an untimed activity", () => {
  assert.deepEqual(runningOrder([activity("a", 10), activity("b", null), activity("c", 15)]), [{ id: "a", start: 0, end: 10 }, { id: "b", start: 10, end: null }, { id: "c", start: null, end: null }]);
});
test("overview derivation leaves the input document and activity order untouched", () => {
  const input = [activity("b", 2), activity("a", 4)], original = structuredClone(input);
  assert.deepEqual(runningOrder(input), [{ id: "b", start: 0, end: 2 }, { id: "a", start: 2, end: 6 }]);
  equipmentOverview(input); assert.deepEqual(input, original);
});
