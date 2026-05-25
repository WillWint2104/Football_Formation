"use client";

import type { RefObject } from "react";
import { Minimize2 } from "lucide-react";
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
 *   - inner aspect box: always 16:10, holds the pitch background image and
 *     slots. In fullscreen, sized via min() so it letterboxes/pillarboxes
 *     within the viewport.
 *
 * An exit-fullscreen button lives on the outer container so it stays usable
 * while fullscreen (the canvas header that hosts Expand is hidden in
 * fullscreen since it sits outside the fullscreen target).
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
      role="region"
      aria-label={`Tactical pitch — ${formation.name}`}
      className={cn(
        "relative",
        isFullscreen
          ? "w-screen h-screen flex items-center justify-center bg-black"
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
          "relative overflow-hidden",
          isFullscreen ? "rounded-lg" : "absolute inset-0",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/pitch-background.png"
          alt=""
          className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
        />
        <div className="absolute inset-0 z-10">
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
      </div>

      {isFullscreen && (
        <button
          type="button"
          onClick={onToggleFullscreen}
          aria-label="Exit fullscreen"
          className={cn(
            "absolute top-3 right-3 z-20",
            "inline-flex items-center justify-center size-9 rounded",
            "bg-tertiary-container/70 hover:bg-tertiary-container",
            "text-on-tertiary transition-colors",
          )}
        >
          <Minimize2 className="size-5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
