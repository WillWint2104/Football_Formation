# Coaching save conflict recovery

A stale expected version is a business conflict, not a retryable database serialization failure. On staging's PostgREST 14.18, the old `40001` exception kept a losing RPC in a server-side retry loop. See the [Supabase incident guidance](https://supabase.com/kb/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions).

## Narrow correction

`20261031115109_coaching_revision_conflict_pt409.sql` replaces the existing `save_coaching_bundle(text,uuid,bigint,jsonb)` function in place. Only the deterministic stale-version exception changes to `PT409`. The row locks, membership checks, validation, immutable revisions, function identity, owner, grants, `SECURITY DEFINER` and empty search path remain intact. The mapper accepts both PT409 and legacy 40001 during rollout. No UI or Auth behaviour changes.

The original three migrations are unchanged. Tests compare the installed function before/after and its owner, ACL, security mode, search path and OID. Existing database tests exercise the corrected function's permissions, isolation, history, stale writes and rollback.

## Client retry evidence

The locked `@supabase/supabase-js` version is 2.118.0. Its PostgREST fetch policy enables retries by default, but only for GET/HEAD/OPTIONS on network failures or HTTP 503/520 (up to three retries). POST RPCs are not retried by that policy. Local tests use the actual SDK and repository: success, PT409/409, legacy 40001/500, 503, 520 and transport rejection each cause one POST send. GET 409 sends once; GET 503 sends four times with retries enabled and once with `.retry(false)`.

These tests distinguish client retry policy from the separate PostgREST server loop. They use mock transports and cannot prove hosted API behaviour. No production retry settings or dependencies are changed.

## Independent response collection

`scripts/staging/independent-response-collector.mjs` is an operator utility, not an application dependency or hosted test runner. Importing it performs no network, filesystem or database operations. Callers supply exactly two explicitly approved send functions and a safe-label journal callback. Each send receives an AbortSignal and is invoked once; the collector never retries.

Each response has its own deadline (30 seconds by default, configurable up to 60 seconds), covering headers and body consumption. A hard race bounds even transports that ignore abort. Status is retained if the body times out. Reporting failure is flagged without losing either response. Do not pass unbounded journal callbacks. Abort or timeout does **not** prove a server transaction stopped or failed to commit; late results do not overwrite the recorded result.

Only safe labels, status, timings, attempt count, completion category and a strictly validated `{version}` acknowledgement are returned. Raw URLs, headers, cookies, tokens, response bodies and provider messages are never reported. Bodies are capped at 4096 bytes. Supply labels without personal data or secrets.

Reconcile HTTP evidence independently from authoritative database evidence. Acceptance requires a completed 200/409 pair, the matching version acknowledgement, exactly one new target snapshot, a one-step target version increase, unique snapshot identities and preservation of all previous snapshot hashes. A lost response after a committed write remains inconclusive. A journal failure must be repaired before presenting durable evidence; it does not justify replaying a write.

## Review and hosted application gates

This PR does not apply its migration to hosted Supabase. Do not merge, push a hosted migration, repair migration history, replay the failed request, reset fixtures or make new hosted D writes without the separate owner approvals.

After PR acceptance and merge, separately approved execution must inspect the migration list and use official CLI `db push` to preserve the new version identifier. Verify only the new migration is pending, then apply it once and compare snapshots, security metadata and the original migration ledger before/after. Stop on uncertainty. Do not automatically retry a failed migration. A forward correction is preferable to reverting to the known retryable error; any rollback requires independent review and approval.

Resume the final hosted concurrency test from the preserved Amber version 3 and Cobalt version 1, using new requests and the independent collector. Capture both HTTP responses and reconcile database history. Do not declare D complete from local tests.

## Required separate pre-release follow-up

Tracked separately in [issue #17](https://github.com/WillWint2104/Football_Formation/issues/17): `save_presentation` in `202610280001_presentations.sql` also raises `40001` for deterministic version conflicts. It requires its own reviewed additive migration, mapper compatibility, permission/history regression tests and bounded hosted conflict verification before release. It is deliberately unchanged in this PR. Do not run a hosted stale-presentation probe while the retryable code remains.

The remaining sequence is D acceptance, separately approved minimal E staging integration, a generic JSON Session Designer, then reusable organisation branding. Import and branding contracts remain separate from the strict persisted domain model.
