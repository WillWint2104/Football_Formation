import type { DesignerDocument } from "./contract";
import { exportDocument } from "./contract";
import { resolvePackageDiagram, validateSessionPackage, type SessionPackage } from "./package";

export type DiagramPin = DesignerDocument["session"]["activities"][number]["diagrams"][number];
export type AttachmentEdit = { activityId: string; index: number | null; pin: DiagramPin | null };
const checked = <T>(result: { ok: true; value: T } | { ok: false; diagnostics: { message: string }[] }): T => {
  if (!result.ok) throw new Error(result.diagnostics.slice(0, 4).map((d) => d.message).join(" "));
  return result.value;
};

/** Query projection only: unfinished coaching text does not invalidate an otherwise exact pin.
 * This document is never displayed, saved or substituted for the editing draft. B1 still resolves it.
 */
export function previewAttachment(library: SessionPackage, activityId: string, pin: DiagramPin) {
  const query = structuredClone(library);
  query.document.session.activities = [{ id: activityId, name: "Resolution query", role: "exercise", durationMinutes: null,
    playerCount: null, area: null, equipment: [], instructions: [], coachingPoints: [], progressions: [], regressions: [], variations: [], diagrams: [pin] }];
  return resolvePackageDiagram(query, activityId, 0);
}

/** A new coherent candidate, never a mutation of either source package or editable draft. */
export function attachmentCandidate(document: DesignerDocument, base: SessionPackage | null, source?: SessionPackage, edit?: AttachmentEdit): SessionPackage {
  if (base && source && base.sceneNamespace !== source.sceneNamespace) throw new Error("This scene belongs to a different namespace. Existing pins cannot be remapped.");
  if (!base && document.session.activities.some((a) => a.diagrams.length)) throw new Error("This reference-only draft has no associated scene namespace. Open its complete package, or explicitly remove its unresolved references first.");
  const next = structuredClone(document);
  if (edit) {
    const activity = next.session.activities.find((a) => a.id === edit.activityId);
    if (!activity) throw new Error("The selected activity no longer exists.");
    if (edit.index === null) {
      if (!edit.pin) throw new Error("Choose an exact scene reference.");
      activity.diagrams.push(structuredClone(edit.pin));
    } else {
      if (!Number.isInteger(edit.index) || !activity.diagrams[edit.index]) throw new Error("The selected attachment no longer exists.");
      if (edit.pin) activity.diagrams[edit.index] = structuredClone(edit.pin);
      else activity.diagrams.splice(edit.index, 1);
    }
  }
  const scenes = [...(base?.scenes ?? [])];
  if (source && edit?.pin) {
    const resolved = checked(previewAttachment(source, edit.activityId, edit.pin));
    const previous = scenes.find((s) => s.id === resolved.scene.id && s.revision === resolved.scene.revision);
    if (previous && !sameDocument(previous, resolved.scene)) throw new Error("Different scene contents claim the same immutable revision.");
    if (!previous) scenes.push(resolved.scene);
  }
  return checked(validateSessionPackage({ format: "football-formation-session-package", schemaVersion: "1.0",
    sceneNamespace: base?.sceneNamespace ?? source?.sceneNamespace ?? null, document: exportDocument(next),
    scenes }));
}

/** Order-insensitive object comparison, with meaningful array order preserved. */
export function sameDocument(a: unknown, b: unknown): boolean {
  const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical) : v !== null && typeof v === "object"
    ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, value]) => [k, canonical(value)])) : v;
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}
