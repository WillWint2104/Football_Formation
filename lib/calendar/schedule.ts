import { z } from "zod";
import type { CalendarEvent } from "../domain/calendar";
import { timeZoneSchema } from "../domain/calendar";
import { domainBundleSchema, type DomainBundle } from "../domain/validation";
import type { Session, SessionKind } from "../domain/session";

export const sessionLabels: Record<SessionKind, string> = {
  conditioning: "Conditioning", possession: "Possession", goalkeeper: "Goalkeeper",
  technical: "Technical", tactical: "Tactical", recovery: "Recovery",
  testing: "Testing", combined: "Combined", other: "Other",
};

/** Native date inputs can emit extended years that our four-digit domain contracts cannot represent. */
export function isCalendarDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && z.iso.date().safeParse(value).success;
}

/** Read the current revision of each logical record without displaying its history twice. */
export function latestEvents(bundle: DomainBundle): CalendarEvent[] {
  const records = new Map<string, CalendarEvent>();
  for (const event of bundle.events) {
    if (!records.has(event.id) || records.get(event.id)!.revision < event.revision)
      records.set(event.id, event);
  }
  return [...records.values()].sort((a, b) =>
    (a.startsAt ?? a.localDate).localeCompare(b.startsAt ?? b.localDate) || a.id.localeCompare(b.id));
}

/** Resolve the exact session pinned by a booking, including an older saved revision. */
export function eventSession(bundle: DomainBundle, event: CalendarEvent): Session | undefined {
  return event.session ? bundle.sessions.find((s) => s.id === event.session!.id && s.revision === event.session!.revision) : undefined;
}

/** Perform date arithmetic in UTC so browser time zone and DST cannot move a calendar cell. */
export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().split("T")[0];
}

/** Produce a Monday-first week or a complete month, including adjacent dates. */
export function calendarDates(date: string, view: "month" | "week" | "day"): string[] {
  if (view === "day") return [date];
  const anchor = view === "month" ? `${date.slice(0, 7)}-01` : date;
  const weekday = (new Date(`${anchor}T12:00:00Z`).getUTCDay() + 6) % 7;
  const start = addDays(anchor, -weekday);
  const last = new Date(`${anchor}T12:00:00Z`);
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  const count = view === "week" ? 7 : Math.ceil((weekday + last.getUTCDate()) / 7) * 7;
  return Array.from({ length: count }, (_, i) => addDays(start, i)).filter(isCalendarDate);
}

/** Format a saved instant in its explicit IANA zone, never the workstation's default zone. */
export function localParts(instant: string, timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const get = (name: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === name)!.value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

/** Resolve wall time by round trip. Gaps yield no instant; overlaps require an explicit choice. */
export function wallTimeCandidates(date: string, time: string, zone: string): string[] {
  z.iso.date().parse(date);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Enter a valid time");
  timeZoneSchema.parse(zone);
  const wall = Date.parse(`${date}T${time}:00Z`);
  const offsets = new Set<number>();
  for (let hour = -36; hour <= 36; hour += 3) {
    const probe = wall + hour * 3_600_000;
    const parts = localParts(new Date(probe).toISOString(), zone);
    offsets.add(Date.parse(`${parts.date}T${parts.time}:00Z`) - probe);
  }
  return [...offsets].map((offset) => new Date(wall - offset).toISOString().replace(".000Z", "Z"))
    .filter((instant) => { const p = localParts(instant, zone); return p.date === date && p.time === time; }).sort();
}

export type ScheduleInput = {
  title: string; teamId: string; kind: SessionKind; coachId: string;
  date: string; start: string; endDate: string; end: string; timeZone: string;
  startInstant: string; endInstant: string; venue: string; areaLabel: string;
};

/** Append a booking revision or an independent new draft session; never rewrite saved history. */
export function scheduleChange(bundle: DomainBundle, input: ScheduleInput, eventId?: string,
  allocateId: () => string = () => crypto.randomUUID()): { bundle: DomainBundle; event: CalendarEvent } {
  const starts = wallTimeCandidates(input.date, input.start, input.timeZone);
  const ends = wallTimeCandidates(input.endDate, input.end, input.timeZone);
  if (!starts.includes(input.startInstant) || !ends.includes(input.endInstant))
    throw new Error("Choose valid start and end instants; daylight-saving gaps cannot be scheduled");
  if (Date.parse(input.endInstant) <= Date.parse(input.startInstant)) throw new Error("End must follow start");
  const original = eventId ? latestEvents(bundle).find((e) => e.id === eventId) : undefined;
  if (eventId && !original) throw new Error("Booking no longer exists; reload the calendar");
  if (original?.status === "cancelled") throw new Error("Cancelled bookings cannot be rescheduled");
  const next = structuredClone(bundle);
  let session = original?.session ?? null;
  if (!original) {
    const id = allocateId();
    next.sessions.push({ schemaVersion: "1.0", organizationId: bundle.organizationId, id,
      revision: 1, teamId: input.teamId, coaches: input.coachId ? [{ coachId: input.coachId, role: "lead" }] : [],
      sourceTemplate: null, documents: [], content: { title: input.title, kind: input.kind,
        objective: null, focus: [], activities: [] } });
    session = { id, revision: 1 };
  }
  const event = {
    ...(original ?? { schemaVersion: "1.0" as const, organizationId: bundle.organizationId,
      id: allocateId(), kind: input.kind === "testing" ? "testing" as const : "training" as const,
      teamId: input.teamId, session, status: "draft" as const }),
    title: original?.title ?? input.title, revision: (original?.revision ?? 0) + 1,
    localDate: input.date, startsAt: input.startInstant, endsAt: input.endInstant,
    timeZone: input.timeZone, venue: input.venue.trim() || null, areaLabel: input.areaLabel.trim() || null,
  } as CalendarEvent;
  next.events.push(event);
  return { bundle: domainBundleSchema.parse(next), event };
}

/** Warn about overlapping team, staff or explicitly matching venue/area bookings across local dates. */
export function schedulingConflicts(bundle: DomainBundle, event: CalendarEvent): CalendarEvent[] {
  if (!event.startsAt || !event.endsAt) return [];
  const coaches = new Set(eventSession(bundle, event)?.coaches.map((c) => c.coachId));
  return latestEvents(bundle).filter((other) => other.id !== event.id && other.status !== "cancelled" &&
    other.startsAt && other.endsAt && Date.parse(other.startsAt) < Date.parse(event.endsAt!) &&
    Date.parse(other.endsAt) > Date.parse(event.startsAt!) && (
      other.teamId === event.teamId ||
      (event.venue && other.venue?.toLowerCase() === event.venue.toLowerCase() &&
        (!event.areaLabel || !other.areaLabel || other.areaLabel.toLowerCase() === event.areaLabel.toLowerCase())) ||
      eventSession(bundle, other)?.coaches.some((c) => coaches.has(c.coachId))));
}
