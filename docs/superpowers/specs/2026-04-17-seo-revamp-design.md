# SEO Revamp — Design Spec

**Date:** 2026-04-17
**Status:** Approved
**Prerequisite:** 2026-04-06-seo-fundamentals-design.md (implemented)
**Builds on:** seo-approach-c-content-strategy.md (planned, now superseded by this spec)

---

## Context

The game launched April 1, 2026. After 2+ weeks, Google Search Console shows 4 clicks and 28 impressions in 28 days. The site is barely indexed. Current rankings:

| Query | Impressions | Avg Position |
|---|---|---|
| r/whatsthisbug | 3 | 6.0 |
| identification des bugs | 3 | 31.7 |
| insect id | 2 | 87.0 |
| identify this bug | 1 | 19.0 |
| game about insects | 1 | 34.0 |

**Key finding from competitive research:** No polished, gamified, photo-based insect identification game exists in Google's top 10 for any relevant keyword. The results are simple text quizzes (Britannica, Sporcle), AI upload tools (buganalyzr.com), classroom activities (Wordwall), and community forums (r/whatsthisbug). The market gap is wide open.

**Known issues:**
- Domain authority mismatch — `dewanggogte.com/games/bugs` is a personal site subdirectory
- Near-zero crawlable text content — pages are mostly JS-rendered game UIs
- Canonicalization split — `/games/bugs` and `/games/bugs/` treated as separate URLs (11 + 9 impressions)
- Missing meta description on `/daily/play`
- Game modes use query params (`?set=beetles`) — not independently indexable
- Structured data only on homepage

---

## 1. Technical SEO Fixes

### 1.1 Title & Meta Description Optimization

| Page | New Title | New Description |
|---|---|---|
| `/` (homepage) | What's That Bug? — Free Insect Identification Game & Quiz | Free insect identification game with 1,000+ species. Identify bugs from real research-grade photos in this online quiz. Play daily challenges, compete on leaderboards, and test your bug ID skills. |
| `/play` | Identify This Bug — What's That Bug? | Can you identify the insect from its photo? Four choices, one correct answer. Test your bug identification skills with real research-grade photos. |
| `/leaderboard` | Today's Top Bug Identifiers — Daily Leaderboard | See today's top insect identifiers. Compete in Time Trial and Streak modes — leaderboard resets at midnight ET. |
| `/daily/play` | Daily Bug Challenge — What's That Bug? | A new mystery insect every day. Can you identify today's bug from its photo? Play the free daily insect identification challenge. |

### 1.2 Trailing Slash Canonicalization

Add `trailingSlash: 'never'` to `astro.config.mjs`. This ensures Google treats `/games/bugs/play` and `/games/bugs/play/` as the same URL. Update all `customPages` in the sitemap config to match (no trailing slashes).

### 1.3 Structured Data Additions

**All pages — BreadcrumbList:**
```json
{
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://dewanggogte.com/games/bugs" },
    { "@type": "ListItem", "position": 2, "name": "Beetles", "item": "https://dewanggogte.com/games/bugs/beetles" }
  ]
}
```

**Homepage — FAQPage** (see Section 4 for questions).

**Landing pages — VideoGame schema:**
```json
{
  "@type": "VideoGame",
  "name": "Beetle Identification Quiz — What's That Bug?",
  "description": "...",
  "genre": "Trivia",
  "numberOfPlayers": { "@type": "QuantitativeValue", "value": 1 },
  "gamePlatform": "Web Browser",
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" }
}
```

**Species pages — Article schema** with species-specific data.

### 1.4 Sitemap Expansion

Update `astro.config.mjs` sitemap config to include all new pages:
- 6 landing pages
- `/genera/` index
- All species pages (dynamic via `getStaticPaths`)
- Blog index + posts

Remove `customPages` hardcoding; let Astro auto-discover all static routes.

### 1.5 Daily Challenge — Fix Missing SEO

`src/pages/daily/play.astro` currently passes no `description` or `canonicalPath` prop to `Base`. Fix:

```astro
<Base
  title="Daily Bug Challenge — What's That Bug?"
  description="A new mystery insect every day. Can you identify today's bug from its photo? Play the free daily insect identification challenge."
  canonicalPath="/daily/play"
>
```

---

## 2. Dedicated Landing Pages

Eight new pages at flat URLs, replacing query-param routing as the primary entry points. One for each non-competitive game mode (time trial and streak remain as query params).

### 2.1 Page List

| URL | Set Key | H1 | Target Keyword |
|---|---|---|---|
| `/beetles` | beetles | Beetle Identification Quiz | beetle identification quiz |
| `/butterflies-and-moths` | butterflies_moths | Butterfly & Moth Identification Game | butterfly identification game |
| `/spiders` | spiders | Spider Identification Quiz | spider identification quiz |
| `/backyard-bugs` | backyard_basics | Common Backyard Bug Identification | common bug identification |
| `/beginners` | bugs_101 | Insect Identification Quiz for Beginners | insect identification quiz |
| `/expert` | all_bugs | Expert Insect Identification Challenge | insect identification challenge |
| `/tiny-terrors` | tiny_terrors | Tiny Terror Insects — Can You Identify Them? | scary insect identification |
| `/eye-candy` | eye_candy | Most Beautiful Insects — Photo Identification Quiz | beautiful insect quiz |

### 2.2 Page Structure

Each landing page contains:

1. **H1** — keyword-optimized (see table above)
2. **Intro paragraph** — 2-3 sentences about the category, naturally incorporating target keywords
3. **Stats line** — "X species · Y research-grade photos · Free to play"
4. **Sample photo grid** — 4-6 representative photos from the set (pulled from `observations.json` at build time)
5. **Play Now CTA** — large button, loads the game with the correct set
6. **Mode options** — links to Time Trial and Streak variants (`?mode=time_trial`, `?mode=streak`)
7. **Species list** — collapsible list of all species in the set, linking to `/species/<slug>` pages where available
8. **VideoGame structured data**
9. **BreadcrumbList structured data**

### 2.3 Backwards Compatibility

The existing `/play?set=<mode>` route continues to work unchanged. No redirects — both routes serve the same game UI. Internal links, sitemap, and social share URLs will point to the new flat URLs. Each landing page is a static content page with a "Play Now" CTA that links to `/play?set=<key>`. The landing page does NOT embed the game — it provides SEO-rich content and funnels the user to the play page. This keeps landing pages lightweight and crawlable.

### 2.4 Homepage Internal Linking

Update all links on `index.astro` to point to flat URLs:
- "Bugs 101" card → `/beginners`
- "All Bugs" card → `/expert`
- "Beetles" themed button → `/beetles`
- etc.

This distributes link equity to the new pages and signals their importance to Google.

---

## 3. Species Pages (`/species/<slug>`)

### 3.1 Content Pipeline

**Step 1 — Wikipedia fetch script** (`scripts/fetch-species-wikipedia.js`):
- Iterates all unique species in `observations.json` (1,724 species)
- For each species, fetches the Wikipedia article intro via the Wikipedia REST API (`/page/summary/<title>`)
- Falls back to genus-level Wikipedia article if species article doesn't exist
- Writes raw content to `data/species-wikipedia-raw.json`
- Structure: `{ "Aglais urticae": { "title": "...", "extract": "...", "thumbnail": "...", "wiki_url": "..." }, ... }`

**Step 2 — Claude curation** (manual, using Max plan):
- User feeds `species-wikipedia-raw.json` through Claude
- Prompt: rewrite each entry as a fun-fact-focused, skimmable summary (~150-250 words). Focus on what makes the species interesting, surprising, or distinctive. Use bold for key facts. No Wikipedia tone.
- Output saved to `public/data/species-content.json`
- This file is version-controlled and editable

**Step 3 — Astro builds species pages** from `species-content.json` + `observations.json` at build time.

### 3.2 Page Structure (`/species/<slug>`)

Slug format: slugified common name (e.g., `small-tortoiseshell`). Falls back to slugified scientific name if no common name.

Page content:
1. **H1** — Common name (scientific name in italics)
2. **Hero photo** — best photo from `observations.json` (highest `num_agreements`)
3. **Quick-reference card** — Order, Family, Genus, common names for each rank
4. **Fun facts summary** — curated content from `species-content.json`
5. **Photo attribution** — proper CC BY credit from `attribution` field
6. **Game CTA** — "Think you can identify this one? Play now →" linking to the relevant landing page
7. **Related species** — other species in the same genus, linking to their pages
8. **iNaturalist link** — "See more observations on iNaturalist"
9. **Article structured data**
10. **BreadcrumbList** — Home > Genera > [Genus] > [Species]

### 3.3 Scale

- 1,724 unique species → 1,724 pages
- Not all will have Wikipedia content. Species without curated content get a shorter page with taxonomy info, photo, and game CTA only.
- Build time estimate: Astro generates static pages efficiently; expect ~30-60 seconds for this many pages.

---

## 4. Homepage Content Enrichment

Add three crawlable content sections below the existing game mode cards on `index.astro`:

### 4.1 "How It Works" Section

```
How It Works
1. See a photo — We show you a real research-grade insect photo from iNaturalist
2. Make your guess — Pick from four possible identifications
3. Learn something new — Every round teaches you about a different species
```

### 4.2 "What You'll Learn" Section

Short paragraph:
> What's That Bug? features over 1,000 insect species photographed in the wild by citizen scientists. From common backyard beetles to rare tropical butterflies, every photo is research-grade verified. Whether you're a curious beginner or a seasoned entomologist, there's always a new bug to discover.

### 4.3 FAQ Section (generates FAQPage schema)

| Question | Answer |
|---|---|
| What is What's That Bug? | A free online insect identification game. You're shown a real photo of a bug and choose the correct identification from four options. It's like GeoGuessr, but for insects. |
| How many insects are in the game? | Over 1,000 species across 17 orders, from beetles and butterflies to spiders and dragonflies. All photos are research-grade observations from iNaturalist. |
| Is this game free? | Yes, completely free with no sign-up required. |
| How does the Daily Challenge work? | Every day, a new mystery insect is featured. You get one guess. Your streak tracks how many days in a row you've played and solved correctly. |
| Can I compete with others? | Yes — Time Trial and Streak modes have daily leaderboards that reset at midnight ET. Enter a display name to see how you rank. |

---

## 5. Genera Index (`/genera/`)

### 5.1 Index Page

- **H1:** "All Insect Genera — What's That Bug?"
- **Meta description:** "Browse all 1,100+ insect genera in the game. From Aglais to Zygiella — explore the diversity of bugs you can identify."
- **Grid of genus cards**, one per unique genus in `observations.json`
- Each card shows:
  - Genus name (bold)
  - Common name (e.g., "Tortoiseshells")
  - Representative photo (first observation in that genus)
  - Species count in the game
  - Order badge (e.g., "Lepidoptera")
- Cards link to the first species page in that genus
- **Filterable by order** — buttons/tabs for each of the 17 orders
- **Searchable** — client-side text filter
- Built entirely from `observations.json` at build time — no new data source

### 5.2 SEO Value

This single page contains 1,100+ genus names and common names as crawlable text. It targets long-tail searches like "tortoiseshell butterfly genus" or "list of beetle genera" and serves as an internal linking hub to species pages.

---

## 6. Blog (`/blog/`)

### 6.1 Architecture

**Astro Content Collections:**
- Blog posts live in `src/content/blog/` as Markdown files
- Frontmatter: `title`, `description`, `date`, `tags`, `keywords`, `image`
- Define collection schema in `src/content/config.ts`

**Pages:**
- `/blog/` — index page listing all posts (title, date, excerpt, thumbnail)
- `/blog/<slug>` — individual post page with Article structured data

### 6.2 Editorial Topic List

Save to `docs/blog-topic-ideas.md`. Research-backed list of topics targeting high-value keywords, prioritized by search volume and competition level. This list guides future content creation.

### 6.3 Initial Content

The blog launches empty (no dummy posts). The topic list provides direction. Species pages provide the auto-generated content layer.

---

## 7. File Structure

```
src/pages/
  index.astro              # enhanced homepage (content sections + FAQ)
  play.astro               # unchanged (backwards compat for ?set= links)
  leaderboard.astro        # updated title/description only
  daily/play.astro         # add description + canonical
  beetles.astro            # new landing page
  butterflies-and-moths.astro
  spiders.astro
  backyard-bugs.astro
  beginners.astro
  expert.astro
  tiny-terrors.astro
  eye-candy.astro
  genera/
    index.astro            # genera index with filterable grid
  species/
    [...slug].astro        # dynamic species pages via getStaticPaths
  blog/
    index.astro            # blog index
    [...slug].astro        # blog post pages
src/content/
  config.ts                # content collection schema
  blog/                    # markdown blog posts (starts empty)
public/data/
  species-content.json     # curated species summaries (from pipeline)
data/
  species-wikipedia-raw.json  # raw Wikipedia fetches (not deployed)
scripts/
  fetch-species-wikipedia.js  # Wikipedia content fetcher
docs/
  blog-topic-ideas.md      # editorial content roadmap
SEO.md                     # SEO soul document (principles + strategy)
```

---

## 8. Risks & Tradeoffs

| Risk | Mitigation |
|---|---|
| Build time increase (1,724 species + genera + blog) | Astro's static generation is efficient; expect ~60-90 seconds. Monitor and optimize if needed. |
| Wikipedia API rate limits during fetch | Script includes delay between requests. Run once, cache results. |
| Thin content for obscure species | Species without Wikipedia content get a short page (taxonomy + photo + CTA). Flag these for manual enrichment. |
| Trailing slash migration confuses Google | Short-term cost; Google re-indexes within 1-2 weeks. Set up proper canonicals. |
| Flat URL collisions | `/beetles`, `/spiders` etc. are specific enough. No conflict with existing routes. |
| Domain authority remains low | Technical SEO + content is necessary but not sufficient. Dedicated domain is the long-term play (user is exploring options). |
| Blog requires ongoing effort | Species pages provide automated content. Blog is supplementary, not load-bearing. Even 2-3 well-targeted posts add value. |
