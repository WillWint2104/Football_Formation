"use client";

import { useDraggable } from "@dnd-kit/core";
import type { Player } from "@/lib/types";
import { cn } from "@/lib/utils";
import { getInitials, positionAvatarClasses } from "@/lib/player-display";

interface PlayerCardProps {
  player: Player;
  /** True when the player is already placed on the pitch (dimmed, non-draggable). */
  dimmed?: boolean;
  /** True when rendered inside a DragOverlay — no draggable wiring needed. */
  overlay?: boolean;
}

/**
 * A player card in the AvailableSquadBar. Draggable via @dnd-kit (id is
 * `player-{playerId}`). When dimmed (already placed on the pitch) draggable
 * is disabled. When rendered inside DragOverlay, the component is purely
 * presentational and shows a stronger shadow.
 */
export function PlayerCard({
  player,
  dimmed = false,
  overlay = false,
}: PlayerCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `player-${player.id}`,
    disabled: dimmed || overlay,
  });

  const interactive = !dimmed && !overlay;

  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      {...(overlay ? {} : attributes)}
      {...(overlay ? {} : listeners)}
      className={cn(
        "w-28 shrink-0 flex flex-col items-center gap-2 p-2 rounded-lg border bg-surface-container-lowest border-outline-variant",
        "select-none transition-shadow",
        dimmed && "opacity-40 cursor-not-allowed",
        interactive && "cursor-grab hover:shadow-ambient",
        isDragging && !overlay && "opacity-30",
        overlay && "shadow-overlay cursor-grabbing",
      )}
    >
      <div
        className={cn(
          "size-12 rounded-full inline-flex items-center justify-center font-mono text-body-md",
          positionAvatarClasses(player.position),
        )}
      >
        {getInitials(player.name)}
      </div>
      <div className="flex flex-col items-center w-full gap-0.5">
        <span className="font-mono text-data-numeral text-on-surface">
          #{player.jersey}
        </span>
        <span className="font-sans text-body-md text-on-surface truncate w-full text-center">
          {player.name}
        </span>
        <span className="font-mono text-label-caps uppercase px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface-variant">
          {player.position}
        </span>
      </div>
    </div>
  );
}
