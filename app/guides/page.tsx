import type { Metadata } from "next";
import Link from "next/link";
import { guideReferenceSchema } from "@/lib/documents/contracts";
import { GuideWorkspace } from "@/components/guides/GuideWorkspace";
import "../calendar/calendar.css";
import "../sessions/sessions.css";
import "./guides.css";

export const metadata: Metadata = { title: "Coaching Guide | Football Formation" };

/** Require an explicit saved session revision; malformed, duplicate and mismatched query references never fall back. */
export default async function GuidesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const result = guideReferenceSchema.safeParse({ session: query.session, revision: typeof query.revision === "string" ? Number(query.revision) : NaN,
    event: query.event, bookingRevision: query.bookingRevision === undefined ? undefined : typeof query.bookingRevision === "string" ? Number(query.bookingRevision) : NaN });
  if (!result.success) return <div className="calendar-workspace"><h1>Invalid guide reference</h1><p>Choose an exact saved session revision.</p><Link href="/sessions">Open session library</Link></div>;
  return <GuideWorkspace key={JSON.stringify(result.data)} reference={result.data} />;
}
