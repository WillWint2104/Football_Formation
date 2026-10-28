import { z } from "zod";
import Link from "next/link";
import { idSchema, revisionSchema } from "@/lib/domain/common";
import { PresentationsWorkspace } from "@/components/presentations/PresentationsWorkspace";
import "../calendar/calendar.css";
import "../sessions/sessions.css";
import "./presentations.css";
export default async function PresentationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = z.strictObject({ session: idSchema.optional(), revision: z.coerce.number().pipe(revisionSchema).optional() }).safeParse(await searchParams);
  if (!query.success || !!query.data.session !== !!query.data.revision) return <div className="calendar-workspace"><h1>Presentation source unavailable</h1><Link href="/presentations">Open presentation library</Link></div>;
  return <PresentationsWorkspace key={JSON.stringify(query.data)} source={query.data.session && query.data.revision ? { id: query.data.session, revision: query.data.revision } : undefined} />;
}
