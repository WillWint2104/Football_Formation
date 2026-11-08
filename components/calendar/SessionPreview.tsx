"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, Clock, FileText, Flag, MapPin, Target, Users, X, ExternalLink } from "lucide-react";
import Link from "next/link";
import type { CalendarEvent } from "@/lib/domain/calendar";
import type { DomainBundle } from "@/lib/domain/validation";
import { localParts, sessionLabels } from "@/lib/calendar/schedule";
import { inspectBooking } from "@/lib/calendar/inspector";
import { SessionTypeIcon } from "./SessionTypeIcon";
import { guideHref } from "@/lib/documents/contracts";
import { SceneDiagram } from "@/components/tactical/SceneDiagram";
import { withCalendar, type CalendarReturn } from "@/lib/coaching/calendar-return";

type Props = {
  bundle: DomainBundle; event: CalendarEvent | undefined; demo: boolean;
  onClose: () => void; onSchedule: () => void; disabled: boolean;
  onBrowse: () => void; onCopy?: () => void; context?: CalendarReturn; focusOnOpen?: boolean;
};

/** The accepted Calendar preview, composed as a contextual inspector. Opening it never writes. */
export function SessionPreview(props: Props) {
  if (!props.event) return null;
  const event = props.event;
  return <SelectedPreview key={`${event.organizationId}:${event.id}:${event.revision}:${event.session?.id}:${event.session?.revision}`} {...props} event={event} />;
}

function SelectedPreview({ bundle, event, demo, onClose, onSchedule, disabled, onBrowse, onCopy, context, focusOnOpen = true }: Props & { event: CalendarEvent }) {
  const { session, problem, diagrams } = inspectBooking(bundle, event);
  const [diagramKey, setDiagramKey] = useState(diagrams[0]?.key ?? "");
  const current = diagrams.find(d => d.key === diagramKey);
  const heading = useRef<HTMLHeadingElement>(null), initialFocus = useRef(focusOnOpen);
  const reading = useRef<HTMLDivElement>(null), diagramHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (initialFocus.current) heading.current?.focus({ preventScroll:true }); }, []);
  const fixture = event.kind === "fixture";
  const kind = fixture ? "fixture" : session?.content.kind ?? "other";
  const start = event.startsAt ? localParts(event.startsAt, event.timeZone) : null;
  const end = event.endsAt ? localParts(event.endsAt, event.timeZone) : null;
  const minutes = event.startsAt && event.endsAt ? (Date.parse(event.endsAt) - Date.parse(event.startsAt)) / 60000 : null;
  const date = new Intl.DateTimeFormat("en-AU", {weekday:"short",day:"numeric",month:"short",timeZone:"UTC"}).format(new Date(`${event.localDate}T12:00:00Z`));
  const activities = session?.content.activities ?? [];
  const diagramActivities = activities.filter(a => a.content.diagrams.length);
  const emphasis = current?.activity ?? activities[0];
  const bookingActions = <div className="programme-secondary-actions"><button onClick={onSchedule} disabled={disabled || event.status === "cancelled"}>Edit Booking</button>{session && onCopy && <button onClick={onCopy} disabled={disabled}>Schedule Another Copy</button>}<button onClick={onBrowse} disabled={disabled}>Browse Session Library</button></div>;
  return <aside className={`calendar-preview programme-inspector${fixture ? " programme-fixture-inspector" : ""}`} aria-label="Session preview"
    onKeyDown={e => { if (e.key === "Escape" && !e.defaultPrevented) { e.preventDefault(); onClose(); } }}>
    <div className="calendar-preview-top"><span><CalendarDays size={15} aria-hidden="true" />{date} / {fixture ? "Match" : "Session"}</span>
      <button onClick={onClose} aria-label="Dismiss session preview"><X size={19} /></button></div>
    <header className="programme-inspector-heading">
      <div className={`calendar-type-heading calendar-type-${kind}`}><SessionTypeIcon kind={kind} /><span>{kind === "fixture" ? "Match booking" : session ? sessionLabels[kind] : event.kind}</span><span className="calendar-badge">{event.status} · {demo ? "illustrative" : `booking v${event.revision}`}</span></div>
      <h2 ref={heading} tabIndex={-1} title={event.title}>{event.title}</h2>
      <p className="programme-inspector-time"><Clock size={17} aria-hidden="true" /><strong>{start ? start.time : "Time unassigned"}{end && ` – ${end.time}`}</strong><span>{minutes !== null ? `(${minutes.toLocaleString("en-AU",{maximumFractionDigits:2})}m)` : "Duration unknown"}</span></p>
      {end && start?.date !== end.date && <p className="calendar-muted">Ends {end.date}</p>}
      <p className="programme-inspector-team"><Users size={16} aria-hidden="true" />{bundle.teams.find(t => t.id === event.teamId)?.name ?? "Team unavailable"}<span>{event.timeZone}</span></p>
    </header>
    <div ref={reading} className="programme-inspector-scroll" role="region" aria-label={fixture ? "Match information" : "Session coaching information"} tabIndex={0}>
      {problem && <p role="alert" className="programme-source-unavailable">{problem}</p>}
      {fixture ? <section className="programme-match-details"><Flag size={42} aria-hidden="true" /><h3>Match details</h3><p>{event.title}</p><p><MapPin size={16} aria-hidden="true" />{event.venue ?? "Venue unassigned"}</p><p className="calendar-muted">This fixture has no attached training session.</p></section> : problem ? null : <>
        <section className="programme-diagram-section" aria-label="Saved activity diagram"><div className="programme-section-heading"><h3 ref={diagramHeading} tabIndex={-1}>Session diagram</h3>{diagramActivities.length > 1 ? <label className="programme-diagram-activity"><span className="sr-only">Activity</span><select aria-label="Diagram activity" value={current?.activity.id ?? ""} disabled={disabled} onChange={e => setDiagramKey(diagrams.find(d => d.activity.id === e.target.value)!.key)}>{diagramActivities.map(a => <option key={a.id} value={a.id}>{a.content.title}</option>)}</select></label> : <span>{diagrams.length ? `${diagrams.length} saved` : "Not attached"}</span>}</div>
          {diagrams.length ? <>
            <div className="calendar-scene-preview">{current?.scene ? <SceneDiagram scene={current.scene} title={current.activity.content.title} options={{paint:"coaching-light",fit:"exercise",exerciseArea:current.activity.content.area ?? undefined,seconds:current.pin.representativeSeconds}} />
              : <p role="alert" className="programme-source-unavailable">The exact diagram revision is unavailable. No substitute was selected.</p>}</div>
            {current && <div className="programme-diagram-controls"><span title={current.pin.scene.id}>{current.activity.content.title} · r{current.pin.scene.revision} · {current.pin.representativeSeconds}s</span><div role="group" aria-label="Saved diagrams">{diagrams.filter(d => d.activity.id === current.activity.id).map(d => <button key={d.key} disabled={disabled} aria-pressed={diagramKey === d.key} aria-label={`Diagram ${d.diagramIndex + 1} · r${d.pin.scene.revision}`} onClick={() => setDiagramKey(d.key)}>{d.diagramIndex + 1}</button>)}</div></div>}
          </> : <p className="calendar-muted programme-no-diagram">No tactical diagrams attached to this session.</p>}
        </section>
        <section><div className="programme-section-heading"><h3>Session plan</h3><span>{activities.length} activities</span></div>
          {activities.length ? <ol className="calendar-activities">{activities.map((activity,i) => <li key={activity.id} data-activity={activity.id} title={activity.role.replaceAll("-"," ")} className={current?.activity.id === activity.id ? "programme-inspector-current-activity" : undefined}>
            <span>{i+1}</span><div>{activity.content.diagrams.length ? <button className="programme-activity-diagram" disabled={disabled} aria-label={`Show diagram for ${activity.content.title}`} onClick={() => { setDiagramKey(diagrams.find(d => d.activity.id === activity.id)!.key); reading.current?.scrollTo({top:0}); diagramHeading.current?.focus({preventScroll:true}); }}>{activity.content.title}</button> : activity.content.title}<small>{activity.role.replaceAll("-"," ")}</small></div>
            <strong>{activity.durationMinutes ?? "TBC"}{activity.durationMinutes !== null && "m"}</strong></li>)}</ol> : <p className="calendar-muted">No activities yet. Open the session editor to add structured coaching activities.</p>}
        </section>
        <section><h3><Target size={18} aria-hidden="true" />Session objective</h3><p>{session?.content.objective ?? "Coaching content has not been added."}</p>
          {!!session?.content.focus.length && <div className="calendar-tags">{session.content.focus.map((focus,i) => <span key={i}>{focus}</span>)}</div>}</section>
        {emphasis && <section><h3>Coaching emphasis</h3><p className="programme-emphasis-source">{emphasis.content.title}</p>{emphasis.content.coachingPoints.length ? <ul className="programme-coaching-points">{emphasis.content.coachingPoints.map((point,i)=><li key={i}>{point}</li>)}</ul> : <p className="calendar-muted">No coaching points authored for this activity.</p>}</section>}
      </>}
      <section className="programme-inspector-details"><h3>{fixture ? "Booking information" : "Staff & location"}</h3><dl className="calendar-meta"><div><dt>Date</dt><dd>{event.localDate}</dd></div><div><dt>Location</dt><dd>{event.venue ?? "Venue unassigned"}<small>{event.areaLabel ?? "Area unassigned"}</small></dd></div></dl>
        {!fixture && !problem && <><h4>Coaching staff</h4>{session?.coaches.length ? session.coaches.map(assignment => <p key={assignment.coachId}>{bundle.coaches.find(c => c.id === assignment.coachId)?.displayName ?? "Coach unavailable"}<span className="calendar-muted"> · {assignment.role}</span></p>) : <p className="calendar-muted">No coaches assigned</p>}</>}
        {session && <p className="calendar-footnote">Pinned session revision {session.revision} · {session.documents.length} document references. Saved guides use this exact session revision; saved PDFs are historical exports and may show an earlier schedule.</p>}
      </section>
      {session && <section aria-label="Booking actions"><h3>Booking & reuse</h3>{bookingActions}<p className="programme-action-help">Edit Booking changes scheduling only. Open Session edits coaching content.</p></section>}
    </div>
    <footer className="calendar-booking-actions programme-inspector-actions">
      {session && <div className="programme-primary-actions"><Link className="coaching-session-link" href={withCalendar(`/sessions?event=${encodeURIComponent(event.id)}&revision=${event.revision}`,context)}><ExternalLink size={16} aria-hidden="true" />Open Session</Link>
        <Link className="coaching-session-link" href={withCalendar(guideHref({session:session.id,revision:session.revision,event:event.id,bookingRevision:event.revision}),context)}><FileText size={16} aria-hidden="true" />Coaching Guide</Link></div>}
      {!session && bookingActions}
    </footer>
  </aside>;
}
