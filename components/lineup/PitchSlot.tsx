"use client";

import {
  useDndContext,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import { GripVertical, Plus, X } from "lucide-react";
import type { Player } from "@/lib/types";
import { cn } from "@/lib/utils";
import { getInitials, positionAvatarClasses } from "@/lib/player-display";

interface PitchSlotProps {
  /** Stable id from the formation (e.g. "lcb", "cdm"). */
  slotId: string;
  /** Display label shown beneath the slot (e.g. "CB", "CDM"). */
  label: string;
  /** Horizontal position as a percentage of pitch width (0-100). */
  x: number;
  /** Vertical position as a percentage of pitch height (0-100). */
  y: number;
  /** When set, the slot renders the filled-token visual rather than the empty placeholder. */
  player?: Player;
  /** Click handler for the × remove button on filled slots. */
  onRemove?: (slotId: string) => void;
}

/**
 * A single pitch slot. Always registered as a droppable (`slot-{slotId}`) so
 * players can be dropped onto filled slots to replace the occupant, not just
 * empty ones. The grip handle in the top-left is a separate draggable
 * (`slot-reposition-{slotId}`) used to nudge the slot off its formation default.
 *
 * Variants:
 *  - empty: dashed circle + "+" icon, dashed border highlights on player drag-over
 *  - filled: solid position-colored circle with cyan ring + glow, surname pill below
 *
 * The drop-over highlight is suppressed when the active drag is a slot reposition
 * rather than a player drop (`useDndContext` provides the active drag id).
 */
export function PitchSlot({
  slotId,
  label,
  x,
  y,
  player,
  onRemove,
}: PitchSlotProps) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `slot-${slotId}`,
  });
  const {
    setNodeRef: setDragRef,
    listeners: dragListeners,
    attributes: dragAttributes,
    transform: dragTransform,
    isDragging,
  } = useDraggable({ id: `slot-reposition-${slotId}` });

  // Only show the drop-over highlight when a player is being dragged, not when
  // a slot is being repositioned (active.id distinguishes the two).
  const dnd = useDndContext();
  const activeIdStr = dnd.active?.id != null ? String(dnd.active.id) : null;
  const activeIsPlayer = activeIdStr?.startsWith("player-") ?? false;
  const showDropHover = isOver && activeIsPlayer;

  const surname =
    player !== undefined
      ? (() => {
          const tokens = player.name.split(/\s+/).filter(Boolean);
          return tokens.length > 1 ? tokens[tokens.length - 1] : player.name;
        })()
      : "";

  return (
    <div
      ref={setDropRef}
      style={{
        left: `${x}%`,
        top: `${y}%`,
        transform: dragTransform
          ? `translate(-50%, -50%) translate3d(${dragTransform.x}px, ${dragTransform.y}px, 0)`
          : "translate(-50%, -50%)",
        zIndex: isDragging ? 50 : undefined,
      }}
      className="group absolute flex flex-col items-center gap-1.5 select-none"
    >
      <div className="relative">
        {player ? (
          <div
            aria-label={`${player.name} (${player.position})`}
            className={cn(
              "size-14 rounded-full inline-flex items-center justify-center",
              "ring-2 ring-secondary-container shadow-token-glow",
              "font-mono text-body-md transition-transform",
              positionAvatarClasses(player.position),
              showDropHover && "scale-110",
            )}
          >
            {getInitials(player.name)}
          </div>
        ) : (
          <div
            aria-label={`Empty slot: ${label}`}
            className={cn(
              "size-14 rounded-full border-2 border-dashed bg-tertiary/40",
              "flex items-center justify-center transition-colors",
              showDropHover
                ? "border-secondary-container text-secondary-container"
                : "border-on-tertiary-container/50 text-on-tertiary-container/70",
            )}
          >
            <Plus className="size-5" aria-hidden="true" />
          </div>
        )}

        {/* Reposition handle — top-left, visible on hover/focus */}
        <button
          type="button"
          ref={setDragRef}
          {...dragListeners}
          {...dragAttributes}
          aria-label={`Move ${label} slot`}
          className={cn(
            "absolute -top-2 -left-2 size-5 rounded-full",
            "inline-flex items-center justify-center",
            "bg-tertiary-container text-on-tertiary shadow-ambient",
            "opacity-0 group-hover:opacity-100 focus:opacity-100",
            "transition-opacity",
            "cursor-grab active:cursor-grabbing",
          )}
        >
          <GripVertical className="size-3" aria-hidden="true" />
        </button>

        {/* Remove × — top-right, only when filled, only on hover/focus */}
        {player && onRemove && (
          <button
            type="button"
            onClick={() => onRemove(slotId)}
            onPointerDown={(event) => event.stopPropagation()}
            aria-label={`Remove ${player.name} from ${label}`}
            className={cn(
              "absolute -top-2 -right-2 size-5 rounded-full",
              "inline-flex items-center justify-center",
              "bg-error text-on-error shadow-ambient",
              "opacity-0 group-hover:opacity-100 focus:opacity-100",
              "transition-opacity",
            )}
          >
            <X className="size-3" aria-hidden="true" />
          </button>
        )}
      </div>

      {player ? (
        <span className="px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container font-mono text-label-caps uppercase whitespace-nowrap">
          {surname}
        </span>
      ) : (
        <span className="font-mono text-label-caps uppercase text-on-tertiary-container">
          {label}
        </span>
      )}
    </div>
  );
}
