import type { TacticalEntity, TacticalScene, TrainingArea } from "../domain/tactical-scene";
import { evaluateScene, prepareScene, type Point } from "./evaluate";
import { fitViewport, metricGrid, worldToScreen, equipmentFootprint, screenRectangle, type FitMode, type Camera, type Projection, type Rotation } from "./viewport";
import { contextArea } from "./context";
import { tacticalPalette as defaultPaint, coachingLightPalette, type TacticalPaint } from "./palette";
import { posePreview } from "./animation";
import { boxesOverlap, grassGrain, numberInk, screenCoachingPalette, screenGlyphs, screenLabelBox, sizePlayerDiscs, type DiagramSize, type ScreenBox } from "./screen-presentation";

export const TACTICAL_RENDERER_VERSION = "svg-2d/1.3.0";

export type SvgNode = { tag: "g" | "rect" | "line" | "circle" | "path" | "polyline" | "polygon" | "text" | "title" | "defs" | "pattern" | "linearGradient" | "stop"; attrs: Record<string, string | number>; children?: SvgNode[]; text?: string };
export type DrawingOptions = { width: number; height: number; padding?: number; fit?: FitMode; exerciseArea?: TrainingArea; authoredArea?: TrainingArea; customArea?: TrainingArea; camera?: Camera; seconds?: number; poseStageId?: string; gridMetres?: number; guides?: boolean; labels?: boolean; paths?: "stage" | "active" | "none"; markings?: "auto" | "football" | "boundary" | "none"; rotation?: Rotation; setPieceFocus?: "delivery" | "box"; contextMask?: boolean; selectedIds?: string[]; ghosts?: { id: string; position: Point; label: string }[]; paint?: "coaching-light"; screen?: { mode: DiagramSize; id: string; sizingSeconds?: number; inspected?: string } };
export type DiagramDetail = { id: string; kind: "annotation" | "player"; text: string };
export type SceneDrawing = { nodes: SvgNode[]; view: Projection; sceneId: string; revision: number; seconds: number; stage: string | null; gridSpacing: number | null; clippedEntities: number; croppedDetails: number; outsideField: number; labelCollisions: number; anchors: { id: string; world: Point; screen: Point }[]; screen?: { numberSize: number; playerDiameter: number; numbersHidden: boolean; crowded: boolean; playerOverlaps: number; deferredLabels: number; details: DiagramDetail[] } };
const node = (tag: SvgNode["tag"], attrs: SvgNode["attrs"], text?: string, children?: SvgNode[]): SvgNode => ({ tag, attrs, ...(text === undefined ? {} : { text }), ...(children ? { children } : {}) });
const line = (a: Point, b: Point, attrs: SvgNode["attrs"]) => node("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, ...attrs });
const title = (text: string) => node("title", {}, text);
type Box = ScreenBox;

/** One portable drawing tree drives React, standalone SVG and later illustrated exports. No persisted geometry is changed. */
export function drawScene(input: unknown, options: DrawingOptions): SceneDrawing {
  const profile = options.screen;
  const glyphs = profile && screenGlyphs(profile.mode, options.width, options.height);
  const compact = profile?.mode === "compact";
  const light = options.paint === "coaching-light";
  const c = light ? profile ? screenCoachingPalette : coachingLightPalette : defaultPaint;
  const numberSize = glyphs?.numberSize ?? 13;
  const scene = prepareScene(input), seconds = options.seconds ?? 0, evaluated = evaluateScene(options.poseStageId ? posePreview(scene, options.poseStageId, seconds) : scene, seconds);
  const view = fitViewport(scene, {
    ...options, fit: options.fit ?? "exercise", compact, includeContextGoals: !!profile,
    padding: compact && glyphs ? Math.max(8, Math.ceil(glyphs.radius + 3)) : options.padding,
  });
  const p = (point: Point) => worldToScreen(point, view), nodes: SvgNode[] = [];
  const displayed = evaluated.entities.filter(entity => !evaluated.hiddenEntityIds.includes(entity.id));
  const boxAround = (point: Point, inset: number): Box => ({ x: point.x - inset, y: point.y - inset, w: 2 * inset, h: 2 * inset });
  const equipmentBox = (entity: TacticalEntity, anchor: Point, padding: number): Box => {
    const points = equipmentFootprint(entity).map(p);
    if (points.length === 1) return boxAround(anchor, padding);
    const x = Math.min(...points.map(q => q.x)), y = Math.min(...points.map(q => q.y));
    return { x: x - 1, y: y - 1, w: Math.max(...points.map(q => q.x)) - x + 2, h: Math.max(...points.map(q => q.y)) - y + 2 };
  };
  // Keep size stable while browsing stages. Inspection uses the saved moment and editing uses the base layout.
  const sizingPose = profile?.sizingSeconds === undefined ? undefined
    : profile.sizingSeconds === seconds && !options.poseStageId ? evaluated : evaluateScene(scene, profile.sizingSeconds);
  const sizingEntities = sizingPose ? sizingPose.entities.filter(entity => !sizingPose.hiddenEntityIds.includes(entity.id)) : scene.entities;
  const discs = profile && glyphs ? sizePlayerDiscs(profile.mode, glyphs,
    sizingEntities.filter(entity => entity.kind === "player").map(entity => p(entity.position)),
    sizingEntities.filter(entity => entity.kind !== "player").map(entity => equipmentBox(entity, p(entity.position), compact ? 3 : 7)),
    view.width, view.height) : undefined;
  const radius = discs?.radius ?? 13;
  const markerExtent = discs?.extent ?? 19;
  const rect = (origin: Point, length: number, width: number, attrs: SvgNode["attrs"]) => node("rect", { ...screenRectangle(origin, length, width, view), ...attrs });
  const worldLine = (from: Point, to: Point, attrs: SvgNode["attrs"]) => line(p(from), p(to), attrs);
  const text = (at: Point, value: string, attrs: SvgNode["attrs"] = {}) => node("text", { x: at.x, y: at.y, fill: c.label, fontSize: 11, fontFamily: "Arial, sans-serif", ...attrs }, value);
  const neutral = scene.context?.kind === "neutral";
  nodes.push(node("rect", { width: view.width, height: view.height, fill: neutral ? c.field : c.surround }));
  nodes.push(rect({ x: 0, y: 0 }, scene.field.length, scene.field.width, { fill: c.field }));
  const shine = profile ? `url(#${profile.id}-disc)` : "";
  if (profile) {
    const origin = p({ x: 0, y: 0 });
    const stripeArea = options.fit === "exercise" && options.exerciseArea
      ? options.exerciseArea.length : scene.field.length;
    const stripe = Math.max(5, stripeArea / (stripeArea >= 70 ? 10 : 6) * view.scale);
    const transform = `translate(${origin.x} ${origin.y}) rotate(${view.rotation})`;
    const definitions = [
      node("pattern", { id: `${profile.id}-mow`, width: stripe * 2, height: 1, patternUnits: "userSpaceOnUse", patternTransform: transform }, undefined,
        [node("rect", { width: stripe, height: 1, fill: c.stripe })]),
      node("linearGradient", { id: `${profile.id}-disc`, x1: "0%", x2: "0%", y1: "0%", y2: "100%" }, undefined, [
        node("stop", { offset: "0%", stopColor: "#ffffff", stopOpacity: .20 }),
        node("stop", { offset: "40%", stopColor: "#ffffff", stopOpacity: 0 }),
        node("stop", { offset: "70%", stopColor: "#000000", stopOpacity: 0 }),
        node("stop", { offset: "100%", stopColor: "#000000", stopOpacity: .20 }),
      ]),
    ];
    if (!compact) definitions.push(
      node("linearGradient", { id: `${profile.id}-light`, x1: "4%", y1: "0%", x2: "90%", y2: "100%" }, undefined, [
        node("stop", { offset: "0%", stopColor: "#ebf4d7", stopOpacity: .13 }),
        node("stop", { offset: "54%", stopColor: "#ebf4d7", stopOpacity: .025 }),
        node("stop", { offset: "100%", stopColor: "#203e29", stopOpacity: .15 }),
      ]),
      node("pattern", { id: `${profile.id}-grain`, width: 97, height: 97, patternUnits: "userSpaceOnUse", patternTransform: transform }, undefined, [
        node("path", { d: grassGrain, stroke: "#edf7e2", strokeWidth: .7, strokeOpacity: .17 }),
        node("path", { d: grassGrain, stroke: "#263e2c", strokeWidth: .85, strokeOpacity: .17, transform: "translate(2 1)" }),
      ]),
    );
    nodes.push(node("defs", {}, undefined, definitions));
    nodes.push(rect({ x: 0, y: 0 }, scene.field.length, scene.field.width, { fill: `url(#${profile.id}-mow)` }));
    if (!compact) nodes.push(
      rect({ x: 0, y: 0 }, scene.field.length, scene.field.width, { fill: `url(#${profile.id}-light)` }),
      rect({ x: 0, y: 0 }, scene.field.length, scene.field.width, { fill: `url(#${profile.id}-grain)` }),
    );
  } else {
    for (let i = 0; i < 10; i += 2) nodes.push(rect({ x: scene.field.length * i / 10, y: 0 }, scene.field.length / 10, scene.field.width, { fill: c.stripe }));
  }
  let gridSpacing: number | null = null;
  if (!compact && options.gridMetres !== undefined) {
    const grid = metricGrid(view, scene.field, options.gridMetres); gridSpacing = grid.spacing;
    const style = { stroke: c.grid, strokeWidth: light ? 0.6 : 0.7, opacity: light ? profile ? 0.13 : 0.2 : 0.42 };
    grid.x.forEach((x) => nodes.push(worldLine({ x, y: 0 }, { x, y: scene.field.width }, style)));
    grid.y.forEach((y) => nodes.push(worldLine({ x: 0, y }, { x: scene.field.length, y }, style)));
  }
  const mark = { stroke: c.line, strokeWidth: 1.4, fill: "none", opacity: profile ? 1 : 0.9 };
  const markingStart = nodes.length;
  if (options.markings !== "none") {
    if (!neutral || scene.context?.kind === "neutral" && scene.context.boundary) nodes.push(rect({ x: 0, y: 0 }, scene.field.length, scene.field.width, { ...mark, ...(profile && neutral ? { strokeDasharray: "6 4" } : {}), "data-field-marking": neutral ? "training-boundary" : "touchlines" }));
    if (!neutral && (options.markings === "football" || ((options.markings !== "boundary" || profile && options.fit === "pitch") && scene.field.length >= 70 && scene.field.width >= 45))) {
      nodes.push(...footballMarkings(scene, view, c, !!profile));
    }
    const boundary = profile ? options.authoredArea ?? (scene.context?.kind === "pitch" && scene.context.region === "custom" ? scene.context.area : undefined)
      : options.markings === "boundary" ? options.exerciseArea : undefined;
    if (boundary && (boundary.length !== scene.field.length || boundary.width !== scene.field.width || boundary.origin.x !== 0 || boundary.origin.y !== 0)) {
      nodes.push(rect(boundary.origin, boundary.length, boundary.width, { ...mark, ...(profile ? { strokeDasharray: "6 4" } : {}), "data-field-marking": "exercise-boundary" }));
    }
    if (scene.context?.kind === "pitch") for (const right of [false, true]) {
      const anchor = { x: right ? scene.field.length : 0, y: scene.field.width / 2 };
      if (scene.entities.some((e) => e.kind === "equipment" && e.equipment === "goal" && Math.hypot(e.position.x - anchor.x, e.position.y - anchor.y) < 0.1)) continue;
      const corners = equipmentFootprint({ id: "context-goal", kind: "equipment", equipment: "goal", headingDegrees: right ? 180 : 0, position: anchor }).map(p);
      if (profile) nodes.push(...equipmentFrame(corners, c, "goal", compact, true));
      else nodes.push(node("polygon", { points: corners.map((q) => `${q.x},${q.y}`).join(" "), fill: c.line, fillOpacity: 0.1, stroke: c.line, strokeWidth: 1.5, "data-field-marking": "goal" }));
    }
  }
  if (light) {
    const outlines: SvgNode[] = nodes.slice(markingStart).filter(n => n.attrs.stroke && !n.attrs["data-equipment-detail"]).map(n => {
      const attrs: SvgNode["attrs"] = { ...n.attrs, fill: "none", stroke: c.outline, strokeWidth: Number(n.attrs.strokeWidth ?? 1.4) + (profile ? 0.9 : 2.8), opacity: 1, "data-presentation-outline": "marking" };
      delete attrs["data-field-marking"]; return { ...n, attrs };
    });
    // Under-strokes improve edge contrast without inventing any field geometry.
    nodes.splice(markingStart, 0, ...outlines);
  }
  if (options.guides) {
    const style = { stroke: c.guide, strokeWidth: 1, strokeDasharray: "6 6", opacity: 0.65 };
    for (const third of [1, 2]) nodes.push(worldLine({ x: scene.field.length * third / 3, y: 0 }, { x: scene.field.length * third / 3, y: scene.field.width }, style));
    for (const channel of [1, 2, 3, 4]) nodes.push(worldLine({ x: 0, y: scene.field.width * channel / 5 }, { x: scene.field.length, y: scene.field.width * channel / 5 }, style));
  }
  // Context framing hides unrelated parent-pitch linework; Fit All/Pitch deliberately reveal it.
  if (scene.context?.kind === "pitch" && scene.context.region !== "full" && (options.contextMask || !options.fit || ["exercise", "context"].includes(options.fit))) {
    const a = contextArea(scene, options.setPieceFocus), box = screenRectangle({ x: a.origin.x - 2.5, y: a.origin.y - 2.5 }, a.length + 5, a.width + 5, view);
    const x = Math.max(0, Math.min(view.width, box.x)), y = Math.max(0, Math.min(view.height, box.y)), right = Math.max(x, Math.min(view.width, box.x + box.width)), bottom = Math.max(y, Math.min(view.height, box.y + box.height));
    for (const b of [{ x: 0, y: 0, width: view.width, height: y }, { x: 0, y: bottom, width: view.width, height: view.height - bottom }, { x: 0, y, width: x, height: bottom - y }, { x: right, y, width: view.width - right, height: bottom - y }]) nodes.push(node("rect", { ...b, fill: c.surround }));
  }
  // A focused coaching board shows the authored practice, not unused grass from its parent pitch.
  // Uniform metric projection may letterbox; never fill that space by stretching the exercise.
  if (options.paint === "coaching-light" && options.fit === "exercise" && options.exerciseArea) {
    const b = view.target, box = screenRectangle({ x: b.minX, y: b.minY }, b.maxX - b.minX, b.maxY - b.minY, view);
    const margin = glyphs ? Math.min(view.padding, compact ? 5 : 13) : 3;
    const x = Math.max(0, box.x - margin), y = Math.max(0, box.y - margin), right = Math.min(view.width, box.x + box.width + margin), bottom = Math.min(view.height, box.y + box.height + margin);
    for (const mask of [{ x: 0, y: 0, width: view.width, height: y }, { x: 0, y: bottom, width: view.width, height: view.height - bottom }, { x: 0, y, width: x, height: Math.max(0, bottom - y) }, { x: right, y, width: view.width - right, height: Math.max(0, bottom - y) }]) {
      if (mask.width > 0 && mask.height > 0) nodes.push(node("rect", { ...mask, fill: c.surround, "data-presentation-mask": "exercise" }));
    }
  }
  const overlays: SvgNode[] = [], labels: SvgNode[] = [];
  const outside = (point: Point) => { const q = p(point); return q.x < 8 || q.x > view.width - 8 || q.y < 8 || q.y > view.height - 8; };
  const croppedDetails = evaluated.paths.filter(path => !evaluated.hiddenEntityIds.includes(path.entityId)).reduce((n, path) => n + Number(path.points.some(outside)), 0)
    + evaluated.annotations.reduce((n, { annotation: a }) => n + Number((a.kind === "note" ? [a.position] : a.kind === "arrow" ? [a.from, a.to] : [a.area.origin, { x: a.area.origin.x + a.area.length, y: a.area.origin.y + a.area.width }]).some(outside)), 0)
    + displayed.filter(e => e.kind === "equipment" && equipmentFootprint(e).some(outside)).length;
  const projected = displayed.map(entity => ({ entity, screen: p(entity.position) }));
  const inFrame = ({ x, y }: Point, margin: number) => x >= margin && x <= view.width - margin && y >= margin && y <= view.height - margin;
  const extent = (entity: typeof displayed[number]) => entity.kind === "player" ? markerExtent
    : entity.kind === "ball" ? 7 : compact ? 7 : 13;
  const clippedEntities = projected.filter(({ entity, screen }) => !inFrame(screen, glyphs ? extent(entity) : 20)).length;
  const visible = projected.filter(({ entity, screen }) => inFrame(screen, glyphs ? -extent(entity) : 20));
  const boxes: Box[] = visible.map(({ entity, screen }) => {
    if (profile && entity.kind === "equipment") return equipmentBox(entity, screen, extent(entity));
    return boxAround(screen, glyphs ? extent(entity) : 19);
  });
  if (profile && !compact) for (const { annotation } of evaluated.annotations) {
    if (annotation.kind === "note") boxes.push(boxAround(p(annotation.position), 5));
  }
  const players = profile ? visible.filter(({ entity }) => entity.kind === "player") : [];
  const overlappingPlayers = new Set<string>();
  for (const [i, player] of players.entries()) {
    for (let j = 0; j < i; j++) {
      const other = players[j];
      if (Math.hypot(player.screen.x - other.screen.x, player.screen.y - other.screen.y) >= 2 * radius + (compact ? 1 : 1.45)) continue;
      overlappingPlayers.add(player.entity.id);
      overlappingPlayers.add(other.entity.id);
    }
  }
  const numbersHidden = compact && (radius < 8.5 || overlappingPlayers.size > 0);
  const details: DiagramDetail[] = [];
  let labelCollisions = 0;
  let deferredLabels = 0;
  const place = (candidates: Box[]) => {
    const bounded = candidates.map((b) => ({ ...b, x: Math.max(3, Math.min(view.width - b.w - 3, b.x)), y: Math.max(3, Math.min(view.height - b.h - 3, b.y)) }));
    const box = bounded.find((b) => !boxes.some((occupied) => boxesOverlap(b, occupied))) ?? bounded[0];
    if (boxes.some((occupied) => boxesOverlap(box, occupied))) labelCollisions++;
    boxes.push(box); return box;
  };
  const placeScreen = (anchor: Box, w: number, h: number) => {
    const box = screenLabelBox(anchor, w, h, boxes, view.width, view.height);
    if (box) boxes.push(box);
    else deferredLabels++;
    return box;
  };
  for (const track of evaluated.annotations) {
    const a = track.annotation;
    if (a.kind === "area") {
      const key = `annotation:${track.id}`, inspected = profile?.inspected === key;
      const shape = rect(a.area.origin, a.area.length, a.area.width, { fill: c.area, fillOpacity: profile ? 0.09 : 0.15, stroke: c.area, strokeWidth: 1.4, strokeDasharray: "5 4" });
      nodes.push(node("g", { "data-annotation-id": track.id }, undefined, [shape]));
      if (inspected) overlays.push(node("rect", { ...shape.attrs, fill: "none", stroke: "#ffe072", strokeWidth: 3, pointerEvents: "none", "data-inspection-highlight": key }));
      if (compact) continue;
      if (profile) details.push({ id: key, kind: "annotation", text: a.label });
      const at = p(a.area.origin);
      const limit = profile ? Math.min(35, Math.floor((view.width - 18) / 6.6)) : 35;
      const value = shorten(a.label, limit), w = Math.min(view.width - 6, value.length * (profile ? 6.6 : 6.2) + 12);
      const bounds = screenRectangle(a.area.origin, a.area.length, a.area.width, view);
      const box = profile ? placeScreen({ x: bounds.x, y: bounds.y, w: bounds.width, h: bounds.height }, w, 17)
        : place([at.y + 4, at.y - 42, at.y + a.area.width * view.scale - 23, at.y + 24, at.y + a.area.width * view.scale - 46, 4, view.height - 24].flatMap((y) => [at.x + 7, at.x + a.area.length * view.scale - w - 7, at.x + (a.area.length * view.scale - w) / 2].map((x) => ({ x, y, w, h: 17 }))));
      if (!box) continue;
      labels.push(node("g", profile ? { pointerEvents: "none" } : {}, undefined, [node("rect", { x: box.x, y: box.y, width: box.w, height: 17, rx: 3, fill: c.outline, fillOpacity: 0.9 }), text({ x: box.x + 5, y: box.y + 12 }, value, { fontSize: 10 }), title(a.label)]));
    } else if (a.kind === "arrow" && options.paths !== "none") overlays.push(node("g", { "data-annotation-id": track.id }, undefined, [node("polyline", { points: [p(a.from), p(a.to)].map((q) => `${q.x},${q.y}`).join(" "), fill: "none", stroke: c.outline, strokeOpacity: 0, strokeWidth: 12, pointerEvents: "stroke" }), ...arrow([p(a.from), p(a.to)], a.movement, c)]));
    else if (a.kind === "note") {
      const key = `annotation:${track.id}`, at = p(a.position);
      if (profile && !compact) details.push({ id: key, kind: "annotation", text: a.text });
      if (!inFrame(at, 0)) continue;
      const notePin = profile ? [node("circle", { cx: at.x, cy: at.y, r: compact ? 2 : 3, fill: c.ink, stroke: c.line, strokeWidth: 1 })] : [];
      if (compact) {
        overlays.push(node("g", { "data-annotation-id": track.id }, undefined, [...notePin, title(a.text)]));
        continue;
      }
      const content = shorten(a.text, Math.min(45, Math.floor((view.width - 22) / 6.2))), w = Math.min(view.width - 6, content.length * 6.2 + 16);
      const box = profile ? placeScreen(boxAround(at, 5), w, 23) : place([{ x: at.x, y: at.y - 15, w, h: 23 }, { x: at.x, y: at.y + 15, w, h: 23 }, { x: at.x - w, y: at.y - 40, w, h: 23 }]);
      if (box) notePin.push(node("rect", { x: box.x, y: box.y, width: w, height: 23, rx: 4, fill: c.ink, fillOpacity: 0.9 }), text({ x: box.x + 8, y: box.y + 15 }, content));
      labels.push(node("g", { "data-annotation-id": track.id }, undefined, [...notePin, title(a.text)]));
    }
  }
  if (options.paths !== "none") for (const path of evaluated.paths) if (!evaluated.hiddenEntityIds.includes(path.entityId) && (options.paths !== "active" || path.active)) overlays.push(...arrow(path.points.map(p), path.movement, c));
  for (const ghost of options.ghosts ?? []) {
    const at = p(ghost.position);
    if (at.x < 0 || at.x > view.width || at.y < 0 || at.y > view.height) continue;
    const label = shorten(ghost.label, 18), width = label.length * 6;
    nodes.push(node("g", { "data-ghost-id": ghost.id, pointerEvents: "none", opacity: .55 }, undefined, [node("circle", { cx: at.x, cy: at.y, r: 17, fill: "none", stroke: c.line, strokeWidth: 1.2, strokeDasharray: "3 3" }), text({ x: Math.max(4, Math.min(view.width - width - 4, at.x + 21)), y: Math.max(12, Math.min(view.height - 4, at.y - 9)) }, label, { fontSize: 10 }), title(ghost.label)]));
  }
  nodes.push(...overlays);
  const markers: SvgNode[] = [], inspectedMarkers: SvgNode[] = [];
  for (const { entity, screen: at } of [...visible].sort((a, b) => Number(a.entity.kind === "player") - Number(b.entity.kind === "player"))) {
    const key = `entity:${entity.id}`;
    const identity = entity.kind === "player" ? `Team ${entity.team.toUpperCase()} · #${entity.number}${entity.positionLabel ? ` · ${entity.positionLabel}` : ""} · ${entity.position.x.toFixed(1)}, ${entity.position.y.toFixed(1)} m` : entity.kind === "equipment" ? entity.equipment : "Ball";
    const group: SvgNode[] = [title(identity)];
    if (entity.kind === "player") {
      if (profile && !compact) details.push({ id: key, kind: "player", text: identity });
      const fill = entity.color ?? c[entity.team === "neutral" ? "neutral" : entity.team];
      const radians = (entity.headingDegrees + view.rotation) * Math.PI / 180;
      const facing = [{ x: markerExtent, y: 0 }, { x: radius + 1, y: -3 }, { x: radius + 1, y: 3 }].map(({ x, y }) => `${at.x + x * Math.cos(radians) - y * Math.sin(radians)},${at.y + x * Math.sin(radians) + y * Math.cos(radians)}`).join(" ");
      if (glyphs && !compact) group.push(node("circle", { cx: at.x, cy: at.y + 2, r: radius + 1.4, fill: "#182c20", opacity: .65, pointerEvents: "none" }));
      if (!compact) group.push(node("polygon", { points: facing, fill }));
      group.push(node("circle", { cx: at.x, cy: at.y, r: radius, fill, stroke: c.line, strokeWidth: compact ? 1 : glyphs ? 1.45 : 1.2, ...(glyphs ? { "data-player-disc": "" } : {}) }));
      if (glyphs && !compact) group.push(node("circle", { cx: at.x, cy: at.y, r: radius - .8, fill: shine, pointerEvents: "none" }));
      if (!numbersHidden) group.push(text({ x: at.x, y: at.y + (glyphs ? numberSize * .35 : 4.5) }, String(entity.number), { textAnchor: "middle", fontSize: numberSize, fontWeight: 700, fill: glyphs ? numberInk(fill) : entity.team === "neutral" ? c.ink : c.number, ...(glyphs ? { "data-player-number": "", pointerEvents: "none" } : {}) }));
      if (!compact && options.labels && entity.positionLabel) {
        const label = shorten(entity.positionLabel, 18), w = label.length * 6 + 8;
        const gap = glyphs ? markerExtent - 19 : 0;
        const box = profile ? placeScreen(boxAround(at, markerExtent), w, 15)
          : place([{ x: at.x - w / 2, y: at.y + 20 + gap }, { x: at.x - w / 2, y: at.y - 35 - gap }, { x: at.x + 23 + gap, y: at.y - 7 }, { x: at.x - w - 23 - gap, y: at.y - 7 }, ...[34, -49].flatMap((offset) => [{ x: at.x + 23 + gap, y: at.y + offset }, { x: at.x - w - 23 - gap, y: at.y + offset }])].map((b) => ({ ...b, w, h: 15 })));
        if (box) labels.push(node("g", profile ? { pointerEvents: "none" } : {}, undefined, [node("rect", { x: box.x, y: box.y, width: w, height: 15, rx: 3, fill: c.outline, fillOpacity: 0.9 }), text({ x: box.x + 4, y: box.y + 11 }, label, { fontSize: 10 }), title(entity.positionLabel)]));
      }
    } else if (glyphs) group.push(...screenEquipment(entity, at, c, compact, p));
    else if (entity.kind === "ball") group.push(node("circle", { cx: at.x, cy: at.y, r: 5.5, fill: c.line, stroke: c.ink, strokeWidth: 1 }), node("circle", { cx: at.x, cy: at.y, r: 2.2, fill: c.ink }));
    else if (entity.equipment === "goal" || entity.equipment === "ladder") {
      const footprint = equipmentFootprint(entity).map(p);
      group.push(node("polygon", { points: footprint.map((q) => `${q.x},${q.y}`).join(" "), fill: c.line, fillOpacity: 0.08, stroke: c.line, strokeWidth: 1.5 }));
      const count = entity.equipment === "ladder" ? 7 : 5;
      for (let i = 1; i < count; i++) { const t = i / count; group.push(line(lerp(footprint[0], footprint[1], t), lerp(footprint[3], footprint[2], t), { stroke: c.line, strokeWidth: 0.8, opacity: 0.6 })); }
    } else if (entity.equipment === "cone") group.push(node("polygon", { points: `${at.x},${at.y - 8} ${at.x - 6},${at.y + 6} ${at.x + 6},${at.y + 6}`, fill: c.cone, stroke: c.line, strokeWidth: 0.8 }));
    else if (entity.equipment === "marker") group.push(node("circle", { cx: at.x, cy: at.y, r: 5, fill: c.equipment, stroke: c.outline, strokeWidth: 1 }));
    else if (entity.equipment === "pole") group.push(node("rect", { x: at.x - 2, y: at.y - 9, width: 4, height: 18, rx: 2, fill: c.equipment, stroke: c.outline }));
    else group.push(node("circle", { cx: at.x, cy: at.y - 7, r: 3.5, fill: c.b }), node("rect", { x: at.x - 5, y: at.y - 3, width: 10, height: 15, rx: 2, fill: c.b, stroke: c.line, strokeWidth: 0.7 }));
    const inspected = entity.kind === "player" && profile?.inspected === key;
    const layer = inspected ? inspectedMarkers : markers;
    if (inspected) layer.push(node("circle", { cx: at.x, cy: at.y, r: radius + 4, fill: "none", stroke: "#ffe072", strokeWidth: 3, pointerEvents: "none", "data-inspection-highlight": key }));
    layer.push(node("g", { "data-entity-id": entity.id, "data-world-x": entity.position.x, "data-world-y": entity.position.y }, undefined, group));
    if (options.selectedIds?.includes(`entity:${entity.id}`)) markers.push(node("circle", { cx: at.x, cy: at.y, r: glyphs && entity.kind === "player" ? radius + 4 : 20, fill: "none", stroke: c.guide, strokeWidth: 2, pointerEvents: "none" }));
  }
  // Numbered markers keep paint priority when a very dense viewport cannot place every note without overlap.
  nodes.push(...labels, ...markers, ...inspectedMarkers);
  const inspectedNote = evaluated.annotations.find(track => profile?.inspected === `annotation:${track.id}` && track.annotation.kind === "note")?.annotation;
  if (inspectedNote?.kind === "note") {
    const at = p(inspectedNote.position);
    nodes.push(node("circle", { cx: at.x, cy: at.y, r: 7, fill: "none", stroke: "#ffe072", strokeWidth: 3, pointerEvents: "none", "data-inspection-highlight": profile!.inspected! }));
  }
  for (const track of evaluated.annotations) if (options.selectedIds?.includes(`annotation:${track.id}`)) {
    const a = track.annotation, points = a.kind === "arrow" ? [a.from, a.to] : a.kind === "note" ? [a.position] : [a.area.origin, { x: a.area.origin.x + a.area.length, y: a.area.origin.y + a.area.width }];
    points.map(p).forEach((q) => nodes.push(node("circle", { cx: q.x, cy: q.y, r: 5, fill: c.guide, stroke: c.ink, strokeWidth: 1, pointerEvents: "none" })));
  }
  return { nodes, view, sceneId: scene.id, revision: scene.revision, seconds: evaluated.seconds, stage: evaluated.stage?.title ?? null, gridSpacing, clippedEntities, croppedDetails, outsideField: displayed.filter(({ position: q }) => q.x < 0 || q.x > scene.field.length || q.y < 0 || q.y > scene.field.width).length, labelCollisions, anchors: displayed.map((e) => ({ id: e.id, world: { ...e.position }, screen: p(e.position) })), ...(glyphs ? { screen: { numberSize, playerDiameter: radius * 2, numbersHidden, crowded: compact && overlappingPlayers.size > 0, playerOverlaps: overlappingPlayers.size, deferredLabels, details } } : {}) };
}

function equipmentFrame(corners: Point[], c: TacticalPaint, kind: "goal" | "ladder", compact: boolean, contextual = false): SvgNode[] {
  const goal = kind === "goal";
  const frame = node("polygon", {
    points: corners.map(q => `${q.x},${q.y}`).join(" "), fill: c.line, fillOpacity: .12,
    stroke: goal ? c.line : c.equipment, strokeWidth: compact ? 1 : 1.55,
    ...(contextual ? { "data-field-marking": "goal" } : {}),
  });
  const edge = node("polygon", { ...frame.attrs, fill: "none", stroke: c.outline, strokeWidth: compact ? 2 : 2.85, "data-equipment-detail": "edge" });
  delete edge.attrs["data-field-marking"];
  const detail = { stroke: goal && c === screenCoachingPalette ? c.outline : c.line, strokeWidth: .65, strokeOpacity: .56, "data-equipment-detail": "net", pointerEvents: "none" };
  const count = compact ? 3 : goal ? 6 : 7;
  const net: SvgNode[] = [];
  for (let i = 1; i < count; i++) {
    const t = i / count;
    net.push(goal ? line(lerp(corners[0], corners[3], t), lerp(corners[1], corners[2], t), detail)
      : line(lerp(corners[0], corners[1], t), lerp(corners[3], corners[2], t), detail));
  }
  if (goal && !compact) {
    net.push(line(lerp(corners[0], corners[1], .5), lerp(corners[3], corners[2], .5), detail));
  }
  return contextual ? [frame, ...net] : [edge, frame, ...net];
}

function screenEquipment(entity: Exclude<TacticalEntity, { kind: "player" }>, at: Point, c: TacticalPaint, compact: boolean, project: (point: Point) => Point): SvgNode[] {
  const { x, y } = at;
  const k = compact ? .64 : 1;
  const circle = (r: number, fill: string, dy = 0, attrs: SvgNode["attrs"] = {}) => node("circle", { cx: x, cy: y + dy * k, r: r * k, fill, ...attrs });
  const point = (dx: number, dy: number) => `${x + dx * k},${y + dy * k}`;
  if (entity.kind === "ball") return [
    circle(6, c.line, 0, { stroke: c.ink, strokeWidth: 1.2 }),
    node("polygon", { points: [[0, -3], [2.8, -1], [1.7, 2.5], [-1.7, 2.5], [-2.8, -1]].map(([dx, dy]) => point(dx, dy)).join(" "), fill: c.ink }),
  ];
  if (entity.equipment === "goal" || entity.equipment === "ladder") return equipmentFrame(equipmentFootprint(entity).map(project), c, entity.equipment, compact);
  if (entity.equipment === "cone") return [
    node("rect", { x: x - 7 * k, y: y + 3 * k, width: 14 * k, height: 4 * k, rx: 1, fill: "#c75410", stroke: c.outline, strokeWidth: .8 }),
    node("polygon", { points: [point(0, -8), point(5, 4), point(-5, 4)].join(" "), fill: c.cone, stroke: c.line, strokeWidth: .8 }),
    line({ x: x - 2 * k, y: y + k }, { x: x + 2 * k, y: y + k }, { stroke: c.line, strokeWidth: 1.2 }),
  ];
  if (entity.equipment === "marker") return [circle(5, c.outline), circle(4, c.equipment), circle(1.25, c.outline)];
  if (entity.equipment === "pole") return [
    circle(3.5, c.outline, 5),
    node("rect", { x: x - 1.6 * k, y: y - 9 * k, width: 3.2 * k, height: 14 * k, rx: 1.5, fill: c.equipment, stroke: c.outline }),
  ];
  return [
    circle(3, c.b, -8),
    node("polygon", { points: [point(-5, -4), point(5, -4), point(4, 5), point(1, 5), point(1, 11), point(-1, 11), point(-1, 5), point(-4, 5)].join(" "), fill: c.b, stroke: c.line, strokeWidth: 1 }),
  ];
}

/** Interpolate equipment-footprint edges without changing their metre anchors. */
function lerp(a: Point, b: Point, t: number): Point { return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; }
/** Bound visible text while the enclosing SVG title retains its complete accessible value. */
function shorten(value: string, limit: number) { return value.length > limit ? `${value.slice(0, limit - 1)}…` : value; }
/** Draw the authored polyline and its final nonzero-segment arrowhead using movement-specific styling. */
function arrow(points: Point[], movement: "pass" | "run" | "rotation" | "press" | "dribble", c: TacticalPaint): SvgNode[] {
  const colour = c[movement], dash = { pass: "", run: "9 5", rotation: "8 4 2 4", press: "4 4", dribble: "2 4" }[movement];
  const end = points.at(-1)!, previous = points.findLast((q) => Math.hypot(q.x - end.x, q.y - end.y) > 0.01);
  if (!previous) return [];
  const angle = Math.atan2(end.y - previous.y, end.x - previous.x);
  const pointsText = points.map((q) => `${q.x},${q.y}`).join(" ");
  const light = c === coachingLightPalette || c === screenCoachingPalette;
  return [...(light ? [node("polyline", { points: pointsText, fill: "none", stroke: movement === "run" || movement === "dribble" ? c.outline : c.line, strokeWidth: c === screenCoachingPalette ? 3 : 4, strokeDasharray: dash, strokeLinejoin: "round", pointerEvents: "none" })] : []), node("polyline", { points: pointsText, fill: "none", stroke: colour, strokeWidth: 2, strokeDasharray: dash, strokeLinejoin: "round" }), node("polygon", { points: [end, { x: end.x - 9 * Math.cos(angle - 0.45), y: end.y - 9 * Math.sin(angle - 0.45) }, { x: end.x - 9 * Math.cos(angle + 0.45), y: end.y - 9 * Math.sin(angle + 0.45) }].map((q) => `${q.x},${q.y}`).join(" "), fill: colour, ...(light ? { stroke: c.outline, strokeWidth: .7 } : {}) })];
}
/** Project metric centre, penalty and goal-area markings with fixed readable screen strokes. */
function footballMarkings(scene: TacticalScene, view: Projection, c: TacticalPaint, screen: boolean): SvgNode[] {
  const { length: l, width: w } = scene.field, p = (x: number, y: number) => worldToScreen({ x, y }, view), style = { fill: "none", stroke: c.line, strokeWidth: screen ? 1.5 : 1.3, opacity: screen ? 1 : 0.85 };
  const center = p(l / 2, w / 2), result = [line(p(l / 2, 0), p(l / 2, w), { ...style, "data-field-marking": "halfway" }), node("circle", { cx: center.x, cy: center.y, r: 9.15 * view.scale, ...style, "data-field-marking": "centre-circle" }), node("circle", { cx: center.x, cy: center.y, r: 2, fill: c.line })];
  for (const right of [false, true]) {
    for (const [depth, span] of [[16.5, 40.32], [5.5, 18.32]]) result.push(node("rect", { ...screenRectangle({ x: right ? l - depth : 0, y: (w - span) / 2 }, depth, span, view), ...style, "data-field-marking": depth === 16.5 ? "penalty-area" : "goal-area" }));
    const spot = p(right ? l - 11 : 11, w / 2); result.push(node("circle", { cx: spot.x, cy: spot.y, r: 2, fill: c.line }));
    const x = right ? l - 16.5 : 16.5, dy = Math.sqrt(9.15 ** 2 - 5.5 ** 2), start = p(x, w / 2 - dy), end = p(x, w / 2 + dy);
    result.push(node("path", { d: `M${start.x},${start.y} A${9.15 * view.scale},${9.15 * view.scale} 0 0 ${right ? 0 : 1} ${end.x},${end.y}`, ...style }));
  }
  for (const [x, y, sx, sy] of [[0, 0, 1, 1], [l, 0, -1, 1], [l, w, -1, -1], [0, w, 1, -1]]) {
    const a = p(x + sx, y), b = p(x, y + sy);
    result.push(node("path", { d: `M${a.x},${a.y} A${view.scale},${view.scale} 0 0 ${sx === sy ? 1 : 0} ${b.x},${b.y}`, ...style, "data-field-marking": "corner-arc" }));
  }
  return result;
}

const escapeXml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
/** Escapes all labels and attributes; no user-supplied XML, HTML or external assets are accepted. */
export function serializeDrawing(drawing: SceneDrawing, description = "Football Formation tactical scene"): string {
  const render = (n: SvgNode): string => `<${n.tag}${Object.entries(n.attrs).map(([key, value]) => ` ${key === "patternUnits" || key === "patternTransform" ? key : key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}="${escapeXml(String(value))}"`).join("")}>${n.text === undefined ? "" : escapeXml(n.text)}${n.children?.map(render).join("") ?? ""}</${n.tag}>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${drawing.view.width}" height="${drawing.view.height}" viewBox="0 0 ${drawing.view.width} ${drawing.view.height}" role="img"><title>${escapeXml(description)}</title><desc>Scene ${escapeXml(drawing.sceneId)} revision ${drawing.revision}; metres; ${drawing.seconds} seconds.</desc><svg width="100%" height="100%" overflow="hidden">${drawing.nodes.map(render).join("")}</svg></svg>`;
}
