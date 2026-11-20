"use client";

import Link from "next/link";
import { ArrowRight, ClipboardList, Clock, Layers, Plus, Search } from "lucide-react";
import type { ReactNode } from "react";
import { SessionTypeIcon } from "@/components/calendar/SessionTypeIcon";
import { WorkspaceStatus } from "@/components/coaching/WorkspaceStatus";
import { SceneDiagram } from "@/components/tactical/SceneDiagram";
import { sessionLabels } from "@/lib/calendar/schedule";
import { filterCatalogue, sessionPreviewHref, withLibraryFilters, type sessionCatalogue } from "@/lib/coaching/catalogue";
import { activityTotals } from "@/lib/coaching/sessions";
import type { CalendarEvent } from "@/lib/domain/calendar";
import type { Session } from "@/lib/domain/session";
import type { DomainBundle } from "@/lib/domain/validation";
import { coachingScreenOptions } from "@/lib/tactical/coaching-view";

type Props = {
  items: ReturnType<typeof sessionCatalogue>;
  bundle: DomainBundle;
  selected?: Session;
  booking?: CalendarEvent;
  requested: boolean;
  loading: boolean;
  search: string;
  kind: string;
  onCreate: () => void;
  createDisabled: boolean;
  children: ReactNode;
};

function updateFilters(search: string, kind: string) {
  const params = new URLSearchParams(window.location.search);
  params.delete("q");
  params.delete("type");
  window.history.replaceState(null, "", withLibraryFilters(`/sessions?${params}`, search, kind));
}

function SessionCover({ session, bundle }: { session: Session; bundle: DomainBundle }) {
  const activity = session.content.activities.find(a => a.content.diagrams.length);
  const pin = activity?.content.diagrams[0];
  const scene = pin && bundle.scenes.find(s => s.organizationId === session.organizationId && s.id === pin.scene.id && s.revision === pin.scene.revision);
  return <span className="explorer-card-cover" aria-hidden="true">{scene && pin && activity
    ? <SceneDiagram scene={scene} title={activity.content.title} screenMode="compact" sizingSeconds={pin.representativeSeconds} autoFitContent
        options={coachingScreenOptions(scene, pin.representativeSeconds, activity.content.area)} />
    : <SessionTypeIcon kind={session.content.kind} />}</span>;
}

/** Browsing and inspection share one route. Identity changes use links; filters replace only URL state. */
export function SavedSessionExplorer({ items, bundle, selected, booking, requested, loading, search, kind, onCreate, createDisabled, children }: Props) {
  const matches = filterCatalogue(items, search, kind);
  const showInspector = requested && !loading;
  return <div className={`session-explorer${showInspector ? " session-explorer-selected" : ""}`}>
    <section className="explorer-browser" aria-labelledby="explorer-title">
      <header className="explorer-heading">
        <div><h1 id="explorer-title">Saved Sessions</h1><p>Browse coaching plans, inspect activities and schedule an independent copy.</p></div>
        <button type="button" className="explorer-new" disabled={createDisabled} onClick={onCreate}><Plus size={18} aria-hidden="true" />New session</button>
      </header>
      <div className="explorer-filters">
        <label><Search size={18} aria-hidden="true" /><span className="sr-only">Find sessions</span><input type="search" value={search} maxLength={200} onChange={e => updateFilters(e.target.value, kind)} placeholder="Search sessions, activities or objectives" /></label>
        <select aria-label="Filter session type" value={kind} onChange={e => updateFilters(search, e.target.value)}>
          <option value="">All session types</option>{Object.entries(sessionLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        {(search || kind) && <button type="button" className="explorer-clear" onClick={() => updateFilters("", "")}>Clear filters</button>}
      </div>
      <div className="explorer-list-heading"><strong role="status">{loading ? "Loading saved sessions…" : `${matches.length} ${matches.length === 1 ? "session" : "sessions"}`}</strong><Link href="/templates">Session templates <ArrowRight size={15} aria-hidden="true" /></Link></div>
      <div className="explorer-list" aria-label="Saved session results">
        {!loading && matches.map(({ key, session, event }) => {
          const { minutes, unknown } = activityTotals(session.content.activities);
          const active = selected?.id === session.id && selected.revision === session.revision && booking?.id === event?.id && booking?.revision === event?.revision;
          return <Link key={key} href={withLibraryFilters(sessionPreviewHref(session, event), search, kind)}
            aria-current={active ? "true" : undefined} scroll={false} prefetch={false} className="explorer-card">
            <SessionCover session={session} bundle={bundle} />
            <span className="explorer-card-content">
              <strong>{session.content.title}</strong>
              {session.content.objective && <span className="explorer-card-objective">{session.content.objective}</span>}
              <span className="explorer-card-facts">
                <span><Layers aria-hidden="true" />{session.content.activities.length} activities</span>
                <span><Clock aria-hidden="true" />{unknown ? (minutes ? `${minutes} known min` : "Duration unknown") : minutes ? `${minutes} min` : "No activity time"}</span>
                <span>{bundle.teams.find(t => t.id === session.teamId)?.name ?? "Team unavailable"}</span>
              </span>
            </span>
            <span className="explorer-card-context">
              <span><SessionTypeIcon kind={session.content.kind} />{sessionLabels[session.content.kind]}</span>
              <small>{event ? `${event.localDate} · ${event.status}` : "Unscheduled plan"}</small>
              <small>Session r{session.revision}{event ? ` · Booking r${event.revision}` : ""}</small>
            </span>
          </Link>;
        })}
        {!loading && !matches.length && <div className="explorer-empty"><ClipboardList aria-hidden="true" /><h2>{items.length ? "No matching sessions" : "No saved sessions"}</h2><p>{items.length ? "Try another search or clear the session type filter." : "Create a plan or start with a session template."}</p></div>}
      </div>
      <div className="explorer-storage"><WorkspaceStatus compact /></div>
    </section>
    {showInspector && (children ?? <section className="explorer-unavailable"><h2>Requested revision is unavailable</h2><p>Check the organisation and saved session or booking reference.</p><Link href={withLibraryFilters("/sessions", search, kind)}>Close preview</Link></section>)}
  </div>;
}
