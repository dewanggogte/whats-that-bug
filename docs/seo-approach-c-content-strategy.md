# SEO Approach C — Content Strategy & Advanced SEO

**Status:** Planned (next week)
**Prerequisite:** Approach B (SEO Fundamentals) must be live first

---

## 1. Clean URL Routes

**Current:** `/play?set=beetles`
**Target:** `/play/beetles/`

Requires Astro dynamic routing with `[...set].astro` or `[set].astro` in `src/pages/play/`. Each set gets its own indexable URL instead of a query parameter that Google may or may not crawl.

**Benefits:**
- Each game set becomes a distinct, indexable page
- Enables per-set meta descriptions and OG images
- Cleaner sharing URLs
- Better Google Search Console reporting per page

**Implementation notes:**
- Astro supports this via `src/pages/play/[set].astro`
- Need to handle backwards compatibility — redirect old `?set=` URLs to new clean paths
- Update all internal links (index.astro mode buttons, share URLs, leaderboard links)

---

## 2. Per-Species Pages (SEO Goldmine)

Generate static pages for each of the 1,155 species in the game database. Each page would include:
- Species name (common + scientific)
- Photo from iNaturalist (with proper CC BY attribution)
- Taxonomy breadcrumb (Order > Family > Genus > Species)
- Description/blurb (from existing data)
- Geographic distribution
- "Play a round with this bug" CTA linking to the game
- Related species (same genus/family)

**URL structure:** `/species/red-skeleton-tarantula/` or `/bugs/ephebopus-rufescens/`

**Why this is powerful:**
- 1,155 pages = 1,155 chances to rank for long-tail searches
- People searching "what is a red skeleton tarantula" or "ephebopus rufescens" would land on your site
- Each page is a funnel into the game
- The data already exists in `observations.json` and `taxonomy.json` — this is mostly a templating exercise

**Estimated traffic potential:**
- Insect species searches are low-competition, moderate-volume
- Even 10 visits/day across 1,155 pages would be 300+/month of highly targeted organic traffic
- Some species get thousands of searches/month (monarch butterfly, black widow, praying mantis)

**Implementation notes:**
- Use Astro's `getStaticPaths()` to generate all pages at build time
- Pull data from existing JSON files
- Need a slug generation strategy (common name → URL-safe slug)
- Must include CC BY attribution for each photo (photographer name + iNaturalist link)
- Consider an index page `/species/` with search/filter

---

## 3. Per-Set OG Images

Create unique OG share cards for each game set:

| Set | Card concept |
|-----|-------------|
| Bugs 101 | Beginner badge + friendly bug illustration |
| All Bugs | Globe + "1,000+ species" |
| Beetles | Beetle silhouette or photo (with CC BY credit) |
| Butterflies & Moths | Butterfly silhouette or photo |
| Spiders & Friends | Spider silhouette or photo |
| Tiny Terrors | Dramatic/scary bug aesthetic |
| Backyard Basics | Backyard/garden themed |

**Options for generation:**
- Manual: Design each in Figma/Canva (7 images, ~1-2 hours)
- Programmatic: Use `@vercel/og` or `satori` to generate at build time from a template
- Hybrid: Design a template, swap the icon/text per set

If using actual bug photos, must include CC BY attribution text on the image.

---

## 4. Blog / Content Section

Create a lightweight blog for targeting long-tail keywords. Article ideas:

**High-value keyword targets:**
- "How to identify [common insect]" — ladybugs, butterflies, beetles, etc.
- "Beetle vs bug — what's the difference?"
- "Types of spiders in [region]"
- "Insect identification guide for beginners"
- "Most commonly misidentified insects" (unique data from your game!)

**Unique content from game data:**
- "The 10 most confused insects — data from 10,000 guesses"
- "Which bugs are easiest to identify? We have the data."
- "A beginner's guide to insect orders"

**Implementation:**
- Astro has built-in content collections for Markdown blog posts
- Could start with 3-5 cornerstone articles
- Each article links to relevant game sets
- Articles become shareable Reddit content (Format B from our earlier strategy)

---

## 5. Google Search Console Setup

- Verify site ownership via DNS TXT record or HTML meta tag
- Submit sitemap URL
- Monitor indexing status, search queries, click-through rates
- Identify which pages Google is/isn't indexing
- Track keyword rankings over time

This is a manual setup step, not a code change.

---

## 6. Internal Linking Strategy

Once species pages and blog exist:
- Game results screen → link to species page for the bug you just identified
- Species pages → link to related species + game sets containing that species
- Blog articles → link to relevant species pages and game sets
- Index page → link to popular species or "featured bug of the week"

This creates a web of internal links that distributes SEO authority across the site.

---

## Priority Order

1. **Clean URL routes** — highest impact for crawlability, moderate effort
2. **Per-species pages** — highest long-term SEO value, moderate effort (data exists)
3. **Google Search Console** — quick setup, enables measurement
4. **Per-set OG images** — improves social CTR, low-medium effort
5. **Blog/content** — ongoing effort, compounds over time
6. **Internal linking** — depends on species pages and blog existing first

---

## Estimated Traffic Impact

Conservative estimate if all of Approach C is implemented:

| Source | Monthly visits |
|--------|---------------|
| Species pages (long-tail organic) | 300–1,000 |
| Blog articles (5 cornerstone posts) | 200–500 |
| Improved social CTR (per-set OG cards) | 10–20% more clicks on shares |
| Clean URLs (better indexing) | Hard to quantify, enables the above |
| **Total new organic traffic** | **500–1,500/month** |

This compounds — species pages accumulate backlinks over time, blog articles get shared, and Google gradually increases your domain authority.
