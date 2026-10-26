"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Exercise, SessionTemplate } from "@/lib/domain/session";
import { blankExercise, latest, newSession, reviseSession } from "@/lib/coaching/sessions";
import { useCoaching } from "@/components/coaching/CoachingProvider";
import { WorkspaceStatus } from "@/components/coaching/WorkspaceStatus";
import { LibraryEditor } from "./LibraryEditor";

/** Browse immutable session or exercise templates and apply independent session snapshots. */
export function ReusableLibrary({ kind, itemId, revision }: { kind: "session" | "exercise"; itemId?: string; revision?: number }) {
  const { snapshot, scope, loading, busy, blocked, dirty, markDirty, commit } = useCoaching();
  const bundle = snapshot.bundle;
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  const route = kind === "session" ? "/templates" : "/exercises";
  const records: (SessionTemplate | Exercise)[] = kind === "session" ? bundle.templates : bundle.exercises;
  const current = latest(records);
  const [search, setSearch] = useState("");
  const [team, setTeam] = useState("");
  const [error, setError] = useState("");
  const [creation, setCreation] = useState<{ scope: number; record: SessionTemplate | Exercise } | null>(null);
  const created = creation?.scope === scope && creation.record.organizationId === bundle.organizationId ? creation.record : null;
  const source = created ?? (itemId ? (revision ? records.find((r) => r.id === itemId && r.revision === revision) : current.find((r) => r.id === itemId)) : current[0]);
  const historical = !!source && !created && current.find((r) => r.id === source.id)?.revision !== source.revision;
  return <div className="calendar-workspace coaching-workspace"><div className="calendar-page-heading"><div><p className="calendar-eyebrow">Prepare once. Reuse independently.</p><h1>{kind === "session" ? "Session templates" : "Exercise library"}</h1>
    <p className="calendar-muted">Versioned source content; existing session snapshots remain intact.</p></div>
    <button className="calendar-primary" disabled={loading || busy || blocked || navigating} onClick={() => {
      if (dirty && !window.confirm("Discard the current unsaved draft?")) return;
      markDirty(false); const record = kind === "session" ? { schemaVersion: "1.0" as const, organizationId: bundle.organizationId, id: crypto.randomUUID(), revision: 1,
        content: { title: "New session template", kind: "possession" as const, objective: null, focus: [], activities: [] } } : { schemaVersion: "1.0" as const, organizationId: bundle.organizationId, id: crypto.randomUUID(), revision: 1, content: blankExercise("New exercise template") };
      setCreation({ scope, record });
    }}>New {kind === "session" ? "template" : "exercise"}</button></div><WorkspaceStatus />
    <div className="coaching-library-layout"><aside className="coaching-catalog"><label>Find reusable content<input type="search" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
      <div className="coaching-catalog-items">{current.filter((r) => r.content.title.toLowerCase().includes(search.toLowerCase())).map((r) => <Link className="coaching-record" key={r.id} href={`${route}?item=${encodeURIComponent(r.id)}`} aria-current={!created && r.id === source?.id ? "page" : undefined}
        onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); startNavigation(() => router.push(`${route}?item=${encodeURIComponent(r.id)}`)); }}><strong>{r.content.title}</strong><small>Current revision {r.revision}</small></Link>)}</div>
      {!current.length && <p className="calendar-muted">No saved reusable content yet.</p>}
      <Link href="/sessions">Open session library →</Link></aside><section className="coaching-detail" aria-label="Reusable content editor" aria-busy={navigating}>
      {loading ? <p className="coaching-empty">Loading validated records…</p> : source ? <>
        {historical && <p className="coaching-notice">Historical source snapshot. <Link href={`${route}?item=${encodeURIComponent(source.id)}`}>Open current revision</Link></p>}
        {kind === "session" && !created && <div className="coaching-inline-controls"><label>Team for independent session<select aria-label="Team for independent session" value={team || bundle.teams[0]?.id || ""} onChange={(e) => setTeam(e.target.value)}>
          {bundle.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
          <button disabled={loading || busy || blocked || navigating || !bundle.teams.length} onClick={async () => {
            if (dirty && !window.confirm("Apply the saved template and discard unsaved edits?")) return;
            try { const session = newSession(bundle, team || bundle.teams[0].id, source as SessionTemplate); const next = reviseSession(bundle, session); await commit(snapshot, next.bundle); markDirty(false); startNavigation(() => router.push(`/sessions?session=${encodeURIComponent(session.id)}`)); }
            catch (failure) { setError(failure instanceof Error ? failure.message : "Template could not be applied"); }
          }}>Create independent session</button></div>}
        {error && <p role="alert" className="coaching-notice">{error}</p>}
        <LibraryEditor key={`${scope}:${snapshot.version}:${source.id}:${source.revision}`} source={source} kind={kind} isNew={!!created} historical={historical} navigating={navigating} onSaved={(id) => startNavigation(() => { setCreation(null); router.replace(`${route}?item=${encodeURIComponent(id)}`); })} />
        {!created && <details className="coaching-history"><summary>Saved revision history</summary>{records.filter((r) => r.id === source.id).sort((a, b) => b.revision - a.revision).map((r) => <Link key={r.revision} href={`${route}?item=${encodeURIComponent(r.id)}&revision=${r.revision}`}>Revision {r.revision}</Link>)}</details>}
      </> : <p className="coaching-empty">{itemId ? "Requested revision is unavailable." : "Create reusable content to begin."}</p>}</section></div>
  </div>;
}
