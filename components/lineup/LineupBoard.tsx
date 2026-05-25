"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Maximize2, PlayCircle, RotateCcw, SlidersHorizontal, Users } from "lucide-react";
import type { Formation, Player } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PitchCanvas } from "./PitchCanvas";
import { AvailableSquadBar } from "./AvailableSquadBar";
import { PlayerCard } from "./PlayerCard";
import { SetupPanel } from "./SetupPanel";

interface LineupBoardProps {
  formation: Formation;
}

type SlotPosition = { x: number; y: number };

/**
 * Stateful orchestrator for the lineup builder. Owns:
 *   - `squad`: locally-managed player list (built via the "+ Add Player" dialog)
 *   - `assignments`: { slotId -> playerId } map of placed players
 *   - `slotOverrides`: { slotId -> {x, y} } per-slot position overrides
 *   - `activeId`: the currently dragging item (player or slot-reposition)
 *   - `isFullscreen`: mirrored browser fullscreen state
 *
 * The squad starts empty; the roster from `data/players.json` is loaded at the
 * page level for future wiring but not pre-populated here yet.
 */
export function LineupBoard({ formation }: LineupBoardProps) {
  const [squad, setSquad] = useState<Player[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [slotOverrides, setSlotOverrides] = useState<
    Record<string, SlotPosition>
  >({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activePanel, setActivePanel] = useState<"squad" | "setup">("squad");
  const [toast, setToast] = useState<string | null>(null);

  const pitchContainerRef = useRef<HTMLDivElement>(null);
  const pitchInnerRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  useEffect(() => {
    const handleChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleChange);
    };
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {
        /* user-agent may reject; ignore */
      });
    } else {
      pitchContainerRef.current?.requestFullscreen().catch(() => {
        /* user-agent may reject; ignore */
      });
    }
  }, []);

  const playerById = useMemo(() => {
    const map = new Map<string, Player>();
    for (const player of squad) {
      map.set(player.id, player);
    }
    return map;
  }, [squad]);

  const assignedPlayers = useMemo(() => {
    const result: Record<string, Player> = {};
    for (const [slotId, playerId] of Object.entries(assignments)) {
      const player = playerById.get(playerId);
      if (player) result[slotId] = player;
    }
    return result;
  }, [assignments, playerById]);

  const placedIds = useMemo(
    () => new Set(Object.values(assignments)),
    [assignments],
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      const { active, over, delta } = event;
      const activeIdStr = String(active.id);

      // -- Slot repositioning ---------------------------------------------------
      if (activeIdStr.startsWith("slot-reposition-")) {
        const slotId = activeIdStr.replace(/^slot-reposition-/, "");
        const rect = pitchInnerRef.current?.getBoundingClientRect();
        if (!rect || rect.width === 0 || rect.height === 0) return;

        const formationSlot = formation.slots.find((s) => s.id === slotId);
        if (!formationSlot) return;

        const currentX = slotOverrides[slotId]?.x ?? formationSlot.x;
        const currentY = slotOverrides[slotId]?.y ?? formationSlot.y;
        const nextX = currentX + (delta.x / rect.width) * 100;
        const nextY = currentY + (delta.y / rect.height) * 100;

        setSlotOverrides((prev) => ({
          ...prev,
          [slotId]: {
            x: Math.max(0, Math.min(100, nextX)),
            y: Math.max(0, Math.min(100, nextY)),
          },
        }));
        return;
      }

      // -- Player drop on slot --------------------------------------------------
      if (activeIdStr.startsWith("player-") && over) {
        const playerId = activeIdStr.replace(/^player-/, "");
        const slotId = String(over.id).replace(/^slot-/, "");

        setAssignments((prev) => {
          const next: Record<string, string> = {};
          for (const [s, p] of Object.entries(prev)) {
            if (p !== playerId) next[s] = p;
          }
          next[slotId] = playerId;
          return next;
        });
      }
    },
    [formation, slotOverrides],
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
  }, []);

  const handleRemovePlayer = useCallback((slotId: string) => {
    setAssignments((prev) => {
      const next = { ...prev };
      delete next[slotId];
      return next;
    });
  }, []);

  const handleResetSlotPositions = useCallback(() => {
    setSlotOverrides({});
  }, []);

  const handleAddPlayer = useCallback((player: Player) => {
    setSquad((prev) => [...prev, player]);
  }, []);

  const handleImportPlayers = useCallback((batch: Player[]) => {
    setSquad((prev) => [...prev, ...batch]);
  }, []);

  const handlePresent = useCallback(() => {
    console.log("Present mode — coming soon");
    setToast("Present mode coming in a future release.");
  }, []);

  useEffect(() => {
    if (toast === null) return;
    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const activePlayer =
    activeId !== null && activeId.startsWith("player-")
      ? (playerById.get(activeId.replace(/^player-/, "")) ?? null)
      : null;

  const hasOverrides = Object.keys(slotOverrides).length > 0;
  const slotsFilled = Object.keys(assignments).length;
  const totalSlots = formation.slots.length;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 bg-surface-container-lowest rounded-lg border border-outline-variant p-3">
          <div className="justify-self-start">
            <h2 className="font-display text-headline-sm text-on-surface">
              Tactical Canvas
            </h2>
          </div>
          <div className="justify-self-center flex items-center gap-2">
            <Button variant="default" size="sm" onClick={handlePresent}>
              <PlayCircle />
              <span>Present</span>
            </Button>
            <div
              role="tablist"
              aria-label="Right panel"
              className="inline-flex items-center gap-1"
            >
              <Button
                role="tab"
                aria-selected={activePanel === "squad"}
                variant={activePanel === "squad" ? "default" : "outline"}
                size="sm"
                onClick={() => setActivePanel("squad")}
              >
                <Users />
                <span>Squad</span>
              </Button>
              <Button
                role="tab"
                aria-selected={activePanel === "setup"}
                variant={activePanel === "setup" ? "default" : "outline"}
                size="sm"
                onClick={() => setActivePanel("setup")}
              >
                <SlidersHorizontal />
                <span>Setup</span>
              </Button>
            </div>
          </div>
          <div className="justify-self-end">
            <Button
              variant="ghost"
              size="icon-sm"
              className="border border-outline"
              onClick={toggleFullscreen}
              aria-label="Expand canvas"
            >
              <Maximize2 />
            </Button>
          </div>
        </div>
        <PitchCanvas
          formation={formation}
          assignedPlayers={assignedPlayers}
          slotOverrides={slotOverrides}
          onRemovePlayer={handleRemovePlayer}
          onToggleFullscreen={toggleFullscreen}
          isFullscreen={isFullscreen}
          containerRef={pitchContainerRef}
          innerRef={pitchInnerRef}
        />
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="border border-outline"
            onClick={handleResetSlotPositions}
            disabled={!hasOverrides}
          >
            <RotateCcw />
            <span className="font-mono text-label-caps uppercase">
              Reset Positions
            </span>
          </Button>
        </div>
        {activePanel === "squad" ? (
          <AvailableSquadBar
            players={squad}
            placedIds={placedIds}
            onAddPlayer={handleAddPlayer}
            onImportPlayers={handleImportPlayers}
          />
        ) : (
          <SetupPanel slotsFilled={slotsFilled} totalSlots={totalSlots} />
        )}
      </div>
      <DragOverlay>
        {activePlayer ? <PlayerCard player={activePlayer} overlay /> : null}
      </DragOverlay>
      {toast !== null && (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "fixed bottom-6 right-6 z-50",
            "bg-on-surface text-surface rounded shadow-overlay",
            "font-sans text-body-md px-4 py-3",
          )}
        >
          {toast}
        </div>
      )}
    </DndContext>
  );
}
