import type { PrintActivity, PrintDiagram } from "@/lib/designer/print-composition";
import { renderDrawingNode } from "@/components/tactical/DrawingNodes";
import type { ReactNode } from "react";

/** Passive, deterministic SVG. It needs no ResizeObserver, animation clock or external asset to print. */
export function PrintableDiagrams({ diagrams, activityTitle, setup }: { diagrams: PrintDiagram[]; activityTitle: string; setup?: ReactNode }) {
  const rows: PrintDiagram[][] = [];
  for (let i = 0; i < diagrams.length; i++) {
    const d = diagrams[i], next = diagrams[i + 1];
    if (d.layout === "compact" && next?.layout === "compact") { rows.push([d, next]); i++; }
    else rows.push([d]);
  }
  const tailSetup = !!setup && rows.at(-1)?.length === 1 && rows.at(-1)?.[0].layout === "compact";
  return <section className="designer-plan-diagrams" aria-label={`Activity diagrams: ${activityTitle}`}>{rows.map((row, i) => <div key={i} className={`designer-plan-diagram-row${row.length === 2 || tailSetup && i === rows.length - 1 ? " designer-plan-diagram-pair" : ""}`}>{row.map(d => <figure key={d.index} className="designer-plan-diagram" data-diagram-index={d.index} data-diagram-status={d.status}>
    <figcaption><strong>{activityTitle} · Diagram {d.index + 1}</strong></figcaption>
    {d.status === "ready" ? <><svg className="designer-print-scene" role="img" aria-label={`Diagram ${d.index + 1}, scene ${d.pin.scene.id}, revision ${d.pin.scene.revision}, ${d.pin.representativeSeconds} seconds`}
      viewBox={`0 0 ${d.drawing.view.width} ${d.drawing.view.height}`} width={d.drawing.view.width} height={d.drawing.view.height}
      data-scene-id={d.resolved.scene.id} data-revision={d.resolved.scene.revision} data-time={d.resolved.representativeSeconds} data-namespace={d.resolved.namespace}
      data-clipped={d.drawing.clippedEntities} data-label-collisions={d.drawing.labelCollisions}>
      <title>Diagram {d.index + 1}</title><desc>Exact saved scene. Metres. {d.resolved.scene.field.length} by {d.resolved.scene.field.width}. {d.drawing.clippedEntities} cropped markers.</desc>
      <svg width="100%" height="100%" overflow="hidden">{d.drawing.nodes.map(renderDrawingNode)}</svg>
    </svg><p className="designer-plan-diagram-scale">Metres · {d.drawing.gridSpacing} m grid{d.drawing.clippedEntities ? ` · ${d.drawing.clippedEntities} cropped markers; review framing` : " · Uniform scale"}</p></>
      : <div className="designer-print-unavailable"><strong>Diagram unavailable - not included</strong><p>{d.reason}</p><p>The requested scene, revision and time have been retained. No substitute diagram was used.</p></div>}
  </figure>)}{tailSetup && i === rows.length - 1 && setup}</div>)}{!tailSetup && setup}</section>;
}

/** Exact identities remain printable, separate from instructions used on the training ground. */
export function DiagramTraceability({ activities }: { activities: (PrintActivity & { title: string })[] }) {
  const illustrated = activities.filter(a => a.diagrams.length);
  if (!illustrated.length) return null;
  return <section className="designer-plan-sources" aria-label="Diagram source details"><h2>Diagram source details{illustrated.length === 1 ? ` · ${illustrated[0].title}` : ""}</h2>
    {illustrated.map(a => <div key={a.activityId} className="designer-plan-source-group">{illustrated.length > 1 && <h3>{a.title}</h3>}{a.diagrams.map(d => <p key={d.index} className="designer-plan-trace"><strong>Diagram {d.index + 1}</strong> · Scene {d.pin.scene.id} · revision {d.pin.scene.revision} · {d.pin.representativeSeconds} seconds · Namespace: {d.namespace ?? "not verified"}</p>)}</div>)}
  </section>;
}
