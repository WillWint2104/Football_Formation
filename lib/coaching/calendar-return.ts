import type { CalendarEvent } from "../domain/calendar";
import type { DomainBundle } from "../domain/validation";
import { calendarHref, parseCalendarNavigation, type CalendarNavigation } from "../calendar/navigation";

/** Navigation metadata only; no arbitrary return URL, membership authority or saved content. */
export type CalendarReturn = Pick<CalendarNavigation, "date" | "view" | "organization" | "team" | "type" | "event" | "bookingRevision">;
const keys = ["date", "view", "organization", "team", "type", "event", "bookingRevision"];
export function parseCalendarReturn(raw: unknown): CalendarReturn | null {
  if (typeof raw !== "string" || raw.length > 2000) return null;
  const query = new URLSearchParams(raw);
  if ([...query.keys()].some(k => !keys.includes(k) || query.getAll(k).length !== 1)) return null;
  const parsed = parseCalendarNavigation(Object.fromEntries(query));
  if (!parsed.success || !parsed.data.organization || !parsed.data.date || !parsed.data.view || !parsed.data.event || !parsed.data.bookingRevision) return null;
  return parsed.data;
}
export function withCalendar(href: string, context?: CalendarReturn): string {
  if (!context) return href;
  const url = new URL(href, "http://internal");
  if (url.origin !== "http://internal" || !["/sessions", "/guides", "/tactical-editor"].includes(url.pathname)) throw new Error("Invalid coaching destination");
  const encoded = calendarHref(context).split("?")[1];
  if (!parseCalendarReturn(encoded)) throw new Error("Invalid Calendar return context");
  url.searchParams.set("calendar", encoded);
  return url.pathname + "?" + url.searchParams;
}
export function calendarReturnProblem(bundle: DomainBundle, context: CalendarReturn, eventId?: string, revision?: number): string | undefined {
  if (context.organization !== bundle.organizationId) return "The Calendar context belongs to another organisation.";
  if (context.event !== eventId || context.bookingRevision !== revision) return "The Calendar context does not match this exact booking.";
  const event = bundle.events.find(e => e.id === eventId && e.revision === revision);
  if (!event || context.team && context.team !== event.teamId || context.team && !bundle.teams.some(t => t.id === context.team)) return "The Calendar team or booking is unavailable.";
}
export function updatedCalendarReturn(context: CalendarReturn, event: CalendarEvent): CalendarReturn {
  return { ...context, event: event.id, bookingRevision: event.revision, team: context.team ? event.teamId : undefined };
}
export function savedCalendarHref(context: CalendarReturn, event: CalendarEvent, notice: "session-saved" | "diagram-saved") {
  return calendarHref({ ...updatedCalendarReturn(context, event), focus: "date", notice });
}
