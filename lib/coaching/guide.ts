import type { DomainBundle } from "../domain/validation";
import { guideReferenceSchema, type GuideReference } from "../documents/contracts";
import { latest } from "./sessions";
import { latestEvents } from "../calendar/schedule";

/** Resolve one exact saved guide snapshot and its optional exact booking, with no fallback to newer content. */
export function resolveGuide(bundle: DomainBundle, reference: GuideReference) {
  const ref = guideReferenceSchema.parse(reference);
  const session = bundle.sessions.find((s) => s.id === ref.session && s.revision === ref.revision);
  if (!session) return null;
  const event = ref.event ? bundle.events.find((e) => e.id === ref.event && e.revision === ref.bookingRevision) : undefined;
  if (ref.event && (!event || event.session?.id !== session.id || event.session.revision !== session.revision)) return null;
  const historical = event ? latestEvents(bundle).find((e) => e.id === event.id)?.revision !== event.revision
    : latest(bundle.sessions).find((s) => s.id === session.id)?.revision !== session.revision || latestEvents(bundle).some((e) => e.session?.id === session.id);
  return { session, event, historical };
}
