# Set × Mode Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `mode` (classic / time_trial / streak) a runtime parameter independent of the content set, so every available set can be played in any mode. Remove all mode-as-set entries from `sets.json` and move mode choice into runtime routing/UI.

**Architecture:** Today, `sets.json` contains content sets (`bugs_101`, `all_bugs`, themed sets) plus mode-as-set aliases (`bugs_101_time_trial`, `bugs_101_streak`, `time_trial`, `streak`) that duplicate existing `observation_ids` and differ only by `mode` / display copy. We collapse `sets.json` to content sets only and have `SessionState` accept `mode` as a constructor argument. The game route becomes path-based: `/<setKey>/<mode>/play`, generated statically for every content set × valid mode. The old `/play` route stops hosting the game and redirects to the game homepage. The homepage becomes set-first: users pick a content set, then choose one of the three modes before launching `/<setKey>/<mode>/play`.

**Tech Stack:** Astro 4, vanilla JS, Vitest, existing pure-function game engine.

**Ship checkpoint:** This plan ships as a standalone single-player improvement. Merge to main before starting the multiplayer plan.

---

## File map

- **Modify:** `public/data/sets.json` — remove all mode-as-set entries: `bugs_101_time_trial`, `bugs_101_streak`, `time_trial`, and `streak`. Keep only content sets (`bugs_101`, `all_bugs`, themed sets, etc.).
- **Modify:** `src/scripts/game-engine.js:299-330` — `SessionState` constructor takes `mode` as an explicit argument; remove `this.mode = setDef.mode || 'classic'` fallback.
- **Modify:** `src/scripts/game-ui.js` — `initGame()` reads `mode` from URL, passes to `SessionState`. Update `logSessionStart` / `logSessionEnd` callers to use the runtime mode.
- **Modify:** `src/scripts/share.js` — generated share URLs include both `set` and `mode`.
- **Modify:** `src/scripts/percentiles.js` — percentile lookup accepts `mode` and maps old mode-as-set percentile keys during migration.
- **Create:** `src/pages/[set]/[mode]/play.astro` — static game route generated for every content set × mode, passes params into `initGame(setKey, mode)`.
- **Modify:** `src/pages/play.astro` — replace the old game entry point with a redirect to the game homepage.
- **Modify:** `src/pages/index.astro` — remove the dedicated Compete clutter and make set cards lead to a mode choice UI for the selected content set.
- **Modify:** `tests/session.test.js` — add/update tests for runtime mode parameter.
- **Modify:** `tests/scoring.test.js` — no functional change expected; verify still passes.

---

## Task 1: Audit `sets.json` and confirm all mode-as-set entries are removable

**Files:**
- Read: `public/data/sets.json`

- [ ] **Step 1: Inventory all set entries that declare a `mode` field**

Run: `grep -n '"mode":' public/data/sets.json`

Expected output: lines for `bugs_101_time_trial`, `bugs_101_streak`, top-level `time_trial`, top-level `streak`, and any others.

- [ ] **Step 2: For each set with a `mode`, compare its `observation_ids` against candidate content sets**

For each mode-as-set candidate, check whether its `observation_ids` is identical to the intended content set.

Run for `bugs_101_time_trial`:
```bash
node -e '
const s = require("./public/data/sets.json");
const a = JSON.stringify(s.bugs_101.observation_ids.slice().sort());
const b = JSON.stringify(s.bugs_101_time_trial.observation_ids.slice().sort());
console.log("identical:", a === b);
'
```

Repeat for `bugs_101_streak` against `bugs_101`. Repeat for top-level `time_trial` and `streak` against `all_bugs`.

- [ ] **Step 3: Document the audit result in the plan**

- Mode-as-set entries confirmed as duplicates and safe to delete later:
  - `time_trial` duplicates `all_bugs` observation IDs.
  - `streak` duplicates `all_bugs` observation IDs.
  - `bugs_101_time_trial` duplicates `bugs_101` observation IDs.
  - `bugs_101_streak` duplicates `bugs_101` observation IDs.
- No surprising `mode` entries were found beyond those four aliases.

- [ ] **Step 4: Commit the audit notes**

```bash
git add docs/superpowers/plans/2026-05-20-set-mode-refactor.md
git commit -m "docs: audit sets.json mode entries for refactor"
```

---

## Task 2: Add failing tests for runtime mode parameter

**Files:**
- Modify: `tests/session.test.js`

- [ ] **Step 1: Read existing tests to match style**

Read `tests/session.test.js` to understand the existing `SessionState` test fixtures and patterns.

- [ ] **Step 2: Add three new test cases at the end of the file**

```javascript
import { describe, it, expect } from 'vitest';
import { SessionState } from '../src/scripts/game-engine.js';
// (these imports may already exist — don't duplicate)

describe('SessionState mode as runtime parameter', () => {
  // Use the same minimal fixtures as existing tests. If those fixtures live in
  // a helper, import them. Otherwise inline a 5-observation pool here.
  const fixtures = makeMinimalFixtures(); // replace with whatever the existing tests use

  it('uses the mode argument passed to the constructor', () => {
    const session = new SessionState(
      fixtures.observations,
      fixtures.taxonomy,
      fixtures.setDef,
      'bugs_101',
      null,
      'time_trial' // new mode argument
    );
    expect(session.mode).toBe('time_trial');
  });

  it('ignores any mode field on setDef when mode arg is provided', () => {
    const setDefWithMode = { ...fixtures.setDef, mode: 'streak' };
    const session = new SessionState(
      fixtures.observations,
      fixtures.taxonomy,
      setDefWithMode,
      'bugs_101',
      null,
      'classic'
    );
    expect(session.mode).toBe('classic');
  });

  it('defaults to classic when no mode arg is given', () => {
    const session = new SessionState(
      fixtures.observations,
      fixtures.taxonomy,
      fixtures.setDef,
      'bugs_101',
      null
    );
    expect(session.mode).toBe('classic');
  });
});
```

If the existing test file uses different fixture helpers, adapt this code to match — but keep the three assertions exactly as written.

- [ ] **Step 3: Run the new tests; verify they fail**

Run: `npm test -- session.test.js`

Expected: the three new tests fail because `SessionState` doesn't accept a `mode` argument yet. Other existing tests should still pass.

- [ ] **Step 4: Commit the failing tests**

```bash
git add tests/session.test.js
git commit -m "test: add failing tests for runtime mode parameter"
```

---

## Task 3: Refactor `SessionState` to accept `mode` as a constructor argument

**Files:**
- Modify: `src/scripts/game-engine.js:299-330`

- [ ] **Step 1: Update the constructor signature**

In `src/scripts/game-engine.js`, change the `SessionState` constructor from:

```javascript
constructor(observations, taxonomy, setDef, setKey, difficulty = null) {
  this.observations = observations;
  this.taxonomy = taxonomy;
  this.setDef = setDef;
  this.setKey = setKey;
  this._difficulty = difficulty;
  this.mode = setDef.mode || 'classic';
  // ...
}
```

to:

```javascript
constructor(observations, taxonomy, setDef, setKey, difficulty = null, mode = 'classic') {
  this.observations = observations;
  this.taxonomy = taxonomy;
  this.setDef = setDef;
  this.setKey = setKey;
  this._difficulty = difficulty;
  this.mode = mode;
  // ...
}
```

The rest of the constructor body is unchanged.

- [ ] **Step 2: Run the new tests; verify they pass**

Run: `npm test -- session.test.js`

Expected: all three new tests pass. All previously-passing tests continue to pass.

- [ ] **Step 3: Run the full test suite to catch incidental breaks**

Run: `npm test`

Expected: all tests pass. If any fail because they relied on `setDef.mode`, update those specific call sites to pass mode explicitly.

- [ ] **Step 4: Commit**

```bash
git add src/scripts/game-engine.js
git commit -m "refactor(engine): make mode a SessionState constructor argument"
```

---

## Task 4: Replace `/play` query routing with `/<set>/<mode>/play`

**Files:**
- Create: `src/pages/[set]/[mode]/play.astro`
- Modify: `src/pages/play.astro`
- Modify: `src/scripts/game-ui.js` (the `initGame()` function around line 131)

- [ ] **Step 1: Read the current entry-point flow**

Read `src/pages/play.astro` end to end and `src/scripts/game-ui.js:1-200` to see how `?set=` is currently parsed. The refactor should remove query parsing from the game path entirely.

- [ ] **Step 2: Update `initGame()` to accept explicit `setKey` and `mode` arguments**

Find the `initGame` function in `src/scripts/game-ui.js`. Add `setKey` and `mode` parameters and pass `mode` to the `SessionState` constructor. Remove URL query parsing from `game-ui.js`; route params now come from Astro.

```javascript
export async function initGame(setKey, mode = 'classic') {
  // ... existing setup ...
  currentSetKey = setKey;
  const setDef = sets[currentSetKey];
  const session = new SessionState(
    observations,
    taxonomy,
    setDef,
    setKey,
    difficulty,
    mode // <-- new
  );
  // ... rest unchanged ...
}
```

If `initGame` currently derives mode from `setDef.mode`, remove that derivation.

- [ ] **Step 3: Create the static dynamic route `src/pages/[set]/[mode]/play.astro`**

Because this is a static Astro site, the dynamic route must define `getStaticPaths()` and generate one page for every content set × valid mode:

```astro
---
import Base from '../../../layouts/Base.astro';
import setsData from '../../../../public/data/sets.json';

const VALID_MODES = ['classic', 'time_trial', 'streak'];

export function getStaticPaths() {
  return Object.keys(setsData).flatMap((set) =>
    VALID_MODES.map((mode) => ({ params: { set, mode } }))
  );
}

const { set, mode } = Astro.params;
---

<Base title="Identify This Bug — What's That Bug?" description="Can you identify the insect from its photo?">
  <div id="game-container" data-set={set} data-mode={mode}>
    <div class="container" style="text-align: center; padding-top: 80px;">
      <p class="subtitle">Loading bugs...</p>
    </div>
  </div>
  <script>
    import { logPlayLanding } from '../../../scripts/feedback.js';
    import { initGame } from '../../../scripts/game-ui.js';
    const el = document.getElementById('game-container');
    const setKey = el.dataset.set;
    const mode = el.dataset.mode;
    logPlayLanding(setKey, mode);
    initGame(setKey, mode);
  </script>
</Base>
```

Adjust relative import depth if Astro requires it. The important requirements are: static paths are generated, only content sets are included, and `initGame()` receives validated params from the route.

- [ ] **Step 4: Replace `/play` with a redirect page**

`src/pages/play.astro` should no longer initialize the game. Replace it with a tiny redirect back to the game homepage (`/` locally, `/games/bugs/` in production). Wrap it in `Base` so the existing `window.__BASE` detection is available. A static-friendly client redirect is acceptable:

```astro
<script is:inline>
  window.location.replace(window.__BASE || '/');
</script>
<p><a href="/">Choose a set to play</a></p>
```

- [ ] **Step 5: Manually verify in dev**

Run: `npm run dev`

Open in browser:
- `http://localhost:4321/bugs_101/classic/play` — expect classic mode (10 rounds)
- `http://localhost:4321/bugs_101/time_trial/play` — expect 60-second timer
- `http://localhost:4321/bugs_101/streak/play` — expect ends-on-wrong behavior
- `http://localhost:4321/play` — expect redirect to the game homepage

- [ ] **Step 6: Commit**

```bash
git add src/pages/[set]/[mode]/play.astro src/pages/play.astro src/scripts/game-ui.js
git commit -m "feat(routing): use set-mode game paths"
```

---

## Task 5: Add mode-specific persistence, links, and percentile lookup

**Files:**
- Modify: `src/scripts/game-ui.js`
- Modify: `src/scripts/share.js`
- Modify: `src/scripts/percentiles.js`
- Modify: `tests/session.test.js` or add focused tests if existing helpers make that cleaner

- [ ] **Step 1: Define canonical storage and data keys for set × mode**

Add small helpers near the existing localStorage/read helpers:

```javascript
function modeKey(setKey, mode) {
  return `${setKey}_${mode || 'classic'}`;
}

function bestStorageKey(setKey, mode) {
  return `best_${modeKey(setKey, mode)}`;
}

function recentStorageKey(setKey, mode) {
  return `recent_${modeKey(setKey, mode)}`;
}
```

Use these keys consistently for best scores/streaks and recent-observation storage. This prevents `best_beetles` classic score, `best_beetles_time_trial` points, and `best_beetles_streak` count from colliding.

- [ ] **Step 2: Add one-time migration for existing localStorage keys**

Before reading or writing best scores, copy old values to the new keys if the new key is absent:

| Old key | New key |
|---|---|
| `best_<setKey>` | `best_<setKey>_classic` |
| `recent_<setKey>` | `recent_<setKey>_classic` |
| `best_bugs_101_time_trial` | `best_bugs_101_time_trial` (same key; document as already migrated) |
| `best_bugs_101_streak` | `best_bugs_101_streak` (same key; document as already migrated) |
| `best_time_trial` | `best_all_bugs_time_trial` |
| `best_streak` | `best_all_bugs_streak` |

Do not delete old keys during this refactor. Copy-only migration avoids destructive localStorage behavior and keeps old data available for debugging.

- [ ] **Step 3: Update game UI call sites to use mode-specific best keys**

Update the summary screens and any helper that reads personal bests:
- Classic summary reads/writes `bestStorageKey(currentSetKey, 'classic')`.
- Time trial summary reads/writes `bestStorageKey(currentSetKey, 'time_trial')`.
- Streak summary reads/writes `bestStorageKey(currentSetKey, 'streak')`.
- `getPostSessionRecommendation()` links to `/${setKey}/time_trial/play` instead of manufacturing old set keys.

- [ ] **Step 4: Update recent-observation storage to include mode**

`getRecentlyUsedIds()` and `saveUsedIds()` should use `recentStorageKey(setKey, mode)` or receive the already-built key. Classic mode is the only mode that currently saves recent IDs, but including mode in the key keeps the data model consistent.

- [ ] **Step 5: Update share URLs to include set + mode**

In `src/scripts/share.js`, generated links should include the actual set and mode:
- Classic: `https://dewanggogte.com/games/bugs/<setKey>/classic/play?ref=share`
- Time Trial: `https://dewanggogte.com/games/bugs/<setKey>/time_trial/play?ref=share`
- Streak: `https://dewanggogte.com/games/bugs/<setKey>/streak/play?ref=share`

If helper signatures need to accept `setKey` instead of only a set label, update the existing call sites in `game-ui.js`.

- [ ] **Step 6: Update percentile lookup to accept mode**

Change `renderPercentileCard(score, setKey, isStreak)` to also receive `mode`, or replace `isStreak` with `mode`. During migration, map old percentile keys:

| Runtime set/mode | Existing percentile key |
|---|---|
| `bugs_101` + `time_trial` | `bugs_101_time_trial` |
| `bugs_101` + `streak` | `bugs_101_streak` |
| `all_bugs` + `time_trial` | `time_trial` |
| `all_bugs` + `streak` | `streak` |

For other sets/modes with no historical percentile data yet, return an empty card rather than showing misleading data.

- [ ] **Step 7: Add focused tests for key helpers / migration behavior**

At minimum, cover:
- `best_bugs_101` migrates to `best_bugs_101_classic`.
- `best_time_trial` migrates to `best_all_bugs_time_trial`.
- Time trial and streak best keys for the same set do not collide.
- Percentile lookup maps `bugs_101 + time_trial` to existing `bugs_101_time_trial` data.

- [ ] **Step 8: Run the relevant tests**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/scripts/game-ui.js src/scripts/share.js src/scripts/percentiles.js tests/session.test.js
git commit -m "refactor(storage): key scores by set and mode"
```

---

## Task 6: Remove mode-as-set entries from `sets.json`

**Files:**
- Modify: `public/data/sets.json`

- [ ] **Step 1: Delete the mode-as-set entries identified in Task 1**

Open `public/data/sets.json` and delete the entire JSON entries for:
- `bugs_101_time_trial`
- `bugs_101_streak`
- `time_trial`
- `streak`
- Any others identified in Task 1's audit.

After this task, `sets.json` should contain content sets only. `time_trial` and `streak` are modes, not selectable set keys.

- [ ] **Step 2: Validate the JSON parses**

Run: `node -e 'JSON.parse(require("fs").readFileSync("public/data/sets.json"))' && echo OK`

Expected: `OK`. Failure means a trailing comma or syntax error from the deletion.

- [ ] **Step 3: Verify no remaining code references the deleted keys**

Run: `grep -rn 'bugs_101_time_trial\|bugs_101_streak\|set=time_trial\|set=streak' src/ tests/ scripts/ public/ || echo NO_REFS`

Expected: `NO_REFS`. If any reference remains, update it to `/<contentSet>/<mode>/play` or the new set-first mode chooser flow.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add public/data/sets.json
git commit -m "data: remove mode-as-set entries"
```

---

## Task 7: Replace homepage Compete clutter with set-first mode choice

**Files:**
- Modify: `src/pages/index.astro`

- [ ] **Step 1: Locate the current set and compete entry points**

Run: `grep -n 'set=bugs_101_time_trial\|set=bugs_101_streak\|set=time_trial\|set=streak\|play-card\|themed-btn' src/pages/index.astro`

- [ ] **Step 2: Remove dedicated mode cards and make set cards launch a mode chooser**

Remove the dedicated Compete cards for Bugs 101 / All Bugs time trial and streak. The homepage should show content set cards only. Clicking a content set should reveal a small mode picker for that set with three actions:

- Classic: `/<setKey>/classic/play`
- Time Trial: `/<setKey>/time_trial/play`
- Streak: `/<setKey>/streak/play`

Keep this implementation small. A modal, inline expanded card, or separate mode-picker page are all acceptable, but do not keep separate homepage tiles for each mode.

- [ ] **Step 3: Search the rest of the codebase for any other links to deleted set keys**

Run: `grep -rn 'set=bugs_101_time_trial\|set=bugs_101_streak\|set=time_trial\|set=streak' src/ public/ --include="*.astro" --include="*.html" --include="*.md"`

Expected: empty. Update any stragglers (e.g. in onboarding screens, recommendations, share links, or marketing copy).

- [ ] **Step 4: Manually verify the homepage**

Run: `npm run dev`

Open `http://localhost:4321/`. Click each visible content set card and confirm the mode chooser appears. For at least Bugs 101, All Bugs, and one themed set, launch all three modes and confirm the URL uses `/<setKey>/<mode>/play`.

- [ ] **Step 5: Commit**

```bash
git add src/pages/index.astro
git commit -m "ui(home): make homepage set-first with mode chooser"
```

---

## Task 8: Verify single-player flows end-to-end and ship

**Files:** none modified — verification only.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 2: Run the build**

Run: `npm run build`

Expected: build succeeds with no errors.

- [ ] **Step 3: Manually verify each mode in dev**

Run: `npm run dev`

Walk through each scenario and confirm correct behavior:

| URL | Expected behavior |
|---|---|
| `/bugs_101/classic/play` | 10 rounds, classic scoring (binary correct/incorrect by Bugs 101 name) |
| `/bugs_101/time_trial/play` | 60-second timer, pool recycles, ends when timer fires |
| `/bugs_101/streak/play` | Continues until first wrong answer |
| `/all_bugs/classic/play` | 10 rounds, genus-level scoring |
| `/beetles/time_trial/play` | Themed set works in time-trial mode |
| `/spiders/streak/play` | Themed set works in streak mode |
| `/play` | Redirects to the game homepage |
| Homepage set cards | Each set card opens mode choice; each mode routes to the correct game |

For each, confirm that the correct mode-specific best-score key is being written (open DevTools → Application → Local Storage).

- [ ] **Step 4: Verify the feedback webhook still receives mode correctly**

Open DevTools Network tab while starting a game. Find the `logSessionStart` request to the feedback webhook. Confirm the payload includes the correct `mode` value (e.g. `"time_trial"`, not `"classic"` or undefined).

- [ ] **Step 5: Ship the refactor**

If everything passes, this branch is ready to merge into main. Once merged, you can start the multiplayer plan.

- [ ] **Step 6: Write a DEVLOG entry**

Append to `docs/DEVLOG.md` (create if missing — check first with `ls docs/DEVLOG.md`):

```markdown
## 2026-05-20 — set × mode refactor

**The problem:** `sets.json` mixed content sets (`bugs_101`, `all_bugs`, themed sets)
with mode-as-set aliases (`bugs_101_time_trial`, `bugs_101_streak`, `time_trial`,
`streak`). Every new set would have needed duplicated entries for each mode, and the
homepage had to expose separate cards for modes instead of letting players choose a
set first.

**Why it happened:** Mode was originally a property of the set so the homepage
could link directly with one URL param. The shortcut didn't scale once all sets
needed to support all modes.

**The fix:** Made `mode` a constructor argument on `SessionState`, read it from
the path-based `/<set>/<mode>/play` route, and deleted all mode-as-set entries from
`sets.json`. The old `/play` route redirects to the game homepage. The homepage became
set-first: choose a content set, then choose classic, time trial, or streak.

**Key insight:** Data shape decisions made for one consumer (the homepage)
ossify into constraints for every future consumer. Prefer orthogonal
parameters even when one consumer doesn't yet need both.
```

- [ ] **Step 7: Commit the DEVLOG and prepare for merge**

```bash
git add docs/DEVLOG.md
git commit -m "docs(devlog): set × mode refactor entry"
```

The branch is now ready for merge into main. Confirm with the user before pushing or opening a PR.
