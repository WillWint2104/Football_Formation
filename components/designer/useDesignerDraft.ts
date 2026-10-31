"use client";

import { useEffect, useRef, useState } from "react";
import { blankDesignerDocument, designerErrors, type DesignerDocument } from "@/lib/designer/contract";
import { decodeDraft, DESIGNER_DRAFT_KEY, encodeDraft } from "@/lib/designer/drafts";
import { verifyLogo } from "@/lib/designer/branding";

/** A bounded browser draft is independent from the authenticated coaching workspace. */
export function useDesignerDraft() {
  const [document, setDocument] = useState(blankDesignerDocument);
  const [ready, setReady] = useState(false);
  const [saveState, setSaveState] = useState("Checking this browser for a draft…");
  const current = useRef(document), edited = useRef(false), previous = useRef<string | null>(null);
  const flushPending = useRef<() => void>(() => undefined);

  // Client-side navigation does not emit pagehide/beforeunload. Flush before this route unmounts too.
  useEffect(() => () => { flushPending.current(); }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const stored = localStorage.getItem(DESIGNER_DRAFT_KEY); previous.current = stored;
        if (stored) {
          const draft = decodeDraft(stored);
          if (draft.document.branding.logo) await verifyLogo(draft.document.branding.logo);
          if (!alive) return;
          current.current = draft.document; setDocument(draft.document);
          setSaveState(`Draft recovered from this browser · ${new Date(draft.savedAt).toLocaleString()}`);
        } else if (alive) setSaveState("No browser draft yet. Changes will be saved here automatically.");
      } catch (error) {
        if (alive) setSaveState(`Browser draft unavailable: ${designerErrors(error).slice(0, 3).join(" ")}. Download JSON to keep your work.`);
      } finally { if (alive) setReady(true); }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!ready || !edited.current) return;
    function save(showStatus: boolean) {
      try {
        if (localStorage.getItem(DESIGNER_DRAFT_KEY) !== previous.current) throw new Error("Another tab changed this draft. Download your JSON before reopening the page");
        const text = encodeDraft(current.current); localStorage.setItem(DESIGNER_DRAFT_KEY, text); previous.current = text;
        if (showStatus) setSaveState(`Draft saved in this browser · ${new Date().toLocaleTimeString()}`);
      } catch (error) {
        if (showStatus) setSaveState(`Draft not saved: ${designerErrors(error).slice(0, 3).join(" ")}. Use Download JSON.`);
      }
    }
    const timer = setTimeout(() => save(true), 300);
    const flush = () => save(false);
    flushPending.current = flush;
    window.addEventListener("pagehide", flush); window.addEventListener("beforeunload", flush);
    return () => { clearTimeout(timer); window.removeEventListener("pagehide", flush); window.removeEventListener("beforeunload", flush); };
  }, [document, ready]);

  function update(value: DesignerDocument | ((document: DesignerDocument) => DesignerDocument)) {
    const next = typeof value === "function" ? value(current.current) : value;
    current.current = next; edited.current = true; setDocument(next); setSaveState("Saving browser draft…");
  }
  return { document, update, ready, saveState };
}
