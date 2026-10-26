import type { Metadata } from "next";
import Link from "next/link";
import { SessionsWorkspace } from "@/components/sessions/SessionsWorkspace";
import { idSchema, revisionSchema } from "@/lib/domain/common";
import "../calendar/calendar.css";
import "./sessions.css";

export const metadata: Metadata = { title: "Session Library | Football Formation" };

/** Resolve route identities explicitly; records are loaded through the shared authenticated API boundary. */
export default async function SessionsPage({ searchParams }: { searchParams: Promise<{ event?: string; session?: string; revision?: string }> }) {
  const query = await searchParams;
  const event = idSchema.safeParse(query.event);
  const session = idSchema.safeParse(query.session);
  const revision = typeof query.revision === "string" ? revisionSchema.safeParse(Number(query.revision)) : null;
  if (query.event !== undefined && !event.success || query.session !== undefined && !session.success || query.revision !== undefined && !revision?.success || query.event && query.session)
    return <div className="calendar-workspace"><h1>Invalid session reference</h1><p>No requested revision was substituted.</p><Link href="/sessions">Open session library</Link></div>;
  return <SessionsWorkspace key={`${query.event ?? ""}:${query.session ?? ""}:${query.revision ?? ""}`}
    eventId={event.success ? event.data : undefined} sessionId={session.success ? session.data : undefined}
    revision={revision?.success ? revision.data : undefined} />;
}
