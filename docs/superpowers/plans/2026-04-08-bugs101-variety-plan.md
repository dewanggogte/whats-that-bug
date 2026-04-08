# Bugs 101 Variety & Ick-Free Main Pool — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove ick-inducing taxa from Bugs 101 / All Bugs, cap Bugs 101 categories at 8% for variety, and add game engine variety tracking so consecutive rounds show different categories.

**Architecture:** Three changes: (1) expand the exclusion filter in `buildSets()` to cover orders, classes, and families, (2) add category-level capping for bugs_101 set specifically, (3) add a `_recentCategories` rolling window to `SessionState.nextRound()` that filters out recently-shown categories before applying difficulty selection.

**Tech Stack:** Vitest for tests, Node.js build scripts, vanilla JS game engine.

**Spec:** `docs/superpowers/specs/2026-04-08-bugs101-variety-design.md`

---

### Task 1: Expand ick exclusion in `buildSets()` — fetch-data.mjs

**Files:**
- Modify: `scripts/fetch-data.mjs:423-434` (EXCLUDED_ORDERS and mainPool filter)

- [ ] **Step 1: Replace the EXCLUDED_ORDERS block and mainPool filter**

Replace lines 423-434 in `scripts/fetch-data.mjs`:

```js
  // Exclude ick-inducing orders (keep scorpions — they're cool)
  const EXCLUDED_ORDERS = new Set([
    'Ixodida',            // Ticks
    'Blattodea',          // Cockroaches
    'Scolopendromorpha',  // Centipedes
    'Dermaptera',         // Earwigs
  ]);
  const mainPool = observations
    .map((obs, i) => ({ obs, i }))
    .filter(({ obs }) => !EXCLUDED_ORDERS.has(obs.taxon.order))
    .filter(({ obs }) => !blockedIds.has(obs.id))
    .map(({ i }) => i);
```

With:

```js
  // Ick-free main pool — pleasant taxa only for Bugs 101 / All Bugs.
  // Icky observations stay in the dataset for Tiny Terrors and themed sets.
  const ICK_ORDERS = new Set([
    'Ixodida',            // Ticks
    'Blattodea',          // Cockroaches
    'Scolopendromorpha',  // Centipedes
    'Dermaptera',         // Earwigs
    'Siphonaptera',       // Fleas
    'Zygentoma',          // Silverfish
  ]);
  const ICK_CLASSES = new Set([
    'Chilopoda',          // All centipedes
    'Diplopoda',          // All millipedes
  ]);
  const ICK_FAMILIES = new Set([
    'Culicidae',          // Mosquitoes (Diptera)
    'Cimicidae',          // Bed bugs (Hemiptera)
    'Aphididae',          // Aphids (Hemiptera)
    'Dermestidae',        // Carpet beetles (Coleoptera)
  ]);
  function isIcky(obs) {
    const t = obs.taxon;
    return ICK_ORDERS.has(t.order) || ICK_CLASSES.has(t.class) || ICK_FAMILIES.has(t.family);
  }
  // Also exclude Isopoda (woodlice/pillbugs)
  const mainPool = observations
    .map((obs, i) => ({ obs, i }))
    .filter(({ obs }) => !isIcky(obs) && obs.taxon.order !== 'Isopoda')
    .filter(({ obs }) => !blockedIds.has(obs.id))
    .map(({ i }) => i);
```

- [ ] **Step 2: Verify the script still runs**

Run: `node -e "import('./scripts/fetch-data.mjs')" 2>&1 | head -5`

This just checks for syntax errors — the full pipeline takes too long for a quick check. We'll do a full run at the end.

- [ ] **Step 3: Commit**

```bash
git add scripts/fetch-data.mjs
git commit -m "feat: expand ick exclusion in buildSets — orders, classes, families"
```

---

### Task 2: Mirror ick exclusion in rebuild-sets.mjs

**Files:**
- Modify: `scripts/rebuild-sets.mjs:28-70` (EXCLUDED_ORDERS and mainPool filter)

- [ ] **Step 1: Replace the exclusion block in rebuild-sets.mjs**

Replace lines 28-70 in `scripts/rebuild-sets.mjs`:

```js
const EXCLUDED_ORDERS = new Set([
  'Ixodida', 'Blattodea', 'Scolopendromorpha', 'Dermaptera',
]);
```

and the mainPool filter:

```js
  const mainPool = observations
    .map((obs, i) => ({ obs, i }))
    .filter(({ obs }) => !EXCLUDED_ORDERS.has(obs.taxon.order))
    .filter(({ obs }) => !blockedIds.has(obs.id))
    .map(({ i }) => i);
```

With the same expanded exclusion:

```js
const ICK_ORDERS = new Set([
  'Ixodida', 'Blattodea', 'Scolopendromorpha', 'Dermaptera',
  'Siphonaptera', 'Zygentoma',
]);
const ICK_CLASSES = new Set(['Chilopoda', 'Diplopoda']);
const ICK_FAMILIES = new Set([
  'Culicidae', 'Cimicidae', 'Aphididae', 'Dermestidae',
]);
function isIcky(obs) {
  const t = obs.taxon;
  return ICK_ORDERS.has(t.order) || ICK_CLASSES.has(t.class) || ICK_FAMILIES.has(t.family);
}
```

```js
  const mainPool = observations
    .map((obs, i) => ({ obs, i }))
    .filter(({ obs }) => !isIcky(obs) && obs.taxon.order !== 'Isopoda')
    .filter(({ obs }) => !blockedIds.has(obs.id))
    .map(({ i }) => i);
```

- [ ] **Step 2: Run rebuild-sets to verify**

Run: `node scripts/rebuild-sets.mjs`

Expected: All sets rebuild successfully. Bugs 101 / All Bugs counts should drop (icky taxa removed). Tiny Terrors should be unchanged.

- [ ] **Step 3: Commit**

```bash
git add scripts/rebuild-sets.mjs
git commit -m "feat: mirror expanded ick exclusion in rebuild-sets.mjs"
```

---

### Task 3: Add category-level caps for Bugs 101 set

**Files:**
- Modify: `scripts/fetch-data.mjs` — `buildSets()` function, after the mainPool definition
- Modify: `scripts/rebuild-sets.mjs` — same location

This task adds a `getBugs101Category()` helper to the build scripts (duplicated from the client-side `getBugs101Name()` in `game-engine.js`) and uses it to cap each Bugs 101 category at 8% of the pool.

- [ ] **Step 1: Add the category helper and capped bugs_101 set in fetch-data.mjs**

Add this function near the top of `buildSets()`, after the `isIcky` / `mainPool` block:

```js
  // Bugs 101 category mapping — duplicated from src/scripts/game-engine.js:getBugs101Name().
  // Keep in sync: changes to category names here must be mirrored there and vice versa.
  const BEE_FAMILIES = ['Apidae', 'Megachilidae', 'Halictidae', 'Andrenidae', 'Colletidae'];
  const ANT_FAMILIES = ['Formicidae', 'Mutillidae'];
  const BUTTERFLY_FAMILIES = ['Nymphalidae', 'Papilionidae', 'Pieridae', 'Lycaenidae', 'Riodinidae', 'Hesperiidae'];
  const CRICKET_FAMILIES = ['Gryllidae', 'Rhaphidophoridae', 'Anostostomatidae', 'Tettigoniidae'];
  const DAMSELFLY_FAMILIES = ['Coenagrionidae', 'Calopterygidae', 'Lestidae', 'Platycnemididae', 'Platystictidae'];
  function getBugs101Category(taxon) {
    if (taxon.order === 'Hymenoptera') {
      if (BEE_FAMILIES.includes(taxon.family)) return 'Bee';
      if (ANT_FAMILIES.includes(taxon.family)) return 'Ant';
      return 'Wasp';
    }
    if (taxon.order === 'Lepidoptera') {
      if (BUTTERFLY_FAMILIES.includes(taxon.family)) return 'Butterfly';
      return 'Moth';
    }
    if (taxon.order === 'Orthoptera') {
      if (CRICKET_FAMILIES.includes(taxon.family)) return 'Cricket';
      return 'Grasshopper';
    }
    if (taxon.order === 'Odonata') {
      return DAMSELFLY_FAMILIES.includes(taxon.family) ? 'Damselfly' : 'Dragonfly';
    }
    if (taxon.order === 'Coleoptera') return 'Beetle';
    if (taxon.order === 'Araneae') return 'Spider';
    if (taxon.order === 'Diptera') return 'Fly';
    if (taxon.order === 'Hemiptera') return 'True Bug';
    if (taxon.order === 'Scorpiones') return 'Scorpion';
    if (taxon.order === 'Mantodea') return 'Mantis';
    if (taxon.order === 'Opiliones') return 'Harvestman';
    if (taxon.order === 'Phasmida') return 'Stick Insect';
    return taxon.order_common || taxon.order;
  }
```

Note: this is intentionally coarser than the client-side `getBugs101Name()`. For capping purposes we group sub-categories (e.g., Swallowtail Butterfly + Butterfly → "Butterfly", Honey Bee + Bumble Bee + Bee → "Bee"). The client-side function still shows the fine-grained names to the player. The cap operates on the broad category so that "Butterfly" as a whole doesn't dominate, even though the player sees "Swallowtail Butterfly" vs "Butterfly" as distinct options.

Then replace the `bugs_101` set definition:

```js
  // bugs_101: category-level caps at 8% so no single category dominates.
  const BUGS_101_CATEGORY_CAP = 0.08;
  const maxPerCategory = Math.floor(mainPool.length * BUGS_101_CATEGORY_CAP);
  const categoryCounts = {};
  const bugs101Ids = [];
  // Prefer featured observations when capping
  const mainPoolSorted = [...mainPool].sort((a, b) => {
    const aFeat = observations[a].featured ? 0 : 1;
    const bFeat = observations[b].featured ? 0 : 1;
    return aFeat - bFeat;
  });
  for (const i of mainPoolSorted) {
    const cat = getBugs101Category(observations[i].taxon);
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    if (categoryCounts[cat] <= maxPerCategory) {
      bugs101Ids.push(i);
    }
  }
  console.log(`  Bugs 101 category caps (max ${maxPerCategory} per category):`);
  for (const [cat, count] of Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])) {
    const kept = Math.min(count, maxPerCategory);
    if (count > maxPerCategory) console.log(`    ${cat}: ${count} → ${kept}`);
  }

  sets.bugs_101 = {
    name: 'Bugs 101',
    description: "Identify bugs by type — beetle, spider, butterfly, and more.",
    difficulty: 'beginner',
    scoring: 'binary',
    observation_ids: bugs101Ids,
  };
```

Keep `all_bugs` using the uncapped `mainPool`:

```js
  sets.all_bugs = {
    name: 'All Bugs',
    description: "Name the exact species. Partial credit for close guesses.",
    difficulty: 'expert',
    scoring: 'taxonomic',
    observation_ids: mainPool,
  };
```

- [ ] **Step 2: Mirror in rebuild-sets.mjs**

Copy the same `getBugs101Category()` function and capped `bugs_101` logic into `rebuild-sets.mjs`, replacing the current `bugs_101` set definition. Keep `all_bugs` using uncapped `mainPool`.

- [ ] **Step 3: Run rebuild-sets to verify**

Run: `node scripts/rebuild-sets.mjs`

Expected: Bugs 101 count should be lower than All Bugs count (categories got capped). Console should show which categories were trimmed.

- [ ] **Step 4: Verify the category distribution**

Run:
```bash
node -e "
const obs = JSON.parse(require('fs').readFileSync('public/data/observations.json','utf-8'));
const sets = JSON.parse(require('fs').readFileSync('public/data/sets.json','utf-8'));
const b101 = sets.bugs_101.observation_ids.map(i => obs[i]);
const cats = {};
b101.forEach(o => {
  // Quick approximate — just use order as proxy
  cats[o.taxon?.order] = (cats[o.taxon?.order]||0)+1;
});
const total = b101.length;
Object.entries(cats).sort((a,b)=>b[1]-a[1]).forEach(([o,c])=>
  console.log(c.toString().padStart(5)+' ('+((100*c/total).toFixed(1))+'%) '+o));
console.log('Total:', total);
"
```

Expected: No order exceeds ~15-20% of the set. No icky orders present.

- [ ] **Step 5: Commit**

```bash
git add scripts/fetch-data.mjs scripts/rebuild-sets.mjs
git commit -m "feat: add category-level 8% caps for Bugs 101 set"
```

---

### Task 4: Write failing test for category variety tracking

**Files:**
- Create: `tests/variety.test.js`

- [ ] **Step 1: Write the test file**

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { SessionState, getBugs101Name } from '../src/scripts/game-engine.js';

// Observations spanning 6 distinct Bugs 101 categories, 3 per category (18 total).
// This ensures the variety filter has enough categories to avoid repeats.
const observations = [
  // Beetles (Coleoptera / Scarabaeidae)
  { id: 1,  taxon: { species: 'A1', common_name: 'A1', genus: 'G1',  family: 'Scarabaeidae', order: 'Coleoptera', class: 'Insecta' } },
  { id: 2,  taxon: { species: 'A2', common_name: 'A2', genus: 'G2',  family: 'Scarabaeidae', order: 'Coleoptera', class: 'Insecta' } },
  { id: 3,  taxon: { species: 'A3', common_name: 'A3', genus: 'G3',  family: 'Scarabaeidae', order: 'Coleoptera', class: 'Insecta' } },
  // Butterflies (Lepidoptera / Nymphalidae)
  { id: 4,  taxon: { species: 'B1', common_name: 'B1', genus: 'G4',  family: 'Nymphalidae',  order: 'Lepidoptera', class: 'Insecta' } },
  { id: 5,  taxon: { species: 'B2', common_name: 'B2', genus: 'G5',  family: 'Nymphalidae',  order: 'Lepidoptera', class: 'Insecta' } },
  { id: 6,  taxon: { species: 'B3', common_name: 'B3', genus: 'G6',  family: 'Nymphalidae',  order: 'Lepidoptera', class: 'Insecta' } },
  // Dragonflies (Odonata / Libellulidae)
  { id: 7,  taxon: { species: 'C1', common_name: 'C1', genus: 'G7',  family: 'Libellulidae',  order: 'Odonata', class: 'Insecta' } },
  { id: 8,  taxon: { species: 'C2', common_name: 'C2', genus: 'G8',  family: 'Libellulidae',  order: 'Odonata', class: 'Insecta' } },
  { id: 9,  taxon: { species: 'C3', common_name: 'C3', genus: 'G9',  family: 'Libellulidae',  order: 'Odonata', class: 'Insecta' } },
  // Bees (Hymenoptera / Apidae)
  { id: 10, taxon: { species: 'D1', common_name: 'D1', genus: 'G10', family: 'Apidae',        order: 'Hymenoptera', class: 'Insecta' } },
  { id: 11, taxon: { species: 'D2', common_name: 'D2', genus: 'G11', family: 'Apidae',        order: 'Hymenoptera', class: 'Insecta' } },
  { id: 12, taxon: { species: 'D3', common_name: 'D3', genus: 'G12', family: 'Apidae',        order: 'Hymenoptera', class: 'Insecta' } },
  // Spiders (Araneae / Salticidae)
  { id: 13, taxon: { species: 'E1', common_name: 'E1', genus: 'G13', family: 'Salticidae',    order: 'Araneae', class: 'Arachnida' } },
  { id: 14, taxon: { species: 'E2', common_name: 'E2', genus: 'G14', family: 'Salticidae',    order: 'Araneae', class: 'Arachnida' } },
  { id: 15, taxon: { species: 'E3', common_name: 'E3', genus: 'G15', family: 'Salticidae',    order: 'Araneae', class: 'Arachnida' } },
  // Mantises (Mantodea / Mantidae)
  { id: 16, taxon: { species: 'F1', common_name: 'F1', genus: 'G16', family: 'Mantidae',      order: 'Mantodea', class: 'Insecta' } },
  { id: 17, taxon: { species: 'F2', common_name: 'F2', genus: 'G17', family: 'Mantidae',      order: 'Mantodea', class: 'Insecta' } },
  { id: 18, taxon: { species: 'F3', common_name: 'F3', genus: 'G18', family: 'Mantidae',      order: 'Mantodea', class: 'Insecta' } },
];

const taxonomy = {
  order: {
    Coleoptera: [0,1,2], Lepidoptera: [3,4,5], Odonata: [6,7,8],
    Hymenoptera: [9,10,11], Araneae: [12,13,14], Mantodea: [15,16,17],
  },
  family: {
    Scarabaeidae: [0,1,2], Nymphalidae: [3,4,5], Libellulidae: [6,7,8],
    Apidae: [9,10,11], Salticidae: [12,13,14], Mantidae: [15,16,17],
  },
  genus: Object.fromEntries(Array.from({length: 18}, (_, i) => [`G${i+1}`, [i]])),
};

const bugs101Set = {
  name: 'Bugs 101',
  scoring: 'binary',
  observation_ids: Array.from({length: 18}, (_, i) => i),
};

describe('Bugs 101 category variety', () => {
  it('never shows the same category in consecutive rounds', () => {
    // Run 50 sessions to account for randomness
    for (let trial = 0; trial < 50; trial++) {
      const session = new SessionState(observations, taxonomy, bugs101Set, 'bugs_101');
      const categories = [];

      for (let round = 0; round < 10; round++) {
        const r = session.nextRound();
        if (!r) break;
        categories.push(getBugs101Name(r.correct.taxon));
        session.submitAnswer(r.correct.taxon);
      }

      // No two consecutive rounds should have the same category
      for (let i = 1; i < categories.length; i++) {
        expect(categories[i], `Trial ${trial}, round ${i}: ${categories.slice(0, i+1).join(' → ')}`).not.toBe(categories[i - 1]);
      }
    }
  });

  it('does not repeat a category within the last 3 rounds', () => {
    for (let trial = 0; trial < 50; trial++) {
      const session = new SessionState(observations, taxonomy, bugs101Set, 'bugs_101');
      const categories = [];

      for (let round = 0; round < 10; round++) {
        const r = session.nextRound();
        if (!r) break;
        categories.push(getBugs101Name(r.correct.taxon));
        session.submitAnswer(r.correct.taxon);
      }

      // No category should appear within a window of 3
      for (let i = 3; i < categories.length; i++) {
        const window = categories.slice(i - 3, i);
        expect(window, `Trial ${trial}, round ${i}: ${categories.join(' → ')}`).not.toContain(categories[i]);
      }
    }
  });

  it('variety tracking does not apply to taxonomic scoring sets', () => {
    const allBugsSet = { ...bugs101Set, scoring: 'taxonomic' };
    // Should not throw — just verifying it runs without the variety filter interfering
    const session = new SessionState(observations, taxonomy, allBugsSet, 'all_bugs');
    for (let round = 0; round < 10; round++) {
      const r = session.nextRound();
      if (!r) break;
      session.submitAnswer(r.correct.taxon);
    }
    expect(session.currentRound).toBeGreaterThanOrEqual(10);
  });

  it('falls back gracefully when fewer than 4 categories exist', () => {
    // Only beetles — one category. Variety filter should not block the game.
    const smallObs = observations.slice(0, 3);
    const smallTax = {
      order: { Coleoptera: [0,1,2] },
      family: { Scarabaeidae: [0,1,2] },
      genus: { G1: [0], G2: [1], G3: [2] },
    };
    const smallSet = { name: 'Small', scoring: 'binary', observation_ids: [0,1,2] };
    const session = new SessionState(smallObs, smallTax, smallSet, 'small');
    // Should still produce rounds even though all are the same category
    const r = session.nextRound();
    expect(r).not.toBeNull();
    expect(r.correct).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/variety.test.js`

Expected: FAIL — `SessionState` doesn't have variety tracking yet, so consecutive categories will repeat.

- [ ] **Step 3: Commit the failing test**

```bash
git add tests/variety.test.js
git commit -m "test: add failing tests for Bugs 101 category variety tracking"
```

---

### Task 5: Implement category variety tracking in SessionState

**Files:**
- Modify: `src/scripts/game-engine.js` — `SessionState` constructor and `nextRound()` method

- [ ] **Step 1: Add `_recentCategories` to the constructor**

In `SessionState.constructor()`, after `this._currentCorrect = null;` (line 230), add:

```js
    this._recentCategories = [];
```

- [ ] **Step 2: Modify `nextRound()` to filter by category variety for binary sets**

In `nextRound()`, after the line `let available = this._pool.filter(...)` and the pool-recycling block (around line 276), add the category variety filter:

```js
    // Bugs 101: avoid repeating categories from the last 3 rounds
    const isBugs101 = this.setDef.scoring === 'binary';
    if (isBugs101 && this._recentCategories.length > 0) {
      const recentSet = new Set(this._recentCategories);
      const freshCategory = available.filter(obs => !recentSet.has(getBugs101Name(obs.taxon)));
      if (freshCategory.length > 0) {
        available = freshCategory;
      }
      // If no fresh categories available (tiny set), fall through with full available pool
    }
```

This must go BEFORE the difficulty/random pick logic that follows. The existing code that follows should use the now-filtered `available`:

```js
    // Pick observation based on difficulty curve (classic only, when difficulty data exists)
    let correct;
    if (this.mode === 'classic' && this._difficulty) {
      correct = this._pickByDifficulty(available);
    } else {
      correct = pickRandom(available);
    }
```

- [ ] **Step 3: Track the chosen category in `submitAnswer()`**

In `submitAnswer()`, after `const correct = this._currentCorrect;` (line 342), add:

```js
    // Track category for variety filtering (Bugs 101 only)
    if (this.setDef.scoring === 'binary') {
      this._recentCategories.push(getBugs101Name(correct.taxon));
      if (this._recentCategories.length > 3) {
        this._recentCategories.shift();
      }
    }
```

- [ ] **Step 4: Run the variety tests**

Run: `npx vitest run tests/variety.test.js`

Expected: All 4 tests PASS.

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`

Expected: All tests pass (119 existing + 4 new = 123).

- [ ] **Step 6: Commit**

```bash
git add src/scripts/game-engine.js
git commit -m "feat: add category variety tracking to Bugs 101 sessions"
```

---

### Task 6: Run full pipeline and push to production

**Files:**
- Modified: `public/data/observations.json`, `public/data/sets.json`, `public/data/taxonomy.json`

- [ ] **Step 1: Run the full data pipeline**

Run: `node scripts/fetch-data.mjs`

This takes ~10-15 minutes. Wait for completion.

Expected: Pipeline completes with "Done!" — Bugs 101 count should be noticeably lower than All Bugs (category caps applied). No icky taxa in Bugs 101/All Bugs sets.

- [ ] **Step 2: Verify the final Bugs 101 distribution**

Run:
```bash
node -e "
const obs = JSON.parse(require('fs').readFileSync('public/data/observations.json','utf-8'));
const sets = JSON.parse(require('fs').readFileSync('public/data/sets.json','utf-8'));
const b101 = sets.bugs_101.observation_ids.map(i => obs[i]);
const cats = {};
b101.forEach(o => {
  const ord = o.taxon?.order;
  cats[ord] = (cats[ord]||0)+1;
});
const total = b101.length;
console.log('Bugs 101 — ' + total + ' observations');
Object.entries(cats).sort((a,b)=>b[1]-a[1]).forEach(([o,c])=>
  console.log(c.toString().padStart(5)+' ('+((100*c/total).toFixed(1))+'%) '+o));
console.log('\nAll Bugs:', sets.all_bugs.observation_ids.length);
console.log('Tiny Terrors:', sets.tiny_terrors.observation_ids.length);
"
```

Expected: No order exceeds ~15% in Bugs 101. No icky orders (Ixodida, Blattodea, Scolopendromorpha, etc.) present. All Bugs count > Bugs 101 count. Tiny Terrors unchanged.

- [ ] **Step 3: Commit data and push**

```bash
git add public/data/observations.json public/data/sets.json public/data/taxonomy.json
git commit -m "data: refresh dataset with ick-free pool and category-capped Bugs 101"
git push origin main
```
