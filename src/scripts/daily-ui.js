// src/scripts/daily-ui.js
/**
 * Daily challenge UI — DOM rendering and event handling.
 * Supports two modes: bugs101 (3 guesses) and allbugs (6 guesses).
 *
 * Flow: initDaily() → showDailyRulesPopup() → renderGame() → submitGuess() → renderReveal()
 * On replay (already completed today): initDaily() → loadChallenge() → renderReveal()
 */

import {
  getTodayET, getChallengeNumber, validateGuess,
  loadDailyState, saveDailyResult, loadHistory,
  calculateStreaks, getCountdownToReset,
} from './daily-engine.js';
import { generateDailyShareText, getDailyFlavor } from './daily-share.js';
import { copyToClipboard, openWhatsApp, openIMessage, openTweetIntent, canNativeShare, nativeShare } from './share.js';
import { logDailyStart, logDailyGuess, logDailyComplete } from './feedback.js';

const base = window.__BASE || '';

// ===== SVG Icon Constants (matches game-ui.js) =====
const SHARE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>';
const WHATSAPP_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';
const IMESSAGE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
const TWITTER_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>';
const CLIPBOARD_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

// Bugs 101 autocomplete list — matches getBugs101Name categories in game-ui.js
const BUGS101_OPTIONS = [
  'Ant', 'Aphid', 'Bee', 'Beetle', 'Butterfly', 'Caddisfly', 'Cicada',
  'Cockroach', 'Cricket', 'Damselfly', 'Dragonfly', 'Earwig', 'Fly',
  'Grasshopper', 'Harvestman', 'Isopods', 'Lacewing', 'Mantis', 'Mayfly', 'Moth',
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

  // Show rules popup, then start game on dismiss
  showDailyRulesPopup(() => {
    renderGame();
  });
}

// ===== RULES POPUP =====

function showDailyRulesPopup(onDismiss) {
  const modeLabel = mode === 'bugs101' ? 'Bugs 101 Daily' : 'All Bugs Daily';
  const guessInfo = mode === 'bugs101' ? '3 guesses \u00b7 Name the type' : '6 guesses \u00b7 Name the species';

  const items = [
    ['\ud83d\udcf7', "You're looking at a close-up of an insect"],
    ['\ud83d\udd0d', 'Wrong guesses zoom out \u2014 revealing more'],
    ['\ud83c\udfaf', guessInfo],
  ];

  const itemsHTML = items.map(([icon, text]) =>
    `<div class="rules-item"><span class="rules-item-icon">${icon}</span><span>${text}</span></div>`
  ).join('');

  const overlay = document.createElement('div');
  overlay.className = 'rules-overlay';
  overlay.innerHTML = `
    <div class="rules-card">
      <button class="rules-close" aria-label="Close">&times;</button>
      <div class="rules-title">\ud83e\udeb2 ${modeLabel} #${challengeNumber}</div>
      <div class="rules-items">${itemsHTML}</div>
    </div>
  `;

  document.body.appendChild(overlay);

  const dismiss = () => {
    if (overlay.parentNode) {
      overlay.remove();
      onDismiss();
    }
  };

  overlay.querySelector('.rules-close').addEventListener('click', dismiss);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) dismiss();
  });

  setTimeout(dismiss, 5000);
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

/** Returns the correct answer text for display and validation. */
function getAnswer() {
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

  // Build input area: pill grid for bugs101, text search for allbugs
  let inputAreaHTML;
  if (mode === 'bugs101') {
    inputAreaHTML = `
      <div class="daily-pill-grid" id="pill-grid">
        ${BUGS101_OPTIONS.map(name =>
          `<button class="daily-pill" data-value="${escapeHTML(name)}">${escapeHTML(name)}</button>`
        ).join('')}
      </div>
      <div class="daily-input-row">
        <button class="daily-submit" id="submit-btn" disabled>Go</button>
      </div>
    `;
  } else {
    inputAreaHTML = `
      <div class="daily-input-row">
        <div class="daily-input-wrapper">
          <input type="text" class="daily-input" id="guess-input"
            placeholder="Type species name..."
            autocomplete="off" autocorrect="off" spellcheck="false">
          <div class="daily-autocomplete" id="autocomplete"></div>
        </div>
        <button class="daily-submit" id="submit-btn" disabled>Go</button>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="container">
      <div class="top-bar">
        <a href="${base}/" style="text-decoration:none;color:var(--accent);">\u2190 Home</a>
        <span>${modeLabel} #${challengeNumber}</span>
        <span>${currentGuess + 1} / ${maxGuesses}</span>
      </div>

      <div class="daily-image-container" id="daily-image">
        <img src="${base}/data/${crops[currentGuess]}" alt="Crop ${currentGuess + 1}">
      </div>

      <div class="daily-history" id="daily-history"></div>

      <div class="daily-wrong-guesses" id="wrong-guesses"></div>

      ${inputAreaHTML}
    </div>
  `;

  renderHistoryStrip();

  if (mode === 'bugs101') {
    setupPillGrid();
  } else {
    setupAutocomplete();
  }
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

/** Update the wrong guesses display with pill-style tags. */
function renderWrongGuesses() {
  const el = document.getElementById('wrong-guesses');
  if (!el) return;
  el.innerHTML = guesses
    .filter(g => !g.correct)
    .map(g => `<span class="daily-wrong-guess">\u2717 ${escapeHTML(g.answer)}</span>`)
    .join('');
}

// ===== PILL GRID (Bugs 101) =====

function setupPillGrid() {
  const grid = document.getElementById('pill-grid');
  const submitBtn = document.getElementById('submit-btn');
  if (!grid) return;

  grid.addEventListener('click', (e) => {
    const pill = e.target.closest('.daily-pill');
    if (!pill) return;

    // Deselect previously selected pill
    const prev = grid.querySelector('.daily-pill.selected');
    if (prev) prev.classList.remove('selected');

    // Select this pill
    pill.classList.add('selected');
    selectedAnswer = pill.getAttribute('data-value');
    submitBtn.disabled = false;
  });
}

// ===== AUTOCOMPLETE (All Bugs) =====

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

    // allbugs: search both common name and scientific name
    const matches = allSpeciesList
      .filter(s =>
        s.common.toLowerCase().includes(query) ||
        s.species.toLowerCase().includes(query)
      )
      .slice(0, 15)
      .map(s => ({ label: s.common, value: s.common, scientific: s.species }));

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

  const answer = getAnswer();
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
      // Show the next crop with a fade transition
      const crops = getCrops();
      const imgEl = document.querySelector('#daily-image img');
      if (imgEl) {
        imgEl.style.opacity = '0';
        const newSrc = `${base}/data/${crops[currentGuess]}`;
        const tempImg = new Image();
        tempImg.onload = () => {
          imgEl.src = newSrc;
          imgEl.style.opacity = '1';
        };
        tempImg.onerror = () => {
          imgEl.src = newSrc;
          imgEl.style.opacity = '1';
        };
        tempImg.src = newSrc;
      }

      // Update guess counter in top bar
      const topBarSpans = container.querySelectorAll('.top-bar span');
      if (topBarSpans.length >= 2) {
        topBarSpans[topBarSpans.length - 1].textContent = `${currentGuess + 1} / ${maxGuesses}`;
      }

      renderHistoryStrip();
      renderWrongGuesses();

      // Reset selection for next guess
      selectedAnswer = '';
      document.getElementById('submit-btn').disabled = true;

      if (mode === 'bugs101') {
        // Deselect any selected pill
        const prev = document.querySelector('.daily-pill.selected');
        if (prev) prev.classList.remove('selected');
      } else {
        const input = document.getElementById('guess-input');
        if (input) {
          input.value = '';
          input.focus();
        }
      }
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
  const guessHistory = existingResult?.guessHistory || guesses;

  const resultLabel = wasSolved ? `Solved in ${guessCount}/${maxGuesses}!` : 'The answer was:';
  const badgeClass = wasSolved ? 'win' : 'lose';

  // Build emoji grid from guess results
  const emojiGrid = guessHistory
    .map(g => g.correct ? '\ud83d\udfe9' : '\ud83d\udfe5')
    .join('') + (wasSolved ? '\u2b1c'.repeat(maxGuesses - guessCount) : '');

  // Display name and scientific/order name depend on mode
  const speciesName = data.answer_common;
  const scientificName = mode === 'bugs101' ? data.answer_order : data.answer_species;

  // Flavor text for share section
  const flavorText = getDailyFlavor(guessCount, wasSolved);

  // Build share text for handlers
  const guessResults = guessHistory.map(g => g.correct);
  const shareText = generateDailyShareText({
    mode,
    challengeNumber,
    solved: wasSolved,
    guesses: guessResults,
    maxGuesses,
  });

  container.innerHTML = `
    <div class="container daily-reveal">
      <div class="top-bar">
        <a href="${base}/" style="text-decoration:none;color:var(--accent);">\u2190 Home</a>
        <span>${modeLabel} #${challengeNumber}</span>
        <span>${wasSolved ? '\u2705' : '\u274c'}</span>
      </div>

      <img class="daily-reveal-image" src="${base}/data/${data.reveal}" alt="${escapeHTML(speciesName)}">

      <div class="daily-result-badge ${badgeClass}">${resultLabel}</div>

      <div class="daily-species-name">${escapeHTML(speciesName)}</div>
      <div class="daily-species-scientific">${escapeHTML(scientificName)}</div>

      ${data.wikipedia_summary ? `<div class="daily-blurb">${escapeHTML(data.wikipedia_summary)}</div>` : ''}

      <div class="daily-attribution">
        ${escapeHTML(data.attribution || '')}
        ${data.inat_url ? ` \u00b7 <a href="${escapeHTML(data.inat_url)}" target="_blank" rel="noopener" style="color:var(--accent);">View on iNaturalist</a>` : ''}
      </div>

      <div class="emoji-grid">${emojiGrid}</div>

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

      <div class="share-section">
        <p class="share-flavor">${escapeHTML(flavorText)}</p>
        <button class="btn btn-primary btn-share-hero" id="share-hero-btn">
          ${SHARE_ICON}
          Challenge a Friend
        </button>
        <div class="share-buttons-secondary">
          <button class="btn btn-outline share-icon-btn" id="whatsapp-btn" title="WhatsApp" aria-label="Share on WhatsApp">${WHATSAPP_ICON}</button>
          <button class="btn btn-outline share-icon-btn" id="imessage-btn" title="iMessage" aria-label="Share via iMessage">${IMESSAGE_ICON}</button>
          <button class="btn btn-outline share-icon-btn" id="tweet-btn" title="X" aria-label="Share on X">${TWITTER_ICON}</button>
          <button class="btn btn-outline share-icon-btn" id="copy-btn" title="Copy to clipboard" aria-label="Copy to clipboard">${CLIPBOARD_ICON}</button>
        </div>
      </div>

      <div class="daily-countdown">Next bug in <strong>${countdown.hours}h ${countdown.minutes}m</strong></div>

      <div style="margin-top:16px;"><a href="${base}/" style="color:var(--accent);font-size:14px;">Back to home</a></div>
    </div>
  `;

  attachShareHandlers(shareText);
}

/** Wire up share buttons using the same pattern as game-ui.js */
function attachShareHandlers(shareText) {
  const heroBtn = container.querySelector('#share-hero-btn');
  const heroOriginalHTML = heroBtn?.innerHTML;

  heroBtn?.addEventListener('click', async () => {
    shareClicked = true;
    if (canNativeShare()) {
      await nativeShare(shareText);
    } else {
      const ok = await copyToClipboard(shareText);
      heroBtn.textContent = ok ? 'Copied!' : 'Failed';
      setTimeout(() => { heroBtn.innerHTML = heroOriginalHTML; }, 2000);
    }
  });

  container.querySelector('#whatsapp-btn')?.addEventListener('click', () => {
    openWhatsApp(shareText);
    shareClicked = true;
  });

  container.querySelector('#imessage-btn')?.addEventListener('click', () => {
    openIMessage(shareText);
    shareClicked = true;
  });

  container.querySelector('#tweet-btn')?.addEventListener('click', () => {
    openTweetIntent(shareText);
    shareClicked = true;
  });

  container.querySelector('#copy-btn')?.addEventListener('click', async () => {
    const ok = await copyToClipboard(shareText);
    const btn = container.querySelector('#copy-btn');
    btn.innerHTML = ok ? '\u2713' : '\u2717';
    shareClicked = true;
    setTimeout(() => { btn.innerHTML = CLIPBOARD_ICON; }, 2000);
  });
}
