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

/** Celebratory chime — correct answer. Major third chord (C6 + E6) with upward sweep. */
export function playCorrect() {
  if (muted) return;
  const ctx = getCtx();
  const t = ctx.currentTime;
  // Root note — quick upward sweep
  playNote(ctx, 'sine', 1047, 1320, 0.2, 0.01, t, 0.18);
  // Major third — adds warmth
  playNote(ctx, 'sine', 1318, 1568, 0.15, 0.01, t + 0.03, 0.18);
}

/** Soft descending tone — wrong answer. */
export function playWrong() {
  if (muted) return;
  const ctx = getCtx();
  const t = ctx.currentTime;
  playNote(ctx, 'sine', 440, 330, 0.15, 0.01, t, 0.25);
}

/**
 * Sparkle flourish — perfect score (100 pts).
 * Three-note ascending major arpeggio (C6-E6-G6) with harmonic shimmer.
 */
export function playPerfect() {
  if (muted) return;
  const ctx = getCtx();
  const t = ctx.currentTime;
  // C6 — root
  playNote(ctx, 'sine', 1047, 1100, 0.22, 0.01, t, 0.15);
  // E6 — major third
  playNote(ctx, 'sine', 1318, 1400, 0.22, 0.01, t + 0.07, 0.15);
  // G6 — fifth, with shimmer (triangle adds sparkle)
  playNote(ctx, 'triangle', 1568, 1700, 0.18, 0.01, t + 0.14, 0.22);
  // High octave shimmer — very soft
  playNote(ctx, 'sine', 2093, 2200, 0.08, 0.01, t + 0.18, 0.2);
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
 * Clock tick — timer warning (fires every second when timeRemaining <= 10).
 * Sharp click/pop using a noise burst, like a mechanical clock.
 */
export function playTick() {
  if (muted) return;
  const ctx = getCtx();
  const t = ctx.currentTime;

  // Sharp attack click — high frequency burst that drops fast
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'square';
  // Start high and drop sharply — creates a "click" rather than a "beep"
  osc.frequency.setValueAtTime(1800, t);
  osc.frequency.exponentialRampToValueAtTime(200, t + 0.015);
  gain.gain.setValueAtTime(0.12, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
  osc.start(t);
  osc.stop(t + 0.03);
}
