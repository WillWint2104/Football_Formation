# Local JSON Session Designer

Run `npm ci` once if dependencies are not installed, then `npm run dev`. Open
<http://localhost:3000/session-designer>. There are no required credentials or
hosted services. Session Designer is also in the main navigation.

For a production-mode local preview:

```sh
npm run build
npm run start -- --hostname 127.0.0.1 --port 3000
```

1. Paste JSON, drop a `.json` file, browse, or load the five-activity example.
2. Validate and review the activity list, then explicitly open the imported plan.
   Acceptance replaces the current browser draft; download the old plan first to keep it.
3. Use the existing session/activity fields to edit, add, remove and reorder activities.
4. Add an optional club name, PNG/JPEG crest and HEX/picker colours.
5. Open Branded preview. Print / Save as PDF invokes the browser's print dialog.
   Enable background graphics to include filled club colours.
6. Download JSON to save the editable content and embedded logo together. Reimport
   it in another browser/device to reconstruct the same plan.

## Portable contract

The separate `football-formation-session` v1.0 contract uses a `session` object
and optional `branding`. It is **not** a domain bundle and contains no required
organisation, team-record or account identity. `toSessionContent` adapts it to
the existing strict `sessionContentSchema`. The shared `SessionContentFields`,
`ActivitySequence`, `ExerciseFields`, `cleanExercise` and timing utilities are reused.
Existing saved revisions, persistence APIs and tactical coordinates are unchanged.

## Focused coaching workspace (C2)

Use **Overview** to review objectives, the running order, separate planned/known
durations and the equipment summary. Select an activity there or in the numbered
rail to edit it. The rail and selected activity scroll independently. With a rail
button focused, Up/Down and Home/End select practices; ordinary Tab navigation
and the explicit Previous/Next and reorder buttons remain available. Arrow keys
inside a text or number input keep their normal editing behavior.

Setup & Equipment, Delivery and Coaching Guidance retain the existing fields.
Coordinate origins are under **Advanced field controls**. Session details remain
available below the activity workspace and through **Edit session details** in
Overview. **Club Branding** opens a secondary panel; close it or press Escape
inside it to return focus to its toggle. Closing never clears its values.

Equipment summaries compare the largest known per-activity quantities (including
repeated names within a practice); they do not certify the kit required by
parallel groups. Unknown quantities remain explicit. Elapsed times after an
untimed activity remain unknown. Portable v1 still has no staff/venue/booking
fields and no scene geometry.

Browser print now uses compact activity blocks and delivery/coaching columns.
Pagination follows content rather than imposing a page per activity or a fixed
three-page limit. Long instructions continue in normal flow; the minimum body
size remains 9.5 pt. Empty optional coaching sections do not reserve blank space.

- [Field reference and minimum JSON](../public/samples/session-designer-contract.txt)
- [Five-activity possession example](../public/samples/session-designer-possession.json)
- [Recovery example without branding or diagrams](../public/samples/session-designer-recovery.json)

Missing facts remain null/empty and display as unknown/not specified. Planned
session duration is independent from known activity minutes. A mismatch is shown
in the preview; the app does not silently invent timings. Only one explicit
contract adapter is supported; future legacy adapters can target it independently.

## Bounds and recovery

JSON and the single current browser draft are each limited to 2 MB; at most 100
activities, 20 diagram references per activity, and bounded text/equipment arrays.
Drafts are retained for 30 days in this browser's local storage. Incomplete edits
are recoverable, while import/export/print require valid completed fields. Quota,
storage denial, corrupt/expired drafts and conflicting tabs are reported. A draft
is never described as cloud-saved. Download JSON is the portable backup.

Uploads accept decoded PNG/JPEG up to 4 MB, at most 4096 pixels on either edge and
16 megapixels. They are re-encoded to at most 512 pixels per edge/512 KB, preserving
aspect ratio and PNG alpha. Imported embedded images receive signature, dimension,
size and actual browser-decoding checks. External image URLs and SVG are rejected.

## Deliberate first-increment limits

- One local current draft; keep multiple plans as downloaded JSON files.
- No calendar booking, coach assignment, cloud save or authenticated attachment.
- Tactical references are retained/editable pins, not embedded/resolved scenes.
- PDF output uses browser print, not the existing authenticated PDF-export service.
- No Keynote/PDF extraction, mobile optimisation, new services or database changes.

## Verification

`npm test` includes the portable-contract, branding and draft tests.
`npm run build && npm run test:e2e -- session-designer.spec.ts` runs the actual
browser workflow at 1920×1080 and 1366×768, saves screenshots, downloaded round-trip
JSON and Chromium-produced print PDFs. The suite intercepts the native print dialog
only to verify invocation, then exercises Chromium's real print engine with
`page.pdf`. It makes no hosted API calls. Run the complete existing test suites
before reviewing the PR.
