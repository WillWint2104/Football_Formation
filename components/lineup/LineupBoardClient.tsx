"use client";

import dynamic from "next/dynamic";

/**
 * Client-side wrapper that defers loading of LineupBoard until after hydration.
 *
 * Why: @dnd-kit assigns aria-describedby IDs that differ between server and
 * client renders, which produces a hydration mismatch warning. Disabling SSR
 * for this subtree sidesteps the mismatch.
 *
 * Next 16 requires `ssr: false` to live in a Client Component, so the dynamic
 * import is wrapped here rather than inline in the server page.
 */
const LineupBoard = dynamic(
  () => import("./LineupBoard").then((mod) => mod.LineupBoard),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-on-surface-variant">Loading tactical canvas…</p>
      </div>
    ),
  },
);

export default LineupBoard;
