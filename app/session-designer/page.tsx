import type { Metadata } from "next";
import { SessionDesigner } from "@/components/designer/SessionDesigner";
import "../calendar/calendar.css";
import "../sessions/sessions.css";
import "./designer.css";

export const metadata: Metadata = { title: "JSON Session Designer | Football Formation" };

/** Portable authoring has no authenticated API, organisation or hosted-service dependency. */
export default function SessionDesignerPage() { return <SessionDesigner />; }
