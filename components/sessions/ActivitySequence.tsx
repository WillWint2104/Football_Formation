"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { Exercise, SessionActivity } from "@/lib/domain/session";
import { activityTotals, latest, newActivity } from "@/lib/coaching/sessions";
import { ExerciseFields } from "./ExerciseFields";

/** Ordered coaching activities with optional roles, unknown durations and reusable exercise snapshots. */
export type ActivitySelection = { id: string; onChange: (id: string) => void };
export function ActivitySequence({ activities, exercises, onChange, localAuthoring = false, focused = false, selection, activityVisual, workspaceNavigation = false }: { activities: SessionActivity[]; exercises: Exercise[]; onChange: (value: SessionActivity[]) => void; localAuthoring?: boolean; focused?: boolean; selection?: ActivitySelection; activityVisual?: (activity: SessionActivity) => ReactNode; workspaceNavigation?: boolean }) {
  const [selected, setSelected] = useState(activities[0]?.id ?? "");
  const [navigationHidden, setNavigationHidden] = useState(false), navigationId = useId();
  const list = useRef<HTMLOListElement>(null), detail = useRef<HTMLDivElement>(null);
  const select = (id: string) => { setSelected(id); selection?.onChange(id); };
  const [exercise, setExercise] = useState("");
  const totals = activityTotals(activities);
  const current = activities.find((a) => a.id === (selection?.id ?? selected)) ?? activities[0];
  const hideNavigation = workspaceNavigation && navigationHidden && activities.length > 0;
  const index = current ? activities.indexOf(current) : -1;
  useEffect(() => { if (focused) detail.current?.scrollTo({ top: 0 }); }, [focused, current?.id]);
  const savedExercises = latest(exercises);
  const change = (value: SessionActivity) => onChange(activities.map((a) => a.id === value.id ? value : a));
  /** Keep selection tied to identity and reset only the selected practice's scroll position. */
  function navigate(id: string) { select(id); if (focused) detail.current?.scrollTo({ top: 0 }); }
  /** Rail-only shortcuts preserve native arrow-key behavior in all authoring inputs. */
  function railKey(event: KeyboardEvent<HTMLButtonElement>, i: number) {
    const next = event.key === "ArrowDown" ? Math.min(i + 1, activities.length - 1) : event.key === "ArrowUp" ? Math.max(0, i - 1) : event.key === "Home" ? 0 : event.key === "End" ? activities.length - 1 : -1;
    if (!focused || next < 0) return;
    event.preventDefault(); navigate(activities[next].id); list.current?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
  }
  const add = () => { const a = newActivity(); onChange([...activities, a]); navigate(a.id); };
  return <section className={`coaching-sequence${focused ? " designer-focused-sequence" : ""}`}><div className="coaching-section-heading"><div><h2>Activity sequence</h2>
    <p className="calendar-muted">{totals.minutes} known minutes · {totals.unknown} untimed activities. Warm-ups and cool-downs are optional.</p></div>
    {!focused && <button type="button" onClick={add}>Add activity</button>}</div>
    {!localAuthoring && <div className="coaching-inline-controls"><label>Exercise template<select aria-label="Exercise template" value={exercise} onChange={(e) => setExercise(e.target.value)}><option value="">Choose a saved exercise</option>
      {savedExercises.map((e) => <option key={e.id} value={e.id}>{e.content.title} · v{e.revision}</option>)}</select></label>
      <button type="button" disabled={!exercise} onClick={() => { const source = savedExercises.find((e) => e.id === exercise); if (!source) return; const a = newActivity(source); onChange([...activities, a]); setSelected(a.id); }}>Add exercise snapshot</button></div>}
    <div className="coaching-activity-layout" data-activities-hidden={hideNavigation ? "true" : undefined}><nav id={navigationId} hidden={hideNavigation} className="designer-activity-nav" aria-label="Session activities">{focused && <h3>Session activities</h3>}<ol ref={list} className="coaching-activity-list">{activities.map((a, i) => <li key={a.id}><button type="button" title={workspaceNavigation ? a.content.title || "Untitled activity" : undefined} aria-pressed={a.id === current?.id} aria-current={focused && a.id === current?.id ? "step" : undefined} onKeyDown={(e) => railKey(e, i)} onClick={() => navigate(a.id)}>
      <span>{String(i + 1).padStart(2, "0")}</span><strong>{a.content.title || (workspaceNavigation ? "Untitled activity" : "")}</strong><small>{a.role.replaceAll("-", " ")} · {a.durationMinutes === null ? "Untimed" : `${a.durationMinutes} min`}</small>{workspaceNavigation && <span className="designer-activity-diagram-count">{a.content.diagrams.length ? `${a.content.diagrams.length} diagram reference${a.content.diagrams.length === 1 ? "" : "s"}` : "No diagram reference"}</span>}</button></li>)}</ol>
      {focused && <button className="designer-add-activity" type="button" onClick={add}>Add activity</button>}</nav>
      <div ref={detail} className="coaching-activity-detail" tabIndex={focused ? 0 : undefined} aria-label={focused ? "Selected activity editing area" : undefined}>{current ? <>{focused && <header className="designer-selected-heading"><p>Activity {index + 1} of {activities.length} · {current.role.replaceAll("-", " ")}</p><h2>{current.content.title || "Untitled activity"}</h2>{workspaceNavigation && <button type="button" className="designer-activity-panel-toggle" aria-expanded={!navigationHidden} aria-controls={navigationId} onClick={() => setNavigationHidden((hidden) => !hidden)}>{navigationHidden ? "Show activities" : "Hide activities"}</button>}</header>}{activityVisual?.(current)}<div className="coaching-inline-controls"><button type="button" disabled={index <= 0} onClick={() => { const next = [...activities]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; onChange(next); }}>Move activity up</button>
        <button type="button" disabled={index === activities.length - 1} onClick={() => { const next = [...activities]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; onChange(next); }}>Move activity down</button>
        <button type="button" onClick={() => { onChange(activities.filter((a) => a.id !== current.id)); navigate(activities[index + 1]?.id ?? activities[index - 1]?.id ?? ""); }}>Remove activity</button></div>
        <div className="coaching-form-row"><label>Activity role<select aria-label="Activity role" value={current.role} onChange={(e) => change({ ...current, role: e.target.value as SessionActivity["role"] })}>
          <option value="exercise">Exercise</option><option value="warm-up">Warm-up</option><option value="cool-down">Cool-down</option><option value="briefing">Briefing</option></select></label>
          <label>Duration (minutes)<input type="number" min="0.01" step="any" placeholder="Unknown" value={current.durationMinutes ?? ""} onChange={(e) => change({ ...current, durationMinutes: e.target.value === "" ? null : Number(e.target.value) })} /></label></div>
        {current.sourceExercise && <p className="calendar-muted">Independent snapshot of exercise v{current.sourceExercise.revision}; editing this activity leaves its source intact.</p>}
        <ExerciseFields content={current.content} focused={focused} editDiagramReferences={localAuthoring} onChange={(content) => change({ ...current, content })} />
        {focused && <footer className="designer-activity-footer"><span>{index + 1} of {activities.length} · Local browser draft</span><div><button type="button" disabled={index <= 0} onClick={() => navigate(activities[index - 1].id)}>Previous activity</button><button type="button" disabled={index >= activities.length - 1} onClick={() => navigate(activities[index + 1].id)}>Next activity</button></div></footer>}
      </> : <p className="coaching-empty">Add or select an activity to edit its setup, equipment and coaching guidance.</p>}</div></div>
  </section>;
}
