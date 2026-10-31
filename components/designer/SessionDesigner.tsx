"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Printer, FileJson, Pencil, Eye, Plus } from "lucide-react";
import { SessionContentFields } from "@/components/sessions/SessionContentFields";
import { activityTotals } from "@/lib/coaching/sessions";
import { applySessionContent, blankDesignerDocument, designerErrors, exportDocument, serializeSessionJson, toSessionContent } from "@/lib/designer/contract";
import { useDesignerDraft } from "./useDesignerDraft";
import { JsonImporter } from "./JsonImporter";
import { BrandingPanel } from "./BrandingPanel";
import { DesignerPreview } from "./DesignerPreview";

/** Fully local import/edit/brand/export flow; no authenticated APIs or saved revision engine is invoked. */
export function SessionDesigner() {
  const { document, update, ready, saveState } = useDesignerDraft();
  const [view, setView] = useState<"import" | "edit" | "preview">("import"), [epoch, setEpoch] = useState(0);
  const [errors, setErrors] = useState<string[]>([]), [printRequested, setPrintRequested] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const content = toSessionContent(document), totals = activityTotals(content.activities);

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

  function preview(print = false) {
    try { exportDocument(document); setErrors([]); setView("preview"); if (print) setPrintRequested(true); }
    catch (failure) { setErrors(designerErrors(failure)); }
  }
  function download() {
    try {
      const result = exportDocument(document), blob = new Blob([serializeSessionJson(result)], { type: "application/json" });
      const url = URL.createObjectURL(blob), link = window.document.createElement("a");
      link.href = url; link.download = (result.session.name.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 80) || "coaching-session") + ".json";
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setErrors([]);
    } catch (failure) { setErrors(designerErrors(failure)); }
  }
  return <div className="session-designer calendar-workspace coaching-workspace">
    <div className="designer-heading" data-no-print><div><p className="calendar-eyebrow">JSON Session Designer · Local authoring</p><h1 ref={heading} tabIndex={-1}>{view === "import" ? "JSON Session Designer" : document.session.name || "Untitled coaching session"}</h1><p>Import, edit and print a complete coaching session.</p></div><div className="designer-actions">
      <button type="button" disabled={!ready} onClick={() => { if (window.confirm("Start a new session? Download JSON first if you want to keep your current draft.")) { update(blankDesignerDocument()); setEpoch((n) => n + 1); setErrors([]); setView("edit"); } }}><Plus size={16} aria-hidden="true" />New session</button>
      <button type="button" disabled={!ready || printRequested} onClick={() => preview(true)}><Printer size={16} aria-hidden="true" />Print / Save as PDF</button>
      <button type="button" className="calendar-primary" disabled={!ready} onClick={download}><Download size={16} aria-hidden="true" />Download JSON</button>
    </div></div>
    <div className="designer-draft-status" data-no-print><span className="designer-local-label">Local workspace</span><div><p role="status">{saveState}</p><small>Browser draft only · retained for 30 days · download JSON to keep or share your plan.</small></div></div>
    <div className="designer-toolbar" data-no-print><nav aria-label="Session designer views">
      {([ ["import", "Import JSON", FileJson], ["edit", "Edit session", Pencil], ["preview", "Branded preview", Eye] ] as const).map(([id, label, Icon]) => <button type="button" key={id} aria-pressed={view === id} disabled={!ready} onClick={() => { if (id === "preview") preview(); else { setView(id); setErrors([]); } }}><Icon size={16} aria-hidden="true" />{label}</button>)}
    </nav><span>{content.activities.length} activities · {totals.minutes} known min{totals.unknown ? ` · ${totals.unknown} untimed` : ""}</span></div>
    {!!errors.length && <div role="alert" className="designer-error-list" data-no-print><strong>Complete these fields before exporting or printing</strong><ul>{errors.map((error, i) => <li key={i}>{error}</li>)}</ul><button type="button" onClick={() => setView("edit")}>Return to editor</button></div>}
    <fieldset disabled={!ready} className="designer-main-fieldset" data-no-print hidden={view !== "import"}><JsonImporter onAccept={(next) => { update(structuredClone(next)); setEpoch((n) => n + 1); setErrors([]); setView("edit"); heading.current?.focus(); }} /></fieldset>
    <div className={`designer-edit-layout ${view === "preview" ? "designer-preview-layout" : ""}`} hidden={view === "import"}>
      <section className="designer-editor" aria-label="Local session editor" hidden={view !== "edit"} data-no-print>
        <div className="designer-panel-heading"><h2>Plan & activities</h2><span>Editable local draft</span></div>
        <p className="calendar-muted">Select an activity to edit. Unknown values stay blank.</p>
        <div className="coaching-editor" key={epoch}><SessionContentFields content={content} exercises={[]} localAuthoring collapsibleDetails metadataFields={<div className="designer-meta-fields"><label>Team or age group<input maxLength={200} placeholder="Not specified" value={document.session.team ?? ""} onChange={(e) => update({ ...document, session: { ...document.session, team: e.target.value || null } })} /></label>
          <label>Planned duration (minutes)<input type="number" min="0.01" step="any" placeholder="Unknown" value={document.session.durationMinutes ?? ""} onChange={(e) => update({ ...document, session: { ...document.session, durationMinutes: e.target.value === "" ? null : Number(e.target.value) } })} /></label>
          <label>Session participants<input type="number" min="1" step="1" placeholder="Unknown" value={document.session.playerCount ?? ""} onChange={(e) => update({ ...document, session: { ...document.session, playerCount: e.target.value === "" ? null : Number(e.target.value) } })} /></label></div>} typeSelection={{ value: document.session.type, onChange: (type) => update({ ...document, session: { ...document.session, type } }) }} onChange={(next) => update(applySessionContent(document, next))} /></div>
      </section>
      {view === "preview" && <div className="designer-preview-help" data-no-print><h2>Ready for the training ground</h2><p>Use Print / Save as PDF for your browser’s print dialog. The complete editable plan and logo travel together in Download JSON.</p><button type="button" onClick={() => setView("edit")}><Pencil size={15} aria-hidden="true" />Back to editing</button></div>}
      <div className="designer-brand-column" data-no-print><BrandingPanel key={epoch} branding={document.branding} onChange={(branding) => update((current) => ({ ...current, branding }))} /></div>
      <DesignerPreview document={document} visible={view === "preview"} />
    </div>
  </div>;
}
