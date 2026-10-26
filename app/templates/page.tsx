import type { Metadata } from "next";
import Link from "next/link";
import { ReusableLibrary } from "@/components/sessions/ReusableLibrary";
import { idSchema, revisionSchema } from "@/lib/domain/common";
import "../calendar/calendar.css";
import "../sessions/sessions.css";

export const metadata: Metadata = { title: "Session Templates | Football Formation" };

/** Load explicit reusable record identities without silently substituting another saved revision. */
export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ item?: string; revision?: string }> }) {
  const query = await searchParams;
  const id = idSchema.safeParse(query.item);
  const revision = typeof query.revision === "string" ? revisionSchema.safeParse(Number(query.revision)) : null;
  if (query.item !== undefined && !id.success || query.revision !== undefined && !revision?.success)
    return <div className="calendar-workspace"><h1>Invalid reusable record reference</h1><p>No requested revision was substituted.</p><Link href="/templates">Open library</Link></div>;
  return <ReusableLibrary key={`${query.item ?? ""}:${query.revision ?? ""}`} kind="session" itemId={id.success ? id.data : undefined} revision={revision?.success ? revision.data : undefined} />;
}
