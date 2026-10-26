import { sampleCalendar } from "../calendar/sample";
import { domainBundleSchema } from "../domain/validation";

/** Extend synthetic calendar examples with reusable records; never seed an authenticated organisation. */
export function coachingSample() {
  const bundle = sampleCalendar();
  const source = bundle.sessions.find((s) => s.content.activities.length)!;
  bundle.exercises.push({ schemaVersion: "1.0", organizationId: bundle.organizationId,
    id: "sample-rondo-exercise", revision: 1, content: structuredClone(source.content.activities[1].content) });
  bundle.templates.push({ schemaVersion: "1.0", organizationId: bundle.organizationId,
    id: "sample-possession-template", revision: 1, content: structuredClone(source.content) });
  return domainBundleSchema.parse(bundle);
}
