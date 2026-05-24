# Lineup App — Setup Guide (Windows)

This guide takes you from empty GitHub repo to first feature PR with automated CodeRabbit reviews. Follow it top to bottom. Do not skip steps.

---

## Part 1 — Create the GitHub repo

1. Go to https://github.com/new
2. Repository name: `lineup-app` (or whatever you prefer — these instructions assume `lineup-app`)
3. Set visibility (Private is fine for now)
4. **Don't** initialize with README, .gitignore, or license — we'll generate these
5. Click **Create repository**
6. Copy the repo URL (looks like `https://github.com/YOUR-USERNAME/lineup-app.git`) — you'll need it in Part 3

---

## Part 2 — Verify prerequisites

Open **PowerShell** (not Command Prompt — PowerShell handles longer commands better). Run each line and confirm it returns a version number, not an error:

```powershell
node --version
npm --version
git --version
claude --version
```

If any of these fail:
- Node/npm: install from https://nodejs.org (LTS version)
- Git: https://git-scm.com/download/win
- Claude Code: `npm install -g @anthropic-ai/claude-code`

Also log into Claude Code if you haven't:
```powershell
claude login
```

---

## Part 3 — Scaffold the project

Pick a folder for your projects (e.g. `C:\Users\YOU\projects`). In PowerShell, `cd` into it, then:

```powershell
npx create-next-app@latest lineup-app --typescript --tailwind --app --src-dir=false --import-alias="@/*" --no-eslint
cd lineup-app
```

When prompted:
- Use Turbopack? → **Yes**
- Customize default import alias? → already set, accept

This creates the Next.js skeleton. Now install the extra packages we need:

```powershell
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities lucide-react clsx tailwind-merge
npm install -D @types/node
```

Initialize shadcn/ui:

```powershell
npx shadcn@latest init
```

When prompted:
- Style → **New York**
- Base color → **Neutral** (we override with our own tokens)
- CSS variables → **Yes**

Then add the components we'll need:

```powershell
npx shadcn@latest add button card dialog dropdown-menu input label select separator sheet switch table tabs tooltip
```

---

## Part 4 — Drop in the project files

You should have received four files alongside this guide:

- `CLAUDE.md` → place in the **project root** (same folder as `package.json`)
- `tailwind.config.ts` → **replace** the existing `tailwind.config.ts` in the project root
- `players.json` → create folder `data/` in project root, place file there as `data/players.json`
- `SETUP.md` (this file) → place in project root for future reference

Also add fonts to your `app/layout.tsx`. Open it and replace the imports/font setup with:

```typescript
import { Inter, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const hanken = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-hanken" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });
```

And in the `<html>` tag, add the variables: `className={`${inter.variable} ${hanken.variable} ${mono.variable}`}`

---

## Part 5 — First commit & push

```powershell
git init
git branch -M main
git add .
git commit -m "chore: initial scaffold with design tokens and mock data"
git remote add origin https://github.com/YOUR-USERNAME/lineup-app.git
git push -u origin main
```

(Replace `YOUR-USERNAME` with your actual GitHub username.)

---

## Part 6 — Install CodeRabbit

1. Go to https://www.coderabbit.ai/
2. Click **Sign up with GitHub** and authorize the app
3. Pick the **Pro** plan (required for the CLI / Claude Code integration — free tier reviews PRs but won't do the local auto-fix loop)
4. When prompted to install the GitHub app, select **Only select repositories** and pick `lineup-app`
5. Install the CLI locally:

```powershell
npm install -g @coderabbitai/cli
coderabbit auth login
```

Verify it works:

```powershell
coderabbit --version
```

---

## Part 7 — Branch protection on `main`

This is what stops accidental direct pushes to main and forces everything through PRs + CodeRabbit.

1. Go to your repo on GitHub → **Settings** → **Branches**
2. Click **Add branch ruleset** (or "Add rule" depending on UI)
3. Branch name pattern: `main`
4. Enable:
   - ✅ Require a pull request before merging
   - ✅ Require status checks to pass before merging
     - Add `CodeRabbit` as a required check (it'll appear after your first PR)
   - ✅ Require conversation resolution before merging
   - ❌ Do **not** enable "allow auto-merge" — you stay as the human merge gate
5. Save

---

## Part 8 — Kick off Phase 1 with Claude Code

In PowerShell, from inside the `lineup-app` folder:

```powershell
git checkout -b feat/lineup-builder
claude
```

This opens Claude Code in your terminal. Paste this prompt verbatim:

> Read CLAUDE.md first to understand the project. Then build Phase 1: the Lineup Builder page at `/lineup`.
>
> Requirements:
> 1. Create the root layout with the fixed sidebar (Dashboard, Roster, Lineup Builder, Player Profiles, Team Schedule, Settings, Support) and a top header with "Command & Control", a search input, and notification/profile icons. The Lineup Builder nav item should show as active.
> 2. The Lineup Builder page has three regions:
>    - Center: a dark tactical pitch canvas with a grid pattern. Position drop slots (empty dashed circles with a `+` icon) according to the selected formation. When a player is dropped on a slot, replace the slot with a circular player avatar + cyan name label.
>    - Bottom: an "Available Squad" horizontal scrolling bar showing player cards (avatar, name, jersey number, position). Filter chips for ALL / DEF / MID / FWD. Read from `data/players.json` via `/lib/data.ts`.
>    - Right: "Tactical Setup" panel with a formation dropdown (4-3-3 Attack, 4-4-2, 4-3-3 Defensive, 3-5-2), toggles for Gegenpressing and Offside Trap, a Tactical Notes textarea, a Lineup Insights card (Team Chemistry %, Average Rating with progress bars), a Submit Your Team primary button, and a Clear Pitch secondary button.
> 3. Drag and drop using `@dnd-kit/core`. Dropping a player on a slot fills it. Dropping outside removes the player from the pitch. Provide keyboard accessibility.
> 4. Formation coordinates live in `/lib/formations.ts` as percentage positions on the pitch.
> 5. All colors via Tailwind tokens — never hardcode hex. Match the screenshot aesthetic: violet primary, cyan accents, near-black pitch with subtle grid, light gray architectural surfaces elsewhere.
>
> Implementation order: types → data layer → formations → static layout → drag-drop interactivity → tactical setup panel state.
>
> When done, run `npm run lint`, `npm run build`, then `coderabbit review --plain`. Fix everything CodeRabbit flags, then re-run until it passes clean. Then stop and wait for me to review.

Claude Code will go work. Let it run. It'll write the code, test it, run CodeRabbit, fix what's flagged, re-run, and stop when clean.

---

## Part 9 — Open the PR

When Claude Code finishes and the local build is green:

```powershell
git push -u origin feat/lineup-builder
```

Then on GitHub, open a Pull Request from `feat/lineup-builder` → `main`. CodeRabbit will review it automatically. If it flags more issues, ask Claude Code to fix them (it can read PR comments via the integration). When CodeRabbit passes and you're happy, click **Merge**.

Repeat the same pattern for Phase 2 (Roster), Phase 3 (integration), Phase 4 (Supabase).

---

## Troubleshooting

**`claude` command not found** → reinstall: `npm install -g @anthropic-ai/claude-code` and restart PowerShell.

**`coderabbit` command not found** → reinstall: `npm install -g @coderabbitai/cli` and restart PowerShell.

**Tailwind classes not applying** → make sure `tailwind.config.ts` is in the project root, not in a subfolder. Restart `npm run dev`.

**Fonts not loading** → confirm the font variables are added to both the `next/font` imports and the `<html className>` in `app/layout.tsx`.

**CodeRabbit review takes 7–30 minutes** → that's normal for the first run on a large changeset. Use `coderabbit review --plain uncommitted` to scope to uncommitted changes only and keep iterations fast.

---

## Talking to me (Claude) about planning vs. Claude Code about coding

- **This chat with me** = planning, design decisions, "what should we build next", reviewing what Claude Code produced, deciding on tradeoffs.
- **Claude Code in your terminal** = actually writing files, running builds, executing CodeRabbit, fixing flagged issues.

Always paste the relevant files or PR diff back here when you want me to weigh in on the output. I don't see what Claude Code is doing in your terminal — bring me into the loop by sharing what it produced.
