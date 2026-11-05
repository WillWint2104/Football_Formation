"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { DesignerDocument } from "@/lib/designer/contract";
import { AUTHORING_QUERY, contentDigest } from "@/lib/designer/local-authoring";
import { DESIGNER_NAVIGATION_KEY, readDesignerNavigation, writeDesignerNavigation } from "@/lib/designer/navigation";

type View = "import" | "edit" | "overview" | "preview";
/** Tab-scoped navigation is separate from the draft and complete packages. Conflicts and return recovery take priority. */
export function useDesignerNavigation({ ready, checking, blocked, document, ownerId, ownerVersion, view, setView, selected, setSelected, selection, selectionVersion }: {
  ready: boolean; checking: boolean; blocked: boolean; document: DesignerDocument; ownerId: string | null; ownerVersion: number | null;
  view: View; setView: (view: View) => void; selected: string; setSelected: (id: string) => void; selection: RefObject<Map<string, number>>; selectionVersion: number;
}) {
  const restored = useRef(false), [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (!ready || checking || restored.current) return;
    let alive = true;
    void (async () => {
      if (blocked || new URL(window.location.href).searchParams.has(AUTHORING_QUERY)) return;
      const digest = await contentDigest(document), owner = ownerId && ownerVersion ? { id: ownerId, version: ownerVersion } : null;
      const remembered = readDesignerNavigation(sessionStorage.getItem(DESIGNER_NAVIGATION_KEY), document, digest, owner);
      if (!alive || !remembered) return;
      selection.current.clear(); remembered.diagrams.forEach((index, key) => selection.current.set(key, index));
      setSelected(remembered.activityId); setView(remembered.view);
    })().catch(() => { /* Missing/corrupt/quota-limited preferences cannot change session data. */ }).finally(() => {
      if (alive) { restored.current = true; setHydrated(true); }
    });
    return () => { alive = false; };
  }, [ready, checking, blocked, document, ownerId, ownerVersion, selection, setSelected, setView]);

  useEffect(() => {
    if (!hydrated || !ready || checking || blocked || (view !== "edit" && view !== "overview")) return;
    let alive = true;
    void contentDigest(document).then(digest => {
      if (alive) sessionStorage.setItem(DESIGNER_NAVIGATION_KEY, writeDesignerNavigation(document, digest, view, selected,
        ownerId && ownerVersion ? { id: ownerId, version: ownerVersion } : null, selection.current));
    }).catch(() => { /* Navigation preference failure must not poison an acknowledged session save. */ });
    return () => { alive = false; };
  }, [hydrated, ready, checking, blocked, document, ownerId, ownerVersion, view, selected, selection, selectionVersion]);
}
