"use client";

import { useEffect, useRef, useState } from "react";
import { browserCompanionRepository } from "@/lib/designer/companion-indexeddb";
import { type CompanionEntry, type CompanionRead, type RecoveredCompanion } from "@/lib/designer/companion";
import { SESSION_PACKAGE_LIMITS, serializeSessionPackageJson, type SessionPackage } from "@/lib/designer/package";
import { packageImportSummary, previewPackageImport } from "@/lib/designer/package-import";
import { verifyLogo } from "@/lib/designer/branding";

function download(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" })), link = document.createElement("a");
  link.href = url; link.download = (name.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 70) || "session") + "-with-diagrams.json";
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Summary({ pkg }: { pkg: SessionPackage }) {
  const summary = packageImportSummary(pkg);
  return <><h3>{summary.name}</h3><dl className="designer-package-metrics"><div><dt>Activities</dt><dd>{summary.activities}</dd></div><div><dt>Scene revisions</dt><dd>{summary.scenes}</dd></div><div><dt>Diagram attachments</dt><dd>{summary.attachments.length}</dd></div></dl>
    <p className="designer-package-namespace">Scene namespace: <code>{summary.namespace ?? "None · no diagrams"}</code></p>
    <details><summary>Review diagram attachments ({summary.attachments.length})</summary>{summary.attachments.length ? <div className="designer-package-table" tabIndex={0} aria-label="Diagram attachment details"><table><thead><tr><th>Activity</th><th>Scene</th><th>Revision</th><th>Time</th></tr></thead><tbody>{summary.attachments.map((pin) => <tr key={`${pin.activityId}:${pin.diagramIndex}`}><td>{pin.activityName}</td><td><code>{pin.sceneId}</code></td><td>{pin.revision}</td><td>{pin.seconds} s</td></tr>)}</tbody></table></div> : <p>No activity references are attached. Valid library scenes remain available for the later attachment browser.</p>}</details></>;
}

/** Explicit package library entry point only. It never replaces or writes the legacy editing draft. */
export function PackageImporter({ onBusyChange, onStored, onReviewPlan }: { onBusyChange: (busy: boolean) => void; onStored?: () => void; onReviewPlan?: (id: string) => void }) {
  const [candidate, setCandidate] = useState<SessionPackage | null>(null), [entries, setEntries] = useState<CompanionEntry[]>([]);
  const [inspected, setInspected] = useState<CompanionRead | null>(null), [target, setTarget] = useState<RecoveredCompanion | null>(null);
  const [receipt, setReceipt] = useState<RecoveredCompanion | null>(null), [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [directoryError, setDirectoryError] = useState("");
  const [status, setStatus] = useState("Choose a complete session-and-diagrams package to validate."), [blocked, setBlocked] = useState(false), [rechecked, setRechecked] = useState(false);
  const [directoryLoading, setDirectoryLoading] = useState(true);
  const lock = useRef(false), alive = useRef(true), input = useRef<HTMLInputElement>(null);
  const repo = useRef<ReturnType<typeof browserCompanionRepository> | null>(null);
  const repository = () => repo.current ??= browserCompanionRepository();

  async function refresh() {
    setDirectoryLoading(true);
    const result = await repository().list();
    if (!alive.current) return false;
    setDirectoryLoading(false);
    if (result.ok) { setEntries(result.value); setDirectoryError(""); return true; }
    setDirectoryError(result.error.message); return false;
  }
  useEffect(() => {
    alive.current = true;
    const repository = browserCompanionRepository(); repo.current = repository;
    void repository.list().then((result) => {
      if (!alive.current) return;
      setDirectoryLoading(false);
      if (result.ok) setEntries(result.value); else setDirectoryError(result.error.message);
    });
    return () => { alive.current = false; };
  }, []);
  function begin() { if (lock.current) return false; lock.current = true; setBusy(true); onBusyChange(true); return true; }
  function end() { lock.current = false; if (alive.current) { setBusy(false); onBusyChange(false); } }

  async function choose(files: FileList) {
    if (!begin()) return;
    setCandidate(null); setTarget(null); setConfirmed(false); setError(""); setBlocked(false); setRechecked(false);
    try {
      if (files.length !== 1 || !/\.json$/i.test(files[0].name)) throw Error("Choose one .json session-and-diagrams package.");
      if (files[0].size > SESSION_PACKAGE_LIMITS.bytes) throw Error("Package exceeds the 8 MiB UTF-8 limit.");
      const result = previewPackageImport(new TextDecoder("utf-8", { fatal: true }).decode(await files[0].arrayBuffer()));
      if (!result.ok) throw Error(result.diagnostics.slice(0, 6).map((d) => `${d.path.join(".") || "Package"}: ${d.message}`).join(" "));
      if (result.value.document.branding.logo) await verifyLogo(result.value.document.branding.logo);
      if (alive.current) { setCandidate(result.value); setStatus("Validated. Review the contents and confirm before storing anything."); }
    } catch (failure) { if (alive.current) { setError(failure instanceof Error ? failure.message : "Package could not be read."); setStatus("Import not applied. Existing local packages and the editing draft are unchanged."); } }
    finally { end(); }
  }
  async function inspect(id: string) {
    if (!begin()) return;
    setError(""); setConfirmed(false); setTarget(null);
    try {
      const result = await repository().read(id);
      if (!alive.current) return;
      if (!result.ok) { setError(result.error.message); setInspected(null); }
      else setInspected(result.value);
    } finally { end(); }
  }
  async function store() {
    if (!candidate || !confirmed || blocked || !begin()) return;
    setError("");
    try {
      const result = target ? await repository().save(target.documentId, target.ownerVersion, candidate) : await repository().create(candidate);
      if (!alive.current) return;
      setConfirmed(false);
      if (!result.ok) {
        setError(result.error.message); setBlocked(true); setRechecked(false);
        setStatus("Save not confirmed. Keep your validated package and deliberately review saved state before another attempt."); return;
      }
      setReceipt(result.value); setInspected({ status: "ready", snapshot: result.value }); setTarget(null);
      onStored?.();
      setStatus(`Package stored locally · owner version ${result.value.ownerVersion}. The Session Designer editing draft was not replaced.`);
      await refresh();
    } finally { end(); }
  }
  function exportCandidate() {
    if (!candidate) return;
    const result = serializeSessionPackageJson(candidate);
    if (result.ok) download(result.value, candidate.document.session.name); else setError(result.diagnostics.map((d) => d.message).join(" "));
  }
  const recoverable = inspected?.status === "invalid" ? inspected.recoverable : undefined;
  return <section className="designer-package-workflow" aria-label="Session and diagrams package import">
    <header><h2>Import Session &amp; Diagrams</h2><p>Import package → validate → review contents → confirm → store locally.</p><p>The current editing draft stays separate. Scene namespaces remain unchanged; a local copy does not grant access to an organisation.</p></header>
    <p role="status">{status}</p>
    {!!error && <div role="alert" className="designer-error-list"><strong>Package import needs attention</strong><p>{error}</p></div>}
    <div className="designer-package-layout"><div className="designer-package-main">
      <div className="designer-json-drop"><div><strong>Complete package · v1.0</strong><span>football-formation-session-package · maximum 8 MiB</span></div><button type="button" disabled={busy} onClick={() => input.current?.click()}>Choose package file</button><input ref={input} type="file" hidden accept=".json,application/json" aria-label="Choose session and diagrams package" disabled={busy} onChange={(e) => { if (e.target.files?.length) void choose(e.target.files); e.target.value = ""; }} /></div>
      {candidate && <section className="designer-import-preview" aria-label="Package import preview"><p className="calendar-eyebrow">Validated package · not yet stored</p><Summary pkg={candidate} />
        <p>{target ? <>Replace only <strong>{target.package.document.session.name}</strong> · local ID <code>{target.documentId}</code> · base owner v{target.ownerVersion}. Its prior valid snapshot is retained by B2.</> : "Import as a new independent local package. Existing saved packages and the editing draft will remain untouched."}</p>
        <label className="designer-package-confirm"><input type="checkbox" disabled={busy || blocked} checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />{target ? "I confirm replacing this selected local package." : "I confirm storing a new independent local package."}</label>
        <div className="designer-actions"><button type="button" className="calendar-primary" disabled={busy || blocked || !confirmed} onClick={() => void store()}>{busy ? "Working…" : target ? "Confirm replacement & store" : "Confirm & store locally"}</button><button type="button" onClick={exportCandidate}>Download validated package</button><button type="button" disabled={busy} onClick={() => { setCandidate(null); setTarget(null); setConfirmed(false); setError(""); setBlocked(false); setStatus("Import cancelled. No saved package or editing draft was replaced."); }}>Cancel package import</button></div>
        {blocked && <section className="designer-package-recovery" aria-label="Import save recovery"><h4>Review saved state before continuing</h4><p>A failed or uncertain save is never retried automatically. Recheck the list, inspect the saved version and download your validated package.</p><button type="button" disabled={busy} onClick={async () => { if (!begin()) return; try { setRechecked(await refresh()); } finally { end(); } }}>Recheck local packages</button><button type="button" disabled={busy || !rechecked} onClick={() => { setTarget(null); setBlocked(false); setConfirmed(false); setError(""); setStatus("New independent copy selected deliberately. Review and confirm again; this may duplicate a save whose acknowledgement was lost."); }}>Review as a new independent copy</button></section>}
      </section>}
      {receipt && <section className="designer-package-receipt" aria-label="Package import success"><h3>Session and diagrams saved locally</h3><p><strong>{receipt.package.document.session.name}</strong> · {receipt.package.scenes.length} saved scene revisions · version {receipt.ownerVersion}</p><p>Review this plan to open an independent editing copy. Your current draft and the imported source stay unchanged until you confirm.</p><details><summary>Import details</summary><p>Local ID: <code>{receipt.documentId}</code></p><p>This receipt records the completed import. Opening rechecks the saved version.</p></details>{onReviewPlan && <button type="button" className="calendar-primary" disabled={busy} onClick={() => onReviewPlan(receipt.documentId)}>Review &amp; open imported plan</button>}<button type="button" onClick={() => download(receipt.packageJson, receipt.package.document.session.name)}>Download stored package</button></section>}
    </div><aside className="designer-package-library" aria-label="Saved local packages"><h3>Saved local packages</h3><button type="button" disabled={busy || directoryLoading} onClick={async () => { if (!begin()) return; try { await refresh(); } finally { end(); } }}>Refresh local packages</button>
      {directoryLoading ? <p role="status">Checking local package storage…</p> : directoryError ? <p role="alert">{directoryError} A missing list does not mean your saved packages were removed.</p> : !entries.length ? <p>No local packages found.</p> : <ul>{entries.map((entry) => <li key={entry.documentId}><button type="button" disabled={busy} onClick={() => void inspect(entry.documentId)} aria-label={`Inspect local package ${entry.documentId}`}><code>{entry.documentId}</code><span>{entry.status === "ready" ? `Owner v${entry.ownerVersion}` : "Invalid · review recovery"}</span></button></li>)}</ul>}
      {inspected?.status === "missing" && <p role="alert">This local package is missing. No other revision was substituted.</p>}
      {inspected?.status === "ready" && <section aria-label="Inspected local package"><h4>{inspected.snapshot.package.document.session.name}</h4><p>Owner v{inspected.snapshot.ownerVersion} · {inspected.snapshot.package.scenes.length} scene revisions</p><button type="button" onClick={() => download(inspected.snapshot.packageJson, inspected.snapshot.package.document.session.name)}>Download inspected package</button><button type="button" disabled={!candidate || busy} onClick={() => { setTarget(inspected.snapshot); setConfirmed(false); setBlocked(false); setError(""); setStatus("Replacement target selected explicitly. Review its identity and confirm before saving."); }}>Use this package as replacement target</button></section>}
      {inspected?.status === "invalid" && <section className="designer-package-recovery" aria-label="Corrupt package recovery"><h4>Saved package needs recovery</h4>{inspected.messages.map((message, index) => <p key={index}>{message}</p>)}<p>No in-place repair or overwrite was performed.</p>{recoverable ? <><p>Separately verified recovery snapshot: owner v{recoverable.ownerVersion}.</p><button type="button" onClick={() => download(recoverable.packageJson, recoverable.package.document.session.name)}>Download recovery package</button><button type="button" disabled={busy} onClick={() => { setCandidate(structuredClone(recoverable.package)); setTarget(null); setConfirmed(false); setBlocked(false); setError(""); setStatus("Recovery copy is ready for review. Confirm to store it under a new local identity."); }}>Review recovery as a new copy</button></> : <p>Neither a complete current package nor a recovery snapshot is available. Keep the original stored record and use an independent backup. The legacy editing draft remains separate.</p>}</section>}
    </aside></div>
  </section>;
}
