# SEO Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve organic search visibility by fixing technical SEO issues, creating keyword-targeted landing pages, building species/genera reference pages, and adding blog infrastructure.

**Architecture:** Astro 4 static site. New pages follow existing patterns in `src/pages/`. Shared data logic extracted to `src/lib/species-utils.js`. Blog uses Astro content collections. All new pages use the existing `Base.astro` layout. Species pages use dynamic routing via `[slug].astro` + `getStaticPaths`.

**Tech Stack:** Astro 4, @astrojs/sitemap, Node.js (Wikipedia fetch script), CSS custom properties (existing design system)

**Spec:** `docs/superpowers/specs/2026-04-17-seo-revamp-design.md`
**SEO guide:** `SEO.md`

---

## Task 1: Technical SEO Config & Meta Fixes

**Files:**
- Modify: `astro.config.mjs` (all lines)
- Modify: `src/pages/daily/play.astro:1-14`
- Modify: `src/pages/play.astro:4-7`
- Modify: `src/pages/leaderboard.astro:4-7`
- Modify: `src/layouts/Base.astro:65-83`

- [ ] **Step 1: Update astro.config.mjs**

Add `trailingSlash: 'never'` and remove `customPages` — let Astro auto-discover all routes. Remove the filter since all pages should be in the sitemap.

```javascript
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://dewanggogte.com/games/bugs',
  trailingSlash: 'never',
  integrations: [
    sitemap(),
  ],
  build: {
    assets: '_wtb',
  },
});
```

- [ ] **Step 2: Fix daily/play.astro — add missing description & canonical**

```astro
---
import Base from '../../layouts/Base.astro';
---
<Base
  title="Daily Bug Challenge — What's That Bug?"
  description="A new mystery insect every day. Can you identify today's bug from its photo? Play the free daily insect identification challenge."
  canonicalPath="/daily/play"
>
  <div id="daily-container">
    <div class="container" style="text-align: center; padding-top: 80px;">
      <p class="subtitle">Loading today's challenge...</p>
    </div>
  </div>
  <script>
    import { initDaily } from '../../scripts/daily-ui.js';
    initDaily();
  </script>
</Base>
```

- [ ] **Step 3: Update play.astro title & description**

Change lines 5-6:
```
  title="Identify This Bug — What's That Bug?"
  description="Can you identify the insect from its photo? Four choices, one correct answer. Test your bug identification skills with real research-grade photos."
```

- [ ] **Step 4: Update leaderboard.astro title & description**

Change lines 5-6:
```
  title="Today's Top Bug Identifiers — Daily Leaderboard"
  description="See today's top insect identifiers. Compete in Time Trial and Streak modes — leaderboard resets at midnight ET."
```

- [ ] **Step 5: Simplify Base.astro __BASE path detection**

The current regex at lines 65-83 enumerates known routes to strip from the path. This breaks as routes are added. Replace with a simpler check — the base is `/games/bugs` if the path starts with it, empty otherwise:

Replace lines 65-83 with:
```javascript
    // Detect base path for subpath deployments (e.g. /games/bugs/)
    // At root, __BASE is empty string so all paths work unchanged.
    (function() {
      var base = '';
      var match = window.location.pathname.match(/^(\/games\/bugs)/);
      if (match) base = match[1];
      window.__BASE = base;

      // Rewrite favicon and internal links for subpath
      if (window.__BASE) {
        var fav = document.getElementById('favicon');
        if (fav) fav.setAttribute('href', window.__BASE + fav.getAttribute('href'));

        document.addEventListener('DOMContentLoaded', function() {
          document.querySelectorAll('a[href^="/"]:not([href^="//"])').forEach(function(a) {
            a.setAttribute('href', window.__BASE + a.getAttribute('href'));
          });
        });
      }
    })();
```

- [ ] **Step 6: Verify build succeeds**

Run: `npx astro build`
Expected: Build completes without errors. Check that `dist/daily/play/index.html` now includes the description meta tag.

- [ ] **Step 7: Commit**

```bash
git add astro.config.mjs src/pages/daily/play.astro src/pages/play.astro src/pages/leaderboard.astro src/layouts/Base.astro
git commit -m "fix: technical SEO — trailing slashes, meta tags, base path detection"
```

---

## Task 2: Species Utilities

Shared helper module used by landing pages, species pages, and genera index.

**Files:**
- Create: `src/lib/species-utils.js`

- [ ] **Step 1: Create species utilities module**

```javascript
// src/lib/species-utils.js
//
// Shared helpers for species data used across landing pages,
// species pages, and genera index.

/**
 * Slugify a string for use in URLs.
 * "Small Tortoiseshell" → "small-tortoiseshell"
 * "Aglais urticae" → "aglais-urticae"
 */
export function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Map from set key to landing page URL path.
 */
export const SET_TO_URL = {
  beetles: '/beetles',
  butterflies_moths: '/butterflies-and-moths',
  spiders: '/spiders',
  backyard_basics: '/backyard-bugs',
  bugs_101: '/beginners',
  all_bugs: '/expert',
  tiny_terrors: '/tiny-terrors',
  eye_candy: '/eye-candy',
};

/**
 * Build a complete species map from observations data.
 * Returns a Map<scientificName, { slug, commonName, genus, family, order,
 *   genusCommon, familyCommon, orderCommon, bestPhoto, attribution, inatUrl }>
 *
 * Handles slug collisions (2 known: milkweed-bug, green-huntsman-spider)
 * by appending the scientific name.
 */
export function buildSpeciesMap(observations) {
  // First pass: collect all species and detect slug collisions
  const speciesBySlug = new Map(); // slug → [scientificName, ...]
  const speciesData = new Map();

  for (const obs of observations) {
    const sp = obs.taxon?.species;
    if (!sp) continue;

    // Track best photo (highest num_agreements)
    const existing = speciesData.get(sp);
    if (!existing || obs.num_agreements > existing.bestPhoto.num_agreements) {
      speciesData.set(sp, {
        commonName: obs.taxon.common_name || '',
        genus: obs.taxon.genus || '',
        family: obs.taxon.family || '',
        order: obs.taxon.order || '',
        genusCommon: obs.taxon.genus_common || '',
        familyCommon: obs.taxon.family_common || '',
        orderCommon: obs.taxon.order_common || '',
        bestPhoto: {
          url: obs.photo_url,
          attribution: obs.attribution,
          inatUrl: obs.inat_url,
          num_agreements: obs.num_agreements,
        },
      });
    }

    // Track slug usage for collision detection
    if (!existing) {
      const baseSlug = obs.taxon.common_name
        ? slugify(obs.taxon.common_name)
        : slugify(sp);
      const arr = speciesBySlug.get(baseSlug) || [];
      arr.push(sp);
      speciesBySlug.set(baseSlug, arr);
    }
  }

  // Second pass: assign final slugs, disambiguating collisions
  const collisionSlugs = new Set();
  for (const [slug, names] of speciesBySlug) {
    if (names.length > 1) collisionSlugs.add(slug);
  }

  const result = new Map();
  for (const [sp, data] of speciesData) {
    const baseSlug = data.commonName ? slugify(data.commonName) : slugify(sp);
    const slug = collisionSlugs.has(baseSlug)
      ? `${baseSlug}-${slugify(sp)}`
      : baseSlug;

    result.set(sp, { slug, ...data });
  }

  return result;
}

/**
 * Build genus data from observations for the genera index.
 * Returns an array of { genus, genusCommon, order, orderCommon,
 *   speciesCount, representativePhoto, speciesList }
 * sorted alphabetically by genus name.
 */
export function buildGeneraData(observations) {
  const genera = new Map();

  for (const obs of observations) {
    const genus = obs.taxon?.genus;
    if (!genus) continue;

    if (!genera.has(genus)) {
      genera.set(genus, {
        genus,
        genusCommon: obs.taxon.genus_common || '',
        order: obs.taxon.order || '',
        orderCommon: obs.taxon.order_common || '',
        representativePhoto: obs.photo_url,
        species: new Set(),
      });
    }

    const g = genera.get(genus);
    if (obs.taxon.species) g.species.add(obs.taxon.species);
  }

  return Array.from(genera.values())
    .map(g => ({
      genus: g.genus,
      genusCommon: g.genusCommon,
      order: g.order,
      orderCommon: g.orderCommon,
      speciesCount: g.species.size,
      representativePhoto: g.representativePhoto,
      speciesList: Array.from(g.species).sort(),
    }))
    .sort((a, b) => a.genus.localeCompare(b.genus));
}

/**
 * Get species belonging to a given set.
 * Returns array of { species (scientific name), commonName, slug }
 * sorted alphabetically by common name (or scientific name if no common name).
 */
export function getSpeciesForSet(setData, observations, speciesMap) {
  const seen = new Set();
  const result = [];

  for (const id of setData.observation_ids) {
    const obs = observations[id];
    const sp = obs?.taxon?.species;
    if (!sp || seen.has(sp)) continue;
    seen.add(sp);

    const data = speciesMap.get(sp);
    if (data) {
      result.push({
        species: sp,
        commonName: data.commonName,
        slug: data.slug,
      });
    }
  }

  return result.sort((a, b) => {
    const nameA = a.commonName || a.species;
    const nameB = b.commonName || b.species;
    return nameA.localeCompare(nameB);
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/species-utils.js
git commit -m "feat: add shared species utilities for SEO pages"
```

---

## Task 3: Landing Page Component

A shared Astro component used by all 8 landing pages.

**Files:**
- Create: `src/components/LandingPage.astro`

- [ ] **Step 1: Create the landing page component**

This component receives props for the specific set and renders the full landing page with SEO content, photo grid, CTA, species list, and structured data.

```astro
---
// src/components/LandingPage.astro
import Base from '../layouts/Base.astro';
import setsData from '../../public/data/sets.json';
import observations from '../../public/data/observations.json';
import { buildSpeciesMap, getSpeciesForSet } from '../lib/species-utils.js';

interface Props {
  setKey: string;
  title: string;
  description: string;
  h1: string;
  intro: string;
  canonicalPath: string;
}

const { setKey, title, description, h1, intro, canonicalPath } = Astro.props;
const CANONICAL_BASE = 'https://dewanggogte.com/games/bugs';

// Time trial/streak variants only exist for these sets
const COMPETE_MODES = {
  bugs_101: { timeTrial: 'bugs_101_time_trial', streak: 'bugs_101_streak' },
  all_bugs: { timeTrial: 'time_trial', streak: 'streak' },
};
const compete = COMPETE_MODES[setKey] || null;

const set = setsData[setKey];
const speciesMap = buildSpeciesMap(observations);
const speciesList = getSpeciesForSet(set, observations, speciesMap);
const speciesCount = speciesList.length;
const photoCount = set.observation_ids.length;

// Pick 6 sample photos — spread evenly across the set for variety
const sampleIndices = Array.from({ length: 6 }, (_, i) =>
  Math.floor((i / 6) * set.observation_ids.length)
);
const samplePhotos = sampleIndices
  .map(i => observations[set.observation_ids[i]])
  .filter(Boolean);

const breadcrumbData = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": `${CANONICAL_BASE}` },
    { "@type": "ListItem", "position": 2, "name": h1, "item": `${CANONICAL_BASE}${canonicalPath}` },
  ],
};

const gameData = {
  "@context": "https://schema.org",
  "@type": "VideoGame",
  "name": `${h1} — What's That Bug?`,
  "description": description,
  "url": `${CANONICAL_BASE}${canonicalPath}`,
  "genre": "Trivia",
  "numberOfPlayers": { "@type": "QuantitativeValue", "value": 1 },
  "gamePlatform": "Web Browser",
  "operatingSystem": "Web",
  "applicationCategory": "Game",
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
  "author": { "@type": "Person", "name": "Dewang Gogte", "url": "https://dewanggogte.com" },
};
---
<Base title={title} description={description} canonicalPath={canonicalPath}>
  <div class="container landing-page">
    <div class="landing-header">
      <h1>{h1}</h1>
      <p class="landing-intro">{intro}</p>
      <p class="landing-stats">
        {speciesCount} species &middot; {photoCount} research-grade photos &middot; Free to play
      </p>
    </div>

    <div class="landing-photos">
      {samplePhotos.map(obs => (
        <div class="landing-photo">
          <img
            src={obs.photo_url}
            alt={`Photo of ${obs.taxon?.common_name || obs.taxon?.species || 'an insect'}`}
            loading="lazy"
            width="200"
            height="200"
          />
        </div>
      ))}
    </div>

    <div class="landing-cta-section">
      <a href={`/play?set=${setKey}`} class="landing-cta">Play Now</a>
      {compete && (
        <div class="landing-mode-links">
          <a href={`/play?set=${compete.timeTrial}`}>Time Trial</a>
          <span class="landing-mode-sep">&middot;</span>
          <a href={`/play?set=${compete.streak}`}>Streaks</a>
        </div>
      )}
    </div>

    <details class="landing-species-list">
      <summary>All {speciesCount} species in this set</summary>
      <ul class="landing-species-grid">
        {speciesList.map(s => (
          <li>
            <a href={`/species/${s.slug}`}>
              {s.commonName || s.species}
              {s.commonName && <span class="landing-species-sci"> ({s.species})</span>}
            </a>
          </li>
        ))}
      </ul>
    </details>
  </div>

  <script type="application/ld+json" is:inline set:html={JSON.stringify(breadcrumbData)}></script>
  <script type="application/ld+json" is:inline set:html={JSON.stringify(gameData)}></script>

  <style>
    .landing-page {
      max-width: 720px;
      padding-top: 24px;
    }

    .landing-header {
      text-align: center;
      margin-bottom: 32px;
    }

    .landing-header h1 {
      margin-bottom: 12px;
    }

    .landing-intro {
      font-size: var(--text-base);
      color: var(--text-secondary);
      line-height: 1.6;
      max-width: 560px;
      margin: 0 auto 12px;
    }

    .landing-stats {
      font-size: var(--text-sm);
      color: var(--text-secondary);
      font-weight: 600;
    }

    .landing-photos {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin-bottom: 32px;
      border-radius: var(--radius-md);
      overflow: hidden;
    }

    .landing-photo img {
      width: 100%;
      aspect-ratio: 1;
      object-fit: cover;
      display: block;
      background: var(--photo-bg);
    }

    .landing-cta-section {
      text-align: center;
      margin-bottom: 32px;
    }

    .landing-cta {
      display: inline-block;
      background: var(--accent);
      color: white;
      font-size: var(--text-lg);
      font-weight: 700;
      padding: 14px 48px;
      border-radius: var(--radius-full);
      text-decoration: none;
      transition: opacity var(--transition-fast);
    }

    .landing-cta:hover {
      opacity: 0.9;
    }

    .landing-mode-links {
      margin-top: 12px;
      font-size: var(--text-sm);
    }

    .landing-mode-links a {
      color: var(--accent);
      text-decoration: none;
    }

    .landing-mode-links a:hover {
      text-decoration: underline;
    }

    .landing-mode-sep {
      color: var(--text-secondary);
      margin: 0 6px;
    }

    .landing-species-list {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 16px;
      margin-bottom: 32px;
    }

    .landing-species-list summary {
      cursor: pointer;
      font-weight: 600;
      color: var(--text);
      font-size: var(--text-sm);
    }

    .landing-species-grid {
      margin-top: 12px;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 4px 16px;
      list-style: none;
      padding: 0;
    }

    .landing-species-grid li {
      font-size: var(--text-sm);
      padding: 4px 0;
      border-bottom: 1px solid var(--border);
    }

    .landing-species-grid a {
      color: var(--text);
      text-decoration: none;
    }

    .landing-species-grid a:hover {
      color: var(--accent);
    }

    .landing-species-sci {
      color: var(--text-secondary);
      font-style: italic;
      font-size: var(--text-xs);
    }

    @media (max-width: 480px) {
      .landing-photos {
        grid-template-columns: repeat(2, 1fr);
      }
    }
  </style>
</Base>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/LandingPage.astro
git commit -m "feat: add reusable landing page component for SEO pages"
```

---

## Task 4: Create All 8 Landing Pages

Each page is a thin wrapper around `LandingPage.astro` with its specific content.

**Files:**
- Create: `src/pages/beetles.astro`
- Create: `src/pages/butterflies-and-moths.astro`
- Create: `src/pages/spiders.astro`
- Create: `src/pages/backyard-bugs.astro`
- Create: `src/pages/beginners.astro`
- Create: `src/pages/expert.astro`
- Create: `src/pages/tiny-terrors.astro`
- Create: `src/pages/eye-candy.astro`

- [ ] **Step 1: Create beetles.astro**

```astro
---
import LandingPage from '../components/LandingPage.astro';
---
<LandingPage
  setKey="beetles"
  title="Beetle Identification Quiz — What's That Bug?"
  description="Can you identify beetles from their photos? Test your knowledge of Coleoptera with real research-grade images. Free online beetle identification game."
  h1="Beetle Identification Quiz"
  intro="Beetles are the most diverse order of insects, with over 400,000 known species. From iridescent jewel beetles to armored stag beetles, see how many you can identify from real research-grade photographs."
  canonicalPath="/beetles"
/>
```

- [ ] **Step 2: Create butterflies-and-moths.astro**

```astro
---
import LandingPage from '../components/LandingPage.astro';
---
<LandingPage
  setKey="butterflies_moths"
  title="Butterfly & Moth Identification Game — What's That Bug?"
  description="Identify butterflies and moths from real photos. Test your Lepidoptera knowledge with this free online identification game featuring hundreds of species."
  h1="Butterfly & Moth Identification Game"
  intro="From swallowtails to sphinx moths, Lepidoptera are among the most recognizable insects. Can you tell a monarch from a viceroy, or a luna moth from a polyphemus? Put your butterfly and moth identification skills to the test."
  canonicalPath="/butterflies-and-moths"
/>
```

- [ ] **Step 3: Create spiders.astro**

```astro
---
import LandingPage from '../components/LandingPage.astro';
---
<LandingPage
  setKey="spiders"
  title="Spider Identification Quiz — What's That Bug?"
  description="Can you identify spiders from their photos? Test your arachnid knowledge with real research-grade images. Free online spider identification game."
  h1="Spider Identification Quiz"
  intro="Spiders and their arachnid relatives are some of the most feared and fascinating creatures. From garden orb-weavers to jumping spiders, see how many you can recognize from their photos alone."
  canonicalPath="/spiders"
/>
```

- [ ] **Step 4: Create backyard-bugs.astro**

```astro
---
import LandingPage from '../components/LandingPage.astro';
---
<LandingPage
  setKey="backyard_basics"
  title="Common Backyard Bug Identification — What's That Bug?"
  description="Learn to identify the most common bugs in your backyard. A free insect identification game featuring the species you're most likely to encounter at home."
  h1="Common Backyard Bug Identification"
  intro="These are the bugs you'll actually find in your garden, on your porch, and around your home. From ladybugs to earwigs, this set covers the species most people encounter every day but can't quite name."
  canonicalPath="/backyard-bugs"
/>
```

- [ ] **Step 5: Create beginners.astro**

```astro
---
import LandingPage from '../components/LandingPage.astro';
---
<LandingPage
  setKey="bugs_101"
  title="Insect Identification Quiz for Beginners — What's That Bug?"
  description="New to insect identification? Start here. Identify bugs by type with this free beginner-friendly quiz featuring over 1,000 species and real photos."
  h1="Insect Identification Quiz for Beginners"
  intro="Start your bug identification journey here. In Bugs 101, you identify insects by their type — beetle, butterfly, spider, and more — rather than exact species. It's the perfect way to build your insect knowledge from the ground up."
  canonicalPath="/beginners"
/>
```

- [ ] **Step 6: Create expert.astro**

```astro
---
import LandingPage from '../components/LandingPage.astro';
---
<LandingPage
  setKey="all_bugs"
  title="Expert Insect Identification Challenge — What's That Bug?"
  description="Think you know your bugs? Identify insects down to the genus level in this expert-mode challenge. 1,600+ species from real research-grade photos."
  h1="Expert Insect Identification Challenge"
  intro="This is the real test. In expert mode, you identify insects down to the genus level from a photo alone. With over 1,600 species across every major order, this is as close as it gets to real field identification."
  canonicalPath="/expert"
/>
```

- [ ] **Step 7: Create tiny-terrors.astro**

```astro
---
import LandingPage from '../components/LandingPage.astro';
---
<LandingPage
  setKey="tiny_terrors"
  title="Tiny Terror Insects — Can You Identify Them? — What's That Bug?"
  description="Wasps, hornets, assassin bugs, and other intimidating insects. Can you identify these tiny terrors from their photos? Free insect identification game."
  h1="Tiny Terror Insects — Can You Identify Them?"
  intro="The stingers, the biters, the ones that make you flinch. This set features wasps, hornets, assassin bugs, and other insects that have earned a fearsome reputation. Can you tell them apart when they're staring right at you?"
  canonicalPath="/tiny-terrors"
/>
```

- [ ] **Step 8: Create eye-candy.astro**

```astro
---
import LandingPage from '../components/LandingPage.astro';
---
<LandingPage
  setKey="eye_candy"
  title="Most Beautiful Insects — Photo Identification Quiz — What's That Bug?"
  description="Stunning insect photography meets identification challenge. Can you name these gorgeous bugs from their photos? Free online insect identification game."
  h1="Most Beautiful Insects — Photo Identification Quiz"
  intro="These are the showstoppers of the insect world — iridescent beetles, ornate moths, and jewel-toned dragonflies captured in stunning research-grade photography. How many of these beautiful bugs can you identify?"
  canonicalPath="/eye-candy"
/>
```

- [ ] **Step 9: Build and verify**

Run: `npx astro build`
Expected: Build succeeds. Verify `dist/beetles/index.html`, `dist/beginners/index.html` etc. exist and contain the correct H1 tags and structured data.

- [ ] **Step 10: Commit**

```bash
git add src/pages/beetles.astro src/pages/butterflies-and-moths.astro src/pages/spiders.astro src/pages/backyard-bugs.astro src/pages/beginners.astro src/pages/expert.astro src/pages/tiny-terrors.astro src/pages/eye-candy.astro
git commit -m "feat: add 8 keyword-targeted landing pages for SEO"
```

---

## Task 5: Homepage Updates — Internal Links, Content & FAQ

Update the homepage with flat URL links, new content sections, and FAQPage structured data.

**Files:**
- Modify: `src/pages/index.astro:23-132`

- [ ] **Step 1: Update homepage title and description**

Change lines 23-27 to:
```astro
<Base
  title="What's That Bug? — Free Insect Identification Game & Quiz"
  description="Free insect identification game with 1,000+ species. Identify bugs from real research-grade photos in this online quiz. Play daily challenges, compete on leaderboards, and test your bug ID skills."
  canonicalPath="/"
>
```

- [ ] **Step 2: Update internal links to use flat URLs**

Change the Play section card links (lines 46, 52):
```
<a href="/beginners" class="play-card">
```
```
<a href="/expert" class="play-card">
```

Change the themed button links (line 100). Replace:
```astro
<a href={`/play?set=${set.key}`} class="themed-btn">
```
With a lookup using the `SET_TO_URL` map. Add the import at the top of the frontmatter (after line 4):
```javascript
import { SET_TO_URL } from '../lib/species-utils.js';
```

Then change line 100 to:
```astro
<a href={SET_TO_URL[set.key] || `/play?set=${set.key}`} class="themed-btn">
```

Note: The Compete section links (`/play?set=bugs_101_time_trial` etc.) stay as-is because time trial and streak modes don't have dedicated pages.

- [ ] **Step 3: Add content sections after the Explore section**

Insert before the closing `</div>` of the container (before line 108), add these three new sections:

```astro
    <!-- How It Works -->
    <div class="homepage-section">
      <h2 class="homepage-section-title">How It Works</h2>
      <div class="how-it-works">
        <div class="how-step">
          <span class="how-step-num">1</span>
          <div>
            <strong>See a photo</strong>
            <p>We show you a real research-grade insect photo from iNaturalist</p>
          </div>
        </div>
        <div class="how-step">
          <span class="how-step-num">2</span>
          <div>
            <strong>Make your guess</strong>
            <p>Pick from four possible identifications</p>
          </div>
        </div>
        <div class="how-step">
          <span class="how-step-num">3</span>
          <div>
            <strong>Learn something new</strong>
            <p>Every round teaches you about a different species</p>
          </div>
        </div>
      </div>
    </div>

    <!-- What You'll Learn -->
    <div class="homepage-section">
      <h2 class="homepage-section-title">What You'll Learn</h2>
      <p class="homepage-learn-text">What's That Bug? features over 1,000 insect species photographed in the wild by citizen scientists. From common backyard beetles to rare tropical butterflies, every photo is research-grade verified. Whether you're a curious beginner or a seasoned entomologist, there's always a new bug to discover.</p>
    </div>

    <!-- FAQ -->
    <div class="homepage-section">
      <h2 class="homepage-section-title">FAQ</h2>
      <div class="faq-list">
        <details class="faq-item" open>
          <summary>What is What's That Bug?</summary>
          <p>A free online insect identification game. You're shown a real photo of a bug and choose the correct identification from four options. It's like GeoGuessr, but for insects.</p>
        </details>
        <details class="faq-item">
          <summary>How many insects are in the game?</summary>
          <p>Over 1,000 species across 17 orders, from beetles and butterflies to spiders and dragonflies. All photos are research-grade observations from iNaturalist.</p>
        </details>
        <details class="faq-item">
          <summary>Is this game free?</summary>
          <p>Yes, completely free with no sign-up required.</p>
        </details>
        <details class="faq-item">
          <summary>How does the Daily Challenge work?</summary>
          <p>Every day, a new mystery insect is featured. You get one guess. Your streak tracks how many days in a row you've played and solved correctly.</p>
        </details>
        <details class="faq-item">
          <summary>Can I compete with others?</summary>
          <p>Yes — Time Trial and Streak modes have daily leaderboards that reset at midnight ET. Enter a display name to see how you rank.</p>
        </details>
      </div>
    </div>
```

- [ ] **Step 4: Add FAQPage structured data**

Insert a second `<script type="application/ld+json">` block after the existing WebApplication one (after line 132). The FAQ schema:

```astro
  <script type="application/ld+json" is:inline>
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "What is What's That Bug?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "A free online insect identification game. You're shown a real photo of a bug and choose the correct identification from four options. It's like GeoGuessr, but for insects."
        }
      },
      {
        "@type": "Question",
        "name": "How many insects are in the game?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Over 1,000 species across 17 orders, from beetles and butterflies to spiders and dragonflies. All photos are research-grade observations from iNaturalist."
        }
      },
      {
        "@type": "Question",
        "name": "Is this game free?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes, completely free with no sign-up required."
        }
      },
      {
        "@type": "Question",
        "name": "How does the Daily Challenge work?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Every day, a new mystery insect is featured. You get one guess. Your streak tracks how many days in a row you've played and solved correctly."
        }
      },
      {
        "@type": "Question",
        "name": "Can I compete with others?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes — Time Trial and Streak modes have daily leaderboards that reset at midnight ET. Enter a display name to see how you rank."
        }
      }
    ]
  }
  </script>
```

- [ ] **Step 5: Add styles for new sections**

Add to the `<style is:global>` block at the bottom of `index.astro`:

```css
  /* How It Works */
  .how-it-works {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .how-step {
    display: flex;
    align-items: flex-start;
    gap: 16px;
    padding: 12px 16px;
    background: var(--surface);
    border-radius: var(--radius-sm);
  }

  .how-step-num {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--accent);
    color: white;
    border-radius: 50%;
    font-weight: 700;
    font-size: var(--text-sm);
  }

  .how-step p {
    margin: 4px 0 0;
    color: var(--text-secondary);
    font-size: var(--text-sm);
    line-height: 1.4;
  }

  /* What You'll Learn */
  .homepage-learn-text {
    color: var(--text-secondary);
    line-height: 1.6;
    font-size: var(--text-sm);
  }

  /* FAQ */
  .faq-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .faq-item {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 12px 16px;
  }

  .faq-item summary {
    cursor: pointer;
    font-weight: 600;
    font-size: var(--text-sm);
    color: var(--text);
  }

  .faq-item p {
    margin: 8px 0 0;
    color: var(--text-secondary);
    font-size: var(--text-sm);
    line-height: 1.5;
  }
```

- [ ] **Step 6: Build and verify**

Run: `npx astro build`
Expected: Build succeeds. Verify the homepage HTML contains the FAQ schema and all three new content sections.

- [ ] **Step 7: Commit**

```bash
git add src/pages/index.astro src/lib/species-utils.js
git commit -m "feat: homepage SEO — flat URLs, content sections, FAQ schema"
```

---

## Task 6: Species Pages

Dynamic species pages generated from observations data via `getStaticPaths`.

**Files:**
- Create: `src/pages/species/[slug].astro`

- [ ] **Step 1: Create the species page template**

This page handles two content tiers: species with curated content from `species-content.json` get the full treatment; species without it get a shorter taxonomy-only page.

```astro
---
// src/pages/species/[slug].astro
import Base from '../../layouts/Base.astro';
import observations from '../../../public/data/observations.json';
import speciesContent from '../../../public/data/species-content.json';
import { buildSpeciesMap } from '../../lib/species-utils.js';

// Build species map (module-level — shared between getStaticPaths and page render)
const speciesMap = buildSpeciesMap(observations);

export function getStaticPaths() {
  return Array.from(speciesMap.entries()).map(([scientificName, data]) => ({
    params: { slug: data.slug },
    props: { scientificName },
  }));
}

const { scientificName } = Astro.props;
const CANONICAL_BASE = 'https://dewanggogte.com/games/bugs';
const species = speciesMap.get(scientificName);

if (!species) return Astro.redirect('/');

const curated = speciesContent[scientificName] || null;
const displayName = species.commonName || scientificName;
const pageTitle = species.commonName
  ? `${species.commonName} (${scientificName}) — What's That Bug?`
  : `${scientificName} — What's That Bug?`;
const pageDesc = curated
  ? curated.summary?.slice(0, 150).replace(/<[^>]+>/g, '') + '...'
  : `Learn about ${displayName}. Order: ${species.orderCommon || species.order}. Play the insect identification game to test your knowledge.`;

// Find related species (same genus)
const related = Array.from(speciesMap.entries())
  .filter(([name, data]) => data.genus === species.genus && name !== scientificName)
  .slice(0, 6)
  .map(([name, data]) => ({ name, ...data }));

// Determine which game set this species belongs to
import setsData from '../../../public/data/sets.json';
let gameLink = '/beginners';
for (const [key, set] of Object.entries(setsData)) {
  if (['bugs_101', 'all_bugs'].includes(key)) continue;
  const setSpecies = new Set(set.observation_ids.map(i => observations[i]?.taxon?.species));
  if (setSpecies.has(scientificName)) {
    const urlMap = { beetles: '/beetles', butterflies_moths: '/butterflies-and-moths', spiders: '/spiders', backyard_basics: '/backyard-bugs', tiny_terrors: '/tiny-terrors', eye_candy: '/eye-candy' };
    if (urlMap[key]) { gameLink = urlMap[key]; break; }
  }
}

const breadcrumbData = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": CANONICAL_BASE },
    { "@type": "ListItem", "position": 2, "name": "Genera", "item": `${CANONICAL_BASE}/genera` },
    { "@type": "ListItem", "position": 3, "name": species.genusCommon || species.genus, "item": `${CANONICAL_BASE}/genera#${species.genus.toLowerCase()}` },
    { "@type": "ListItem", "position": 4, "name": displayName, "item": `${CANONICAL_BASE}/species/${species.slug}` },
  ],
};

const articleData = {
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": pageTitle,
  "description": pageDesc,
  "image": species.bestPhoto.url,
  "author": { "@type": "Person", "name": "Dewang Gogte", "url": "https://dewanggogte.com" },
};
---
<Base title={pageTitle} description={pageDesc} canonicalPath={`/species/${species.slug}`}>
  <div class="container species-page">
    <h1>
      {species.commonName && <span>{species.commonName}</span>}
      <span class="species-sci">{scientificName}</span>
    </h1>

    <div class="species-hero">
      <img
        src={species.bestPhoto.url}
        alt={`Photo of ${displayName} (${scientificName})`}
        width="600"
        height="400"
        class="species-hero-img"
      />
      <p class="species-attribution">{species.bestPhoto.attribution}</p>
    </div>

    <div class="species-taxonomy">
      <div class="taxon-row"><span class="taxon-label">Order</span><span>{species.orderCommon || species.order} ({species.order})</span></div>
      <div class="taxon-row"><span class="taxon-label">Family</span><span>{species.familyCommon || species.family} ({species.family})</span></div>
      <div class="taxon-row"><span class="taxon-label">Genus</span><span>{species.genusCommon || species.genus} ({species.genus})</span></div>
    </div>

    {curated && (
      <div class="species-content" set:html={curated.summary}></div>
    )}

    <div class="species-cta">
      <p>Think you can identify this one in the wild?</p>
      <a href={gameLink} class="species-play-btn">Play Now</a>
    </div>

    {related.length > 0 && (
      <div class="species-related">
        <h2>Related Species</h2>
        <div class="species-related-grid">
          {related.map(r => (
            <a href={`/species/${r.slug}`} class="species-related-card">
              <img src={r.bestPhoto.url} alt={r.commonName || r.name} loading="lazy" width="120" height="120" />
              <span class="species-related-name">{r.commonName || r.name}</span>
            </a>
          ))}
        </div>
      </div>
    )}

    <p class="species-inat-link">
      <a href={species.bestPhoto.inatUrl} target="_blank" rel="noopener">
        See more observations on iNaturalist
      </a>
    </p>
  </div>

  <script type="application/ld+json" is:inline set:html={JSON.stringify(breadcrumbData)}></script>
  <script type="application/ld+json" is:inline set:html={JSON.stringify(articleData)}></script>

  <style>
    .species-page {
      max-width: 680px;
      padding-top: 24px;
    }

    .species-page h1 {
      margin-bottom: 4px;
    }

    .species-sci {
      display: block;
      font-style: italic;
      font-size: var(--text-base);
      font-weight: 400;
      color: var(--text-secondary);
      margin-top: 4px;
    }

    .species-hero {
      margin: 20px 0;
    }

    .species-hero-img {
      width: 100%;
      max-height: 420px;
      object-fit: cover;
      border-radius: var(--radius-md);
      background: var(--photo-bg);
    }

    .species-attribution {
      font-size: var(--text-xs);
      color: var(--text-secondary);
      margin-top: 6px;
    }

    .species-taxonomy {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 12px 16px;
      margin-bottom: 24px;
    }

    .taxon-row {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      font-size: var(--text-sm);
      border-bottom: 1px solid var(--border);
    }

    .taxon-row:last-child {
      border-bottom: none;
    }

    .taxon-label {
      font-weight: 600;
      color: var(--text-secondary);
    }

    .species-content {
      line-height: 1.7;
      font-size: var(--text-sm);
      margin-bottom: 24px;
    }

    .species-content :global(strong) {
      color: var(--text);
    }

    .species-cta {
      text-align: center;
      padding: 24px;
      background: var(--surface);
      border-radius: var(--radius-md);
      margin-bottom: 24px;
    }

    .species-cta p {
      margin: 0 0 12px;
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    .species-play-btn {
      display: inline-block;
      background: var(--accent);
      color: white;
      font-weight: 700;
      padding: 10px 32px;
      border-radius: var(--radius-full);
      text-decoration: none;
      transition: opacity var(--transition-fast);
    }

    .species-play-btn:hover { opacity: 0.9; }

    .species-related {
      margin-bottom: 24px;
    }

    .species-related h2 {
      font-size: var(--text-base);
      margin-bottom: 12px;
    }

    .species-related-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
      gap: 12px;
    }

    .species-related-card {
      text-decoration: none;
      text-align: center;
    }

    .species-related-card img {
      width: 100%;
      aspect-ratio: 1;
      object-fit: cover;
      border-radius: var(--radius-sm);
      background: var(--photo-bg);
    }

    .species-related-name {
      display: block;
      font-size: var(--text-xs);
      color: var(--text);
      margin-top: 4px;
      line-height: 1.2;
    }

    .species-inat-link {
      font-size: var(--text-sm);
      text-align: center;
      margin-bottom: 32px;
    }

    .species-inat-link a {
      color: var(--accent);
    }
  </style>
</Base>
```

**Important note on `getStaticPaths`:** Astro requires `getStaticPaths` to be a top-level export. The imports inside it need to use Astro's static import mechanism. The code above uses dynamic imports inside `getStaticPaths` — during implementation, if Astro complains, move the data loading to the top-level frontmatter and pass it into `getStaticPaths` via closure.

- [ ] **Step 2: Create placeholder species-content.json**

```bash
echo '{}' > public/data/species-content.json
```

This empty object lets species pages build immediately. When curated content is added later, pages automatically pick it up.

- [ ] **Step 3: Build and verify**

Run: `npx astro build`
Expected: Build succeeds, generating 1,724 species pages. Spot-check:
- `dist/species/small-tortoiseshell/index.html` should exist
- The H1 should contain "Small Tortoiseshell"
- The taxonomy card should show "Lepidoptera"
- The species-content div should NOT render (no curated content yet)

- [ ] **Step 4: Commit**

```bash
git add src/pages/species/ public/data/species-content.json
git commit -m "feat: add 1,724 species pages with taxonomy and game CTAs"
```

---

## Task 7: Genera Index Page

**Files:**
- Create: `src/pages/genera/index.astro`

- [ ] **Step 1: Create the genera index page**

```astro
---
// src/pages/genera/index.astro
import Base from '../../layouts/Base.astro';
import observations from '../../../public/data/observations.json';
import { buildGeneraData, buildSpeciesMap } from '../../lib/species-utils.js';

const genera = buildGeneraData(observations);
const speciesMap = buildSpeciesMap(observations);
const CANONICAL_BASE = 'https://dewanggogte.com/games/bugs';

// Get unique orders for filter tabs
const orders = [...new Set(genera.map(g => g.order))].sort();

// For each genus, find the slug of its first species (for linking)
const generaWithLinks = genera.map(g => {
  const firstSpecies = g.speciesList[0];
  const speciesData = firstSpecies ? speciesMap.get(firstSpecies) : null;
  return {
    ...g,
    firstSpeciesSlug: speciesData?.slug || null,
  };
});

const breadcrumbData = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": CANONICAL_BASE },
    { "@type": "ListItem", "position": 2, "name": "All Genera", "item": `${CANONICAL_BASE}/genera` },
  ],
};
---
<Base
  title="All Insect Genera — What's That Bug?"
  description={`Browse all ${genera.length.toLocaleString()}+ insect genera in the game. From Aglais to Zygiella — explore the diversity of bugs you can identify.`}
  canonicalPath="/genera"
>
  <div class="container genera-page">
    <div style="text-align: center; padding: 24px 0 8px;">
      <h1>All Insect Genera</h1>
      <p class="subtitle">{genera.length.toLocaleString()} genera across {orders.length} orders</p>
    </div>

    <div class="genera-controls">
      <input
        type="text"
        id="genera-search"
        class="genera-search"
        placeholder="Search genera..."
        autocomplete="off"
      />
      <div class="genera-filters" id="genera-filters">
        <button class="genera-filter-btn active" data-order="all">All</button>
        {orders.map(order => {
          const orderCommon = genera.find(g => g.order === order)?.orderCommon || order;
          return (
            <button class="genera-filter-btn" data-order={order}>
              {orderCommon}
            </button>
          );
        })}
      </div>
    </div>

    <div class="genera-grid" id="genera-grid">
      {generaWithLinks.map(g => (
        <a
          href={g.firstSpeciesSlug ? `/species/${g.firstSpeciesSlug}` : '#'}
          class="genus-card"
          data-order={g.order}
          data-search={`${g.genus} ${g.genusCommon} ${g.orderCommon}`.toLowerCase()}
          id={g.genus.toLowerCase()}
        >
          <img
            src={g.representativePhoto}
            alt={`${g.genusCommon || g.genus}`}
            loading="lazy"
            width="100"
            height="100"
            class="genus-card-img"
          />
          <div class="genus-card-info">
            <span class="genus-card-name">{g.genus}</span>
            {g.genusCommon && <span class="genus-card-common">{g.genusCommon}</span>}
            <span class="genus-card-meta">{g.speciesCount} species &middot; {g.orderCommon || g.order}</span>
          </div>
        </a>
      ))}
    </div>

    <p class="genera-empty" id="genera-empty" style="display:none;">
      No genera match your search.
    </p>
  </div>

  <script type="application/ld+json" is:inline set:html={JSON.stringify(breadcrumbData)}></script>

  <script>
    // Client-side search and order filtering
    const searchInput = document.getElementById('genera-search');
    const grid = document.getElementById('genera-grid');
    const emptyMsg = document.getElementById('genera-empty');
    const cards = Array.from(grid.querySelectorAll('.genus-card'));
    const filterBtns = document.querySelectorAll('.genera-filter-btn');

    let activeOrder = 'all';

    function applyFilters() {
      const query = searchInput.value.toLowerCase().trim();
      let visible = 0;

      for (const card of cards) {
        const matchesOrder = activeOrder === 'all' || card.dataset.order === activeOrder;
        const matchesSearch = !query || card.dataset.search.includes(query);
        const show = matchesOrder && matchesSearch;
        card.style.display = show ? '' : 'none';
        if (show) visible++;
      }

      emptyMsg.style.display = visible === 0 ? '' : 'none';
    }

    searchInput.addEventListener('input', applyFilters);

    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeOrder = btn.dataset.order;
        applyFilters();
      });
    });
  </script>

  <style>
    .genera-page {
      max-width: 960px;
      padding-top: 24px;
    }

    .genera-controls {
      margin-bottom: 24px;
    }

    .genera-search {
      width: 100%;
      padding: 10px 16px;
      border: 1px solid var(--border);
      border-radius: var(--radius-full);
      background: var(--surface);
      color: var(--text);
      font-size: var(--text-sm);
      outline: none;
      margin-bottom: 12px;
    }

    .genera-search:focus {
      border-color: var(--accent);
    }

    .genera-filters {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .genera-filter-btn {
      padding: 4px 12px;
      border: 1px solid var(--border);
      border-radius: var(--radius-full);
      background: var(--surface);
      color: var(--text-secondary);
      font-size: var(--text-xs);
      cursor: pointer;
      transition: all var(--transition-fast);
    }

    .genera-filter-btn.active {
      background: var(--accent);
      color: white;
      border-color: var(--accent);
    }

    .genera-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 12px;
    }

    .genus-card {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      text-decoration: none;
      transition: border-color var(--transition-fast);
    }

    .genus-card:hover {
      border-color: var(--accent);
    }

    .genus-card-img {
      width: 56px;
      height: 56px;
      object-fit: cover;
      border-radius: var(--radius-sm);
      flex-shrink: 0;
      background: var(--photo-bg);
    }

    .genus-card-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .genus-card-name {
      font-weight: 700;
      font-size: var(--text-sm);
      color: var(--text);
      font-style: italic;
    }

    .genus-card-common {
      font-size: var(--text-xs);
      color: var(--text);
    }

    .genus-card-meta {
      font-size: 0.65rem;
      color: var(--text-secondary);
    }

    .genera-empty {
      text-align: center;
      color: var(--text-secondary);
      padding: 32px;
    }
  </style>
</Base>
```

- [ ] **Step 2: Build and verify**

Run: `npx astro build`
Expected: Build succeeds. `dist/genera/index.html` exists and contains genus cards. Search for "Aglais" in the output HTML to confirm it's there.

- [ ] **Step 3: Commit**

```bash
git add src/pages/genera/
git commit -m "feat: add genera index page with search and order filtering"
```

---

## Task 8: Blog Infrastructure

Set up Astro content collections for the blog. Launches with no posts — the infrastructure is ready for content.

**Files:**
- Create: `src/content/config.ts`
- Create: `src/content/blog/.gitkeep`
- Create: `src/pages/blog/index.astro`
- Create: `src/pages/blog/[...slug].astro`

- [ ] **Step 1: Create content collection config**

```typescript
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

export const collections = { blog };
```

- [ ] **Step 2: Create blog directory with .gitkeep**

```bash
mkdir -p src/content/blog
touch src/content/blog/.gitkeep
```

- [ ] **Step 3: Create blog index page**

```astro
---
// src/pages/blog/index.astro
import Base from '../../layouts/Base.astro';
import { getCollection } from 'astro:content';

const posts = (await getCollection('blog'))
  .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());

const CANONICAL_BASE = 'https://dewanggogte.com/games/bugs';
const breadcrumbData = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": CANONICAL_BASE },
    { "@type": "ListItem", "position": 2, "name": "Blog", "item": `${CANONICAL_BASE}/blog` },
  ],
};
---
<Base
  title="Bug Identification Blog — What's That Bug?"
  description="Articles about insect identification, entomology tips, and bug facts. Learn to identify the insects around you."
  canonicalPath="/blog"
>
  <div class="container blog-page">
    <div style="text-align: center; padding: 24px 0 8px;">
      <h1>Blog</h1>
      <p class="subtitle">Insect identification tips, fun facts, and field guides</p>
    </div>

    {posts.length === 0 ? (
      <div class="blog-empty">
        <p>Posts coming soon. In the meantime, explore our <a href="/genera">genera index</a> or <a href="/beginners">play the game</a>.</p>
      </div>
    ) : (
      <div class="blog-list">
        {posts.map(post => (
          <a href={`/blog/${post.slug}`} class="blog-card">
            {post.data.image && (
              <img src={post.data.image} alt="" class="blog-card-img" loading="lazy" width="200" height="130" />
            )}
            <div class="blog-card-info">
              <h2 class="blog-card-title">{post.data.title}</h2>
              <p class="blog-card-desc">{post.data.description}</p>
              <time class="blog-card-date" datetime={post.data.date.toISOString()}>
                {post.data.date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </time>
            </div>
          </a>
        ))}
      </div>
    )}
  </div>

  <script type="application/ld+json" is:inline set:html={JSON.stringify(breadcrumbData)}></script>

  <style>
    .blog-page {
      max-width: 680px;
      padding-top: 24px;
    }

    .blog-empty {
      text-align: center;
      padding: 48px 16px;
      color: var(--text-secondary);
    }

    .blog-empty a {
      color: var(--accent);
    }

    .blog-list {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .blog-card {
      display: flex;
      gap: 16px;
      padding: 16px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      text-decoration: none;
      transition: border-color var(--transition-fast);
    }

    .blog-card:hover {
      border-color: var(--accent);
    }

    .blog-card-img {
      width: 140px;
      height: 100px;
      object-fit: cover;
      border-radius: var(--radius-sm);
      flex-shrink: 0;
      background: var(--photo-bg);
    }

    .blog-card-info {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .blog-card-title {
      font-size: var(--text-base);
      font-weight: 700;
      color: var(--text);
      margin: 0;
    }

    .blog-card-desc {
      font-size: var(--text-sm);
      color: var(--text-secondary);
      line-height: 1.4;
      margin: 0;
    }

    .blog-card-date {
      font-size: var(--text-xs);
      color: var(--text-secondary);
      margin-top: auto;
    }

    @media (max-width: 480px) {
      .blog-card {
        flex-direction: column;
      }
      .blog-card-img {
        width: 100%;
        height: 160px;
      }
    }
  </style>
</Base>
```

- [ ] **Step 4: Create blog post template**

```astro
---
// src/pages/blog/[...slug].astro
import Base from '../../layouts/Base.astro';
import { getCollection } from 'astro:content';

export async function getStaticPaths() {
  const posts = await getCollection('blog');
  return posts.map(post => ({
    params: { slug: post.slug },
    props: { post },
  }));
}

const { post } = Astro.props;
const { Content } = await post.render();
const CANONICAL_BASE = 'https://dewanggogte.com/games/bugs';

const breadcrumbData = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": CANONICAL_BASE },
    { "@type": "ListItem", "position": 2, "name": "Blog", "item": `${CANONICAL_BASE}/blog` },
    { "@type": "ListItem", "position": 3, "name": post.data.title, "item": `${CANONICAL_BASE}/blog/${post.slug}` },
  ],
};

const articleData = {
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": post.data.title,
  "description": post.data.description,
  "datePublished": post.data.date.toISOString(),
  "author": { "@type": "Person", "name": "Dewang Gogte", "url": "https://dewanggogte.com" },
  ...(post.data.image ? { "image": `${CANONICAL_BASE}${post.data.image}` } : {}),
};
---
<Base
  title={`${post.data.title} — What's That Bug?`}
  description={post.data.description}
  canonicalPath={`/blog/${post.slug}`}
  ogType="article"
>
  <div class="container blog-post">
    <article>
      <header class="blog-post-header">
        <h1>{post.data.title}</h1>
        <time datetime={post.data.date.toISOString()}>
          {post.data.date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </time>
        {post.data.tags && (
          <div class="blog-post-tags">
            {post.data.tags.map(tag => <span class="blog-post-tag">{tag}</span>)}
          </div>
        )}
      </header>
      <div class="blog-post-content">
        <Content />
      </div>
    </article>
    <nav class="blog-post-back">
      <a href="/blog">&larr; All posts</a>
    </nav>
  </div>

  <script type="application/ld+json" is:inline set:html={JSON.stringify(breadcrumbData)}></script>
  <script type="application/ld+json" is:inline set:html={JSON.stringify(articleData)}></script>

  <style>
    .blog-post {
      max-width: 680px;
      padding-top: 24px;
    }

    .blog-post-header {
      margin-bottom: 32px;
    }

    .blog-post-header h1 {
      margin-bottom: 8px;
    }

    .blog-post-header time {
      font-size: var(--text-sm);
      color: var(--text-secondary);
    }

    .blog-post-tags {
      display: flex;
      gap: 6px;
      margin-top: 12px;
    }

    .blog-post-tag {
      font-size: var(--text-xs);
      padding: 2px 10px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-full);
      color: var(--text-secondary);
    }

    .blog-post-content {
      line-height: 1.7;
      font-size: var(--text-base);
    }

    .blog-post-content :global(h2) {
      margin-top: 32px;
      margin-bottom: 12px;
    }

    .blog-post-content :global(h3) {
      margin-top: 24px;
      margin-bottom: 8px;
    }

    .blog-post-content :global(p) {
      margin-bottom: 16px;
    }

    .blog-post-content :global(img) {
      max-width: 100%;
      border-radius: var(--radius-md);
    }

    .blog-post-content :global(ul), .blog-post-content :global(ol) {
      margin-bottom: 16px;
      padding-left: 24px;
    }

    .blog-post-content :global(blockquote) {
      border-left: 3px solid var(--accent);
      padding-left: 16px;
      margin: 16px 0;
      color: var(--text-secondary);
      font-style: italic;
    }

    .blog-post-back {
      margin-top: 48px;
      padding-top: 24px;
      border-top: 1px solid var(--border);
    }

    .blog-post-back a {
      color: var(--accent);
      text-decoration: none;
      font-size: var(--text-sm);
    }

    .blog-post-back a:hover {
      text-decoration: underline;
    }
  </style>
</Base>
```

- [ ] **Step 5: Build and verify**

Run: `npx astro build`
Expected: Build succeeds. `dist/blog/index.html` exists and shows the "Posts coming soon" message.

- [ ] **Step 6: Commit**

```bash
git add src/content/config.ts src/content/blog/.gitkeep src/pages/blog/
git commit -m "feat: add blog infrastructure with content collections"
```

---

## Task 9: Wikipedia Fetch Script

Node script that fetches Wikipedia article summaries for all species.

**Files:**
- Create: `scripts/fetch-species-wikipedia.js`

- [ ] **Step 1: Create the Wikipedia fetch script**

```javascript
#!/usr/bin/env node
// scripts/fetch-species-wikipedia.js
//
// Fetches Wikipedia article summaries for all species in observations.json.
// Outputs data/species-wikipedia-raw.json for curation through Claude.
//
// Usage: node scripts/fetch-species-wikipedia.js
//
// Rate-limited: ~100ms between requests to be respectful to Wikipedia's API.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OBS_PATH = join(ROOT, 'public', 'data', 'observations.json');
const OUTPUT_DIR = join(ROOT, 'data');
const OUTPUT_PATH = join(OUTPUT_DIR, 'species-wikipedia-raw.json');

const WIKI_API = 'https://en.wikipedia.org/api/rest_v1/page/summary';
const DELAY_MS = 100;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWikiSummary(title) {
  const encoded = encodeURIComponent(title.replace(/ /g, '_'));
  const url = `${WIKI_API}/${encoded}`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'WhatsThatBug/1.0 (game; contact: hello@mukul-mehta.in)' },
    });

    if (res.status === 404) return null;
    if (!res.ok) {
      console.error(`  HTTP ${res.status} for "${title}"`);
      return null;
    }

    const data = await res.json();
    if (data.type === 'disambiguation') return null;

    return {
      title: data.title,
      extract: data.extract || '',
      extractHtml: data.extract_html || '',
      thumbnail: data.thumbnail?.source || null,
      wikiUrl: data.content_urls?.desktop?.page || null,
    };
  } catch (err) {
    console.error(`  Error for "${title}": ${err.message}`);
    return null;
  }
}

async function main() {
  console.log('Loading observations...');
  const observations = JSON.parse(readFileSync(OBS_PATH, 'utf-8'));

  // Collect unique species
  const speciesSet = new Map();
  for (const obs of observations) {
    const sp = obs.taxon?.species;
    if (!sp || speciesSet.has(sp)) continue;
    speciesSet.set(sp, {
      commonName: obs.taxon.common_name || '',
      genus: obs.taxon.genus || '',
    });
  }

  console.log(`Found ${speciesSet.size} unique species.`);

  // Load existing results to support resuming
  let existing = {};
  if (existsSync(OUTPUT_PATH)) {
    existing = JSON.parse(readFileSync(OUTPUT_PATH, 'utf-8'));
    console.log(`Loaded ${Object.keys(existing).length} existing entries — will skip them.`);
  }

  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

  const results = { ...existing };
  let fetched = 0;
  let found = 0;
  let skipped = Object.keys(existing).length;
  const total = speciesSet.size;

  for (const [scientificName, meta] of speciesSet) {
    if (results[scientificName]) continue;

    fetched++;
    if (fetched % 50 === 0) {
      console.log(`  Progress: ${fetched + skipped}/${total} (${found} found so far)`);
      // Save progress periodically
      writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2));
    }

    // Try species article first
    let result = await fetchWikiSummary(scientificName);

    // Fall back to genus article
    if (!result && meta.genus) {
      result = await fetchWikiSummary(meta.genus);
      if (result) result._fallbackLevel = 'genus';
    }

    if (result) {
      results[scientificName] = {
        ...result,
        commonName: meta.commonName,
      };
      found++;
    } else {
      results[scientificName] = null;
    }

    await sleep(DELAY_MS);
  }

  writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2));

  const nullCount = Object.values(results).filter(v => v === null).length;
  const genusCount = Object.values(results).filter(v => v?._fallbackLevel === 'genus').length;
  console.log(`\nDone! ${Object.keys(results).length} total entries.`);
  console.log(`  Species-level: ${Object.keys(results).length - nullCount - genusCount}`);
  console.log(`  Genus-level fallback: ${genusCount}`);
  console.log(`  No content: ${nullCount}`);
  console.log(`Saved to: ${OUTPUT_PATH}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Add data/ to .gitignore (raw wikipedia data is not deployed)**

Check if `.gitignore` exists and add the `data/` directory to it:

```bash
echo 'data/' >> .gitignore
```

- [ ] **Step 3: Test the script with a small run**

Run: `node scripts/fetch-species-wikipedia.js`
Let it run for ~30 seconds, then Ctrl+C. Check that `data/species-wikipedia-raw.json` exists and contains entries with `extract` fields that are substantially longer than the 150-char iNaturalist summaries. The script supports resuming — re-running it will skip already-fetched species.

- [ ] **Step 4: Commit**

```bash
git add scripts/fetch-species-wikipedia.js .gitignore
git commit -m "feat: add Wikipedia fetch script for species content pipeline"
```

---

## Task 10: Build Verification & Sitemap Check

Final verification that everything works together.

**Files:**
- No new files — verification only

- [ ] **Step 1: Run a full build**

Run: `npx astro build`
Expected: Build succeeds. Note the build time and page count in the output.

- [ ] **Step 2: Verify page count**

Run: `find dist -name 'index.html' | wc -l`
Expected: At least 1,740+ pages (1,724 species + 8 landing + genera + blog + homepage + play + leaderboard + daily).

- [ ] **Step 3: Verify sitemap includes new pages**

Run: `cat dist/sitemap-*.xml | grep -c '<loc>'`
Expected: URL count matches page count. Spot-check that the sitemap contains:
- `https://dewanggogte.com/games/bugs/beetles`
- `https://dewanggogte.com/games/bugs/species/small-tortoiseshell`
- `https://dewanggogte.com/games/bugs/genera`
- `https://dewanggogte.com/games/bugs/blog`

- [ ] **Step 4: Spot-check key pages**

Verify these files exist and contain expected content:
- `dist/index.html` — contains "How It Works", FAQ, FAQPage schema
- `dist/beetles/index.html` — contains "Beetle Identification Quiz" H1, VideoGame schema
- `dist/species/small-tortoiseshell/index.html` — contains taxonomy card, Article schema
- `dist/genera/index.html` — contains search input, genus cards
- `dist/blog/index.html` — contains "Posts coming soon"
- `dist/daily/play/index.html` — contains description meta tag

- [ ] **Step 5: Start dev server and visually verify**

Run: `npx astro dev`
Visit in a browser:
- Homepage — verify new content sections, FAQ, flat URL links work
- `/beetles` — verify landing page with photos, CTA, species list
- `/species/small-tortoiseshell` — verify species page with taxonomy
- `/genera` — verify search and filter work
- `/blog` — verify empty state

- [ ] **Step 6: Final commit if any fixes were needed**

If any fixes were made during verification:
```bash
git add -A
git commit -m "fix: address issues found during SEO build verification"
```
