import { instantiateTemplate } from "../domain/session";
import { domainBundleSchema, type DomainBundle } from "../domain/validation";
import { latestEvents, scheduleChange, type ScheduleInput } from "../calendar/schedule";
import { latest } from "./sessions";

export type SchedulingSource = { kind: "blank" } | { kind: "session" | "template"; id: string };

/** Schedule an unbooked independent plan or copy an exact reusable template into a new dated instance. */
export function scheduleSession(bundle: DomainBundle, input: ScheduleInput, source: SchedulingSource, eventId?: string) {
  if (eventId || source.kind === "blank") return scheduleChange(bundle, input, eventId);
  const plan = source.kind === "session" ? latest(bundle.sessions).find((s) => s.id === source.id) : undefined;
  const template = source.kind === "template" ? latest(bundle.templates).find((t) => t.id === source.id) : undefined;
  if (!plan && !template) throw new Error("Selected session/template is unavailable");
  if (plan && (plan.teamId !== input.teamId || latestEvents(bundle).some((e) => e.session?.id === plan.id))) throw new Error("Choose an unscheduled session belonging to this team");
  const content = plan?.content ?? template!.content;
  const result = scheduleChange(bundle, { ...input, kind: content.kind, title: plan?.content.title ?? input.title });
  const generatedId = result.event.session!.id;
  if (plan) {
    result.bundle.sessions = result.bundle.sessions.filter((s) => s.id !== generatedId);
    result.event.session = { id: plan.id, revision: plan.revision };
  } else {
    const generated = result.bundle.sessions.find((s) => s.id === generatedId)!;
    const copy = instantiateTemplate(template!, { id: generatedId, teamId: input.teamId, coaches: generated.coaches });
    copy.content.title = input.title;
    result.bundle.sessions = result.bundle.sessions.map((s) => s.id === generatedId ? copy : s);
  }
  result.bundle.events = result.bundle.events.map((e) => e.id === result.event.id && e.revision === result.event.revision ? result.event : e);
  return { bundle: domainBundleSchema.parse(result.bundle), event: result.event };
}
