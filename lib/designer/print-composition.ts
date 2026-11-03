import { exportDocument, type DesignerDocument } from "./contract";
import { validateSessionPackage, type SessionPackage, type ResolvedPackageDiagram } from "./package";
import { previewAttachment } from "./attachments";
import { drawScene, type SceneDrawing } from "../tactical/drawing";
import { coachingExerciseArea } from "../tactical/coaching-view";

export type PrintDiagram = { index: number; namespace: string | null; pin: DesignerDocument["session"]["activities"][number]["diagrams"][number] } &
  ({ status: "ready"; resolved: ResolvedPackageDiagram; drawing: SceneDrawing } | { status: "unavailable"; reason: string });
export type PrintActivity = { activityId: string; diagrams: PrintDiagram[] };

/** One print-only projection of the current validated text and the verified local source.
 * B1 alone validates/resolves the package; no latest-revision lookup, clamping, or data writes. */
export function composePrintActivities(document: DesignerDocument, library: SessionPackage | null, unavailable?: string): PrintActivity[] {
  const clean = exportDocument(document);
  // Keep the current text/attachment sequence. Never print the source package's older document instead.
  const candidate = library && !unavailable ? validateSessionPackage(library) : null;
  const reason = unavailable || (!library ? "The matching complete local plan is not available. Import or reopen its session-and-diagrams package." :
    candidate && !candidate.ok ? `The complete plan could not be validated. ${candidate.diagnostics.slice(0, 2).map(d => d.message).join(" ")}` : "");
  return clean.session.activities.map(activity => ({ activityId: activity.id, diagrams: activity.diagrams.map((pin, index): PrintDiagram => {
    const base = { index, pin, namespace: candidate?.ok ? candidate.value.sceneNamespace : null };
    if (reason || !candidate?.ok) return { ...base, status: "unavailable", reason };
    const resolved = previewAttachment(candidate.value, activity.id, pin);
    if (!resolved.ok) return { ...base, status: "unavailable", reason: resolved.diagnostics.map(d => d.message).join(" ") };
    try {
      const area = coachingExerciseArea(resolved.value.scene);
      // A stable vector viewport fits A4 width. The aspect is held in CSS, not stretched by print media.
      // Taller boards keep small exercises prominent, with room for the activity's coaching text.
      // Full fields use their natural landscape proportions. This never changes world geometry.
      const width = 760, height = Math.round(Math.max(360, Math.min(600, width * area.width / area.length)));
      const drawing = drawScene(resolved.value.scene, { width, height, padding: 30, fit: "exercise", exerciseArea: area,
        paint: "coaching-light", seconds: resolved.value.representativeSeconds, paths: "stage", labels: true,
        gridMetres: area.length > 40 ? 5 : 1 });
      return { ...base, status: "ready", resolved: { ...resolved.value, diagramIndex: index }, drawing };
    } catch { return { ...base, status: "unavailable", reason: "This exact scene could not be drawn. Review it in the diagram workspace before printing." }; }
  }) }));
}
