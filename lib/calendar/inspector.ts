import type { CalendarEvent } from "../domain/calendar";
import type { DomainBundle } from "../domain/validation";
import { eventSession } from "./schedule";

/** Read only the booking's exact session and authored diagram pins; never choose substitute sources. */
export function inspectBooking(bundle: DomainBundle, event: CalendarEvent) {
  const candidate = eventSession(bundle, event);
  const session = event.organizationId === bundle.organizationId && candidate?.organizationId === bundle.organizationId && candidate.teamId === event.teamId ? candidate : null;
  const problem = event.session && !session ? "The exact booked session revision is unavailable. No other session was selected." : null;
  const diagrams = session?.content.activities.flatMap((activity, activityIndex) => activity.content.diagrams.map((pin, diagramIndex) => ({
    key:`${activity.id}:${diagramIndex}`, activity, activityIndex, diagramIndex, pin,
    scene:bundle.scenes.find(s => s.organizationId === bundle.organizationId && s.id === pin.scene.id && s.revision === pin.scene.revision) ?? null,
  }))) ?? [];
  return { session, problem, diagrams };
}
