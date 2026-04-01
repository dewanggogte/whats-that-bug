/**
 * Game UI — DOM rendering and event handling for the game page.
 * Imports pure logic from game-engine.js, feedback.js, and share.js.
 */

import { SessionState } from './game-engine.js';
import { generateShareText, copyToClipboard, openTweetIntent } from './share.js';
import { logSessionStart, logSessionEnd, logRoundComplete, logRoundReaction, logSessionFeedback } from './feedback.js';

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
  // Simple orders — one name fits all
  const names = {
    'Coleoptera': 'Beetle',
    'Hemiptera': 'True Bug',
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

let session = null;
let currentRound = null;
let roundStartTime = null;
let shareWasClicked = false;
let currentSetKey = 'all_bugs';

// DOM references (set in initGame)
let container = null;

/**
 * Initialize the game. Called from play.astro.
 */
export async function initGame() {
  container = document.getElementById('game-container');

  // Load data files
  const [obsRes, taxRes, setsRes] = await Promise.all([
    fetch('/data/observations.json'),
    fetch('/data/taxonomy.json'),
    fetch('/data/sets.json'),
  ]);

  const observations = await obsRes.json();
  const taxonomy = await taxRes.json();
  const sets = await setsRes.json();

  // Get set from URL params
  const params = new URLSearchParams(window.location.search);
  currentSetKey = params.get('set') || 'all_bugs';
  const setDef = sets[currentSetKey];

  if (!setDef) {
    container.innerHTML = `<div class="container"><p>Set "${currentSetKey}" not found. <a href="/">Back to sets</a></p></div>`;
    return;
  }

  // Start session
  session = new SessionState(observations, taxonomy, setDef);
  logSessionStart(session.sessionId, setDef.name);

  startRound();
}

function startRound() {
  currentRound = session.nextRound();
  if (!currentRound) {
    renderSummary();
    return;
  }
  roundStartTime = Date.now();
  renderRound();
}

function renderRound() {
  const { correct, choices } = currentRound;

  container.innerHTML = `
    <div class="container">
      <div class="top-bar">
        <span>Round ${session.currentRound} of 10</span>
        <span>Score: ${session.totalScore}</span>
        <span>${session.setDef.name}</span>
      </div>

      <div class="photo-hero">
        <img src="${correct.photo_url}" alt="Mystery bug" loading="eager">
        <span class="photo-credit">${correct.attribution}</span>
      </div>

      <h2 style="margin-top: 16px;">What's this bug?</h2>
      <p class="subtitle">Found in ${correct.location}</p>

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
            <div class="choice-name">${displayName}</div>
            <div class="choice-latin">${displayLatin}</div>
          </div>
        `}).join('')}
      </div>
    </div>
  `;

  // Attach click handlers
  const choiceEls = container.querySelectorAll('.choice');
  choiceEls.forEach((el, i) => {
    el.addEventListener('click', () => handleAnswer(choices[i], choices, choiceEls));
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
      breadcrumb = `Same genus (${correct.taxon.genus}) — look for subtle differences.`;
    } else if (score >= 50) {
      breadcrumb = `Same family (${correct.taxon.family}) — you're in the right ballpark!`;
    } else if (score >= 25) {
      breadcrumb = `Same order (${correct.taxon.order}) — right group, wrong family.`;
    } else {
      const isBugs101Mode = session.setDef.scoring === 'binary';
      if (isBugs101Mode) {
        breadcrumb = `You guessed ${getBugs101Name(picked.taxon)}, but this is a ${getBugs101Name(correct.taxon)}.`;
      } else {
        breadcrumb = `You guessed ${picked.taxon.order}, but this is ${correct.taxon.order}.`;
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
        <strong>${correct.taxon.common_name}</strong> (<em>${correct.taxon.species}</em>)
        ${blurb ? `<br>${blurb}` : ''}
        ${breadcrumb ? `<br><br>${breadcrumb}` : ''}
      </div>
      <div style="margin-top: 8px;">
        <span class="badge ${badgeClass}">+${score} pts</span>
        <a href="${correct.inat_url}" target="_blank" rel="noopener" style="margin-left: 12px; font-size: 13px;">Learn more →</a>
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
          <a href="/" class="btn btn-outline">Change Set</a>
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
            <option value="${i + 1}">Round ${i + 1}: ${h.correct_taxon.common_name}</option>
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
  let shared = false;
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
    logSessionEnd(session.sessionId, session.totalScore, 10, session.setDef.name, true, shared);
    // Reload with same set
    window.location.reload();
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

  // Log session end (without share info — updated on play-again click)
  logSessionEnd(session.sessionId, session.totalScore, 10, session.setDef.name, true, false);
}
