"use client";

import Link from "next/link";
import { ArrowUpRight, CalendarDays, ClipboardList, Clock, Layers, Pencil, X } from "lucide-react";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@/lib/domain/session";
import type { CalendarSnapshot } from "@/lib/calendar/client";
import { localParts, sessionLabels } from "@/lib/calendar/schedule";
import { activityTotals } from "@/lib/coaching/sessions";
import { sessionCopyIds, sessionCopyOccurrence, type SessionCopyRequest } from "@/lib/coaching/session-copy";
import { useCoaching } from "@/components/coaching/CoachingProvider";
import { ScheduleDialog } from "@/components/calendar/ScheduleDialog";
import { CoachingDiagramPreview } from "@/components/tactical/CoachingDiagramPreview";
import type { CalendarEvent } from "@/lib/domain/calendar";
import { sessionPreviewHref } from "@/lib/coaching/catalogue";
import { withActivityView, type ActivityViewSelection } from "@/lib/coaching/session-view";

export type CalendarPreviewNavigation = {
  date: string; previewHref: string; currentHref: string; completedHref: (event: CalendarEvent) => string;
  onSchedule: () => void; onCancel: () => void; onSaved: (event: CalendarEvent) => void;
};

/** Reuse the organisation graph's read/commit boundary; local C3 packages are never inspected. */
export function SessionLibraryPreview({ source, copyRequest, editHref, calendar, explorer, previewHref: libraryHref, latestHref }: {
  source: Session; copyRequest?: SessionCopyRequest; editHref: string; calendar?: CalendarPreviewNavigation;
  explorer?: { booking?: CalendarEvent; closeHref: string; editLabel: string; viewerHref: string; selection?: ActivityViewSelection }; previewHref?: string; latestHref?: string;
}) {
  const { snapshot, scope, mode, busy, loading, blocked } = useCoaching();
  const router = useRouter(), activity = source.content.activities;
  const initialActivity = activity.find(a => a.id === explorer?.selection?.activityId);
  const [selected, setSelected] = useState(initialActivity?.id ?? activity.find((a) => a.content.diagrams.length)?.id ?? activity[0]?.id ?? "");
  const [diagram, setDiagram] = useState(initialActivity ? explorer?.selection?.diagramIndex ?? 0 : 0);
  const selectedActivity = activity.find((a) => a.id === selected), total = activityTotals(activity);
  const previewHref = calendar?.previewHref ?? libraryHref ?? sessionPreviewHref(source);
  const ids = copyRequest ? sessionCopyIds(copyRequest) : null;
  const existingEvent = copyRequest ? sessionCopyOccurrence(snapshot.bundle, copyRequest) : undefined;
  const completed = !!existingEvent;
  const used = !!ids && (snapshot.bundle.events.some((e) => e.id === ids.eventId) || snapshot.bundle.sessions.some((s) => s.id === ids.sessionId));
  const current = Math.max(...snapshot.bundle.sessions.filter((s) => s.id === source.id).map((s) => s.revision)) === source.revision;
  const pin = selectedActivity?.content.diagrams[diagram];
  const scene = pin && snapshot.bundle.scenes.find((s) => s.organizationId === source.organizationId && s.id === pin.scene.id && s.revision === pin.scene.revision);
  const count = activity.reduce((n, a) => n + a.content.diagrams.length, 0);
  const team = snapshot.bundle.teams.find(t => t.id === source.teamId)?.name ?? "Team unavailable";
  const schedule = <button type="button" className={explorer ? "explorer-secondary-action" : "calendar-primary"}
    disabled={busy || loading || blocked || !current || !!copyRequest}
    onClick={() => calendar ? calendar.onSchedule() : router.replace(`${previewHref}&copy=${crypto.randomUUID()}`, { scroll: false })}>
    {explorer && <CalendarDays size={16} aria-hidden="true" />}Schedule independent copy</button>;
  const summary = <section className="library-preview-summary"><h3>Session objective</h3><p>{source.content.objective ?? "Not specified"}</p>
    {!!source.content.focus.length && <p className="library-preview-focus">{source.content.focus.join(" · ")}</p>}
    <p><b>Assigned coaches:</b> {source.coaches.map(c => `${snapshot.bundle.coaches.find(v => v.id === c.coachId)?.displayName ?? "Coach unavailable"} (${c.role})`).join(" · ") || "Not assigned"}</p></section>;
  const sequence = <nav aria-label="Preview activity sequence"><h3>Activity sequence</h3>{activity.map((a, i) => <button type="button" key={a.id} aria-current={a.id === selected ? "step" : undefined} onClick={() => { setSelected(a.id); setDiagram(0); }}>
    <span>{i + 1}</span><strong title={explorer ? a.content.title : undefined}>{a.content.title}</strong><small>{a.durationMinutes === null ? "Duration not specified" : `${a.durationMinutes} min`}{!explorer && ` · ${a.content.diagrams.length} diagrams`}</small></button>)}
    {!activity.length && <p>No activities in this saved revision.</p>}</nav>;
  return <section className="session-library-preview" aria-label="Saved session preview">
    {explorer && <div className="explorer-inspector-bar"><span><ClipboardList size={17} aria-hidden="true" /> Session preview</span><Link href={explorer.closeHref} scroll={false} aria-label="Close preview"><X size={19} aria-hidden="true" /></Link></div>}
    <div className={explorer ? "explorer-inspector-body" : undefined}>
    <header className="library-preview-heading"><div>{!explorer && <p>Saved session preview · revision {source.revision}</p>}<h2>{source.content.title}</h2>
      <span>{sessionLabels[source.content.kind]} · {team}{explorer && ` · Session r${source.revision}`}</span></div>
      {!explorer && <div className="library-preview-actions">{!calendar && <Link href={editHref}>Open existing editor</Link>}{schedule}</div>}</header>
    <div className="library-preview-facts"><span>{explorer && <Clock aria-hidden="true" />}<b>{explorer && !activity.length ? "No activity time" : `${total.minutes}${!explorer || total.unknown ? " known" : ""} min`}</b>{total.unknown ? ` · ${total.unknown} untimed` : !explorer && " · all activities timed"}</span>
      <span>{explorer && <Layers aria-hidden="true" />}{activity.length} activities · {count} {explorer ? "diagrams" : "diagram references"}</span>
      {explorer?.booking ? <span><CalendarDays aria-hidden="true" />{explorer.booking.localDate} · Booking r{explorer.booking.revision}</span> : <span>{mode === "sample" ? "Sample only · changes disappear on reload" : explorer ? "Saved plan" : "Organisation-owned saved content"}</span>}</div>
    {!explorer && summary}
    {!current && <p className="library-preview-warning">Historical session revision {source.revision}. A newer source revision exists. This preview remains exact and read only. <Link href={calendar?.currentHref ?? latestHref ?? `/sessions?session=${encodeURIComponent(source.id)}&organization=${encodeURIComponent(source.organizationId)}&view=preview`}>Use Latest Available Version</Link> to preview it before confirming a new copy. The original booking keeps its historical version.</p>}
    {completed && existingEvent && <section className="library-preview-completed" role="status"><h3>Independent occurrence found for this request</h3>
      <p>{mode === "sample" ? "Applied in sample memory only; reload discards it." : "The saved booking and session copy are present in the validated organisation snapshot."} The original remains unchanged.</p>
      <Link href={calendar?.completedHref(existingEvent) ?? `/calendar?date=${existingEvent.localDate}&event=${encodeURIComponent(existingEvent.id)}`}>Open scheduled occurrence</Link>
      <Link href={previewHref}>Return to preview</Link></section>}
    {used && !completed && <p role="alert" className="library-preview-warning">This request identity is already present but its complete occurrence could not be resolved. Reload and inspect saved records. No new copy was created.</p>}
    <div className="library-preview-layout">{sequence}
      {selectedActivity && <article className="library-preview-activity" aria-label="Preview activity details"><h3>{selectedActivity.content.title}</h3>
        <p className="library-preview-activity-meta">{selectedActivity.role.replaceAll("-", " ")} · {selectedActivity.durationMinutes === null ? "Duration not specified" : `${selectedActivity.durationMinutes} min`} · {selectedActivity.content.playerCount === null ? "Participants not specified" : `${selectedActivity.content.playerCount} participants`}</p>
        {selectedActivity.content.diagrams.length > (explorer ? 1 : 0) && <div className="library-preview-diagram-tabs" role="group" aria-label="Preview diagrams">{selectedActivity.content.diagrams.map((p, i) => <button key={i} aria-pressed={i === diagram} onClick={() => setDiagram(i)}>Diagram {i + 1} · r{p.scene.revision}</button>)}</div>}
        {pin ? <figure><div className="library-preview-diagram">{scene ? <CoachingDiagramPreview scene={scene} screenMode="standard" title={`${selectedActivity.content.title} · diagram ${diagram + 1}`} area={selectedActivity.content.area} seconds={pin.representativeSeconds} /> : <p role="alert">The exact diagram revision is unavailable. No substitute was selected.</p>}</div>
          <figcaption>{!explorer && `Saved diagram revision ${pin.scene.revision} · snapshot ${pin.representativeSeconds}s`}<details><summary>Exact source</summary>{source.organizationId} · {pin.scene.id} · r{pin.scene.revision} · {pin.representativeSeconds}s</details></figcaption></figure> : <p className="library-preview-empty">No diagram attached to this activity.</p>}
        {explorer && summary}
        <div className="library-preview-guidance"><section><h4>Setup & equipment</h4><p>{selectedActivity.content.area ? `${selectedActivity.content.area.length} × ${selectedActivity.content.area.width} m` : "Field dimensions not specified"}</p>
          {selectedActivity.content.equipment.length ? <ul>{selectedActivity.content.equipment.map((e, i) => <li key={i}>{e.name} · {e.quantity === null ? "quantity not specified" : e.quantity}</li>)}</ul> : <p>Equipment not specified</p>}
          <h4>Delivery instructions</h4>{selectedActivity.content.instructions.length ? <ol>{selectedActivity.content.instructions.map((line, i) => <li key={i}>{line}</li>)}</ol> : <p>Not specified</p>}</section>
          <section><h4>Coaching points</h4>{selectedActivity.content.coachingPoints.length ? <ul>{selectedActivity.content.coachingPoints.map((line, i) => <li key={i}>{line}</li>)}</ul> : <p>Not specified</p>}
            {!!selectedActivity.content.progressions.length && <><h4>Progressions</h4><ul>{selectedActivity.content.progressions.map((line, i) => <li key={i}>{line}</li>)}</ul></>}</section></div>
      </article>}</div>
    {explorer && !selectedActivity && summary}
    {explorer ? <details className="explorer-copy-info"><summary>What is copied when scheduling?</summary><p>Activities, staff and exact diagram revisions carry into an independent session. Choose an eligible team for the retained staff. Document associations stay with the source.</p></details>
      : <p className="library-preview-boundary">Scheduling copies this previewed current revision into a new identity. Choose a team eligible for all retained staff; no coach is removed automatically. Activities and exact diagram pins are retained; document associations are not copied. The source and other bookings stay unchanged. Local C3 packages remain separate.</p>}
    </div>
    {explorer && <footer className="explorer-inspector-actions">
      <Link href={withActivityView(explorer.viewerHref, selectedActivity && { activityId: selectedActivity.id, diagramIndex: pin ? diagram : undefined })} className="explorer-full-action"><ArrowUpRight size={18} aria-hidden="true" />Open Full Session</Link>
      <Link href={editHref} className="explorer-secondary-action"><Pencil size={16} aria-hidden="true" />{explorer.editLabel}</Link>
      {schedule}
    </footer>}
    {copyRequest && !used && <CopyDialog key={`${scope}:${copyRequest.requestId}`} request={copyRequest} date={calendar?.date} onSaved={calendar?.onSaved} onClose={() => calendar ? calendar.onCancel() : router.replace(previewHref, { scroll: false })} />}
  </section>;
}

/** Capture the original validated graph once; another save cannot silently rebase this dialog. */
function CopyDialog({ request, onClose, date, onSaved }: { request: SessionCopyRequest; onClose: () => void; date?: string; onSaved?: (event: CalendarEvent) => void }) {
  const { snapshot, commit, busy, blocked, mode, reload } = useCoaching();
  const [base] = useState<CalendarSnapshot>(snapshot);
  const returnFocus = useRef<HTMLInputElement>(null);
  return <ScheduleDialog bundle={base.bundle} date={date ?? localParts(new Date().toISOString(), "Australia/Sydney").date}
    demo={mode === "sample"} busy={busy} blocked={blocked} returnFocus={returnFocus} copyRequest={request} onClose={onClose}
    onReload={() => void reload(base.bundle.organizationId)}
    onSave={async (bundle, event) => { await commit(base, bundle); onSaved?.(event); }} />;
}
