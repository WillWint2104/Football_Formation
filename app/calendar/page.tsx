import type { Metadata } from "next";
import { CalendarWorkspace } from "@/components/calendar/CalendarWorkspace";
import "./calendar.css";

export const metadata: Metadata = { title: "Team Calendar | Football Formation" };

/** Keep the route static; authenticated calendar requests run through writable cookie-aware APIs. */
export default function CalendarPage() {
  return <CalendarWorkspace />;
}
