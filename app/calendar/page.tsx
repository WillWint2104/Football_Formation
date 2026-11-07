import type { Metadata } from "next";
import { CalendarWorkspace } from "@/components/calendar/CalendarWorkspace";
import "./calendar.css";
import "../sessions/library-preview.css";
import "./planning.css";
import Link from "next/link";
import { parseCalendarNavigation } from "@/lib/calendar/navigation";

export const metadata: Metadata = { title: "Team Calendar | Football Formation" };

/** Resolve validated navigation targets; private coaching records still use cookie-aware APIs. */
export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const navigation = parseCalendarNavigation(query);
  if (!navigation.success) return <div className="calendar-workspace calendar-integrated"><h1>Invalid Calendar context</h1><p>No requested booking, team or session was substituted.</p><Link href="/calendar">Reset Calendar context</Link></div>;
  return <CalendarWorkspace key={`${navigation.data.organization ?? ""}:${navigation.data.event ?? ""}:${navigation.data.plan ?? ""}`} navigation={navigation.data} />;
}
