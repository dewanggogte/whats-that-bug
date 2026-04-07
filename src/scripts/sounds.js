/**
 * sounds.js — Synthesized sound effects via Web Audio API.
 * All sounds are generated procedurally; no audio files required.
 * Mute state is persisted to localStorage under the key `wtb_muted`.
 */

const MUTE_KEY = 'wtb_muted';

let audioCtx = null;
let muted = localStorage.getItem(MUTE_KEY) === 'true';

function getCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

export function isMuted() { return muted; }

export function toggleMute() {
  muted = !muted;
  localStorage.setItem(MUTE_KEY, muted.toString());
  return muted;
}

function playNote(ctx, type, freqStart, freqEnd, gainStart, gainEnd, startTime, duration) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain); gain.connect(ctx.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(freqStart, startTime);
  if (freqEnd !== freqStart) osc.frequency.exponentialRampToValueAtTime(freqEnd, startTime + duration);
  gain.gain.setValueAtTime(gainStart, startTime);
  gain.gain.exponentialRampToValueAtTime(Math.max(gainEnd, 0.001), startTime + duration);
  osc.start(startTime); osc.stop(startTime + duration);
}

function playNoise(ctx, duration, gainStart, gainEnd, startTime, filterFreq, filterType) {
  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(gainStart, startTime);
  gain.gain.exponentialRampToValueAtTime(Math.max(gainEnd, 0.001), startTime + duration);
  if (filterFreq) {
    const filter = ctx.createBiquadFilter();
    filter.type = filterType || 'lowpass';
    filter.frequency.value = filterFreq;
    source.connect(filter); filter.connect(gain);
  } else { source.connect(gain); }
  gain.connect(ctx.destination);
  source.start(startTime); source.stop(startTime + duration);
}

/** Celebratory chime — correct answer. Bright Bell with decaying overtones. */
export function playCorrect() {
  if (muted) return;
  const ctx = getCtx();
  const t = ctx.currentTime;
  playNote(ctx, 'sine', 1047, 1047, 0.2, 0.01, t, 0.25);
  playNote(ctx, 'sine', 2094, 2094, 0.07, 0.001, t, 0.15);
  playNote(ctx, 'sine', 3141, 3141, 0.03, 0.001, t, 0.08);
}

/** Feedback tone — wrong answer. Gavel Strike: two descending tones into a heavy thud. */
export function playWrong() {
  if (muted) return;
  const ctx = getCtx();
  const t = ctx.currentTime;
  playNote(ctx, 'sine', 550, 450, 0.18, 0.01, t, 0.09);
  playNote(ctx, 'sine', 400, 280, 0.18, 0.01, t + 0.08, 0.12);
  playNote(ctx, 'sine', 60, 30, 0.3, 0.001, t + 0.18, 0.15);
  playNoise(ctx, 0.04, 0.06, 0.001, t + 0.18, 500, 'lowpass');
}

/** Sparkle flourish — perfect score (100 pts). Sparkle Cascade at 70ms spacing. */
export function playPerfect() {
  if (muted) return;
  const ctx = getCtx();
  const t = ctx.currentTime;
  const freqs = [1047, 1175, 1319, 1480, 1568, 1760, 1976, 2093];
  freqs.forEach((f, i) => {
    playNote(ctx, 'sine', f, f * 1.01, 0.12 + i * 0.01, 0.001, t + i * 0.07, 0.14);
  });
}

/** Clock tick — timer warning. Wood Block tap. */
export function playTick() {
  if (muted) return;
  const ctx = getCtx();
  const t = ctx.currentTime;
  playNote(ctx, 'triangle', 800, 200, 0.15, 0.001, t, 0.025);
  playNote(ctx, 'sine', 400, 100, 0.05, 0.001, t, 0.03);
}

/** Time's up — timer reached zero. Triple descending beep. */
export function playTimesUp() {
  if (muted) return;
  const ctx = getCtx();
  const t = ctx.currentTime;
  playNote(ctx, 'sine', 660, 660, 0.15, 0.01, t, 0.08);
  playNote(ctx, 'sine', 550, 550, 0.15, 0.01, t + 0.12, 0.08);
  playNote(ctx, 'sine', 440, 440, 0.18, 0.01, t + 0.24, 0.15);
}

/**
 * Streak milestone — Octave Jump.
 * @param {number} streak - Current streak count
 */
export function playStreakMilestone(streak) {
  if (muted) return;
  const ctx = getCtx();
  const t = ctx.currentTime;
  playNote(ctx, 'triangle', 440, 440, 0.2, 0.01, t, 0.1);
  playNote(ctx, 'triangle', 880, 880, 0.22, 0.01, t + 0.1, 0.1);
  playNote(ctx, 'triangle', 1760, 1760, 0.25, 0.01, t + 0.2, 0.15);
}

/** Short fanfare — session end. Resolution Chord (C4+E4+G4+C5). */
export function playSessionEnd() {
  if (muted) return;
  const ctx = getCtx();
  const t = ctx.currentTime;
  [262, 330, 392, 523].forEach((f, i) => {
    playNote(ctx, i % 2 === 0 ? 'sine' : 'triangle', f, f, 0.15, 0.01, t, 0.5);
  });
}

/** Game start signal — Cinematic Rise. Sweeping tension into impact chord. */
export function playGameStart() {
  if (muted) return;
  const ctx = getCtx();
  const t = ctx.currentTime;
  playNote(ctx, 'sine', 100, 800, 0.06, 0.15, t, 0.4);
  playNote(ctx, 'triangle', 200, 1600, 0.03, 0.08, t, 0.4);
  [262, 330, 392, 523].forEach(f => {
    playNote(ctx, 'triangle', f, f, 0.2, 0.01, t + 0.4, 0.3);
  });
  playNote(ctx, 'sine', 130, 50, 0.2, 0.001, t + 0.4, 0.2);
}

/** UI interaction click — Soft Tap. */
export function playUIClick() {
  if (muted) return;
  const ctx = getCtx();
  const t = ctx.currentTime;
  playNote(ctx, 'sine', 3000, 1000, 0.06, 0.001, t, 0.015);
}

/** Question transition — Single Chime. */
export function playTransition() {
  if (muted) return;
  const ctx = getCtx();
  const t = ctx.currentTime;
  playNote(ctx, 'sine', 1047, 1047, 0.1, 0.001, t, 0.12);
  playNote(ctx, 'sine', 2094, 2094, 0.03, 0.001, t, 0.08);
}

/** Streak broken — Crumble. Descending granular breakdown. */
export function playStreakBreak() {
  if (muted) return;
  const ctx = getCtx();
  const t = ctx.currentTime;
  const steps = [700, 550, 400, 280, 180];
  steps.forEach((f, i) => {
    playNote(ctx, 'sine', f, f * 0.8, 0.1, 0.001, t + i * 0.06, 0.08);
    playNoise(ctx, 0.03, 0.03, 0.001, t + i * 0.06, f * 2, 'bandpass');
  });
}

// ========== BACKGROUND MUSIC ==========

let bgMusicInterval = null;
let bgMusicStep = 0;

/**
 * Start lo-fi chill beat background music.
 * 90 BPM loop: kick + hi-hat + snare pattern over a 4-chord progression
 * with triangle-wave pads and sine bass.
 */
export function startBgMusic() {
  if (muted || bgMusicInterval) return;
  const ctx = getCtx();
  const bpm = 90;
  const beatMs = 60000 / bpm / 2; // 8th notes
  bgMusicStep = 0;

  const chords = [
    [262, 330, 392], // C
    [294, 370, 440], // Dm
    [220, 277, 330], // Am
    [247, 311, 392], // G/B
  ];

  function tick() {
    if (muted) { stopBgMusic(); return; }
    const t = ctx.currentTime;
    const beat = bgMusicStep % 8;
    const chordIdx = Math.floor((bgMusicStep % 32) / 8);
    const chord = chords[chordIdx];

    // Kick on 0, 4
    if (beat === 0 || beat === 4) {
      playNote(ctx, 'sine', 150, 40, 0.2, 0.001, t, 0.12);
    }
    // Hi-hat on every 8th
    playNoise(ctx, 0.03, 0.04, 0.001, t, 8000, 'highpass');
    // Snare on 2, 6
    if (beat === 2 || beat === 6) {
      playNoise(ctx, 0.08, 0.08, 0.001, t, 3000, 'highpass');
      playNote(ctx, 'sine', 200, 120, 0.06, 0.001, t, 0.05);
    }
    // Chord pad on beat 0 of each chord
    if (beat === 0) {
      chord.forEach(f => {
        playNote(ctx, 'triangle', f, f, 0.04, 0.001, t, beatMs * 8 / 1000);
      });
    }
    // Bass on 0, 3, 4, 7
    if (beat === 0 || beat === 3 || beat === 4 || beat === 7) {
      playNote(ctx, 'sine', chord[0] / 2, chord[0] / 2, 0.1, 0.01, t, beatMs * 2 / 1000);
    }
    bgMusicStep++;
  }

  tick();
  bgMusicInterval = setInterval(tick, beatMs);
}

/** Stop background music loop. */
export function stopBgMusic() {
  if (bgMusicInterval) {
    clearInterval(bgMusicInterval);
    bgMusicInterval = null;
  }
  bgMusicStep = 0;
}

/** Returns whether background music is currently playing. */
export function isBgMusicPlaying() {
  return bgMusicInterval !== null;
}
