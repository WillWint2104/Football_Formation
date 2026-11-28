"use client";

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent, type KeyboardEvent } from "react";
import { ArrowUpRight, CircleDot, CircleUserRound, Cone, Crosshair, Hand, MousePointer2, Repeat2, SquareDashed, TrendingUp, Type, type LucideIcon } from "lucide-react";
import type { TacticalScene, TrainingArea } from "@/lib/domain/tactical-scene";
import { evaluateScene, prepareScene, sceneDuration, type Point } from "@/lib/tactical/evaluate";
import { appendStage, movePose, posePreview, stageRanges, stageStart } from "@/lib/tactical/animation";
import { animationExamples } from "@/lib/tactical/animation-examples";
import { fitViewport, screenToWorld, worldToScreen, type Camera, type FitMode, type Projection, type Rotation } from "@/lib/tactical/viewport";
import { addAnnotation, addEntity, arrangeObjects, moveObjects, recordEdit, removeObjects, reviseArrow, snapPoint, travel, type History, type TacticalEntityEquipment } from "@/lib/tactical/authoring";
import { editorExamples } from "@/lib/tactical/editor-examples";
import { contextArea } from "@/lib/tactical/context";
import { actionFrame } from "@/lib/tactical/framing";
import { coachingExerciseArea } from "@/lib/tactical/coaching-view";
import { SceneDiagram } from "./SceneDiagram";
import { EditorProperties } from "./EditorProperties";
import { AnimationTimeline } from "./AnimationTimeline";
import { AnimationProperties } from "./AnimationProperties";

type Tool = "select" | "pan" | "player" | "ball" | "equipment" | "pass" | "run" | "press" | "rotation" | "zone" | "note";
const gestureGuidance: Record<Tool, string> = {
  select: "Drag a player or object to move it. Shift + click toggles selection.",
  pan: "Drag the field to pan. The mouse wheel zooms around the pointer.",
  player: "Click the field to add a player, or use Insert at centre in Properties.",
  ball: "Click the field to add a ball, or use Insert at centre in Properties.",
  equipment: "Choose the equipment in Properties, then click the field to place it.",
  pass: "Drag from passer to receiver to draw a pass. A single click creates a short default route.",
  run: "Drag from the start to the end of the run. A single click creates a short default route.",
  press: "Drag from the defender towards the pressing target.",
  rotation: "Drag from the starting position to the end of the rotation.",
  zone: "Drag between opposite corners to draw a zone.",
  note: "Click the field to add a note, then edit its text in Properties.",
};
type Endpoint = "from" | "to";
const endpoints: readonly Endpoint[] = ["from", "to"];
const screenSteps = new Map<string, [number, number]>([
  ["ArrowLeft", [-1, 0]], ["ArrowRight", [1, 0]], ["ArrowUp", [0, -1]], ["ArrowDown", [0, 1]],
]);
type EndpointDrag = { kind: "endpoint"; stageId: string; arrowId: string; endpoint: Endpoint; anchor: Point;
  pointerId: number; surface: HTMLDivElement; bounds: DOMRect; time: number; start: Point; view: Projection; before: TacticalScene; moved: boolean };
type Gesture = EndpointDrag | { pointerId: number; surface: HTMLDivElement; start: Point; view: Projection; before: TacticalScene; ids: string[]; kind: "move" | "pan" | "draw"; from: Point; tool: Tool; moved: boolean; poseStage?: string; poseSeconds?: number };
const tools: [Tool, string, LucideIcon][] = [
  ["select", "↖ Select", MousePointer2], ["pan", "✥ Pan", Hand],
  ["player", "● Player", CircleUserRound], ["ball", "◉ Ball", CircleDot], ["equipment", "△ Equipment", Cone],
  ["pass", "→ Pass", ArrowUpRight], ["run", "⇢ Run", TrendingUp], ["press", "⇢ Press", Crosshair],
  ["rotation", "↝ Rotation", Repeat2], ["zone", "▧ Zone", SquareDashed], ["note", "T Note", Type],
];
/** Choose a useful initial camera for cross-field contexts; it is never stored as geometry. */
function startingRotation(scene: TacticalScene): Rotation { const area = contextArea(scene); return scene.context?.kind === "pitch" && area.width > area.length ? 270 : 0; }

/** Production authoring surface uses the same world projection/drawing primitives as saved coaching guides. */
export function TacticalEditor({ initial, readOnly, onDirty, onSave, canSave, saveLabel, presentation, dirtyBaseline, recoveryWorkspace = false, initialSeconds = 0 }: { initial: TacticalScene; readOnly: boolean; onDirty: (dirty: boolean) => void; onSave: (scene: TacticalScene) => Promise<void>; canSave: boolean; saveLabel: string; presentation?: "coaching"; dirtyBaseline?: TacticalScene; recoveryWorkspace?: boolean; initialSeconds?: number }) {
  const coaching = presentation === "coaching", [propertiesOpen, setPropertiesOpen] = useState(!coaching);
  const propertiesId = useId();
  const [history, setHistory] = useState<History>(() => ({ past: [], present: initial, future: [] }));
  const scene = history.present, [selected, setSelected] = useState<string[]>([]), [tool, setTool] = useState<Tool>("select");
  const [animation, setAnimation] = useState(() => initial.stages.length > 1 || initial.stages.some((s) => s.durationSeconds !== 1 || s.hiddenEntityIds?.length || s.tracks.some((t) => t.kind !== "annotation" || t.visibleFrom > 0 || t.visibleUntil < s.durationSeconds)));
  const [seconds, setSeconds] = useState(initialSeconds), [stageId, setStageId] = useState(() => evaluateScene(initial, initialSeconds).stage?.id ?? initial.stages[0]?.id ?? ""), [playing, setPlaying] = useState(false), [speed, setSpeed] = useState(1), [ghosts, setGhosts] = useState(true), [paths, setPaths] = useState<"active" | "stage" | "none">("active");
  const duration = sceneDuration(scene), time = animation || recoveryWorkspace ? Math.min(seconds, duration) : 0;
  const ranges = stageRanges(scene), range = ranges.find((r) => r.stage.id === stageId) ?? ranges.find((r) => time < r.end) ?? ranges.at(-1), stage = range?.stage;
  const localTime = range ? Math.max(0, Math.min(range.stage.durationSeconds, Math.round((time - range.start) * 1_000_000) / 1_000_000)) : 0;
  // An explicit End pose previews the selected stage's exact endpoint. Ordinary
  // timeline seeks/playback still evaluate the full right-continuous scene.
  const previewScene = animation && !playing ? posePreview(scene, stage?.id ?? "", time) : scene;
  const previewPose = evaluateScene(previewScene, time);
  const previewEntities = previewPose.entities;
  const arrowHelpId = useId();
  const selectedArrow = !readOnly && !playing && tool === "select" && selected.length === 1 && (!animation || paths !== "none")
    ? previewPose.annotations.find(item => `annotation:${item.id}` === selected[0] && item.annotation.kind === "arrow") : undefined;
  const [endpointPreview, setEndpointPreview] = useState<{ scene: TacticalScene; view: Projection; endpoint: Endpoint; at: Point }>();
  const clock = useRef(initialSeconds);
  const [team, setTeam] = useState<"a" | "b" | "neutral">("a"), [equipment, setEquipment] = useState<TacticalEntityEquipment>("cone");
  const [grid, setGrid] = useState(() => (coaching || recoveryWorkspace) && coachingExerciseArea(initial).length < 40 ? 1 : 5), [showGrid, setShowGrid] = useState(!recoveryWorkspace), [guides, setGuides] = useState(false), [snap, setSnap] = useState(true), [objects, setObjects] = useState(false);
  const [fit, setFit] = useState<FitMode>(coaching ? "exercise" : "context"), [camera, setCamera] = useState<Camera>(), [rotation, setRotation] = useState<Rotation>(() => startingRotation(initial)), [focus, setFocus] = useState<"delivery" | "box">("delivery");
  const [customArea, setCustomArea] = useState<TrainingArea>(), [framing, setFraming] = useState("Overview");
  // Hold the overview while authoring; moving an outer anchor must not change the pointer projection mid-drag.
  const [exerciseArea, setExerciseArea] = useState(() => coaching ? coachingExerciseArea(initial) : undefined);
  const padding = customArea ? 32 : recoveryWorkspace ? 18 : 24;
  const [example, setExample] = useState("full"), [message, setMessage] = useState("Select objects; Shift adds to selection. Drag to move. Wheel zooms around the pointer."), [expanded, setExpanded] = useState(false), [canvasHeight, setCanvasHeight] = useState<number>();
  const surface = useRef<HTMLDivElement>(null), root = useRef<HTMLDivElement>(null), expandButton = useRef<HTMLButtonElement>(null), gesture = useRef<Gesture | null>(null);
  const retainEditorFocus = useCallback((handle: HTMLButtonElement | null) => {
    if (!handle) return;
    return () => {
      if (document.activeElement !== handle) return;
      // A committed edit or new camera frame can move the focused endpoint out of view.
      queueMicrotask(() => {
        if (document.activeElement === document.body) root.current?.focus({ preventScroll: true });
      });
    };
  }, []);
  const stageSettings = useRef<HTMLDetailsElement>(null);
  const live = useRef({ scene, fit, camera, rotation, focus, customArea, padding, exerciseArea });
  useEffect(() => { live.current = { scene, fit, camera, rotation, focus, customArea, padding, exerciseArea }; }, [scene, fit, camera, rotation, focus, customArea, padding, exerciseArea]);
  // A local acknowledged save changes the warning baseline without resetting undo history.
  useEffect(() => { onDirty(JSON.stringify(scene) !== JSON.stringify(dirtyBaseline ?? initial)); }, [scene, initial, dirtyBaseline, onDirty]);
  /** Validate and commit one undoable edit; rejected geometry leaves the last valid scene intact. */
  const edit = (next: TacticalScene, before?: TacticalScene) => {
    try { const valid = prepareScene(next); setPlaying(false); syncStageTime(valid); setHistory((h) => recordEdit(h, valid, before)); setMessage("Diagram updated · geometry retained in metres."); }
    catch { setMessage("Change rejected. Check dimensions, required text, player number (1–99), facing (0–359°) and coordinate limits."); }
  };
  /** Clone the draft before a property mutation so history and source revisions stay immutable. */
  const mutate = (operation: (draft: TacticalScene) => void) => { const draft = structuredClone(scene); operation(draft); edit(draft); };
  /** Catch bounded geometry-operation failures and report them without breaking the editor. */
  const operate = (operation: () => TacticalScene) => { try { edit(operation()); } catch (error) { setMessage(error instanceof Error ? error.message : "Change rejected: object spacing or movement exceeds the supported world limits."); } };
  /** Seeking is view-only; pose-boundary editing can retain the deliberately selected stage. */
  function seek(value: number, followStage = true) {
    cancelEndpoint();
    setPlaying(false);
    const next = Math.max(0, Math.min(duration, value));
    clock.current = next;
    setSeconds(next);
    if (followStage) selectStage(evaluateScene(scene, next).stage?.id ?? "");
  }
  function clearAnnotationSelection() { setSelected(ids => ids.filter(id => !id.startsWith("annotation:"))); }
  function selectStage(id: string) {
    if (id !== stage?.id) clearAnnotationSelection();
    setStageId(id);
  }
  /** Keep the same selected stage/local pose through edits and history; a removed stage follows the clamped playhead. */
  function syncStageTime(next: TacticalScene) {
    if (!animation) return;
    const nextRanges = stageRanges(next), same = nextRanges.find((r) => r.stage.id === stage?.id);
    const value = same ? same.start + Math.min(localTime, same.stage.durationSeconds) : Math.min(time, sceneDuration(next));
    const current = same ?? nextRanges.find((r) => value < r.end) ?? nextRanges.at(-1);
    selectStage(current?.stage.id ?? ""); clock.current = value; setSeconds(value);
  }
  /** History restores the exact scene and keeps the inspector's selection/time attached to the same stage identity. */
  function historyStep(direction: "undo" | "redo") { cancelEndpoint(); setPlaying(false); const next = travel(history, direction); syncStageTime(next.present); setHistory(next); }
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
  const frame = (value: FitMode, source = scene) => { cancelEndpoint(); setFit(coaching && value === "context" ? "exercise" : value); if (coaching) setExerciseArea(coachingExerciseArea(source)); setCamera(undefined); setCustomArea(undefined); setFraming(value === "all" ? "All content" : value === "pitch" ? "Field overview" : "Overview"); };
  /** Snapshot the selected stage's complete action, not each animation frame. Refit is always explicit. */
  function frameAction(detail = false, source = scene, id = stage?.id ?? "", orientExample = false) {
    cancelEndpoint();
    const target = actionFrame(source, id, detail ? selected : undefined);
    if (!target) { setMessage("Select a visible player, ball or tactical overlay in this stage to focus it."); return; }
    if (!target.points.length) { frame("context"); setMessage("No visible action in this stage; showing the exercise overview."); return; }
    setCustomArea(target.area); setFit("custom"); setCamera(undefined);
    if (orientExample) {
      const rect = surface.current?.querySelector(".scene-diagram")?.getBoundingClientRect();
      if (rect && rect.width >= 120 && rect.height >= 120) {
        const options = { width: rect.width, height: rect.height, padding: 32, fit: "custom" as const, customArea: target.area };
        setRotation(fitViewport(source, { ...options, rotation: 270 }).scale > fitViewport(source, { ...options, rotation: 0 }).scale ? 270 : 0);
      }
    }
    const label = `${detail ? "Detail" : "Action"} · ${source.stages.find((s) => s.id === id)?.title ?? "stage"}`;
    setFraming(label); setMessage(`${label}. View held through playback and stage changes; use Fit stage to frame another action.`);
  }
  /** Resolve the live measured SVG projection for pointer picking and keyboard camera commands. */
  function projection() {
    const el = surface.current?.querySelector(".scene-diagram"), rect = el?.getBoundingClientRect();
    return rect && rect.width >= 120 && rect.height >= 120 ? fitViewport(live.current.scene, { width: rect.width, height: rect.height, padding: live.current.padding, fit: live.current.fit, exerciseArea: live.current.exerciseArea, customArea: live.current.customArea, camera: live.current.camera, rotation: live.current.rotation, setPieceFocus: live.current.focus, includeContextGoals: true }) : null;
  }
  /** Keep the world point beneath the pointer stationary while clamping view-only zoom. */
  function zoom(factor: number, anchor?: Point) {
    if (gesture.current?.kind === "endpoint") return;
    const view = projection(); if (!view) return;
    const point = anchor ?? { x: view.width / 2, y: view.height / 2 }, before = screenToWorld(point, view), zoom = Math.max(.1, Math.min(8, (live.current.camera?.zoom ?? 1) * factor));
    const projected = fitViewport(live.current.scene, { width: view.width, height: view.height, padding: live.current.padding, fit: live.current.fit, exerciseArea: live.current.exerciseArea, customArea: live.current.customArea, rotation: live.current.rotation, setPieceFocus: live.current.focus, camera: { center: view.center, zoom }, includeContextGoals: true });
    const after = screenToWorld(point, projected);
    const next = { center: { x: view.center.x + before.x - after.x, y: view.center.y + before.y - after.y }, zoom };
    if (Math.abs(next.center.x) <= 20_000 && Math.abs(next.center.y) <= 20_000) { live.current.camera = next; setCamera(next); }
  }
  useEffect(() => {
    const node = surface.current; if (!node) return;
    /** Prevent page scrolling only over the canvas and forward wheel intent to pointer-anchored zoom. */
    const wheel = (event: WheelEvent) => {
      const board = node.querySelector(".scene-diagram");
      if (!board || !(event.target instanceof Node) || !board.contains(event.target)) return;
      event.preventDefault();
      const rect = board.getBoundingClientRect();
      zoom(Math.exp(-event.deltaY * .0015), { x: event.clientX - rect.left, y: event.clientY - rect.top });
    };
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
    if (selected.length && stageSettings.current) stageSettings.current.open = true;
  }, [selected, animation]);
  useEffect(() => {
    const element = surface.current; if (!element) return;
    /** Reserve visible viewport space for the canvas without resizing it in response to page scrolling. */
    const bottomSpace = animation ? 175 : recoveryWorkspace ? 8 : 76;
    const measure = () => setCanvasHeight(Math.max(animation ? 230 : 280, window.innerHeight - (element.getBoundingClientRect().top + (expanded ? (root.current?.scrollTop ?? 0) : window.scrollY)) - bottomSpace));
    const observer = new ResizeObserver(measure);
    observer.observe(element.parentElement!);
    const toolbar = recoveryWorkspace ? root.current?.querySelector(".editor-command-strip") : null;
    if (toolbar) observer.observe(toolbar);
    measure();
    window.addEventListener("resize", measure); document.addEventListener("toggle", measure, true);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); document.removeEventListener("toggle", measure, true); };
  }, [expanded, animation, recoveryWorkspace]);
  /** Apply metre-grid or nearby-object snapping at a fixed screen-space tolerance. */
  function snapped(at: Point, view: Projection, ids = selected) { return snapPoint(at, animation ? { ...scene, entities: previewEntities } : scene, ids, snap ? grid : null, objects, 10 / view.scale); }
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
    if (event.button !== 0 || gesture.current) return;
    if (playing) { setPlaying(false); return; }
    const start = point(event);
    const hitHandle = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("[data-arrow-endpoint]") : null;
    const hitEndpoint = hitHandle?.dataset.arrowEndpoint;
    if (!event.altKey && hitHandle && (hitEndpoint === "from" || hitEndpoint === "to") && selectedArrow?.annotation.kind === "arrow" && previewPose.stage) {
      event.preventDefault();
      const surface = event.currentTarget, arrow = selectedArrow.annotation;
      const otherEndpoint = hitEndpoint === "from" ? "to" : "from";
      const otherHandle = surface.querySelector<HTMLButtonElement>(`[data-arrow-endpoint="${otherEndpoint}"]`);
      const hitPosition = worldToScreen(arrow[hitEndpoint], view), otherPosition = worldToScreen(arrow[otherEndpoint], view);
      // When short arrows have overlapping targets, prefer the nearer visible endpoint.
      const otherIsCloser = otherHandle && Math.hypot(start.x - otherPosition.x, start.y - otherPosition.y) <
        Math.hypot(start.x - hitPosition.x, start.y - hitPosition.y);
      const endpoint = otherIsCloser ? otherEndpoint : hitEndpoint;
      (otherIsCloser ? otherHandle : hitHandle).focus({ preventScroll: true });
      surface.setPointerCapture(event.pointerId);
      gesture.current = { kind: "endpoint", pointerId: event.pointerId, surface, bounds: surface.getBoundingClientRect(), time, start, view, before: scene,
        stageId: previewPose.stage.id, arrowId: selectedArrow.id, endpoint, anchor: arrow[endpoint], moved: false };
      return;
    }
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); root.current?.focus({ preventScroll: true });
    const from = screenToWorld(start, view), hit = event.target instanceof Element ? event.target.closest("[data-entity-id],[data-annotation-id]") : null;
    const id = hit?.getAttribute("data-entity-id") ? `entity:${hit.getAttribute("data-entity-id")}` : hit?.getAttribute("data-annotation-id") ? `annotation:${hit.getAttribute("data-annotation-id")}` : undefined;
    if (tool === "pan" || event.altKey) { gesture.current = { pointerId: event.pointerId, surface: event.currentTarget, start, view, before: scene, ids: [], kind: "pan", from, tool, moved: false }; return; }
    if (tool === "select") {
      const ids = id ? event.shiftKey ? selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id] : selected.includes(id) ? selected : [id] : [];
      setSelected(ids);
      if (id && !readOnly && ids.includes(id)) gesture.current = { pointerId: event.pointerId, surface: event.currentTarget, start, view, before: scene, ids, kind: "move", from, tool, moved: false, ...(animation && stage ? { poseStage: stage.id, poseSeconds: localTime } : {}) };
    } else if (!readOnly) {
      if (["player", "ball", "equipment", "note"].includes(tool)) addAt(snapped(from, view));
      else gesture.current = { pointerId: event.pointerId, surface: event.currentTarget, start, view, before: scene, ids: [], kind: "draw", from: snapped(from, view), tool, moved: false };
    }
  }
  /** Preview a gesture from its immutable starting scene to avoid accumulating rounding drift. */
  function endpointPosition(drag: EndpointDrag, event: PointerEvent<HTMLDivElement>, view: Projection): Point {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!selectedArrow || selectedArrow.id !== drag.arrowId || scene !== drag.before || time !== drag.time || previewPose.stage?.id !== drag.stageId ||
      bounds.width !== drag.bounds.width || bounds.height !== drag.bounds.height ||
      bounds.left !== drag.bounds.left || bounds.top !== drag.bounds.top || view.scale !== drag.view.scale ||
      view.rotation !== drag.view.rotation || view.center.x !== drag.view.center.x || view.center.y !== drag.view.center.y) {
      throw new Error("The board changed during the drag. Select the endpoint and try again.");
    }
    const start = screenToWorld(drag.start, drag.view);
    const end = screenToWorld(point(event), drag.view);
    // Pointer placement is precise to a millimetre; numeric editing keeps the entered value.
    const x = Math.abs(end.x - start.x) < .0005 ? drag.anchor.x : Number((drag.anchor.x + end.x - start.x).toFixed(3));
    const y = Math.abs(end.y - start.y) < .0005 ? drag.anchor.y : Number((drag.anchor.y + end.y - start.y).toFixed(3));
    return snapped({ x, y }, drag.view);
  }
  function move(event: PointerEvent<HTMLDivElement>, view: Projection) {
    const g = gesture.current;
    if (!g || event.pointerId !== g.pointerId) return;
    if (g.kind === "endpoint") {
      const current = point(event);
      g.moved ||= Math.hypot(current.x - g.start.x, current.y - g.start.y) > 2;
      if (!g.moved) return;
      try {
        const at = endpointPosition(g, event, view);
        const draft = reviseArrow(g.before, g.stageId, g.arrowId, { [g.endpoint]: at });
        setEndpointPreview({ scene: draft, view: g.view, endpoint: g.endpoint, at });
      } catch { setEndpointPreview(undefined); }
      return;
    }
    const screen = point(event), to = screenToWorld(screen, g.view), dx = to.x - g.from.x, dy = to.y - g.from.y;
    g.moved ||= Math.hypot(screen.x - g.start.x, screen.y - g.start.y) > 2;
    if (g.kind === "pan") {
      const center = { x: g.view.center.x - dx, y: g.view.center.y - dy };
      if (Math.abs(center.x) <= 20_000 && Math.abs(center.y) <= 20_000) setCamera({ center, zoom: camera?.zoom ?? 1 });
    } else if (g.kind === "move" && g.moved) {
      const posed = g.poseStage ? { ...g.before, entities: evaluateScene(posePreview(g.before, g.poseStage, time), time).entities } : g.before;
      const anchor = posed.entities.find((e) => g.ids.includes(`entity:${e.id}`))?.position ?? g.from;
      const target = snapPoint({ x: anchor.x + dx, y: anchor.y + dy }, posed, g.ids, snap ? grid : null, objects, 10 / g.view.scale);
      try { const next = moveSelection(g.before, g.ids, target.x - anchor.x, target.y - anchor.y, g.poseStage, g.poseSeconds); setHistory((h) => ({ ...h, present: next })); } catch { setMessage("Movement rejected. Animate players/balls; position equipment in Layout mode."); }
    }
  }
  /** Commit one history entry per drag; clicks and snap-collapsed drags use nonzero defaults. */
  function up(event: PointerEvent<HTMLDivElement>, view: Projection) {
    const g = gesture.current;
    if (!g || g.pointerId !== event.pointerId) return;
    gesture.current = null;
    if (g.kind === "endpoint") {
      setEndpointPreview(undefined);
      if (g.moved) operate(() => reviseArrow(g.before, g.stageId, g.arrowId, { [g.endpoint]: endpointPosition(g, event, view) }));
      return;
    }
    if (g.kind === "move" && g.moved) setHistory((h) => recordEdit(h, h.present, g.before));
    if (g.kind === "draw") {
      const to = snapped(screenToWorld(point(event), g.view), g.view, []);
      addAt(g.from, g.tool, g.moved && Math.hypot(to.x - g.from.x, to.y - g.from.y) > .000001 ? to : undefined);
    }
  }
  /** Restore an interrupted drag without publishing a history entry or saved revision. */
  function cancel(event?: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || (event && event.pointerId !== g.pointerId)) return;
    gesture.current = null;
    if (g.surface.hasPointerCapture(g.pointerId)) g.surface.releasePointerCapture(g.pointerId);
    if (g.kind === "move") setHistory((h) => ({ ...h, present: g.before }));
    if (g.kind === "endpoint") {
      setEndpointPreview(undefined);
      setMessage("Arrow endpoint edit cancelled.");
    }
  }
  function cancelEndpoint() { if (gesture.current?.kind === "endpoint") cancel(); }

  function arrowHandles(view: Projection) {
    if (selectedArrow?.annotation.kind !== "arrow" || !previewPose.stage) return;
    const arrow = selectedArrow.annotation;
    const authoredStage = previewPose.stage.id;
    const hitSize = Math.max(24, Math.min(36, Math.hypot(arrow.from.x - arrow.to.x, arrow.from.y - arrow.to.y) * view.scale));
    return <><span className="sr-only" id={arrowHelpId}>Use arrow keys to move this endpoint. Hold Shift for a larger step. Enter opens coordinates.</span>
      {endpoints.map(endpoint => {
        const at = endpointPreview?.endpoint === endpoint ? endpointPreview.at : arrow[endpoint];
        const screen = worldToScreen(at, view);
        // Keep the captured handle focused if the coach drags it outside the board.
        if (endpointPreview?.endpoint !== endpoint &&
          (screen.x < 0 || screen.x > view.width || screen.y < 0 || screen.y > view.height)) return null;
        const name = endpoint === "from" ? "Start" : "End";
        return <button key={endpoint} ref={retainEditorFocus} type="button" className="arrow-endpoint-handle" data-arrow-endpoint={endpoint}
          aria-label={`${name} arrow endpoint`} aria-describedby={arrowHelpId}
          title={`${name} endpoint · ${at.x.toFixed(2)}, ${at.y.toFixed(2)} m`} style={{ left: screen.x, top: screen.y, "--endpoint-hit-size": hitSize + "px" } as CSSProperties}
          onClick={event => {
            if (event.detail !== 0) return;
            setPropertiesOpen(true);
            const coordinate = endpoint === "from" ? "startX" : "endX";
            requestAnimationFrame(() => root.current?.querySelector<HTMLInputElement>(`[data-arrow-coordinate="${coordinate}"]`)?.focus());
          }}
          onKeyDown={event => {
            if (gesture.current) return;
            const key = event.key.toLowerCase();
            if ((event.ctrlKey || event.metaKey) && (key === "z" || key === "y")) {
              event.preventDefault();
              historyStep(key === "y" || event.shiftKey ? "redo" : "undo");
              return;
            }
            const step = screenSteps.get(event.key);
            if (!step) return;
            event.preventDefault();
            const here = screenToWorld({ x: 0, y: 0 }, view);
            const there = screenToWorld({ x: step[0], y: step[1] }, view);
            const metres = event.shiftKey ? 5 : snap ? grid : .25;
            // A quarter-turn view maps a screen arrow key to exactly one signed world axis.
            const dx = Math.round((there.x - here.x) * view.scale) * metres;
            const dy = Math.round((there.y - here.y) * view.scale) * metres;
            operate(() => reviseArrow(scene, authoredStage, selectedArrow.id, {
              [endpoint]: { x: at.x + dx, y: at.y + dy },
            }));
          }} />;
      })}</>;
  }
  /** Provide object-editing shortcuts outside form inputs and contain focus in expanded-board mode. */
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && gesture.current?.kind === "endpoint") { event.preventDefault(); cancel(); return; }
    if (expanded && event.key === "Escape") { cancel(); setExpanded(false); return; }
    if (expanded && event.key === "Tab") {
      const nodes = [...root.current!.querySelectorAll<HTMLElement>("button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),summary")].filter((n) => n.getClientRects().length);
      if (event.shiftKey && (document.activeElement === nodes[0] || document.activeElement === root.current)) { event.preventDefault(); nodes.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0]?.focus(); }
      return;
    }
    if (event.target instanceof Element && event.target.closest("input,select,textarea,button,a,summary,.screen-diagram-inspection")) return;
    if (event.key === "Escape") { cancel(); setSelected([]); setTool("select"); return; }
    if (readOnly || playing) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") { event.preventDefault(); setSelected([...scene.entities.filter((e) => !animation || e.kind !== "equipment").map((e) => `entity:${e.id}`), ...((animation ? stage : scene.stages[0])?.tracks.filter((t) => t.kind === "annotation").map((t) => `annotation:${t.id}`) ?? [])]); }
    if ((event.ctrlKey || event.metaKey) && ["z", "y"].includes(event.key.toLowerCase())) { event.preventDefault(); historyStep(event.key.toLowerCase() === "y" || event.shiftKey ? "redo" : "undo"); }
    if (["Delete", "Backspace"].includes(event.key) && selected.length) { event.preventDefault(); operate(() => removeObjects(scene, selected, animation ? stage?.id : undefined)); setSelected([]); }
    const direction = screenSteps.get(event.key);
    if (direction && selected.length) {
      event.preventDefault(); const view = projection(); if (!view) return;
      const a = screenToWorld({ x: 0, y: 0 }, view), b = screenToWorld({ x: direction[0], y: direction[1] }, view), step = event.shiftKey ? 5 : snap ? grid : .25;
      operate(() => moveSelection(scene, selected, (b.x - a.x) * view.scale * step, (b.y - a.y) * view.scale * step, animation ? stage?.id : undefined, localTime));
    }
  }
  const ghostIds = selected.filter((id) => id.startsWith("entity:") && !stage?.hiddenEntityIds?.includes(id.slice(7)));
  const ghostStarts = animation && ghosts && !playing && stage && ghostIds.length ? stageStart(scene, stage.id) : [];
  const ghostPositions = animation && ghosts && !playing && stage ? ghostIds.flatMap((id) => {
    const entity = ghostStarts.find((e) => `entity:${e.id}` === id), track = stage.tracks.find((t) => t.kind !== "annotation" && `entity:${t.entityId}` === id);
    return entity ? [{ id: `${entity.id}-start`, position: entity.position, label: "Start" }, ...(track && track.kind !== "annotation" ? [{ id: `${entity.id}-end`, position: track.keyframes.at(-1)!.position, label: "End" }] : [])] : [];
  }) : [];
  const exampleControls = <>
      <label>Example setup<select aria-label="Example setup" value={example} disabled={readOnly} onChange={(e) => setExample(e.target.value)}><optgroup label="Static diagrams">{editorExamples.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}</optgroup><optgroup label="Animation examples">{animationExamples.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}</optgroup></select></label>
      <button disabled={readOnly} onClick={() => { const e = [...editorExamples, ...animationExamples].find((e) => e.id === example)!; edit({ ...structuredClone(e.scene), id: scene.id, revision: scene.revision, organizationId: scene.organizationId }); setSelected([]); setStageId(e.scene.stages[0]?.id ?? ""); setSeconds(0); clock.current = 0; setAnimation(example.startsWith("animation-")); frame("context", e.scene); setRotation(startingRotation(e.scene)); if (example.startsWith("animation-") && example !== "animation-full") frameAction(false, e.scene, e.scene.stages[0].id, true); }}>Apply setup</button>
    </>;
  const fitControls = animation ? <><button aria-pressed={!customArea && fit === "context" && !camera} onClick={() => frame("context")}>Overview</button><button aria-label="Fit stage / Action" aria-pressed={!!customArea && framing.startsWith("Action") && !camera} onClick={() => frameAction()}>Fit stage</button><button aria-label="Detail / Focus selection" disabled={!selected.length} aria-pressed={!!customArea && framing.startsWith("Detail") && !camera} onClick={() => frameAction(true)}>Detail</button></> : <><button onClick={() => frame("context")}>Fit exercise</button><button onClick={() => frame("all")}>Fit all</button><button onClick={() => frame("pitch")}>{scene.context?.kind === "neutral" ? "Fit boundary" : "Fit pitch"}</button></>;
  const selectedEntity = selected.length === 1 ? previewEntities.find(entity => selected[0] === `entity:${entity.id}`) : undefined;
  const selectedTrack = selected.length === 1 ? (animation ? stage : scene.stages[0])?.tracks.find(track => track.kind === "annotation" && selected[0] === `annotation:${track.id}`) : undefined;
  const selectionLabel = selectedEntity?.kind === "player" ? `Player ${selectedEntity.number}`
    : selectedEntity?.kind === "equipment" ? selectedEntity.equipment : selectedEntity?.kind === "ball" ? "Ball"
    : selectedTrack?.kind === "annotation" ? { arrow: "Arrow", area: "Training zone", note: "Note" }[selectedTrack.annotation.kind]
    : selected.length ? `${selected.length} selected` : "Diagram";
  const technicalSection = (label: string, content: React.ReactNode, open = false) => recoveryWorkspace
    ? <details className="recovery-board-option" open={open || undefined}><summary>{label}</summary><div>{content}</div></details>
    : <section><h2>{label}</h2>{content}</section>;
  const closeToolbarMenu = (menu: HTMLDetailsElement) => {
    menu.open = false;
    menu.querySelector("summary")?.focus();
  };
  const toolbarMenu = (label: string, content: React.ReactNode) =>
    <details className="recovery-toolbar-menu" onClick={e => {
      if (e.target instanceof Element && e.target.closest("button")) closeToolbarMenu(e.currentTarget);
    }} onKeyDown={e => {
      if (e.key !== "Escape" || !e.currentTarget.open) return;
      e.stopPropagation();
      closeToolbarMenu(e.currentTarget);
    }}><summary>{label}</summary><div>{content}</div></details>;
  const topbar = <div className="editor-topbar"><div className="editor-mode" aria-label="Authoring mode"><button aria-pressed={!animation} onClick={() => { cancelEndpoint(); if (animation) clearAnnotationSelection(); setPlaying(false); setAnimation(false); setSeconds(0); clock.current = 0; }}>Layout</button><button aria-pressed={animation} onClick={() => { cancelEndpoint(); if (!animation) { clearAnnotationSelection(); setStageId(scene.stages[0]?.id ?? ""); } setPlaying(false); setAnimation(true); setTool("select"); if (!scene.stages.length && !readOnly) operate(() => appendStage(scene)); }}>Animation</button></div>
      {recoveryWorkspace ? toolbarMenu("Examples", exampleControls) : exampleControls}
      <button type="button" aria-expanded={propertiesOpen} aria-controls={propertiesId} onClick={() => setPropertiesOpen(open => !open)}>{propertiesOpen ? "Hide properties" : "Properties"}</button><span className="editor-spacer" /><button aria-label="Undo" disabled={readOnly || !history.past.length} onClick={() => historyStep("undo")}>↶{!recoveryWorkspace && " Undo"}</button><button aria-label="Redo" disabled={readOnly || !history.future.length} onClick={() => historyStep("redo")}>↷{!recoveryWorkspace && " Redo"}</button>
      <button className="calendar-primary" disabled={!canSave || !!endpointPreview} onClick={() => { cancelEndpoint(); setPlaying(false); void onSave(scene); }}>{saveLabel}</button></div>;
  const pitchTools = <div className="editor-pitch-tools">
      <div className="editor-tools" role="toolbar" aria-label="Drawing tools">{tools.map(([id, label, Icon]) => <button key={id} title={label.slice(2)} aria-pressed={tool === id} disabled={readOnly && !["select", "pan"].includes(id) || animation && ["player", "ball", "equipment"].includes(id)} onClick={() => { cancelEndpoint(); setTool(id); }}><Icon size={17} aria-hidden="true" /><span className="sr-only">{label}</span></button>)}</div>
      <div className="editor-viewbar">{recoveryWorkspace
        ? toolbarMenu("Fit", fitControls)
        : fitControls}
        <label>Camera rotation<select aria-label="Camera rotation" value={rotation} onChange={(e) => { cancelEndpoint(); setRotation(Number(e.target.value) as Rotation); setCamera(undefined); }}>{[0, 90, 180, 270].map((v) => <option key={v} value={v}>{v}°</option>)}</select></label>
        {scene.context?.kind === "pitch" && scene.context.region === "set-piece" && <label>Focus<select aria-label="Set-piece focus" value={focus} onChange={(e) => { setFocus(e.target.value as typeof focus); frame("context"); }}><option value="delivery">Delivery + box</option><option value="box">Penalty box</option></select></label>}
        <span className="editor-spacer" /><button onClick={() => zoom(.8)} aria-label="Zoom out">−</button><button onClick={() => zoom(1.25)} aria-label="Zoom in">+</button><button ref={expandButton} onClick={() => { cancelEndpoint(); setExpanded(!expanded); }}>{expanded ? "Exit board" : "Expand board"}</button></div>
    </div>;
  return <div ref={root} className={`tactical-editor${coaching ? " editor-coaching" : ""}${animation ? " editor-animation" : ""}${expanded ? " editor-expanded" : ""}${recoveryWorkspace ? " recovery-tactical-editor" : ""}`} data-properties-open={propertiesOpen || undefined} tabIndex={0} role={expanded ? "dialog" : "region"} aria-modal={expanded || undefined} aria-label="Tactical diagram editor" onKeyDown={keyboard}>
    {recoveryWorkspace ? <div className="editor-command-strip">{pitchTools}{topbar}</div> : <>{topbar}{pitchTools}</>}
    <div className="editor-layout"><section className="editor-canvas-column" aria-label="Drawing workspace">
      {coaching && <p className="editor-gesture-guidance" role="status" aria-label="Drawing guidance" aria-live="polite">{tool === "select" && animation ? "Drag a player or ball for its timed pose; drag arrows, areas or notes for the active stage. Shift + click toggles selection. Place equipment in Layout." : gestureGuidance[tool]} Esc cancels the current gesture{expanded ? " and exits the expanded board" : ""}. {readOnly ? "Editing and undo are unavailable while the diagram is read only." : "Ctrl/Cmd + Z undoes."}</p>}
      <div ref={surface} className={`editor-surface editor-tool-${tool}${recoveryWorkspace ? " recovery-turf" : ""}`}
        style={{
          height: !coaching && !recoveryWorkspace ? canvasHeight ?? 360 : undefined,
          "--editor-available-height": recoveryWorkspace && canvasHeight !== undefined ? `${canvasHeight}px` : undefined,
        } as CSSProperties}>
        <SceneDiagram scene={endpointPreview?.scene ?? scene} title="Editable tactical diagram" screenMode={coaching || expanded || recoveryWorkspace ? "expanded" : "standard"} options={{ padding, fit, surface: recoveryWorkspace ? "transparent" : undefined, paint: coaching || recoveryWorkspace ? "coaching-light" : undefined, exerciseArea, customArea, camera, rotation, setPieceFocus: focus, seconds: time, poseStageId: animation && !playing ? stage?.id : undefined, gridMetres: showGrid ? grid : undefined, guides, labels: true, paths: animation ? paths : "stage", selectedIds: selected, ghosts: ghostPositions }} interaction={{ down, move, up, cancel, lostCapture: cancel, overlay: arrowHandles, heldView: endpointPreview?.view }} />
      </div>
      <div className="editor-status"><span>{animation ? `${framing}${camera ? " · manual" : ""}` : "Blue / red · yellow neutral"}</span><span>→ Pass · ⇢ Run · Press · ↝ Rotation</span><span>{scene.entities.length} objects · {selected.length} selected · {Math.round((camera?.zoom ?? 1) * 100)}% · {rotation}°</span></div>
      {animation && <AnimationTimeline scene={scene} selected={stage?.id ?? ""} seconds={time} playing={playing} speed={speed} disabled={readOnly} onSeek={seek} onStage={(id) => { const r = stageRanges(scene).find((s) => s.stage.id === id)!; seek(r.start, false); selectStage(id); }} onPlay={() => { if (playing) setPlaying(false); else { cancelEndpoint(); clearAnnotationSelection(); clock.current = time >= duration ? 0 : time; setSeconds(clock.current); setPlaying(true); } }} onRestart={() => seek(0)} onSpeed={setSpeed} onAdd={() => { try { cancelEndpoint(); const next = appendStage(scene); edit(next); const r = stageRanges(next).at(-1)!; selectStage(r.stage.id); clock.current = r.start; setSeconds(r.start); } catch { setMessage("Stage limit reached."); } }} />}
      <p role="status" className="editor-feedback">{message}</p>
      <details className="editor-object-list"><summary>Objects & keyboard selection · {scene.entities.length} anchors</summary><div>{previewEntities.map((e) => <button key={e.id} data-object-id={e.id} aria-pressed={selected.includes(`entity:${e.id}`)} onClick={(event) => setSelected(event.shiftKey ? [...new Set([...selected, `entity:${e.id}`])] : [`entity:${e.id}`])}>{e.kind === "player" ? `${e.team.toUpperCase()} #${e.number}` : e.kind === "equipment" ? e.equipment : "Ball"} · {e.position.x.toFixed(1)}, {e.position.y.toFixed(1)} m</button>)}{(animation ? stage : scene.stages[0])?.tracks.filter((t) => t.kind === "annotation").map((t) => t.kind === "annotation" && <button key={t.id} disabled={playing} aria-pressed={selected.includes(`annotation:${t.id}`)} onClick={() => setSelected([`annotation:${t.id}`])}>{t.annotation.kind === "arrow" ? `${t.annotation.movement} route` : t.annotation.kind === "area" ? t.annotation.label : t.annotation.text}</button>)}</div></details>
    </section><aside id={propertiesId} hidden={!propertiesOpen} className="editor-inspector" aria-label="Contextual properties">
      <header className="editor-inspector-heading"><h2>Properties</h2><span>{recoveryWorkspace ? selectionLabel : selected.length ? `${selected.length} selected` : "Diagram"}</span></header>
      <fieldset disabled={readOnly || playing || !!endpointPreview}>
      {recoveryWorkspace && <EditorProperties scene={scene} selected={selected} mutate={mutate} edit={edit} onFrame={() => frame("context")} animation={animation} stageId={animation ? stage?.id : undefined} collapseField />}
      {animation && (recoveryWorkspace
        ? <details ref={stageSettings} className="recovery-board-option"><summary>Stage settings</summary><div><AnimationProperties scene={scene} stageId={stage?.id ?? ""} selected={selected} seconds={time} onSeekPose={(value) => seek(value, false)} operate={operate} /></div></details>
        : <AnimationProperties scene={scene} stageId={stage?.id ?? ""} selected={selected} seconds={time} onSeekPose={(value) => seek(value, false)} operate={operate} />)}
      {technicalSection("Object tools", <><div className="editor-row"><label>New team<select aria-label="New player team" value={team} disabled={animation} onChange={(e) => setTeam(e.target.value as typeof team)}><option value="a">Blue</option><option value="b">Red</option><option value="neutral">Neutral</option></select></label><label>Equipment<select aria-label="Equipment kind" value={equipment} disabled={animation} onChange={(e) => setEquipment(e.target.value as TacticalEntityEquipment)}>{["cone", "pole", "goal", "mannequin", "marker", "ladder"].map((k) => <option key={k}>{k}</option>)}</select></label></div>
        <button disabled={["select", "pan"].includes(tool)} onClick={() => { const view = projection(); if (view) addAt(snapped(view.center, view)); }}>Insert at centre</button>
        <button disabled={!selected.length} onClick={() => { operate(() => removeObjects(scene, selected, animation ? stage?.id : undefined)); setSelected([]); }}>Delete selected</button>{animation && <p className="calendar-muted">Use Layout to add players, balls and equipment. Overlays belong to the selected stage.</p>}</>, tool !== "select" && tool !== "pan")}
      {!recoveryWorkspace && <EditorProperties scene={scene} selected={selected} mutate={mutate} edit={edit} onFrame={() => frame("context")} animation={animation} stageId={animation ? stage?.id : undefined} />}
      {!animation && technicalSection("Arrange selection", <><div className="editor-button-grid">{(["x", "y"] as const).map((axis) => <button key={axis} disabled={selected.length < 2} onClick={() => operate(() => arrangeObjects(scene, selected, axis))}>Align {axis.toUpperCase()}</button>)}{(["x", "y"] as const).map((axis) => <button key={axis} disabled={selected.length < 3} onClick={() => operate(() => arrangeObjects(scene, selected, axis, true))}>Distribute {axis.toUpperCase()}</button>)}</div>
        <form onSubmit={(e) => { e.preventDefault(); const data = new FormData(e.currentTarget); try { edit(arrangeObjects(scene, selected, data.get("axis") as "x" | "y", true, Number(data.get("spacing")))); } catch (failure) { setMessage(failure instanceof Error ? failure.message : "Invalid spacing"); } }}><label>Centre spacing (m)<input name="spacing" aria-label="Centre spacing" type="number" min=".01" max="1000" step="any" defaultValue="5" required /></label><label>Spacing axis<select name="axis"><option value="x">World X</option><option value="y">World Y</option></select></label><button disabled={selected.length < 2}>Apply spacing</button></form>
      </>, selected.length > 1)}</fieldset>
      {technicalSection("Grid & guides", <><label className="editor-check"><input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />Metric grid</label><label>Grid spacing<select aria-label="Grid spacing" value={grid} onChange={(e) => setGrid(Number(e.target.value))}>{[.5, 1, 2, 5, 10].map((v) => <option key={v} value={v}>{v} m</option>)}</select></label>
        <label className="editor-check"><input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} />Snap to grid</label><label className="editor-check"><input type="checkbox" checked={objects} onChange={(e) => setObjects(e.target.checked)} />Snap to objects</label><label className="editor-check"><input type="checkbox" checked={guides} onChange={(e) => setGuides(e.target.checked)} />Thirds & channels</label></>)}
      {animation && technicalSection("Authoring display", <><div className="editor-button-grid"><button onClick={() => frame("context")}>Fit exercise</button><button onClick={() => frame("all")}>Fit all</button><button onClick={() => frame("pitch")}>{scene.context?.kind === "neutral" ? "Fit boundary" : "Fit pitch"}</button></div><p className="calendar-muted">Fit stage captures the selected stage, including path endpoints. The view stays held until you refit, pan or zoom.</p><label className="editor-check"><input type="checkbox" checked={ghosts} onChange={(e) => setGhosts(e.target.checked)} />Start / end ghosts</label><label>Movement paths<select aria-label="Movement paths" value={paths} onChange={(e) => setPaths(e.target.value as typeof paths)}><option value="active">Relevant active paths</option><option value="stage">Current stage paths</option><option value="none">Hide paths</option></select></label></>)}
      <p className="calendar-muted editor-help">Shift + click selects a group. Arrow keys move in screen direction; Shift moves 5 m. Ctrl/Cmd Z undoes; Shift Z redoes. Alt + drag pans. Esc cancels. {animation ? "Pose edits are stage-local; shared boundaries remain connected." : "Layout changes move an object's entire path; Animation edits a timed pose."}</p>
    </aside></div>
  </div>;
}
