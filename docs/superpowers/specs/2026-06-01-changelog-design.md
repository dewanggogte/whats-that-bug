# Player-facing "What's New" Changelog — Design

**Date:** 2026-06-01
**Status:** Approved (design), pending implementation plan

## Goal

Add a player-facing changelog ("What's New") that shows a dated timeline of
features added to the game. Purpose is **retention/trust** — demonstrate the game
is actively maintained and growing. Friendly, player-first tone. This is distinct
from the internal `docs/DEVLOG.md`, which holds technical root-cause war-stories
and stays internal.

## Scope

In scope:
- A `changelog` Astro content collection (markdown, one file per entry).
- A full `/changelog` timeline page.
- A "What's New" homepage section showing the latest 3 entries + link to `/changelog`.
- A "What's New" footer link (site-wide reachability).
- ~7 seed entries curated from git history + DEVLOG.

Out of scope:
- Per-entry pages / permalinks (entries are too short to warrant their own URLs).
- Auto-generation from git commits (commit messages aren't player-friendly).
- RSS, email notifications, "new since last visit" badges. Not now (YAGNI).

## Components

### 1. Content collection — `changelog`

Extend `src/content/config.ts`, mirroring the existing `blog` collection:

```ts
const changelog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    date: z.date(),
    tag: z.enum(['Multiplayer', 'Daily', 'Learning', 'Modes', 'Profile', 'UI']).optional(),
  }),
});
export const collections = { blog, changelog };
```

Entries live in `src/content/changelog/`, named `YYYY-MM-DD-<slug>.md`:

```md
---
title: Multiplayer party mode
date: 2026-05-26
tag: Multiplayer
---
Challenge friends in real-time rooms — same bugs, race to identify them first.
```

The markdown body is an optional 1–2 sentence friendly description. Adding an
entry = dropping in one file. A malformed/missing `date` fails the build loudly,
which is the desired safety net.

### 2. Full page — `/changelog`

New `src/pages/changelog.astro`:
- `getCollection('changelog')`, sort by `date` descending (newest first).
- Renders a vertical timeline: accent dot + formatted date, optional tag chip,
  title, and rendered markdown body.
- Wraps in `Base.astro`; sets SEO `title` and `description`.
- Styled with existing warm/terracotta tokens (`--accent`, `--surface`,
  `--border`, `--text-secondary`, Fraunces headings).

### 3. Homepage section

In `src/pages/index.astro`:
- Frontmatter: `getCollection('changelog')`, sort desc, `.slice(0, 3)`.
- New `<!-- What's New -->` section placed **after** the "What You'll Learn"
  section, before the closing `</div>` of `.container`.
- Renders the same mini-timeline rows (date, tag chip, title) and a
  `See full timeline →` link to `/changelog`.
- Scoped CSS added to the page's existing `<style is:global>` block.

### 4. Footer link

In `src/layouts/Base.astro` footer (near the FAQ/credits area), add a
`What's New` link to `/changelog`. One line; site-wide reachability.

### 5. Seed entries

Create ~7 starter markdown files with player-friendly wording (drafts the user
will refine). Source: git `feat:` history cross-referenced with `docs/DEVLOG.md`.

| Date       | Tag         | Title                          |
|------------|-------------|--------------------------------|
| 2026-05-29 | Learning    | Wrong-answer learning cards    |
| 2026-05-26 | Multiplayer | Multiplayer party mode         |
| 2026-05-19 | Daily       | Daily Challenge, rebuilt       |
| 2026-05-18 | Modes       | Set × mode picker              |
| 2026-04-23 | Daily       | Daily Challenges launched      |
| 2026-04-17 | Profile     | Profiles, badges & avatars     |
| 2026-04-17 | UI          | Full visual revamp             |

## Data flow

Build-time only. Astro reads markdown files from `src/content/changelog/` at
build, validates against the schema, and both the homepage and `/changelog` page
call `getCollection('changelog')` in their frontmatter. No client-side fetching,
no runtime data source. New entries appear on the next deploy.

## Testing / verification

- **Build passes:** `npm run build` succeeds with the new collection and seed
  entries (validates all frontmatter dates/tags).
- **`/changelog` renders:** page lists all seed entries newest-first with tags
  and bodies.
- **Homepage section:** shows exactly the latest 3 entries in correct order with
  a working `See full timeline →` link.
- **Footer link:** `What's New` appears in the footer and routes to `/changelog`.
- **Schema guard:** a deliberately malformed entry (bad date) fails the build —
  confirms the safety net (then reverted).

## Risks & Tradeoffs

- **What could go wrong:** minimal. Build-time content collection; bad frontmatter
  fails the build loudly before deploy rather than rendering broken at runtime.
- **Alternatives considered:**
  - *Single hand-curated JSON file* — simpler, no collection, but the user chose
    markdown and it matches the existing `blog` pattern (one mental model).
  - *Per-entry pages (`[...slug]` like blog)* — rejected; entries are 1–2
    sentences, don't deserve their own URLs or the routing weight.
  - *Auto-generate from git* — rejected; commit messages need rewriting to be
    player-friendly anyway, defeating the automation.
- **Tech debt:**
  - The `tag` enum is a small maintenance point — a new category means editing
    the schema. Accepted: keeps tags consistent and styleable.
  - The mini-timeline markup is duplicated between the homepage and `/changelog`
    (~10 lines). Not worth extracting a shared component yet; revisit if a third
    consumer appears.
