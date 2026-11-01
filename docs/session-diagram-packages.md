# C3 B1 - Optional plan-and-diagrams package

B1 is a pure contract module in `lib/designer/package.ts`. It is deliberately not
connected to the Session Designer import/download buttons, drafts, browser
storage, Tactical Editor, authenticated services or PDF rendering. The existing
`football-formation-session` v1, native TacticalScene v1 and legacy draft formats
remain unchanged. B2 persistence needs separate approval.

## Public API

All functions return `{ ok: true, value }` or `{ ok: false, diagnostics }`. Rejection
has no partial accepted value. Diagnostics have a code, field path and message;
resource errors also identify the maximum and observed count, and pin errors
identify the exact namespace, ID, revision and snapshot time where available.

- `parseSessionPackageJson(text)`: check UTF-8 input size (including whitespace
  and BOM), parse JSON, validate the entire candidate and return independent data.
- `validateSessionPackage(input)`: the equivalent boundary for plain JSON values.
  Getters, custom serialization, classes, sparse arrays, cycles, undefined and
  nonfinite numbers are rejected rather than executed or silently discarded.
- `serializeSessionPackageJson(input)`: validate, canonicalize object key order,
  preserve array order and use pretty output if both byte budgets allow it;
  otherwise use compact JSON. Never writes a file or changes the supplied object.
- `resolvePackageDiagram(input, activityId, diagramIndex)`: validate the whole
  package, find the stable activity ID and exact pin, and return an independent
  scene plus the unchanged representative time. It does not evaluate, draw,
  clamp, select the latest revision or mutate a source scene.

This module has no I/O or state. Namespace/organisation IDs are descriptive file
metadata and confer no authenticated membership or hosted write permission.

## Envelope and compatibility

Exactly five required fields: `format: "football-formation-session-package"`,
`schemaVersion: "1.0"`, `sceneNamespace`, `document` (the existing portable session
object), and `scenes` (existing native scene records). Unknown fields/versions fail.
A null namespace requires no scenes and no references. All included records use
one matching namespace. Unreferenced scenes are allowed within the budgets.

The embedded document is validated through `portableSessionSchema`; each scene
uses `prepareScene`. Package activities must include stable IDs: the legacy
importer's random ID default is intentionally not invoked by the pure package
boundary. Existing standalone legacy imports can still materialize IDs as before;
their serializer produces explicit IDs suitable for a package. Other existing
optional/default fields retain their usual validator behavior.

All pins must resolve for a package to be accepted as self-contained. Identical
validated scene revisions are deduplicated, regardless of JSON property ordering.
Array order stays significant. Conflicting contents for one immutable tuple fail;
there is no first/last/latest winner. Missing references are reported individually.
Legacy files containing unresolved pins remain valid with the old importer; they
are not silently upgraded to self-contained packages.

Time is finite and nonnegative under the existing pin schema, and must not exceed
the exact scene duration. Zero and the exact end are valid; a scene with no stages
permits zero only. Existing evaluator stage/annotation boundary semantics remain
unchanged. Validation rejects an invalid pin before any evaluator could clamp it.

## Approved budgets

| Resource | Maximum |
|---|---:|
| Whole input/output UTF-8 | 8 MiB |
| Embedded document compact UTF-8, before/after existing normalization | 2 MiB |
| Activities / pins per activity | 100 / 20, unchanged |
| Raw scene entries / total pins | 32 / 128 |
| Aggregate entities / stages | 4,096 / 512 |
| Aggregate tracks / movement keyframes | 8,192 / 32,768 |
| Referenced snapshot work | 262,144 |

Snapshot work sums entity + stage + track + keyframe counts for *each* pin; repeated
references count again. Raw scene entries and their aggregate work are counted
before deduplication. Per-scene renderer limits are retained: 512 entities, 128
stages, 4,096 tracks, 16,384 keyframes, absolute coordinates up to 10,000 m and total
duration up to 21,600 s. Raw counts are checked before deep schema cloning where
possible. These are input safeguards, not benchmarked browser performance claims.

The whole text budget includes formatting. The embedded component is measured as
compact JSON, matching the existing export content check. Pretty package output
is used only when the embedded pretty document also fits 2 MiB, so extraction can
use the unchanged legacy serializer. Standalone legacy input keeps its own raw
2 MiB limit and is not altered by this module.

## Exact example

[`examples/session-package.json`](examples/session-package.json) includes revisions
1 and 2, but activity `activity-1` explicitly pins revision 1 at 1.0 s:

```ts
const parsed = parseSessionPackageJson(text);
if (!parsed.ok) return parsed.diagnostics;
const resolved = resolvePackageDiagram(parsed.value, "activity-1", 0);
if (!resolved.ok) return resolved.diagnostics;
resolved.value.namespace;             // "local-example"
resolved.value.scene.revision;        // 1, even though revision 2 is present
resolved.value.representativeSeconds; // 1, unchanged
```

Passing the returned scene/time to the *existing* evaluator would place player 6
at x = 5 m. The resolver itself retains raw scene geometry. The file is an
illustrative contract example, not a complete training exercise or a file the
current application UI accepts.

Run focused checks with `node --import tsx --conditions=react-server --test
tests/sessions/package.test.ts`. `npm test` includes them automatically. Production
light styling, complex-diagram visibility, application screenshots and Chromium
print integration remain later checkpoints; no mockup result is counted as a
production integration test here.
