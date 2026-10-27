import type { DomainBundle } from "@/lib/domain/validation";
import type { CalendarEvent } from "@/lib/domain/calendar";
import type { Session } from "@/lib/domain/session";
import { localParts, sessionLabels } from "@/lib/calendar/schedule";
import { activityTotals } from "@/lib/coaching/sessions";
import { SceneDiagram } from "@/components/tactical/SceneDiagram";

/** Present every coaching field from the exact saved revision; diagram slots retain stable activity identities. */
export function CoachingGuide({ bundle, session, event }: { bundle: DomainBundle; session: Session; event?: CalendarEvent }) {
  const total = activityTotals(session.content.activities);
  const start = event?.startsAt ? localParts(event.startsAt, event.timeZone) : null;
  const end = event?.endsAt ? localParts(event.endsAt, event.timeZone) : null;
  return <><section className="guide-summary" aria-label="Session guide summary"><div className="guide-facts">
    <div><span>Team</span><strong>{bundle.teams.find((t) => t.id === session.teamId)?.name}</strong></div>
    <div><span>Session type</span><strong>{sessionLabels[session.content.kind]}</strong></div>
    <div><span>Schedule</span><strong>{event ? `${event.localDate} · ${start?.time ?? "Time TBC"}${end ? ` – ${end.date !== start?.date ? `${end.date} ` : ""}${end.time}` : ""}` : "Unscheduled plan"}</strong>{event && <small>{event.timeZone} · {event.status}</small>}</div>
    <div><span>Venue / area</span><strong>{event?.venue ?? "Not specified"}</strong><small>{event?.areaLabel ?? "Area not specified"}</small></div>
    <div><span>Planned activities</span><strong>{total.minutes} known minutes</strong><small>{total.unknown} untimed activities</small></div>
    <div><span>Assigned coaches</span><strong>{session.coaches.map((c) => `${bundle.coaches.find((coach) => coach.id === c.coachId)?.displayName ?? c.coachId} (${c.role})`).join(" · ") || "Unassigned"}</strong></div>
  </div><h2>Session objective</h2><p>{session.content.objective ?? "Not specified"}</p>
    {!!session.content.focus.length && <div className="guide-tags">{session.content.focus.map((tag, i) => <span key={i}>{tag}</span>)}</div>}</section>
    <div className="guide-layout"><nav className="guide-index" aria-label="Guide activities"><h2>Session sequence</h2>{session.content.activities.map((activity, i) => <a key={activity.id} href={`#activity-${activity.id}`}><span>{String(i + 1).padStart(2, "0")}</span><strong>{activity.content.title}</strong><small>{activity.durationMinutes === null ? "Untimed" : `${activity.durationMinutes} min`}</small></a>)}</nav>
      <div className="guide-activities">{session.content.activities.map((activity, i) => {
        const content = activity.content;
        return <article id={`activity-${activity.id}`} key={activity.id} className="guide-activity" aria-labelledby={`title-${activity.id}`}>
          <header><div><p className="calendar-eyebrow">{String(i + 1).padStart(2, "0")} · {activity.role.replaceAll("-", " ")}</p><h2 id={`title-${activity.id}`}>{content.title}</h2></div><strong>{activity.durationMinutes === null ? "Untimed" : `${activity.durationMinutes} minutes`}</strong></header>
          <div className="guide-activity-overview"><div><h3>Setup information</h3><dl><dt>Participants</dt><dd>{content.playerCount ?? "Not specified"}</dd><dt>Area</dt><dd>{content.area ? `${content.area.length} × ${content.area.width} m` : "Not specified"}</dd>
            {content.area && <><dt>Origin</dt><dd>{content.area.origin.x}, {content.area.origin.y} m</dd></>}</dl>
            <h3>Equipment</h3>{content.equipment.length ? <table><thead><tr><th>Item</th><th>Quantity</th></tr></thead><tbody>{content.equipment.map((item, n) => <tr key={n}><td>{item.name}</td><td>{item.quantity ?? "Not specified"}</td></tr>)}</tbody></table> : <p className="calendar-muted">Not specified</p>}</div>
            <aside className="guide-diagram-slot" aria-label={`Diagram position for ${content.title}`}><strong>Activity diagram</strong>
              {content.diagrams.length ? content.diagrams.map((diagram, n) => {
                const scene = bundle.scenes.find((s) => s.id === diagram.scene.id && s.revision === diagram.scene.revision);
                return <figure className="guide-saved-diagram" key={n}>{scene ? <div className="guide-diagram-canvas"><SceneDiagram scene={scene} title={`${content.title} · diagram ${n + 1}`} options={{ fit: "exercise", exerciseArea: content.area ?? undefined, seconds: diagram.representativeSeconds }} /></div> : <p role="alert">The referenced scene revision is unavailable.</p>}<figcaption>Scene {diagram.scene.id} · revision {diagram.scene.revision} · {diagram.representativeSeconds}s</figcaption></figure>;
              }) : <p>No diagram attached to this activity.</p>}</aside></div>
          <section><h3>Setup & delivery instructions</h3>{content.instructions.length ? <ol>{content.instructions.map((line, n) => <li key={n}>{line}</li>)}</ol> : <p className="calendar-muted">Not specified</p>}</section>
          <div className="guide-coaching-notes">{([ ["Coaching points", content.coachingPoints], ["Progressions", content.progressions], ["Regressions", content.regressions], ["Variations", content.variations] ] as const).map(([title, lines]) => <section key={title}><h3>{title}</h3>{lines.length ? <ul>{lines.map((line, n) => <li key={n}>{line}</li>)}</ul> : <p className="calendar-muted">Not specified</p>}</section>)}</div>
        </article>;
      })}{!session.content.activities.length && <p className="coaching-empty">This saved revision has no activities. Add them in the session editor.</p>}</div></div>
  </>;
}
