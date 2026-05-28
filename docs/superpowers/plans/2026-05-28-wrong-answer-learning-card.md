# Wrong-Answer Learning Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Classic-mode (and Streak game-over) wrong-answer card with a light "learning card" that surfaces the single most useful diagnostic difference between the player's wrong pick and the correct answer.

**Architecture:** A pure, dependency-injected module (`learning-card.js`) computes the card content from the picked/correct taxa plus two new data files (`taxon-traits.json`, `bugs101-tells.json`). `game-ui.js` calls it on the Classic miss path and the Streak game-over screen. Content is generated offline by two batch scripts that reuse the existing `curate-species-content.js` Claude-CLI harness, then checked by a validation script.

**Tech Stack:** Vanilla ES modules, Vitest, Node scripts driving the `claude` CLI. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-28-wrong-answer-learning-card-design.md`

---

## File Structure

- **Create** `src/scripts/learning-card.js` — pure logic: `buildLearningCard(...)` + helpers (`pairKey`, `normalize`, `pickContrastDimension`, `stripHtml`, `firstSentence`). No DOM, no fetch.
- **Create** `tests/learning-card.test.js` — unit tests for the above.
- **Create** `public/data/taxon-traits.json` — starts as `{}`; filled by generation. Keyed by genus name + Bugs 101 category label.
- **Create** `public/data/bugs101-tells.json` — starts as `{}`; filled by generation. Keyed by sorted `"CatA|CatB"`.
- **Create** `scripts/generate-taxon-traits.mjs` — batch-generate trait entries.
- **Create** `scripts/generate-bugs101-tells.mjs` — batch-generate pairwise tells.
- **Create** `scripts/validate-traits.mjs` — schema + coverage validation (with a testable pure core).
- **Create** `tests/validate-traits.test.js` — unit tests for the validation core.
- **Modify** `src/scripts/game-ui.js` — load the new data in `initGame`; render via `buildLearningCard` in `handleClassicPostAnswer` (miss path) and `renderStreakGameOver`.
- **Modify** `src/styles/global.css` — add `.learning-tell` and `.learning-answer-sci` styles.

### `buildLearningCard` contract (used across tasks)

```js
buildLearningCard({ picked, correct, scoring, traits, bugs101Tells, speciesContent })
// → { title, answerName, answerSci, tell, funFact, learnMoreUrl }
```

- `picked`, `correct`: round objects with `.taxon` (`{ species, common_name, genus, family, order, ... }`), plus `correct.wikipedia_summary`, `correct.inat_url`.
- `scoring`: `'binary'` (Bugs 101) or `'genus'`.
- `traits`, `bugs101Tells`, `speciesContent`: the loaded JSON objects (default `{}`).
- `tell` is the bare clause shown after the "Quickest tell:" label, or `''` when no diagnostic data is available (renderer then omits the tell line).

---

## Task 1: Pure helpers in `learning-card.js`

**Files:**
- Create: `src/scripts/learning-card.js`
- Test: `tests/learning-card.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/learning-card.test.js
import { describe, it, expect } from 'vitest';
import { pairKey, normalize, pickContrastDimension, stripHtml, firstSentence } from '../src/scripts/learning-card.js';

describe('pairKey', () => {
  it('is order-independent and pipe-joined', () => {
    expect(pairKey('Spider', 'Beetle')).toBe('Beetle|Spider');
    expect(pairKey('Beetle', 'Spider')).toBe('Beetle|Spider');
  });
});

describe('normalize', () => {
  it('lowercases and collapses non-alphanumerics', () => {
    expect(normalize('2 body sections, 8 legs')).toBe('2 body sections 8 legs');
    expect(normalize('  Hard wing-covers!  ')).toBe('hard wing covers');
  });
});

describe('pickContrastDimension', () => {
  const beetle = { structure: '3 parts, 6 legs', wings: 'hard covers', size: '2-40 mm', color: 'glossy' };
  it('returns the first priority dimension that differs', () => {
    const spider = { structure: '2 parts, 8 legs', wings: 'none', size: '4-18 mm', color: 'fuzzy' };
    expect(pickContrastDimension(beetle, spider)).toBe('structure');
  });
  it('skips dimensions that match and picks the next differing one', () => {
    const twin = { ...beetle, structure: '3 parts, 6 legs', wings: 'hard covers', color: 'metallic green' };
    expect(pickContrastDimension(beetle, twin)).toBe('color');
  });
  it('returns null when all dimensions match', () => {
    expect(pickContrastDimension(beetle, { ...beetle })).toBeNull();
  });
  it('returns null when either side is missing', () => {
    expect(pickContrastDimension(beetle, null)).toBeNull();
    expect(pickContrastDimension(undefined, beetle)).toBeNull();
  });
});

describe('stripHtml / firstSentence', () => {
  it('strips tags and collapses whitespace', () => {
    expect(stripHtml('<p>Hello <strong>there</strong></p>')).toBe('Hello there');
  });
  it('returns only the first sentence', () => {
    expect(firstSentence('<p>Big eyes. Jumps far. Eats flies.</p>')).toBe('Big eyes.');
  });
  it('returns the whole string when there is no terminal punctuation', () => {
    expect(firstSentence('a lone fragment')).toBe('a lone fragment');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/learning-card.test.js`
Expected: FAIL — `Failed to resolve import "../src/scripts/learning-card.js"`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/scripts/learning-card.js
export const TRAIT_PRIORITY = ['structure', 'wings', 'size', 'color'];

export function pairKey(a, b) {
  return [a, b].sort().join('|');
}

export function normalize(s) {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function pickContrastDimension(pickedTraits, correctTraits) {
  if (!pickedTraits || !correctTraits) return null;
  for (const dim of TRAIT_PRIORITY) {
    const a = normalize(pickedTraits[dim]);
    const b = normalize(correctTraits[dim]);
    if (a && b && a !== b) return dim;
  }
  return null;
}

export function stripHtml(html) {
  return String(html ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

export function firstSentence(text) {
  const t = stripHtml(text);
  if (!t) return '';
  const m = t.match(/^.*?[.!?](\s|$)/);
  return m ? m[0].trim() : t;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/learning-card.test.js`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/scripts/learning-card.js tests/learning-card.test.js
git commit -m "feat: learning-card pure helpers"
```

---

## Task 2: `buildLearningCard` — all three tiers

**Files:**
- Modify: `src/scripts/learning-card.js`
- Test: `tests/learning-card.test.js`

- [ ] **Step 1: Write the failing test** (append to `tests/learning-card.test.js`)

```js
import { buildLearningCard } from '../src/scripts/learning-card.js';

const spider = {
  taxon: { species: 'Phidippus audax', common_name: 'Bold Jumper', genus: 'Phidippus', family: 'Salticidae', order: 'Araneae' },
  wikipedia_summary: 'The bold jumper is a common jumping spider. It has iridescent chelicerae.',
  inat_url: 'https://inat/spider',
};
const beetlePick = {
  taxon: { species: 'Harmonia axyridis', common_name: 'Asian Lady Beetle', genus: 'Harmonia', family: 'Coccinellidae', order: 'Coleoptera' },
};

describe('buildLearningCard — Bugs 101 (binary) tier', () => {
  const bugs101Tells = { 'Beetle|Jumping Spider': 'count the legs — spiders have 8, beetles only 6' };
  it('uses the pairwise tell looked up by category pair', () => {
    const card = buildLearningCard({ picked: beetlePick, correct: spider, scoring: 'binary', bugs101Tells });
    expect(card.tell).toBe('count the legs — spiders have 8, beetles only 6');
    expect(card.answerName).toBe('Bold Jumper');
    expect(card.answerSci).toBe('Phidippus audax');
    expect(card.learnMoreUrl).toBe('https://inat/spider');
  });
  it('falls back to category traits contrast when no pairwise tell exists', () => {
    const traits = {
      'Jumping Spider': { structure: '2 parts, 8 legs', wings: 'none', size: '4-18 mm', color: 'fuzzy' },
      'Beetle': { structure: '3 parts, 6 legs', wings: 'hard covers', size: '2-40 mm', color: 'glossy' },
    };
    const card = buildLearningCard({ picked: beetlePick, correct: spider, scoring: 'binary', bugs101Tells: {}, traits });
    expect(card.tell).toBe('Bold Jumper has 2 parts, 8 legs, while Asian Lady Beetle has 3 parts, 6 legs');
  });
});

describe('buildLearningCard — genus tier', () => {
  const traits = {
    Phidippus: { structure: '2 parts, 8 legs', wings: 'none', size: '4-18 mm', color: 'fuzzy, big eyes', key_mark: 'oversized front eyes' },
    Harmonia: { structure: '3 parts, 6 legs', wings: 'hard covers', size: '5-8 mm', color: 'orange domed shell' },
  };
  it('contrasts the highest-priority differing dimension', () => {
    const card = buildLearningCard({ picked: beetlePick, correct: spider, scoring: 'genus', traits });
    expect(card.tell).toBe('Bold Jumper has 2 parts, 8 legs, while Asian Lady Beetle has 3 parts, 6 legs');
  });
  it('falls back to the answer key_mark when traits are indistinguishable', () => {
    const samePick = { taxon: { ...spider.taxon, species: 'Phidippus regius', common_name: 'Regal Jumper', genus: 'Phidippus2' } };
    const t2 = { ...traits, Phidippus2: { ...traits.Phidippus, key_mark: 'x' } };
    const card = buildLearningCard({ picked: samePick, correct: spider, scoring: 'genus', traits: t2 });
    expect(card.tell).toBe('oversized front eyes');
  });
  it('returns empty tell when no trait data exists', () => {
    const card = buildLearningCard({ picked: beetlePick, correct: spider, scoring: 'genus', traits: {} });
    expect(card.tell).toBe('');
  });
});

describe('buildLearningCard — fun fact', () => {
  it('prefers species-content summary, stripped to one sentence', () => {
    const speciesContent = { 'Phidippus audax': { summary: '<p>It can <strong>see</strong> in color. More text here.</p>' } };
    const card = buildLearningCard({ picked: beetlePick, correct: spider, scoring: 'genus', traits: {}, speciesContent });
    expect(card.funFact).toBe('It can see in color.');
  });
  it('falls back to wikipedia_summary first sentence', () => {
    const card = buildLearningCard({ picked: beetlePick, correct: spider, scoring: 'genus', traits: {} });
    expect(card.funFact).toBe('The bold jumper is a common jumping spider.');
  });
  it('always sets title', () => {
    const card = buildLearningCard({ picked: beetlePick, correct: spider, scoring: 'genus', traits: {} });
    expect(card.title).toBe('Close one!');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/learning-card.test.js`
Expected: FAIL — `buildLearningCard is not a function`.

- [ ] **Step 3: Write minimal implementation** (append to `src/scripts/learning-card.js`)

```js
import { getBugs101Name } from './game-engine.js';

function contrastSentence(answerName, correctTraits, pickedName, pickedTraits) {
  const dim = pickContrastDimension(pickedTraits, correctTraits);
  if (!dim) return '';
  return `${answerName} has ${correctTraits[dim]}, while ${pickedName} has ${pickedTraits[dim]}`;
}

export function buildLearningCard({ picked, correct, scoring, traits = {}, bugs101Tells = {}, speciesContent = {} }) {
  const ct = correct.taxon;
  const pt = picked.taxon;
  const answerName = ct.common_name;
  const pickedName = pt.common_name;

  let tell = '';
  if (scoring === 'binary') {
    const cc = getBugs101Name(ct);
    const pc = getBugs101Name(pt);
    const pair = bugs101Tells[pairKey(pc, cc)];
    if (pair) {
      tell = pair;
    } else {
      tell = contrastSentence(answerName, traits[cc], pickedName, traits[pc])
        || (traits[cc] && traits[cc].key_mark) || '';
    }
  } else {
    const correctTraits = traits[ct.genus];
    const pickedTraits = traits[pt.genus];
    tell = contrastSentence(answerName, correctTraits, pickedName, pickedTraits)
      || (correctTraits && correctTraits.key_mark) || '';
  }

  const sc = speciesContent[ct.species];
  const funFact = firstSentence(sc && sc.summary ? sc.summary : correct.wikipedia_summary);

  return {
    title: 'Close one!',
    answerName,
    answerSci: ct.species,
    tell,
    funFact,
    learnMoreUrl: correct.inat_url || '',
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/learning-card.test.js`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/scripts/learning-card.js tests/learning-card.test.js
git commit -m "feat: buildLearningCard three-tier tell resolution"
```

---

## Task 3: Card CSS

**Files:**
- Modify: `src/styles/global.css` (append after the existing `.feedback-card.miss` block, near line 881)

- [ ] **Step 1: Add styles**

```css
/* Wrong-answer learning card — Direction C */
.learning-answer-sci {
  color: var(--text-secondary);
  font-style: italic;
  font-size: var(--text-sm);
}
.learning-tell {
  font-size: var(--text-sm);
  line-height: 1.5;
  margin-top: var(--space-3);
}
.learning-tell .learning-tell-lead {
  color: var(--accent);
  font-weight: 600;
}
.learning-funfact {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  line-height: 1.45;
  margin-top: var(--space-4);
}
```

- [ ] **Step 2: Verify the build still compiles**

Run: `npm run build`
Expected: build completes with no CSS errors.

- [ ] **Step 3: Commit**

```bash
git add src/styles/global.css
git commit -m "style: learning card tell/funfact styles"
```

---

## Task 4: Seed empty data files + load them in `initGame`

The runtime must degrade gracefully before content is generated, so seed empty objects and load them defensively.

**Files:**
- Create: `public/data/taxon-traits.json`
- Create: `public/data/bugs101-tells.json`
- Modify: `src/scripts/game-ui.js` (`initGame`, lines ~150–166)

- [ ] **Step 1: Create the seed files**

`public/data/taxon-traits.json`:
```json
{}
```
`public/data/bugs101-tells.json`:
```json
{}
```

- [ ] **Step 2: Add module-level state and import** in `src/scripts/game-ui.js`

Add to the import block (after line 6):
```js
import { buildLearningCard } from './learning-card.js';
```
Add near the other module-level `let` declarations (after line 88):
```js
let taxonTraits = {};
let bugs101Tells = {};
let speciesContent = {};
```

- [ ] **Step 3: Load the files in `initGame`**

Replace the `Promise.all` fetch block (lines ~152–166) so the three new files load in parallel and default to `{}` on any failure:

```js
    const [obsRes, taxRes, setsRes, diffRes, traitsRes, tellsRes, scRes] = await Promise.all([
      fetch(`${base}/data/observations.json`),
      fetch(`${base}/data/taxonomy.json`),
      fetch(`${base}/data/sets.json`),
      fetch(`${base}/data/difficulty.json`).catch(() => ({ ok: false })),
      fetch(`${base}/data/taxon-traits.json`).catch(() => ({ ok: false })),
      fetch(`${base}/data/bugs101-tells.json`).catch(() => ({ ok: false })),
      fetch(`${base}/data/species-content.json`).catch(() => ({ ok: false })),
    ]);

    if (!obsRes.ok || !taxRes.ok || !setsRes.ok) {
      throw new Error('One or more data files failed to load');
    }

    observations = await obsRes.json();
    taxonomy = await taxRes.json();
    sets = await setsRes.json();
    difficulty = diffRes.ok ? await diffRes.json().catch(() => null) : null;
    taxonTraits = traitsRes.ok ? await traitsRes.json().catch(() => ({})) : {};
    bugs101Tells = tellsRes.ok ? await tellsRes.json().catch(() => ({})) : {};
    speciesContent = scRes.ok ? await scRes.json().catch(() => ({})) : {};
```

- [ ] **Step 4: Verify the build compiles**

Run: `npm run build`
Expected: build completes with no errors.

- [ ] **Step 5: Commit**

```bash
git add public/data/taxon-traits.json public/data/bugs101-tells.json src/scripts/game-ui.js
git commit -m "feat: load learning-card data in initGame"
```

---

## Task 5: Render the learning card on the Classic miss path

**Files:**
- Modify: `src/scripts/game-ui.js` (`handleClassicPostAnswer`, lines ~686–737)

- [ ] **Step 1: Replace breadcrumb/blurb construction and the miss-card HTML**

In `handleClassicPostAnswer`, the correct-answer branch (`score === 100`) is unchanged. Replace the wrong-answer content. Compute the card once:

```js
function handleClassicPostAnswer(score, picked, correct, timeTaken) {
  let feedbackClass, feedbackTitle;
  if (score === 100) { feedbackClass = 'exact'; feedbackTitle = 'Nailed it!'; }
  else { feedbackClass = 'miss'; feedbackTitle = 'Not quite'; }

  const badgeClass = score === 100 ? 'badge-success' : score >= 50 ? 'badge-warning' : 'badge-error';

  let bodyHTML;
  if (score === 100) {
    let blurb = correct.wikipedia_summary || '';
    if (blurb && !blurb.match(/[.!?]$/)) {
      const lastSentence = blurb.lastIndexOf('. ');
      if (lastSentence > 40) blurb = blurb.slice(0, lastSentence + 1);
      else { const lastSpace = blurb.lastIndexOf(' '); blurb = lastSpace > 20 ? blurb.slice(0, lastSpace) + '...' : blurb + '...'; }
    }
    bodyHTML = `<strong>${escapeHTML(correct.taxon.common_name)}</strong> (<em>${escapeHTML(correct.taxon.species)}</em>)${blurb ? `<br>${escapeHTML(blurb)}` : ''}`;
  } else {
    const card = buildLearningCard({
      picked, correct, scoring: session.setDef.scoring,
      traits: taxonTraits, bugs101Tells, speciesContent,
    });
    bodyHTML = `
      <div>This is a <strong>${escapeHTML(card.answerName)}</strong> <span class="learning-answer-sci">${escapeHTML(card.answerSci)}</span>.</div>
      ${card.tell ? `<p class="learning-tell"><span class="learning-tell-lead">Quickest tell:</span> ${escapeHTML(card.tell)}.</p>` : ''}
      ${card.funFact ? `<p class="learning-funfact">${escapeHTML(card.funFact)}</p>` : ''}`;
    feedbackTitle = card.title;
  }

  const feedbackHTML = `
    <div class="feedback-card ${feedbackClass} anim-slide-up" style="margin-top: 16px;">
      <div class="feedback-title">${feedbackTitle}</div>
      <div class="feedback-body">${bodyHTML}</div>
      <div style="margin-top: 8px;">
        <span class="badge ${badgeClass}">+${score} pts</span>
        <a href="${escapeHTML(correct.inat_url)}" target="_blank" rel="noopener" style="margin-left: 12px; font-size: 13px;">Learn more →</a>
      </div>
      <div class="reactions" id="reactions">
        <button class="reaction-btn" data-difficulty="too_easy">Too Easy</button>
        <button class="reaction-btn" data-difficulty="just_right">Just Right</button>
        <button class="reaction-btn" data-difficulty="too_hard">Too Hard</button>
      </div>
    </div>
    <div style="text-align: center; margin-top: 16px;">
      <button class="btn-next-round" id="next-btn">
        ${session.isComplete ? 'See Results' : 'Next Round →'}
      </button>
    </div>
  `;

  container.querySelector('.container').insertAdjacentHTML('beforeend', feedbackHTML);
```

Leave the rest of the function (scroll, reaction handlers, next-btn handler) unchanged.

- [ ] **Step 2: Verify existing tests still pass and build compiles**

Run: `npm run build && npx vitest run`
Expected: build OK; all tests pass (no test targets this DOM function, so none should break).

- [ ] **Step 3: Commit**

```bash
git add src/scripts/game-ui.js
git commit -m "feat: render learning card on classic miss path"
```

---

## Task 6: Render the learning card on the Streak game-over screen

**Files:**
- Modify: `src/scripts/game-ui.js` (`renderStreakGameOver`, lines ~1153–1224)

- [ ] **Step 1: Replace the breadcrumb/blurb block and the `feedback-card miss` markup**

Delete the `breadcrumb`/`blurb` construction (lines ~1153–1172). Add before building `container.innerHTML`:

```js
  const learning = buildLearningCard({
    picked, correct, scoring: session.setDef.scoring,
    traits: taxonTraits, bugs101Tells, speciesContent,
  });
```

Replace the `<div class="feedback-card miss">…</div>` block (lines ~1214–1224) with:

```js
      <div class="feedback-card miss" style="margin-top: 16px;">
        <div class="feedback-title">The one that got away</div>
        <div class="feedback-body">
          <div>This is a <strong>${escapeHTML(learning.answerName)}</strong> <span class="learning-answer-sci">${escapeHTML(learning.answerSci)}</span>.</div>
          ${learning.tell ? `<p class="learning-tell"><span class="learning-tell-lead">Quickest tell:</span> ${escapeHTML(learning.tell)}.</p>` : ''}
          ${learning.funFact ? `<p class="learning-funfact">${escapeHTML(learning.funFact)}</p>` : ''}
        </div>
        <div style="margin-top: 8px;">
          <a href="${escapeHTML(correct.inat_url)}" target="_blank" rel="noopener" style="font-size: 13px;">Learn more →</a>
        </div>
      </div>
```

Note: `renderStreakSummary` (line ~1245) calls `renderStreakGameOver` with an empty picked taxon and a minimal correct object; `buildLearningCard` handles missing traits (empty `tell`) and missing `wikipedia_summary` (empty `funFact`) without throwing.

- [ ] **Step 2: Verify build + tests**

Run: `npm run build && npx vitest run`
Expected: build OK; all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/scripts/game-ui.js
git commit -m "feat: render learning card on streak game-over"
```

---

## Task 7: `generate-taxon-traits.mjs`

Generates one trait entry per genus and per Bugs 101 category, grounded on each group's observation `wikipedia_summary` text. Mirrors `scripts/curate-species-content.js` (batched `claude -p`, resumable, concurrency waves, save-per-wave).

**Files:**
- Create: `scripts/generate-taxon-traits.mjs`

- [ ] **Step 1: Write the script**

```js
#!/usr/bin/env node
// scripts/generate-taxon-traits.mjs
// Generates diagnostic trait entries (structure, wings, size, color, key_mark)
// per genus and per Bugs 101 category. Resumable; saves after each wave.
// Usage: node scripts/generate-taxon-traits.mjs [--batch-size 20] [--model sonnet] [--concurrency 8]

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { getBugs101Name } from '../src/scripts/game-engine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OBS_PATH = join(ROOT, 'public', 'data', 'observations.json');
const OUT_PATH = join(ROOT, 'public', 'data', 'taxon-traits.json');

const args = process.argv.slice(2);
const getArg = (n, d) => { const i = args.indexOf(`--${n}`); return i !== -1 && args[i + 1] ? args[i + 1] : d; };
const BATCH_SIZE = parseInt(getArg('batch-size', '20'), 10);
const MODEL = getArg('model', 'sonnet');
const CONCURRENCY = parseInt(getArg('concurrency', '8'), 10);

const observations = JSON.parse(readFileSync(OBS_PATH, 'utf-8'));
const output = existsSync(OUT_PATH) ? JSON.parse(readFileSync(OUT_PATH, 'utf-8')) : {};

// Build grounding groups: one per genus, one per Bugs 101 category.
const groups = {}; // key -> { kind, taxon, extracts:Set }
function add(key, kind, taxon, summary) {
  if (!groups[key]) groups[key] = { kind, taxon, extracts: new Set() };
  if (summary) groups[key].extracts.add(summary.slice(0, 400));
}
for (const o of observations) {
  const t = o.taxon;
  if (t.genus) add(t.genus, 'genus', t, o.wikipedia_summary);
  add(getBugs101Name(t), 'category', t, o.wikipedia_summary);
}

const pending = Object.entries(groups).filter(([key]) => !output[key]);
console.log(`Groups: ${Object.keys(groups).length} | Done: ${Object.keys(output).length} | Pending: ${pending.length}`);
if (pending.length === 0) { console.log('Nothing to do.'); process.exit(0); }

const SYSTEM_PROMPT = `You are an entomologist writing terse, photo-checkable diagnostic field marks for an insect ID game.
Output ONLY valid JSON, starting with { and ending with }. For each key, return:
{ "structure": "...", "wings": "...", "size": "...", "color": "...", "key_mark": "..." }
Rules:
- Each value is a short phrase, max ~80 characters, no trailing period.
- "structure": body plan + legs/antennae (e.g. "2 body sections, 8 legs, no antennae").
- "wings": wing covers / wing type / "none".
- "size": typical body length range (e.g. "4-18 mm").
- "color": diagnostic coloration/pattern.
- "key_mark": the single most distinctive at-a-glance giveaway.
- Describe the GROUP generally; do not invent specifics you are unsure of.
- No emoji, no markdown, no commentary.`;

function buildPrompt(batch) {
  const input = {};
  for (const [key, g] of batch) {
    input[key] = { rank: g.kind, example_species: g.taxon.species, common: g.taxon.common_name, family: g.taxon.family, order: g.taxon.order, notes: [...g.extracts].slice(0, 3) };
  }
  return `Produce trait objects for these ${batch.length} taxa. Return a JSON object with the same keys.\n\n${JSON.stringify(input)}`;
}

function runBatch(batch, idx, total) {
  const keys = batch.map(([k]) => k);
  return new Promise((resolve) => {
    const child = execFile('claude', ['-p', '--model', MODEL, '--output-format', 'json', '--no-session-persistence', '--tools', '', '--system-prompt', SYSTEM_PROMPT],
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024, timeout: 600_000 }, (err, stdout) => {
        if (err) { console.error(`  ✗ batch ${idx + 1}/${total}: ${err.message.split('\n')[0]}`); return resolve(null); }
        try {
          const env = JSON.parse(stdout);
          if (env.is_error) { console.error(`  ✗ batch ${idx + 1}: ${env.result}`); return resolve(null); }
          const cleaned = env.result.replace(/^```json?\n?/m, '').replace(/\n?```$/m, '').trim();
          const parsed = JSON.parse(cleaned.startsWith('{') ? cleaned : cleaned.match(/\{[\s\S]*\}/)[0]);
          const results = {};
          for (const k of keys) {
            const e = parsed[k];
            if (e && e.structure && e.wings && e.size && e.color && e.key_mark) {
              results[k] = { structure: e.structure, wings: e.wings, size: e.size, color: e.color, key_mark: e.key_mark };
            }
          }
          console.log(`  ✓ batch ${idx + 1}/${total}: ${Object.keys(results).length}/${batch.length} ($${(env.total_cost_usd || 0).toFixed(4)})`);
          resolve(results);
        } catch (e) { console.error(`  ✗ batch ${idx + 1} parse: ${e.message}`); resolve(null); }
      });
    child.stdin.write(buildPrompt(batch)); child.stdin.end();
  });
}

const batches = [];
for (let i = 0; i < pending.length; i += BATCH_SIZE) batches.push(pending.slice(i, i + BATCH_SIZE));
for (let w = 0; w < batches.length; w += CONCURRENCY) {
  const wave = batches.slice(w, w + CONCURRENCY);
  console.log(`Wave ${Math.floor(w / CONCURRENCY) + 1}/${Math.ceil(batches.length / CONCURRENCY)}`);
  const results = await Promise.all(wave.map((b, j) => runBatch(b, w + j, batches.length)));
  for (const r of results) if (r) Object.assign(output, r);
  writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));
}
console.log(`Done. Total entries: ${Object.keys(output).length} → ${OUT_PATH}`);
```

- [ ] **Step 2: Smoke-test the grouping logic without spending tokens**

Run: `node -e "import('./scripts/generate-taxon-traits.mjs')" --help 2>/dev/null || node --check scripts/generate-taxon-traits.mjs && echo "syntax ok"`
Expected: `syntax ok` (syntax check only; do not run the full generation yet — that happens in Task 10).

- [ ] **Step 3: Commit**

```bash
git add scripts/generate-taxon-traits.mjs
git commit -m "feat: taxon-traits generation script"
```

---

## Task 8: `generate-bugs101-tells.mjs`

Generates one giveaway clause per unordered pair of Bugs 101 categories that co-occur in the `bugs_101` set.

**Files:**
- Create: `scripts/generate-bugs101-tells.mjs`

- [ ] **Step 1: Write the script**

```js
#!/usr/bin/env node
// scripts/generate-bugs101-tells.mjs
// Generates a one-line "quickest tell" giveaway per unordered Bugs 101 category pair.
// Resumable; saves after each wave. Run AFTER generate-taxon-traits.mjs (uses its output as grounding).
// Usage: node scripts/generate-bugs101-tells.mjs [--batch-size 25] [--model sonnet] [--concurrency 8]

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { getBugs101Name } from '../src/scripts/game-engine.js';
import { pairKey } from '../src/scripts/learning-card.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const observations = JSON.parse(readFileSync(join(ROOT, 'public', 'data', 'observations.json'), 'utf-8'));
const sets = JSON.parse(readFileSync(join(ROOT, 'public', 'data', 'sets.json'), 'utf-8'));
const traits = existsSync(join(ROOT, 'public', 'data', 'taxon-traits.json'))
  ? JSON.parse(readFileSync(join(ROOT, 'public', 'data', 'taxon-traits.json'), 'utf-8')) : {};
const OUT_PATH = join(ROOT, 'public', 'data', 'bugs101-tells.json');
const output = existsSync(OUT_PATH) ? JSON.parse(readFileSync(OUT_PATH, 'utf-8')) : {};

const args = process.argv.slice(2);
const getArg = (n, d) => { const i = args.indexOf(`--${n}`); return i !== -1 && args[i + 1] ? args[i + 1] : d; };
const BATCH_SIZE = parseInt(getArg('batch-size', '25'), 10);
const MODEL = getArg('model', 'sonnet');
const CONCURRENCY = parseInt(getArg('concurrency', '8'), 10);

// Distinct categories present in the bugs_101 set.
const cats = [...new Set(sets.bugs_101.observation_ids.map(i => getBugs101Name(observations[i].taxon)))].sort();
const pairs = [];
for (let i = 0; i < cats.length; i++) for (let j = i + 1; j < cats.length; j++) pairs.push(pairKey(cats[i], cats[j]));
const pending = pairs.filter(p => !output[p]);
console.log(`Categories: ${cats.length} | Pairs: ${pairs.length} | Done: ${Object.keys(output).length} | Pending: ${pending.length}`);
if (pending.length === 0) { console.log('Nothing to do.'); process.exit(0); }

const SYSTEM_PROMPT = `You write a single short "quickest tell" clause that helps a beginner distinguish two bug categories.
Input is a JSON object whose keys are "CategoryA|CategoryB". For each key return a string.
Rules:
- The clause completes the sentence "Quickest tell: ___." — so write only the clause, no leading "Quickest tell".
- Max ~90 characters, no trailing period, no emoji, no markdown.
- Name the most reliable at-a-glance difference (e.g. "count the legs — spiders have 8, beetles only 6").
Output ONLY valid JSON: an object with the same keys mapping to strings. Start with { end with }.`;

function buildPrompt(batch) {
  const input = {};
  for (const key of batch) {
    const [a, b] = key.split('|');
    input[key] = { a, b, a_traits: traits[a] || null, b_traits: traits[b] || null };
  }
  return `Write the tell clause for these ${batch.length} pairs. Return a JSON object with the same keys.\n\n${JSON.stringify(input)}`;
}

function runBatch(batch, idx, total) {
  return new Promise((resolve) => {
    const child = execFile('claude', ['-p', '--model', MODEL, '--output-format', 'json', '--no-session-persistence', '--tools', '', '--system-prompt', SYSTEM_PROMPT],
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024, timeout: 600_000 }, (err, stdout) => {
        if (err) { console.error(`  ✗ batch ${idx + 1}/${total}: ${err.message.split('\n')[0]}`); return resolve(null); }
        try {
          const env = JSON.parse(stdout);
          if (env.is_error) { console.error(`  ✗ batch ${idx + 1}: ${env.result}`); return resolve(null); }
          const cleaned = env.result.replace(/^```json?\n?/m, '').replace(/\n?```$/m, '').trim();
          const parsed = JSON.parse(cleaned.startsWith('{') ? cleaned : cleaned.match(/\{[\s\S]*\}/)[0]);
          const results = {};
          for (const key of batch) if (typeof parsed[key] === 'string' && parsed[key].trim()) results[key] = parsed[key].trim();
          console.log(`  ✓ batch ${idx + 1}/${total}: ${Object.keys(results).length}/${batch.length} ($${(env.total_cost_usd || 0).toFixed(4)})`);
          resolve(results);
        } catch (e) { console.error(`  ✗ batch ${idx + 1} parse: ${e.message}`); resolve(null); }
      });
    child.stdin.write(buildPrompt(batch)); child.stdin.end();
  });
}

const batches = [];
for (let i = 0; i < pending.length; i += BATCH_SIZE) batches.push(pending.slice(i, i + BATCH_SIZE));
for (let w = 0; w < batches.length; w += CONCURRENCY) {
  const wave = batches.slice(w, w + CONCURRENCY);
  console.log(`Wave ${Math.floor(w / CONCURRENCY) + 1}/${Math.ceil(batches.length / CONCURRENCY)}`);
  const results = await Promise.all(wave.map((b, j) => runBatch(b, w + j, batches.length)));
  for (const r of results) if (r) Object.assign(output, r);
  writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));
}
console.log(`Done. Total tells: ${Object.keys(output).length} → ${OUT_PATH}`);
```

- [ ] **Step 2: Syntax check**

Run: `node --check scripts/generate-bugs101-tells.mjs && echo "syntax ok"`
Expected: `syntax ok`.

- [ ] **Step 3: Commit**

```bash
git add scripts/generate-bugs101-tells.mjs
git commit -m "feat: bugs101 pairwise tell generation script"
```

---

## Task 9: Validation script with a testable core

**Files:**
- Create: `scripts/validate-traits.mjs`
- Test: `tests/validate-traits.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/validate-traits.test.js
import { describe, it, expect } from 'vitest';
import { validateTraitEntry, coverageReport } from '../scripts/validate-traits.mjs';

describe('validateTraitEntry', () => {
  const good = { structure: '2 parts, 8 legs', wings: 'none', size: '4-18 mm', color: 'fuzzy', key_mark: 'big eyes' };
  it('passes a complete short entry', () => {
    expect(validateTraitEntry(good)).toEqual([]);
  });
  it('flags a missing field', () => {
    const { wings, ...rest } = good;
    expect(validateTraitEntry(rest)).toContain('missing wings');
  });
  it('flags an over-long field', () => {
    expect(validateTraitEntry({ ...good, color: 'x'.repeat(130) })).toContain('color too long (130)');
  });
});

describe('coverageReport', () => {
  it('lists required keys absent from traits', () => {
    const report = coverageReport(['Phidippus', 'Beetle'], { Phidippus: {} });
    expect(report.missing).toEqual(['Beetle']);
    expect(report.present).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/validate-traits.test.js`
Expected: FAIL — cannot resolve `../scripts/validate-traits.mjs`.

- [ ] **Step 3: Write the implementation**

```js
#!/usr/bin/env node
// scripts/validate-traits.mjs
// Validates public/data/taxon-traits.json: schema + length + coverage against live sets.
// Exports pure helpers for unit testing; runs a CLI report when invoked directly.

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const FIELDS = ['structure', 'wings', 'size', 'color', 'key_mark'];
const MAX_LEN = 120;

export function validateTraitEntry(entry) {
  const errors = [];
  if (!entry || typeof entry !== 'object') return ['not an object'];
  for (const f of FIELDS) {
    if (!entry[f] || !String(entry[f]).trim()) errors.push(`missing ${f}`);
    else if (String(entry[f]).length > MAX_LEN) errors.push(`${f} too long (${String(entry[f]).length})`);
  }
  return errors;
}

export function coverageReport(requiredKeys, traits) {
  const missing = requiredKeys.filter(k => !traits[k]);
  return { required: requiredKeys.length, present: requiredKeys.length - missing.length, missing };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const ROOT = join(__dirname, '..');
  const traits = JSON.parse(readFileSync(join(ROOT, 'public', 'data', 'taxon-traits.json'), 'utf-8'));
  const observations = JSON.parse(readFileSync(join(ROOT, 'public', 'data', 'observations.json'), 'utf-8'));
  const sets = JSON.parse(readFileSync(join(ROOT, 'public', 'data', 'sets.json'), 'utf-8'));
  const { getBugs101Name } = await import('../src/scripts/game-engine.js');

  let schemaErrors = 0;
  for (const [key, entry] of Object.entries(traits)) {
    const errs = validateTraitEntry(entry);
    if (errs.length) { schemaErrors++; console.log(`  ✗ ${key}: ${errs.join(', ')}`); }
  }

  const liveGenera = new Set();
  const liveCats = new Set();
  for (const [setKey, def] of Object.entries(sets)) {
    for (const i of def.observation_ids) {
      const t = observations[i].taxon;
      if (def.scoring === 'binary') liveCats.add(getBugs101Name(t));
      else if (t.genus) liveGenera.add(t.genus);
    }
  }
  const gc = coverageReport([...liveGenera], traits);
  const cc = coverageReport([...liveCats], traits);
  console.log(`\nSchema errors: ${schemaErrors}`);
  console.log(`Genus coverage: ${gc.present}/${gc.required} (missing ${gc.missing.length})`);
  console.log(`Category coverage: ${cc.present}/${cc.required} (missing ${cc.missing.length})`);
  if (gc.missing.length) console.log(`  Missing genera: ${gc.missing.slice(0, 30).join(', ')}${gc.missing.length > 30 ? ' …' : ''}`);
  if (cc.missing.length) console.log(`  Missing categories: ${cc.missing.join(', ')}`);
  process.exit(schemaErrors > 0 ? 1 : 0);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/validate-traits.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/validate-traits.mjs tests/validate-traits.test.js
git commit -m "feat: trait validation script + coverage report"
```

---

## Task 10: Generate content and validate (manual, billable)

This task runs the LLM generation — it costs money and takes time. Do NOT run it inside a subagent; run it interactively and review output.

- [ ] **Step 1: Generate traits**

Run: `node scripts/generate-taxon-traits.mjs --model sonnet`
Expected: progresses wave by wave, writing `public/data/taxon-traits.json` after each wave; resumable if interrupted (re-run to continue). Final line reports total entries (~1,100).

- [ ] **Step 2: Generate pairwise tells**

Run: `node scripts/generate-bugs101-tells.mjs --model sonnet`
Expected: writes `public/data/bugs101-tells.json`; final line reports total tells.

- [ ] **Step 3: Validate**

Run: `node scripts/validate-traits.mjs`
Expected: `Schema errors: 0`; genus and category coverage at or near 100% for live sets. Re-run the relevant generator to fill any reported gaps, then re-validate.

- [ ] **Step 4: Spot-review accuracy**

Manually read ~20 random genus entries and all category entries in `public/data/taxon-traits.json`, plus ~15 pairs in `public/data/bugs101-tells.json`. Confirm the field marks are entomologically correct (no invented specifics). Hand-fix any wrong entries directly in the JSON. This is the accuracy gate the spec calls for.

- [ ] **Step 5: Commit the generated content**

```bash
git add public/data/taxon-traits.json public/data/bugs101-tells.json
git commit -m "content: diagnostic traits and Bugs 101 pairwise tells"
```

---

## Task 11: Manual UI verification

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Verify Classic / Bugs 101 (pairwise tier)**

Open the Bugs 101 classic game, answer a round **wrong**. Confirm: card shows "Close one!", "This is a **X** *(species)*", a "Quickest tell:" line sourced from the pairwise file, a one-sentence fun fact, the +0 badge, Learn more link, reactions, and Next. Copy reads light/breezy.

- [ ] **Step 3: Verify Classic / a genus set (contrast + fallback)**

Open a genus set (e.g. Beetles) classic game. Answer wrong with a **different-family** pick → expect a contrast "X has …, while Y has …" tell. Answer wrong with a **same-family** pick (a near lookalike) → expect the key-mark fallback. Confirm no console errors.

- [ ] **Step 4: Verify Streak game-over**

Play Streak, miss to trigger game-over. Confirm the "The one that got away" card now shows the learning-card content (answer line + tell + fun fact) and renders without errors.

- [ ] **Step 5: Verify graceful degradation**

Temporarily rename `public/data/taxon-traits.json` and `public/data/bugs101-tells.json`, reload, play a wrong answer. Confirm the card still renders (tell line simply omitted; fun fact still shows). Restore the files.

- [ ] **Step 6: Full test + build gate**

Run: `npx vitest run && npm run build`
Expected: all tests pass, build succeeds.

---

## Risks & Tradeoffs (carried from spec)

- **Genus-level granularity** (chosen over family-level): ~4× generation cost and higher accuracy risk; Task 10's spot-review is the mitigation. Most same-family pairs fall back to `key_mark` anyway.
- **Weak templated genus contrasts** when only `color` differs; Bugs 101 gets the strong hand-authored pairwise lines.
- **+1 MB payload** from loading `species-content.json` in-game for richer fun facts (spec-approved). If load time regresses, the lean fallback is to drop it and use `wikipedia_summary` only — `buildLearningCard` already handles an empty `speciesContent`.
- **Content staleness**: re-run the generators + `validate-traits.mjs` when the species pool changes; both scripts are resumable so top-ups are cheap.
```
