"use client";

import { useRef, useState } from "react";
import { FileJson, FileUp, CheckCircle2 } from "lucide-react";
import { designerErrors, MAX_SESSION_JSON_BYTES, parseSessionJson, type DesignerDocument } from "@/lib/designer/contract";
import { verifyLogo } from "@/lib/designer/branding";
import { sessionLabels } from "@/lib/calendar/schedule";

/** Validation/preview is separate from accepting a replacement draft. No partial import is applied. */
export function JsonImporter({ onAccept }: { onAccept: (document: DesignerDocument) => void }) {
  const [text, setText] = useState(""), [candidate, setCandidate] = useState<DesignerDocument | null>(null);
  const [errors, setErrors] = useState<string[]>([]), [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null), generation = useRef(0);
  async function validate(value: string) {
    const token = ++generation.current; setCandidate(null); setErrors([]); setBusy(true);
    try {
      const next = parseSessionJson(value);
      if (next.branding.logo) await verifyLogo(next.branding.logo);
      if (generation.current === token) setCandidate(next);
    } catch (failure) { if (generation.current === token) setErrors(designerErrors(failure)); }
    finally { if (generation.current === token) setBusy(false); }
  }
  async function readFile(files: FileList | File[]) {
    const token = ++generation.current; setCandidate(null); setErrors([]);
    if (files.length !== 1 || !/\.json$/i.test(files[0].name)) { setErrors(["Choose one .json session file."]); return; }
    if (files[0].size > MAX_SESSION_JSON_BYTES) { setErrors(["JSON exceeds 2 MB. Choose a smaller session file."]); return; }
    try { const value = await files[0].text(); if (generation.current !== token) return; setText(value); await validate(value); }
    catch { setErrors(["The file could not be read. Choose a local .json file."]); }
  }
  return <div className="designer-import-layout"><section className="designer-import-card" aria-label="JSON session importer"><div className="designer-panel-heading"><FileJson size={21} aria-hidden="true" /><h2>Bring your session plan</h2></div>
    <p>Paste your session JSON, or choose a file. Review every activity before opening it.</p>
    <div className="designer-json-drop" data-testid="json-drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (!busy) void readFile(e.dataTransfer.files); }}>
      <FileUp size={27} aria-hidden="true" /><div><strong>Drag a .json file here</strong><span>Portable session format v1.0 · maximum 2 MB</span></div>
      <button type="button" disabled={busy} onClick={() => input.current?.click()}>Browse JSON files</button>
      <input ref={input} type="file" accept=".json,application/json" hidden aria-label="Choose session JSON" onChange={(e) => { if (e.target.files?.length) void readFile(e.target.files); e.target.value = ""; }} />
    </div>
    <label>Session JSON<textarea aria-label="Session JSON" className="designer-json-input" rows={13} spellCheck={false} value={text} maxLength={MAX_SESSION_JSON_BYTES} placeholder={'{\n  "format": "football-formation-session",\n  "schemaVersion": "1.0",\n  "session": { "name": "Your coaching session" }\n}'} onChange={(e) => { generation.current++; setText(e.target.value); setCandidate(null); setErrors([]); setBusy(false); }} /></label>
    <div className="designer-actions"><button className="calendar-primary" type="button" disabled={busy || !text.trim()} onClick={() => void validate(text)}>{busy ? "Validating…" : "Validate & preview import"}</button>
      <button type="button" disabled={busy} onClick={async () => { setErrors([]); try { const response = await fetch("/samples/session-designer-possession.json"); if (!response.ok) throw new Error(); const value = await response.text(); setText(value); await validate(value); } catch { setErrors(["The sample could not be loaded. Use the downloadable example."]); } }}>Load five-activity sample</button></div>
    {!!errors.length && <div role="alert" className="designer-error-list"><strong>Check your JSON</strong><ul>{errors.map((error, i) => <li key={i}>{error}</li>)}</ul></div>}
    {candidate && <section className="designer-import-preview" aria-label="Import preview"><div className="designer-panel-heading"><CheckCircle2 size={20} aria-hidden="true" /><h2>Ready to open</h2></div><h3>{candidate.session.name}</h3><p>{candidate.session.type ? sessionLabels[candidate.session.type] : "Type not specified"} · {candidate.session.team ?? "Team not specified"} · {candidate.session.activities.length} activities</p>
      <ol>{candidate.session.activities.map((a) => <li key={a.id}><strong>{a.name}</strong><span>{a.durationMinutes === null ? "Duration unknown" : `${a.durationMinutes} min`} · {a.playerCount === null ? "Players unknown" : `${a.playerCount} players`}</span></li>)}</ol>
      <p>{candidate.branding.clubName ?? "No club identity supplied"}{candidate.branding.logo ? " · Embedded logo validated" : " · No logo"}. Missing information stays unknown.</p>
      <button type="button" className="calendar-primary" onClick={() => onAccept(candidate)}>Open imported session</button><small>This replaces the current local draft. Download your current JSON first if you want to keep it.</small>
    </section>}
  </section><aside className="designer-import-help"><p className="calendar-eyebrow">One plan. Fully portable.</p><h2>From JSON to the training ground.</h2><ol><li><strong>Import & review</strong><span>Choose the activities you actually supplied. Nothing is filled in for you.</span></li><li><strong>Make it yours</strong><span>Edit the sequence, timings and coaching detail. Add a crest and club colours.</span></li><li><strong>Take it with you</strong><span>Download the complete JSON or print a branded coaching plan.</span></li></ol>
    <div className="designer-contract-link"><h3>Start with the format</h3><p>Use a simple versioned contract with optional branding. No organisation or account IDs.</p><a href="/samples/session-designer-possession.json" download>Download five-activity sample JSON</a><a href="/samples/session-designer-recovery.json" download>Download recovery-session example</a><a href="/samples/session-designer-contract.txt" target="_blank" rel="noreferrer">Read the JSON format</a></div>
  </aside></div>;
}
