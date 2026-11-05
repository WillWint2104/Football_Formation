"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { browserCompanionRepository } from "@/lib/designer/companion-indexeddb";
import type { CompanionEntry, RecoveredCompanion } from "@/lib/designer/companion";
import { attachmentCandidate, sameDocument, type AttachmentEdit } from "@/lib/designer/attachments";
import { cleanDocument, designerErrors, type DesignerDocument } from "@/lib/designer/contract";
import { serializeSessionPackageJson, type SessionPackage } from "@/lib/designer/package";
import type { useDesignerDraft } from "./useDesignerDraft";

export function downloadDiagramPackage(pkg: SessionPackage, name = "session-and-diagrams") {
  const result = serializeSessionPackageJson(pkg);
  if (!result.ok) throw new Error(result.diagnostics.map((d) => d.message).join(" "));
  const url = URL.createObjectURL(new Blob([result.value], { type: "application/json" }));
  const link = window.document.createElement("a"); link.href = url; link.download = `${name}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function association(snapshot: RecoveredCompanion | null) {
  const url = new URL(window.location.href);
  if (snapshot) { url.searchParams.set("localPlan", snapshot.documentId); url.searchParams.set("localVersion", String(snapshot.ownerVersion)); }
  else { url.searchParams.delete("localPlan"); url.searchParams.delete("localVersion"); }
  window.history.replaceState(null, "", url);
}
type Draft = ReturnType<typeof useDesignerDraft>;

/** B2 owns complete snapshots. The URL is an association hint, never a second storage record.
 * Legacy text and IDB cannot commit atomically: every interrupted/mismatched pair requires review.
 */
export function useActivityDiagrams(draft: Draft, onOpen: () => void) {
  const repository = useMemo(() => browserCompanionRepository(), []);
  const [active, setActive] = useState<RecoveredCompanion | null>(null);
  const [entries, setEntries] = useState<(CompanionEntry & { name?: string; namespace?: string | null })[]>([]), [source, setSource] = useState<RecoveredCompanion | null>(null);
  const [recovery, setRecovery] = useState<RecoveredCompanion | null>(null), [backup, setBackup] = useState<SessionPackage | null>(null);
  const [blocked, setBlocked] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [checking, setChecking] = useState(true);
  const generation = useRef(0), sourceRequest = useRef(0), catalogRequest = useRef(0), activeRef = useRef<RecoveredCompanion | null>(null);
  const { ready, getCurrent, isDraftCurrent } = draft;
  const browse = useCallback(async () => {
    const request = ++catalogRequest.current;
    const result = await repository.list();
    if (request !== catalogRequest.current) return;
    if (!result.ok) { setMessage(result.error.message); return; }
    const catalog = await Promise.all(result.value.map(async (entry) => {
      if (entry.status !== "ready") return entry;
      const read = await repository.read(entry.documentId);
      return read.ok && read.value.status === "ready" ? { ...entry, name: read.value.snapshot.package.document.session.name, namespace: read.value.snapshot.package.sceneNamespace } : entry;
    }));
    if (request === catalogRequest.current) setEntries(catalog);
  }, [repository]);
  function bind(value: RecoveredCompanion | null) { activeRef.current = value; setActive(value); association(value); if (value) void browse(); }
  function fail(error: unknown) { setMessage(designerErrors(error).join(" ")); }

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    queueMicrotask(() => { if (alive) void browse(); });
    const version = generation.current;
    const url = new URL(window.location.href), id = url.searchParams.get("localPlan"), expected = Number(url.searchParams.get("localVersion"));
    if (id) void (async () => {
      const result = await repository.read(id);
      if (!alive || version !== generation.current) return;
      if (result.ok && result.value.status === "ready") {
        const saved = result.value.snapshot;
        if (Number.isSafeInteger(expected) && expected === saved.ownerVersion && sameDocument(cleanDocument(getCurrent()), saved.package.document)) {
          activeRef.current = saved; setActive(saved); setMessage(`Complete local plan recovered · owner v${saved.ownerVersion}.`); return;
        }
        setRecovery(saved); setMessage("The linked package version or text draft differs. Neither has been overwritten. Choose a recovery action.");
      } else if (result.ok && result.value.status === "invalid") {
        setRecovery(result.value.recoverable ?? null); setMessage(`Linked package is invalid. ${result.value.messages.join(" ")} A verified previous snapshot, if available, can be downloaded or opened as a new copy.`);
      } else setMessage(result.ok ? "The linked local package is missing. The reference-only text draft is preserved; no replacement scene was selected." : result.error.message);
      setBlocked(true);
    })().catch(error => { if (alive) { setBlocked(true); setMessage(designerErrors(error).join(" ")); } }).finally(() => { if (alive) setChecking(false); });
    else queueMicrotask(() => { if (alive) setChecking(false); });
    const moved = () => { generation.current++; activeRef.current = null; setActive(null); setRecovery(null); setBlocked(true); setMessage("Browser history changed the plan association. Keep this text draft or reload to inspect the linked version. Nothing was replaced."); };
    window.addEventListener("popstate", moved);
    return () => { alive = false; window.removeEventListener("popstate", moved); };
  }, [ready, repository, getCurrent, browse]);

  function detach(silent = false) {
    generation.current++; sourceRequest.current++; bind(null); setSource(null); setRecovery(null); setBackup(null); setBlocked(false);
    setMessage(silent ? "" : "Reference-only draft retained. Complete packages in the repository are unchanged.");
  }
  async function selectSource(id: string) {
    const request = ++sourceRequest.current; setSource(null);
    const result = await repository.read(id);
    if (request !== sourceRequest.current) return;
    if (!result.ok) { fail(new Error(result.error.message)); return; }
    if (result.value.status !== "ready") {
      setRecovery(result.value.status === "invalid" ? result.value.recoverable ?? null : null);
      setMessage(`Selected package is ${result.value.status}. No scene was substituted. Use Import Session & Diagrams to inspect/recover its stored data.`); return;
    }
    if (activeRef.current && activeRef.current.package.sceneNamespace !== result.value.snapshot.package.sceneNamespace) {
      setMessage("Different namespace: this package cannot supply scenes to the linked plan. Open it as a separate complete plan instead."); return;
    }
    setSource(result.value.snapshot); setMessage("Exact local source loaded. Its owner and scene revisions will be rechecked before attachment.");
  }
  async function inspect(id: string) {
    const result = await repository.read(id);
    if (!result.ok) { fail(new Error(result.error.message)); return; }
    const read = result.value;
    setRecovery(read.status === "ready" ? read.snapshot : read.status === "invalid" ? read.recoverable ?? null : null);
    setMessage(read.status === "ready" ? "Review this complete plan before opening it. Opening replaces the active text draft only after confirmation." : `Package is ${read.status}. Only a verified recovery snapshot can be opened as a new copy.`);
  }
  async function openRecovery(keepText = false) {
    if (!recovery || busy) return;
    const chosen = recovery, epoch = generation.current, before = structuredClone(getCurrent());
    let reviewed: string | null;
    try { reviewed = draft.reviewDraft(); } catch (error) { fail(error); return; }
    let proposed = chosen.package;
    try {
      if (keepText) {
        if (new URL(window.location.href).searchParams.get("localPlan") !== chosen.documentId) throw new Error("Only the explicitly linked package can restore this draft's namespace association.");
        proposed = attachmentCandidate(before, chosen.package);
      }
    } catch (error) { fail(error); return; }
    if (!window.confirm(keepText ? "Keep this tab's current text, validate every exact diagram reference against the reviewed linked package, and save an independent complete copy? This replaces the browser text draft after confirmation; the stored source stays unchanged."
      : "Open this complete plan and replace the current text draft? Download your current JSON first if needed. The stored source will be preserved as an independent copy.")) return;
    setBusy(true);
    try {
      const read = await repository.read(chosen.documentId);
      if (!read.ok) throw new Error(read.error.message);
      const verified = read.value.status === "ready" ? read.value.snapshot : read.value.status === "invalid" ? read.value.recoverable : null;
      if (!verified || verified.sha256 !== chosen.sha256 || verified.ownerVersion !== chosen.ownerVersion) throw new Error("The reviewed package changed. Inspect it again before recovery.");
      if (epoch !== generation.current || !sameDocument(before, getCurrent()) || reviewed !== draft.reviewDraft()) throw new Error("The editing draft changed during recovery. Nothing was replaced.");
      // Opening is a fresh local owner, preserving source packages and damaged records for inspection.
      const copy = await repository.create(proposed);
      if (!copy.ok) throw new Error(copy.error.message);
      setRecovery(copy.value); setBlocked(true);
      if (epoch !== generation.current || !sameDocument(before, getCurrent()) || reviewed !== draft.reviewDraft()) {
        setRecovery(copy.value); setBlocked(true); throw new Error("A complete copy was saved, but the draft changed meanwhile. Review the saved copy; no session edits were overwritten.");
      }
      draft.adoptReviewedDraft(reviewed, structuredClone(keepText ? before : copy.value.package.document)); bind(copy.value);
      setRecovery(null); setBackup(null); setBlocked(false); setSource(null); setMessage("Independent complete plan opened. Source package unchanged."); onOpen();
    } catch (error) { fail(error); } finally { setBusy(false); }
  }
  async function save(edit?: AttachmentEdit) {
    if (busy || blocked) return;
    const before = structuredClone(getCurrent()), owner = activeRef.current, epoch = generation.current;
    let candidate: SessionPackage | null = null;
    setBusy(true);
    try {
      if (!isDraftCurrent()) throw new Error("Another tab changed the text draft. Download your JSON and inspect a saved plan before recovery.");
      if (edit?.pin) {
        if (!source) throw new Error("Choose a local scene source first.");
        const checked = await repository.read(source.documentId);
        if (!checked.ok) throw new Error(checked.error.message);
        if (checked.value.status !== "ready" || checked.value.snapshot.ownerVersion !== source.ownerVersion || checked.value.snapshot.sha256 !== source.sha256)
          throw new Error("The scene source is missing, invalid or changed. Browse and select it again; no revision was substituted.");
      }
      candidate = attachmentCandidate(before, owner?.package ?? null, edit?.pin ? source!.package : undefined, edit);
      if (epoch !== generation.current || !sameDocument(before, getCurrent()) || !isDraftCurrent()) throw new Error("The draft changed while preparing this save. No attachment was applied.");
      const result = owner ? await repository.save(owner.documentId, owner.ownerVersion, candidate) : await repository.create(candidate);
      if (!result.ok) throw new Error(result.error.message);
      setRecovery(result.value); setBlocked(true);
      if (epoch !== generation.current || !sameDocument(before, getCurrent()) || !isDraftCurrent()) {
        setRecovery(result.value); throw new Error("The complete candidate was saved, but text changed meanwhile. Review recovery; your current edits were not overwritten.");
      }
      // Preserve incomplete/uncleaned editor text. Only the pin operation changes the draft.
      const next: DesignerDocument = structuredClone(before);
      if (edit) next.session.activities.find((a) => a.id === edit.activityId)!.diagrams = structuredClone(candidate.document.session.activities.find((a) => a.id === edit.activityId)!.diagrams);
      draft.update(next); bind(result.value); setRecovery(null); setBlocked(false); setBackup(null); setMessage(`Complete local plan saved · owner v${result.value.ownerVersion}. Text draft is saved separately.`);
    } catch (error) {
      if (candidate) { setBackup(candidate); setBlocked(true); }
      // Preparation errors do not poison storage; concurrency errors still require deliberate inspection.
      if (!isSafeDraft()) setBlocked(true);
      fail(error);
    } finally { setBusy(false); }
  }
  function isSafeDraft() { try { return isDraftCurrent(); } catch { return false; } }
  async function recheck() {
    const owner = activeRef.current;
    if (owner) await inspect(owner.documentId);
    await browse();
    setMessage("Storage rechecked. Open a reviewed complete plan, or keep the reference-only draft. Saves remain paused until recovery is chosen.");
  }
  function downloadCurrent() {
    try { downloadDiagramPackage(attachmentCandidate(getCurrent(), active?.package ?? null)); }
    catch (error) { fail(error); }
  }
  async function prepareAuthoring() {
    if (busy || blocked || !isSafeDraft()) throw new Error("Review the local plan or conflicting text draft before opening the editor.");
    const before = structuredClone(getCurrent()), owner = activeRef.current, epoch = generation.current;
    const pkg = attachmentCandidate(before, owner?.package ?? null);
    if (owner) {
      const read = await repository.read(owner.documentId);
      if (!read.ok) throw new Error(read.error.message);
      if (read.value.status !== "ready" || read.value.snapshot.ownerVersion !== owner.ownerVersion || read.value.snapshot.sha256 !== owner.sha256)
        throw new Error("The source local plan changed or is unavailable. Review it before opening a local copy.");
    }
    if (epoch !== generation.current || !sameDocument(before, getCurrent()) || !isSafeDraft()) throw new Error("The draft changed while opening the local editor.");
    if (owner) return owner;
    const created = await repository.create(pkg);
    if (!created.ok) throw new Error(created.error.message);
    setRecovery(created.value); setBlocked(true);
    if (epoch !== generation.current || !sameDocument(before, getCurrent()) || !isSafeDraft()) throw new Error("A complete source plan was saved, but the draft changed. Review the saved plan; no text was replaced.");
    bind(created.value); setRecovery(null); setBlocked(false); return created.value;
  }
  function adoptLocalSave(origin: RecoveredCompanion, saved: RecoveredCompanion, before: DesignerDocument, next: DesignerDocument) {
    setRecovery(saved); setBlocked(true);
    const owner = activeRef.current;
    if (!owner || owner.documentId !== origin.documentId || owner.ownerVersion !== origin.ownerVersion || owner.sha256 !== origin.sha256
      || !sameDocument(before, getCurrent()) || !isSafeDraft()) throw new Error("The accepted complete plan was saved, but this tab changed before acknowledgement. Review its saved version; the current text was preserved.");
    draft.update(next); bind(saved); setRecovery(null); setBlocked(false); setBackup(null);
    setMessage(`Complete local plan saved · owner v${saved.ownerVersion}. Local copy accepted; original scene revisions retained.`);
  }
  function reviewAuthoringOrigin(origin: RecoveredCompanion) {
    const url = new URL(window.location.href);
    if (url.searchParams.get("localPlan") !== origin.documentId || Number(url.searchParams.get("localVersion")) !== origin.ownerVersion || !isSafeDraft())
      throw new Error("The source association changed. Review the saved local plan before recovery.");
    bind(origin); setRecovery(null); setBlocked(false);
  }
  const dirty = active !== null && !sameDocument(cleanDocument(draft.document), active.package.document);
  const canRecoverText = blocked && recovery !== null && typeof window !== "undefined" && new URL(window.location.href).searchParams.get("localPlan") === recovery.documentId;
  /** Read-only verification for print. Never accepts a newer owner, repairs data or opens a recovery snapshot. */
  async function preparePrintSource(): Promise<{ library: SessionPackage | null; unavailable?: string }> {
    const owner = activeRef.current, epoch = generation.current;
    if (blocked || busy) return { library: null, unavailable: "The local plan needs review or is being saved. Review the diagram workspace and refresh this preview." };
    if (!owner) return { library: null };
    const read = await repository.read(owner.documentId);
    if (epoch !== generation.current || activeRef.current !== owner) throw new Error("The local plan association changed while preparing the document. Review it and try again.");
    if (!read.ok) return { library: null, unavailable: "Local diagram storage could not be read. The requested references are retained below." };
    if (read.value.status !== "ready") return { library: null, unavailable: "The associated local diagram package is missing or invalid. Recover it explicitly in the diagram workspace; no recovery version was substituted." };
    if (read.value.snapshot.ownerVersion !== owner.ownerVersion || read.value.snapshot.sha256 !== owner.sha256)
      return { library: null, unavailable: "The complete local plan changed in another tab. Reopen the reviewed plan before printing its diagrams." };
    return { library: read.value.snapshot.package };
  }
  return { active, entries, source, recovery, backup, blocked, checking, busy, message, dirty, canRecoverText, browse, selectSource, inspect, openRecovery, detach, save, recheck, downloadCurrent, prepareAuthoring, adoptLocalSave, reviewAuthoringOrigin, preparePrintSource };
}
export type ActivityDiagramsController = ReturnType<typeof useActivityDiagrams>;
