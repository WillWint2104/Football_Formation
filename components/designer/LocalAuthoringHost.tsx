"use client";

import { useEffect, useRef } from "react";
import { TacticalEditor } from "@/components/tactical/TacticalEditor";
import { SceneDiagram } from "@/components/tactical/SceneDiagram";
import { coachingExerciseArea } from "@/lib/tactical/coaching-view";
import { sceneDuration } from "@/lib/tactical/evaluate";
import type { LocalAuthoringController } from "./useLocalAuthoring";
import { downloadDiagramPackage } from "./useActivityDiagrams";

export function LocalAuthoringNotice({ controller: c }: { controller: LocalAuthoringController }) {
  if (c.work || (!c.recover && !c.message)) return null;
  return <section className="local-authoring-notice" aria-label="Local copy recovery" data-no-print>
    <p role={c.failed ? "alert" : undefined} aria-live="polite">{c.message}</p>
    {c.recover && <button type="button" disabled={c.busy} onClick={() => void c.review(true)}>Recover Saved Candidate</button>}
    {(c.recover || c.failed) && <button type="button" disabled={c.busy} onClick={c.cancel}>Cancel local operation</button>}
  </section>;
}
export function LocalAuthoringHost({ controller: c }: { controller: LocalAuthoringController }) {
  const heading = useRef<HTMLHeadingElement>(null), work = c.work;
  useEffect(() => { heading.current?.focus(); }, [work?.view]);
  if (!work) return null;
  const scene = work.initial, duration = sceneDuration(scene), seconds = c.seconds.trim() === "" ? NaN : Number(c.seconds);
  const timeValid = Number.isFinite(seconds) && seconds >= 0 && seconds <= duration;
  return <section className="local-authoring-host" aria-label="Local tactical editor" data-no-print>
    <header><div><p>SESSION DESIGNER · LOCAL COPY ONLY</p><h1 ref={heading} tabIndex={-1}>{work.view === "editor" ? "Edit a local tactical diagram" : "Review local diagram"}</h1><p>{work.base.document.session.activities.find((a) => a.id === work.context.activityId)?.name} · {work.context.index === null ? "Add diagram" : `Replace diagram ${work.context.index + 1}`}</p></div>
      <div>{work.view === "editor" && <button type="button" disabled={c.busy || !work.context.candidate || c.failed} onClick={() => void c.review()}>Return to Activity</button>}<button type="button" disabled={c.busy} onClick={c.cancel}>Cancel</button></div></header>
    <p className="local-authoring-message" role={c.failed ? "alert" : undefined} aria-live="polite">{c.message}</p>
    {c.failed && work.context.candidate && <button type="button" disabled={c.busy} onClick={() => void c.review()}>Recover Saved Candidate</button>}
    {c.failed && c.backup && <button type="button" onClick={() => downloadDiagramPackage(c.backup!, "local-copy-recovery")}>Download local copy for recovery</button>}
    {work.view === "editor" ? <TacticalEditor presentation="coaching" key={work.context.operation} initial={scene} readOnly={c.busy || c.failed} onDirty={c.setDirty} onSave={c.save} canSave={!c.busy && !c.failed} saveLabel={c.busy ? "Saving local copy…" : "Save Local Copy"} />
      : <div className="local-candidate-review"><div className="local-candidate-canvas">{timeValid ? <SceneDiagram scene={scene} title="Saved local candidate" options={{ fit: "exercise", paint: "coaching-light", exerciseArea: coachingExerciseArea(scene), seconds, paths: "stage", labels: true }} /> : <p>Choose a valid representative time to preview this exact revision.</p>}</div>
        <aside><h2>Saved local copy</h2><p>The source activity is unchanged. Accept this exact revision to attach it.</p><p><strong>{scene.id} · r{scene.revision}</strong></p><p>{scene.field.length} × {scene.field.width} m · animation {duration} s</p><label>Representative time (seconds)<input type="number" min="0" max={duration} step="any" value={c.seconds} onChange={(e) => c.setSeconds(e.target.value)} /></label>
          <p>{timeValid ? `Preview and attachment: ${seconds} s` : `Choose a time from 0 to ${duration} s. The previous representative time is unavailable; it has not been reset or clamped.`}</p>
          <button type="button" className="calendar-primary" disabled={!timeValid || c.busy || c.failed} onClick={() => void c.accept()}>Accept Diagram</button>
          <button type="button" disabled={c.busy || c.failed} onClick={c.resume}>Edit Saved Copy</button>
          <p>Original scenes, field dimensions and other activities are retained. This does not save to an organisation.</p></aside></div>}
  </section>;
}
