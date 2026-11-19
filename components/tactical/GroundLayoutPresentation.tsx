"use client";

import { useState, type ReactNode } from "react";
import type { TacticalScene, TrainingArea } from "@/lib/domain/tactical-scene";
import type { DrawingOptions } from "@/lib/tactical/drawing";
import type { InventoryItem } from "@/lib/tactical/grid-plan";
import { presentationCategory, type PresentationCategory } from "@/lib/tactical/presentation-category";
import { TrainingGridPlanner } from "./TrainingGridPlanner";

/** Read-only grid branch extracted from the pilot; pitch scenes keep their existing SVG. */
export function GroundLayoutPresentation({ scene, identity, seconds, savedSeconds, stage, options, equipment, children }: {
  scene: TacticalScene; identity: string; seconds: number; savedSeconds: number; stage: string;
  options: Pick<DrawingOptions, "authoredArea">; equipment: readonly InventoryItem[];
  children: (overlay?: ReactNode, caption?: string) => ReactNode;
}) {
  const [choice, setChoice] = useState<{ identity: string; category?: PresentationCategory }>();
  const category = presentationCategory(scene.context, choice?.identity === identity ? choice.category : undefined);
  const area: TrainingArea | undefined = options.authoredArea ?? (scene.context?.kind === "neutral" && scene.context.boundary
    ? { origin:{x:0,y:0}, length:scene.field.length, width:scene.field.width } : undefined);
  return <TrainingGridPlanner active={category === "grid"} identity={identity} scene={scene} seconds={seconds}
    savedSeconds={savedSeconds} stage={stage} area={area} equipment={equipment}>
    {(controls, overlay, caption) => <>
      {(controls || !scene.context) && <div className="ground-layout-tools">
        {!scene.context && <label className="ground-layout-designation"><span className="sr-only">Scene presentation</span>
          <select aria-label="Scene presentation" value={category ?? ""}
            onChange={event => setChoice({identity,category:event.target.value as PresentationCategory || undefined})}>
            <option value="">Choose scene presentation…</option>
            <option value="grid">Training grid</option><option value="pitch">Pitch context</option>
          </select>
        </label>}
        {controls}
      </div>}
      {children(overlay, caption)}
    </>}
  </TrainingGridPlanner>;
}
