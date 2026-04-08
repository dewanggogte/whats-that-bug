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
let muted = localStorage.getItem(MUTE_KEY) !== 'false';
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

/** Celebratory chime — correct answer. Double Ping. */
export function playCorrect() {
  if (muted) return;
  const ctx = getCtx(); const t = ctx.currentTime;
  sfxNote(ctx, 'sine', 1397, 1397, 0.18, 0.01, t, 0.06);
  sfxNote(ctx, 'sine', 1760, 1760, 0.18, 0.01, t + 0.08, 0.08);
}

/** Feedback tone — wrong answer. Wobble Down. */
export function playWrong() {
  if (muted) return;
  const ctx = getCtx(); const t = ctx.currentTime;
  sfxNote(ctx, 'sine', 500, 250, 0.15, 0.01, t, 0.3);
  sfxNote(ctx, 'triangle', 504, 248, 0.06, 0.001, t, 0.3);
  sfxNote(ctx, 'sine', 496, 252, 0.06, 0.001, t, 0.3);
}


/** Clock tick — timer warning. Wood Block tap (boosted). */
export function playTick() {
  if (muted) return;
  const ctx = getCtx(); const t = ctx.currentTime;
  sfxNote(ctx, 'triangle', 800, 200, 0.35, 0.001, t, 0.025);
  sfxNote(ctx, 'sine', 400, 100, 0.12, 0.001, t, 0.03);
}

/** Time's up — timer reached zero. Flatline Tone. */
export function playTimesUp() {
  if (muted) return;
  const ctx = getCtx(); const t = ctx.currentTime;
  sfxNote(ctx, 'sine', 440, 440, 0.18, 0.001, t, 0.5);
}

/** Short fanfare — session end. Music Box. */
export function playSessionEnd() {
  if (muted) return;
  const ctx = getCtx(); const t = ctx.currentTime;
  const notes = [784, 659, 523, 392];
  notes.forEach((f, i) => {
    sfxNote(ctx, 'sine', f, f, 0.15, 0.01, t + i * 0.12, 0.2);
    sfxNote(ctx, 'sine', f * 2, f * 2, 0.03, 0.001, t + i * 0.12, 0.1);
  });
}

/** UI interaction click — Soft Tap (boosted). */
export function playUIClick() {
  if (muted) return;
  const ctx = getCtx(); const t = ctx.currentTime;
  sfxNote(ctx, 'sine', 3000, 1000, 0.15, 0.001, t, 0.015);
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
