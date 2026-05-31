# What's New Changelog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a player-facing "What's New" changelog — a dated feature timeline at `/changelog`, surfaced via a homepage section and a footer link.

**Architecture:** A new `changelog` Astro content collection (markdown, one file per entry) read at build time via `getCollection`. A `/changelog` page renders the full timeline; the homepage renders the latest 3; the footer links to the full page. No runtime data, no per-entry pages.

**Tech Stack:** Astro content collections, Zod schema, existing `Base.astro` layout and warm/terracotta CSS tokens.

---

## Verification note

This feature is static Astro content, not unit-testable logic. The verification gate for every task is **`npm run build` succeeding** (which validates all content-collection frontmatter against the schema) plus a visual render check via `npm run dev`. There are no vitest tests for these tasks.

---

### Task 1: Register the `changelog` collection + seed entries

**Files:**
- Modify: `src/content/config.ts`
- Create: `src/content/changelog/2026-05-29-wrong-answer-cards.md`
- Create: `src/content/changelog/2026-05-26-multiplayer.md`
- Create: `src/content/changelog/2026-05-19-daily-rebuilt.md`
- Create: `src/content/changelog/2026-05-18-set-mode-picker.md`
- Create: `src/content/changelog/2026-04-23-daily-launched.md`
- Create: `src/content/changelog/2026-04-17-profiles.md`
- Create: `src/content/changelog/2026-04-17-visual-revamp.md`

- [ ] **Step 1: Add the collection to the config**

Modify `src/content/config.ts` — add the `changelog` collection definition after the existing `blog` definition, and add it to the `collections` export:

```ts
// src/content/config.ts
import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.date(),
    tags: z.array(z.string()).optional(),
    keywords: z.array(z.string()).optional(),
    image: z.string().optional(),
  }),
});

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

- [ ] **Step 2: Create the 7 seed entries**

`src/content/changelog/2026-05-29-wrong-answer-cards.md`:
```md
---
title: Wrong-answer learning cards
date: 2026-05-29
tag: Learning
---
Miss a bug? You'll now get a quick learning card with a photo and the key field marks, so the next one sticks.
```

`src/content/changelog/2026-05-26-multiplayer.md`:
```md
---
title: Multiplayer party mode
date: 2026-05-26
tag: Multiplayer
---
Challenge friends in real-time rooms — everyone gets the same bugs, race to identify them first.
```

`src/content/changelog/2026-05-19-daily-rebuilt.md`:
```md
---
title: Daily Challenge, rebuilt
date: 2026-05-19
tag: Daily
---
The Daily Challenge now draws from a hand-picked pool, so there's a fresh mystery bug every single day.
```

`src/content/changelog/2026-05-18-set-mode-picker.md`:
```md
---
title: Set × mode picker
date: 2026-05-18
tag: Modes
---
Pick any set, then choose how to play it — Classic, Time Trial, or Streak. Mix and match.
```

`src/content/changelog/2026-04-23-daily-launched.md`:
```md
---
title: Daily Challenges launched
date: 2026-04-23
tag: Daily
---
A new mystery bug every day. Build a streak and see how you stack up.
```

`src/content/changelog/2026-04-17-profiles.md`:
```md
---
title: Profiles, badges & avatars
date: 2026-04-17
tag: Profile
---
Your own profile page with an avatar, earned badges, best scores, and the genera you've identified.
```

`src/content/changelog/2026-04-17-visual-revamp.md`:
```md
---
title: Full visual revamp
date: 2026-04-17
tag: UI
---
A warmer, cleaner look across the whole game — new typography, tactile cards, and smooth round transitions.
```

- [ ] **Step 3: Verify the build accepts the collection**

Run: `npm run build`
Expected: build completes with no schema/frontmatter errors.

- [ ] **Step 4: Commit**

```bash
git add src/content/config.ts src/content/changelog/
git commit -m "feat: add changelog content collection + seed entries"
```

---

### Task 2: Create the `/changelog` timeline page

**Files:**
- Create: `src/pages/changelog.astro`

- [ ] **Step 1: Create the page**

Follow the `src/pages/blog/index.astro` pattern (Base layout, `getCollection`, sort newest-first). Each entry renders its markdown body via `entry.render()`.

```astro
---
// src/pages/changelog.astro
import Base from '../layouts/Base.astro';
import { getCollection } from 'astro:content';

const entries = (await getCollection('changelog'))
  .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());

const rendered = await Promise.all(
  entries.map(async (entry) => ({
    data: entry.data,
    Content: (await entry.render()).Content,
  }))
);

const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
---
<Base
  title="What's New — What's That Bug?"
  description="A timeline of new features and improvements added to What's That Bug — the free insect identification game."
  canonicalPath="/changelog"
>
  <div class="container changelog-page">
    <div style="text-align: center; padding: 24px 0 8px;">
      <h1>What's New</h1>
      <p class="subtitle">Features and improvements, newest first</p>
    </div>

    <ol class="changelog-timeline">
      {rendered.map(({ data, Content }) => (
        <li class="changelog-item">
          <div class="changelog-item-head">
            <time class="changelog-date">{fmtDate(data.date)}</time>
            {data.tag && <span class="changelog-tag">{data.tag}</span>}
          </div>
          <h2 class="changelog-title">{data.title}</h2>
          <div class="changelog-body"><Content /></div>
        </li>
      ))}
    </ol>
  </div>

  <style>
    .changelog-timeline {
      list-style: none;
      margin: 16px 0 0;
      padding: 0 0 0 20px;
      border-left: 2px solid var(--border);
      max-width: 640px;
      margin-inline: auto;
    }
    .changelog-item {
      position: relative;
      padding-bottom: 28px;
    }
    .changelog-item::before {
      content: '';
      position: absolute;
      left: -27px;
      top: 4px;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: var(--accent);
      border: 2px solid var(--bg);
    }
    .changelog-item-head {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 4px;
    }
    .changelog-date {
      font-size: 0.8rem;
      color: var(--text-secondary);
    }
    .changelog-tag {
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--accent);
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-full);
      padding: 2px 8px;
    }
    .changelog-title {
      font-size: 1.05rem;
      margin: 0 0 4px;
    }
    .changelog-body {
      color: var(--text-secondary);
      font-size: var(--text-sm);
      line-height: 1.5;
    }
    .changelog-body :global(p) { margin: 0; }
  </style>
</Base>
```

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: build completes; `dist/changelog/index.html` is generated.

- [ ] **Step 3: Verify the render**

Run: `npm run dev`, open `/changelog`.
Expected: all 7 entries listed newest-first (2026-05-29 at top), each with a date, tag chip, title, and one-line body; vertical timeline with accent dots.

- [ ] **Step 4: Commit**

```bash
git add src/pages/changelog.astro
git commit -m "feat: add /changelog timeline page"
```

---

### Task 3: Add the "What's New" homepage section

**Files:**
- Modify: `src/pages/index.astro` (frontmatter imports + after the "What You'll Learn" section + `<style is:global>` block)

- [ ] **Step 1: Add the import and data fetch to the frontmatter**

In `src/pages/index.astro`, the frontmatter (top `---` block) already imports `setsData` and `observations`. Add the content-collection import at the top and fetch the latest 3 entries. Add these lines:

At the top of the frontmatter, after the existing `import observations ...` line:
```ts
import { getCollection } from 'astro:content';
```

At the end of the frontmatter, before the closing `---`:
```ts
const latestChangelog = (await getCollection('changelog'))
  .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf())
  .slice(0, 3);

const fmtChangelogDate = (d: Date) =>
  d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
```

- [ ] **Step 2: Add the section markup**

In `src/pages/index.astro`, locate the "What You'll Learn" section:

```html
    <!-- What You'll Learn -->
    <div class="homepage-section">
      <h2 class="homepage-section-title">What You'll Learn</h2>
      <p class="homepage-learn-text">What's That Bug? features over 1,000 insect species...</p>
    </div>
  </div>
```

Insert the new section immediately after that section's closing `</div>` and before the `</div>` that closes `.container`:

```html
    <!-- What's New -->
    <div class="homepage-section">
      <h2 class="homepage-section-title">What's New</h2>
      <ol class="whats-new-list">
        {latestChangelog.map(entry => (
          <li class="whats-new-item">
            <span class="whats-new-date">{fmtChangelogDate(entry.data.date)}</span>
            {entry.data.tag && <span class="whats-new-tag">{entry.data.tag}</span>}
            <span class="whats-new-title">{entry.data.title}</span>
          </li>
        ))}
      </ol>
      <a href="/changelog" class="whats-new-more">See full timeline →</a>
    </div>
```

- [ ] **Step 3: Add scoped styles**

In `src/pages/index.astro`, inside the existing `<style is:global>` block, after the `.homepage-learn-text` rule at the end, add:

```css
  /* What's New */
  .whats-new-list {
    list-style: none;
    margin: 0 0 12px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .whats-new-item {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .whats-new-item::before {
    content: '';
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent);
    flex-shrink: 0;
  }
  .whats-new-date {
    font-size: 0.78rem;
    color: var(--text-secondary);
    min-width: 52px;
  }
  .whats-new-tag {
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--accent);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-full);
    padding: 1px 7px;
  }
  .whats-new-title {
    font-size: 0.9rem;
    color: var(--text);
  }
  .whats-new-more {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--accent);
    text-decoration: none;
  }
  .whats-new-more:hover {
    text-decoration: underline;
  }
```

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: build completes with no errors.

- [ ] **Step 5: Verify the render**

Run: `npm run dev`, open `/`.
Expected: a "What's New" section appears after "What You'll Learn", showing exactly the 3 newest entries (Wrong-answer learning cards, Multiplayer party mode, Daily Challenge rebuilt) with date + tag + title, and a working "See full timeline →" link to `/changelog`.

- [ ] **Step 6: Commit**

```bash
git add src/pages/index.astro
git commit -m "feat: add What's New section to homepage"
```

---

### Task 4: Add the footer link

**Files:**
- Modify: `src/layouts/Base.astro` (footer, around line 142-157)

- [ ] **Step 1: Add the link**

In `src/layouts/Base.astro`, locate the footer credits paragraph:

```html
    <p class="footer-credits">
      Photos from <a href="https://www.inaturalist.org" target="_blank" rel="noopener">iNaturalist</a> · Inspired by <a href="https://www.reddit.com/r/whatsthisbug/" target="_blank" rel="noopener">r/whatsthisbug</a>
    </p>
```

Add a changelog link line immediately after that `</p>` (inside the `<footer>`):

```html
    <p class="footer-credits">
      <a href="/changelog">What's New</a> · <a href="/faq">FAQ</a>
    </p>
```

This reuses the existing `.footer-credits` style — no new CSS needed.

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: build completes with no errors.

- [ ] **Step 3: Verify the render**

Run: `npm run dev`, open any page.
Expected: footer shows a "What's New · FAQ" line; "What's New" links to `/changelog`.

- [ ] **Step 4: Commit**

```bash
git add src/layouts/Base.astro
git commit -m "feat: add What's New footer link"
```

---

## Self-review notes

- **Spec coverage:** collection (Task 1), `/changelog` page (Task 2), homepage section (Task 3), footer link (Task 4), 7 seed entries (Task 1). All spec sections covered.
- **Type consistency:** `getCollection('changelog')` and `entry.data.{title,date,tag}` used identically in the page and homepage; `fmtDate`/`fmtChangelogDate` are page-local helpers (different formats by design — full date on `/changelog`, short on homepage).
- **No placeholders:** all entry bodies, page code, and CSS are complete.
