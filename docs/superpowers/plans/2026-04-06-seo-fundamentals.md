# SEO Fundamentals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add comprehensive SEO infrastructure — meta tags, OG/Twitter cards, sitemap, structured data, robots.txt, PWA manifest — so the game gets indexed by Google and shows rich previews when shared.

**Architecture:** Update `Base.astro` layout to accept per-page SEO props and render OG/Twitter/canonical meta tags. Add `@astrojs/sitemap` integration for auto-generated sitemap. Create static assets (OG image, favicon PNGs, manifest, robots.txt). Add JSON-LD structured data to the landing page.

**Tech Stack:** Astro 4, @astrojs/sitemap, sharp (dev dependency for image generation)

**Spec:** `docs/superpowers/specs/2026-04-06-seo-fundamentals-design.md`

---

### Task 1: Install dependencies and update Astro config

**Files:**
- Modify: `package.json`
- Modify: `astro.config.mjs`

- [ ] **Step 1: Install @astrojs/sitemap and sharp**

```bash
npm install @astrojs/sitemap && npm install -D sharp
```

`@astrojs/sitemap` is the official Astro integration that auto-generates a `sitemap-index.xml` at build time. `sharp` is a high-performance image processing library we'll use to generate the OG image and favicon PNGs from SVG templates.

- [ ] **Step 2: Update astro.config.mjs**

Replace the entire file with:

```javascript
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://dewanggogte.com/games/bugs',
  integrations: [sitemap()],
  build: {
    assets: '_wtb',
  },
});
```

The `site` property tells `@astrojs/sitemap` what absolute URLs to generate. We intentionally do NOT add `base` — the existing runtime `__BASE` detection in `Base.astro` (lines 29-47) handles the subpath deployment at `dewanggogte.com/games/bugs`, and adding Astro's `base` config would conflict by rewriting asset paths at build time, breaking the root-path Vercel deployment.

- [ ] **Step 3: Verify the build still works**

```bash
npm run build
```

Expected: Build succeeds. A `sitemap-index.xml` and `sitemap-0.xml` should appear in `dist/`.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json astro.config.mjs
git commit -m "chore: add @astrojs/sitemap and sharp, configure site URL"
```

---

### Task 2: Generate static image assets

**Files:**
- Create: `scripts/generate-seo-assets.mjs`
- Create: `public/og-default.png`
- Create: `public/icon-192.png`
- Create: `public/icon-512.png`

- [ ] **Step 1: Create the asset generation script**

Create `scripts/generate-seo-assets.mjs`:

```javascript
import sharp from 'sharp';
import { writeFileSync } from 'fs';

// Theme colors from global.css (dark mode)
const BG = '#1a1917';
const ACCENT = '#d4794e';
const TEXT = '#ffffff';
const TEXT_SECONDARY = '#a8a49c';

// --- OG Image (1200x630) ---
const ogSvg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="${BG}"/>
  <rect width="1200" height="6" fill="${ACCENT}"/>
  <text x="600" y="240" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-weight="bold" font-size="72" fill="${TEXT}">What's That Bug?</text>
  <text x="600" y="320" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="36" fill="${ACCENT}">Can you identify 1,000+ insects?</text>
  <text x="600" y="400" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="26" fill="${TEXT_SECONDARY}">A free GeoGuessr-style insect identification game</text>
  <text x="600" y="560" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="22" fill="${TEXT_SECONDARY}">dewanggogte.com/games/bugs</text>
</svg>`;

await sharp(Buffer.from(ogSvg)).png().toFile('public/og-default.png');
console.log('Created public/og-default.png (1200x630)');

// --- Favicon PNGs (192x192 and 512x512) ---
// Simple branded icon: dark background with accent-colored circle and "?" text
function faviconSvg(size) {
  const padding = Math.round(size * 0.1);
  const circleR = Math.round((size - padding * 2) / 2);
  const cx = size / 2;
  const cy = size / 2;
  const fontSize = Math.round(size * 0.5);
  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" rx="${Math.round(size * 0.15)}" fill="${BG}"/>
    <circle cx="${cx}" cy="${cy}" r="${circleR}" fill="${ACCENT}" opacity="0.15"/>
    <text x="${cx}" y="${cy + fontSize * 0.17}" text-anchor="middle" dominant-baseline="middle" font-family="system-ui, -apple-system, sans-serif" font-weight="bold" font-size="${fontSize}" fill="${ACCENT}">?</text>
  </svg>`;
}

await sharp(Buffer.from(faviconSvg(192))).png().toFile('public/icon-192.png');
console.log('Created public/icon-192.png (192x192)');

await sharp(Buffer.from(faviconSvg(512))).png().toFile('public/icon-512.png');
console.log('Created public/icon-512.png (512x512)');

console.log('Done!');
```

- [ ] **Step 2: Run the script**

```bash
node scripts/generate-seo-assets.mjs
```

Expected output:
```
Created public/og-default.png (1200x630)
Created public/icon-192.png (192x192)
Created public/icon-512.png (512x512)
Done!
```

- [ ] **Step 3: Visually verify the generated images**

Open the files in Finder/Preview to check they look right:

```bash
open public/og-default.png public/icon-192.png public/icon-512.png
```

The OG image should show: dark background, accent-colored top bar, "What's That Bug?" in large white text, tagline in accent color, subtitle in muted text, URL at bottom.

The icons should show: dark rounded square with a warm "?" in the center.

- [ ] **Step 4: Commit**

```bash
git add scripts/generate-seo-assets.mjs public/og-default.png public/icon-192.png public/icon-512.png
git commit -m "feat: generate OG share image and PWA favicon PNGs"
```

---

### Task 3: Create robots.txt and manifest.json

**Files:**
- Create: `public/robots.txt`
- Create: `public/manifest.json`

- [ ] **Step 1: Create robots.txt**

Create `public/robots.txt`:

```
User-agent: *
Allow: /

Sitemap: https://dewanggogte.com/games/bugs/sitemap-index.xml
```

This tells search engine crawlers they can index all pages and where to find the sitemap. The sitemap URL uses the canonical domain, not the Vercel URL.

- [ ] **Step 2: Create manifest.json**

Create `public/manifest.json`:

```json
{
  "name": "What's That Bug?",
  "short_name": "What's That Bug?",
  "description": "A free guess-the-bug game with 1,000+ species.",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#1a1917",
  "theme_color": "#c97a4a",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

This is a PWA web app manifest. It enables "Add to Home Screen" on mobile and provides metadata for the app when installed. `display: standalone` means it opens without browser chrome. The theme color matches the game's warm accent.

- [ ] **Step 3: Commit**

```bash
git add public/robots.txt public/manifest.json
git commit -m "feat: add robots.txt and PWA manifest"
```

---

### Task 4: Update Base.astro layout with SEO meta tags

**Files:**
- Modify: `src/layouts/Base.astro`

This is the core change. The layout needs to accept richer props and render OG, Twitter Card, canonical, and PWA meta tags.

- [ ] **Step 1: Update the Props interface and frontmatter**

In `src/layouts/Base.astro`, replace the frontmatter (lines 1-8):

```astro
---
import '../styles/global.css';
interface Props {
  title: string;
  description: string;
  ogImage?: string;
  ogType?: string;
  canonicalPath?: string;
}
const { title, description, ogImage, ogType, canonicalPath } = Astro.props;
const goatCounterId = import.meta.env.PUBLIC_GOATCOUNTER_ID || '';

const CANONICAL_BASE = 'https://dewanggogte.com/games/bugs';
const resolvedOgImage = `${CANONICAL_BASE}${ogImage || '/og-default.png'}`;
const resolvedCanonical = canonicalPath != null ? `${CANONICAL_BASE}${canonicalPath}` : undefined;
const resolvedOgType = ogType || 'website';
---
```

- [ ] **Step 2: Update the `<head>` section**

Replace the existing `<head>` content (lines 11-16 in original) with:

```html
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content={description}>
  <link rel="icon" type="image/svg+xml" id="favicon" href="/favicon.svg">
  <title>{title}</title>

  {/* Canonical URL */}
  {resolvedCanonical && <link rel="canonical" href={resolvedCanonical} />}

  {/* Open Graph */}
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:image" content={resolvedOgImage} />
  {resolvedCanonical && <meta property="og:url" content={resolvedCanonical} />}
  <meta property="og:type" content={resolvedOgType} />
  <meta property="og:site_name" content="What's That Bug?" />

  {/* Twitter Card */}
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={title} />
  <meta name="twitter:description" content={description} />
  <meta name="twitter:image" content={resolvedOgImage} />

  {/* PWA */}
  <link rel="manifest" href="/manifest.json" />
  <link rel="apple-touch-icon" href="/icon-192.png" />
  <meta name="theme-color" content="#c97a4a" />
```

Keep the existing `<script is:inline>` blocks for referrer capture and base path detection unchanged — they follow the closing tags above.

- [ ] **Step 3: Wrap the slot in a `<main>` element**

In the `<body>`, change the bare `<slot />` (line 60 in original) to:

```html
  <main>
    <slot />
  </main>
```

This adds semantic HTML structure. Screen readers and search engines use `<main>` to identify the primary content area.

- [ ] **Step 4: Build and verify the HTML output**

```bash
npm run build
```

Then check that the generated HTML contains the new meta tags:

```bash
head -40 dist/index.html
```

Expected: You should see `og:title`, `og:description`, `og:image`, `twitter:card`, `canonical`, `manifest`, `apple-touch-icon`, and `theme-color` tags in the `<head>`.

- [ ] **Step 5: Commit**

```bash
git add src/layouts/Base.astro
git commit -m "feat: add OG, Twitter Card, canonical, and PWA meta tags to layout"
```

---

### Task 5: Update page files with per-page SEO props

**Files:**
- Modify: `src/pages/index.astro`
- Modify: `src/pages/play.astro`
- Modify: `src/pages/leaderboard.astro`

- [ ] **Step 1: Update index.astro**

Change line 22 from:

```astro
<Base title="What's That Bug? — Insect Identification Game">
```

to:

```astro
<Base
  title="What's That Bug? — The Insect Identification Game"
  description="A free guess-the-bug game with 1,000+ species. Can you identify insects from real research-grade photos? Test your insect ID skills in this GeoGuessr-style quiz."
  canonicalPath="/"
>
```

- [ ] **Step 2: Update play.astro**

Change line 4 from:

```astro
<Base title="Play — What's That Bug?">
```

to:

```astro
<Base
  title="Play — What's That Bug?"
  description="Guess the insect from its photo. Four choices, one correct answer. How well do you know your bugs?"
  canonicalPath="/play"
>
```

- [ ] **Step 3: Update leaderboard.astro**

Change line 4 from:

```astro
<Base title="Leaderboard — What's That Bug?">
```

to:

```astro
<Base
  title="Leaderboard — What's That Bug?"
  description="Top 10 bug identifiers worldwide. Compete in Time Trial and Streak modes across beginner and expert difficulty."
  canonicalPath="/leaderboard"
>
```

- [ ] **Step 4: Build and verify per-page output**

```bash
npm run build
```

Then check each page has its own description:

```bash
grep -i "meta.*description" dist/index.html dist/play/index.html dist/leaderboard/index.html
```

Expected: Each file should show a different description — not the old generic one.

- [ ] **Step 5: Commit**

```bash
git add src/pages/index.astro src/pages/play.astro src/pages/leaderboard.astro
git commit -m "feat: add per-page SEO descriptions and canonical paths"
```

---

### Task 6: Add JSON-LD structured data to index page

**Files:**
- Modify: `src/pages/index.astro`

- [ ] **Step 1: Add JSON-LD script to the index page**

In `src/pages/index.astro`, add the following just before the closing `</Base>` tag (before line 121):

```astro
  <script type="application/ld+json" is:inline>
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "What's That Bug?",
    "description": "A free guess-the-bug game with 1,000+ species. Identify insects from real research-grade photos in this GeoGuessr-style quiz.",
    "url": "https://dewanggogte.com/games/bugs",
    "applicationCategory": "GameApplication",
    "genre": "Trivia",
    "operatingSystem": "Web",
    "browserRequirements": "Requires JavaScript",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD"
    },
    "author": {
      "@type": "Person",
      "name": "Dewang Gogte",
      "url": "https://dewanggogte.com"
    }
  }
  </script>
```

JSON-LD (JavaScript Object Notation for Linked Data) is how you tell Google structured information about your page. The `WebApplication` type with `GameApplication` category helps Google understand this is a free web game, which can surface it in rich search results. The `is:inline` directive tells Astro not to process this script.

- [ ] **Step 2: Verify the JSON-LD appears in the build**

```bash
npm run build && grep "application/ld+json" dist/index.html
```

Expected: One match showing the JSON-LD script tag.

- [ ] **Step 3: Commit**

```bash
git add src/pages/index.astro
git commit -m "feat: add JSON-LD structured data (WebApplication schema)"
```

---

### Task 7: Run existing tests and verify full build

**Files:** None (verification only)

- [ ] **Step 1: Run the test suite**

```bash
npm test
```

Expected: All 30 tests pass. Our changes are meta tags and static assets — they shouldn't affect game logic.

- [ ] **Step 2: Full build**

```bash
npm run build
```

Expected: Build succeeds with no errors or warnings.

- [ ] **Step 3: Verify sitemap was generated**

```bash
cat dist/sitemap-index.xml
```

Expected: An XML file referencing `sitemap-0.xml`.

```bash
cat dist/sitemap-0.xml
```

Expected: URLs for `https://dewanggogte.com/games/bugs/`, `https://dewanggogte.com/games/bugs/play/`, and `https://dewanggogte.com/games/bugs/leaderboard/`.

- [ ] **Step 4: Verify all SEO elements in the built HTML**

Check the index page has everything:

```bash
grep -E "og:|twitter:|canonical|ld\+json|manifest|apple-touch-icon|theme-color" dist/index.html
```

Expected: Matches for all of: `og:title`, `og:description`, `og:image`, `og:url`, `og:type`, `og:site_name`, `twitter:card`, `twitter:title`, `twitter:description`, `twitter:image`, `canonical`, `application/ld+json`, `manifest`, `apple-touch-icon`, `theme-color`.

- [ ] **Step 5: Preview locally**

```bash
npm run preview
```

Open `http://localhost:4321` in the browser. Right-click > View Page Source and confirm the meta tags are present.

- [ ] **Step 6: Test OG preview**

Copy the full HTML source and paste into an OG debugger (like opengraph.xyz or the Twitter Card Validator) to verify the tags parse correctly. The image won't load from localhost, but the tag structure should validate.

---

### Task 8: Update .gitignore and final commit

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add generated assets note to .gitignore**

The OG image and favicon PNGs are checked into git (they're static assets needed at deploy time). No .gitignore changes needed for these.

However, verify the earlier .gitignore additions are still correct:

```bash
git status
```

Expected: Only the files we've modified/created should show as changed. No analytics files, photo_assets, or older_analytics should appear.

- [ ] **Step 2: Final commit with all remaining changes**

If there are any unstaged changes left:

```bash
git add -A
git status
```

Review the status — make sure only expected files are staged. Then:

```bash
git commit -m "chore: SEO fundamentals implementation complete"
```
