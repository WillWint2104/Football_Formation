import { cleanDocument, toSessionContent, type DesignerDocument } from "@/lib/designer/contract";
import { activityTotals } from "@/lib/coaching/sessions";
import { equipmentOverview, runningOrder } from "@/lib/designer/overview";

/** Read-only pre-session review from the same cleaned portable content used for print and JSON. */
export function SessionOverview({ document, onActivity, onDetails }: { document: DesignerDocument; onActivity: (id: string) => void; onDetails: () => void }) {
  const clean = cleanDocument(document), s = clean.session, totals = activityTotals(toSessionContent(clean).activities);
  const equipment = equipmentOverview(s.activities), order = runningOrder(s.activities);
  return <section className="designer-overview" aria-label="Session overview">
    <dl className="designer-overview-facts"><div><dt>Activities</dt><dd>{s.activities.length} in sequence</dd></div><div><dt>Planned session</dt><dd>{s.durationMinutes === null ? "Unknown" : `${s.durationMinutes} minutes`}</dd></div><div><dt>Activity time</dt><dd>{totals.minutes} known minutes</dd><small>{totals.unknown} untimed activities</small></div><div><dt>Participants</dt><dd>{s.playerCount ?? "Unknown"}</dd></div></dl>
    {s.durationMinutes !== null && (totals.unknown > 0 || totals.minutes !== s.durationMinutes) && <p className="designer-overview-warning">Activity timings differ from the planned session duration.{totals.unknown > 0 ? " Untimed activities remain unknown." : " Review the difference before delivery."}</p>}
    <div className="designer-overview-columns"><div><div className="designer-section-title"><h2>Session objectives</h2><button type="button" onClick={onDetails}>Edit session details</button></div>
      {s.objectives.length ? <ul className="designer-objective-list">{s.objectives.map((line, i) => <li key={i}>{line}</li>)}</ul> : <p className="calendar-muted">Not specified</p>}
      {!!s.focus.length && <p className="calendar-muted">Focus: {s.focus.join(" · ")}</p>}
      <h2>Running order</h2><p className="calendar-muted">Elapsed activity minutes, not booked clock times. Select a practice to edit.</p>
      <div className="designer-running-order">{s.activities.length ? s.activities.map((a, i) => <button type="button" key={a.id} onClick={() => onActivity(a.id)}><span>{String(i + 1).padStart(2, "0")}</span><strong>{a.name || "Untitled activity"}</strong><span>{a.durationMinutes === null ? "Untimed" : `${a.durationMinutes} min`}</span><span>{order[i].start === null || order[i].end === null ? "Elapsed unknown" : `${order[i].start}–${order[i].end} min`}</span></button>) : <p>No activities added.</p>}</div>
    </div><aside><section className="designer-overview-equipment"><h2>Equipment overview</h2><p className="calendar-muted">Largest known quantity per activity; confirm the kit needed for parallel groups. This is not a certified total.</p>{equipment.length ? <dl>{equipment.map((item) => <div key={item.name}><dt>{item.name}</dt><dd>{item.quantity ?? "Unknown"}{item.unknown && item.quantity !== null ? " · some quantities unknown" : ""}</dd></div>)}</dl> : <p>Not specified</p>}</section>
      <section className="designer-overview-staff"><h2>Staff & scheduling</h2><p>Coach assignments, venues and booking times are not included in portable JSON v1.0. No staff or scheduling details have been inferred.</p></section></aside></div>
  </section>;
}
