import type { DomainBundle } from "../domain/validation";
import type { CalendarEvent } from "../domain/calendar";
import type { Session } from "../domain/session";
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

export function withLibraryFilters(href: string, search: string, kind: string) {
  const [path, query] = href.split("?");
  const params = new URLSearchParams(query);
  if (search) params.set("q", search);
  if (kind) params.set("type", kind);
  const value = params.toString();
  return value ? `${path}?${value}` : path;
}

/** A booking preview identifies both snapshots, even when bookings share a session. */
function sessionViewParams(session: Session, booking?: CalendarEvent, preview = false) {
  const params = new URLSearchParams({
    session: session.id, revision: String(session.revision), organization: session.organizationId,
  });
  if (preview) params.set("view", "preview");
  if (booking) {
    params.set("booking", booking.id);
    params.set("bookingRevision", String(booking.revision));
  }
  return params;
}

export function sessionPreviewHref(session: Session, booking?: CalendarEvent) {
  return `/sessions?${sessionViewParams(session, booking, true)}`;
}

export function sessionViewerHref(session: Session, booking?: CalendarEvent) {
  return `/sessions/view?${sessionViewParams(session, booking)}`;
}

export function scopedSessionEditorHref(session: Session, booking?: CalendarEvent) {
  const params = new URLSearchParams(booking
    ? { event: booking.id, revision: String(booking.revision), organization: session.organizationId }
    : { session: session.id, revision: String(session.revision), organization: session.organizationId });
  return `/sessions?${params}`;
}
