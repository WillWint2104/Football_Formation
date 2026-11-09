import type { CalendarEvent } from "../domain/calendar";
import type { DomainBundle } from "../domain/validation";
import { calendarDates, eventSession, latestEvents, localParts } from "./schedule";

/** The existing Calendar's local-date / exclusive-end semantics, including overnight continuations. */
export function bookingOnDay(event: CalendarEvent, day: string): boolean {
  return event.startsAt && event.endsAt
    ? day >= event.localDate && day <= localParts(new Date(Date.parse(event.endsAt) - 1).toISOString(), event.timeZone).date
    : event.localDate === day;
}

/** The first authored attachment only: never replace a missing exact revision with a different diagram. */
export function programmeIllustration(bundle: DomainBundle, event: CalendarEvent) {
  if (event.organizationId !== bundle.organizationId || event.status === "cancelled") return null;
  const session = eventSession(bundle, event);
  const activity = session?.content.activities.find(a => a.content.diagrams.length);
  const pin = activity?.content.diagrams[0];
  const scene = pin && bundle.scenes.find(s => s.organizationId === bundle.organizationId && s.id === pin.scene.id && s.revision === pin.scene.revision);
  return activity && pin && scene ? { activity, pin, scene } : null;
}

/** A read-only projection of current bookings and their exact content pins, never another saved programme. */
export function weekProgramme(bundle: DomainBundle, date: string, team = "") {
  const dates = calendarDates(date, "week");
  const bookings = latestEvents(bundle).filter(e => (!team || e.teamId === team) && dates.some(day => bookingOnDay(e, day)));
  const active = bookings.filter(e => e.status !== "cancelled");
  const sessions = active.flatMap(e => { const session = eventSession(bundle, e); return session ? [session] : []; });
  return { dates, bookings, fixtures: active.filter(e => e.kind === "fixture"), trainingCount: sessions.length,
    focus: [...new Set(sessions.flatMap(s => s.content.focus))],
    objectives: [...new Set(sessions.flatMap(s => s.content.objective ? [s.content.objective] : []))] };
}

export function programmeRange(dates: string[]): string {
  const first = dates[0], last = dates.at(-1);
  if (!first || !last) return "Training programme";
  const format = (date: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-AU", { ...options, timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
  return first.slice(0, 7) === last.slice(0, 7) ? `${Number(first.slice(-2))} – ${format(last, { day: "numeric", month: "long", year: "numeric" })}`
    : `${format(first, { day: "numeric", month: "short", ...(first.slice(0,4) !== last.slice(0,4) ? {year:"numeric"} : {}) })} – ${format(last, { day: "numeric", month: "short", year: "numeric" })}`;
}

/** Calendar-day offset only, not a physiological training-load recommendation. */
export function fixtureDayLabel(day: string, fixture: CalendarEvent | undefined): string | undefined {
  if (!fixture) return undefined;
  const delta = Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${fixture.localDate}T12:00:00Z`)) / 86400000);
  return delta === 0 ? "Match day" : delta < 0 ? `D−${-delta}` : `D+${delta}`;
}
