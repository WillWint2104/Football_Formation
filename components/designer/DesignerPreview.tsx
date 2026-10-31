import type { CSSProperties } from "react";
import { activityTotals } from "@/lib/coaching/sessions";
import { sessionLabels } from "@/lib/calendar/schedule";
import { printTheme, printTokens } from "@/lib/documents/print-theme";
import { contrastingInk } from "@/lib/designer/branding";
import { hexColorSchema, toSessionContent, type DesignerDocument } from "@/lib/designer/contract";

function Lines({ title, lines, ordered = false }: { title: string; lines: string[]; ordered?: boolean }) {
  const List = ordered ? "ol" : "ul";
  return <section className="designer-plan-section"><h3>{title}</h3>{lines.length ? <List>{lines.map((line, i) => <li key={i}>{line}</li>)}</List> : <p className="designer-plan-muted">Not specified</p>}</section>;
}

/** Print presentation uses existing guide typography/tokens and the same adapted session content. */
export function DesignerPreview({ document, visible }: { document: DesignerDocument; visible: boolean }) {
  const { session, branding } = document, content = toSessionContent(document), totals = activityTotals(content.activities);
  const color = (value: string | null, fallback: string) => hexColorSchema.safeParse(value).success ? value! : fallback;
  const primary = color(branding.primaryColor, printTheme.navy), secondary = color(branding.secondaryColor, printTheme.ink), accent = color(branding.accentColor, printTheme.gold);
  const style = { "--plan-primary": primary, "--plan-secondary": secondary, "--plan-accent": accent, "--plan-primary-ink": contrastingInk(primary), "--plan-accent-ink": contrastingInk(accent), "--plan-body-size": `${printTokens.body}pt` } as CSSProperties;
  return <div className="designer-print" hidden={!visible} style={style} aria-label="Branded session plan">
    <header className="designer-plan-header">
      {branding.logo && <div className="designer-plan-crest">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={branding.logo.dataUrl} width={branding.logo.width} height={branding.logo.height} alt={`${branding.clubName ?? "Club"} crest`} />
      </div>}
      <div><p className="designer-plan-kicker">{branding.clubName ?? "Coaching session plan"}</p><h1>{session.name || "Untitled coaching session"}</h1><p>{session.type ? sessionLabels[session.type] : "Type not specified"}{session.team ? ` · ${session.team}` : " · Team not specified"}</p></div>
    </header>
    <div className="designer-plan-body"><section className="designer-plan-facts" aria-label="Plan facts"><div><span>Planned duration</span><strong>{session.durationMinutes === null ? "Not specified" : `${session.durationMinutes} minutes`}</strong></div><div><span>Activity timings</span><strong>{totals.minutes} known minutes</strong><small>{totals.unknown} untimed activities</small></div><div><span>Participants</span><strong>{session.playerCount ?? "Not specified"}</strong></div></section>
      {session.durationMinutes !== null && (totals.unknown > 0 || totals.minutes !== session.durationMinutes) && <p className="designer-plan-note">Activity timings differ from the planned session duration.{totals.unknown > 0 ? " Untimed activities remain unknown." : ""}</p>}
      <section className="designer-plan-objectives"><h2>Session objectives</h2>{session.objectives.length ? <ul>{session.objectives.map((s, i) => <li key={i}>{s}</li>)}</ul> : <p className="designer-plan-muted">Not specified</p>}{!!session.focus.length && <p><strong>Focus:</strong> {session.focus.join(" · ")}</p>}</section>
      <section className="designer-plan-sequence"><h2>Session sequence</h2>{content.activities.length ? <table><thead><tr><th>Order</th><th>Activity</th><th>Role</th><th>Duration</th></tr></thead><tbody>{content.activities.map((a, i) => <tr key={a.id}><td>{String(i + 1).padStart(2, "0")}</td><td>{a.content.title}</td><td>{a.role.replaceAll("-", " ")}</td><td>{a.durationMinutes === null ? "Unknown" : `${a.durationMinutes} min`}</td></tr>)}</tbody></table> : <p className="designer-plan-muted">No activities added.</p>}</section>
      {content.activities.map((a, i) => <article className="designer-plan-activity" key={a.id} aria-label={`Plan activity ${i + 1}: ${a.content.title}`}><header><span className="designer-plan-number">{String(i + 1).padStart(2, "0")}</span><div><p className="designer-plan-muted">{a.role.replaceAll("-", " ")}</p><h2>{a.content.title}</h2></div><strong>{a.durationMinutes === null ? "Duration unknown" : `${a.durationMinutes} min`}</strong></header>
        <div className="designer-plan-setup"><section><h3>Setup</h3><dl><dt>Players</dt><dd>{a.content.playerCount ?? "Not specified"}</dd><dt>Field dimensions</dt><dd>{a.content.area ? `${a.content.area.length} × ${a.content.area.width} m` : "Not specified"}</dd>{a.content.area && <><dt>Origin (metres)</dt><dd>{a.content.area.origin.x}, {a.content.area.origin.y}</dd></>}</dl></section>
          <section><h3>Equipment</h3>{a.content.equipment.length ? <ul>{a.content.equipment.map((item, n) => <li key={n}>{item.name} · {item.quantity ?? "quantity unknown"}</li>)}</ul> : <p className="designer-plan-muted">Not specified</p>}</section></div>
        <Lines title="Setup & delivery instructions" lines={a.content.instructions} ordered />
        <div className="designer-plan-coaching"><Lines title="Coaching points" lines={a.content.coachingPoints} /><Lines title="Progressions" lines={a.content.progressions} /><Lines title="Regressions" lines={a.content.regressions} /><Lines title="Variations" lines={a.content.variations} /></div>
        {!!a.content.diagrams.length && <section className="designer-plan-references"><h3>Tactical diagram references</h3><ul>{a.content.diagrams.map((d, n) => <li key={n}>Scene {d.scene.id} · revision {d.scene.revision} · {d.representativeSeconds} seconds</li>)}</ul><p className="designer-plan-muted">References only. Scene geometry is not included in this portable plan.</p></section>}
      </article>)}
      <footer className="designer-plan-footer"><span>{branding.clubName ?? "Coaching session plan"}</span><span>Prepared with Football Formation</span></footer>
    </div>
  </div>;
}
