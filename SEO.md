# SEO Soul Document — What's That Bug?

This document is the authoritative SEO strategy guide for What's That Bug?. It captures principles, competitive positioning, keyword strategy, and tactical guidance that should inform every code change, content decision, and architectural choice touching discoverability.

**Read this before making any change that affects:** page titles, meta descriptions, URLs, page structure, content, structured data, internal linking, or sitemap configuration.

---

## The Positioning

What's That Bug? is the only gamified, photo-based insect identification experience on the web. It is not a text quiz. It is not an AI upload tool. It is not a classroom worksheet. It occupies an uncontested niche: **the GeoGuessr of insect identification**.

Every SEO decision should reinforce this positioning. We are not competing with buganalyzr.com (AI identification), whatsthatbug.com (community Q&A), or Sporcle (text trivia). We are creating a new category. When someone searches "insect identification game," we should be the obvious, only real answer.

---

## Core Principles

### 1. Every page must earn its URL

No page should exist solely for SEO. Every page must provide genuine value to a visitor: teach them something, let them play something, or help them find something. Google is sophisticated enough to detect thin content. Our advantage is that we have rich data (4,000+ research-grade photos, 1,700+ species, full taxonomy) — we should surface it in ways that are genuinely useful.

### 2. Content before keywords

Write for humans first. If a page title reads awkwardly because we stuffed a keyword in, the keyword loses. Natural language that happens to contain target keywords will always outperform mechanical keyword insertion. The best SEO content is content someone would bookmark.

### 3. The game is the conversion

Unlike most sites where "conversion" means a signup or purchase, our conversion is getting someone to play. Every content page (species, blog, genera) should have a clear, natural path into the game. Not aggressive CTAs — just a logical "now try identifying this one yourself" moment.

### 4. Internal linking is architecture

Links between pages are not decoration. They are how Google understands site structure and distributes authority. Every species page should link to its genus, its order's landing page, and related species. The genera index links to species. Landing pages link to species within their set. The homepage links to everything. This web of connections is more valuable than any single page's optimization.

### 5. Structured data is not optional

Every page type has a schema.org type. Use it. This is how we get rich results (star ratings, FAQ dropdowns, breadcrumb trails) that dramatically increase CTR even at the same ranking position.

| Page Type | Schema |
|---|---|
| Homepage | WebApplication, FAQPage |
| Landing pages | VideoGame |
| Species pages | Article |
| Blog posts | Article |
| Genera index | CollectionPage |
| All pages | BreadcrumbList |

### 6. One URL, one intent

Every page targets one primary search intent. Don't make a page that tries to rank for both "beetle identification quiz" and "how to identify beetles" — those are different intents (play vs. learn). Make two pages and link them to each other.

### 7. Measure what matters

Track these metrics, in this order of importance:
1. **Organic impressions** — is Google showing us at all?
2. **Average position per keyword** — are we climbing?
3. **Click-through rate** — are our titles/descriptions compelling?
4. **Organic clicks to game** — is SEO traffic actually playing?

Vanity metrics (total page views, bounce rate in isolation) are distractions.

---

## Keyword Strategy

### Primary Keywords (Target: Top 10)

These are the keywords we should own. They have clear game/quiz intent and low competition:

| Keyword | Priority | Target Page |
|---|---|---|
| insect identification game | #1 | Homepage |
| bug identification quiz | #2 | Homepage |
| insect identification quiz | #3 | `/beginners` |
| guess the bug game | #4 | Homepage |
| bug guessing game | #5 | Homepage |
| insect quiz online | #6 | Homepage |
| what's that bug game | #7 | Homepage |

### Secondary Keywords (Target: Top 20)

Category-specific keywords with moderate search volume:

| Keyword | Target Page |
|---|---|
| beetle identification quiz | `/beetles` |
| butterfly identification game | `/butterflies-and-moths` |
| spider identification quiz | `/spiders` |
| identify insects from photos | Homepage |
| common bug identification | `/backyard-bugs` |
| daily insect challenge | `/daily/play` |

### Long-Tail Keywords (Target: Top 10 via content)

Species and genus names that drive targeted traffic:

- "[species common name] identification" → `/species/<slug>`
- "what is [species common name]" → `/species/<slug>`
- "[genus] insects" → linked from `/genera/`
- "how to identify [order]" → blog posts
- "[order] identification guide" → blog posts

### Keywords to Monitor But Not Chase

These are high-volume but dominated by established players:

| Keyword | Dominant Player | Our Angle |
|---|---|---|
| what's that bug | whatsthatbug.com | Add "game" modifier; pursue own domain |
| identify insect from photo | pictureinsect.com, buganalyzr.com | We're a game, not a tool |
| r/whatsthisbug | Reddit meta-sites | Already ranking #6; mention subreddit inspiration in content |
| insect identifier | AI tools | Different intent — don't compete here |

---

## Technical SEO Standards

### URL Rules

- **Flat structure for game pages:** `/beetles`, `/spiders`, not `/play/beetles`
- **Hierarchical for content:** `/species/small-tortoiseshell`, `/blog/how-to-identify-beetles`
- **No trailing slashes:** Enforce via `trailingSlash: 'never'` in Astro config
- **Slugs from common names:** Use slugified common name, fall back to scientific name
- **No query params for indexable content:** If Google should index it, it gets its own URL path
- **Canonical URLs on every page:** Always set via the `canonicalPath` prop in Base.astro

### Title Tag Formula

```
[Primary Keyword / Page Topic] — What's That Bug?
```

Keep under 60 characters. The brand name goes last. The keyword goes first. Examples:
- "Beetle Identification Quiz — What's That Bug?"
- "Small Tortoiseshell (Aglais urticae) — What's That Bug?"

### Meta Description Formula

2 sentences, under 155 characters. First sentence states what the page is. Second sentence adds a hook or differentiator. Include one primary keyword naturally.

### Image SEO

- All `<img>` tags must have descriptive `alt` text: "Photo of a Small Tortoiseshell butterfly (Aglais urticae) on a flower"
- Use WebP where possible for faster loading
- Lazy-load below-fold images
- Photo credits are both ethical and SEO-positive (they're content)

### Page Speed

- Astro's static generation is our advantage — no server-side rendering overhead
- Keep JavaScript minimal on content pages (species, blog, genera)
- Game pages will be JS-heavy by nature — that's fine, Google can render JS
- Monitor Core Web Vitals via Vercel Analytics

### Canonical Domain Strategy

The site currently lives at `dewanggogte.com/games/bugs`. This is a significant SEO handicap:
- The domain has zero topical authority for insects/bugs
- The `/games/bugs/` subdirectory dilutes whatever authority the domain has
- Competitors like buganalyzr.com and insectidentification.org have keyword-rich domains

**When a dedicated domain is acquired:**
1. Set up 301 redirects from `dewanggogte.com/games/bugs/*` to the new domain
2. Update all canonical URLs
3. Update sitemap URL in robots.txt
4. Re-submit sitemap to Google Search Console
5. Update structured data URLs
6. Update OG/Twitter card URLs
7. Expect 2-4 weeks of ranking fluctuation during migration

---

## Content Strategy

### Auto-Generated Content: Species Pages

**What:** One page per species in the game database (1,724 pages)
**Content source:** Wikipedia articles, curated through Claude into fun-fact-focused, skimmable summaries
**Update frequency:** When new species are added to the game
**SEO value:** Long-tail keyword coverage ("small tortoiseshell identification", "what is an eastern lubber grasshopper")
**Quality bar:** Every species page must be genuinely interesting to read — not a data dump. If the Wikipedia source is thin, the page should be short and honest rather than padded.

### Auto-Generated Content: Genera Index

**What:** Single page listing all 1,100+ genera with filterable cards
**SEO value:** Massive crawlable text surface with taxonomic keywords; internal linking hub
**Quality bar:** Useful as a reference for players exploring what's in the game

### Editorial Content: Blog Posts

**What:** Hand-written (or Claude-assisted) articles targeting high-value keywords
**Topic source:** `docs/blog-topic-ideas.md` — maintained list derived from search data research
**Update frequency:** When the author has time. No pressure to maintain a cadence. One great post beats five mediocre ones.
**SEO value:** Targets informational-intent keywords that game pages can't rank for
**Quality bar:** Would a curious person share this with a friend? If not, don't publish it.

### Content Principles

1. **Fun facts over encyclopedia entries.** "The bombardier beetle can spray boiling chemicals from its abdomen at 500 pulses per second" beats "The bombardier beetle is a ground beetle in the family Carabidae."

2. **First-person plural where natural.** "We feature over 1,000 species" not "The application contains over 1,000 species." The site has personality.

3. **Link to the game, don't sell it.** "Can you identify this beetle in our quiz?" not "PLAY NOW! TEST YOUR SKILLS!" The game sells itself.

4. **Attribute everything.** Photos are CC BY from iNaturalist. Wikipedia content is curated, not copied. Attribution is both ethical and a trust signal.

5. **No AI slop.** If Claude generates content, it must be reviewed and rewritten to sound natural. See the humanizer skill. Watch for: em dash overuse, "delve into", "it's worth noting", "in conclusion", numbered lists of exactly 5 items, and sentences that start with "Interestingly,".

---

## Competitive Intelligence

### Who to watch

| Competitor | What they do | Threat level | What to learn from them |
|---|---|---|---|
| buganalyzr.com | Free AI bug ID from photos | Medium | Ranks for 4+ of our target keywords; strong SEO despite being a simple tool. Study their meta tags and content structure. |
| whatsthatbug.com | Community Q&A bug ID blog | Low (different intent) | Owns the "what's that bug" brand. We need the "game" modifier or our own domain. |
| pictureinsect.com | Commercial bug ID app | Low (different intent) | Dominates "identify insect from photo" — we shouldn't compete for this keyword. |
| insectidentification.org | Filter-based bug finder | Low | Good domain name, massive page count. Their content is dry — we can be more engaging. |
| scoutlife.org | "Insect Identification Quiz" | Direct competitor | Currently #1 for "insect identification game" with a basic text quiz. Beatable. |
| britannica.com | "Know Your Bugs Quiz" | Direct competitor | High domain authority but content is a simple 10-question text quiz. Beatable on quality. |

### Competitor keyword monitoring

Periodically search these queries and note changes in rankings:
- "insect identification game"
- "bug identification quiz"
- "guess the bug game"
- "insect quiz online"

Watch for new entrants. If iNaturalist ever launches their rumored "BugSpiel" game, it would be a serious competitor given their domain authority and data.

---

## Link Building Opportunities

Organic link building (not paid or spammy) is critical for domain authority. These are realistic opportunities:

1. **Reddit r/whatsthisbug** (192K subscribers) — the game is already inspired by this community. Share the game there (done during launch). Ongoing: participate genuinely in the community.

2. **iNaturalist forums** — the game uses iNaturalist data with proper attribution. The community is interested in gamified identification (see the "BugSpiel" forum thread). Share the game as a "what I built with iNaturalist data" post.

3. **Entomology educators** — teachers looking for engaging insect content. The game is perfect for classroom use. Reach out to science education blogs/newsletters.

4. **Nature/science publications** — "This free game teaches you to identify 1,000+ insects" is a genuinely interesting story for nature blogs, science communication outlets, or local press.

5. **Product Hunt / Hacker News** — launch-style submissions for initial link equity.

6. **Wikipedia** — if the game becomes notable enough, it could be linked from insect identification or citizen science articles. Long-term aspiration.

---

## The Ambitious Vision

In order of what to pursue:

### Phase 1: Foundation (current work)
- Technical SEO fixes
- 6 dedicated landing pages
- Species pages with curated content
- Genera index
- Blog infrastructure + topic list
- Homepage content enrichment

### Phase 2: Dedicated Domain
- Acquire a keyword-relevant domain (e.g., whatsthatbuggame.com, insectidgame.com, bugquiz.com)
- 301 redirect from dewanggogte.com/games/bugs
- Fresh Google Search Console property
- Expect rankings to stabilize within 4-6 weeks

### Phase 3: Content Velocity
- Publish 1-2 blog posts per month targeting editorial topic list
- Expand species pages as new species are added to the game
- Create seasonal content ("Spring bugs to watch for", "Fall garden pests")
- Build out order-level pages (/beetles could become /coleoptera with educational content)

### Phase 4: Rich Results & Features
- Pursue Google's "Game" rich result format
- Add aggregate rating schema once we have enough player data
- Explore Google Discover eligibility (requires high-quality visual content — we have it)
- AMP or Signed Exchanges for instant loading from search results

### Phase 5: Community & Authority
- User-contributed identifications creating unique content
- Expert verification badges building E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness)
- API for embedding the game on other sites (educational institutions)
- Partnerships with entomology organizations for backlinks and credibility

### Phase 6: International
- Multilingual species names (many insects have names in multiple languages)
- hreflang tags for international audiences
- Localized landing pages ("insectes identification jeu" for French searches)

---

## What Not To Do

1. **Don't keyword-stuff.** If a title reads unnaturally, rewrite it. Google penalizes obvious stuffing.

2. **Don't create pages for every possible keyword variant.** One page per intent, not one page per synonym.

3. **Don't add "SEO content" that real visitors would skip.** If you wouldn't read it, Google won't value it.

4. **Don't chase backlinks from link farms or directories.** One link from a real nature blog is worth more than 100 from spam directories.

5. **Don't obsess over meta keywords.** Google hasn't used the `meta keywords` tag since 2009.

6. **Don't change URLs once established.** URL changes mean losing existing link equity. Get the URL right the first time.

7. **Don't block JavaScript rendering.** Google renders JS fine. Our game pages are JS-heavy and that's okay.

8. **Don't add interstitials or popups.** Google penalizes pages with intrusive interstitials, especially on mobile.

9. **Don't duplicate content across pages.** Each landing page must have unique intro text, not the same boilerplate.

10. **Don't ignore Core Web Vitals.** A fast, stable page beats a slow, content-rich one.

---

## Measurement Checkpoints

### Monthly Review
- Google Search Console: impressions, clicks, average position for target keywords
- New pages indexed (check `site:dewanggogte.com/games/bugs` in Google)
- Click-through rates per page
- Any manual actions or crawl errors

### Quarterly Review
- Keyword position changes for primary keywords
- Competitor ranking changes
- Content gap analysis (what are people searching that we don't have a page for?)
- Link building progress

### Annual Review
- Overall organic traffic growth
- Domain authority trajectory
- Content ROI (which blog posts/species pages drive the most traffic?)
- Strategic direction check (is the dedicated domain plan on track?)
