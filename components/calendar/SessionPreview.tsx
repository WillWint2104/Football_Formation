import { CalendarDays, Clock, MapPin, Users, X } from "lucide-react";
import Link from "next/link";
import type { CalendarEvent } from "@/lib/domain/calendar";
import type { DomainBundle } from "@/lib/domain/validation";
import { eventSession, localParts, sessionLabels } from "@/lib/calendar/schedule";
import { SessionTypeIcon } from "./SessionTypeIcon";
import { guideHref } from "@/lib/documents/contracts";
import { SceneDiagram } from "@/components/tactical/SceneDiagram";

/** Preview one independent booking and its exact pinned content, without inventing missing diagrams. */
export function SessionPreview({ bundle, event, demo, onClose, onSchedule, disabled }: {
  bundle: DomainBundle; event: CalendarEvent | undefined; demo: boolean;
  onClose: () => void; onSchedule: () => void; disabled: boolean;
}) {
  if (!event) return <aside className="calendar-preview"><p className="calendar-eyebrow">Session preview</p>
    <h2>Select a session</h2><p className="calendar-muted">Choose an individual card to see its time, staff and coaching content.</p></aside>;
  const session = eventSession(bundle, event);
  const kind = session?.content.kind ?? "other";
  const illustratedActivity = session?.content.activities.find((activity) => activity.content.diagrams.length);
  const diagram = illustratedActivity?.content.diagrams[0];
  const scene = diagram && bundle.scenes.find((s) => s.id === diagram.scene.id && s.revision === diagram.scene.revision);
  return <aside className="calendar-preview" aria-label="Session preview">
    <div className="calendar-preview-top"><span className="calendar-eyebrow">Session preview</span>
      <button onClick={onClose} aria-label="Dismiss session preview"><X size={16} /></button></div>
    <div className={`calendar-type-heading calendar-type-${kind}`}><SessionTypeIcon kind={kind} /><span>{session ? sessionLabels[kind] : event.kind}</span></div>
    <h2>{event.title}</h2>
    <span className="calendar-badge">{event.status} · {demo ? "illustrative" : `booking v${event.revision}`}</span>
    <dl className="calendar-meta">
      <div><dt><CalendarDays size={16} />Date</dt><dd>{event.localDate}</dd></div>
      <div><dt><Clock size={16} />Time</dt><dd>{event.startsAt ? localParts(event.startsAt, event.timeZone).time : "Unscheduled"}
        {event.endsAt && ` – ${localParts(event.endsAt, event.timeZone).time}`}
        {event.endsAt && localParts(event.endsAt, event.timeZone).date !== event.localDate && ` (${localParts(event.endsAt, event.timeZone).date})`}
        <small>{event.timeZone}</small></dd></div>
      <div><dt><Users size={16} />Team</dt><dd>{bundle.teams.find((t) => t.id === event.teamId)?.name}</dd></div>
      <div><dt><MapPin size={16} />Location</dt><dd>{event.venue ?? "Venue unassigned"}<small>{event.areaLabel ?? "Area unassigned"}</small></dd></div>
    </dl>
    <section><h3>Coaching staff</h3>{session?.coaches.length ? session.coaches.map((assignment) => <p key={assignment.coachId}>
      {bundle.coaches.find((c) => c.id === assignment.coachId)?.displayName}<span className="calendar-muted"> · {assignment.role}</span>
    </p>) : <p className="calendar-muted">No coaches assigned</p>}</section>
    <section><h3>Session objective</h3><p>{session?.content.objective ?? "Coaching content has not been added."}</p>
      {!!session?.content.focus.length && <div className="calendar-tags">{session.content.focus.map((focus, i) => <span key={i}>{focus}</span>)}</div>}</section>
    {scene && diagram && <section aria-label="Saved activity diagram"><h3>{illustratedActivity!.content.title}</h3><div className="calendar-scene-preview"><SceneDiagram scene={scene} title={illustratedActivity!.content.title} options={{ exerciseArea: illustratedActivity!.content.area ?? undefined, seconds: diagram.representativeSeconds }} /></div></section>}
    <section><h3>Activities <span className="calendar-muted">({session?.content.activities.length ?? 0})</span></h3>
      {session?.content.activities.length ? <ol className="calendar-activities">{session.content.activities.map((activity, i) => <li key={activity.id}>
        <span>{String(i + 1).padStart(2, "0")}</span><div>{activity.content.title}<small>{activity.role.replaceAll("-", " ")}</small></div>
        <strong>{activity.durationMinutes ?? "TBC"}{activity.durationMinutes !== null && "m"}</strong></li>)}</ol>
        : <p className="calendar-muted">No activities yet. Open the session editor to add structured coaching activities.</p>}
    </section>
    {session && <p className="calendar-muted calendar-footnote">Pinned session revision {session.revision} · {session.documents.length} document references.
      Saved guides, diagrams and private attachments use this exact session revision.</p>}
    {session && <Link className="coaching-session-link" href={`/sessions?event=${encodeURIComponent(event.id)}&revision=${event.revision}`}>Open session editor</Link>}
    {session && <Link className="coaching-session-link" href={guideHref({ session: session.id, revision: session.revision, event: event.id, bookingRevision: event.revision })}>Open coaching guide</Link>}
    <button className="calendar-primary calendar-wide" onClick={onSchedule} disabled={disabled || event.status === "cancelled"}>Reschedule booking</button>
  </aside>;
}
