# C3 B2 — Local companion storage and recovery

B2 adds an opt-in local repository and read-only recovery policy. It does not wire
new controls into Session Designer, change its existing draft hook, modify JSON
contracts, or integrate Tactical Editor/PDF output. B3 and later checkpoints need
separate approval. No authenticated service or server dependency is introduced.

## Mechanism

- `lib/designer/companion.ts`: package validation, local ownership, bounded
  snapshot retention, integrity verification and legacy/companion recovery choices.
- `lib/designer/companion-indexeddb.ts`: browser adapter for IndexedDB database
  `football-formation.session-designer.companions.v1`, version 1, store `plans`,
  key path `documentId`. Importing the module does not open or modify storage.
- The unchanged legacy draft remains at
  `football-formation.session-designer.v1` in localStorage. Neither module writes,
  clears, migrates or claims a transaction with that draft.

Each local record contains `version: 1`, a fresh opaque `documentId`, a monotonic
`ownerVersion`, and at most two complete snapshots, newest first. A snapshot has
its owner version, ISO saved time, validated package JSON and SHA-256 of the exact
JSON bytes. Current and previous snapshots are replaced together in one IndexedDB
record/transaction, so no separate head pointer or orphan scene write can become
partially visible. These are storage metadata, not another session-authoring model.
`list()` discovers identities after refresh; no localStorage pointer is needed.

`create(package)` always allocates a new independent local identity at owner version
1. It never overwrites an existing owner, including on an allocator collision.
`save(id, baseOwnerVersion, package)` requires an existing valid owner and the exact
base version. It advances the local owner version without changing native scene
revisions or activity pins. Existing non-null namespaces cannot be remapped; use
a new independent import for a different namespace. An initially diagram-free
null namespace can acquire its first namespace. Contents claiming the same native
scene tuple as either retained snapshot must remain identical; changed geometry
needs a new native revision and an explicit pin.

Hashing and full validation occur outside write transactions. The final read/write
transaction compares the complete observed owner record, calculates the repository
budget, and writes the new coherent record. A competing save, manual alteration or
deletion changes that comparison and returns a conflict. Transactions sharing the
store serialize the checks across tabs, including global quota checks. A request's
`success` event is not accepted as a save; only transaction `complete` resolves it.
Connections close after each operation and on version changes. Strict durability
is requested, without silently falling back if unsupported.

The adapter follows the [IndexedDB transaction specification](https://www.w3.org/TR/IndexedDB/).
Transaction atomicity and strict durability are browser guarantees/hints, not
protection against profile deletion, storage eviction or all power/hardware failures.
Downloads remain necessary for independent backups.

## Limits and quota handling

The B1 package contract remains unchanged: 8 MiB per package, 2 MiB embedded
document, exact references and all existing aggregate limits. Local repository
policy additionally permits 16 document identities, two snapshots per identity,
and 64 MiB of actual UTF-8 package payloads across retained snapshots. Metadata,
indexes and browser encoding add overhead outside that logical payload budget.

The candidate is validated before opening storage. The local budget is calculated
inside the write transaction before `put`; stored size claims are not trusted.
No unrelated plan is evicted to make room. A malformed record prevents an unsafe
quota calculation and is preserved for explicit recovery.

Available origin quota varies. Storage estimates cannot reserve capacity; the
actual transaction can still fail with `QuotaExceededError`. That failure is
reported distinctly and the transaction rolls back. Tests inject this browser
error rather than filling the user's disk. See [browser storage quotas](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).

## Read and recovery results

- `read(id)` returns a `missing` state only if no record exists. Storage denial,
  unavailable crypto, blocked opening or unsupported database layout is an error,
  never an empty repository or permission to replace data.
- `ready` requires valid metadata, expected current/previous versions, valid
  package bytes/digests and all exact scenes/pins. The data returned is independent
  from persistent storage.
- `invalid` identifies corrupt/incompatible/incomplete data. A separately verified
  snapshot may be exposed as `recoverable`; it is not silently promoted, written
  back or treated as the accepted current version. In-place saves are blocked.
- `list()` returns identities and verified readiness/version metadata, without
  automatically opening the newest plan. Invalid entries remain visible as invalid.

`planCompanionRecovery(readValue, legacyDraftText, now)` reuses `decodeDraft`,
including its existing retention and incomplete-edit behavior. It performs no I/O.
An unavailable read must be handled before calling it, rather than converted into
`missing` by a future UI.

Identical document content (ignoring object-key order) needs no conflict prompt.
Any differing valid legacy draft produces two options when a complete package is
available: the complete plan with diagrams, or reference-only editable text. A
newer text draft is explicitly identified. Neither time nor matching activity IDs
causes an implicit merge. Options include the complete package's original JSON or
the original draft JSON for independent downloads. An incomplete legacy draft is
recoverable text, not falsely labeled a valid portable package.

## Recovery procedure for interrupted or partial operations

1. Keep current in-memory edits and downloaded JSON. Do not retry a save blindly.
2. Reopen/read the same local document ID (discover it with `list()` after refresh).
   A transaction aborted before completion leaves the prior whole record. If an
   acknowledgement was lost after commit, the reopened owner version exposes the
   committed result; a stale retry cannot overwrite it.
3. If the record is ready, compare its version/content to the in-memory candidate
   before explicitly deciding on another save.
4. If invalid, retain the raw stored record for investigation. Download the
   separately verified recoverable package, if present, and inspect legacy text
   independently. No helper deletes, repairs or rewrites corrupt data.
5. Explicitly choosing an older complete recovery package means importing it with
   `create()` under a new local identity, not resetting the damaged owner's version.
   A newer text-only draft remains an independent option; do not attach scenes by
   guessed identity or select newer scene revisions automatically.
6. If no complete snapshot remains valid, preserve the stored bytes and use a
   known-good downloaded package or the explicitly reference-only legacy draft.
7. For quota/denial failures, preserve exports and resolve browser storage access
   or capacity separately. No automatic store clearing or pruning of other plans
   is implemented. Normal successful saves retain only the current and immediately
   previous snapshot; this is bounded recovery, not an unlimited revision archive.

## Verification boundaries

Focused unit tests exercise ownership, all-or-nothing failures, post-commit lost
acknowledgement, corruption, exact pins, recovery choices and exact byte/count
limits. Playwright bundles the actual modules into a test-owned localhost page;
it does not introduce an application route. Browser checks exercise IndexedDB,
refresh, actual persistent-profile close/reopen, aborted transactions after a
successful `put`, two tabs, injected quota/denial and maximum packages.

The explicit esbuild dev dependency pins the version already in the lockfile via
tsx. It bundles only the browser test harness; it adds no application runtime.
The existing delayed-sample browser assertion normalizes CRLF to LF because HTML
textarea values normalize line endings. No production import behavior changed.

The recovery choices are API results, not a new visible dialog. Session Designer
does not yet call this repository; integrating its document selection/recovery
controls remains a later approved UI checkpoint. No screenshots of the test harness
are represented as a working C3 Session Designer integration.
