"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, RefreshCw } from "lucide-react";
import { CalendarApiError, loadCalendar, loadOrganizations, saveCalendar, type CalendarSnapshot, type Organization } from "@/lib/calendar/client";
import { sampleCalendar } from "@/lib/calendar/sample";
import { addDays, calendarDates, eventSession, latestEvents, localParts, sessionLabels } from "@/lib/calendar/schedule";
import type { CalendarEvent } from "@/lib/domain/calendar";
import type { DomainBundle } from "@/lib/domain/validation";
import { ScheduleDialog } from "./ScheduleDialog";
import { SessionPreview } from "./SessionPreview";
import { SessionTypeIcon } from "./SessionTypeIcon";

type View = "month" | "week" | "day";

/** Desktop planning surface; sample state and authenticated saved snapshots remain separate. */
export function CalendarWorkspace() {
  const [sample, setSample] = useState(sampleCalendar);
  const [saved, setSaved] = useState<CalendarSnapshot | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organization, setOrganization] = useState("");
  const [date, setDate] = useState("2026-11-03");
  const [view, setView] = useState<View>("month");
  const [selected, setSelected] = useState<string | null>("sample-4");
  const [team, setTeam] = useState("");
  const [type, setType] = useState("");
  const [message, setMessage] = useState("Checking saved calendar availability…");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [editing, setEditing] = useState<{ event?: CalendarEvent } | null>(null);
  const generation = useRef(0);
  const bundle = saved?.bundle ?? sample;
  const events = latestEvents(bundle);
  const current = events.find((e) => e.id === selected);
  const dates = calendarDates(date, view);
  const visible = events.filter((e) => (!team || e.teamId === team) &&
    (!type || (eventSession(bundle, e)?.content.kind ?? "other") === type));
  const title = new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

  useEffect(() => {
    let active = true;
    const token = ++generation.current;
    void (async () => {
      try {
        const choices = await loadOrganizations();
        if (!active || token !== generation.current) return;
        setOrganizations(choices);
        if (!choices.length) { setMessage("No organisation membership is available. Showing illustrative sample data."); return; }
        const first = choices[0];
        setOrganization(first.id);
        const loaded = await loadCalendar(first.id);
        if (!active || token !== generation.current) return;
        setSaved(loaded); setSelected(null); setDate(localParts(new Date().toISOString(), "Australia/Sydney").date);
        setMessage(`Loaded saved organisation snapshot v${loaded.version}.`);
      } catch (error) {
        if (active && token === generation.current) setMessage(error instanceof CalendarApiError ? error.message : "Saved records could not be validated. Showing sample data.");
      } finally { if (active && token === generation.current) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  /** Reload explicitly after a conflict; failed saves never become local success states. */
  async function reload(id: string) {
    const token = ++generation.current;
    setLoading(true); setSaved(null); setSelected(null); setEditing(null); setBlocked(false); setTeam(""); setType("");
    setOrganization(id);
    try {
      const loaded = await loadCalendar(id);
      if (token !== generation.current) return;
      setSaved(loaded); setMessage(`Loaded saved organisation snapshot v${loaded.version}.`);
    } catch (error) {
      if (token === generation.current) setMessage(error instanceof CalendarApiError ? error.message : "Saved records could not be validated.");
    } finally { if (token === generation.current) setLoading(false); }
  }

  /** Apply sample edits in memory or await a durable API acknowledgement before updating saved records. */
  async function publish(next: DomainBundle, event: CalendarEvent) {
    setBusy(true);
    try {
      if (saved) {
        const result = await saveCalendar(saved, next);
        setSaved(result); setMessage(`Saved organisation snapshot v${result.version}.`);
      } else {
        setSample(next); setMessage("Sample change applied in memory only. Reloading discards it.");
      }
      setDate(event.localDate); setSelected(event.id); setEditing(null);
    } catch (error) {
      // A lost response can hide a committed write. Require reload for every failed save, never retry automatically.
      setBlocked(true);
      setMessage(error instanceof CalendarApiError ? error.message : "Save could not be confirmed. Reload before making further changes.");
      if (error instanceof CalendarApiError && [401, 404].includes(error.status)) {
        setSaved(null); setSelected(null); setEditing(null);
      }
      throw error;
    } finally { setBusy(false); }
  }

  /** Move a displayed period without month-end overflow (for example, January 31 into March). */
  function move(direction: number) {
    if (view === "month") {
      const next = new Date(`${date.slice(0, 7)}-01T12:00:00Z`);
      next.setUTCMonth(next.getUTCMonth() + direction); setDate(next.toISOString().slice(0, 10));
    } else setDate(addDays(date, direction * (view === "week" ? 7 : 1)));
  }

  return <div className="calendar-workspace" aria-busy={loading || busy}>
    <div className="calendar-page-heading"><div><p className="calendar-eyebrow">Coaching planner</p><h1>Team calendar</h1>
      <p className="calendar-muted">Independent sessions. Clear schedules. One coaching workspace.</p></div>
      <button className="calendar-primary" disabled={loading || busy || blocked || !bundle.teams.length} onClick={() => setEditing({})}><Plus size={16} />Add session</button></div>
    <div className={`calendar-source ${saved ? "calendar-source-saved" : ""}`}>
      <div><strong>{saved ? "Organisation storage" : "Illustrative sample data · not saved"}</strong>
        <span>{saved ? "Authenticated API · hosted staging verification remains a separate release gate." : "Synthetic examples. Sample changes disappear on reload and are never uploaded automatically."}</span></div>
      <Link href="/login">Sign in</Link>
    </div>
    <div className="calendar-connection"><p role="status">{message}</p>
      {organizations.length > 0 && <label>Organisation<select value={organization} disabled={loading || busy || !!editing} onChange={(e) => void reload(e.target.value)}>
        {organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>}
      <button disabled={loading || busy} onClick={() => {
        if (organization) void reload(organization);
        else window.location.reload();
      }}><RefreshCw size={14} />{blocked ? "Reload before saving" : "Reload"}</button>
    </div>
    <div className="calendar-planning"><section className="calendar-main" aria-label="Calendar schedule">
      <div className="calendar-toolbar"><div className="calendar-period"><button onClick={() => move(-1)} aria-label="Previous period"><ChevronLeft size={18} /></button>
        <h2>{title}</h2><button onClick={() => move(1)} aria-label="Next period"><ChevronRight size={18} /></button>
        <button onClick={() => setDate(localParts(new Date().toISOString(), "Australia/Sydney").date)}>Today</button></div>
        <div className="calendar-views" role="group" aria-label="Calendar view">{(["month", "week", "day"] as const).map((v) => <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>{v[0].toUpperCase() + v.slice(1)}</button>)}</div></div>
      <div className="calendar-filters"><label>Team<select aria-label="Team" value={team} onChange={(e) => setTeam(e.target.value)}><option value="">All teams</option>
        {bundle.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label>Session type<select aria-label="Session type" value={type} onChange={(e) => setType(e.target.value)}><option value="">All types</option>
          {Object.entries(sessionLabels).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}</select></label>
        <label>Selected date<input type="date" value={date} onChange={(e) => { if (e.target.value) { setDate(e.target.value); setSelected(null); } }} /></label>
      </div>
      <div className="calendar-legend">{(["conditioning", "possession", "goalkeeper", "tactical", "testing"] as const).map((kind) =>
        <span key={kind} className={`calendar-type-${kind}`}><SessionTypeIcon kind={kind} />{sessionLabels[kind]}</span>)}</div>
      <div className={`calendar-grid calendar-${view === "day" ? "view-day" : view}`}>
        {view === "month" && <div className="calendar-weekdays">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <span key={d}>{d}</span>)}</div>}
        <div className="calendar-days">{dates.map((day) => {
          // Week/day lanes include overnight bookings carried in from an earlier local date.
          const daily = visible.filter((event) => view === "month" ? event.localDate === day : event.startsAt && event.endsAt
            ? day >= event.localDate && day <= localParts(new Date(Date.parse(event.endsAt) - 1).toISOString(), event.timeZone).date
            : event.localDate === day);
          return <div key={day} className={`calendar-day ${day === date ? "calendar-date-selected" : ""} ${day.slice(0, 7) !== date.slice(0, 7) ? "calendar-adjacent" : ""}`} data-date={day}>
            <button className="calendar-day-number" aria-label={`Select ${day}`} aria-pressed={day === date} onClick={() => { setDate(day); setSelected(null); }}>
              {view === "month" ? Number(day.slice(-2)) : new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: view === "day" ? "short" : undefined, timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`))}</button>
            {daily.map((event) => {
              const session = eventSession(bundle, event);
              const kind = session?.content.kind ?? "other";
              return <button key={event.id} className={`calendar-event calendar-type-${kind} ${selected === event.id ? "calendar-event-selected" : ""}`}
                aria-label={`${event.title}, ${event.localDate}, ${sessionLabels[kind]}`} aria-pressed={selected === event.id}
                onClick={() => { setSelected(event.id); setDate(day); }}>
                <span className="calendar-event-title"><SessionTypeIcon kind={kind} /><strong>{event.title}</strong></span>
                <span className="calendar-event-time">{event.localDate < day ? "Continued · " : ""}{event.startsAt ? localParts(event.startsAt, event.timeZone).time : "Time TBC"}
                  {event.endsAt && ` – ${localParts(event.endsAt, event.timeZone).time}`}</span>
                {view !== "month" && <><span>{event.timeZone}</span><span>{bundle.teams.find((t) => t.id === event.teamId)?.name} · {event.areaLabel ?? "Area TBC"}</span>
                  <span>{session?.coaches.map((c) => bundle.coaches.find((coach) => coach.id === c.coachId)?.displayName).join(", ") || "Staff unassigned"}</span></>}
                {(event.status !== "draft" || view !== "month") && <span className="calendar-event-status">{event.status}</span>}
              </button>;
            })}
            {view !== "month" && !daily.length && <p className="calendar-muted calendar-empty">No sessions scheduled</p>}
            {view !== "month" && <button className="calendar-add-slot" disabled={loading || busy || blocked || !bundle.teams.length} onClick={() => { setDate(day); setEditing({}); }}><Plus size={14} />Add session</button>}
          </div>;
        })}</div>
      </div>
      <div className="calendar-grid-footer"><span>{visible.filter((e) => dates.includes(e.localDate)).length} bookings in this view</span>
        <span>Times shown in each booking’s time zone · Sydney default</span></div>
      {view !== "month" && <p className="calendar-muted calendar-footnote">Each day lists bookings chronologically, including parallel sessions and overnight continuations. Use Reschedule booking for precise times and daylight-saving choices.</p>}
    </section>
    <SessionPreview bundle={bundle} event={current} demo={!saved} onClose={() => setSelected(null)}
      disabled={loading || busy || blocked} onSchedule={() => setEditing({ event: current })} /></div>
    {editing && <ScheduleDialog bundle={bundle} date={date} event={editing.event} demo={!saved} busy={busy} blocked={blocked}
      onClose={() => setEditing(null)} onSave={publish} />}
  </div>;
}
