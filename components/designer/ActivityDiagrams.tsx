"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ClipboardList, FolderOpen, Layers, Plus } from "lucide-react";
import type { SessionActivity } from "@/lib/domain/session";
import { CoachingDiagramPreview } from "@/components/tactical/CoachingDiagramPreview";
import { previewAttachment, type DiagramPin } from "@/lib/designer/attachments";
import { sceneDuration } from "@/lib/tactical/evaluate";
import { diagramAssociation } from "@/lib/designer/diagram-label";
import { downloadDiagramPackage, type ActivityDiagramsController } from "./useActivityDiagrams";
import type { LocalAuthoringController } from "./useLocalAuthoring";
import { ActivityCoachingBrief } from "./ActivityCoachingBrief";

export function DiagramWorkspaceStatus({ controller: c, heading, draftStatus, fileActions, sessionActions }: {
  controller: ActivityDiagramsController;
  heading: ReactNode;
  draftStatus: ReactNode;
  fileActions: ReactNode;
  sessionActions?: ReactNode;
}) {
  const files = useRef<HTMLDetailsElement>(null);
  const catalog = useRef<HTMLDetailsElement>(null);
  const passiveMessage = c.active && !c.blocked && c.message && (c.message.startsWith("Complete local plan") || c.message.startsWith("Independent complete plan"));
  const hasNotice = !!(c.blocked || c.recovery || c.backup || c.dirty || c.message && !passiveMessage);
  return <section className="designer-diagram-workspace" aria-label="Local diagram workspace" data-no-print>
    <div className="designer-heading">
      {heading}
      <div className="designer-heading-actions">
        {draftStatus}
        {c.active && <span className="designer-owner-version">Complete plan v{c.active.ownerVersion}</span>}
        {c.active && <button className="calendar-primary" type="button" disabled={c.busy || c.blocked} onClick={() => void c.save()}>Save complete plan</button>}
        <details ref={files} className="designer-workspace-disclosure" onKeyDown={event => {
          if (event.key !== "Escape" || !event.currentTarget.open) return;
          event.stopPropagation();
          event.currentTarget.open = false;
          event.currentTarget.querySelector("summary")?.focus();
        }}>
          <summary><FolderOpen size={17} aria-hidden="true" />Session files<ChevronDown size={15} aria-hidden="true" /></summary>
          <div className="designer-workspace-menu" onClick={event => {
            if (!(event.target instanceof Element) || !event.target.closest("button")) return;
            if (files.current) files.current.open = false;
            if (!catalog.current?.contains(document.activeElement)) files.current?.querySelector("summary")?.focus();
          }}>
            {fileActions}
            <button type="button" disabled={c.busy} onClick={() => {
              if (catalog.current) {
                catalog.current.open = true;
                catalog.current.querySelector("summary")?.focus();
              }
              void c.browse();
            }}>Browse local plans</button>
          </div>
        </details>
        {sessionActions && <details className="designer-workspace-disclosure recovery-session-tools">
          <summary>Session tools<ChevronDown size={15} aria-hidden="true" /></summary>
          {sessionActions}
        </details>}
      </div>
    </div>
    <div className="designer-diagram-status" data-notice={hasNotice || undefined}>
    {c.message && <p className={passiveMessage ? "diagram-passive-message" : undefined} role={c.blocked ? "alert" : undefined} aria-live={c.blocked ? "assertive" : "polite"}>{c.message}</p>}
    {c.dirty && !c.blocked && <p className="diagram-dirty">Text edits are newer than the complete snapshot. Save complete plan to include them.</p>}
    <details ref={catalog} key={c.active?.documentId ?? "unlinked"} className="diagram-plan-list"><summary onClick={event => {
      if (!catalog.current?.open) return;
      event.preventDefault();
      catalog.current.open = false;
      files.current?.querySelector("summary")?.focus();
    }}>Saved local plans ({c.entries.length})</summary><p>Text drafts and complete packages are saved separately. Back up session &amp; diagrams keeps the scene revisions needed to reopen and print diagrams. Legacy JSON contains references only.</p><ul>{c.entries.map((e) => <li key={e.documentId}><strong>{e.name ?? "Unverified package"}</strong><code>{e.documentId}</code><span>{e.status} · {e.ownerVersion ? `v${e.ownerVersion}` : "needs recovery"}</span><button type="button" disabled={c.busy} onClick={() => void c.inspect(e.documentId)}>Review plan {e.documentId}</button></li>)}</ul></details>
    {(c.blocked || c.recovery || c.backup) && <section className="diagram-recovery" aria-label="Diagram recovery"><h3 tabIndex={-1}>Review before continuing</h3><p>The current text draft stays in place until you choose. The text/reference JSON export keeps its current text; a complete package also includes the saved scenes.</p>
      {c.recovery && <><p>Verified complete snapshot: <strong>{c.recovery.package.document.session.name}</strong> · owner v{c.recovery.ownerVersion}</p><button type="button" onClick={() => downloadDiagramPackage(c.recovery!.package, "verified-recovery")}>Download verified snapshot</button><button type="button" disabled={c.busy} onClick={() => void c.openRecovery()}>Open reviewed plan as independent copy</button></>}
      {c.backup && <button type="button" onClick={() => downloadDiagramPackage(c.backup!, "unsaved-candidate")}>Download complete candidate</button>}
      {c.canRecoverText && <button type="button" disabled={c.busy} onClick={() => void c.openRecovery(true)}>Keep current text &amp; revalidate linked diagrams</button>}
      <button type="button" disabled={c.busy} onClick={() => void c.recheck()}>Recheck diagram storage</button><button type="button" disabled={c.busy} onClick={() => c.detach()}>Keep reference-only text draft</button>
    </section>}</div>
  </section>;
}

export function ActivityDiagrams({ activity, controller: c, authoring, selectionMemory, onSelectionChange, objectives }: { activity: SessionActivity; controller: ActivityDiagramsController; authoring?: LocalAuthoringController; selectionMemory?: Map<string, number>; onSelectionChange?: () => void; objectives: string[] }) {
  const pins = activity.content.diagrams;
  const memoryKey = `${c.active?.documentId ?? "draft"}:${activity.id}`;
  const [selected, setSelected] = useState(() => selectionMemory?.get(memoryKey) ?? 0), [choosing, setChoosing] = useState(false);
  const [expanded, setExpanded] = useState(false), dialog = useRef<HTMLDialogElement>(null);
  const management = useRef<HTMLDetailsElement>(null), sourceHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (expanded) dialog.current?.showModal(); }, [expanded]);
  useEffect(() => { if (choosing) sourceHeading.current?.focus(); }, [choosing]);
  const [sceneIndex, setSceneIndex] = useState(""), [seconds, setSeconds] = useState("0"), [fit, setFit] = useState<"exercise" | "pitch" | "all">("exercise");
  const index = Math.min(selectionMemory?.get(memoryKey) ?? selected, Math.max(0, pins.length - 1)), pin = pins[index];
  const scene = sceneIndex === "" ? undefined : c.source?.package.scenes[Number(sceneIndex)];
  const candidate: DiagramPin | null = scene ? { scene: { id: scene.id, revision: scene.revision }, representativeSeconds: seconds.trim() === "" ? NaN : Number(seconds) } : null;
  const preview = choosing && candidate && c.source ? previewAttachment(c.source.package, activity.id, candidate)
    : pin && c.active ? previewAttachment(c.active.package, activity.id, pin) : null;
  const resolved = preview?.ok ? preview.value : null;
  const showingCandidate = choosing && candidate !== null && c.source !== null;
  const validChoice = choosing && candidate && preview?.ok;
  const disabled = c.busy || c.blocked;
  const written = !pin && !choosing && !resolved;
  function browseScenes() {
    if (management.current) management.current.open = false;
    setChoosing(true);
    void c.browse();
  }
  function closeScenes() {
    setChoosing(false);
    management.current?.querySelector("summary")?.focus();
  }
  async function attach(replace: boolean) {
    if (!candidate || !validChoice) return;
    await c.save({ activityId: activity.id, index: replace ? index : null, pin: candidate });
    // Keep candidate preview visible until the coach deliberately returns to attached diagrams.
  }
  return <section className="activity-diagrams" aria-label="Activity tactical diagrams" data-written={written || undefined}>
    <header><h3>{written ? "Written practice" : "Tactical diagrams"} {!written && <span>{pins.length}/20</span>}</h3><div className="diagram-authoring-controls">
      <details ref={management} className="designer-workspace-disclosure" onKeyDown={event => {
        if (event.key !== "Escape" || !event.currentTarget.open) return;
        event.stopPropagation();
        event.currentTarget.open = false;
        event.currentTarget.querySelector("summary")?.focus();
      }}>
        <summary><Layers size={15} aria-hidden="true" />Manage diagrams<ChevronDown size={14} aria-hidden="true" /></summary>
        <div className="designer-workspace-menu">
          {authoring && <button type="button" disabled={disabled || authoring.busy || !!authoring.recover || pins.length >= 20} onClick={() => void authoring.start(activity.id, null)}>Create Diagram</button>}
          <button type="button" disabled={choosing} aria-expanded={choosing} onClick={browseScenes}>Add / replace diagram</button>
          {!choosing && pin && <button type="button" disabled={disabled || !c.active} onClick={() => void c.save({ activityId: activity.id, index, pin: null })}>Remove selected diagram</button>}
          {resolved && <details className="diagram-pin-details"><summary>Diagram details</summary><p className="diagram-exact-pin"><strong>{resolved.scene.id} · r{resolved.scene.revision} · {resolved.representativeSeconds} s</strong><span>Namespace: {resolved.namespace} · {resolved.scene.field.length} × {resolved.scene.field.width} m</span></p></details>}
        </div>
      </details>
      {authoring && <button type="button" disabled={disabled || authoring.busy || !!authoring.recover || !pin || !c.active || !resolved || choosing} onClick={() => void authoring.start(activity.id, index)}>Edit Diagram</button>}
      {choosing && <button type="button" onClick={closeScenes}>Close scene browser</button>}
    </div></header>
    {!!pins.length && <nav className="diagram-tabs" aria-label="Attached diagrams">{pins.map((p, i) => <button type="button" key={i} aria-pressed={!choosing && index === i} onClick={() => { setSelected(i); selectionMemory?.set(memoryKey, i); onSelectionChange?.(); setChoosing(false); }}>Diagram {i + 1}<small className="diagram-pin-accessible">{p.scene.id || "Missing ID"} · r{p.scene.revision} · {p.representativeSeconds} s</small></button>)}</nav>}
    {!written && <div className="diagram-canvas-toolbar"><strong className={showingCandidate ? "diagram-candidate-label" : "sr-only"}>{showingCandidate ? "Source preview · not yet attached" : pin ? `Attached diagram ${index + 1}` : "No diagram attached"}</strong><button type="button" disabled={!resolved} onClick={() => setExpanded(true)}>Expand diagram</button></div>}
    <div className="activity-diagram-canvas">{resolved ? <CoachingDiagramPreview workspaceTurf scene={resolved.scene} screenMode="standard" title={`${showingCandidate ? "Source preview" : "Attached diagram"}: ${activity.content.title}`} fit={fit} onFitChange={setFit} area={showingCandidate ? undefined : activity.content.area} seconds={resolved.representativeSeconds} />
      : written ? <article className="recovery-written">
        <header className="recovery-written-heading"><span className="recovery-written-icon"><ClipboardList size={22} aria-hidden="true" /></span><div><h4>{activity.content.title || "Untitled activity"}</h4><p>No diagram attached</p></div></header>
        <ActivityCoachingBrief content={activity.content} objectives={objectives} mode="written-delivery" />
        <div className="recovery-written-actions">
          {authoring && <button className="calendar-primary" type="button" disabled={disabled || authoring.busy || !!authoring.recover} onClick={() => void authoring.start(activity.id, null)}><Plus size={16} aria-hidden="true" />Create diagram</button>}
          <button type="button" onClick={browseScenes}>Attach existing diagram</button>
        </div>
      </article> : <div className="diagram-empty"><strong>{preview && !preview.ok ? "Exact diagram unavailable" : pin ? "Reference-only diagram" : "Choose a saved diagram"}</strong><p>{preview && !preview.ok ? preview.diagnostics.slice(0, 3).map((d) => d.message).join(" ") : pin ? "Open the matching complete local plan to resolve this reference. No namespace or revision is inferred." : "Select a local scene package and the exact scene revision."}</p></div>}</div>
    {choosing && <section className="diagram-source-browser" aria-label="Local scene browser"><h4 ref={sourceHeading} tabIndex={-1}>Choose an exact local scene</h4><p>Source packages stay unchanged. The selected revision is copied into this plan; organisation namespaces are preserved.</p><div className="diagram-source-fields"><label>Local scene package<select aria-label="Local scene package" disabled={disabled} value={c.source?.documentId ?? ""} onChange={(e) => { setSceneIndex(""); setSeconds("0"); if (e.target.value) void c.selectSource(e.target.value); }}><option value="">Select an imported package</option>{c.entries.filter((e) => e.status === "ready" && (!c.active || e.namespace === c.active.package.sceneNamespace)).map((e) => <option key={e.documentId} value={e.documentId}>{e.name ?? e.documentId} · owner v{e.ownerVersion} · {e.documentId.slice(0, 8)}</option>)}</select></label>
      <label>Scene revision<select aria-label="Scene revision" disabled={disabled || !c.source} value={sceneIndex} onChange={(e) => { setSceneIndex(e.target.value); setSeconds("0"); }}><option value="">Choose scene and revision</option>{c.source?.package.scenes.map((s, i) => <option key={`${s.id}-${s.revision}`} value={i}>{diagramAssociation(c.source!.package, s)} · r{s.revision} · {s.field.length} × {s.field.width} m · {s.id}</option>)}</select></label>
      <label>Representative seconds<input aria-label="Representative seconds" type="number" min="0" step="any" disabled={disabled || !scene} value={seconds} onChange={(e) => setSeconds(e.target.value)} /><small>{scene ? `Allowed: 0–${sceneDuration(scene)} s · no clamping` : "Choose an exact scene first"}</small></label></div>
      {c.source && <p>Source: <strong>{c.source.package.document.session.name}</strong> · owner v{c.source.ownerVersion}</p>}
      <div className="diagram-attachment-actions"><button type="button" disabled={disabled || !validChoice || pins.length >= 20} onClick={() => void attach(false)}>Attach as diagram {pins.length + 1}</button>{!!pins.length && <button type="button" disabled={disabled || !validChoice} onClick={() => void attach(true)}>Replace diagram {index + 1} with preview</button>}<button type="button" onClick={closeScenes}>Return to attached diagrams</button></div>
    </section>}

    {expanded && resolved && <dialog ref={dialog} className="activity-diagram-expanded" aria-label="Expanded activity diagram" onClose={() => setExpanded(false)} onKeyDown={(event) => { if (event.key === "Tab") { const controls = [...(dialog.current?.querySelectorAll<HTMLElement>("button, select, input, summary, details[open] [tabindex=\"0\"]") ?? [])].filter(el => el.getClientRects().length); const first = controls[0], last = controls.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } } }}><header><div><h3>{activity.content.title}</h3><p>{showingCandidate ? "Source preview · not attached · " : ""}{resolved.scene.id} · r{resolved.scene.revision} · {resolved.representativeSeconds} s</p></div><button type="button" autoFocus onClick={() => dialog.current?.close()}>Close diagram · Esc</button></header><div className="expanded-diagram-layout"><div className="expanded-diagram-canvas"><CoachingDiagramPreview workspaceTurf scene={resolved.scene} screenMode="expanded" title={activity.content.title} fit={fit} onFitChange={setFit} area={showingCandidate ? undefined : activity.content.area} seconds={resolved.representativeSeconds} /></div><details className="expanded-coaching-guidance"><summary>Coaching guidance</summary><div tabIndex={0}><h4>Organisation &amp; Delivery</h4>{activity.content.instructions.length ? <ol>{activity.content.instructions.map((text, i) => <li key={i}>{text}</li>)}</ol> : <p>No instructions specified.</p>}<h4>Coaching points</h4>{activity.content.coachingPoints.length ? <ul>{activity.content.coachingPoints.map((text, i) => <li key={i}>{text}</li>)}</ul> : <p>No coaching points specified.</p>}<h4>Progressions &amp; Variations</h4><ul>{[...activity.content.progressions, ...activity.content.variations].map((text,i)=><li key={i}>{text}</li>)}</ul></div></details></div><p>Namespace: {resolved.namespace} · View only · scene coordinates unchanged</p></dialog>}
  </section>;
}
