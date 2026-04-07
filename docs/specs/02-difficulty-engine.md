# Spec 2: Difficulty Engine & Adaptive Play

**PRD features merged:** #6 Observation Difficulty Scoring (2A), #12 Adaptive Session Difficulty (2B)

**Files owned (only this spec touches these):**
- Create: `scripts/calculate-difficulty.mjs` — offline script to score observations
- Create: `public/data/difficulty.json` — output consumed at runtime
- Modify: `src/scripts/game-engine.js` — adaptive round selection in `SessionState`

**Dependencies:** None. This spec is fully independent.

**Contract produced:** Contract C (difficulty.json format) — internal to this spec. No other spec reads difficulty.json directly.

---

## Context

The game has 2,621 observations in `public/data/observations.json`. Each observation has an `id`, `taxon` (species/genus/family/order), `photo_url`, and metadata. Players answer rounds and their results are logged to Google Sheets via `feedback.js`.

Currently, `SessionState.nextRound()` in `game-engine.js` (line 196) picks observations randomly from the pool. This means a new player might get an easy round followed by an impossible one — no difficulty curve.

This spec adds:
1. An offline script that scores each observation's difficulty using exported Google Sheets data
2. A `difficulty.json` file that maps observation IDs to difficulty tiers
3. Modified `SessionState` logic that picks rounds following a difficulty curve

---

## Part 1: Difficulty Scoring Script

### 1A. Script: `scripts/calculate-difficulty.mjs`

This Node.js script reads exported game event data and calculates a difficulty score per observation.

**Input:** A CSV or JSON file of `round_complete` events. The user exports this from Google Sheets. The script should accept the file path as a CLI argument.

**Expected columns in the input data:**
```
observation_id, user_answer, correct_answer, score, time_taken_ms, set, mode
```

**Algorithm:**

For each observation that appears in the data:

```
miss_rate = wrong_count / total_attempts
  (where wrong_count = attempts with score < 100 for species mode, or score === 0 for binary mode)

avg_time_ms = mean(time_taken_ms) across all attempts

time_anomaly = avg_time_ms / median_time_ms_across_all_observations
  (capped at 3.0 — anything above is equally "anomalous")

confusion_density = number_of_distinct_wrong_answers / total_attempts
  (higher = more confusing — people guess many different things)

difficulty = (miss_rate * 0.35) + (normalized_confusion_density * 0.25) + (normalized_time_anomaly * 0.2) + (miss_rate_in_bugs101 * 0.2)
```

Where:
- `miss_rate_in_bugs101` is the miss rate only from Bugs 101 mode sessions (set starting with `bugs_101`). If no Bugs 101 data exists for this observation, use the overall miss_rate.
- `normalized_confusion_density` = confusion_density / max_confusion_density_across_all_obs (scale to 0-1)
- `normalized_time_anomaly` = (time_anomaly - 1.0) / 2.0, clamped to [0, 1] (1.0 = median, 3.0+ = max anomaly)

**Tier assignment:**
```
easy:   difficulty < 0.3
medium: 0.3 <= difficulty < 0.6
hard:   difficulty >= 0.6
```

**Minimum sample size:** Observations with fewer than 3 attempts get `tier: "medium"` (unknown difficulty defaults to middle).

**Output:** `public/data/difficulty.json`

```json
{
  "12345": { "difficulty": 0.42, "tier": "medium", "miss_rate": 0.38, "avg_time_ms": 4200, "sample_size": 12 },
  "67890": { "difficulty": 0.78, "tier": "hard", "miss_rate": 0.71, "avg_time_ms": 7800, "sample_size": 8 }
}
```

Also output a summary to stdout:
```
Processed 1,847 observations with sufficient data (3+ attempts)
Tier distribution: 412 easy, 923 medium, 512 hard
774 observations have insufficient data (defaulted to medium)
Top 10 hardest: [list with IDs and scores]
Top 10 easiest: [list with IDs and scores]
```

### 1B. Script Usage

```bash
# Export round_complete events from Google Sheets as CSV, then:
node scripts/calculate-difficulty.mjs path/to/round_complete.csv

# Or pass JSON:
node scripts/calculate-difficulty.mjs path/to/events.json
```

The script should:
- Auto-detect CSV vs JSON by file extension
- For CSV, use the first row as headers
- Write output to `public/data/difficulty.json`
- Be idempotent — running it again overwrites the previous output

### 1C. Add to package.json

Add a script entry:
```json
"calculate-difficulty": "node scripts/calculate-difficulty.mjs"
```

---

## Part 2: Adaptive Round Selection

### 2A. Load Difficulty Data

In `game-engine.js`, the `SessionState` constructor currently receives `observations`, `taxonomy`, `setDef`, `setKey`. Modify it to also load difficulty data.

Since `game-engine.js` is a pure-logic module with no DOM dependencies, and it's imported by `game-ui.js` which runs in the browser, the difficulty data should be loaded at the same time as the other data files.

**Approach:** `game-ui.js` already fetches `observations.json`, `taxonomy.json`, `sets.json` in `initGame()`. Add `difficulty.json` to that fetch. Then pass it to `SessionState`.

**However**, this spec does NOT touch `game-ui.js` (that's Spec 3's territory). Instead:

1. Modify `SessionState` to accept an optional `difficulty` parameter
2. If `difficulty` is not provided, fall back to random selection (backwards-compatible)
3. Spec 3 will add the fetch and pass it through when ready

```javascript
// Modified SessionState constructor signature:
constructor(observations, taxonomy, setDef, setKey, difficulty = null)
```

Store `this._difficulty = difficulty;` in the constructor.

### 2B. Modify `nextRound()`

Replace the random pick logic in `nextRound()` (currently line 196-214) with difficulty-aware selection for classic mode.

**Current logic (simplified):**
```javascript
nextRound() {
  let available = this._pool.filter(obs => !this._usedObservationIds.has(obs.id));
  const correct = pickRandom(available);
  // ... generate distractors, return
}
```

**New logic:**
```javascript
nextRound() {
  if (this.isComplete) return null;
  let available = this._pool.filter(obs => !this._usedObservationIds.has(obs.id));

  // For non-classic modes, recycle pool when exhausted
  if (available.length === 0 && this.mode !== 'classic') {
    this._usedObservationIds.clear();
    available = [...this._pool];
  }
  if (available.length === 0) return null;

  // Pick observation based on difficulty curve (classic only, when difficulty data exists)
  let correct;
  if (this.mode === 'classic' && this._difficulty) {
    correct = this._pickByDifficulty(available);
  } else {
    correct = pickRandom(available);
  }

  this._usedObservationIds.add(correct.id);
  this._currentCorrect = correct;
  this.currentRound++;

  const isBugs101 = this.setDef.scoring === 'binary';
  const distractors = isBugs101
    ? generateBugs101Distractors(correct, this.taxonomy, this.observations)
    : generateDistractors(correct, this.taxonomy, this.observations);
  const choices = shuffle([correct, ...distractors]);
  return { correct, choices };
}
```

### 2C. New method: `_pickByDifficulty(available)`

Implements the difficulty curve from the PRD:
- Rounds 1-3: prefer Easy tier
- Rounds 4-7: prefer Medium tier
- Rounds 8-10: prefer Hard tier

```javascript
_pickByDifficulty(available) {
  const round = this.currentRound + 1; // currentRound hasn't been incremented yet

  let targetTier;
  if (round <= 3) targetTier = 'easy';
  else if (round <= 7) targetTier = 'medium';
  else targetTier = 'hard';

  // Split available into tiers
  const tierPool = available.filter(obs => {
    const d = this._difficulty[obs.id];
    return d ? d.tier === targetTier : targetTier === 'medium'; // unknown = medium
  });

  // Fall back to any available if the target tier is empty
  if (tierPool.length > 0) {
    return pickRandom(tierPool);
  }

  // Try adjacent tiers before falling back to fully random
  const fallbackOrder = targetTier === 'easy'
    ? ['medium', 'hard']
    : targetTier === 'hard'
      ? ['medium', 'easy']
      : ['easy', 'hard'];

  for (const tier of fallbackOrder) {
    const fallback = available.filter(obs => {
      const d = this._difficulty[obs.id];
      return d ? d.tier === tier : tier === 'medium';
    });
    if (fallback.length > 0) return pickRandom(fallback);
  }

  return pickRandom(available);
}
```

### 2D. Distractor Difficulty Tuning (PRD 2D)

When difficulty data is available, adjust distractor generation based on the session's current difficulty tier:

- **Easy tier rounds:** Distractors should come from different orders (visually distinct). This is already the behavior of `generateBugs101Distractors`. For "All Bugs" sets on easy rounds, use the Bugs 101 distractor strategy.
- **Medium tier rounds:** Use the current default `generateDistractors` logic.
- **Hard tier rounds:** Prefer same-genus/same-family distractors (the hardest version of `generateDistractors`). No change needed — this is already the default.

Modify `nextRound()` to select the distractor strategy based on the round's tier:

```javascript
// Inside nextRound(), after picking `correct`:
const round = this.currentRound; // already incremented at this point
let distractors;
if (isBugs101) {
  distractors = generateBugs101Distractors(correct, this.taxonomy, this.observations);
} else if (this._difficulty && round <= 3) {
  // Easy rounds in All Bugs: use cross-order distractors for visual distinction
  distractors = generateBugs101Distractors(correct, this.taxonomy, this.observations);
} else {
  distractors = generateDistractors(correct, this.taxonomy, this.observations);
}
```

---

## Part 3: Integration Point for Spec 3

Spec 3 (Game UI) will need to:
1. Add `fetch('${base}/data/difficulty.json')` in `initGame()` alongside the existing data fetches
2. Pass the difficulty data to `new SessionState(observations, taxonomy, setDef, currentSetKey, difficulty)`

This is a 2-line change in `game-ui.js` (Spec 3's territory). Document it here for Spec 3's reference:

```javascript
// In game-ui.js initGame(), add to the Promise.all:
const [obsRes, taxRes, setsRes, diffRes] = await Promise.all([
  fetch(`${base}/data/observations.json`),
  fetch(`${base}/data/taxonomy.json`),
  fetch(`${base}/data/sets.json`),
  fetch(`${base}/data/difficulty.json`).catch(() => null), // graceful fallback
]);

// Parse difficulty (may be null if file doesn't exist yet):
const difficulty = diffRes?.ok ? await diffRes.json() : null;

// Pass to SessionState:
session = new SessionState(observations, taxonomy, setDef, currentSetKey, difficulty);
```

**If Spec 3 hasn't wired this up yet**, the `SessionState` constructor defaults `difficulty` to `null` and falls back to random selection. Everything works without it.

---

## Testing

### Unit tests for difficulty scoring

Add to `tests/`:

```javascript
// tests/difficulty.test.js
import { describe, it, expect } from 'vitest';
import { SessionState } from '../src/scripts/game-engine.js';

describe('adaptive difficulty', () => {
  // Create mock data
  const observations = {
    1: { id: 1, taxon: { species: 'A', genus: 'GA', family: 'FA', order: 'OA' } },
    2: { id: 2, taxon: { species: 'B', genus: 'GB', family: 'FB', order: 'OB' } },
    3: { id: 3, taxon: { species: 'C', genus: 'GC', family: 'FC', order: 'OC' } },
  };

  const difficulty = {
    1: { tier: 'easy', difficulty: 0.1 },
    2: { tier: 'medium', difficulty: 0.4 },
    3: { tier: 'hard', difficulty: 0.8 },
  };

  it('falls back to random when no difficulty data', () => {
    const session = new SessionState(observations, { order: {}, family: {}, genus: {} },
      { observation_ids: [1, 2, 3], mode: 'classic', scoring: 'species' }, 'test');
    const round = session.nextRound();
    expect(round).not.toBeNull();
  });

  it('prefers easy observations in early rounds', () => {
    // Run 100 trials and check that easy obs appears significantly more
    let easyCount = 0;
    for (let i = 0; i < 100; i++) {
      const session = new SessionState(observations, { order: {}, family: {}, genus: {} },
        { observation_ids: [1, 2, 3], mode: 'classic', scoring: 'species' }, 'test', difficulty);
      const round = session.nextRound();
      if (round.correct.id === 1) easyCount++;
    }
    // Easy should be picked most of the time for round 1
    expect(easyCount).toBeGreaterThan(50);
  });
});
```

### Manual testing

1. Run `node scripts/calculate-difficulty.mjs` with sample data to verify output format
2. Verify `difficulty.json` is valid JSON with the correct schema
3. Play a classic session and observe that early rounds feel easier (requires wiring by Spec 3)

---

## Risks

- **Cold start problem:** New observations have 0 play data. They default to `tier: "medium"`. This is acceptable — the PRD acknowledges this. As data accumulates, re-running the script will recategorize them.
- **Data freshness:** The difficulty scores are static (computed offline). If player behavior changes significantly, scores become stale. Mitigation: re-run the script weekly. The README should note this.
- **Set imbalance:** Some sets may have very few easy or hard observations. The fallback logic in `_pickByDifficulty` handles this by cascading to adjacent tiers, then to random.
- **Backwards compatibility:** The `difficulty` parameter defaults to `null`. No existing code breaks. The adaptive behavior only activates when difficulty data is present AND the mode is classic.
