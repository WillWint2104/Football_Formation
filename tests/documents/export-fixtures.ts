import { coachingSample } from "../../lib/coaching/sample";
import { domainBundleSchema } from "../../lib/domain/validation";
import { editorExamples } from "../../lib/tactical/editor-examples";
import { contextArea } from "../../lib/tactical/context";
import { tacticalExamples } from "../../lib/tactical/examples";
import type { SessionKind } from "../../lib/domain/session";
import type { GuideReference } from "../../lib/documents/contracts";

export const exportCases = [
  { id: "possession", title: "Rondos & Positional Play", kind: "possession", example: "rondo" },
  { id: "final-third", title: "Final-third combinations", kind: "tactical", example: "third" },
  { id: "goalkeeper", title: "Goalkeeper distribution", kind: "goalkeeper", example: "goalkeeper" },
  { id: "set-piece", title: "Left-corner delivery", kind: "tactical", example: "corner-left" },
  { id: "conditioning", title: "Conditioning circuit", kind: "conditioning", example: "conditioning" },
  { id: "testing", title: "Preseason baseline testing", kind: "testing", example: "conditioning" },
  { id: "full-pitch", title: "Full-pitch team organisation", kind: "tactical", example: "full" },
  { id: "long-session", title: "Extended single-session plan", kind: "possession", example: "rondo" },
  { id: "no-diagrams", title: "Coach-led recovery plan", kind: "recovery", example: null },
  { id: "historical", title: "Historical representative snapshot", kind: "possession", example: "animated" },
] as const;

/** Synthetic acceptance fixtures only; these are never seeded into a saved organisation. */
export function exportFixture(id: string) {
  const entry = exportCases.find((candidate) => candidate.id === id)!;
  const bundle = coachingSample(), session = bundle.sessions.find((candidate) => candidate.content.kind === entry.kind)!;
  const booking = bundle.events.find((event) => event.session?.id === session.id)!;
  if (booking.kind !== "training" && booking.kind !== "testing") throw new Error("Acceptance fixture requires a session booking");
  const source = bundle.sessions.find((candidate) => candidate.content.activities.length)!.content.activities[1];
  session.content.title = entry.title; session.content.kind = entry.kind as SessionKind;
  session.content.objective = "Synthetic acceptance sample. Improve decision making, communication and the execution of the saved activity.";
  session.content.focus = ["Decision making", "Communication"];
  session.content.activities = [structuredClone(source)];
  const activity = session.content.activities[0]; activity.id = "export-activity"; activity.role = "exercise"; activity.content.title = entry.title;
  activity.content.regressions = ["Increase the space and reduce pressure."]; activity.content.variations = ["Change the direction on the coach signal."];
  if (entry.example) {
    const original = entry.example === "animated" ? tacticalExamples[0].scene : editorExamples.find((example) => example.id === entry.example)!.scene;
    const scene = { ...structuredClone(original), id: `export-${id}`, organizationId: bundle.organizationId, revision: 1 };
    bundle.scenes.push(scene); activity.content.diagrams = [{ scene: { id: scene.id, revision: 1 }, representativeSeconds: entry.example === "animated" ? 5 : 0 }];
    activity.content.area = entry.example === "animated" ? structuredClone(tacticalExamples[0].area) : contextArea(scene);
  } else { activity.content.diagrams = []; activity.durationMinutes = null; activity.content.playerCount = null; activity.content.equipment = [{ name: "Markers", quantity: null }]; }
  if (id === "long-session") {
    session.content.activities = Array.from({ length: 8 }, (_, index) => ({ ...structuredClone(activity), id: `long-${index}`, role: index === 0 ? "warm-up" as const : index === 7 ? "cool-down" as const : "exercise" as const,
      content: { ...structuredClone(activity.content), title: `Activity ${index + 1} - build and progress`, instructions: Array.from({ length: 8 }, (_, step) => `Repetition ${step + 1}: ${source.content.instructions.join(" ")} Maintain the planned spacing and rotate roles between repetitions.`) } }));
  }
  const reference: GuideReference = { session: session.id, revision: 1, event: booking.id, bookingRevision: booking.revision };
  if (id === "historical") {
    const later = structuredClone(session); later.revision = 2; later.content.title = "Later edited session - must not appear in the historical PDF";
    bundle.sessions.push(later); bundle.events.push({ ...structuredClone(booking), revision: booking.revision + 1, session: { id: session.id, revision: 2 } });
  }
  return { bundle: domainBundleSchema.parse(bundle), reference };
}
