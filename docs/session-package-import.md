# C3 B3a-P — Explicit local package import

This prerequisite supplies the initial local scene source for later B3a attachment
browsing. It is not the eventual direct Tactical Editor workflow. No attachment
controls, editor handoff, diagram rendering or PDF integration are implemented.

## Coach workflow

Open Session Designer → Import JSON → **Import Session & Diagrams**. The existing
legacy session JSON tab remains the default and keeps its existing import behavior.

1. Choose one complete `football-formation-session-package` v1.0 JSON file.
2. Inspect the validated session name, activity count, distinct scene-revision
   count and attachment count. Expand attachment details to see each activity,
   scene ID, exact revision and representative time. Identical duplicate scene
   records are canonicalized by B1; conflicting duplicates fail.
3. Confirm storing a new independent local package. This never opens/replaces
   the current editing draft or merges it with a package.
4. Alternatively, inspect a saved local package, explicitly choose it as the
   replacement target, then confirm that named local owner/version. B2 retains
   the prior complete snapshot and prevents stale writes.
5. Download the validated candidate or the exact successfully stored package.

The package-import panel is deliberately a local library entry point. Session
Designer editing, ordinary Download JSON and printing continue to use the existing
editing draft. A package import does not silently change the active coaching plan.
Stored package contents can be inspected/downloaded after refresh. Opening a
package into the activity workspace and attaching its scenes remain later work.

## Reused foundations

- `previewPackageImport` delegates JSON parsing and full reference validation to
  B1. The first displayed attachment is also checked through B1's public exact
  resolver. Other rows use the already-validated native pins; the UI does not
  revalidate a maximum library 128 times just to display its summary.
- File input enforces 8 MiB before reading and uses strict UTF-8 decoding. Embedded
  logos are checked using the existing raster verifier before confirmation.
- `browserCompanionRepository()` is the only local repository used. Its existing
  `create`, `save`, `list` and `read` operations provide transactional writes,
  stable local ownership, exact native scene pins, integrity checks, recovery
  snapshots and global storage budgets. No B1/B2 formats or implementations changed.
- A new local package owner ID does not replace native `organizationId` or
  `sceneNamespace`. These remain file metadata. The UI does not query hosted
  organisations or claim membership/permission based on an imported ID.

The subsequent B3a browser can discover imported sources through the existing
repository: `list()` → explicit chosen ID → `read(id)` → a `ready` snapshot's
`package.scenes`. Invalid or missing snapshots are not eligible sources; their
separate recovery state must remain explicit. B1 resolves exact activity pins.

## Failure and recovery

- Cancel, an unchecked confirmation, malformed JSON, wrong versions, missing
  scenes, conflicting revisions, invalid times, invalid UTF-8 or rejected logos
  perform no repository write and do not touch the editing draft.
- A storage failure blocks repeat submission. Keep the validated package download,
  recheck local storage, inspect its current state and deliberately select a new
  independent copy or the inspected current replacement version. No automatic
  retry, namespace remapping or revision substitution is performed.
- An acknowledgement may be lost after a commit. Rechecking is therefore required
  before reviewing a new-copy import; the interface warns that a new copy might
  duplicate an uncertain save. Replacing a current owner requires another explicit
  inspection and confirmation, using its updated version.
- Invalid saved data is shown distinctly. A separately verified recovery snapshot
  can be downloaded or reviewed for import under a new local identity. The damaged
  record is not repaired, overwritten or deleted automatically.
- The import receipt records the acknowledged save. It is not a claim that later
  storage changes cannot occur. Downloading its retained bytes remains a useful
  independent backup even if a later stored record becomes corrupt.
- Browser storage remains bounded and is not a permanent backup. B2's accepted
  16-owner, two-snapshot, 64 MiB payload policy and browser quota handling remain
  unchanged. Tests inject quota errors rather than filling the owner's disk.

## Implementation boundary

`PackageImporter` lives within the existing `JsonImporter` workflow, with scoped
navy/gold styling. It is mounted only when package mode is selected. It never calls
the legacy draft update hook, authenticated APIs or Tactical Editor persistence.
Coaches' unsaved activity edits remain in the existing state when switching views.

No second database, local draft key, scene format, authoring model, renderer or
server dependency was added. Direct create/edit/save/return integration remains
B3b; activity attachment UI is B3a; comprehensive visual integration is B4; PDF
diagrams remain B5. No merge or deployment is part of this checkpoint.
