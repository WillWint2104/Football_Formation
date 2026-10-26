# 2D-first implementation sequence

Only PR 00 (dependency security and CI) is currently authorised for implementation.
Each later PR needs its own approval. No merge, deployment, paid service or hosted
backend provisioning is authorised by the roadmap.

| Milestone | PRs | Deliverable |
| --- | --- | --- |
| A — Working coaching planner | 00–05 | Security/CI, shared models, authentication/persistence, calendar, independent sessions, coaches, templates and private PDF attachments |
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
