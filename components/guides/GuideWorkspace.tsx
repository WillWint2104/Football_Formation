"use client";

import Link from "next/link";
import { useCoaching } from "@/components/coaching/CoachingProvider";
import { WorkspaceStatus } from "@/components/coaching/WorkspaceStatus";
import { resolveGuide } from "@/lib/coaching/guide";
import type { GuideReference } from "@/lib/documents/contracts";
import { CoachingGuide } from "./CoachingGuide";
import { DocumentAttachments } from "./DocumentAttachments";
import { GuideExport } from "./GuideExport";

/** Use the shared validated graph to present only the explicitly requested saved revision. */
export function GuideWorkspace({ reference }: { reference: GuideReference }) {
  const { snapshot, scope, loading } = useCoaching();
  const resolved = resolveGuide(snapshot.bundle, reference);
  const editor = resolved?.event ? `/sessions?event=${encodeURIComponent(resolved.event.id)}&revision=${resolved.event.revision}` : `/sessions?session=${encodeURIComponent(reference.session)}&revision=${reference.revision}`;
  return <div className="calendar-workspace coaching-workspace guide-workspace"><div className="calendar-page-heading"><div><p className="calendar-eyebrow">Saved coaching guide · session revision {reference.revision}</p><h1>{resolved?.session.content.title ?? "Session guide"}</h1><p className="calendar-muted">Follow the activity sequence. Each guide resolves an exact saved snapshot.</p></div><Link className="guide-editor-link" href={editor}>Open session editor</Link></div>
    <WorkspaceStatus />{loading ? <p className="coaching-empty">Loading validated coaching records…</p> : resolved ? <>
      {resolved.historical && <p className="coaching-notice">Historical snapshot or session viewed without its current booking. Saved content and attachment references are preserved.</p>}
      <GuideExport key={`exports:${scope}:${reference.session}:${reference.revision}`} reference={reference} />
      <CoachingGuide bundle={snapshot.bundle} session={resolved.session} event={resolved.event} />
      <DocumentAttachments key={`${scope}:${snapshot.version}:${reference.session}:${reference.revision}`} session={resolved.session} reference={reference} historical={resolved.historical} />
    </> : <section className="coaching-empty"><h2>Requested guide revision is unavailable</h2><p>No newer revision or different booking was substituted.</p><Link href="/sessions">Open session library</Link></section>}</div>;
}
