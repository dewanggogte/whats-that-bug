# Bugs 101 Variety & Ick-Free Main Pool

**Date:** 2026-04-08
**Status:** Approved

## Problem

1. Bugs 101 is dominated by butterflies/moths (28%) and dragonflies (15%), making sessions feel repetitive — especially with only 4 answer choices per round.
2. Ick-inducing taxa (ticks, centipedes, mosquitoes, etc.) appear in Bugs 101 and All Bugs, causing player drop-off. These should only appear in Tiny Terrors.
3. Pipeline-level order caps are blunt instruments that don't map to the player's experience of Bugs 101 *categories* (e.g., Lepidoptera splits into Butterfly, Moth, Hawk Moth, etc.).

## Design

### A. Ick-Free Main Pool

Expand the exclusion list for the Bugs 101 and All Bugs main pool in `buildSets()`. These observations remain in `observations.json` and are available to Tiny Terrors and other sets.

**Orders excluded entirely:**
- Ixodida (ticks)
- Blattodea (cockroaches)
- Scolopendromorpha (centipedes)
- Dermaptera (earwigs)
- Siphonaptera (fleas)
- Zygentoma (silverfish)

**Classes excluded entirely:**
- Chilopoda (all centipedes)
- Diplopoda (all millipedes)

**Isopoda excluded** (woodlice/pillbugs).

**Families excluded within otherwise-fine orders:**
- Culicidae — mosquitoes (Diptera)
- Cimicidae — bed bugs (Hemiptera)
- Aphididae — aphids (Hemiptera)
- Dermestidae — carpet beetles (Coleoptera)

**Kept in:** Flies (Muscidae, Calliphoridae, Drosophilidae, Tipulidae) — ick factor is low. Scorpions, spiders (including tarantulas), wasps — cool/interesting, not icky.

**Where:** `buildSets()` in `fetch-data.mjs` and `rebuild-sets.mjs`. Change `EXCLUDED_ORDERS` to a broader structure with orders, classes, and families.

### B. Category-Level Caps for Bugs 101

**Principle:** With ~20 distinct Bugs 101 categories in the pleasant pool, no single category should exceed 8% of the set. This ensures a random 10-round session has 8+ distinct categories.

**Implementation in `buildSets()`:**

1. Start with the ick-free main pool indices.
2. For each observation, compute its Bugs 101 category using the same `getBugs101Name()` logic from `game-engine.js`.
3. Count observations per category.
4. Cap each category at 8% of the total pool size. When capping, prefer `featured === true` observations.
5. The resulting capped indices become the `bugs_101` observation_ids.

**Scope:** Only affects `bugs_101` and its variants (`bugs_101_time_trial`, `bugs_101_streak`). All Bugs uses the same ick-free pool but without category caps — species-level play doesn't suffer from category repetition.

**Duplication of `getBugs101Name`:** The function lives in `src/scripts/game-engine.js` (client ES module). The set-building scripts run in Node. Rather than importing across module boundaries, duplicate the category-mapping logic as a build-time helper in the scripts. Add a comment in both locations cross-referencing the other so they stay in sync.

**Pipeline-level order caps** remain as a safety net (flat 15% default) to prevent gross data imbalance. The surgical variety work happens here in set building.

### C. Game Engine Variety Tracking

**Goal:** In Bugs 101 classic/time-trial/streak modes, avoid showing the same category as the correct answer in consecutive rounds.

**Algorithm in `SessionState.nextRound()`:**

1. Build `available` pool (observations not yet used in this session).
2. Compute each candidate's Bugs 101 category via `getBugs101Name()`.
3. Filter out candidates whose category appeared in `_recentCategories` (last 3 rounds) → `freshCategoryPool`.
4. If `freshCategoryPool` is non-empty, apply difficulty tier selection within it (variety first, difficulty second).
5. If `freshCategoryPool` is empty (very small sets or limited category diversity), fall back to the full `available` pool with difficulty selection. Never block the game.

**State:** Add `_recentCategories = []` to `SessionState`. On `submitAnswer()`, push the correct answer's category and keep only the last 3 entries. Lightweight, no persistence.

**Scope:** Only applies when `setDef.scoring === 'binary'` (Bugs 101 modes). All Bugs / taxonomic scoring doesn't need this — two different beetle species is a meaningfully different question.

**Edge cases:**
- Time Trial / Streak modes run indefinitely and recycle the pool. The 3-round rolling window still works.
- If the set has fewer than 4 categories total (shouldn't happen with our pool), the filter gracefully falls back.

## Files Changed

| File | Change |
|------|--------|
| `scripts/fetch-data.mjs` | Expand exclusion in `buildSets()`, add category-level caps for bugs_101 |
| `scripts/rebuild-sets.mjs` | Mirror the expanded exclusion and category caps |
| `src/scripts/game-engine.js` | Add `_recentCategories` tracking in `SessionState`, filter in `nextRound()` |

## Risks & Tradeoffs

- **Duplicated `getBugs101Name` logic** between build scripts and game engine. Mitigated by cross-referencing comments. A shared module would be cleaner but requires build tooling changes that aren't worth it for one function.
- **8% category cap is a heuristic.** If the pool has 15 categories, 8% means max ~50 observations per category in a 600-obs set. Some categories may have fewer observations naturally, which is fine — the cap only trims the dominant ones.
- **Category variety filter reduces the effective pool per round.** With 20 categories and a 3-round lookback, ~85% of the pool remains available each round. Not a concern.
