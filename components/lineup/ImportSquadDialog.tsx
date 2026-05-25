"use client";

import { useState, type FormEvent } from "react";
import { Braces } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Player, Position } from "@/lib/types";

interface ImportSquadDialogProps {
  onImport: (players: Player[]) => void;
}

const VALID_POSITIONS: ReadonlySet<string> = new Set([
  "GK",
  "DEF",
  "MID",
  "FWD",
]);

const PLACEHOLDER = `[
  {"name":"Liam Carter","num":1,"pos":"GK"},
  {"name":"Ethan Brooks","num":2,"pos":"DEF"}
]`;

/**
 * Dialog form for bulk-importing players from a minimal JSON shape.
 *
 * Validation is atomic — if any entry fails, the whole import aborts and an
 * inline error is shown. Successful imports are appended (not replaced) to the
 * existing squad state, dialog closes, textarea clears.
 *
 * Per-entry shape (intentionally minimal):
 *   { name: string (non-empty), num: integer 1–99, pos: GK|DEF|MID|FWD }
 *
 * Each imported entry is hydrated into a full Player with sensible defaults
 * (availability "available", fitness 100, zeroed stats, etc.) before being
 * handed to the parent via onImport.
 */
export function ImportSquadDialog({ onImport }: ImportSquadDialogProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setText("");
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    // 1. Parse
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (cause) {
      const msg = cause instanceof Error ? cause.message : "parse failed";
      setError(`Invalid JSON: ${msg}`);
      return;
    }

    // 2. Top-level array check
    if (!Array.isArray(parsed)) {
      setError("Invalid JSON: top-level value must be an array of entries.");
      return;
    }

    // 3. Per-entry validation (atomic — fail entirely on first bad entry)
    const players: Player[] = [];
    const year = new Date().getFullYear();
    const stamp = Date.now();

    for (let i = 0; i < parsed.length; i++) {
      const raw = parsed[i];
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        setError(`Entry #${i + 1} invalid: must be a JSON object.`);
        return;
      }
      const entry = raw as { name?: unknown; num?: unknown; pos?: unknown };

      if (typeof entry.name !== "string" || entry.name.trim().length === 0) {
        setError(`Entry #${i + 1} invalid: name must be a non-empty string.`);
        return;
      }
      if (
        typeof entry.num !== "number" ||
        !Number.isInteger(entry.num) ||
        entry.num < 1 ||
        entry.num > 99
      ) {
        setError(`Entry #${i + 1} invalid: num must be an integer 1–99.`);
        return;
      }
      if (typeof entry.pos !== "string" || !VALID_POSITIONS.has(entry.pos)) {
        setError(
          `Entry #${i + 1} invalid: pos must be one of GK, DEF, MID, FWD.`,
        );
        return;
      }

      players.push({
        id: `imported-${stamp}-${i}`,
        name: entry.name.trim(),
        jersey: entry.num,
        position: entry.pos as Position,
        nationality: "",
        contractStatus: "Imported",
        contractYear: year,
        squadTier: "senior",
        availability: "available",
        fitness: 100,
        stats: { goals: 0, assists: 0, passAccuracy: 0, avgDistance: 0 },
      });
    }

    onImport(players);
    reset();
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button
            size="icon-sm"
            variant="ghost"
            className="border border-outline"
            title="Import squad from JSON"
          />
        }
      >
        <Braces />
        <span className="sr-only">Import squad from JSON</span>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Squad from JSON</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Textarea
            id="import-squad-json"
            aria-label="Squad JSON input: array of entries with name, num, and pos"
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={10}
            placeholder={PLACEHOLDER}
            spellCheck={false}
            className="font-mono text-sm resize-y"
          />
          <p className="font-sans text-body-md text-on-surface-variant">
            Each entry: name (string), num (1–99), pos (GK/DEF/MID/FWD)
          </p>
          {error && (
            <p
              role="alert"
              className="font-sans text-body-md text-error whitespace-pre-wrap"
            >
              {error}
            </p>
          )}
          <DialogFooter>
            <DialogClose
              render={
                <Button
                  type="button"
                  variant="ghost"
                  className="border border-outline"
                />
              }
            >
              Cancel
            </DialogClose>
            <Button type="submit">Import</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
