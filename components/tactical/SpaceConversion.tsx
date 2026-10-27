"use client";

import { useState } from "react";
import type { FieldContext, TacticalScene } from "@/lib/domain/tactical-scene";
import { contextArea } from "@/lib/tactical/context";
import { convertSpace } from "@/lib/tactical/authoring";

/** Show the translation before an explicit conversion; never infer a new physical location for legacy data. */
export function SpaceConversion({ scene, edit, onFrame }: { scene: TacticalScene; edit: (scene: TacticalScene) => void; onFrame: () => void }) {
  const area = contextArea(scene), toPitch = scene.context?.kind === "neutral";
  const [origin, setOrigin] = useState({ x: toPitch ? 35 : area.origin.x, y: toPitch ? 20 : area.origin.y }), [error, setError] = useState("");
  return <details><summary>Convert coordinate space</summary><p className="calendar-muted">Explicit conversion translates every object, path and overlay. Undo restores the original; saved revisions remain intact.</p>
    <form onSubmit={(e) => { e.preventDefault();
      const field = toPitch ? { length: 105, width: 68 } : { length: area.length, width: area.width };
      const context: FieldContext = toPitch ? { kind: "pitch", region: "custom", attack: "positive-x", area: { origin, length: scene.field.length, width: scene.field.width } } : { kind: "neutral", boundary: true };
      try { const next = convertSpace(scene, origin, field, context, toPitch); edit(next); onFrame(); setError(""); }
      catch { setError("Conversion rejected. Keep the proposed area within the 105 × 68 m parent pitch and all translated geometry within coordinate limits."); }
    }}><div className="editor-row"><label>{toPitch ? "Place at pitch X" : "Subtract world X"}<input aria-label="Conversion X" type="number" step="any" value={origin.x} onChange={(e) => setOrigin({ ...origin, x: Number(e.target.value) })} required /></label><label>{toPitch ? "Place at pitch Y" : "Subtract world Y"}<input aria-label="Conversion Y" type="number" step="any" value={origin.y} onChange={(e) => setOrigin({ ...origin, y: Number(e.target.value) })} required /></label></div>
      <p className="calendar-muted" aria-live="polite">Preview: translate {scene.entities.length} anchors and every stage by ({toPitch ? origin.x : -origin.x}, {toPitch ? origin.y : -origin.y}) m. {toPitch ? `${scene.field.length} × ${scene.field.width} m on a 105 × 68 m pitch` : `${area.length} × ${area.width} m local area`}. Distances remain unchanged.</p>
      <button>{toPitch ? "Convert to physical pitch" : "Convert to local training space"}</button>
    </form>{error && <p role="alert">{error}</p>}
  </details>;
}
