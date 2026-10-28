# PR 08 - 2D tactical animation authoring

PR 09 illustrated coaching PDFs merged as GitHub PR #14 at approved head
`14bac97d98da6f6501c9c3cf5a334fc5f160b5d5`, merge
`85354f3dceb65cb1a7e34576038b95914ce8174e`. Its layouts are unchanged here.
This milestone adds animation authoring to the existing tactical editor. It does
not implement fullscreen coaching presentation, 3D, Meshy or hosted staging.

## Coach workflow

Open an exact session activity, exercise or template diagram. **Layout** keeps
the existing object, field-context, snap, alignment and camera workflows.
**Animation** adds the compact bottom timeline and a selected-stage inspector.
Existing motion scenes reopen in Animation mode; old static diagrams keep Layout.

1. Add a stage, name it and set its duration. Stages are ordered, with cumulative
   start/end times derived from local durations.
2. Select a player or ball, choose Start pose, End pose or a local time, and drag
   it on the existing canvas. Numeric pose X/Y records the same metre keyframe.
   Group drags and screen-direction keyboard nudges use the same operation.
3. Add/edit intermediate poses, select a keyframe, move its time or delete it.
   Player paths support run/press/rotation; ball paths support pass/dribble.
   Equipment remains fixed and is placed in Layout mode.
4. Add arrows, notes or areas in the selected stage. Edit their geometry in the
   existing inspector and their local half-open visibility window separately.
5. Hide selected objects in one stage, or restore all stage objects. Hidden
   entities retain their positions/tracks; visibility does not erase motion.
6. Preview with play/pause, restart, 0.5/1/1.5/2x speed or the absolute scrubber.
   The stage selector and selected-stage inspector make editing targets explicit.
7. Save through the existing optimistic organisation commit and reopen the new
   exact owner/scene revision. Historical scenes remain read-only and playable.

Start/end ghosts are optional rings for selected objects, with readable live
player numbers retained. The default path display shows relevant active movement
in the current time's stage. Coaches can show that stage's complete paths or hide
paths. Timed annotations retain their own visibility windows. No global display of
every stage's arrows is introduced.

## Time, movement and editing contract

The original stage/track/keyframe model, world coordinates, viewport transforms,
`evaluateScene`, `drawScene` and `SceneDiagram` are shared. There is no second
renderer, coordinate system, persisted playback clock or hidden authoring graph.
Positions interpolate linearly between local keyframes and hold the last position
when a track finishes. Stages use cumulative, right-continuous boundaries; timed
annotations use `[visibleFrom, visibleUntil)`. Static scenes remain time zero.

Playback derives absolute time from one monotonic elapsed-time origin and speed.
Rendering a saved scene at the same time always yields the same position. Seeking,
camera edits, speed and ghost/path preferences do not dirty or save the scene.
The reusable evaluator remains independent of React and the browser clock.

Animation edits reconnect each movement's zero-time keyframe to the preceding
carried endpoint. A start-pose edit at the first stage changes the initial entity
position. A later shared start-pose edit changes the preceding stage endpoint;
the inspector explains this explicitly. Destinations remain absolute world
positions. Reordering/deleting/copying stages reconnects starts and retains those
destinations, rather than inventing a new translation or a repeat displacement.
Copies allocate independent stage/track identities and remain editable.

Duration edits scale keyframe times and annotation windows together. Later stage
durations remain unchanged; cumulative starts are derived again. Destination times
can be moved within their stage; collisions with another keyframe are rejected.
Deleting the only destination removes that motion track, leaving a held pose.
Pose times are rounded to microsecond precision to avoid near-duplicate keys.
Rejected edits leave the previous valid scene/history intact.

Layout-mode moves deliberately translate an object's entire path, preserving the
existing editing contract. Animation-mode moves edit the selected pose. Completed
drags commit once to the existing 50-snapshot undo/redo history. Playback does not
add history entries. Undo/redo restores complete immutable scene snapshots.

## Visibility and persistence compatibility

The only additive persisted field is optional stage `hiddenEntityIds`, a bounded
list of unique existing entity IDs. Absence means all objects are visible; an empty
list has the same meaning. Visibility is stage-local and resets at each stage.
Evaluation retains all carried positions, including hidden objects, and exposes
the active hidden IDs. The shared drawing suppresses those markers and their
motion paths; framing still includes the authored scene so the camera stays stable.

Historical schema-1.0 records are accepted without rewriting or inserting defaults.
The existing JSON snapshot and append-only scene journal persist the optional field;
no SQL migration or hosted resource is required. Old strict clients predating this
field cannot read new snapshots containing it. Deploy compatible readers together;
any rollback must retain visibility-aware contracts/evaluation rather than strip
the field, overwrite history, or erase existing animations. Unsupported fields and
invalid visibility references continue to fail validation.

Save appends scene and owner revisions using the existing exact-pinned target,
authenticated provider and expected organisation version. Only the selected
activity's diagram reference and its matching booking advance. Other sessions,
exercise sources/templates and historical pins remain independent. An uncertain
save still blocks writes pending explicit reload; animation never retries it.
The existing representative-time reference is preserved by the renderer; editor
saves retain the established initial-frame pin. This PR does not add animation
frames to PDF layouts or replace previously generated PDF bytes.

The renderer version advances to `svg-2d/1.2.0` for additive visibility support;
old scenes without visibility produce unchanged static drawings. Existing PDF
generation merely records this renderer version in provenance. Approved print
layout, branding, access checks and document history are unchanged.

## Verification and limits

Eight explicitly illustrative, never-auto-uploaded examples cover simple passing,
three-player rotation, a moving-defender rondo, attacking-third combination/finish,
corner delivery/runs, goalkeeper distribution, timed conditioning lanes and
multi-stage full-pitch movement. They are built with the same authoring operations
as user edits and enter saved records only through an explicit save.

Automated checks cover deterministic interpolation/boundaries, stage operations,
retiming, annotation windows, visibility, group movement/history, schema/JSON
compatibility and exact historical isolation. The production SQL/RLS contract test
round-trips animated stages, visibility and immutable pins. Desktop browser checks
operate the real editor and inspect SVG world positions at 1920x1080 and 1366x768;
only Auth/transport/storage services are simulated. They are not proof of hosted
Supabase operation. Existing editor, calendar, guide, PDF and lineup regressions
remain required.

Motion is piecewise linear in 2D, without ball height, easing curves, skeletons or
automatic possession/contact inference. Entity facing remains the existing static
heading. A hide/show transition is deliberate; it does not fade an object.
The existing renderer bounds (512 entities, 128 stages, 4096 tracks, 16384 frames,
6 hours total and bounded world coordinates) remain authoritative. Stage duration
editing accepts 0.1 to 3600 seconds; unsafe precision collisions are rejected.
Playback prioritises deterministic geometry; unusually dense scenes can lower
frame rate. Fullscreen coaching presentation and hosted Auth/Storage verification
remain separately gated milestones. No mobile-specific work is included.
