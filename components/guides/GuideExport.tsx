"use client";

import { useState } from "react";
import { useCoaching } from "@/components/coaching/CoachingProvider";
import { generateGuidePdf, downloadPdf } from "@/lib/documents/client";
import type { GuideReference } from "@/lib/documents/contracts";
import { documentTemplateSchema, exportBookingLabel, type DocumentTemplate } from "@/lib/documents/design-contracts";

/** Preserve exports as independent private records, including exports of historical saved sessions. */
export function GuideExport({ reference }: { reference: GuideReference }) {
  const { snapshot, mode, loading, busy, blocked, externalSave } = useCoaching();
  const [message, setMessage] = useState(""), [error, setError] = useState(""), [downloading, setDownloading] = useState(false);
  const [template, setTemplate] = useState<DocumentTemplate>("auto"), [cover, setCover] = useState(false);
  const documents = snapshot.bundle.documents.filter((doc) => doc.source.kind === "generated-guide" && doc.source.session.id === reference.session && doc.source.session.revision === reference.revision);
  return <section className="guide-exports" aria-labelledby="guide-export-heading"><h2 id="guide-export-heading">Illustrated coaching PDF</h2>
    <p className="calendar-muted">Export this exact saved revision with its coaching instructions and diagrams. Earlier exports stay unchanged.</p>
    <div className="guide-export-options"><label>Document layout<select value={template} disabled={loading || busy || blocked || downloading} onChange={(event) => { setTemplate(documentTemplateSchema.parse(event.target.value)); setCover(false); }}>
      <option value="auto">Automatic · fit saved content</option><option value="single-activity">Single Activity Sheet</option><option value="session-guide">Complete Session Guide</option><option value="extended-pack">Extended Coaching Pack</option></select></label>
      {template === "extended-pack" && <label className="guide-export-cover"><input type="checkbox" checked={cover} disabled={busy || blocked || downloading} onChange={(event) => setCover(event.target.checked)} />Include dedicated cover</label>}</div>
    <button className="calendar-primary" disabled={mode !== "saved" || loading || busy || blocked || downloading} onClick={async () => {
      setError(""); setMessage("Generating the saved guide and storing its PDF privately…");
      try { await externalSave(snapshot, async () => { await generateGuidePdf(snapshot, reference, { template, cover }); }); setMessage("PDF saved. Download it below through authorised access."); }
      catch (failure) { setMessage(""); setError(failure instanceof Error ? failure.message : "Export could not be confirmed. Reload before trying again."); }
    }}>Generate illustrated PDF</button>
    {mode !== "saved" && <p className="coaching-notice">Sign in to a configured organisation to generate and save private coaching PDFs.</p>}
    <ul className="guide-export-list">{documents.map((doc, index) => <li key={`${doc.id}:${doc.revision}`}><div><strong>{doc.filename}</strong><small>Session revision {reference.revision} · {(doc.byteLength / 1024).toFixed(1)} KiB · {doc.state}</small><small>{exportBookingLabel(doc.filename)}</small></div>
      <button disabled={mode !== "saved" || doc.state !== "ready" || busy || blocked || downloading} onClick={async () => {
        setError(""); setDownloading(true);
        try { await downloadPdf(snapshot.bundle.organizationId, reference, doc); setMessage("Download requested through authorised access."); }
        catch (failure) { setError(failure instanceof Error ? failure.message : "Download unavailable"); }
        finally { setDownloading(false); }
      }}>Download illustrated PDF {index + 1}</button></li>)}</ul>
    {!documents.length && <p>No illustrated exports have been saved for this session revision.</p>}
    {message && <p role="status">{message}</p>}{error && <p role="alert" className="coaching-notice">{error}</p>}
  </section>;
}
