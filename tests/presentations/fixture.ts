import { coachingSample } from "../../lib/coaching/sample";
import { domainBundleSchema } from "../../lib/domain/validation";
import { animationExamples } from "../../lib/tactical/animation-examples";
import { editorExamples } from "../../lib/tactical/editor-examples";
/** Synthetic saved records for tests only. Never imported by application code or seeded remotely. */
export function presentationFixture() {
  const bundle = coachingSample();
  const session = bundle.sessions.find(s => s.content.activities.length >= 4)!;
  for (const [index, example] of [editorExamples.find(e => e.id === "rondo")!, ...animationExamples.filter(e => ["animation-passing", "animation-corner"].includes(e.id))].entries()) {
    const scene = structuredClone(example.scene); scene.organizationId = bundle.organizationId;
    scene.id = `presentation-${index}`; scene.stages = index === 0 ? [] : scene.stages;
    bundle.scenes.push(scene);
    session.content.activities[index].content.diagrams = [{ scene: { id: scene.id, revision: scene.revision }, representativeSeconds: 0 }];
    bundle.exercises.push({ schemaVersion: "1.0", organizationId: bundle.organizationId, id: `presentation-exercise-${index}`, revision: 1,
      content: { ...structuredClone(session.content.activities[index].content), title: example.title } });
  }
  return domainBundleSchema.parse(bundle);
}
