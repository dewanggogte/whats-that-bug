/**
 * Game UI — DOM rendering and event handling for the game page.
 * Supports three modes: classic (10 rounds), time_trial (60s), streak (until wrong).
 */

import { SessionState, calculateTimedScore } from './game-engine.js';
import { generateShareText, generateTimeTrialShareText, generateStreakShareText, copyToClipboard, openTweetIntent } from './share.js';
import { logSessionStart, logSessionEnd, logRoundComplete, logRoundReaction, logSessionFeedback, logBadPhoto } from './feedback.js';

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Bugs 101 display name logic
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
  if (taxon.order === 'Hymenoptera') {
    if (BEE_FAMILIES.includes(taxon.family)) return 'Bee';
    if (ANT_FAMILIES.includes(taxon.family)) return 'Ant';
    return 'Wasp';
  }
  if (taxon.order === 'Lepidoptera') {
    return BUTTERFLY_FAMILIES.includes(taxon.family) ? 'Butterfly' : 'Moth';
  }
  if (taxon.order === 'Orthoptera') {
    if (CRICKET_FAMILIES.includes(taxon.family)) return 'Cricket';
    return 'Grasshopper';
  }
  if (taxon.order === 'Odonata') {
    return DAMSELFLY_FAMILIES.includes(taxon.family) ? 'Damselfly' : 'Dragonfly';
  }
  if (taxon.order === 'Hemiptera') {
    if (CICADA_FAMILIES.includes(taxon.family)) return 'Cicada';
    if (STINK_BUG_FAMILIES.includes(taxon.family)) return 'Stink Bug';
    if (PLANTHOPPER_FAMILIES.includes(taxon.family)) return 'Planthopper';
    if (APHID_FAMILIES.includes(taxon.family)) return 'Aphid';
    if (WATER_BUG_FAMILIES.includes(taxon.family)) return 'Water Bug';
    return 'True Bug';
  }
  const names = {
    'Coleoptera': 'Beetle', 'Ixodida': 'Tick', 'Araneae': 'Spider',
    'Scorpiones': 'Scorpion', 'Opiliones': 'Harvestman', 'Mantodea': 'Mantis',
    'Diptera': 'Fly', 'Phasmida': 'Stick Insect', 'Neuroptera': 'Lacewing',
    'Blattodea': 'Cockroach', 'Dermaptera': 'Earwig', 'Ephemeroptera': 'Mayfly',
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

// Time Trial state
let timerInterval = null;
let timeRemaining = 60;

// Preloading state
let preloadQueue = [];
let preloadedImages = [];
let displayRound = 0; // Tracks actual round shown to player (separate from session.currentRound)
const PRELOAD_COUNT_TIME_TRIAL = 5;
const PRELOAD_COUNT_DEFAULT = 2;

function getPreloadCount() {
  if (!session) return PRELOAD_COUNT_DEFAULT;
  return session.mode === 'time_trial' ? PRELOAD_COUNT_TIME_TRIAL : PRELOAD_COUNT_DEFAULT;
}

function preloadNextImages() {
  const needed = getPreloadCount() - preloadQueue.length;
  for (let i = 0; i < needed; i++) {
    const round = session.nextRound();
    if (!round) break;
    const img = new Image();
    img.src = round.correct.photo_url;
    preloadQueue.push(round);
    preloadedImages.push(img);
  }
}

function getNextPreloadedRound() {
  let round;
  if (preloadQueue.length > 0) {
    preloadedImages.shift();
    round = preloadQueue.shift();
  } else {
    round = session.nextRound();
  }
  // Fix: set _currentCorrect so submitAnswer() compares against the right answer
  if (round) {
    session._currentCorrect = round.correct;
  }
  displayRound++;
  return round;
}

function sendSessionEnd() {
  if (sessionEndSent || !session) return;
  sessionEndSent = true;

  const extraData = session.mode === 'time_trial'
    ? { questions_answered: session.questionsAnswered, correct_count: session.correctCount }
    : undefined;

  logSessionEnd(
    session.sessionId,
    session.totalScore,
    session.currentRound,
    session.setDef.name,
    session.mode === 'classic' ? session.isComplete : true,
    shared,
    session.mode,
    extraData
  );
}

let container = null;

/**
 * Initialize the game. Called from play.astro.
 */
export async function initGame() {
  container = document.getElementById('game-container');
  container.setAttribute('aria-live', 'polite');

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

  const params = new URLSearchParams(window.location.search);
  currentSetKey = params.get('set') || 'all_bugs';
  const setDef = sets[currentSetKey];

  if (!setDef) {
    container.innerHTML = `<div class="container"><p>Set "${escapeHTML(currentSetKey)}" not found. <a href="${base}/">Back to sets</a></p></div>`;
    return;
  }

  session = new SessionState(observations, taxonomy, setDef, currentSetKey);
  logSessionStart(session.sessionId, setDef.name, session.mode);
  sessionEndSent = false;
  shared = false;
  window.addEventListener('pagehide', sendSessionEnd);
  window.addEventListener('beforeunload', sendSessionEnd);

  // Start preloading images
  preloadQueue = [];
  preloadedImages = [];
  displayRound = 0;
  preloadNextImages();

  // Show rules popup, then start game
  showRulesPopup(() => {
    if (session.mode === 'time_trial') {
      startTimeTrial();
    } else {
      startRound();
    }
  });
}

// ===== RULES POPUP =====

function getRulesContent() {
  const mode = session.mode;

  if (mode === 'time_trial') {
    return `<strong>60 seconds on the clock.</strong> Identify as many bugs as you can. Faster correct answers earn more points. Wrong answers score 0.`;
  }

  if (mode === 'streak') {
    return `<strong>How many can you get right in a row?</strong> No time pressure — but one wrong answer and it's over.`;
  }

  const isBinary = session.setDef.scoring === 'binary';

  if (isBinary) {
    return `<strong>Identify the bug type.</strong> 10 rounds, right = 100 points, wrong = 0. 1,000 points max.`;
  }

  return `<strong>Closer guess = more points.</strong> Exact species: 100 · Same genus: 75 · Same family: 50 · Same order: 25. 10 rounds, 1,000 points max.`;
}

function showRulesPopup(onDismiss) {
  const rulesText = getRulesContent();

  const overlay = document.createElement('div');
  overlay.className = 'rules-overlay';
  overlay.innerHTML = `
    <div class="rules-card">
      <button class="rules-close" aria-label="Close">&times;</button>
      <div class="rules-text">${rulesText}</div>
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

// ===== TIME TRIAL MODE =====

function startTimeTrial() {
  timeRemaining = 60;
  startRound();
  timerInterval = setInterval(() => {
    timeRemaining--;
    updateTimerDisplay();
    if (timeRemaining <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      renderTimeTrialSummary();
    }
  }, 1000);
}

function updateTimerDisplay() {
  const timerEl = container.querySelector('.timer-countdown');
  if (timerEl) {
    timerEl.textContent = `${timeRemaining}s`;
    if (timeRemaining <= 10) {
      timerEl.classList.add('urgent');
    }
  }
}

// ===== GENERIC ROUND =====

function startRound() {
  currentRound = getNextPreloadedRound();
  if (!currentRound) {
    if (session.mode === 'time_trial') {
      renderTimeTrialSummary();
    } else if (session.mode === 'streak') {
      renderStreakSummary();
    } else {
      renderClassicSummary();
    }
    window.scrollTo({ top: 0 });
    return;
  }

  // Preload more images in the background
  preloadNextImages();

  roundStartTime = Date.now();
  renderRound();
  window.scrollTo({ top: 0 });
}

function renderRound() {
  const { correct, choices } = currentRound;
  const mode = session.mode;

  // Top bar varies by mode
  let topBarHTML;
  if (mode === 'time_trial') {
    topBarHTML = `
      <div class="timer-bar">
        <a href="${base}/" style="text-decoration:none;color:var(--accent);">← Sets</a>
        <span class="timer-countdown">${timeRemaining}s</span>
        <span class="timer-score" style="position:relative;">
          ${session.totalScore} pts
          <span class="score-popup" id="score-popup"></span>
        </span>
      </div>
      <div style="text-align:center;padding:2px 0;">
        <span class="timer-last-time" id="last-time"></span>
      </div>
    `;
  } else if (mode === 'streak') {
    topBarHTML = `
      <div class="streak-bar">
        <a href="${base}/" style="text-decoration:none;color:var(--accent);position:absolute;left:16px;">← Sets</a>
        <span class="streak-count">${session.currentStreak}</span>
        <span class="streak-label">streaks</span>
      </div>
    `;
  } else {
    topBarHTML = `
      <div class="top-bar">
        <a href="${base}/" style="text-decoration:none;color:var(--accent);">← Sets</a>
        <span>Round ${displayRound} of 10 · ${session.totalScore} pts</span>
        <span>${session.setDef.name}</span>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="container" id="game-screen">
      ${topBarHTML}

      <div class="photo-hero">
        <img src="${escapeHTML(correct.photo_url)}" alt="Mystery bug" loading="eager">
        <span class="photo-credit">${escapeHTML(correct.attribution)}</span>
        <button class="report-photo-btn" id="report-photo" title="Report bad photo">&#9873;</button>
      </div>

      <h2 style="margin-top: 16px;">What's this bug?</h2>
      <p class="subtitle">Found in ${escapeHTML(correct.location)}</p>

      <div class="choices" id="choices">
        ${choices.map((choice, i) => {
          const isBugs101 = session.setDef.scoring === 'binary' && session.mode === 'classic';
          const displayName = isBugs101 ? getBugs101Name(choice.taxon) : choice.taxon.common_name;
          const displayLatin = isBugs101 ? choice.taxon.order : choice.taxon.species;
          return `
          <div class="choice" data-index="${i}" role="button" tabindex="0">
            <div class="choice-name">${escapeHTML(displayName)}</div>
            <div class="choice-latin">${escapeHTML(displayLatin)}</div>
          </div>
        `}).join('')}
      </div>
    </div>
  `;

  // Attach click handlers
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
  // Ensure _currentCorrect matches the displayed round (preloading may have overwritten it)
  session._currentCorrect = currentRound.correct;

  const timeTaken = Date.now() - roundStartTime;
  const mode = session.mode;

  // For time trial, override score with timed score
  let result;
  if (mode === 'time_trial') {
    // Submit to get correct answer reference, then calculate timed score
    result = session.submitAnswer(picked.taxon);
    const isCorrect = picked.taxon.species === result.correct.taxon.species;
    const timedScore = isCorrect ? calculateTimedScore(timeTaken) : 0;
    // Adjust: undo the binary 100 and apply timed score instead
    session.totalScore = session.totalScore - result.score + timedScore;
    session.history[session.history.length - 1].score = timedScore;
    if (result.score === 100 && timedScore !== 100) {
      // correctCount was incremented for binary 100, keep it (it's still correct)
    }
    result.score = timedScore;
  } else {
    result = session.submitAnswer(picked.taxon);
  }

  const { score, correct } = result;

  // Disable all choices
  choiceEls.forEach(el => { el.style.pointerEvents = 'none'; });

  // Highlight correct/wrong
  const isBugs101 = session.setDef.scoring === 'binary';
  choices.forEach((choice, i) => {
    const el = choiceEls[i];
    if (isBugs101) {
      if (choice.taxon.order === correct.taxon.order) el.classList.add('correct');
      else if (choice.taxon.order === picked.taxon.order) el.classList.add('miss');
    } else {
      if (choice.taxon.species === correct.taxon.species) {
        el.classList.add('correct');
      } else if (choice.taxon.species === picked.taxon.species) {
        if (mode === 'time_trial' || mode === 'streak') el.classList.add('miss');
        else if (score >= 50) el.classList.add('close');
        else el.classList.add('miss');
      }
    }
  });

  // Log round
  logRoundComplete(
    session.sessionId, session.currentRound, correct.id,
    picked.taxon.species, correct.taxon.species,
    score, timeTaken, session.setDef.name, session.mode
  );

  // MODE-SPECIFIC POST-ANSWER FLOW
  if (mode === 'time_trial') {
    handleTimeTrialPostAnswer(score, timeTaken);
  } else if (mode === 'streak') {
    handleStreakPostAnswer(score, picked, correct);
  } else {
    handleClassicPostAnswer(score, picked, correct, timeTaken);
  }
}

// ===== TIME TRIAL POST-ANSWER =====

function handleTimeTrialPostAnswer(score, timeTaken) {
  const gameScreen = container.querySelector('#game-screen');

  // Flash effect
  gameScreen.classList.add(score > 0 ? 'flash-correct' : 'flash-wrong');

  // Score popup
  const popup = container.querySelector('#score-popup');
  if (popup) {
    popup.textContent = `+${score}`;
    popup.className = `score-popup visible ${score === 0 ? 'miss' : ''}`;
  }

  // Update score display
  const scoreEl = container.querySelector('.timer-score');
  if (scoreEl) {
    scoreEl.childNodes[0].textContent = `${session.totalScore} pts `;
  }

  // Show time taken
  const lastTimeEl = container.querySelector('#last-time');
  if (lastTimeEl) {
    lastTimeEl.textContent = `${(timeTaken / 1000).toFixed(1)}s`;
    lastTimeEl.classList.add('visible');
  }

  // Advance immediately — flash/numbers persist briefly
  if (timeRemaining > 0) {
    setTimeout(() => startRound(), 800);
  }

  // Clear popup after delay
  setTimeout(() => {
    if (popup) popup.className = 'score-popup';
    if (lastTimeEl) lastTimeEl.classList.remove('visible');
  }, 1000);
}

// ===== STREAK POST-ANSWER =====

function handleStreakPostAnswer(score, picked, correct) {
  const gameScreen = container.querySelector('#game-screen');

  if (score === 100) {
    // Correct — flash green, advance after delay
    gameScreen.classList.add('flash-correct');

    // Update streak display
    const streakEl = container.querySelector('.streak-count');
    if (streakEl) streakEl.textContent = session.currentStreak;

    setTimeout(() => startRound(), 500);
  } else {
    // Wrong — flash red, show game over
    gameScreen.classList.add('flash-wrong');
    setTimeout(() => renderStreakGameOver(picked, correct), 600);
  }
}

// ===== CLASSIC POST-ANSWER =====

function handleClassicPostAnswer(score, picked, correct, timeTaken) {
  // Same as original: show learning card
  let feedbackClass, feedbackTitle;
  if (score === 100) { feedbackClass = 'exact'; feedbackTitle = 'Nailed it!'; }
  else if (score >= 50) { feedbackClass = 'close'; feedbackTitle = 'So close!'; }
  else { feedbackClass = 'miss'; feedbackTitle = 'Not quite'; }

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

  let blurb = correct.wikipedia_summary || '';
  if (blurb && !blurb.match(/[.!?]$/)) {
    const lastSentence = blurb.lastIndexOf('. ');
    if (lastSentence > 40) blurb = blurb.slice(0, lastSentence + 1);
    else {
      const lastSpace = blurb.lastIndexOf(' ');
      blurb = lastSpace > 20 ? blurb.slice(0, lastSpace) + '...' : blurb + '...';
    }
  }

  const badgeClass = score === 100 ? 'badge-success' : score >= 50 ? 'badge-warning' : 'badge-error';

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

  setTimeout(() => {
    container.querySelector('#next-btn')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 300);

  container.querySelectorAll('.reaction-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.reaction-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      logRoundReaction(
        session.sessionId, session.currentRound, correct.id,
        btn.dataset.difficulty, picked.taxon.species, correct.taxon.species,
        score, session.setDef.name
      );
    });
  });

  container.querySelector('#next-btn').addEventListener('click', startRound);
}

// ===== SUMMARY SCREENS =====

function renderClassicSummary() {
  const exactCount = session.history.filter(h => h.score === 100).length;
  const closeCount = session.history.filter(h => h.score >= 50 && h.score < 100).length;
  const missCount = session.history.filter(h => h.score < 50).length;
  const shareText = generateShareText(session.totalScore, session.history, session.setDef.name, session.bestStreak);

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

      ${renderSessionFeedbackForm()}
    </div>
  `;

  attachShareHandlers(shareText);
  attachPlayAgainHandlers();
  attachSessionFeedbackHandlers();
}

function renderTimeTrialSummary() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }

  const correctCount = session.correctCount;
  const totalQ = session.questionsAnswered;
  const shareText = generateTimeTrialShareText(session.totalScore, session.history, correctCount, totalQ);

  const storageKey = `best_time_trial`;
  const prevBest = parseInt(localStorage.getItem(storageKey) || '0', 10);
  if (session.totalScore > prevBest) {
    localStorage.setItem(storageKey, session.totalScore.toString());
  }

  const emojiGrid = session.history.map(h => h.score > 0 ? '🟩' : '🟥').join('');

  container.innerHTML = `
    <div class="container">
      <div class="summary">
        <h1>⚡ Time Trial</h1>
        <div class="summary-score">${session.totalScore} pts</div>
        <div class="summary-breakdown">${correctCount}/${totalQ} correct in 60 seconds</div>
        <div class="emoji-grid">${emojiGrid}</div>

        <div class="share-buttons">
          <button class="btn btn-outline" id="copy-btn">📋 Copy</button>
          <button class="btn btn-outline" id="tweet-btn">𝕏 Post</button>
        </div>

        <div style="margin-top: 24px; display: flex; gap: 12px; justify-content: center;">
          <button class="btn btn-primary" id="play-again-btn">Play Again</button>
          <a href="${base}/" class="btn btn-outline" id="change-set-btn">Change Set</a>
        </div>
      </div>
    </div>
  `;

  attachShareHandlers(shareText);
  attachPlayAgainHandlers();
}

function renderStreakGameOver(picked, correct) {
  const streakCount = session.currentStreak;
  const shareText = generateStreakShareText(streakCount, session.history);

  const storageKey = `best_streak`;
  const prevBest = parseInt(localStorage.getItem(storageKey) || '0', 10);
  if (streakCount > prevBest) {
    localStorage.setItem(storageKey, streakCount.toString());
  }

  // Only green emojis
  const emojiGrid = Array(streakCount).fill('🟩').join('');

  // Learning card content for the bug they got wrong
  let breadcrumb = '';
  const isBugs101Mode = session.setDef.scoring === 'binary';
  if (isBugs101Mode) {
    breadcrumb = `You guessed ${escapeHTML(getBugs101Name(picked.taxon))}, but this is a ${escapeHTML(getBugs101Name(correct.taxon))}.`;
  } else {
    breadcrumb = `You guessed ${escapeHTML(picked.taxon.order)}, but this is ${escapeHTML(correct.taxon.order)}.`;
  }

  let blurb = correct.wikipedia_summary || '';
  if (blurb && !blurb.match(/[.!?]$/)) {
    const lastSentence = blurb.lastIndexOf('. ');
    if (lastSentence > 40) blurb = blurb.slice(0, lastSentence + 1);
    else {
      const lastSpace = blurb.lastIndexOf(' ');
      blurb = lastSpace > 20 ? blurb.slice(0, lastSpace) + '...' : blurb + '...';
    }
  }

  container.innerHTML = `
    <div class="container">
      <div class="summary">
        <h1>🔥 Streaks Over</h1>
        <div class="summary-score">${streakCount}</div>
        <p class="subtitle" style="margin-bottom:16px;">in a row</p>
        <div class="emoji-grid">${emojiGrid}</div>

        <div class="share-buttons">
          <button class="btn btn-outline" id="copy-btn">📋 Copy</button>
          <button class="btn btn-outline" id="tweet-btn">𝕏 Post</button>
        </div>
      </div>

      <div class="feedback-card miss" style="margin-top: 16px;">
        <div class="feedback-title">The one that got away</div>
        <div class="feedback-body">
          <strong>${escapeHTML(correct.taxon.common_name)}</strong> (<em>${escapeHTML(correct.taxon.species)}</em>)
          ${blurb ? `<br>${escapeHTML(blurb)}` : ''}
          ${breadcrumb ? `<br><br>${breadcrumb}` : ''}
        </div>
        <div style="margin-top: 8px;">
          <a href="${escapeHTML(correct.inat_url)}" target="_blank" rel="noopener" style="font-size: 13px;">Learn more →</a>
        </div>
      </div>

      <div style="margin-top: 24px; display: flex; gap: 12px; justify-content: center;">
        <button class="btn btn-primary" id="play-again-btn">Play Again</button>
        <a href="${base}/" class="btn btn-outline" id="change-set-btn">Change Set</a>
      </div>
    </div>
  `;

  attachShareHandlers(shareText);
  attachPlayAgainHandlers();
}

function renderStreakSummary() {
  // If pool exhausted without error (unlikely but possible)
  renderStreakGameOver(
    { taxon: { species: '', genus: '', family: '', order: '' } },
    session._currentCorrect || { taxon: { species: '', genus: '', family: '', order: '', common_name: 'Unknown' }, wikipedia_summary: '', inat_url: '' }
  );
}

// ===== SHARED UI HELPERS =====

function attachShareHandlers(shareText) {
  container.querySelector('#copy-btn')?.addEventListener('click', async () => {
    const ok = await copyToClipboard(shareText);
    const btn = container.querySelector('#copy-btn');
    btn.textContent = ok ? '✓ Copied!' : 'Failed';
    shared = true;
    setTimeout(() => { btn.textContent = '📋 Copy'; }, 2000);
  });

  container.querySelector('#tweet-btn')?.addEventListener('click', () => {
    openTweetIntent(shareText);
    shared = true;
  });
}

function attachPlayAgainHandlers() {
  container.querySelector('#play-again-btn')?.addEventListener('click', () => {
    sendSessionEnd();
    window.location.reload();
  });

  container.querySelector('#change-set-btn')?.addEventListener('click', () => {
    sendSessionEnd();
  });
}

function renderSessionFeedbackForm() {
  return `
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
  `;
}

function attachSessionFeedbackHandlers() {
  let playAgainValue = '';
  container.querySelectorAll('[data-play-again]').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('[data-play-again]').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      playAgainValue = btn.dataset.playAgain;
    });
  });

  container.querySelector('#submit-feedback')?.addEventListener('click', () => {
    logSessionFeedback(
      session.sessionId, session.totalScore, session.setDef.name,
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
