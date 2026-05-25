"use client";

import { useState } from "react";
import type { Player, Position } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PlayerCard } from "./PlayerCard";
import { AddPlayerDialog } from "./AddPlayerDialog";
import { ImportSquadDialog } from "./ImportSquadDialog";

type FilterValue = "ALL" | Position;

const FILTERS: readonly FilterValue[] = ["ALL", "GK", "DEF", "MID", "FWD"];

interface AvailableSquadBarProps {
  players: Player[];
  /** Set of player IDs already placed on the pitch; rendered dimmed and non-draggable. */
  placedIds: ReadonlySet<string>;
  /** Add a single custom player (invoked by AddPlayerDialog). */
  onAddPlayer: (player: Player) => void;
  /** Append a batch of imported players (invoked by ImportSquadDialog). */
  onImportPlayers: (players: Player[]) => void;
}

/**
 * The horizontally-scrolling bar below the pitch listing every squad player as
 * a draggable PlayerCard. Toolbar at top hosts the Import-JSON icon and the
 * "+ Add Player" button. A row of position filter chips sits beneath the
 * toolbar; the active chip filters the visible cards. Empty squad → centered
 * call-to-action; squad non-empty but filter matches none → "no players match"
 * message.
 */
export function AvailableSquadBar({
  players,
  placedIds,
  onAddPlayer,
  onImportPlayers,
}: AvailableSquadBarProps) {
  const [activeFilter, setActiveFilter] = useState<FilterValue>("ALL");

  const filtered =
    activeFilter === "ALL"
      ? players
      : players.filter((p) => p.position === activeFilter);

  const squadEmpty = players.length === 0;
  const filterEmpty = !squadEmpty && filtered.length === 0;

  return (
    <div className="bg-surface-container-lowest rounded-lg border border-outline-variant shadow-ambient p-4">
      <div className="flex items-center justify-between mb-3 gap-3">
        <div className="font-mono text-label-caps uppercase text-on-surface-variant">
          Available Squad
        </div>
        <div className="flex items-center gap-2">
          <ImportSquadDialog onImport={onImportPlayers} />
          <AddPlayerDialog onAdd={onAddPlayer} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {FILTERS.map((filter) => {
          const isActive = activeFilter === filter;
          return (
            <button
              key={filter}
              type="button"
              onClick={() => setActiveFilter(filter)}
              aria-pressed={isActive}
              className={cn(
                "rounded-full px-3 py-1 font-mono text-label-caps uppercase",
                "transition-colors",
                isActive
                  ? "bg-primary text-on-primary"
                  : "bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface",
              )}
            >
              {filter}
            </button>
          );
        })}
      </div>

      {squadEmpty ? (
        <div className="flex items-center justify-center min-h-32 px-4 text-center font-sans text-body-md text-on-surface-variant">
          No players yet. Tap + to add, or import JSON.
        </div>
      ) : filterEmpty ? (
        <div className="flex items-center justify-center min-h-32 px-4 text-center font-sans text-body-md text-on-surface-variant">
          No players match this filter.
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {filtered.map((player) => (
            <PlayerCard
              key={player.id}
              player={player}
              dimmed={placedIds.has(player.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
