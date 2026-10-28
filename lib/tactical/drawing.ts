import type { TacticalScene, TrainingArea } from "../domain/tactical-scene";
import { evaluateScene, prepareScene, type Point } from "./evaluate";
import { fitViewport, metricGrid, worldToScreen, equipmentFootprint, screenRectangle, type FitMode, type Camera, type Projection, type Rotation } from "./viewport";
import { contextArea } from "./context";
import { tacticalPalette as c } from "./palette";

export const TACTICAL_RENDERER_VERSION = "svg-2d/1.2.0";

export type SvgNode = { tag: "g" | "rect" | "line" | "circle" | "path" | "polyline" | "polygon" | "text" | "title"; attrs: Record<string, string | number>; children?: SvgNode[]; text?: string };
export type DrawingOptions = { width: number; height: number; padding?: number; fit?: FitMode; exerciseArea?: TrainingArea; customArea?: TrainingArea; camera?: Camera; seconds?: number; gridMetres?: number; guides?: boolean; labels?: boolean; paths?: "stage" | "active" | "none"; markings?: "auto" | "football" | "boundary" | "none"; rotation?: Rotation; setPieceFocus?: "delivery" | "box"; selectedIds?: string[]; ghosts?: { id: string; position: Point; label: string }[] };
export type SceneDrawing = { nodes: SvgNode[]; view: Projection; sceneId: string; revision: number; seconds: number; stage: string | null; gridSpacing: number | null; clippedEntities: number; outsideField: number; labelCollisions: number; anchors: { id: string; world: Point; screen: Point }[] };
const node = (tag: SvgNode["tag"], attrs: SvgNode["attrs"], text?: string, children?: SvgNode[]): SvgNode => ({ tag, attrs, ...(text === undefined ? {} : { text }), ...(children ? { children } : {}) });
const line = (a: Point, b: Point, attrs: SvgNode["attrs"]) => node("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, ...attrs });
const title = (text: string) => node("title", {}, text);
type Box = { x: number; y: number; w: number; h: number };
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** One portable drawing tree drives React, standalone SVG and later illustrated exports. No persisted geometry is changed. */
export function drawScene(input: unknown, options: DrawingOptions): SceneDrawing {
  const scene = prepareScene(input), evaluated = evaluateScene(scene, options.seconds ?? 0);
  const view = fitViewport(scene, { ...options, fit: options.fit ?? "exercise" });
  const p = (point: Point) => worldToScreen(point, view), nodes: SvgNode[] = [];
  const rect = (origin: Point, length: number, width: number, attrs: SvgNode["attrs"]) => node("rect", { ...screenRectangle(origin, length, width, view), ...attrs });
  const worldLine = (from: Point, to: Point, attrs: SvgNode["attrs"]) => line(p(from), p(to), attrs);
  const text = (at: Point, value: string, attrs: SvgNode["attrs"] = {}) => node("text", { x: at.x, y: at.y, fill: c.label, fontSize: 11, fontFamily: "Arial, sans-serif", ...attrs }, value);
  const neutral = scene.context?.kind === "neutral";
  nodes.push(node("rect", { width: view.width, height: view.height, fill: neutral ? c.field : c.surround }));
  nodes.push(rect({ x: 0, y: 0 }, scene.field.length, scene.field.width, { fill: c.field }));
  for (let i = 0; i < 10; i += 2) nodes.push(rect({ x: scene.field.length * i / 10, y: 0 }, scene.field.length / 10, scene.field.width, { fill: c.stripe }));
  let gridSpacing: number | null = null;
  if (options.gridMetres !== undefined) {
    const grid = metricGrid(view, scene.field, options.gridMetres); gridSpacing = grid.spacing;
    const style = { stroke: c.grid, strokeWidth: 0.7, opacity: 0.42 };
    grid.x.forEach((x) => nodes.push(worldLine({ x, y: 0 }, { x, y: scene.field.width }, style)));
    grid.y.forEach((y) => nodes.push(worldLine({ x: 0, y }, { x: scene.field.length, y }, style)));
  }
  const mark = { stroke: c.line, strokeWidth: 1.4, fill: "none", opacity: 0.9 };
  if (options.markings !== "none") {
    if (!neutral || scene.context?.kind === "neutral" && scene.context.boundary) nodes.push(rect({ x: 0, y: 0 }, scene.field.length, scene.field.width, { ...mark, "data-field-marking": neutral ? "training-boundary" : "touchlines" }));
    if (!neutral && (options.markings === "football" || (options.markings !== "boundary" && scene.field.length >= 70 && scene.field.width >= 45))) footballMarkings(scene, view).forEach((n) => nodes.push(n));
    if (scene.context?.kind === "pitch") for (const right of [false, true]) {
      const anchor = { x: right ? scene.field.length : 0, y: scene.field.width / 2 };
      if (scene.entities.some((e) => e.kind === "equipment" && e.equipment === "goal" && Math.hypot(e.position.x - anchor.x, e.position.y - anchor.y) < 0.1)) continue;
      const corners = equipmentFootprint({ id: "context-goal", kind: "equipment", equipment: "goal", headingDegrees: right ? 180 : 0, position: anchor }).map(p);
      nodes.push(node("polygon", { points: corners.map((q) => `${q.x},${q.y}`).join(" "), fill: c.line, fillOpacity: 0.1, stroke: c.line, strokeWidth: 1.5, "data-field-marking": "goal" }));
    }
  }
  if (options.guides) {
    const style = { stroke: c.guide, strokeWidth: 1, strokeDasharray: "6 6", opacity: 0.65 };
    for (const third of [1, 2]) nodes.push(worldLine({ x: scene.field.length * third / 3, y: 0 }, { x: scene.field.length * third / 3, y: scene.field.width }, style));
    for (const channel of [1, 2, 3, 4]) nodes.push(worldLine({ x: 0, y: scene.field.width * channel / 5 }, { x: scene.field.length, y: scene.field.width * channel / 5 }, style));
  }
  // Context framing hides unrelated parent-pitch linework; Fit All/Pitch deliberately reveal it.
  if (scene.context?.kind === "pitch" && scene.context.region !== "full" && (!options.fit || ["exercise", "context"].includes(options.fit))) {
    const a = contextArea(scene, options.setPieceFocus), box = screenRectangle({ x: a.origin.x - 2.5, y: a.origin.y - 2.5 }, a.length + 5, a.width + 5, view);
    const x = Math.max(0, Math.min(view.width, box.x)), y = Math.max(0, Math.min(view.height, box.y)), right = Math.max(x, Math.min(view.width, box.x + box.width)), bottom = Math.max(y, Math.min(view.height, box.y + box.height));
    for (const b of [{ x: 0, y: 0, width: view.width, height: y }, { x: 0, y: bottom, width: view.width, height: view.height - bottom }, { x: 0, y, width: x, height: bottom - y }, { x: right, y, width: view.width - right, height: bottom - y }]) nodes.push(node("rect", { ...b, fill: c.surround }));
  }
  const overlays: SvgNode[] = [], labels: SvgNode[] = [];
  const displayed = evaluated.entities.filter((entity) => !evaluated.hiddenEntityIds.includes(entity.id));
  const visible = displayed.map((entity) => ({ entity, screen: p(entity.position) })).filter(({ screen }) => screen.x >= 20 && screen.x <= view.width - 20 && screen.y >= 20 && screen.y <= view.height - 20);
  const boxes: Box[] = visible.map(({ screen }) => ({ x: screen.x - 19, y: screen.y - 19, w: 38, h: 38 }));
  let labelCollisions = 0;
  const place = (candidates: Box[]) => {
    const bounded = candidates.map((b) => ({ ...b, x: Math.max(3, Math.min(view.width - b.w - 3, b.x)), y: Math.max(3, Math.min(view.height - b.h - 3, b.y)) }));
    const box = bounded.find((b) => !boxes.some((occupied) => overlaps(b, occupied))) ?? bounded[0];
    if (boxes.some((occupied) => overlaps(box, occupied))) labelCollisions++;
    boxes.push(box); return box;
  };
  for (const track of evaluated.annotations) {
    const a = track.annotation;
    if (a.kind === "area") {
      nodes.push(node("g", { "data-annotation-id": track.id }, undefined, [rect(a.area.origin, a.area.length, a.area.width, { fill: c.area, fillOpacity: 0.15, stroke: c.area, strokeWidth: 1.4, strokeDasharray: "5 4" })]));
      const at = p(a.area.origin), value = shorten(a.label, 35), w = Math.min(view.width - 6, value.length * 6.2 + 12);
      const box = place([at.y + 4, at.y - 42, at.y + a.area.width * view.scale - 23, at.y + 24, at.y + a.area.width * view.scale - 46, 4, view.height - 24].flatMap((y) => [at.x + 7, at.x + a.area.length * view.scale - w - 7, at.x + (a.area.length * view.scale - w) / 2].map((x) => ({ x, y, w, h: 17 }))));
      labels.push(node("g", {}, undefined, [node("rect", { x: box.x, y: box.y, width: w, height: 17, rx: 3, fill: c.outline, fillOpacity: 0.9 }), text({ x: box.x + 5, y: box.y + 12 }, value, { fontSize: 10 }), title(a.label)]));
    } else if (a.kind === "arrow" && options.paths !== "none") overlays.push(node("g", { "data-annotation-id": track.id }, undefined, [node("polyline", { points: [p(a.from), p(a.to)].map((q) => `${q.x},${q.y}`).join(" "), fill: "none", stroke: c.outline, strokeOpacity: 0, strokeWidth: 12, pointerEvents: "stroke" }), ...arrow([p(a.from), p(a.to)], a.movement)]));
    else if (a.kind === "note") {
      const at = p(a.position); if (at.x < 0 || at.x > view.width || at.y < 0 || at.y > view.height) continue;
      const content = shorten(a.text, Math.min(45, Math.floor((view.width - 22) / 6.2))), w = Math.min(view.width - 6, content.length * 6.2 + 16);
      const box = place([{ x: at.x, y: at.y - 15, w, h: 23 }, { x: at.x, y: at.y + 15, w, h: 23 }, { x: at.x - w, y: at.y - 40, w, h: 23 }]);
      labels.push(node("g", { "data-annotation-id": track.id }, undefined, [node("rect", { x: box.x, y: box.y, width: w, height: 23, rx: 4, fill: c.ink, fillOpacity: 0.9 }), text({ x: box.x + 8, y: box.y + 15 }, content), title(a.text)]));
    }
  }
  if (options.paths !== "none") for (const path of evaluated.paths) if (!evaluated.hiddenEntityIds.includes(path.entityId) && (options.paths !== "active" || path.active)) overlays.push(...arrow(path.points.map(p), path.movement));
  for (const ghost of options.ghosts ?? []) {
    const at = p(ghost.position);
    if (at.x < 0 || at.x > view.width || at.y < 0 || at.y > view.height) continue;
    const label = shorten(ghost.label, 18), width = label.length * 6;
    nodes.push(node("g", { "data-ghost-id": ghost.id, pointerEvents: "none", opacity: .55 }, undefined, [node("circle", { cx: at.x, cy: at.y, r: 17, fill: "none", stroke: c.line, strokeWidth: 1.2, strokeDasharray: "3 3" }), text({ x: Math.max(4, Math.min(view.width - width - 4, at.x + 21)), y: Math.max(12, Math.min(view.height - 4, at.y - 9)) }, label, { fontSize: 10 }), title(ghost.label)]));
  }
  nodes.push(...overlays);
  const markers: SvgNode[] = [];
  for (const { entity, screen: at } of [...visible].sort((a, b) => Number(a.entity.kind === "player") - Number(b.entity.kind === "player"))) {
    const group: SvgNode[] = [title(entity.kind === "player" ? `Team ${entity.team.toUpperCase()} · #${entity.number}${entity.positionLabel ? ` · ${entity.positionLabel}` : ""} · ${entity.position.x.toFixed(1)}, ${entity.position.y.toFixed(1)} m` : entity.kind === "equipment" ? entity.equipment : "Ball")];
    if (entity.kind === "player") {
      const fill = entity.color ?? c[entity.team === "neutral" ? "neutral" : entity.team];
      const radians = (entity.headingDegrees + view.rotation) * Math.PI / 180;
      const facing = [{ x: 19, y: 0 }, { x: 14, y: -3 }, { x: 14, y: 3 }].map(({ x, y }) => `${at.x + x * Math.cos(radians) - y * Math.sin(radians)},${at.y + x * Math.sin(radians) + y * Math.cos(radians)}`).join(" ");
      group.push(node("polygon", { points: facing, fill }), node("circle", { cx: at.x, cy: at.y, r: 13, fill, stroke: c.line, strokeWidth: 1.2 }), text({ x: at.x, y: at.y + 4.5 }, String(entity.number), { textAnchor: "middle", fontSize: 13, fontWeight: 700, fill: entity.team === "neutral" ? c.ink : c.number }));
      if (options.labels && entity.positionLabel) {
        const label = shorten(entity.positionLabel, 18), w = label.length * 6 + 8;
        const box = place([{ x: at.x - w / 2, y: at.y + 20 }, { x: at.x - w / 2, y: at.y - 35 }, { x: at.x + 23, y: at.y - 7 }, { x: at.x - w - 23, y: at.y - 7 }, ...[34, -49].flatMap((offset) => [{ x: at.x + 23, y: at.y + offset }, { x: at.x - w - 23, y: at.y + offset }])].map((b) => ({ ...b, w, h: 15 })));
        labels.push(node("g", {}, undefined, [node("rect", { x: box.x, y: box.y, width: w, height: 15, rx: 3, fill: c.outline, fillOpacity: 0.9 }), text({ x: box.x + 4, y: box.y + 11 }, label, { fontSize: 10 }), title(entity.positionLabel)]));
      }
    } else if (entity.kind === "ball") group.push(node("circle", { cx: at.x, cy: at.y, r: 5.5, fill: c.line, stroke: c.ink, strokeWidth: 1 }), node("circle", { cx: at.x, cy: at.y, r: 2.2, fill: c.ink }));
    else if (entity.equipment === "goal" || entity.equipment === "ladder") {
      const footprint = equipmentFootprint(entity).map(p);
      group.push(node("polygon", { points: footprint.map((q) => `${q.x},${q.y}`).join(" "), fill: c.line, fillOpacity: 0.08, stroke: c.line, strokeWidth: 1.5 }));
      const count = entity.equipment === "ladder" ? 7 : 5;
      for (let i = 1; i < count; i++) { const t = i / count; group.push(line(lerp(footprint[0], footprint[1], t), lerp(footprint[3], footprint[2], t), { stroke: c.line, strokeWidth: 0.8, opacity: 0.6 })); }
    } else if (entity.equipment === "cone") group.push(node("polygon", { points: `${at.x},${at.y - 8} ${at.x - 6},${at.y + 6} ${at.x + 6},${at.y + 6}`, fill: c.cone, stroke: c.line, strokeWidth: 0.8 }));
    else if (entity.equipment === "marker") group.push(node("circle", { cx: at.x, cy: at.y, r: 5, fill: c.equipment, stroke: c.outline, strokeWidth: 1 }));
    else if (entity.equipment === "pole") group.push(node("rect", { x: at.x - 2, y: at.y - 9, width: 4, height: 18, rx: 2, fill: c.equipment, stroke: c.outline }));
    else group.push(node("circle", { cx: at.x, cy: at.y - 7, r: 3.5, fill: c.b }), node("rect", { x: at.x - 5, y: at.y - 3, width: 10, height: 15, rx: 2, fill: c.b, stroke: c.line, strokeWidth: 0.7 }));
    markers.push(node("g", { "data-entity-id": entity.id, "data-world-x": entity.position.x, "data-world-y": entity.position.y }, undefined, group));
    if (options.selectedIds?.includes(`entity:${entity.id}`)) markers.push(node("circle", { cx: at.x, cy: at.y, r: 20, fill: "none", stroke: c.guide, strokeWidth: 2, pointerEvents: "none" }));
  }
  // Numbered markers keep paint priority when a very dense viewport cannot place every note without overlap.
  nodes.push(...labels, ...markers);
  for (const track of evaluated.annotations) if (options.selectedIds?.includes(`annotation:${track.id}`)) {
    const a = track.annotation, points = a.kind === "arrow" ? [a.from, a.to] : a.kind === "note" ? [a.position] : [a.area.origin, { x: a.area.origin.x + a.area.length, y: a.area.origin.y + a.area.width }];
    points.map(p).forEach((q) => nodes.push(node("circle", { cx: q.x, cy: q.y, r: 5, fill: c.guide, stroke: c.ink, strokeWidth: 1, pointerEvents: "none" })));
  }
  return { nodes, view, sceneId: scene.id, revision: scene.revision, seconds: evaluated.seconds, stage: evaluated.stage?.title ?? null, gridSpacing, clippedEntities: displayed.length - visible.length, outsideField: displayed.filter(({ position: q }) => q.x < 0 || q.x > scene.field.length || q.y < 0 || q.y > scene.field.width).length, labelCollisions, anchors: displayed.map((e) => ({ id: e.id, world: { ...e.position }, screen: p(e.position) })) };
}

/** Interpolate equipment-footprint edges without changing their metre anchors. */
function lerp(a: Point, b: Point, t: number): Point { return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; }
/** Bound visible text while the enclosing SVG title retains its complete accessible value. */
function shorten(value: string, limit: number) { return value.length > limit ? `${value.slice(0, limit - 1)}…` : value; }
/** Draw the authored polyline and its final nonzero-segment arrowhead using movement-specific styling. */
function arrow(points: Point[], movement: "pass" | "run" | "rotation" | "press" | "dribble"): SvgNode[] {
  const colour = c[movement], dash = { pass: "", run: "9 5", rotation: "8 4 2 4", press: "4 4", dribble: "2 4" }[movement];
  const end = points.at(-1)!, previous = points.findLast((q) => Math.hypot(q.x - end.x, q.y - end.y) > 0.01);
  if (!previous) return [];
  const angle = Math.atan2(end.y - previous.y, end.x - previous.x);
  return [node("polyline", { points: points.map((q) => `${q.x},${q.y}`).join(" "), fill: "none", stroke: colour, strokeWidth: 2, strokeDasharray: dash, strokeLinejoin: "round" }), node("polygon", { points: [end, { x: end.x - 9 * Math.cos(angle - 0.45), y: end.y - 9 * Math.sin(angle - 0.45) }, { x: end.x - 9 * Math.cos(angle + 0.45), y: end.y - 9 * Math.sin(angle + 0.45) }].map((q) => `${q.x},${q.y}`).join(" "), fill: colour })];
}
/** Project metric centre, penalty and goal-area markings with fixed readable screen strokes. */
function footballMarkings(scene: TacticalScene, view: Projection): SvgNode[] {
  const { length: l, width: w } = scene.field, p = (x: number, y: number) => worldToScreen({ x, y }, view), style = { fill: "none", stroke: c.line, strokeWidth: 1.3, opacity: 0.85 };
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
  const render = (n: SvgNode): string => `<${n.tag}${Object.entries(n.attrs).map(([key, value]) => ` ${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}="${escapeXml(String(value))}"`).join("")}>${n.text === undefined ? "" : escapeXml(n.text)}${n.children?.map(render).join("") ?? ""}</${n.tag}>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${drawing.view.width}" height="${drawing.view.height}" viewBox="0 0 ${drawing.view.width} ${drawing.view.height}" role="img"><title>${escapeXml(description)}</title><desc>Scene ${escapeXml(drawing.sceneId)} revision ${drawing.revision}; metres; ${drawing.seconds} seconds.</desc><svg width="100%" height="100%" overflow="hidden">${drawing.nodes.map(render).join("")}</svg></svg>`;
}
