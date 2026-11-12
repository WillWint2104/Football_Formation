"use client";

import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, Clock3, Maximize, Minimize } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useCoaching } from "@/components/coaching/CoachingProvider";
import { CoachingDiagramPreview } from "@/components/tactical/CoachingDiagramPreview";
import { sessionLabels } from "@/lib/calendar/schedule";
import { sessionPreviewHref, withLibraryFilters } from "@/lib/coaching/catalogue";
import { resolveSessionView, withActivityView, type SessionViewReference } from "@/lib/coaching/session-view";
import { activityTotals } from "@/lib/coaching/sessions";
import type { CalendarEvent } from "@/lib/domain/calendar";
import type { Session } from "@/lib/domain/session";
import type { TacticalScene } from "@/lib/domain/tactical-scene";
import type { DomainBundle } from "@/lib/domain/validation";
import { resolveDiagramTarget } from "@/lib/tactical/persistence";
import { SessionViewerGuidance } from "./SessionViewerGuidance";

export function SessionViewer({ reference }: { reference: SessionViewReference | null }) {
  const { snapshot, loading, mode, organization, organizations, reload, scope, message } = useCoaching();
  const bundle = snapshot.bundle;
  const canShowBundle = mode === "saved" || !organization;
  const exact = !loading && reference && canShowBundle ? resolveSessionView(bundle, reference) : null;
  if (reference && exact) {
    const backHref = withActivityView(withLibraryFilters(sessionPreviewHref(exact.session, exact.booking), reference.search, reference.kind), reference.selection);
    return <SessionView key={scope} bundle={bundle} session={exact.session} booking={exact.booking} selection={reference.selection} backHref={backHref} sample={mode === "sample"} />;
  }
  const membership = organizations.find(item => item.id === reference?.organizationId);
  return <div className="session-viewer">
    <Link className="viewer-back" href={withLibraryFilters("/sessions", reference?.search ?? "", reference?.kind ?? "")}><ArrowLeft size={17} aria-hidden="true" /> Saved Sessions</Link>
    <section className="viewer-unavailable">
      <h1>{!reference ? "Invalid session reference" : loading ? "Opening saved session…" : "Saved session unavailable"}</h1>
      {reference && (loading ? <p role="status">Loading the requested organisation and session revision.</p> :
        <><p role="status">The requested session, booking or saved diagram could not be verified. {mode !== "saved" && message}</p>
          {membership && <button className="viewer-button" type="button" onClick={() => void reload(membership.id)}>Load {membership.name}</button>}</>)}
    </section>
  </div>;
}

function SessionView({ bundle, session, booking, selection, backHref, sample }: {
  bundle: DomainBundle; session: Session; booking?: CalendarEvent; selection: SessionViewReference["selection"]; backHref: string; sample: boolean;
}) {
  const activities = session.content.activities;
  const [activityId, setActivityId] = useState(selection?.activityId ?? activities[0]?.id);
  const [diagramIndex, setDiagramIndex] = useState(selection?.diagramIndex ?? 0);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState(false);
  const board = useRef<HTMLElement>(null);
  useEffect(() => {
    function updateFullscreen() { setFullscreen(document.fullscreenElement === board.current); }
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () => document.removeEventListener("fullscreenchange", updateFullscreen);
  }, []);

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

  function selectActivity(index: number) {
    const next = activities[index];
    if (!next || next.id === activityId) return;
    setActivityId(next.id);
    setDiagramIndex(0);
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
    {activity && <p>{activity.role[0].toUpperCase() + activity.role.slice(1).replaceAll("-", " ")}{activity.durationMinutes !== null && ` · ${activity.durationMinutes} min`}</p>}
  </div>;
  const fullScreenButton = <button className="viewer-button viewer-fullscreen" type="button" onClick={() => void toggleFullscreen()} aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen tactical board"}>
    {fullscreen ? <Minimize size={17} aria-hidden="true" /> : <Maximize size={17} aria-hidden="true" />}
    <span>{fullscreen ? "Exit fullscreen" : "Fullscreen"}</span>
  </button>;

  return <div className="session-viewer">
    <header className="viewer-session-header">
      <Link className="viewer-back" href={backHref}><ArrowLeft size={17} aria-hidden="true" /> Saved Sessions</Link>
      <div className="viewer-session-title">
        <div><h1>{session.content.title}</h1><p>{sessionLabels[session.content.kind]}{team && ` · ${team.name}`}{sample && " · Illustrative sample"}</p></div>
        <div className="viewer-session-facts">
          {hasDuration && <span><Clock3 size={16} aria-hidden="true" />{total.minutes}{total.unknown > 0 && " known"} min</span>}
          {booking && <span>{booking.localDate}</span>}
          <span>Revision {session.revision}</span>
        </div>
      </div>
    </header>
    {activities.length > 0 && <nav className="viewer-activity-navigation" aria-label="Activity sequence">
      <div className="viewer-activity-steps">{activities.map((item, index) =>
        <button key={item.id} type="button" aria-current={item.id === activityId ? "step" : undefined} onClick={() => selectActivity(index)}>
          <span className="viewer-step-number">{index + 1}</span>
          <span className="viewer-step-copy"><strong title={item.content.title}>{item.content.title}</strong><small>{item.durationMinutes === null ? "Untimed" : `${item.durationMinutes} min`}</small></span>
        </button>)}</div>
      <div className="viewer-activity-arrows">
        <button className="viewer-button" type="button" aria-label="Previous activity" disabled={activityIndex <= 0} onClick={() => selectActivity(activityIndex - 1)}><ChevronLeft size={20} aria-hidden="true" /></button>
        <button className="viewer-button" type="button" aria-label="Next activity" disabled={activityIndex >= activities.length - 1} onClick={() => selectActivity(activityIndex + 1)}><ChevronRight size={20} aria-hidden="true" /></button>
      </div>
    </nav>}
    <div className="viewer-workspace">
      <section className="viewer-tactical" ref={board} aria-label="Tactical workspace">
        {fullscreenError && <p className="viewer-fullscreen-message" role="status">Fullscreen is unavailable in this browser window.</p>}
        {diagrams.length > 1 && <div className="viewer-diagrams" role="group" aria-label="Attached diagrams">
          <span>Diagrams</span>
          {diagrams.map((_, index) => <button className="viewer-button" type="button" key={index} aria-pressed={diagramIndex === index} onClick={() => setDiagramIndex(index)}>Diagram {index + 1}</button>)}
        </div>}
        {scene && pin ? <CoachingDiagramPreview key={`${activityId}:${diagramIndex}`} scene={scene} title={activity.content.title} screenMode="expanded" area={activity.content.area} seconds={pin.representativeSeconds}
          presentation={{ heading, action: fullScreenButton }} /> :
          <><div className="viewer-diagram-toolbar">{heading}</div><div className="viewer-board-empty">
            <p role={diagrams.length || selection && !activity ? "alert" : undefined}>{activity
              ? diagrams.length ? "The selected diagram revision is unavailable." : "No diagram attached to this activity."
              : activities.length ? "The requested activity is unavailable. Choose an activity above." : "This saved session has no activities."}</p>
          </div></>}
      </section>
      {activity && <SessionViewerGuidance key={activity.id} activity={activity} objective={session.content.objective} focus={session.content.focus}
        notes={scene?.stages ?? []} />}
    </div>
  </div>;
}
