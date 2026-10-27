# Context-aware tactical editor (PR 07)

PR #12 at approved head `d518b2a` merged as `054d79a`. This PR implements the
context-aware static editor. Preserve the dark-green tactical palette, navy/gold
shell, existing lineup and the common SVG drawing pipeline. Figma refinement is
optional; functional geometry, authoring and persistence take priority.

## Compatibility decision — before contract changes

Extend schema 1.0 with **optional** `context` on scenes and optional hexadecimal
`color` on players. An absent context retains the exact legacy rendering rules;
no decoder invents a neutral or physical location for old records. New neutral
scenes explicitly use a local field extent and metre origin. New physical scenes
explicitly identify their region and attacking direction on the parent pitch.

These additions are backward compatible with existing stored data: no old record
is rewritten, default-injected or repinned. The existing SQL schema stores JSON
and requires schemaVersion 1.0 without enumerating these nested keys, so no SQL
migration, hosted provisioning or data conversion is required. Validation stays
strict for all other unknown keys. The new server/client decoders must ship
together: older app versions reject newly authored optional keys. Rolling back
to an older app therefore requires retaining the newer reader or restoring a
pre-extension snapshot; never strip fields from immutable history to downgrade.

Persistence tests must exercise new context/color payloads through the existing
SQL contracts, alongside unmodified historical 1.0 fixtures. Unknown versions
still fail closed. This is an additive reader/writer change, not an incompatible
storage migration. A future incompatible version remains an owner approval gate.

View rotation, zoom, pan and framing remain outside saved scene geometry. Choosing
a new context never translates/mirrors existing entities. Any explicit conversion
between physical and local coordinates must preview and apply a reversible
translation to every entity, keyframe and annotation and save a new revision.
Historical records, source templates, sibling sessions and exact guide/document
pins remain unchanged.

Physical geometry derives from one full-pitch coordinate system, with X along
length and Y across width. Left/right delivery is defined from the delivering
team's perspective towards its target goal. Neutral mode has no inherited goals,
halfway line or penalty area. Football marking measurements follow
[IFAB Law 1](https://www.theifab.com/laws/latest/the-field-of-play/), checked
27 October 2026. Thirds divide the actual pitch length, not the screen width.

The editor authors static annotations with existing stage contracts. It must not
introduce an animation-authoring timeline, discard existing stages or silently
alter their timing. Sample changes remain memory-only; saved mode retains the
existing authenticated API, immutable revisions and optimistic concurrency.

Final gate: tests, desktop captures at 1920×1080 and 1366×768, lineup regressions,
CI and actual CodeRabbit comments; open PR 07 and stop unmerged. No manual deploy,
hosted Supabase, paid services, new Figma files, 3D/Meshy or mobile optimisation.

## Implemented architecture and interaction contract

- `context.ts` derives physical thirds/halves, midfield, custom regions and
  side/phase-specific set pieces from the full pitch. Corner deliveries are
  distinct mirrored anchors; free-kick locations can be placed explicitly.
- `viewport.ts` owns uniform metre projection and inverse picking. Quarter-turn
  camera rotations, pointer-anchored zoom, pan and fit commands never enter the
  saved scene. Attack direction and field context reframe without moving objects.
- `drawing.ts` remains the one SVG engine for editor, preview, guide and portable
  output. A neutral local extent has no unrelated football markings. Physical
  contexts show appropriate linework, goals and one-metre corner arcs. Player
  glyphs stay compact at all zoom levels. Non-visible objects are counted.
- `authoring.ts` validates every edit, keeps fifty undo snapshots and performs
  group translation, deletion, grid/object snapping, alignment and metric centre
  distribution. Drag previews commit one history entry on release; cancellation
  restores the starting scene. A moved animated entity translates all associated
  keyframes in every stage; its path cannot silently override the new anchor.
- Static overlays are first-stage annotation tracks. Their endpoint coordinates,
  zone dimensions and text remain editable; existing stage duration/visibility
  and later stages are retained. This PR has no animation timeline authoring.
- Field dimension edits keep existing metre anchors. If a reduced boundary puts
  objects outside it, use Fit All; no object is silently clamped or scaled.
- Converting local and physical coordinates is explicit: review the translation
  and affected anchor count, then apply it. The operation is undoable and only a
  subsequent save publishes it. It is never triggered by a camera operation.
- New objects can be placed on the canvas or inserted at its centre. The object
  list provides keyboard selection, including overlays. Shift-click adds entity
  selections; Delete removes; arrows nudge in screen direction; Shift-arrows
  move 5 m. Ctrl/Cmd-A selects all first-stage objects/overlays, Ctrl/Cmd-Z undoes,
  Shift-Z or Y redoes, Alt-drag pans. Expanded-board mode traps focus and restores
  it on Escape. Inputs keep their normal editing shortcuts.

## Saved-owner integration

Session, exercise and template editors link to exact saved owner/activity pins.
Save text changes before opening a diagram. `/tactical-editor` without a target
is a practice canvas with no persistence action. Its examples are not seeded into
an organisation; applying one and explicitly saving against an activity is an
ordinary user edit. Sample-mode saves are memory-only and labelled accordingly.

`persistence.ts` resolves an exact owner revision and diagram reference. Saving
atomically appends a scene revision and owner revision, replacing only the chosen
activity's pin. A scheduled session advances only the selected booking revision.
An exercise/template save never updates embedded session snapshots. Historical
owners, templates, sibling activities/bookings, documents and existing scene
versions remain unchanged. Guides resolve the resulting saved pin at 0 seconds.
Existing historical representative times are not rewritten.

All changes use the shared CoachingProvider and existing authenticated snapshot
API. The opened organisation snapshot is the optimistic concurrency base. A
conflict/uncertain write blocks further writes and requires an explicit reload;
there are no automatic retries. Missing or malformed owner/booking/diagram pins
fail closed. Historic diagrams can be viewed but not edited through stale URLs.

## Verification and remaining limits

Unit tests cover legacy compatibility, all nine contexts, physical thirds/corner
side/phase, rotated inverse picking, metric grid, drag history, group layout,
conversion and independent exact saved pins. A production SQL contract test
round-trips context/colour payloads and rejects stale expected versions. Desktop
browser checks cover the actual editor, all nine contexts, pointer dragging,
snapping, numeric edits, keyboard operations, wheel zoom, pan, expanded view,
explicit conversion, immutable saving/reopening and calendar-to-guide navigation.
The normal CI also runs the existing calendar, session, document and renderer
regressions. Local Windows verification uses Edge and the webpack build because
of the previously recorded local Turbopack worker issue; Linux CI builds with the
default Turbopack and runs Chromium.

Hosted Supabase/Auth activation is still unverified and requires separate owner
approval. Browser saved-mode evidence uses a strict HTTP-contract stand-in;
SQL/RLS tests run locally. These do not prove a hosted deployment.

Figma was not needed to resolve functional geometry or reuse the existing shell
tokens. Specific optional future refinement candidates are tool-strip grouping
at 1366×768 and the hierarchy/scrolling of a heavily populated property inspector.
Actual application captures are the current review reference. No Figma file was
created and no approved screen was replaced speculatively.

Advanced movement/keyframe authoring, illustrated PDF export, 3D/Meshy and mobile
optimisation remain deferred. Very small laptop canvases may need expanded-board
mode or zoom for dense 11v11 detail; metres and field proportions are never
distorted to fill an incompatible container aspect ratio.
