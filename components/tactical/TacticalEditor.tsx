"use client";

import { useEffect, useRef, useState, type PointerEvent, type KeyboardEvent } from "react";
import type { TacticalScene } from "@/lib/domain/tactical-scene";
import { prepareScene, type Point } from "@/lib/tactical/evaluate";
import { fitViewport, screenToWorld, type Camera, type FitMode, type Projection, type Rotation } from "@/lib/tactical/viewport";
import { addAnnotation, addEntity, arrangeObjects, moveObjects, recordEdit, removeObjects, snapPoint, travel, type History, type TacticalEntityEquipment } from "@/lib/tactical/authoring";
import { editorExamples } from "@/lib/tactical/editor-examples";
import { contextArea } from "@/lib/tactical/context";
import { SceneDiagram } from "./SceneDiagram";
import { EditorProperties } from "./EditorProperties";

type Tool = "select" | "pan" | "player" | "ball" | "equipment" | "pass" | "run" | "press" | "rotation" | "zone" | "note";
type Gesture = { start: Point; view: Projection; before: TacticalScene; ids: string[]; kind: "move" | "pan" | "draw"; from: Point; tool: Tool; moved: boolean };
const tools: [Tool, string][] = [["select", "↖ Select"], ["pan", "✥ Pan"], ["player", "● Player"], ["ball", "◉ Ball"], ["equipment", "△ Equipment"], ["pass", "→ Pass"], ["run", "⇢ Run"], ["press", "⇢ Press"], ["rotation", "↝ Rotation"], ["zone", "▧ Zone"], ["note", "T Note"]];
/** Choose a useful initial camera for cross-field contexts; it is never stored as geometry. */
function startingRotation(scene: TacticalScene): Rotation { const area = contextArea(scene); return scene.context?.kind === "pitch" && area.width > area.length ? 270 : 0; }

/** Production authoring surface uses the same world projection/drawing primitives as saved coaching guides. */
export function TacticalEditor({ initial, readOnly, onDirty, onSave, canSave, saveLabel }: { initial: TacticalScene; readOnly: boolean; onDirty: (dirty: boolean) => void; onSave: (scene: TacticalScene) => Promise<void>; canSave: boolean; saveLabel: string }) {
  const [history, setHistory] = useState<History>(() => ({ past: [], present: initial, future: [] }));
  const scene = history.present, [selected, setSelected] = useState<string[]>([]), [tool, setTool] = useState<Tool>("select");
  const [team, setTeam] = useState<"a" | "b" | "neutral">("a"), [equipment, setEquipment] = useState<TacticalEntityEquipment>("cone");
  const [grid, setGrid] = useState(5), [showGrid, setShowGrid] = useState(true), [guides, setGuides] = useState(false), [snap, setSnap] = useState(true), [objects, setObjects] = useState(false);
  const [fit, setFit] = useState<FitMode>("context"), [camera, setCamera] = useState<Camera>(), [rotation, setRotation] = useState<Rotation>(() => startingRotation(initial)), [focus, setFocus] = useState<"delivery" | "box">("delivery");
  const [example, setExample] = useState("full"), [message, setMessage] = useState("Select objects; Shift adds to selection. Drag to move. Wheel zooms around the pointer."), [expanded, setExpanded] = useState(false), [canvasHeight, setCanvasHeight] = useState(360);
  const surface = useRef<HTMLDivElement>(null), root = useRef<HTMLDivElement>(null), expandButton = useRef<HTMLButtonElement>(null), gesture = useRef<Gesture | null>(null);
  const live = useRef({ scene, fit, camera, rotation, focus });
  useEffect(() => { live.current = { scene, fit, camera, rotation, focus }; }, [scene, fit, camera, rotation, focus]);
  useEffect(() => { onDirty(JSON.stringify(scene) !== JSON.stringify(initial)); }, [scene, initial, onDirty]);
  /** Validate and commit one undoable edit; rejected geometry leaves the last valid scene intact. */
  const edit = (next: TacticalScene, before?: TacticalScene) => {
    try { const valid = prepareScene(next); setHistory((h) => recordEdit(h, valid, before)); setMessage("Diagram updated · geometry retained in metres."); }
    catch { setMessage("Change rejected. Check dimensions, required text, player number (1–99), facing (0–359°) and coordinate limits."); }
  };
  /** Clone the draft before a property mutation so history and source revisions stay immutable. */
  const mutate = (operation: (draft: TacticalScene) => void) => { const draft = structuredClone(scene); operation(draft); edit(draft); };
  /** Catch bounded geometry-operation failures and report them without breaking the editor. */
  const operate = (operation: () => TacticalScene) => { try { edit(operation()); } catch { setMessage("Change rejected: object spacing or movement exceeds the supported world limits."); } };
  /** Reset only the view camera when choosing a fit target. */
  const frame = (value: FitMode) => { setFit(value); setCamera(undefined); };
  /** Resolve the live measured SVG projection for pointer picking and keyboard camera commands. */
  function projection() {
    const el = surface.current?.querySelector(".scene-diagram"), rect = el?.getBoundingClientRect();
    return rect && rect.width >= 120 && rect.height >= 120 ? fitViewport(live.current.scene, { width: rect.width, height: rect.height, padding: 24, fit: live.current.fit, camera: live.current.camera, rotation: live.current.rotation, setPieceFocus: live.current.focus }) : null;
  }
  /** Keep the world point beneath the pointer stationary while clamping view-only zoom. */
  function zoom(factor: number, anchor?: Point) {
    const view = projection(); if (!view) return;
    const point = anchor ?? { x: view.width / 2, y: view.height / 2 }, before = screenToWorld(point, view), zoom = Math.max(.1, Math.min(8, (live.current.camera?.zoom ?? 1) * factor));
    const projected = fitViewport(live.current.scene, { width: view.width, height: view.height, padding: 24, fit: live.current.fit, rotation: live.current.rotation, setPieceFocus: live.current.focus, camera: { center: view.center, zoom } });
    const after = screenToWorld(point, projected);
    const next = { center: { x: view.center.x + before.x - after.x, y: view.center.y + before.y - after.y }, zoom };
    if (Math.abs(next.center.x) <= 20_000 && Math.abs(next.center.y) <= 20_000) { live.current.camera = next; setCamera(next); }
  }
  useEffect(() => {
    const node = surface.current; if (!node) return;
    /** Prevent page scrolling only over the canvas and forward wheel intent to pointer-anchored zoom. */
    const wheel = (event: WheelEvent) => { event.preventDefault(); const rect = node.getBoundingClientRect(); zoom(Math.exp(-event.deltaY * .0015), { x: event.clientX - rect.left, y: event.clientY - rect.top }); };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => node.removeEventListener("wheel", wheel);
    // The wheel callback reads the current camera/scene from live rather than retaining stale state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!expanded) return;
    const oldOverflow = document.body.style.overflow, button = expandButton.current; document.body.style.overflow = "hidden"; root.current?.focus();
    return () => { document.body.style.overflow = oldOverflow; button?.focus(); };
  }, [expanded]);
  useEffect(() => {
    const element = surface.current; if (!element) return;
    /** Reserve visible viewport space for the canvas without resizing it in response to page scrolling. */
    const measure = () => setCanvasHeight(Math.max(280, window.innerHeight - (element.getBoundingClientRect().top + (expanded ? (root.current?.scrollTop ?? 0) : window.scrollY)) - 76));
    const observer = new ResizeObserver(measure); observer.observe(element.parentElement!); measure();
    window.addEventListener("resize", measure); document.addEventListener("toggle", measure, true);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); document.removeEventListener("toggle", measure, true); };
  }, [expanded]);
  /** Apply metre-grid or nearby-object snapping at a fixed screen-space tolerance. */
  function snapped(at: Point, view: Projection, ids = selected) { return snapPoint(at, scene, ids, snap ? grid : null, objects, 10 / view.scale); }
  /** Insert the current object or a first-stage overlay, using practical sizes for click insertion. */
  function addAt(at: Point, chosen = tool, to?: Point) {
    try {
      let next: TacticalScene;
      if (["player", "ball", "equipment"].includes(chosen)) {
        next = addEntity(scene, at, chosen === "equipment" ? equipment : chosen as "player" | "ball", team);
        setSelected([`entity:${next.entities.at(-1)!.id}`]);
      } else if (chosen === "zone") next = addAnnotation(scene, { kind: "area", area: { origin: { x: Math.min(at.x, to?.x ?? at.x), y: Math.min(at.y, to?.y ?? at.y) }, length: Math.max(.5, Math.abs((to?.x ?? at.x + 10) - at.x)), width: Math.max(.5, Math.abs((to?.y ?? at.y + 8) - at.y)) }, label: "Training zone" });
      else if (chosen === "note") next = addAnnotation(scene, { kind: "note", position: at, text: "Coaching note" });
      else if (["pass", "run", "press", "rotation"].includes(chosen)) next = addAnnotation(scene, { kind: "arrow", from: at, to: to ?? { x: at.x + 5, y: at.y }, movement: chosen as "pass" | "run" | "press" | "rotation" });
      else return;
      if (!["player", "ball", "equipment"].includes(chosen)) setSelected([`annotation:${next.stages[0].tracks.at(-1)!.id}`]);
      edit(next);
    } catch { setMessage("Object could not be added within scene limits."); }
  }
  /** Convert a captured pointer into local SVG pixels before inverse world projection. */
  function point(event: PointerEvent<HTMLDivElement>) { const rect = event.currentTarget.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; }
  /** Begin selection, group movement, panning or static-overlay creation from one pointer anchor. */
  function down(event: PointerEvent<HTMLDivElement>, view: Projection) {
    if (event.button !== 0) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); root.current?.focus();
    const start = point(event), from = screenToWorld(start, view), hit = event.target instanceof Element ? event.target.closest("[data-entity-id],[data-annotation-id]") : null;
    const id = hit?.getAttribute("data-entity-id") ? `entity:${hit.getAttribute("data-entity-id")}` : hit?.getAttribute("data-annotation-id") ? `annotation:${hit.getAttribute("data-annotation-id")}` : undefined;
    if (tool === "pan" || event.altKey) { gesture.current = { start, view, before: scene, ids: [], kind: "pan", from, tool, moved: false }; return; }
    if (tool === "select") {
      const ids = id ? event.shiftKey ? selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id] : selected.includes(id) ? selected : [id] : [];
      setSelected(ids);
      if (id && !readOnly && ids.includes(id)) gesture.current = { start, view, before: scene, ids, kind: "move", from, tool, moved: false };
    } else if (!readOnly) {
      if (["player", "ball", "equipment", "note"].includes(tool)) addAt(snapped(from, view));
      else gesture.current = { start, view, before: scene, ids: [], kind: "draw", from: snapped(from, view), tool, moved: false };
    }
  }
  /** Preview a gesture from its immutable starting scene to avoid accumulating rounding drift. */
  function move(event: PointerEvent<HTMLDivElement>) {
    const g = gesture.current; if (!g) return;
    const screen = point(event), to = screenToWorld(screen, g.view), dx = to.x - g.from.x, dy = to.y - g.from.y;
    g.moved ||= Math.hypot(screen.x - g.start.x, screen.y - g.start.y) > 2;
    if (g.kind === "pan") {
      const center = { x: g.view.center.x - dx, y: g.view.center.y - dy };
      if (Math.abs(center.x) <= 20_000 && Math.abs(center.y) <= 20_000) setCamera({ center, zoom: camera?.zoom ?? 1 });
    } else if (g.kind === "move" && g.moved) {
      const anchor = g.before.entities.find((e) => g.ids.includes(`entity:${e.id}`))?.position ?? g.from;
      const target = snapPoint({ x: anchor.x + dx, y: anchor.y + dy }, g.before, g.ids, snap ? grid : null, objects, 10 / g.view.scale);
      try { const next = moveObjects(g.before, g.ids, target.x - anchor.x, target.y - anchor.y); setHistory((h) => ({ ...h, present: next })); } catch { setMessage("Movement exceeds scene limits."); }
    }
  }
  /** Commit one history entry per drag; clicks and snap-collapsed drags use nonzero defaults. */
  function up(event: PointerEvent<HTMLDivElement>) {
    const g = gesture.current; gesture.current = null; if (!g) return;
    if (g.kind === "move" && g.moved) setHistory((h) => recordEdit(h, h.present, g.before));
    if (g.kind === "draw") {
      const to = snapped(screenToWorld(point(event), g.view), g.view, []);
      addAt(g.from, g.tool, g.moved && Math.hypot(to.x - g.from.x, to.y - g.from.y) > .000001 ? to : undefined);
    }
  }
  /** Restore an interrupted drag without publishing a history entry or saved revision. */
  function cancel() { const g = gesture.current; gesture.current = null; if (g?.kind === "move") setHistory((h) => ({ ...h, present: g.before })); }
  /** Provide object-editing shortcuts outside form inputs and contain focus in expanded-board mode. */
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (expanded && event.key === "Escape") { cancel(); setExpanded(false); return; }
    if (expanded && event.key === "Tab") {
      const nodes = [...root.current!.querySelectorAll<HTMLElement>("button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),summary")].filter((n) => n.getClientRects().length);
      if (event.shiftKey && (document.activeElement === nodes[0] || document.activeElement === root.current)) { event.preventDefault(); nodes.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0]?.focus(); }
      return;
    }
    if (event.target instanceof Element && event.target.closest("input,select,textarea,button,a")) return;
    if (event.key === "Escape") { cancel(); setSelected([]); setTool("select"); return; }
    if (readOnly) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") { event.preventDefault(); setSelected([...scene.entities.map((e) => `entity:${e.id}`), ...(scene.stages[0]?.tracks.filter((t) => t.kind === "annotation").map((t) => `annotation:${t.id}`) ?? [])]); }
    if ((event.ctrlKey || event.metaKey) && ["z", "y"].includes(event.key.toLowerCase())) { event.preventDefault(); setHistory((h) => travel(h, event.key.toLowerCase() === "y" || event.shiftKey ? "redo" : "undo")); }
    if (["Delete", "Backspace"].includes(event.key) && selected.length) { event.preventDefault(); operate(() => removeObjects(scene, selected)); setSelected([]); }
    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (direction && selected.length) {
      event.preventDefault(); const view = projection(); if (!view) return;
      const a = screenToWorld({ x: 0, y: 0 }, view), b = screenToWorld({ x: direction[0], y: direction[1] }, view), step = event.shiftKey ? 5 : snap ? grid : .25;
      operate(() => moveObjects(scene, selected, (b.x - a.x) * view.scale * step, (b.y - a.y) * view.scale * step));
    }
  }
  return <div ref={root} className={`tactical-editor${expanded ? " editor-expanded" : ""}`} tabIndex={0} role={expanded ? "dialog" : "region"} aria-modal={expanded || undefined} aria-label="Tactical diagram editor" onKeyDown={keyboard}>
    <div className="editor-topbar"><label>Example setup<select aria-label="Example setup" value={example} disabled={readOnly} onChange={(e) => setExample(e.target.value)}>{editorExamples.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}</select></label>
      <button disabled={readOnly} onClick={() => { const e = editorExamples.find((e) => e.id === example)!; edit({ ...structuredClone(e.scene), id: scene.id, revision: scene.revision, organizationId: scene.organizationId }); setSelected([]); frame("context"); setRotation(startingRotation(e.scene)); }}>Apply setup</button>
      <span className="editor-spacer" /><button disabled={readOnly || !history.past.length} onClick={() => setHistory((h) => travel(h, "undo"))}>↶ Undo</button><button disabled={readOnly || !history.future.length} onClick={() => setHistory((h) => travel(h, "redo"))}>↷ Redo</button>
      <button className="calendar-primary" disabled={!canSave} onClick={() => void onSave(scene)}>{saveLabel}</button></div>
    <div className="editor-layout"><section className="editor-canvas-column" aria-label="Drawing workspace">
      <div className="editor-tools" role="toolbar" aria-label="Drawing tools">{tools.map(([id, label]) => <button key={id} aria-pressed={tool === id} disabled={readOnly && !["select", "pan"].includes(id)} onClick={() => setTool(id)}>{label}</button>)}</div>
      <div className="editor-viewbar"><button onClick={() => frame("context")}>Fit exercise</button><button onClick={() => frame("all")}>Fit all</button><button onClick={() => frame("pitch")}>{scene.context?.kind === "neutral" ? "Fit boundary" : "Fit pitch"}</button>
        <label>Camera rotation<select aria-label="Camera rotation" value={rotation} onChange={(e) => { setRotation(Number(e.target.value) as Rotation); setCamera(undefined); }}>{[0, 90, 180, 270].map((v) => <option key={v} value={v}>{v}°</option>)}</select></label>
        {scene.context?.kind === "pitch" && scene.context.region === "set-piece" && <label>Focus<select aria-label="Set-piece focus" value={focus} onChange={(e) => { setFocus(e.target.value as typeof focus); frame("context"); }}><option value="delivery">Delivery + box</option><option value="box">Penalty box</option></select></label>}
        <span className="editor-spacer" /><button onClick={() => zoom(.8)} aria-label="Zoom out">−</button><button onClick={() => zoom(1.25)} aria-label="Zoom in">+</button><button ref={expandButton} onClick={() => setExpanded(!expanded)}>{expanded ? "Exit board" : "Expand board"}</button></div>
      <div ref={surface} className={`editor-surface editor-tool-${tool}`} style={{ height: canvasHeight }}>
        <SceneDiagram scene={scene} title="Editable tactical diagram" options={{ padding: 24, fit, camera, rotation, setPieceFocus: focus, seconds: 0, gridMetres: showGrid ? grid : undefined, guides, labels: true, paths: "stage", selectedIds: selected }} interaction={{ down, move, up, cancel }} />
      </div>
      <div className="editor-status"><span>Blue / red · yellow neutral</span><span>→ Pass · ⇢ Run · Press · ↝ Rotation</span><span>{scene.entities.length} objects · {selected.length} selected · {Math.round((camera?.zoom ?? 1) * 100)}% · {rotation}°</span></div>
      <p role="status" className="editor-feedback">{message}</p>
      <details className="editor-object-list"><summary>Objects & keyboard selection · {scene.entities.length} anchors</summary><div>{scene.entities.map((e) => <button key={e.id} data-object-id={e.id} aria-pressed={selected.includes(`entity:${e.id}`)} onClick={(event) => setSelected(event.shiftKey ? [...new Set([...selected, `entity:${e.id}`])] : [`entity:${e.id}`])}>{e.kind === "player" ? `${e.team.toUpperCase()} #${e.number}` : e.kind === "equipment" ? e.equipment : "Ball"} · {e.position.x.toFixed(1)}, {e.position.y.toFixed(1)} m</button>)}{scene.stages[0]?.tracks.filter((t) => t.kind === "annotation").map((t) => t.kind === "annotation" && <button key={t.id} aria-pressed={selected.includes(`annotation:${t.id}`)} onClick={() => setSelected([`annotation:${t.id}`])}>{t.annotation.kind === "arrow" ? `${t.annotation.movement} route` : t.annotation.kind === "area" ? t.annotation.label : t.annotation.text}</button>)}</div></details>
    </section><aside className="editor-inspector" aria-label="Contextual properties">
      <fieldset disabled={readOnly}><section><h2>Object tools</h2><div className="editor-row"><label>New team<select aria-label="New player team" value={team} onChange={(e) => setTeam(e.target.value as typeof team)}><option value="a">Blue</option><option value="b">Red</option><option value="neutral">Neutral</option></select></label><label>Equipment<select aria-label="Equipment kind" value={equipment} onChange={(e) => setEquipment(e.target.value as TacticalEntityEquipment)}>{["cone", "pole", "goal", "mannequin", "marker", "ladder"].map((k) => <option key={k}>{k}</option>)}</select></label></div>
        <button disabled={["select", "pan"].includes(tool)} onClick={() => { const view = projection(); if (view) addAt(snapped(view.center, view)); }}>Insert at centre</button>
        <button disabled={!selected.length} onClick={() => { operate(() => removeObjects(scene, selected)); setSelected([]); }}>Delete selected</button></section>
      <EditorProperties scene={scene} selected={selected} mutate={mutate} edit={edit} onFrame={() => frame("context")} />
      <section><h2>Arrange selection</h2><div className="editor-button-grid">{(["x", "y"] as const).map((axis) => <button key={axis} disabled={selected.length < 2} onClick={() => operate(() => arrangeObjects(scene, selected, axis))}>Align {axis.toUpperCase()}</button>)}{(["x", "y"] as const).map((axis) => <button key={axis} disabled={selected.length < 3} onClick={() => operate(() => arrangeObjects(scene, selected, axis, true))}>Distribute {axis.toUpperCase()}</button>)}</div>
        <form onSubmit={(e) => { e.preventDefault(); const data = new FormData(e.currentTarget); try { edit(arrangeObjects(scene, selected, data.get("axis") as "x" | "y", true, Number(data.get("spacing")))); } catch (failure) { setMessage(failure instanceof Error ? failure.message : "Invalid spacing"); } }}><label>Centre spacing (m)<input name="spacing" aria-label="Centre spacing" type="number" min=".01" max="1000" step="any" defaultValue="5" required /></label><label>Spacing axis<select name="axis"><option value="x">World X</option><option value="y">World Y</option></select></label><button disabled={selected.length < 2}>Apply spacing</button></form>
      </section></fieldset>
      <section><h2>Grid & guides</h2><label className="editor-check"><input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />Metric grid</label><label>Grid spacing<select aria-label="Grid spacing" value={grid} onChange={(e) => setGrid(Number(e.target.value))}>{[.5, 1, 2, 5, 10].map((v) => <option key={v} value={v}>{v} m</option>)}</select></label>
        <label className="editor-check"><input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} />Snap to grid</label><label className="editor-check"><input type="checkbox" checked={objects} onChange={(e) => setObjects(e.target.checked)} />Snap to objects</label><label className="editor-check"><input type="checkbox" checked={guides} onChange={(e) => setGuides(e.target.checked)} />Thirds & channels</label></section>
      <p className="calendar-muted editor-help">Shift + click selects a group. Arrow keys move in screen direction; Shift moves 5 m. Ctrl/Cmd Z undoes; Shift Z redoes. Alt + drag pans. Esc cancels. Static authoring at 0 s preserves existing animation stages.</p>
    </aside></div>
  </div>;
}
