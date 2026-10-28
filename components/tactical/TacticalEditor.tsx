"use client";

import { useEffect, useRef, useState, type PointerEvent, type KeyboardEvent } from "react";
import type { TacticalScene } from "@/lib/domain/tactical-scene";
import { evaluateScene, prepareScene, sceneDuration, type Point } from "@/lib/tactical/evaluate";
import { appendStage, movePose, stageRanges, stageStart } from "@/lib/tactical/animation";
import { animationExamples } from "@/lib/tactical/animation-examples";
import { fitViewport, screenToWorld, type Camera, type FitMode, type Projection, type Rotation } from "@/lib/tactical/viewport";
import { addAnnotation, addEntity, arrangeObjects, moveObjects, recordEdit, removeObjects, snapPoint, travel, type History, type TacticalEntityEquipment } from "@/lib/tactical/authoring";
import { editorExamples } from "@/lib/tactical/editor-examples";
import { contextArea } from "@/lib/tactical/context";
import { SceneDiagram } from "./SceneDiagram";
import { EditorProperties } from "./EditorProperties";
import { AnimationTimeline } from "./AnimationTimeline";
import { AnimationProperties } from "./AnimationProperties";

type Tool = "select" | "pan" | "player" | "ball" | "equipment" | "pass" | "run" | "press" | "rotation" | "zone" | "note";
type Gesture = { start: Point; view: Projection; before: TacticalScene; ids: string[]; kind: "move" | "pan" | "draw"; from: Point; tool: Tool; moved: boolean; poseStage?: string; poseSeconds?: number };
const tools: [Tool, string][] = [["select", "↖ Select"], ["pan", "✥ Pan"], ["player", "● Player"], ["ball", "◉ Ball"], ["equipment", "△ Equipment"], ["pass", "→ Pass"], ["run", "⇢ Run"], ["press", "⇢ Press"], ["rotation", "↝ Rotation"], ["zone", "▧ Zone"], ["note", "T Note"]];
/** Choose a useful initial camera for cross-field contexts; it is never stored as geometry. */
function startingRotation(scene: TacticalScene): Rotation { const area = contextArea(scene); return scene.context?.kind === "pitch" && area.width > area.length ? 270 : 0; }

/** Production authoring surface uses the same world projection/drawing primitives as saved coaching guides. */
export function TacticalEditor({ initial, readOnly, onDirty, onSave, canSave, saveLabel }: { initial: TacticalScene; readOnly: boolean; onDirty: (dirty: boolean) => void; onSave: (scene: TacticalScene) => Promise<void>; canSave: boolean; saveLabel: string }) {
  const [history, setHistory] = useState<History>(() => ({ past: [], present: initial, future: [] }));
  const scene = history.present, [selected, setSelected] = useState<string[]>([]), [tool, setTool] = useState<Tool>("select");
  const [animation, setAnimation] = useState(() => initial.stages.length > 1 || initial.stages.some((s) => s.durationSeconds !== 1 || s.hiddenEntityIds?.length || s.tracks.some((t) => t.kind !== "annotation" || t.visibleFrom > 0 || t.visibleUntil < s.durationSeconds)));
  const [seconds, setSeconds] = useState(0), [stageId, setStageId] = useState(initial.stages[0]?.id ?? ""), [playing, setPlaying] = useState(false), [speed, setSpeed] = useState(1), [ghosts, setGhosts] = useState(true), [paths, setPaths] = useState<"active" | "stage" | "none">("active");
  const duration = sceneDuration(scene), time = animation ? Math.min(seconds, duration) : 0;
  const stage = scene.stages.find((s) => s.id === stageId) ?? scene.stages[0], range = stageRanges(scene).find((r) => r.stage.id === stage?.id);
  const localTime = range ? Math.max(0, Math.min(range.stage.durationSeconds, time - range.start)) : 0;
  const clock = useRef(0);
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
    try { const valid = prepareScene(next); setPlaying(false); setHistory((h) => recordEdit(h, valid, before)); setMessage("Diagram updated · geometry retained in metres."); }
    catch { setMessage("Change rejected. Check dimensions, required text, player number (1–99), facing (0–359°) and coordinate limits."); }
  };
  /** Clone the draft before a property mutation so history and source revisions stay immutable. */
  const mutate = (operation: (draft: TacticalScene) => void) => { const draft = structuredClone(scene); operation(draft); edit(draft); };
  /** Catch bounded geometry-operation failures and report them without breaking the editor. */
  const operate = (operation: () => TacticalScene) => { try { edit(operation()); } catch (error) { setMessage(error instanceof Error ? error.message : "Change rejected: object spacing or movement exceeds the supported world limits."); } };
  /** Seeking is view-only; pose-boundary editing can retain the deliberately selected stage. */
  function seek(value: number, selectStage = true) { setPlaying(false); const next = Math.max(0, Math.min(duration, value)); clock.current = next; setSeconds(next); if (selectStage) setStageId(evaluateScene(scene, next).stage?.id ?? ""); }
  /** One elapsed-time clock drives the pure evaluator, independent of frame rate or display speed. */
  useEffect(() => {
    if (!playing) return;
    const origin = performance.now(), from = clock.current; let frameId = 0;
    const tick = (now: number) => { const next = Math.min(duration, from + (now - origin) * speed / 1000); clock.current = next; setSeconds(next); setStageId(evaluateScene(scene, next).stage?.id ?? ""); if (next < duration) frameId = requestAnimationFrame(tick); else setPlaying(false); };
    frameId = requestAnimationFrame(tick); return () => cancelAnimationFrame(frameId);
  }, [playing, speed, duration, scene]);
  /** Pose gestures edit only the selected time; Layout gestures retain the established whole-object translation. */
  function moveSelection(source: TacticalScene, ids: string[], dx: number, dy: number, poseStage?: string, poseSeconds = 0) {
    if (!poseStage) return moveObjects(source, ids, dx, dy);
    const next = movePose(source, poseStage, poseSeconds, ids, dx, dy);
    return moveObjects(next, ids.filter((id) => id.startsWith("annotation:")), dx, dy, poseStage);
  }
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
    const measure = () => setCanvasHeight(Math.max(animation ? 230 : 280, window.innerHeight - (element.getBoundingClientRect().top + (expanded ? (root.current?.scrollTop ?? 0) : window.scrollY)) - (animation ? 175 : 76)));
    const observer = new ResizeObserver(measure); observer.observe(element.parentElement!); measure();
    window.addEventListener("resize", measure); document.addEventListener("toggle", measure, true);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); document.removeEventListener("toggle", measure, true); };
  }, [expanded, animation]);
  /** Apply metre-grid or nearby-object snapping at a fixed screen-space tolerance. */
  function snapped(at: Point, view: Projection, ids = selected) { return snapPoint(at, animation ? { ...scene, entities: evaluateScene(scene, time).entities } : scene, ids, snap ? grid : null, objects, 10 / view.scale); }
  /** Insert the current object or a first-stage overlay, using practical sizes for click insertion. */
  function addAt(at: Point, chosen = tool, to?: Point) {
    try {
      let next: TacticalScene;
      if (["player", "ball", "equipment"].includes(chosen)) {
        next = addEntity(scene, at, chosen === "equipment" ? equipment : chosen as "player" | "ball", team);
        setSelected([`entity:${next.entities.at(-1)!.id}`]);
      } else if (chosen === "zone") next = addAnnotation(scene, { kind: "area", area: { origin: { x: Math.min(at.x, to?.x ?? at.x), y: Math.min(at.y, to?.y ?? at.y) }, length: Math.max(.5, Math.abs((to?.x ?? at.x + 10) - at.x)), width: Math.max(.5, Math.abs((to?.y ?? at.y + 8) - at.y)) }, label: "Training zone" }, undefined, animation ? stage?.id : undefined);
      else if (chosen === "note") next = addAnnotation(scene, { kind: "note", position: at, text: "Coaching note" }, undefined, animation ? stage?.id : undefined);
      else if (["pass", "run", "press", "rotation"].includes(chosen)) next = addAnnotation(scene, { kind: "arrow", from: at, to: to ?? { x: at.x + 5, y: at.y }, movement: chosen as "pass" | "run" | "press" | "rotation" }, undefined, animation ? stage?.id : undefined);
      else return;
      if (!["player", "ball", "equipment"].includes(chosen)) setSelected([`annotation:${(animation ? next.stages.find((s) => s.id === stage?.id) : next.stages[0])!.tracks.at(-1)!.id}`]);
      edit(next);
      if (animation && range && !["player", "ball", "equipment"].includes(chosen) && time >= range.end) seek(range.start, false);
    } catch { setMessage("Object could not be added within scene limits."); }
  }
  /** Convert a captured pointer into local SVG pixels before inverse world projection. */
  function point(event: PointerEvent<HTMLDivElement>) { const rect = event.currentTarget.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; }
  /** Begin selection, group movement, panning or static-overlay creation from one pointer anchor. */
  function down(event: PointerEvent<HTMLDivElement>, view: Projection) {
    if (event.button !== 0) return;
    if (playing) { setPlaying(false); return; }
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); root.current?.focus();
    const start = point(event), from = screenToWorld(start, view), hit = event.target instanceof Element ? event.target.closest("[data-entity-id],[data-annotation-id]") : null;
    const id = hit?.getAttribute("data-entity-id") ? `entity:${hit.getAttribute("data-entity-id")}` : hit?.getAttribute("data-annotation-id") ? `annotation:${hit.getAttribute("data-annotation-id")}` : undefined;
    if (tool === "pan" || event.altKey) { gesture.current = { start, view, before: scene, ids: [], kind: "pan", from, tool, moved: false }; return; }
    if (tool === "select") {
      const ids = id ? event.shiftKey ? selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id] : selected.includes(id) ? selected : [id] : [];
      setSelected(ids);
      if (id && !readOnly && ids.includes(id)) gesture.current = { start, view, before: scene, ids, kind: "move", from, tool, moved: false, ...(animation && stage ? { poseStage: stage.id, poseSeconds: localTime } : {}) };
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
      const posed = g.poseStage ? { ...g.before, entities: evaluateScene(g.before, time).entities } : g.before;
      const anchor = posed.entities.find((e) => g.ids.includes(`entity:${e.id}`))?.position ?? g.from;
      const target = snapPoint({ x: anchor.x + dx, y: anchor.y + dy }, posed, g.ids, snap ? grid : null, objects, 10 / g.view.scale);
      try { const next = moveSelection(g.before, g.ids, target.x - anchor.x, target.y - anchor.y, g.poseStage, g.poseSeconds); setHistory((h) => ({ ...h, present: next })); } catch { setMessage("Movement rejected. Animate players/balls; position equipment in Layout mode."); }
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
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") { event.preventDefault(); setSelected([...scene.entities.filter((e) => !animation || e.kind !== "equipment").map((e) => `entity:${e.id}`), ...((animation ? stage : scene.stages[0])?.tracks.filter((t) => t.kind === "annotation").map((t) => `annotation:${t.id}`) ?? [])]); }
    if ((event.ctrlKey || event.metaKey) && ["z", "y"].includes(event.key.toLowerCase())) { event.preventDefault(); setPlaying(false); setHistory((h) => travel(h, event.key.toLowerCase() === "y" || event.shiftKey ? "redo" : "undo")); }
    if (["Delete", "Backspace"].includes(event.key) && selected.length) { event.preventDefault(); operate(() => removeObjects(scene, selected, animation ? stage?.id : undefined)); setSelected([]); }
    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (direction && selected.length) {
      event.preventDefault(); const view = projection(); if (!view) return;
      const a = screenToWorld({ x: 0, y: 0 }, view), b = screenToWorld({ x: direction[0], y: direction[1] }, view), step = event.shiftKey ? 5 : snap ? grid : .25;
      operate(() => moveSelection(scene, selected, (b.x - a.x) * view.scale * step, (b.y - a.y) * view.scale * step, animation ? stage?.id : undefined, localTime));
    }
  }
  const ghostPositions = animation && ghosts && !playing && stage ? selected.filter((id) => id.startsWith("entity:")).flatMap((id) => {
    const entity = stageStart(scene, stage.id).find((e) => `entity:${e.id}` === id), track = stage.tracks.find((t) => t.kind !== "annotation" && `entity:${t.entityId}` === id);
    return entity ? [{ id: `${entity.id}-start`, position: entity.position, label: "Start" }, ...(track && track.kind !== "annotation" ? [{ id: `${entity.id}-end`, position: track.keyframes.at(-1)!.position, label: "End" }] : [])] : [];
  }) : [];
  return <div ref={root} className={`tactical-editor${animation ? " editor-animation" : ""}${expanded ? " editor-expanded" : ""}`} tabIndex={0} role={expanded ? "dialog" : "region"} aria-modal={expanded || undefined} aria-label="Tactical diagram editor" onKeyDown={keyboard}>
    <div className="editor-topbar"><div className="editor-mode" aria-label="Authoring mode"><button aria-pressed={!animation} onClick={() => { setPlaying(false); setAnimation(false); setSeconds(0); clock.current = 0; }}>Layout</button><button aria-pressed={animation} onClick={() => { setPlaying(false); setAnimation(true); setTool("select"); if (!scene.stages.length && !readOnly) operate(() => appendStage(scene)); }}>Animation</button></div>
      <label>Example setup<select aria-label="Example setup" value={example} disabled={readOnly} onChange={(e) => setExample(e.target.value)}><optgroup label="Static diagrams">{editorExamples.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}</optgroup><optgroup label="Animation examples">{animationExamples.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}</optgroup></select></label>
      <button disabled={readOnly} onClick={() => { const e = [...editorExamples, ...animationExamples].find((e) => e.id === example)!; edit({ ...structuredClone(e.scene), id: scene.id, revision: scene.revision, organizationId: scene.organizationId }); setSelected([]); setStageId(e.scene.stages[0]?.id ?? ""); setSeconds(0); clock.current = 0; setAnimation(example.startsWith("animation-")); frame("context"); setRotation(startingRotation(e.scene)); }}>Apply setup</button>
      <span className="editor-spacer" /><button disabled={readOnly || !history.past.length} onClick={() => { setPlaying(false); setHistory((h) => travel(h, "undo")); }}>↶ Undo</button><button disabled={readOnly || !history.future.length} onClick={() => { setPlaying(false); setHistory((h) => travel(h, "redo")); }}>↷ Redo</button>
      <button className="calendar-primary" disabled={!canSave} onClick={() => { setPlaying(false); void onSave(scene); }}>{saveLabel}</button></div>
    <div className="editor-layout"><section className="editor-canvas-column" aria-label="Drawing workspace">
      <div className="editor-tools" role="toolbar" aria-label="Drawing tools">{tools.map(([id, label]) => <button key={id} aria-pressed={tool === id} disabled={readOnly && !["select", "pan"].includes(id) || animation && ["player", "ball", "equipment"].includes(id)} onClick={() => setTool(id)}>{label}</button>)}</div>
      <div className="editor-viewbar"><button onClick={() => frame("context")}>Fit exercise</button><button onClick={() => frame("all")}>Fit all</button><button onClick={() => frame("pitch")}>{scene.context?.kind === "neutral" ? "Fit boundary" : "Fit pitch"}</button>
        <label>Camera rotation<select aria-label="Camera rotation" value={rotation} onChange={(e) => { setRotation(Number(e.target.value) as Rotation); setCamera(undefined); }}>{[0, 90, 180, 270].map((v) => <option key={v} value={v}>{v}°</option>)}</select></label>
        {scene.context?.kind === "pitch" && scene.context.region === "set-piece" && <label>Focus<select aria-label="Set-piece focus" value={focus} onChange={(e) => { setFocus(e.target.value as typeof focus); frame("context"); }}><option value="delivery">Delivery + box</option><option value="box">Penalty box</option></select></label>}
        <span className="editor-spacer" /><button onClick={() => zoom(.8)} aria-label="Zoom out">−</button><button onClick={() => zoom(1.25)} aria-label="Zoom in">+</button><button ref={expandButton} onClick={() => setExpanded(!expanded)}>{expanded ? "Exit board" : "Expand board"}</button></div>
      <div ref={surface} className={`editor-surface editor-tool-${tool}`} style={{ height: canvasHeight }}>
        <SceneDiagram scene={scene} title="Editable tactical diagram" options={{ padding: 24, fit, camera, rotation, setPieceFocus: focus, seconds: time, gridMetres: showGrid ? grid : undefined, guides, labels: true, paths: animation ? paths : "stage", selectedIds: selected, ghosts: ghostPositions }} interaction={{ down, move, up, cancel }} />
      </div>
      <div className="editor-status"><span>Blue / red · yellow neutral</span><span>→ Pass · ⇢ Run · Press · ↝ Rotation</span><span>{scene.entities.length} objects · {selected.length} selected · {Math.round((camera?.zoom ?? 1) * 100)}% · {rotation}°</span></div>
      {animation && <AnimationTimeline scene={scene} selected={stage?.id ?? ""} seconds={time} playing={playing} speed={speed} disabled={readOnly} onSeek={seek} onStage={(id) => { const r = stageRanges(scene).find((s) => s.stage.id === id)!; seek(r.start, false); setStageId(id); }} onPlay={() => { if (playing) setPlaying(false); else { clock.current = time >= duration ? 0 : time; setSeconds(clock.current); setPlaying(true); } }} onRestart={() => seek(0)} onSpeed={setSpeed} onAdd={() => { try { const next = appendStage(scene); edit(next); const r = stageRanges(next).at(-1)!; setStageId(r.stage.id); clock.current = r.start; setSeconds(r.start); } catch { setMessage("Stage limit reached."); } }} />}
      <p role="status" className="editor-feedback">{message}</p>
      <details className="editor-object-list"><summary>Objects & keyboard selection · {scene.entities.length} anchors</summary><div>{evaluateScene(scene, time).entities.map((e) => <button key={e.id} data-object-id={e.id} aria-pressed={selected.includes(`entity:${e.id}`)} onClick={(event) => setSelected(event.shiftKey ? [...new Set([...selected, `entity:${e.id}`])] : [`entity:${e.id}`])}>{e.kind === "player" ? `${e.team.toUpperCase()} #${e.number}` : e.kind === "equipment" ? e.equipment : "Ball"} · {e.position.x.toFixed(1)}, {e.position.y.toFixed(1)} m</button>)}{(animation ? stage : scene.stages[0])?.tracks.filter((t) => t.kind === "annotation").map((t) => t.kind === "annotation" && <button key={t.id} aria-pressed={selected.includes(`annotation:${t.id}`)} onClick={() => setSelected([`annotation:${t.id}`])}>{t.annotation.kind === "arrow" ? `${t.annotation.movement} route` : t.annotation.kind === "area" ? t.annotation.label : t.annotation.text}</button>)}</div></details>
    </section><aside className="editor-inspector" aria-label="Contextual properties">
      <fieldset disabled={readOnly || playing}>{animation && <AnimationProperties scene={scene} stageId={stage?.id ?? ""} selected={selected} seconds={time} onSeekPose={(value) => seek(value, false)} operate={operate} />}<section><h2>Object tools</h2><div className="editor-row"><label>New team<select aria-label="New player team" value={team} disabled={animation} onChange={(e) => setTeam(e.target.value as typeof team)}><option value="a">Blue</option><option value="b">Red</option><option value="neutral">Neutral</option></select></label><label>Equipment<select aria-label="Equipment kind" value={equipment} disabled={animation} onChange={(e) => setEquipment(e.target.value as TacticalEntityEquipment)}>{["cone", "pole", "goal", "mannequin", "marker", "ladder"].map((k) => <option key={k}>{k}</option>)}</select></label></div>
        <button disabled={["select", "pan"].includes(tool)} onClick={() => { const view = projection(); if (view) addAt(snapped(view.center, view)); }}>Insert at centre</button>
        <button disabled={!selected.length} onClick={() => { operate(() => removeObjects(scene, selected, animation ? stage?.id : undefined)); setSelected([]); }}>Delete selected</button>{animation && <p className="calendar-muted">Use Layout to add players, balls and equipment. Overlays belong to the selected stage.</p>}</section>
      <EditorProperties scene={scene} selected={selected} mutate={mutate} edit={edit} onFrame={() => frame("context")} animation={animation} stageId={animation ? stage?.id : undefined} />
      {!animation && <section><h2>Arrange selection</h2><div className="editor-button-grid">{(["x", "y"] as const).map((axis) => <button key={axis} disabled={selected.length < 2} onClick={() => operate(() => arrangeObjects(scene, selected, axis))}>Align {axis.toUpperCase()}</button>)}{(["x", "y"] as const).map((axis) => <button key={axis} disabled={selected.length < 3} onClick={() => operate(() => arrangeObjects(scene, selected, axis, true))}>Distribute {axis.toUpperCase()}</button>)}</div>
        <form onSubmit={(e) => { e.preventDefault(); const data = new FormData(e.currentTarget); try { edit(arrangeObjects(scene, selected, data.get("axis") as "x" | "y", true, Number(data.get("spacing")))); } catch (failure) { setMessage(failure instanceof Error ? failure.message : "Invalid spacing"); } }}><label>Centre spacing (m)<input name="spacing" aria-label="Centre spacing" type="number" min=".01" max="1000" step="any" defaultValue="5" required /></label><label>Spacing axis<select name="axis"><option value="x">World X</option><option value="y">World Y</option></select></label><button disabled={selected.length < 2}>Apply spacing</button></form>
      </section>}</fieldset>
      <section><h2>Grid & guides</h2><label className="editor-check"><input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />Metric grid</label><label>Grid spacing<select aria-label="Grid spacing" value={grid} onChange={(e) => setGrid(Number(e.target.value))}>{[.5, 1, 2, 5, 10].map((v) => <option key={v} value={v}>{v} m</option>)}</select></label>
        <label className="editor-check"><input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} />Snap to grid</label><label className="editor-check"><input type="checkbox" checked={objects} onChange={(e) => setObjects(e.target.checked)} />Snap to objects</label><label className="editor-check"><input type="checkbox" checked={guides} onChange={(e) => setGuides(e.target.checked)} />Thirds & channels</label></section>
      {animation && <section><h2>Authoring display</h2><label className="editor-check"><input type="checkbox" checked={ghosts} onChange={(e) => setGhosts(e.target.checked)} />Start / end ghosts</label><label>Movement paths<select aria-label="Movement paths" value={paths} onChange={(e) => setPaths(e.target.value as typeof paths)}><option value="active">Relevant active paths</option><option value="stage">Current stage paths</option><option value="none">Hide paths</option></select></label></section>}
      <p className="calendar-muted editor-help">Shift + click selects a group. Arrow keys move in screen direction; Shift moves 5 m. Ctrl/Cmd Z undoes; Shift Z redoes. Alt + drag pans. Esc cancels. {animation ? "Pose edits are stage-local; shared boundaries remain connected." : "Layout changes move an object's entire path; Animation edits a timed pose."}</p>
    </aside></div>
  </div>;
}
