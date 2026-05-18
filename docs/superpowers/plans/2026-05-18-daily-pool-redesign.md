# Daily Challenge Pool Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the date-keyed single-use daily manifest with a reusable approved-image pool plus a deterministic client-side date→bug selector, and discontinue the All Bugs daily.

**Architecture:** A one-time migration harvests the existing 23 Bugs 101 + 22 derivable All Bugs manifest entries into `approved-pool.json` (crops stored per observation under `daily/pool/<id>/`). A look-ahead `daily-schedule.json` (90 days) maps dates to pool entries; the client reads it with a deterministic hash fallback so a blank day is impossible. A pool-builder mode is added to the existing `review-server.mjs` (mirroring its existing `/general` mode) for ongoing manual crop+approve.

**Tech Stack:** Node ESM scripts, `sharp` (already a devDependency), vanilla browser JS (Astro static site), `vitest` for unit tests.

---

## Spec Deviations (approved-spec changes, with rationale)

1. **No Wikipedia backfill.** `renderReveal()` in `daily-ui.js` never displays `wikipedia_summary`; `species-content.json` is HTML-formatted and keyed by scientific name with low overlap. Migration **carries `wikipedia_summary` from the existing manifest entry** (cheap, future-proof) but does **not** backfill from the curated store. Removes spec §2 backfill step and the spec §6 "stale blurb" risk becomes moot.
2. **`index.astro` / `play.astro` unchanged.** The homepage already shows a single Bugs-101-only daily banner; `play.astro` delegates entirely to `initDaily()`. All Bugs removal is confined to `daily-ui.js` + the new selector.
3. **Crop path prefix.** Pool crop path strings are `daily/pool/<id>/N.jpg` (not `pool/<id>/N.jpg`) so the existing `${base}/data/${cropPath}` resolver maps to `public/data/daily/pool/<id>/N.jpg`.
4. **Pool builder is a new mode inside `review-server.mjs`**, added the same way `/general` already is — honors "adapt, don't rebuild the UX" without destabilizing the daily-review mode.
5. **`scripts/lib/pool.mjs` is the canonical node-side source of `getBugs101Name` + `VALID_BUGS101_NAMES`.** Task 5 deletes `review-server.mjs`'s duplicated copy and imports from the lib instead (node-side copies 2→1; `generate-daily.mjs` left as-is since it is being retired/unwired). Targeted reduction of the catalogued 9-file duplication blast radius, contained to files this plan already touches.

## File Structure

**Create:**
- `scripts/lib/pool.mjs` — pure tooling helpers: `hashDate`, `addDays`, `avoidWindowSize`, `topUpSchedule`, `buildPoolEntries`.
- `scripts/migrate-pool.mjs` — one-time migration runner (image IO + calls `buildPoolEntries`).
- `tests/pool.test.js` — unit tests for `scripts/lib/pool.mjs`.

**Modify:**
- `src/scripts/daily-engine.js` — add `hashDate` + `getTodaysEntry` (client selector).
- `tests/daily-engine.test.js` — add tests for the two new functions.
- `src/scripts/daily-ui.js` — fetch pool+schedule, use `getTodaysEntry`, remove All Bugs paths, pin `mode='bugs101'`.
- `scripts/review-server.mjs` — add `/pool` UI route + `/api/pool/*` endpoints.
- `package.json` — remove the `generate-daily` script entry.

**Generated at runtime (not authored):** `public/data/daily/approved-pool.json`, `public/data/daily/daily-schedule.json`, `public/data/daily/pool/<id>/{1,2,3,full}.jpg`.

**Deleted in final cutover task:** `public/data/daily/<YYYY-MM-DD>/` folders, `public/data/daily/manifest.json`.

---

## Task 1: Client selector — `hashDate` + `getTodaysEntry`

**Files:**
- Modify: `src/scripts/daily-engine.js` (append new exports after `getCountdownToReset`, end of file ~line 153)
- Test: `tests/daily-engine.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/daily-engine.test.js` (add `hashDate, getTodaysEntry` to the import block from `../src/scripts/daily-engine.js`):

```js
// ──────────────────────────────────────────────
// hashDate
// ──────────────────────────────────────────────
describe('hashDate', () => {
  it('is deterministic for the same date', () => {
    expect(hashDate('2026-05-18')).toBe(hashDate('2026-05-18'));
  });

  it('returns an unsigned 32-bit integer', () => {
    const h = hashDate('2026-05-18');
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
  });

  it('differs for different dates', () => {
    expect(hashDate('2026-05-18')).not.toBe(hashDate('2026-05-19'));
  });
});

// ──────────────────────────────────────────────
// getTodaysEntry
// ──────────────────────────────────────────────
describe('getTodaysEntry', () => {
  const pool = [
    { id: 11, answer_common: 'Beetle' },
    { id: 22, answer_common: 'Moth' },
    { id: 33, answer_common: 'Spider' },
  ];

  it('returns the scheduled entry when the date is in the schedule', () => {
    expect(getTodaysEntry(pool, { '2026-05-18': 22 }, '2026-05-18')).toEqual({ id: 22, answer_common: 'Moth' });
  });

  it('falls back to hash selection when the date is not scheduled', () => {
    const e = getTodaysEntry(pool, {}, '2026-05-18');
    expect(pool).toContain(e);
    expect(getTodaysEntry(pool, {}, '2026-05-18')).toBe(e); // deterministic
  });

  it('falls back to hash when the scheduled id is missing from the pool', () => {
    const e = getTodaysEntry(pool, { '2026-05-18': 999 }, '2026-05-18');
    expect(pool).toContain(e);
  });

  it('returns null for an empty pool', () => {
    expect(getTodaysEntry([], { '2026-05-18': 1 }, '2026-05-18')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/daily-engine.test.js`
Expected: FAIL — `hashDate is not a function` / `getTodaysEntry is not a function`.

- [ ] **Step 3: Implement the two functions**

Append to the end of `src/scripts/daily-engine.js`:

```js
/**
 * Deterministic 32-bit FNV-1a hash of a date string.
 * Same input always yields the same unsigned integer — used to pick a
 * pool entry for dates not present in the schedule.
 */
export function hashDate(dateStr) {
  let h = 0x811c9dc5;
  for (let i = 0; i < dateStr.length; i++) {
    h ^= dateStr.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Resolves the pool entry for a given ET date.
 * 1. If schedule[today] points to an entry in the pool, use it.
 * 2. Otherwise fall back to a deterministic hash over the pool, so the
 *    challenge is never blank while the pool is non-empty.
 * Returns null only when the pool is empty.
 */
export function getTodaysEntry(pool, schedule, today) {
  if (!pool || pool.length === 0) return null;
  const scheduledId = schedule && schedule[today];
  if (scheduledId != null) {
    const match = pool.find(p => p.id === scheduledId);
    if (match) return match;
  }
  return pool[hashDate(today) % pool.length];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/daily-engine.test.js`
Expected: PASS — all `hashDate` and `getTodaysEntry` cases green, existing tests still green.

- [ ] **Step 5: Commit**

```bash
git add src/scripts/daily-engine.js tests/daily-engine.test.js
git commit -m "feat: add hashDate + getTodaysEntry pool selector to daily-engine"
```

---

## Task 2: Tooling lib — `scripts/lib/pool.mjs` (pure helpers)

**Files:**
- Create: `scripts/lib/pool.mjs`
- Test: `tests/pool.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/pool.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { hashDate, addDays, avoidWindowSize, topUpSchedule, buildPoolEntries } from '../scripts/lib/pool.mjs';

describe('hashDate (node lib)', () => {
  it('is deterministic', () => {
    expect(hashDate('2026-05-18')).toBe(hashDate('2026-05-18'));
  });
});

describe('addDays', () => {
  it('adds days across month boundaries', () => {
    expect(addDays('2026-05-31', 1)).toBe('2026-06-01');
  });
  it('subtracts with negative n', () => {
    expect(addDays('2026-06-01', -1)).toBe('2026-05-31');
  });
});

describe('avoidWindowSize', () => {
  it('is poolSize-1 when small', () => {
    expect(avoidWindowSize(10)).toBe(9);
  });
  it('caps at 30', () => {
    expect(avoidWindowSize(100)).toBe(30);
  });
});

describe('topUpSchedule', () => {
  const pool = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }];

  it('fills exactly `days` future dates', () => {
    const s = topUpSchedule(pool, {}, '2026-05-18', 5);
    expect(Object.keys(s).sort()).toEqual(
      ['2026-05-18', '2026-05-19', '2026-05-20', '2026-05-21', '2026-05-22']
    );
  });

  it('never overwrites an existing schedule entry', () => {
    const s = topUpSchedule(pool, { '2026-05-18': 99 }, '2026-05-18', 3);
    expect(s['2026-05-18']).toBe(99);
  });

  it('is deterministic', () => {
    const a = topUpSchedule(pool, {}, '2026-05-18', 20);
    const b = topUpSchedule(pool, {}, '2026-05-18', 20);
    expect(a).toEqual(b);
  });

  it('does not repeat an id within the avoid window', () => {
    const s = topUpSchedule(pool, {}, '2026-05-18', 5); // window = min(4,30)=4
    const seq = Object.keys(s).sort().map(k => s[k]);
    for (let i = 1; i < seq.length; i++) {
      expect(seq.slice(Math.max(0, i - 4), i)).not.toContain(seq[i]);
    }
  });

  it('only assigns ids that exist in the pool', () => {
    const s = topUpSchedule(pool, {}, '2026-05-18', 30);
    const ids = new Set(pool.map(p => p.id));
    for (const v of Object.values(s)) expect(ids.has(v)).toBe(true);
  });
});

describe('buildPoolEntries', () => {
  const candidatesById = new Map([
    [200, { id: 200, photo_url: 'p200', attribution: 'a200', inat_url: 'i200',
            taxon: { order: 'Coleoptera', family: 'Carabidae', species: 'Carabus x', common_name: 'Ground Beetle' } }],
    [300, { id: 300, photo_url: 'p300', attribution: 'a300', inat_url: 'i300',
            taxon: { order: 'Mecoptera', family: 'Bittacidae', species: 'Bittacus y', common_name: 'Hangingfly' } }],
  ]);
  const manifest = { challenges: [{
    date: '2026-04-05', number: 1,
    bugs101: { observation_id: 100, crops: ['daily/2026-04-05/b101_1.jpg','daily/2026-04-05/b101_2.jpg','daily/2026-04-05/b101_3.jpg'],
      reveal: 'daily/2026-04-05/b101_full.jpg', attribution: 'attrA', wikipedia_summary: 'wikiA',
      inat_url: 'inatA', center_x: 0.2, center_y: 0.5, answer_order: 'Ixodida', answer_common: 'Tick' },
    allbugs: { observation_id: 200, crops: [], reveal: 'daily/2026-04-05/all_full.jpg', attribution: 'attrB',
      wikipedia_summary: '', inat_url: 'inatB', center_x: 0.6, center_y: 0.4,
      answer_species: 'Carabus x', answer_common: 'Ground Beetle' },
  }, {
    date: '2026-04-06', number: 2,
    allbugs: { observation_id: 300, crops: [], reveal: 'r', attribution: 'attrC', wikipedia_summary: '',
      inat_url: 'inatC', center_x: 0.5, center_y: 0.5, answer_species: 'Bittacus y', answer_common: 'Hangingfly' },
  }] };

  it('keeps bugs101 entries verbatim (name/order/center)', () => {
    const { entries } = buildPoolEntries(manifest, candidatesById);
    const t = entries.find(e => e.id === 100);
    expect(t).toMatchObject({ id: 100, answer_common: 'Tick', answer_order: 'Ixodida',
      attribution: 'attrA', wikipedia_summary: 'wikiA', inat_url: 'inatA', center_x: 0.2, center_y: 0.5, source: 'bugs101' });
  });

  it('re-derives allbugs entries to a Bugs 101 name via taxon', () => {
    const { entries } = buildPoolEntries(manifest, candidatesById);
    const b = entries.find(e => e.id === 200);
    expect(b).toMatchObject({ id: 200, answer_common: 'Beetle', answer_order: 'Coleoptera', source: 'allbugs' });
  });

  it('drops allbugs entries with no valid Bugs 101 name', () => {
    const { entries, dropped } = buildPoolEntries(manifest, candidatesById);
    expect(entries.find(e => e.id === 300)).toBeUndefined();
    expect(dropped).toContainEqual({ id: 300, reason: 'no valid Bugs 101 name (Mecoptera)' });
  });

  it('de-dupes by observation id (first wins)', () => {
    const dup = { challenges: [...manifest.challenges,
      { date: '2026-04-07', number: 3, bugs101: { ...manifest.challenges[0].bugs101 } }] };
    const { entries } = buildPoolEntries(dup, candidatesById);
    expect(entries.filter(e => e.id === 100).length).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/pool.test.js`
Expected: FAIL — cannot resolve `../scripts/lib/pool.mjs`.

- [ ] **Step 3: Implement `scripts/lib/pool.mjs`**

Create `scripts/lib/pool.mjs`:

```js
// scripts/lib/pool.mjs
// Pure helpers for the daily-challenge pool tooling. No image IO here.
//
// CANONICAL node-side source of getBugs101Name + VALID_BUGS101_NAMES.
// review-server.mjs imports from here (its old local copy is deleted in
// Task 5). generate-daily.mjs keeps its own copy only because it is being
// retired/unwired — do not add new copies; import from this file.
//
// hashDate mirrors src/scripts/daily-engine.js intentionally — the src/
// (browser) and scripts/ (node) trees are not bundled together, so that
// one ~6-line function is duplicated across the runtime boundary by design.

const VALID_BUGS101_NAMES = new Set([
  'Ant', 'Aphid', 'Bee', 'Beetle', 'Bumble Bee', 'Butterfly', 'Caddisfly',
  'Centipede', 'Cicada', 'Cockroach', 'Crane Fly', 'Cricket', 'Damselfly',
  'Dragonfly', 'Earwig', 'Fly', 'Grasshopper', 'Harvestman', 'Hawk Moth',
  'Honey Bee', 'Hover Fly', 'Jumping Spider', 'Katydid', 'Lacewing',
  'Longhorn Beetle', 'Mantis', 'Mayfly', 'Millipede', 'Moth', 'Orb Weaver',
  'Planthopper', 'Scarab', 'Scorpion', 'Silk Moth', 'Spider', 'Stag Beetle',
  'Stick Insect', 'Stink Bug', 'Swallowtail', 'Tarantula', 'Termite', 'Tick', 'True Bug',
  'Wasp', 'Water Bug', 'Weevil', 'Woodlouse',
]);

const BEE_FAMILIES = ['Apidae', 'Megachilidae', 'Halictidae', 'Andrenidae', 'Colletidae'];
const ANT_FAMILIES = ['Formicidae', 'Mutillidae'];
const BUTTERFLY_FAMILIES = ['Nymphalidae', 'Papilionidae', 'Pieridae', 'Lycaenidae', 'Riodinidae', 'Hesperiidae'];
const CRICKET_FAMILIES = ['Gryllidae', 'Rhaphidophoridae', 'Anostostomatidae'];
const TERMITE_FAMILIES = ['Termitidae', 'Rhinotermitidae', 'Kalotermitidae', 'Hodotermitidae', 'Mastotermitidae', 'Stylotermitidae', 'Archotermopsidae', 'Serritermitidae'];
const DAMSELFLY_FAMILIES = ['Coenagrionidae', 'Calopterygidae', 'Lestidae', 'Platycnemididae', 'Platystictidae'];
const CICADA_FAMILIES = ['Cicadidae'];
const STINK_BUG_FAMILIES = ['Pentatomidae', 'Scutelleridae', 'Acanthosomatidae', 'Cydnidae', 'Tessaratomidae'];
const PLANTHOPPER_FAMILIES = ['Fulgoridae', 'Flatidae', 'Membracidae', 'Ischnorhinidae'];
const APHID_FAMILIES = ['Aphididae', 'Eriococcidae'];
const WATER_BUG_FAMILIES = ['Nepidae', 'Notonectidae', 'Belostomatidae'];

// Mirrors getBugs101Name in scripts/review-server.mjs (the current canonical copy).
export function getBugs101Name(taxon) {
  if (!taxon) return undefined;
  if (taxon.order === 'Hymenoptera') {
    if (BEE_FAMILIES.includes(taxon.family)) {
      if (taxon.genus === 'Apis') return 'Honey Bee';
      if (taxon.genus === 'Bombus') return 'Bumble Bee';
      return 'Bee';
    }
    if (ANT_FAMILIES.includes(taxon.family)) return 'Ant';
    return 'Wasp';
  }
  if (taxon.order === 'Lepidoptera') {
    if (taxon.family === 'Papilionidae') return 'Swallowtail';
    if (BUTTERFLY_FAMILIES.includes(taxon.family)) return 'Butterfly';
    if (taxon.family === 'Sphingidae') return 'Hawk Moth';
    if (taxon.family === 'Saturniidae') return 'Silk Moth';
    return 'Moth';
  }
  if (taxon.order === 'Orthoptera') {
    if (taxon.family === 'Tettigoniidae') return 'Katydid';
    if (CRICKET_FAMILIES.includes(taxon.family)) return 'Cricket';
    return 'Grasshopper';
  }
  if (taxon.order === 'Odonata') {
    return DAMSELFLY_FAMILIES.includes(taxon.family) ? 'Damselfly' : 'Dragonfly';
  }
  if (taxon.order === 'Hemiptera') {
    if (CICADA_FAMILIES.includes(taxon.family)) return 'Cicada';
    if (STINK_BUG_FAMILIES.includes(taxon.family)) return 'Stink Bug';
    if (PLANTHOPPER_FAMILIES.includes(taxon.family)) return 'Planthopper';
    if (APHID_FAMILIES.includes(taxon.family)) return 'Aphid';
    if (WATER_BUG_FAMILIES.includes(taxon.family)) return 'Water Bug';
    return 'True Bug';
  }
  if (taxon.order === 'Coleoptera') {
    if (taxon.family === 'Lucanidae') return 'Stag Beetle';
    if (taxon.family === 'Scarabaeidae') return 'Scarab';
    if (taxon.family === 'Cerambycidae') return 'Longhorn Beetle';
    if (taxon.family === 'Curculionidae') return 'Weevil';
    return 'Beetle';
  }
  if (taxon.order === 'Araneae') {
    if (taxon.family === 'Salticidae') return 'Jumping Spider';
    if (taxon.family === 'Theraphosidae') return 'Tarantula';
    if (taxon.family === 'Araneidae' || taxon.family === 'Nephilidae') return 'Orb Weaver';
    return 'Spider';
  }
  if (taxon.order === 'Diptera') {
    if (taxon.family === 'Syrphidae') return 'Hover Fly';
    if (taxon.family === 'Tipulidae' || taxon.family === 'Limoniidae') return 'Crane Fly';
    return 'Fly';
  }
  if (taxon.order === 'Blattodea') {
    return TERMITE_FAMILIES.includes(taxon.family) ? 'Termite' : 'Cockroach';
  }
  const names = {
    'Ixodida': 'Tick', 'Scorpiones': 'Scorpion', 'Opiliones': 'Harvestman',
    'Mantodea': 'Mantis', 'Phasmida': 'Stick Insect', 'Neuroptera': 'Lacewing',
    'Dermaptera': 'Earwig', 'Ephemeroptera': 'Mayfly',
    'Trichoptera': 'Caddisfly', 'Scolopendromorpha': 'Centipede',
    'Isopoda': 'Woodlouse', 'Julida': 'Millipede',
  };
  return names[taxon.order] || taxon.order_common || taxon.order;
}

export { VALID_BUGS101_NAMES };

export function hashDate(dateStr) {
  let h = 0x811c9dc5;
  for (let i = 0; i < dateStr.length; i++) {
    h ^= dateStr.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00Z'); // noon UTC avoids DST edges
  d.setUTCDate(d.getUTCDate() + n);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function avoidWindowSize(poolSize) {
  return Math.min(poolSize - 1, 30);
}

/**
 * Extend `schedule` forward `days` dates from `fromDate` (inclusive).
 * Existing keys are never rewritten. Each new date deterministically picks
 * a pool entry, excluding ids used within the previous `avoidWindowSize`
 * scheduled days to prevent clustering.
 */
export function topUpSchedule(pool, schedule, fromDate, days) {
  const out = { ...schedule };
  const ids = pool.map(p => p.id);
  if (ids.length === 0) return out;
  const window = avoidWindowSize(ids.length);
  let date = fromDate;
  for (let i = 0; i < days; i++) {
    if (!(date in out)) {
      const recent = new Set();
      let d = addDays(date, -1);
      for (let k = 0; k < window; k++) {
        if (out[d] != null) recent.add(out[d]);
        d = addDays(d, -1);
      }
      const candidates = ids.filter(id => !recent.has(id));
      const pickFrom = candidates.length ? candidates : ids;
      out[date] = pickFrom[hashDate(date) % pickFrom.length];
    }
    date = addDays(date, 1);
  }
  return out;
}

/**
 * Transform a manifest into pool entries (pure — no image IO).
 * - bugs101 entries: kept verbatim, source:'bugs101', needsRecrop:false.
 * - allbugs entries: name re-derived via getBugs101Name(candidate taxon),
 *   source:'allbugs', needsRecrop:true (caller regenerates crops from center).
 * - de-dupe by observation id, first occurrence wins (bugs101 precede allbugs
 *   within a day, so a native bugs101 entry beats the derived one).
 * Returns { entries, dropped:[{id,reason}] }.
 */
export function buildPoolEntries(manifest, candidatesById) {
  const entries = [];
  const dropped = [];
  const seen = new Set();

  for (const ch of manifest.challenges) {
    for (const kind of ['bugs101', 'allbugs']) {
      const e = ch[kind];
      if (!e || e.observation_id == null) continue;
      const id = e.observation_id;
      if (seen.has(id)) continue;

      if (kind === 'bugs101') {
        seen.add(id);
        entries.push({
          id,
          answer_common: e.answer_common,
          answer_order: e.answer_order,
          crops: e.crops,
          reveal: e.reveal,
          attribution: e.attribution || '',
          wikipedia_summary: e.wikipedia_summary || '',
          inat_url: e.inat_url || '',
          center_x: e.center_x ?? 0.5,
          center_y: e.center_y ?? 0.5,
          source: 'bugs101',
          needsRecrop: false,
        });
      } else {
        const cand = candidatesById.get(id);
        const name = cand ? getBugs101Name(cand.taxon) : undefined;
        if (!name || !VALID_BUGS101_NAMES.has(name)) {
          dropped.push({ id, reason: `no valid Bugs 101 name (${cand?.taxon?.order || 'unknown'})` });
          continue;
        }
        seen.add(id);
        entries.push({
          id,
          answer_common: name,
          answer_order: cand.taxon.order,
          crops: [],
          reveal: e.reveal,
          attribution: e.attribution || cand.attribution || '',
          wikipedia_summary: e.wikipedia_summary || '',
          inat_url: e.inat_url || cand.inat_url || '',
          center_x: e.center_x ?? 0.5,
          center_y: e.center_y ?? 0.5,
          photo_url: cand.photo_url,
          source: 'allbugs',
          needsRecrop: true,
        });
      }
    }
  }
  return { entries, dropped };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/pool.test.js`
Expected: PASS — all `hashDate`, `addDays`, `avoidWindowSize`, `topUpSchedule`, `buildPoolEntries` cases green.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/pool.mjs tests/pool.test.js
git commit -m "feat: add pool tooling lib (hashDate, schedule top-up, buildPoolEntries)"
```

---

## Task 3: Migration runner — `scripts/migrate-pool.mjs`

**Files:**
- Create: `scripts/migrate-pool.mjs`
- Depends on: `scripts/lib/pool.mjs` (Task 2)

This task has IO (image download + sharp). It is verified by running it and asserting the output, not by a unit test (the pure logic it relies on is already tested in Task 2).

- [ ] **Step 1: Implement `scripts/migrate-pool.mjs`**

Create `scripts/migrate-pool.mjs`:

```js
#!/usr/bin/env node
/**
 * migrate-pool.mjs — one-time migration from manifest.json to the
 * reusable approved-pool model.
 *
 * - bugs101 entries: copy their 3 crops + reveal into daily/pool/<id>/.
 * - allbugs entries: re-derive a Bugs 101 name, re-download the original,
 *   regenerate 3 Bugs 101 crops + reveal from the already-approved center.
 * - de-dupe by observation id.
 * - write approved-pool.json and an initial 90-day daily-schedule.json.
 *
 * Idempotent: rebuilds from manifest.json each run (keyed by id).
 *
 * Usage: node scripts/migrate-pool.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { buildPoolEntries, topUpSchedule } from './lib/pool.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'public', 'data');
const DAILY_DIR = join(DATA_DIR, 'daily');
const POOL_DIR = join(DAILY_DIR, 'pool');
const MANIFEST_FILE = join(DAILY_DIR, 'manifest.json');
const CANDIDATES_FILE = join(DAILY_DIR, 'candidates.json');
const POOL_FILE = join(DAILY_DIR, 'approved-pool.json');
const SCHEDULE_FILE = join(DAILY_DIR, 'daily-schedule.json');

const BUGS101_FRACS = [0.12, 0.35, 0.65];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function todayET() {
  const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const y = et.getFullYear();
  const m = String(et.getMonth() + 1).padStart(2, '0');
  const d = String(et.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function downloadOriginal(photoUrl) {
  for (const url of [photoUrl.replace('/medium.', '/original.'), photoUrl.replace('/medium.', '/large.')]) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'WhatsThatBugGame/1.0 (educational project)' } });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
    } catch { /* try next */ }
  }
  throw new Error(`download failed: ${photoUrl}`);
}

async function generateCrop(buf, frac, outPath, cx, cy) {
  const meta = await sharp(buf).metadata();
  const cw = Math.max(Math.round(meta.width * frac), 64);
  const chh = Math.max(Math.round(meta.height * frac), 64);
  let left = Math.max(0, Math.min(Math.round(cx * meta.width - cw / 2), meta.width - cw));
  let top = Math.max(0, Math.min(Math.round(cy * meta.height - chh / 2), meta.height - chh));
  await sharp(buf).extract({ left, top, width: cw, height: chh })
    .resize(800, 600, { fit: 'cover' }).jpeg({ quality: 85 }).toFile(outPath);
}

async function generateReveal(buf, outPath) {
  await sharp(buf).resize(1600, 1200, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 }).toFile(outPath);
}

async function main() {
  const manifest = JSON.parse(readFileSync(MANIFEST_FILE, 'utf-8'));
  const candidates = JSON.parse(readFileSync(CANDIDATES_FILE, 'utf-8'));
  const candById = new Map(candidates.map(o => [o.id, o]));

  const { entries, dropped } = buildPoolEntries(manifest, candById);
  console.log(`Building pool: ${entries.length} entries, ${dropped.length} dropped`);
  for (const d of dropped) console.log(`  drop ${d.id}: ${d.reason}`);

  mkdirSync(POOL_DIR, { recursive: true });
  const pool = [];

  for (const e of entries) {
    const dir = join(POOL_DIR, String(e.id));
    mkdirSync(dir, { recursive: true });
    const cropPaths = [];

    if (e.source === 'bugs101') {
      // Copy existing crop + reveal files verbatim.
      for (let i = 0; i < e.crops.length; i++) {
        const src = join(DATA_DIR, e.crops[i]);
        const dest = join(dir, `${i + 1}.jpg`);
        copyFileSync(src, dest);
        cropPaths.push(`daily/pool/${e.id}/${i + 1}.jpg`);
      }
      copyFileSync(join(DATA_DIR, e.reveal), join(dir, 'full.jpg'));
    } else {
      // allbugs: re-download original, regenerate Bugs 101 crops + reveal.
      console.log(`  recrop ${e.id} (${e.answer_common}) from original...`);
      const buf = await downloadOriginal(e.photo_url);
      for (let i = 0; i < BUGS101_FRACS.length; i++) {
        await generateCrop(buf, BUGS101_FRACS[i], join(dir, `${i + 1}.jpg`), e.center_x, e.center_y);
        cropPaths.push(`daily/pool/${e.id}/${i + 1}.jpg`);
      }
      await generateReveal(buf, join(dir, 'full.jpg'));
      await sleep(500); // be polite to iNaturalist
    }

    pool.push({
      id: e.id,
      answer_common: e.answer_common,
      answer_order: e.answer_order,
      crops: cropPaths,
      reveal: `daily/pool/${e.id}/full.jpg`,
      attribution: e.attribution,
      wikipedia_summary: e.wikipedia_summary,
      inat_url: e.inat_url,
      center_x: e.center_x,
      center_y: e.center_y,
      added: todayET(),
    });
  }

  writeFileSync(POOL_FILE, JSON.stringify(pool, null, 2));
  console.log(`Wrote ${pool.length} entries to ${POOL_FILE}`);

  const existingSchedule = existsSync(SCHEDULE_FILE)
    ? JSON.parse(readFileSync(SCHEDULE_FILE, 'utf-8')) : {};
  const schedule = topUpSchedule(pool, existingSchedule, todayET(), 90);
  writeFileSync(SCHEDULE_FILE, JSON.stringify(schedule, null, 2));
  console.log(`Wrote ${Object.keys(schedule).length}-day schedule to ${SCHEDULE_FILE}`);
}

main().catch(err => { console.error('Migration failed:', err); process.exit(1); });
```

- [ ] **Step 2: Run the migration**

Run: `node scripts/migrate-pool.mjs`
Expected: console shows `Building pool: ~45 entries, 1 dropped`, `drop <id>: no valid Bugs 101 name (Mecoptera)`, recrop logs for ~22 allbugs ids, and final `Wrote ... entries` / `Wrote 90-day schedule`.

- [ ] **Step 3: Verify the output**

Run:
```bash
node -e 'const p=require("./public/data/daily/approved-pool.json"); const s=require("./public/data/daily/daily-schedule.json"); const fs=require("fs"); console.log("pool:",p.length,"schedule days:",Object.keys(s).length); const bad=p.filter(e=>e.crops.length!==3 || !fs.existsSync("public/data/"+e.reveal) || e.crops.some(c=>!fs.existsSync("public/data/"+c))); console.log("entries with missing files:",bad.length); const ids=new Set(p.map(e=>e.id)); console.log("schedule ids all in pool:", Object.values(s).every(v=>ids.has(v))); console.log("dup ids:", p.length-ids.size);'
```
Expected: `pool: ~45 schedule days: 90`, `entries with missing files: 0`, `schedule ids all in pool: true`, `dup ids: 0`.

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate-pool.mjs public/data/daily/approved-pool.json public/data/daily/daily-schedule.json public/data/daily/pool
git commit -m "feat: migrate existing daily challenges into reusable approved pool"
```

---

## Task 4: Client cutover — `daily-ui.js` reads pool + schedule, All Bugs removed

**Files:**
- Modify: `src/scripts/daily-ui.js`
- Depends on: Task 1 (`getTodaysEntry`), Task 3 (pool/schedule files exist)

- [ ] **Step 1: Update imports and module state**

In `src/scripts/daily-ui.js`, change the daily-engine import (line 10-14) to add the selector:

```js
import {
  getTodayET, getChallengeNumber, validateGuess,
  loadDailyState, saveDailyResult, loadHistory,
  calculateStreaks, getCountdownToReset, getTodaysEntry,
} from './daily-engine.js';
```

Replace the module-state lines `let mode = 'bugs101';` ... `let allSpeciesList = [];` (lines 43-54) with (drop `allSpeciesList`, hard-pin mode):

```js
const mode = 'bugs101';
let challenge = null;        // today's pool entry
let today = null;            // YYYY-MM-DD
let challengeNumber = 0;
let currentGuess = 0;        // which crop we're showing (0-indexed)
let guesses = [];            // array of { answer: string, correct: boolean }
const maxGuesses = 3;
let solved = false;
let gameOver = false;
let sessionId = null;
let shareClicked = false;
```

- [ ] **Step 2: Remove `?mode` parsing and the All Bugs species-list block in `initDaily`**

In `initDaily()` replace lines 74-76 (the `params`/`mode`/`maxGuesses` block) with:

```js
  today = getTodayET();
  challengeNumber = getChallengeNumber(today);
```

Delete the entire All Bugs species-list block (lines 110-136, from the comment `// Load species list for allbugs autocomplete` through the closing of the `if (mode === 'allbugs') { ... }`).

- [ ] **Step 3: Replace `loadChallenge` to use the pool + schedule**

Replace the whole `loadChallenge` function (lines 210-235) with:

```js
async function loadChallenge() {
  try {
    const [poolRes, schedRes] = await Promise.all([
      fetch(`${base}/data/daily/approved-pool.json`),
      fetch(`${base}/data/daily/daily-schedule.json`),
    ]);
    if (!poolRes.ok) throw new Error('Pool not found');
    const pool = await poolRes.json();
    const schedule = schedRes.ok ? await schedRes.json() : {};

    const entry = getTodaysEntry(pool, schedule, today);
    if (!entry) {
      container.innerHTML = `<div class="container" style="text-align:center;padding-top:80px;">
        <h2>No challenge today</h2>
        <p class="subtitle">Check back tomorrow!</p>
        <a href="${base}/" style="color:var(--accent);">Back to home</a>
      </div>`;
      return false;
    }

    challenge = entry;
    return true;
  } catch (err) {
    container.innerHTML = `<div class="container" style="text-align:center;padding-top:80px;">
      <p>Failed to load daily challenge.</p>
      <p style="color:var(--text-secondary);font-size:13px;">${escapeHTML(err.message)}</p>
    </div>`;
    return false;
  }
}
```

- [ ] **Step 4: Point the data accessors at the flat pool entry**

Replace `getChallengeData` (lines 237-240):

```js
/** Returns today's pool entry. */
function getChallengeData() {
  return challenge;
}
```

`getAnswer()` and `getCrops()` already delegate to `getChallengeData()` and stay unchanged (they read `.answer_common` / `.crops`, which exist on the pool entry).

- [ ] **Step 5: Remove the remaining All Bugs branches**

Make these edits in `src/scripts/daily-ui.js`:

- `showDailyRulesPopup` (line 167-168): replace the two `mode === 'bugs101' ? ... : ...` ternaries with the Bugs 101 literals:
  ```js
  const modeLabel = 'Bugs 101 Daily';
  const guessInfo = '3 guesses · Name the type';
  ```
- `renderGame` (line 256): `const modeLabel = 'Bugs 101 Daily';`
- `renderGame` input-area block (lines 258-283): delete the `else { ... }` branch and the `if (mode === 'bugs101')` guard, keeping only the pill-grid `inputAreaHTML` assignment.
- `renderGame` (lines 307-311): replace the `if (mode === 'bugs101') { setupPillGrid(); } else { setupAutocomplete(); }` with just `setupPillGrid();`
- Delete `setupAutocomplete` (lines 382-460) and `updateHighlight` (lines 462-472) entirely (now unused).
- `submitGuess` (lines 534-544): replace the `if (mode === 'bugs101') { ...deselect pill... } else { ...input... }` block with only the pill-deselect body:
  ```js
      // Deselect any selected pill
      const prev = document.querySelector('.daily-pill.selected');
      if (prev) prev.classList.remove('selected');
  ```
- `renderReveal` (line 574): `const modeLabel = 'Bugs 101 Daily';`
- `renderReveal` (line 592): `const scientificName = data.answer_order;`

`generateDailyShareText({ mode, ... })` is still called with `mode` (value `'bugs101'`) and continues to work unchanged — no edit to `daily-share.js`.

- [ ] **Step 6: Build to verify no broken references**

Run: `npm run build`
Expected: Astro build completes with no errors (no references to removed `setupAutocomplete`, `allSpeciesList`, `updateHighlight`, `highlightedIndex`).

Note: `highlightedIndex` (line 56) and `selectedAnswer` (line 55) — keep `selectedAnswer` (used by the pill grid). Remove the `let highlightedIndex = -1;` line, now orphaned.

- [ ] **Step 7: Manual smoke test**

Run: `npm run dev`, open `/daily/play`. Expected: a Bugs 101 challenge loads (pill grid, 3 guesses), reveal screen shows species name + order + iNaturalist link + share. Confirm `localStorage` key `daily_bugs101_history` is written on completion.

- [ ] **Step 8: Commit**

```bash
git add src/scripts/daily-ui.js
git commit -m "feat: daily challenge reads approved pool + schedule, drop All Bugs mode"
```

---

## Task 5: Pool-builder mode in `review-server.mjs`

**Files:**
- Modify: `scripts/review-server.mjs`
- Depends on: Task 2 (`scripts/lib/pool.mjs`), Task 3 (pool/schedule files)

Adds a `/pool` UI route and `/api/pool/*` endpoints alongside the existing `/` (daily) and `/general` modes, reusing the file's existing `downloadImage`, `generateCrop`, `generateReveal`, `getBugs101Name`, `VALID_BUGS101_NAMES`.

- [ ] **Step 1: Replace the duplicated name logic with a lib import, add pool constants**

In `scripts/review-server.mjs`, add to the import block (after `import sharp from 'sharp';`, line 23):

```js
import { getBugs101Name, VALID_BUGS101_NAMES, topUpSchedule } from './lib/pool.mjs';
```

Then **delete the entire duplicated name-logic block**: lines 42–130, from the comment `// ---------------------------------------------------------------------------` / `// Bugs 101 display name logic (copied from generate-daily.mjs)` through the end of the `const VALID_BUGS101_NAMES = new Set([...]);` declaration (the closing `]);` on line 130). `getBugs101Name` and `VALID_BUGS101_NAMES` now come from the lib. The lib's `getBugs101Name` is the same logic plus a leading `if (!taxon) return undefined;` guard; every call site in this file (`pickNewCandidate` line 273, `generateEntryImages` line 326) already checks `if (!obs.taxon) continue;` first, so behavior is identical.

After the existing `const FLAGGED_OBS_FILE = ...;` line (line 33) add:

```js
const POOL_FILE = join(DAILY_DIR, 'approved-pool.json');
const SCHEDULE_FILE = join(DAILY_DIR, 'daily-schedule.json');
const POOL_DIR = join(DAILY_DIR, 'pool');
const POOL_SKIP_FILE = join(DAILY_DIR, 'pool-skipped.json');
```

After the `generateReveal` function (ends line 214) add:

```js
function loadPool() {
  return existsSync(POOL_FILE) ? JSON.parse(readFileSync(POOL_FILE, 'utf-8')) : [];
}
function loadSkips() {
  return existsSync(POOL_SKIP_FILE) ? JSON.parse(readFileSync(POOL_SKIP_FILE, 'utf-8')) : [];
}
function todayET() {
  const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return `${et.getFullYear()}-${String(et.getMonth() + 1).padStart(2, '0')}-${String(et.getDate()).padStart(2, '0')}`;
}

/** Next unused, valid-name candidate not already in the pool or skipped. */
function nextPoolCandidate() {
  const pool = loadPool();
  const skipped = new Set(loadSkips());
  const inPool = new Set(pool.map(p => p.id));
  const cands = JSON.parse(readFileSync(CANDIDATES_FILE, 'utf-8'));
  for (const o of cands) {
    if (inPool.has(o.id) || skipped.has(o.id) || !o.taxon) continue;
    const name = getBugs101Name(o.taxon);
    if (VALID_BUGS101_NAMES.has(name)) return { obs: o, name };
  }
  return null;
}
```

(The `getBugs101Name`/`VALID_BUGS101_NAMES`/`topUpSchedule` import was added at the top in the edit above.)

- [ ] **Step 2: Add the `/pool` UI route and `/api/pool/*` endpoints**

In the HTTP server (`createServer` callback), immediately before the `// --- General Pool Review UI ---` block (line 719) insert:

```js
  // --- Pool builder UI ---
  if (url.pathname === '/pool') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(getPoolHTML());
    return;
  }

  // --- API: GET next pool candidate ---
  if (url.pathname === '/api/pool/next' && req.method === 'GET') {
    const next = nextPoolCandidate();
    if (!next) { res.writeHead(200); res.end(JSON.stringify({ done: true })); return; }
    const dir = join(POOL_DIR, '_preview', String(next.obs.id));
    mkdirSync(dir, { recursive: true });
    try {
      const buf = await downloadImage(next.obs.photo_url);
      for (let i = 0; i < BUGS101_FRACS.length; i++) {
        await generateCrop(buf, BUGS101_FRACS[i], join(dir, `${i + 1}.jpg`), 0.5, 0.5);
      }
      await generateReveal(buf, join(dir, 'full.jpg'));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: next.obs.id, name: next.name, order: next.obs.taxon.order,
        attribution: next.obs.attribution, inat_url: next.obs.inat_url,
        wikipedia_summary: next.obs.wikipedia_summary || '',
        center_x: 0.5, center_y: 0.5,
      }));
    } catch (err) { res.writeHead(500); res.end(err.message); }
    return;
  }

  // --- API: POST recrop a preview at a new center ---
  if (url.pathname === '/api/pool/recrop' && req.method === 'POST') {
    let body = ''; for await (const c of req) body += c;
    const { id, cx, cy } = JSON.parse(body);
    const obs = JSON.parse(readFileSync(CANDIDATES_FILE, 'utf-8')).find(o => o.id === id);
    if (!obs) { res.writeHead(404); res.end('not found'); return; }
    const dir = join(POOL_DIR, '_preview', String(id));
    try {
      const buf = await downloadImage(obs.photo_url);
      for (let i = 0; i < BUGS101_FRACS.length; i++) {
        await generateCrop(buf, BUGS101_FRACS[i], join(dir, `${i + 1}.jpg`), cx, cy);
      }
      res.writeHead(200); res.end(JSON.stringify({ ok: true }));
    } catch (err) { res.writeHead(500); res.end(err.message); }
    return;
  }

  // --- API: POST approve → append to pool ---
  if (url.pathname === '/api/pool/approve' && req.method === 'POST') {
    let body = ''; for await (const c of req) body += c;
    const { id, cx, cy } = JSON.parse(body);
    const obs = JSON.parse(readFileSync(CANDIDATES_FILE, 'utf-8')).find(o => o.id === id);
    if (!obs) { res.writeHead(404); res.end('not found'); return; }
    const dir = join(POOL_DIR, String(id));
    mkdirSync(dir, { recursive: true });
    try {
      const buf = await downloadImage(obs.photo_url);
      const cropPaths = [];
      for (let i = 0; i < BUGS101_FRACS.length; i++) {
        await generateCrop(buf, BUGS101_FRACS[i], join(dir, `${i + 1}.jpg`), cx, cy);
        cropPaths.push(`daily/pool/${id}/${i + 1}.jpg`);
      }
      await generateReveal(buf, join(dir, 'full.jpg'));
      const pool = loadPool();
      pool.push({
        id, answer_common: getBugs101Name(obs.taxon), answer_order: obs.taxon.order,
        crops: cropPaths, reveal: `daily/pool/${id}/full.jpg`,
        attribution: obs.attribution || '', wikipedia_summary: obs.wikipedia_summary || '',
        inat_url: obs.inat_url || '', center_x: cx, center_y: cy, added: todayET(),
      });
      writeFileSync(POOL_FILE, JSON.stringify(pool, null, 2));
      res.writeHead(200); res.end(JSON.stringify({ ok: true, poolSize: pool.length }));
    } catch (err) { res.writeHead(500); res.end(err.message); }
    return;
  }

  // --- API: POST skip a candidate ---
  if (url.pathname === '/api/pool/skip' && req.method === 'POST') {
    let body = ''; for await (const c of req) body += c;
    const { id } = JSON.parse(body);
    const skips = loadSkips();
    if (!skips.includes(id)) skips.push(id);
    writeFileSync(POOL_SKIP_FILE, JSON.stringify(skips, null, 2));
    res.writeHead(200); res.end(JSON.stringify({ ok: true }));
    return;
  }

  // --- API: POST top up the schedule to today+90 ---
  if (url.pathname === '/api/pool/topup' && req.method === 'POST') {
    const pool = loadPool();
    const schedule = existsSync(SCHEDULE_FILE) ? JSON.parse(readFileSync(SCHEDULE_FILE, 'utf-8')) : {};
    const next = topUpSchedule(pool, schedule, todayET(), 90);
    writeFileSync(SCHEDULE_FILE, JSON.stringify(next, null, 2));
    res.writeHead(200); res.end(JSON.stringify({ ok: true, days: Object.keys(next).length }));
    return;
  }

  // --- Serve preview images ---
  if (url.pathname.startsWith('/pool-preview/')) {
    const fp = join(POOL_DIR, '_preview', url.pathname.replace('/pool-preview/', ''));
    if (existsSync(fp)) {
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-cache' });
      res.end(readFileSync(fp));
      return;
    }
    res.writeHead(404); res.end('not found'); return;
  }
```

- [ ] **Step 3: Add the `getPoolHTML` function**

After `getReviewHTML()` (ends line 603) add:

```js
function getPoolHTML() {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Pool Builder</title>
<style>
  body { font-family: -apple-system, sans-serif; background:#1a1917; color:#e0ddd8; padding:24px; }
  .answer { font-size:18px; margin:12px 0; } .answer strong { color:#d4794e; }
  .picker { position:relative; display:inline-block; cursor:crosshair; }
  .picker img { max-height:360px; border-radius:8px; border:2px solid #2e2c28; display:block; }
  .ch { position:absolute; width:22px; height:22px; border-radius:50%; border:2px solid #4aff44;
        background:rgba(68,255,68,.25); transform:translate(-50%,-50%); pointer-events:none; }
  .crops { display:flex; gap:6px; margin:10px 0; } .crops img { height:110px; border-radius:6px; }
  button { padding:10px 22px; border:none; border-radius:8px; font-weight:600; cursor:pointer; margin-right:8px; }
  .approve { background:#059669; color:#fff; } .skip { background:#7c5a1e; color:#fde047; }
  .topup { background:#2563eb; color:#fff; } .recrop { background:#444; color:#fff; }
  #status { color:#9a9590; margin:12px 0; }
</style></head><body>
<h1>Pool Builder</h1>
<div id="status">Loading…</div>
<div id="card"></div>
<button class="topup" onclick="topup()">Top up schedule (today+90)</button>
<script>
let cur=null, cx=0.5, cy=0.5;
async function next(){
  document.getElementById('status').textContent='Loading next candidate…';
  const r=await fetch('/api/pool/next'); const d=await r.json();
  if(d.done){ document.getElementById('card').innerHTML='<p>No more candidates.</p>'; document.getElementById('status').textContent=''; return; }
  cur=d; cx=d.center_x; cy=d.center_y; renderCard();
}
function bust(u){ return u+'?t='+Date.now(); }
function renderCard(){
  document.getElementById('status').textContent='Candidate #'+cur.id;
  document.getElementById('card').innerHTML=
    '<div class="answer">Answer: <strong>'+cur.name+'</strong> ('+cur.order+')</div>'+
    '<div class="crops">'+[1,2,3].map(i=>'<img src="'+bust('/pool-preview/'+cur.id+'/'+i+'.jpg')+'">').join('')+'</div>'+
    '<div class="picker" id="pk"><img src="'+bust('/pool-preview/'+cur.id+'/full.jpg')+'">'+
    '<div class="ch" style="left:'+(cx*100)+'%;top:'+(cy*100)+'%"></div></div>'+
    '<p><button class="recrop" onclick="recrop()">Re-crop at center</button>'+
    '<button class="approve" onclick="approve()">Approve → pool</button>'+
    '<button class="skip" onclick="skip()">Skip</button></p>';
  document.getElementById('pk').onclick=(e)=>{
    const img=e.currentTarget.querySelector('img'); const b=img.getBoundingClientRect();
    cx=Math.round((e.clientX-b.left)/b.width*1000)/1000;
    cy=Math.round((e.clientY-b.top)/b.height*1000)/1000;
    e.currentTarget.querySelector('.ch').style.left=(cx*100)+'%';
    e.currentTarget.querySelector('.ch').style.top=(cy*100)+'%';
  };
}
async function post(u,b){ return fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}); }
async function recrop(){ document.getElementById('status').textContent='Re-cropping…';
  await post('/api/pool/recrop',{id:cur.id,cx,cy}); renderCard(); }
async function approve(){ document.getElementById('status').textContent='Approving…';
  const r=await post('/api/pool/approve',{id:cur.id,cx,cy}); const d=await r.json();
  if(!r.ok){ alert('Error: '+JSON.stringify(d)); return; } next(); }
async function skip(){ await post('/api/pool/skip',{id:cur.id}); next(); }
async function topup(){ const r=await post('/api/pool/topup',{}); const d=await r.json();
  document.getElementById('status').textContent='Schedule now covers '+d.days+' days.'; }
next();
</script></body></html>`;
}
```

- [ ] **Step 4: Update the startup log**

Replace the `console.log` block in `server.listen` (lines 924-933) to add the pool route. Change the line that logs `/general` to also log:

```js
  console.log(`   http://localhost:${PORT}/pool      — Pool builder (Bugs 101)`);
```

- [ ] **Step 5: Smoke test the pool builder**

Run: `npm run review-daily`, open `http://localhost:3333/pool`.
Expected: a candidate loads with 3 crops + a clickable reveal; clicking sets the crosshair; "Re-crop at center" updates the crops; "Approve" appends to `approved-pool.json` and advances; "Skip" advances and records the id in `pool-skipped.json`; "Top up schedule" reports a day count.
Also open `http://localhost:3333/` (the existing daily-review mode) and confirm it still renders challenge cards with correct Bugs 101 answers — this proves the deleted local `getBugs101Name`/`VALID_BUGS101_NAMES` were correctly replaced by the lib import at the existing call sites. Stop the server (Ctrl+C).

- [ ] **Step 6: Add `_preview` to gitignore and commit**

Add `public/data/daily/pool/_preview/` to `.gitignore`. Then:

```bash
git add scripts/review-server.mjs .gitignore
git commit -m "feat: add pool-builder mode to review-server (crop, approve, schedule top-up)"
```

---

## Task 6: Retire `generate-daily`, final cutover cleanup

**Files:**
- Modify: `package.json`
- Delete: `public/data/daily/<YYYY-MM-DD>/` folders, `public/data/daily/manifest.json`

- [ ] **Step 1: Remove the `generate-daily` npm script**

In `package.json`, delete the line:

```json
    "generate-daily": "node scripts/generate-daily.mjs",
```

(`scripts/generate-daily.mjs` stays in the repo, unwired, per spec.)

- [ ] **Step 2: Verify nothing else references the manifest or date folders**

Run: `grep -rn "manifest.json\|daily/20" src/ scripts/ --include=*.js --include=*.mjs --include=*.astro | grep -v review-server | grep -v generate-daily | grep -v recrop-daily`
Expected: no output (the client now uses `approved-pool.json`; only the retired/unwired scripts reference the manifest).

- [ ] **Step 3: Run the full test suite + build**

Run: `npm test && npm run build`
Expected: all vitest suites pass (including `daily-engine.test.js`, `pool.test.js`, `daily-share.test.js`), Astro build succeeds.

- [ ] **Step 4: Delete superseded date folders and manifest**

These are tracked, committed assets being intentionally removed now that the client runs on the pool. `git rm` keeps them recoverable in history.

```bash
git rm -r 'public/data/daily/2026-*' public/data/daily/manifest.json
```

- [ ] **Step 5: Final build to confirm nothing breaks without the old assets**

Run: `npm run build`
Expected: build succeeds; `dist/data/daily/approved-pool.json` and `daily-schedule.json` are present, no references to deleted folders.

- [ ] **Step 6: Commit**

```bash
git add package.json
git commit -m "chore: retire generate-daily script, remove superseded manifest + date folders"
```

---

## Self-Review

**Spec coverage:**
- §1 data model (`approved-pool.json`, `daily-schedule.json`, `daily/pool/<id>/`) → Tasks 2, 3.
- §2 migration (bugs101 verbatim, allbugs re-derived, de-dupe) → Tasks 2 (`buildPoolEntries`), 3 (runner). Wikipedia backfill intentionally dropped — see Spec Deviations §1.
- §3 selector (schedule + hash fallback, never blank, date-based numbering unchanged) → Task 1, Task 4.
- §4 batch tool (source candidates, click-center, approve→pool, skip, schedule top-up) → Task 5.
- §5 All Bugs removal (`daily-ui.js`, retire `generate-daily`) → Tasks 4, 6. `index.astro`/`play.astro` unchanged — see Spec Deviations §2.
- Duplication reduction (`getBugs101Name`/`VALID_BUGS101_NAMES` canonicalized in `pool.mjs`, `review-server.mjs` copy deleted) → Tasks 2, 5 — see Spec Deviations §5.
- §6 risks: small-pool repeat-avoidance → `topUpSchedule` window (Task 2); schedule-lapse → hash fallback (Task 1); destructive cleanup → explicit `git rm` (Task 6).

**Placeholder scan:** No TBD/TODO; every code step contains complete code; every command has an expected result.

**Type consistency:** Pool entry shape `{id, answer_common, answer_order, crops[3], reveal, attribution, wikipedia_summary, inat_url, center_x, center_y, added}` is identical across `buildPoolEntries` (Task 2), `migrate-pool.mjs` (Task 3), `/api/pool/approve` (Task 5), and consumed unchanged by `getChallengeData`/`getAnswer`/`getCrops` (Task 4). `getTodaysEntry(pool, schedule, today)` and `topUpSchedule(pool, schedule, fromDate, days)` signatures are consistent between definition (Tasks 1, 2) and all call sites (Tasks 3, 4, 5). Crop path strings are `daily/pool/<id>/N.jpg` everywhere.
