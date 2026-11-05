"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Printer, FileJson, Pencil, Eye, Plus, ListOrdered, Palette } from "lucide-react";
import { SessionContentFields } from "@/components/sessions/SessionContentFields";
import { activityTotals } from "@/lib/coaching/sessions";
import { applySessionContent, blankDesignerDocument, designerErrors, exportDocument, serializeSessionJson, toSessionContent, type DesignerDocument } from "@/lib/designer/contract";
import { sameDocument } from "@/lib/designer/attachments";
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

/** Fully local import/edit/brand/export flow; no authenticated APIs or saved revision engine is invoked. */
export function SessionDesigner() {
  const draft = useDesignerDraft();
  const { document, update, ready, saveState } = draft;
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
  const authoring = useLocalAuthoring(draft, diagrams);
  useDesignerNavigation({ ready, checking: diagrams.checking, blocked: diagrams.blocked, document, ownerId: diagrams.active?.documentId ?? null, ownerVersion: diagrams.active?.ownerVersion ?? null,
    view, setView, selected, setSelected, selection: diagramSelection, selectionVersion });
  const content = toSessionContent(document), totals = activityTotals(content.activities);
  const hasDiagrams = content.activities.some(a => a.content.diagrams.length > 0);
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
  return <div className={`session-designer designer-light calendar-workspace coaching-workspace${view === "edit" ? " designer-tactical-workspace" : ""}${diagrams.active ? " designer-has-diagram-plan" : ""}`}>
    {authoring.work && <LocalAuthoringHost controller={authoring} />}
    <div hidden={!!authoring.work}>
    <LocalAuthoringNotice controller={authoring} />
    <div className="designer-heading" data-no-print><div><p className="calendar-eyebrow">Session Designer · Local workspace</p><h1 ref={heading} tabIndex={-1}>{view === "import" ? "Session Designer" : document.session.name || "Untitled coaching session"}</h1><p>{view === "import" ? "Import a saved session or start a new coaching plan." : `${document.session.team ?? "Team not specified"} · ${content.activities.length} activities · ${totals.minutes} known min${totals.unknown ? ` · ${totals.unknown} untimed` : ""}`}</p></div><div className="designer-actions">
      <button type="button" disabled={!ready || printRequested || preparingPrint} onClick={() => void preview(true)}><Printer size={16} aria-hidden="true" />Print / Save as PDF</button>
      {hasDiagrams && <button type="button" className="calendar-primary" disabled={!ready || !diagrams.active || diagrams.blocked || diagrams.busy} onClick={diagrams.downloadCurrent} title={!diagrams.active ? "Open the matching complete local plan to back up its diagrams." : undefined}><Download size={16} aria-hidden="true" />Back up session &amp; diagrams</button>}
      <button type="button" className={hasDiagrams ? undefined : "calendar-primary"} disabled={!ready} onClick={download}><Download size={16} aria-hidden="true" />{hasDiagrams ? "Download text & references JSON" : "Download JSON"}</button>
    </div></div>
    <div className="designer-draft-status" data-no-print><span className="designer-local-label">Local workspace</span><div><p role="status">{saveState}</p><small>Browser draft only · retained for 30 days · download JSON to keep or share your plan.</small></div></div>
    <div className="designer-toolbar" data-no-print><nav aria-label="Session designer views">
      {([ ["overview", "Overview", ListOrdered], ["edit", "Edit session", Pencil], ["preview", "Branded preview", Eye], ["import", "Import JSON", FileJson] ] as const).map(([id, label, Icon]) => <button type="button" key={id} aria-pressed={view === id} disabled={!ready} onClick={() => { if (id === "preview") preview(); else { setView(id); setErrors([]); } }}><Icon size={16} aria-hidden="true" />{label}</button>)}
      <button type="button" disabled={!ready} onClick={() => { if (window.confirm("Start a new session? Download JSON first if you want to keep your current draft.")) { diagrams.detach(true); update(blankDesignerDocument()); setEpoch((n) => n + 1); setErrors([]); setView("edit"); } }}><Plus size={16} aria-hidden="true" />New session</button>
    </nav><button ref={brandButton} type="button" disabled={!ready} aria-expanded={brandOpen} aria-controls="designer-brand-disclosure" onClick={() => { setBrandTop(Math.min((brandButton.current?.getBoundingClientRect().bottom ?? 100) + 8, window.innerHeight - 260)); setBrandOpen((open) => !open); }}><Palette size={16} aria-hidden="true" />Club Branding</button></div>
    <DiagramWorkspaceStatus controller={diagrams} />
    {!!errors.length && <div role="alert" className="designer-error-list" data-no-print><strong>Complete these fields before exporting or printing</strong><ul>{errors.map((error, i) => <li key={i}>{error}</li>)}</ul><button type="button" onClick={() => setView("edit")}>Return to editor</button></div>}
    <fieldset disabled={!ready} className="designer-main-fieldset" data-no-print hidden={view !== "import"}><JsonImporter onStored={() => void diagrams.browse()} onReviewPlan={async (id) => { await diagrams.inspect(id); setView("edit"); requestAnimationFrame(() => window.document.querySelector<HTMLElement>(".diagram-recovery h3")?.focus()); }} onAccept={(next) => { diagrams.detach(true); update(structuredClone(next)); setEpoch((n) => n + 1); setErrors([]); setView("edit"); heading.current?.focus(); }} /></fieldset>
    {view === "overview" && <SessionOverview document={document} onActivity={(id) => { setSelected(id); setView("edit"); }} onDetails={() => { setView("edit"); requestAnimationFrame(() => { const details = editorRef.current?.querySelector<HTMLDetailsElement>(".designer-session-details"); if (details) { details.open = true; details.querySelector("input")?.focus(); } }); }} />}
    <div className={`designer-edit-layout ${view === "preview" ? "designer-preview-layout" : ""}`} hidden={view === "import" || view === "overview"}>
      <section ref={editorRef} className="designer-editor" aria-label="Local session editor" hidden={view !== "edit"} data-no-print>
        <div className="coaching-editor" key={epoch}><SessionContentFields workspaceNavigation activityVisual={(activity) => <ActivityDiagrams key={activity.id} activity={activity} controller={diagrams} authoring={authoring} selectionMemory={diagramSelection.current} onSelectionChange={() => setSelectionVersion(n => n + 1)} />} content={content} exercises={[]} focused selection={{ id: selected, onChange: setSelected }} localAuthoring collapsibleDetails metadataFields={<div className="designer-meta-fields"><label>Team or age group<input maxLength={200} placeholder="Not specified" value={document.session.team ?? ""} onChange={(e) => update({ ...document, session: { ...document.session, team: e.target.value || null } })} /></label>
          <label>Planned duration (minutes)<input type="number" min="0.01" step="any" placeholder="Unknown" value={document.session.durationMinutes ?? ""} onChange={(e) => update({ ...document, session: { ...document.session, durationMinutes: e.target.value === "" ? null : Number(e.target.value) } })} /></label>
          <label>Session participants<input type="number" min="1" step="1" placeholder="Unknown" value={document.session.playerCount ?? ""} onChange={(e) => update({ ...document, session: { ...document.session, playerCount: e.target.value === "" ? null : Number(e.target.value) } })} /></label></div>} typeSelection={{ value: document.session.type, onChange: (type) => update({ ...document, session: { ...document.session, type } }) }} onChange={(next) => update(applySessionContent(document, next))} /></div>
      </section>
      {view === "preview" && <div className="designer-preview-help" data-no-print><h2>Ready for the training ground</h2><p>Use Print / Save as PDF for your browser’s print dialog. The complete editable plan and logo travel together in Download JSON.</p><button type="button" onClick={() => setView("edit")}><Pencil size={15} aria-hidden="true" />Back to editing</button></div>}
      <DesignerPreview document={document} visible={view === "preview"} activities={printActivities} />
    </div>
    <div id="designer-brand-disclosure" className="designer-brand-drawer" style={{ top: brandTop, maxHeight: `calc(100dvh - ${brandTop + 16}px)` }} hidden={!brandOpen} data-no-print onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setBrandOpen(false); brandButton.current?.focus(); } }}><button className="designer-close-brand" type="button" onClick={() => { setBrandOpen(false); brandButton.current?.focus(); }}>Close branding</button><BrandingPanel key={epoch} branding={document.branding} onChange={(branding) => update((current) => ({ ...current, branding }))} /></div>
    </div>
  </div>;
}
