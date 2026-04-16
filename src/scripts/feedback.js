/**
 * Feedback and game event logging.
 * Posts to Google Sheets via Apps Script webhook.
 *
 * Events are queued with unique IDs and flushed as batched arrays.
 * Uses sendBeacon ONLY on page unload — never as a fetch fallback
 * (mixing both caused duplicate events via keepalive race condition).
 */

import { getUserId } from './user-id.js';

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
    user_id: getUserId(),
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

// --- Daily challenge events ---

export function logDailyStart(sessionId, mode, date, challengeNumber) {
  enqueue({
    type: 'daily_start',
    session_id: sessionId,
    mode,
    date,
    challenge_number: challengeNumber,
  });
}

export function logDailyGuess(sessionId, guessNumber, userAnswer, correct, mode, date) {
  enqueue({
    type: 'daily_guess',
    session_id: sessionId,
    guess_number: guessNumber,
    user_answer: userAnswer,
    correct,
    mode,
    date,
  });
}

export function logDailyComplete(sessionId, mode, solved, guessesUsed, date, shareClicked, playStreak, winStreak) {
  enqueue({
    type: 'daily_complete',
    session_id: sessionId,
    mode,
    solved,
    guesses_used: guessesUsed,
    date,
    share_clicked: shareClicked,
    play_streak: playStreak,
    win_streak: winStreak,
  });
}
