import { companionExample } from "./companion";
import { tacticalExamples } from "../../lib/tactical/examples";

export function attachmentExample() {
  const p = companionExample(); p.document.session.name = "Rondos & team shape";
  p.sceneNamespace = "renderer-examples";
  const small = structuredClone(tacticalExamples[0].scene), full = structuredClone(tacticalExamples[4].scene);
  p.scenes = [small, { ...structuredClone(small), revision: 2 }, full];
  p.document.session.activities = [{ ...p.document.session.activities[0], name: "5v2 Rondo", durationMinutes: 20,
    instructions: ["Five attackers keep possession. Rotate defenders after each two-minute block."],
    coachingPoints: ["Receive with an open body shape.", "Create a supporting angle before the pass."],
    diagrams: [{ scene: { id: small.id, revision: 1 }, representativeSeconds: 2 }] },
    { ...structuredClone(p.document.session.activities[0]), id: "activity-2", name: "11v11 Team Shape", diagrams: [{ scene: { id: full.id, revision: 1 }, representativeSeconds: 3 }] }];
  return p;
}
