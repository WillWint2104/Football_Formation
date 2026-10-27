# PR 09 — Illustrated coaching PDFs

PR 07's interactive editor merged as GitHub PR #13 at approved head `4922867`,
merge `565dae7`. This milestone exports the exact saved web-guide content and
scene references. It does not add animation authoring, weekly programme exports,
bulk imports, mobile work or hosted resources.

## Generation and source integrity

The guide's **Generate illustrated PDF** action uses a same-origin, authenticated
POST to `/api/organizations/<org>/sessions/<id>/<revision>/exports`. It sends the
expected organisation version and optional exact booking ID/revision in headers.
There is no client guide body, actor, object path, image URL or replacement graph.
The server verifies Auth, reads through RLS, resolves the requested saved session
and matching booking, and validates the complete domain graph. Historical guides
can be exported; a newer revision is never substituted.

The PDF includes the saved title/type/team, date/time/time zone and venue when
booked, assigned coaches, objectives/focus, ordered activities/roles/durations,
participant counts, area/origin, equipment/quantities, setup/delivery instructions,
coaching points, progressions, regressions and variations. Unknown values remain
unknown. Warm-ups and cool-downs follow their saved sequence.

`guide-pdf.ts` consumes the same saved content and `resolveGuide` contract as the
web guide. Each diagram calls the shared `drawScene` and `serializeDrawing` at its
saved representative time. Sharp rasterises that SVG at print resolution; it does
not compute football geometry. Physical context, neutral boundaries, set-piece
orientation, saved positions/colours and stage annotations come from that renderer.
The camera may quarter-turn a cross-field region for readability. If entity
anchors are cropped, the shared Fit All projection is used. World positions and
saved geometry are never scaled or changed.

A4 pages use embedded, subset Inter 4.1 regular/bold fonts (SIL Open Font License,
bundled in `assets/pdf-fonts`). All font reads are local and traced into the export
route; generation never downloads fonts or remote images. Square neutral drills
use a diagram beside setup facts; wider scenes use the page width. Measured text
wraps across pages, long words wrap instead of clipping, and headings keep their
first content lines. Short coaching notes use paired columns; long instruction
sequences use a compact diagram while retaining readable marker labels. Short
unillustrated activities can share a page. Headers, margins and page counters are consistent. Document
and tactical palette tokens stay separate; the approved dark-green field remains.

The printed overview records session/booking pins and exporter/renderer versions.
Each figure records its exact scene pin and snapshot time. PDF Subject metadata
also contains a structured manifest with all activity/scene/time references.
Renderer provenance is `guide-pdf/1.0.0;svg-2d/1.1.0`.

## Private storage and immutable history

Generation appends a new independent document identity to the organisation graph.
Its existing `generated-guide` source records the exact session, unique scene
revision set and renderer/exporter version. It deliberately does **not** append or
alter a session, booking, template, exercise or scene just to attach an export.
The guide lists generated records by their source session pin, including historical
ones, separately from uploaded attachments. Optional booking provenance remains
in the PDF manifest; no new domain-schema keys or SQL migration are needed.

The existing private document journal, random server-generated object path,
SHA-256 digest, private-bucket check and `upsert:false` upload are reused. The
server registers the object before uploading, then saves the appended metadata
using the expected organisation version. Each explicit generation creates a new
file; it cannot overwrite an earlier export. The ordinary authenticated download
endpoint now accepts a generated document only for its exact source session pin.
Uploaded-document authorization remains based on the session attachment list.
Both paths recheck RLS, private journal identity, byte length and digest, and return
attachment/no-store/nosniff/sandbox responses without public/signed storage URLs.

The shared provider serializes writes and reloads the saved graph after success.
Any uncertain save blocks further writes until explicit reload. 401/404 generation
failures preserve the API error status so the provider clears private drafts.
There are no automatic retries, overwrites or compensating object deletions:
an acknowledged failure can still conceal a committed save. Reload and inspect
the exact export list first. Unattached journaled bytes require the existing
operator reconciliation process; this feature does not delete them.

## Limits and compatibility

Exports are bounded to 100 activities, 32 diagram references, 200,000 serialized
session characters, 80 pages and the existing 3 MiB private-PDF limit. Over-limit
guides fail explicitly without truncating saved instructions. Inter supports the
application's usual Latin, Greek and Cyrillic text; unsupported document glyphs
fail explicitly rather than being replaced or omitted. Wider script/font support
is a future enhancement. Raster diagrams remain static and cannot be edited in
the exported PDF. The saved representative time is used; no frame is invented.

The existing schema 1.0 generated-guide contract and private journal are unchanged.
Older app readers still validate these records, though their UI/download handler
may not offer generated files. Rolling back code must retain a compatible private
download handler if historical exports need to remain available. Never rewrite
old metadata, remove journal rows, delete objects or run destructive rollback to
make an older interface work. Hosted migrations/provisioning are not part of this
PR; hosted Auth/Storage/durable-save verification remains a pre-pilot gate.

## Verification

Acceptance fixtures are explicitly synthetic and never seeded into an authenticated
organisation. Real generated PDFs cover neutral possession, final third, goalkeeper,
set piece, conditioning, testing, full pitch, a long programme, no diagrams and an
older session/representative time after a later revision exists. PDF structure,
source manifest, byte limits and page sizes are tested. Poppler page captures and
text/margin checks provide actual visual evidence, including readable player labels.

HTTP/client tests cover exact pins, origin/Auth/org isolation, stale saves, private
downloads, unchanged history, metadata validation and uncertain-save behaviour.
The production SQL integration persists and retrieves a generated PDF's metadata
alongside uploaded attachments using the existing migrations/RLS/journal contracts.
Desktop browser tests drive the guide UI against the real export/download handlers
in a local Node worker; only Auth/snapshot/blob services are stand-ins. These tests
are not proof of hosted Supabase operation. Existing calendar/session/guide/editor
and lineup regressions remain required.

References: [pdf-lib](https://pdf-lib.js.org/docs/api/classes/pdfdocument),
[Sharp SVG input](https://sharp.pixelplumbing.com/api-constructor/),
[Inter 4.1 release and licence](https://github.com/rsms/inter/releases/tag/v4.1).
