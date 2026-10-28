# PR 09 — Illustrated coaching PDFs

PR 07's interactive editor merged as GitHub PR #13 at approved head `4922867`,
merge `565dae7`. This milestone exports the exact saved web-guide content and
scene references. It does not add animation authoring, weekly programme exports,
bulk imports, mobile work or hosted resources.

## Generation and source integrity

The guide's **Generate illustrated PDF** action uses a same-origin, authenticated
POST to `/api/organizations/<org>/sessions/<id>/<revision>/exports`. It sends the
expected organisation version, optional exact booking ID/revision, and validated
template/cover selection in headers.
There is no client guide body, actor, object path, image URL or replacement graph.
The server verifies Auth, reads through RLS, resolves the requested saved session
and matching booking, and validates the complete domain graph. Historical guides
can be exported; a newer revision is never substituted.

The PDF includes the saved title/type/team, date/time/time zone and venue when
booked, assigned coaches, objectives/focus, ordered activities/roles/durations,
participant counts, field dimensions, equipment/quantities, setup/delivery instructions,
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
use a diagram beside delivery/coaching notes; wider scenes use the page width. Measured text
wraps across pages, long words wrap instead of clipping, and headings keep their
first content lines. Short coaching notes use paired columns; long instruction
sequences use a compact diagram while retaining readable marker labels. Short
unillustrated activities can share a page. Headers, margins and page counters are consistent. Document
and tactical palette tokens stay separate; the approved dark-green field remains.

PDF Subject metadata contains exact session/booking/scene/time pins, the chosen
template and branding identity/hashes. Internal IDs, coordinate origins and
exporter versions are not prominent coaching content. Meaningful saved values
remain unchanged; empty optional sections are omitted. Unknown equipment quantities
remain explicitly unknown. Planned activity minutes and the booked time window
are labelled independently, including when they differ.
Renderer provenance is `guide-pdf/1.1.1;svg-2d/1.1.0` (V003 cover/brand-slot refinement;
saved session, booking and diagram pins are unchanged).

## Shared document design system

`design-contracts.ts`, `print-theme.ts`, `guide-design.ts` and `PdfLayout` define
one reusable engine with three content-adaptive layouts:

- **Single Activity Sheet**: compact branded overview, prominent diagram and
  associated instructions/notes; short practices fit one A4 page. Long content
  continues naturally rather than being truncated or reduced to tiny type.
- **Complete Session Guide**: compact overview/ordered sequence and activity
  units, without automatic page breaks per activity.
- **Extended Coaching Pack**: the same primitives for longer/detailed content,
  with an explicitly optional dedicated cover. The cover has a prominent club
  identity/title, team/age group, saved objective/focus and a distinct logistics/staff
  block. It does not repeat the compact activity list at the top of an otherwise
  empty summary page. Detailed activities retain their saved order on subsequent
  pages. No compulsory cover or invented decorative scene is inserted.

Automatic selection uses one/zero activities for a sheet, two to five for a guide,
and six or more for a pack. Explicit selection is available in the guide. A sheet
rejects multiple activities; a dedicated cover requires the extended template.
Actual content, measured text, diagram dimensions and keep-together requirements
determine pagination. All templates retain the 9.5-point body type, print margins,
headers/footers, licensed fonts and shared tactical engine. A session title that
already names its sole activity is not needlessly repeated.

The brand contract is separate from immutable scene geometry: organisation ID,
club name, optional secondary identity, primary/accent colours, footer, crest and
secondary/sponsor raster mark. It accepts bounded PNG/JPEG bytes **only through
the trusted server-side generator**, never an arbitrary URL/path, SVG or browser
upload. Bytes are decoded, limited to 256 KiB/1024 pixels/one frame, and re-encoded
before embedding. Branded content pages reserve a 56x56 point crest and an 88x32
point secondary-mark slot. The optional cover reserves 96x108 and 112x40 points
respectively. Each image is contained and centred, retaining its aspect ratio;
header rules sit below the complete logo bounds. Unbranded headers and accepted
activity/guide compositions retain their V002 measurements.
Heading ink must meet 4.5:1 contrast on white paper. Long identity/footer text wraps
with reserved print space. No-logo layouts reclaim the slots for a text identity.

Production currently uses Football Formation's navy/gold text identity plus the
saved team/age group; it does not invent a club or sponsor. The verification crest
and partner mark are explicitly labelled synthetic test fixtures, not a real club.

### Persistent branding dependency (not implemented or provisioned)

The current organisation table stores only name/version; snapshots have no branding
record. The document journal authorises PDFs, not a general image-asset service.
Persisting configurable club settings/marks therefore needs a separately approved
organisation-scoped settings contract, RLS/membership-checked writes with expected
version, bounded private raster storage/validation, and immutable brand revisions.
A trusted server resolver would load that exact brand revision after organisation
authentication and supply it to this engine. Export manifests would retain the
brand identity/hash (and a future version pin) while old PDFs remain unchanged.
Do not store raw image URLs, global mutable branding or client asset paths in scenes.
No schema migration, new bucket, upload endpoint, credentials or hosted service is
silently introduced here. Template/cover choices are per-export, not persistent
organisation settings.

## Private storage and immutable history

Generation appends a new independent document identity to the organisation graph.
Its existing `generated-guide` source records the exact session, unique scene
revision set and renderer/exporter version. It deliberately does **not** append or
alter a session, booking, template, exercise or scene just to attach an export.
The guide lists generated records by their source session pin, including historical
ones, separately from uploaded attachments. New filenames/list labels identify the
original booking date/revision (or an unscheduled plan) and warn that saved schedules
may differ. Legacy exports clearly say their booking match is unverified and refer
to the PDF's original provenance. Exact booking IDs remain in PDF metadata; a
date/revision label is not proof that a file matches another same-day booking.
Historical filenames, bytes and booking references are never rewritten. No new
domain-schema keys or SQL migration are needed.

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
older session/representative time after a later revision exists. Revised evidence
adds a complete session, an optional-cover pack, multiple diagrams, an explicitly
synthetic crest/partner and an unbranded fallback. V001/V002 page counts and every
actual rendered page are provided for comparison. PDF structure,
source manifest, byte limits and page sizes are tested. Poppler page captures and
text/margin checks provide actual visual evidence, including readable player labels.
V003 additionally compares optional covers and synthetic branding at identical source
pins, checks tall/square crest and wide secondary-mark containment, and verifies
pixel-identical standard sheets/normal guides against V002. The nine-page long
case remains unchanged; cover selection remains explicit.

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
