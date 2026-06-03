# Popup Tracking + Multiplayer Nudge & Walkthrough — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full-funnel tracking to all promo popups, introduce a multiplayer nudge (homepage + post-game), and add a collapsible walkthrough to the party page.

**Architecture:** A new `logPopupEvent()` in the existing `feedback.js` enqueue pipeline records impression/cta/dismiss/snooze for every popup. A new `mp-nudge.js` module mirrors the existing `interview-prompt.js`/`support-prompt.js` shape, with pure exported eligibility functions (unit-tested) and a DOM modal (manually verified). The homepage popup chain becomes an ordered "first eligible wins" loop. The party walkthrough is static markup + a small toggle script.

**Tech Stack:** Astro, vanilla JS ES modules, Vitest, localStorage, Google Apps Script webhook (existing).

**Spec:** `docs/superpowers/specs/2026-06-03-popup-tracking-mp-nudge-design.md`

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/scripts/feedback.js` | Add `logPopupEvent()` | Modify |
| `tests/feedback.test.js` | Test `logPopupEvent` | Modify |
| `src/scripts/mp-nudge.js` | MP nudge eligibility + modal | Create |
| `tests/mp-nudge.test.js` | Test eligibility logic | Create |
| `src/scripts/interview-prompt.js` | Add tracking to interview popup | Modify |
| `src/scripts/support-prompt.js` | Add tracking + return boolean | Modify |
| `src/pages/index.astro` | Ordered popup chain | Modify |
| `src/scripts/game-ui.js` | Post-game nudge hook | Modify |
| `src/scripts/party/ui-lobby.js` | Set `wtb_mp_played` flag | Modify |
| `src/pages/party/index.astro` | Walkthrough markup + toggle | Modify |
| `src/styles/global.css` | Walkthrough + nudge icon CSS | Modify |

**localStorage keys introduced:** `wtb_mp_nudge_snoozed`, `wtb_mp_nudge_done`, `wtb_mp_nudge_impressions`, `wtb_mp_played`, `wtb_party_walkthrough_seen`.

**Event shape introduced:** `{ type: 'popup_event', popup, action, ...extra }` where `popup ∈ {interview, support, mp_nudge}`, `action ∈ {impression, cta, dismiss, snooze}`.

---

## Task 1: Add `logPopupEvent` to the feedback pipeline

**Files:**
- Modify: `src/scripts/feedback.js` (append after `logMultiplayerEvent`, ~line 361)
- Test: `tests/feedback.test.js`

- [ ] **Step 1: Write the failing tests**

Add these tests inside the `describe('feedback pipeline', ...)` block in `tests/feedback.test.js`, after the existing tests (before the closing `});` at line 169):

```js
  // ── Popup events ───────────────────────────────────────────────────────────────

  it('logPopupEvent enqueues a popup_event with popup and action', () => {
    feedback.logPopupEvent('mp_nudge', 'cta');

    // cta flushes immediately
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    const event = body.find(e => e.type === 'popup_event');
    expect(event).toBeDefined();
    expect(event.popup).toBe('mp_nudge');
    expect(event.action).toBe('cta');
  });

  it('logPopupEvent flushes on dismiss but not on impression', () => {
    vi.useFakeTimers();

    feedback.logPopupEvent('support', 'impression');
    expect(fetchSpy).not.toHaveBeenCalled(); // impression is deferred

    feedback.logPopupEvent('support', 'dismiss');
    expect(fetchSpy).toHaveBeenCalledTimes(1); // dismiss flushes both

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body).toHaveLength(2);
    expect(body[0].action).toBe('impression');
    expect(body[1].action).toBe('dismiss');
  });

  it('logPopupEvent merges extra fields', () => {
    feedback.logPopupEvent('interview', 'cta', { surface: 'homepage' });

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    const event = body.find(e => e.type === 'popup_event');
    expect(event.surface).toBe('homepage');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/feedback.test.js`
Expected: FAIL — `feedback.logPopupEvent is not a function`.

- [ ] **Step 3: Implement `logPopupEvent`**

Append to `src/scripts/feedback.js` (after `logMultiplayerEvent`, end of file):

```js

/**
 * Log a promotional popup lifecycle event.
 * popup: 'interview' | 'support' | 'mp_nudge'
 * action: 'impression' | 'cta' | 'dismiss' | 'snooze'
 * Flush on terminal actions (cta/dismiss) so outcomes survive navigation.
 */
export function logPopupEvent(popup, action, extra = {}) {
  enqueue({
    type: 'popup_event',
    popup,
    action,
    ...extra,
  });
  if (action === 'cta' || action === 'dismiss') flush();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/feedback.test.js`
Expected: PASS (all popup_event tests green, existing tests still green).

- [ ] **Step 5: Commit**

```bash
git add src/scripts/feedback.js tests/feedback.test.js
git commit -m "feat: add logPopupEvent for full-funnel popup tracking"
```

---

## Task 2: Create `mp-nudge.js` with eligibility logic

**Files:**
- Create: `src/scripts/mp-nudge.js`
- Test: `tests/mp-nudge.test.js`

This task creates the module with pure, exported eligibility functions and the DOM modal. The eligibility functions are unit-tested; the modal is verified manually in Task 5.

- [ ] **Step 1: Write the failing tests**

Create `tests/mp-nudge.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';

// localStorage mock backed by a plain object
const store = {};
const localStorageMock = {
  getItem: vi.fn(k => (k in store ? store[k] : null)),
  setItem: vi.fn((k, v) => { store[k] = String(v); }),
  removeItem: vi.fn(k => { delete store[k]; }),
};
vi.stubGlobal('localStorage', localStorageMock);

import { shouldShowHomepage, shouldShowPostGame } from '../src/scripts/mp-nudge.js';

const DAY = 86400000;

function setStats({ sessions = 0, days = 0 } = {}) {
  store['wtb_player_stats'] = JSON.stringify({
    session_count: sessions,
    play_dates: Array.from({ length: days }, (_, i) => `2026-06-0${i + 1}`),
  });
}

describe('mp-nudge eligibility', () => {
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
  });

  // ── Homepage ────────────────────────────────────────────────────────────────

  it('homepage: eligible at 3 sessions / 2 days, fresh state', () => {
    setStats({ sessions: 3, days: 2 });
    expect(shouldShowHomepage()).toBe(true);
  });

  it('homepage: not eligible below session threshold', () => {
    setStats({ sessions: 2, days: 2 });
    expect(shouldShowHomepage()).toBe(false);
  });

  it('homepage: not eligible below play-days threshold', () => {
    setStats({ sessions: 5, days: 1 });
    expect(shouldShowHomepage()).toBe(false);
  });

  it('homepage: suppressed once multiplayer played', () => {
    setStats({ sessions: 5, days: 3 });
    store['wtb_mp_played'] = '1';
    expect(shouldShowHomepage()).toBe(false);
  });

  it('homepage: suppressed when done', () => {
    setStats({ sessions: 5, days: 3 });
    store['wtb_mp_nudge_done'] = '1';
    expect(shouldShowHomepage()).toBe(false);
  });

  it('homepage: suppressed at impression cap', () => {
    setStats({ sessions: 5, days: 3 });
    store['wtb_mp_nudge_impressions'] = '2';
    expect(shouldShowHomepage()).toBe(false);
  });

  it('homepage: suppressed within 30-day snooze, eligible after', () => {
    setStats({ sessions: 5, days: 3 });
    store['wtb_mp_nudge_snoozed'] = String(Date.now() - 10 * DAY);
    expect(shouldShowHomepage()).toBe(false);

    store['wtb_mp_nudge_snoozed'] = String(Date.now() - 31 * DAY);
    expect(shouldShowHomepage()).toBe(true);
  });

  // ── Post-game ─────────────────────────────────────────────────────────────────

  it('post-game: eligible at 2 sessions, fresh state', () => {
    setStats({ sessions: 2, days: 1 });
    expect(shouldShowPostGame()).toBe(true);
  });

  it('post-game: not eligible below 2 sessions', () => {
    setStats({ sessions: 1, days: 1 });
    expect(shouldShowPostGame()).toBe(false);
  });

  it('post-game: uses a 7-day snooze window', () => {
    setStats({ sessions: 5, days: 1 });
    store['wtb_mp_nudge_snoozed'] = String(Date.now() - 3 * DAY);
    expect(shouldShowPostGame()).toBe(false);

    store['wtb_mp_nudge_snoozed'] = String(Date.now() - 8 * DAY);
    expect(shouldShowPostGame()).toBe(true);
  });

  it('post-game: shares the played + cap guards', () => {
    setStats({ sessions: 5, days: 1 });
    store['wtb_mp_played'] = '1';
    expect(shouldShowPostGame()).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/mp-nudge.test.js`
Expected: FAIL — cannot resolve `../src/scripts/mp-nudge.js`.

- [ ] **Step 3: Implement `mp-nudge.js`**

Create `src/scripts/mp-nudge.js`:

```js
/**
 * Multiplayer nudge prompt.
 * Encourages returning solo players to invite friends.
 * Shown on the homepage and after a solo game ends.
 * Suppressed once the player has actually entered a party room.
 * Uses the same overlay pattern as support-prompt.js / interview-prompt.js.
 */

import { logPopupEvent } from './feedback.js';

const STATS_KEY = 'wtb_player_stats';
const SNOOZE_KEY = 'wtb_mp_nudge_snoozed';
const DONE_KEY = 'wtb_mp_nudge_done';
const IMPRESSIONS_KEY = 'wtb_mp_nudge_impressions';
const PLAYED_KEY = 'wtb_mp_played';

const MAX_IMPRESSIONS = 2;
const HOME_SNOOZE_DAYS = 30;
const POSTGAME_SNOOZE_DAYS = 7;
const HOME_MIN_SESSIONS = 3;
const HOME_MIN_PLAY_DAYS = 2;
const POSTGAME_MIN_SESSIONS = 2;

function getStats() {
  try { return JSON.parse(localStorage.getItem(STATS_KEY) || '{}'); }
  catch { return {}; }
}

function getImpressions() {
  try { return parseInt(localStorage.getItem(IMPRESSIONS_KEY) || '0', 10); }
  catch { return 0; }
}

function isDone() {
  try { return localStorage.getItem(DONE_KEY) === '1'; } catch { return false; }
}

function hasPlayedMp() {
  try { return localStorage.getItem(PLAYED_KEY) === '1'; } catch { return false; }
}

function getPlayDayCount(stats) {
  return Array.isArray(stats.play_dates) ? stats.play_dates.length : 0;
}

function notSnoozed(days) {
  try {
    const snoozed = localStorage.getItem(SNOOZE_KEY);
    if (!snoozed) return true;
    return Date.now() - parseInt(snoozed, 10) >= days * 86400000;
  } catch {
    return false;
  }
}

function sharedGuardsPass() {
  if (isDone()) return false;
  if (hasPlayedMp()) return false;
  if (getImpressions() >= MAX_IMPRESSIONS) return false;
  return true;
}

export function shouldShowHomepage() {
  try {
    if (!sharedGuardsPass()) return false;
    const stats = getStats();
    if ((stats.session_count || 0) < HOME_MIN_SESSIONS) return false;
    if (getPlayDayCount(stats) < HOME_MIN_PLAY_DAYS) return false;
    return notSnoozed(HOME_SNOOZE_DAYS);
  } catch {
    return false;
  }
}

export function shouldShowPostGame() {
  try {
    if (!sharedGuardsPass()) return false;
    const stats = getStats();
    if ((stats.session_count || 0) < POSTGAME_MIN_SESSIONS) return false;
    return notSnoozed(POSTGAME_SNOOZE_DAYS);
  } catch {
    return false;
  }
}

function recordImpression() {
  try { localStorage.setItem(IMPRESSIONS_KEY, String(getImpressions() + 1)); } catch {}
}

function snooze() {
  try { localStorage.setItem(SNOOZE_KEY, Date.now().toString()); } catch {}
}

function markDone() {
  try { localStorage.setItem(DONE_KEY, '1'); } catch {}
}

function createModal(surface) {
  const base = (typeof window !== 'undefined' && window.__BASE) || '';
  const overlay = document.createElement('div');
  overlay.className = 'onboarding-overlay';
  overlay.innerHTML = `
    <div class="onboarding-card support-card">
      <div class="support-hero"><span class="mp-nudge-emoji">🎉</span></div>
      <h2 class="onboarding-title">Bugs are better with friends</h2>
      <p class="onboarding-text">
        You've been playing solo for a while — why not race a friend?
        Create a private room, share a 4-letter code, and see who knows their bugs best.
      </p>
      <a href="${base}/party" class="btn btn-primary onboarding-cta mp-nudge-cta">Start a room</a>
      <button class="support-dismiss mp-nudge-dismiss">Maybe later</button>
    </div>`;

  document.body.appendChild(overlay);
  recordImpression();
  logPopupEvent('mp_nudge', 'impression', { surface });
  requestAnimationFrame(() => overlay.classList.add('visible'));

  let closed = false;
  const close = (action) => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    if (action === 'cta') { markDone(); } else { snooze(); }
    logPopupEvent('mp_nudge', action, { surface });
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 340);
  };

  const onKey = (e) => { if (e.key === 'Escape') close('snooze'); };

  overlay.addEventListener('click', (e) => { if (e.target === overlay) close('snooze'); });
  document.addEventListener('keydown', onKey);
  overlay.querySelector('.mp-nudge-dismiss')?.addEventListener('click', () => close('dismiss'));
  // CTA is an <a> that navigates to /party; mark done + log before navigation proceeds.
  overlay.querySelector('.mp-nudge-cta')?.addEventListener('click', () => close('cta'));
}

/**
 * Homepage nudge. Returns true when it claims the visit (so the popup chain stops).
 */
export function maybeShowMpNudge() {
  if (!shouldShowHomepage()) return false;
  setTimeout(() => createModal('homepage'), 800);
  return true;
}

/**
 * Post-game nudge. Shown after a solo session summary renders.
 */
export function maybeShowMpNudgePostGame() {
  if (!shouldShowPostGame()) return;
  setTimeout(() => createModal('post_game'), 800);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/mp-nudge.test.js`
Expected: PASS (all eligibility tests green).

- [ ] **Step 5: Commit**

```bash
git add src/scripts/mp-nudge.js tests/mp-nudge.test.js
git commit -m "feat: add multiplayer nudge module with eligibility logic"
```

---

## Task 3: Add the nudge emoji CSS

**Files:**
- Modify: `src/styles/global.css` (after the `.support-hero` rule, ~line 1814)

- [ ] **Step 1: Add the CSS rule**

Insert after the `.support-hero { ... }` block in `src/styles/global.css`:

```css
.mp-nudge-emoji {
  font-size: 40px;
  line-height: 1;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/styles/global.css
git commit -m "style: add multiplayer nudge emoji icon"
```

---

## Task 4: Make `maybeShowSupportPrompt` return a boolean + wire the homepage chain

**Files:**
- Modify: `src/scripts/support-prompt.js:142-150`
- Modify: `src/pages/index.astro:270-276`

- [ ] **Step 1: Make `maybeShowSupportPrompt` return a boolean**

Replace the body of `maybeShowSupportPrompt` in `src/scripts/support-prompt.js` (lines 142-150):

```js
export function maybeShowSupportPrompt() {
  if (!shouldShow()) return false;
  if (getSessionCount() < 10) return false;

  // Small delay so it doesn't collide with onboarding
  setTimeout(() => {
    isDonor() ? showReturningDonorPrompt() : showFirstTimePrompt();
  }, 800);
  return true;
}
```

- [ ] **Step 2: Replace the homepage popup chain**

In `src/pages/index.astro`, replace the script block at lines 270-276:

```astro
<script>
  import { runOnboarding } from '../scripts/onboarding.js';
  import { maybeShowMpNudge } from '../scripts/mp-nudge.js';
  import { maybeShowInterviewPrompt } from '../scripts/interview-prompt.js';
  import { maybeShowSupportPrompt } from '../scripts/support-prompt.js';
  runOnboarding();
  // One popup per visit, fixed priority: nudge → interview → support.
  for (const show of [maybeShowMpNudge, maybeShowInterviewPrompt, maybeShowSupportPrompt]) {
    if (show()) break;
  }
</script>
```

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build`
Expected: Build succeeds with no import or syntax errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, open the homepage. With fresh localStorage and `wtb_player_stats` set to `{"session_count":3,"play_dates":["2026-06-01","2026-06-02"]}` (set via devtools console: `localStorage.setItem('wtb_player_stats', JSON.stringify({session_count:3,play_dates:['2026-06-01','2026-06-02']}))` then reload), confirm the "Bugs are better with friends" modal appears after ~800ms and the interview/support popups do NOT also appear. Check the Network tab for a `popup_event` POST with `action:"impression"`.

- [ ] **Step 5: Commit**

```bash
git add src/scripts/support-prompt.js src/pages/index.astro
git commit -m "feat: wire mp nudge into homepage popup chain (nudge first)"
```

---

## Task 5: Hook the post-game nudge into the three summary screens

**Files:**
- Modify: `src/scripts/game-ui.js` (import + end of `renderClassicSummary`, `renderTimeTrialSummary`, `renderStreakGameOver`)

The three summary render functions end with an achievements toast loop. Add the nudge call at the very end of each so it appears after the summary settles.

- [ ] **Step 1: Add the import**

In `src/scripts/game-ui.js`, add near the other script imports (the feedback import is at line 9):

```js
import { maybeShowMpNudgePostGame } from './mp-nudge.js';
```

- [ ] **Step 2: Call at the end of `renderClassicSummary`**

At the end of `renderClassicSummary` (after the achievements block that closes at line ~961), add as the last statement inside the function, before its closing `}`:

```js
  maybeShowMpNudgePostGame();
```

- [ ] **Step 3: Call at the end of `renderTimeTrialSummary`**

Add `maybeShowMpNudgePostGame();` as the last statement inside `renderTimeTrialSummary`, before its closing `}` (the function whose achievements block mirrors the classic one).

- [ ] **Step 4: Call at the end of `renderStreakGameOver`**

Add `maybeShowMpNudgePostGame();` as the last statement inside `renderStreakGameOver`, before its closing `}`.

- [ ] **Step 5: Verify the build compiles**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 6: Manual verification**

Run `npm run dev`, set `wtb_player_stats` to `{"session_count":2,"play_dates":["2026-06-01"]}`, clear `wtb_mp_played`/`wtb_mp_nudge_*`, play a short classic game to the summary screen, and confirm the nudge appears after the summary with a `popup_event` `impression` (surface `post_game`) in the Network tab. Dismiss it, finish another game immediately, and confirm it does NOT reappear (7-day post-game snooze).

- [ ] **Step 7: Commit**

```bash
git add src/scripts/game-ui.js
git commit -m "feat: show mp nudge after solo game summary screens"
```

---

## Task 6: Set the `wtb_mp_played` flag when a player joins a room

**Files:**
- Modify: `src/scripts/party/ui-lobby.js:48-53` (inside the `identified` message handler)

- [ ] **Step 1: Set the flag on join**

In `src/scripts/party/ui-lobby.js`, inside the `if (msg.type === 'identified')` block, right after the existing `logMultiplayerEvent('mp_player_joined', {...})` call (line 48-53), add:

```js
        try { localStorage.setItem('wtb_mp_played', '1'); } catch {}
```

- [ ] **Step 2: Verify the build compiles**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Manual verification**

Run `npm run dev`, create a party room and enter it. In devtools, confirm `localStorage.getItem('wtb_mp_played') === '1'`. Then return to the homepage with otherwise-eligible stats and confirm the nudge no longer appears.

- [ ] **Step 4: Commit**

```bash
git add src/scripts/party/ui-lobby.js
git commit -m "feat: mark wtb_mp_played once a player joins a party room"
```

---

## Task 7: Add tracking to the interview popup

**Files:**
- Modify: `src/scripts/interview-prompt.js` (import, `recordImpression`, `createModal` close logic)

The interview `close(done)` currently takes a boolean. Change it to take an explicit action so impression/cta/dismiss/snooze are distinguishable, preserving the existing `markDone()`/`snooze()` behavior.

- [ ] **Step 1: Add the import**

At the top of `src/scripts/interview-prompt.js`, add:

```js
import { logPopupEvent } from './feedback.js';
```

- [ ] **Step 2: Log the impression**

In `recordImpression()` (line 58-60), add the log call:

```js
function recordImpression() {
  try { localStorage.setItem(IMPRESSIONS_KEY, String(getImpressions() + 1)); } catch {}
  logPopupEvent('interview', 'impression');
}
```

- [ ] **Step 3: Convert `close` to an action-based signature**

In `createModal()`, replace the `close` function and its call sites (lines 122-146). The current code:

```js
  let closed = false;
  const close = (done) => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    done ? markDone() : snooze();
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 340);
  };

  const onKey = (e) => {
    if (e.key === 'Escape') close(false);
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close(false);
  });
  document.addEventListener('keydown', onKey);
  overlay.querySelector('.interview-close')?.addEventListener('click', () => close(false));
  overlay.querySelectorAll('.interview-primary, .interview-secondary').forEach(link => {
    link.addEventListener('click', () => close(true));
  });
  overlay.querySelectorAll('.interview-dismiss').forEach(button => {
    button.addEventListener('click', () => close(true));
  });
```

becomes:

```js
  let closed = false;
  // action: 'cta' (link clicked) | 'dismiss' (No thanks) | 'snooze' (×/Esc/backdrop)
  const close = (action) => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    action === 'snooze' ? snooze() : markDone();
    logPopupEvent('interview', action);
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 340);
  };

  const onKey = (e) => {
    if (e.key === 'Escape') close('snooze');
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close('snooze');
  });
  document.addEventListener('keydown', onKey);
  overlay.querySelector('.interview-close')?.addEventListener('click', () => close('snooze'));
  overlay.querySelectorAll('.interview-primary, .interview-secondary').forEach(link => {
    link.addEventListener('click', () => close('cta'));
  });
  overlay.querySelectorAll('.interview-dismiss').forEach(button => {
    button.addEventListener('click', () => close('dismiss'));
  });
```

Note: this preserves the original behavior — the × button, Esc, and backdrop now `snooze` (previously they marked done via `close(false)` → `snooze()`; behavior is identical since `close(false)` already called `snooze()`). The "No thanks" dismiss and CTA links still `markDone()`.

- [ ] **Step 4: Verify the build compiles**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Manual verification**

Run `npm run dev`, force the interview popup (set `wtb_player_stats` to `{"session_count":5,"play_dates":["2026-06-01","2026-06-02","2026-06-03"]}`, clear `wtb_interview_*` and `wtb_mp_*`). Confirm an `impression` fires on show, `snooze` on Esc/backdrop, `cta` on Schedule/Email, and `dismiss` on "No thanks" — each visible as a `popup_event` POST.

- [ ] **Step 6: Commit**

```bash
git add src/scripts/interview-prompt.js
git commit -m "feat: track interview popup impression and outcomes"
```

---

## Task 8: Add tracking to the support popup

**Files:**
- Modify: `src/scripts/support-prompt.js` (import, `createModal` lines 71-99)

The support `createModal` treats every close as `snooze`. Add impression logging on open, `cta` on the Ko-fi click, `dismiss` on the explicit button, and `snooze` on Esc/backdrop — without changing the existing localStorage snooze behavior.

- [ ] **Step 1: Add the import**

At the top of `src/scripts/support-prompt.js`, add:

```js
import { logPopupEvent } from './feedback.js';
```

- [ ] **Step 2: Update `createModal`**

Replace `createModal` (lines 71-99) with:

```js
function createModal(content) {
  const overlay = document.createElement('div');
  overlay.className = 'onboarding-overlay';
  overlay.innerHTML = `<div class="onboarding-card support-card">${content}</div>`;

  document.body.appendChild(overlay);
  logPopupEvent('support', 'impression');
  requestAnimationFrame(() => overlay.classList.add('visible'));

  let closed = false;
  const dismiss = (action) => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    snooze();
    logPopupEvent('support', action);
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 340);
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) dismiss('snooze');
  });

  const onKey = (e) => {
    if (e.key === 'Escape') dismiss('snooze');
  };
  document.addEventListener('keydown', onKey);

  overlay.querySelector('.support-cta')?.addEventListener('click', () => {
    markDonor();
    logPopupEvent('support', 'cta');
  });
  overlay.querySelector('.support-dismiss')?.addEventListener('click', () => dismiss('dismiss'));
}
```

Note: `.support-cta` is an `<a>` that navigates to Ko-fi; `markDonor()` + the `cta` log run before navigation. The `dismiss()` guard (`closed`) prevents a double-log if Esc fires during close animation. `snooze()` still runs on every close path, matching current behavior.

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Manual verification**

Run `npm run dev`, set `wtb_player_stats` to `{"session_count":10,"play_dates":["2026-06-01"]}` and clear `wtb_support_*` + `wtb_mp_*` + `wtb_interview_*`. Confirm the support modal shows with an `impression`, the "Buy me a coffee" link logs `cta`, "Maybe later" logs `dismiss`, and Esc/backdrop log `snooze`.

- [ ] **Step 5: Commit**

```bash
git add src/scripts/support-prompt.js
git commit -m "feat: track support popup impression and outcomes"
```

---

## Task 9: Add the collapsible party walkthrough

**Files:**
- Modify: `src/pages/party/index.astro` (markup in `#party-landing-view` + toggle script)
- Modify: `src/styles/global.css` (walkthrough styles)

- [ ] **Step 1: Add the walkthrough markup**

In `src/pages/party/index.astro`, inside `#party-landing-view`, between the `.party-hero-card` section (closes at line 14) and the `.party-landing-grid` div (line 16), insert:

```astro
      <section class="party-walkthrough" id="party-walkthrough">
        <button class="party-wt-toggle" id="party-wt-toggle" type="button" aria-expanded="true" aria-controls="party-wt-steps">
          <span>How multiplayer works</span>
          <span class="party-wt-chev" aria-hidden="true">▾</span>
        </button>
        <ol class="party-wt-steps" id="party-wt-steps">
          <li><span class="party-wt-num">1</span><div><strong>Create</strong><p>Tap Create Room for a 4-character code.</p></div></li>
          <li><span class="party-wt-num">2</span><div><strong>Share</strong><p>Send the code or link to your friends.</p></div></li>
          <li><span class="party-wt-num">3</span><div><strong>Join</strong><p>They enter the code and pick a name.</p></div></li>
          <li><span class="party-wt-num">4</span><div><strong>Play</strong><p>Everyone races the same bugs on a live leaderboard.</p></div></li>
        </ol>
      </section>
```

- [ ] **Step 2: Add the toggle script**

In the `<script>` block of `src/pages/party/index.astro`, after the `logMultiplayerEvent('mp_landing', {...})` call (line 53-56), add:

```js
    // --- Walkthrough: expanded on first visit, collapsed on return ---
    const WT_KEY = 'wtb_party_walkthrough_seen';
    const wt = document.getElementById('party-walkthrough');
    const wtToggle = document.getElementById('party-wt-toggle');
    if (wt && wtToggle) {
      let seen = false;
      try { seen = localStorage.getItem(WT_KEY) === '1'; } catch {}
      if (seen) {
        wt.classList.add('collapsed');
        wtToggle.setAttribute('aria-expanded', 'false');
      } else {
        try { localStorage.setItem(WT_KEY, '1'); } catch {}
      }
      wtToggle.addEventListener('click', () => {
        const collapsed = wt.classList.toggle('collapsed');
        wtToggle.setAttribute('aria-expanded', String(!collapsed));
      });
    }
```

- [ ] **Step 3: Add the walkthrough CSS**

Append to `src/styles/global.css`:

```css
/* --- Party walkthrough --- */
.party-walkthrough {
  background: var(--card, #fff);
  border: 1px solid var(--border, #e7ded5);
  border-radius: 12px;
  padding: 14px 16px;
  margin-bottom: 16px;
}
.party-wt-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  font-weight: 600;
  color: var(--text);
  cursor: pointer;
}
.party-wt-chev {
  color: var(--accent);
  transition: transform 0.2s ease;
}
.party-walkthrough.collapsed .party-wt-chev {
  transform: rotate(-90deg);
}
.party-wt-steps {
  list-style: none;
  margin: 14px 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}
.party-walkthrough.collapsed .party-wt-steps {
  display: none;
}
.party-wt-steps li {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.party-wt-num {
  width: 26px;
  height: 26px;
  line-height: 26px;
  text-align: center;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  font-weight: 700;
  font-size: 0.85rem;
}
.party-wt-steps strong {
  font-size: 0.92rem;
}
.party-wt-steps p {
  margin: 2px 0 0;
  font-size: 0.8rem;
  color: var(--muted, #7a6f66);
  line-height: 1.35;
}
@media (max-width: 560px) {
  .party-wt-steps {
    grid-template-columns: 1fr 1fr;
  }
}
```

- [ ] **Step 4: Verify the build compiles**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Manual verification**

Run `npm run dev`, clear `wtb_party_walkthrough_seen`, open `/party`. Confirm the 4 steps are expanded on first load. Reload — confirm it's collapsed to the one-line bar, and clicking the bar expands/collapses it. Resize below 560px — confirm steps reflow to two columns.

- [ ] **Step 6: Commit**

```bash
git add src/pages/party/index.astro src/styles/global.css
git commit -m "feat: add collapsible how-it-works walkthrough to party page"
```

---

## Final verification

- [ ] **Run the full test suite**

Run: `npx vitest run`
Expected: All tests pass (existing + new `feedback`/`mp-nudge` tests).

- [ ] **Production build**

Run: `npm run build`
Expected: Build succeeds with no errors.

---

## Self-Review notes (covered by this plan)

- **Spec §1 full-funnel tracking** → Tasks 1, 7, 8 (interview/support) and Task 2 (mp_nudge logs impression/cta/dismiss/snooze).
- **Spec §2 mp nudge homepage + post-game** → Tasks 2, 4, 5; `wtb_mp_played` suppression → Task 6.
- **Spec §3 orchestration (nudge→interview→support, support returns boolean)** → Task 4.
- **Spec §4 collapsible walkthrough** → Task 9.
- **Naming consistency:** `shouldShowHomepage`/`shouldShowPostGame`, `maybeShowMpNudge`/`maybeShowMpNudgePostGame`, `logPopupEvent`, and the five localStorage keys are used identically across all tasks.
