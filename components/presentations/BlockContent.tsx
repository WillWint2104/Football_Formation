import type { DomainBundle } from "@/lib/domain/validation";
import { resolveSource, type PresentationBlock } from "@/lib/presentations/contracts";
export function BlockContent({ block, bundle }: { block: PresentationBlock; bundle: DomainBundle }) {
  const { session, content } = resolveSource(bundle, block.source);
  const list = (heading: string, items: string[]) => !!items.length && <section><h3>{heading}</h3><ul>{items.map((text, i) => <li key={i}>{text}</li>)}</ul></section>;
  return <div className="presentation-copy">
    {session && <><p className="calendar-eyebrow">{session.content.kind} · saved session v{session.revision}</p>
      {session.content.objective && <section><h3>Session objective</h3><p>{session.content.objective}</p></section>}
      {list("Focus", session.content.focus)}
      <section><h3>{block.kind === "summary" ? "Session recap" : "Activity sequence"}</h3><ol>{session.content.activities.map(a => <li key={a.id}>{a.content.title}{a.durationMinutes !== null ? ` · ${a.durationMinutes} min` : ""}</li>)}</ol></section></>}
    {content && <>{block.kind === "guidance" && <><div className="presentation-facts"><span>Players <strong>{content.playerCount ?? "Not specified"}</strong></span><span>Area <strong>{content.area ? `${content.area.length} × ${content.area.width} m` : "Not specified"}</strong></span></div>
      {list("Equipment", content.equipment.map(e => `${e.quantity ?? "—"} × ${e.name}`))}{list("Delivery guidance", content.instructions)}</>}
      {list("Coaching points", content.coachingPoints)}{list("Progressions", content.progressions)}{list("Regressions", content.regressions)}{list("Variations", content.variations)}</>}
    {block.notes && <section className="presentation-authored-notes"><h3>Presentation notes</h3><p>{block.notes}</p></section>}
    {!session && !content && !block.notes && <p className="calendar-muted">No coaching notes supplied for this section.</p>}
  </div>;
}
