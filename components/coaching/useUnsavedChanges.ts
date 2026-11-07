"use client";

import { useEffect } from "react";
import { useCoaching } from "./CoachingProvider";
import { registerLocalHistoryGuard } from "@/lib/designer/local-history-guard";

/** Warn before document exits or link navigation would discard an editor's unsaved draft. */
export function useUnsavedChanges(dirty: boolean) {
  const { markDirty } = useCoaching();
  useEffect(() => { markDirty(dirty); return () => markDirty(false); }, [dirty, markDirty]);
  useEffect(() => {
    if (!dirty) return;
    const editorUrl = window.location.href, editorState = window.history.state;
    const releaseHistoryGuard = registerLocalHistoryGuard((event) => {
      if (window.confirm("Discard unsaved changes and leave this editor?")) return;
      event.stopImmediatePropagation();
      window.history.pushState(editorState, "", editorUrl);
    });
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.href === window.location.href || anchor.hash && anchor.pathname === window.location.pathname) return;
      if (!window.confirm("Discard unsaved changes and leave this editor?")) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", unload); document.addEventListener("click", click, true);
    return () => { releaseHistoryGuard(); window.removeEventListener("beforeunload", unload); document.removeEventListener("click", click, true); };
  }, [dirty]);
}
