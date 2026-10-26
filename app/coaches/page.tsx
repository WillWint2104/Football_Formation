import type { Metadata } from "next";
import { CoachDirectory } from "@/components/sessions/CoachDirectory";
import "../calendar/calendar.css";
import "../sessions/sessions.css";

export const metadata: Metadata = { title: "Coach Directory | Football Formation" };

/** Directory authoring remains separate from account provisioning and invitation workflows. */
export default function CoachesPage() { return <CoachDirectory />; }
