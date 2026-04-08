# Reddit Content Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the existing Reddit photo pipeline into a full content operation: multiple content types (galleries, challenge photos, text posts), varied copy, a posting calendar with optimal times, Reddit API posting, performance tracking, and a Playwright automation spec for fallback.

**Architecture:** Refactor `scripts/reddit-pipeline.mjs` (800 lines, monolithic) into focused modules under `scripts/reddit/`. A new CLI entry point (`scripts/reddit/pipeline.mjs`) replaces the old one. The existing iNaturalist fetch, review UI, and image download logic are preserved and extended. New capabilities: challenge photo selection, title/body rotation pools, a JSON-based posting calendar, Reddit API posting (tested first), and a performance log. Playwright automation is spec'd but not built.

**Tech Stack:** Node.js (ESM), native `fetch`, native `http` module, vanilla HTML/CSS/JS for review UI. No new dependencies.

---

## Reddit API Setup (Do First — Before Any Code)

Before building anything, verify the Reddit API works. The existing code in `reddit-pipeline.mjs:544-641` already has complete gallery posting logic. The blocker was likely the app registration, 2FA, or a subtle API issue.

### Step-by-step API setup:

1. **Go to** https://www.reddit.com/prefs/apps
2. **Click** "create another app..." at the bottom
3. **Fill in:**
   - **name:** `WhatsThatBug` (or anything)
   - **type:** Select **"script"** (the third radio button — personal use script)
   - **description:** `Personal content posting tool`
   - **about url:** leave blank
   - **redirect uri:** `http://localhost:8080` (required field, but unused for script apps)
4. **Click** "create app"
5. **Note two values:**
   - **Client ID:** the ~20-character string shown *directly under* the app name (not labeled clearly — it's the string right below "personal use script")
   - **Client Secret:** the string next to "secret"
6. **Add to `.env`:**
   ```
   REDDIT_CLIENT_ID=<client_id>
   REDDIT_CLIENT_SECRET=<client_secret>
   REDDIT_USERNAME=<your_reddit_username>
   REDDIT_PASSWORD=<your_reddit_password>
   ```

### Potential issues:

- **2FA enabled?** The `grant_type=password` flow does NOT work with Reddit 2FA. If you have 2FA on your Reddit account, you have two options:
  - Option A: Create a dedicated posting alt account without 2FA
  - Option B: Disable 2FA temporarily to test, then we switch to OAuth2 authorization code flow (more complex but 2FA-compatible)
- **New account rate limits:** Brand-new Reddit accounts or newly created apps may have stricter rate limits. The existing code already has retry logic.

### Verification test:

After adding credentials, we'll build a quick test script (Task 1) before touching anything else.

---

## File Structure

```
scripts/reddit/
├── config.mjs         — Subreddit registry, content types, title pools, schedule windows
├── api.mjs            — Reddit OAuth2 auth, image upload, gallery/text/comment submission
├── content.mjs        — Content generation: gallery candidates, challenge picks, data insights
├── copy.mjs           — Title/body text generation with rotation and per-sub tone
├── calendar.mjs       — Posting queue: schedule, ready/posted states, optimal times
├── tracker.mjs        — Post performance logging and engagement tracking
├── pipeline.mjs       — Main CLI entry point (replaces scripts/reddit-pipeline.mjs)
├── review-server.mjs  — Local HTTP server for the curation/review UI
└── review.html        — Upgraded review UI: photo curation + post preview editing

.cache/
├── reddit-content-state.json   — Pipeline state (current stage, candidates, selections)
├── reddit-posted-photos.json   — Which observation IDs have been posted where (existing)
├── reddit-calendar.json        — Posting queue with scheduled dates/times
└── reddit-post-log.json        — Performance log (post URL, sub, type, timestamp, engagement)

scripts/reddit-posts/             — (existing) Downloaded images + post.json per sub
docs/superpowers/specs/
└── 2026-04-08-playwright-reddit-spec.md  — Playwright automation spec (document only)
```

**Migration:** The existing `scripts/reddit-pipeline.mjs` stays untouched until the new pipeline is verified working. Once confirmed, we update `package.json` to point `reddit-pipeline` at the new entry point and archive the old file.

---

### Task 1: Reddit API Test Script

**Files:**
- Create: `scripts/reddit/api.mjs`

Isolate and test the Reddit API connection before building anything else. Extract the existing API functions from `reddit-pipeline.mjs:544-641` into a standalone module with a test mode.

- [ ] **Step 1: Create `scripts/reddit/api.mjs` with auth and test function**

```js
#!/usr/bin/env node

import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ---- Credentials ----
export function loadCredentials() {
  const envPath = join(ROOT, '.env');
  if (!existsSync(envPath)) return null;
  const env = {};
  readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
  });
  if (env.REDDIT_CLIENT_ID && env.REDDIT_CLIENT_SECRET && env.REDDIT_USERNAME && env.REDDIT_PASSWORD) {
    return env;
  }
  return null;
}

// ---- Auth ----
export async function getToken(creds) {
  const auth = Buffer.from(`${creds.REDDIT_CLIENT_ID}:${creds.REDDIT_CLIENT_SECRET}`).toString('base64');
  const userAgent = `WhatsThatBugGame/1.0 (by /u/${creds.REDDIT_USERNAME})`;

  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': userAgent,
    },
    body: `grant_type=password&username=${encodeURIComponent(creds.REDDIT_USERNAME)}&password=${encodeURIComponent(creds.REDDIT_PASSWORD)}`,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Auth failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  if (data.error) throw new Error(`Auth error: ${data.error} — ${data.message || ''}`);
  return { token: data.access_token, userAgent };
}

// ---- Image upload ----
export async function uploadImage(token, imagePath, userAgent) {
  const filename = imagePath.split('/').pop();
  const ext = filename.split('.').pop().toLowerCase();
  const mimeType = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' }[ext] || 'image/jpeg';

  const leaseRes = await fetch('https://oauth.reddit.com/api/media/asset.json', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'User-Agent': userAgent,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `filepath=${encodeURIComponent(filename)}&mimetype=${encodeURIComponent(mimeType)}`,
  });
  if (!leaseRes.ok) throw new Error(`Upload lease failed: ${leaseRes.status}`);
  const lease = await leaseRes.json();

  const uploadUrl = `https:${lease.args.action}`;
  const formData = new FormData();
  for (const field of lease.args.fields) {
    formData.append(field.name, field.value);
  }
  const imageBuffer = readFileSync(imagePath);
  formData.append('file', new Blob([imageBuffer], { type: mimeType }), filename);

  const uploadRes = await fetch(uploadUrl, { method: 'POST', body: formData });
  if (!uploadRes.ok && uploadRes.status !== 201) {
    throw new Error(`S3 upload failed: ${uploadRes.status}`);
  }

  return lease.asset.asset_id;
}

// ---- Submit gallery post ----
export async function submitGallery(token, subreddit, title, body, assetIds, captions, userAgent) {
  const items = assetIds.map((id, i) => ({
    media_id: id,
    caption: captions[i] || '',
    outbound_url: '',
  }));

  const res = await fetch('https://oauth.reddit.com/api/submit', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'User-Agent': userAgent,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sr: subreddit,
      kind: 'gallery',
      title,
      text: body,
      items,
      resubmit: true,
      send_replies: true,
    }),
  });
  if (!res.ok) throw new Error(`Submit failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  if (!data.json?.data?.url) {
    throw new Error(`Submit error: ${JSON.stringify(data.json?.errors || data)}`);
  }
  return data.json.data.url;
}

// ---- Submit text post ----
export async function submitText(token, subreddit, title, body, userAgent) {
  const res = await fetch('https://oauth.reddit.com/api/submit', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'User-Agent': userAgent,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sr: subreddit,
      kind: 'self',
      title,
      text: body,
      resubmit: true,
      send_replies: true,
    }),
  });
  if (!res.ok) throw new Error(`Submit failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  if (!data.json?.data?.url) {
    throw new Error(`Submit error: ${JSON.stringify(data.json?.errors || data)}`);
  }
  return data.json.data.url;
}

// ---- Submit comment ----
export async function submitComment(token, postFullname, body, userAgent) {
  const res = await fetch('https://oauth.reddit.com/api/comment', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'User-Agent': userAgent,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `thing_id=${postFullname}&text=${encodeURIComponent(body)}`,
  });
  if (!res.ok) throw new Error(`Comment failed: ${res.status}`);
  return res.json();
}

// ---- Verify identity ----
export async function getIdentity(token, userAgent) {
  const res = await fetch('https://oauth.reddit.com/api/v1/me', {
    headers: { 'Authorization': `Bearer ${token}`, 'User-Agent': userAgent },
  });
  if (!res.ok) throw new Error(`Identity check failed: ${res.status}`);
  return res.json();
}

// ---- CLI test mode ----
if (process.argv[1] && process.argv[1].endsWith('api.mjs')) {
  console.log('\n\x1b[1m🔑 Reddit API Test\x1b[0m\n');

  const creds = loadCredentials();
  if (!creds) {
    console.log('\x1b[31m✗\x1b[0m No Reddit credentials found in .env');
    console.log('  Required: REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD');
    process.exit(1);
  }
  console.log(`\x1b[36m▸\x1b[0m Found credentials for /u/${creds.REDDIT_USERNAME}`);

  try {
    const { token, userAgent } = await getToken(creds);
    console.log('\x1b[32m✓\x1b[0m Authentication successful');

    const me = await getIdentity(token, userAgent);
    console.log(`\x1b[32m✓\x1b[0m Logged in as: /u/${me.name} (${me.link_karma} link karma, ${me.comment_karma} comment karma)`);
    console.log(`\x1b[32m✓\x1b[0m Account age: ${Math.floor((Date.now() / 1000 - me.created_utc) / 86400)} days`);

    // Test image upload with an existing image if available
    const testImage = join(ROOT, 'scripts', 'reddit-posts', 'r-spiders', '001.jpg');
    if (existsSync(testImage)) {
      console.log('\n\x1b[36m▸\x1b[0m Testing image upload (r-spiders/001.jpg)...');
      const assetId = await uploadImage(token, testImage, userAgent);
      console.log(`\x1b[32m✓\x1b[0m Image uploaded — asset_id: ${assetId}`);
      console.log('\x1b[32m✓\x1b[0m Gallery posting should work. Ready to go!');
    } else {
      console.log('\n\x1b[33m⚠\x1b[0m No test image found at scripts/reddit-posts/r-spiders/001.jpg');
      console.log('  Auth works — image upload untested. Run the fetch stage first.');
    }

    console.log('\n\x1b[1m✨ All checks passed!\x1b[0m\n');
  } catch (e) {
    console.log(`\x1b[31m✗\x1b[0m ${e.message}`);
    if (e.message.includes('INVALID_GRANT') || e.message.includes('wrong_password')) {
      console.log('\n  Common fixes:');
      console.log('  • If you have 2FA enabled, password grant won\'t work.');
      console.log('    Either disable 2FA or use a dedicated posting account.');
      console.log('  • Double-check your username and password in .env');
      console.log('  • Make sure the app type is "script" (not web or installed)');
    }
    process.exit(1);
  }
}
```

- [ ] **Step 2: Add npm script and create directory**

In `package.json`, add:
```json
"reddit-api-test": "node scripts/reddit/api.mjs"
```

- [ ] **Step 3: Run the test**

Run: `npm run reddit-api-test`

Expected outcomes:
- **Success:** Shows username, karma, and successful image upload test
- **Auth failure:** Shows specific error and fix suggestions
- **Missing credentials:** Tells you what to add to `.env`

**STOP HERE.** If the API test fails, debug before proceeding. The most common issues:
- 2FA → need to disable or use alt account
- Wrong app type → must be "script"
- Typo in credentials → check .env carefully

- [ ] **Step 4: Commit**

```bash
git add scripts/reddit/api.mjs package.json
git commit -m "feat: extract Reddit API module with standalone test"
```

---

### Task 2: Subreddit Config & Content Types

**Files:**
- Create: `scripts/reddit/config.mjs`

Central config for all subreddits (existing 9 + new non-bug subs), content types, title rotation pools, and posting schedule windows. This file is imported by every other module.

- [ ] **Step 1: Create `scripts/reddit/config.mjs`**

```js
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(__dirname, '..', '..');
export const CACHE_DIR = join(ROOT, '.cache');
export const POSTS_DIR = join(__dirname, '..', 'reddit-posts');
export const OBS_FILE = join(ROOT, 'public', 'data', 'observations.json');
export const INAT_API = 'https://api.inaturalist.org/v1';
export const GAME_URL = 'https://dewanggogte.com/games/bugs/';

// ---- Content types ----
export const CONTENT_TYPES = {
  gallery: { label: 'Photo Gallery', format: 'gallery', imageCount: '4-6' },
  challenge: { label: 'Challenge Photo', format: 'image+text', imageCount: '1' },
  text: { label: 'Text Post', format: 'text', imageCount: '0' },
};

// ---- Subreddit registry ----
// Each sub defines: which content types are allowed, taxa for iNat queries,
// tone for copy generation, and optimal posting window (ET).
export const SUBREDDITS = {
  // -- Bug niche subs (gallery + challenge) --
  NatureIsFuckingLit: {
    name: 'r/NatureIsFuckingLit',
    subs: '~11.9M',
    tone: 'dramatic',
    categoryLabel: 'insects',
    contentTypes: ['gallery'],
    titlePrefix: '🔥 ',  // required by sub rules
    titleSuffix: ' 🔥',
    taxa: [
      { name: 'Insects', taxon_id: 47158, per_page: 20 },
      { name: 'Arachnids', taxon_id: 47119, per_page: 20 },
    ],
    postWindow: { hour: 7, minute: 0 }, // 7 AM ET
    minDaysBetween: 21,
  },
  spiders: {
    name: 'r/spiders',
    subs: '~299K',
    tone: 'default',
    categoryLabel: 'spiders',
    contentTypes: ['gallery', 'challenge'],
    taxa: [{ name: 'Spiders', taxon_id: 47118, per_page: 40 }],
    postWindow: { hour: 8, minute: 0 },
    minDaysBetween: 14,
  },
  entomology: {
    name: 'r/entomology',
    subs: '~208K',
    tone: 'formal',
    categoryLabel: 'insects',
    contentTypes: ['gallery', 'challenge', 'text'],
    taxa: [
      { name: 'Insects', taxon_id: 47158, per_page: 20 },
      { name: 'Arachnids', taxon_id: 47119, per_page: 20 },
    ],
    postWindow: { hour: 8, minute: 30 },
    minDaysBetween: 14,
  },
  insects: {
    name: 'r/insects',
    subs: '~194K',
    tone: 'default',
    categoryLabel: 'insects',
    contentTypes: ['gallery', 'challenge'],
    taxa: [{ name: 'Insects', taxon_id: 47158, per_page: 40 }],
    postWindow: { hour: 7, minute: 30 },
    minDaysBetween: 14,
  },
  awwnverts: {
    name: 'r/awwnverts',
    subs: '~136K',
    tone: 'cute',
    categoryLabel: 'bugs',
    contentTypes: ['gallery', 'challenge'],
    taxa: [
      { name: 'Insects', taxon_id: 47158, per_page: 20 },
      { name: 'Arachnids', taxon_id: 47119, per_page: 20 },
    ],
    postWindow: { hour: 9, minute: 0 },
    minDaysBetween: 14,
  },
  bees: {
    name: 'r/bees',
    subs: '~58K',
    tone: 'default',
    categoryLabel: 'bees',
    contentTypes: ['gallery', 'challenge'],
    taxa: [{ name: 'Bees', taxon_id: 630955, per_page: 40 }],
    postWindow: { hour: 8, minute: 0 },
    minDaysBetween: 14,
  },
  moths: {
    name: 'r/moths',
    subs: '~54K',
    tone: 'default',
    categoryLabel: 'moths',
    contentTypes: ['gallery', 'challenge'],
    taxa: [{ name: 'Moths', taxon_id: 47157, per_page: 40, excludeSubtaxon: 47224 }],
    postWindow: { hour: 8, minute: 30 },
    minDaysBetween: 14,
  },
  ants: {
    name: 'r/ants',
    subs: '~28K',
    tone: 'default',
    categoryLabel: 'ants',
    contentTypes: ['gallery'],
    taxa: [{ name: 'Ants', taxon_id: 47336, per_page: 40 }],
    postWindow: { hour: 9, minute: 0 },
    minDaysBetween: 21,
  },
  butterflies: {
    name: 'r/butterflies',
    subs: '~22K',
    tone: 'default',
    categoryLabel: 'butterflies',
    contentTypes: ['gallery', 'challenge'],
    taxa: [{ name: 'Butterflies', taxon_id: 47224, per_page: 40 }],
    postWindow: { hour: 9, minute: 0 },
    minDaysBetween: 14,
  },

  // -- Non-bug subs (text posts / dev stories) --
  WebGames: {
    name: 'r/WebGames',
    subs: '~440K',
    tone: 'casual',
    categoryLabel: 'game',
    contentTypes: ['text'],
    taxa: [],
    postWindow: { hour: 10, minute: 0 },
    minDaysBetween: 45, // very infrequent — new angle each time
  },
  SideProject: {
    name: 'r/SideProject',
    subs: '~120K',
    tone: 'builder',
    categoryLabel: 'project',
    contentTypes: ['text'],
    taxa: [],
    postWindow: { hour: 9, minute: 0 },
    minDaysBetween: 45,
  },
  IndieGaming: {
    name: 'r/IndieGaming',
    subs: '~320K',
    tone: 'casual',
    categoryLabel: 'game',
    contentTypes: ['text'],
    taxa: [],
    postWindow: { hour: 10, minute: 0 },
    minDaysBetween: 60,
  },
  InternetIsBeautiful: {
    name: 'r/InternetIsBeautiful',
    subs: '~17.5M',
    tone: 'concise',
    categoryLabel: 'web',
    contentTypes: ['text'],
    taxa: [],
    postWindow: { hour: 7, minute: 0 },
    minDaysBetween: 90, // strict sub, one shot
  },
};

// ---- Posting schedule ----
// Maps day-of-week (0=Sun) to subreddit targets for a 6-week rotation.
// Each week, the pipeline generates a fresh calendar from this template.
// The rotation ensures no sub is hit more than once per minDaysBetween.
export const WEEKLY_CADENCE = 4; // posts per week target
```

- [ ] **Step 2: Commit**

```bash
git add scripts/reddit/config.mjs
git commit -m "feat: add subreddit config with content types, tones, and schedule windows"
```

---

### Task 3: Title & Body Copy Rotation

**Files:**
- Create: `scripts/reddit/copy.mjs`
- Create: `tests/reddit-copy.test.js`

Generate varied, natural post text. Each call picks from rotation pools so consecutive posts to the same sub never look identical. The game link placement alternates between body text and follow-up comment.

- [ ] **Step 1: Write failing tests**

```js
// tests/reddit-copy.test.js
import { describe, it, expect } from 'vitest';
import { generateTitle, generateBody, generateFollowupComment, generateCaptions } from '../scripts/reddit/copy.mjs';

describe('generateTitle', () => {
  it('returns a non-empty string', () => {
    const title = generateTitle('gallery', 'spiders', { categoryLabel: 'spiders', tone: 'default' });
    expect(title).toBeTruthy();
    expect(typeof title).toBe('string');
  });

  it('adds fire emoji prefix/suffix for NatureIsFuckingLit', () => {
    const title = generateTitle('gallery', 'NatureIsFuckingLit', {
      categoryLabel: 'insects', tone: 'dramatic', titlePrefix: '🔥 ', titleSuffix: ' 🔥'
    });
    expect(title.startsWith('🔥 ')).toBe(true);
    expect(title.endsWith(' 🔥')).toBe(true);
  });

  it('generates challenge titles with question format', () => {
    const title = generateTitle('challenge', 'insects', { categoryLabel: 'insects', tone: 'default' }, {
      common_name: 'Orchid Mantis', species: 'Hymenopus coronatus'
    });
    expect(title).toBeTruthy();
  });

  it('does not repeat the same title consecutively', () => {
    const titles = new Set();
    for (let i = 0; i < 20; i++) {
      titles.add(generateTitle('gallery', 'spiders', { categoryLabel: 'spiders', tone: 'default' }));
    }
    // With randomization, should get at least 2 unique titles in 20 tries
    expect(titles.size).toBeGreaterThan(1);
  });
});

describe('generateBody', () => {
  it('returns body text with photographer credits', () => {
    const body = generateBody('gallery', { tone: 'default', categoryLabel: 'moths' }, {
      credits: ['Alice Smith', 'Bob Jones'],
      includeGameLink: true,
    });
    expect(body).toContain('Alice Smith');
    expect(body).toContain('Bob Jones');
  });

  it('conditionally includes game link', () => {
    const withLink = generateBody('gallery', { tone: 'default', categoryLabel: 'moths' }, {
      credits: ['Alice'], includeGameLink: true,
    });
    const withoutLink = generateBody('gallery', { tone: 'default', categoryLabel: 'moths' }, {
      credits: ['Alice'], includeGameLink: false,
    });
    expect(withLink).toContain('dewanggogte.com');
    expect(withoutLink).not.toContain('dewanggogte.com');
  });

  it('uses formal tone for entomology', () => {
    const body = generateBody('gallery', { tone: 'formal', categoryLabel: 'insects' }, {
      credits: ['Alice'], includeGameLink: true,
    });
    // Formal tone should not use casual phrases like "couldn't resist"
    expect(body).not.toContain("couldn't resist");
  });
});

describe('generateFollowupComment', () => {
  it('returns a comment with game link', () => {
    const comment = generateFollowupComment('gallery', { categoryLabel: 'spiders' });
    expect(comment).toContain('dewanggogte.com');
  });
});

describe('generateCaptions', () => {
  it('generates one caption per observation', () => {
    const obs = [
      { taxon: { common_name: 'Orchid Mantis', species: 'Hymenopus coronatus' }, attribution: '(c) Alice, some rights reserved (CC BY)' },
      { taxon: { common_name: 'Luna Moth', species: 'Actias luna' }, attribution: '(c) Bob, some rights reserved (CC BY)' },
    ];
    const captions = generateCaptions(obs);
    expect(captions).toHaveLength(2);
    expect(captions[0]).toContain('Orchid Mantis');
    expect(captions[0]).toContain('Alice');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/reddit-copy.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `scripts/reddit/copy.mjs`**

```js
import { GAME_URL } from './config.mjs';

// ---- Title pools ----
// Each pool entry is a template function. {label} = categoryLabel, {species} = challenge species name.
const GALLERY_TITLES = {
  default: [
    (l) => `Some of my favorite ${l} photos`,
    (l) => `A few stunning ${l} photos I came across`,
    (l) => `Sharing some gorgeous ${l} photos`,
    (l) => `Some beautiful ${l} photography`,
    (l) => `${l.charAt(0).toUpperCase() + l.slice(1)} photo dump — a few favourites`,
  ],
  dramatic: [
    (l) => `Some incredible ${l} photography`,
    (l) => `Stunning ${l} photos from citizen scientists`,
    (l) => `The most photogenic ${l} I've come across`,
  ],
  formal: [
    (l) => `Some remarkable ${l} photography`,
    (l) => `Notable ${l} observations — photo gallery`,
    (l) => `A selection of well-photographed ${l}`,
  ],
  cute: [
    (l) => `Some adorable ${l} photos`,
    (l) => `The cutest ${l} I've found`,
    (l) => `A few ${l} photos that made me smile`,
  ],
};

const CHALLENGE_TITLES = [
  (name) => `Can you identify this? 🔍`,
  (name) => `What species is this?`,
  (name) => `ID challenge — do you know this one?`,
  (name) => `Can anyone ID this?`,
  (name) => `Quick ID quiz — what is this?`,
];

const TEXT_TITLES = {
  casual: [
    () => `I built a "Guess the Bug" game — would love feedback`,
    () => `Made a bug identification quiz using real photos`,
  ],
  builder: [
    () => `I built a species identification game using iNaturalist photos`,
    () => `Side project: a bug ID quiz with 3,000+ species photos`,
  ],
  concise: [
    () => `Bug identification quiz game with real species photos`,
  ],
};

// ---- Body templates ----
const GALLERY_BODIES = {
  default: [
    (l, cr, link) => `I've been going through thousands of ${l} photos${link ? ` while working on a bug identification project (${GAME_URL})` : ''} and these are some of my favourites.\n\nAll photos are from iNaturalist (CC licensed).\n📸 ${cr}`,
    (l, cr, link) => `Here are a few ${l} photos that really stood out to me.\n\n${link ? `I've been curating these for a "Guess the Bug" game (${GAME_URL}) and ` : 'I'}wanted to share some of the best ones.\n\nAll from iNaturalist (CC licensed). 📸 ${cr}`,
    (l, cr, link) => `Some beautiful ${l} photography from citizen scientists on iNaturalist.${link ? `\n\nI've been going through these for a bug identification game (${GAME_URL}) — the photo quality on iNaturalist is unreal.` : ''}\n\n📸 ${cr}`,
  ],
  dramatic: [
    (l, cr, link) => `These are some of the most stunning ${l} photos I've come across.${link ? ` I've been curating ${l} photos for a project (${GAME_URL}) and` : ' I'} went through thousands — these ones stopped me in my tracks.\n\nAll from iNaturalist (CC licensed). 📸 ${cr}`,
  ],
  formal: [
    (l, cr, link) => `A selection of notable ${l} observations from iNaturalist, all research-grade with CC licensing.${link ? `\n\nI came across these while curating images for an insect identification project (${GAME_URL}).` : ''}\n\n📸 ${cr}`,
  ],
  cute: [
    (l, cr, link) => `I've been going through thousands of ${l} photos${link ? ` while building a "Guess the Bug" game (${GAME_URL})` : ''} and couldn't resist sharing some of the most adorable ones.\n\nAll from iNaturalist (CC licensed). 📸 ${cr}`,
    (l, cr, link) => `Some ${l} photos that are just too cute not to share.${link ? `\n\nI found these while curating photos for a bug ID game (${GAME_URL}).` : ''}\n\n📸 ${cr}`,
  ],
};

const CHALLENGE_BODIES = [
  (link) => `Came across this beauty on iNaturalist. Can anyone tell what species this is?\n\n${link ? `I've been curating bug photos for a quiz game (${GAME_URL}) and this one catches a lot of people off guard.` : 'The answer might surprise you!'}\n\nPhoto from iNaturalist (CC licensed).`,
  (link) => `Found this gorgeous specimen on iNaturalist. Any guesses on the species?\n\n${link ? `I run a bug identification game (${GAME_URL}) and this is one of the trickier ones.` : 'Harder than it looks!'}\n\nCC licensed photo from iNaturalist.`,
];

const FOLLOWUP_COMMENTS = {
  gallery: [
    (l) => `If anyone wants to test their ${l} ID skills, I've been working on a free quiz game: ${GAME_URL}\n\nIt uses real photos from iNaturalist — you try to identify the species from 4 choices. There's a streak mode if you want a challenge.`,
    (l) => `Fun fact: I originally found these photos while building a "Guess the Bug" game (${GAME_URL}). It's free, uses real photos, and has a daily challenge. Thought some folks here might enjoy it!`,
  ],
  challenge: [
    (l) => `If you enjoyed this, I built a free game where you identify species from real photos: ${GAME_URL}\n\nThere's a streak mode and a daily challenge. All photos from iNaturalist.`,
  ],
};

// ---- Helpers ----
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function formatCredits(creditsList) {
  const unique = [...new Set(creditsList)];
  if (unique.length <= 2) return unique.join(' and ');
  return unique.slice(0, -1).join(', ') + ', and ' + unique[unique.length - 1];
}

function extractPhotographer(attribution) {
  return attribution.replace(/\(c\)\s*/i, '').split(',')[0].trim();
}

// ---- Public API ----

export function generateTitle(contentType, subId, subConfig, challengeObs) {
  const prefix = subConfig.titlePrefix || '';
  const suffix = subConfig.titleSuffix || '';
  const label = subConfig.categoryLabel;
  let title;

  if (contentType === 'gallery') {
    const pool = GALLERY_TITLES[subConfig.tone] || GALLERY_TITLES.default;
    title = pick(pool)(label);
  } else if (contentType === 'challenge') {
    title = pick(CHALLENGE_TITLES)(challengeObs?.common_name || 'bug');
  } else if (contentType === 'text') {
    const pool = TEXT_TITLES[subConfig.tone] || TEXT_TITLES.casual;
    title = pick(pool)();
  }

  return `${prefix}${title}${suffix}`;
}

export function generateBody(contentType, subConfig, options = {}) {
  const { credits = [], includeGameLink = true, challengeObs } = options;
  const label = subConfig.categoryLabel;
  const creditStr = formatCredits(credits);

  if (contentType === 'gallery') {
    const pool = GALLERY_BODIES[subConfig.tone] || GALLERY_BODIES.default;
    return pick(pool)(label, creditStr, includeGameLink);
  } else if (contentType === 'challenge') {
    return pick(CHALLENGE_BODIES)(includeGameLink);
  }

  // Text posts are manually written — return a placeholder prompt
  return `[Write your post body here — this is a ${subConfig.tone} tone post for ${subConfig.name}]`;
}

export function generateFollowupComment(contentType, subConfig) {
  const pool = FOLLOWUP_COMMENTS[contentType] || FOLLOWUP_COMMENTS.gallery;
  return pick(pool)(subConfig.categoryLabel);
}

export function generateCaptions(observations) {
  return observations.map(obs => {
    const photographer = extractPhotographer(obs.attribution);
    return `${obs.taxon.common_name} (${obs.taxon.species}) — 📸 ${photographer} via iNaturalist`;
  });
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/reddit-copy.test.js`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add scripts/reddit/copy.mjs tests/reddit-copy.test.js
git commit -m "feat: add copy generation with title/body rotation pools per tone"
```

---

### Task 4: Content Generator

**Files:**
- Create: `scripts/reddit/content.mjs`

Generates content candidates for all three types: gallery photos (from iNaturalist API — existing logic), challenge photos (single standouts from the observation pool), and text post stubs. This replaces the fetch stage of the old pipeline.

- [ ] **Step 1: Create `scripts/reddit/content.mjs`**

```js
import { readFileSync, existsSync } from 'fs';
import { INAT_API, OBS_FILE, SUBREDDITS } from './config.mjs';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ---- iNaturalist API fetch (from existing pipeline) ----
async function apiFetch(endpoint, params = {}) {
  const url = new URL(`${INAT_API}${endpoint}`);
  for (const [key, val] of Object.entries(params)) {
    url.searchParams.set(key, String(val));
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url.toString(), {
        headers: { 'User-Agent': 'WhatsThatBugGame/1.0 (educational project; reddit pipeline)' },
      });
      if (!res.ok) throw new Error(`API error ${res.status}: ${url.toString()}`);
      return res.json();
    } catch (e) {
      if (attempt < 3) {
        console.log(`  ⚠ Fetch failed (attempt ${attempt}/3): ${e.message}. Retrying in 3s...`);
        await sleep(3000);
      } else {
        throw e;
      }
    }
  }
}

// ---- Gallery candidates ----
export async function fetchGalleryCandidates(subId, postedIds = new Set()) {
  const sub = SUBREDDITS[subId];
  if (!sub?.taxa?.length) return [];

  const candidates = [];
  for (const taxon of sub.taxa) {
    console.log(`  Fetching ${taxon.name} (top ${taxon.per_page} by faves)...`);
    const data = await apiFetch('/observations', {
      taxon_id: taxon.taxon_id,
      quality_grade: 'research',
      photo_license: 'cc-by,cc-by-sa,cc0',
      photos: 'true',
      per_page: taxon.per_page,
      order_by: 'votes',
    });
    await sleep(1100);

    const results = (data.results || [])
      .filter(obs => {
        if (!obs.taxon?.preferred_common_name) return false;
        if (!obs.photos?.[0]) return false;
        if (postedIds.has(String(obs.id))) return false;
        if (taxon.excludeSubtaxon && (obs.taxon.ancestor_ids || []).includes(taxon.excludeSubtaxon)) return false;
        return true;
      })
      .map(obs => ({
        id: obs.id,
        photo_url: obs.photos[0].url?.replace('square', 'medium'),
        photo_url_large: obs.photos[0].url?.replace('square', 'large'),
        photo_url_original: obs.photos[0].url?.replace('square', 'original'),
        attribution: obs.photos[0].attribution || '(c) Unknown',
        faves_count: obs.faves_count || 0,
        taxon: {
          id: obs.taxon.id,
          species: obs.taxon.name,
          common_name: obs.taxon.preferred_common_name,
        },
        inat_url: obs.uri || `https://www.inaturalist.org/observations/${obs.id}`,
      }));

    candidates.push(...results);
  }

  return candidates;
}

// ---- Challenge photo candidates ----
// Picks visually striking single photos from the existing observation pool.
// Selects by: high agreement count, interesting species name, order diversity.
export function pickChallengeCandidates(subId, postedIds = new Set(), count = 5) {
  const sub = SUBREDDITS[subId];
  if (!sub?.taxa?.length || !existsSync(OBS_FILE)) return [];

  const pool = JSON.parse(readFileSync(OBS_FILE, 'utf-8'));
  const taxonIds = new Set(sub.taxa.map(t => t.taxon_id));

  // Filter to relevant taxa + not already posted
  const eligible = pool.filter(obs => {
    if (postedIds.has(String(obs.id))) return false;
    // Match by order — the pool has full taxonomy
    if (obs.taxon?.order) {
      // For broad subs (insects, entomology), most things match.
      // For niche subs (spiders, bees), filter to matching orders.
      const orderMap = {
        47118: ['Araneae'],            // spiders
        630955: ['Hymenoptera'],       // bees (subset)
        47157: ['Lepidoptera'],        // moths
        47336: ['Hymenoptera'],        // ants (subset)
        47224: ['Lepidoptera'],        // butterflies (subset)
        47158: null,                   // insects — accept all
        47119: ['Araneae', 'Scorpiones', 'Opiliones', 'Acari'], // arachnids
      };
      for (const taxon of sub.taxa) {
        const allowed = orderMap[taxon.taxon_id];
        if (allowed === null) return true; // broad taxon
        if (allowed?.includes(obs.taxon.order)) return true;
      }
      return false;
    }
    return true;
  });

  // Sort by agreement count (proxy for photo quality) and pick top N
  return eligible
    .sort((a, b) => (b.num_agreements || 0) - (a.num_agreements || 0))
    .slice(0, count)
    .map(obs => ({
      id: obs.id,
      photo_url: obs.photo_url,
      photo_url_large: obs.photo_url?.replace('/medium.', '/large.'),
      photo_url_original: obs.photo_url?.replace('/medium.', '/original.'),
      attribution: obs.attribution || '(c) Unknown',
      faves_count: 0,
      taxon: {
        id: obs.taxon?.id,
        species: obs.taxon?.species,
        common_name: obs.taxon?.common_name,
      },
      inat_url: obs.inat_url || `https://www.inaturalist.org/observations/${obs.id}`,
      fromPool: true,
    }));
}

// ---- Scan existing pool for gallery supplements ----
export function scanExistingPool(subId, postedIds = new Set(), limit = 15) {
  if (!existsSync(OBS_FILE)) return [];
  const pool = JSON.parse(readFileSync(OBS_FILE, 'utf-8'));
  return pool
    .filter(obs => !postedIds.has(String(obs.id)))
    .sort((a, b) => (b.num_agreements || 0) - (a.num_agreements || 0))
    .slice(0, limit)
    .map(obs => ({
      id: obs.id,
      photo_url: obs.photo_url,
      photo_url_large: obs.photo_url?.replace('/medium.', '/large.'),
      photo_url_original: obs.photo_url?.replace('/medium.', '/original.'),
      attribution: obs.attribution || '(c) Unknown',
      faves_count: 0,
      taxon: {
        id: obs.taxon?.id,
        species: obs.taxon?.species,
        common_name: obs.taxon?.common_name,
      },
      inat_url: obs.inat_url || `https://www.inaturalist.org/observations/${obs.id}`,
      fromPool: true,
    }));
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/reddit/content.mjs
git commit -m "feat: add content generator for galleries and challenge photos"
```

---

### Task 5: Calendar & Queue System

**Files:**
- Create: `scripts/reddit/calendar.mjs`
- Create: `tests/reddit-calendar.test.js`

Manages the posting schedule. Generates a week's worth of posting slots, tracks what's been posted, identifies what's due. The calendar is a JSON file in `.cache/` that gets updated as posts go out.

- [ ] **Step 1: Write failing tests**

```js
// tests/reddit-calendar.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { generateWeekSlots, findDuePost, isSubEligible } from '../scripts/reddit/calendar.mjs';

describe('isSubEligible', () => {
  it('returns true when sub was never posted to', () => {
    expect(isSubEligible('spiders', [], 14)).toBe(true);
  });

  it('returns false when posted too recently', () => {
    const log = [{ subId: 'spiders', timestamp: new Date().toISOString() }];
    expect(isSubEligible('spiders', log, 14)).toBe(false);
  });

  it('returns true when enough days have passed', () => {
    const old = new Date();
    old.setDate(old.getDate() - 15);
    const log = [{ subId: 'spiders', timestamp: old.toISOString() }];
    expect(isSubEligible('spiders', log, 14)).toBe(true);
  });
});

describe('generateWeekSlots', () => {
  it('generates the expected number of slots', () => {
    const slots = generateWeekSlots(new Date('2026-04-13'), [], 4);
    expect(slots.length).toBe(4);
  });

  it('does not schedule same sub twice in one week', () => {
    const slots = generateWeekSlots(new Date('2026-04-13'), [], 4);
    const subs = slots.map(s => s.subId);
    expect(new Set(subs).size).toBe(subs.length);
  });

  it('respects minDaysBetween from post log', () => {
    const recentLog = [{ subId: 'spiders', timestamp: new Date().toISOString(), contentType: 'gallery' }];
    const slots = generateWeekSlots(new Date('2026-04-13'), recentLog, 4);
    const haSpiders = slots.some(s => s.subId === 'spiders');
    expect(haSpiders).toBe(false);
  });
});

describe('findDuePost', () => {
  it('returns null when nothing is due', () => {
    const futureSlots = [{ subId: 'spiders', scheduledAt: '2099-01-01T12:00:00Z', status: 'ready' }];
    expect(findDuePost(futureSlots)).toBeNull();
  });

  it('returns the earliest due post', () => {
    const pastSlots = [
      { subId: 'moths', scheduledAt: '2020-01-02T12:00:00Z', status: 'ready' },
      { subId: 'spiders', scheduledAt: '2020-01-01T12:00:00Z', status: 'ready' },
    ];
    expect(findDuePost(pastSlots).subId).toBe('spiders');
  });

  it('skips already-posted slots', () => {
    const slots = [
      { subId: 'spiders', scheduledAt: '2020-01-01T12:00:00Z', status: 'posted' },
      { subId: 'moths', scheduledAt: '2020-01-02T12:00:00Z', status: 'ready' },
    ];
    expect(findDuePost(slots).subId).toBe('moths');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/reddit-calendar.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `scripts/reddit/calendar.mjs`**

```js
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { CACHE_DIR, SUBREDDITS, WEEKLY_CADENCE } from './config.mjs';

const CALENDAR_FILE = join(CACHE_DIR, 'reddit-calendar.json');
const POST_LOG_FILE = join(CACHE_DIR, 'reddit-post-log.json');

// ---- Persistence ----
export function loadCalendar() {
  mkdirSync(CACHE_DIR, { recursive: true });
  if (existsSync(CALENDAR_FILE)) {
    return JSON.parse(readFileSync(CALENDAR_FILE, 'utf-8'));
  }
  return { slots: [], generatedAt: null };
}

export function saveCalendar(cal) {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(CALENDAR_FILE, JSON.stringify(cal, null, 2));
}

export function loadPostLog() {
  mkdirSync(CACHE_DIR, { recursive: true });
  if (existsSync(POST_LOG_FILE)) {
    return JSON.parse(readFileSync(POST_LOG_FILE, 'utf-8'));
  }
  return [];
}

export function savePostLog(log) {
  writeFileSync(POST_LOG_FILE, JSON.stringify(log, null, 2));
}

// ---- Eligibility ----
export function isSubEligible(subId, postLog, minDaysBetween) {
  const lastPost = postLog
    .filter(p => p.subId === subId)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];

  if (!lastPost) return true;

  const daysSince = (Date.now() - new Date(lastPost.timestamp).getTime()) / (1000 * 60 * 60 * 24);
  return daysSince >= minDaysBetween;
}

// ---- Schedule generation ----
// Distributes posts across the week: Tue, Wed, Thu, Sat are default post days.
// Picks eligible subs, alternating content types where the sub supports multiple.
const POST_DAYS = [2, 3, 4, 6]; // Tue, Wed, Thu, Sat

export function generateWeekSlots(weekStart, postLog, cadence = WEEKLY_CADENCE) {
  const slots = [];
  const eligible = Object.entries(SUBREDDITS)
    .filter(([id, sub]) => isSubEligible(id, postLog, sub.minDaysBetween))
    .map(([id, sub]) => ({ id, ...sub }));

  // Shuffle eligible subs for variety
  for (let i = eligible.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
  }

  const slotsToFill = Math.min(cadence, eligible.length, POST_DAYS.length);

  for (let i = 0; i < slotsToFill; i++) {
    const sub = eligible[i];
    const dayOfWeek = POST_DAYS[i % POST_DAYS.length];

    // Pick content type — prefer gallery for niche bug subs, alternate with challenge
    const lastType = postLog
      .filter(p => p.subId === sub.id)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0]?.contentType;

    let contentType;
    if (sub.contentTypes.length === 1) {
      contentType = sub.contentTypes[0];
    } else if (lastType === 'gallery' && sub.contentTypes.includes('challenge')) {
      contentType = 'challenge';
    } else {
      contentType = 'gallery'; // default to gallery
    }

    // Calculate scheduled time
    const scheduled = new Date(weekStart);
    const currentDay = scheduled.getDay();
    const daysUntil = (dayOfWeek - currentDay + 7) % 7 || 7;
    scheduled.setDate(scheduled.getDate() + daysUntil);
    scheduled.setHours(sub.postWindow.hour, sub.postWindow.minute, 0, 0);

    // Convert ET to UTC for storage (ET = UTC-4 during EDT, UTC-5 during EST)
    // Approximate: use -4 for Apr-Oct, -5 for Nov-Mar
    const month = scheduled.getMonth();
    const etOffset = (month >= 2 && month <= 10) ? 4 : 5;
    const utcScheduled = new Date(scheduled.getTime() + etOffset * 60 * 60 * 1000);

    slots.push({
      subId: sub.id,
      contentType,
      scheduledAt: utcScheduled.toISOString(),
      status: 'pending', // pending → ready (after curation) → posted
      postData: null,     // filled during prepare stage
    });
  }

  return slots;
}

// ---- Query ----
export function findDuePost(slots) {
  const now = new Date();
  return slots
    .filter(s => s.status === 'ready' && new Date(s.scheduledAt) <= now)
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))[0] || null;
}

export function getUpcomingSlots(slots) {
  return slots
    .filter(s => s.status !== 'posted')
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/reddit-calendar.test.js`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add scripts/reddit/calendar.mjs tests/reddit-calendar.test.js
git commit -m "feat: add posting calendar with schedule generation and eligibility checks"
```

---

### Task 6: Performance Tracker

**Files:**
- Create: `scripts/reddit/tracker.mjs`

Logs every post with metadata (sub, content type, time, URL) and allows recording engagement later. Tracks posted photos to prevent reuse. Simple append-only JSON log.

- [ ] **Step 1: Create `scripts/reddit/tracker.mjs`**

```js
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { CACHE_DIR } from './config.mjs';

const POST_LOG_FILE = join(CACHE_DIR, 'reddit-post-log.json');
const POSTED_PHOTOS_FILE = join(CACHE_DIR, 'reddit-posted-photos.json');

// ---- Post log ----
export function loadPostLog() {
  mkdirSync(CACHE_DIR, { recursive: true });
  if (existsSync(POST_LOG_FILE)) return JSON.parse(readFileSync(POST_LOG_FILE, 'utf-8'));
  return [];
}

export function savePostLog(log) {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(POST_LOG_FILE, JSON.stringify(log, null, 2));
}

export function logPost({ subId, contentType, url, title, observationIds = [] }) {
  const log = loadPostLog();
  log.push({
    subId,
    contentType,
    url: url || null,
    title,
    timestamp: new Date().toISOString(),
    observationIds,
    engagement: null, // filled manually later
  });
  savePostLog(log);
  return log;
}

// ---- Engagement (manual entry) ----
export function updateEngagement(postIndex, engagement) {
  const log = loadPostLog();
  if (postIndex >= 0 && postIndex < log.length) {
    log[postIndex].engagement = {
      ...engagement,
      recordedAt: new Date().toISOString(),
    };
    savePostLog(log);
  }
  return log;
}

// ---- Posted photos (reuse prevention) ----
export function loadPostedPhotos() {
  mkdirSync(CACHE_DIR, { recursive: true });
  if (existsSync(POSTED_PHOTOS_FILE)) return JSON.parse(readFileSync(POSTED_PHOTOS_FILE, 'utf-8'));
  return {};
}

export function savePostedPhotos(photos) {
  writeFileSync(POSTED_PHOTOS_FILE, JSON.stringify(photos, null, 2));
}

export function recordPostedPhotos(subId, observationIds) {
  const photos = loadPostedPhotos();
  for (const obsId of observationIds) {
    const key = String(obsId);
    if (!photos[key]) photos[key] = { count: 0, subreddits: [], lastPosted: null };
    photos[key].count++;
    photos[key].subreddits.push(`r/${subId}`);
    photos[key].lastPosted = new Date().toISOString();
  }
  savePostedPhotos(photos);
}

export function getPostedIds() {
  return new Set(Object.keys(loadPostedPhotos()));
}

// ---- Analytics ----
export function getSubStats(subId) {
  const log = loadPostLog().filter(p => p.subId === subId);
  const withEngagement = log.filter(p => p.engagement);
  return {
    totalPosts: log.length,
    lastPosted: log[log.length - 1]?.timestamp || null,
    avgUpvotes: withEngagement.length
      ? Math.round(withEngagement.reduce((sum, p) => sum + (p.engagement.upvotes || 0), 0) / withEngagement.length)
      : null,
    bestPost: withEngagement.sort((a, b) => (b.engagement?.upvotes || 0) - (a.engagement?.upvotes || 0))[0] || null,
    contentTypeCounts: log.reduce((acc, p) => { acc[p.contentType] = (acc[p.contentType] || 0) + 1; return acc; }, {}),
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/reddit/tracker.mjs
git commit -m "feat: add post performance tracker with engagement logging"
```

---

### Task 7: Review UI Upgrade

**Files:**
- Create: `scripts/reddit/review-server.mjs`
- Create: `scripts/reddit/review.html`

Upgrade the review UI to support: photo curation (existing), post preview with editable title/body, content type indication, and calendar slot assignment. The server handles both candidate data and post preview editing.

- [ ] **Step 1: Create `scripts/reddit/review-server.mjs`**

```js
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function startReviewServer(candidateData, subMeta, calendarSlots, onSave) {
  const PORT = 3847;
  const reviewHtml = readFileSync(join(__dirname, 'review.html'), 'utf-8');

  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      if (req.method === 'GET' && req.url === '/') {
        const injected = `<script>
          window.CANDIDATES = ${JSON.stringify(candidateData)};
          window.SUB_META = ${JSON.stringify(subMeta)};
          window.CALENDAR_SLOTS = ${JSON.stringify(calendarSlots)};
        </script>`;
        const html = reviewHtml.replace('</head>', injected + '\n</head>');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
      } else if (req.method === 'POST' && req.url === '/api/save') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            onSave(data);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
            server.close();
            resolve(data);
          } catch (e) {
            res.writeHead(400);
            res.end(e.message);
          }
        });
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.listen(PORT, () => {
      const url = `http://localhost:${PORT}`;
      console.log(`\x1b[36m▸\x1b[0m Review UI: ${url}`);
      import('child_process').then(cp => { cp.exec(`open "${url}"`); });
    });
  });
}
```

- [ ] **Step 2: Create `scripts/reddit/review.html`**

This is a substantial HTML file. Key changes from the existing `scripts/reddit-review.html`:
- Adds a "Post Preview" panel below each subreddit's photo grid
- Title and body text are editable inline (contenteditable divs)
- Shows content type badge (Gallery / Challenge / Text)
- Shows scheduled time for each slot
- "Include game link in body" toggle (when off, generates a follow-up comment instead)
- The save payload includes: selections (photo IDs), edited titles, edited bodies, game link placement per sub

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Reddit Content Pipeline — Review</title>
<style>
  :root {
    --bg: #1a1917;
    --surface: #222120;
    --text: #e0ddd8;
    --accent: #d4794e;
    --border: #2e2c28;
    --success: #5bc49a;
    --star: #f0c040;
    --muted: #9a9590;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--bg);
    color: var(--text);
    padding: 0;
    min-height: 100vh;
  }

  .header {
    position: sticky; top: 0; z-index: 20;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 16px 24px;
    display: flex; justify-content: space-between; align-items: center;
  }
  .header h1 { font-size: 20px; }

  .btn-done {
    padding: 10px 28px; background: var(--success); color: #0d3320;
    border: none; border-radius: 8px; font-weight: 700; font-size: 14px; cursor: pointer;
  }
  .btn-done:hover { filter: brightness(0.9); }

  .content { padding: 24px; max-width: 1400px; margin: 0 auto; }

  .sub-section { margin-bottom: 48px; }

  .sub-header {
    display: flex; justify-content: space-between; align-items: baseline;
    margin-bottom: 16px; border-bottom: 1px solid var(--border); padding-bottom: 8px;
  }
  .sub-header h2 { font-size: 18px; }
  .sub-count { font-size: 13px; color: var(--muted); }
  .sub-count .count { color: var(--star); font-weight: 700; }

  .content-type-badge {
    display: inline-block; padding: 2px 10px; border-radius: 4px;
    font-size: 11px; font-weight: 700; text-transform: uppercase; margin-left: 12px;
  }
  .badge-gallery { background: #2a4a3a; color: #5bc49a; }
  .badge-challenge { background: #4a3a2a; color: #d4794e; }
  .badge-text { background: #2a3a4a; color: #7ab0d4; }

  .schedule-info {
    font-size: 12px; color: var(--muted); margin-left: 12px;
  }

  .grid {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px;
  }
  @media (max-width: 1200px) { .grid { grid-template-columns: repeat(3, 1fr); } }
  @media (max-width: 768px) { .grid { grid-template-columns: repeat(2, 1fr); } }

  .card {
    background: var(--surface); border: 2px solid var(--border);
    border-radius: 10px; overflow: hidden; cursor: pointer;
    transition: border-color 0.15s, transform 0.1s; position: relative;
  }
  .card:hover { transform: translateY(-2px); }
  .card.starred { border-color: var(--star); }

  .card .star-badge {
    position: absolute; top: 8px; right: 8px; width: 32px; height: 32px;
    border-radius: 50%; background: rgba(0,0,0,0.6);
    display: flex; align-items: center; justify-content: center;
    font-size: 18px; z-index: 5;
  }
  .card.starred .star-badge { background: var(--star); }

  .card-image {
    width: 100%; aspect-ratio: 4 / 3; object-fit: cover; display: block; background: var(--border);
  }

  .card-body { padding: 10px 12px; }
  .card-species {
    font-size: 13px; font-weight: 600;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 2px;
  }
  .card-meta { font-size: 11px; color: var(--muted); display: flex; justify-content: space-between; }
  .faves { color: var(--star); }

  /* Post preview panel */
  .post-preview {
    margin-top: 20px; background: var(--surface); border: 1px solid var(--border);
    border-radius: 10px; padding: 20px;
  }
  .post-preview h3 { font-size: 14px; color: var(--muted); margin-bottom: 12px; text-transform: uppercase; letter-spacing: 1px; }

  .preview-field { margin-bottom: 16px; }
  .preview-field label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 4px; }
  .preview-field .editable {
    background: var(--bg); border: 1px solid var(--border); border-radius: 6px;
    padding: 10px 14px; color: var(--text); font-size: 14px; width: 100%;
    min-height: 36px; outline: none;
  }
  .preview-field .editable:focus { border-color: var(--accent); }
  .preview-field textarea.editable { min-height: 100px; resize: vertical; font-family: inherit; }

  .toggle-row {
    display: flex; align-items: center; gap: 10px; margin-top: 12px;
  }
  .toggle-row input[type="checkbox"] { width: 18px; height: 18px; accent-color: var(--accent); }
  .toggle-row label { font-size: 13px; color: var(--text); cursor: pointer; }

  .toast {
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    background: var(--success); color: #0d3320;
    padding: 10px 24px; border-radius: 8px; font-weight: 600; font-size: 14px;
    z-index: 100; display: none;
  }
</style>
</head>
<body>

<div class="header">
  <h1>Reddit Content Pipeline — Review</h1>
  <button class="btn-done" onclick="submitAll()">Save & Continue</button>
</div>

<div class="content" id="content"></div>
<div id="toast" class="toast"></div>

<script>
const starred = {};
const editedTitles = {};
const editedBodies = {};
const gameLinkInBody = {};

function init() {
  const container = document.getElementById('content');

  for (const slot of (window.CALENDAR_SLOTS || [])) {
    const subId = slot.subId;
    const candidates = window.CANDIDATES[subId] || [];
    const meta = window.SUB_META[subId] || { name: 'r/' + subId, title: '' };

    starred[subId] = new Set();
    gameLinkInBody[subId] = true;

    const section = document.createElement('div');
    section.className = 'sub-section';

    const badgeClass = slot.contentType === 'gallery' ? 'badge-gallery' : slot.contentType === 'challenge' ? 'badge-challenge' : 'badge-text';
    const schedDate = new Date(slot.scheduledAt);
    const schedStr = schedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
      ' ' + schedDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    let html = '<div class="sub-header">' +
      '<div><h2 style="display:inline">' + esc(meta.name) + '</h2>' +
      '<span class="content-type-badge ' + badgeClass + '">' + esc(slot.contentType) + '</span>' +
      '<span class="schedule-info">' + esc(schedStr) + '</span></div>' +
      '<div class="sub-count"><span class="count" id="count-' + subId + '">0</span> selected</div>' +
      '</div>';

    if (candidates.length > 0) {
      html += '<div class="grid" id="grid-' + subId + '"></div>';
    }

    html += '<div class="post-preview">' +
      '<h3>Post Preview</h3>' +
      '<div class="preview-field"><label>Title</label>' +
      '<input class="editable" id="title-' + subId + '" value="' + esc(meta.title || '') + '" oninput="editedTitles[\'' + subId + '\']=this.value"></div>' +
      '<div class="preview-field"><label>Body</label>' +
      '<textarea class="editable" id="body-' + subId + '" oninput="editedBodies[\'' + subId + '\']=this.value">' + esc(meta.body || '') + '</textarea></div>' +
      '<div class="toggle-row">' +
      '<input type="checkbox" id="gamelink-' + subId + '" checked onchange="gameLinkInBody[\'' + subId + '\']=this.checked">' +
      '<label for="gamelink-' + subId + '">Include game link in body (if unchecked, adds as follow-up comment)</label>' +
      '</div></div>';

    section.innerHTML = html;
    container.appendChild(section);

    // Populate photo grid
    const grid = section.querySelector('.grid');
    if (grid) {
      for (const obs of candidates) {
        grid.appendChild(createCard(subId, obs));
      }
    }

    editedTitles[subId] = meta.title || '';
    editedBodies[subId] = meta.body || '';
  }
}

function createCard(subId, obs) {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML =
    '<div class="star-badge">\u2606</div>' +
    '<img class="card-image" src="' + esc(obs.photo_url) + '" alt="' + esc(obs.taxon.common_name) + '" loading="lazy">' +
    '<div class="card-body">' +
    '<div class="card-species" title="' + esc(obs.taxon.common_name + ' (' + obs.taxon.species + ')') + '">' + esc(obs.taxon.common_name) + '</div>' +
    '<div class="card-meta">' +
    '<span>' + esc((obs.attribution || '').replace(/\(c\)\s*/i, '').split(',')[0]) + '</span>' +
    '<span class="faves">\u2665 ' + (obs.faves_count || 0) + '</span>' +
    '</div></div>';

  card.addEventListener('click', () => {
    if (starred[subId].has(obs.id)) {
      starred[subId].delete(obs.id);
      card.classList.remove('starred');
      card.querySelector('.star-badge').textContent = '\u2606';
    } else {
      starred[subId].add(obs.id);
      card.classList.add('starred');
      card.querySelector('.star-badge').textContent = '\u2605';
    }
    document.getElementById('count-' + subId).textContent = starred[subId].size;
  });
  return card;
}

async function submitAll() {
  const payload = {
    selections: {},
    titles: editedTitles,
    bodies: editedBodies,
    gameLinkInBody,
  };
  for (const [subId, ids] of Object.entries(starred)) {
    payload.selections[subId] = [...ids];
  }

  try {
    const res = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await res.text());
    const el = document.getElementById('toast');
    el.textContent = 'Saved! You can close this tab.';
    el.style.display = 'block';
  } catch (e) {
    alert('Save failed: ' + e.message);
  }
}

function esc(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

init();
</script>
</body>
</html>
```

- [ ] **Step 3: Commit**

```bash
git add scripts/reddit/review-server.mjs scripts/reddit/review.html
git commit -m "feat: add upgraded review UI with post preview editing and calendar slots"
```

---

### Task 8: Main Pipeline CLI

**Files:**
- Create: `scripts/reddit/pipeline.mjs`
- Modify: `package.json`

The main CLI that orchestrates all stages. Replaces the old monolithic pipeline. Supports subcommands: `generate` (fetch + generate calendar), `review` (open curation UI), `prepare` (download images + finalize posts), `post` (post the next due item), `status` (show calendar and stats), `log-engagement` (record post performance).

- [ ] **Step 1: Create `scripts/reddit/pipeline.mjs`**

```js
#!/usr/bin/env node

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';

import { SUBREDDITS, CACHE_DIR, POSTS_DIR, GAME_URL, ROOT } from './config.mjs';
import { loadCredentials, getToken, uploadImage, submitGallery, submitText, submitComment, getIdentity } from './api.mjs';
import { fetchGalleryCandidates, pickChallengeCandidates, scanExistingPool } from './content.mjs';
import { generateTitle, generateBody, generateFollowupComment, generateCaptions } from './copy.mjs';
import { loadCalendar, saveCalendar, generateWeekSlots, findDuePost, getUpcomingSlots } from './calendar.mjs';
import { loadPostLog, savePostLog, logPost, updateEngagement, recordPostedPhotos, getPostedIds, getSubStats } from './tracker.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = join(CACHE_DIR, 'reddit-content-state.json');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => { rl.question(question, answer => { rl.close(); resolve(answer.trim()); }); });
}
function log(msg) { console.log(`\x1b[36m▸\x1b[0m ${msg}`); }
function success(msg) { console.log(`\x1b[32m✓\x1b[0m ${msg}`); }
function warn(msg) { console.log(`\x1b[33m⚠\x1b[0m ${msg}`); }
function heading(msg) { console.log(`\n\x1b[1m\x1b[35m═══ ${msg} ═══\x1b[0m\n`); }

// ---- State management ----
function loadState() {
  mkdirSync(CACHE_DIR, { recursive: true });
  if (existsSync(STATE_FILE)) return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
  return { candidates: {}, selections: {}, posts: {} };
}
function saveState(state) {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ---- Subcommands ----

async function cmdGenerate() {
  heading('Generate Content Calendar');

  const postLog = loadPostLog();
  const cal = loadCalendar();

  // Check if there are still unposted slots
  const pending = (cal.slots || []).filter(s => s.status !== 'posted');
  if (pending.length > 0) {
    log(`${pending.length} unposted slots from previous generation:`);
    for (const s of pending) {
      const d = new Date(s.scheduledAt);
      log(`  ${s.subId} (${s.contentType}) — ${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} — ${s.status}`);
    }
    const cont = await ask('Generate new week anyway? Old unposted slots will be removed. (y/N): ');
    if (cont.toLowerCase() !== 'y') return;
  }

  // Generate new week
  const weekStart = new Date();
  const slots = generateWeekSlots(weekStart, postLog);

  log(`Generated ${slots.length} slots:`);
  for (const s of slots) {
    const d = new Date(s.scheduledAt);
    const dayStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    log(`  ${SUBREDDITS[s.subId]?.name || s.subId} — ${s.contentType} — ${dayStr} ${timeStr}`);
  }

  // Fetch content candidates
  const state = loadState();
  const postedIds = getPostedIds();

  for (const slot of slots) {
    const subId = slot.subId;
    const sub = SUBREDDITS[subId];
    if (!sub) continue;

    log(`\nFetching candidates for ${sub.name}...`);

    if (slot.contentType === 'gallery') {
      const fresh = await fetchGalleryCandidates(subId, postedIds);
      const pool = scanExistingPool(subId, postedIds);
      const seen = new Set(fresh.map(c => c.id));
      const combined = [...fresh, ...pool.filter(c => !seen.has(c.id))];
      state.candidates[subId] = combined;
      success(`${sub.name}: ${combined.length} gallery candidates`);
    } else if (slot.contentType === 'challenge') {
      state.candidates[subId] = pickChallengeCandidates(subId, postedIds, 10);
      success(`${sub.name}: ${state.candidates[subId].length} challenge candidates`);
    }
    // Text posts don't need image candidates
  }

  // Generate initial copy for each slot
  for (const slot of slots) {
    const sub = SUBREDDITS[slot.subId];
    if (!sub) continue;
    slot.generatedTitle = generateTitle(slot.contentType, slot.subId, sub);
    slot.generatedBody = generateBody(slot.contentType, sub, {
      credits: [], // filled after curation
      includeGameLink: true,
    });
  }

  cal.slots = slots;
  cal.generatedAt = new Date().toISOString();
  saveCalendar(cal);
  saveState(state);

  success('Calendar generated! Run "review" to curate content.');
}

async function cmdReview() {
  heading('Review & Curate Content');

  const cal = loadCalendar();
  const state = loadState();

  const pendingSlots = (cal.slots || []).filter(s => s.status === 'pending');
  if (pendingSlots.length === 0) {
    warn('No pending slots. Run "generate" first.');
    return;
  }

  // Build data for review UI
  const candidateData = {};
  const subMeta = {};
  for (const slot of pendingSlots) {
    const sub = SUBREDDITS[slot.subId];
    if (!sub) continue;
    candidateData[slot.subId] = state.candidates[slot.subId] || [];
    subMeta[slot.subId] = {
      name: sub.name,
      title: slot.generatedTitle || '',
      body: slot.generatedBody || '',
    };
  }

  const { startReviewServer } = await import('./review-server.mjs');
  const result = await startReviewServer(candidateData, subMeta, pendingSlots, (data) => {
    // Save selections and edited copy back to state + calendar
    state.selections = data.selections;
    saveState(state);

    for (const slot of cal.slots) {
      if (data.titles[slot.subId] !== undefined) slot.editedTitle = data.titles[slot.subId];
      if (data.bodies[slot.subId] !== undefined) slot.editedBody = data.bodies[slot.subId];
      if (data.gameLinkInBody[slot.subId] !== undefined) slot.gameLinkInBody = data.gameLinkInBody[slot.subId];
    }
    saveCalendar(cal);
    success('Selections and edits saved!');
  });
}

async function cmdPrepare() {
  heading('Prepare Posts');

  const cal = loadCalendar();
  const state = loadState();

  const pendingSlots = (cal.slots || []).filter(s => s.status === 'pending');
  if (pendingSlots.length === 0) {
    warn('No pending slots to prepare. Run "generate" and "review" first.');
    return;
  }

  for (const slot of pendingSlots) {
    const subId = slot.subId;
    const sub = SUBREDDITS[subId];
    if (!sub) continue;

    const selectedIds = new Set(state.selections[subId] || []);

    if (slot.contentType !== 'text' && selectedIds.size === 0) {
      warn(`${sub.name}: no photos selected, skipping`);
      continue;
    }

    const candidates = state.candidates[subId] || [];
    const selectedObs = candidates.filter(c => selectedIds.has(c.id));

    // Use edited title/body from review, or fall back to generated
    const title = slot.editedTitle || slot.generatedTitle || generateTitle(slot.contentType, subId, sub);
    const credits = selectedObs.map(o => (o.attribution || '').replace(/\(c\)\s*/i, '').split(',')[0].trim()).filter(Boolean);

    const body = slot.editedBody || generateBody(slot.contentType, sub, {
      credits,
      includeGameLink: slot.gameLinkInBody !== false,
    });

    if (slot.contentType === 'gallery' || slot.contentType === 'challenge') {
      log(`${sub.name}: downloading ${selectedObs.length} images...`);
      const subDir = join(POSTS_DIR, `r-${subId}`);
      mkdirSync(subDir, { recursive: true });

      for (let i = 0; i < selectedObs.length; i++) {
        const obs = selectedObs[i];
        const imgUrl = obs.photo_url_original || obs.photo_url_large || obs.photo_url;
        const ext = imgUrl.match(/\.(jpe?g|png|gif|webp)/i)?.[1] || 'jpg';
        const filename = `${String(i + 1).padStart(3, '0')}.${ext}`;
        const outputPath = join(subDir, filename);

        if (existsSync(outputPath)) {
          log(`  ${filename}: already downloaded`);
        } else {
          try {
            const res = await fetch(imgUrl, {
              headers: { 'User-Agent': 'WhatsThatBugGame/1.0 (educational project)' },
            });
            if (!res.ok) throw new Error(`${res.status}`);
            const buffer = Buffer.from(await res.arrayBuffer());
            writeFileSync(outputPath, buffer);
            log(`  ${filename}: ${(buffer.length / 1024).toFixed(0)} KB — ${obs.taxon.common_name}`);
            await sleep(500);
          } catch (e) {
            warn(`  ${filename}: download failed — ${e.message}`);
          }
        }
      }

      const captions = generateCaptions(selectedObs);
      const followupComment = slot.gameLinkInBody === false
        ? generateFollowupComment(slot.contentType, sub)
        : null;

      slot.postData = {
        title,
        body,
        captions,
        followupComment,
        images: selectedObs.map((obs, i) => {
          const ext = (obs.photo_url_original || obs.photo_url).match(/\.(jpe?g|png|gif|webp)/i)?.[1] || 'jpg';
          return {
            filename: `${String(i + 1).padStart(3, '0')}.${ext}`,
            caption: captions[i],
            obs_id: obs.id,
            inat_url: obs.inat_url,
          };
        }),
      };

      // Write preview
      const preview = `# Post for ${sub.name}\n\n**Type:** ${slot.contentType}\n**Title:** ${title}\n\n**Body:**\n${body}\n\n${followupComment ? `**Follow-up comment:**\n${followupComment}\n\n` : ''}**Images (${slot.postData.images.length}):**\n${slot.postData.images.map((img, i) => `${i + 1}. ${img.filename} — ${img.caption}`).join('\n')}\n`;
      writeFileSync(join(subDir, 'preview.md'), preview);
      writeFileSync(join(subDir, 'post.json'), JSON.stringify(slot.postData, null, 2));

    } else {
      // Text post
      slot.postData = { title, body, followupComment: null };
    }

    slot.status = 'ready';
    success(`${sub.name}: prepared (${slot.contentType})`);
  }

  saveCalendar(cal);
  saveState(state);

  // Show preview
  heading('Ready to Post');
  for (const slot of cal.slots.filter(s => s.status === 'ready')) {
    const d = new Date(slot.scheduledAt);
    console.log(`\x1b[1m${SUBREDDITS[slot.subId]?.name}\x1b[0m — ${slot.contentType}`);
    console.log(`  Title: ${slot.postData?.title}`);
    console.log(`  Scheduled: ${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`);
    if (slot.postData?.images) console.log(`  Images: ${slot.postData.images.length}`);
    console.log();
  }
  success('Run "post" when ready to publish the next due item.');
}

async function cmdPost() {
  heading('Post to Reddit');

  const creds = loadCredentials();
  if (!creds) {
    warn('No Reddit credentials in .env. Add REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD');
    return;
  }

  let token, userAgent;
  try {
    ({ token, userAgent } = await getToken(creds));
    success('Reddit authenticated');
  } catch (e) {
    warn(`Auth failed: ${e.message}`);
    return;
  }

  const cal = loadCalendar();

  // Find due post, or let user pick
  const readySlots = cal.slots.filter(s => s.status === 'ready');
  if (readySlots.length === 0) {
    warn('No posts ready. Run "generate", "review", and "prepare" first.');
    return;
  }

  const due = findDuePost(cal.slots);
  let slot;

  if (due) {
    const sub = SUBREDDITS[due.subId];
    log(`Next due: ${sub?.name} (${due.contentType}) — "${due.postData?.title}"`);
    const ok = await ask('Post this now? (Y/n): ');
    if (ok.toLowerCase() === 'n') {
      // Show all ready slots
      log('Ready posts:');
      readySlots.forEach((s, i) => {
        log(`  ${i + 1}. ${SUBREDDITS[s.subId]?.name} — ${s.contentType} — "${s.postData?.title}"`);
      });
      const pick = await ask('Which one? (number or "q" to quit): ');
      if (pick.toLowerCase() === 'q') return;
      slot = readySlots[parseInt(pick) - 1];
    } else {
      slot = due;
    }
  } else {
    log('Nothing due yet. Ready posts:');
    readySlots.forEach((s, i) => {
      const d = new Date(s.scheduledAt);
      log(`  ${i + 1}. ${SUBREDDITS[s.subId]?.name} — ${d.toLocaleDateString('en-US', { weekday: 'short' })} — "${s.postData?.title}"`);
    });
    const pick = await ask('Post which one now? (number or "q" to quit): ');
    if (pick.toLowerCase() === 'q') return;
    slot = readySlots[parseInt(pick) - 1];
  }

  if (!slot?.postData) {
    warn('Invalid selection or missing post data.');
    return;
  }

  const sub = SUBREDDITS[slot.subId];
  console.log(`\n\x1b[1mPosting to ${sub.name}\x1b[0m`);
  console.log(`  Title: ${slot.postData.title}`);
  console.log(`  Type: ${slot.contentType}`);
  if (slot.postData.images) console.log(`  Images: ${slot.postData.images.length}`);
  console.log(`\n  Body:\n  ${slot.postData.body.replace(/\n/g, '\n  ')}\n`);

  const confirm = await ask('Confirm post? (y/N): ');
  if (confirm.toLowerCase() !== 'y') {
    log('Cancelled.');
    return;
  }

  try {
    let postUrl;

    if (slot.contentType === 'gallery' && slot.postData.images?.length > 0) {
      log('Uploading images...');
      const assetIds = [];
      for (const img of slot.postData.images) {
        const imgPath = join(POSTS_DIR, `r-${slot.subId}`, img.filename);
        const assetId = await uploadImage(token, imgPath, userAgent);
        assetIds.push(assetId);
        log(`  Uploaded: ${img.filename}`);
        await sleep(1000);
      }

      log('Submitting gallery post...');
      postUrl = await submitGallery(
        token, slot.subId, slot.postData.title, slot.postData.body,
        assetIds, slot.postData.captions, userAgent
      );

    } else if (slot.contentType === 'challenge' && slot.postData.images?.length > 0) {
      // Challenge = single image post. Upload one image, submit as link.
      log('Uploading challenge image...');
      const imgPath = join(POSTS_DIR, `r-${slot.subId}`, slot.postData.images[0].filename);
      const assetId = await uploadImage(token, imgPath, userAgent);
      log('Submitting image post...');
      // Use gallery format even for single image — more consistent
      postUrl = await submitGallery(
        token, slot.subId, slot.postData.title, slot.postData.body,
        [assetId], [slot.postData.captions?.[0] || ''], userAgent
      );

    } else {
      // Text post
      log('Submitting text post...');
      postUrl = await submitText(token, slot.subId, slot.postData.title, slot.postData.body, userAgent);
    }

    success(`Posted! ${postUrl}`);

    // Post follow-up comment if configured
    if (slot.postData.followupComment && postUrl) {
      log('Waiting 5s before posting follow-up comment...');
      await sleep(5000);
      try {
        // Extract post ID from URL for the comment API
        // Reddit URLs: https://www.reddit.com/r/sub/comments/abc123/title/
        const postId = postUrl.match(/comments\/([a-z0-9]+)/)?.[1];
        if (postId) {
          await submitComment(token, `t3_${postId}`, slot.postData.followupComment, userAgent);
          success('Follow-up comment posted!');
        }
      } catch (e) {
        warn(`Follow-up comment failed: ${e.message}. Post it manually.`);
        console.log(`  Comment text: ${slot.postData.followupComment}`);
      }
    }

    // Update tracking
    slot.status = 'posted';
    slot.postedAt = new Date().toISOString();
    slot.postedUrl = postUrl;
    saveCalendar(cal);

    const obsIds = (slot.postData.images || []).map(i => i.obs_id).filter(Boolean);
    logPost({
      subId: slot.subId,
      contentType: slot.contentType,
      url: postUrl,
      title: slot.postData.title,
      observationIds: obsIds,
    });
    if (obsIds.length > 0) recordPostedPhotos(slot.subId, obsIds);

  } catch (e) {
    warn(`Posting failed: ${e.message}`);
    warn('You can try again or post manually.');
  }
}

async function cmdStatus() {
  heading('Pipeline Status');

  const cal = loadCalendar();
  const postLog = loadPostLog();

  if (cal.slots?.length > 0) {
    log('Current calendar:');
    for (const s of cal.slots) {
      const d = new Date(s.scheduledAt);
      const dayStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const status = s.status === 'posted' ? '\x1b[32m✓ posted\x1b[0m' :
        s.status === 'ready' ? '\x1b[33m● ready\x1b[0m' :
        '\x1b[90m○ pending\x1b[0m';
      console.log(`  ${status} ${SUBREDDITS[s.subId]?.name || s.subId} — ${s.contentType} — ${dayStr}`);
    }
  } else {
    log('No calendar generated. Run "generate" to create one.');
  }

  if (postLog.length > 0) {
    console.log();
    log(`Post history: ${postLog.length} total posts`);
    const recent = postLog.slice(-5);
    for (const p of recent) {
      const d = new Date(p.timestamp);
      const eng = p.engagement ? ` (${p.engagement.upvotes}↑ ${p.engagement.comments}💬)` : '';
      console.log(`  ${d.toLocaleDateString()} r/${p.subId} — ${p.contentType}${eng}`);
    }
  }

  // Sub stats
  console.log();
  log('Per-subreddit stats:');
  for (const [subId, sub] of Object.entries(SUBREDDITS)) {
    const stats = getSubStats(subId);
    if (stats.totalPosts > 0) {
      const avg = stats.avgUpvotes !== null ? ` (avg ${stats.avgUpvotes}↑)` : '';
      const last = stats.lastPosted ? ` — last: ${new Date(stats.lastPosted).toLocaleDateString()}` : '';
      console.log(`  ${sub.name}: ${stats.totalPosts} posts${avg}${last}`);
    }
  }
}

async function cmdLogEngagement() {
  heading('Log Engagement');

  const postLog = loadPostLog();
  const unlogged = postLog
    .map((p, i) => ({ ...p, index: i }))
    .filter(p => !p.engagement);

  if (unlogged.length === 0) {
    log('All posts have engagement data logged.');
    return;
  }

  for (const p of unlogged) {
    const d = new Date(p.timestamp);
    console.log(`\n\x1b[1mr/${p.subId}\x1b[0m — ${d.toLocaleDateString()} — "${p.title}"`);
    if (p.url) console.log(`  ${p.url}`);

    const upvotes = await ask('  Upvotes (or "s" to skip): ');
    if (upvotes.toLowerCase() === 's') continue;

    const comments = await ask('  Comments: ');
    const engagement = {
      upvotes: parseInt(upvotes) || 0,
      comments: parseInt(comments) || 0,
    };

    updateEngagement(p.index, engagement);
    success(`Logged: ${engagement.upvotes}↑ ${engagement.comments}💬`);
  }
}

// ---- Main ----
const command = process.argv[2] || 'status';
const commands = {
  generate: cmdGenerate,
  review: cmdReview,
  prepare: cmdPrepare,
  post: cmdPost,
  status: cmdStatus,
  'log-engagement': cmdLogEngagement,
};

if (!commands[command]) {
  console.log('\n\x1b[1m🐛 Reddit Content Pipeline\x1b[0m\n');
  console.log('Commands:');
  console.log('  generate         — Create posting calendar + fetch content candidates');
  console.log('  review           — Open browser UI to curate photos and edit post copy');
  console.log('  prepare          — Download images and finalize posts');
  console.log('  post             — Post the next due item to Reddit via API');
  console.log('  status           — Show calendar, post history, and stats');
  console.log('  log-engagement   — Record upvotes/comments for past posts');
  console.log();
  process.exit(0);
}

console.log('\n\x1b[1m🐛 Reddit Content Pipeline\x1b[0m\n');
commands[command]().catch(err => {
  console.error('\x1b[31mFailed:\x1b[0m', err);
  process.exit(1);
});
```

- [ ] **Step 2: Add npm scripts**

In `package.json`, add these scripts:
```json
"reddit": "node scripts/reddit/pipeline.mjs",
"reddit-generate": "node scripts/reddit/pipeline.mjs generate",
"reddit-review": "node scripts/reddit/pipeline.mjs review",
"reddit-prepare": "node scripts/reddit/pipeline.mjs prepare",
"reddit-post": "node scripts/reddit/pipeline.mjs post",
"reddit-status": "node scripts/reddit/pipeline.mjs status"
```

- [ ] **Step 3: Verify the pipeline runs**

Run: `npm run reddit`
Expected: Shows help text with available commands

Run: `npm run reddit-status`
Expected: Shows "No calendar generated. Run generate to create one."

- [ ] **Step 4: Commit**

```bash
git add scripts/reddit/pipeline.mjs package.json
git commit -m "feat: add main pipeline CLI with generate/review/prepare/post/status commands"
```

---

### Task 9: Playwright Automation Spec (Document Only)

**Files:**
- Create: `docs/superpowers/specs/2026-04-08-playwright-reddit-spec.md`

Write the full Playwright spec so it's ready to build if the Reddit API doesn't work out. No code — just the design document.

- [ ] **Step 1: Write the spec**

```markdown
# Playwright Reddit Posting Automation — Design Spec

**Status:** Spec only — not implemented. Build this if Reddit API posting proves unreliable.

**Purpose:** Automate Reddit gallery and text post submission via browser automation, with human-like behavior patterns to avoid bot detection.

---

## 1. Architecture

```
scripts/reddit/playwright/
├── poster.mjs        — Main posting orchestrator
├── auth.mjs          — Login + session persistence
├── human.mjs         — Human behavior simulation utilities
├── gallery-flow.mjs  — Gallery post submission flow
├── text-flow.mjs     — Text post submission flow
└── comment-flow.mjs  — Follow-up comment flow
```

### Dependencies
- `playwright` (Chromium only — install via `npx playwright install chromium`)
- No other new dependencies

### Session Persistence
- Browser context saved to `.cache/reddit-browser-state/`
- Uses Playwright's `storageState` API (saves cookies + localStorage)
- Login flow runs once, session reused until expiry
- Session validated on each run by checking for logged-in UI elements

---

## 2. Human Behavior Layer (`human.mjs`)

All interactions go through this layer. No direct `page.click()` or `page.fill()` calls.

### `slowType(page, selector, text, options?)`
- Focus the element with a click first
- Type each character with a random delay: 40-120ms per keystroke (normal distribution)
- Occasional 200-400ms pause mid-word (simulates thinking, ~5% chance per character)
- After completion, wait 100-300ms

### `slowClick(page, selector, options?)`
- Get element bounding box
- Move mouse from current position to element center with a bezier curve path (2-4 intermediate points)
- Movement duration: 200-500ms (varies with distance)
- Small random offset from exact center (±5px)
- mousedown → random 50-150ms delay → mouseup
- Wait 200-500ms after click

### `humanDelay(min, max)`
- Random wait between min and max milliseconds
- Uses normal distribution centered at (min+max)/2

### `randomScroll(page)`
- Small scroll up or down (50-200px) before interacting with elements
- 30% chance of triggering before any interaction

### `mouseJitter(page)`
- Small random mouse movements (10-30px) during idle waits
- Simulates human hand on mouse

### `tabBehavior(page)`
- After page load, wait 1-3 seconds (reading the page)
- Randomly scroll down 100-300px then back up
- 20% chance of hovering over a non-target element briefly

---

## 3. Auth Flow (`auth.mjs`)

### Login
1. Navigate to `https://www.reddit.com/login`
2. `tabBehavior()` — look at the page like a human
3. `slowClick` on username field
4. `slowType` username
5. `humanDelay(300, 800)` — pause between fields
6. `slowClick` on password field
7. `slowType` password
8. `humanDelay(500, 1200)` — read what you typed
9. `slowClick` on login button
10. Wait for navigation to complete (check for profile icon)
11. If 2FA prompt appears, pause and ask user to complete manually
12. Save `storageState` to `.cache/reddit-browser-state/state.json`

### Session Check
1. Load stored state
2. Navigate to `https://www.reddit.com`
3. Check for logged-in indicators (username in header, profile icon)
4. If logged in → proceed
5. If not → run login flow

---

## 4. Gallery Post Flow (`gallery-flow.mjs`)

1. Navigate to `https://www.reddit.com/r/{subreddit}/submit`
2. `tabBehavior()` — look at the page
3. `slowClick` on "Images & Video" tab (or "Gallery" depending on sub)
4. `humanDelay(500, 1000)`
5. For each image:
   a. Use `page.setInputFiles()` on the hidden file input (more reliable than drag simulation)
   b. Wait for upload progress to complete
   c. `humanDelay(800, 1500)` between uploads
   d. If caption field available, `slowType` the caption
6. `slowClick` on title field
7. `slowType` the title
8. `humanDelay(500, 1000)`
9. `slowClick` on body/text field
10. `slowType` the body (for long text, use faster typing: 20-60ms per char)
11. `humanDelay(1000, 2000)` — review what you wrote
12. **PAUSE: Open preview, notify user via terminal. Wait for keypress to confirm.**
13. `slowClick` on submit/post button
14. Wait for redirect to the new post
15. Return the post URL

---

## 5. Text Post Flow (`text-flow.mjs`)

Same as gallery but:
- Select "Text" tab instead of "Images & Video"
- No image upload step
- Otherwise identical (title → body → preview pause → submit)

---

## 6. Follow-up Comment Flow (`comment-flow.mjs`)

1. Navigate to the post URL
2. `tabBehavior()` — read your own post
3. Scroll down to comment box
4. `slowClick` on comment input
5. `slowType` the comment
6. `humanDelay(800, 1500)` — review
7. `slowClick` submit
8. Wait for comment to appear

---

## 7. Orchestration (`poster.mjs`)

### Main flow
1. Check/restore session
2. Load the prepared post data (from `scripts/reddit-posts/r-{sub}/post.json`)
3. Determine post type (gallery/text)
4. Run appropriate flow
5. If follow-up comment configured, run comment flow
6. Return post URL to caller

### Integration with pipeline
- The main `pipeline.mjs` would call `poster.mjs` instead of the API functions
- Same manual approval step before submission
- Same tracking after successful post

### headless vs headed
- Default: `headless: false` (you can see what's happening)
- The approval pause happens with the browser visible
- After approval, posting continues in the visible browser
- Future: can switch to headless for fully automated runs, but not recommended initially

---

## 8. Anti-Detection Considerations

- **Browser fingerprint:** Use stock Chromium (not modified). Playwright's default fingerprint is fine.
- **Timing:** All actions have human-like random delays. No instant interactions.
- **Session reuse:** Login once per week. Don't create fresh sessions for each post.
- **Volume:** Max 1 post per session, max 2 sessions per day. Low enough to be indistinguishable from manual posting.
- **Navigation patterns:** Don't navigate directly to /submit. Go to the subreddit first, browse briefly, then click the "Create Post" button.
- **User agent:** Use Playwright's default Chrome user agent (matches real Chrome).

---

## 9. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Reddit UI changes break selectors | High | Use data-testid and aria selectors where possible. Accept that maintenance is needed. |
| Account suspension for automation | Medium | Human-like behavior, low volume, manual approval, genuine content |
| 2FA blocks automated login | Low | Session persistence means login is rare. Manual 2FA when needed. |
| CAPTCHA on submission | Medium | Pause and notify user to solve manually. This is rare for established accounts. |
| Reddit's new-ish UI (sh.reddit.com) vs old (old.reddit.com) | Medium | Target new Reddit UI. Pin the selectors. |
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-04-08-playwright-reddit-spec.md
git commit -m "docs: add Playwright Reddit automation spec (not implemented)"
```

---

### Task 10: Integration Test — Full Pipeline Dry Run

**Files:**
- No new files — this is a manual test of the full flow

- [ ] **Step 1: Run API test**

Run: `npm run reddit-api-test`
Expected: Auth succeeds, image upload succeeds

- [ ] **Step 2: Generate a calendar**

Run: `npm run reddit-generate`
Expected: Calendar with 4 slots for the coming week, candidates fetched for each

- [ ] **Step 3: Review content**

Run: `npm run reddit-review`
Expected: Browser opens with photo grids + editable post previews. Star photos, edit titles/bodies, click Save.

- [ ] **Step 4: Prepare posts**

Run: `npm run reddit-prepare`
Expected: Images downloaded, preview.md and post.json written for each sub

- [ ] **Step 5: Check status**

Run: `npm run reddit-status`
Expected: Calendar shows slots as "ready", no post history yet

- [ ] **Step 6: Post one item (to a test subreddit or your profile)**

For safety, first test by posting to your own profile:
- Temporarily change a slot's `subId` in `.cache/reddit-calendar.json` to `u_YOUR_USERNAME`
- Run: `npm run reddit-post`
- Verify post appears on your profile

- [ ] **Step 7: Post to a real subreddit**

Run: `npm run reddit-post`
Select a slot, confirm, verify it posts successfully.

- [ ] **Step 8: Log engagement (after a few hours)**

Run: `node scripts/reddit/pipeline.mjs log-engagement`
Enter upvotes and comments for your test post.

- [ ] **Step 9: Commit working state**

```bash
git add -A
git commit -m "feat: complete reddit content pipeline — tested end-to-end"
```

---

## Summary

| Task | What it builds | Key files |
|------|---------------|-----------|
| 1 | Reddit API test | `scripts/reddit/api.mjs` |
| 2 | Subreddit config + content types | `scripts/reddit/config.mjs` |
| 3 | Title/body copy rotation | `scripts/reddit/copy.mjs`, `tests/reddit-copy.test.js` |
| 4 | Content generator (galleries + challenges) | `scripts/reddit/content.mjs` |
| 5 | Calendar/queue system | `scripts/reddit/calendar.mjs`, `tests/reddit-calendar.test.js` |
| 6 | Performance tracker | `scripts/reddit/tracker.mjs` |
| 7 | Review UI upgrade | `scripts/reddit/review-server.mjs`, `scripts/reddit/review.html` |
| 8 | Main pipeline CLI | `scripts/reddit/pipeline.mjs` |
| 9 | Playwright spec (doc only) | `docs/.../playwright-reddit-spec.md` |
| 10 | Integration test | Manual verification |
