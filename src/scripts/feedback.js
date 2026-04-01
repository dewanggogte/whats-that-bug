/**
 * Feedback and game event logging.
 * Posts to Google Sheets via Apps Script webhook.
 */

const WEBHOOK_URL = import.meta.env?.PUBLIC_GOOGLE_SHEET_WEBHOOK_URL || '';

export function postToSheet(data) {
  if (!WEBHOOK_URL) {
    console.warn('[feedback] No webhook URL configured. Event not sent:', data.type);
    return;
  }
  const payload = { ...data, timestamp: new Date().toISOString() };
  fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    mode: 'no-cors',
  }).catch(err => {
    console.warn('[feedback] Failed to post:', err.message);
  });
}

export function logRoundComplete(sessionId, round, observationId, userAnswer, correctAnswer, score, timeTakenMs, setName) {
  postToSheet({
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
  postToSheet({
    type: 'session_start',
    session_id: sessionId,
    set: setName,
    referrer: document.referrer || '',
    device: /Mobi/.test(navigator.userAgent) ? 'mobile' : 'desktop',
  });
}

export function logSessionEnd(sessionId, totalScore, roundsPlayed, setName, completed, shareClicked) {
  postToSheet({
    type: 'session_end',
    session_id: sessionId,
    total_score: totalScore,
    rounds_played: roundsPlayed,
    set: setName,
    completed,
    share_clicked: shareClicked,
  });
}

export function logRoundReaction(sessionId, round, observationId, difficulty, userAnswer, correctAnswer, score, setName) {
  postToSheet({
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
  postToSheet({
    type: 'session_feedback',
    session_id: sessionId,
    score,
    set: setName,
    difficulty_rating: difficultyRating,
    interesting_round: interestingRound,
    free_text: freeText,
    play_again: playAgain,
  });
}

export function logGeneralFeedback(category, text) {
  postToSheet({
    type: 'general_feedback',
    category,
    text,
    current_page: window.location.pathname,
  });
}
