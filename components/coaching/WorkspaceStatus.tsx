"use client";

import Link from "next/link";
import { useCoaching } from "./CoachingProvider";

/** One honest source/status boundary for session, coach and reusable-library screens. */
export function WorkspaceStatus() {
  const { mode, message, organizations, organization, loading, busy, blocked, reload } = useCoaching();
  return <><div className="calendar-source"><div><strong>{mode === "saved" ? "Organisation storage" : "Illustrative sample data · not saved"}</strong>
    <span>{mode === "saved" ? "Authenticated snapshot API. Hosted staging verification remains a separate release gate." : "In-memory examples shared across coaching pages. Reloading discards sample changes; they are never uploaded automatically."}</span></div><Link href="/login">Sign in</Link></div>
    <div className="calendar-connection"><p role="status">{message}</p>
      {organizations.length > 0 && <label>Organisation<select aria-label="Organisation" value={organization} disabled={loading || busy}
        onChange={(e) => { if (window.confirm("Switch organisation? Unsaved edits will be discarded.")) void reload(e.target.value); }}>
        {organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>}
      <button disabled={loading || busy} onClick={() => { if (window.confirm("Reload saved records? Unsaved edits and sample changes will be discarded.")) void reload(organization || undefined); }}>{blocked ? "Reload before saving" : "Reload"}</button>
    </div></>;
}
