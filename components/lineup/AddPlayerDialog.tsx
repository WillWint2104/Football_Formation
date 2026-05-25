"use client";

import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { Player, Position } from "@/lib/types";

interface AddPlayerDialogProps {
  onAdd: (player: Player) => void;
}

const POSITIONS: Position[] = ["GK", "DEF", "MID", "FWD"];

type FormErrors = {
  name?: string;
  position?: string;
  jersey?: string;
};

/**
 * Dialog form for adding a custom player to the local squad state. Triggered by
 * the "+ Add Player" button in the AvailableSquadBar toolbar.
 *
 * Validation: name non-empty, position selected, jersey an integer 1–99.
 * On success: emits onAdd(player) with defaults (availability "available",
 * fitness 100, stats zeroed) and resets the form before closing the dialog.
 */
export function AddPlayerDialog({ onAdd }: AddPlayerDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [position, setPosition] = useState<Position | "">("");
  const [jersey, setJersey] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});

  function reset() {
    setName("");
    setPosition("");
    setJersey("");
    setErrors({});
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors: FormErrors = {};
    const trimmedName = name.trim();
    if (!trimmedName) nextErrors.name = "Name is required.";
    if (!position) nextErrors.position = "Pick a position.";
    const jerseyNum = Number(jersey);
    if (
      !Number.isInteger(jerseyNum) ||
      jerseyNum < 1 ||
      jerseyNum > 99
    ) {
      nextErrors.jersey = "Jersey must be an integer 1–99.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    onAdd({
      id: `custom-${Date.now()}`,
      name: trimmedName,
      jersey: jerseyNum,
      position: position as Position,
      nationality: "",
      contractStatus: "Custom",
      contractYear: new Date().getFullYear(),
      squadTier: "custom",
      availability: "available",
      fitness: 100,
      stats: { goals: 0, assists: 0, passAccuracy: 0, avgDistance: 0 },
    });

    reset();
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus />
        Add Player
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Player</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col gap-3"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-player-name">Name</Label>
            <Input
              id="add-player-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-invalid={Boolean(errors.name)}
              autoComplete="off"
            />
            {errors.name && (
              <p className="font-sans text-body-md text-error">{errors.name}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-player-position">Position</Label>
            <select
              id="add-player-position"
              value={position}
              onChange={(event) =>
                setPosition(event.target.value as Position | "")
              }
              aria-invalid={Boolean(errors.position)}
              className={cn(
                "h-8 rounded-lg border border-input bg-transparent px-2.5",
                "font-sans text-body-md text-on-surface",
                "outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50",
                "transition-colors",
              )}
            >
              <option value="">Select a position…</option>
              {POSITIONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            {errors.position && (
              <p className="font-sans text-body-md text-error">
                {errors.position}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-player-jersey">Jersey number</Label>
            <Input
              id="add-player-jersey"
              type="number"
              inputMode="numeric"
              min={1}
              max={99}
              value={jersey}
              onChange={(event) => setJersey(event.target.value)}
              aria-invalid={Boolean(errors.jersey)}
            />
            {errors.jersey && (
              <p className="font-sans text-body-md text-error">
                {errors.jersey}
              </p>
            )}
          </div>

          <DialogFooter>
            <DialogClose
              render={<Button type="button" variant="outline" />}
            >
              Cancel
            </DialogClose>
            <Button type="submit">Add to Squad</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
