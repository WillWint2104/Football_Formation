# Shared 2D tactical renderer (PR 06)

PR 05 was merged at `660c164` after checking approved PR #11 head `551f73d`, CI
and actual CodeRabbit comments. This milestone adds production drawing code;
the existing lineup pitch, drag/drop, imports and fullscreen are preserved.

## Consumers and boundaries

`lib/tactical/drawing.ts` produces one portable tree of SVG drawing primitives.
`SceneDiagram` adapts that tree to React; `serializeDrawing` serializes exactly
the same primitives to escaped, self-contained SVG. Neither loads external
images, injects user XML nor depends on CSS for tactical colours. The resolved
palette is centralized in `lib/tactical/palette.ts`; shell colours remain CSS
theme tokens. Future PDF consumers can use the same tree or serialized SVG.
Illustrated PDF generation is **not** implemented here.

Saved coaching-guide activities and the first illustrated calendar-preview
activity resolve exact scene ID/revision pins and representative times from the
validated organisation bundle. They never substitute the newest scene version.
Missing diagrams stay empty; unresolved references are identified in guides.
No fixtures are silently attached to real sessions or uploaded to storage.

`/tactical-renderer` is a read-only acceptance surface with five explicit synthetic
schema-1.0 fixtures: 5v2 rondo, goalkeeper distribution, conditioning/testing lanes,
half-pitch attack and full 11v11. It exposes framing, grid/guide visibility and
snapshot time only. There are no editing, save, path-authoring or animation
timeline controls. The planned editor remains PR 07; animation authoring remains
PR 08. Desktop/laptop are the verification targets; mobile work stays deferred.

## World coordinates and viewport contract

- World origin is the field's top-left; +X follows length, +Y follows width.
  All saved entities, tracks and areas use metres. Heading 0 faces +X; 90 faces +Y.
- Projection is uniform, with one pixels-per-metre scale. The inverse is exact
  up to floating-point arithmetic. ResizeObserver measures actual diagram pixels;
  resizing, fullscreen and visibility controls do not change scene identity,
  revision, position or pitch dimensions. Marker numbers retain 13 px text.
- Fit Exercise uses the explicit activity area; without it, it uses content bounds.
  Fit All includes every entity footprint, all stage paths and annotations,
  including future/hidden overlays, for stable framing throughout evaluation.
  Fit Pitch uses the field boundary. Half-pitch presets use the two equal X halves.
  Custom framing accepts an explicit origin/length/width without resizing the field.
- Goals have a 7.32 m opening and 2 m depth; ladders have a 4 × 0.6 m footprint.
  Other equipment and player glyphs use screen-readable sizes at fixed world anchors.
- Changing field dimensions does not scale/clamp existing objects. Out-of-field
  anchors remain valid. Counts identify cropped markers and outside-field anchors
  in the accessible description; Fit All can reveal them. SVG clips at its viewport.
- The metric grid is anchored at zero and limited to the field. When requested
  spacing would make lines less than 8 px apart or exceed 201 lines per axis,
  an integer multiple of that spacing is used and the **actual** spacing is shown.
  Thirds/channels also use field dimensions. These are geometry, not background images.
- Snapping/alignment are deferred to authoring. Future snapping must transform
  pixels through `screenToWorld`, then round metre coordinates, independent of zoom.
  No snapping or edits occur while viewing a saved diagram.

Layers are surface, grid, markings/guides, areas, paths, equipment, players and
text. Pass/run/rotation/press/dribble use distinct colour and line patterns.
Optional position labels, area captions and notes use deterministic placement
against marker/text boxes, with clamping and accessible complete text. Dense
unresolvable overlaps are counted rather than moving saved objects. Marker
numbers remain visible. This is bounded collision avoidance, not a global layout solver.
Pitch markings can be auto/football/boundary/none; auto uses football markings on
fields at least 70 × 45 m and boundary-only on smaller training fields.

## Pure stage evaluation

`evaluateScene(scene, seconds)` validates the existing schema and operational
limits, rejects nonfinite times, clamps finite times to the total duration and
returns a new snapshot. Empty stages produce a static time-zero scene. Completed
tracks carry their endpoint into subsequent stages; absent tracks hold that pose.
If the first keyframe is after zero, interpolation starts at the carried pose.
An authored keyframe at zero explicitly overrides the baseline. Linear piecewise
interpolation follows authored segments; no fabricated curved path is introduced.

Stage boundaries select the next stage, with local time zero. The final boundary
holds the final pose. Annotation visibility is `[from, until)` in local stage time.
Only current-stage paths are returned; active-only display additionally hides
finished movements. At the final scene endpoint no movement paths remain. Entity
headings retain their saved values; orientation interpolation is not in schema 1.0.

Operational limits are separate from persistence schema: 512 entities, 128 stages,
4,096 tracks, 16,384 keyframes, six hours, coordinates within ±10,000 m, fields/areas
at least 0.01 m, viewports 120–8,192 px and camera zoom 0.1–8. Oversized arrays are
rejected before schema traversal. A valid saved scene exceeding these limits shows
a renderer error; its persisted data is never rewritten. View-only camera state is
accepted by the pure API; free pan/zoom editing controls remain later work.

## Verification and rollout

Run `npm test`, `npm run lint`, `npm run typecheck`, production build and
`npm run test:e2e`. The tactical tests cover metric round trips, unchanged world
geometry, fit bounds, equipment footprints, grid density, line clipping, staged
evaluation, XML escaping, crop reporting and label readability. Browser checks
exercise five examples at 1920 × 1080 and 1366 × 768, fullscreen resize/focus,
visibility/custom framing and exact scene pins shared by calendar and guide.
The existing nine lineup browser regressions are also retained in the evidence.

No migration or new environment variable is required. Rollback is a code revert;
existing saved schema-1.0 scenes and all session/document history remain intact.
Live Supabase Auth, saving and private document storage remain an unverified
staging gate before a coaching pilot. No hosted resources, credentials, manual
deployment, 3D or Meshy work are part of this PR. Stop with the PR open for review.
