"use client";

import { useEffect, useId, useRef, useState, type PointerEvent, type ReactNode } from "react";
import type { Projection } from "@/lib/tactical/viewport";
import { drawScene, type DrawingOptions, type SceneDrawing } from "@/lib/tactical/drawing";
import { renderDrawingNode } from "./DrawingNodes";
import type { TacticalScene } from "@/lib/domain/tactical-scene";
import { COMPACT_VIEWPORT_MIN, SCREEN_PRESENTATION_VERSION, type DiagramSize } from "@/lib/tactical/screen-presentation";


/** Read-only adapter. ResizeObserver changes projection only; scene IDs, revisions and metre positions remain untouched. */
export type DiagramPointer = (event: PointerEvent<HTMLDivElement>, view: Projection) => void;
type DiagramProps = {
  scene: TacticalScene;
  title: string;
  options?: Omit<DrawingOptions, "width" | "height" | "screen">;
  screenMode?: DiagramSize;
  sizingSeconds?: number;
  autoFitContent?: boolean;
  viewer?: { caption?: ReactNode; frameNote?: string; onShowAll?: () => void; overlay?: ReactNode; coachingFrame?: string };
  interaction?: { down: DiagramPointer; move: DiagramPointer; up: DiagramPointer; cancel: () => void };
};

export function SceneDiagram({ scene, title, options = {}, screenMode, sizingSeconds, autoFitContent, viewer, interaction }: DiagramProps) {
  const ref = useRef<HTMLElement>(null), [measured, setMeasured] = useState<{ width: number; height: number }>(), id = useId();
  const [inspection, setInspection] = useState<{ source: string; id: string }>();
  const source = JSON.stringify([scene.organizationId, scene.id, scene.revision]);
  const inspected = inspection?.source === source ? inspection.id : undefined;
  const compact = screenMode === "compact";
  const minimum = compact ? COMPACT_VIEWPORT_MIN : 120;
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.min(8192, entry.contentRect.width), height = Math.min(8192, entry.contentRect.height);
      setMeasured(previous => previous?.width === width && previous.height === height ? previous : { width, height });
    });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [compact]);
  const size = measured && measured.width >= minimum && measured.height >= minimum
    ? measured : screenMode ? undefined : { width: 960, height: 600 };
  const Surface = compact ? "span" : "div";
  let drawing: SceneDrawing | null = null, errorMessage = "Invalid scene";
  let fittedAll = false;
  if (size) {
    try {
      const screen = screenMode ? { mode: screenMode, id: id.replace(/[^\w-]/g, "_"), sizingSeconds, inspected, viewer: !!viewer } : undefined;
      const drawOptions = { ...options, ...size, screen };
      drawing = drawScene(scene, drawOptions);
      if (autoFitContent && options.fit === "exercise" && (drawing.clippedEntities || drawing.croppedDetails)) {
        drawing = drawScene(scene, { ...drawOptions, fit: "all" });
        fittedAll = true;
      }
    } catch (error) { errorMessage = error instanceof Error ? error.message : errorMessage; }
  }
  const area = options.fit === "exercise" ? options.exerciseArea : undefined;
  const compactFallback = compact && (!drawing || drawing.screen?.crowded || !!(drawing.clippedEntities || drawing.croppedDetails));
  const framedLength = drawing && drawing.view.target.maxX - drawing.view.target.minX;
  const framedWidth = drawing && drawing.view.target.maxY - drawing.view.target.minY;
  const screen = drawing?.screen;
  const crop = drawing && !!(drawing.clippedEntities || drawing.croppedDetails);
  const cropMessage = drawing && crop ? `${drawing.clippedEntities} markers / ${drawing.croppedDetails} authored details outside view.` : null;
  const frameSummary = framedLength !== null && framedWidth !== null
    ? `${Number(framedLength.toFixed(1))} × ${Number(framedWidth.toFixed(1))} m frame` : null;
  const status = drawing && `${area?.length ?? scene.field.length} × ${area?.width ?? scene.field.width} m${area ? " exercise" : " field"} · ${drawing.gridSpacing ? `${drawing.gridSpacing} m grid` : "Grid off"} · ${drawing.clippedEntities} cropped · r${scene.revision}`;
  const board = <Surface ref={element => { ref.current = element; }} className="scene-diagram" data-scene-id={scene.id} data-revision={scene.revision} data-width={size?.width} data-height={size?.height} data-scale={drawing?.view.scale} data-center-x={drawing?.view.center.x} data-center-y={drawing?.view.center.y} data-time={drawing?.seconds ?? (compact ? options.seconds : undefined)} data-clipped={drawing?.clippedEntities} data-cropped-details={drawing?.croppedDetails} data-frame-length={framedLength ?? undefined} data-frame-width={framedWidth ?? undefined} data-label-collisions={drawing?.labelCollisions}
    data-screen-mode={screenMode} data-screen-version={screenMode ? SCREEN_PRESENTATION_VERSION : undefined}
    data-rotation={drawing?.view.rotation} data-frame-fit={fittedAll ? "all" : options.fit ?? "exercise"}
    data-overlapping-players={screen?.playerOverlaps} data-deferred-labels={screen?.deferredLabels}
    data-fit-all={fittedAll || undefined} data-player-diameter={drawing?.screen?.playerDiameter}
    data-number-size={drawing?.screen && !drawing.screen.numbersHidden && !compactFallback ? drawing.screen.numberSize : undefined}
    onPointerDown={interaction && drawing ? (e) => interaction.down(e, drawing.view) : undefined}
    onPointerMove={interaction && drawing ? (e) => interaction.move(e, drawing.view) : undefined}
    onPointerUp={interaction && drawing ? (e) => interaction.up(e, drawing.view) : undefined}
    onPointerCancel={interaction?.cancel}>
    {compactFallback ? <span className="programme-diagram-available">Diagram in session preview</span> : drawing && size ? <>
    <svg role="img" aria-labelledby={`${id}-title`} aria-describedby={`${id}-desc`} width="100%" height="100%" viewBox={`0 0 ${size.width} ${size.height}`} overflow="hidden">
      <title id={`${id}-title`}>{title}</title><desc id={`${id}-desc`}>Scene {scene.id}, revision {scene.revision}. Metres. {scene.field.length} by {scene.field.width}. Snapshot {drawing.seconds} seconds. {drawing.stage ?? "Static scene"}. {drawing.clippedEntities} cropped markers. {drawing.outsideField} anchors outside pitch. {drawing.labelCollisions} label overlaps.{compact ? " Player and equipment details are available in the session preview." : screen ? " Inspect diagram labels and players below the pitch." : ""}</desc>
      {drawing.nodes.map(renderDrawingNode)}
    </svg>
    {!screenMode && <span className="scene-diagram-caption">{status}</span>}
    {!screenMode && crop && options.paint === "coaching-light" && <span className="scene-diagram-crop-warning" role="status" style={{ position: "absolute", top: 6, left: 8, right: 8, padding: "4px 8px", background: "#fff7df", color: "#25341f", fontSize: 13, borderRadius: 3 }}>This frame crops {drawing.clippedEntities} markers / {drawing.croppedDetails} authored details. Use Fit all content to inspect them.</span>}
    </> : size && <span className="scene-diagram-error" role="alert">Diagram unavailable: {errorMessage}</span>}
    {viewer?.overlay}
  </Surface>;
  if (!screenMode || compact) return board;
  return <div className="screen-diagram-layout">
    {board}
    <div className="screen-diagram-footer">
      {viewer?.caption}
      <div className="screen-diagram-status">
        <span>{viewer?.coachingFrame ?? (cropMessage ? <span className="screen-diagram-crop" role="status">{viewer ? "Current frame: " : ""}{cropMessage}{!autoFitContent && !viewer && " Use Fit all content."}</span> : frameSummary)}</span>
        {!viewer?.coachingFrame && cropMessage && viewer?.onShowAll && <button className="viewer-show-all" type="button" onClick={viewer.onShowAll}>Show all</button>}
        {!viewer?.coachingFrame && !cropMessage && viewer?.frameNote && <span className="viewer-frame-note" role="status">{viewer.frameNote}</span>}
        {fittedAll && !crop && <span>Fitted all content</span>}
      </div>
      {!!screen?.details.length && <details className="screen-diagram-inspection" onToggle={event => { if (!event.currentTarget.open) setInspection(undefined); }}>
        <summary aria-label="Inspect diagram labels and players">Inspect diagram{screen.deferredLabels > 0 && ` · ${screen.deferredLabels} ${screen.deferredLabels === 1 ? "label" : "labels"} in list`}{screen.playerOverlaps > 0 && ` · ${screen.playerOverlaps} overlapping players`}</summary>
        <ul aria-label="Diagram labels and players" tabIndex={0}>
          {screen.details.map(detail => <li key={detail.id}><button type="button" aria-pressed={inspected === detail.id}
            onClick={() => setInspection(previous => previous?.source === source && previous.id === detail.id ? undefined : { source, id: detail.id })}>{detail.text}</button></li>)}
        </ul>
      </details>}
    </div>
  </div>;
}
