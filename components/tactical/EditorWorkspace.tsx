"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useCoaching } from "@/components/coaching/CoachingProvider";
import { WorkspaceStatus } from "@/components/coaching/WorkspaceStatus";
import { useUnsavedChanges } from "@/components/coaching/useUnsavedChanges";
import { editorExamples } from "@/lib/tactical/editor-examples";
import { diagramHref, resolveDiagramTarget, saveDiagram, type DiagramTarget } from "@/lib/tactical/persistence";
import { guideHref } from "@/lib/documents/contracts";
import type { TacticalScene } from "@/lib/domain/tactical-scene";
import { TacticalEditor } from "./TacticalEditor";

/** Shared authenticated workspace, exact pins and optimistic commit guard also govern scene editing. */
export function EditorWorkspace({ target }: { target?: DiagramTarget }) {
  const { snapshot, scope, loading, mode, blocked } = useCoaching();
  let resolved: ReturnType<typeof resolveDiagramTarget> | undefined, failure = "";
  try { if (target && !loading) resolved = resolveDiagramTarget(snapshot.bundle, target); } catch (error) { failure = error instanceof Error ? error.message : "Diagram unavailable"; }
  return <div className="calendar-workspace editor-workspace"><details className="editor-storage" open={blocked || undefined}><summary>{mode === "sample" ? "Illustrative sample data · memory only" : `Organisation storage · snapshot v${snapshot.version}`}<span>Connection & storage details</span></summary><WorkspaceStatus /></details>
    {loading ? <p>Loading validated coaching records…</p> : failure ? <div role="alert"><h1>Requested diagram is unavailable</h1><p>{failure}</p><Link href="/sessions">Open sessions</Link></div> :
      <BoundEditor key={`${scope}:${snapshot.version}:${JSON.stringify(target)}`} target={target} resolved={resolved} />}
  </div>;
}

/** Keep the opened graph as the save base; a later graph can never silently replace an unsaved draft. */
function BoundEditor({ target, resolved }: { target?: DiagramTarget; resolved?: ReturnType<typeof resolveDiagramTarget> }) {
  const { snapshot, mode, busy, blocked, commit, markDirty } = useCoaching(), router = useRouter();
  const [base] = useState(snapshot), [dirty, setDirty] = useState(false), [error, setError] = useState("");
  const [scene] = useState<TacticalScene>(() => resolved?.scene ? structuredClone(resolved.scene) : {
    schemaVersion: "1.0", id: crypto.randomUUID(), organizationId: snapshot.bundle.organizationId, revision: 1, units: "metres",
    field: { length: 105, width: 68 }, context: { kind: "pitch", region: "full", attack: "positive-x" }, entities: [], stages: [],
  });
  useUnsavedChanges(dirty);
  const back = target?.kind === "session" ? target.event ? `/sessions?event=${encodeURIComponent(target.event)}&revision=${target.booking}` : `/sessions?session=${encodeURIComponent(target.id)}&revision=${target.revision}`
    : target ? `/${target.kind === "exercise" ? "exercises" : "templates"}?item=${encodeURIComponent(target.id)}&revision=${target.revision}` : "/sessions";
  return <><div className="editor-heading"><div><p className="calendar-eyebrow">{target ? `${target.kind} · immutable owner v${target.revision}` : "Practice canvas · examples never uploaded"}</p>
    <h1>{resolved?.title ?? "2D tactical editor"}</h1><p className="calendar-muted">{resolved?.readOnly ? "Historical snapshot · read only" : dirty ? "Unsaved diagram changes" : "World geometry in metres · camera changes do not move objects"}</p></div>
    <div className="editor-actions"><Link href={back}>← {target ? "Return to plan" : "Choose a saved activity"}</Link>
      {target?.kind === "session" && <Link href={guideHref({ session: target.id, revision: target.revision, ...(target.event ? { event: target.event, bookingRevision: target.booking } : {}) })}>Open exact guide →</Link>}</div></div>
    {error && <p role="alert" className="coaching-notice">{error}</p>}
    <TacticalEditor initial={target ? scene : { ...structuredClone(editorExamples[0].scene), organizationId: scene.organizationId, id: scene.id }} readOnly={!!resolved?.readOnly || busy || blocked}
      onDirty={setDirty} saveLabel={mode === "sample" ? "Save sample diagram" : "Save diagram"} canSave={!!target && dirty && !resolved?.readOnly && !busy && !blocked}
      onSave={async (draft) => {
        if (!target) return;
        try { const saved = saveDiagram(base.bundle, target, draft); await commit(base, saved.bundle); markDirty(false); setDirty(false); router.replace(diagramHref(saved.target)); }
        catch (failure) { setError(failure instanceof Error ? failure.message : "Diagram save could not be confirmed. Reload before retrying."); }
      }} />
  </>;
}
