import { tacticalSceneSchema } from "../../lib/domain/tactical-scene";
import { libraryPreviewExample } from "./library-preview";

/** Explicit synthetic geometry, never seeded into an organisation or substituted for a saved diagram. */
export function coachingPresentationScene(stages = 6, width = 20) {
  return tacticalSceneSchema.parse({ schemaVersion: "1.0", organizationId: "illustrative-club", id: "presentation-practice", revision: 3, units: "metres",
    context: { kind: "neutral", boundary: true }, field: { length: 12, width },
    entities: [{ id: "p6", kind: "player", team: "a", number: 6, positionLabel: null, headingDegrees: 0, position: { x: 3, y: 4 } },
      { id: "p7", kind: "player", team: "b", number: 7, positionLabel: null, headingDegrees: 180, position: { x: 9, y: 8 } },
      ...[{ id: "p1", team: "a", number: 1, x: 2, y: width * .7 }, { id: "p2", team: "a", number: 2, x: 10, y: 2 },
        { id: "p3", team: "a", number: 3, x: 10, y: width - 2 }, { id: "p4", team: "a", number: 4, x: 4, y: width - 3 },
        { id: "p8", team: "b", number: 8, x: 6, y: 8 }].map(p => ({ id: p.id, kind: "player", team: p.team, number: p.number, positionLabel: null, headingDegrees: 0, position: { x: p.x, y: p.y } })),
      { id: "cone", kind: "equipment", equipment: "cone", headingDegrees: 0, position: { x: 1, y: 1 } }],
    stages: Array.from({ length: stages }, (_, i) => ({ id: `phase-${i + 1}`, title: `Authored phase ${i + 1}`, durationSeconds: 2, hiddenEntityIds: i % 2 ? ["cone"] : [],
      tracks: [{ id: `move-${i}`, kind: "player", entityId: "p6", movement: "run", keyframes: [{ seconds: 0, position: { x: 3 + i, y: 4 } }, { seconds: 2, position: { x: 4 + i, y: 6 } }] },
        { id: `zone-${i}`, kind: "annotation", visibleFrom: 0, visibleUntil: 2, annotation: { kind: "area", area: { origin: { x: 1, y: 2 + i }, length: 10, width: 2 }, label: `Authored zone ${i + 1}` } }] })) });
}

export function coachingPresentationBundle(stages = 6, width = 20) {
  const bundle = libraryPreviewExample(), scene = coachingPresentationScene(stages, width);
  scene.organizationId = bundle.organizationId;
  bundle.scenes.push(scene);
  const session = bundle.sessions.find(s => s.content.title === "Rondos & Positional Play")!;
  session.content.activities[1].content.area = { origin: { x: 0, y: 0 }, ...scene.field };
  session.content.activities[1].content.diagrams = [{ scene: { id: scene.id, revision: scene.revision }, representativeSeconds: stages ? 1 : 0 }];
  return { bundle, session, scene };
}
