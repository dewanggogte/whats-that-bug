# Quick Wins (PRD v2 Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the 5 Phase 1 quick wins from PRD v2: leaderboard timeout, data-driven image flagging, sound effects, onboarding popups, and feedback form for all modes.

**Architecture:** Each feature is independent. Tasks 1-2 are backend/infrastructure. Tasks 3-5 are frontend UI changes to `game-ui.js`, `global.css`, and `index.astro`. The sound system becomes a new module (`sounds.js`) to keep `game-ui.js` from growing further. The onboarding system lives in a new module (`onboarding.js`) loaded from `index.astro` and `play.astro`.

**Tech Stack:** Vanilla JS, Web Audio API, CSS animations, Astro pages, Python 3 (analytics script)

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/scripts/sounds.js` | All synthesized sound effects + mute toggle state |
| Create | `src/scripts/onboarding.js` | Welcome/scoring modals for first-time visitors |
| Create | `scripts/flag-images.py` | Data-driven image quality flagging script |
| Modify | `src/scripts/game-ui.js` | Leaderboard timeout, integrate sounds, add feedback form to TT/streak |
| Modify | `src/styles/global.css` | Onboarding modal styles, mute button styles |
| Modify | `src/pages/index.astro` | Import onboarding module |
| Modify | `src/pages/play.astro` | Import onboarding module (for scoring modal) |

---

## Task 1: Leaderboard Check Timeout + Background Prefetch

**Problem:** `handleLeaderboardCheck()` in `game-ui.js:647` has no timeout. If Google Apps Script cold-starts, users stare at "Checking leaderboard..." indefinitely.

**Files:**
- Modify: `src/scripts/game-ui.js:647-696` (handleLeaderboardCheck)
- Modify: `src/scripts/leaderboard-ui.js:63-74` (showLoadingSpinner)

### Steps

- [ ] **Step 1: Add timeout to handleLeaderboardCheck**

In `src/scripts/game-ui.js`, replace the `handleLeaderboardCheck` function (lines 647-696) with a version that uses `Promise.race()` to enforce a 3-second timeout, and shows a progressive "Almost there..." message at 2s:

```javascript
async function handleLeaderboardCheck(score, streak, renderResultsFn) {
  const isStreak = currentSetKey.includes('streak');
  const value = isStreak ? streak : score;

  if (!isLeaderboardEligible(currentSetKey) || value <= 0) {
    renderResultsFn();
    return;
  }

  const dismissSpinner = showLoadingSpinner('Checking leaderboard...');

  // Progressive message at 2s
  const progressTimer = setTimeout(() => {
    const msgEl = document.querySelector('.lb-loading-card p');
    if (msgEl) msgEl.textContent = 'Almost there...';
  }, 2000);

  // 3-second timeout
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('timeout')), 3000)
  );

  try {
    const allBoards = await Promise.race([fetchLeaderboards(), timeout]);
    clearTimeout(progressTimer);
    dismissSpinner();

    const board = allBoards?.[currentSetKey] || [];
    const { qualifies, rank } = checkTop10(board, value, isStreak);
    const { isPersonalBest, previousBest } = checkPersonalBest(currentSetKey, value, isStreak);

    if (qualifies) {
      await showCelebrationPopup({
        rank,
        score,
        streak,
        setKey: currentSetKey,
        sessionId: session.sessionId,
        board,
        questionsAnswered: session.questionsAnswered,
        correctCount: session.correctCount,
      });
      renderResultsFn();
    } else if (isPersonalBest) {
      await showPersonalBestPopup({
        score,
        streak,
        previousBest,
        setKey: currentSetKey,
        board,
      });
      renderResultsFn();
    } else {
      renderResultsFn();
    }
  } catch (err) {
    clearTimeout(progressTimer);
    console.warn('Leaderboard check failed or timed out:', err);
    dismissSpinner();
    renderResultsFn();
  }
}
```

- [ ] **Step 2: Add background prefetch at round 8**

In `game-ui.js`, add a leaderboard cache variable near the top (after `let roundCache = [];` around line 100):

```javascript
// Leaderboard prefetch — start fetching at round 8 so data is ready by session end
let prefetchedLeaderboards = null;
```

In `startRound()` (around line 313), after `displayRound++`, add the prefetch trigger:

```javascript
  // Prefetch leaderboards at round 8 so they're ready by session end
  if (displayRound === 8 && isLeaderboardEligible(currentSetKey) && !prefetchedLeaderboards) {
    fetchLeaderboards()
      .then(data => { prefetchedLeaderboards = data; })
      .catch(() => {}); // Silently fail — handleLeaderboardCheck will retry
  }
```

Then update `handleLeaderboardCheck` to use the prefetched data when available. Replace the `fetchLeaderboards()` call with:

```javascript
    const fetchPromise = prefetchedLeaderboards
      ? Promise.resolve(prefetchedLeaderboards)
      : fetchLeaderboards();
    const allBoards = await Promise.race([fetchPromise, timeout]);
```

- [ ] **Step 3: Add sessionStorage cache for leaderboard data**

In `src/scripts/leaderboard.js`, update `fetchLeaderboards()` to cache results for 5 minutes:

```javascript
const LB_CACHE_KEY = 'wtb_lb_cache';
const LB_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function fetchLeaderboards() {
  if (!WEBHOOK_URL) return null;

  // Check sessionStorage cache
  try {
    const cached = sessionStorage.getItem(LB_CACHE_KEY);
    if (cached) {
      const { data, ts } = JSON.parse(cached);
      if (Date.now() - ts < LB_CACHE_TTL) return data;
    }
  } catch { /* ignore corrupt cache */ }

  const url = `${WEBHOOK_URL}?action=leaderboard`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Leaderboard fetch failed: ${res.status}`);
  const data = await res.json();

  // Cache the result
  try {
    sessionStorage.setItem(LB_CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
  } catch { /* storage full */ }

  return data;
}
```

- [ ] **Step 4: Verify the build works**

Run: `cd /Users/dg/lab/whats_that_bug && npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/scripts/game-ui.js src/scripts/leaderboard.js
git commit -m "feat: add 3s timeout + background prefetch to leaderboard check

Prevents indefinite loading spinner when Apps Script cold-starts.
Progressive message at 2s, skip on timeout, prefetch at round 8,
cache leaderboard data in sessionStorage for 5 minutes."
```

---

## Task 2: Data-Driven Image Flagging Script

**Problem:** 2,621 observations have no image quality vetting. Need to identify the worst ones using existing play data.

**Files:**
- Create: `scripts/flag-images.py`

This is a standalone Python script that reads the Google Sheets CSV export and outputs a ranked list of problematic observations.

### Steps

- [ ] **Step 1: Create the flagging script**

Create `scripts/flag-images.py`:

```python
#!/usr/bin/env python3
"""
What's That Bug — Data-Driven Image Flagging

Identifies problematic observations using round_complete event data.
Usage: python3 scripts/flag-images.py <path-to-csv>

The CSV should be a Google Sheets export with columns including:
  type, observation_id, score, time_taken_ms, user_answer, correct_answer, set

Output: Ranked list of observations flagged for review, printed to stdout
        and saved to scripts/flagged-observations.json
"""

import csv
import json
import sys
import statistics
import collections


def load_rounds(path):
    """Load round_complete events from the CSV export."""
    rounds = []
    with open(path, newline='') as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Support both flat columns and nested data_json format
            if row.get('type') == 'round_complete':
                rounds.append(row)
            elif row.get('data_json'):
                try:
                    data = json.loads(row['data_json'])
                    if data.get('type') == 'round_complete':
                        rounds.append(data)
                except (json.JSONDecodeError, KeyError):
                    pass
    return rounds


def compute_scores(rounds):
    """
    Compute quality scores per observation.

    Formula from PRD:
      quality_score = (miss_rate * 0.4) + (confusion_density * 0.3)
                    + (time_anomaly * 0.2) + (bad_reports * 0.1)
    Flag for review if quality_score > 0.6

    Since bad_photo events are separate, we set bad_reports = 0 here
    and focus on the three metrics derivable from round_complete data.
    """
    # Group rounds by observation_id
    by_obs = collections.defaultdict(list)
    for r in rounds:
        obs_id = r.get('observation_id')
        if not obs_id:
            continue
        by_obs[obs_id].append(r)

    # Compute global median time for time anomaly calculation
    all_times = []
    for r in rounds:
        try:
            t = int(r.get('time_taken_ms', 0))
            if t > 0:
                all_times.append(t)
        except (ValueError, TypeError):
            pass
    median_time = statistics.median(all_times) if all_times else 5000

    # Compute confusion pairs globally
    confusion_counts = collections.Counter()
    for r in rounds:
        correct = r.get('correct_answer', '')
        guessed = r.get('user_answer', '')
        if correct and guessed and correct != guessed:
            pair = tuple(sorted([correct, guessed]))
            confusion_counts[pair] += 1

    # Top confusion pairs (top 50)
    top_confusions = set()
    for pair, _ in confusion_counts.most_common(50):
        top_confusions.add(pair[0])
        top_confusions.add(pair[1])

    results = []
    for obs_id, obs_rounds in by_obs.items():
        total = len(obs_rounds)
        if total < 3:
            continue  # Not enough data to judge

        # Miss rate
        wrong = sum(1 for r in obs_rounds if int(r.get('score', 0)) == 0)
        miss_rate = wrong / total

        # Confusion density: how often this observation's correct species
        # appears in top confusion pairs
        correct_species = obs_rounds[0].get('correct_answer', '')
        confusion_density = 1.0 if correct_species in top_confusions else 0.0

        # Time anomaly: avg time vs global median
        times = []
        for r in obs_rounds:
            try:
                t = int(r.get('time_taken_ms', 0))
                if t > 0:
                    times.append(t)
            except (ValueError, TypeError):
                pass
        avg_time = statistics.mean(times) if times else median_time
        # Normalize: >2x median = 1.0, at median = 0.0
        time_anomaly = min(1.0, max(0.0, (avg_time / median_time - 1.0)))

        quality_score = (
            miss_rate * 0.4
            + confusion_density * 0.3
            + time_anomaly * 0.2
            + 0.0  # bad_reports placeholder — integrate separately
        )

        results.append({
            'observation_id': obs_id,
            'correct_species': correct_species,
            'total_attempts': total,
            'miss_rate': round(miss_rate, 3),
            'confusion_density': round(confusion_density, 3),
            'time_anomaly': round(time_anomaly, 3),
            'avg_time_ms': round(avg_time),
            'quality_score': round(quality_score, 3),
            'flagged': quality_score > 0.6,
        })

    results.sort(key=lambda x: x['quality_score'], reverse=True)
    return results


def main():
    if len(sys.argv) < 2:
        print('Usage: python3 scripts/flag-images.py <path-to-csv>')
        sys.exit(1)

    path = sys.argv[1]
    rounds = load_rounds(path)
    print(f'Loaded {len(rounds)} round_complete events')

    results = compute_scores(rounds)
    flagged = [r for r in results if r['flagged']]

    print(f'\nAnalyzed {len(results)} observations (3+ attempts each)')
    print(f'Flagged {len(flagged)} observations (quality_score > 0.6)\n')

    print(f'{"Rank":<5} {"Obs ID":<12} {"Species":<35} {"Miss%":<7} {"Conf":<6} {"Time":<6} {"Score":<6} {"N":<4}')
    print('-' * 85)
    for i, r in enumerate(flagged[:50], 1):
        print(f'{i:<5} {r["observation_id"]:<12} {r["correct_species"][:34]:<35} '
              f'{r["miss_rate"]:<7.1%} {r["confusion_density"]:<6.1f} '
              f'{r["time_anomaly"]:<6.2f} {r["quality_score"]:<6.3f} {r["total_attempts"]:<4}')

    # Also show top confusion pairs
    print(f'\n--- Top 20 Confusion Pairs ---')
    # Recompute for display
    confusion_counts = collections.Counter()
    for r in rounds:
        correct = r.get('correct_answer', '')
        guessed = r.get('user_answer', '')
        if correct and guessed and correct != guessed:
            pair = tuple(sorted([correct, guessed]))
            confusion_counts[pair] += 1

    for pair, count in confusion_counts.most_common(20):
        print(f'  {pair[0]} <-> {pair[1]}: {count} times')

    # Save JSON output
    out_path = 'scripts/flagged-observations.json'
    with open(out_path, 'w') as f:
        json.dump(results[:100], f, indent=2)
    print(f'\nTop 100 observations saved to {out_path}')


if __name__ == '__main__':
    main()
```

- [ ] **Step 2: Test with a quick sanity check**

Run: `cd /Users/dg/lab/whats_that_bug && python3 scripts/flag-images.py --help 2>&1 || python3 scripts/flag-images.py`
Expected: Prints usage message (no CSV provided).

- [ ] **Step 3: Commit**

```bash
git add scripts/flag-images.py
git commit -m "feat: add data-driven image flagging script

Analyzes round_complete events to rank observations by quality score.
Uses miss rate (40%), confusion density (30%), and time anomaly (20%).
Flags observations scoring >0.6 for manual review."
```

---

## Task 3: Sound Effects System

**Problem:** Only a single `playDing()` exists for correct answers. No audio feedback for wrong answers, streaks, session end, etc.

**Files:**
- Create: `src/scripts/sounds.js`
- Modify: `src/scripts/game-ui.js:69-84` (remove old playDing, import new module)
- Modify: `src/styles/global.css` (mute button style)

### Steps

- [ ] **Step 1: Create the sounds module**

Create `src/scripts/sounds.js`:

```javascript
/**
 * Sound effects — all synthesized via Web Audio API.
 * No audio files needed. Mute state persisted to localStorage.
 */

const MUTE_KEY = 'wtb_muted';
let audioCtx = null;
let muted = false;

// Restore mute state
try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch {}

function ctx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

export function isMuted() { return muted; }

export function toggleMute() {
  muted = !muted;
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch {}
  return muted;
}

// --- Individual sounds ---

/** Correct answer — ascending chime (refined version of the original ding) */
export function playCorrect() {
  if (muted) return;
  const c = ctx();
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.connect(gain);
  gain.connect(c.destination);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(1320, c.currentTime + 0.08);
  gain.gain.setValueAtTime(0.25, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, c.currentTime + 0.2);
  osc.start(c.currentTime);
  osc.stop(c.currentTime + 0.2);
}

/** Wrong answer — soft descending tone */
export function playWrong() {
  if (muted) return;
  const c = ctx();
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.connect(gain);
  gain.connect(c.destination);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(440, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(330, c.currentTime + 0.15);
  gain.gain.setValueAtTime(0.15, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, c.currentTime + 0.25);
  osc.start(c.currentTime);
  osc.stop(c.currentTime + 0.25);
}

/** Perfect score (100pts) — sparkle flourish: two quick ascending notes */
export function playPerfect() {
  if (muted) return;
  const c = ctx();

  // Note 1
  const osc1 = c.createOscillator();
  const gain1 = c.createGain();
  osc1.connect(gain1);
  gain1.connect(c.destination);
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(1047, c.currentTime); // C6
  gain1.gain.setValueAtTime(0.2, c.currentTime);
  gain1.gain.exponentialRampToValueAtTime(0.01, c.currentTime + 0.15);
  osc1.start(c.currentTime);
  osc1.stop(c.currentTime + 0.15);

  // Note 2 — higher, slightly delayed
  const osc2 = c.createOscillator();
  const gain2 = c.createGain();
  osc2.connect(gain2);
  gain2.connect(c.destination);
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(1568, c.currentTime + 0.1); // G6
  gain2.gain.setValueAtTime(0.01, c.currentTime);
  gain2.gain.setValueAtTime(0.2, c.currentTime + 0.1);
  gain2.gain.exponentialRampToValueAtTime(0.01, c.currentTime + 0.3);
  osc2.start(c.currentTime + 0.1);
  osc2.stop(c.currentTime + 0.3);
}

/**
 * Streak milestone — cumulative chime. Pitch rises with streak count.
 * Called at milestones: 5, 10, 15, 20, 25...
 */
export function playStreakMilestone(streak) {
  if (muted) return;
  const c = ctx();
  // Base frequency rises with streak: 660 at 5, 880 at 10, 1047 at 15, etc.
  const baseFreq = 660 + Math.min(streak, 30) * 13;

  for (let i = 0; i < 3; i++) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.connect(gain);
    gain.connect(c.destination);
    osc.type = 'sine';
    const t = c.currentTime + i * 0.08;
    osc.frequency.setValueAtTime(baseFreq + i * 100, t);
    gain.gain.setValueAtTime(0.01, c.currentTime);
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.12);
    osc.start(t);
    osc.stop(t + 0.12);
  }
}

/** Session complete — short fanfare (two-note ascending) */
export function playSessionEnd() {
  if (muted) return;
  const c = ctx();
  const notes = [523, 659, 784]; // C5, E5, G5

  notes.forEach((freq, i) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.connect(gain);
    gain.connect(c.destination);
    osc.type = 'triangle';
    const t = c.currentTime + i * 0.15;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.01, c.currentTime);
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
    osc.start(t);
    osc.stop(t + 0.3);
  });
}

/** Timer warning — subtle tick (used when <=10s remain in time trial) */
export function playTick() {
  if (muted) return;
  const c = ctx();
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.connect(gain);
  gain.connect(c.destination);
  osc.type = 'square';
  osc.frequency.setValueAtTime(1000, c.currentTime);
  gain.gain.setValueAtTime(0.05, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, c.currentTime + 0.05);
  osc.start(c.currentTime);
  osc.stop(c.currentTime + 0.05);
}
```

- [ ] **Step 2: Integrate sounds into game-ui.js**

In `src/scripts/game-ui.js`:

**a)** Add import at the top (after the existing imports around line 10):
```javascript
import { playCorrect, playWrong, playPerfect, playStreakMilestone, playSessionEnd, playTick, isMuted, toggleMute } from './sounds.js';
```

**b)** Remove the old `playDing` function and `audioCtx` variable (lines 69-84):
```javascript
// DELETE these lines:
// let audioCtx = null;
// function playDing() { ... }
```

**c)** In `handleAnswer()` (around line 484-485), replace:
```javascript
  if (score > 0) playDing();
```
with:
```javascript
  if (score === 100) { playPerfect(); }
  else if (score > 0) { playCorrect(); }
  else { playWrong(); }
```

**d)** In `handleStreakPostAnswer()` (around line 546-548), after updating streak display, add milestone sound:
```javascript
    // Update streak display
    const streakEl = container.querySelector('.streak-count');
    if (streakEl) streakEl.textContent = session.currentStreak;

    // Streak milestone sound at 5, 10, 15...
    if (session.currentStreak > 0 && session.currentStreak % 5 === 0) {
      playStreakMilestone(session.currentStreak);
    }
```

**e)** In `updateTimerDisplay()` (around line 301-309), add tick sound when <=10s:
```javascript
function updateTimerDisplay() {
  const timerEl = container.querySelector('.timer-countdown');
  if (timerEl) {
    timerEl.textContent = `${timeRemaining}s`;
    if (timeRemaining <= 10) {
      timerEl.classList.add('urgent');
      playTick();
    }
  }
}
```

**f)** In `renderClassicSummary()` (around line 700), add session end sound at the top:
```javascript
function renderClassicSummary() {
  playSessionEnd();
  // ... rest of function
```

**g)** In `renderTimeTrialSummary()` (around line 740), add session end sound:
```javascript
function renderTimeTrialSummary() {
  playSessionEnd();
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  // ... rest
```

**h)** In `renderStreakGameOver()` (around line 831), do NOT play session end (they lost). The `playWrong()` from handleAnswer already covers it.

**i)** Add a mute button to the game UI. In `renderRound()` (around line 374, after the `topBarHTML` assignments but before the `container.innerHTML = ...`), add a mute toggle to all top bar variants. The simplest approach: add it as a floating button. After the `container.innerHTML = ...` assignment (around line 402), append:

```javascript
  // Mute toggle
  const muteBtn = document.createElement('button');
  muteBtn.className = 'mute-toggle';
  muteBtn.setAttribute('aria-label', 'Toggle sound');
  muteBtn.textContent = isMuted() ? '🔇' : '🔊';
  muteBtn.addEventListener('click', () => {
    const nowMuted = toggleMute();
    muteBtn.textContent = nowMuted ? '🔇' : '🔊';
  });
  container.querySelector('.container')?.appendChild(muteBtn);
```

- [ ] **Step 3: Add mute button CSS**

Append to `src/styles/global.css`:

```css
/* =============================================
   Mute Toggle
   ============================================= */
.mute-toggle {
  position: fixed;
  bottom: 24px;
  left: 20px;
  z-index: 90;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 50%;
  width: 40px;
  height: 40px;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  transition: opacity 0.2s;
}

.mute-toggle:hover {
  opacity: 0.8;
}
```

- [ ] **Step 4: Verify build**

Run: `cd /Users/dg/lab/whats_that_bug && npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/scripts/sounds.js src/scripts/game-ui.js src/styles/global.css
git commit -m "feat: add synthesized sound effects for all game events

New sounds module with Web Audio API synthesis:
- Correct answer (ascending chime), wrong (soft descending)
- Perfect score (sparkle flourish), streak milestones (rising pitch)
- Session end (fanfare), timer tick (subtle click at <=10s)
- Persistent mute toggle in bottom-left corner"
```

---

## Task 4: Onboarding Popup Sequence

**Problem:** No welcome or tutorial for first-time visitors. Players jump straight into the game without understanding scoring.

**Files:**
- Create: `src/scripts/onboarding.js`
- Modify: `src/pages/index.astro` (import onboarding)
- Modify: `src/styles/global.css` (onboarding modal styles)

### Steps

- [ ] **Step 1: Create the onboarding module**

Create `src/scripts/onboarding.js`:

```javascript
/**
 * Onboarding — sequential modal flow for first-time visitors.
 * Shows welcome + scoring explanation on first visit only.
 * Uses localStorage flags to avoid repeating.
 */

const SEEN_WELCOME = 'wtb_seen_welcome';
const SEEN_SCORING = 'wtb_seen_scoring';

function hasSeen(key) {
  try { return localStorage.getItem(key) === '1'; } catch { return true; }
}

function markSeen(key) {
  try { localStorage.setItem(key, '1'); } catch {}
}

function createModal(content, onDismiss) {
  const overlay = document.createElement('div');
  overlay.className = 'onboarding-overlay';
  overlay.innerHTML = `
    <div class="onboarding-card">
      ${content}
    </div>
  `;

  document.body.appendChild(overlay);

  // Animate in
  requestAnimationFrame(() => overlay.classList.add('visible'));

  const dismiss = () => {
    overlay.classList.remove('visible');
    setTimeout(() => {
      overlay.remove();
      if (onDismiss) onDismiss();
    }, 340);
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) dismiss();
  });

  // Escape key
  const onKey = (e) => {
    if (e.key === 'Escape') {
      document.removeEventListener('keydown', onKey);
      dismiss();
    }
  };
  document.addEventListener('keydown', onKey);

  // CTA button
  overlay.querySelector('.onboarding-cta')?.addEventListener('click', dismiss);

  return dismiss;
}

function showWelcome(onDone) {
  createModal(`
    <h2 class="onboarding-title">What's That Bug?</h2>
    <p class="onboarding-text">See a bug. Guess its name. Learn something new.</p>
    <p class="onboarding-detail">2,600+ research-grade photos from iNaturalist.<br>No login. No tracking. Just bugs.</p>
    <button class="btn btn-primary onboarding-cta">Let's play</button>
  `, () => {
    markSeen(SEEN_WELCOME);
    if (onDone) setTimeout(onDone, 360);
  });
}

function showScoring(onDone) {
  createModal(`
    <h2 class="onboarding-title">How scoring works</h2>
    <div class="onboarding-scoring">
      <div class="onboarding-score-row"><span>Exact species</span><span class="onboarding-pts">100 pts</span></div>
      <div class="onboarding-score-row"><span>Same genus</span><span class="onboarding-pts">75 pts</span></div>
      <div class="onboarding-score-row"><span>Same family</span><span class="onboarding-pts">50 pts</span></div>
      <div class="onboarding-score-row"><span>Same order</span><span class="onboarding-pts">25 pts</span></div>
    </div>
    <p class="onboarding-detail">New here? Start with Bugs 101 — it's easier.</p>
    <button class="btn btn-primary onboarding-cta">Got it</button>
  `, () => {
    markSeen(SEEN_SCORING);
    if (onDone) onDone();
  });
}

/**
 * Run the onboarding sequence. Call from index.astro on page load.
 * Only shows modals that haven't been seen before.
 */
export function runOnboarding() {
  if (!hasSeen(SEEN_WELCOME)) {
    showWelcome(() => {
      if (!hasSeen(SEEN_SCORING)) {
        showScoring();
      }
    });
  } else if (!hasSeen(SEEN_SCORING)) {
    showScoring();
  }
}
```

- [ ] **Step 2: Add onboarding styles to global.css**

Append to `src/styles/global.css`:

```css
/* =============================================
   Onboarding Modals
   ============================================= */
.onboarding-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  opacity: 0;
  transition: opacity 0.34s ease;
}

.onboarding-overlay.visible {
  opacity: 1;
}

.onboarding-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 32px 24px;
  max-width: 380px;
  width: 90%;
  text-align: center;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  transform: translateY(16px);
  transition: transform 0.34s ease;
}

.onboarding-overlay.visible .onboarding-card {
  transform: translateY(0);
}

.onboarding-title {
  font-size: 1.4rem;
  font-weight: 700;
  margin-bottom: 12px;
}

.onboarding-text {
  font-size: 1rem;
  color: var(--text);
  margin-bottom: 8px;
}

.onboarding-detail {
  font-size: 0.85rem;
  color: var(--text-secondary);
  margin-bottom: 20px;
  line-height: 1.5;
}

.onboarding-scoring {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px 16px;
  margin-bottom: 16px;
}

.onboarding-score-row {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  font-size: 0.9rem;
  border-bottom: 1px dashed var(--border);
}

.onboarding-score-row:last-child {
  border-bottom: none;
}

.onboarding-pts {
  font-weight: 700;
  color: var(--accent);
}

.onboarding-cta {
  width: 100%;
  margin-top: 4px;
}

/* Mobile: bottom-sheet positioning */
@media (max-width: 480px) {
  .onboarding-overlay {
    align-items: flex-end;
  }

  .onboarding-card {
    border-radius: 16px 16px 0 0;
    width: 100%;
    max-width: 100%;
    padding-bottom: calc(24px + env(safe-area-inset-bottom));
    transform: translateY(100%);
  }

  .onboarding-overlay.visible .onboarding-card {
    transform: translateY(0);
  }
}
```

- [ ] **Step 3: Import onboarding from index.astro**

In `src/pages/index.astro`, add a new script block at the end (before the closing `</Base>` tag):

```html
<script>
  import { runOnboarding } from '../scripts/onboarding.js';
  runOnboarding();
</script>
```

- [ ] **Step 4: Verify build**

Run: `cd /Users/dg/lab/whats_that_bug && npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/scripts/onboarding.js src/pages/index.astro src/styles/global.css
git commit -m "feat: add onboarding popup sequence for first-time visitors

Two-modal flow: welcome message, then scoring explanation.
localStorage flags prevent repeat showing. Bottom-sheet on mobile,
centered on desktop. Smooth fade + translateY transitions."
```

---

## Task 5: Add Feedback Form to Time Trial + Streak Modes

**Problem:** Only classic mode shows the post-session feedback form. Time trial and streak modes skip it, losing qualitative data from ~50% of sessions.

**Files:**
- Modify: `src/scripts/game-ui.js:740-828` (renderTimeTrialSummary) and `src/scripts/game-ui.js:831-927` (renderStreakGameOver)

### Steps

- [ ] **Step 1: Add feedback form to renderTimeTrialSummary**

In `src/scripts/game-ui.js`, inside the `handleLeaderboardCheck` callback in `renderTimeTrialSummary()` (around line 781-828), add `${renderSessionFeedbackForm()}` to the template and call `attachSessionFeedbackHandlers()`.

Find the closing `</div>\n    </div>` of the summary (around line 823-824), and insert the feedback form before the final closing `</div>`:

Change the end of the template from:
```javascript
        <div style="margin-top: 24px; display: flex; gap: 12px; justify-content: center;">
          <button class="btn btn-outline" id="play-again-btn">Play Again</button>
          <a href="${base}/" class="btn btn-outline" id="change-set-btn">Change Set</a>
        </div>
      </div>
    </div>
```
to:
```javascript
        <div style="margin-top: 24px; display: flex; gap: 12px; justify-content: center;">
          <button class="btn btn-outline" id="play-again-btn">Play Again</button>
          <a href="${base}/" class="btn btn-outline" id="change-set-btn">Change Set</a>
        </div>
      </div>

      ${renderSessionFeedbackForm()}
    </div>
```

And after `attachPlayAgainHandlers();` (line 827), add:
```javascript
    attachSessionFeedbackHandlers();
```

- [ ] **Step 2: Add feedback form to renderStreakGameOver**

In `src/scripts/game-ui.js`, inside the `handleLeaderboardCheck` callback in `renderStreakGameOver()` (around line 877-926), insert the feedback form.

Find the learning card section at the end of the template (the `<div class="feedback-card miss"` block). After that closing `</div>`, add the feedback form:

Change the end of the template from:
```javascript
      <div class="feedback-card miss" style="margin-top: 16px;">
        ...
      </div>
    </div>
```
to:
```javascript
      <div class="feedback-card miss" style="margin-top: 16px;">
        ...
      </div>

      ${renderSessionFeedbackForm()}
    </div>
```

And after `attachPlayAgainHandlers();` (line 925), add:
```javascript
    attachSessionFeedbackHandlers();
```

- [ ] **Step 3: Handle the "interesting round" dropdown for non-classic modes**

The current `renderSessionFeedbackForm()` (line 1013-1043) generates round options from `session.history` with `correct_taxon.common_name`. For time trial and streak modes, the history structure is the same (SessionState.history has `correct_taxon`), so the dropdown will work without changes.

However, in time trial mode the history can have many rounds (15+). The dropdown might get long, but that's fine — it's optional.

No code changes needed for this step. Just verify that `session.history` has `correct_taxon` populated for all modes by checking `game-engine.js`.

- [ ] **Step 4: Verify build**

Run: `cd /Users/dg/lab/whats_that_bug && npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Run tests**

Run: `cd /Users/dg/lab/whats_that_bug && npm test`
Expected: All existing tests pass (the feedback form changes are UI-only, no engine logic changed).

- [ ] **Step 6: Commit**

```bash
git add src/scripts/game-ui.js
git commit -m "feat: add post-session feedback form to time trial and streak modes

Previously only classic mode showed the feedback form. Now all three modes
collect difficulty rating, interesting round, free text, and play-again intent.
Recovers qualitative data from ~50% of sessions."
```

---

## Risks & Tradeoffs

1. **Sound fatigue**: Players doing many sessions may find sounds annoying. Mitigated by the mute toggle (persistent to localStorage). All sounds are short (<300ms for UI, <500ms for celebrations).

2. **Onboarding modal fatigue**: Two modals on first visit could feel like friction. Mitigated by making both dismissible with one click, backdrop click, or Escape key. The `360ms` gap between modals matches bengaluru.rent's timing.

3. **Leaderboard timeout at 3s**: If the user's network is slow but not dead, they might miss a legitimate top-10 placement. Mitigated by the prefetch at round 8 — in most cases the data is already cached. The 3s timeout only kicks in for the initial fetch.

4. **Image flagging script depends on CSV format**: The script assumes the Google Sheets export format. If the export format changes, the script will need updating. Mitigated by supporting both flat and nested `data_json` formats.

5. **No tests for sounds/onboarding**: These are pure UI/audio modules that are hard to unit test without a DOM. Existing vitest tests cover game engine logic. Manual testing in the browser is the pragmatic approach here.

6. **Feedback form on time trial can have 15+ rounds in dropdown**: The "interesting round" dropdown could get long. This is acceptable — the field is optional and most users won't use it.
