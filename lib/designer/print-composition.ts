import { exportDocument, type DesignerDocument } from "./contract";
import { validateSessionPackage, type SessionPackage, type ResolvedPackageDiagram } from "./package";
import { previewAttachment } from "./attachments";
import { drawScene, type SceneDrawing } from "../tactical/drawing";
import { coachingExerciseArea } from "../tactical/coaching-view";

export type PrintDiagram = { index: number; namespace: string | null; layout: "wide" | "split" | "compact"; pin: DesignerDocument["session"]["activities"][number]["diagrams"][number] } &
  ({ status: "ready"; resolved: ResolvedPackageDiagram; drawing: SceneDrawing } | { status: "unavailable"; reason: string });
export type PrintActivity = { activityId: string; presentation: "split" | "balanced" | "wide" | "sequence"; diagrams: PrintDiagram[] };

type ReadyDiagram = Extract<PrintDiagram, { status: "ready" }>;

function drawingFor(resolved: ResolvedPackageDiagram, layout: PrintDiagram["layout"]) {
  const area = coachingExerciseArea(resolved.scene);
  // Glyphs remain screen-sized in the shared renderer. Match viewport width to the physical column
  // so a two-up board retains ~9pt player numbers instead of scaling a full-width drawing down.
  const width = layout === "compact" ? 380 : layout === "split" ? 500 : 760;
  const height = layout === "compact" ? 300 : layout === "split" ? 380 : Math.round(Math.max(360, Math.min(480, width * area.width / area.length)));
  return drawScene(resolved.scene, { width, height, padding: 26, fit: "exercise", exerciseArea: area,
    paint: "coaching-light", seconds: resolved.representativeSeconds, paths: "stage", labels: true,
    gridMetres: area.length > 40 ? 5 : 1 });
}

function smallPractice(d: PrintDiagram): d is ReadyDiagram {
  if (d.status !== "ready") return false;
  const area = coachingExerciseArea(d.resolved.scene), players = d.resolved.scene.entities.filter(e => e.kind === "player");
  return area.length <= 30 && area.width <= 30 && players.length <= 10 && players.every(e => e.kind === "player" && String(e.number).length <= 2);
}

function readable(d: ReadyDiagram, layout: PrintDiagram["layout"]): ReadyDiagram | null {
  const drawing = drawingFor(d.resolved, layout), ids = new Set(d.resolved.scene.entities.filter(e => e.kind === "player").map(e => e.id));
  const players = drawing.anchors.filter(a => ids.has(a.id));
  if (drawing.clippedEntities || drawing.labelCollisions || players.some((a, i) => players.slice(i + 1).some(b => Math.hypot(a.screen.x - b.screen.x, a.screen.y - b.screen.y) < 32))) return null;
  return { ...d, layout, drawing };
}

/** Presentation only. Adjacent small diagrams may pair; dense/full fields retain the wide board. */
export function arrangePrintDiagrams(diagrams: PrintDiagram[], allowSplit = true, compactOverview = false): Pick<PrintActivity, "diagrams" | "presentation"> {
  if (allowSplit && diagrams.length === 1 && smallPractice(diagrams[0])) {
    const balanced = compactOverview ? readable(diagrams[0], "compact") : null;
    if (balanced) return { diagrams: [balanced], presentation: "balanced" };
    const split = readable(diagrams[0], "split");
    if (split) return { diagrams: [split], presentation: "split" };
  }
  const arranged = [...diagrams];
  for (let i = 0; i < arranged.length - 1; i++) {
    const a = arranged[i], b = arranged[i + 1];
    if (!smallPractice(a) || !smallPractice(b)) continue;
    const left = readable(a, "compact"), right = readable(b, "compact");
    if (left && right) { arranged[i] = left; arranged[i + 1] = right; i++; }
  }
  const last = arranged.at(-1);
  if (allowSplit && arranged.length > 1 && last && last.layout === "wide" && smallPractice(last)) {
    const compact = readable(last, "compact");
    if (compact) arranged[arranged.length - 1] = compact;
  }
  return { diagrams: arranged, presentation: arranged.some(d => d.layout === "compact") ? "sequence" : "wide" };
}

/** One print-only projection of the current validated text and the verified local source.
 * B1 alone validates/resolves the package; no latest-revision lookup, clamping, or data writes. */
export function composePrintActivities(document: DesignerDocument, library: SessionPackage | null, unavailable?: string): PrintActivity[] {
  const clean = exportDocument(document);
  // Keep the current text/attachment sequence. Never print the source package's older document instead.
  const candidate = library && !unavailable ? validateSessionPackage(library) : null;
  const reason = unavailable || (!library ? "The matching complete local plan is not available. Import or reopen its session-and-diagrams package." :
    candidate && !candidate.ok ? `The complete plan could not be validated. ${candidate.diagnostics.slice(0, 2).map(d => d.message).join(" ")}` : "");
  return clean.session.activities.map((activity, activityIndex) => ({ activityId: activity.id, ...arrangePrintDiagrams(activity.diagrams.map((pin, index): PrintDiagram => {
    const base = { index, pin, layout: "wide" as const, namespace: candidate?.ok ? candidate.value.sceneNamespace : null };
    if (reason || !candidate?.ok) return { ...base, status: "unavailable", reason };
    const resolved = previewAttachment(candidate.value, activity.id, pin);
    if (!resolved.ok) return { ...base, status: "unavailable", reason: resolved.diagnostics.map(d => d.message).join(" ") };
    try {
      const drawing = drawingFor(resolved.value, "wide");
      return { ...base, status: "ready", resolved: { ...resolved.value, diagramIndex: index }, drawing };
    } catch { return { ...base, status: "unavailable", reason: "This exact scene could not be drawn. Review it in the diagram workspace before printing." }; }
  }), activity.equipment.length <= 6 && activity.equipment.reduce((n, e) => n + e.name.length, 0) < 180, activityIndex === 0 && clean.session.activities.length >= 5) }));
}
