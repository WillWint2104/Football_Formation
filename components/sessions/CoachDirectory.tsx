"use client";

import { useState } from "react";
import { z } from "zod";
import type { Coach } from "@/lib/domain/people";
import { reviseCoach } from "@/lib/coaching/sessions";
import { useCoaching } from "@/components/coaching/CoachingProvider";
import { WorkspaceStatus } from "@/components/coaching/WorkspaceStatus";
import { useUnsavedChanges } from "@/components/coaching/useUnsavedChanges";

/** Manage coaching directory data without creating accounts, invitations or membership privileges. */
export function CoachDirectory() {
  const { snapshot, scope, loading, busy, blocked, dirty, markDirty } = useCoaching();
  const bundle = snapshot.bundle;
  const [selected, setSelected] = useState("");
  const [creation, setCreation] = useState<{ scope: number; coach: Coach } | null>(null);
  const created = creation?.scope === scope && creation.coach.organizationId === bundle.organizationId ? creation.coach : null;
  const source = created ?? bundle.coaches.find((c) => c.id === selected);
  return <div className="calendar-workspace coaching-workspace"><div className="calendar-page-heading"><div><p className="calendar-eyebrow">Coaching staff</p><h1>Coach directory</h1><p className="calendar-muted">Directory records and team assignments. Accounts are managed separately.</p></div>
    <button className="calendar-primary" disabled={loading || busy || blocked} onClick={() => { if (dirty && !window.confirm("Discard unsaved coach edits?")) return; markDirty(false);
      setCreation({ scope, coach: { schemaVersion: "1.0", organizationId: bundle.organizationId, id: crypto.randomUUID(), displayName: "New coach", teamIds: [], membershipId: null } }); }}>Add coach</button></div>
    <WorkspaceStatus /><div className="coaching-library-layout"><section className="coaching-directory" aria-label="Coach records"><h2>Directory</h2>
      {bundle.coaches.map((coach) => <button className="coaching-record" key={coach.id} disabled={loading || busy} onClick={() => { if (dirty && !window.confirm("Discard unsaved coach edits?")) return; markDirty(false); setCreation(null); setSelected(coach.id); }}>
        <strong>{coach.displayName}</strong><small>{coach.teamIds.map((id) => bundle.teams.find((t) => t.id === id)?.name).join(", ") || "No teams assigned"}</small></button>)}
      {!bundle.coaches.length && <p className="coaching-empty">No directory records yet.</p>}</section>
      <section className="coaching-detail">{!loading && source ? <CoachEditor key={`${scope}:${snapshot.version}:${source.id}`} source={source} isNew={!!created}
        onSaved={(id) => { setCreation(null); setSelected(id); }} /> : <p className="coaching-empty">Choose a coach to edit their directory name and team assignments.</p>}</section></div>
  </div>;
}

/** Preserve administrator-managed account links and teams referenced by saved session history. */
function CoachEditor({ source, isNew, onSaved }: { source: Coach; isNew: boolean; onSaved: (id: string) => void }) {
  const { snapshot, busy, blocked, loading, commit } = useCoaching();
  const [base] = useState(snapshot);
  const [draft, setDraft] = useState(() => structuredClone(source));
  const [error, setError] = useState("");
  const dirty = isNew || JSON.stringify(draft) !== JSON.stringify(source);
  useUnsavedChanges(dirty);
  return <form className="coaching-editor" onSubmit={async (e) => { e.preventDefault(); if (busy || blocked || loading) return;
    try { await commit(base, reviseCoach(base.bundle, draft)); onSaved(draft.id); }
    catch (failure) { setError(failure instanceof z.ZodError ? "Enter a valid coach name and directory teams." : failure instanceof Error ? failure.message : "Coach could not be saved"); }
  }}><h2>{source.displayName}</h2><fieldset disabled={busy || blocked || loading}><label>Coach name<input required maxLength={200} value={draft.displayName} onChange={(e) => setDraft({ ...draft, displayName: e.target.value })} /></label>
    <section><h3>Directory teams</h3>{base.bundle.teams.map((team) => <label key={team.id} className="coaching-checkbox"><input type="checkbox" checked={draft.teamIds.includes(team.id)}
      onChange={(e) => setDraft({ ...draft, teamIds: e.target.checked ? [...draft.teamIds, team.id] : draft.teamIds.filter((id) => id !== team.id) })} />{team.name}</label>)}</section>
    <p className="coaching-notice">{draft.membershipId ? "Existing account link retained; only an administrator can change it." : "Directory record only. Saving does not create or invite an account."} Team links used by historical assignments must be retained.</p></fieldset>
    {error && <p role="alert" className="coaching-notice">{error}</p>}<div className="coaching-save-bar"><button className="calendar-primary" disabled={busy || blocked || loading || !dirty}>Save coach</button>
      <button type="button" disabled={busy || !dirty} onClick={() => setDraft(structuredClone(source))}>Revert draft</button></div>
  </form>;
}
