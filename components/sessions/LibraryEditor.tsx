"use client";

import { DiagramLinks } from "@/components/tactical/DiagramLinks";
import { useState } from "react";
import { z } from "zod";
import type { Exercise, SessionTemplate } from "@/lib/domain/session";
import { reviseExercise, reviseTemplate } from "@/lib/coaching/sessions";
import { useCoaching } from "@/components/coaching/CoachingProvider";
import { useUnsavedChanges } from "@/components/coaching/useUnsavedChanges";
import { SessionContentFields } from "./SessionContentFields";
import { ExerciseFields } from "./ExerciseFields";

/** Version reusable content independently from all dated sessions and embedded exercise snapshots. */
export function LibraryEditor({ source, kind, isNew, historical, navigating, onSaved }: { source: SessionTemplate | Exercise; kind: "session" | "exercise"; isNew: boolean; historical: boolean; navigating: boolean; onSaved: (id: string) => void }) {
  const { snapshot, mode, busy, loading, blocked, commit } = useCoaching();
  const [base] = useState(snapshot);
  const [draft, setDraft] = useState(() => structuredClone(source));
  const [error, setError] = useState("");
  const dirty = !historical && (isNew || JSON.stringify(draft) !== JSON.stringify(source));
  useUnsavedChanges(dirty);
  return <form className="coaching-editor" onSubmit={async (e) => {
    e.preventDefault(); if (historical || blocked || loading || busy || navigating) return;
    try { const next = kind === "session" ? reviseTemplate(base.bundle, draft as SessionTemplate) : reviseExercise(base.bundle, draft as Exercise); await commit(base, next); onSaved(draft.id); }
    catch (failure) { setError(failure instanceof z.ZodError ? "Check required titles, positive dimensions and quantities." : failure instanceof Error ? failure.message : "Reusable content could not be saved"); }
  }}><div><p className="calendar-eyebrow">{kind === "session" ? "Reusable session template" : "Reusable exercise"} · v{source.revision}</p><h2>{source.content.title}</h2></div>
    <p className="calendar-muted">{historical ? "Historical revision · read only" : dirty ? "Unsaved changes" : "No unsaved changes"}. Existing sessions and activity snapshots are never updated by editing their source.</p>
    <fieldset disabled={historical || busy || loading || blocked || navigating}>{kind === "session" ? <SessionContentFields content={(draft as SessionTemplate).content} exercises={base.bundle.exercises}
      onChange={(content) => setDraft({ ...draft, content } as SessionTemplate)} /> : <ExerciseFields content={(draft as Exercise).content} onChange={(content) => setDraft({ ...draft, content } as Exercise)} />}</fieldset>
    {!isNew && (kind === "exercise" ? <DiagramLinks content={(source as Exercise).content} disabled={dirty || historical || busy || blocked || navigating} target={{ kind: "exercise", id: source.id, revision: source.revision }} /> : (source as SessionTemplate).content.activities.map((activity) => <DiagramLinks key={activity.id} content={activity.content} disabled={dirty || historical || busy || blocked || navigating} target={{ kind: "template", id: source.id, revision: source.revision, activity: activity.id }} />))}
    {error && <p role="alert" className="coaching-notice">{error}</p>}
    <div className="coaching-save-bar"><button className="calendar-primary" disabled={historical || busy || loading || blocked || navigating || !dirty}>Save {kind === "session" ? "template" : "exercise"}</button>
      <button type="button" disabled={historical || busy || navigating || !dirty} onClick={() => setDraft(structuredClone(source))}>Revert draft</button></div>
    <p className="calendar-muted coaching-fine">{mode === "sample" ? "Sample changes are memory-only and disappear on reload." : "Saves an immutable version through organisation storage."}</p>
  </form>;
}
