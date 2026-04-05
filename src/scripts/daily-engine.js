// src/scripts/daily-engine.js
// Pure-logic module for the daily challenge feature.
// No DOM dependencies. Handles: today's date in ET, challenge numbering,
// guess validation, streak calculation, and localStorage state persistence.

const EPOCH = '2026-04-07';

/**
 * Returns today's date as YYYY-MM-DD in Eastern Time.
 * Uses Intl timezone conversion so the daily challenge resets at midnight ET,
 * regardless of the user's local timezone.
 */
export function getTodayET() {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const y = et.getFullYear();
  const m = String(et.getMonth() + 1).padStart(2, '0');
  const d = String(et.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Returns the challenge number for a given date string.
 * Challenge #1 is the EPOCH date; increments by 1 each day after.
 */
export function getChallengeNumber(dateStr) {
  const epoch = new Date(EPOCH + 'T00:00:00');
  const target = new Date(dateStr + 'T00:00:00');
  const diffMs = target - epoch;
  return Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1;
}

/**
 * Validates a guess against the correct answer.
 * Case-insensitive, trims whitespace from both sides.
 * Returns { correct: boolean }.
 */
export function validateGuess(guess, answer) {
  const normalizedGuess = guess.trim().toLowerCase();
  const normalizedAnswer = answer.trim().toLowerCase();
  return { correct: normalizedGuess === normalizedAnswer };
}

/**
 * Calculates play and win streaks by walking backward from `today`.
 *
 * - playStreak: consecutive days with ANY entry (win or loss)
 * - winStreak: consecutive days with solved:true, resets on first loss
 * - A gap (missing date) breaks both streaks
 *
 * @param {Object} history  — keyed by YYYY-MM-DD, values have { solved: boolean, ... }
 * @param {string} today    — YYYY-MM-DD to start walking backward from
 * @returns {{ playStreak: number, winStreak: number }}
 */
export function calculateStreaks(history, today) {
  let playStreak = 0;
  let winStreak = 0;
  let winBroken = false;
  let current = new Date(today + 'T00:00:00');

  while (true) {
    // Format using local getters — toISOString() would convert to UTC
    // and shift the date in non-UTC timezones.
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const d = String(current.getDate()).padStart(2, '0');
    const key = `${y}-${m}-${d}`;
    const entry = history[key];
    if (!entry) break;

    playStreak++;
    if (entry.solved && !winBroken) {
      winStreak++;
    } else {
      winBroken = true;
    }

    current.setDate(current.getDate() - 1);
  }

  return { playStreak, winStreak };
}

/**
 * Loads the daily state for a specific mode and date from localStorage.
 * Returns the entry object or null if not found / not played.
 */
export function loadDailyState(mode, dateStr) {
  try {
    const raw = localStorage.getItem(`daily_${mode}_history`);
    if (!raw) return null;
    const history = JSON.parse(raw);
    return history[dateStr] || null;
  } catch {
    return null;
  }
}

/**
 * Saves a daily result to localStorage, merging with existing history
 * so previous entries are preserved.
 */
export function saveDailyResult(mode, dateStr, result) {
  const key = `daily_${mode}_history`;
  let history = {};
  try {
    const raw = localStorage.getItem(key);
    if (raw) history = JSON.parse(raw);
  } catch {
    // corrupted data — start fresh
  }
  history[dateStr] = result;
  localStorage.setItem(key, JSON.stringify(history));
}

/**
 * Returns the full history object for a mode, or {} if none exists.
 */
export function loadHistory(mode) {
  try {
    const raw = localStorage.getItem(`daily_${mode}_history`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Returns { hours, minutes } until the next midnight Eastern Time.
 * Used for the "next challenge in..." countdown display.
 */
export function getCountdownToReset() {
  const now = new Date();
  const etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const et = new Date(etStr);
  const midnight = new Date(et);
  midnight.setDate(midnight.getDate() + 1);
  midnight.setHours(0, 0, 0, 0);
  const diffMs = midnight - et;
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  return { hours, minutes };
}
