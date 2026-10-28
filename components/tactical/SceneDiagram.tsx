"use client";

import { createElement, useEffect, useId, useRef, useState, type PointerEvent } from "react";
import type { Projection } from "@/lib/tactical/viewport";
import { drawScene, type DrawingOptions, type SvgNode, type SceneDrawing } from "@/lib/tactical/drawing";
import type { TacticalScene } from "@/lib/domain/tactical-scene";

/** Adapt the controlled drawing primitives to React SVG elements without interpreting label text as markup. */
function renderNode(n: SvgNode, key: number): React.ReactNode { return createElement(n.tag, { ...n.attrs, key }, n.text ?? n.children?.map(renderNode)); }

/** Read-only adapter. ResizeObserver changes projection only; scene IDs, revisions and metre positions remain untouched. */
export type DiagramPointer = (event: PointerEvent<HTMLDivElement>, view: Projection) => void;
export function SceneDiagram({ scene, title, options = {}, interaction }: { scene: TacticalScene; title: string; options?: Omit<DrawingOptions, "width" | "height">; interaction?: { down: DiagramPointer; move: DiagramPointer; up: DiagramPointer; cancel: () => void } }) {
  const ref = useRef<HTMLDivElement>(null), [size, setSize] = useState({ width: 960, height: 600 }), id = useId();
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => { const { width, height } = entry.contentRect; if (width >= 120 && height >= 120) setSize({ width: Math.min(8192, width), height: Math.min(8192, height) }); });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  let drawing: SceneDrawing | null = null, errorMessage = "Invalid scene";
  try { drawing = drawScene(scene, { ...options, ...size }); } catch (error) { errorMessage = error instanceof Error ? error.message : errorMessage; }
  return <div ref={ref} className="scene-diagram" data-scene-id={scene.id} data-revision={scene.revision} data-width={size.width} data-height={size.height} data-scale={drawing?.view.scale} data-center-x={drawing?.view.center.x} data-center-y={drawing?.view.center.y} data-time={drawing?.seconds} data-clipped={drawing?.clippedEntities} data-label-collisions={drawing?.labelCollisions}
    onPointerDown={interaction && drawing ? (e) => interaction.down(e, drawing.view) : undefined}
    onPointerMove={interaction && drawing ? (e) => interaction.move(e, drawing.view) : undefined}
    onPointerUp={interaction && drawing ? (e) => interaction.up(e, drawing.view) : undefined}
    onPointerCancel={interaction?.cancel}>
    {drawing ? <>
    <svg role="img" aria-labelledby={`${id}-title ${id}-desc`} width="100%" height="100%" viewBox={`0 0 ${size.width} ${size.height}`} overflow="hidden">
      <title id={`${id}-title`}>{title}</title><desc id={`${id}-desc`}>Scene {scene.id}, revision {scene.revision}. Metres. {scene.field.length} by {scene.field.width}. Snapshot {drawing.seconds} seconds. {drawing.stage ?? "Static scene"}. {drawing.clippedEntities} cropped markers. {drawing.outsideField} anchors outside pitch. {drawing.labelCollisions} label overlaps.</desc>
      {drawing.nodes.map(renderNode)}
    </svg>
    <span className="scene-diagram-caption">{scene.field.length} × {scene.field.width} m · {drawing.gridSpacing ? `${drawing.gridSpacing} m grid` : "Grid off"} · {drawing.clippedEntities} cropped · r{scene.revision}</span>
    </> : <div className="scene-diagram-error" role="alert">Diagram unavailable: {errorMessage}</div>}
  </div>;
}
