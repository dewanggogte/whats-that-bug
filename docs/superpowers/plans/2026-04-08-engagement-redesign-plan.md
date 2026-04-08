# Engagement Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve player retention and session depth via four features: daily-reset leaderboard, end-of-game session percentiles, streak milestone celebrations, and homepage hierarchy redesign.

**Architecture:** The game is an Astro static site deployed on Vercel. Game logic lives in `src/scripts/` (pure JS modules), events log to Google Sheets via Apps Script webhook, leaderboard data comes from the same webhook. Percentiles are pre-computed at build time from event data. All new features are client-side changes except the Apps Script leaderboard filter.

**Tech Stack:** Astro 4, vanilla JS (ES modules), CSS (single `global.css`), Google Apps Script (server), Vitest (tests)

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/scripts/percentiles.js` | **Create** | Load `percentiles.json`, compute percentile for a score, render histogram HTML |
| `src/scripts/milestones.js` | **Create** | Milestone definitions, check function, toast/banner/pulse rendering |
| `scripts/compute-percentiles.mjs` | **Create** | Build-time script: fetch events, compute distributions, write `public/data/percentiles.json` |
| `tests/percentiles.test.js` | **Create** | Tests for percentile computation logic |
| `tests/milestones.test.js` | **Create** | Tests for milestone check logic |
| `src/scripts/game-ui.js` | **Modify** | Integrate percentile card into streak/TT game-over; integrate milestone toasts into streak post-answer |
| `src/scripts/leaderboard.js` | **Modify** | No changes needed — server returns filtered data, client is unaware of the filter |
| `src/scripts/leaderboard-ui.js` | **Modify** | Add `renderYesterdayChampion()` helper |
| `src/pages/leaderboard.astro` | **Modify** | Rename to "Daily Leaderboard", add countdown timer, add yesterday's champion section |
| `src/pages/index.astro` | **Modify** | Restructure to Play → Compete → Explore hierarchy with daily banner |
| `src/styles/global.css` | **Modify** | Add milestone toast/banner/pulse animations, percentile histogram styles, homepage section styles |
| `package.json` | **Modify** | Add `compute-percentiles` script |

---

## Task 1: Streak Milestone Logic + Tests

**Files:**
- Create: `src/scripts/milestones.js`
- Create: `tests/milestones.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/milestones.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { MILESTONES, checkMilestone, getHighestMilestone } from '../src/scripts/milestones.js';

describe('MILESTONES', () => {
  it('defines milestones at 5, 10, 15, 25, 50', () => {
    expect(MILESTONES.map(m => m.streak)).toEqual([5, 10, 15, 25, 50]);
  });

  it('each milestone has label, tier, and fire count', () => {
    for (const m of MILESTONES) {
      expect(m).toHaveProperty('label');
      expect(m).toHaveProperty('tier');
      expect(m).toHaveProperty('fires');
      expect(['toast', 'toast-pulse', 'banner']).toContain(m.tier);
    }
  });
});

describe('checkMilestone', () => {
  it('returns null for non-milestone streaks', () => {
    expect(checkMilestone(1)).toBeNull();
    expect(checkMilestone(4)).toBeNull();
    expect(checkMilestone(6)).toBeNull();
    expect(checkMilestone(11)).toBeNull();
  });

  it('returns milestone object for exact milestone values', () => {
    const m5 = checkMilestone(5);
    expect(m5).not.toBeNull();
    expect(m5.streak).toBe(5);
    expect(m5.label).toBe('Getting Good');
    expect(m5.tier).toBe('toast');

    const m10 = checkMilestone(10);
    expect(m10.label).toBe('Sharp Eye');
    expect(m10.tier).toBe('toast-pulse');

    const m25 = checkMilestone(25);
    expect(m25.label).toBe('Legendary!');
    expect(m25.tier).toBe('banner');
  });
});

describe('getHighestMilestone', () => {
  it('returns null if streak is below 5', () => {
    expect(getHighestMilestone(0)).toBeNull();
    expect(getHighestMilestone(4)).toBeNull();
  });

  it('returns the highest milestone at or below the streak', () => {
    expect(getHighestMilestone(5).streak).toBe(5);
    expect(getHighestMilestone(9).streak).toBe(5);
    expect(getHighestMilestone(10).streak).toBe(10);
    expect(getHighestMilestone(24).streak).toBe(15);
    expect(getHighestMilestone(25).streak).toBe(25);
    expect(getHighestMilestone(100).streak).toBe(50);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/milestones.test.js`
Expected: FAIL — module `../src/scripts/milestones.js` does not exist

- [ ] **Step 3: Write minimal implementation**

Create `src/scripts/milestones.js`:

```js
/**
 * Streak milestone definitions and logic.
 * Pure functions — no DOM dependencies.
 */

export const MILESTONES = [
  { streak: 5,  label: 'Getting Good',  fires: 1, tier: 'toast' },
  { streak: 10, label: 'Sharp Eye',     fires: 2, tier: 'toast-pulse' },
  { streak: 15, label: 'Expert',        fires: 3, tier: 'toast-pulse' },
  { streak: 25, label: 'Legendary!',    fires: 4, tier: 'banner' },
  { streak: 50, label: 'Unstoppable!',  fires: 5, tier: 'banner' },
];

/**
 * Check if a streak count is an exact milestone.
 * Returns the milestone object or null.
 */
export function checkMilestone(streak) {
  return MILESTONES.find(m => m.streak === streak) || null;
}

/**
 * Get the highest milestone at or below the given streak.
 * Returns the milestone object or null if below 5.
 */
export function getHighestMilestone(streak) {
  let highest = null;
  for (const m of MILESTONES) {
    if (streak >= m.streak) highest = m;
  }
  return highest;
}

/**
 * Build the fire emoji string for a milestone.
 */
export function milestoneFireEmoji(fires) {
  return '🔥'.repeat(fires);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/milestones.test.js`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/scripts/milestones.js tests/milestones.test.js
git commit -m "feat: add streak milestone definitions and logic with tests"
```

---

## Task 2: Milestone CSS (Toast, Pulse, Banner)

**Files:**
- Modify: `src/styles/global.css` (append after the achievement-toast section, around line 2618)

- [ ] **Step 1: Add milestone CSS to global.css**

Append after the `.achievement-toast.fade-out` rule (after line 2618):

```css
/* =============================================
   Streak Milestone Toast
   ============================================= */
.milestone-toast {
  position: absolute;
  top: var(--space-4);
  right: var(--space-4);
  z-index: 100;
  background: linear-gradient(135deg, #5c3a1e, #7a4a28);
  border: 1px solid #a0603a;
  border-radius: var(--radius-sm);
  padding: var(--space-3) var(--space-4);
  display: flex;
  align-items: center;
  gap: var(--space-3);
  animation: milestoneSlideIn 300ms ease-out both;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  max-width: 260px;
  pointer-events: none;
}

.milestone-toast-label {
  font-weight: 600;
  font-size: var(--text-sm);
  color: #fde8d0;
}

.milestone-toast-fires {
  font-size: var(--text-xs);
  color: #e0a87c;
}

.milestone-toast.fade-out {
  animation: milestoneSlideOut 400ms ease-out forwards;
}

@keyframes milestoneSlideIn {
  from { opacity: 0; transform: translateX(20px); }
  to { opacity: 1; transform: translateX(0); }
}

@keyframes milestoneSlideOut {
  from { opacity: 1; transform: translateX(0); }
  to { opacity: 0; transform: translateX(20px) translateY(-10px); }
}

/* Gold pulse on streak counter at milestone */
.milestone-pulse {
  animation: milestoneGoldPulse 600ms ease-out;
}

@keyframes milestoneGoldPulse {
  0% { transform: scale(1); text-shadow: none; color: var(--text); }
  50% { transform: scale(1.3); text-shadow: 0 0 12px #ffd700, 0 0 24px #ffa500; color: #ffd700; }
  100% { transform: scale(1); text-shadow: none; color: var(--text); }
}

/* Full-width banner for 25+ milestones */
.milestone-banner-flash {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 99;
  text-align: center;
  padding: var(--space-3) var(--space-4);
  font-weight: 700;
  font-size: var(--text-lg);
  color: #fde8d0;
  background: linear-gradient(135deg, #7a4a28, #a0603a, #7a4a28);
  animation: milestoneBannerFlash 2.5s ease-out forwards;
  pointer-events: none;
}

@keyframes milestoneBannerFlash {
  0% { opacity: 0; }
  8% { opacity: 1; }
  80% { opacity: 1; }
  100% { opacity: 0; }
}
```

- [ ] **Step 2: Verify CSS loads without errors**

Run: `npx astro dev` and open the game page in a browser. No console errors.

- [ ] **Step 3: Commit**

```bash
git add src/styles/global.css
git commit -m "style: add milestone toast, gold pulse, and banner animations"
```

---

## Task 3: Wire Milestones into Streak Gameplay

**Files:**
- Modify: `src/scripts/game-ui.js` (lines ~596-619 `handleStreakPostAnswer`, and ~1062-1175 `renderStreakGameOver`)

- [ ] **Step 1: Add milestone import at top of game-ui.js**

In `src/scripts/game-ui.js`, after the existing imports (after line 11, the `showLoadingSpinner` import), add:

```js
import { checkMilestone, getHighestMilestone, milestoneFireEmoji } from './milestones.js';
```

- [ ] **Step 2: Add milestone toast/banner rendering functions**

After the `showAchievementToast` function (after line 804), add:

```js
// ===== MILESTONE CELEBRATIONS =====

function showMilestoneToast(milestone) {
  const gameScreen = container.querySelector('#game-screen');
  if (!gameScreen) return;

  // Ensure game screen is positioned for absolute children
  gameScreen.style.position = 'relative';

  const toast = document.createElement('div');
  toast.className = 'milestone-toast';
  toast.innerHTML = `
    <div>
      <div class="milestone-toast-label">${escapeHTML(milestone.label)} ${milestoneFireEmoji(milestone.fires)}</div>
      <div class="milestone-toast-fires">${milestone.streak} in a row!</div>
    </div>
  `;
  gameScreen.appendChild(toast);

  const duration = milestone.tier === 'banner' ? 2500 : 2000;
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 500);
  }, duration);
}

function showMilestonePulse() {
  const streakEl = container.querySelector('.streak-count');
  if (!streakEl) return;
  streakEl.classList.add('milestone-pulse');
  streakEl.addEventListener('animationend', () => {
    streakEl.classList.remove('milestone-pulse');
  }, { once: true });
}

function showMilestoneBanner(milestone) {
  const gameScreen = container.querySelector('#game-screen');
  if (!gameScreen) return;

  gameScreen.style.position = 'relative';

  const banner = document.createElement('div');
  banner.className = 'milestone-banner-flash';
  banner.textContent = `${milestone.label} ${milestoneFireEmoji(milestone.fires)}`;
  gameScreen.appendChild(banner);

  setTimeout(() => banner.remove(), 2600);
}
```

- [ ] **Step 3: Modify handleStreakPostAnswer to fire milestones**

Replace the existing `handleStreakPostAnswer` function (lines 598-619) in `src/scripts/game-ui.js`:

```js
function handleStreakPostAnswer(score, picked, correct) {
  const gameScreen = container.querySelector('#game-screen');

  if (score === 100) {
    // Correct — flash green, advance after delay
    gameScreen.classList.add('flash-correct');

    // Update streak display
    const streakEl = container.querySelector('.streak-count');
    if (streakEl) {
      streakEl.textContent = session.currentStreak;
      streakEl.classList.add('anim-scale-bounce');
      setTimeout(() => streakEl.classList.remove('anim-scale-bounce'), 250);
    }

    // Check for milestone celebration (after flash settles)
    const milestone = checkMilestone(session.currentStreak);
    if (milestone) {
      setTimeout(() => {
        showMilestoneToast(milestone);
        if (milestone.tier === 'toast-pulse' || milestone.tier === 'banner') {
          showMilestonePulse();
        }
        if (milestone.tier === 'banner') {
          showMilestoneBanner(milestone);
        }
      }, 300);
    }

    setTimeout(() => startRound(), 500);
  } else {
    // Wrong — flash red, show game over
    gameScreen.classList.add('flash-wrong');
    setTimeout(() => renderStreakGameOver(picked, correct), 600);
  }
}
```

- [ ] **Step 4: Add milestone badge to game-over screen**

In `renderStreakGameOver` (around line 1117), find the `newBestHTML` assignment and add a milestone badge after it. After this line:

```js
  const newBestHTML = isNewBest
    ? `<div class="new-best-badge">New Personal Best!</div>`
    : prevBest > 0 ? `<p class="subtitle" style="margin-top:4px;">Personal best: ${prevBest} in a row</p>` : '';
```

Add:

```js
  const highest = getHighestMilestone(streakCount);
  const milestoneBadgeHTML = highest
    ? `<p class="subtitle" style="margin-top:4px;color:var(--accent);">Reached ${highest.streak} ${milestoneFireEmoji(highest.fires)}</p>`
    : '';
```

Then in the template literal for the game-over screen, insert `${milestoneBadgeHTML}` right after `${newBestHTML}`. Find:

```js
        ${newBestHTML}

        <div class="tt-stats" style="margin-top:20px;">
```

Replace with:

```js
        ${newBestHTML}
        ${milestoneBadgeHTML}

        <div class="tt-stats" style="margin-top:20px;">
```

- [ ] **Step 5: Manual test**

Run: `npx astro dev`
1. Play a Bugs 101 Streak game
2. At 5 correct: toast should appear top-right with "Getting Good 🔥"
3. At 10 correct: toast + streak counter should pulse gold
4. Game over screen should show "Reached 10 🔥🔥" if you got 10+

- [ ] **Step 6: Commit**

```bash
git add src/scripts/game-ui.js
git commit -m "feat: wire streak milestone toasts, gold pulse, and banner into gameplay"
```

---

## Task 4: Percentile Computation Logic + Tests

**Files:**
- Create: `src/scripts/percentiles.js`
- Create: `tests/percentiles.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/percentiles.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { computePercentile, getScoreBucket, buildHistogramData } from '../src/scripts/percentiles.js';

describe('computePercentile', () => {
  const distribution = { '0': 5, '1': 10, '2': 20, '3': 30, '4': 20, '5': 10, '10': 5 };
  const totalSessions = 100;

  it('returns 0 for the lowest score', () => {
    expect(computePercentile(0, distribution, totalSessions)).toBe(0);
  });

  it('returns correct percentile for mid-range scores', () => {
    // score=3: sessions below 3 are 0(5)+1(10)+2(20) = 35
    expect(computePercentile(3, distribution, totalSessions)).toBe(35);
  });

  it('returns high percentile for top scores', () => {
    // score=10: sessions below 10 are 0(5)+1(10)+2(20)+3(30)+4(20)+5(10) = 95
    expect(computePercentile(10, distribution, totalSessions)).toBe(95);
  });

  it('handles scores not in the distribution (interpolates)', () => {
    // score=7: no exact key, but sessions below 7 = same as below 10 = 95
    expect(computePercentile(7, distribution, totalSessions)).toBe(95);
  });

  it('returns 0 when totalSessions is 0', () => {
    expect(computePercentile(5, {}, 0)).toBe(0);
  });
});

describe('getScoreBucket', () => {
  it('returns the score itself for streak mode', () => {
    expect(getScoreBucket(12, true)).toBe(12);
  });

  it('rounds time trial scores to nearest 100', () => {
    expect(getScoreBucket(150, false)).toBe(100);
    expect(getScoreBucket(250, false)).toBe(200);
    expect(getScoreBucket(950, false)).toBe(900);
    expect(getScoreBucket(50, false)).toBe(0);
  });
});

describe('buildHistogramData', () => {
  it('returns 10 buckets for streak mode', () => {
    const distribution = { '0': 5, '1': 10, '2': 20, '5': 15, '10': 8, '20': 2 };
    const result = buildHistogramData(distribution, true);
    expect(result.buckets).toHaveLength(10);
    expect(result.counts).toHaveLength(10);
    expect(result.labels).toHaveLength(10);
  });

  it('returns 10 buckets for time trial mode', () => {
    const distribution = { '0': 5, '100': 10, '200': 20, '500': 15 };
    const result = buildHistogramData(distribution, false);
    expect(result.buckets).toHaveLength(10);
    expect(result.counts).toHaveLength(10);
  });

  it('identifies the correct highlighted bucket for a given score', () => {
    const distribution = { '0': 5, '1': 10, '2': 20, '5': 15, '10': 8 };
    const result = buildHistogramData(distribution, true, 5);
    const highlightedIdx = result.buckets.findIndex((_, i) => result.highlighted[i]);
    expect(highlightedIdx).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/percentiles.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

Create `src/scripts/percentiles.js`:

```js
/**
 * Percentile computation and histogram rendering.
 * Pure functions for logic; one DOM function for rendering the card.
 */

let percentileData = null;
let loadPromise = null;

/**
 * Load percentiles.json (cached — only fetches once).
 * Returns the full data object or null on failure.
 */
export function loadPercentiles() {
  if (percentileData) return Promise.resolve(percentileData);
  if (loadPromise) return loadPromise;

  const basePath = window?.__BASE || '';
  loadPromise = fetch(`${basePath}/data/percentiles.json`)
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then(data => {
      percentileData = data;
      return data;
    })
    .catch(() => {
      loadPromise = null;
      return null;
    });

  return loadPromise;
}

/**
 * Compute what percentile a score falls at.
 * Returns 0-99 (percentage of sessions that scored LESS than this score).
 */
export function computePercentile(score, distribution, totalSessions) {
  if (!totalSessions || totalSessions === 0) return 0;

  let below = 0;
  for (const [key, count] of Object.entries(distribution)) {
    if (Number(key) < score) below += count;
  }
  return Math.round((below / totalSessions) * 100);
}

/**
 * Map a raw score to its bucket key.
 * Streak: exact integer. Time trial: rounded to nearest 100.
 */
export function getScoreBucket(score, isStreak) {
  if (isStreak) return score;
  return Math.floor(score / 100) * 100;
}

/**
 * Build histogram data: 10 visual buckets from a distribution.
 * Returns { buckets: number[], counts: number[], labels: string[], highlighted: boolean[] }
 */
export function buildHistogramData(distribution, isStreak, playerScore = null) {
  const allKeys = Object.keys(distribution).map(Number).sort((a, b) => a - b);
  const maxKey = allKeys.length > 0 ? allKeys[allKeys.length - 1] : 0;

  let boundaries;
  if (isStreak) {
    // Streak: buckets 0-1, 2-3, 4-5, 6-7, 8-9, 10-12, 13-15, 16-19, 20-24, 25+
    boundaries = [0, 2, 4, 6, 8, 10, 13, 16, 20, 25];
  } else {
    // Time trial: buckets 0-99, 100-199, ..., 800-899, 900+
    boundaries = [0, 100, 200, 300, 400, 500, 600, 700, 800, 900];
  }

  const labels = isStreak
    ? ['0-1', '2-3', '4-5', '6-7', '8-9', '10-12', '13-15', '16-19', '20-24', '25+']
    : ['0', '100', '200', '300', '400', '500', '600', '700', '800', '900+'];

  const counts = new Array(10).fill(0);
  const highlighted = new Array(10).fill(false);

  for (const [key, count] of Object.entries(distribution)) {
    const val = Number(key);
    let bucketIdx = boundaries.length - 1;
    for (let i = boundaries.length - 1; i >= 0; i--) {
      if (val >= boundaries[i]) {
        bucketIdx = i;
        break;
      }
    }
    counts[bucketIdx] += count;
  }

  // Highlight the player's bucket
  if (playerScore !== null) {
    let playerBucketIdx = boundaries.length - 1;
    for (let i = boundaries.length - 1; i >= 0; i--) {
      if (playerScore >= boundaries[i]) {
        playerBucketIdx = i;
        break;
      }
    }
    highlighted[playerBucketIdx] = true;
  }

  return { buckets: boundaries, counts, labels, highlighted };
}

/**
 * Render the percentile card HTML for the game-over screen.
 * Returns an HTML string, or empty string if data unavailable.
 */
export function renderPercentileCard(score, setKey, isStreak) {
  if (!percentileData) return '';

  const setData = percentileData[setKey];
  if (!setData || !setData.distribution || !setData.totalSessions) return '';

  const percentile = computePercentile(score, setData.distribution, setData.totalSessions);
  const topPercent = 100 - percentile;
  const histogram = buildHistogramData(setData.distribution, isStreak, score);

  const maxCount = Math.max(...histogram.counts, 1);
  const bars = histogram.counts.map((count, i) => {
    const heightPct = Math.max((count / maxCount) * 100, 2);
    const color = histogram.highlighted[i] ? 'var(--accent)' : 'var(--border)';
    return `<div style="flex:1;background:${color};height:${heightPct}%;border-radius:2px;"></div>`;
  }).join('');

  const labelHTML = histogram.labels
    .filter((_, i) => i === 0 || i === 4 || i === 9)
    .map(l => `<span>${l}</span>`).join('');

  const modeLabel = isStreak ? 'streak' : 'time trial';

  return `
    <div class="percentile-card" style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:16px;margin-top:16px;text-align:center;">
      <div style="font-size:var(--text-2xl);font-weight:700;color:var(--accent);">Top ${topPercent}%</div>
      <div style="font-size:var(--text-sm);color:var(--text-secondary);margin-top:4px;">Better than ${percentile}% of all ${modeLabel} sessions</div>
      <div style="margin-top:12px;display:flex;gap:2px;height:40px;align-items:flex-end;">${bars}</div>
      <div style="display:flex;justify-content:space-between;font-size:0.65rem;color:var(--text-secondary);margin-top:2px;">${labelHTML}</div>
      <div style="font-size:0.7rem;color:var(--text-secondary);margin-top:6px;">Based on ${setData.totalSessions.toLocaleString()} sessions</div>
    </div>
  `;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/percentiles.test.js`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/scripts/percentiles.js tests/percentiles.test.js
git commit -m "feat: add percentile computation logic with histogram builder and tests"
```

---

## Task 5: Build-Time Percentile Script

**Files:**
- Create: `scripts/compute-percentiles.mjs`
- Modify: `package.json` (add script)

- [ ] **Step 1: Create the build-time script**

Create `scripts/compute-percentiles.mjs`:

```js
#!/usr/bin/env node

/**
 * Compute percentile distributions from the events sheet.
 * Reads events via the Apps Script webhook and outputs public/data/percentiles.json.
 *
 * Usage: node scripts/compute-percentiles.mjs
 * Env: PUBLIC_GOOGLE_SHEET_WEBHOOK_URL must be set (same as the game uses).
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, '..', 'public', 'data', 'percentiles.json');

const WEBHOOK_URL = process.env.PUBLIC_GOOGLE_SHEET_WEBHOOK_URL || '';

const ELIGIBLE_SETS = ['bugs_101_streak', 'bugs_101_time_trial', 'streak', 'time_trial'];

/**
 * Fetch events from the webhook, or fall back to a local CSV export.
 * To use CSV fallback: export the Events sheet as CSV to analytics/output/events.csv
 */
async function fetchEvents() {
  // Try webhook first
  if (WEBHOOK_URL) {
    try {
      console.log('Fetching events from webhook...');
      const res = await fetch(`${WEBHOOK_URL}?action=events`);
      if (res.ok) {
        const data = await res.json();
        console.log(`Fetched ${data.length} events from webhook`);
        return data;
      }
      console.warn(`Webhook returned ${res.status}, falling back to CSV...`);
    } catch (err) {
      console.warn(`Webhook failed: ${err.message}, falling back to CSV...`);
    }
  }

  // Fallback: read from local CSV export
  const csvPath = join(__dirname, '..', 'analytics', 'output', 'events.csv');
  const { readFileSync, existsSync } = await import('fs');
  if (!existsSync(csvPath)) {
    throw new Error(
      `No events source available. Either set PUBLIC_GOOGLE_SHEET_WEBHOOK_URL ` +
      `or export the Events sheet as CSV to ${csvPath}`
    );
  }

  console.log(`Reading events from ${csvPath}...`);
  const csv = readFileSync(csvPath, 'utf-8');
  const lines = csv.trim().split('\n');
  const headers = lines[0].split(',');
  const events = lines.slice(1).map(line => {
    const values = line.split(',');
    const obj = {};
    headers.forEach((h, i) => { obj[h.trim()] = values[i]?.trim(); });
    // Parse numeric fields
    if (obj.total_score) obj.total_score = Number(obj.total_score);
    if (obj.rounds_played) obj.rounds_played = Number(obj.rounds_played);
    return obj;
  });
  console.log(`Read ${events.length} events from CSV`);
  return events;
}

function isStreakSet(setKey) {
  return setKey.includes('streak');
}

function extractScore(event) {
  // session_end events store data in the top-level fields
  const setKey = event.set || '';
  if (isStreakSet(setKey)) {
    // Streak mode: rounds_played - 1 = streak (last round is the wrong one)
    // But more reliably, check total_score or extra data
    // In streak mode, total_score is 0 and rounds_played is streak + 1
    const roundsPlayed = event.rounds_played || 0;
    return Math.max(0, roundsPlayed - 1);
  } else {
    // Time trial: total_score is the points
    return event.total_score || 0;
  }
}

function computeDistributions(events) {
  const distributions = {};

  for (const setKey of ELIGIBLE_SETS) {
    distributions[setKey] = { distribution: {}, totalSessions: 0 };
  }

  const sessionEndEvents = events.filter(e => e.type === 'session_end');

  for (const event of sessionEndEvents) {
    const setKey = event.set || '';
    if (!ELIGIBLE_SETS.includes(setKey)) continue;

    const score = extractScore(event);
    const scoreKey = String(score);

    distributions[setKey].distribution[scoreKey] =
      (distributions[setKey].distribution[scoreKey] || 0) + 1;
    distributions[setKey].totalSessions += 1;
  }

  return distributions;
}

async function main() {
  try {
    const events = await fetchEvents();
    const distributions = computeDistributions(events);

    const output = {
      generated: new Date().toISOString(),
      ...distributions,
    };

    mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
    writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));

    console.log(`\nPercentiles written to ${OUTPUT_PATH}`);
    for (const [key, data] of Object.entries(distributions)) {
      console.log(`  ${key}: ${data.totalSessions} sessions`);
    }
  } catch (err) {
    console.error('Failed to compute percentiles:', err.message);
    process.exit(1);
  }
}

main();
```

- [ ] **Step 2: Add script to package.json**

In `package.json`, add to the `"scripts"` object:

```json
"compute-percentiles": "node scripts/compute-percentiles.mjs"
```

- [ ] **Step 3: Test the script runs**

Run: `npm run compute-percentiles`
Expected: Either succeeds and writes `public/data/percentiles.json`, or fails with a clear error about the webhook URL (which is fine — the env var may not be set locally). If it fails, set the env var and retry:

```bash
PUBLIC_GOOGLE_SHEET_WEBHOOK_URL="<your webhook url>" npm run compute-percentiles
```

Verify `public/data/percentiles.json` exists and has the expected structure.

- [ ] **Step 4: Commit**

```bash
git add scripts/compute-percentiles.mjs package.json
git commit -m "feat: add build-time percentile computation script"
```

---

## Task 6: Wire Percentiles into Game-Over Screens

**Files:**
- Modify: `src/scripts/game-ui.js` (imports, `renderStreakGameOver`, `renderTimeTrialSummary`)

- [ ] **Step 1: Add percentile import**

In `src/scripts/game-ui.js`, after the milestones import added in Task 3, add:

```js
import { loadPercentiles, renderPercentileCard } from './percentiles.js';
```

- [ ] **Step 2: Preload percentiles on game start**

In the `initGame` function or at module level (near the imports), add a call to preload the data. Find the line `let prefetchedLeaderboards = null;` (line 70) and add after it:

```js
// Preload percentile data so it's ready at game-over
loadPercentiles();
```

- [ ] **Step 3: Add percentile card to renderStreakGameOver**

In `renderStreakGameOver`, after the `handleLeaderboardCheck` callback opens and before the `container.innerHTML = ...` assignment, compute the card HTML. Find this line inside the callback:

```js
  handleLeaderboardCheck(0, streakCount, () => {
    container.innerHTML = `
```

Replace with:

```js
  handleLeaderboardCheck(0, streakCount, () => {
    const isStreak = true;
    const percentileHTML = renderPercentileCard(streakCount, currentSetKey, isStreak);

    container.innerHTML = `
```

Then insert `${percentileHTML}` in the template. Find:

```js
        ${renderShareSection(getStreakFlavor(streakCount))}
```

Insert just before it:

```js
        ${percentileHTML}
```

- [ ] **Step 4: Add percentile card to renderTimeTrialSummary**

In `renderTimeTrialSummary`, similarly. Find inside the `handleLeaderboardCheck` callback:

```js
  handleLeaderboardCheck(session.totalScore, 0, () => {
    container.innerHTML = `
```

Replace with:

```js
  handleLeaderboardCheck(session.totalScore, 0, () => {
    const isStreak = false;
    const percentileHTML = renderPercentileCard(session.totalScore, currentSetKey, isStreak);

    container.innerHTML = `
```

Then find:

```js
        ${renderShareSection(getTimeTrialFlavor(correctCount, totalQ))}
```

Insert just before it:

```js
        ${percentileHTML}
```

- [ ] **Step 5: Manual test**

Run: `npx astro dev`
1. Ensure `public/data/percentiles.json` exists (from Task 5 or create a mock)
2. Play a streak game, get a few correct, then lose
3. Game-over screen should show "Top X%" card with histogram
4. Play a time trial game, verify same card appears

If `percentiles.json` doesn't exist, the card should not appear (graceful degradation).

- [ ] **Step 6: Commit**

```bash
git add src/scripts/game-ui.js
git commit -m "feat: show session percentile card on streak and time trial game-over screens"
```

---

## Task 7: Daily Leaderboard Page Redesign

**Files:**
- Modify: `src/pages/leaderboard.astro`
- Modify: `src/scripts/leaderboard-ui.js`

- [ ] **Step 1: Add renderYesterdayChampion to leaderboard-ui.js**

At the end of `src/scripts/leaderboard-ui.js`, before the closing of the file, add:

```js
/**
 * Render a "Yesterday's Champion" line below a leaderboard table.
 * champion: { name, country, score, streak } or null
 * isStreak: whether to show streak or score
 */
export function renderYesterdayChampion(champion, isStreak) {
  if (!champion) return '';
  const flag = getFlagForCode(champion.country);
  const name = escapeHTML(champion.name || 'Anonymous Bug Hunter');
  const value = isStreak ? `${champion.streak} streak` : `${champion.score} pts`;
  return `
    <div class="lb-yesterday">
      Yesterday: ${name} ${flag} — ${value}
    </div>
  `;
}
```

- [ ] **Step 2: Add yesterday champion CSS to global.css**

Append to the leaderboard styles section in `src/styles/global.css`:

```css
/* Yesterday's champion line */
.lb-yesterday {
  text-align: center;
  font-size: var(--text-xs);
  color: var(--text-secondary);
  opacity: 0.7;
  padding: 8px 0 4px;
}

/* Countdown timer */
.lb-countdown {
  font-size: var(--text-xs);
  color: var(--accent);
  margin-top: 4px;
}
```

- [ ] **Step 3: Rewrite leaderboard.astro**

Replace the full content of `src/pages/leaderboard.astro`:

```astro
---
import Base from '../layouts/Base.astro';
---
<Base
  title="Daily Leaderboard — What's That Bug?"
  description="Today's top bug identifiers. Compete in Time Trial and Streak modes — leaderboard resets at midnight ET."
  canonicalPath="/leaderboard"
>
  <div class="container" style="max-width:640px;">
    <div style="text-align:center;padding:24px 0 8px;">
      <h1>Daily Leaderboard</h1>
      <p class="subtitle">Resets every day at midnight ET</p>
      <p class="lb-countdown" id="lb-countdown"></p>
    </div>

    <div class="mode-group">
      <h2 class="mode-group-title">🔰 Bugs 101</h2>
      <div class="lb-tabs" data-group="bugs101">
        <button class="lb-tab active" data-board="bugs_101_time_trial">Time Trial</button>
        <button class="lb-tab" data-board="bugs_101_streak">Streaks</button>
      </div>
      <div class="lb-tab-content active" id="board-bugs_101_time_trial">
        <div class="lb-page-spinner"><div class="lb-spinner"></div></div>
      </div>
      <div class="lb-tab-content" id="board-bugs_101_streak">
        <div class="lb-page-spinner"><div class="lb-spinner"></div></div>
      </div>
    </div>

    <div class="mode-group" style="margin-top:20px;">
      <h2 class="mode-group-title">🌍 All Bugs</h2>
      <div class="lb-tabs" data-group="allbugs">
        <button class="lb-tab active" data-board="time_trial">Time Trial</button>
        <button class="lb-tab" data-board="streak">Streaks</button>
      </div>
      <div class="lb-tab-content active" id="board-time_trial">
        <div class="lb-page-spinner"><div class="lb-spinner"></div></div>
      </div>
      <div class="lb-tab-content" id="board-streak">
        <div class="lb-page-spinner"><div class="lb-spinner"></div></div>
      </div>
    </div>
  </div>

  <script>
    import { fetchLeaderboards } from '../scripts/leaderboard.js';
    import { renderLeaderboardTable, renderYesterdayChampion } from '../scripts/leaderboard-ui.js';

    // Tab switching
    document.querySelectorAll('.lb-tabs').forEach(tabGroup => {
      tabGroup.querySelectorAll('.lb-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          tabGroup.querySelectorAll('.lb-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');

          const boardKey = tab.dataset.board;
          const parent = tabGroup.closest('.mode-group');
          parent.querySelectorAll('.lb-tab-content').forEach(c => c.classList.remove('active'));
          parent.querySelector(`#board-${boardKey}`)?.classList.add('active');
        });
      });
    });

    // Countdown to midnight ET
    function updateCountdown() {
      const now = new Date();
      // Get current time in ET
      const etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false });
      const etNow = new Date(etStr);

      // Next midnight ET
      const midnightET = new Date(etNow);
      midnightET.setDate(midnightET.getDate() + 1);
      midnightET.setHours(0, 0, 0, 0);

      const diffMs = midnightET - etNow;
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

      const el = document.getElementById('lb-countdown');
      if (el) el.textContent = `🕐 Resets in ${hours}h ${minutes}m`;
    }

    updateCountdown();
    setInterval(updateCountdown, 60000);

    // Fetch and render leaderboards
    async function loadLeaderboards() {
      try {
        const boards = await fetchLeaderboards();
        if (!boards) throw new Error('No data');

        const boardKeys = ['bugs_101_time_trial', 'bugs_101_streak', 'time_trial', 'streak'];
        for (const key of boardKeys) {
          const isStreak = key.includes('streak');
          const container = document.getElementById(`board-${key}`);
          if (container) {
            const entries = boards[key] || [];
            const yesterdayChampion = boards[`${key}_yesterday_champion`] || null;

            let html = '';
            if (entries.length === 0) {
              html = '<p style="text-align:center;color:var(--text-secondary);font-size:0.85rem;padding:16px 0;">No scores yet today — be the first!</p>';
            } else {
              html = renderLeaderboardTable(entries, isStreak);
            }
            html += renderYesterdayChampion(yesterdayChampion, isStreak);
            container.innerHTML = html;
          }
        }
      } catch (err) {
        document.querySelectorAll('.lb-tab-content').forEach(el => {
          el.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:16px 0;">Couldn\'t load leaderboard. Try again later.</p>';
        });
      }
    }

    loadLeaderboards();
  </script>
</Base>
```

- [ ] **Step 4: Manual test**

Run: `npx astro dev`, navigate to `/leaderboard`
1. Title should say "Daily Leaderboard"
2. Countdown timer should show hours/minutes until midnight ET
3. If no entries today, should show "No scores yet today — be the first!"
4. Yesterday's champion line should appear below each table (once the server-side returns the data)

- [ ] **Step 5: Commit**

```bash
git add src/pages/leaderboard.astro src/scripts/leaderboard-ui.js src/styles/global.css
git commit -m "feat: redesign leaderboard page as daily-reset with countdown and yesterday's champion"
```

---

## Task 8: Homepage Restructure (Play / Compete / Explore)

**Files:**
- Modify: `src/pages/index.astro` (lines 28-126, the main layout section)

- [ ] **Step 1: Replace the mode group HTML**

In `src/pages/index.astro`, replace everything between `<div class="container">` and the closing `</div>` that ends the last themed set section (lines 28-126) with the new hierarchy:

```astro
  <div class="container">
    <div style="text-align: center; padding: 24px 0 8px;">
      <h1>🪲 What's That Bug?</h1>
      <p class="subtitle">Can you identify insects from their photos? Pick a mode and find out.</p>
    </div>

    <!-- Daily Challenge — subtle banner strip -->
    <div class="daily-banner">
      <span class="daily-banner-text">📅 <strong>Daily Challenge</strong> — a new mystery bug every day</span>
      <span class="daily-banner-status">
        <a href="/daily/play?mode=bugs101" class="daily-banner-link" id="daily-link-bugs101">Play →</a>
      </span>
    </div>

    <!-- Play section — primary CTA -->
    <div class="homepage-section">
      <h2 class="homepage-section-title">Play</h2>
      <div class="play-cards">
        <a href="/play?set=bugs_101" class="play-card">
          <span class="play-card-icon">🔰</span>
          <span class="play-card-title">Bugs 101</span>
          <span class="play-card-subtitle">Identify by type</span>
          <span class="play-card-detail">10 rounds · Beginner</span>
        </a>
        <a href="/play?set=all_bugs" class="play-card">
          <span class="play-card-icon">🌍</span>
          <span class="play-card-title">All Bugs</span>
          <span class="play-card-subtitle">Name exact species</span>
          <span class="play-card-detail">10 rounds · Expert</span>
        </a>
      </div>
    </div>

    <!-- Compete section -->
    <div class="homepage-section">
      <h2 class="homepage-section-title">Compete</h2>
      <p class="homepage-section-subtitle">Race the clock or test your streak</p>
      <div class="compete-grid">
        <a href="/play?set=bugs_101_time_trial" class="compete-card">
          <span class="compete-card-icon">⏱️</span>
          <span class="compete-card-label">Time Trial</span>
          <span class="compete-card-set">Bugs 101</span>
        </a>
        <a href="/play?set=bugs_101_streak" class="compete-card">
          <span class="compete-card-icon">🎯</span>
          <span class="compete-card-label">Streaks</span>
          <span class="compete-card-set">Bugs 101</span>
        </a>
        <a href="/play?set=time_trial" class="compete-card">
          <span class="compete-card-icon">⏱️</span>
          <span class="compete-card-label">Time Trial</span>
          <span class="compete-card-set">All Bugs</span>
        </a>
        <a href="/play?set=streak" class="compete-card">
          <span class="compete-card-icon">🎯</span>
          <span class="compete-card-label">Streaks</span>
          <span class="compete-card-set">All Bugs</span>
        </a>
      </div>
    </div>

    <!-- Explore section -->
    <div class="homepage-section">
      <h2 class="homepage-section-title">Explore</h2>
      <p class="homepage-section-subtitle">Themed deep dives</p>
      <div class="themed-buttons">
        {themedGroup.map(set => (
          <a href={`/play?set=${set.key}`} class="themed-btn">
            <span class="themed-btn-icon">{set.icon}</span>
            <span class="themed-btn-label">{set.name}</span>
            <span class="themed-btn-meta">{set.countLabel}</span>
          </a>
        ))}
      </div>
    </div>
  </div>
```

- [ ] **Step 2: Update the daily challenge script**

Find the daily challenge script block (the second `<script>` tag, around line 174) and update it to work with the new banner. Replace the full script block:

```astro
<script>
  import { getTodayET, loadDailyState, loadHistory, calculateStreaks } from '../scripts/daily-engine.js';

  try {
    const today = getTodayET();
    const link = document.getElementById('daily-link-bugs101');
    const bannerStatus = document.querySelector('.daily-banner-status');

    // Check bugs101 state for the banner
    const result = loadDailyState('bugs101', today);
    if (result && link) {
      if (result.solved) {
        link.textContent = `Solved ✓`;
        link.style.color = 'var(--success)';
      } else {
        link.textContent = 'Missed';
        link.style.color = 'var(--error)';
      }
    }

    // Show streak warning if applicable
    const history = loadHistory('bugs101');
    const streaks = calculateStreaks(history, today);
    if (streaks.playStreak >= 3 && !result && bannerStatus) {
      const warn = document.createElement('span');
      warn.className = 'streak-warning';
      warn.textContent = `${streaks.playStreak}-day streak at risk!`;
      warn.style.marginLeft = '8px';
      bannerStatus.appendChild(warn);
    }
  } catch { /* daily challenge not yet available */ }
</script>
```

- [ ] **Step 3: Add homepage section CSS to global.css**

Append to `src/styles/global.css`:

```css
/* =============================================
   Homepage Sections (Play / Compete / Explore)
   ============================================= */
.daily-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  margin-bottom: var(--space-6);
  font-size: var(--text-sm);
}

.daily-banner-text {
  color: var(--text-secondary);
}

.daily-banner-link {
  color: var(--accent);
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
}

.daily-banner-link:hover {
  text-decoration: underline;
}

.homepage-section {
  margin-bottom: var(--space-6);
}

.homepage-section-title {
  font-size: var(--text-lg);
  font-weight: 700;
  margin-bottom: var(--space-2);
}

.homepage-section-subtitle {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  margin-bottom: var(--space-4);
}

/* Play cards — large, primary CTA */
.play-cards {
  display: flex;
  gap: var(--space-4);
}

.play-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: var(--space-6) var(--space-4);
  background: var(--surface);
  border: 1px solid var(--border);
  border-bottom: 3px solid var(--accent);
  border-radius: var(--radius-md);
  text-decoration: none;
  color: var(--text);
  transition: border-color var(--transition-fast), transform var(--transition-fast);
}

.play-card:hover {
  border-color: var(--accent);
  transform: translateY(-2px);
}

.play-card-icon {
  font-size: 2rem;
  margin-bottom: var(--space-2);
}

.play-card-title {
  font-size: var(--text-lg);
  font-weight: 700;
}

.play-card-subtitle {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  margin-top: 2px;
}

.play-card-detail {
  font-size: var(--text-xs);
  color: var(--text-secondary);
  margin-top: var(--space-2);
}

/* Compete grid — 2x2 smaller cards */
.compete-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
}

.compete-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: var(--space-3) var(--space-2);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  text-decoration: none;
  color: var(--text);
  transition: border-color var(--transition-fast);
}

.compete-card:hover {
  border-color: var(--accent);
}

.compete-card-icon {
  font-size: 1.3rem;
}

.compete-card-label {
  font-size: var(--text-sm);
  font-weight: 600;
}

.compete-card-set {
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

/* Mobile: stack play cards */
@media (max-width: 480px) {
  .play-cards {
    flex-direction: column;
  }
}
```

- [ ] **Step 4: Remove the old best-scores script**

The old `<script>` block that reads `data-key` attributes on `.mode-btn` elements (around line 128-148 in the original) is no longer needed since we removed those attributes. Find and remove this block:

```html
  <script>
    // Show best scores from localStorage
    const bestKeys = [
      ...
    ];
    ...
  </script>
```

The player stats card script and onboarding/support scripts should remain unchanged.

- [ ] **Step 5: Manual test**

Run: `npx astro dev`
1. Homepage should show: Daily banner (slim) → Play section (2 large cards) → Compete (2x2 grid) → Explore (themed chips)
2. Daily banner should show "Play →" or "Solved ✓" based on daily state
3. All links should navigate to correct game pages
4. On mobile (< 480px), Play cards should stack vertically
5. Player stats card should still appear after 3+ sessions

- [ ] **Step 6: Commit**

```bash
git add src/pages/index.astro src/styles/global.css
git commit -m "feat: restructure homepage to Play/Compete/Explore hierarchy with daily banner"
```

---

## Task 9: Apps Script Server-Side Changes (Manual)

This task requires manual changes in the Google Apps Script editor. These changes cannot be committed to git — they live in the Google Sheets script editor.

**Files:**
- Modify: Google Apps Script attached to the feedback spreadsheet

- [ ] **Step 1: Document the required Apps Script changes**

Create `docs/apps-script-daily-leaderboard.md` with the exact code changes needed:

```markdown
# Apps Script Changes for Daily Leaderboard

These changes must be applied manually in the Google Apps Script editor attached
to the "What's That Bug — Feedback" spreadsheet.

## Changes to the `doGet` handler (leaderboard action)

In the existing `doGet(e)` function, find the `leaderboard` action handler.
Replace the section that reads the Leaderboard sheet with this:

### 1. Add ET date helper at the top of the script

\`\`\`js
function getTodayET() {
  var now = new Date();
  // Convert to ET using Utilities.formatDate
  var etStr = Utilities.formatDate(now, 'America/New_York', 'yyyy-MM-dd');
  return etStr;
}

function getYesterdayET() {
  var now = new Date();
  now.setDate(now.getDate() - 1);
  var etStr = Utilities.formatDate(now, 'America/New_York', 'yyyy-MM-dd');
  return etStr;
}
\`\`\`

### 2. Modify the leaderboard action

Replace the existing leaderboard data reading logic with:

\`\`\`js
if (action === 'leaderboard') {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Leaderboard');
  var data = sheet.getDataRange().getValues();
  var headers = data[0];

  var tsCol = headers.indexOf('timestamp');
  var setCol = headers.indexOf('set_key');
  var scoreCol = headers.indexOf('score');
  var streakCol = headers.indexOf('streak');
  var nameCol = headers.indexOf('name');
  var countryCol = headers.indexOf('country');

  var todayET = getTodayET();
  var yesterdayET = getYesterdayET();

  var boards = {
    bugs_101_time_trial: [],
    bugs_101_streak: [],
    time_trial: [],
    streak: [],
    bugs_101_time_trial_yesterday_champion: null,
    bugs_101_streak_yesterday_champion: null,
    time_trial_yesterday_champion: null,
    streak_yesterday_champion: null,
  };

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var ts = new Date(row[tsCol]);
    var dateET = Utilities.formatDate(ts, 'America/New_York', 'yyyy-MM-dd');
    var setKey = row[setCol];

    if (!boards.hasOwnProperty(setKey)) continue;

    var entry = {
      name: row[nameCol],
      country: row[countryCol],
      score: row[scoreCol],
      streak: row[streakCol],
      timestamp: row[tsCol],
    };

    // Today's entries
    if (dateET === todayET) {
      boards[setKey].push(entry);
    }

    // Yesterday's champion tracking
    var champKey = setKey + '_yesterday_champion';
    if (dateET === yesterdayET) {
      var isStreak = setKey.includes('streak');
      var currentVal = isStreak ? (entry.streak || 0) : (entry.score || 0);
      var existing = boards[champKey];
      if (!existing) {
        boards[champKey] = entry;
      } else {
        var existingVal = isStreak ? (existing.streak || 0) : (existing.score || 0);
        if (currentVal > existingVal) {
          boards[champKey] = entry;
        }
      }
    }
  }

  // Sort today's entries (descending by score/streak) and keep top 10
  ['bugs_101_time_trial', 'time_trial'].forEach(function(key) {
    boards[key].sort(function(a, b) { return (b.score || 0) - (a.score || 0); });
    boards[key] = boards[key].slice(0, 10);
  });
  ['bugs_101_streak', 'streak'].forEach(function(key) {
    boards[key].sort(function(a, b) { return (b.streak || 0) - (a.streak || 0); });
    boards[key] = boards[key].slice(0, 10);
  });

  return ContentService.createTextOutput(JSON.stringify(boards))
    .setMimeType(ContentService.MimeType.JSON);
}
\`\`\`

### 3. Deploy

After making changes:
1. Click "Deploy" → "Manage deployments"
2. Edit the existing deployment
3. Set version to "New version"
4. Click "Deploy"
\`\`\`
```

- [ ] **Step 2: Commit the documentation**

```bash
git add docs/apps-script-daily-leaderboard.md
git commit -m "docs: add Apps Script changes needed for daily leaderboard"
```

- [ ] **Step 3: Apply changes in Google Apps Script editor**

Open the Apps Script editor for the spreadsheet and apply the changes documented above. Deploy a new version.

- [ ] **Step 4: Verify the endpoint works**

Test the endpoint in a browser or curl:
```bash
curl "<WEBHOOK_URL>?action=leaderboard" | python3 -m json.tool
```

Verify the response contains today's entries only, plus `*_yesterday_champion` fields.

---

## Task 10: Integration Test — Full Flow

- [ ] **Step 1: Run all existing tests**

Run: `npx vitest run`
Expected: All tests pass (no regressions)

- [ ] **Step 2: Run the dev server and test each feature**

Run: `npx astro dev`

**Homepage:**
1. Daily banner is slim strip at top
2. "Play" section shows Bugs 101 and All Bugs as large cards
3. "Compete" section shows 4 smaller cards in a grid
4. "Explore" section shows themed set chips
5. Player stats card appears at bottom (if 3+ sessions in localStorage)

**Streak milestones:**
1. Play a Bugs 101 streak game
2. At streak 5: toast appears "Getting Good 🔥", auto-dismisses
3. At streak 10: toast appears "Sharp Eye 🔥🔥" + streak counter pulses gold
4. Game over: shows "Reached X 🔥🔥" badge if any milestone hit
5. Percentile card shows below score stats with histogram

**Time trial percentiles:**
1. Play a time trial game
2. Game over: percentile card shows "Top X%" with histogram
3. If percentiles.json missing: no percentile card, no errors

**Leaderboard page:**
1. Navigate to `/leaderboard`
2. Title: "Daily Leaderboard"
3. Countdown timer shows time until midnight ET
4. Tables show today's entries only
5. Yesterday's champion line appears below each table

- [ ] **Step 3: Build and verify**

Run: `npx astro build`
Expected: Build succeeds with no errors

- [ ] **Step 4: Commit any final fixes**

If any fixes were needed during integration testing, commit them:

```bash
git add -A
git commit -m "fix: integration test fixes for engagement redesign"
```

---

## Summary

| Task | What | Key files |
|------|------|-----------|
| 1 | Milestone logic + tests | `milestones.js`, `milestones.test.js` |
| 2 | Milestone CSS | `global.css` |
| 3 | Wire milestones into streak gameplay | `game-ui.js` |
| 4 | Percentile logic + tests | `percentiles.js`, `percentiles.test.js` |
| 5 | Build-time percentile script | `compute-percentiles.mjs`, `package.json` |
| 6 | Wire percentiles into game-over | `game-ui.js` |
| 7 | Daily leaderboard page | `leaderboard.astro`, `leaderboard-ui.js` |
| 8 | Homepage restructure | `index.astro`, `global.css` |
| 9 | Apps Script changes (manual) | Documentation + manual deployment |
| 10 | Integration test | All files, full flow |
