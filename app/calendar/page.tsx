import type { Metadata } from "next";
import { CalendarWorkspace } from "@/components/calendar/CalendarWorkspace";
import "./calendar.css";
import { isCalendarDate } from "@/lib/calendar/schedule";
import { idSchema } from "@/lib/domain/common";

export const metadata: Metadata = { title: "Team Calendar | Football Formation" };

/** Resolve validated navigation targets; private coaching records still use cookie-aware APIs. */
export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ date?: string; event?: string; plan?: string }> }) {
  const query = await searchParams;
  return <CalendarWorkspace key={`${query.date ?? ""}:${query.event ?? ""}:${query.plan ?? ""}`} initialDate={typeof query.date === "string" && isCalendarDate(query.date) ? query.date : undefined}
    initialEvent={idSchema.safeParse(query.event).success ? query.event : undefined} initialPlan={idSchema.safeParse(query.plan).success ? query.plan : undefined} />;
}
