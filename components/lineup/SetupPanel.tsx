"use client";

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface SetupPanelProps {
  /** Number of slots currently filled with a player. */
  slotsFilled: number;
  /** Total slot count for the active formation. */
  totalSlots: number;
}

/**
 * UI-only Setup panel surfaced when the canvas header's "Setup" tab is active.
 * No business logic is wired up yet — switches, notes, and formation select
 * are placeholders. Lineup Metrics is the only live value (slots filled).
 */
export function SetupPanel({ slotsFilled, totalSlots }: SetupPanelProps) {
  const [notes, setNotes] = useState("");
  const [gegenpressing, setGegenpressing] = useState(false);
  const [offsideTrap, setOffsideTrap] = useState(false);

  return (
    <div className="bg-surface-container-lowest rounded-lg border border-outline-variant p-4 transition-shadow hover:shadow-ambient flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <h3 className="font-mono text-label-caps uppercase text-on-surface-variant">
          Formation
        </h3>
        <Select defaultValue="442">
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="442">4-4-2</SelectItem>
          </SelectContent>
        </Select>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="font-mono text-label-caps uppercase text-on-surface-variant">
          Tactical Instructions
        </h3>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label
              htmlFor="gegenpressing-switch"
              className="font-sans text-body-md text-on-surface"
            >
              Gegenpressing
            </Label>
            <Switch
              id="gegenpressing-switch"
              checked={gegenpressing}
              onCheckedChange={setGegenpressing}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label
              htmlFor="offside-trap-switch"
              className="font-sans text-body-md text-on-surface"
            >
              Offside Trap
            </Label>
            <Switch
              id="offside-trap-switch"
              checked={offsideTrap}
              onCheckedChange={setOffsideTrap}
            />
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <Label
          htmlFor="tactical-notes"
          className="font-mono text-label-caps uppercase text-on-surface-variant"
        >
          Tactical Notes
        </Label>
        <Textarea
          id="tactical-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={4}
          placeholder="High line, quick transitions..."
          className="resize-y"
        />
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="font-mono text-label-caps uppercase text-on-surface-variant">
          Lineup Metrics
        </h3>
        <div className="bg-surface-container-low rounded p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between font-mono text-body-md">
            <span className="text-on-surface-variant">Cohesion Index</span>
            <span className="text-on-surface">88%</span>
          </div>
          <div className="flex items-center justify-between font-mono text-body-md">
            <span className="text-on-surface-variant">Slots Filled</span>
            <span className="text-on-surface">
              {slotsFilled} / {totalSlots}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
