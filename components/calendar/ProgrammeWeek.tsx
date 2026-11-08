"use client";

import { CalendarDays, Flag, Plus } from "lucide-react";
import type { CalendarEvent } from "@/lib/domain/calendar";
import type { DomainBundle } from "@/lib/domain/validation";
import { eventSession, localParts, sessionLabels } from "@/lib/calendar/schedule";
import { bookingOnDay, fixtureDayLabel } from "@/lib/calendar/programme";
import { SessionTypeIcon } from "./SessionTypeIcon";

/** Week presentation only. All selection and scheduling still use the accepted Calendar operations. */
export function ProgrammeWeek({ bundle, dates, date, events, selected, team, fixtures, disabled, onDate, onSelect, onChoose, onAdd }: {
  bundle: DomainBundle; dates: string[]; date: string; events: CalendarEvent[]; selected?: string; team: string; fixtures: CalendarEvent[]; disabled: boolean;
  onDate: (date: string) => void; onSelect: (event: CalendarEvent, day: string) => void; onChoose: (date: string) => void; onAdd: (date: string) => void;
}) {
  const anchorFixture = team && fixtures.length === 1 ? fixtures[0] : undefined;
  return <div className="calendar-grid calendar-week programme-week"><div className="calendar-days">{dates.map(day => {
    const daily = events.filter(e => bookingOnDay(e, day));
    const matchDay = fixtures.some(e => e.localDate === day), offset = fixtureDayLabel(day, anchorFixture);
    return <div key={day} className={`calendar-day${day === date ? " calendar-date-selected" : ""}${matchDay ? " programme-match-day" : ""}`} data-date={day}>
      <button className="calendar-day-number" aria-label={`Select ${day}`} aria-pressed={day === date} onClick={() => onDate(day)}>
        <strong>{new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`))}</strong>
        <span>{offset ?? (matchDay ? "Match day" : "")}</span>
      </button>
      <div className="programme-day-sessions">{daily.map(event => {
        const session = eventSession(bundle, event), kind = event.kind === "fixture" ? "fixture" : session?.content.kind ?? "other";
        const kindLabel = kind === "fixture" ? "Match" : sessionLabels[kind];
        const start = event.startsAt ? localParts(event.startsAt, event.timeZone) : null, end = event.endsAt ? localParts(event.endsAt, event.timeZone) : null;
        const overnight = start && end && start.date !== end.date;
        const minutes = event.startsAt && event.endsAt ? (Date.parse(event.endsAt) - Date.parse(event.startsAt)) / 60000 : null;
        return <button key={event.id} className={`calendar-event calendar-type-${kind}${selected === event.id ? " calendar-event-selected" : ""}${event.status === "cancelled" ? " programme-event-cancelled" : ""}`}
          aria-label={`${event.title}, ${event.localDate}, ${kindLabel}`} aria-pressed={selected === event.id} onClick={() => onSelect(event, day)}>
          <span className="programme-card-kind"><SessionTypeIcon kind={kind} /><b>{kind === "other" && !session ? event.kind : kindLabel}</b>{event.status !== "confirmed" && <small>{event.status}</small>}</span>
          {kind === "fixture" && <Flag className="programme-fixture-mark" size={30} aria-hidden="true" />}
          <span className="calendar-event-time">{event.localDate < day ? "Continued · " : ""}{start ? `${overnight ? `${start.date} ` : ""}${start.time}` : "Time TBC"}{end && ` – ${overnight ? `${end.date} ` : ""}${end.time}`}</span>
          {minutes !== null && kind !== "fixture" && <span className="programme-card-duration">({minutes.toLocaleString("en-AU", { maximumFractionDigits: 2 })} min booking)</span>}
          <span className="calendar-event-title"><strong>{event.title}</strong></span>
          {!team && <span className="programme-card-team">{bundle.teams.find(t => t.id === event.teamId)?.name}</span>}
          {kind === "fixture" && <span className="programme-card-activities">{event.venue ?? "Venue not specified"}</span>}
          {event.timeZone !== "Australia/Sydney" && <span className="programme-card-zone">{event.timeZone}</span>}
        </button>;
      })}{!daily.length && <p className="calendar-muted calendar-empty"><CalendarDays size={21} aria-hidden="true" /><span>No sessions scheduled</span></p>}</div>
      <div className="calendar-slot-actions"><button className="calendar-add-slot" disabled={disabled} onClick={() => onChoose(day)}>Choose session</button><button aria-label="Add session" title="Add a blank session on this date" disabled={disabled || !bundle.teams.length} onClick={() => onAdd(day)}><Plus size={14} /></button></div>
    </div>;
  })}</div></div>;
}
