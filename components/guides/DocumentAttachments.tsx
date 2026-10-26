"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@/lib/domain/session";
import { guideHref, MAX_PDF_BYTES, pdfFilenameSchema, type GuideReference } from "@/lib/documents/contracts";
import { downloadPdf, uploadPdf } from "@/lib/documents/client";
import { useCoaching } from "@/components/coaching/CoachingProvider";
import { useUnsavedChanges } from "@/components/coaching/useUnsavedChanges";

/** Attach passive PDFs to a new session revision and download only through fresh server authorization. */
export function DocumentAttachments({ session, reference, historical }: { session: Session; reference: GuideReference; historical: boolean }) {
  const { snapshot, mode, busy, blocked, loading, externalSave } = useCoaching();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [downloading, setDownloading] = useState(false);
  useUnsavedChanges(!!file && !busy);
  const disabled = mode !== "saved" || historical || loading || busy || blocked;
  return <section className="guide-documents" aria-labelledby="documents-heading"><h2 id="documents-heading">Private coaching PDFs</h2><p className="calendar-muted">Attachments belong to this exact saved revision. Downloads require authorised access each time.</p>
    <ul className="guide-document-list">{session.documents.map((ref) => {
      const doc = snapshot.bundle.documents.find((d) => d.id === ref.id && d.revision === ref.revision);
      return doc ? <li key={`${doc.id}:${doc.revision}`}><div><strong>{doc.filename}</strong><small>{doc.mimeType} · {(doc.byteLength / 1024).toFixed(1)} KiB · revision {doc.revision} · {doc.state}</small></div>
        <button disabled={mode !== "saved" || doc.state !== "ready" || doc.source.kind !== "upload" || doc.mimeType !== "application/pdf" || downloading || busy} onClick={async () => {
          setError(""); setDownloading(true);
          try { await downloadPdf(snapshot.bundle.organizationId, reference, doc); setMessage("Download requested through authorised access."); }
          catch (failure) { setError(failure instanceof Error ? failure.message : "Download unavailable"); }
          finally { setDownloading(false); }
        }}>Download {doc.filename}</button></li> : null;
    })}</ul>{!session.documents.length && <p>No PDFs are attached to this revision.</p>}
    {historical && <p className="coaching-notice">Historical or booking-linked snapshot · read only here. Open the current booked session to attach a PDF.</p>}
    {mode !== "saved" && <p className="coaching-notice">Sample mode cannot upload or download private documents. Sign in to a configured organisation to use attachments.</p>}
    <form onSubmit={async (e) => {
      e.preventDefault(); if (disabled || !file) return; setError(""); setMessage("Validating PDF, uploading privately and saving a new session revision…");
      try {
        let next = reference;
        await externalSave(snapshot, async () => { const result = await uploadPdf(snapshot, reference, file);
          next = { session: result.session.id, revision: result.session.revision, ...(result.event ? { event: result.event.id, bookingRevision: result.event.revision } : {}) }; });
        setFile(null); router.replace(guideHref(next));
      } catch (failure) { setMessage(""); setError(failure instanceof Error ? failure.message : "Upload could not be confirmed. Reload before retrying."); }
    }}><label>Coaching PDF<input type="file" accept="application/pdf,.pdf" disabled={disabled} onChange={(e) => {
      setError(""); const chosen = e.target.files?.[0] ?? null;
      if (chosen && (!pdfFilenameSchema.safeParse(chosen.name).success || chosen.type !== "application/pdf" || !chosen.size || chosen.size > MAX_PDF_BYTES)) { setFile(null); e.target.value = ""; setError("Choose a PDF up to 3 MiB with a filename without paths."); }
      else setFile(chosen);
    }} /></label><button className="calendar-primary" disabled={disabled || !file}>Attach PDF to new revision</button></form>
    <p className="calendar-muted">Up to 3 MiB · readable, unencrypted PDFs. Forms, scripts, links and embedded files are unsupported. Structural checks are not antivirus scanning. Uploads never create illustrated guides.</p>
    {message && <p role="status">{message}</p>}{error && <p role="alert" className="coaching-notice">{error}</p>}
  </section>;
}
