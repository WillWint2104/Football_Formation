# PR 00 — Dependency security and CI

Baseline: `f4b25585663fcc6acbe9c950f2195ddc2f828252` (verified remote `main`).
Assessment date: 25 October 2026. This change is limited to dependency maintenance,
CI and the user-approved launch sequence clarification; no coaching features,
application styling or lineup behaviour are changed.

## Remediation

| Direct package | Before | After |
| --- | --- | --- |
| Next.js | 16.2.6 | 16.4.3 |
| eslint-config-next | 16.2.6 installed | 16.4.3 |
| shadcn | 4.8.0 installed | 4.22.1 |

Next and its lint configuration are pinned to the same verified version. React
and React DOM remain at 19.2.4. Other direct package versions and application
source are preserved. Compatible transitive lockfile fixes were applied with
`npm audit fix --ignore-scripts`, without `--force` or direct major upgrades.
The final clean installation uses normal `npm ci`, with install scripts enabled.

The original full audit reported 21 affected package entries: 2 critical, 14 high,
4 moderate and 1 low. After remediation, both `npm audit --json` and
`npm audit --omit=dev --json` report **zero advisories**. This is an advisory
snapshot, not proof that no undisclosed vulnerability exists. Recheck in CI and
before release.

## Runtime versus tooling exposure

- Next.js is an application runtime dependency and was the direct critical
  finding. The current source does not import `next/image` or `next/og`, define
  Server Actions, or use `use cache`; do not claim every framework advisory was
  reachable through an existing route. Patching is still necessary before the
  planned authentication, upload and server-side features.
- shadcn is a direct production dependency because `app/globals.css` imports
  `shadcn/tailwind.css`. It was deliberately retained in `dependencies` and its
  import was preserved, rather than moving or deleting it blindly.
- The former critical `proxy-addr` and several other findings were reached in
  the dependency tree through shadcn's MCP/HTTP tooling chain. That tool server
  is not imported by the application or exposed as an application route. A
  production-install dependency path is not proof of an Internet-facing route.
  Its installed chain is nevertheless patched by this update.
- There are no remaining known advisories to waive as tooling-only. The CI audit
  fails for high/critical findings in the full dependency tree, including tools.

## CI

`.github/workflows/ci.yml` runs on pull requests and pushes to `main`, using the
Node 24 version recorded in `.nvmrc`. The checkout and Node setup actions are
pinned to verified commits. Workflow permissions are read-only, runs have a
15-minute timeout, and superseded runs are cancelled.

Checks: clean `npm ci`, `npm audit --audit-level=high`, lint, TypeScript,
`npm run test --if-present`, and normal `npm run build` (default Turbopack).
The repository currently has no test script or automated test suite: the optional
test step is a hook, not a claim of unit-test coverage. Meaningful feature tests
belong to the later implementation PRs.

The baseline and upgraded application both pass the normal local Turbopack build.
The upgraded checkout also passes clean `npm ci`, lint and TypeScript checking.
Browser regression evidence and the hosted CI/review results are reported in the
PR. No webpack fallback is used as a substitute for the required default build.

The same nine browser checks passed against independently built baseline and
patched production servers: invalid add-player form, adding a player, pointer
drag/drop to GK, slot reposition/reset, Squad/Setup tabs and notes, the existing
squad JSON import, fullscreen enter/exit, the existing Present placeholder and
removing a placed player. Neither run emitted an uncaught page error. The test
waited for modal dismissal and dnd-kit's post-drag click suppression before
continuing; these synchronization fixes did not change application source.
Matched 1440 × 1500 empty and populated lineup screenshots are pixel-identical
after transitions settle. This comparison covers those desktop states, not every
viewport or interaction.

## Review and release boundaries

The local CodeRabbit CLI is unavailable in this environment. The repository's
hosted CodeRabbit review must be read and its actionable findings addressed; a
skipped badge is not review evidence. The owner explicitly authorised that PR
review interaction. Do not treat unavailable local CLI review as a completed
review.

The live GitHub branch protection read during this work had no required status
checks configured, despite the older statement in `CLAUDE.md`. This PR does not
change repository settings. CI and CodeRabbit results must still be inspected
before requesting approval. Merge and deployment remain separately controlled.

Rollback the package manifest and lockfile together if needed, without deploying
the vulnerable old dependency baseline. The pre-existing untracked `index.html`
is excluded from this change.
