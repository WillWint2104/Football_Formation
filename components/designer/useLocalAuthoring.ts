"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TacticalScene } from "@/lib/domain/tactical-scene";
import { sameDocument } from "@/lib/designer/attachments";
import { browserCompanionRepository } from "@/lib/designer/companion-indexeddb";
import { registerLocalHistoryGuard } from "@/lib/designer/local-history-guard";
import type { SessionPackage } from "@/lib/designer/package";
import { AUTHORING_QUERY, acceptedLocalPackage, beginLocalAuthoring, candidatePackage, checkCurrentDocument, decodeAuthoringContext, encodeAuthoringContext,
  exactSnapshot, snapshotRef, verifyLocalCandidate, type LocalAuthoringContext } from "@/lib/designer/local-authoring";
import type { useDesignerDraft } from "./useDesignerDraft";
import type { ActivityDiagramsController } from "./useActivityDiagrams";

type Work = { context: LocalAuthoringContext; initial: TacticalScene; dirtyBaseline?: TacticalScene; base: SessionPackage; view: "editor" | "review" };
function returnReference(context: LocalAuthoringContext | null) {
  const url = new URL(window.location.href);
  if (context) url.searchParams.set(AUTHORING_QUERY, encodeAuthoringContext(context)); else url.searchParams.delete(AUTHORING_QUERY);
  window.history.replaceState(null, "", url);
}
export function useLocalAuthoring(draft: ReturnType<typeof useDesignerDraft>, diagrams: ActivityDiagramsController) {
  const repository = useMemo(() => browserCompanionRepository(), []);
  const [work, setWork] = useState<Work | null>(null), [recover, setRecover] = useState<LocalAuthoringContext | null>(null);
  const [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [failed, setFailed] = useState(false), [dirty, setDirty] = useState(false);
  const [backup, setBackup] = useState<SessionPackage | null>(null);
  const lock = useRef(false), epoch = useRef({ value: 0 }), [seconds, setSeconds] = useState("0");
  const { ready, getCurrent, isDraftCurrent } = draft;
  const fail = (e: unknown) => { setFailed(true); setMessage(e instanceof Error ? e.message : "Local copy operation failed. Inspect saved local plans before continuing."); };
  useEffect(() => {
    if (!ready) return;
    const lifetime = epoch.current;
    const raw = new URL(window.location.href).searchParams.get(AUTHORING_QUERY);
    let alive = true;
    if (raw) queueMicrotask(() => { if (!alive) return; try { setRecover(decodeAuthoringContext(raw)); setMessage("A local editing operation was interrupted. Recover the exact saved candidate or cancel. Unsaved editor changes are not recoverable."); } catch (error) { fail(error); } });
    const moved = () => { lifetime.value++; setWork(null); setRecover(null); setFailed(true); setMessage("Return context changed. No diagram was attached. Inspect saved local plans before continuing."); };
    window.addEventListener("popstate", moved);
    return () => { alive = false; lifetime.value++; window.removeEventListener("popstate", moved); };
  }, [ready]);
  useEffect(() => {
    if (!work || !dirty) return;
    const editorUrl = window.location.href, editorState = window.history.state;
    const confirmDiscard = () => window.confirm("Leave local editing and discard unsaved diagram changes? Any saved candidate remains in Saved local plans.");
    const guard = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    const traverse = (e: PopStateEvent) => {
      if (confirmDiscard()) return;
      // popstate cannot be cancelled. The early root listener runs before router/association
      // listeners, so restoring this entry retains the mounted editor and its live edits.
      e.stopImmediatePropagation();
      window.history.pushState(editorState, "", editorUrl);
    };
    const navigate = (e: MouseEvent) => {
      const link = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || link.target === "_blank" || link.download || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      const destination = new URL(link.href, window.location.href);
      if (destination.pathname === window.location.pathname && destination.search === window.location.search) return;
      if (!confirmDiscard()) { e.preventDefault(); e.stopPropagation(); }
    };
    const releaseHistoryGuard = registerLocalHistoryGuard(traverse);
    window.addEventListener("beforeunload", guard); document.addEventListener("click", navigate, true);
    return () => { releaseHistoryGuard(); window.removeEventListener("beforeunload", guard); document.removeEventListener("click", navigate, true); };
  }, [work, dirty]);
  async function unchanged(context: LocalAuthoringContext) {
    if (!isDraftCurrent()) throw new Error("Another tab changed the browser text draft. Cancel and choose deliberate recovery; no text was overwritten.");
    await checkCurrentDocument(context, getCurrent());
  }
  async function run(operation: (token: number) => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try { await operation(epoch.current.value); } catch (error) { fail(error); } finally { lock.current = false; setBusy(false); }
  }
  function live(token: number) { if (token !== epoch.current.value) throw new Error("The editing context changed during the operation. Inspect the saved candidate; nothing was automatically attached."); }
  async function start(activityId: string, index: number | null) {
    await run(async (token) => {
      setFailed(false); setBackup(null); const before = structuredClone(getCurrent()), origin = await diagrams.prepareAuthoring(); live(token);
      if (!sameDocument(before, getCurrent()) || !isDraftCurrent()) throw new Error("The session changed while opening the editor.");
      const opened = await beginLocalAuthoring(origin, before, activityId, index); live(token); await unchanged(opened.context);
      returnReference(opened.context); setWork({ context: opened.context, initial: opened.initial, base: opened.package, view: "editor" });
      setRecover(null); setSeconds(String(opened.context.seconds)); setDirty(false);
      setMessage(index === null ? "Create a local diagram. Save a local copy before returning to the activity." : "You are editing a local copy. The imported scene and current attachment stay unchanged until acceptance.");
    });
  }
  async function save(scene: TacticalScene) {
    if (!work || failed) return;
    const captured = work;
    await run(async (token) => {
      await unchanged(captured.context); await exactSnapshot(repository, captured.context.origin);
      const previous = captured.context.candidate ? (await verifyLocalCandidate(repository, captured.context)).candidate : null;
      const pkg = candidatePackage(captured.base, previous?.package ?? null, captured.context, scene);
      live(token); await unchanged(captured.context);
      setBackup(pkg);
      const result = previous ? await repository.save(previous.documentId, previous.ownerVersion, pkg) : await repository.create(pkg);
      if (!result.ok) throw new Error(`${result.error.message} Saving is paused. A missing acknowledgement may still leave a discoverable saved plan; do not retry blindly.`);
      const context = { ...captured.context, candidate: snapshotRef(result.value) };
      // Keep acknowledged identity even if a late source conflict prevents returning. No source write here.
      live(token); returnReference(context); setWork({ ...captured, context, dirtyBaseline: structuredClone(scene) }); setRecover(context);
      await unchanged(context); await verifyLocalCandidate(repository, context);
      setBackup(null); setDirty(false); setMessage(`Local copy saved · revision ${result.value.package.scenes.filter((s) => s.id === context.sceneId).length}. The activity attachment is unchanged. Return to review it.`);
    });
  }
  async function review(recovery = false) {
    const context = recovery ? recover : work?.context;
    if (!context) return;
    if (!recovery && dirty && !window.confirm("Return to the last saved local copy? Unsaved editor changes will be discarded; the activity is unchanged.")) return;
    await run(async (token) => {
      await unchanged(context); const verified = await verifyLocalCandidate(repository, context); live(token); await unchanged(context);
      if (recovery) diagrams.reviewAuthoringOrigin(verified.origin);
      setWork({ context, initial: verified.scene, base: verified.candidate.package, view: "review" });
      setSeconds(String(context.seconds)); setDirty(false); setFailed(false); setRecover(null);
      setMessage("Review the exact saved local copy. Accept Diagram is the only action that changes this activity’s attachment.");
    });
  }
  async function accept() {
    if (!work || failed || work.view !== "review") return;
    const captured = work, time = seconds.trim() === "" ? NaN : Number(seconds);
    await run(async (token) => {
      await unchanged(captured.context); const verified = await verifyLocalCandidate(repository, captured.context);
      const before = structuredClone(getCurrent()), accepted = acceptedLocalPackage(before, verified.candidate.package, captured.context, verified.scene, time);
      live(token); await unchanged(captured.context);
      setBackup(accepted.package);
      const result = await repository.save(verified.origin.documentId, verified.origin.ownerVersion, accepted.package);
      if (!result.ok) throw new Error(`${result.error.message} Acceptance is paused; inspect the complete saved plan before any recovery.`);
      live(token);
      diagrams.adoptLocalSave(verified.origin, result.value, before, accepted.document);
      returnReference(null); setWork(null); setRecover(null); setDirty(false); setFailed(false); setBackup(null);
      setMessage("Local diagram accepted. Original scene revisions and unrelated coaching content are unchanged.");
    });
  }
  function cancel() {
    if (lock.current) return;
    if (dirty && !window.confirm("Cancel local editing and discard unsaved diagram changes? Any saved candidate remains in Saved local plans.")) return;
    epoch.current.value++; returnReference(null); setWork(null); setRecover(null); setDirty(false); setFailed(false); setBackup(null);
    setMessage("Local editing cancelled. No attachment was changed by cancellation. Saved candidates remain in Saved local plans; inspect their contents before deliberate recovery.");
  }
  function resume() { if (work && !busy && !failed) { setWork({ ...work, view: "editor" }); setDirty(false); setMessage("Editing the verified saved local copy. Save another revision before returning; the source attachment remains unchanged."); } }
  return { work, recover, message, busy, failed, dirty, setDirty, seconds, setSeconds, start, save, review, accept, cancel, resume, backup };
}
export type LocalAuthoringController = ReturnType<typeof useLocalAuthoring>;
