import { domainBundleSchema, type DomainBundle } from "../domain/validation";
import type { ExerciseContent } from "../domain/session";
import { reviseSession, reviseExercise, reviseTemplate } from "../coaching/sessions";
import { latestEvents } from "../calendar/schedule";
import { prepareScene } from "./evaluate";
import { contextArea } from "./context";
import type { TacticalScene } from "../domain/tactical-scene";

export type DiagramTarget = { kind: "session" | "exercise" | "template"; id: string; revision: number; activity?: string; event?: string; booking?: number; diagram: number | null };
/** Construct an exact target URL; a missing diagram index explicitly means creating a new diagram. */
export function diagramHref(target: DiagramTarget): string {
  const query = new URLSearchParams({ kind: target.kind, id: target.id, revision: String(target.revision), diagram: target.diagram === null ? "new" : String(target.diagram) });
  if (target.activity) query.set("activity", target.activity); if (target.event) query.set("event", target.event); if (target.booking) query.set("booking", String(target.booking));
  return `/tactical-editor?${query}`;
}
/** Resolve only the requested immutable record/activity/pin, never substituting a newer revision. */
export function resolveDiagramTarget(bundle: DomainBundle, target: DiagramTarget): { content: ExerciseContent; scene?: TacticalScene; readOnly: boolean; title: string } {
  const collection = target.kind === "session" ? bundle.sessions : target.kind === "exercise" ? bundle.exercises : bundle.templates;
  const record = collection.find((r) => r.id === target.id && r.revision === target.revision);
  if (!record) throw new Error("Requested saved revision is unavailable");
  const content = "activities" in record.content ? record.content.activities.find((a) => a.id === target.activity)?.content : record.content;
  if (!content) throw new Error("Requested activity is unavailable");
  let readOnly = collection.some((r) => r.id === target.id && r.revision > target.revision);
  if (target.kind === "session") {
    const bookings = latestEvents(bundle).filter((e) => e.session?.id === target.id);
    const event = target.event ? bundle.events.find((e) => e.id === target.event && e.revision === target.booking) : undefined;
    if (target.event && (!event || event.session?.id !== target.id || event.session.revision !== target.revision)) throw new Error("Booking/session revision mismatch");
    if (event) readOnly = latestEvents(bundle).find((e) => e.id === event.id)?.revision !== event.revision;
    else if (bookings.length) readOnly = true;
  }
  const pin = target.diagram === null ? undefined : content.diagrams[target.diagram];
  if (target.diagram !== null && !pin) throw new Error("Requested diagram reference is unavailable");
  const scene = pin ? bundle.scenes.find((s) => s.id === pin.scene.id && s.revision === pin.scene.revision) : undefined;
  if (pin && !scene) throw new Error("Exact scene revision is unavailable");
  return { content, scene, readOnly, title: content.title };
}
/** Atomically append scene and owner revisions; only the selected activity/exercise and booking get a new pin. */
export function saveDiagram(input: DomainBundle, target: DiagramTarget, draft: TacticalScene): { bundle: DomainBundle; target: DiagramTarget; scene: TacticalScene } {
  const bundle = domainBundleSchema.parse(input), resolved = resolveDiagramTarget(bundle, target);
  if (resolved.readOnly) throw new Error("Open the current saved owner revision before editing");
  const parsed = prepareScene(draft);
  if (parsed.organizationId !== bundle.organizationId) throw new Error("Organisation mismatch");
  if (resolved.scene && (parsed.id !== resolved.scene.id || parsed.revision !== resolved.scene.revision)) throw new Error("Scene draft does not match its pinned source");
  const versions = bundle.scenes.filter((s) => s.id === parsed.id);
  if (!resolved.scene && versions.length) throw new Error("A new diagram must have an independent identity");
  const scene = prepareScene({ ...parsed, revision: versions.length ? Math.max(...versions.map((s) => s.revision)) + 1 : 1 });
  const next = structuredClone(bundle); next.scenes.push(scene);
  const content = structuredClone(resolved.content), index = target.diagram ?? content.diagrams.length;
  content.diagrams[index] = { scene: { id: scene.id, revision: scene.revision }, representativeSeconds: 0 };
  if (scene.context) content.area = contextArea(scene);
  const updated = { ...target, diagram: index };
  if (target.kind === "exercise") {
    const record = next.exercises.find((r) => r.id === target.id && r.revision === target.revision)!;
    return { bundle: reviseExercise(next, { ...record, content }), target: { ...updated, revision: record.revision + 1 }, scene };
  }
  if (target.kind === "template") {
    const record = next.templates.find((r) => r.id === target.id && r.revision === target.revision)!;
    const activities = record.content.activities.map((a) => a.id === target.activity ? { ...a, content } : a);
    return { bundle: reviseTemplate(next, { ...record, content: { ...record.content, activities } }), target: { ...updated, revision: record.revision + 1 }, scene };
  }
  const record = next.sessions.find((r) => r.id === target.id && r.revision === target.revision)!;
  const activities = record.content.activities.map((a) => a.id === target.activity ? { ...a, content } : a);
  const saved = reviseSession(next, { ...record, content: { ...record.content, activities } }, target.event);
  return { bundle: saved.bundle, target: { ...updated, revision: saved.session.revision, ...(saved.event ? { booking: saved.event.revision } : {}) }, scene };
}
