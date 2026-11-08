import { programmeExample, programmeBusyExample } from "./programme";
import { domainBundleSchema } from "../../lib/domain/validation";
import { tacticalExamples } from "../../lib/tactical/examples";

/** Synthetic native coaching content only. Reuse existing saved-scene examples, never seed application data. */
export function inspectorExample(busy=false) {
  const bundle=busy ? programmeBusyExample() : programmeExample();
  const session=bundle.sessions.find(s=>s.id==="sample-3")!;
  const example=tacticalExamples.find(e=>e.id==="half-attack")!;
  bundle.scenes.push({...structuredClone(example.scene),organizationId:bundle.organizationId});
  session.content.activities[2].content.area=structuredClone(example.area);
  session.content.activities[2].content.diagrams=[{scene:{id:example.scene.id,revision:example.scene.revision},representativeSeconds:3}];
  return domainBundleSchema.parse(bundle);
}
