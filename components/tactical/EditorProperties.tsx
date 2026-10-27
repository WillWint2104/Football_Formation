"use client";

import type { TacticalScene } from "@/lib/domain/tactical-scene";
import { contextArea, deliveryLocation } from "@/lib/tactical/context";
import { moveObjects } from "@/lib/tactical/authoring";
import { SpaceConversion } from "./SpaceConversion";
import { tacticalPalette } from "@/lib/tactical/palette";
import { useState } from "react";

type Props = { scene: TacticalScene; selected: string[]; mutate: (fn: (draft: TacticalScene) => void) => void; edit: (scene: TacticalScene) => void; onFrame: () => void };
/** Context-specific properties share the existing domain contracts; camera controls never enter this component. */
export function EditorProperties({ scene, selected, mutate, edit, onFrame }: Props) {
  const [error, setError] = useState("");
  const entity = selected.length === 1 ? scene.entities.find((e) => `entity:${e.id}` === selected[0]) : undefined;
  const track = selected.length === 1 ? scene.stages[0]?.tracks.find((t) => t.kind === "annotation" && `annotation:${t.id}` === selected[0]) : undefined;
  const annotation = track?.kind === "annotation" ? track.annotation : undefined;
  const context = scene.context ?? { kind: "pitch" as const, region: "full" as const, attack: "positive-x" as const };
  const area = contextArea(scene), dataKey = JSON.stringify({ field: scene.field, context });
  /** Read numeric form values; the scene validator remains authoritative for world limits. */
  const numeric = (data: FormData, key: string) => Number(data.get(key));
  return <>{error && <p role="alert">{error}</p>}
    {entity && <section key={JSON.stringify(entity)}><p className="calendar-eyebrow">Selected {entity.kind}</p><h2>{entity.kind === "player" ? `#${entity.number} · Team ${entity.team.toUpperCase()}` : entity.kind === "equipment" ? entity.equipment : "Ball"}</h2>
      <form onSubmit={(event) => { event.preventDefault(); try { const data = new FormData(event.currentTarget); let next = moveObjects(scene, selected, numeric(data, "x") - entity.position.x, numeric(data, "y") - entity.position.y); next = structuredClone(next);
        const item = next.entities.find((e) => e.id === entity.id)!; item.headingDegrees = numeric(data, "heading");
        if (item.kind === "player" && entity.kind === "player") {
          item.number = numeric(data, "number"); item.team = data.get("team") as typeof item.team; item.positionLabel = String(data.get("label") ?? "").trim() || null;
          const shown = (entity.color ?? tacticalPalette[entity.team === "neutral" ? "neutral" : entity.team]).toLowerCase(), chosen = String(data.get("color")).toLowerCase();
          if (chosen !== shown) item.color = chosen;
        }
        edit(next); setError(""); } catch { setError("Object change rejected: anchors and every associated movement keyframe must remain within ±10,000 m."); }
      }}><div className="editor-row"><label>X (m)<input name="x" aria-label="Object X" type="number" step="any" defaultValue={entity.position.x} required /></label><label>Y (m)<input name="y" aria-label="Object Y" type="number" step="any" defaultValue={entity.position.y} required /></label></div>
        <label>Facing (degrees)<input name="heading" type="number" min="0" max="359.99" step="any" defaultValue={entity.headingDegrees} required /></label>
        {entity.kind === "player" && <><div className="editor-row"><label>Number<input name="number" aria-label="Player number" type="number" min="1" max="99" defaultValue={entity.number} required /></label><label>Team<select name="team" defaultValue={entity.team}><option value="a">Blue</option><option value="b">Red</option><option value="neutral">Neutral</option></select></label></div>
          <label>Position label<input name="label" maxLength={100} defaultValue={entity.positionLabel ?? ""} /></label><label>Marker colour<input name="color" aria-label="Marker colour" type="color" defaultValue={entity.color ?? tacticalPalette[entity.team === "neutral" ? "neutral" : entity.team]} /></label></>}
        <button>Apply object properties</button></form>
    </section>}
    {annotation && track && <section key={JSON.stringify(annotation)}><p className="calendar-eyebrow">Selected overlay</p><h2>{annotation.kind === "arrow" ? `${annotation.movement} route` : annotation.kind === "area" ? "Training zone" : "Coaching note"}</h2>
      <form onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); mutate((draft) => {
        const item = draft.stages[0].tracks.find((t) => t.id === track.id); if (item?.kind !== "annotation") return; const a = item.annotation;
        if (a.kind === "arrow") { a.from = { x: numeric(data, "x"), y: numeric(data, "y") }; a.to = { x: numeric(data, "endX"), y: numeric(data, "endY") }; a.movement = data.get("movement") as typeof a.movement; }
        else if (a.kind === "area") { a.area = { origin: { x: numeric(data, "x"), y: numeric(data, "y") }, length: numeric(data, "length"), width: numeric(data, "width") }; a.label = String(data.get("text")); }
        else { a.position = { x: numeric(data, "x"), y: numeric(data, "y") }; a.text = String(data.get("text")); }
      }); }}><div className="editor-row"><label>Start X (m)<input name="x" type="number" step="any" defaultValue={annotation.kind === "arrow" ? annotation.from.x : annotation.kind === "area" ? annotation.area.origin.x : annotation.position.x} required /></label><label>Start Y (m)<input name="y" type="number" step="any" defaultValue={annotation.kind === "arrow" ? annotation.from.y : annotation.kind === "area" ? annotation.area.origin.y : annotation.position.y} required /></label></div>
        {annotation.kind === "arrow" ? <><div className="editor-row"><label>End X (m)<input name="endX" type="number" step="any" defaultValue={annotation.to.x} required /></label><label>End Y (m)<input name="endY" type="number" step="any" defaultValue={annotation.to.y} required /></label></div><label>Movement<select name="movement" defaultValue={annotation.movement}>{["pass", "run", "press", "rotation"].map((m) => <option key={m}>{m}</option>)}</select></label><p className="calendar-muted">{Math.hypot(annotation.to.x - annotation.from.x, annotation.to.y - annotation.from.y).toFixed(2)} m route · first-stage timing retained</p></> : <><label>Label<input name="text" maxLength={200} defaultValue={annotation.kind === "note" ? annotation.text : annotation.label} required /></label>{annotation.kind === "area" && <div className="editor-row"><label>Length (m)<input name="length" type="number" min=".01" step="any" defaultValue={annotation.area.length} required /></label><label>Width (m)<input name="width" type="number" min=".01" step="any" defaultValue={annotation.area.width} required /></label></div>}</>}
        <button>Apply overlay properties</button></form>
    </section>}
    <section key={dataKey}><p className="calendar-eyebrow">Field context</p><h2>{context.kind === "neutral" ? "Independent training area" : context.region.replaceAll("-", " ")}</h2>
      {context.kind === "pitch" ? <>
        <label>Physical region<select aria-label="Physical region" value={context.region} onChange={(e) => { mutate((draft) => { draft.context = { ...context, region: e.target.value as typeof context.region, ...(e.target.value === "custom" && !context.area ? { area: { origin: { x: 35, y: 20 }, length: 35, width: 28 } } : {}), ...(e.target.value === "set-piece" && !context.setPiece ? { setPiece: { type: "corner", phase: "attacking", side: "left" } } : {}) }; }); onFrame(); }}>
          {["full", "attacking-third", "defensive-third", "midfield", "attacking-half", "defensive-half", "set-piece", "custom"].map((r) => <option key={r} value={r}>{r.replaceAll("-", " ")}</option>)}</select></label>
        <label>Attack direction<select aria-label="Attack direction" value={context.attack} onChange={(e) => { mutate((draft) => { draft.context = { ...context, attack: e.target.value as typeof context.attack }; }); onFrame(); }}><option value="positive-x">Towards +X goal</option><option value="negative-x">Towards −X goal</option></select></label>
        {context.region === "set-piece" && context.setPiece && <><label>Set piece<select aria-label="Set piece" value={context.setPiece.type} onChange={(e) => { mutate((draft) => { draft.context = { ...context, setPiece: { ...context.setPiece!, type: e.target.value as NonNullable<typeof context.setPiece>["type"], location: undefined } }; }); onFrame(); }}>{["corner", "wide-free-kick", "edge-free-kick", "direct-free-kick", "indirect-free-kick", "penalty"].map((r) => <option key={r}>{r}</option>)}</select></label>
          <div className="editor-row"><label>Side<select aria-label="Set-piece side" value={context.setPiece.side} onChange={(e) => { mutate((draft) => { draft.context = { ...context, setPiece: { ...context.setPiece!, side: e.target.value as "left" | "right", location: undefined } }; }); onFrame(); }}><option>left</option><option>right</option></select></label><label>Phase<select aria-label="Set-piece phase" value={context.setPiece.phase} onChange={(e) => { mutate((draft) => { draft.context = { ...context, setPiece: { ...context.setPiece!, phase: e.target.value as "attacking" | "defending", location: undefined } }; }); onFrame(); }}><option>attacking</option><option>defending</option></select></label></div>
          <p className="calendar-muted">Delivery anchor: {deliveryLocation(scene).x.toFixed(1)}, {deliveryLocation(scene).y.toFixed(1)} m. Context controls reframe; move the ball separately.</p>
          {context.setPiece.type.includes("free-kick") && <form onSubmit={(e) => { e.preventDefault(); const data = new FormData(e.currentTarget); mutate((d) => { d.context = { ...context, setPiece: { ...context.setPiece!, location: { x: numeric(data, "deliveryX"), y: numeric(data, "deliveryY") } } }; }); onFrame(); }}><div className="editor-row"><label>Delivery X<input name="deliveryX" type="number" min="0" max={scene.field.length} step="any" defaultValue={deliveryLocation(scene).x} required /></label><label>Delivery Y<input name="deliveryY" type="number" min="0" max={scene.field.width} step="any" defaultValue={deliveryLocation(scene).y} required /></label></div><button>Set delivery location</button></form>}
        </>}
        {context.region === "custom" && <form onSubmit={(e) => { e.preventDefault(); const data = new FormData(e.currentTarget); mutate((draft) => { draft.context = { ...context, area: { origin: { x: numeric(data, "areaX"), y: numeric(data, "areaY") }, length: numeric(data, "areaL"), width: numeric(data, "areaW") } }; }); onFrame(); }}><div className="editor-row"><label>Area X<input name="areaX" type="number" min="0" step="any" defaultValue={area.origin.x} required /></label><label>Area Y<input name="areaY" type="number" min="0" step="any" defaultValue={area.origin.y} required /></label><label>Area length<input name="areaL" type="number" min=".01" step="any" defaultValue={area.length} required /></label><label>Area width<input name="areaW" type="number" min=".01" step="any" defaultValue={area.width} required /></label></div><button>Apply custom area</button></form>}
      </> : <label className="editor-check"><input type="checkbox" checked={context.boundary} onChange={(e) => mutate((d) => { d.context = { ...context, boundary: e.target.checked }; })} />Show training boundary</label>}
      <form onSubmit={(e) => { e.preventDefault(); const data = new FormData(e.currentTarget); mutate((draft) => { draft.field = { length: numeric(data, "fieldL"), width: numeric(data, "fieldW") }; }); onFrame(); }}><div className="editor-row"><label>{context.kind === "pitch" ? "Pitch length" : "Area length"} (m)<input name="fieldL" type="number" min={context.kind === "pitch" ? 70 : .1} max="1000" step="any" defaultValue={scene.field.length} required /></label><label>{context.kind === "pitch" ? "Pitch width" : "Area width"} (m)<input name="fieldW" type="number" min={context.kind === "pitch" ? 45 : .1} max="1000" step="any" defaultValue={scene.field.width} required /></label></div><button>Apply dimensions</button></form>
      <p className="calendar-muted">{area.length.toFixed(1)} × {area.width.toFixed(1)} m context. Changing dimensions never scales or relocates objects; Fit all reveals anchors beyond a reduced boundary.</p>
      <SpaceConversion key={dataKey} scene={scene} edit={edit} onFrame={onFrame} />
    </section>
  </>;
}
