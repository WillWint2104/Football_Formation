"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, RefreshCw } from "lucide-react";
import { CalendarApiError } from "@/lib/calendar/client";
import { useCoaching } from "@/components/coaching/CoachingProvider";
import { addDays, calendarDates, eventSession, isCalendarDate, latestEvents, localParts, sessionLabels } from "@/lib/calendar/schedule";
import type { CalendarEvent } from "@/lib/domain/calendar";
import type { DomainBundle } from "@/lib/domain/validation";
import { ScheduleDialog } from "./ScheduleDialog";
import { SessionPreview } from "./SessionPreview";
import { SessionTypeIcon } from "./SessionTypeIcon";
import { CalendarLibrary } from "./CalendarLibrary";
import { calendarContextProblem, calendarHref, type CalendarNavigation } from "@/lib/calendar/navigation";

/** Desktop planning surface; sample state and authenticated saved snapshots remain separate. */
export function CalendarWorkspace({ navigation }: { navigation: CalendarNavigation }) {
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  const { snapshot, mode, loading, busy, blocked, message, organizations, organization, reload: reloadWorkspace, commit } = useCoaching();
  const saved = mode === "saved" ? snapshot : null;
  const date = navigation.date ?? (mode === "saved" ? localParts(new Date().toISOString(), "Australia/Sydney").date : "2026-11-03");
  const view = navigation.view ?? "month", selected = navigation.event;
  const team = navigation.team ?? "", type = navigation.type ?? "";
  const [editing, setEditing] = useState<{ event?: CalendarEvent; plan?: string; date?: string } | null>(navigation.plan ? { plan: navigation.plan } : null);
  const dateControl = useRef<HTMLInputElement>(null);
  const libraryWasOpen = useRef(!!navigation.library);
  useEffect(() => { if (navigation.focus === "date") dateControl.current?.focus(); }, [navigation.focus]);
  useEffect(() => {
    if (libraryWasOpen.current && !navigation.library) dateControl.current?.focus();
    libraryWasOpen.current = !!navigation.library;
  }, [navigation.library]);
  const bundle = snapshot.bundle;
  const problem = !loading && calendarContextProblem(bundle, navigation);
  const context = { ...navigation, date, view, organization: bundle.organizationId };
  function go(change: Partial<CalendarNavigation>) { if (!problem && !navigating) startNavigation(() => router.push(calendarHref({ ...context, ...change, ...(change.library ? { plan: undefined } : {}) }), { scroll: false })); }
  function setDate(value: string) { go({ date: value }); }
  function browse() { go({ library: "1" }); }
  const events = latestEvents(bundle);
  const current = !problem ? events.find((e) => e.id === selected) : undefined;
  const dates = calendarDates(date, view);
  const visible = events.filter((e) => (!team || e.teamId === team) &&
    (!type || (e.kind === "fixture" ? "fixture" : eventSession(bundle, e)?.content.kind ?? "other") === type));
  const title = new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

  /** Reload through the shared workspace and clear page-specific editing state. */
  async function reload(id: string, switching = false) {
    setEditing(null);
    await reloadWorkspace(id);
    if (switching) router.replace(calendarHref({ date, view }), { scroll: false });
  }

  /** Advance this booking only after the shared snapshot commit is acknowledged. */
  async function publish(next: DomainBundle, event: CalendarEvent) {
    try {
      await commit(snapshot, next);
      setEditing(null);
      // This acknowledged save advances the selected pin itself. Do not let the old
      // navigation/stale-selection guard suppress the authoritative return target.
      startNavigation(() => router.replace(calendarHref({ ...context, date: event.localDate, event: event.id, bookingRevision: event.revision, plan: undefined, focus: "date" }), { scroll: false }));
    } catch (error) {
      if (error instanceof CalendarApiError && [401, 404].includes(error.status)) setEditing(null);
      throw error;
    }
  }

  /** Move a displayed period without month-end overflow (for example, January 31 into March). */
  function move(direction: number) {
    if (view === "month") {
      const next = new Date(`${date.slice(0, 7)}-01T12:00:00Z`);
      next.setUTCMonth(next.getUTCMonth() + direction);
      const value = next.toISOString().split("T")[0];
      if (isCalendarDate(value)) setDate(value);
    } else {
      const value = addDays(date, direction * (view === "week" ? 7 : 1));
      if (isCalendarDate(value)) setDate(value);
    }
  }

  return <div className="calendar-workspace calendar-integrated" aria-busy={loading || busy || navigating}>
    <div className="calendar-page-heading"><div><p className="calendar-eyebrow">Coaching planner</p><h1>Team calendar</h1>
      <p className="calendar-muted">Plan the week. Reuse a session. Keep each occurrence independent.</p></div>
      <div className="calendar-heading-actions"><button disabled={loading || busy || navigating || blocked || !!problem} onClick={browse}>Browse Session Library</button>
      <button className="calendar-primary" disabled={loading || busy || navigating || blocked || !!problem || !bundle.teams.length} onClick={() => setEditing({})}><Plus size={16} />Add session</button></div></div>
    <div className="calendar-storage-strip"><div className={`calendar-source ${saved ? "calendar-source-saved" : ""}`}>
      <div><strong>{saved ? "Organisation storage" : "Illustrative sample data · not saved"}</strong>
        <span>{saved ? "Authenticated API · hosted staging verification remains a separate release gate." : "Synthetic examples. Sample changes disappear on reload and are never uploaded automatically."}</span></div>
      <Link href="/login">Sign in</Link>
    </div>
    <div className="calendar-connection"><p role="status">{message}</p>
      {organizations.length > 0 && <label>Organisation<select value={organization} disabled={loading || busy || !!editing} onChange={(e) => void reload(e.target.value, true)}>
        {organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>}
      <button disabled={loading || busy} onClick={() => {
        if (organization) void reload(organization);
        else window.location.reload();
      }}><RefreshCw size={14} />{blocked ? "Reload before saving" : "Reload"}</button>
    </div></div>
    {problem && <p role="alert" className="calendar-context-warning">{problem} <Link href={calendarHref({ date, view })}>Reset Calendar context</Link></p>}
    {current && type && type !== (current.kind === "fixture" ? "fixture" : eventSession(bundle, current)?.content.kind ?? "other") && <p className="calendar-context-warning">The selected booking is hidden by the type filter. <button onClick={() => go({ type: undefined })}>Show selected booking</button></p>}
    <div className="calendar-planning"><section className="calendar-main" aria-label="Calendar schedule">
      <fieldset className="calendar-navigation-controls" disabled={navigating || loading || busy}>
      <div className="calendar-toolbar"><div className="calendar-period"><button onClick={() => move(-1)} aria-label="Previous period"><ChevronLeft size={18} /></button>
        <h2>{title}</h2><button onClick={() => move(1)} aria-label="Next period"><ChevronRight size={18} /></button>
        <button onClick={() => setDate(localParts(new Date().toISOString(), "Australia/Sydney").date)}>Today</button></div>
        <div className="calendar-views" role="group" aria-label="Calendar view">{(["month", "week", "day"] as const).map((v) => <button key={v} aria-pressed={view === v} onClick={() => go({ view: v })}>{v[0].toUpperCase() + v.slice(1)}</button>)}</div></div>
      <div className="calendar-filters"><label>Team<select aria-label="Team" value={team} onChange={(e) => go({ team: e.target.value || undefined, event: undefined, bookingRevision: undefined })}><option value="">All teams</option>
        {bundle.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label>Session type<select aria-label="Session type" value={type} onChange={(e) => go({ type: e.target.value || undefined })}><option value="">All types</option>
          <option value="fixture">Match</option>
          {Object.entries(sessionLabels).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}</select></label>
        <label>Selected date<input ref={dateControl} aria-label="Selected date" type="date" value={date} onChange={(e) => { if (isCalendarDate(e.target.value)) go({ date: e.target.value, event: undefined, bookingRevision: undefined }); }} /></label>
      </div>
      <div className="calendar-legend">{(["conditioning", "possession", "goalkeeper", "tactical", "testing", "recovery", "fixture"] as const).map((kind) =>
        <span key={kind} className={`calendar-type-${kind}`}><SessionTypeIcon kind={kind} />{kind === "fixture" ? "Match" : sessionLabels[kind]}</span>)}</div>
      <div className={`calendar-grid calendar-${view === "day" ? "view-day" : view}`}>
        {view === "month" && <div className="calendar-weekdays">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <span key={d}>{d}</span>)}</div>}
        <div className="calendar-days">{dates.map((day) => {
          // Week/day lanes include overnight bookings carried in from an earlier local date.
          const daily = visible.filter((event) => view === "month" ? event.localDate === day : event.startsAt && event.endsAt
            ? day >= event.localDate && day <= localParts(new Date(Date.parse(event.endsAt) - 1).toISOString(), event.timeZone).date
            : event.localDate === day);
          return <div key={day} className={`calendar-day ${day === date ? "calendar-date-selected" : ""} ${day.slice(0, 7) !== date.slice(0, 7) ? "calendar-adjacent" : ""}`} data-date={day}>
            <button className="calendar-day-number" aria-label={`Select ${day}`} aria-pressed={day === date} onClick={() => go({ date: day, event: undefined, bookingRevision: undefined })}>
              {view === "month" ? Number(day.slice(-2)) : new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: view === "day" ? "short" : undefined, timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`))}</button>
            {daily.map((event) => {
              const session = eventSession(bundle, event);
              const kind = event.kind === "fixture" ? "fixture" : session?.content.kind ?? "other";
              const kindLabel = kind === "fixture" ? "Match" : sessionLabels[kind];
              const start = event.startsAt ? localParts(event.startsAt, event.timeZone) : null;
              const end = event.endsAt ? localParts(event.endsAt, event.timeZone) : null;
              const overnight = start && end && start.date !== end.date;
              return <button key={event.id} className={`calendar-event calendar-type-${kind} ${selected === event.id ? "calendar-event-selected" : ""}`}
                aria-label={`${event.title}, ${event.localDate}, ${kindLabel}`} aria-pressed={selected === event.id}
                title={view === "month" ? event.title : undefined}
                onClick={() => go({ event: event.id, bookingRevision: event.revision, date: day })}>
                <span className="calendar-event-title"><SessionTypeIcon kind={kind} /><strong>{event.title}</strong></span>
                {view !== "month" && <><span className="calendar-event-time">{event.localDate < day ? "Continued booking · " : ""}{start ? `${overnight ? `${start.date} ` : ""}${start.time}` : "Time TBC"}
                  {end && ` – ${overnight ? `${end.date} ` : ""}${end.time}`}</span>
                  <span>{kindLabel} · {bundle.teams.find((t) => t.id === event.teamId)?.name}</span></>}
              </button>;
            })}
            {view !== "month" && !daily.length && <p className="calendar-muted calendar-empty">No sessions scheduled</p>}
            {view !== "month" && <div className="calendar-slot-actions"><button className="calendar-add-slot" disabled={loading || busy || blocked || !!problem} onClick={() => go({ date: day, event: undefined, bookingRevision: undefined, library: "1" })}>Choose session</button>
              <button aria-label="Add session" title="Add a blank session on this date" disabled={loading || busy || blocked || !!problem || !bundle.teams.length} onClick={() => setEditing({ date: day })}><Plus size={14} /></button></div>}
          </div>;
        })}</div>
      </div>
      </fieldset>
      <div className="calendar-grid-footer"><span>{visible.filter((e) => dates.includes(e.localDate)).length} bookings in this view</span>
        <span>Times shown in each booking’s time zone · Sydney default</span></div>
      {view !== "month" && <p className="calendar-muted calendar-footnote">Each day lists bookings chronologically, including parallel sessions and overnight continuations. Use Edit Booking for precise times and daylight-saving choices.</p>}
    </section>
    <SessionPreview bundle={bundle} event={current} demo={!saved} onClose={() => go({ event: undefined, bookingRevision: undefined })}
      disabled={loading || busy || navigating || blocked || !!problem} onSchedule={() => setEditing({ event: current })}
      onBrowse={browse} onCopy={current?.session ? () => go({ library: "1", session: current.session!.id, revision: current.session!.revision }) : undefined} /></div>
    {editing && !loading && !problem && <ScheduleDialog bundle={bundle} date={editing.date ?? date} event={editing.event} demo={!saved} busy={busy} blocked={blocked} initialPlan={editing.plan} initialTeam={team}
      returnFocus={dateControl} onClose={() => setEditing(null)} onSave={publish} />}
    {navigation.library && !loading && !problem && <CalendarLibrary key={`${navigation.session ?? ""}:${navigation.revision ?? ""}:${navigation.copy ?? ""}`} context={context} />}
  </div>;
}
