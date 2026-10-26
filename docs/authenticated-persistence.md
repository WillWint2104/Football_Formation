# Authenticated persistence foundation — PR 02

PR #7 was merged at `75b92d3`. This change adds Supabase Auth integration,
tenant-scoped PostgreSQL storage and an authenticated server boundary. It does not
provision a hosted service, migrate a live database or implement the calendar UI,
PDF generation, file uploads, tactical editing, advanced roles or a shell redesign.
The lineup continues using its existing mock-data path; it is not silently migrated.

## Investigation and prerequisites

No backend environment file, Supabase project binding, local Docker/Postgres runtime
or existing migration was present. Supabase remains the provider proposed by the
approved launch plan. No hosted project was created, linked, inspected or billed.
Only publicly available packages and documentation were used.

Copy `.env.example` to the ignored `.env.local` only after a backend is approved:

| Server environment          | Meaning                                                          |
| --------------------------- | ---------------------------------------------------------------- |
| `APP_ORIGIN`                | Exact HTTPS application origin; HTTP loopback is allowed locally |
| `SUPABASE_URL`              | Approved project's HTTPS endpoint or local loopback URL          |
| `SUPABASE_PUBLISHABLE_KEY`  | Publishable key, or legacy **anon** JWT; never a privileged key  |
| `SUPABASE_SERVICE_ROLE_KEY` | Server secret, or legacy service-role key; never `NEXT_PUBLIC_*` |

Configuration validates key roles to catch accidentally privileged read clients.
It is lazy, so an unconfigured checkout still builds and serves the existing lineup.
Persistence endpoints report a redacted 503 and `/login` disables sign-in while
unconfigured. This is not evidence of a live authenticated deployment.

## Identity and isolation

`/login` requests an email sign-in link for an **existing** Auth account, with
`shouldCreateUser: false`. It returns the same notice for absent accounts/provider
failures. The callback supports PKCE codes and invited/magic-link token hashes,
uses a configured canonical origin, and redirects only to fixed local destinations.
It ignores caller-supplied redirect targets. Sign-out affects this browser only.

Every persistence request calls the Auth server's `getUser()` before data access.
The application never authorizes from `getSession()`, unverified JWT claims or a
request-body actor ID. Clients are created per request. SSR cookies are HTTP-only,
SameSite=Lax and secure in production; writable Route Handlers/Server Actions persist
refreshes before response headers are committed. No Server Component refreshes
cookies, so the existing shell requires no auth proxy or global route guard.

Reads use the caller's JWT and publishable key. RLS restricts organizations,
snapshots and every domain table to active membership. Membership enumeration is
limited to the caller's own memberships. Anonymous reads see no rows. Missing and
inaccessible organizations share the same public 404 behavior.

Authenticated/anonymous database roles have **no write privileges**, no self-enrolment
path and no access to the write RPC. Only a server-only secret client executes
`save_coaching_bundle`. Its actor argument comes from verified `getUser()`, and the
function checks/locks active membership again. Never accept that actor from a caller.
The privileged key is a high-trust server secret: SQL RPC access with that key is
not a public API and is not a replacement for domain validation. Keep it outside
client bundles, logs, URLs and test fixtures; rotate it if exposed.

The owner/member distinction is reserved for provisioning; both active roles can
read/save coaching content. No director hierarchy or advanced permission UI exists.

## Storage and revision contract

`organizations` holds a name and optimistic concurrency version.
`organization_memberships` links existing Auth users to clubs. Current directory
rows live in `teams`/`coaches`; immutable JSONB revisions live in `calendar_events`,
`session_revisions`, `template_revisions`, `exercise_revisions`, `scene_revisions`
and `document_revisions`. Opaque PR 01 IDs are scoped by organization. Documents are
metadata only; this PR creates no bucket or signed-download/upload functionality.

Membership rows have stable IDs distinct from Auth user IDs. A coach's optional
`membershipId` must resolve inside that same organization; the save RPC rejects
missing or cross-club links. Revocation marks membership inactive and retains its
identity for historical references.

An organization save is an atomic complete PR 01 bundle, rather than separate HTTP
writes that could leave dangling references. A full immutable `organization_snapshots`
row records each successful save, including directory state. This is the first
correctness boundary for the early planner; large per-record query/edit APIs can
follow without changing the record identity/revision contracts.

1. Validate the complete version-1.0 graph and 10 MiB limit before privileged access.
2. Lock active membership and the organization generation in PostgreSQL.
3. Reject an obsolete `expectedVersion` with a 409 conflict; never silently overwrite.
4. Preserve every previously saved identity/revision. Existing revision payloads
   cannot change; revised sessions/events/templates/scenes append a new revision.
   Directory rows can change but cannot disappear. Cancel events explicitly.
5. Write domain rows, a new immutable snapshot and the incremented organization
   version in one transaction. Any error rolls back the complete save.

`GET` reads one explicit snapshot version and validates the stored graph again.
It can safely return an older consistent snapshot if another save finishes between
the two read queries. A new authorized organization starts at version 0 with an
empty validated bundle. Corrupt stored data is rejected as a backend failure.
The API never caches private responses. Imported JSON remains subject to the same
schemas; no bulk import UI or schema migration is implied.

SQL enforces tenant identities, immutable rows/history retention, uniqueness,
membership, privileges and optimistic concurrency. Zod enforces the complete PR 01
semantic graph at the server write/read boundary. Operators holding the privileged
database credential can bypass the HTTP validator; do not use the private RPC to
write arbitrary data. Database ownership/service secrets are not end-user capabilities.

## HTTP contract for the next calendar milestone

- `GET /api/organizations`: list only the signed-in user's clubs.
- `GET /api/organizations/:organizationId/snapshot`: `{ version, bundle }`.
- `POST` to that snapshot endpoint: `{ expectedVersion, bundle }`; success returns
  `{ version }`. The strict envelope rejects caller-supplied actor/membership fields.
- POST requires `Content-Type: application/json` and `Origin` equal to `APP_ORIGIN`.
  Bodies are capped while streaming, even without an honest Content-Length.
- 400 invalid graph/history; 401 signed out; 403 cross-origin; 404 missing/inaccessible
  club; 409 stale version; 413 too large; 415 wrong type; 503 unavailable/corrupt backend.

This endpoint does not generate missing IDs, revision numbers or timings. Future
calendar commands must preserve history, allocate stable IDs, append revisions,
then submit the complete graph with the version they loaded. On 409, reload and
reconcile the user's changes; automatic retries must not overwrite someone else's work.

## Migration and account provisioning (operator steps, not performed)

After explicit hosted-resource/cost approval:

1. Create/select an approved Supabase project and review its region, plan, backup
   retention, email limits and costs. No CLI linking or deployment is authorized here.
2. Review and apply `supabase/migrations/202610260001_coaching_persistence.sql` on a
   fresh development/staging database first. Supabase must already provide `auth.users`,
   `auth.uid()`, and the `anon`, `authenticated`, `service_role` roles. Apply as the
   migration owner, not an end-user key. Keep `private` outside exposed API schemas.
3. Disable public account registration. Invite/create the initial existing Auth user
   through the approved operator workflow. Configure the site URL and exact callback
   allowlist, email delivery and the magic-link/invite templates for `/auth/callback`.
   PKCE links must be opened in the requesting browser; token-hash templates must use
   the documented `email`/`invite` type. Do not send arbitrary `next` URLs.
4. Bootstrap the organization and owner membership with
   `supabase/admin/bootstrap_organization.sql` through a privileged operator connection.
   Add later invited members explicitly; no public self-enrolment is implemented.
5. Add server environment values to an approved environment. Verify sign-in, refresh,
   logout and save/reopen with two real accounts in different clubs and a second
   browser. Check direct PostgREST denial and revoked membership as well.
6. Review that staging evidence before enabling these features in a deployment.

Applying this PR to `main` alone does not apply database migrations or create data.
Existing repository Vercel automation may still build branch previews; no manual
deployment or environment/hosted-service changes have been made.

## Rollback, backup and recovery

Before any live schema change, export database roles/policies and all organization
and domain tables with an approved PostgreSQL backup. Secure those backups as
private coaching data. Do not treat a JSON fixture as a production backup.

For an empty disposable database only, the rollback file refuses to run if **any
organization or saved snapshot exists**. It removes only this foundation's tables
and functions; Auth users and the shared `private` schema remain. Re-application is
tested. Never edit/drop saved revision rows or disable their immutable triggers to
roll back a live app. Roll back application code separately and use a forward
database migration with an approved, tested restore procedure for live data.

No destructive rollback or hosted restore was executed. There are no uploaded
objects in this PR; private file backup/restore belongs to the document milestone.

## Verification and its limits

`npm test` includes the original 23 domain tests plus actual PostgreSQL (PGlite)
execution of the production migration, RLS/privilege checks, two-club guessed-ID
reads, blocked self-enrolment/RPC access, revocation, atomic stale/history failures,
append-only revisions, guarded rollback/re-application and file-backed save/reopen
across separate processes. Synthetic Auth roles/claims emulate PostgREST's database
context; they do not verify Supabase Auth token signatures.

HTTP/auth tests check verified identity, invitation-only requests, CSRF/origin checks,
streaming limits, strict envelopes, redacted failures and read validation. Actual
Supabase SDK transport tests verify the user Auth endpoint, organization/version
filters and separation of read keys from the privileged write RPC. SDK fetches are
mocked; no test sends an email or calls a hosted project.

These tests prove the checked-in SQL and application boundary, not hosted Supabase
configuration, real email delivery, real-browser refresh-cookie behavior or a live
PostgREST deployment. Those require the staged provisioning gate above. Embedded
Postgres uses one connection; production multi-connection contention/load testing
is also a staging responsibility. Existing lineup regressions and desktop checks
remain separate from the persistence test count. Mobile testing stays deferred.

References: [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client),
[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[passwordless email](https://supabase.com/docs/guides/auth/auth-email-passwordless),
[PGlite filesystems](https://pglite.dev/docs/filesystems).
