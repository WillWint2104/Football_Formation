import type { PrintDiagram } from "@/lib/designer/print-composition";
import { renderDrawingNode } from "@/components/tactical/DrawingNodes";

/** Passive, deterministic SVG. It needs no ResizeObserver, animation clock or external asset to print. */
export function PrintableDiagrams({ diagrams, activityTitle }: { diagrams: PrintDiagram[]; activityTitle: string }) {
  return <section className="designer-plan-diagrams" aria-label="Activity diagrams">{diagrams.map(d => <figure key={d.index} className="designer-plan-diagram" data-diagram-index={d.index} data-diagram-status={d.status}>
    <figcaption><strong>{activityTitle} - Diagram {d.index + 1}</strong><span>Scene {d.pin.scene.id} · revision {d.pin.scene.revision} · {d.pin.representativeSeconds} seconds · Namespace: {d.namespace ?? "not verified"}</span></figcaption>
    {d.status === "ready" ? <><svg className="designer-print-scene" role="img" aria-label={`Diagram ${d.index + 1}, scene ${d.pin.scene.id}, revision ${d.pin.scene.revision}, ${d.pin.representativeSeconds} seconds`}
      viewBox={`0 0 ${d.drawing.view.width} ${d.drawing.view.height}`} width={d.drawing.view.width} height={d.drawing.view.height}
      data-scene-id={d.resolved.scene.id} data-revision={d.resolved.scene.revision} data-time={d.resolved.representativeSeconds} data-namespace={d.resolved.namespace}
      data-clipped={d.drawing.clippedEntities} data-label-collisions={d.drawing.labelCollisions}>
      <title>Diagram {d.index + 1}</title><desc>Exact saved scene. Metres. {d.resolved.scene.field.length} by {d.resolved.scene.field.width}. {d.drawing.clippedEntities} cropped markers.</desc>
      <svg width="100%" height="100%" overflow="hidden">{d.drawing.nodes.map(renderDrawingNode)}</svg>
    </svg><p className="designer-plan-diagram-scale">Metres · {d.drawing.gridSpacing} m grid · {d.drawing.clippedEntities ? `${d.drawing.clippedEntities} cropped markers; review framing` : "Uniform scale"}</p></>
      : <div className="designer-print-unavailable"><strong>Diagram unavailable - not included</strong><p>{d.reason}</p><p>The requested scene, revision and time above have been retained. No substitute diagram was used.</p></div>}
  </figure>)}</section>;
}
