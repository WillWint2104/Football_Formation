"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useCoaching } from "@/components/coaching/CoachingProvider";
import { WorkspaceStatus } from "@/components/coaching/WorkspaceStatus";
import { eventSession, latestEvents, sessionLabels } from "@/lib/calendar/schedule";
import { latest, newSession } from "@/lib/coaching/sessions";
import type { Session } from "@/lib/domain/session";
import { SessionTypeIcon } from "@/components/calendar/SessionTypeIcon";
import { SessionEditor } from "./SessionEditor";

/** Library entries resolve explicit booking pins; historical links remain read-only snapshots. */
export function SessionsWorkspace({ eventId, sessionId, revision }: { eventId?: string; sessionId?: string; revision?: number }) {
  const { snapshot, scope, loading, busy, blocked, dirty, markDirty } = useCoaching();
  const bundle = snapshot.bundle;
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("");
  const [creation, setCreation] = useState<{ scope: number; session: Session } | null>(null);
  const bookings = latestEvents(bundle);
  const bookedIds = new Set(bookings.flatMap((e) => e.session ? [e.session.id] : []));
  const items = [...bookings.flatMap((event) => {
    const session = eventSession(bundle, event);
    return session ? [{ key: `event-${event.id}`, session, event, href: `/sessions?event=${encodeURIComponent(event.id)}&revision=${event.revision}` }] : [];
  }), ...latest(bundle.sessions).filter((s) => !bookedIds.has(s.id)).map((session) => ({ key: `session-${session.id}`, session, event: undefined, href: `/sessions?session=${encodeURIComponent(session.id)}` }))];
  const event = eventId ? (revision ? bundle.events.find((e) => e.id === eventId && e.revision === revision) : bookings.find((e) => e.id === eventId)) : undefined;
  const created = creation?.scope === scope && creation.session.organizationId === bundle.organizationId ? creation.session : null;
  const source = created ?? (event ? eventSession(bundle, event) : sessionId ? (revision ? bundle.sessions.find((s) => s.id === sessionId && s.revision === revision) : latest(bundle.sessions).find((s) => s.id === sessionId)) : undefined);
  const historical = !created && !!source && (event ? bookings.find((e) => e.id === event.id)?.revision !== event.revision : latest(bundle.sessions).find((s) => s.id === source.id)?.revision !== source.revision || bookedIds.has(source.id));
  const currentHref = eventId ? `/sessions?event=${encodeURIComponent(eventId)}` : `/sessions?session=${encodeURIComponent(sessionId ?? "")}`;
  return <div className="calendar-workspace coaching-workspace"><div className="calendar-page-heading"><div><p className="calendar-eyebrow">Prepare every session</p><h1>Session library</h1><p className="calendar-muted">Independent plans, structured activities and exact saved revisions.</p></div>
    <button className="calendar-primary" disabled={loading || busy || blocked || navigating || !bundle.teams.length} onClick={() => {
      if (dirty && !window.confirm("Discard the current unsaved draft?")) return;
      markDirty(false); setCreation({ scope, session: newSession(bundle, bundle.teams[0].id) });
    }}>New session</button></div>
    <WorkspaceStatus />
    <div className="coaching-library-layout"><aside className="coaching-catalog"><label>Find sessions<input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search activity or objective" /></label>
      <label>Filter session type<select aria-label="Filter session type" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">All session types</option>{Object.entries(sessionLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <div className="coaching-catalog-items">{items.filter(({ session }) => (!kind || session.content.kind === kind) && `${session.content.title} ${session.content.objective ?? ""}`.toLowerCase().includes(search.toLowerCase())).map((item) =>
        <Link key={item.key} className={`coaching-record calendar-type-${item.session.content.kind}`} href={item.href} aria-current={!created && source?.id === item.session.id && event?.id === item.event?.id ? "page" : undefined}
          onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); startNavigation(() => router.push(item.href)); }}>
          <span><SessionTypeIcon kind={item.session.content.kind} />{sessionLabels[item.session.content.kind]}</span><strong>{item.session.content.title}</strong><small>{item.event ? `${item.event.localDate} · ${item.event.status}` : "Unscheduled plan"} · v{item.session.revision}</small></Link>)}
        {!items.length && <p className="calendar-muted">No saved sessions. Create a plan or apply a reusable template.</p>}</div>
      <Link href="/templates">Browse session templates →</Link>
    </aside>
    <section className="coaching-detail" aria-label="Session editor" aria-busy={navigating}>{loading ? <p className="coaching-empty">Loading validated coaching records…</p> : source ? <>
      {historical && <p className="coaching-notice">This exact snapshot is preserved. <Link href={bookedIds.has(source.id) && !event ? items.find((i) => i.session.id === source.id)?.href ?? currentHref : currentHref}>Open current booking/session</Link></p>}
      <SessionEditor key={`${scope}:${snapshot.version}:${created ? "new" : event?.id ?? source.id}:${source.revision}`} source={source} event={created ? undefined : event} historical={historical} isNew={!!created} navigating={navigating}
        onSaved={(session, savedEvent) => startNavigation(() => { setCreation(null); router.replace(savedEvent ? `/sessions?event=${encodeURIComponent(savedEvent.id)}&revision=${savedEvent.revision}` : `/sessions?session=${encodeURIComponent(session.id)}`); })}
        onTemplate={(id) => startNavigation(() => router.push(`/templates?item=${encodeURIComponent(id)}`))} />
      {!created && <details className="coaching-history"><summary>Saved revision history</summary>{event ? bundle.events.filter((e) => e.id === event.id).sort((a, b) => b.revision - a.revision).map((e) => <Link key={e.revision} href={`/sessions?event=${encodeURIComponent(e.id)}&revision=${e.revision}`}>Booking v{e.revision} · session v{e.session?.revision ?? "—"}</Link>)
        : bundle.sessions.filter((s) => s.id === source.id).sort((a, b) => b.revision - a.revision).map((s) => <Link key={s.revision} href={`/sessions?session=${encodeURIComponent(s.id)}&revision=${s.revision}`}>Session v{s.revision}</Link>)}</details>}
    </> : <div className="coaching-empty"><h2>{eventId || sessionId ? "Requested revision is unavailable" : "Choose a session to prepare"}</h2><p>Select an independent plan, create a session, or apply a reusable template. No missing revision is silently replaced.</p></div>}</section></div>
  </div>;
}
