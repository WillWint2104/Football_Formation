# Shared coaching domain — schema 1.0

PR 01 is additive domain code and validation. It does not connect a screen, database,
authentication provider, upload service, PDF generator or tactical renderer.
Existing lineup types and behavior remain separate and unchanged.

## Records and ownership

| Contract            | Responsibility                                                                                                              |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `people.ts`         | Teams, coach directory records, team membership and assignment roles                                                        |
| `calendar.ts`       | Independently identified bookings, selected local date, UTC instants, IANA zone, venue and pinned session revision          |
| `session.ts`        | Session kinds, ordered activities, exercise content, reusable exercise/template revisions and independent session snapshots |
| `document.ts`       | Private asset metadata and explicit generated-guide session/scene provenance                                                |
| `tactical-scene.ts` | Metre geometry, typed entities/stages/tracks and separate viewport configuration                                            |
| `validation.ts`     | Complete single-organization JSON snapshot, graph consistency and serialization boundary                                    |

All top-level records declare `schemaVersion: "1.0"`, `organizationId` and an opaque
stable `id`. Revisable records also declare a positive integer `revision`. References
pin both ID and revision; they never resolve “latest”. Team and coach directory
records are currently unversioned. Calendar event IDs and session IDs are distinct
identities. Several independently typed training sessions can occupy the same date.

Schemas reject unknown keys, unsupported versions, non-finite numbers, missing
references and duplicate identities/revisions. A complete bundle checks ownership,
team existence, coach/team assignment and booking/session agreement. These checks
are data consistency checks, **not authorization**. Future server repositories and
database policies must enforce authenticated organization membership and access.

## Sessions, exercises and templates

Kinds are conditioning, possession, goalkeeper, technical, tactical, recovery,
testing, combined and other. Testing/assessment uses the same ordered activities,
instructions, areas, equipment, diagrams, staff and document references as every
other session. No results tracking or testing calculations are introduced.
Activities preserve their order and have stable IDs; warm-up,
exercise, cool-down and briefing roles are optional entries rather than compulsory
sections. Unknown durations, equipment quantities, player counts and areas remain
`null`; they are never inferred as zero. A date-only calendar draft is valid.

`instantiateTemplate` creates revision one under a fresh caller-allocated session
ID. It validates and copies embedded content, retains the source template revision,
and shares no mutable nested arrays/objects with the source. Exercise provenance is
also a pinned reference, while embedded content is the editable snapshot. Editing
a session does not update its reusable exercise, sibling session or template.

Published revisions are an append-only storage contract. This PR validates positive
revision numbers and unique revision identities within a bundle; it cannot enforce
immutability against a previously stored database value. PR 02 must enforce unique
keys, append-only saved revisions and optimistic concurrency (expected revision).
Caller code must allocate a new revision for changes rather than overwrite old data.

## Scheduling and time

`localDate` retains the coach's calendar selection independently of optional times.
Instants use second-precision UTC ISO strings (`...Z`) with an explicit IANA zone.
Confirmed bookings require start and end; end must follow start. Overnight events
are supported. Start must fall on `localDate` in the stated zone. Cancelled records
retain their identity and may retain times.

Testing events may pin an exact testing-session revision. Draft testing events can
retain `session: null` until the programme is prepared; cancelled placeholders may
also remain unlinked. Confirmed testing events require a linked testing session.
Every supplied reference, including on a draft or cancelled event, must resolve to
the exact revision, have session kind `testing`, and agree on team and organization.

No naive local-time string is accepted as an instant. A future scheduling UI must
resolve local times to UTC, reject DST gaps and ask which offset to use during DST
overlaps. This PR does not implement that conversion or claim that UTC validation
proves a local-time picker handles DST. Overlap warnings/resource booking policies
also belong to the calendar workflow, not schema validation.

## Scenes and document snapshots

Coordinates use metres: x along field length, y along width, origin at a fixed
corner. Heading is in degrees [0, 360). Coordinates can remain outside the current
field: resizing must preserve geometry and a future editor will flag out-of-bounds
objects. Viewport center, zoom and editing/presentation guide visibility are a
separate contract; they do not belong to immutable scene geometry. Grid spacing is
in metres. No snapping, camera or renderer behavior is implemented here.

Stages are ordered with positive durations; their starts derive from cumulative
durations. Player/ball tracks target the matching entity kind and use strictly
increasing stage-relative keyframes. One movement track per entity per stage
prevents conflicting positions. Annotation tracks explicitly define bounded
visibility windows; annotations are typed arrows, areas or notes. Empty stages are
allowed; an empty stage list represents a static scene. Diagram references pin a
scene revision and a representative time within that scene's duration (0 for static).

The prior audit's movement evaluator is deferred to PR 06 under the owner's narrower
“models and validation only” scope. Interpolation, boundary playback, duration-edit
commands, visibility evaluation and authoring are not implemented or proven by this PR.

Documents have private relative storage keys, MIME/size declarations and processing
state. Generated-guide metadata captures the exact session revision, its referenced
scene revisions and renderer version. Upload metadata is separate. Metadata checks
do not inspect file bytes, prove a PDF safe, allocate storage or grant download access.
Future upload processing must validate signatures, permissions and processing state.

## JSON compatibility and verification

`serializeDomain` and `parseDomainJson` validate a complete versioned bundle at both
boundaries, with a 10 MiB encoded JSON limit. Missing references are errors, so a
partial JSON patch is not an import. Future schema changes require explicit
migrations and fixtures; unsupported versions must never be silently upgraded or
stripped. The boundary is preparation for persistence/import, not a bulk import UI.

Run `npm test` for synthetic fixtures and negative boundary tests. Tests cover
snapshot isolation, exact revisions, tenant/team consistency, date-only drafts,
UTC/DST representation, metric geometry, typed track timing and document provenance.
`npm run lint`, `npm run typecheck` and `npm run build` remain required.

## Development priority

Desktop 1920 × 1080, laptop 1366 × 768, larger displays and fullscreen are primary.
Retain the existing responsive shell. Tablet/mobile-specific layouts and testing
are deferred; do not revisit completed work solely for mobile optimization.
Next milestones remain persistence, calendar, session creation, staff assignments,
saved plans and coaching PDFs, subject to the existing per-PR approval gates.
