"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { CalendarEvent } from "@/lib/domain/calendar";
import type { SessionKind } from "@/lib/domain/session";
import type { DomainBundle } from "@/lib/domain/validation";
import { eventSession, localParts, scheduleChange, schedulingConflicts, sessionLabels, wallTimeCandidates } from "@/lib/calendar/schedule";

/** Focus-contained scheduling form with explicit DST choices and overlap acknowledgement. */
export function ScheduleDialog({ bundle, date, event, demo, busy, blocked, returnFocus, onClose, onSave }: {
  bundle: DomainBundle; date: string; event?: CalendarEvent; demo: boolean; busy: boolean; blocked: boolean;
  onClose: () => void; onSave: (next: DomainBundle, event: CalendarEvent) => Promise<void>;
  returnFocus: RefObject<HTMLInputElement | null>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<CalendarEvent[]>([]);
  const [ambiguities, setAmbiguities] = useState<{ start: string[]; end: string[] }>({ start: [], end: [] });
  const [team, setTeam] = useState(event?.teamId ?? bundle.teams[0]?.id ?? "");
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
          const result = scheduleChange(bundle, { title: value("title"), teamId: team,
            kind: value("kind") as SessionKind, coachId: value("coach"), date: value("date"), start: value("start"),
            endDate: value("endDate"), end: value("end"), timeZone: value("zone"), startInstant, endInstant,
            venue: value("venue"), areaLabel: value("area") }, event?.id);
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
        {event ? " A new booking revision preserves the pinned session and earlier schedule." : " Creates an independent draft; detailed activity editing follows in a later milestone."}</p>
      <fieldset disabled={busy || blocked}>
        <label>Session title<input name="title" required maxLength={200} defaultValue={event?.title ?? ""} readOnly={!!event} /></label>
        <div className="calendar-form-row"><label>Team<select name="team" value={team} disabled={!!event}
          onChange={(e) => { setTeam(e.target.value); if (form.current) (form.current.elements.namedItem("coach") as HTMLSelectElement).value = ""; }}>
          {bundle.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select></label>
        <label>Session type<select aria-label="Session type" name="kind" disabled={!!event} defaultValue={session?.content.kind ?? "possession"}>
          {Object.entries(sessionLabels).map(([id, title]) => <option key={id} value={id}>{title}</option>)}
        </select></label></div>
        {!event && <label>Lead coach<select aria-label="Lead coach" name="coach" defaultValue=""><option value="">Unassigned</option>
          {bundle.coaches.filter((c) => c.teamIds.includes(team)).map((c) => <option key={c.id} value={c.id}>{c.displayName}</option>)}
        </select></label>}
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
