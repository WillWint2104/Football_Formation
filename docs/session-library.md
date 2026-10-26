# PR 04 — Sessions, coaches and reusable content

Routes: `/sessions`, `/templates`, `/exercises` and `/coaches`. The approved
navy/gold shell and compact calendar cards remain intact. Desktop priorities are
1920×1080 and 1366×768; mobile, 3D and Meshy work remains deferred.

## Independent plans and revisions

Calendar previews link to an explicit booking ID and revision. The session editor
resolves that booking's exact session pin. Saving appends a session revision and a
booking revision that pins it, retaining the scheduled instants, zone, venue and
staff relationships. Only the selected booking advances. Other bookings,
templates, exercises and previous revisions retain their original snapshots.

Unscheduled plans can be authored in the session library and scheduled from the
calendar without allocating a duplicate session. Calendar Add session can also
create a blank draft or instantiate a reusable session template. Applying a
template deep-copies its content, retains its source revision and creates a new
independent session identity. It never edits the reusable source.

The editor supports every existing session kind, including testing; objectives,
focus tags, ordered activities, optional warm-up/cool-down/briefing roles,
participants, metric area dimensions/origin, equipment and nullable quantities,
ordered setup/delivery instructions, coaching points, progressions, regressions
and variations. Keyboard buttons move activities up/down or remove them from the
draft. Null duration/quantity/participant values remain unknown. Planned minutes
and unknown-duration counts are shown separately; a discrepancy with the booking
is advisory and does not automatically reschedule it.

The existing `instructions` array stores ordered setup and delivery steps. This
PR does not change the PR 01 JSON schema. Empty editor lines are normalized when
saving; typing a trailing newline does not prematurely erase the draft.

Session and exercise templates retain immutable version histories. Activity reuse
embeds an independent copy and pins its source exercise version. Editing a source
does not update existing activities. Save as session template operates on a saved
session, avoiding accidental loss of unsaved edits. Historical editor links are
read-only. Missing or malformed explicit revisions are never silently replaced.

Existing diagram references and uploaded-document metadata remain pinned.
Generated guide metadata stays attached to its original historical snapshot and
is not silently relabelled as a guide for a newly edited session. There is no file
upload, guide/PDF export or diagram authoring in this PR.

## Coach directory

Directory names and team assignments can be created/edited; session assignments
support lead, assistant and specialist labels. These labels do not grant account
permissions. Saving a directory record does not create an Auth user, invite an
account or change membership privileges. Existing membership links are retained.

Teams referenced by historical coach assignments must remain on that directory
record, because PR 01 validates all saved revisions against the current directory.
Historical data is not deleted to bypass that constraint. Record deletion,
archival/deactivation schema changes and advanced permissions remain separate work.
Directory teams must already exist; team provisioning remains the documented
operator/staging process rather than a new team-management UI.

## Shared workspace and persistence boundary

`CoachingProvider` keeps one validated snapshot across coaching routes, lazily
loading organisations and their graph through PR 02's same-origin HTTP API. It
never exposes server credentials or writes directly to Supabase. All mutations
validate the complete PR 01 graph and POST an expected organisation version.

An editor captures the snapshot it opened. A synchronous write lock prevents
duplicate saves, and snapshot identity prevents an old editor from overwriting a
new in-window graph. The server's optimistic version check covers other users.
Failed or uncertain saves block further writes until explicit reload; no automatic
save retry is used. Reload/organisation switches clear private records and
invalidate editor drafts before requesting another graph. 401/404 saves also
clear the private snapshot. Requests retain the 30-second timeout.

Illustrative examples are explicitly labelled. Sample edits survive navigation
within the mounted coaching workspace, but are only memory state: reload or closing
the application discards them. Samples are never automatically uploaded, written
to localStorage/IndexedDB, or presented as cloud durability. Unsaved editor drafts
have explicit save/revert controls, with warnings on link navigation and document
exit. Sample-mode success messages always say the change is not saved durably.

## Verification and staging

Unit tests cover revision pins, isolated template/exercise reuse, nullable values,
directory constraints, stale source references and template/plan scheduling.
A PostgreSQL/PGlite test applies the exact production migration, saves the new
authoring operations, validates a second authenticated read and rejects stale
versions. Existing filesystem reopen and cross-organisation/RLS tests remain in
the suite. There is no database migration in this PR.

Desktop browser tests cover calendar-to-editor navigation, editing/reordering and
reopening, exact revision history, independent template copies, exercise reuse,
testing sessions, coach assignment, scheduling saved plans, sample navigation,
dirty-link warnings and 409/401 handling. Saved-mode browser tests use a strict
HTTP stand-in; they do not prove hosted Auth or cloud persistence.

Before local browser checks: build the app, install Playwright Chromium, then run
`npm run test:e2e`. Local Windows verification uses the established webpack build
path (`node node_modules/next/dist/bin/next build --webpack`) and installed Edge
(`PLAYWRIGHT_CHANNEL=msedge`). CI uses the standard Turbopack production build and
Chromium. `npm test`, lint and TypeScript remain mandatory.

Hosted Supabase remains inactive/unverified. Follow the separate approval gate and
staging checklist in `authenticated-persistence.md` and `interactive-calendar.md`:
real email sign-in/refresh, two clubs, two coaches, save/close/reopen, concurrent
edits, expiry/revocation and recovery from interrupted writes. Do not provision a
project, configure hosted credentials, apply live migrations or invite users
without approval. The existing 10 MiB complete-organisation snapshot limit remains.

Rollback reverts these UI/operation consumers together without deleting saved
records or immutable revisions. No manual deployment is part of this PR.
