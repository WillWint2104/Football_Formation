import { coachingSample } from "../../lib/coaching/sample";
import { domainBundleSchema } from "../../lib/domain/validation";
import { tacticalExamples } from "../../lib/tactical/examples";

/** Native synthetic organisation fixtures only; not a local-package promotion implementation. */
export function libraryPreviewExample() {
  const bundle = coachingSample();
  const source = bundle.sessions.find((s) => s.content.title === "Rondos & Positional Play")!;
  const scene = { ...structuredClone(tacticalExamples[0].scene), organizationId: bundle.organizationId };
  bundle.scenes.push(scene, { ...structuredClone(scene), revision: 2 });
  source.content.activities[1].content.area = structuredClone(tacticalExamples[0].area);
  source.content.activities[1].content.diagrams = [
    { scene: { id: scene.id, revision: 1 }, representativeSeconds: 2 },
    { scene: { id: scene.id, revision: 2 }, representativeSeconds: 4 },
  ];
  source.content.activities[1].sourceExercise = { id: bundle.exercises[0].id, revision: 1 };
  source.sourceTemplate = { id: bundle.templates[0].id, revision: 1 };
  source.content.activities[0].durationMinutes = null;
  source.content.activities[1].content.equipment[0].quantity = null;
  return domainBundleSchema.parse(bundle);
}
