# Coaching presentations — milestone PR 10

## Architecture and compatibility (checkpoint A)

GitHub PR #15 was approved at `284fd4baadd2101cfebf63a82e43124d9d48478c`
and merged as `6586bfd29c32b8da8c99a21392a458784b604f3b`. The merged
webpack production build and all 173 existing automated tests passed.

Presentations have a separate schema-1.0 contract and append-only journal.
They are deliberately **not** a new collection in `DomainBundle`. Existing strict
calendar/session snapshots, JSON imports, immutable scene records and the
`save_coaching_bundle` RPC stay compatible. No stored record needs rewriting.

The six structured blocks are overview, guidance, diagram, animation, notes and
summary. Sources pin exact session, activity, exercise or scene revisions.
Conversion records the selected activity identities in overview/summary sources,
so omitted activities do not reappear in those sequences. Missing references fail
closed; a later revision never substitutes for a missing historical source.
Presentation titles, notes, section ordering, duplicates and camera views are
independent. Editing never invokes source save or tactical authoring operations.

## Creation (checkpoint B)

An unchanged saved session exposes **Create presentation from this saved session**.
The selection step permits individual activities and optional overview/summary.
Only available diagram references and authored coaching information are used.
Independent presentations can assemble saved exercises and scene revisions and
add presentation-only notes or summary blocks. Exercise insertion adds guidance
and its exact saved diagrams. Section controls move, copy and remove blocks.

The builder uses existing navy/gold tokens, shell/navigation and the shared SVG
renderer. It preserves the original dark-green pitch. No new visual design system,
Figma file or production asset pipeline is introduced.

## Interactive presentation (checkpoint C)

The window presentation hides the application shell. Native Fullscreen is an
explicit user action; unavailable browser permission leaves the window player
usable. Returning restores focus. Escape exits native fullscreen and returns to
the builder; otherwise Escape returns directly. Arrow/Page keys navigate sections,
Home/End select first/last, and Space plays/pauses when focus is not on a control.
Form fields retain their keyboard editing. Focus remains inside the presentation.

Animation uses the existing deterministic evaluator and cumulative stage clock.
Play/pause/restart, speed, scrub and stage controls never modify timing or sources.
Static diagram blocks hold their pinned representative time. Playback is manual;
sections never advance automatically.

Overview reuses existing exercise/context fitting. Action reuses whole-stage
framing; Detail fits selected objects/areas. Shift-click permits multi-selection;
the focus picker also supports keyboard selection. Background drag uses the
actual inverse metric projection at each rotation. Wheel/buttons zoom uniformly.
The current camera stays fixed during playback unless explicitly authored views
are enabled.

**Capture camera view** stores metric target area, center, zoom, quarter-turn
rotation and framing kind in the presentation draft. In the builder, name the
view, select establishing/section or an exact stage identity, and set an optional
0–5 second transition (default cut). Save the presentation to retain captures.
The first establishing view is the section's opening view. The first matching
stage view is used when **Authored stage views** is explicitly enabled; otherwise
the establishing view remains the fallback. Multiple views remain manually
selectable. Camera motion has a separate wall clock and never alters animation
time. Rotation changes cut; reduced-motion preference cuts all transitions.
Manual pan/zoom/framing pauses authored changes until explicitly re-enabled.

## Durable persistence (checkpoint D)

`202610280001_presentations.sql` adds heads, immutable revisions, an RLS invoker
view and a service-only `save_presentation` RPC. Verified cookie auth supplies the
actor. The same-origin BFF loads the organisation through existing RLS, validates
every exact source pin against the existing immutable domain graph, then acquires
the write client. Membership is locked against concurrent revocation and each
presentation head is locked for compare-and-swap. Revision 0 means create; saves
append expected+1. Unrelated presentation saves do not contend on an organisation
snapshot version or rewrite calendar records.

The endpoint is `/api/organizations/:organizationId/presentations`; GET returns
current presentations, `?id=` history, and `?id=&revision=` an exact version.
POST accepts only expectedRevision and a validated presentation. Private responses
are no-store. Sources remain in the existing immutable journal, so old pins survive
later coaching edits. Historical presentation versions open read-only.

Limits: 128 sections, 32 camera views per section, 10,000 characters per text
field, 2 MiB presentation JSON, renderer coordinate/time bounds, and at most 200
records per list/history request. Exceeding a read bound fails explicitly rather
than silently hiding records. No unrestricted slide geometry or HTML is stored.
Network/409 failures block further writes pending explicit reload; no automatic
write retry. Private presentation state clears on access loss. Navigation and
document exits warn about unsaved drafts.

Sample mode is explicitly page-memory only. It never uploads sample records or
pretends to be durable storage. Tests supply synthetic saved transport responses;
SQL tests apply the real migration in local PGlite. Neither proves a hosted
multi-user deployment.

## Migration and rollback gate

No hosted resources or migrations were applied. In a separately authorised staging
window: back up, apply existing migrations first, then the new presentation
migration; grant no extra browser writes. Confirm RLS with two real users in
different organisations, revocation, stale saves, reopen and source history.
The additive application may roll back while retaining its journal. The supplied
empty-only SQL rollback refuses to remove nonempty history. Never delete real
presentation history to downgrade. Hosted Supabase verification remains the next
major release dependency.

## Review boundary

Desktop targets are 1920×1080 and 1366×768. Mobile, 3D/Meshy, PowerPoint,
unrestricted slide editing, weekly PDF export and manual deployment remain out of
scope. Open the implementation PR and stop for owner review; no merge authorised.
Architecture is settled: High is suitable for ordinary implementation follow-ups,
Medium for routine corrections. Independent review results and final verification
are recorded separately with the exact PR head.
