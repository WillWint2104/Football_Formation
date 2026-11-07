import { z } from "zod";
import { idSchema, revisionRefSchema } from "../domain/common";
import { sessionSchema } from "../domain/session";
import { domainBundleSchema, type DomainBundle } from "../domain/validation";
import { latestEvents, scheduleChange, type ScheduleInput } from "../calendar/schedule";
import { latest } from "./sessions";

/** A URL carries an operation identity, not a credential or a second persistence store. */
export const sessionCopyRequestSchema = z.strictObject({
  organizationId: idSchema,
  source: revisionRefSchema,
  requestId: z.uuid(),
});
export type SessionCopyRequest = z.infer<typeof sessionCopyRequestSchema>;

export function sessionCopyIds(request: SessionCopyRequest) {
  const parsed = sessionCopyRequestSchema.parse(request);
  return { sessionId: `scheduled-session-${parsed.requestId}`, eventId: `scheduled-event-${parsed.requestId}` };
}

/** Recover only this request's original source snapshot; a colliding URL must not claim another copy. */
export function sessionCopyOccurrence(bundle: DomainBundle, request: SessionCopyRequest) {
  const parsed = sessionCopyRequestSchema.parse(request), ids = sessionCopyIds(parsed);
  if (parsed.organizationId !== bundle.organizationId) return undefined;
  const source = bundle.sessions.find((s) => s.id === parsed.source.id && s.revision === parsed.source.revision);
  const firstCopy = bundle.sessions.find((s) => s.id === ids.sessionId && s.revision === 1);
  const firstEvent = bundle.events.find((e) => e.id === ids.eventId && e.revision === 1);
  if (!source || !firstCopy || firstEvent?.session?.id !== ids.sessionId || firstEvent.session.revision !== 1 || firstEvent.teamId !== source.teamId) return undefined;
  const expected = sessionSchema.parse({ ...source, id: ids.sessionId, revision: 1, documents: [] });
  if (JSON.stringify(firstCopy) !== JSON.stringify(expected)) return undefined;
  const event = latestEvents(bundle).find((e) => e.id === ids.eventId);
  return event?.session?.id === ids.sessionId && bundle.sessions.some((s) => s.id === ids.sessionId && s.revision === event.session?.revision) ? event : undefined;
}

/** Copy one exact current source and allocate both records before the existing atomic graph save. */
export function scheduleSessionCopy(inputBundle: DomainBundle, input: ScheduleInput, request: SessionCopyRequest) {
  const bundle = domainBundleSchema.parse(inputBundle), parsed = sessionCopyRequestSchema.parse(request);
  if (parsed.organizationId !== bundle.organizationId) throw new Error("The preview belongs to another organisation. Reopen it in the correct workspace.");
  const source = bundle.sessions.find((s) => s.id === parsed.source.id && s.revision === parsed.source.revision);
  if (!source) throw new Error("The exact previewed session is unavailable. Nothing was scheduled.");
  if (latest(bundle.sessions).find((s) => s.id === source.id)?.revision !== source.revision)
    throw new Error("The source session changed. Preview its current revision before scheduling a copy.");
  if (source.teamId !== input.teamId) throw new Error("The scheduled copy must retain the source team. No team or staff reassignment was made.");
  const { sessionId, eventId } = sessionCopyIds(parsed);
  if (bundle.sessions.some((s) => s.id === sessionId) || bundle.events.some((e) => e.id === eventId))
    throw new Error("This scheduling request has already been used. Reopen the saved occurrence; do not submit it again.");
  let allocated = 0;
  const result = scheduleChange(bundle, { ...input, title: source.content.title, kind: source.content.kind }, undefined,
    () => allocated++ === 0 ? sessionId : eventId);
  const session = sessionSchema.parse({ ...structuredClone(source), id: sessionId, revision: 1, documents: [] });
  result.bundle.sessions = result.bundle.sessions.map((s) => s.id === sessionId ? session : s);
  return { bundle: domainBundleSchema.parse(result.bundle), event: result.event, session };
}
