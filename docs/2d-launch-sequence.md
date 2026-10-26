# 2D-first implementation sequence

PR 00 (dependency security and CI) was approved and merged as GitHub PR #5.
PR 00A (shared application shell) was approved and merged as GitHub PR #6.
PR 01 (shared domain models and validation) was approved and merged as GitHub PR #7.
PR 02 (authenticated persistence) is authorised for implementation and review,
but not merging or deployment. Each later PR needs its own approval. No manual deployment,
paid service or hosted backend provisioning is authorised by the roadmap.

| Milestone | PRs | Deliverable |
| --- | --- | --- |
| A — Working coaching planner | 00, 00A, 01–05 | Security/CI, shared shell, shared models, authentication/persistence, calendar, independent sessions, coaches, templates and private PDF attachments |
| B — Diagrams and coaching documents | 06–07, 09 | Shared static 2D renderer, adaptive framing, saved diagram editing and illustrated multi-page PDFs |
| C — Animation and launch readiness | 08, 10–11 | Staged animations, fullscreen presentation, integration and release verification |

## PDF dependency adjustment

PR 09 depends on PR 05 (guides/private documents) and PR 07 (saved static diagrams),
including PR 06's shared renderer. It does **not** depend on PR 08's advanced
animation authoring. Its first acceptance gate exports the saved static scene
revision into a readable guide, without inventing an animation timeline.

PR 08 can subsequently extend the same versioned export snapshot with explicit
selected-stage times and evaluated animation frames. That extension needs its own
acceptance checks; the existence of a static PDF is not proof of animation export.

The saved-session model must distinguish an immutable reusable template version
from a dated scheduled session instance. Applying a template creates an independent
snapshot. Scene versions follow the same rule. Preview, guide and PDF resolve the
same saved session/scene revision rather than mutating the original template.

Preserve the approved Football Formation identity, A calendar palette and B
tactical contrast. This roadmap does not authorise a visual redesign. V013, 3D
players, stadiums, 3D cameras and Meshy work remain paused. Advanced director roles,
bulk session JSON import and natural-language authoring remain outside launch scope.

## Desktop-first scope and PR 01 boundary

Prioritise 1920 × 1080 desktop, 1366 × 768 laptop, larger monitors and fullscreen
mouse/keyboard workflows. Preserve the responsive shell already implemented;
tablet/mobile-specific design, controls and testing are deferred indefinitely.
This update supersedes mobile/narrow-screen optimization gates in earlier proposals.

PR 01 introduces models and validation only; the pure animation evaluator proposed
in the original audit moves to PR 06. No calendar UI, persistence implementation,
authentication, PDF generation or tactical editor is included. See
`shared-domain-models.md` for the schema and future storage obligations.
