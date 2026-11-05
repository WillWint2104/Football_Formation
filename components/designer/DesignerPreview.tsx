import type { CSSProperties } from "react";
import { activityTotals } from "@/lib/coaching/sessions";
import { sessionLabels } from "@/lib/calendar/schedule";
import { printTheme, printTokens } from "@/lib/documents/print-theme";
import { contrastingInk } from "@/lib/designer/branding";
import { cleanDocument, hexColorSchema, toSessionContent, type DesignerDocument } from "@/lib/designer/contract";
import type { PrintActivity } from "@/lib/designer/print-composition";
import { DiagramTraceability, PrintableDiagrams } from "./PrintableDiagrams";
import { equipmentOverview } from "@/lib/designer/overview";

function Lines({ title, lines, ordered = false }: { title: string; lines: string[]; ordered?: boolean }) {
  if (!lines.length) return null;
  const List = ordered ? "ol" : "ul";
  return <section className="designer-plan-section"><h3>{title}</h3>{lines.length ? <List>{lines.map((line, i) => <li key={i}>{line}</li>)}</List> : <p className="designer-plan-muted">Not specified</p>}</section>;
}

/** Print presentation uses existing guide typography/tokens and the same adapted session content. */
export function DesignerPreview({ document, visible, activities = [] }: { document: DesignerDocument; visible: boolean; activities?: PrintActivity[] }) {
  const clean = cleanDocument(document), { session, branding } = clean, content = toSessionContent(clean), totals = activityTotals(content.activities);
  const equipment = equipmentOverview(session.activities);
  const color = (value: string | null, fallback: string) => hexColorSchema.safeParse(value).success ? value! : fallback;
  const primary = color(branding.primaryColor, printTheme.navy), secondary = color(branding.secondaryColor, printTheme.ink), accent = color(branding.accentColor, printTheme.gold);
  const style = { "--plan-primary": primary, "--plan-secondary": secondary, "--plan-accent": accent, "--plan-primary-ink": contrastingInk(primary), "--plan-accent-ink": contrastingInk(accent), "--plan-body-size": `${printTokens.body}pt` } as CSSProperties;
  return <div className="designer-print" hidden={!visible} style={style} aria-label="Branded session plan">
    <header className="designer-plan-header">
      {branding.logo && <div className="designer-plan-crest">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={branding.logo.dataUrl} width={branding.logo.width} height={branding.logo.height} alt={`${branding.clubName ?? "Club"} crest`} />
      </div>}
      <div><p className="designer-plan-kicker">{branding.clubName ?? "Coaching session plan"}</p><h1>{session.name || "Untitled coaching session"}</h1><p>{session.type ? sessionLabels[session.type] : "Type not specified"}{session.team ? ` · ${session.team}` : " · Team not specified"}</p></div><span className="designer-plan-document-label">Session plan</span>
    </header>
    <div className="designer-plan-body"><section className="designer-plan-facts" aria-label="Plan facts"><div><span>Planned duration</span><strong>{session.durationMinutes === null ? "Not specified" : `${session.durationMinutes} minutes`}</strong></div><div><span>Activity timings</span><strong>{totals.minutes} known minutes</strong><small>{totals.unknown} untimed activities</small></div><div><span>Participants</span><strong>{session.playerCount ?? "Not specified"}</strong></div></section>
      {session.durationMinutes !== null && (totals.unknown > 0 || totals.minutes !== session.durationMinutes) && <p className="designer-plan-note">Activity timings differ from the planned session duration.{totals.unknown > 0 ? " Untimed activities remain unknown." : ""}</p>}
      <section className="designer-plan-objectives">{session.objectives.length ? <><h2>Session objectives</h2><ul>{session.objectives.map((s, i) => <li key={i}>{s}</li>)}</ul></> : <p className="designer-plan-muted">Session objectives: Not specified</p>}{!!session.focus.length && <p><strong>Focus:</strong> {session.focus.join(" · ")}</p>}</section>
      {content.activities.length > 1 && <div className="designer-plan-overview-grid"><section className="designer-plan-sequence"><h2>Session sequence</h2><table><thead><tr><th>Order</th><th>Activity</th><th>Duration</th></tr></thead><tbody>{content.activities.map((a, i) => <tr key={a.id}><td>{String(i + 1).padStart(2, "0")}</td><td>{a.content.title}</td><td>{a.durationMinutes === null ? "Unknown" : `${a.durationMinutes} min`}</td></tr>)}</tbody></table></section>
      <section className="designer-plan-equipment-summary"><h2>Equipment overview</h2>{equipment.length ? <><ul>{equipment.map(item => <li key={item.name}><strong>{item.name}</strong>: {item.quantity ?? "quantity unknown"}{item.unknown && item.quantity !== null ? " · some quantities unknown" : ""}</li>)}</ul><p className="designer-plan-muted">Peak known per activity; confirm parallel-group requirements.</p></> : <p className="designer-plan-muted">Not specified</p>}</section></div>}
      {!content.activities.length && <p className="designer-plan-muted">No activities added.</p>}
      {content.activities.map((a, i) => {
        const resolved = activities.find(item => item.activityId === a.id);
        const split = resolved?.presentation === "split" || resolved?.presentation === "balanced";
        const sideCoaching = split && a.content.coachingPoints.length <= 3 && a.content.coachingPoints.join("").length <= 120 && a.content.equipment.length <= 4 && a.content.equipment.map(e => e.name).join("").length < 100;
        const supplements = <><Lines title="Progressions" lines={a.content.progressions} /><Lines title="Regressions" lines={a.content.regressions} /><Lines title="Variations" lines={a.content.variations} /></>;
        const sideSupplements = resolved?.presentation === "sequence" && resolved.diagrams.length >= 4 && resolved.diagrams.every(d => d.layout === "compact") && resolved.diagrams.length % 2 === 0 && [...a.content.progressions,...a.content.regressions,...a.content.variations].join("").length <= 160 && a.content.equipment.length <= 4;
        const setup = <div className={`designer-plan-setup${sideSupplements ? " designer-plan-setup-supplements" : ""}${a.content.equipment.length > 10 || a.content.equipment.reduce((n,e) => n + e.name.length, 0) > 500 ? " designer-plan-setup-long" : ""}`}><section><h3>Setup</h3><dl><dt>Players</dt><dd>{a.content.playerCount ?? "Not specified"}</dd><dt>Field dimensions</dt><dd>{a.content.area ? `${a.content.area.length} × ${a.content.area.width} m` : "Not specified"}</dd>{a.content.area && <><dt>Origin (metres)</dt><dd>{a.content.area.origin.x}, {a.content.area.origin.y}</dd></>}</dl></section><section><h3>Equipment</h3>{a.content.equipment.length ? <ul>{a.content.equipment.map((item, n) => <li key={n}>{item.name} · {item.quantity ?? "quantity unknown"}</li>)}</ul> : <p className="designer-plan-muted">Not specified</p>}</section>{sideCoaching && <Lines title="Coaching points" lines={a.content.coachingPoints} />}{sideSupplements && <div>{supplements}</div>}</div>;
        return <article className={`designer-plan-activity${a.content.diagrams.length ? " designer-plan-illustrated" : ""}${split ? " designer-plan-split" : ""}${resolved?.presentation === "balanced" ? " designer-plan-balanced" : ""}`} key={a.id} aria-label={`Plan activity ${i + 1}: ${a.content.title}`}><header><span className="designer-plan-number">{String(i + 1).padStart(2, "0")}</span><div><p className="designer-plan-muted">{a.role.replaceAll("-", " ")}</p><h2>{a.content.title}</h2></div><strong>{a.durationMinutes === null ? "Duration unknown" : `${a.durationMinutes} min`}</strong></header>
        <div className="designer-plan-practice-grid">{!!a.content.diagrams.length && <PrintableDiagrams setup={resolved?.presentation === "sequence" ? setup : undefined} activityTitle={a.content.title} diagrams={resolved?.diagrams ?? a.content.diagrams.map((pin, index) => ({ index, pin, layout: "wide" as const, namespace: null, status: "unavailable" as const, reason: "Use Print / Save as PDF or Branded preview to verify the complete local plan before printing diagrams." }))} />}{resolved?.presentation !== "sequence" && setup}</div>
        <div className={sideCoaching || a.content.instructions.join("").length + a.content.coachingPoints.join("").length > 1200 || a.content.instructions.length > 10 ? "designer-plan-delivery designer-plan-long" : "designer-plan-delivery"}><Lines title="Setup & delivery instructions" lines={a.content.instructions} ordered />{!sideCoaching && <Lines title="Coaching points" lines={a.content.coachingPoints} />}</div>
        {!sideSupplements && <div className={[...a.content.progressions, ...a.content.regressions, ...a.content.variations].join("").length > 900 ? "designer-plan-coaching designer-plan-long" : "designer-plan-coaching"}>{supplements}</div>}
      </article>; })}
      <DiagramTraceability activities={content.activities.map(a => ({ ...(activities.find(item => item.activityId === a.id) ?? { activityId: a.id, presentation: "wide" as const, diagrams: a.content.diagrams.map((pin, index) => ({ index, pin, layout: "wide" as const, namespace: null, status: "unavailable" as const, reason: "Source not verified" })) }), title: a.content.title }))} />
      <footer className="designer-plan-footer"><span>{branding.clubName ?? "Coaching session plan"}</span><span>Prepared with Football Formation</span></footer>
    </div>
  </div>;
}
