/**
 * Game UI — DOM rendering and event handling for the game page.
 * Supports three modes: classic (10 rounds), time_trial (60s), streak (until wrong).
 */

import { SessionState, calculateTimedScore } from './game-engine.js';
import { generateShareText, generateTimeTrialShareText, generateStreakShareText, getClassicFlavor, getTimeTrialFlavor, getStreakFlavor, copyToClipboard, openWhatsApp, openIMessage, openTweetIntent, canNativeShare, nativeShare } from './share.js';
import { logSessionStart, logSessionEnd, logRoundComplete, logRoundReaction, logSessionFeedback, logBadPhoto } from './feedback.js';
import { isLeaderboardEligible, fetchLeaderboards, checkTop10, checkPersonalBest } from './leaderboard.js';
import { showLoadingSpinner, showCelebrationPopup, showPersonalBestPopup } from './leaderboard-ui.js';
import { playCorrect, playWrong, playSessionEnd, playTick, playTimesUp, playUIClick, isMuted } from './sounds.js';

// Dynamic import for achievements — gracefully degrades if achievements.js doesn't exist yet (Spec 4)
let achievementsModule = null;
import('./achievements.js')
  .then(m => { achievementsModule = m; })
  .catch(() => { /* achievements.js not available yet — skip */ });

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Animate a number from 0 to target over duration ms.
 * @param {HTMLElement} el — element whose textContent will be updated
 * @param {number} target — final number
 * @param {number} duration — animation duration in ms
 * @param {string} [suffix=''] — text appended after number (e.g., ' / 1000')
 */
function tweenCounter(el, target, duration = 500, suffix = '') {
  if (!el) return;
  const start = performance.now();
  function step(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    // Ease-out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(target * eased) + suffix;
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
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

// Preloading state — pre-generates up to 3 rounds and starts loading their images.
// The _currentCorrect fix in handleAnswer() prevents scoring bugs regardless of cache depth.
const PRELOAD_AHEAD = 3;
let roundCache = [];
let displayRound = 0;
let prefetchedLeaderboards = null;


function preloadRounds() {
  while (roundCache.length < PRELOAD_AHEAD) {
    const round = session.nextRound();
    if (!round) break;
    roundCache.push(round);
    // Start loading the image in the background
    const img = new Image();
    img.src = round.correct.photo_url;
  }
}

function getNextRound() {
  if (roundCache.length > 0) {
    return roundCache.shift();
  }
  return session.nextRound();
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
    displayRound,
    currentSetKey,
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

  let observations, taxonomy, sets, difficulty;
  try {
    const [obsRes, taxRes, setsRes, diffRes] = await Promise.all([
      fetch(`${base}/data/observations.json`),
      fetch(`${base}/data/taxonomy.json`),
      fetch(`${base}/data/sets.json`),
      fetch(`${base}/data/difficulty.json`).catch(() => ({ ok: false })),
    ]);

    if (!obsRes.ok || !taxRes.ok || !setsRes.ok) {
      throw new Error('One or more data files failed to load');
    }

    observations = await obsRes.json();
    taxonomy = await taxRes.json();
    sets = await setsRes.json();
    difficulty = diffRes.ok ? await diffRes.json().catch(() => null) : null;
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

  session = new SessionState(observations, taxonomy, setDef, currentSetKey, difficulty);
  logSessionStart(session.sessionId, currentSetKey, session.mode);
  sessionEndSent = false;
  shared = false;
  window.addEventListener('pagehide', sendSessionEnd);

  // Pre-generate first few rounds and start loading their images
  roundCache = [];
  displayRound = 0;
  prefetchedLeaderboards = null;
  preloadRounds();

  // Show rules popup once per day, then start game
  const startGame = () => {
    if (session.mode === 'time_trial') {
      startTimeTrial();
    } else {
      startRound();
    }
  };

  if (hasSeenRulesToday()) {
    startGame();
  } else {
    showRulesPopup(startGame);
  }
}

// ===== RULES POPUP =====

const RULES_SEEN_KEY = 'wtb_rules_seen_date';

function hasSeenRulesToday() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    return localStorage.getItem(RULES_SEEN_KEY) === today;
  } catch { return false; }
}

function markRulesSeenToday() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem(RULES_SEEN_KEY, today);
  } catch {}
}

function getRulesContent() {
  const mode = session.mode;
  const isBinary = session.setDef.scoring === 'binary';
  const setName = session.setDef.name;
  const task = isBinary ? 'Pick the bug type' : 'Name the exact species';

  if (mode === 'time_trial') {
    return {
      title: `⏱️ ${setName}`,
      items: [
        ['⏱️', '60 seconds on the clock'],
        ['🖼️', task],
        ['✅', 'Faster = more points · Wrong = 0'],
      ],
    };
  }

  if (mode === 'streak') {
    return {
      title: `🎯 ${setName}`,
      items: [
        ['🎯', `${task} — don't miss`],
        ['⏳', 'No time pressure'],
        ['💀', 'One wrong = game over'],
      ],
    };
  }

  // Classic modes
  if (isBinary) {
    return {
      title: `🔰 ${setName}`,
      items: [
        ['🖼️', task],
        ['🔢', '10 rounds · 1,000 pts max'],
        ['✅', 'Right = 100 pts · Wrong = 0'],
      ],
    };
  }

  return {
    title: `${setName}`,
    items: [
      ['🖼️', task],
      ['🔢', '10 rounds · 1,000 pts max'],
      ['🎯', 'Closer guess = more points'],
    ],
  };
}

function showRulesPopup(onDismiss) {
  const { title, items } = getRulesContent();
  const itemsHTML = items.map(([icon, text]) =>
    `<div class="rules-item"><span class="rules-item-icon">${icon}</span><span>${text}</span></div>`
  ).join('');

  const overlay = document.createElement('div');
  overlay.className = 'rules-overlay';
  overlay.innerHTML = `
    <div class="rules-card">
      <button class="rules-close" aria-label="Close">&times;</button>
      <div class="rules-title">${title}</div>
      <div class="rules-items">${itemsHTML}</div>
    </div>
  `;

  document.body.appendChild(overlay);

  const dismiss = () => {
    if (overlay.parentNode) {
      overlay.remove();
      markRulesSeenToday();
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
      playTimesUp();
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
      playTick();
    }
  }
}

// ===== GENERIC ROUND =====

function startRound() {
  currentRound = getNextRound();
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

  displayRound++;

  // At round 8, kick off a background leaderboard prefetch so the end-of-game
  // check can use cached data instead of waiting on a cold-start.
  if (displayRound === 8 && isLeaderboardEligible(currentSetKey) && !prefetchedLeaderboards) {
    fetchLeaderboards()
      .then(data => { prefetchedLeaderboards = data; })
      .catch(() => {});
  }

  // Preload the NEXT round's image while the player looks at this one
  preloadRounds();

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
    const streakDisplay = session.currentStreak > 1
      ? `<span style="color:var(--success);font-weight:600;font-size:0.85rem;margin-left:4px;">${session.currentStreak} streak</span>`
      : '';
    topBarHTML = `
      <div class="top-bar">
        <a href="${base}/" style="text-decoration:none;color:var(--accent);">← Sets</a>
        <span>Round ${displayRound} of 10 · ${session.totalScore} pts ${streakDisplay}</span>
        <span>${session.setDef.name}</span>
      </div>
    `;
  }

  // Progress bar for classic mode
  let progressHTML = '';
  if (mode === 'classic') {
    const segments = [];
    for (let i = 0; i < 10; i++) {
      let cls = 'session-progress-segment';
      if (i < session.history.length) {
        const h = session.history[i];
        if (h.score === 100) cls += ' filled';
        else if (h.score >= 50) cls += ' filled-close';
        else cls += ' filled-miss';
      } else if (i === session.history.length) {
        cls += ' current';
      }
      segments.push(`<div class="${cls}"></div>`);
    }
    progressHTML = `<div class="session-progress">${segments.join('')}</div>`;
  }

  container.innerHTML = `
    <div class="container" id="game-screen">
      ${topBarHTML}
      ${progressHTML}

      <div class="photo-hero">
        <img src="${escapeHTML(correct.photo_url)}" alt="Mystery bug" loading="eager">
        <span class="photo-credit">${escapeHTML(correct.attribution)}</span>
        <button class="report-photo-btn" id="report-photo" title="Report bad photo">&#9873;</button>
      </div>

      <div class="round-prompt">
        <span class="round-prompt-title">What's this bug?</span>
        <span class="round-prompt-location">${escapeHTML(correct.location)}</span>
      </div>

      <div class="choices stagger-in" id="choices">
        ${choices.map((choice, i) => {
          const isBugs101 = session.setDef.scoring === 'binary';
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
    logBadPhoto(session.sessionId, correct.id, correct.taxon.species, currentSetKey);
    const btn = container.querySelector('#report-photo');
    btn.textContent = '\u2713';
    btn.disabled = true;
  });
}

function handleAnswer(picked, choices, choiceEls) {
  playUIClick();
  // preloadRounds() calls nextRound() which overwrites _currentCorrect — reset to the displayed round
  session._currentCorrect = currentRound.correct;
  const timeTaken = Date.now() - roundStartTime;
  const mode = session.mode;

  // For time trial, override score with timed score
  let result;
  if (mode === 'time_trial') {
    // Submit to get correct answer reference, then calculate timed score
    result = session.submitAnswer(picked.taxon);
    const isBinarySet = session.setDef.scoring === 'binary';
    const isCorrect = isBinarySet
      ? picked.taxon.order === result.correct.taxon.order
      : picked.taxon.species === result.correct.taxon.species;
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

  // Shake photo on wrong answer
  if (score === 0) {
    const photoHero = container.querySelector('.photo-hero');
    if (photoHero) {
      photoHero.classList.add('anim-shake');
      setTimeout(() => photoHero.classList.remove('anim-shake'), 350);
    }
  }

  // Log round
  logRoundComplete(
    session.sessionId, displayRound, correct.id,
    picked.taxon.species, correct.taxon.species,
    score, timeTaken, currentSetKey, session.mode
  );

  // Track unique species for milestone tracking
  if (score === 100) {
    try {
      const seen = JSON.parse(localStorage.getItem('wtb_species_seen') || '[]');
      if (!seen.includes(correct.taxon.species)) {
        seen.push(correct.taxon.species);
        localStorage.setItem('wtb_species_seen', JSON.stringify(seen));
      }
    } catch { /* localStorage full or unavailable */ }
  }

  // Sound feedback based on score
  if (score > 0) { playCorrect(); }
  else { playWrong(); }

  // Check for achievements
  if (achievementsModule) {
    const newAchievements = achievementsModule.checkRoundAchievements(session, { score, correct });
    for (const ach of newAchievements) {
      showAchievementToast(ach);
    }
  }

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
    popup.className = `score-popup visible anim-float-up ${score === 0 ? 'miss' : ''}`;
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
    if (streakEl) {
      streakEl.textContent = session.currentStreak;
      streakEl.classList.add('anim-scale-bounce');
      setTimeout(() => streakEl.classList.remove('anim-scale-bounce'), 250);
    }

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
      } else if (picked.taxon.order === correct.taxon.order) {
        breadcrumb = `Both are ${escapeHTML(correct.taxon.order)}, but different families — this is ${escapeHTML(correct.taxon.family_common || correct.taxon.family)}.`;
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
    <div class="feedback-card ${feedbackClass} anim-slide-up" style="margin-top: 16px;">
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
        session.sessionId, displayRound, correct.id,
        btn.dataset.difficulty, picked.taxon.species, correct.taxon.species,
        score, currentSetKey
      );
    });
  });

  container.querySelector('#next-btn').addEventListener('click', startRound);
}

// ===== LEADERBOARD CHECK =====

async function handleLeaderboardCheck(score, streak, renderResultsFn) {
  const isStreak = currentSetKey.includes('streak');
  const value = isStreak ? streak : score;

  if (!isLeaderboardEligible(currentSetKey) || value <= 0) {
    renderResultsFn();
    return;
  }

  const dismissSpinner = showLoadingSpinner('Checking leaderboard...');

  // Show a reassuring "Almost there..." message if still waiting at 2 seconds.
  const almostThereTimer = setTimeout(() => {
    const msgEl = document.querySelector('.lb-loading-card p');
    if (msgEl) msgEl.textContent = 'Almost there...';
  }, 2000);

  // Build the fetch promise — use prefetched data if available, otherwise fetch fresh.
  const fetchPromise = prefetchedLeaderboards
    ? Promise.resolve(prefetchedLeaderboards)
    : fetchLeaderboards();

  // Race the fetch against a 3-second hard timeout.
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Leaderboard check timed out')), 3000)
  );

  try {
    const allBoards = await Promise.race([fetchPromise, timeoutPromise]);
    clearTimeout(almostThereTimer);
    // Clear prefetch cache so the next session fetches fresh data.
    prefetchedLeaderboards = null;

    const board = allBoards?.[currentSetKey] || [];

    dismissSpinner();

    const { qualifies, rank } = checkTop10(board, value, isStreak);
    const { isPersonalBest, previousBest } = checkPersonalBest(currentSetKey, value, isStreak);

    if (qualifies) {
      await showCelebrationPopup({
        rank,
        score,
        streak,
        setKey: currentSetKey,
        sessionId: session.sessionId,
        board,
        questionsAnswered: session.questionsAnswered,
        correctCount: session.correctCount,
      });
      renderResultsFn();
    } else if (isPersonalBest) {
      await showPersonalBestPopup({
        score,
        streak,
        previousBest,
        setKey: currentSetKey,
        board,
      });
      renderResultsFn();
    } else {
      renderResultsFn();
    }
  } catch (err) {
    clearTimeout(almostThereTimer);
    prefetchedLeaderboards = null;
    console.warn('Leaderboard check failed:', err);
    dismissSpinner();
    renderResultsFn();
  }
}

// ===== ACHIEVEMENT TOAST =====

function showAchievementToast(achievement) {
  const toast = document.createElement('div');
  toast.className = 'achievement-toast';
  // Offset vertically so multiple toasts don't overlap
  const existing = document.querySelectorAll('.achievement-toast:not(.fade-out)').length;
  toast.style.top = `calc(var(--space-4) + ${existing * 60}px)`;
  toast.innerHTML = `
    <span class="achievement-toast-icon">${achievement.icon}</span>
    <div class="achievement-toast-text">
      <span class="achievement-toast-name">${escapeHTML(achievement.name)}</span>
      <span class="achievement-toast-desc">${escapeHTML(achievement.description)}</span>
    </div>
  `;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 500);
  }, 3000);
}

// ===== POST-SESSION HELPERS =====

/**
 * Generate a recommendation message based on session performance.
 * Returns { text: string, link: string, linkText: string } or null.
 */
function getPostSessionRecommendation(totalScore, setKey, mode) {
  if (setKey === 'bugs_101' && totalScore >= 800) {
    return {
      text: "You're crushing Bugs 101!",
      link: `${base}/play?set=all_bugs`,
      linkText: 'Try All Bugs →',
    };
  }

  if (mode === 'classic' && totalScore >= 700 && !setKey.includes('time_trial')) {
    return {
      text: 'Nice score! Think you can do it under pressure?',
      link: `${base}/play?set=${setKey.replace('bugs_101', 'bugs_101_time_trial').replace('all_bugs', 'time_trial')}`,
      linkText: 'Try Time Trial →',
    };
  }

  if (mode === 'streak') {
    const bestKey = `best_${setKey}`;
    const best = parseInt(localStorage.getItem(bestKey) || '0', 10);
    if (best > 0) {
      return {
        text: `Your best streak: ${best}. Go again?`,
        link: null,
        linkText: null,
      };
    }
  }

  if (setKey === 'all_bugs' && totalScore < 400) {
    return {
      text: 'Try a themed set to focus on one group.',
      link: `${base}/`,
      linkText: 'Browse sets →',
    };
  }

  return null;
}

/**
 * Find the "play of the day" — hardest observation the player got right.
 * Without difficulty data, picks the last correct answer (later rounds trend harder).
 */
function getPlayOfTheDay(history) {
  const correctRounds = history.filter(h => h.score === 100);
  if (correctRounds.length === 0) return null;
  const pick = correctRounds[correctRounds.length - 1];
  return {
    common_name: pick.correct_taxon.common_name,
    species: pick.correct_taxon.species,
  };
}

/**
 * Build recommendation HTML block for summary screens.
 */
function renderRecommendation(totalScore, setKey, mode) {
  const rec = getPostSessionRecommendation(totalScore, setKey, mode);
  if (!rec) return '';
  return `
    <div class="recommendation anim-fade-in" style="text-align:center;margin-top:16px;padding:12px;background:var(--surface);border:1px solid var(--border);border-radius:12px;">
      <p style="margin-bottom:8px;color:var(--text-secondary);">${escapeHTML(rec.text)}</p>
      ${rec.link ? `<a href="${escapeHTML(rec.link)}" class="btn btn-outline" style="font-size:0.9rem;">${escapeHTML(rec.linkText)}</a>` : ''}
    </div>
  `;
}

// ===== SUMMARY SCREENS =====

function renderClassicSummary() {
  playSessionEnd();
  const exactCount = session.history.filter(h => h.score === 100).length;
  const closeCount = session.history.filter(h => h.score >= 50 && h.score < 100).length;
  const missCount = session.history.filter(h => h.score < 50).length;
  const shareText = generateShareText(session.totalScore, session.history, session.setDef.name, session.bestStreak);

  const storageKey = `best_${currentSetKey}`;
  const prevBest = parseInt(localStorage.getItem(storageKey) || '0', 10);
  if (session.totalScore > prevBest) {
    localStorage.setItem(storageKey, session.totalScore.toString());
  }

  const speciesCount = (() => {
    try { return JSON.parse(localStorage.getItem('wtb_species_seen') || '[]').length; }
    catch { return 0; }
  })();
  const speciesLine = speciesCount > 10 ? `<p class="subtitle" style="font-size:0.8rem;">${speciesCount} species identified so far</p>` : '';

  const potd = getPlayOfTheDay(session.history);
  const potdHTML = potd ? `
    <p class="anim-fade-in" style="font-size:0.85rem;color:var(--text-secondary);margin-top:8px;">
      Best ID: <strong>${escapeHTML(potd.common_name)}</strong> (<em>${escapeHTML(potd.species)}</em>)
    </p>
  ` : '';
  const recHTML = renderRecommendation(session.totalScore, currentSetKey, session.mode);

  container.innerHTML = `
    <div class="container">
      <div class="summary">
        <h1>🪲 What's That Bug?</h1>
        <div class="summary-score">${session.totalScore} / 1000</div>
        <div class="summary-breakdown">${exactCount} exact · ${closeCount} close · ${missCount} misses</div>
        <div class="emoji-grid emoji-stagger">${session.history.map((h, i) => {
          const emoji = h.score === 100 ? '🟩' : h.score >= 50 ? '🟨' : '🟥';
          return `<span class="emoji-char" style="animation-delay:${i * 100}ms">${emoji}</span>`;
        }).join('')}</div>
        ${potdHTML}
        <p class="subtitle">Best streak: ${session.bestStreak} · Set: ${session.setDef.name}</p>
        ${speciesLine}

        ${renderShareSection(getClassicFlavor(exactCount))}

        <div style="margin-top: 24px; display: flex; gap: 12px; justify-content: center;">
          <button class="btn btn-outline" id="play-again-btn">Play Again</button>
          <a href="${base}/" class="btn btn-outline" id="change-set-btn">Change Set</a>
        </div>
        ${recHTML}
      </div>

      ${renderSessionFeedbackForm()}
    </div>
  `;

  attachShareHandlers(shareText);
  attachPlayAgainHandlers();
  attachSessionFeedbackHandlers();

  // Tween the score counter
  tweenCounter(container.querySelector('.summary-score'), session.totalScore, 600, ' / 1000');

  // Check session-end achievements
  if (achievementsModule) {
    const newAchievements = achievementsModule.checkSessionAchievements(session, currentSetKey);
    newAchievements.forEach((ach, i) => {
      setTimeout(() => showAchievementToast(ach), i * 1500);
    });
  }
}

function renderTimeTrialSummary() {
  playSessionEnd();
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }

  const correctCount = session.correctCount;
  const totalQ = session.questionsAnswered;
  const shareText = generateTimeTrialShareText(session.totalScore, session.history, correctCount, totalQ, currentSetKey);

  const storageKey = `best_${currentSetKey}`;
  const prevBest = parseInt(localStorage.getItem(storageKey) || '0', 10);
  const isNewBest = session.totalScore > prevBest;

  const emojiGrid = session.history.map((h, i) => {
    const emoji = h.score > 0 ? '🟩' : '🟥';
    return `<span class="emoji-char" style="animation-delay:${i * 100}ms">${emoji}</span>`;
  }).join('');
  const accuracy = totalQ > 0 ? Math.round((correctCount / totalQ) * 100) : 0;

  // Calculate average time per correct answer
  const correctTimes = [];
  let roundStartMs = 0;
  for (const h of session.history) {
    if (h.score > 0) correctTimes.push(h.score);
  }

  // Speed bracket breakdown
  const brackets = { fast: 0, good: 0, ok: 0, slow: 0, crawl: 0 };
  for (const h of session.history) {
    if (h.score >= 100) brackets.fast++;
    else if (h.score >= 75) brackets.good++;
    else if (h.score >= 50) brackets.ok++;
    else if (h.score >= 25) brackets.slow++;
    else if (h.score > 0) brackets.crawl++;
  }

  // Average points per question
  const avgPts = totalQ > 0 ? Math.round(session.totalScore / totalQ) : 0;

  // Points per second
  const pps = (session.totalScore / 60).toFixed(1);

  const newBestHTML = isNewBest
    ? `<div class="new-best-badge">New Personal Best!</div>`
    : prevBest > 0 ? `<p class="subtitle" style="margin-top:4px;">Personal best: ${prevBest} pts</p>` : '';

  handleLeaderboardCheck(session.totalScore, 0, () => {
    container.innerHTML = `
    <div class="container">
      <div class="summary">
        <h1>⏱️ Time Trial</h1>
        <div class="summary-score">${session.totalScore} pts</div>
        ${newBestHTML}

        <div class="tt-stats">
          <div class="tt-stat">
            <div class="tt-stat-value">${correctCount}/${totalQ}</div>
            <div class="tt-stat-label">Correct</div>
          </div>
          <div class="tt-stat">
            <div class="tt-stat-value">${accuracy}%</div>
            <div class="tt-stat-label">Accuracy</div>
          </div>
          <div class="tt-stat">
            <div class="tt-stat-value">${avgPts}</div>
            <div class="tt-stat-label">Avg pts/bug</div>
          </div>
          <div class="tt-stat">
            <div class="tt-stat-value">${pps}</div>
            <div class="tt-stat-label">Pts/second</div>
          </div>
        </div>

        <div class="emoji-grid emoji-stagger">${emojiGrid}</div>

        <div class="tt-brackets">
          ${brackets.fast > 0 ? `<span class="tt-bracket tt-bracket-fast">${brackets.fast} blazing</span>` : ''}
          ${brackets.good > 0 ? `<span class="tt-bracket tt-bracket-good">${brackets.good} fast</span>` : ''}
          ${brackets.ok > 0 ? `<span class="tt-bracket tt-bracket-ok">${brackets.ok} steady</span>` : ''}
          ${brackets.slow > 0 ? `<span class="tt-bracket tt-bracket-slow">${brackets.slow} slow</span>` : ''}
        </div>

        ${renderShareSection(getTimeTrialFlavor(correctCount, totalQ))}

        <div style="margin-top: 24px; display: flex; gap: 12px; justify-content: center;">
          <button class="btn btn-outline" id="play-again-btn">Play Again</button>
          <a href="${base}/" class="btn btn-outline" id="change-set-btn">Change Set</a>
        </div>
        ${renderRecommendation(session.totalScore, currentSetKey, session.mode)}
      </div>

      ${renderSessionFeedbackForm()}
    </div>
  `;
    attachShareHandlers(shareText);
    attachPlayAgainHandlers();
    attachSessionFeedbackHandlers();

    // Tween the score counter
    tweenCounter(container.querySelector('.summary-score'), session.totalScore, 600, ' pts');

    // Check session-end achievements
    if (achievementsModule) {
      const newAchievements = achievementsModule.checkSessionAchievements(session, currentSetKey);
      newAchievements.forEach((ach, i) => {
        setTimeout(() => showAchievementToast(ach), i * 1500);
      });
    }
  });
}

function renderStreakGameOver(picked, correct) {
  const streakCount = session.currentStreak;
  const shareText = generateStreakShareText(streakCount, session.history, currentSetKey);

  const storageKey = `best_${currentSetKey}`;
  const prevBest = parseInt(localStorage.getItem(storageKey) || '0', 10);
  const isNewBest = streakCount > prevBest;

  // Only green emojis
  const emojiGrid = Array(streakCount).fill(null).map((_, i) =>
    `<span class="emoji-char" style="animation-delay:${i * 100}ms">🟩</span>`
  ).join('');

  // Streak rank
  let rank, rankClass;
  if (streakCount >= 25) { rank = 'Legendary'; rankClass = 'streak-rank-legendary'; }
  else if (streakCount >= 15) { rank = 'Expert'; rankClass = 'streak-rank-expert'; }
  else if (streakCount >= 10) { rank = 'Sharp Eye'; rankClass = 'streak-rank-sharp'; }
  else if (streakCount >= 5) { rank = 'Getting Good'; rankClass = 'streak-rank-good'; }
  else { rank = 'Keep Trying'; rankClass = 'streak-rank-start'; }

  const newBestHTML = isNewBest
    ? `<div class="new-best-badge">New Personal Best!</div>`
    : prevBest > 0 ? `<p class="subtitle" style="margin-top:4px;">Personal best: ${prevBest} in a row</p>` : '';

  // Learning card content for the bug they got wrong
  let breadcrumb = '';
  const isBugs101Mode = session.setDef.scoring === 'binary';
  if (isBugs101Mode) {
    breadcrumb = `You guessed ${escapeHTML(getBugs101Name(picked.taxon))}, but this is a ${escapeHTML(getBugs101Name(correct.taxon))}.`;
  } else if (picked.taxon.order === correct.taxon.order) {
    breadcrumb = `Both are ${escapeHTML(correct.taxon.order)}, but different families — this is ${escapeHTML(correct.taxon.family_common || correct.taxon.family)}.`;
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

  const totalRounds = streakCount + 1;

  handleLeaderboardCheck(0, streakCount, () => {
    container.innerHTML = `
    <div class="container">
      <div class="summary">
        <h1>🎯 Streaks</h1>
        <div class="summary-score">${streakCount}</div>
        <p class="subtitle">in a row</p>
        ${newBestHTML}

        <div class="tt-stats" style="margin-top:20px;">
          <div class="tt-stat">
            <div class="tt-stat-value">${streakCount}/${totalRounds}</div>
            <div class="tt-stat-label">Correct</div>
          </div>
          <div class="tt-stat">
            <div class="tt-stat-value">${totalRounds > 0 ? Math.round((streakCount / totalRounds) * 100) : 0}%</div>
            <div class="tt-stat-label">Accuracy</div>
          </div>
          <div class="tt-stat" style="grid-column: span 2;">
            <div class="tt-stat-value"><span class="streak-rank ${rankClass}">${rank}</span></div>
            <div class="tt-stat-label">Rank</div>
          </div>
        </div>

        <div class="emoji-grid emoji-stagger">${emojiGrid}</div>

        ${renderShareSection(getStreakFlavor(streakCount))}
      </div>

      <div style="margin-top: 24px; display: flex; gap: 12px; justify-content: center;">
        <button class="btn btn-outline" id="play-again-btn">Play Again</button>
        <a href="${base}/" class="btn btn-outline" id="change-set-btn">Change Set</a>
      </div>
      ${renderRecommendation(0, currentSetKey, session.mode)}

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

      ${renderSessionFeedbackForm()}
    </div>
  `;
    attachShareHandlers(shareText);
    attachPlayAgainHandlers();
    attachSessionFeedbackHandlers();

    // Tween the streak counter
    tweenCounter(container.querySelector('.summary-score'), streakCount, 400, '');

    // Check session-end achievements
    if (achievementsModule) {
      const newAchievements = achievementsModule.checkSessionAchievements(session, currentSetKey);
      newAchievements.forEach((ach, i) => {
        setTimeout(() => showAchievementToast(ach), i * 1500);
      });
    }
  });
}

function renderStreakSummary() {
  // If pool exhausted without error (unlikely but possible)
  renderStreakGameOver(
    { taxon: { species: '', genus: '', family: '', order: '' } },
    session._currentCorrect || { taxon: { species: '', genus: '', family: '', order: '', common_name: 'Unknown' }, wikipedia_summary: '', inat_url: '' }
  );
}

// ===== SHARED UI HELPERS =====

const SHARE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>';
const WHATSAPP_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';
const IMESSAGE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
const TWITTER_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>';
const CLIPBOARD_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

function renderShareSection(flavorText) {
  return `
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
  `;
}

function attachShareHandlers(shareText) {
  const heroBtn = container.querySelector('#share-hero-btn');
  const heroOriginalHTML = heroBtn?.innerHTML;

  heroBtn?.addEventListener('click', async () => {
    shared = true;
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
    shared = true;
  });

  container.querySelector('#imessage-btn')?.addEventListener('click', () => {
    openIMessage(shareText);
    shared = true;
  });

  container.querySelector('#tweet-btn')?.addEventListener('click', () => {
    openTweetIntent(shareText);
    shared = true;
  });

  container.querySelector('#copy-btn')?.addEventListener('click', async () => {
    const ok = await copyToClipboard(shareText);
    const btn = container.querySelector('#copy-btn');
    btn.innerHTML = ok ? '✓' : '✗';
    shared = true;
    setTimeout(() => { btn.innerHTML = CLIPBOARD_ICON; }, 2000);
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
      session.sessionId, session.totalScore, currentSetKey,
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
