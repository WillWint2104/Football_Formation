"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCoaching } from "@/components/coaching/CoachingProvider";
import { sessionCatalogue, filterCatalogue } from "@/lib/coaching/catalogue";
import { latest } from "@/lib/coaching/sessions";
import { sessionLabels } from "@/lib/calendar/schedule";
import { calendarHref, closeCalendarLibrary, type CalendarNavigation } from "@/lib/calendar/navigation";
import { SessionLibraryPreview } from "@/components/sessions/SessionLibraryPreview";
import { SessionTypeIcon } from "./SessionTypeIcon";
import type { CalendarEvent } from "@/lib/domain/calendar";

/** One transient picker over the Calendar; the existing organisation graph is its only source. */
export function CalendarLibrary({ context }: { context: CalendarNavigation & { date: string } }) {
  const { snapshot, busy, blocked, loading } = useCoaching(), router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null), [search, setSearch] = useState(""), [kind, setKind] = useState("");
  const bundle = snapshot.bundle, base = closeCalendarLibrary(context);
  const source = bundle.sessions.find((s) => s.id === context.session && s.revision === context.revision);
  // A Calendar team filter is a boundary for the picker, never permission to reassign a source.
  const allowedSource = source && (!context.team || source.teamId === context.team) ? source : undefined;
  const items = filterCatalogue(sessionCatalogue(bundle), search, kind, context.team);
  const cancel = () => router.replace(calendarHref(base), { scroll: false });
  const navigate = (value: CalendarNavigation) => router.push(calendarHref(value), { scroll: false });
  function completed(event: CalendarEvent) {
    // Clear only a hiding type filter when returning from a successful copy; the selected team is retained.
    return calendarHref({ ...base, date: event.localDate, event: event.id, bookingRevision: event.revision, focus: "date",
      type: base.type && base.type !== source?.content.kind ? undefined : base.type });
  }
  useEffect(() => {
    // Never stack a picker modal over the native scheduling modal.
    if (context.copy) return;
    const element = dialog.current;
    element?.showModal();
    element?.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
    return () => { element?.close(); document.querySelector<HTMLInputElement>('[aria-label="Selected date"]')?.focus(); };
  }, [context.copy]);
  const content = <>
    <header className="calendar-library-heading"><div><p className="calendar-eyebrow">Plan from the session library</p><h2 id="calendar-library-title">{context.session ? "Preview saved session" : "Choose a coaching session"}</h2>
      <p>{context.date} · {context.view ?? "month"} view · {context.team ? bundle.teams.find((t) => t.id === context.team)?.name : "All teams"}</p></div>
      <button disabled={busy} onClick={cancel}>Cancel · return to Calendar</button></header>
    {context.type && <p className="calendar-muted">The Calendar type filter is retained on cancellation. Scheduling another type will clear that filter so the new booking is visible.</p>}
    {context.session ? allowedSource ? <>
      {!context.copy && <button onClick={() => navigate({ ...base, library: "1" })}>Browse other sessions</button>}
      <SessionLibraryPreview source={allowedSource} copyRequest={context.copy ? { organizationId: bundle.organizationId, source: { id: allowedSource.id, revision: allowedSource.revision }, requestId: context.copy } : undefined}
        editHref="/sessions" calendar={{ date: context.date, previewHref: calendarHref({ ...context, copy: undefined }),
          currentHref: calendarHref({ ...context, revision: latest(bundle.sessions).find((s) => s.id === source!.id)?.revision, copy: undefined }),
          completedHref: completed, onSchedule: () => navigate({ ...context, copy: crypto.randomUUID() }),
          onCancel: cancel, onSaved: (event) => router.replace(completed(event), { scroll: false }) }} />
    </> : <p role="alert">The exact session revision is unavailable for this organisation and team. No replacement was selected. Cancel and browse again.</p> : <>
      <div className="calendar-library-filters"><label>Find sessions<input autoFocus type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Title, focus, objective or activity" /></label>
        <label>Filter session type<select value={kind} onChange={(e) => setKind(e.target.value)}><option value="">All session types</option>{Object.entries(sessionLabels).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label></div>
      <div className="calendar-library-results">{items.map(({ key, session, event }) => <article key={key}>
        <div><span className={`calendar-type-heading calendar-type-${session.content.kind}`}><SessionTypeIcon kind={session.content.kind} />{sessionLabels[session.content.kind]}</span>
          <h3>{session.content.title}</h3><p>{session.content.objective ?? "Objective not specified"}</p><small>{bundle.teams.find((t) => t.id === session.teamId)?.name} · {event ? `Scheduled occurrence · ${event.localDate}` : "Unscheduled plan"} · revision {session.revision} · {session.content.activities.length} activities</small></div>
        <button disabled={busy || blocked || loading} onClick={() => navigate({ ...base, library: "1", session: session.id, revision: session.revision })}>Preview session · r{session.revision}</button>
      </article>)}{!items.length && <p>No sessions match this team and search. No local packages are included.</p>}</div>
      <p className="calendar-muted">Preview first, then schedule an independent copy. Originals and existing bookings stay unchanged. Local Session Designer packages remain separate.</p>
    </>}
  </>;
  return context.copy ? <section className="calendar-library-recovery" aria-label="Calendar scheduling request">{content}</section> :
    <dialog ref={dialog} className="calendar-library-dialog" aria-labelledby="calendar-library-title" onCancel={(e) => { e.preventDefault(); if (!busy) cancel(); }}>{content}</dialog>;
}
