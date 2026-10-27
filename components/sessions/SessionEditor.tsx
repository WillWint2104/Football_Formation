"use client";

import Link from "next/link";
import { DiagramLinks } from "@/components/tactical/DiagramLinks";
import { useState } from "react";
import { z } from "zod";
import type { CalendarEvent } from "@/lib/domain/calendar";
import type { Session } from "@/lib/domain/session";
import { activityTotals, reviseSession, reviseTemplate } from "@/lib/coaching/sessions";
import { useCoaching } from "@/components/coaching/CoachingProvider";
import { useUnsavedChanges } from "@/components/coaching/useUnsavedChanges";
import { SessionContentFields } from "./SessionContentFields";
import { guideHref } from "@/lib/documents/contracts";

/** Edit a local draft and publish one immutable version, advancing only the selected booking. */
export function SessionEditor({ source, event, historical, isNew, navigating, onSaved, onTemplate }: {
  source: Session; event?: CalendarEvent; historical: boolean; isNew: boolean; navigating: boolean;
  onSaved: (session: Session, event?: CalendarEvent) => void; onTemplate: (id: string) => void;
}) {
  const { snapshot, mode, busy, loading, blocked, commit } = useCoaching();
  const [base] = useState(snapshot);
  const [draft, setDraft] = useState(() => structuredClone(source));
  const [error, setError] = useState("");
  const dirty = !historical && (isNew || JSON.stringify(draft) !== JSON.stringify(source));
  useUnsavedChanges(dirty);
  const total = activityTotals(draft.content.activities);
  const booked = event?.startsAt && event.endsAt ? (Date.parse(event.endsAt) - Date.parse(event.startsAt)) / 60000 : null;
  const disabled = busy || loading || blocked || historical || navigating;
  return <form className="coaching-editor" onSubmit={async (e) => {
    e.preventDefault(); if (disabled) return;
    try { const result = reviseSession(base.bundle, draft, event?.id); await commit(base, result.bundle); onSaved(result.session, result.event); }
    catch (failure) { setError(failure instanceof z.ZodError ? "Check required titles, positive dimensions, staff assignments and quantities." : failure instanceof Error ? failure.message : "Session could not be saved"); }
  }}>
    <div className="coaching-section-heading"><div><p className="calendar-eyebrow">{isNew ? "New independent session" : `Session revision ${source.revision}`}</p><h2>{source.content.title}</h2></div>
      {event && <Link href={`/calendar?date=${event.localDate}&event=${encodeURIComponent(event.id)}`}>Back to booking</Link>}</div>
    {!isNew && <Link href={guideHref({ session: source.id, revision: source.revision, ...(event ? { event: event.id, bookingRevision: event.revision } : {}) })}>Open saved coaching guide →</Link>}
    {!event && !isNew && !historical && !dirty && <Link href={`/calendar?plan=${encodeURIComponent(source.id)}`}>Schedule this saved session →</Link>}
    {historical && <p className="coaching-notice">Historical snapshot · read only. Open the current booking/session to make a new edit.</p>}
    <p className="calendar-muted">{dirty ? "Unsaved changes" : "No unsaved changes"} · {mode === "sample" ? "Sample only; not durable storage" : `Organisation snapshot v${base.version}`}</p>
    <fieldset disabled={disabled}>
      <div className="coaching-form-row"><label>Session team<select aria-label="Session team" value={draft.teamId} disabled={!!event}
        onChange={(e) => setDraft({ ...draft, teamId: e.target.value, coaches: draft.coaches.filter((c) => base.bundle.coaches.some((coach) => coach.id === c.coachId && coach.teamIds.includes(e.target.value))) })}>
        {base.bundle.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <div className="coaching-totals"><strong>{total.minutes} known minutes</strong><span>{total.unknown} untimed · {booked === null ? "No booking duration" : `${booked} min booking`}</span>
          {booked !== null && (booked !== total.minutes || total.unknown > 0) && <small>Planned activity timing differs from, or is incomplete for, this booking. Booking times are unchanged.</small>}</div></div>
      <section className="coaching-field-section"><h3>Assigned coaches</h3><div className="coaching-coach-assignments">{base.bundle.coaches.filter((c) => c.teamIds.includes(draft.teamId)).map((coach) => {
        const assignment = draft.coaches.find((c) => c.coachId === coach.id);
        return <div key={coach.id}><label className="coaching-checkbox"><input type="checkbox" checked={!!assignment} onChange={(e) => setDraft({ ...draft, coaches: e.target.checked ? [...draft.coaches, { coachId: coach.id, role: "assistant" }] : draft.coaches.filter((c) => c.coachId !== coach.id) })} />{coach.displayName}</label>
          {assignment && <select aria-label={`Role for ${coach.displayName}`} value={assignment.role} onChange={(e) => setDraft({ ...draft, coaches: draft.coaches.map((a) => a.coachId === coach.id ? { ...a, role: e.target.value as typeof a.role } : a) })}>
            <option value="lead">Lead</option><option value="assistant">Assistant</option><option value="specialist">Specialist</option></select>}</div>;
      })}</div>{!base.bundle.coaches.some((c) => c.teamIds.includes(draft.teamId)) && <p className="calendar-muted">No directory coaches for this team. Add a coach in the directory.</p>}</section>
      <SessionContentFields content={draft.content} exercises={base.bundle.exercises} onChange={(content) => setDraft({ ...draft, content })} />
    </fieldset>
    {!isNew && source.content.activities.map((activity) => <DiagramLinks key={activity.id} content={activity.content} disabled={dirty || historical || disabled} target={{ kind: "session", id: source.id, revision: source.revision, activity: activity.id, ...(event ? { event: event.id, booking: event.revision } : {}) }} />)}
    {!!source.documents.length && <p className="coaching-notice">Existing document metadata is retained in history. Generated guides stay pinned to their original snapshot. Uploads and exports are a later milestone.</p>}
    {error && <p role="alert" className="coaching-notice">{error}</p>}
    <div className="coaching-save-bar"><button className="calendar-primary" disabled={disabled || !dirty}>{busy ? "Saving…" : "Save session"}</button>
      <button type="button" disabled={disabled || !dirty} onClick={() => { setDraft(structuredClone(source)); setError(""); }}>Revert draft</button>
      <button type="button" disabled={disabled || dirty || isNew} onClick={async () => {
        try { const id = crypto.randomUUID(); const next = reviseTemplate(base.bundle, { schemaVersion: "1.0", organizationId: source.organizationId, id, revision: 1, content: structuredClone(source.content) });
          await commit(base, next); onTemplate(id); }
        catch (failure) { setError(failure instanceof Error ? failure.message : "Template could not be saved"); }
      }}>Save as session template</button></div>
    <p className="calendar-muted coaching-fine">Save changes before creating a template. Reusing a template creates a separate session snapshot.</p>
  </form>;
}
