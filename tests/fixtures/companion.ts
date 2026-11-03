import { blankDesignerDocument } from "../../lib/designer/contract";
import { SESSION_PACKAGE_LIMITS, type SessionPackage } from "../../lib/designer/package";

export function companionExample(): SessionPackage {
  const document = blankDesignerDocument();
  document.session.name = "Complete local plan";
  document.session.activities.push({ id: "activity-1", name: "Support", role: "exercise", durationMinutes: null, playerCount: null, area: null, equipment: [], instructions: [], coachingPoints: [], progressions: [], regressions: [], variations: [], diagrams: [{ scene: { id: "movement", revision: 1 }, representativeSeconds: 1 }] });
  return { format: "football-formation-session-package", schemaVersion: "1.0", sceneNamespace: "file-namespace", document, scenes: [{ schemaVersion: "1.0", organizationId: "file-namespace", id: "movement", revision: 1, units: "metres", field: { length: 20, width: 20 }, entities: [{ id: "p6", kind: "player", team: "a", number: 6, position: { x: 2, y: 4 }, headingDegrees: 0, positionLabel: null }], stages: [{ id: "stage-1", title: "Support", durationSeconds: 2, tracks: [] }] }] };
}

/** Valid compact package at the exact portable UTF-8 limit; avoids oversized individual fields. */
export function maximumCompanionPackage(target = SESSION_PACKAGE_LIMITS.bytes): SessionPackage {
  const p = companionExample();
  const size = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;
  const tracks = p.scenes[0].stages[0].tracks;
  let remaining = target - size(p), index = 0;
  while (remaining > 10_200) {
    const track = { id: `note-${index++}`, kind: "annotation" as const, visibleFrom: 0, visibleUntil: 2, annotation: { kind: "note" as const, position: { x: 1, y: 1 }, text: "x".repeat(10_000) } };
    remaining -= size(track) + (tracks.length ? 1 : 0); tracks.push(track);
  }
  p.scenes[0].stages[0].title += "x".repeat(remaining);
  return p;
}
