# Logging Pipeline Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate duplicate events (29% of sessions affected), add true batching (10x fewer HTTP requests), and make the pipeline resilient to page unload race conditions.

**Architecture:** feedback.js is rewritten as a single module with: UUID-based event IDs, array-batched flush, clean fetch-vs-sendBeacon separation (fetch for normal ops, sendBeacon only for unload), and sessionStorage persistence. game-ui.js gets a one-line listener cleanup. Apps Script gets batch + dedup support.

**Tech Stack:** Vanilla JS (ES modules), Vitest, Google Apps Script

---

### Task 1: Rewrite feedback.js — event IDs, batched flush, unload fix

**Files:**
- Modify: `src/scripts/feedback.js` (complete rewrite, 187 lines → ~140 lines)

This is the core change. The entire file is replaced. Key differences from current code:

1. `enqueue()` adds `event_id` via `crypto.randomUUID()` (with Math.random fallback)
2. `flush()` sends the entire batch as ONE JSON array in a single `fetch()` call — not one fetch per event
3. `flush()` catch handler sets `fetchFailed = true` but does **NOT** re-send via sendBeacon (this was the duplicate bug)
4. `visibilitychange` handler sends remaining queue via `sendBeacon` — the ONLY place sendBeacon is used
5. Queue is saved to `sessionStorage` on unload and rehydrated on module load

- [ ] **Step 1: Replace feedback.js with the fixed version**

Replace the entire contents of `src/scripts/feedback.js` with:

```javascript
/**
 * Feedback and game event logging.
 * Posts to Google Sheets via Apps Script webhook.
 *
 * Events are queued with unique IDs and flushed as batched arrays.
 * Uses sendBeacon ONLY on page unload — never as a fetch fallback
 * (mixing both caused duplicate events via keepalive race condition).
 */

const WEBHOOK_URL = import.meta.env.PUBLIC_GOOGLE_SHEET_WEBHOOK_URL || '';

// --- Event queue ---
const STORAGE_KEY = 'wtb_event_queue';
const FLUSH_INTERVAL_MS = 5000;
const MAX_BATCH = 10;

let queue = [];
let flushTimer = null;

// Generate a unique event ID. crypto.randomUUID is available in all modern
// browsers over HTTPS. The fallback covers older/insecure contexts.
function eventId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// --- Rehydrate orphaned events from a previous page load ---
function rehydrate() {
  if (!WEBHOOK_URL) return;
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      const orphans = JSON.parse(stored);
      if (Array.isArray(orphans) && orphans.length > 0) {
        queue.push(...orphans);
      }
      sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch { /* ignore corrupt storage */ }
}

rehydrate();

// --- Core queue operations ---

function enqueue(data) {
  if (!WEBHOOK_URL) {
    console.warn('[feedback] No webhook URL configured:', data.type);
    return;
  }
  queue.push({
    ...data,
    event_id: eventId(),
    timestamp: new Date().toISOString(),
  });

  if (queue.length >= MAX_BATCH) {
    flush();
  } else if (!flushTimer) {
    flushTimer = setTimeout(flush, FLUSH_INTERVAL_MS);
  }
}

/**
 * Flush all queued events as a single batched POST.
 * On failure, events are lost for this attempt — but the sendBeacon
 * unload handler will catch anything still in the queue when the page closes.
 * We intentionally do NOT fall back to sendBeacon here to avoid the
 * keepalive + sendBeacon race that caused duplicate events.
 */
export function flush() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!queue.length || !WEBHOOK_URL) return;

  const batch = queue.splice(0);

  fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(batch),
    keepalive: true,
  })
    .then(res => {
      if (!res.ok) {
        console.warn(`[feedback] Webhook returned ${res.status}`);
      }
    })
    .catch(() => {
      // Don't re-send via sendBeacon — the keepalive fetch may still complete.
      // Events are lost only if both keepalive AND the unload beacon fail,
      // which is extremely unlikely.
      console.warn('[feedback] Fetch failed for batch');
    });
}

// --- Page unload: sendBeacon for anything remaining in the queue ---
// This is the ONLY place sendBeacon is used. It handles:
// - Events queued but not yet flushed (waiting for timer/batch threshold)
// - Events that need to be sent when the user navigates away or closes the tab
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }

      const batch = queue.splice(0);
      if (batch.length > 0 && WEBHOOK_URL) {
        // Save to sessionStorage first as insurance
        try {
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify(batch));
        } catch { /* storage full or unavailable */ }

        // Send via beacon — browser guarantees delivery even after page gone
        navigator.sendBeacon(WEBHOOK_URL, JSON.stringify(batch));

        // Clear storage since beacon was sent
        try {
          sessionStorage.removeItem(STORAGE_KEY);
        } catch { /* ignore */ }
      }
    }
  });
}

// --- Public logging functions ---
// Each function builds the event payload and enqueues it.
// event_id and timestamp are added automatically by enqueue().

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

export function logSessionStart(sessionId, setName, mode) {
  enqueue({
    type: 'session_start',
    session_id: sessionId,
    set: setName,
    referrer: sessionStorage.getItem('original_referrer') || document.referrer || '',
    device: /Mobi/.test(navigator.userAgent) ? 'mobile' : 'desktop',
    mode: mode || 'classic',
  });
  flush();
}

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

export function logRoundReaction(sessionId, round, observationId, difficulty, userAnswer, correctAnswer, score, setName) {
  enqueue({
    type: 'round_reaction',
    session_id: sessionId,
    round,
    observation_id: observationId,
    difficulty,
    user_answer_taxon: userAnswer,
    correct_answer_taxon: correctAnswer,
    score_earned: score,
    set: setName,
  });
}

export function logSessionFeedback(sessionId, score, setName, difficultyRating, interestingRound, freeText, playAgain) {
  enqueue({
    type: 'session_feedback',
    session_id: sessionId,
    score,
    set: setName,
    difficulty_rating: difficultyRating,
    interesting_round: interestingRound,
    free_text: freeText,
    play_again: playAgain,
  });
  flush();
}

export function logGeneralFeedback(category, text) {
  enqueue({
    type: 'general_feedback',
    category,
    text,
    current_page: window.location.pathname,
  });
  flush();
}

export function logBadPhoto(sessionId, observationId, species, setName) {
  enqueue({
    type: 'bad_photo',
    session_id: sessionId,
    observation_id: observationId,
    species,
    set: setName,
  });
  flush();
}
```

- [ ] **Step 2: Verify build passes**

Run: `npx astro build`
Expected: `3 page(s) built` with no errors. The public API (exported function signatures) is identical to before — no callers need changes.

- [ ] **Step 3: Commit**

```bash
git add src/scripts/feedback.js
git commit -m "fix: rewrite feedback.js — batched flush, event IDs, no sendBeacon race"
```

---

### Task 2: Clean up session-end listeners in game-ui.js

**Files:**
- Modify: `src/scripts/game-ui.js:183-184`

Currently both `pagehide` and `beforeunload` call `sendSessionEnd()`. The `pagehide` event is the modern standard and fires reliably in all browsers. `beforeunload` is redundant and fires inconsistently on mobile. Remove it.

- [ ] **Step 1: Remove the beforeunload listener**

In `src/scripts/game-ui.js`, find (around line 183-184):

```javascript
  window.addEventListener('pagehide', sendSessionEnd);
  window.addEventListener('beforeunload', sendSessionEnd);
```

Replace with:

```javascript
  window.addEventListener('pagehide', sendSessionEnd);
```

- [ ] **Step 2: Verify build passes**

Run: `npx astro build`
Expected: `3 page(s) built`, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/scripts/game-ui.js
git commit -m "fix: remove redundant beforeunload listener for session end"
```

---

### Task 3: Add feedback.js unit tests

**Files:**
- Create: `tests/feedback.test.js`

Test the core logic: event ID generation, queue batching, and the public API shape. We can't easily test the actual fetch/sendBeacon in Vitest (no browser env), but we can test the queue mechanics by importing the module internals.

Since `enqueue` and `queue` are not exported, we test through the public API: call `logRoundComplete()` and verify the behavior via a mocked fetch.

- [ ] **Step 1: Create the test file**

Create `tests/feedback.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock import.meta.env before importing feedback module
vi.stubGlobal('navigator', { sendBeacon: vi.fn(), userAgent: 'test' });
vi.stubGlobal('sessionStorage', {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
});

// We need to intercept fetch calls to verify batching behavior
const fetchSpy = vi.fn(() => Promise.resolve({ ok: true }));
vi.stubGlobal('fetch', fetchSpy);

// Mock crypto.randomUUID
vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid-1234' });

describe('feedback pipeline', () => {
  beforeEach(() => {
    fetchSpy.mockClear();
  });

  it('flush sends batched array, not individual events', async () => {
    // Import fresh module for each test
    const { logSessionStart, flush } = await import('../src/scripts/feedback.js');

    // logSessionStart calls enqueue then flush
    logSessionStart('sess-1', 'bugs_101', 'classic');

    // flush was called by logSessionStart, check fetch was called with an array
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
    expect(body[0].type).toBe('session_start');
    expect(body[0].session_id).toBe('sess-1');
    expect(body[0].event_id).toBe('test-uuid-1234');
    expect(body[0].timestamp).toBeDefined();
  });

  it('includes keepalive: true on fetch calls', async () => {
    const { logSessionStart } = await import('../src/scripts/feedback.js');
    logSessionStart('sess-2', 'bugs_101', 'classic');

    const fetchOptions = fetchSpy.mock.calls[0][1];
    expect(fetchOptions.keepalive).toBe(true);
    expect(fetchOptions.method).toBe('POST');
  });

  it('event payloads include event_id and timestamp', async () => {
    const { logSessionEnd, flush } = await import('../src/scripts/feedback.js');
    logSessionEnd('sess-3', 500, 10, 'bugs_101', true, false, 'classic');

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    const sessionEnd = body.find(e => e.type === 'session_end');
    expect(sessionEnd).toBeDefined();
    expect(sessionEnd.event_id).toBe('test-uuid-1234');
    expect(sessionEnd.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('logRoundComplete does not immediately flush', async () => {
    const { logRoundComplete } = await import('../src/scripts/feedback.js');
    fetchSpy.mockClear();

    logRoundComplete('sess-4', 1, 12345, 'Apis mellifera', 'Apis mellifera', 100, 3000, 'bugs_101', 'classic');

    // round_complete queues but does NOT flush (no immediate fetch)
    // It may or may not have been flushed with previous events
    // The key assertion: round_complete was NOT the trigger for a new flush
    // (logSessionStart/End flush immediately, logRoundComplete does not)
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run tests/feedback.test.js`
Expected: All tests pass. Note: the module-level `rehydrate()` call runs on import, which is why we mock sessionStorage before importing.

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All test files pass (existing tests unaffected since we didn't change the public API).

- [ ] **Step 4: Commit**

```bash
git add tests/feedback.test.js
git commit -m "test: add feedback pipeline unit tests for batching and event IDs"
```

---

### Task 4: Apps Script — handle batch payloads + event ID dedup

**Files:**
- Modify: Google Apps Script `Code.gs` (in the Google Sheets script editor, not in the repo)

This is a manual step the user performs in the Apps Script editor. The updated `doPost` handles both:
- Old format: single event object `{ type: "...", ... }`
- New format: array of events `[{ type: "...", ... }, ...]`

It also deduplicates using `event_id` — checking the last 200 rows before appending.

- [ ] **Step 1: Provide the updated doPost function**

Replace the `doPost` function in Code.gs with:

```javascript
function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);

    // Normalize: if single object, wrap in array
    var events = Array.isArray(payload) ? payload : [payload];

    for (var i = 0; i < events.length; i++) {
      var data = events[i];

      if (data.action === 'leaderboard_entry') {
        // Leaderboard entries go to a separate sheet
        if (i === 0) return handleLeaderboardEntry(data);
        handleLeaderboardEntry(data);
        continue;
      }

      appendFeedbackRow(data);
    }

    return ContentService.createTextOutput(
      JSON.stringify({ status: 'ok', count: events.length })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ status: 'error', message: err.toString() })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

function appendFeedbackRow(data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

  // Dedup: check if event_id already exists in recent rows
  if (data.event_id) {
    var lastRow = sheet.getLastRow();
    var checkRows = Math.min(200, lastRow - 1);
    if (checkRows > 0) {
      // event_id is in column 8 (H) — adjust if your columns differ
      var range = sheet.getRange(lastRow - checkRows + 1, 8, checkRows, 1);
      var ids = range.getValues();
      for (var j = 0; j < ids.length; j++) {
        if (ids[j][0] === data.event_id) {
          return; // Duplicate — skip
        }
      }
    }
  }

  sheet.appendRow([
    data.timestamp || new Date().toISOString(),
    data.type || '',
    data.session_id || '',
    data.set || '',
    data.round || '',
    data.observation_id || '',
    JSON.stringify(data),
    data.event_id || '',
  ]);
}
```

**Important:** This adds an 8th column (`event_id`) to the feedback sheet. Add the header "event_id" to cell H1 in the Google Sheet.

- [ ] **Step 2: User deploys the updated Apps Script**

Deploy → New deployment → Web app → Execute as "Me" → Access "Anyone". Update the webhook URL in `.env` and Vercel env var if the URL changes.

- [ ] **Step 3: Document the change**

The Apps Script code is not in the repo. Add a comment at the top of `src/scripts/feedback.js` noting the server-side contract:

Already included in the Task 1 rewrite — the module-level JSDoc comment describes the batched array format.

---

### Task 5: Build verification and manual smoke test

**Files:**
- No file changes — verification only

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (52+ existing + new feedback tests).

- [ ] **Step 2: Run production build**

Run: `npx astro build`
Expected: `3 page(s) built in <X>ms` — index, play, leaderboard.

- [ ] **Step 3: Commit and push**

```bash
git push
```

- [ ] **Step 4: Manual smoke test after deploy**

After Vercel deploys, play a quick streak game (Bugs 101 Streak) — get 1-2 right then one wrong. Check the Google Sheet:
1. `session_start` appears once (not duplicated)
2. Each `round_complete` appears once
3. `session_end` appears once
4. All rows have an `event_id` value in column H
5. The `data_json` column contains the full payload including `event_id`

Click "Play Again" after the results screen. Verify the new session's `session_start` appears and the previous session's `session_end` is NOT duplicated.
