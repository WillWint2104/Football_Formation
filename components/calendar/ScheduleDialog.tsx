"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { CalendarEvent } from "@/lib/domain/calendar";
import type { SessionKind } from "@/lib/domain/session";
import type { DomainBundle } from "@/lib/domain/validation";
import { eventSession, latestEvents, localParts, schedulingConflicts, sessionLabels, wallTimeCandidates } from "@/lib/calendar/schedule";
import { latest } from "@/lib/coaching/sessions";
import { scheduleSession, type SchedulingSource } from "@/lib/coaching/scheduling";

/** Focus-contained scheduling form with explicit DST choices and overlap acknowledgement. */
export function ScheduleDialog({ bundle, date, event, demo, busy, blocked, initialPlan, returnFocus, onClose, onSave }: {
  bundle: DomainBundle; date: string; event?: CalendarEvent; demo: boolean; busy: boolean; blocked: boolean;
  onClose: () => void; onSave: (next: DomainBundle, event: CalendarEvent) => Promise<void>;
  returnFocus: RefObject<HTMLInputElement | null>;
  initialPlan?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<CalendarEvent[]>([]);
  const [ambiguities, setAmbiguities] = useState<{ start: string[]; end: string[] }>({ start: [], end: [] });
  const [team, setTeam] = useState(event?.teamId ?? bundle.sessions.find((s) => s.id === initialPlan)?.teamId ?? bundle.teams[0]?.id ?? "");
  const [source, setSource] = useState(initialPlan ? `session:${initialPlan}` : "blank");
  const scheduled = new Set(latestEvents(bundle).flatMap((e) => e.session ? [e.session.id] : []));
  const plans = latest(bundle.sessions).filter((s) => s.teamId === team && !scheduled.has(s.id));
  const templates = latest(bundle.templates);
  const session = event && eventSession(bundle, event);
  const zone = event?.timeZone ?? "Australia/Sydney";
  const start = event?.startsAt ? localParts(event.startsAt, zone) : { date, time: "10:00" };
  const end = event?.endsAt ? localParts(event.endsAt, zone) : { date, time: "11:00" };
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    const fallback = returnFocus.current;
    element?.showModal();
    (form.current?.elements.namedItem("title") as HTMLInputElement | null)?.focus();
    return () => {
      element?.close();
      if (previous instanceof HTMLElement && previous.isConnected && !previous.matches(":disabled")) previous.focus();
      else fallback?.focus();
    };
  }, [returnFocus]);
  return <dialog ref={dialog} className="calendar-dialog" aria-labelledby="schedule-title"
    onCancel={(e) => { e.preventDefault(); if (!busy) onClose(); }}>
    <form ref={form} onChange={() => { setWarnings([]); setAmbiguities({ start: [], end: [] }); setError(""); }}
      onSubmit={async (e) => {
        e.preventDefault(); if (busy || blocked) return;
        const data = new FormData(e.currentTarget);
        const value = (key: string) => String(data.get(key) ?? "");
        try {
          const starts = wallTimeCandidates(value("date"), value("start"), value("zone"));
          const ends = wallTimeCandidates(value("endDate"), value("end"), value("zone"));
          if (!starts.length || !ends.length) throw new Error("This time does not exist in the selected time zone (daylight-saving gap). Choose another time.");
          const startInstant = starts.length === 1 ? starts[0] : value("startChoice");
          const endInstant = ends.length === 1 ? ends[0] : value("endChoice");
          if (!starts.includes(startInstant) || !ends.includes(endInstant)) {
            setAmbiguities({ start: starts.length > 1 ? starts : [], end: ends.length > 1 ? ends : [] });
            throw new Error("This clock time occurs twice. Choose the UTC instant for each ambiguous time.");
          }
          const [sourceKind, sourceId] = source.split(":");
          if (!["blank", "session", "template"].includes(sourceKind)) throw new Error("Choose valid session content");
          const selection: SchedulingSource = sourceKind === "blank" ? { kind: "blank" } : { kind: sourceKind as "session" | "template", id: sourceId };
          const result = scheduleSession(bundle, { title: value("title"), teamId: team,
            kind: value("kind") as SessionKind, coachId: value("coach"), date: value("date"), start: value("start"),
            endDate: value("endDate"), end: value("end"), timeZone: value("zone"), startInstant, endInstant,
            venue: value("venue"), areaLabel: value("area") }, selection, event?.id);
          const conflicts = schedulingConflicts(result.bundle, result.event);
          if (conflicts.length && value("acknowledge") !== "on") {
            setWarnings(conflicts); return;
          }
          await onSave(result.bundle, result.event);
        } catch (failure) {
          setError(failure instanceof Error && !failure.message.startsWith("[") ? failure.message : "Check the scheduling fields and try again.");
        }
      }}>
      <div className="calendar-dialog-heading"><h2 id="schedule-title">{event ? "Reschedule booking" : "Add independent session"}</h2>
        <button type="button" onClick={onClose} disabled={busy} aria-label="Close scheduling form">×</button></div>
      <p className="calendar-muted">{demo ? "Illustrative only. Changes disappear on reload." : "Saves through authenticated organisation storage."}
        {event ? " A new booking revision preserves the pinned session and earlier schedule." : " Schedule an independent draft, a saved plan or a copy of a reusable template. Open its session editor for detailed coaching content."}</p>
      <fieldset disabled={busy || blocked}>
        {!event && <label>Session content<select aria-label="Session content" value={source} onChange={(e) => {
          setSource(e.target.value);
          const [kind, id] = e.target.value.split(":");
          const record = kind === "session" ? plans.find((p) => p.id === id) : templates.find((t) => t.id === id);
          if (record && form.current) {
            (form.current.elements.namedItem("title") as HTMLInputElement).value = record.content.title;
            (form.current.elements.namedItem("kind") as HTMLSelectElement).value = record.content.kind;
          }
        }}><option value="blank">New blank independent session</option>{plans.map((p) => <option key={p.id} value={`session:${p.id}`}>Unscheduled plan: {p.content.title}</option>)}
          {templates.map((t) => <option key={t.id} value={`template:${t.id}`}>Template: {t.content.title} · v{t.revision}</option>)}</select></label>}
        <label>Session title<input name="title" required maxLength={200} defaultValue={event?.title ?? plans.find((p) => p.id === initialPlan)?.content.title ?? ""} readOnly={!!event || source.startsWith("session:")} /></label>
        <div className="calendar-form-row"><label>Team<select name="team" value={team} disabled={!!event}
          onChange={(e) => { setTeam(e.target.value); setSource("blank"); if (form.current) (form.current.elements.namedItem("coach") as HTMLSelectElement).value = ""; }}>
          {bundle.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select></label>
        <label>Session type<select aria-label="Session type" name="kind" disabled={!!event || source !== "blank"} defaultValue={session?.content.kind ?? plans.find((p) => p.id === initialPlan)?.content.kind ?? "possession"}>
          {Object.entries(sessionLabels).map(([id, title]) => <option key={id} value={id}>{title}</option>)}
        </select></label></div>
        {!event && <label>Lead coach<select aria-label="Lead coach" name="coach" disabled={source.startsWith("session:")} defaultValue=""><option value="">Unassigned</option>
          {bundle.coaches.filter((c) => c.teamIds.includes(team)).map((c) => <option key={c.id} value={c.id}>{c.displayName}</option>)}
        </select>{source.startsWith("session:") && <span>Existing plan staff assignments are retained.</span>}</label>}
        <label>Time zone<input name="zone" required defaultValue={zone} placeholder="Australia/Sydney" /></label>
        <div className="calendar-form-row"><label>Start date<input name="date" required type="date" defaultValue={start.date} /></label>
          <label>Start time<input name="start" required type="time" defaultValue={start.time} /></label></div>
        <div className="calendar-form-row"><label>End date<input name="endDate" required type="date" defaultValue={end.date} /></label>
          <label>End time<input name="end" required type="time" defaultValue={end.time} /></label></div>
        {(["start", "end"] as const).map((part) => ambiguities[part].length > 1 && <label key={part}>
          {part === "start" ? "Start" : "End"} occurrence (UTC)<select name={`${part}Choice`} defaultValue="" required
            onChange={(e) => e.stopPropagation()}><option value="">Choose an occurrence</option>
            {ambiguities[part].map((instant) => <option key={instant} value={instant}>{instant}</option>)}
          </select></label>)}
        <div className="calendar-form-row"><label>Venue<input name="venue" maxLength={200} defaultValue={event?.venue ?? ""} /></label>
          <label>Field area<input name="area" maxLength={200} defaultValue={event?.areaLabel ?? ""} /></label></div>
        {!!warnings.length && <div className="calendar-warning"><strong>Overlapping bookings</strong>
          <p>Shared team, coach or field area: {warnings.map((w) => w.title).join(", ")}.</p>
          <label className="calendar-inline"><input name="acknowledge" type="checkbox" onChange={(e) => e.stopPropagation()} />Schedule despite these warnings</label></div>}
      </fieldset>
      {error && <p role="alert" className="calendar-warning">{error}</p>}
      <div className="calendar-dialog-actions"><button type="button" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="calendar-primary" disabled={busy || blocked || !bundle.teams.length}>{busy ? "Saving…" : demo ? "Apply sample change" : "Save booking"}</button></div>
    </form>
  </dialog>;
}
