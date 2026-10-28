"use client";
import { useCoaching } from "@/components/coaching/CoachingProvider";
import { WorkspaceStatus } from "@/components/coaching/WorkspaceStatus";
import type { RevisionRef } from "@/lib/domain/common";
import { PresentationLibrary } from "./PresentationLibrary";

export function PresentationsWorkspace({ source }: { source?: RevisionRef }) {
  const { scope, loading, blocked, mode } = useCoaching();
  return <div className="calendar-workspace presentation-workspace"><div className="calendar-page-heading"><div><p className="calendar-eyebrow">Plan. Prepare. Coach.</p><h1>Coaching presentations</h1><p className="calendar-muted">Curate saved coaching content. Present the live tactical scene.</p></div></div>
    <details className="presentation-storage"><summary>{mode === "saved" ? "Saved organisation" : "Sample workspace"} · connection and reload</summary><WorkspaceStatus /></details>{loading ? <p>Loading source records…</p> : blocked ? <p role="alert">Reload coaching records before opening presentations.</p> : <PresentationLibrary key={`${scope}:${mode}`} source={source} />}</div>;
}
