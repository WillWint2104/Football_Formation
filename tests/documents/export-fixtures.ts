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
  { id: "session-guide", title: "Possession to penetration - complete session", kind: "possession", example: "rondo" },
  { id: "synthetic-brand", title: "Synthetic club - possession coaching sheet", kind: "possession", example: "rondo" },
  { id: "unbranded", title: "Unbranded technical practice", kind: "technical", example: "rondo" },
  { id: "multiple-diagrams", title: "Two setups - one possession activity", kind: "possession", example: "rondo" },
  { id: "extended-cover", title: "Detailed coaching plan - optional cover", kind: "possession", example: "rondo" },
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
  if (id === "long-session" || id === "extended-cover") {
    session.content.activities = Array.from({ length: 8 }, (_, index) => ({ ...structuredClone(activity), id: `long-${index}`, role: index === 0 ? "warm-up" as const : index === 7 ? "cool-down" as const : "exercise" as const,
      content: { ...structuredClone(activity.content), title: `Activity ${index + 1} - build and progress`, instructions: Array.from({ length: 8 }, (_, step) => `Repetition ${step + 1}: ${source.content.instructions.join(" ")} Maintain the planned spacing and rotate roles between repetitions.`) } }));
  }
  if (id === "session-guide") {
    session.content.activities = [
      { ...structuredClone(activity), id: "session-warm", role: "warm-up", durationMinutes: 10, content: { ...structuredClone(activity.content), title: "Dynamic passing preparation", diagrams: [], instructions: ["Pass and move between the marked stations.", "Build the tempo gradually."], coachingPoints: ["Scan before receiving."], progressions: [], regressions: [], variations: [] } },
      { ...structuredClone(activity), id: "session-rondo", durationMinutes: 20, content: { ...structuredClone(activity.content), title: "5v2 Rondo" } },
      { ...structuredClone(activity), id: "session-progress", durationMinutes: 25, content: { ...structuredClone(activity.content), title: "Directional possession", instructions: ["Retain possession and progress towards the target side.", "Rotate the target players after each block."], coachingPoints: ["Support both sides of the ball."] } },
      { ...structuredClone(activity), id: "session-cool", role: "cool-down", durationMinutes: 10, content: { ...structuredClone(activity.content), title: "Mobility and reflection", diagrams: [], instructions: ["Lower the tempo with light passing and mobility.", "Discuss the passing options created during the session."], coachingPoints: [], progressions: [], regressions: [], variations: [] } },
    ];
  }
  if (id === "multiple-diagrams") {
    const extra = { ...structuredClone(editorExamples.find((example) => example.id === "third")!.scene), id: "export-secondary", organizationId: bundle.organizationId, revision: 1 };
    bundle.scenes.push(extra); activity.content.diagrams.push({ scene: { id: extra.id, revision: 1 }, representativeSeconds: 0 });
  }
  const reference: GuideReference = { session: session.id, revision: 1, event: booking.id, bookingRevision: booking.revision };
  if (id === "historical") {
    const later = structuredClone(session); later.revision = 2; later.content.title = "Later edited session - must not appear in the historical PDF";
    bundle.sessions.push(later); bundle.events.push({ ...structuredClone(booking), revision: booking.revision + 1, session: { id: session.id, revision: 2 } });
  }
  return { bundle: domainBundleSchema.parse(bundle), reference };
}
