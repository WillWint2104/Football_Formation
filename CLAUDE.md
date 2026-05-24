# Lineup App — Project Memory

This file is read by Claude Code at the start of every session. It defines the project's design system, conventions, and current state. Update it as the project evolves.

## What this app does

A football (soccer) team management app for coaches and analysts. Two core features in v1:

1. **Lineup Builder** — drag-and-drop tactical canvas. Users pick a formation (4-3-3, 4-4-2, etc.) and drag players from an available-squad bar onto pitch positions. Side panel shows tactical settings (gegenpressing, offside trap), tactical notes, and lineup insights (team chemistry, average rating).
2. **Roster** — table of all players with filters (squad tier, position, medical status). Each row shows player avatar, name, contract status, jersey number, position pill, availability status, and a fitness/readiness bar.

## Tech stack

- **Framework:** Next.js 15 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4
- **Components:** shadcn/ui (Radix-based, restyled to match design system)
- **Drag & drop:** `@dnd-kit/core` (for the lineup pitch)
- **Icons:** `lucide-react`
- **Data (Phase 1–3):** Local JSON in `/data/players.json`
- **Data (Phase 4):** Supabase (Postgres + Auth) — not yet integrated

## Design system

The app uses the "Apex Pitch Evolution" design language: violet primary, cyan accents, near-black tactical surfaces, light gray architectural backgrounds. Modern athletic-corporate. All color tokens are in `tailwind.config.ts` — use Tailwind classes like `bg-primary`, `text-secondary`, `bg-surface-container` instead of hardcoded hex values. **Never hardcode colors.**

### Typography

- **Headlines:** Hanken Grotesk (700/800 weight)
- **Body:** Inter (400/500)
- **Data & labels:** JetBrains Mono (for stats, jersey numbers, tabular data, ALL-CAPS labels)

Use Tailwind classes: `font-display`, `font-sans`, `font-mono`.

### Spacing & shape

- 4px baseline grid. Use Tailwind's default scale (`p-2` = 8px, `p-4` = 16px, `p-6` = 24px).
- Default rounding is 4px (`rounded`). Player avatars are always `rounded-full`. Larger containers use `rounded-lg` (8px).
- Sidebar width: fixed 280px on desktop.
- Page margin: 40px desktop, 16px mobile.

### Component patterns

- **Player tokens** (on the pitch): circular avatar with a cyan name label below. Active state = cyan glow ring.
- **Drop slots** (empty pitch positions): dashed circular outline with a `+` icon. Position label below (RB, CDM, CF, etc.).
- **Buttons:** primary = solid violet (`bg-primary text-on-primary`); secondary = ghost with 1px border (`border border-outline`).
- **Cards/panels:** white surface, 1px border (`border-outline-variant`), soft shadow on hover.
- **Tables:** zebra-striped rows, 1px row borders, monospace numerics, hover highlights the active row.

## Folder structure

```
/app
  /lineup          → Lineup builder page
  /roster          → Roster page
  layout.tsx       → Root layout (sidebar + header)
  page.tsx         → Redirects to /lineup
/components
  /ui              → shadcn/ui primitives (don't edit directly; restyle via tailwind)
  /layout          → Sidebar, Header
  /lineup          → PitchCanvas, PlayerToken, FormationSelect, AvailableSquadBar, TacticalSetupPanel
  /roster          → RosterTable, RosterFilters, FitnessBar, StatusPill
  /shared          → Avatar, PlayerCard, etc.
/data
  players.json     → Mock player data for Phase 1–3
/lib
  types.ts         → Player, Lineup, Formation, etc. type definitions
  data.ts          → Functions that read from players.json (later: from Supabase)
  formations.ts    → Formation position coordinates (4-3-3, 4-4-2, etc.)
```

## Conventions

- TypeScript strict mode. No `any`. Use `unknown` and narrow.
- Server Components by default. Add `"use client"` only when you need interactivity (drag-drop, dropdowns, state).
- Co-locate component-specific types with the component. Cross-cutting types go in `/lib/types.ts`.
- One component per file. File name matches the export (`PlayerToken.tsx` exports `PlayerToken`).
- All data access goes through `/lib/data.ts`. Components never read JSON directly. This is the seam where we swap in Supabase later.
- Accessibility: every interactive element keyboard-reachable, drag-drop has keyboard fallback, all images have alt text.

## Current state

- [ ] Phase 0: Project scaffolded, tokens wired, mock data seeded
- [ ] Phase 1: Lineup builder
- [ ] Phase 2: Roster
- [ ] Phase 3: Cross-feature integration (click roster → see in lineup)
- [ ] Phase 4: Supabase migration

Update this checklist as phases complete.

## Working with this codebase

- One feature = one branch = one PR. Don't bundle.
- After making changes, run `npm run lint && npm run typecheck && npm run build` before pushing.
- Before pushing, run CodeRabbit: `coderabbit review --plain` and fix anything it flags.
- Branch protection on `main` requires CodeRabbit pass + passing CI before merge.
- Commits should be small and conventional: `feat(lineup): add formation selector`, `fix(roster): correct fitness bar percentage rounding`.
