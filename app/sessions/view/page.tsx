import type { Metadata } from "next";
import { SessionViewer } from "@/components/sessions/SessionViewer";
import { parseSessionView } from "@/lib/coaching/session-view";
import "../../calendar/programme.css";
import "../../calendar/calendar-frame.css";
import "../../authoring-frame.css";
import "./viewer.css";

export const metadata: Metadata = { title: "Session Viewer | Football Formation" };

export default async function SessionViewerPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const reference = parseSessionView(await searchParams);
  return <SessionViewer key={JSON.stringify(reference)} reference={reference} />;
}
