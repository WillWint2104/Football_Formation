"use client";

import { useState } from "react";
import type { Exercise, SessionActivity } from "@/lib/domain/session";
import { activityTotals, latest, newActivity } from "@/lib/coaching/sessions";
import { ExerciseFields } from "./ExerciseFields";

/** Ordered coaching activities with optional roles, unknown durations and reusable exercise snapshots. */
export function ActivitySequence({ activities, exercises, onChange }: { activities: SessionActivity[]; exercises: Exercise[]; onChange: (value: SessionActivity[]) => void }) {
  const [selected, setSelected] = useState(activities[0]?.id ?? "");
  const [exercise, setExercise] = useState("");
  const totals = activityTotals(activities);
  const current = activities.find((a) => a.id === selected);
  const index = current ? activities.indexOf(current) : -1;
  const savedExercises = latest(exercises);
  const change = (value: SessionActivity) => onChange(activities.map((a) => a.id === value.id ? value : a));
  return <section className="coaching-sequence"><div className="coaching-section-heading"><div><h2>Activity sequence</h2>
    <p className="calendar-muted">{totals.minutes} known minutes · {totals.unknown} untimed activities. Warm-ups and cool-downs are optional.</p></div>
    <button type="button" onClick={() => { const a = newActivity(); onChange([...activities, a]); setSelected(a.id); }}>Add activity</button></div>
    <div className="coaching-inline-controls"><label>Exercise template<select aria-label="Exercise template" value={exercise} onChange={(e) => setExercise(e.target.value)}><option value="">Choose a saved exercise</option>
      {savedExercises.map((e) => <option key={e.id} value={e.id}>{e.content.title} · v{e.revision}</option>)}</select></label>
      <button type="button" disabled={!exercise} onClick={() => { const source = savedExercises.find((e) => e.id === exercise); if (!source) return; const a = newActivity(source); onChange([...activities, a]); setSelected(a.id); }}>Add exercise snapshot</button></div>
    <div className="coaching-activity-layout"><ol className="coaching-activity-list">{activities.map((a, i) => <li key={a.id}><button type="button" aria-pressed={a.id === selected} onClick={() => setSelected(a.id)}>
      <span>{String(i + 1).padStart(2, "0")}</span><strong>{a.content.title}</strong><small>{a.role.replaceAll("-", " ")} · {a.durationMinutes === null ? "Untimed" : `${a.durationMinutes} min`}</small></button></li>)}</ol>
      <div className="coaching-activity-detail">{current ? <><div className="coaching-inline-controls"><button type="button" disabled={index <= 0} onClick={() => { const next = [...activities]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; onChange(next); }}>Move activity up</button>
        <button type="button" disabled={index === activities.length - 1} onClick={() => { const next = [...activities]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; onChange(next); }}>Move activity down</button>
        <button type="button" onClick={() => { onChange(activities.filter((a) => a.id !== current.id)); setSelected(activities[index + 1]?.id ?? activities[index - 1]?.id ?? ""); }}>Remove activity</button></div>
        <div className="coaching-form-row"><label>Activity role<select aria-label="Activity role" value={current.role} onChange={(e) => change({ ...current, role: e.target.value as SessionActivity["role"] })}>
          <option value="exercise">Exercise</option><option value="warm-up">Warm-up</option><option value="cool-down">Cool-down</option><option value="briefing">Briefing</option></select></label>
          <label>Duration (minutes)<input type="number" min="0.01" step="any" placeholder="Unknown" value={current.durationMinutes ?? ""} onChange={(e) => change({ ...current, durationMinutes: e.target.value === "" ? null : Number(e.target.value) })} /></label></div>
        {current.sourceExercise && <p className="calendar-muted">Independent snapshot of exercise v{current.sourceExercise.revision}; editing this activity leaves its source intact.</p>}
        <ExerciseFields content={current.content} onChange={(content) => change({ ...current, content })} />
      </> : <p className="coaching-empty">Add or select an activity to edit its setup, equipment and coaching guidance.</p>}</div></div>
  </section>;
}
