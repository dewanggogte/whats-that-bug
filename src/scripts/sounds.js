/**
 * sounds.js — Synthesized sound effects + background music via Web Audio API.
 * All sounds are generated procedurally; no audio files required.
 *
 * Volume levels (0–1) for SFX and music are persisted separately in localStorage.
 * A master mute flag silences everything.
 */

const MUTE_KEY = 'wtb_muted';
const SFX_VOL_KEY = 'wtb_sfx_volume';
const MUSIC_VOL_KEY = 'wtb_music_volume';

let audioCtx = null;
let muted = localStorage.getItem(MUTE_KEY) === 'true';
let sfxVolume = parseFloat(localStorage.getItem(SFX_VOL_KEY) ?? '0.8');
let musicVolume = parseFloat(localStorage.getItem(MUSIC_VOL_KEY) ?? '0.5');

// Gain nodes — created lazily with the AudioContext
let sfxGain = null;
let musicGain = null;

function getCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    sfxGain = audioCtx.createGain();
    sfxGain.gain.value = muted ? 0 : sfxVolume;
    sfxGain.connect(audioCtx.destination);
    musicGain = audioCtx.createGain();
    musicGain.gain.value = muted ? 0 : musicVolume;
    musicGain.connect(audioCtx.destination);
  }
  return audioCtx;
}

function getSfxOut() { getCtx(); return sfxGain; }
function getMusicOut() { getCtx(); return musicGain; }

// ===== Volume API =====

export function isMuted() { return muted; }

export function toggleMute() {
  muted = !muted;
  localStorage.setItem(MUTE_KEY, muted.toString());
  applyGains();
  return muted;
}

export function getSfxVolume() { return sfxVolume; }
export function getMusicVolume() { return musicVolume; }

export function setSfxVolume(v) {
  sfxVolume = Math.max(0, Math.min(1, v));
  localStorage.setItem(SFX_VOL_KEY, sfxVolume.toString());
  applyGains();
}

export function setMusicVolume(v) {
  musicVolume = Math.max(0, Math.min(1, v));
  localStorage.setItem(MUSIC_VOL_KEY, musicVolume.toString());
  applyGains();
}

function applyGains() {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  sfxGain.gain.setTargetAtTime(muted ? 0 : sfxVolume, now, 0.02);
  musicGain.gain.setTargetAtTime(muted ? 0 : musicVolume, now, 0.02);
}

// ===== Low-level helpers =====

function playNote(dest, ctx, type, freqStart, freqEnd, gainStart, gainEnd, startTime, duration) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain); gain.connect(dest);
  osc.type = type;
  osc.frequency.setValueAtTime(freqStart, startTime);
  if (freqEnd !== freqStart) osc.frequency.exponentialRampToValueAtTime(freqEnd, startTime + duration);
  gain.gain.setValueAtTime(gainStart, startTime);
  gain.gain.exponentialRampToValueAtTime(Math.max(gainEnd, 0.001), startTime + duration);
  osc.start(startTime); osc.stop(startTime + duration);
}

function playNoise(dest, ctx, duration, gainStart, gainEnd, startTime, filterFreq, filterType) {
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
  gain.connect(dest);
  source.start(startTime); source.stop(startTime + duration);
}

// Shorthand wrappers that route to the SFX bus
function sfxNote(ctx, type, f0, f1, g0, g1, t, d) { playNote(getSfxOut(), ctx, type, f0, f1, g0, g1, t, d); }
function sfxNoise(ctx, d, g0, g1, t, freq, ftype) { playNoise(getSfxOut(), ctx, d, g0, g1, t, freq, ftype); }

// ===== Sound Effects =====

/** Celebratory chime — correct answer. Bright Bell with decaying overtones. */
export function playCorrect() {
  if (muted) return;
  const ctx = getCtx(); const t = ctx.currentTime;
  sfxNote(ctx, 'sine', 1047, 1047, 0.2, 0.01, t, 0.25);
  sfxNote(ctx, 'sine', 2094, 2094, 0.07, 0.001, t, 0.15);
  sfxNote(ctx, 'sine', 3141, 3141, 0.03, 0.001, t, 0.08);
}

/** Feedback tone — wrong answer. Gavel Strike: two descending tones into a heavy thud. */
export function playWrong() {
  if (muted) return;
  const ctx = getCtx(); const t = ctx.currentTime;
  sfxNote(ctx, 'sine', 550, 450, 0.18, 0.01, t, 0.09);
  sfxNote(ctx, 'sine', 400, 280, 0.18, 0.01, t + 0.08, 0.12);
  sfxNote(ctx, 'sine', 60, 30, 0.3, 0.001, t + 0.18, 0.15);
  sfxNoise(ctx, 0.04, 0.06, 0.001, t + 0.18, 500, 'lowpass');
}

/** Sparkle flourish — perfect score (100 pts). Sparkle Cascade at 70ms spacing. */
export function playPerfect() {
  if (muted) return;
  const ctx = getCtx(); const t = ctx.currentTime;
  const freqs = [1047, 1175, 1319, 1480, 1568, 1760, 1976, 2093];
  freqs.forEach((f, i) => {
    sfxNote(ctx, 'sine', f, f * 1.01, 0.12 + i * 0.01, 0.001, t + i * 0.07, 0.14);
  });
}

/** Clock tick — timer warning. Wood Block tap. */
export function playTick() {
  if (muted) return;
  const ctx = getCtx(); const t = ctx.currentTime;
  sfxNote(ctx, 'triangle', 800, 200, 0.15, 0.001, t, 0.025);
  sfxNote(ctx, 'sine', 400, 100, 0.05, 0.001, t, 0.03);
}

/** Time's up — timer reached zero. Triple descending beep. */
export function playTimesUp() {
  if (muted) return;
  const ctx = getCtx(); const t = ctx.currentTime;
  sfxNote(ctx, 'sine', 660, 660, 0.15, 0.01, t, 0.08);
  sfxNote(ctx, 'sine', 550, 550, 0.15, 0.01, t + 0.12, 0.08);
  sfxNote(ctx, 'sine', 440, 440, 0.18, 0.01, t + 0.24, 0.15);
}

/** Streak milestone — Octave Jump. */
export function playStreakMilestone(streak) {
  if (muted) return;
  const ctx = getCtx(); const t = ctx.currentTime;
  sfxNote(ctx, 'triangle', 440, 440, 0.2, 0.01, t, 0.1);
  sfxNote(ctx, 'triangle', 880, 880, 0.22, 0.01, t + 0.1, 0.1);
  sfxNote(ctx, 'triangle', 1760, 1760, 0.25, 0.01, t + 0.2, 0.15);
}

/** Short fanfare — session end. Resolution Chord (C4+E4+G4+C5). */
export function playSessionEnd() {
  if (muted) return;
  const ctx = getCtx(); const t = ctx.currentTime;
  [262, 330, 392, 523].forEach((f, i) => {
    sfxNote(ctx, i % 2 === 0 ? 'sine' : 'triangle', f, f, 0.15, 0.01, t, 0.5);
  });
}

/** Game start signal — Cinematic Rise. Sweeping tension into impact chord. */
export function playGameStart() {
  if (muted) return;
  const ctx = getCtx(); const t = ctx.currentTime;
  sfxNote(ctx, 'sine', 100, 800, 0.06, 0.15, t, 0.4);
  sfxNote(ctx, 'triangle', 200, 1600, 0.03, 0.08, t, 0.4);
  [262, 330, 392, 523].forEach(f => {
    sfxNote(ctx, 'triangle', f, f, 0.2, 0.01, t + 0.4, 0.3);
  });
  sfxNote(ctx, 'sine', 130, 50, 0.2, 0.001, t + 0.4, 0.2);
}

/** UI interaction click — Soft Tap. */
export function playUIClick() {
  if (muted) return;
  const ctx = getCtx(); const t = ctx.currentTime;
  sfxNote(ctx, 'sine', 3000, 1000, 0.06, 0.001, t, 0.015);
}

/** Question transition — Single Chime. */
export function playTransition() {
  if (muted) return;
  const ctx = getCtx(); const t = ctx.currentTime;
  sfxNote(ctx, 'sine', 1047, 1047, 0.1, 0.001, t, 0.12);
  sfxNote(ctx, 'sine', 2094, 2094, 0.03, 0.001, t, 0.08);
}

/** Streak broken — Crumble. Descending granular breakdown. */
export function playStreakBreak() {
  if (muted) return;
  const ctx = getCtx(); const t = ctx.currentTime;
  const steps = [700, 550, 400, 280, 180];
  steps.forEach((f, i) => {
    sfxNote(ctx, 'sine', f, f * 0.8, 0.1, 0.001, t + i * 0.06, 0.08);
    sfxNoise(ctx, 0.03, 0.03, 0.001, t + i * 0.06, f * 2, 'bandpass');
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
  const dest = getMusicOut();
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
      playNote(dest, ctx, 'sine', 150, 40, 0.2, 0.001, t, 0.12);
    }
    // Hi-hat on every 8th
    playNoise(dest, ctx, 0.03, 0.04, 0.001, t, 8000, 'highpass');
    // Snare on 2, 6
    if (beat === 2 || beat === 6) {
      playNoise(dest, ctx, 0.08, 0.08, 0.001, t, 3000, 'highpass');
      playNote(dest, ctx, 'sine', 200, 120, 0.06, 0.001, t, 0.05);
    }
    // Chord pad on beat 0 of each chord
    if (beat === 0) {
      chord.forEach(f => {
        playNote(dest, ctx, 'triangle', f, f, 0.04, 0.001, t, beatMs * 8 / 1000);
      });
    }
    // Bass on 0, 3, 4, 7
    if (beat === 0 || beat === 3 || beat === 4 || beat === 7) {
      playNote(dest, ctx, 'sine', chord[0] / 2, chord[0] / 2, 0.1, 0.01, t, beatMs * 2 / 1000);
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
