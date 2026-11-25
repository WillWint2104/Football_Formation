"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Download, Printer, FileJson, Pencil, Eye, Plus, ListOrdered, Palette, Clock3, Users, Layers2 } from "lucide-react";
import { SessionContentFields } from "@/components/sessions/SessionContentFields";
import { activityTotals } from "@/lib/coaching/sessions";
import { applySessionContent, blankDesignerDocument, designerErrors, exportDocument, serializeSessionJson, toSessionContent, type DesignerDocument } from "@/lib/designer/contract";
import { sameDocument } from "@/lib/designer/attachments";
import { renderDrawingNode } from "@/components/tactical/DrawingNodes";
import { coachingScreenOptions } from "@/lib/tactical/coaching-view";
import { drawScene } from "@/lib/tactical/drawing";
import { sceneDuration } from "@/lib/tactical/evaluate";
import type { SessionActivity } from "@/lib/domain/session";
import type { TacticalScene } from "@/lib/domain/tactical-scene";
import { composePrintActivities } from "@/lib/designer/print-composition";
import type { SessionPackage } from "@/lib/designer/package";
import { useDesignerDraft } from "./useDesignerDraft";
import { useDesignerNavigation } from "./useDesignerNavigation";
import { JsonImporter } from "./JsonImporter";
import { BrandingPanel } from "./BrandingPanel";
import { DesignerPreview } from "./DesignerPreview";
import { useActivityDiagrams } from "./useActivityDiagrams";
import { ActivityDiagrams, DiagramWorkspaceStatus } from "./ActivityDiagrams";
import { SessionOverview } from "./SessionOverview";
import { useLocalAuthoring } from "./useLocalAuthoring";
import { LocalAuthoringHost, LocalAuthoringNotice } from "./LocalAuthoringHost";

function ActivityThumbnail({ scene, pin }: { scene?: TacticalScene; pin?: SessionActivity["content"]["diagrams"][number] }) {
  const id = useId().replace(/[^\w-]/g, "_");
  const seconds = pin?.representativeSeconds;
  const drawing = useMemo(() => {
    if (!scene || seconds === undefined || !Number.isFinite(seconds) || seconds < 0 || seconds > sceneDuration(scene)) return null;
    try {
      return drawScene(scene, {
        ...coachingScreenOptions(scene, seconds, null, "context"),
        width: 160, height: 140, padding: 9, areaLabels: false, labels: false, paths: "none",
        surface: "transparent", screen: { id, mode: "compact", sizingSeconds: seconds },
      });
    } catch (error) {
      if (error instanceof RangeError) return null;
      throw error;
    }
  }, [scene, seconds, id]);
  if (!drawing) return <span className="recovery-activity-placeholder"><FileJson size={21} aria-hidden="true" /><span>{pin ? "Unavailable" : "Written"}</span></span>;
  return <svg viewBox="0 0 160 140" width="100%" height="100%" aria-hidden="true" data-thumbnail-scene={drawing.sceneId} data-thumbnail-revision={drawing.revision} data-thumbnail-time={drawing.seconds}>{drawing.nodes.map(renderDrawingNode)}</svg>;
}

/** Fully local import/edit/brand/export flow; no authenticated APIs or saved revision engine is invoked. */
export function SessionDesigner() {
  const draft = useDesignerDraft();
  const { document, update, ready, saveState } = draft;
  const shortSaveState = /^(Draft (?:saved in|recovered from) this browser) · /.exec(saveState)?.[1];
  const [view, setView] = useState<"import" | "edit" | "preview" | "overview">("import"), [epoch, setEpoch] = useState(0);
  const [selected, setSelected] = useState(""), [brandOpen, setBrandOpen] = useState(false), [brandTop, setBrandTop] = useState(0);
  const [errors, setErrors] = useState<string[]>([]), [printRequested, setPrintRequested] = useState(false);
  const [preparingPrint, setPreparingPrint] = useState(false), preparing = useRef(false);
  const [verifiedPrint, setVerifiedPrint] = useState<{ document: DesignerDocument; library: SessionPackage | null; unavailable?: string; ownerId: string | null; ownerVersion: number | null } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const diagramSelection = useRef(new Map<string, number>());
  const [selectionVersion, setSelectionVersion] = useState(0);
  const editorRef = useRef<HTMLElement>(null), brandButton = useRef<HTMLButtonElement>(null);
  const diagrams = useActivityDiagrams(draft, () => { setEpoch((n) => n + 1); setSelected(""); setView("edit"); });
  const exactScenes = useMemo(() => new Map(diagrams.active?.package.scenes.map(scene => [JSON.stringify([scene.id, scene.revision]), scene])), [diagrams.active?.package]);
  const authoring = useLocalAuthoring(draft, diagrams);
  useDesignerNavigation({ ready, checking: diagrams.checking, blocked: diagrams.blocked, document, ownerId: diagrams.active?.documentId ?? null, ownerVersion: diagrams.active?.ownerVersion ?? null,
    view, setView, selected, setSelected, selection: diagramSelection, selectionVersion });
  const content = toSessionContent(document), totals = activityTotals(content.activities);
  const hasDiagrams = content.activities.some(a => a.content.diagrams.length > 0) || !!diagrams.active?.package.scenes.length;
  const printActivities = useMemo(() => {
    if (!verifiedPrint) return undefined;
    const current = sameDocument(verifiedPrint.document, document) && verifiedPrint.ownerId === (diagrams.active?.documentId ?? null)
      && verifiedPrint.ownerVersion === (diagrams.active?.ownerVersion ?? null);
    try { return composePrintActivities(document, current ? verifiedPrint.library : null, current ? verifiedPrint.unavailable : "The session changed after this preview was prepared. Refresh Branded preview or use Print / Save as PDF to verify the current attachments."); }
    catch { return undefined; }
  }, [document, verifiedPrint, diagrams.active?.documentId, diagrams.active?.ownerVersion]);

  useEffect(() => {
    if (!printRequested) return;
    let alive = true;
    void (async () => {
      await window.document.fonts.ready;
      await Promise.all([...window.document.querySelectorAll<HTMLImageElement>(".designer-print img")].map((img) => img.decode().catch(() => undefined)));
      if (alive) { window.print(); setPrintRequested(false); }
    })();
    return () => { alive = false; };
  }, [printRequested]);

  async function preview(print = false) {
    if (preparing.current) return;
    preparing.current = true; setPreparingPrint(true);
    try {
      const before = structuredClone(draft.getCurrent()); exportDocument(before);
      const source = before.session.activities.some(a => a.diagrams.length) ? await diagrams.preparePrintSource() : { library: null };
      if (!sameDocument(before, draft.getCurrent())) throw new Error("The session draft changed while preparing the document. Review the current draft before printing.");
      setVerifiedPrint({ document: before, ...source, ownerId: diagrams.active?.documentId ?? null, ownerVersion: diagrams.active?.ownerVersion ?? null });
      setErrors([]); setView("preview"); if (print) setPrintRequested(true);
    }
    catch (failure) { setErrors(designerErrors(failure)); }
    finally { preparing.current = false; setPreparingPrint(false); }
  }
  function download() {
    try {
      const result = exportDocument(document), blob = new Blob([serializeSessionJson(result)], { type: "application/json" });
      const url = URL.createObjectURL(blob), link = window.document.createElement("a");
      link.href = url; link.download = (result.session.name.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 80) || "coaching-session") + ".json";
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setErrors([]);
    } catch (failure) { setErrors(designerErrors(failure)); }
  }
  const sessionActions = <div className="designer-toolbar recovery-session-actions" data-no-print><nav aria-label="Session designer views">
      {([ ["overview", "Overview", ListOrdered], ["edit", "Edit session", Pencil], ["preview", "Branded preview", Eye] ] as const).map(([id, label, Icon]) => <button type="button" key={id} aria-pressed={view === id} disabled={!ready} onClick={() => { if (id === "preview") preview(); else { setView(id); setErrors([]); } }}><Icon size={16} aria-hidden="true" />{label}</button>)}
      <button type="button" disabled={!ready} onClick={() => { if (window.confirm("Start a new session? Back up session & diagrams first when diagrams are attached; otherwise download JSON to keep your current draft.")) { diagrams.detach(true); update(blankDesignerDocument()); setEpoch((n) => n + 1); setErrors([]); setView("edit"); } }}><Plus size={16} aria-hidden="true" />New session</button>
    </nav><button ref={brandButton} type="button" disabled={!ready} aria-expanded={brandOpen} aria-controls="designer-brand-disclosure" onClick={() => { setBrandTop(Math.min((brandButton.current?.getBoundingClientRect().bottom ?? 100) + 8, window.innerHeight - 260)); setBrandOpen((open) => !open); }}><Palette size={16} aria-hidden="true" />Club Branding</button></div>;
  return <div className={`session-designer designer-light calendar-workspace coaching-workspace${view === "edit" ? " designer-tactical-workspace" : ""}${diagrams.active ? " designer-has-diagram-plan" : ""}`}>
    {authoring.work && <LocalAuthoringHost controller={authoring} />}
    <div hidden={!!authoring.work}>
    <LocalAuthoringNotice controller={authoring} />
    <DiagramWorkspaceStatus controller={diagrams}
      heading={<div><p className="calendar-eyebrow">Session Designer · Local workspace</p>
        <h1 ref={heading} tabIndex={-1}>{view === "import" ? "Session Designer" : document.session.name || "Untitled coaching session"}</h1>
        {view === "import" ? <p>Import a saved session or start a new coaching plan.</p> : <div className="recovery-session-meta">
          {document.session.type && <span className="recovery-session-type">{document.session.type.replaceAll("-", " ")}</span>}
          <span><Clock3 size={15} aria-hidden="true" />{document.session.durationMinutes ?? totals.minutes} min{!document.session.durationMinutes && totals.unknown ? " known" : ""}</span>
          <span><Users size={15} aria-hidden="true" />{document.session.team ?? "Team not specified"}</span>
          <span><Layers2 size={15} aria-hidden="true" />{content.activities.length} activities</span>
        </div>}
      </div>}
      draftStatus={<div className="designer-draft-status"><div><p role="status" title={saveState}>{shortSaveState ? <><span className="sr-only">{saveState}</span><span aria-hidden="true">{shortSaveState}</span></> : saveState}</p><small>Browser draft only · retained for 30 days · {hasDiagrams ? "use Back up session & diagrams to keep or share the complete plan." : "download JSON to keep or share your plan."}</small></div></div>}
      sessionActions={view === "edit" ? sessionActions : undefined}
      fileActions={<>
      <p className="designer-file-status">{saveState}</p>
      <button type="button" disabled={!ready} aria-pressed={view === "import"} onClick={() => { setView("import"); setErrors([]); }}><FileJson size={16} aria-hidden="true" />Import JSON</button>
      <button type="button" disabled={!ready || printRequested || preparingPrint} onClick={() => void preview(true)}><Printer size={16} aria-hidden="true" />Print / Save as PDF</button>
      {(hasDiagrams || diagrams.active) && <button type="button" disabled={!ready || !diagrams.active} onClick={diagrams.downloadCurrent} title={!diagrams.active ? "Open the matching complete local plan to back up its diagrams." : undefined}><Download size={16} aria-hidden="true" />Back up session &amp; diagrams</button>}
      <button type="button" disabled={!ready} onClick={download}><Download size={16} aria-hidden="true" />{hasDiagrams ? "Download text & references JSON" : "Download JSON"}</button>
    </>} />
    {view !== "edit" && sessionActions}
    {!!errors.length && <div role="alert" className="designer-error-list" data-no-print><strong>Complete these fields before exporting or printing</strong><ul>{errors.map((error, i) => <li key={i}>{error}</li>)}</ul><button type="button" onClick={() => setView("edit")}>Return to editor</button></div>}
    <fieldset disabled={!ready} className="designer-main-fieldset" data-no-print hidden={view !== "import"}><JsonImporter onStored={() => void diagrams.browse()} onReviewPlan={async (id) => { await diagrams.inspect(id); setView("edit"); requestAnimationFrame(() => window.document.querySelector<HTMLElement>(".diagram-recovery h3")?.focus()); }} onAccept={(next) => { diagrams.detach(true); update(structuredClone(next)); setEpoch((n) => n + 1); setErrors([]); setView("edit"); heading.current?.focus(); }} /></fieldset>
    {view === "overview" && <SessionOverview document={document} onActivity={(id) => { setSelected(id); setView("edit"); }} onDetails={() => { setView("edit"); requestAnimationFrame(() => { const details = editorRef.current?.querySelector<HTMLDetailsElement>(".designer-session-details"); if (details) { details.open = true; details.querySelector("input")?.focus(); } }); }} />}
    <div className={`designer-edit-layout ${view === "preview" ? "designer-preview-layout" : ""}`} hidden={view === "import" || view === "overview"}>
      <section ref={editorRef} className="designer-editor" aria-label="Local session editor" hidden={view !== "edit"} data-no-print>
        <div className="coaching-editor" key={epoch}><SessionContentFields workspaceNavigation activityThumbnail={activity => {
          const pin = activity.content.diagrams[0];
          return <ActivityThumbnail pin={pin} scene={pin && exactScenes.get(JSON.stringify([pin.scene.id, pin.scene.revision]))} />;
        }} activityVisual={(activity) => <ActivityDiagrams key={activity.id} activity={activity} controller={diagrams} authoring={authoring} objectives={document.session.objectives} selectionMemory={diagramSelection.current} onSelectionChange={() => setSelectionVersion(n => n + 1)} />} content={content} exercises={[]} focused selection={{ id: selected, onChange: setSelected }} localAuthoring collapsibleDetails metadataFields={<div className="designer-meta-fields"><label>Team or age group<input maxLength={200} placeholder="Not specified" value={document.session.team ?? ""} onChange={(e) => update({ ...document, session: { ...document.session, team: e.target.value || null } })} /></label>
          <label>Planned duration (minutes)<input type="number" min="0.01" step="any" placeholder="Unknown" value={document.session.durationMinutes ?? ""} onChange={(e) => update({ ...document, session: { ...document.session, durationMinutes: e.target.value === "" ? null : Number(e.target.value) } })} /></label>
          <label>Session participants<input type="number" min="1" step="1" placeholder="Unknown" value={document.session.playerCount ?? ""} onChange={(e) => update({ ...document, session: { ...document.session, playerCount: e.target.value === "" ? null : Number(e.target.value) } })} /></label></div>} typeSelection={{ value: document.session.type, onChange: (type) => update({ ...document, session: { ...document.session, type } }) }} onChange={(next) => update(applySessionContent(document, next))} /></div>
      </section>
      {view === "preview" && <div className="designer-preview-help" data-no-print><h2>Ready for the training ground</h2><p>Use Print / Save as PDF for your browser’s print dialog. {hasDiagrams ? "Back up session & diagrams keeps the editable plan, logo and exact saved scenes. Text/reference JSON does not contain diagram geometry." : "Download JSON keeps the editable text plan and logo."}</p><button type="button" onClick={() => setView("edit")}><Pencil size={15} aria-hidden="true" />Back to editing</button></div>}
      <DesignerPreview document={document} visible={view === "preview"} activities={printActivities} />
    </div>
    <div id="designer-brand-disclosure" className="designer-brand-drawer" style={{ top: brandTop, maxHeight: `calc(100dvh - ${brandTop + 16}px)` }} hidden={!brandOpen} data-no-print onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setBrandOpen(false); brandButton.current?.focus(); } }}><button className="designer-close-brand" type="button" onClick={() => { setBrandOpen(false); brandButton.current?.focus(); }}>Close branding</button><BrandingPanel key={epoch} branding={document.branding} onChange={(branding) => update((current) => ({ ...current, branding }))} /></div>
    </div>
  </div>;
}
