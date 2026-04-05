// src/scripts/daily-ui.js
/**
 * Daily challenge UI — DOM rendering and event handling.
 * Supports two modes: bugs101 (3 guesses) and allbugs (6 guesses).
 *
 * Flow: initDaily() → loadChallenge() → renderGame() → submitGuess() → renderReveal()
 * On replay (already completed today): initDaily() → loadChallenge() → renderReveal()
 */

import {
  getTodayET, getChallengeNumber, validateGuess,
  loadDailyState, saveDailyResult, loadHistory,
  calculateStreaks, getCountdownToReset,
} from './daily-engine.js';
import { generateDailyShareText } from './daily-share.js';
import { copyToClipboard, openWhatsApp, openIMessage, openTweetIntent, canNativeShare, nativeShare } from './share.js';
import { logDailyStart, logDailyGuess, logDailyComplete } from './feedback.js';

const base = window.__BASE || '';

// Bugs 101 autocomplete list — matches getBugs101Name categories in game-ui.js
const BUGS101_OPTIONS = [
  'Ant', 'Aphid', 'Bee', 'Beetle', 'Butterfly', 'Caddisfly', 'Cicada',
  'Cockroach', 'Cricket', 'Damselfly', 'Dragonfly', 'Earwig', 'Fly',
  'Grasshopper', 'Harvestman', 'Lacewing', 'Mantis', 'Mayfly', 'Moth',
  'Planthopper', 'Scorpion', 'Spider', 'Stick Insect', 'Stink Bug',
  'Tick', 'True Bug', 'Wasp', 'Water Bug',
];

// --- Module state ---
let container = null;
let mode = 'bugs101';
let challenge = null;        // today's challenge object from manifest
let today = null;            // YYYY-MM-DD
let challengeNumber = 0;
let currentGuess = 0;        // which crop we're showing (0-indexed)
let guesses = [];            // array of { answer: string, correct: boolean }
let maxGuesses = 3;
let solved = false;
let gameOver = false;
let sessionId = null;
let shareClicked = false;
let allSpeciesList = [];     // for allbugs autocomplete
let selectedAnswer = '';     // currently selected autocomplete value
let highlightedIndex = -1;   // keyboard nav index in dropdown

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Initialize the daily challenge. Called from daily/play.astro.
 */
export async function initDaily() {
  container = document.getElementById('daily-container');
  container.setAttribute('aria-live', 'polite');

  const params = new URLSearchParams(window.location.search);
  mode = params.get('mode') || 'bugs101';
  maxGuesses = mode === 'bugs101' ? 3 : 6;

  today = getTodayET();
  challengeNumber = getChallengeNumber(today);

  // Check if already played today
  const existingResult = loadDailyState(mode, today);
  if (existingResult) {
    // Load the challenge data so the reveal screen has species info
    await loadChallenge();
    if (challenge) {
      solved = existingResult.solved;
      guesses = existingResult.guessHistory || [];
      gameOver = true;
      renderReveal();
    }
    return;
  }

  // Load challenge data
  const loaded = await loadChallenge();
  if (!loaded) return;

  // Generate session ID — crypto.randomUUID is available in modern browsers
  // over HTTPS; the fallback covers older/insecure contexts.
  sessionId = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

  logDailyStart(sessionId, mode, today, challengeNumber);

  // Load species list for allbugs autocomplete
  if (mode === 'allbugs') {
    try {
      const obsRes = await fetch(`${base}/data/observations.json`);
      const observations = await obsRes.json();
      const speciesSet = new Map();
      for (const obs of observations) {
        if (obs.taxon?.species && !speciesSet.has(obs.taxon.species)) {
          speciesSet.set(obs.taxon.species, obs.taxon.common_name || obs.taxon.species);
        }
      }
      allSpeciesList = Array.from(speciesSet.entries())
        .map(([species, common]) => ({ species, common, label: `${common} (${species})` }))
        .sort((a, b) => a.common.localeCompare(b.common));
    } catch {
      console.warn('Failed to load species list for autocomplete');
    }
  }

  renderGame();
}

// ===== DATA HELPERS =====

async function loadChallenge() {
  try {
    const res = await fetch(`${base}/data/daily/manifest.json`);
    if (!res.ok) throw new Error('Manifest not found');
    const manifest = await res.json();

    const todayChallenge = manifest.challenges.find(c => c.date === today && c.approved);
    if (!todayChallenge) {
      container.innerHTML = `<div class="container" style="text-align:center;padding-top:80px;">
        <h2>No challenge today</h2>
        <p class="subtitle">Check back tomorrow!</p>
        <a href="${base}/" style="color:var(--accent);">Back to home</a>
      </div>`;
      return false;
    }

    challenge = todayChallenge;
    return true;
  } catch (err) {
    container.innerHTML = `<div class="container" style="text-align:center;padding-top:80px;">
      <p>Failed to load daily challenge.</p>
      <p style="color:var(--text-secondary);font-size:13px;">${escapeHTML(err.message)}</p>
    </div>`;
    return false;
  }
}

/** Returns the mode-specific challenge data block. */
function getChallengeData() {
  return mode === 'bugs101' ? challenge.bugs101 : challenge.allbugs;
}

/** Returns the correct answer text for display. */
function getAnswer() {
  return getChallengeData().answer_common;
}

/** Returns the answer used for guess validation (same as display answer). */
function getAnswerForValidation() {
  return getChallengeData().answer_common;
}

/** Returns the array of crop image paths for the current mode. */
function getCrops() {
  return getChallengeData().crops;
}

// ===== GAME RENDERING =====

function renderGame() {
  const crops = getCrops();
  const modeLabel = mode === 'bugs101' ? 'Bugs 101 Daily' : 'All Bugs Daily';

  container.innerHTML = `
    <div class="container">
      <div style="text-align:center;padding:12px 0 8px;">
        <h2 style="font-size:18px;margin-bottom:2px;">${modeLabel} #${challengeNumber}</h2>
      </div>

      <div class="daily-image-container" id="daily-image">
        <span class="daily-guess-badge">${currentGuess + 1} / ${maxGuesses}</span>
        <img src="${base}/data/${crops[currentGuess]}" alt="Crop ${currentGuess + 1}">
      </div>

      <div class="daily-history" id="daily-history"></div>

      <div class="daily-wrong-guesses" id="wrong-guesses"></div>

      <div class="daily-input-row">
        <div class="daily-input-wrapper">
          <input type="text" class="daily-input" id="guess-input"
            placeholder="${mode === 'bugs101' ? 'Type bug name...' : 'Type species name...'}"
            autocomplete="off" autocorrect="off" spellcheck="false">
          <div class="daily-autocomplete" id="autocomplete"></div>
        </div>
        <button class="daily-submit" id="submit-btn" disabled>Go</button>
      </div>
    </div>
  `;

  renderHistoryStrip();
  setupAutocomplete();
  setupSubmit();
}

/**
 * Render the crop thumbnail strip below the main image.
 * Shows unlocked thumbs for crops already seen, active for current,
 * and locked placeholders for future crops.
 */
function renderHistoryStrip() {
  const crops = getCrops();
  const strip = document.getElementById('daily-history');
  if (!strip) return;

  strip.innerHTML = crops.map((cropPath, i) => {
    let cls = 'daily-history-thumb';
    if (i === currentGuess) cls += ' active';
    else if (i < currentGuess) cls += ' wrong';
    else cls += ' locked';

    // Only show image for crops that have been revealed (current + past)
    if (i <= currentGuess) {
      return `<div class="${cls}" data-idx="${i}"><img src="${base}/data/${cropPath}" alt="Crop ${i + 1}"></div>`;
    }
    return `<div class="${cls}"></div>`;
  }).join('');

  // Click handler to review previous crops in the main image area
  strip.querySelectorAll('.wrong, .active').forEach(thumb => {
    thumb.addEventListener('click', () => {
      const idx = parseInt(thumb.getAttribute('data-idx'));
      const imgEl = document.querySelector('#daily-image img');
      if (imgEl) imgEl.src = `${base}/data/${crops[idx]}`;
    });
  });
}

/** Update the wrong guesses display with crossed-out red text. */
function renderWrongGuesses() {
  const el = document.getElementById('wrong-guesses');
  if (!el) return;
  el.innerHTML = guesses
    .filter(g => !g.correct)
    .map(g => `<span class="daily-wrong-guess">${escapeHTML(g.answer)}</span>`)
    .join('');
}

// ===== AUTOCOMPLETE =====

function setupAutocomplete() {
  const input = document.getElementById('guess-input');
  const dropdown = document.getElementById('autocomplete');
  const submitBtn = document.getElementById('submit-btn');

  // Filter and show matches as user types
  input.addEventListener('input', () => {
    const query = input.value.trim().toLowerCase();
    selectedAnswer = '';
    submitBtn.disabled = true;
    highlightedIndex = -1;

    if (query.length < 1) {
      dropdown.classList.remove('open');
      return;
    }

    let matches;
    if (mode === 'bugs101') {
      matches = BUGS101_OPTIONS
        .filter(name => name.toLowerCase().includes(query))
        .map(name => ({ label: name, value: name }));
    } else {
      // allbugs: search both common name and scientific name
      matches = allSpeciesList
        .filter(s =>
          s.common.toLowerCase().includes(query) ||
          s.species.toLowerCase().includes(query)
        )
        .slice(0, 15)
        .map(s => ({ label: s.common, value: s.common, scientific: s.species }));
    }

    if (matches.length === 0) {
      dropdown.classList.remove('open');
      return;
    }

    dropdown.innerHTML = matches.map((m, i) => {
      const sci = m.scientific ? `<span class="scientific">${escapeHTML(m.scientific)}</span>` : '';
      return `<div class="daily-autocomplete-item" data-value="${escapeHTML(m.value)}" data-idx="${i}">${escapeHTML(m.label)}${sci}</div>`;
    }).join('');
    dropdown.classList.add('open');

    // Click to select an autocomplete item
    dropdown.querySelectorAll('.daily-autocomplete-item').forEach(item => {
      item.addEventListener('click', () => {
        selectedAnswer = item.getAttribute('data-value');
        input.value = selectedAnswer;
        dropdown.classList.remove('open');
        submitBtn.disabled = false;
      });
    });
  });

  // Keyboard navigation: ArrowDown/ArrowUp to move, Enter to select/submit
  input.addEventListener('keydown', (e) => {
    const items = dropdown.querySelectorAll('.daily-autocomplete-item');

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlightedIndex = Math.min(highlightedIndex + 1, items.length - 1);
      updateHighlight(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlightedIndex = Math.max(highlightedIndex - 1, 0);
      updateHighlight(items);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && items[highlightedIndex]) {
        // Select the highlighted item
        items[highlightedIndex].click();
      } else if (selectedAnswer) {
        // Submit the already-selected answer
        submitGuess();
      }
    }
  });

  // Close dropdown when clicking outside the input wrapper
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.daily-input-wrapper')) {
      dropdown.classList.remove('open');
    }
  });
}

/** Update highlighted state across autocomplete items and sync selection. */
function updateHighlight(items) {
  items.forEach((item, i) => {
    item.classList.toggle('highlighted', i === highlightedIndex);
  });
  if (highlightedIndex >= 0 && items[highlightedIndex]) {
    selectedAnswer = items[highlightedIndex].getAttribute('data-value');
    document.getElementById('guess-input').value = selectedAnswer;
    document.getElementById('submit-btn').disabled = false;
  }
}

// ===== GUESS SUBMISSION =====

function setupSubmit() {
  document.getElementById('submit-btn').addEventListener('click', submitGuess);
}

function submitGuess() {
  if (!selectedAnswer || gameOver) return;

  const answer = getAnswerForValidation();
  const result = validateGuess(selectedAnswer, answer);
  guesses.push({ answer: selectedAnswer, correct: result.correct });

  logDailyGuess(sessionId, guesses.length, selectedAnswer, result.correct, mode, today);

  if (result.correct) {
    solved = true;
    gameOver = true;
    finishGame();
  } else {
    currentGuess++;
    if (currentGuess >= maxGuesses) {
      // Out of guesses
      gameOver = true;
      finishGame();
    } else {
      // Show the next crop (zooms out, reveals more of the image)
      const crops = getCrops();
      const imgEl = document.querySelector('#daily-image img');
      if (imgEl) imgEl.src = `${base}/data/${crops[currentGuess]}`;
      const badge = document.querySelector('.daily-guess-badge');
      if (badge) badge.textContent = `${currentGuess + 1} / ${maxGuesses}`;

      renderHistoryStrip();
      renderWrongGuesses();

      // Reset input for next guess
      const input = document.getElementById('guess-input');
      input.value = '';
      selectedAnswer = '';
      document.getElementById('submit-btn').disabled = true;
      input.focus();
    }
  }
}

/** Save result, calculate streaks, log completion, and show reveal. */
function finishGame() {
  const guessHistory = guesses.map(g => ({ answer: g.answer, correct: g.correct }));
  saveDailyResult(mode, today, {
    solved,
    guesses: guesses.length,
    answer: getAnswer(),
    guessHistory,
  });

  const history = loadHistory(mode);
  const streaks = calculateStreaks(history, today);

  logDailyComplete(sessionId, mode, solved, guesses.length, today, false, streaks.playStreak, streaks.winStreak);

  renderReveal();
}

// ===== REVEAL SCREEN =====

function renderReveal() {
  const data = getChallengeData();
  const history = loadHistory(mode);
  const streaks = calculateStreaks(history, today);
  const countdown = getCountdownToReset();
  const modeLabel = mode === 'bugs101' ? 'Bugs 101 Daily' : 'All Bugs Daily';

  // Pull saved state — handles both fresh finish and page-reload replay
  const existingResult = loadDailyState(mode, today);
  const wasSolved = existingResult?.solved ?? solved;
  const guessCount = existingResult?.guesses ?? guesses.length;

  const resultLabel = wasSolved ? `Solved in ${guessCount}/${maxGuesses}!` : 'The answer was:';
  const badgeClass = wasSolved ? 'win' : 'lose';

  // Display name and scientific/order name depend on mode
  const speciesName = data.answer_common;
  const scientificName = mode === 'bugs101' ? data.answer_order : data.answer_species;

  container.innerHTML = `
    <div class="container daily-reveal">
      <div style="padding:12px 0 8px;"><h2 style="font-size:18px;">${modeLabel} #${challengeNumber}</h2></div>

      <img class="daily-reveal-image" src="${base}/data/${data.reveal}" alt="${escapeHTML(speciesName)}">

      <div class="daily-result-badge ${badgeClass}">${resultLabel}</div>

      <div class="daily-species-name">${escapeHTML(speciesName)}</div>
      <div class="daily-species-scientific">${escapeHTML(scientificName)}</div>

      ${data.wikipedia_summary ? `<div class="daily-blurb">${escapeHTML(data.wikipedia_summary)}</div>` : ''}

      <div class="daily-attribution">
        ${escapeHTML(data.attribution || '')}
        ${data.inat_url ? ` · <a href="${escapeHTML(data.inat_url)}" target="_blank" rel="noopener" style="color:var(--accent);">View on iNaturalist</a>` : ''}
      </div>

      <div class="daily-streaks">
        <div class="daily-streak-box">
          <div class="daily-streak-number">${streaks.playStreak}</div>
          <div class="daily-streak-label">Day streak</div>
        </div>
        <div class="daily-streak-box">
          <div class="daily-streak-number">${streaks.winStreak}</div>
          <div class="daily-streak-label">Win streak</div>
        </div>
      </div>

      <button class="daily-share-btn" id="daily-share-btn">Share Result</button>

      <div id="share-options" style="display:none;margin-top:8px;"></div>

      <div class="daily-countdown">Next bug in <strong>${countdown.hours}h ${countdown.minutes}m</strong></div>

      <div style="margin-top:16px;"><a href="${base}/" style="color:var(--accent);font-size:14px;">Back to home</a></div>
    </div>
  `;

  setupShareButton(wasSolved, guessCount, existingResult);
}

/** Wire up the share button and its expandable share-option buttons. */
function setupShareButton(wasSolved, guessCount, existingResult) {
  const shareBtn = document.getElementById('daily-share-btn');
  shareBtn.addEventListener('click', () => {
    const guessResults = (existingResult?.guessHistory || guesses).map(g => g.correct);
    const shareText = generateDailyShareText({
      mode,
      challengeNumber,
      solved: wasSolved,
      guesses: guessResults,
      maxGuesses,
    });

    // Expand the share options row
    const shareOpts = document.getElementById('share-options');
    shareOpts.style.display = 'flex';
    shareOpts.style.gap = '8px';
    shareOpts.style.justifyContent = 'center';
    shareOpts.style.flexWrap = 'wrap';

    shareOpts.innerHTML = `
      <button class="mode-btn" style="padding:8px 14px;font-size:13px;" id="share-copy">Copy</button>
      <button class="mode-btn" style="padding:8px 14px;font-size:13px;" id="share-whatsapp">WhatsApp</button>
      <button class="mode-btn" style="padding:8px 14px;font-size:13px;" id="share-imessage">iMessage</button>
      <button class="mode-btn" style="padding:8px 14px;font-size:13px;" id="share-twitter">X</button>
      ${canNativeShare() ? '<button class="mode-btn" style="padding:8px 14px;font-size:13px;" id="share-native">Share</button>' : ''}
    `;

    document.getElementById('share-copy')?.addEventListener('click', async () => {
      const ok = await copyToClipboard(shareText);
      const btn = document.getElementById('share-copy');
      if (btn) btn.textContent = ok ? 'Copied!' : 'Failed';
    });
    document.getElementById('share-whatsapp')?.addEventListener('click', () => openWhatsApp(shareText));
    document.getElementById('share-imessage')?.addEventListener('click', () => openIMessage(shareText));
    document.getElementById('share-twitter')?.addEventListener('click', () => openTweetIntent(shareText));
    document.getElementById('share-native')?.addEventListener('click', () => nativeShare(shareText));

    shareClicked = true;
  });
}
