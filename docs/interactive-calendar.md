# Interactive calendar — PR 03

The canonical route is `/calendar`; `/team-schedule` redirects there. The existing
lineup and shared shell remain intact. Calendar is now an available navigation
destination. Session and exercise libraries remain planned.

## Behaviour and boundaries

- Month, Monday-first week and chronological day lanes show independent bookings.
  Multiple sessions on the same date retain separate IDs, types and previews.
  Month cards contain only a flat type icon and the activity/focus title, capped
  at two lines. Full names remain available through accessible labels, native
  title tooltips and the selected session preview. Times, staff, duration and
  status stay in the preview and week/day views. Month placement uses the
  booking's stored local start date. Week/day cards explicitly use the booking's
  IANA zone and include overnight continuations.
- Team/type filters, period navigation, date selection and contextual previews
  resolve only the newest booking revision and its exact pinned session revision.
- Add session creates an independent **draft** with a type, team, optional lead
  coach and schedule. It does not generate exercises or infer coaching content.
  Teams and directory coaches must already exist in saved organisations.
- Reschedule appends a new booking revision without changing session pins, staff,
  activities, documents or historical bookings. Detailed session editing follows
  separately. Scheduling uses a keyboard-accessible modal, not drag-only controls.
- Start/end wall times are resolved against the explicit zone. DST gaps are
  rejected; repeated hours require the coach to choose a UTC occurrence. End date
  is explicit for overnight bookings. Team, staff and matching field-area overlaps
  require acknowledgement; this is a warning, not an exclusive reservation lock.

## Sample versus saved data

The initial examples are synthetic November 2026 data, labelled **Illustrative
sample data — not saved**. They stay in memory, disappear on reload and are never
automatically uploaded. No localStorage, IndexedDB or service-worker persistence
is used. An unavailable backend, signed-out account or no membership is reported
explicitly. Examples are never represented as the user's saved club records.

On load the client requests `/api/organizations`, then the selected organisation's
`/snapshot`. The response must pass PR 01's complete graph validation and match the
requested organisation. Saved records replace sample mode only after validation.
Saves POST `{ expectedVersion, bundle }` through PR 02's existing authenticated
boundary; actor identity and privileged credentials remain server-side. The UI
changes saved records only after a valid incremented-version acknowledgement.

Requests time out after 30 seconds. Every failed save requires an explicit reload before further writes. This covers
409 conflicts and uncertain network failures where the server might have committed
despite losing the response. There are no automatic paid or persistence retries.
401/404 responses also remove the loaded private snapshot from the UI. A reload
or organisation switch clears the old snapshot before fetching another one.

## Verification

`npm test` includes calendar date/DST, immutable scheduling, overlap and HTTP
adapter checks alongside the existing domain and actual PostgreSQL/PGlite tests.
For local browser checks, run `npm run build` first, install Chromium with
`npx playwright install chromium`, then run `npm run test:e2e`. The committed
Playwright interactions run at 1920×1080 and 1366×768 against that production build.
CI also installs Linux system dependencies.
Local Windows runs can use `PLAYWRIGHT_CHANNEL=msedge`. No mobile test scope is added.

Browser tests cover sample selection, independent previews, filtering, view
switching, route aliases, modal focus/Escape, independent draft creation,
rescheduling, overlap acknowledgement, DST gaps/overlaps and save/reload/conflict/
401/503 paths. Saved-mode browser tests use an HTTP contract stand-in. They do
**not** establish hosted Supabase authentication or durable cloud storage.

## Deferred calendar enhancements

Keep chronological week/day cards for this PR. A separately scoped follow-up
should introduce time-proportional placement, parallel activity lanes and clearer
duration visualisation. Revisit preview expansion/collapse at 1366×768 as schedules
become denser. Neither enhancement is implemented or required for this refinement.

## Staging checklist — separate approval required

1. Obtain owner approval before provisioning a development Supabase project,
   configuring hosted credentials, applying live migrations or inviting users.
2. Follow `authenticated-persistence.md`: configure exact staging origin/callback,
   invite-only Auth, server-only credentials and the reviewed migration. Bootstrap
   two test organisations and directory teams/coaches through the operator process.
3. Verify real email sign-in, callbacks, cookie refresh, sign-out and revoked
   memberships. Confirm the browser never receives service credentials.
4. Create two independent calendar sessions on one date, assign staff, save, close
   the browser and reopen. Verify exact session pins and booking revision history.
5. Exercise two coaches saving simultaneously, lost responses, expired sessions,
   guessed organisation IDs and cross-organisation access. Confirm stale edits
   cannot overwrite newer records, and recovered views match saved data.
6. Check Sydney DST gaps/overlaps, overnight bookings and both desktop viewports.
   Retain migration backup/recovery evidence before release activation.

Remaining risks: hosted Auth/PostgREST are unverified; directory provisioning is
operator-only; full organisation snapshots retain a 10 MiB limit; overlaps are
advisory; large histories need targeted queries/writes later. There is no UI for
session-library editing, PDF attachments, diagram authoring or account invitations
in this PR. No hosted resources or manual deployments are part of this change.
