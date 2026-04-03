# Game Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Time Trial and Streak game modes, game rules pop-ups for all sets, visually distinct homepage mode cards, image preloading, and header/about page cleanup.

**Architecture:** Extend the existing `SessionState` class with a `mode` field that controls round limits, scoring, and post-answer flow. Mode-specific UI (timer, streak counter, flash effects) lives in new helper functions within `game-ui.js`. Share text and feedback logging gain a `mode` parameter.

**Tech Stack:** Astro 4, vanilla JS (ES modules), Vitest, CSS custom properties

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/scripts/game-engine.js` | Modify | Add mode configs, `calculateTimedScore()`, extend `SessionState` for unlimited rounds |
| `src/scripts/game-ui.js` | Modify | Game loop branching, timer, streak counter, flash effects, +X popup, preloading, rules popup |
| `src/scripts/share.js` | Modify | Mode-specific share text generation with URL params |
| `src/scripts/feedback.js` | Modify | Add `mode` field to all logging functions |
| `src/pages/index.astro` | Modify | Mode cards at top, remove "How to play" box, update set card links |
| `src/pages/play.astro` | No change | Mode is determined from set definition via `?set=` URL param |
| `src/layouts/Base.astro` | Modify | Remove Home/About nav links, update base path rewriting |
| `src/styles/global.css` | Modify | Mode card styles, flash animations, timer/streak UI, rules popup, +X popup |
| `public/data/sets.json` | Modify | Add `time_trial` and `streak` entries |
| `src/pages/about.astro` | Delete | Replaced by in-game rules pop-ups |
| `tests/scoring.test.js` | Modify | Add tests for `calculateTimedScore()` |
| `tests/session.test.js` | Modify | Add tests for time_trial/streak SessionState behavior |
| `tests/share.test.js` | Modify | Add tests for mode-specific share text |

---

### Task 1: Add `calculateTimedScore()` to game-engine.js

**Files:**
- Modify: `src/scripts/game-engine.js:1-18`
- Test: `tests/scoring.test.js`

- [ ] **Step 1: Write failing tests for `calculateTimedScore`**

Add to `tests/scoring.test.js`:

```javascript
import { calculateScore, calculateTimedScore } from '../src/scripts/game-engine.js';

// ... existing tests ...

describe('calculateTimedScore', () => {
  it('returns 100 for answer under 3 seconds', () => {
    expect(calculateTimedScore(2000)).toBe(100);
    expect(calculateTimedScore(2999)).toBe(100);
  });

  it('returns 75 for answer between 3-5 seconds', () => {
    expect(calculateTimedScore(3000)).toBe(75);
    expect(calculateTimedScore(4999)).toBe(75);
  });

  it('returns 50 for answer between 5-8 seconds', () => {
    expect(calculateTimedScore(5000)).toBe(50);
    expect(calculateTimedScore(7999)).toBe(50);
  });

  it('returns 25 for answer between 8-12 seconds', () => {
    expect(calculateTimedScore(8000)).toBe(25);
    expect(calculateTimedScore(11999)).toBe(25);
  });

  it('returns 10 for answer over 12 seconds', () => {
    expect(calculateTimedScore(12000)).toBe(10);
    expect(calculateTimedScore(30000)).toBe(10);
  });

  it('returns 10 for zero ms (edge case)', () => {
    expect(calculateTimedScore(0)).toBe(100);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/scoring.test.js`
Expected: FAIL — `calculateTimedScore` is not exported

- [ ] **Step 3: Implement `calculateTimedScore`**

Add after `calculateScore` in `src/scripts/game-engine.js` (after line 18):

```javascript
/**
 * Calculate score for Time Trial mode based on answer speed.
 * @param {number} timeMs — milliseconds taken to answer
 * @returns {number} 100 | 75 | 50 | 25 | 10
 */
export function calculateTimedScore(timeMs) {
  if (timeMs < 3000) return 100;
  if (timeMs < 5000) return 75;
  if (timeMs < 8000) return 50;
  if (timeMs < 12000) return 25;
  return 10;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/scoring.test.js`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/scripts/game-engine.js tests/scoring.test.js
git commit -m "feat: add calculateTimedScore for time trial speed brackets"
```

---

### Task 2: Extend SessionState for multiple modes

**Files:**
- Modify: `src/scripts/game-engine.js:107-212`
- Test: `tests/session.test.js`

- [ ] **Step 1: Write failing tests for mode-aware SessionState**

Add to `tests/session.test.js`:

```javascript
describe('SessionState — time_trial mode', () => {
  let session;

  beforeEach(() => {
    const ttSetDef = { ...setDef, mode: 'time_trial', scoring: 'binary' };
    session = new SessionState(observations, taxonomy, ttSetDef, 'time_trial');
  });

  it('is never "complete" by round count (unlimited rounds)', () => {
    for (let i = 0; i < 15; i++) {
      expect(session.isComplete).toBe(false);
      const round = session.nextRound();
      if (!round) break; // pool exhausted
      session.submitAnswer(round.correct.taxon);
    }
  });

  it('uses binary scoring (100 for correct order, 0 for wrong)', () => {
    const round = session.nextRound();
    // Correct answer — same order
    const result = session.submitAnswer(round.correct.taxon);
    expect(result.score).toBe(100);
  });

  it('returns 0 for wrong order in binary mode', () => {
    const round = session.nextRound();
    const wrongTaxon = { species: 'X', genus: 'X', family: 'X', order: 'WRONG' };
    const result = session.submitAnswer(wrongTaxon);
    expect(result.score).toBe(0);
  });

  it('tracks questionsAnswered and correctCount', () => {
    const r1 = session.nextRound();
    session.submitAnswer(r1.correct.taxon);
    const r2 = session.nextRound();
    session.submitAnswer({ species: 'X', genus: 'X', family: 'X', order: 'WRONG' });
    expect(session.questionsAnswered).toBe(2);
    expect(session.correctCount).toBe(1);
  });
});

describe('SessionState — streak mode', () => {
  let session;

  beforeEach(() => {
    const streakSetDef = { ...setDef, mode: 'streak', scoring: 'binary' };
    session = new SessionState(observations, taxonomy, streakSetDef, 'streak');
  });

  it('is never "complete" by round count', () => {
    for (let i = 0; i < 5; i++) {
      const round = session.nextRound();
      if (!round) break;
      session.submitAnswer(round.correct.taxon);
    }
    expect(session.isComplete).toBe(false);
  });

  it('tracks currentStreak', () => {
    const r1 = session.nextRound();
    session.submitAnswer(r1.correct.taxon);
    const r2 = session.nextRound();
    session.submitAnswer(r2.correct.taxon);
    expect(session.currentStreak).toBe(2);
  });

  it('marks streakBroken on wrong answer', () => {
    const r1 = session.nextRound();
    session.submitAnswer(r1.correct.taxon);
    const r2 = session.nextRound();
    session.submitAnswer({ species: 'X', genus: 'X', family: 'X', order: 'WRONG' });
    expect(session.streakBroken).toBe(true);
    expect(session.currentStreak).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/session.test.js`
Expected: FAIL — new properties/behaviors not implemented

- [ ] **Step 3: Implement mode-aware SessionState**

Replace the `SessionState` class in `src/scripts/game-engine.js` (lines 107-212) with:

```javascript
const ROUNDS_PER_SESSION = 10;
const RECENT_SESSIONS_TO_TRACK = 3;

function getRecentlyUsedIds(setKey) {
  try {
    const raw = localStorage.getItem(`recent_${setKey}`);
    if (!raw) return new Set();
    const sessions = JSON.parse(raw);
    return new Set(sessions.flat());
  } catch {
    return new Set();
  }
}

function saveUsedIds(setKey, ids) {
  try {
    const raw = localStorage.getItem(`recent_${setKey}`);
    const sessions = raw ? JSON.parse(raw) : [];
    sessions.unshift([...ids]);
    while (sessions.length > RECENT_SESSIONS_TO_TRACK) sessions.pop();
    localStorage.setItem(`recent_${setKey}`, JSON.stringify(sessions));
  } catch { /* localStorage unavailable */ }
}

export class SessionState {
  constructor(observations, taxonomy, setDef, setKey) {
    this.observations = observations;
    this.taxonomy = taxonomy;
    this.setDef = setDef;
    this.setKey = setKey;
    this.mode = setDef.mode || 'classic';
    this.sessionId = crypto.randomUUID?.() || Math.random().toString(36).slice(2);
    this.currentRound = 0;
    this.totalScore = 0;
    this.history = [];
    this._usedObservationIds = new Set();
    this._currentCorrect = null;

    // Mode-specific state
    this.questionsAnswered = 0;
    this.correctCount = 0;
    this.currentStreak = 0;
    this.streakBroken = false;

    const fullPool = setDef.observation_ids.map(i => observations[i]).filter(Boolean);
    const recentIds = getRecentlyUsedIds(setKey);
    const freshPool = fullPool.filter(obs => !recentIds.has(obs.id));
    if (freshPool.length >= ROUNDS_PER_SESSION) {
      this._pool = freshPool;
    } else {
      const recentPool = fullPool.filter(obs => recentIds.has(obs.id));
      this._pool = [...freshPool, ...shuffle(recentPool)];
    }
  }

  get isComplete() {
    if (this.mode === 'time_trial' || this.mode === 'streak') return false;
    return this.currentRound >= ROUNDS_PER_SESSION;
  }

  get bestStreak() {
    let best = 0;
    let current = 0;
    for (const entry of this.history) {
      if (entry.score === 100) {
        current++;
        best = Math.max(best, current);
      } else {
        current = 0;
      }
    }
    return best;
  }

  nextRound() {
    if (this.mode === 'classic' && this.currentRound >= ROUNDS_PER_SESSION) return null;
    const available = this._pool.filter(obs => !this._usedObservationIds.has(obs.id));
    if (available.length === 0) {
      // For unlimited modes, reset pool so game can continue
      if (this.mode !== 'classic') {
        this._usedObservationIds.clear();
        return this.nextRound();
      }
      return null;
    }
    const correct = pickRandom(available);
    this._usedObservationIds.add(correct.id);
    this._currentCorrect = correct;
    this.currentRound++;

    const isBinary = this.setDef.scoring === 'binary';
    const distractors = isBinary
      ? generateBugs101Distractors(correct, this.taxonomy, this.observations)
      : generateDistractors(correct, this.taxonomy, this.observations);
    const choices = shuffle([correct, ...distractors]);
    return { correct, choices };
  }

  submitAnswer(pickedTaxon) {
    const correct = this._currentCorrect;
    const isBinary = this.setDef.scoring === 'binary';
    const score = isBinary
      ? (pickedTaxon.order === correct.taxon.order ? 100 : 0)
      : calculateScore(pickedTaxon, correct.taxon);

    this.totalScore += score;
    this.questionsAnswered++;

    if (score === 100) {
      this.correctCount++;
    }

    // Streak tracking
    if (score === 100) {
      this.currentStreak++;
    } else if (this.mode === 'streak') {
      this.streakBroken = true;
    } else {
      this.currentStreak = 0;
    }

    this.history.push({
      round: this.currentRound,
      observation_id: correct.id,
      correct_taxon: correct.taxon,
      picked_taxon: pickedTaxon,
      score,
    });

    // Save used IDs for classic mode after last round
    if (this.mode === 'classic' && this.isComplete) {
      saveUsedIds(this.setKey, this._usedObservationIds);
    }

    return { score, correct };
  }
}
```

- [ ] **Step 4: Run all tests to verify they pass**

Run: `npx vitest run`
Expected: All PASS (existing tests should still pass since classic mode is default)

- [ ] **Step 5: Commit**

```bash
git add src/scripts/game-engine.js tests/session.test.js
git commit -m "feat: extend SessionState for time_trial and streak modes"
```

---

### Task 3: Add mode entries to sets.json

**Files:**
- Modify: `public/data/sets.json`

- [ ] **Step 1: Add time_trial and streak entries to sets.json**

The `all_bugs` set has 2383 observation_ids. Time Trial and Streak share the same pool. Add these two entries at the top of the JSON object (before `bugs_101`). The `observation_ids` must be the same array as `all_bugs`.

Write a small script to do this safely:

```bash
node -e "
const fs = require('fs');
const sets = JSON.parse(fs.readFileSync('public/data/sets.json', 'utf8'));
const allBugsIds = sets.all_bugs.observation_ids;
const newSets = {
  time_trial: {
    name: 'Time Trial',
    description: '60 seconds. How many can you identify?',
    mode: 'time_trial',
    scoring: 'binary',
    observation_ids: allBugsIds
  },
  streak: {
    name: 'Streak',
    description: 'How many in a row? One wrong and it is over.',
    mode: 'streak',
    scoring: 'binary',
    observation_ids: allBugsIds
  },
  ...sets
};
fs.writeFileSync('public/data/sets.json', JSON.stringify(newSets, null, 2));
console.log('Done. Keys:', Object.keys(newSets).join(', '));
"
```

- [ ] **Step 2: Verify the file is valid**

Run: `node -e "const s = require('./public/data/sets.json'); console.log(Object.keys(s)); console.log('time_trial obs:', s.time_trial.observation_ids.length); console.log('streak obs:', s.streak.observation_ids.length);"`
Expected: Both show 2383 observation_ids

- [ ] **Step 3: Commit**

```bash
git add public/data/sets.json
git commit -m "feat: add time_trial and streak entries to sets.json"
```

---

### Task 4: Update share.js for mode-specific share text

**Files:**
- Modify: `src/scripts/share.js`
- Test: `tests/share.test.js`

- [ ] **Step 1: Write failing tests for mode-specific share text**

Add to `tests/share.test.js`:

```javascript
import { generateShareText, generateTimeTrialShareText, generateStreakShareText, scoreToEmoji } from '../src/scripts/share.js';

// ... existing tests ...

describe('generateTimeTrialShareText', () => {
  const history = [
    { score: 100 }, { score: 75 }, { score: 100 },
    { score: 0 }, { score: 100 }, { score: 50 },
    { score: 100 }, { score: 100 }, { score: 100 },
  ];

  it('includes Time Trial label', () => {
    const text = generateTimeTrialShareText(425, history, 7, 9);
    expect(text).toContain('Time Trial');
  });

  it('includes score and accuracy', () => {
    const text = generateTimeTrialShareText(425, history, 7, 9);
    expect(text).toContain('425 pts');
    expect(text).toContain('7/9 correct');
    expect(text).toContain('60s');
  });

  it('includes emoji grid', () => {
    const text = generateTimeTrialShareText(425, history, 7, 9);
    expect(text).toContain('🟩');
  });

  it('includes mode-specific share URL', () => {
    const text = generateTimeTrialShareText(425, history, 7, 9);
    expect(text).toContain('mode=time_trial');
  });

  it('picks flavor line based on accuracy', () => {
    const perfectHistory = Array(10).fill({ score: 100 });
    const text = generateTimeTrialShareText(1000, perfectHistory, 10, 10);
    expect(text).toContain('Lightning fast');
  });
});

describe('generateStreakShareText', () => {
  it('includes streak count', () => {
    const history = Array(14).fill({ score: 100 });
    const text = generateStreakShareText(14, history);
    expect(text).toContain('14');
    expect(text).toContain('in a row');
  });

  it('includes all-green emoji grid with no trailing red', () => {
    const history = Array(5).fill({ score: 100 });
    const text = generateStreakShareText(5, history);
    expect(text).toContain('🟩🟩🟩🟩🟩');
    expect(text).not.toContain('🟥');
  });

  it('includes mode-specific share URL', () => {
    const history = Array(3).fill({ score: 100 });
    const text = generateStreakShareText(3, history);
    expect(text).toContain('mode=streak');
  });

  it('picks flavor line based on streak length', () => {
    const longHistory = Array(20).fill({ score: 100 });
    const text = generateStreakShareText(20, longHistory);
    expect(text).toContain('Unstoppable');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/share.test.js`
Expected: FAIL — new functions not exported

- [ ] **Step 3: Implement mode-specific share functions**

Replace the entire content of `src/scripts/share.js` with:

```javascript
/**
 * Social sharing utilities — emoji grid, clipboard copy, tweet intent.
 */

export function scoreToEmoji(score) {
  if (score === 100) return '🟩';
  if (score >= 50) return '🟨';
  return '🟥';
}

export function generateShareText(totalScore, history, setName, bestStreak) {
  const emojiGrid = history.map(h => scoreToEmoji(h.score)).join('');
  const correctCount = history.filter(h => h.score === 100).length;

  let flavor;
  if (correctCount === 10) flavor = 'Perfect score! 🏆';
  else if (correctCount >= 8) flavor = 'Bug expert! 🔬';
  else if (correctCount >= 5) flavor = 'Not bad! Can you beat me?';
  else flavor = "Bugs are tricky! Give it a shot 👀";

  return [
    `🪲 What's That Bug? — ${totalScore}/1000`,
    '',
    emojiGrid,
    '',
    `${correctCount}/10 · Streak: ${bestStreak} · ${setName}`,
    flavor,
    '',
    'https://dewanggogte.com/games/bugs/?ref=share',
  ].join('\n');
}

export function generateTimeTrialShareText(totalScore, history, correctCount, totalQuestions) {
  const emojiGrid = history.map(h => scoreToEmoji(h.score)).join('');

  let flavor;
  if (correctCount === totalQuestions && totalQuestions >= 8) flavor = 'Lightning fast! ⚡';
  else if (correctCount >= totalQuestions * 0.8) flavor = 'Speed demon! 🔬';
  else if (correctCount >= totalQuestions * 0.5) flavor = 'Not bad for 60 seconds!';
  else flavor = 'Bugs are tricky under pressure! 👀';

  return [
    `🪲 What's That Bug? — Time Trial`,
    '',
    `${totalScore} pts | ${correctCount}/${totalQuestions} correct | 60s`,
    '',
    emojiGrid,
    '',
    flavor,
    '',
    'https://dewanggogte.com/games/bugs/?ref=share&mode=time_trial',
  ].join('\n');
}

export function generateStreakShareText(streakCount, history) {
  // Only green emojis — no trailing red
  const emojiGrid = history.filter(h => h.score === 100).map(() => '🟩').join('');

  let flavor;
  if (streakCount >= 20) flavor = 'Unstoppable! 🏆';
  else if (streakCount >= 10) flavor = 'Bug expert! 🔬';
  else if (streakCount >= 5) flavor = 'Solid run!';
  else flavor = 'Give it a shot! 👀';

  return [
    `🪲 What's That Bug? — Streak`,
    '',
    `${streakCount} in a row`,
    '',
    emojiGrid,
    '',
    flavor,
    '',
    'https://dewanggogte.com/games/bugs/?ref=share&mode=streak',
  ].join('\n');
}

export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function openTweetIntent(text) {
  const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/share.test.js`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/scripts/share.js tests/share.test.js
git commit -m "feat: add time trial and streak share text generators"
```

---

### Task 5: Add `mode` field to feedback logging

**Files:**
- Modify: `src/scripts/feedback.js:97-133`

- [ ] **Step 1: Add `mode` parameter to `logRoundComplete`**

In `src/scripts/feedback.js`, change `logRoundComplete` (line 97) to:

```javascript
export function logRoundComplete(sessionId, round, observationId, userAnswer, correctAnswer, score, timeTakenMs, setName, mode) {
  enqueue({
    type: 'round_complete',
    session_id: sessionId,
    round,
    observation_id: observationId,
    user_answer: userAnswer,
    correct_answer: correctAnswer,
    score,
    time_taken_ms: timeTakenMs,
    set: setName,
    mode: mode || 'classic',
  });
}
```

- [ ] **Step 2: Add `mode` parameter to `logSessionStart`**

Change `logSessionStart` (line 111) to:

```javascript
export function logSessionStart(sessionId, setName, mode) {
  enqueue({
    type: 'session_start',
    session_id: sessionId,
    set: setName,
    mode: mode || 'classic',
    referrer: sessionStorage.getItem('original_referrer') || document.referrer || '',
    device: /Mobi/.test(navigator.userAgent) ? 'mobile' : 'desktop',
  });
  flush();
}
```

- [ ] **Step 3: Add `mode` and time trial fields to `logSessionEnd`**

Change `logSessionEnd` (line 122) to:

```javascript
export function logSessionEnd(sessionId, totalScore, roundsPlayed, setName, completed, shareClicked, mode, extraData) {
  enqueue({
    type: 'session_end',
    session_id: sessionId,
    total_score: totalScore,
    rounds_played: roundsPlayed,
    set: setName,
    completed,
    share_clicked: shareClicked,
    mode: mode || 'classic',
    ...(extraData || {}),
  });
  flush();
}
```

- [ ] **Step 4: Commit**

```bash
git add src/scripts/feedback.js
git commit -m "feat: add mode field to feedback logging functions"
```

---

### Task 6: Add CSS for flash effects, timer, streak counter, rules popup, +X popup, and mode cards

**Files:**
- Modify: `src/styles/global.css`

- [ ] **Step 1: Add all new CSS at the end of `global.css`**

Append to `src/styles/global.css`:

```css
/* =============================================
   Game Mode Cards (homepage)
   ============================================= */
.mode-card {
  background: var(--surface);
  border: 2px solid var(--accent);
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  text-decoration: none;
  color: inherit;
  position: relative;
}

.mode-card:hover {
  box-shadow: 0 4px 16px rgba(184, 90, 59, 0.2);
}

.mode-card-body {
  padding: 16px 18px;
}

.mode-card-body h3 {
  font-size: 1.1rem;
  font-weight: 700;
}

.mode-tag {
  display: inline-block;
  font-size: 0.6rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 6px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: var(--accent);
  color: #fff;
  vertical-align: middle;
  margin-left: 8px;
}

.mode-card-icon {
  font-size: 32px;
  margin-bottom: 4px;
}

.mode-card-tagline {
  font-size: 0.9rem;
  color: var(--text-secondary);
  margin-top: 4px;
}

.mode-card-meta {
  font-size: 0.8rem;
  color: var(--text-secondary);
  margin-top: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.mode-cards-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 16px;
}

@media (max-width: 480px) {
  .mode-cards-row {
    grid-template-columns: 1fr;
  }
}

/* =============================================
   Timer Display (Time Trial)
   ============================================= */
.timer-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  font-weight: 600;
  position: relative;
}

.timer-countdown {
  font-size: 1.4rem;
  font-variant-numeric: tabular-nums;
  color: var(--accent);
}

.timer-countdown.urgent {
  color: var(--error);
  animation: pulse 0.5s ease-in-out infinite alternate;
}

.timer-score {
  font-size: 1.1rem;
  position: relative;
}

.timer-last-time {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-left: 8px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.timer-last-time.visible {
  opacity: 1;
}

/* =============================================
   Streak Counter
   ============================================= */
.streak-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px 16px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  position: relative;
}

.streak-count {
  font-size: 2rem;
  font-weight: 700;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}

.streak-label {
  font-size: 0.85rem;
  color: var(--text-secondary);
  margin-left: 8px;
}

/* =============================================
   Score Popup (+X animation)
   ============================================= */
.score-popup {
  position: absolute;
  top: -8px;
  right: -4px;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--success);
  opacity: 0;
  transform: translateY(0);
  pointer-events: none;
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.score-popup.visible {
  opacity: 1;
  transform: translateY(-12px);
}

.score-popup.miss {
  color: var(--error);
}

/* =============================================
   Screen Flash (correct/wrong border)
   ============================================= */
.flash-correct {
  animation: flashGreen 0.6s ease;
}

.flash-wrong {
  animation: flashRed 0.6s ease;
}

@keyframes flashGreen {
  0% { box-shadow: inset 0 0 0 4px var(--success); }
  100% { box-shadow: inset 0 0 0 0px var(--success); }
}

@keyframes flashRed {
  0% { box-shadow: inset 0 0 0 4px var(--error); }
  100% { box-shadow: inset 0 0 0 0px var(--error); }
}

@keyframes pulse {
  from { opacity: 1; }
  to { opacity: 0.5; }
}

/* =============================================
   Rules Popup Overlay
   ============================================= */
.rules-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  animation: fadeIn 0.2s ease;
}

.rules-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 24px;
  max-width: 380px;
  width: 90%;
  position: relative;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.rules-close {
  position: absolute;
  top: 12px;
  right: 12px;
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 20px;
  cursor: pointer;
  padding: 4px 8px;
  line-height: 1;
}

.rules-close:hover {
  color: var(--text);
}

.rules-diagram {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 16px;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.rules-diagram .diagram-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
  border-bottom: 1px dashed var(--border);
}

.rules-diagram .diagram-row:last-child {
  border-bottom: none;
}

.rules-diagram .diagram-label {
  font-weight: 600;
  color: var(--text);
  font-size: 0.75rem;
}

.rules-diagram .diagram-value {
  font-size: 0.75rem;
}

.rules-diagram .diagram-photo-placeholder {
  background: var(--photo-bg);
  border-radius: 8px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255,255,255,0.4);
  font-size: 24px;
  margin: 8px 0;
}

.rules-diagram .diagram-choices {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  margin-top: 8px;
}

.rules-diagram .diagram-choice {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 0.7rem;
  text-align: center;
}

.rules-text {
  font-size: 0.85rem;
  color: var(--text-secondary);
  text-align: center;
  line-height: 1.5;
}

.rules-text strong {
  color: var(--text);
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* =============================================
   Speed Brackets Table (in rules popup)
   ============================================= */
.speed-brackets {
  width: 100%;
  font-size: 0.75rem;
  border-collapse: collapse;
  margin: 8px 0;
}

.speed-brackets td {
  padding: 3px 8px;
  border-bottom: 1px solid var(--border);
}

.speed-brackets td:last-child {
  text-align: right;
  font-weight: 600;
  color: var(--accent);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/styles/global.css
git commit -m "feat: add CSS for game modes, flash effects, timer, streak, rules popup"
```

---

### Task 7: Remove About page and header nav links

**Files:**
- Modify: `src/layouts/Base.astro:48-57`
- Delete: `src/pages/about.astro`

- [ ] **Step 1: Remove Home and About nav links from Base.astro**

In `src/layouts/Base.astro`, replace lines 51-55:

```html
      <nav class="site-nav">
        <a href="/">Home</a>
        <a href="/about">About</a>
        <button id="theme-toggle" aria-label="Toggle dark/light mode">🌙</button>
      </nav>
```

with:

```html
      <nav class="site-nav">
        <button id="theme-toggle" aria-label="Toggle dark/light mode">🌙</button>
      </nav>
```

- [ ] **Step 2: Update base path rewriting to remove `/about` reference**

In `src/layouts/Base.astro`, line 33, change:

```javascript
      var base = path.replace(/\/(play|about)$/, '');
```

to:

```javascript
      var base = path.replace(/\/play$/, '');
```

- [ ] **Step 3: Delete about.astro**

```bash
rm src/pages/about.astro
```

- [ ] **Step 4: Verify the build still works**

Run: `npx astro build 2>&1 | tail -5`
Expected: Build succeeds without errors

- [ ] **Step 5: Commit**

```bash
git add src/layouts/Base.astro
git rm src/pages/about.astro
git commit -m "chore: remove About page and header nav links"
```

---

### Task 8: Update homepage with mode cards

**Files:**
- Modify: `src/pages/index.astro`

- [ ] **Step 1: Replace index.astro with mode cards at top**

Replace the full content of `src/pages/index.astro` with:

```astro
---
import Base from '../layouts/Base.astro';
import setsData from '../../public/data/sets.json';
import observations from '../../public/data/observations.json';

const SET_ICONS: Record<string, string> = {
  bugs_101: '🔰',
  all_bugs: '🌍',
  backyard_basics: '🏡',
  beetles: '🪲',
  butterflies_moths: '🦋',
  spiders: '🕷️',
  tiny_terrors: '😱',
};

const DIFFICULTY_LABELS: Record<string, { label: string; class: string }> = {
  beginner: { label: 'Beginner', class: 'diff-beginner' },
  intermediate: { label: 'Intermediate', class: 'diff-intermediate' },
  themed: { label: 'Themed', class: 'diff-themed' },
  expert: { label: 'Expert', class: 'diff-expert' },
};

// Separate mode cards from regular set cards
const modeKeys = ['time_trial', 'streak'];
const regularEntries = Object.entries(setsData)
  .filter(([key]) => !modeKeys.includes(key))
  .map(([key, set]) => {
    const isBinary = set.scoring === 'binary';
    const uniqueCount = isBinary
      ? new Set(set.observation_ids.map(i => observations[i]?.taxon?.order)).size
      : new Set(set.observation_ids.map(i => observations[i]?.taxon?.species)).size;
    const countLabel = isBinary ? `${uniqueCount} types` : `${uniqueCount} species`;
    const diff = DIFFICULTY_LABELS[set.difficulty] || null;
    return { key, ...set, icon: SET_ICONS[key] || '🐛', countLabel, diff };
  });
---
<Base title="What's That Bug? — Insect Identification Game">
  <div class="container">
    <div style="text-align: center; padding: 24px 0 8px;">
      <h1>🪲 What's That Bug?</h1>
      <p class="subtitle">Can you identify insects from their photos? Pick a set and find out.</p>
    </div>

    <div class="mode-cards-row" style="margin-top: 24px;">
      <a href="/play?set=time_trial" class="mode-card">
        <div class="mode-card-body">
          <div class="mode-card-icon">⚡</div>
          <h3>Time Trial <span class="mode-tag">Mode</span></h3>
          <p class="mode-card-tagline">60 seconds. Go.</p>
          <div class="mode-card-meta">
            <span>All bugs</span>
            <span id="best-time_trial"></span>
          </div>
        </div>
      </a>
      <a href="/play?set=streak" class="mode-card">
        <div class="mode-card-body">
          <div class="mode-card-icon">🔥</div>
          <h3>Streak <span class="mode-tag">Mode</span></h3>
          <p class="mode-card-tagline">Don't miss.</p>
          <div class="mode-card-meta">
            <span>All bugs</span>
            <span id="best-streak"></span>
          </div>
        </div>
      </a>
    </div>

    <div class="set-grid">
      {regularEntries.map(set => (
        <a href={`/play?set=${set.key}`} class="set-card">
          <div class="set-card-thumb" style="display:flex;align-items:center;justify-content:center;font-size:48px;">
            {set.icon}
          </div>
          <div class="set-card-body">
            <h3>
              {set.name}
              {set.diff && <span class={`diff-badge ${set.diff.class}`}>{set.diff.label}</span>}
            </h3>
            <p>{set.description}</p>
            <div class="set-card-meta">
              <span>{set.countLabel}</span>
              <span id={`best-${set.key}`}></span>
            </div>
          </div>
        </a>
      ))}
    </div>
  </div>

  <script>
    // Show best scores from localStorage
    document.querySelectorAll('[id^="best-"]').forEach(el => {
      const setKey = el.id.replace('best-', '');
      const storageKey = `best_${setKey}`;
      const best = localStorage.getItem(storageKey);
      if (best) {
        const label = (setKey === 'streak') ? `Best: ${best} streak` : `Best: ${best}`;
        el.textContent = label;
        el.style.color = 'var(--accent)';
        el.style.fontWeight = '600';
      }
    });
  </script>
</Base>
```

- [ ] **Step 2: Verify page renders**

Run: `npx astro build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/pages/index.astro
git commit -m "feat: add time trial and streak mode cards to homepage"
```

---

### Task 9: Implement the full game-ui.js rewrite with timer, streak, preloading, flash effects, rules popup

This is the largest task — it rewires the game loop for all three modes.

**Files:**
- Modify: `src/scripts/game-ui.js`

- [ ] **Step 1: Replace the full content of `src/scripts/game-ui.js`**

```javascript
/**
 * Game UI — DOM rendering and event handling for the game page.
 * Supports three modes: classic (10 rounds), time_trial (60s), streak (until wrong).
 */

import { SessionState, calculateTimedScore } from './game-engine.js';
import { generateShareText, generateTimeTrialShareText, generateStreakShareText, copyToClipboard, openTweetIntent } from './share.js';
import { logSessionStart, logSessionEnd, logRoundComplete, logRoundReaction, logSessionFeedback, logBadPhoto } from './feedback.js';

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Bugs 101 display name logic
const BEE_FAMILIES = ['Apidae', 'Megachilidae', 'Halictidae', 'Andrenidae', 'Colletidae'];
const ANT_FAMILIES = ['Formicidae', 'Mutillidae'];
const BUTTERFLY_FAMILIES = ['Nymphalidae', 'Papilionidae', 'Pieridae', 'Lycaenidae', 'Riodinidae', 'Hesperiidae'];
const CRICKET_FAMILIES = ['Gryllidae', 'Rhaphidophoridae', 'Anostostomatidae', 'Tettigoniidae'];
const DAMSELFLY_FAMILIES = ['Coenagrionidae', 'Calopterygidae', 'Lestidae', 'Platycnemididae', 'Platystictidae'];
const CICADA_FAMILIES = ['Cicadidae'];
const STINK_BUG_FAMILIES = ['Pentatomidae', 'Scutelleridae', 'Acanthosomatidae', 'Cydnidae', 'Tessaratomidae'];
const PLANTHOPPER_FAMILIES = ['Fulgoridae', 'Flatidae', 'Membracidae', 'Ischnorhinidae'];
const APHID_FAMILIES = ['Aphididae', 'Eriococcidae'];
const WATER_BUG_FAMILIES = ['Nepidae', 'Notonectidae', 'Belostomatidae'];

function getBugs101Name(taxon) {
  if (taxon.order === 'Hymenoptera') {
    if (BEE_FAMILIES.includes(taxon.family)) return 'Bee';
    if (ANT_FAMILIES.includes(taxon.family)) return 'Ant';
    return 'Wasp';
  }
  if (taxon.order === 'Lepidoptera') {
    return BUTTERFLY_FAMILIES.includes(taxon.family) ? 'Butterfly' : 'Moth';
  }
  if (taxon.order === 'Orthoptera') {
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
  const names = {
    'Coleoptera': 'Beetle', 'Ixodida': 'Tick', 'Araneae': 'Spider',
    'Scorpiones': 'Scorpion', 'Opiliones': 'Harvestman', 'Mantodea': 'Mantis',
    'Diptera': 'Fly', 'Phasmida': 'Stick Insect', 'Neuroptera': 'Lacewing',
    'Blattodea': 'Cockroach', 'Dermaptera': 'Earwig', 'Ephemeroptera': 'Mayfly',
    'Trichoptera': 'Caddisfly',
  };
  return names[taxon.order] || taxon.order_common || taxon.order;
}

const base = window.__BASE || '';

let session = null;
let currentRound = null;
let roundStartTime = null;
let currentSetKey = 'all_bugs';
let sessionEndSent = false;
let shared = false;

// Time Trial state
let timerInterval = null;
let timeRemaining = 60;

// Preloading state
let preloadQueue = [];
let preloadedImages = [];
let displayRound = 0; // Tracks actual round shown to player (separate from session.currentRound)
const PRELOAD_COUNT_TIME_TRIAL = 5;
const PRELOAD_COUNT_DEFAULT = 2;

function getPreloadCount() {
  if (!session) return PRELOAD_COUNT_DEFAULT;
  return session.mode === 'time_trial' ? PRELOAD_COUNT_TIME_TRIAL : PRELOAD_COUNT_DEFAULT;
}

function preloadNextImages() {
  const needed = getPreloadCount() - preloadQueue.length;
  for (let i = 0; i < needed; i++) {
    const round = session.nextRound();
    if (!round) break;
    const img = new Image();
    img.src = round.correct.photo_url;
    preloadQueue.push(round);
    preloadedImages.push(img);
  }
}

function getNextPreloadedRound() {
  let round;
  if (preloadQueue.length > 0) {
    preloadedImages.shift();
    round = preloadQueue.shift();
  } else {
    round = session.nextRound();
  }
  // Fix: set _currentCorrect so submitAnswer() compares against the right answer
  if (round) {
    session._currentCorrect = round.correct;
  }
  displayRound++;
  return round;
}

function sendSessionEnd() {
  if (sessionEndSent || !session) return;
  sessionEndSent = true;

  const extraData = session.mode === 'time_trial'
    ? { questions_answered: session.questionsAnswered, correct_count: session.correctCount }
    : undefined;

  logSessionEnd(
    session.sessionId,
    session.totalScore,
    session.currentRound,
    session.setDef.name,
    session.mode === 'classic' ? session.isComplete : true,
    shared,
    session.mode,
    extraData
  );
}

let container = null;

/**
 * Initialize the game. Called from play.astro.
 */
export async function initGame() {
  container = document.getElementById('game-container');
  container.setAttribute('aria-live', 'polite');

  let observations, taxonomy, sets;
  try {
    const [obsRes, taxRes, setsRes] = await Promise.all([
      fetch(`${base}/data/observations.json`),
      fetch(`${base}/data/taxonomy.json`),
      fetch(`${base}/data/sets.json`),
    ]);

    if (!obsRes.ok || !taxRes.ok || !setsRes.ok) {
      throw new Error('One or more data files failed to load');
    }

    observations = await obsRes.json();
    taxonomy = await taxRes.json();
    sets = await setsRes.json();
  } catch (err) {
    container.innerHTML = `<div class="container"><p>Failed to load game data. Please refresh the page to try again.</p><p style="color:var(--text-secondary);font-size:13px;">${escapeHTML(err.message)}</p></div>`;
    return;
  }

  const params = new URLSearchParams(window.location.search);
  currentSetKey = params.get('set') || 'all_bugs';
  const setDef = sets[currentSetKey];

  if (!setDef) {
    container.innerHTML = `<div class="container"><p>Set "${escapeHTML(currentSetKey)}" not found. <a href="${base}/">Back to sets</a></p></div>`;
    return;
  }

  session = new SessionState(observations, taxonomy, setDef, currentSetKey);
  logSessionStart(session.sessionId, setDef.name, session.mode);
  sessionEndSent = false;
  shared = false;
  window.addEventListener('pagehide', sendSessionEnd);
  window.addEventListener('beforeunload', sendSessionEnd);

  // Start preloading images
  preloadQueue = [];
  preloadedImages = [];
  displayRound = 0;
  preloadNextImages();

  // Show rules popup, then start game
  showRulesPopup(() => {
    if (session.mode === 'time_trial') {
      startTimeTrial();
    } else {
      startRound();
    }
  });
}

// ===== RULES POPUP =====

function getRulesContent() {
  const mode = session.mode;

  if (mode === 'time_trial') {
    return {
      diagramHTML: `
        <div class="diagram-row">
          <span class="diagram-label">⏱ Timer</span>
          <span class="diagram-value">60s countdown</span>
        </div>
        <div class="diagram-row">
          <span class="diagram-label">Score</span>
          <span class="diagram-value">Points for speed</span>
        </div>
        <div class="diagram-photo-placeholder">📷</div>
        <div class="diagram-choices">
          <div class="diagram-choice">Choice A</div>
          <div class="diagram-choice">Choice B</div>
          <div class="diagram-choice">Choice C</div>
          <div class="diagram-choice">Choice D</div>
        </div>
      `,
      textHTML: `
        <strong>Faster = more points</strong>
        <table class="speed-brackets">
          <tr><td>&lt; 3s</td><td>100 pts</td></tr>
          <tr><td>3–5s</td><td>75 pts</td></tr>
          <tr><td>5–8s</td><td>50 pts</td></tr>
          <tr><td>8–12s</td><td>25 pts</td></tr>
          <tr><td>12s+</td><td>10 pts</td></tr>
        </table>
        <p style="margin-top:8px;">Wrong = 0 points</p>
      `,
    };
  }

  if (mode === 'streak') {
    return {
      diagramHTML: `
        <div class="diagram-row">
          <span class="diagram-label">🔥 Streak</span>
          <span class="diagram-value">Count goes up</span>
        </div>
        <div class="diagram-photo-placeholder">📷</div>
        <div class="diagram-choices">
          <div class="diagram-choice">Choice A</div>
          <div class="diagram-choice">Choice B</div>
          <div class="diagram-choice">Choice C</div>
          <div class="diagram-choice">Choice D</div>
        </div>
      `,
      textHTML: `
        <p><strong>One wrong answer = game over.</strong></p>
        <p>No time pressure. Just don't miss.</p>
      `,
    };
  }

  // Classic modes
  const isBinary = session.setDef.scoring === 'binary';

  if (isBinary) {
    return {
      diagramHTML: `
        <div class="diagram-row">
          <span class="diagram-label">Score</span>
          <span class="diagram-value">Right = 100, Wrong = 0</span>
        </div>
        <div class="diagram-row">
          <span class="diagram-label">Rounds</span>
          <span class="diagram-value">10</span>
        </div>
        <div class="diagram-photo-placeholder">📷</div>
        <div class="diagram-choices">
          <div class="diagram-choice">Choice A</div>
          <div class="diagram-choice">Choice B</div>
          <div class="diagram-choice">Choice C</div>
          <div class="diagram-choice">Choice D</div>
        </div>
      `,
      textHTML: `<p><strong>Identify the bug type.</strong> 10 rounds, 1000 points max.</p>`,
    };
  }

  // Classic taxonomic
  return {
    diagramHTML: `
      <div class="diagram-row">
        <span class="diagram-label">Score</span>
        <span class="diagram-value">Closer = more pts</span>
      </div>
      <div class="diagram-row">
        <span class="diagram-label">Rounds</span>
        <span class="diagram-value">10</span>
      </div>
      <div class="diagram-photo-placeholder">📷</div>
      <div class="diagram-choices">
        <div class="diagram-choice">Choice A</div>
        <div class="diagram-choice">Choice B</div>
        <div class="diagram-choice">Choice C</div>
        <div class="diagram-choice">Choice D</div>
      </div>
    `,
    textHTML: `
      <p><strong>Closer guess = more points</strong></p>
      <p style="font-size:0.8rem;margin-top:4px;">Exact species: 100 · Same genus: 75 · Same family: 50 · Same order: 25</p>
    `,
  };
}

function showRulesPopup(onDismiss) {
  const { diagramHTML, textHTML } = getRulesContent();

  const overlay = document.createElement('div');
  overlay.className = 'rules-overlay';
  overlay.innerHTML = `
    <div class="rules-card">
      <button class="rules-close" aria-label="Close">&times;</button>
      <div class="rules-diagram">${diagramHTML}</div>
      <div class="rules-text">${textHTML}</div>
    </div>
  `;

  document.body.appendChild(overlay);

  const dismiss = () => {
    if (overlay.parentNode) {
      overlay.remove();
      onDismiss();
    }
  };

  overlay.querySelector('.rules-close').addEventListener('click', dismiss);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) dismiss();
  });

  // Auto-dismiss after 5 seconds
  setTimeout(dismiss, 5000);
}

// ===== TIME TRIAL MODE =====

function startTimeTrial() {
  timeRemaining = 60;
  startRound();
  timerInterval = setInterval(() => {
    timeRemaining--;
    updateTimerDisplay();
    if (timeRemaining <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      renderTimeTrialSummary();
    }
  }, 1000);
}

function updateTimerDisplay() {
  const timerEl = container.querySelector('.timer-countdown');
  if (timerEl) {
    timerEl.textContent = `${timeRemaining}s`;
    if (timeRemaining <= 10) {
      timerEl.classList.add('urgent');
    }
  }
}

// ===== GENERIC ROUND =====

function startRound() {
  currentRound = getNextPreloadedRound();
  if (!currentRound) {
    if (session.mode === 'time_trial') {
      renderTimeTrialSummary();
    } else if (session.mode === 'streak') {
      renderStreakSummary();
    } else {
      renderClassicSummary();
    }
    window.scrollTo({ top: 0 });
    return;
  }

  // Preload more images in the background
  preloadNextImages();

  roundStartTime = Date.now();
  renderRound();
  window.scrollTo({ top: 0 });
}

function renderRound() {
  const { correct, choices } = currentRound;
  const mode = session.mode;

  // Top bar varies by mode
  let topBarHTML;
  if (mode === 'time_trial') {
    topBarHTML = `
      <div class="timer-bar">
        <a href="${base}/" style="text-decoration:none;color:var(--accent);">← Sets</a>
        <span class="timer-countdown">${timeRemaining}s</span>
        <span class="timer-score" style="position:relative;">
          ${session.totalScore} pts
          <span class="score-popup" id="score-popup"></span>
        </span>
      </div>
      <div style="text-align:center;padding:2px 0;">
        <span class="timer-last-time" id="last-time"></span>
      </div>
    `;
  } else if (mode === 'streak') {
    topBarHTML = `
      <div class="streak-bar">
        <a href="${base}/" style="text-decoration:none;color:var(--accent);position:absolute;left:16px;">← Sets</a>
        <span class="streak-count">${session.currentStreak}</span>
        <span class="streak-label">streak</span>
      </div>
    `;
  } else {
    topBarHTML = `
      <div class="top-bar">
        <a href="${base}/" style="text-decoration:none;color:var(--accent);">← Sets</a>
        <span>Round ${displayRound} of 10 · ${session.totalScore} pts</span>
        <span>${session.setDef.name}</span>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="container" id="game-screen">
      ${topBarHTML}

      <div class="photo-hero">
        <img src="${escapeHTML(correct.photo_url)}" alt="Mystery bug" loading="eager">
        <span class="photo-credit">${escapeHTML(correct.attribution)}</span>
        <button class="report-photo-btn" id="report-photo" title="Report bad photo">&#9873;</button>
      </div>

      <h2 style="margin-top: 16px;">What's this bug?</h2>
      <p class="subtitle">Found in ${escapeHTML(correct.location)}</p>

      <div class="choices" id="choices">
        ${choices.map((choice, i) => {
          const isBugs101 = session.setDef.scoring === 'binary';
          const displayName = isBugs101 ? getBugs101Name(choice.taxon) : choice.taxon.common_name;
          const displayLatin = isBugs101 ? choice.taxon.order : choice.taxon.species;
          return `
          <div class="choice" data-index="${i}" role="button" tabindex="0">
            <div class="choice-name">${escapeHTML(displayName)}</div>
            <div class="choice-latin">${escapeHTML(displayLatin)}</div>
          </div>
        `}).join('')}
      </div>
    </div>
  `;

  // Attach click handlers
  const choiceEls = container.querySelectorAll('.choice');
  choiceEls.forEach((el, i) => {
    const handler = () => handleAnswer(choices[i], choices, choiceEls);
    el.addEventListener('click', handler);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handler();
      }
    });
  });

  // Report bad photo
  container.querySelector('#report-photo')?.addEventListener('click', () => {
    logBadPhoto(session.sessionId, correct.id, correct.taxon.species, session.setDef.name);
    const btn = container.querySelector('#report-photo');
    btn.textContent = '\u2713';
    btn.disabled = true;
  });
}

function handleAnswer(picked, choices, choiceEls) {
  const timeTaken = Date.now() - roundStartTime;
  const mode = session.mode;

  // For time trial, override score with timed score
  let result;
  if (mode === 'time_trial') {
    // Submit to get correct answer reference, then calculate timed score
    result = session.submitAnswer(picked.taxon);
    const isCorrect = picked.taxon.order === result.correct.taxon.order;
    const timedScore = isCorrect ? calculateTimedScore(timeTaken) : 0;
    // Adjust: undo the binary 100 and apply timed score instead
    session.totalScore = session.totalScore - result.score + timedScore;
    session.history[session.history.length - 1].score = timedScore;
    if (result.score === 100 && timedScore !== 100) {
      // correctCount was incremented for binary 100, keep it (it's still correct)
    }
    result.score = timedScore;
  } else {
    result = session.submitAnswer(picked.taxon);
  }

  const { score, correct } = result;

  // Disable all choices
  choiceEls.forEach(el => { el.style.pointerEvents = 'none'; });

  // Highlight correct/wrong
  const isBugs101 = session.setDef.scoring === 'binary';
  choices.forEach((choice, i) => {
    const el = choiceEls[i];
    if (isBugs101 || mode === 'time_trial' || mode === 'streak') {
      if (choice.taxon.order === correct.taxon.order) el.classList.add('correct');
      else if (choice.taxon.order === picked.taxon.order) el.classList.add('miss');
    } else {
      if (choice.taxon.species === correct.taxon.species) el.classList.add('correct');
      else if (choice.taxon.species === picked.taxon.species) {
        if (score >= 50) el.classList.add('close');
        else el.classList.add('miss');
      }
    }
  });

  // Log round
  logRoundComplete(
    session.sessionId, session.currentRound, correct.id,
    picked.taxon.species, correct.taxon.species,
    score, timeTaken, session.setDef.name, session.mode
  );

  // MODE-SPECIFIC POST-ANSWER FLOW
  if (mode === 'time_trial') {
    handleTimeTrialPostAnswer(score, timeTaken);
  } else if (mode === 'streak') {
    handleStreakPostAnswer(score, picked, correct);
  } else {
    handleClassicPostAnswer(score, picked, correct, timeTaken);
  }
}

// ===== TIME TRIAL POST-ANSWER =====

function handleTimeTrialPostAnswer(score, timeTaken) {
  const gameScreen = container.querySelector('#game-screen');

  // Flash effect
  gameScreen.classList.add(score > 0 ? 'flash-correct' : 'flash-wrong');

  // Score popup
  const popup = container.querySelector('#score-popup');
  if (popup) {
    popup.textContent = `+${score}`;
    popup.className = `score-popup visible ${score === 0 ? 'miss' : ''}`;
  }

  // Update score display
  const scoreEl = container.querySelector('.timer-score');
  if (scoreEl) {
    scoreEl.childNodes[0].textContent = `${session.totalScore} pts `;
  }

  // Show time taken
  const lastTimeEl = container.querySelector('#last-time');
  if (lastTimeEl) {
    lastTimeEl.textContent = `${(timeTaken / 1000).toFixed(1)}s`;
    lastTimeEl.classList.add('visible');
  }

  // Advance immediately — flash/numbers persist briefly
  if (timeRemaining > 0) {
    setTimeout(() => startRound(), 100);
  }

  // Clear popup after delay
  setTimeout(() => {
    if (popup) popup.className = 'score-popup';
    if (lastTimeEl) lastTimeEl.classList.remove('visible');
  }, 1000);
}

// ===== STREAK POST-ANSWER =====

function handleStreakPostAnswer(score, picked, correct) {
  const gameScreen = container.querySelector('#game-screen');

  if (score === 100) {
    // Correct — flash green, advance after delay
    gameScreen.classList.add('flash-correct');

    // Update streak display
    const streakEl = container.querySelector('.streak-count');
    if (streakEl) streakEl.textContent = session.currentStreak;

    setTimeout(() => startRound(), 500);
  } else {
    // Wrong — flash red, show game over
    gameScreen.classList.add('flash-wrong');
    setTimeout(() => renderStreakGameOver(picked, correct), 600);
  }
}

// ===== CLASSIC POST-ANSWER =====

function handleClassicPostAnswer(score, picked, correct, timeTaken) {
  // Same as original: show learning card
  let feedbackClass, feedbackTitle;
  if (score === 100) { feedbackClass = 'exact'; feedbackTitle = 'Nailed it!'; }
  else if (score >= 50) { feedbackClass = 'close'; feedbackTitle = 'So close!'; }
  else { feedbackClass = 'miss'; feedbackTitle = 'Not quite'; }

  let breadcrumb = '';
  if (score < 100) {
    if (score >= 75) {
      breadcrumb = `Same genus (${escapeHTML(correct.taxon.genus)}) — look for subtle differences.`;
    } else if (score >= 50) {
      breadcrumb = `Same family (${escapeHTML(correct.taxon.family)}) — you're in the right ballpark!`;
    } else if (score >= 25) {
      breadcrumb = `Same order (${escapeHTML(correct.taxon.order)}) — right group, wrong family.`;
    } else {
      const isBugs101Mode = session.setDef.scoring === 'binary';
      if (isBugs101Mode) {
        breadcrumb = `You guessed ${escapeHTML(getBugs101Name(picked.taxon))}, but this is a ${escapeHTML(getBugs101Name(correct.taxon))}.`;
      } else {
        breadcrumb = `You guessed ${escapeHTML(picked.taxon.order)}, but this is ${escapeHTML(correct.taxon.order)}.`;
      }
    }
  }

  let blurb = correct.wikipedia_summary || '';
  if (blurb && !blurb.match(/[.!?]$/)) {
    const lastSentence = blurb.lastIndexOf('. ');
    if (lastSentence > 40) blurb = blurb.slice(0, lastSentence + 1);
    else {
      const lastSpace = blurb.lastIndexOf(' ');
      blurb = lastSpace > 20 ? blurb.slice(0, lastSpace) + '...' : blurb + '...';
    }
  }

  const badgeClass = score === 100 ? 'badge-success' : score >= 50 ? 'badge-warning' : 'badge-error';

  const feedbackHTML = `
    <div class="feedback-card ${feedbackClass}" style="margin-top: 16px;">
      <div class="feedback-title">${feedbackTitle}</div>
      <div class="feedback-body">
        <strong>${escapeHTML(correct.taxon.common_name)}</strong> (<em>${escapeHTML(correct.taxon.species)}</em>)
        ${blurb ? `<br>${escapeHTML(blurb)}` : ''}
        ${breadcrumb ? `<br><br>${breadcrumb}` : ''}
      </div>
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
      <button class="btn btn-primary" id="next-btn">
        ${session.isComplete ? 'See Results' : 'Next Round →'}
      </button>
    </div>
  `;

  container.querySelector('.container').insertAdjacentHTML('beforeend', feedbackHTML);

  setTimeout(() => {
    container.querySelector('#next-btn')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 300);

  container.querySelectorAll('.reaction-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.reaction-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      logRoundReaction(
        session.sessionId, session.currentRound, correct.id,
        btn.dataset.difficulty, picked.taxon.species, correct.taxon.species,
        score, session.setDef.name
      );
    });
  });

  container.querySelector('#next-btn').addEventListener('click', startRound);
}

// ===== SUMMARY SCREENS =====

function renderClassicSummary() {
  const exactCount = session.history.filter(h => h.score === 100).length;
  const closeCount = session.history.filter(h => h.score >= 50 && h.score < 100).length;
  const missCount = session.history.filter(h => h.score < 50).length;
  const shareText = generateShareText(session.totalScore, session.history, session.setDef.name, session.bestStreak);

  const storageKey = `best_${currentSetKey}`;
  const prevBest = parseInt(localStorage.getItem(storageKey) || '0', 10);
  if (session.totalScore > prevBest) {
    localStorage.setItem(storageKey, session.totalScore.toString());
  }

  container.innerHTML = `
    <div class="container">
      <div class="summary">
        <h1>🪲 What's That Bug?</h1>
        <div class="summary-score">${session.totalScore} / 1000</div>
        <div class="summary-breakdown">${exactCount} exact · ${closeCount} close · ${missCount} misses</div>
        <div class="emoji-grid">${session.history.map(h =>
          h.score === 100 ? '🟩' : h.score >= 50 ? '🟨' : '🟥'
        ).join('')}</div>
        <p class="subtitle">Best streak: ${session.bestStreak} · Set: ${session.setDef.name}</p>

        <div class="share-buttons">
          <button class="btn btn-outline" id="copy-btn">📋 Copy</button>
          <button class="btn btn-outline" id="tweet-btn">𝕏 Post</button>
        </div>

        <div style="margin-top: 24px; display: flex; gap: 12px; justify-content: center;">
          <button class="btn btn-primary" id="play-again-btn">Play Again</button>
          <a href="${base}/" class="btn btn-outline" id="change-set-btn">Change Set</a>
        </div>
      </div>

      ${renderSessionFeedbackForm()}
    </div>
  `;

  attachShareHandlers(shareText);
  attachPlayAgainHandlers();
  attachSessionFeedbackHandlers();
}

function renderTimeTrialSummary() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }

  const correctCount = session.correctCount;
  const totalQ = session.questionsAnswered;
  const shareText = generateTimeTrialShareText(session.totalScore, session.history, correctCount, totalQ);

  const storageKey = `best_time_trial`;
  const prevBest = parseInt(localStorage.getItem(storageKey) || '0', 10);
  if (session.totalScore > prevBest) {
    localStorage.setItem(storageKey, session.totalScore.toString());
  }

  const emojiGrid = session.history.map(h => h.score > 0 ? '🟩' : '🟥').join('');

  container.innerHTML = `
    <div class="container">
      <div class="summary">
        <h1>⚡ Time Trial</h1>
        <div class="summary-score">${session.totalScore} pts</div>
        <div class="summary-breakdown">${correctCount}/${totalQ} correct in 60 seconds</div>
        <div class="emoji-grid">${emojiGrid}</div>

        <div class="share-buttons">
          <button class="btn btn-outline" id="copy-btn">📋 Copy</button>
          <button class="btn btn-outline" id="tweet-btn">𝕏 Post</button>
        </div>

        <div style="margin-top: 24px; display: flex; gap: 12px; justify-content: center;">
          <button class="btn btn-primary" id="play-again-btn">Play Again</button>
          <a href="${base}/" class="btn btn-outline" id="change-set-btn">Change Set</a>
        </div>
      </div>
    </div>
  `;

  attachShareHandlers(shareText);
  attachPlayAgainHandlers();
}

function renderStreakGameOver(picked, correct) {
  const streakCount = session.currentStreak;
  const shareText = generateStreakShareText(streakCount, session.history);

  const storageKey = `best_streak`;
  const prevBest = parseInt(localStorage.getItem(storageKey) || '0', 10);
  if (streakCount > prevBest) {
    localStorage.setItem(storageKey, streakCount.toString());
  }

  // Only green emojis
  const emojiGrid = Array(streakCount).fill('🟩').join('');

  // Learning card content for the bug they got wrong
  let breadcrumb = '';
  const isBugs101Mode = session.setDef.scoring === 'binary';
  if (isBugs101Mode) {
    breadcrumb = `You guessed ${escapeHTML(getBugs101Name(picked.taxon))}, but this is a ${escapeHTML(getBugs101Name(correct.taxon))}.`;
  } else {
    breadcrumb = `You guessed ${escapeHTML(picked.taxon.order)}, but this is ${escapeHTML(correct.taxon.order)}.`;
  }

  let blurb = correct.wikipedia_summary || '';
  if (blurb && !blurb.match(/[.!?]$/)) {
    const lastSentence = blurb.lastIndexOf('. ');
    if (lastSentence > 40) blurb = blurb.slice(0, lastSentence + 1);
    else {
      const lastSpace = blurb.lastIndexOf(' ');
      blurb = lastSpace > 20 ? blurb.slice(0, lastSpace) + '...' : blurb + '...';
    }
  }

  container.innerHTML = `
    <div class="container">
      <div class="summary">
        <h1>🔥 Streak Over</h1>
        <div class="summary-score">${streakCount}</div>
        <p class="subtitle" style="margin-bottom:16px;">in a row</p>
        <div class="emoji-grid">${emojiGrid}</div>

        <div class="share-buttons">
          <button class="btn btn-outline" id="copy-btn">📋 Copy</button>
          <button class="btn btn-outline" id="tweet-btn">𝕏 Post</button>
        </div>
      </div>

      <div class="feedback-card miss" style="margin-top: 16px;">
        <div class="feedback-title">The one that got away</div>
        <div class="feedback-body">
          <strong>${escapeHTML(correct.taxon.common_name)}</strong> (<em>${escapeHTML(correct.taxon.species)}</em>)
          ${blurb ? `<br>${escapeHTML(blurb)}` : ''}
          ${breadcrumb ? `<br><br>${breadcrumb}` : ''}
        </div>
        <div style="margin-top: 8px;">
          <a href="${escapeHTML(correct.inat_url)}" target="_blank" rel="noopener" style="font-size: 13px;">Learn more →</a>
        </div>
      </div>

      <div style="margin-top: 24px; display: flex; gap: 12px; justify-content: center;">
        <button class="btn btn-primary" id="play-again-btn">Play Again</button>
        <a href="${base}/" class="btn btn-outline" id="change-set-btn">Change Set</a>
      </div>
    </div>
  `;

  attachShareHandlers(shareText);
  attachPlayAgainHandlers();
}

function renderStreakSummary() {
  // If pool exhausted without error (unlikely but possible)
  renderStreakGameOver(
    { taxon: { species: '', genus: '', family: '', order: '' } },
    session._currentCorrect || { taxon: { species: '', genus: '', family: '', order: '', common_name: 'Unknown' }, wikipedia_summary: '', inat_url: '' }
  );
}

// ===== SHARED UI HELPERS =====

function attachShareHandlers(shareText) {
  container.querySelector('#copy-btn')?.addEventListener('click', async () => {
    const ok = await copyToClipboard(shareText);
    const btn = container.querySelector('#copy-btn');
    btn.textContent = ok ? '✓ Copied!' : 'Failed';
    shared = true;
    setTimeout(() => { btn.textContent = '📋 Copy'; }, 2000);
  });

  container.querySelector('#tweet-btn')?.addEventListener('click', () => {
    openTweetIntent(shareText);
    shared = true;
  });
}

function attachPlayAgainHandlers() {
  container.querySelector('#play-again-btn')?.addEventListener('click', () => {
    sendSessionEnd();
    window.location.reload();
  });

  container.querySelector('#change-set-btn')?.addEventListener('click', () => {
    sendSessionEnd();
  });
}

function renderSessionFeedbackForm() {
  return `
    <div class="feedback-form" id="session-feedback">
      <h3 style="margin-bottom: 12px;">How was that?</h3>
      <label for="difficulty-rating">Overall difficulty</label>
      <input type="range" id="difficulty-rating" min="1" max="5" value="3" style="width:100%">
      <div style="display:flex; justify-content:space-between; font-size:12px; color:var(--text-secondary); margin-top:-8px; margin-bottom:12px;">
        <span>Too Easy</span><span>Just Right</span><span>Too Hard</span>
      </div>

      <label for="interesting-round">Most interesting round?</label>
      <select id="interesting-round">
        <option value="">Skip</option>
        ${session.history.map((h, i) => `
          <option value="${i + 1}">Round ${i + 1}: ${escapeHTML(h.correct_taxon.common_name)}</option>
        `).join('')}
      </select>

      <label for="free-text">Anything feel off?</label>
      <textarea id="free-text" placeholder="Options too obvious? Names too technical? Bugs too obscure?"></textarea>

      <label>Would you play again?</label>
      <div style="display:flex; gap:8px; margin-bottom:12px;">
        <button class="reaction-btn" data-play-again="yes">Yes</button>
        <button class="reaction-btn" data-play-again="maybe">Maybe</button>
        <button class="reaction-btn" data-play-again="no">No</button>
      </div>

      <button class="btn btn-primary" id="submit-feedback" style="width:100%">Send Feedback</button>
    </div>
  `;
}

function attachSessionFeedbackHandlers() {
  let playAgainValue = '';
  container.querySelectorAll('[data-play-again]').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('[data-play-again]').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      playAgainValue = btn.dataset.playAgain;
    });
  });

  container.querySelector('#submit-feedback')?.addEventListener('click', () => {
    logSessionFeedback(
      session.sessionId, session.totalScore, session.setDef.name,
      container.querySelector('#difficulty-rating').value,
      container.querySelector('#interesting-round').value,
      container.querySelector('#free-text').value,
      playAgainValue
    );
    const btn = container.querySelector('#submit-feedback');
    btn.textContent = '✓ Thanks!';
    btn.disabled = true;
  });
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `npx astro build 2>&1 | tail -10`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/scripts/game-ui.js
git commit -m "feat: implement time trial, streak, preloading, flash effects, and rules popup"
```

---

### Task 10: Run all tests and verify

**Files:**
- All test files

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Fix any failures**

If tests fail, read the error output and fix. Common issues:
- `SessionState` constructor signature changed — update test `beforeEach` to pass `setKey` parameter
- Import paths — ensure new exports are imported correctly

- [ ] **Step 3: Run the dev server and manually verify**

Run: `npx astro dev`

Manual checks:
1. Homepage shows Time Trial and Streak cards at top
2. Clicking Time Trial shows rules popup, then starts timer
3. Timer counts down, answers flash green/red, +X popup appears
4. When timer hits 0, results screen shows
5. Clicking Streak shows rules popup, then starts game
6. Correct answers increment streak counter with green flash
7. Wrong answer shows learning card merged with game over screen
8. Share text for both modes includes correct format and URLs
9. Classic sets still work unchanged
10. Rules popup appears for classic sets too

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: test and integration fixes for game modes"
```

---

### Task 11: Final cleanup and build verification

- [ ] **Step 1: Run production build**

Run: `npx astro build`
Expected: Clean build with no warnings

- [ ] **Step 2: Preview production build**

Run: `npx astro preview`
Verify: All modes work in the production build

- [ ] **Step 3: Final commit if any remaining changes**

```bash
git add -A
git commit -m "chore: final cleanup for game modes release"
```
