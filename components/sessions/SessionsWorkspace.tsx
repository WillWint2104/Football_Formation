"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { useCoaching } from "@/components/coaching/CoachingProvider";
import { WorkspaceStatus } from "@/components/coaching/WorkspaceStatus";
import { eventSession, latestEvents, sessionLabels } from "@/lib/calendar/schedule";
import { latest, newSession } from "@/lib/coaching/sessions";
import type { Session } from "@/lib/domain/session";
import { SessionTypeIcon } from "@/components/calendar/SessionTypeIcon";
import { SessionEditor } from "./SessionEditor";
import { SessionLibraryPreview } from "./SessionLibraryPreview";
import { SavedSessionExplorer } from "./SavedSessionExplorer";
import type { SessionCopyRequest } from "@/lib/coaching/session-copy";
import { sessionCatalogue, filterCatalogue, scopedSessionEditorHref, sessionPreviewHref, withLibraryFilters } from "@/lib/coaching/catalogue";
import type { RevisionRef } from "@/lib/domain/common";
import { sessionKindSchema } from "@/lib/domain/session";
import { calendarReturnProblem, savedCalendarHref, updatedCalendarReturn, withCalendar, type CalendarReturn } from "@/lib/coaching/calendar-return";

/** Library entries resolve explicit booking pins; historical links remain read-only snapshots. */
export function SessionsWorkspace({ eventId, sessionId, revision, preview = false, organizationId, booking, copyRequest, calendar }: { eventId?: string; sessionId?: string; revision?: number; preview?: boolean; organizationId?: string; booking?: RevisionRef; copyRequest?: SessionCopyRequest; calendar?: CalendarReturn }) {
  const { snapshot, scope, loading, busy, blocked, dirty, markDirty } = useCoaching();
  const bundle = snapshot.bundle;
  const router = useRouter();
  const params = useSearchParams();
  const librarySearch = (params.get("q") ?? "").slice(0, 200);
  const libraryKind = sessionKindSchema.safeParse(params.get("type")).data ?? "";
  const withFilters = (href: string) => withLibraryFilters(href, librarySearch, libraryKind);
  const [navigating, startNavigation] = useTransition();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("");
  const [creation, setCreation] = useState<{ scope: number; session: Session } | null>(null);
  const bookings = latestEvents(bundle);
  const bookedIds = new Set(bookings.flatMap((e) => e.session ? [e.session.id] : []));
  const items = sessionCatalogue(bundle);
  const event = eventId ? (revision ? bundle.events.find((e) => e.id === eventId && e.revision === revision) : bookings.find((e) => e.id === eventId)) : undefined;
  const created = creation?.scope === scope && creation.session.organizationId === bundle.organizationId ? creation.session : null;
  const source = created ?? (organizationId && organizationId !== bundle.organizationId ? undefined : event ? eventSession(bundle, event) : sessionId ? (revision ? bundle.sessions.find((s) => s.id === sessionId && s.revision === revision) : latest(bundle.sessions).find((s) => s.id === sessionId)) : undefined);
  const previewBooking = booking && bundle.events.find((e) => e.id === booking.id && e.revision === booking.revision && e.session?.id === source?.id && e.session?.revision === source?.revision);
  const historical = !created && !!source && (event ? bookings.find((e) => e.id === event.id)?.revision !== event.revision : latest(bundle.sessions).find((s) => s.id === source.id)?.revision !== source.revision || bookedIds.has(source.id));
  const currentEvent = bookings.find(e => e.id === eventId);
  const currentSource = currentEvent ? eventSession(bundle, currentEvent) : latest(bundle.sessions).find(s => s.id === sessionId);
  const currentHref = eventId ? currentEvent && calendar ? withCalendar(`/sessions?event=${encodeURIComponent(eventId)}&revision=${currentEvent.revision}`, updatedCalendarReturn(calendar, currentEvent)) : `/sessions?event=${encodeURIComponent(eventId)}` : `/sessions?session=${encodeURIComponent(sessionId ?? "")}`;
  const problem = calendar && !loading ? calendarReturnProblem(bundle, calendar, eventId, revision) : undefined;
  if (problem) return <div className="calendar-workspace"><h1>Calendar editing context unavailable</h1><p role="alert">{problem} No other booking was selected.</p><Link href="/calendar">Open Calendar</Link></div>;
  const newDisabled = loading || busy || blocked || navigating || !bundle.teams.length;
  const createSession = () => {
    if (dirty && !window.confirm("Discard the current unsaved draft?")) return;
    markDirty(false);
    setCreation({ scope, session: newSession(bundle, bundle.teams[0].id) });
  };
  if (!created && (preview || !eventId && !sessionId)) {
    const selected = source && (!booking || previewBooking) ? source : undefined;
    const current = selected && latest(bundle.sessions).find(s => s.id === selected.id);
    return <SavedSessionExplorer items={items} bundle={bundle} loading={loading} search={librarySearch} kind={libraryKind}
      selected={selected} booking={previewBooking} requested={preview} onCreate={createSession} createDisabled={newDisabled}>
      {selected && <SessionLibraryPreview key={JSON.stringify([scope, selected.id, selected.revision, previewBooking?.id, previewBooking?.revision])}
        source={selected} copyRequest={copyRequest} explorer={{
          booking: previewBooking, closeHref: withFilters("/sessions"),
          editLabel: (previewBooking ? bookings.find(e => e.id === previewBooking.id)?.revision !== previewBooking.revision : current?.revision !== selected.revision || bookedIds.has(selected.id))
            ? "Open saved snapshot" : "Edit session",
        }}
        previewHref={withFilters(sessionPreviewHref(selected, previewBooking))}
        latestHref={current && withFilters(sessionPreviewHref(current))}
        editHref={withFilters(scopedSessionEditorHref(selected, previewBooking))} />}
    </SavedSessionExplorer>;
  }
  return <div className={`calendar-workspace coaching-workspace${calendar ? " coaching-from-calendar calendar-integrated" : ""}`}><div className="calendar-page-heading"><div><p className="calendar-eyebrow">Prepare every session</p><h1>{calendar ? "Edit scheduled session" : "Session library"}</h1><p className="calendar-muted">Independent plans, structured activities and exact saved revisions.</p></div>
    {!calendar && (created ? <button className="calendar-secondary" disabled={busy} onClick={() => {
      if (window.confirm("Discard the current unsaved draft?")) setCreation(null);
    }}>Cancel new session</button> : <button className="calendar-primary" disabled={newDisabled} onClick={createSession}>New session</button>)}</div>
    <WorkspaceStatus />
    <div className="coaching-library-layout"><aside className="coaching-catalog"><label>Find sessions<input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search activity or objective" /></label>
      <label>Filter session type<select aria-label="Filter session type" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">All session types</option>{Object.entries(sessionLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <div className="coaching-catalog-items">{filterCatalogue(items, search, kind).map((item) =>
        <div key={item.key} className="coaching-catalog-record"><Link className={`coaching-record calendar-type-${item.session.content.kind}`} href={item.href} aria-current={!created && source?.id === item.session.id && event?.id === item.event?.id ? "page" : undefined}
          onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); startNavigation(() => router.push(item.href)); }}>
          <span><SessionTypeIcon kind={item.session.content.kind} />{sessionLabels[item.session.content.kind]}</span><strong>{item.session.content.title}</strong><small>{item.event ? `${item.event.localDate} · ${item.event.status}` : "Unscheduled plan"} · v{item.session.revision}</small></Link>
          <Link className="coaching-preview-link" href={withFilters(sessionPreviewHref(item.session, item.event))}>Preview content · v{item.session.revision}</Link></div>)}
        {!items.length && <p className="calendar-muted">No saved sessions. Create a plan or apply a reusable template.</p>}</div>
      <Link href="/templates">Browse session templates →</Link>
    </aside>
    <section className="coaching-detail" aria-label="Session editor" aria-busy={navigating}>{loading ? <p className="coaching-empty">Loading validated coaching records…</p> : source ? <>
      {historical && <p className="coaching-notice">This exact snapshot is preserved. {bookedIds.has(source.id) && !event
        ? <Link href={withLibraryFilters("/sessions", source.content.title.slice(0, 200), source.content.kind)}>Find a current booking</Link>
        : <Link href={withFilters(organizationId && currentSource ? scopedSessionEditorHref(currentSource, currentEvent) : currentHref)}>Open current booking/session</Link>}</p>}
      <SessionEditor key={`${scope}:${snapshot.version}:${created ? "new" : event?.id ?? source.id}:${source.revision}`} source={source} event={created ? undefined : event} historical={historical} isNew={!!created} navigating={navigating}
        calendar={calendar} previewHref={withFilters(sessionPreviewHref(source, event))}
        onSaved={(session, savedEvent) => startNavigation(() => {
          setCreation(null); markDirty(false);
          const href = organizationId && !created ? scopedSessionEditorHref(session, savedEvent)
            : savedEvent ? `/sessions?event=${encodeURIComponent(savedEvent.id)}&revision=${savedEvent.revision}` : `/sessions?session=${encodeURIComponent(session.id)}`;
          router.replace(savedEvent && calendar ? savedCalendarHref(calendar, savedEvent, "session-saved") : withFilters(href));
        })}
        onTemplate={(id) => startNavigation(() => router.push(`/templates?item=${encodeURIComponent(id)}`))} />
      {!created && <details className="coaching-history"><summary>Saved revision history</summary>{event ? bundle.events.filter((e) => e.id === event.id).sort((a, b) => b.revision - a.revision).map((e) => <Link key={e.revision} href={`/sessions?event=${encodeURIComponent(e.id)}&revision=${e.revision}`}>Booking v{e.revision} · session v{e.session?.revision ?? "—"}</Link>)
        : bundle.sessions.filter((s) => s.id === source.id).sort((a, b) => b.revision - a.revision).map((s) => <Link key={s.revision} href={`/sessions?session=${encodeURIComponent(s.id)}&revision=${s.revision}`}>Session v{s.revision}</Link>)}</details>}
    </> : <div className="coaching-empty"><h2>{eventId || sessionId ? "Requested revision is unavailable" : "Choose a session to prepare"}</h2><p>Select an independent plan, create a session, or apply a reusable template. No missing revision is silently replaced.</p></div>}</section></div>
  </div>;
}
