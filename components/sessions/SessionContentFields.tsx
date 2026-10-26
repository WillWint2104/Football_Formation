"use client";

import type { Exercise, Session } from "@/lib/domain/session";
import { sessionLabels } from "@/lib/calendar/schedule";
import { ActivitySequence } from "./ActivitySequence";

/** Reuse structured objectives and activity authoring for independent sessions and reusable templates. */
export function SessionContentFields({ content, exercises, onChange }: { content: Session["content"]; exercises: Exercise[]; onChange: (value: Session["content"]) => void }) {
  return <><div className="coaching-form-row"><label>Session title<input required maxLength={200} value={content.title} onChange={(e) => onChange({ ...content, title: e.target.value })} /></label>
    <label>Session type<select aria-label="Session type" value={content.kind} onChange={(e) => onChange({ ...content, kind: e.target.value as Session["content"]["kind"] })}>
      {Object.entries(sessionLabels).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label></div>
    <label>Session objective<textarea rows={3} maxLength={10000} value={content.objective ?? ""} onChange={(e) => onChange({ ...content, objective: e.target.value || null })} /></label>
    <label>Focus tags<span className="calendar-muted">Separate tags with commas</span><input value={content.focus.join(",")} onChange={(e) => onChange({ ...content, focus: e.target.value.split(",") })} /></label>
    <ActivitySequence activities={content.activities} exercises={exercises} onChange={(activities) => onChange({ ...content, activities })} />
  </>;
}
