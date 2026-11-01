"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Upload, X } from "lucide-react";
import { hexColorSchema, type DesignerDocument } from "@/lib/designer/contract";
import { prepareLogo } from "@/lib/designer/branding";
import { printTheme } from "@/lib/documents/print-theme";

/** Branding stays portable and optional; only decoded, bounded raster pixels enter the document. */
export function BrandingPanel({ branding, onChange }: { branding: DesignerDocument["branding"]; onChange: (value: DesignerDocument["branding"]) => void }) {
  const file = useRef<HTMLInputElement>(null), operation = useRef(0);
  const latest = useRef(branding);
  useEffect(() => { latest.current = branding; }, [branding]);
  useEffect(() => () => { operation.current++; }, []);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function attach(files: FileList | File[]) {
    const token = ++operation.current;
    if (files.length !== 1) { setBusy(false); setError("Choose one PNG or JPEG logo."); return; }
    setBusy(true); setError("");
    try { const logo = await prepareLogo(files[0]); if (operation.current === token) onChange({ ...latest.current, logo }); }
    catch (failure) { if (operation.current === token) setError(failure instanceof Error ? failure.message : "The logo could not be decoded."); }
    finally { if (operation.current === token) setBusy(false); }
  }
  return <aside className="designer-branding" aria-label="Club Branding"><div className="designer-panel-heading"><ImagePlus size={19} aria-hidden="true" /><h2>Club Branding</h2><span>Optional</span></div>
    <p className="calendar-muted">Your identity, included in every JSON export.</p>
    <label>Club name<input maxLength={200} placeholder="Not specified" value={branding.clubName ?? ""} onChange={(e) => onChange({ ...branding, clubName: e.target.value || null })} /></label>
    <div className="designer-logo-drop" data-testid="logo-drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); void attach(e.dataTransfer.files); }}>
      {branding.logo ? <div className="designer-logo-preview">
        {/* A validated embedded raster is intentionally rendered without a remote image optimiser. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={branding.logo.dataUrl} alt="Club logo preview" width={branding.logo.width} height={branding.logo.height} />
      </div> : <Upload size={28} aria-hidden="true" />}
      <strong>{busy ? "Preparing logo…" : branding.logo ? branding.logo.name : "Drop your club crest here"}</strong>
      <span>PNG or JPEG · up to 4 MB</span>
      <input ref={file} type="file" accept="image/png,image/jpeg" aria-label="Choose club logo" hidden onChange={(e) => { if (e.target.files?.length) void attach(e.target.files); e.target.value = ""; }} />
      <div className="designer-actions"><button type="button" disabled={busy} onClick={() => file.current?.click()}>{branding.logo ? "Replace logo" : "Browse files"}</button>
        {branding.logo && <button type="button" aria-label="Remove logo" onClick={() => { operation.current++; onChange({ ...branding, logo: null }); setError(""); setBusy(false); }}><X size={15} aria-hidden="true" />Remove</button>}</div>
    </div>
    {error && <p role="alert" className="designer-error">{error}</p>}
    <p className="designer-fine">Resized to fit 512 × 512 px. Transparency and aspect ratio are preserved.</p>
    <h3>Plan colours</h3>
    {([ ["primaryColor", "Primary", printTheme.navy], ["secondaryColor", "Secondary", printTheme.ink], ["accentColor", "Accent", printTheme.gold] ] as const).map(([key, label, fallback]) => <div className="designer-color" key={key}>
      <label htmlFor={`designer-${key}-hex`}>{label}</label><div><input type="color" aria-label={`${label} colour picker`} value={hexColorSchema.safeParse(branding[key]).success ? branding[key]! : fallback} onChange={(e) => onChange({ ...branding, [key]: e.target.value })} />
        <input id={`designer-${key}-hex`} aria-label={`${label} HEX`} placeholder="App default" maxLength={7} spellCheck={false} value={branding[key] ?? ""} onChange={(e) => onChange({ ...branding, [key]: e.target.value || null })} /></div>
      {branding[key] !== null && !hexColorSchema.safeParse(branding[key]).success && <span className="designer-error">Use # followed by six HEX digits.</span>}
    </div>)}
    <button type="button" onClick={() => onChange({ ...branding, primaryColor: null, secondaryColor: null, accentColor: null })}>Use app default colours</button>
  </aside>;
}
