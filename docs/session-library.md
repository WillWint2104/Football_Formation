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
upload, guide/PDF export or diagram authoring in PR 04. PR 05 adds exact web guides
and private PDF attachments; illustrated PDF generation and diagrams remain later.

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

## C4-B1 — Saved preview and independent scheduling copies

Each catalogue record now has **Preview content**; the existing editor also links
to **Preview saved session**. The read-only preview uses the current organisation
graph, not the C3 local companion catalogue. It shows known activity minutes and
untimed counts, objective/focus, team/staff, the complete activity sequence and
each activity's exact saved diagram revisions, dimensions, equipment, instructions
and coaching points. Missing facts remain unspecified. Diagram selection uses
the existing `SceneDiagram` with its approved light paint; scene data is unchanged.

Preview URLs include organisation, session and an optional exact revision. A wrong
organisation, malformed reference or missing exact revision is not replaced. A
superseded revision remains inspectable but cannot start a new scheduling copy.
The existing original/booking editor links and “schedule this saved unscheduled
plan” behaviour remain available; B1 adds an explicit **Schedule independent copy**.

The scheduling action reuses `ScheduleDialog` and `scheduleChange`. The new pure
`scheduleSessionCopy` command validates the graph and previewed source, retains
the source team, coaches, content, template/exercise provenance and exact scene
pins/timestamps, and allocates a new session revision 1 plus a new **draft** booking
revision 1. No source record, other date or earlier revision is modified. Document
associations start empty: an old generated PDF is not a guide for the new session.
Both new records go through the existing atomic whole-organisation save and
expectedVersion boundary; there is no second database, endpoint or migration.

A scheduling request UUID is placed in the preview URL and deterministically
allocates both record IDs. It is not an authorization token. A synchronous form
guard and the existing provider lock prevent concurrent submissions. Reusing the
same request rejects duplicate IDs. After a lost response, reload retains the URL
identity and can discover the already-saved occurrence; recovery verifies its
preserved first session/event revisions against the exact source before showing
success. Stale/uncertain writes keep the existing reload-required/no-auto-retry
behaviour. Starting a deliberately new request can schedule another occurrence;
this is not a global duplicate-time prohibition or an exactly-once job service.

The preview captures the base graph when its scheduling dialog opens. Source edits,
organisation switches and another writer cannot silently rebase it. Existing
IANA/UTC, DST and advisory overlap checks apply. Times are explicit new booking
choices, separate from known activity minutes. Sample mode stays memory-only and
is labelled accordingly; refreshing sample changes discards them.

Only the new preview and its dialog have a scoped light reading surface. This is
not final visual-design acceptance, a full-light shell rollout or a Calendar
redesign. C3's local Designer, portable JSON, package storage and native scene
contracts are unchanged. Local package publication remains a separate C4-B4 gate.
The next approved sequence is B2 scheduling/navigation, B3 further reuse/edit-copy
work, B4 ownership bridge (separate architecture approval), then B5 weekly programme.
None of those later checkpoints is implemented by B1.

Verification includes pure copy/recovery tests, actual production SQL in local
PGlite (rollback on a synthetic event-insert failure, readback and duplicate/stale
rejection), and browser checks using strict synthetic HTTP stand-ins. These do
not establish hosted Auth or cloud release acceptance. Checkpoint D stays stopped,
issue #17 stays open, and no hosted configuration, merge or deployment is included.

## C4-B2 — Calendar entry and return

Calendar reuses the B1 catalogue selectors, exact preview, request identity and
atomic graph-save operation. Choose Session on a date opens a transient library
picker, while Add Session remains available for a blank draft. Search covers
saved titles, objectives, focus and activity names; the Calendar team filter
restricts available sources. No C3 local repository is read or published.

Calendar URLs carry validated date, week/month/day view, organisation, team/type
filters and optional booking identity/revision. Library preview and copy-request
IDs are transient navigation fields, not a new persistence contract or access
authority. Duplicate parameters, incomplete references and invalid values are
rejected. The loaded organisation graph validates scope and team membership;
stale booking links require explicit recovery. URLs never choose another
organisation automatically or accept an arbitrary return destination.

Cancellation restores the original Calendar selection without writes. A successful
copy returns to its committed date and new booking, preserving the view and team.
If the old type filter would hide the new booking, the preview discloses that it
will be cleared on success. Same-organisation reload preserves a pending request;
switching organisations clears that workflow. An uncertain save offers Reload
Saved Records inside the dialog and never automatically resubmits. Refresh keeps
request identity but does not persist unsaved scheduling form fields.

Edit Booking changes schedule details only; Open Session edits the selected
booking's pinned coaching content; Schedule Another Copy starts a new independent
occurrence. Coaching-guide links include both session and booking revisions.
Historical PDFs are never automatically regenerated or presented as proof of the
current booking schedule. Stronger document booking metadata remains outside B2.

The Calendar adopts C3's established light colours with scoped CSS. Month cards
remain icon and name only. Weekly cards retain concise time and type/team facts;
match and recovery use distinct symbols and labels. Lanes remain chronological,
not duration-scaled. On laptops, the selected details appear below the full-width
grid, brought into view on selection; dismissing them retains the planning date.
The native picker and scheduling dialog are never stacked. No global theme,
session editor, renderer or print redesign is part of B2.
