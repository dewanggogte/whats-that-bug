/**
 * sounds.js — Synthesized sound effects via Web Audio API.
 * All sounds are generated procedurally; no audio files required.
 * Mute state is persisted to localStorage under the key `wtb_muted`.
 */

const MUTE_KEY = 'wtb_muted';

let audioCtx = null;
let muted = localStorage.getItem(MUTE_KEY) === 'true';

/** Returns the shared AudioContext, creating it lazily on first use. */
function getCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

export function isMuted() {
  return muted;
}

export function toggleMute() {
  muted = !muted;
  localStorage.setItem(MUTE_KEY, muted.toString());
  return muted;
}

/**
 * Plays a single oscillator note.
 * @param {AudioContext} ctx
 * @param {string} type - OscillatorType ('sine', 'square', 'triangle', 'sawtooth')
 * @param {number} freqStart - Starting frequency in Hz
 * @param {number} freqEnd   - Ending frequency in Hz (exponential ramp)
 * @param {number} gainStart - Starting gain
 * @param {number} gainEnd   - Ending gain (exponential ramp)
 * @param {number} startTime - AudioContext time to start
 * @param {number} duration  - Duration in seconds
 */
function playNote(ctx, type, freqStart, freqEnd, gainStart, gainEnd, startTime, duration) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.type = type;
  osc.frequency.setValueAtTime(freqStart, startTime);
  if (freqEnd !== freqStart) {
    osc.frequency.exponentialRampToValueAtTime(freqEnd, startTime + duration);
  }

  gain.gain.setValueAtTime(gainStart, startTime);
  gain.gain.exponentialRampToValueAtTime(gainEnd, startTime + duration);

  osc.start(startTime);
  osc.stop(startTime + duration);
}

/** Ascending chime — correct answer (same as original playDing). */
export function playCorrect() {
  if (muted) return;
  const ctx = getCtx();
  const t = ctx.currentTime;
  playNote(ctx, 'sine', 880, 1320, 0.3, 0.01, t, 0.2);
}

/** Soft descending tone — wrong answer. */
export function playWrong() {
  if (muted) return;
  const ctx = getCtx();
  const t = ctx.currentTime;
  playNote(ctx, 'sine', 440, 330, 0.15, 0.01, t, 0.25);
}

/**
 * Sparkle flourish — perfect score.
 * Two quick ascending notes: C6 (1047 Hz) then G6 (1568 Hz), staggered 80ms.
 */
export function playPerfect() {
  if (muted) return;
  const ctx = getCtx();
  const t = ctx.currentTime;
  playNote(ctx, 'sine', 1047, 1200, 0.25, 0.01, t, 0.15);
  playNote(ctx, 'sine', 1568, 1800, 0.25, 0.01, t + 0.08, 0.2);
}

/**
 * 3-note ascending chime — streak milestone.
 * Base frequency rises with streak count (every 5 streaks = higher pitch).
 * @param {number} streak - Current streak count
 */
export function playStreakMilestone(streak) {
  if (muted) return;
  const ctx = getCtx();
  const t = ctx.currentTime;

  // Base rises by 50 Hz for every 5-streak increment, capped at a reasonable ceiling
  const level = Math.min(Math.floor(streak / 5) - 1, 6);
  const base = 523 + level * 50; // C5 = 523 Hz, rising with level

  playNote(ctx, 'sine', base, base * 1.05, 0.25, 0.01, t, 0.15);
  playNote(ctx, 'sine', base * 1.25, base * 1.3, 0.25, 0.01, t + 0.12, 0.15);
  playNote(ctx, 'sine', base * 1.5, base * 1.6, 0.3, 0.01, t + 0.24, 0.2);
}

/**
 * Short fanfare — session end (classic and time trial wins).
 * C5-E5-G5 (523, 659, 784 Hz) in triangle wave, staggered 150ms each.
 */
export function playSessionEnd() {
  if (muted) return;
  const ctx = getCtx();
  const t = ctx.currentTime;
  playNote(ctx, 'triangle', 523, 523, 0.25, 0.01, t, 0.2);
  playNote(ctx, 'triangle', 659, 659, 0.25, 0.01, t + 0.15, 0.2);
  playNote(ctx, 'triangle', 784, 784, 0.3, 0.01, t + 0.3, 0.3);
}

/**
 * Subtle tick — timer warning (fires when timeRemaining <= 10).
 * 1000 Hz square wave, very short and quiet.
 */
export function playTick() {
  if (muted) return;
  const ctx = getCtx();
  const t = ctx.currentTime;
  playNote(ctx, 'square', 1000, 1000, 0.05, 0.001, t, 0.05);
}
