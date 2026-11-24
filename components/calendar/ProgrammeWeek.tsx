"use client";

import { useId, type ReactNode } from "react";
import { ArrowRight, CalendarDays, Check, ChevronRight, Layers3, MapPin, Plus, Trophy } from "lucide-react";
import type { CalendarEvent } from "@/lib/domain/calendar";
import type { DomainBundle } from "@/lib/domain/validation";
import { eventSession, localParts, sessionLabels } from "@/lib/calendar/schedule";
import { bookingOnDay, fixtureDayLabel } from "@/lib/calendar/programme";
import { SessionTypeIcon } from "./SessionTypeIcon";

type WeekProps = {
  bundle: DomainBundle; dates: string[]; date: string; events: CalendarEvent[]; selected?: string;
  team: string; fixtures: CalendarEvent[]; disabled: boolean; fixturePreview?: ReactNode;
  onDate: (day: string) => void; onSelect: (event: CalendarEvent, day: string) => void;
  onChoose: (day: string) => void; onAdd: (day: string) => void;
};

const familyLabels = { training: "Training", goalkeeper: "GK", recovery: "Recovery", fixture: "Match", other: "Other" } as const;

function formatDate(day: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-AU", { ...options, timeZone: "UTC" }).format(new Date(day + "T12:00:00Z"));
}

function bookingFamily(bundle: DomainBundle, event: CalendarEvent): keyof typeof familyLabels {
  if (event.kind === "fixture") return "fixture";
  const kind = eventSession(bundle, event)?.content.kind;
  if (kind === "goalkeeper" || kind === "recovery") return kind;
  return event.kind === "training" || event.kind === "testing" ? "training" : "other";
}

function EventRow({ props, event, day }: { props: WeekProps; event: CalendarEvent; day: string }) {
  const descriptionId = useId();
  const session = eventSession(props.bundle, event);
  const fixture = event.kind === "fixture";
  const kind = session?.content.kind ?? "other";
  const family = bookingFamily(props.bundle, event);
  const category = fixture ? "Match" : session ? sessionLabels[kind] : event.kind;
  const selected = event.id === props.selected;
  const start = event.startsAt ? localParts(event.startsAt, event.timeZone) : null;
  const end = event.endsAt ? localParts(event.endsAt, event.timeZone) : null;
  const overnight = !!(start && end && start.date !== end.date);
  const displayTime = (part: NonNullable<typeof start>) => overnight ? part.date + " " + part.time : part.time;
  const continued = event.localDate < day;
  const location = [event.venue, event.areaLabel].filter(Boolean).join(" · ");
  const team = !props.team ? props.bundle.teams.find(item => item.id === event.teamId)?.name : undefined;

  return <li>
    <button type="button" className="focused-programme-booking" data-booking={event.id} data-family={family}
      data-status={event.status} aria-pressed={selected} aria-label={event.title + ", " + event.localDate + ", " + category}
      aria-describedby={descriptionId} title={event.title}
      onClick={() => props.onSelect(event, day)}>
      <span id={descriptionId} hidden>{[selected ? "Selected Calendar booking" : "Open the contextual inspector for this booking", start && displayTime(start), end && "Ends " + displayTime(end), event.timeZone, event.status, continued && "Continued booking", session?.content.objective, location, team].filter(Boolean).join(". ")}</span>
      <span className="focused-programme-booking-clock">
        <time dateTime={event.startsAt ?? undefined}>{start ? displayTime(start) : "Time TBC"}</time>
        {end && <small>to {displayTime(end)}</small>}
        {continued && <small>Continued</small>}
        {event.timeZone !== "Australia/Sydney" && <small>{event.timeZone}</small>}
      </span>
      <span className="focused-programme-booking-icon">{fixture ? <Trophy size={20} aria-hidden="true" /> : <SessionTypeIcon kind={kind} />}</span>
      <span className="focused-programme-booking-copy">
        <strong>{event.title}</strong>
        {session?.content.objective && <span className="focused-programme-booking-objective">{session.content.objective}</span>}
        <span className="focused-programme-booking-meta">
          <span className="focused-programme-category">{category}</span>
          {location && <span className="focused-programme-booking-place"><MapPin size={13} aria-hidden="true" />{location}</span>}
          {team && <span>{team}</span>}
          {event.status !== "confirmed" && <span className="focused-programme-status">{event.status}</span>}
        </span>
      </span>
      <span className="focused-programme-selection-mark" aria-hidden="true">{selected ? <Check size={17} /> : <ChevronRight size={16} />}</span>
    </button>
  </li>;
}

export function ProgrammeWeek(props: WeekProps) {
  const descriptionId = useId();
  const days = props.dates.map(day => {
    const events = props.events.filter(event => bookingOnDay(event, day));
    return { day, events, families: [...new Set(events.map(event => bookingFamily(props.bundle, event)))] };
  });
  const active = days.find(row => row.day === props.date) ?? days[0];
  if (!active) return null;
  const fixtureAnchor = props.team && props.fixtures.length === 1 ? props.fixtures[0] : undefined;
  const offset = fixtureDayLabel(active.day, fixtureAnchor);
  const upcoming = props.events.filter(event => event.kind === "fixture" && event.status !== "cancelled" &&
    event.localDate > active.day && props.dates.includes(event.localDate)).sort((a,b) => a.localDate.localeCompare(b.localDate))[0];
  const kickoff = upcoming?.startsAt ? localParts(upcoming.startsAt, upcoming.timeZone).time : "Time TBC";
  const bookingCount = (count: number) => count + (count === 1 ? " booking" : " bookings");

  return <section className="focused-programme" aria-label="Weekly overview and focused day">
    <nav className="focused-programme-week-strip" aria-label="Seven days">
      {days.map(({ day, events, families }) => <button type="button" key={day} data-day={day}
        aria-label={"Select " + day} aria-pressed={day === active.day}
        aria-describedby={descriptionId + day}
        onClick={() => props.onDate(day)}>
        <span id={descriptionId + day} hidden>{(day === active.day ? "Current Calendar date. " : "") + bookingCount(events.length) + (families.length ? ". " + families.map(family => family === "goalkeeper" ? "Goalkeeper" : familyLabels[family]).join(", ") : "")}</span>
        <span className="focused-programme-day-top"><span>{formatDate(day, { weekday: "short" })}</span><span className="focused-programme-day-count" aria-hidden="true">{events.length}</span></span>
        <strong>{formatDate(day, { day: "numeric", month: "short" })}</strong>
        <span className="focused-programme-day-families" aria-hidden="true">
          {families.length ? families.map(family => <span key={family} data-family={family}>
            {family === "fixture" ? <Trophy size={12} /> : <i />}
            {familyLabels[family]}
          </span>) : <span className="focused-programme-unbooked">No bookings</span>}
        </span>
      </button>)}
    </nav>
    <section className="focused-programme-day" aria-label={formatDate(active.day, { weekday: "long", day: "numeric", month: "long" })} data-day={active.day}>
      <header className="focused-programme-day-heading">
        <div>
          <h2>{formatDate(active.day, { weekday: "long", day: "numeric", month: "long" })}</h2>
          <p>{bookingCount(active.events.length)}{offset && <> <span aria-hidden="true">·</span> {offset}</>}</p>
        </div>
        <div className="focused-programme-day-actions">
          <button type="button" disabled={props.disabled} onClick={() => props.onChoose(active.day)}><Layers3 size={16} aria-hidden="true" />Choose session</button>
          <button type="button" disabled={props.disabled || !props.bundle.teams.length} onClick={() => props.onAdd(active.day)}><Plus size={16} aria-hidden="true" />Add session</button>
        </div>
      </header>
      {active.events.length ? <ol className="focused-programme-bookings" aria-label="Scheduled bookings">
        {active.events.map(event => <EventRow key={event.id} props={props} event={event} day={active.day} />)}
      </ol> : <p className="focused-programme-empty"><CalendarDays size={21} aria-hidden="true" />No bookings for this day</p>}
    </section>
    {props.fixturePreview && <div className="focused-programme-fixture-preview">{props.fixturePreview}</div>}
    {upcoming && <button type="button" className="focused-programme-next" onClick={() => props.onSelect(upcoming, upcoming.localDate)}
      aria-label={"Open next fixture, " + upcoming.title}>
      <span className="focused-programme-next-icon"><Trophy size={19} aria-hidden="true" /></span>
      <span className="focused-programme-next-title"><small>Next fixture</small><strong>{upcoming.title}</strong></span>
      <span className="focused-programme-next-context"><strong>{formatDate(upcoming.localDate, { weekday: "short", day: "numeric", month: "short" })} · {kickoff}</strong>
        {upcoming.venue && <span><MapPin size={13} aria-hidden="true" />{upcoming.venue}</span>}</span>
      <ArrowRight size={17} aria-hidden="true" />
    </button>}
  </section>;
}
