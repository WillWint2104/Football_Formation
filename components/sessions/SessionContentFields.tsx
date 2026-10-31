"use client";

import type { Exercise, Session, SessionKind } from "@/lib/domain/session";
import type { ReactNode } from "react";
import { sessionLabels } from "@/lib/calendar/schedule";
import { ActivitySequence } from "./ActivitySequence";

/** Reuse structured objectives and activity authoring for independent sessions and reusable templates. */
export function SessionContentFields({ content, exercises, onChange, localAuthoring = false, typeSelection, metadataFields, collapsibleDetails = false }: { content: Session["content"]; exercises: Exercise[]; onChange: (value: Session["content"]) => void; localAuthoring?: boolean; typeSelection?: { value: SessionKind | null; onChange: (kind: SessionKind | null) => void }; metadataFields?: ReactNode; collapsibleDetails?: boolean }) {
  const details = <>{metadataFields}<div className="coaching-form-row"><label>Session title<input required maxLength={200} value={content.title} onChange={(e) => onChange({ ...content, title: e.target.value })} /></label>
    <label>Session type<select aria-label="Session type" value={typeSelection ? typeSelection.value ?? "" : content.kind} onChange={(e) => typeSelection ? typeSelection.onChange(e.target.value ? e.target.value as SessionKind : null) : onChange({ ...content, kind: e.target.value as Session["content"]["kind"] })}>
      {typeSelection && <option value="">Not specified</option>}
      {Object.entries(sessionLabels).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label></div>
    <label>Session objective<textarea rows={3} maxLength={10000} value={content.objective ?? ""} onChange={(e) => onChange({ ...content, objective: e.target.value || null })} /></label>
    <label>Focus tags<span className="calendar-muted">Separate tags with commas</span><input value={content.focus.join(",")} onChange={(e) => onChange({ ...content, focus: e.target.value.split(",") })} /></label></>;
  return <>{collapsibleDetails ? <details className="designer-session-details" open={!content.activities.length}><summary>Session details <span>{content.title || "Untitled session"}</span></summary><div>{details}</div></details> : details}
    <ActivitySequence activities={content.activities} exercises={exercises} localAuthoring={localAuthoring} onChange={(activities) => onChange({ ...content, activities })} />
  </>;
}
