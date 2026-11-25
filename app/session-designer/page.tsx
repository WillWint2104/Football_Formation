import type { Metadata } from "next";
import { SessionDesigner } from "@/components/designer/SessionDesigner";
import "../calendar/calendar.css";
import "../sessions/sessions.css";
import "./designer.css";
import "./refinement.css";
import "./package-import.css";
import "./activity-diagrams.css";
import "../tactical-editor/editor.css";
import "./local-authoring.css";
import "./light-foundation.css";
import "./tactical-workspace.css";
import "./diagram-print.css";
import "../calendar/programme.css";
import "../calendar/calendar-frame.css";
import "../authoring-frame.css";
import "../tactical-editor/light-workspace.css";
import "./workspace-consolidation.css";

export const metadata: Metadata = { title: "Session Designer | Football Formation" };

/** Portable authoring has no authenticated API, organisation or hosted-service dependency. */
export default function SessionDesignerPage() { return <SessionDesigner />; }
