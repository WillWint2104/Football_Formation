import type { DomainBundle } from "../domain/validation";
import { eventSession, latestEvents } from "../calendar/schedule";
import { latest } from "./sessions";

/** One catalogue shared by the full library and Calendar picker. Bookings retain their exact pins. */
export function sessionCatalogue(bundle: DomainBundle) {
  const bookings = latestEvents(bundle), bookedIds = new Set(bookings.flatMap((e) => e.session ? [e.session.id] : []));
  return [...bookings.flatMap((event) => {
    const session = eventSession(bundle, event);
    return session ? [{ key: `event-${event.id}`, session, event, href: `/sessions?event=${encodeURIComponent(event.id)}&revision=${event.revision}` }] : [];
  }), ...latest(bundle.sessions).filter((s) => !bookedIds.has(s.id)).map((session) => ({ key: `session-${session.id}`, session, event: undefined, href: `/sessions?session=${encodeURIComponent(session.id)}` }))];
}

export function filterCatalogue(items: ReturnType<typeof sessionCatalogue>, search: string, kind: string, team = "") {
  const text = search.trim().toLowerCase();
  return items.filter(({ session }) => (!team || session.teamId === team) && (!kind || session.content.kind === kind) &&
    [session.content.title, session.content.objective ?? "", ...session.content.focus, ...session.content.activities.map((a) => a.content.title)].join(" ").toLowerCase().includes(text));
}
