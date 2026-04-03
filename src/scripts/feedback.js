/**
 * Feedback and game event logging.
 * Posts to Google Sheets via Apps Script webhook.
 *
 * Events are queued and flushed in batches to reduce HTTP requests.
 * Uses navigator.sendBeacon() on page unload for reliability.
 * Fetch uses text/plain to avoid CORS preflight with Apps Script.
 */

const WEBHOOK_URL = import.meta.env.PUBLIC_GOOGLE_SHEET_WEBHOOK_URL || '';

// --- Event queue ---
const queue = [];
let flushTimer = null;
const FLUSH_INTERVAL_MS = 5000;
const MAX_BATCH = 10;

// If fetch fails (CORS or network), switch to sendBeacon for the rest of the session
let fetchFailed = false;

function enqueue(data) {
  if (!WEBHOOK_URL) {
    console.warn('[feedback] No webhook URL configured:', data.type);
    return;
  }
  queue.push({ ...data, timestamp: new Date().toISOString() });

  if (queue.length >= MAX_BATCH) {
    flush();
  } else if (!flushTimer) {
    flushTimer = setTimeout(flush, FLUSH_INTERVAL_MS);
  }
}

function sendViaSendBeacon(payload) {
  if (!WEBHOOK_URL) return;
  navigator.sendBeacon(WEBHOOK_URL, JSON.stringify(payload));
}

/**
 * Flush all queued events. Uses fetch (with error visibility) when possible,
 * falls back to sendBeacon if fetch fails.
 */
export function flush() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!queue.length || !WEBHOOK_URL) return;

  const batch = queue.splice(0);

  for (const event of batch) {
    if (fetchFailed) {
      sendViaSendBeacon(event);
      continue;
    }

    fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(event),
      keepalive: true,
    })
      .then(res => {
        if (!res.ok) {
          console.warn(`[feedback] Webhook returned ${res.status} for ${event.type}`);
        }
      })
      .catch(() => {
        fetchFailed = true;
        console.warn('[feedback] Fetch failed, using sendBeacon for remaining events');
        sendViaSendBeacon(event);
      });
  }
}

// Flush remaining events via sendBeacon when page becomes hidden.
// This catches tab closes, navigations, and mobile backgrounding.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      const batch = queue.splice(0);
      for (const event of batch) {
        sendViaSendBeacon(event);
      }
    }
  });
}

// --- Public logging functions ---

export function logRoundComplete(sessionId, round, observationId, userAnswer, correctAnswer, score, timeTakenMs, setName) {
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
  });
}

export function logSessionStart(sessionId, setName) {
  enqueue({
    type: 'session_start',
    session_id: sessionId,
    set: setName,
    referrer: sessionStorage.getItem('original_referrer') || document.referrer || '',
    device: /Mobi/.test(navigator.userAgent) ? 'mobile' : 'desktop',
  });
  flush();
}

export function logSessionEnd(sessionId, totalScore, roundsPlayed, setName, completed, shareClicked) {
  enqueue({
    type: 'session_end',
    session_id: sessionId,
    total_score: totalScore,
    rounds_played: roundsPlayed,
    set: setName,
    completed,
    share_clicked: shareClicked,
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
