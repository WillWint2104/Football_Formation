import type { Metadata } from "next";
import Link from "next/link";
import { SessionsWorkspace } from "@/components/sessions/SessionsWorkspace";
import { idSchema, revisionSchema } from "@/lib/domain/common";
import { sessionCopyRequestSchema } from "@/lib/coaching/session-copy";
import "../calendar/calendar.css";
import "./sessions.css";
import "./library-preview.css";
import "./session-explorer.css";
import "./calendar-editing.css";
import "../calendar/planning.css";
import "../calendar/programme.css";
import { parseCalendarReturn } from "@/lib/coaching/calendar-return";
import { parseActivityView } from "@/lib/coaching/session-view";

export const metadata: Metadata = { title: "Session Library | Football Formation" };

/** Resolve route identities explicitly; records are loaded through the shared authenticated API boundary. */
export default async function SessionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const event = idSchema.safeParse(query.event);
  const session = idSchema.safeParse(query.session);
  const revision = typeof query.revision === "string" ? revisionSchema.safeParse(Number(query.revision)) : null;
  const organization = idSchema.safeParse(query.organization);
  const preview = query.view === "preview";
  const selection = parseActivityView(query);
  const calendar = typeof query.calendar === "string" ? parseCalendarReturn(query.calendar) : undefined;
  const hasBooking = query.booking !== undefined || query.bookingRevision !== undefined;
  const booking = hasBooking ? idSchema.safeParse(query.booking) : null;
  const bookingRevision = typeof query.bookingRevision === "string" ? revisionSchema.safeParse(Number(query.bookingRevision)) : null;
  const copy = query.copy === undefined ? null : sessionCopyRequestSchema.safeParse({ organizationId: query.organization, source: { id: query.session, revision: revision?.success ? revision.data : undefined }, requestId: query.copy });
  if (query.event !== undefined && !event.success || query.session !== undefined && !session.success || query.revision !== undefined && !revision?.success || query.event && query.session ||
      query.view !== undefined && !preview || preview && (!session.success || !organization.success || query.event !== undefined) ||
      query.organization !== undefined && (!organization.success || !preview && (!(event.success || session.success) || !revision?.success || !!calendar)) ||
      query.copy !== undefined && (!preview || !copy?.success) || query.calendar !== undefined && (!calendar || !event.success || !revision?.success || preview) ||
      hasBooking && (!preview || !revision?.success || !booking?.success || !bookingRevision?.success) ||
      selection === null || selection && !preview)
    return <div className="calendar-workspace"><h1>Invalid session reference</h1><p>No requested revision was substituted.</p><Link href="/sessions">Open session library</Link></div>;
  return <SessionsWorkspace key={JSON.stringify([query.event, query.session, query.revision, query.view, query.organization, query.booking, query.bookingRevision, query.calendar, selection])}
    eventId={event.success ? event.data : undefined} sessionId={session.success ? session.data : undefined}
    revision={revision?.success ? revision.data : undefined} preview={preview} organizationId={organization.success ? organization.data : undefined}
    booking={booking?.success && bookingRevision?.success ? { id: booking.data, revision: bookingRevision.data } : undefined}
    copyRequest={copy?.success ? copy.data : undefined} calendar={calendar ?? undefined} selection={selection} />;
}
