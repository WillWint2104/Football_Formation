"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, Clock3, Flag, Goal, Image as DiagramIcon, Map as FieldIcon, Maximize, Minimize, Pencil, Route, Scan, Users, Wind } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { useCoaching } from "@/components/coaching/CoachingProvider";
import { CoachingDiagramPreview } from "@/components/tactical/CoachingDiagramPreview";
import { latestEvents, sessionLabels } from "@/lib/calendar/schedule";
import { scopedSessionEditorHref, sessionPreviewHref, withLibraryFilters } from "@/lib/coaching/catalogue";
import { resolveSessionView, withActivityView, type SessionViewReference } from "@/lib/coaching/session-view";
import { activityTotals } from "@/lib/coaching/sessions";
import type { CalendarEvent } from "@/lib/domain/calendar";
import type { Session, SessionActivity } from "@/lib/domain/session";
import type { TacticalScene } from "@/lib/domain/tactical-scene";
import type { DomainBundle } from "@/lib/domain/validation";
import { resolveDiagramTarget } from "@/lib/tactical/persistence";
import { SessionViewerGuidance } from "./SessionViewerGuidance";

export function SessionViewer({ reference }: { reference: SessionViewReference | null }) {
  const { snapshot, loading, mode, organization, organizations, reload, scope, message, busy, blocked } = useCoaching();
  const bundle = snapshot.bundle;
  const canShowBundle = mode === "saved" || !organization;
  const exact = !loading && reference && canShowBundle ? resolveSessionView(bundle, reference) : null;
  if (reference && exact) {
    const backHref = withActivityView(withLibraryFilters(sessionPreviewHref(exact.session, exact.booking), reference.search, reference.kind), reference.selection);
    const editHref = withLibraryFilters(scopedSessionEditorHref(exact.session, exact.booking), reference.search, reference.kind);
    return <SessionView key={scope} bundle={bundle} session={exact.session} booking={exact.booking} selection={reference.selection}
      backHref={backHref} editHref={editHref} sample={mode === "sample"} scheduleBlocked={busy || blocked} />;
  }
  const membership = organizations.find(item => item.id === reference?.organizationId);
  return <div className="session-viewer">
    <Link className="viewer-back" href={withLibraryFilters("/sessions", reference?.search ?? "", reference?.kind ?? "")}><ArrowLeft size={16} aria-hidden="true" /> Saved Sessions</Link>
    <section className="viewer-unavailable">
      <h1>{!reference ? "Invalid session reference" : loading ? "Opening saved session…" : "Saved session unavailable"}</h1>
      {reference && (loading ? <p role="status">Loading the requested organisation and session revision.</p> :
        <><p role="status">The requested session, booking or saved diagram could not be verified. {mode !== "saved" && message}</p>
          {membership && <button className="viewer-button" type="button" onClick={() => void reload(membership.id)}>Load {membership.name}</button>}</>)}
    </section>
  </div>;
}

type DiagramControl = "select" | "previous" | "next";
const activityIcons = { "warm-up": Route, exercise: Goal, "cool-down": Wind, briefing: ClipboardList } satisfies Record<SessionActivity["role"], typeof Goal>;

function SessionView({ bundle, session, booking, selection, backHref, editHref, sample, scheduleBlocked }: {
  bundle: DomainBundle; session: Session; booking?: CalendarEvent; selection: SessionViewReference["selection"];
  backHref: string; editHref: string; sample: boolean; scheduleBlocked: boolean;
}) {
  const router = useRouter();
  const activities = session.content.activities;
  const [activityId, setActivityId] = useState(selection?.activityId ?? activities[0]?.id);
  const [diagramIndex, setDiagramIndex] = useState(selection?.diagramIndex ?? 0);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState(false);
  const board = useRef<HTMLElement>(null);
  const activityStrip = useRef<HTMLDivElement>(null);
  const fullscreenToggle = useRef<HTMLButtonElement>(null);
  const restoreDiagramFocus = useRef<DiagramControl>(null);
  const enteredFullscreen = useRef(false);

  useEffect(() => {
    function updateFullscreen() {
      const active = document.fullscreenElement === board.current;
      if (!active && enteredFullscreen.current) {
        const target = board.current?.querySelector(".viewer-board-empty")
          ? activityStrip.current?.querySelector<HTMLButtonElement>('[aria-current="step"]')
          : fullscreenToggle.current;
        target?.focus({ preventScroll: true });
      }
      enteredFullscreen.current = active;
      setFullscreen(active);
    }
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () => document.removeEventListener("fullscreenchange", updateFullscreen);
  }, []);

  useLayoutEffect(() => {
    const strip = activityStrip.current;
    const selected = strip?.querySelector<HTMLButtonElement>('[aria-current="step"]');
    if (!strip || !selected) return;
    const viewport = strip.getBoundingClientRect();
    const card = selected.getBoundingClientRect();
    if (card.left < viewport.left) strip.scrollLeft += card.left - viewport.left - 4;
    else if (card.right > viewport.right) strip.scrollLeft += card.right - viewport.right + 4;
  }, [activityId]);

  useLayoutEffect(() => {
    const control = restoreDiagramFocus.current;
    if (!control) return;
    restoreDiagramFocus.current = null;
    board.current?.querySelector<HTMLElement>(`[data-viewer-diagram-control="${control}"]`)?.focus({ preventScroll: true });
  }, [diagramIndex]);

  const activityIndex = activities.findIndex(activity => activity.id === activityId);
  const activity = activities[activityIndex];
  const diagrams = activity?.content.diagrams ?? [];
  const pin = diagrams[diagramIndex];
  let scene: TacticalScene | undefined;
  if (pin) {
    try {
      const resolved = resolveDiagramTarget(bundle, { kind: "session", id: session.id, revision: session.revision,
        activity: activity.id, event: booking?.id, booking: booking?.revision, diagram: diagramIndex });
      if (resolved.scene?.organizationId === session.organizationId) scene = resolved.scene;
    } catch {
      // Keep the pinned choice available and allow switching to another attachment explicitly.
    }
  }
  const team = bundle.teams.find(team => team.id === session.teamId);
  const total = activityTotals(activities);
  const hasDuration = activities.length > total.unknown;
  const current = !bundle.sessions.some(item => item.id === session.id && item.revision > session.revision);
  const bookings = latestEvents(bundle);
  const editable = booking ? bookings.find(item => item.id === booking.id)?.revision === booking.revision
    : current && !bookings.some(item => item.session?.id === session.id);
  const previousIndex = activityIndex - 1;
  const nextIndex = activityIndex + 1;

  function selectActivity(index: number) {
    const next = activities[index];
    if (!next || next.id === activityId) return;
    setActivityId(next.id);
    setDiagramIndex(0);
  }

  function navigateActivity(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const target = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: activities.length - 1 }[event.key];
    if (target === undefined || !activities[target]) return;
    event.preventDefault();
    selectActivity(target);
    activityStrip.current?.querySelectorAll("button")[target]?.focus({ preventScroll: true });
  }

  function selectDiagram(index: number, control: DiagramControl) {
    if (!diagrams[index] || index === diagramIndex) return;
    restoreDiagramFocus.current = control;
    setDiagramIndex(index);
  }

  async function toggleFullscreen() {
    setFullscreenError(false);
    try {
      if (document.fullscreenElement === board.current) await document.exitFullscreen();
      else await board.current?.requestFullscreen();
    } catch {
      setFullscreenError(true);
    }
  }

  const heading = <div className="viewer-board-heading">
    <h2>{activity?.content.title ?? "Tactical board"}</h2>
    {activity && <p>Activity {activityIndex + 1} of {activities.length}</p>}
  </div>;
  const canSelectDiagram = diagrams.length > 1 || !pin;
  const attachments = diagrams.length > 0 && <div className="viewer-diagrams viewer-tool-group" role={canSelectDiagram ? "group" : undefined}
    aria-label={canSelectDiagram ? "Attached diagrams" : undefined}>
    <span className="viewer-tool-label" aria-hidden="true"><DiagramIcon size={15} />Diagram</span>
    {canSelectDiagram ? <>
      <select aria-label="Attached diagram" data-viewer-diagram-control="select" value={pin ? diagramIndex : -1}
        onChange={event => selectDiagram(Number(event.target.value), "select")}>
        {!pin && <option value={-1} disabled>Unavailable diagram</option>}
        {diagrams.map((_, index) => <option key={index} value={index}>{index + 1} of {diagrams.length}</option>)}
      </select>
      {diagrams.length > 1 && <>
        <button type="button" aria-label="Previous diagram" data-viewer-diagram-control="previous" aria-disabled={!pin || diagramIndex === 0}
          onClick={() => { if (pin) selectDiagram(diagramIndex - 1, "previous"); }}><ChevronLeft size={16} aria-hidden="true" /></button>
        <button type="button" aria-label="Next diagram" data-viewer-diagram-control="next" aria-disabled={!pin || diagramIndex === diagrams.length - 1}
          onClick={() => { if (pin) selectDiagram(diagramIndex + 1, "next"); }}><ChevronRight size={16} aria-hidden="true" /></button>
      </>}
    </> : <span className="viewer-tool-status"><span className="sr-only">Diagram </span>1 of 1</span>}
  </div>;
  const fullscreenButton = <button ref={fullscreenToggle} className="viewer-button viewer-fullscreen" type="button" onClick={() => void toggleFullscreen()}
    aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen tactical board"} title={fullscreen ? "Exit fullscreen" : "Fullscreen tactical board"}>
    {fullscreen ? <Minimize size={17} aria-hidden="true" /> : <Maximize size={17} aria-hidden="true" />}
    {fullscreen && <span>Exit fullscreen</span>}
  </button>;
  const activityActions = <div className="viewer-activity-arrows">
    <button className="viewer-button" type="button" aria-label="Previous activity" aria-disabled={previousIndex < 0} onClick={() => selectActivity(previousIndex)}>
      <ChevronLeft size={17} aria-hidden="true" /> Previous activity
    </button>
    <button className="viewer-button viewer-primary" type="button" aria-label="Next activity" aria-disabled={nextIndex >= activities.length} onClick={() => selectActivity(nextIndex)}>
      Next activity <ChevronRight size={17} aria-hidden="true" />
    </button>
  </div>;

  return <div className="session-viewer">
    <header className="viewer-session-header">
      <Link className="viewer-back" href={backHref}><ArrowLeft size={16} aria-hidden="true" /> Saved Sessions</Link>
      <div className="viewer-session-title">
        <h1>{session.content.title}</h1>
        <div className="viewer-session-facts">
          <span>{sessionLabels[session.content.kind]}</span>
          {hasDuration && <span><Clock3 size={15} aria-hidden="true" />{total.minutes}{total.unknown > 0 && " known"} min</span>}
          {team && <span><Users size={15} aria-hidden="true" />{team.name}</span>}
          {booking && <span><CalendarDays size={15} aria-hidden="true" />{booking.localDate}</span>}
          {sample && <span>Illustrative sample</span>}
        </div>
      </div>
      <div className="viewer-session-actions">
        <Link className="viewer-button" href={editHref}><Pencil size={15} aria-hidden="true" />{editable ? "Edit Session" : "Open saved snapshot"}</Link>
        {current && <button className="viewer-button" type="button" disabled={scheduleBlocked}
          onClick={() => router.push(`${backHref}&copy=${crypto.randomUUID()}`)}><CalendarDays size={16} aria-hidden="true" />Schedule independent copy</button>}
      </div>
    </header>
    {activities.length > 0 && <nav className="viewer-activity-navigation" aria-label="Activity sequence">
      <div className="viewer-activity-steps" ref={activityStrip}>{activities.map((item, index) => {
        const reference = item.content.diagrams[0]?.scene;
        const context = reference && bundle.scenes.find(scene => scene.id === reference.id && scene.revision === reference.revision)?.context;
        const Icon = item.role !== "exercise" ? activityIcons[item.role]
          : context?.kind === "neutral" ? Scan
          : context?.region === "set-piece" ? Flag
          : context?.region === "full" ? FieldIcon : Goal;
        return <button key={item.id} type="button" aria-current={item.id === activityId ? "step" : undefined}
          onClick={() => selectActivity(index)} onKeyDown={event => navigateActivity(event, index)}>
          <span className="viewer-step-index">{String(index + 1).padStart(2, "0")}</span>
          <span className="viewer-step-copy">
            <strong title={item.content.title}>{item.content.title}</strong>
            <small><Icon size={15} aria-hidden="true" />{item.durationMinutes !== null && `${item.durationMinutes} min`}</small>
          </span>
        </button>;
      })}</div>
    </nav>}
    <div className="viewer-workspace">
      <section className="viewer-tactical" ref={board} aria-label="Tactical workspace">
        {fullscreenError && <p className="viewer-fullscreen-message" role="status">Fullscreen is unavailable in this browser window.</p>}
        {scene && pin ? <CoachingDiagramPreview key={`${activityId}:${diagramIndex}`} scene={scene} title={activity.content.title} screenMode="expanded" area={activity.content.area} seconds={pin.representativeSeconds}
          presentation={{ heading, action: fullscreenButton, attachments, activityId: activity.id, diagramIndex, equipment: activity.content.equipment }} /> :
          <><div className="viewer-board-heading-row">{heading}{fullscreen && fullscreenButton}</div>
            {attachments && <div className="viewer-diagram-toolbar">{attachments}</div>}
            <div className="viewer-board-empty">
              <p role={diagrams.length || selection && !activity ? "alert" : undefined}>{activity
                ? diagrams.length ? "The selected diagram revision is unavailable." : "No diagram attached to this activity."
                : activities.length ? "The requested activity is unavailable. Choose an activity above." : "This saved session has no activities."}</p>
            </div></>}
        {fullscreen && activities.length > 1 && activityActions}
      </section>
      {activity && <SessionViewerGuidance key={activity.id} activity={activity} objective={session.content.objective} focus={session.content.focus}
        notes={scene?.stages ?? []} />}
    </div>
    {(activity || activities.length > 1) && <footer className="viewer-activity-footer">
      {activity && <div className="viewer-activity-facts" aria-label="Activity details">
        {activity.durationMinutes !== null && <span><Clock3 size={16} aria-hidden="true" />{activity.durationMinutes} min</span>}
        {activity.content.playerCount !== null && <span><Users size={16} aria-hidden="true" />{activity.content.playerCount} players</span>}
        {activity.content.area && <span><Flag size={16} aria-hidden="true" />{activity.content.area.length} × {activity.content.area.width} m</span>}
      </div>}
      {!fullscreen && activities.length > 1 && activityActions}
    </footer>}
  </div>;
}
