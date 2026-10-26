# PR 05 — Coaching guides and private documents

## Saved coaching guide

`/guides?session=<id>&revision=<positive revision>` resolves exactly that saved
session. Optional `event` and `bookingRevision` must be supplied together and must
pin the same session revision. Missing, malformed or mismatched references never
fall back to the latest content. Calendar previews and saved session editors
generate these exact links. Historical guides remain readable and read-only.

The navy/gold desktop guide presents schedule/time zone, team, staff, objectives,
focus and ordered activities. Each activity separates setup information,
equipment/quantities, participant count, metre dimensions/origin, duration,
ordered setup/delivery instructions, coaching points, progressions, regressions
and variations. Unknown values stay unknown. Warm-ups and cool-downs remain
optional. An activity index allows coaches to jump to stable activity anchors.

Each activity owns a diagram position keyed by its saved activity ID. Existing
scene revision/time references are shown as references awaiting the shared
renderer. Empty positions say no diagram is attached. No illustration is invented,
and no illustrated PDF export, animation or advanced 2D authoring is implemented.
Later PR 09 can consume this same exact snapshot once PRs 06–07 provide rendering.

## File and access boundaries

New PDFs use a same-origin, cookie-authenticated POST:

`/api/organizations/<org>/sessions/<id>/<revision>/documents`

The body is raw `application/pdf` bytes. Headers carry the expected organisation
version, encoded basename and, for a scheduled session, exact booking ID/revision.
No client actor, object path, storage URL or bucket choice is accepted. The server
verifies Auth through `getUser()`, loads the organisation through the existing RLS
reader, checks the exact session and editability, then validates the upload before
acquiring object-write capability. POSTs require the configured canonical Origin.

Uploads are limited to **3 MiB**, checked against actual streamed bytes even if
Content-Length is missing or false. This leaves room under the deployment's
[4.5 MB function request/response limit](https://vercel.com/docs/functions/limitations).
Filename validation permits PDF basenames, including Unicode letters, but rejects
paths, separators, dot traversal, control characters and unsupported extensions.
MIME, `%PDF-`/`%%EOF` signatures and PDF structure are checked using pinned
`pdf-lib` 1.17.1. PDFs must have 1–500 pages and at most 20,000 indirect objects;
deeply nested objects, encryption, forms, scripts, external links/actions and
embedded files are unsupported. Validation is not antivirus scanning or a promise
that all malicious PDF techniques can be detected. Files are never embedded in an
iframe or rendered by the application. Before hosted activation, decide whether
the club requires a separate malware-scanning/quarantine service; this PR does not
configure or incur costs for such a service.

The fixed `coaching-documents` bucket must be private. Server operations verify
its private flag before upload/download and fail closed if it is public or
unavailable. No public or signed URLs are generated. See Supabase's
[private bucket contract](https://supabase.com/docs/guides/storage/buckets/fundamentals)
and [private download API](https://supabase.com/docs/reference/javascript/file-buckets-download).

Physical paths are random, server-generated and stored only in the immutable
`private_document_objects` journal. Browser/anonymous roles have neither table
access nor registration-RPC execution. Only the trusted server can register an
object; the restricted SQL function rechecks active membership using the verified
actor. Domain metadata carries an opaque `attachment-<document id>` handle,
not the physical object path. Snapshot JSON continues to follow schema 1.0.
Legacy/imported document metadata does not create or authorize a storage object;
it must match an operator-reconciled private journal before it can be downloaded.

GET downloads address session/document IDs and revisions only. The server reloads
the organisation under RLS, requires that exact document pin on that exact session,
requires ready uploaded-PDF metadata, matches it against the private journal, and
verifies byte length plus SHA-256. Responses use attachment disposition, no-store,
nosniff, a restrictive sandbox policy and no referrer. Storage identifiers and raw
provider errors never appear in these responses. Filename and metadata alone do
not grant access. Pending/rejected metadata remains visible with downloads disabled.

## Revision, concurrency and failure recovery

A successful upload appends a new document identity/revision and a new session
revision. For a scheduled session, only the selected booking advances to its new
pin; instants, time zone and sibling bookings remain intact. Source templates,
exercises and historical attachments are unchanged. Attachments cannot be added
to a historical guide. Ordinary later session edits retain uploaded-document pins.
Generated-guide metadata stays with its original historical source, as in PR 04.

The shared provider serializes uploads with ordinary edits and reloads a validated
saved graph after acknowledgement. The client never supplies a replacement bundle
to the upload handler and never automatically retries. Failure or uncertainty
blocks writes until explicit reload. 401/404 upload failures clear private drafts.
Sample mode cannot upload/download and never places files in browser persistence.

Object storage and PostgreSQL are separate transactions. The server journals the
physical identity and SHA-256 **before** upload, uploads without overwrite, then
atomically saves the complete coaching graph through the existing versioned RPC.
If upload or metadata save fails, no attachment success is claimed. If a save's
acknowledgement is lost, it may already have committed: **never delete the object
as automatic compensation**. Reload to inspect the exact attachments before
explicitly retrying. Unattached journaled objects remain inaccessible through the
application. Interrupted uploads/failed saves require operator reconciliation;
there is no background retry or unapproved retention/deletion job.

## Migration, setup and rollback — approval required for hosted use

No hosted project, bucket, credentials, live migration or manual deployment was
created/performed. Both migrations are tested only locally against PostgreSQL/
PGlite. Existing automated Vercel previews may run when a PR is pushed.

After separate approval:

1. Apply PR 02's foundation and `202610260002_private_documents.sql` using a reviewed
   operator connection. It adds the private journal/RPC only, not a bucket.
2. Review existing Storage policies, then run
   `supabase/admin/private_document_bucket.sql` once to create the private bucket
   with matching MIME/size limits and a restrictive policy excluding browser
   roles, even if other permissive object policies exist. Verify `public=false`
   independently. Do not expose the service key or enable browser object access.
3. Reuse the existing server-only backend configuration. No new hosted credentials
   or client-side secrets are needed. The server secret is now also trusted for
   private object operations and journal reads, beyond the existing save RPC.
4. Verify real Auth refresh, two clubs/coaches, direct object denial, upload,
   download, save/close/reopen, expiry/revocation, concurrent changes, missing bytes,
   integrity failures and interrupted acknowledgements before relying on cloud use.
5. Confirm upload/download limits in the deployed runtime; review scanning,
   quotas/retention and recovery needs before allowing real coaching documents.

Do not run the older foundation rollback while this dependent migration exists.
For an empty document journal, `202610260002_empty_documents_only.sql` can remove
this addition before any foundation rollback. It refuses once journal rows exist.
With data, export/reconcile and use a reviewed forward repair. Reverting UI code
does not remove historical domain metadata, journal rows, private objects or an
operator-created bucket/policy. No rollback script deletes coaching PDFs.

For reconciliation, compare journal `(organization_id,id,revision)` tuples against
uploaded-PDF metadata referenced by all immutable session revisions, then inspect
the object store and digest. A missing latest-snapshot reference alone does not
prove an object is disposable. Do not delete orphans automatically, especially
after uncertain writes. Obtain explicit approval for any destructive cleanup.

## Verification

Unit/HTTP tests cover signatures, MIME, malformed/active PDFs, filenames/path
attacks, actual byte limits, auth/origin/org boundaries, exact pins, integrity,
failed uploads, stale saves and lost acknowledgements. SDK tests use the actual
Supabase client with controlled HTTP responses, including public-bucket refusal.
The SQL integration applies production migrations, persists and reads back an
attachment, downloads unchanged bytes through the handler, verifies private-table
and RPC denial, immutable history, revocation and rollback refusal. Blob storage
in that SQL test is a contract stand-in, not a hosted bucket.

Desktop browser tests cover complete guides for all seven primary session types,
exact history, activity navigation, successful attachment/download/reopen, metadata
states, invalid files and failure recovery. Browser saved-mode tests use strict
HTTP stand-ins. Hosted Auth/Storage remains a release gate. Existing domain,
calendar, session, persistence and lineup regression evidence must remain green.
