"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, Clock, FileText, MapPin, Target, Trophy, X, ExternalLink } from "lucide-react";
import Link from "next/link";
import type { CalendarEvent } from "@/lib/domain/calendar";
import type { DomainBundle } from "@/lib/domain/validation";
import { localParts, sessionLabels } from "@/lib/calendar/schedule";
import { inspectBooking } from "@/lib/calendar/inspector";
import { SessionTypeIcon } from "./SessionTypeIcon";
import { guideHref } from "@/lib/documents/contracts";
import { SceneDiagram } from "@/components/tactical/SceneDiagram";
import { coachingScreenOptions } from "@/lib/tactical/coaching-view";
import { withCalendar, type CalendarReturn } from "@/lib/coaching/calendar-return";

type Props = {
  bundle: DomainBundle; event: CalendarEvent | undefined; demo: boolean;
  onClose: () => void; onSchedule: () => void; disabled: boolean;
  onBrowse: () => void; onCopy?: () => void; context?: CalendarReturn; focusOnOpen?: boolean; inlineFixture?: boolean;
};

/** The accepted Calendar preview, composed as a contextual inspector. Opening it never writes. */
export function SessionPreview(props: Props) {
  if (!props.event) return null;
  const event = props.event;
  return <SelectedPreview key={`${event.organizationId}:${event.id}:${event.revision}:${event.session?.id}:${event.session?.revision}`} {...props} event={event} />;
}

function SelectedPreview({ bundle, event, demo, onClose, onSchedule, disabled, onBrowse, onCopy, context, focusOnOpen = true, inlineFixture = false }: Props & { event: CalendarEvent }) {
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
  return <aside className={`calendar-preview programme-inspector booking-preview${fixture ? " programme-fixture-inspector" : ""}`} aria-label="Session preview"
    onKeyDown={e => { if (e.key === "Escape" && !e.defaultPrevented) { e.preventDefault(); onClose(); } }}>
    <header className="booking-preview-heading">
      <div className="booking-preview-context">
        <span className="booking-preview-type"><SessionTypeIcon kind={kind} />{fixture ? "Match day" : session ? sessionLabels[session.content.kind] + " session" : event.kind}</span>
        <button type="button" onClick={onClose} aria-label="Dismiss session preview"><X size={19} /></button>
      </div>
      <h2 ref={heading} tabIndex={-1} title={event.title}>{inlineFixture ? "Fixture details" : event.title}</h2>
      <div className="booking-preview-facts">
        {!fixture && <span className="booking-preview-interval"><Clock size={15} aria-hidden="true" />
          <strong>{start ? start.time : "Time unassigned"}{end && "–" + end.time}</strong>
          <small>{minutes === null ? "Duration unknown" : minutes.toLocaleString("en-AU", { maximumFractionDigits: 2 }) + " min"}</small>
        </span>}
        <span className="booking-preview-date"><CalendarDays size={14} aria-hidden="true" />{date}</span>
        {end && start?.date !== end.date && <span>Ends {end.date}</span>}
      </div>
    </header>
    <div ref={reading} className="programme-inspector-scroll" role="region" aria-label={fixture ? "Match information" : "Session coaching information"} tabIndex={0}>
      {problem && <p role="alert" className="programme-source-unavailable">{problem}</p>}
      {fixture ? <section className="booking-preview-match-panel" aria-label="Match kickoff">
        <div className="booking-preview-match-icon"><Trophy size={28} aria-hidden="true" /></div>
        <div className="booking-preview-match-kickoff">
          <h3>Kickoff</h3>
          <strong>{start?.time ?? "Time TBC"}</strong>
          {end && <span>Until {start?.date !== end.date ? end.date + " " : ""}{end.time}</span>}
        </div>
        {minutes !== null && <div className="booking-preview-match-duration">
          <span>Booked duration</span>
          <strong>{minutes.toLocaleString("en-AU", { maximumFractionDigits: 2 })} <small>min</small></strong>
        </div>}
        <p><MapPin size={16} aria-hidden="true" />{event.venue ?? "Venue unassigned"}{event.areaLabel && " · " + event.areaLabel}</p>
      </section> : problem ? null : <>
        <section className="booking-preview-diagram" aria-label="Saved activity diagram">
          <div className="booking-preview-section-heading">
            <h3 ref={diagramHeading} tabIndex={-1}>Tactical diagram</h3>
            <div className="booking-preview-tools">
              {diagramActivities.length > 1 && <select aria-label="Diagram activity" value={current?.activity.id ?? ""} disabled={disabled}
              onChange={e => setDiagramKey(diagrams.find(d => d.activity.id === e.target.value)!.key)}>
              {diagramActivities.map(activity => <option key={activity.id} value={activity.id}>{activity.content.title}</option>)}
            </select>}
              {current && <div role="group" aria-label="Saved diagrams">{diagrams.filter(d => d.activity.id === current.activity.id).map(d =>
                <button key={d.key} disabled={disabled} aria-pressed={diagramKey === d.key}
                  aria-label={"Diagram " + (d.diagramIndex + 1) + " · r" + d.pin.scene.revision}
                  onClick={() => setDiagramKey(d.key)}>{d.diagramIndex + 1}</button>)}</div>}
            </div>
          </div>
          {diagrams.length ? <figure className="booking-preview-pitch">
            <div className="calendar-scene-preview">
              {current?.scene ? <SceneDiagram scene={current.scene} title={current.activity.content.title} screenMode="standard"
                sizingSeconds={current.pin.representativeSeconds} autoFitContent
                options={coachingScreenOptions(current.scene, current.pin.representativeSeconds, current.activity.content.area)} />
                : <p role="alert" className="programme-source-unavailable">The exact diagram revision is unavailable. No substitute was selected.</p>}
            </div>
            {current && <figcaption className="booking-preview-pitch-caption">
              {diagramActivities.length === 1 && <span>{current.activity.content.title}</span>}
              <details className="booking-preview-snapshot-details">
                <summary>Saved snapshot</summary>
                <small>Revision {current.pin.scene.revision} · {current.pin.representativeSeconds} seconds</small>
              </details>
            </figcaption>}
          </figure> : <p className="calendar-muted programme-no-diagram">No tactical diagrams attached to this session.</p>}
        </section>
        {session && <section className="booking-preview-objective" aria-label="Session objective"><Target size={16} aria-hidden="true" /><p>{session.content.objective ?? "Coaching content has not been added."}</p></section>}
        <section className="booking-preview-plan"><div className="booking-preview-section-heading"><h3>Activity sequence</h3><span>{activities.length} activities</span></div>
          {activities.length ? <ol className="calendar-activities">{activities.map((activity,i) => <li key={activity.id} data-activity={activity.id} title={activity.role.replaceAll("-"," ")} className={current?.activity.id === activity.id ? "programme-inspector-current-activity" : undefined}>
            <span>{i+1}</span><div>{activity.content.diagrams.length ? <button className="programme-activity-diagram" disabled={disabled} aria-label={`Show diagram for ${activity.content.title}`} onClick={() => { setDiagramKey(diagrams.find(d => d.activity.id === activity.id)!.key); reading.current?.scrollTo({top:0}); diagramHeading.current?.focus({preventScroll:true}); }}>{activity.content.title}</button> : activity.content.title}<small>{activity.role.replaceAll("-"," ")}</small></div>
            <strong>{activity.durationMinutes ?? "TBC"}{activity.durationMinutes !== null && "m"}</strong></li>)}</ol> : <p className="calendar-muted">No activities yet. Open the session editor to add structured coaching activities.</p>}
        </section>

        {(emphasis || !!session?.content.focus.length) && <section><h3>Coaching notes</h3>
          {!!session?.content.focus.length && <div className="calendar-tags">{session.content.focus.map((focus,i) => <span key={i}>{focus}</span>)}</div>}
          {emphasis && <><p className="programme-emphasis-source">{emphasis.content.title}</p>{emphasis.content.coachingPoints.length ? <ul className="programme-coaching-points">{emphasis.content.coachingPoints.map((point,i)=><li key={i}>{point}</li>)}</ul> : <p className="calendar-muted">No coaching points authored for this activity.</p>}</>}</section>}
      </>}
      <details className="programme-inspector-details booking-preview-booking-details"><summary>{fixture ? "Booking information" : "Staff & booking information"}</summary><dl className="calendar-meta"><div><dt>Date</dt><dd>{event.localDate}</dd></div><div><dt>Team</dt><dd>{bundle.teams.find(t => t.id === event.teamId)?.name ?? "Team unavailable"}</dd></div><div><dt>Time zone</dt><dd>{event.timeZone}</dd></div><div><dt>Status</dt><dd>{event.status} · {demo ? "illustrative" : "booking v" + event.revision}</dd></div><div><dt>Location</dt><dd>{event.venue ?? "Venue unassigned"}<small>{event.areaLabel ?? "Area unassigned"}</small></dd></div></dl>
        {!fixture && !problem && <><h4>Coaching staff</h4>{session?.coaches.length ? session.coaches.map(assignment => <p key={assignment.coachId}>{bundle.coaches.find(c => c.id === assignment.coachId)?.displayName ?? "Coach unavailable"}<span className="calendar-muted"> · {assignment.role}</span></p>) : <p className="calendar-muted">No coaches assigned</p>}</>}
        {session && <p className="calendar-footnote">Pinned session revision {session.revision} · {session.documents.length} document references. Saved guides use this exact session revision; saved PDFs are historical exports and may show an earlier schedule.</p>}
      </details>
      {session && <details className="booking-preview-booking-details"><summary>Booking & reuse</summary>{bookingActions}<p className="programme-action-help">Edit Booking changes scheduling only. Open Session edits coaching content.</p></details>}
    </div>
    <footer className="calendar-booking-actions programme-inspector-actions">
      {session && <div className="programme-primary-actions"><Link className="coaching-session-link" href={withCalendar(`/sessions?event=${encodeURIComponent(event.id)}&revision=${event.revision}`,context)}><ExternalLink size={16} aria-hidden="true" />Open Session</Link>
        <Link className="coaching-session-link" href={withCalendar(guideHref({session:session.id,revision:session.revision,event:event.id,bookingRevision:event.revision}),context)}><FileText size={16} aria-hidden="true" />Coaching Guide</Link></div>}
      {!session && bookingActions}
    </footer>
  </aside>;
}
