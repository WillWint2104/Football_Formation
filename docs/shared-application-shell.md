# PR 00A — Shared application shell

Base: merged PR #5, `f4f5b9f`. This aligns the surrounding application interface;
it does not implement the planned coaching workspaces or rewrite the lineup.

## Shared identity and surfaces

V008 Direction A supplies the shell palette: navy `shell`, panel and edge layers,
light text, muted labels and a gold accent. These values live in the existing
Tailwind v4 theme, not in individual components. Primary shared buttons use the
gold accent with navy text through a project-owned `.application-shell` control
variant in globals.css. It scopes primary tokens to the primitive's public
`data-slot="button"` boundary, including portalled controls. Vendor primitives,
action handlers and tactical entity tokens remain unchanged. Hanken Grotesk,
Inter and the existing monospace labels are retained.

The tactical authoring surface stays light. Existing pitch imagery, cyan field
guides, position colours and selection glow remain untouched. The original
renderer still has a dense grid baked into the pitch image; optional metric grids,
Direction B field contrast and flat numbered markers belong to later tactical
integration. No claim is made that this shell change implements those features.

Desktop uses a 240 px sticky sidebar and one contextual header. Below 1024 px the
same navigation is rendered inside the existing accessible Sheet primitive, with
modal focus handling, Escape/close controls and close-on-navigation. The toolbar
wraps on narrow screens. Main content has one responsive padding layer, a bounded
width and a keyboard skip link; nested lineup margins no longer waste space.

Legacy ELITE TACTICAL / Premier League Ops / Command & Control branding and the
unwired search, analytics, notifications, Quick Strategy and Support controls are
removed from the shared shell. No substitute authentication or fake user menu is
introduced. Existing modal/panel primitives and light surfaces are preserved.

## Navigation and route mapping

| Global workspace | Route now | State |
| --- | --- | --- |
| Calendar | `/calendar` (`/team-schedule` redirects) | Interactive calendar; sample/saved modes documented in `interactive-calendar.md` |
| Sessions | No route exposed | Planned, noninteractive navigation entry |
| Exercise Library | No route exposed | Planned, noninteractive navigation entry |
| Tactics | `/lineup` | Working lineup builder |
| Squad | `/roster` | Existing placeholder, explicitly Planned |
| Settings | No route exposed | Planned, noninteractive navigation entry |

Within Tactics, Lineups links to `/lineup`; 2D Editor and 2D Presentation are
noninteractive Planned entries. The global navigation is not duplicated inside
that workspace. No 3D controls are exposed. The existing canvas Present handler
is preserved and now has a visible Planned badge; it still gives the same
coming-soon message, not a functioning presentation.

Existing `/`, `/lineup`, `/team-schedule`, `/roster`, `/player-profiles` and
`/dashboard` routes remain intact. `/` still redirects to `/lineup`.
`/player-profiles` selects Squad in the shell; the legacy dashboard has neutral
Coaching workspace context. No new broken `/settings` or `/support` link is shown.
Future canonical routes can be added with aliases when their features exist.

## Preserved behaviour and evidence

No drag/drop calculations, sensors, slot coordinates, formations, player import
validation, squad state, reset or fullscreen code is changed. `PitchCanvas.tsx`,
`PitchSlot.tsx`, `PlayerCard.tsx`, `ImportSquadDialog.tsx`, formation data and player
display semantics remain byte-for-byte unchanged from the base.

Desktop before/after uses 1440 × 1100, tablet 768 × 1024, and mobile 390 × 844.
The shell must not create horizontal document overflow. Mobile navigation is
checked for open/close, Escape, trigger focus and route-change dismissal. The
existing nine lineup browser checks are rerun against the aligned production
build; these are local regression checks, not a new committed unit-test suite.

## Explicit deferrals

- Calendar scheduling, session/exercise libraries, templates and coach records.
- Authentication, persistence, file storage, PDF uploads and PDF generation.
- Shared roster integration and new formation selection behaviour.
- Optional grid, world coordinates, markers, equipment, areas, snapping and paths.
- Animation authoring, a functioning Present mode and tactical scene persistence.
- Replacing/reworking the pitch renderer, including its dense small-screen tokens.
- 3D, stadiums, Meshy and advanced permissions.

PR 00A needs owner review before merging. Existing Vercel repository automation
may create branch previews; no separate manual deployment is part of this work.
