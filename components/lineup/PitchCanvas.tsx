"use client";

import type { RefObject } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import type { Formation, Player } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PitchSlot } from "./PitchSlot";

interface PitchCanvasProps {
  formation: Formation;
  /** Map of slotId -> placed Player. Slots not in this map render empty. */
  assignedPlayers: Record<string, Player>;
  /** Per-slot position overrides (percentage coords). Falls back to formation defaults. */
  slotOverrides: Record<string, { x: number; y: number }>;
  /** Click handler for the × remove button on filled slots. */
  onRemovePlayer: (slotId: string) => void;
  /** Fullscreen toggle (parent owns the state). */
  onToggleFullscreen: () => void;
  isFullscreen: boolean;
  /** Ref attached to the OUTER container — this is the element that goes fullscreen. */
  containerRef?: RefObject<HTMLDivElement | null>;
  /** Ref attached to the INNER 16:10 aspect box — used by parent for slot-reposition percentage math. */
  innerRef?: RefObject<HTMLDivElement | null>;
}

/**
 * Horizontal football pitch (16:10 aspect). Two-layer structure:
 *   - outer container: the fullscreen target. Normally 16:10 itself; in
 *     fullscreen, fills the viewport and centers the inner box.
 *   - inner aspect box: always 16:10, holds the SVG markings and slots. In
 *     fullscreen, sized via min() so it letterboxes/pillarboxes within the
 *     viewport.
 *
 * The fullscreen toggle button lives on the outer container so it remains
 * inside the fullscreen element and stays usable in fullscreen mode.
 */
export function PitchCanvas({
  formation,
  assignedPlayers,
  slotOverrides,
  onRemovePlayer,
  onToggleFullscreen,
  isFullscreen,
  containerRef,
  innerRef,
}: PitchCanvasProps) {
  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={`Tactical pitch — ${formation.name}`}
      className={cn(
        "relative bg-tertiary",
        isFullscreen
          ? "w-screen h-screen flex items-center justify-center"
          : "w-full aspect-[16/10] rounded-lg overflow-hidden shadow-ambient",
      )}
    >
      <div
        ref={innerRef}
        style={
          isFullscreen
            ? {
                width: "min(100%, calc(100vh * 16 / 10))",
                height: "min(100%, calc(100vw * 10 / 16))",
              }
            : undefined
        }
        className={cn(
          "relative bg-tertiary overflow-hidden",
          isFullscreen ? "rounded-lg" : "absolute inset-0",
        )}
      >
        <PitchMarkings />
        {formation.slots.map((slot) => {
          const override = slotOverrides[slot.id];
          const x = override?.x ?? slot.x;
          const y = override?.y ?? slot.y;
          return (
            <PitchSlot
              key={slot.id}
              slotId={slot.id}
              label={slot.label}
              x={x}
              y={y}
              player={assignedPlayers[slot.id]}
              onRemove={onRemovePlayer}
            />
          );
        })}
      </div>

      <button
        type="button"
        onClick={onToggleFullscreen}
        aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        className={cn(
          "absolute top-3 right-3 z-10",
          "inline-flex items-center justify-center size-9 rounded",
          "bg-tertiary-container/70 hover:bg-tertiary-container",
          "text-on-tertiary transition-colors",
        )}
      >
        {isFullscreen ? (
          <Minimize2 className="size-5" aria-hidden="true" />
        ) : (
          <Maximize2 className="size-5" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

/**
 * Pitch line work as an SVG overlay. Uses currentColor + opacity so the stroke
 * color comes from Tailwind's text-* utility on the SVG element, keeping the
 * design-token contract intact (no hardcoded hex).
 *
 * The viewBox is 160 × 100 to match the container's 16:10 aspect ratio; with
 * preserveAspectRatio="xMidYMid meet" circles render as actual circles rather
 * than ellipses.
 */
function PitchMarkings() {
  return (
    <svg
      aria-hidden="true"
      className="absolute inset-0 h-full w-full text-on-tertiary-container pointer-events-none"
      viewBox="0 0 160 100"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <pattern
          id="pitch-grid"
          x="0"
          y="0"
          width="10"
          height="10"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 10 0 L 0 0 L 0 10"
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.07"
            strokeWidth="0.3"
          />
        </pattern>
      </defs>
      <rect width="160" height="100" fill="url(#pitch-grid)" />

      <g
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.45"
        strokeWidth="0.4"
      >
        <rect x="0.2" y="0.2" width="159.6" height="99.6" />
        <line x1="80" y1="0.2" x2="80" y2="99.8" />
        <circle cx="80" cy="50" r="12" />
        <rect x="0" y="25" width="20" height="50" />
        <rect x="0" y="37.5" width="8" height="25" />
        <rect x="140" y="25" width="20" height="50" />
        <rect x="152" y="37.5" width="8" height="25" />
        <path d="M 20 39.13 A 13.5 13.5 0 0 1 20 60.87" />
        <path d="M 140 39.13 A 13.5 13.5 0 0 0 140 60.87" />
        <path d="M 2 0 A 2 2 0 0 1 0 2" />
        <path d="M 158 0 A 2 2 0 0 0 160 2" />
        <path d="M 160 98 A 2 2 0 0 1 158 100" />
        <path d="M 0 98 A 2 2 0 0 0 2 100" />
      </g>

      <g fill="currentColor" fillOpacity="0.45">
        <circle cx="80" cy="50" r="0.7" />
        <circle cx="12" cy="50" r="0.7" />
        <circle cx="148" cy="50" r="0.7" />
      </g>
    </svg>
  );
}
