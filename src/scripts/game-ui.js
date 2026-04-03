/**
 * Game UI — DOM rendering and event handling for the game page.
 * Imports pure logic from game-engine.js, feedback.js, and share.js.
 */

import { SessionState } from './game-engine.js';
import { generateShareText, copyToClipboard, openTweetIntent } from './share.js';
import { logSessionStart, logSessionEnd, logRoundComplete, logRoundReaction, logSessionFeedback, logBadPhoto } from './feedback.js';

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Get a beginner-friendly display name for Bugs 101 mode.
 * Uses family-level distinction for ambiguous orders where one order
 * contains visually/conceptually different groups (bees vs ants,
 * butterflies vs moths, dragonflies vs damselflies, etc.)
 */
const BEE_FAMILIES = ['Apidae', 'Megachilidae', 'Halictidae', 'Andrenidae', 'Colletidae'];
const ANT_FAMILIES = ['Formicidae', 'Mutillidae'];
const BUTTERFLY_FAMILIES = ['Nymphalidae', 'Papilionidae', 'Pieridae', 'Lycaenidae', 'Riodinidae', 'Hesperiidae'];
const CRICKET_FAMILIES = ['Gryllidae', 'Rhaphidophoridae', 'Anostostomatidae', 'Tettigoniidae'];
const DAMSELFLY_FAMILIES = ['Coenagrionidae', 'Calopterygidae', 'Lestidae', 'Platycnemididae', 'Platystictidae'];
const CICADA_FAMILIES = ['Cicadidae'];
const STINK_BUG_FAMILIES = ['Pentatomidae', 'Scutelleridae', 'Acanthosomatidae', 'Cydnidae', 'Tessaratomidae'];
const PLANTHOPPER_FAMILIES = ['Fulgoridae', 'Flatidae', 'Membracidae', 'Ischnorhinidae'];
const APHID_FAMILIES = ['Aphididae', 'Eriococcidae'];
const WATER_BUG_FAMILIES = ['Nepidae', 'Notonectidae', 'Belostomatidae'];

function getBugs101Name(taxon) {
  // Hymenoptera: bees, ants, wasps
  if (taxon.order === 'Hymenoptera') {
    if (BEE_FAMILIES.includes(taxon.family)) return 'Bee';
    if (ANT_FAMILIES.includes(taxon.family)) return 'Ant';
    return 'Wasp';
  }
  // Lepidoptera: butterflies vs moths
  if (taxon.order === 'Lepidoptera') {
    return BUTTERFLY_FAMILIES.includes(taxon.family) ? 'Butterfly' : 'Moth';
  }
  // Orthoptera: grasshoppers, crickets, katydids
  if (taxon.order === 'Orthoptera') {
    if (CRICKET_FAMILIES.includes(taxon.family)) return 'Cricket';
    return 'Grasshopper';
  }
  // Odonata: dragonflies vs damselflies
  if (taxon.order === 'Odonata') {
    return DAMSELFLY_FAMILIES.includes(taxon.family) ? 'Damselfly' : 'Dragonfly';
  }
  // Hemiptera: cicadas, stink bugs, planthoppers, aphids, water bugs, etc.
  if (taxon.order === 'Hemiptera') {
    if (CICADA_FAMILIES.includes(taxon.family)) return 'Cicada';
    if (STINK_BUG_FAMILIES.includes(taxon.family)) return 'Stink Bug';
    if (PLANTHOPPER_FAMILIES.includes(taxon.family)) return 'Planthopper';
    if (APHID_FAMILIES.includes(taxon.family)) return 'Aphid';
    if (WATER_BUG_FAMILIES.includes(taxon.family)) return 'Water Bug';
    return 'True Bug';
  }
  // Simple orders — one name fits all
  const names = {
    'Coleoptera': 'Beetle',
    'Ixodida': 'Tick',
    'Araneae': 'Spider',
    'Scorpiones': 'Scorpion',
    'Opiliones': 'Harvestman',
    'Mantodea': 'Mantis',
    'Diptera': 'Fly',
    'Phasmida': 'Stick Insect',
    'Neuroptera': 'Lacewing',
    'Blattodea': 'Cockroach',
    'Dermaptera': 'Earwig',
    'Ephemeroptera': 'Mayfly',
    'Trichoptera': 'Caddisfly',
  };
  return names[taxon.order] || taxon.order_common || taxon.order;
}

const base = window.__BASE || '';

let session = null;
let currentRound = null;
let roundStartTime = null;
let currentSetKey = 'all_bugs';
let sessionEndSent = false;
let shared = false;

function sendSessionEnd() {
  if (sessionEndSent || !session) return;
  sessionEndSent = true;
  logSessionEnd(
    session.sessionId,
    session.totalScore,
    session.currentRound,
    session.setDef.name,
    session.isComplete,
    shared
  );
}

// DOM references (set in initGame)
let container = null;

/**
 * Initialize the game. Called from play.astro.
 */
export async function initGame() {
  container = document.getElementById('game-container');
  container.setAttribute('aria-live', 'polite');

  // Load data files
  let observations, taxonomy, sets;
  try {
    const [obsRes, taxRes, setsRes] = await Promise.all([
      fetch(`${base}/data/observations.json`),
      fetch(`${base}/data/taxonomy.json`),
      fetch(`${base}/data/sets.json`),
    ]);

    if (!obsRes.ok || !taxRes.ok || !setsRes.ok) {
      throw new Error('One or more data files failed to load');
    }

    observations = await obsRes.json();
    taxonomy = await taxRes.json();
    sets = await setsRes.json();
  } catch (err) {
    container.innerHTML = `<div class="container"><p>Failed to load game data. Please refresh the page to try again.</p><p style="color:var(--text-secondary);font-size:13px;">${escapeHTML(err.message)}</p></div>`;
    return;
  }

  // Get set from URL params
  const params = new URLSearchParams(window.location.search);
  currentSetKey = params.get('set') || 'all_bugs';
  const setDef = sets[currentSetKey];

  if (!setDef) {
    container.innerHTML = `<div class="container"><p>Set "${escapeHTML(currentSetKey)}" not found. <a href="${base}/">Back to sets</a></p></div>`;
    return;
  }

  // Start session
  session = new SessionState(observations, taxonomy, setDef, currentSetKey);
  logSessionStart(session.sessionId, setDef.name);
  sessionEndSent = false;
  shared = false;
  window.addEventListener('pagehide', sendSessionEnd);
  window.addEventListener('beforeunload', sendSessionEnd);

  startRound();
}

function startRound() {
  currentRound = session.nextRound();
  if (!currentRound) {
    renderSummary();
    window.scrollTo({ top: 0 });
    return;
  }
  roundStartTime = Date.now();
  renderRound();
  window.scrollTo({ top: 0 });
}

function renderRound() {
  const { correct, choices } = currentRound;

  container.innerHTML = `
    <div class="container">
      <div class="top-bar">
        <a href="${base}/" style="text-decoration:none;color:var(--accent);">← Sets</a>
        <span>Round ${session.currentRound} of 10 · ${session.totalScore} pts</span>
        <span>${session.setDef.name}</span>
      </div>

      <div class="photo-hero">
        <img src="${escapeHTML(correct.photo_url)}" alt="Mystery bug" loading="eager">
        <span class="photo-credit">${escapeHTML(correct.attribution)}</span>
        <button class="report-photo-btn" id="report-photo" title="Report bad photo">&#9873;</button>
      </div>

      <h2 style="margin-top: 16px;">What's this bug?</h2>
      <p class="subtitle">Found in ${escapeHTML(correct.location)}</p>

      <div class="choices" id="choices">
        ${choices.map((choice, i) => {
          const isBugs101 = session.setDef.scoring === 'binary';
          const displayName = isBugs101
            ? getBugs101Name(choice.taxon)
            : choice.taxon.common_name;
          const displayLatin = isBugs101
            ? choice.taxon.order
            : choice.taxon.species;
          return `
          <div class="choice" data-index="${i}" role="button" tabindex="0">
            <div class="choice-name">${escapeHTML(displayName)}</div>
            <div class="choice-latin">${escapeHTML(displayLatin)}</div>
          </div>
        `}).join('')}
      </div>
    </div>
  `;

  // Remove any accidental focus from the freshly rendered choices
  if (document.activeElement) document.activeElement.blur();

  // Attach click and keyboard handlers
  const choiceEls = container.querySelectorAll('.choice');
  choiceEls.forEach((el, i) => {
    const handler = () => handleAnswer(choices[i], choices, choiceEls);
    el.addEventListener('click', handler);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handler();
      }
    });
  });

  // Report bad photo
  container.querySelector('#report-photo')?.addEventListener('click', () => {
    logBadPhoto(session.sessionId, correct.id, correct.taxon.species, session.setDef.name);
    const btn = container.querySelector('#report-photo');
    btn.textContent = '\u2713';
    btn.disabled = true;
  });
}

function handleAnswer(picked, choices, choiceEls) {
  const timeTaken = Date.now() - roundStartTime;
  const result = session.submitAnswer(picked.taxon);
  const { score, correct } = result;

  // Disable all choices
  choiceEls.forEach(el => {
    el.style.pointerEvents = 'none';
  });

  // Highlight choices
  const isBugs101 = session.setDef.scoring === 'binary';
  choices.forEach((choice, i) => {
    const el = choiceEls[i];
    if (isBugs101) {
      // Bugs 101: match by order
      if (choice.taxon.order === correct.taxon.order) {
        el.classList.add('correct');
      } else if (choice.taxon.order === picked.taxon.order) {
        el.classList.add('miss');
      }
    } else {
      if (choice.taxon.species === correct.taxon.species) {
        el.classList.add('correct');
      } else if (choice.taxon.species === picked.taxon.species) {
        if (score >= 50) el.classList.add('close');
        else el.classList.add('miss');
      }
    }
  });

  // Log round event
  logRoundComplete(
    session.sessionId,
    session.currentRound,
    correct.id,
    picked.taxon.species,
    correct.taxon.species,
    score,
    timeTaken,
    session.setDef.name
  );

  // Determine feedback tier
  let feedbackClass, feedbackTitle;
  if (score === 100) { feedbackClass = 'exact'; feedbackTitle = 'Nailed it!'; }
  else if (score >= 50) { feedbackClass = 'close'; feedbackTitle = 'So close!'; }
  else { feedbackClass = 'miss'; feedbackTitle = 'Not quite'; }

  // Build taxonomy breadcrumb for misses
  let breadcrumb = '';
  if (score < 100) {
    if (score >= 75) {
      breadcrumb = `Same genus (${escapeHTML(correct.taxon.genus)}) — look for subtle differences.`;
    } else if (score >= 50) {
      breadcrumb = `Same family (${escapeHTML(correct.taxon.family)}) — you're in the right ballpark!`;
    } else if (score >= 25) {
      breadcrumb = `Same order (${escapeHTML(correct.taxon.order)}) — right group, wrong family.`;
    } else {
      const isBugs101Mode = session.setDef.scoring === 'binary';
      if (isBugs101Mode) {
        breadcrumb = `You guessed ${escapeHTML(getBugs101Name(picked.taxon))}, but this is a ${escapeHTML(getBugs101Name(correct.taxon))}.`;
      } else {
        breadcrumb = `You guessed ${escapeHTML(picked.taxon.order)}, but this is ${escapeHTML(correct.taxon.order)}.`;
      }
    }
  }

  // Species blurb — trim to last sentence boundary to avoid mid-word cutoff
  let blurb = correct.wikipedia_summary || '';
  if (blurb && !blurb.match(/[.!?]$/)) {
    const lastSentence = blurb.lastIndexOf('. ');
    if (lastSentence > 40) {
      blurb = blurb.slice(0, lastSentence + 1);
    } else {
      const lastSpace = blurb.lastIndexOf(' ');
      blurb = lastSpace > 20 ? blurb.slice(0, lastSpace) + '...' : blurb + '...';
    }
  }

  // Badge text
  const badgeClass = score === 100 ? 'badge-success' : score >= 50 ? 'badge-warning' : 'badge-error';

  // Render feedback card
  const feedbackHTML = `
    <div class="feedback-card ${feedbackClass}" style="margin-top: 16px;">
      <div class="feedback-title">${feedbackTitle}</div>
      <div class="feedback-body">
        <strong>${escapeHTML(correct.taxon.common_name)}</strong> (<em>${escapeHTML(correct.taxon.species)}</em>)
        ${blurb ? `<br>${escapeHTML(blurb)}` : ''}
        ${breadcrumb ? `<br><br>${breadcrumb}` : ''}
      </div>
      <div style="margin-top: 8px;">
        <span class="badge ${badgeClass}">+${score} pts</span>
        <a href="${escapeHTML(correct.inat_url)}" target="_blank" rel="noopener" style="margin-left: 12px; font-size: 13px;">Learn more →</a>
      </div>
      <div class="reactions" id="reactions">
        <button class="reaction-btn" data-difficulty="too_easy">Too Easy</button>
        <button class="reaction-btn" data-difficulty="just_right">Just Right</button>
        <button class="reaction-btn" data-difficulty="too_hard">Too Hard</button>
      </div>
    </div>
    <div style="text-align: center; margin-top: 16px;">
      <button class="btn btn-primary" id="next-btn">
        ${session.isComplete ? 'See Results' : 'Next Round →'}
      </button>
    </div>
  `;

  container.querySelector('.container').insertAdjacentHTML('beforeend', feedbackHTML);

  // Scroll the feedback card into view on mobile
  setTimeout(() => {
    container.querySelector('#next-btn')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 300);

  // Reaction button handlers
  container.querySelectorAll('.reaction-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.reaction-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      logRoundReaction(
        session.sessionId,
        session.currentRound,
        correct.id,
        btn.dataset.difficulty,
        picked.taxon.species,
        correct.taxon.species,
        score,
        session.setDef.name
      );
    });
  });

  // Next button
  container.querySelector('#next-btn').addEventListener('click', startRound);
}

function renderSummary() {
  const exactCount = session.history.filter(h => h.score === 100).length;
  const closeCount = session.history.filter(h => h.score >= 50 && h.score < 100).length;
  const missCount = session.history.filter(h => h.score < 50).length;
  const shareText = generateShareText(
    session.totalScore,
    session.history,
    session.setDef.name,
    session.bestStreak
  );

  // Save best score to localStorage (use set key, not name, for consistency with landing page)
  const storageKey = `best_${currentSetKey}`;
  const prevBest = parseInt(localStorage.getItem(storageKey) || '0', 10);
  if (session.totalScore > prevBest) {
    localStorage.setItem(storageKey, session.totalScore.toString());
  }

  container.innerHTML = `
    <div class="container">
      <div class="summary">
        <h1>🪲 What's That Bug?</h1>
        <div class="summary-score">${session.totalScore} / 1000</div>
        <div class="summary-breakdown">${exactCount} exact · ${closeCount} close · ${missCount} misses</div>
        <div class="emoji-grid">${session.history.map(h =>
          h.score === 100 ? '🟩' : h.score >= 50 ? '🟨' : '🟥'
        ).join('')}</div>
        <p class="subtitle">Best streak: ${session.bestStreak} · Set: ${session.setDef.name}</p>

        <div class="share-buttons">
          <button class="btn btn-outline" id="copy-btn">📋 Copy</button>
          <button class="btn btn-outline" id="tweet-btn">𝕏 Post</button>
        </div>

        <div style="margin-top: 24px; display: flex; gap: 12px; justify-content: center;">
          <button class="btn btn-primary" id="play-again-btn">Play Again</button>
          <a href="${base}/" class="btn btn-outline" id="change-set-btn">Change Set</a>
        </div>
      </div>

      <div class="feedback-form" id="session-feedback">
        <h3 style="margin-bottom: 12px;">How was that?</h3>
        <label for="difficulty-rating">Overall difficulty</label>
        <input type="range" id="difficulty-rating" min="1" max="5" value="3" style="width:100%">
        <div style="display:flex; justify-content:space-between; font-size:12px; color:var(--text-secondary); margin-top:-8px; margin-bottom:12px;">
          <span>Too Easy</span><span>Just Right</span><span>Too Hard</span>
        </div>

        <label for="interesting-round">Most interesting round?</label>
        <select id="interesting-round">
          <option value="">Skip</option>
          ${session.history.map((h, i) => `
            <option value="${i + 1}">Round ${i + 1}: ${escapeHTML(h.correct_taxon.common_name)}</option>
          `).join('')}
        </select>

        <label for="free-text">Anything feel off?</label>
        <textarea id="free-text" placeholder="Options too obvious? Names too technical? Bugs too obscure?"></textarea>

        <label>Would you play again?</label>
        <div style="display:flex; gap:8px; margin-bottom:12px;">
          <button class="reaction-btn" data-play-again="yes">Yes</button>
          <button class="reaction-btn" data-play-again="maybe">Maybe</button>
          <button class="reaction-btn" data-play-again="no">No</button>
        </div>

        <button class="btn btn-primary" id="submit-feedback" style="width:100%">Send Feedback</button>
      </div>
    </div>
  `;

  // Share handlers
  container.querySelector('#copy-btn').addEventListener('click', async () => {
    const ok = await copyToClipboard(shareText);
    const btn = container.querySelector('#copy-btn');
    btn.textContent = ok ? '✓ Copied!' : 'Failed';
    shared = true;
    setTimeout(() => { btn.textContent = '📋 Copy'; }, 2000);
  });

  container.querySelector('#tweet-btn').addEventListener('click', () => {
    openTweetIntent(shareText);
    shared = true;
  });

  // Play again
  container.querySelector('#play-again-btn').addEventListener('click', () => {
    sendSessionEnd();
    window.location.reload();
  });

  // Change set — ensure session_end fires before navigation
  container.querySelector('#change-set-btn').addEventListener('click', () => {
    sendSessionEnd();
  });

  // Session feedback form
  let playAgainValue = '';
  container.querySelectorAll('[data-play-again]').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('[data-play-again]').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      playAgainValue = btn.dataset.playAgain;
    });
  });

  container.querySelector('#submit-feedback').addEventListener('click', () => {
    logSessionFeedback(
      session.sessionId,
      session.totalScore,
      session.setDef.name,
      container.querySelector('#difficulty-rating').value,
      container.querySelector('#interesting-round').value,
      container.querySelector('#free-text').value,
      playAgainValue
    );
    const btn = container.querySelector('#submit-feedback');
    btn.textContent = '✓ Thanks!';
    btn.disabled = true;
  });
}
