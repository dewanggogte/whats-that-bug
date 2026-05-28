import { getBugs101Name } from '../game-engine.js';
import { logMultiplayerEvent } from '../feedback.js';

const base = window.__BASE || '';

let _ctx = null;
let _currentQ = 0;
let _startedAt = 0;
let _timeTrialDeadline = 0;
let _timeUpSent = false;
let _advanceTimer = null;
const _preloadedImages = new Map();
const PRELOAD_AHEAD = 3;

function preloadQuestionImages(fromIndex) {
  if (!_ctx) return;
  const end = Math.min(fromIndex + PRELOAD_AHEAD, _ctx.questions.length);
  for (let i = fromIndex; i < end; i++) {
    const q = _ctx.questions[i];
    if (!q) continue;
    const obs = _ctx.observations[q.correctObservationIndex];
    const url = obs?.photo_url;
    if (!url || _preloadedImages.has(url)) continue;
    const img = new Image();
    img.src = url;
    _preloadedImages.set(url, img);
  }
}

function waitForImage(url) {
  if (!url) return Promise.resolve();
  const existing = _preloadedImages.get(url);
  const img = existing || (() => {
    const created = new Image();
    created.src = url;
    _preloadedImages.set(url, created);
    return created;
  })();
  if (img.complete && img.naturalWidth > 0) return Promise.resolve();
  return new Promise(resolve => {
    const done = () => resolve();
    img.addEventListener('load', done, { once: true });
    img.addEventListener('error', done, { once: true });
    setTimeout(done, 4000);
  });
}

function newSessionId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* ignore */ }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export async function initGameUI(container, { code, playerId, state, gameStarted, client, isHost }) {
  if (_advanceTimer) clearTimeout(_advanceTimer);
  const observations = await fetch(`${base}/data/observations.json`).then(r => r.json());
  _ctx = {
    code,
    playerId,
    client,
    observations,
    setMeta: gameStarted.setMeta,
    questions: gameStarted.questions,
    isHost,
    container,
    sessionId: newSessionId(),
    lastPickedChoiceIndex: null,
    loggedDisplays: new Set(),
    leaderboard: state.players.map(p => ({
      id: p.id,
      displayName: p.displayName,
      score: p.score,
      streak: p.streak,
      nextQuestionIndex: p.nextQuestionIndex,
      finished: p.finished,
    })),
  };
  _currentQ = gameStarted.resume?.nextQuestionIndex || 0;
  _startedAt = Date.now();
  _timeUpSent = false;
  _preloadedImages.clear();

  logMultiplayerEvent('mp_session_start', {
    session_id: _ctx.sessionId,
    room_code: _ctx.code,
    set: _ctx.setMeta.setKey,
    mode: _ctx.setMeta.mode,
    player_count: state.players.length,
    resumed_at_round: gameStarted.resume?.nextQuestionIndex ? _currentQ + 1 : null,
  });

  if (_ctx.setMeta.mode === 'time_trial') {
    _timeTrialDeadline = (state.startedAt || Date.now()) + 60_000;
    startTimeTrialTicker();
  }

  if (gameStarted.resume?.finished) {
    showWaiting('Reconnected. Waiting for others...');
    return;
  }

  preloadQuestionImages(_currentQ);
  const firstQ = _ctx.questions[_currentQ];
  const firstUrl = firstQ ? _ctx.observations[firstQ.correctObservationIndex]?.photo_url : null;
  showWaiting('Starting the game', '');
  await waitForImage(firstUrl);
  if (!_ctx) return;
  renderQuestion();
}

export function applyState(state) {
  if (!_ctx || !state) return;
  _ctx.isHost = state.hostId === _ctx.playerId;
  _ctx.leaderboard = state.players.map(p => ({
    id: p.id,
    displayName: p.displayName,
    score: p.score,
    streak: p.streak,
    nextQuestionIndex: p.nextQuestionIndex,
    finished: p.finished,
  }));
  renderLeaderboard();
  renderHostActions();
}

export function applyLeaderboard(leaderboard) {
  if (!_ctx) return;
  _ctx.leaderboard = leaderboard;
  renderLeaderboard();
}

export function applyQuestionResult({ questionIndex, score, correctChoiceIndex }) {
  if (!_ctx || questionIndex !== _currentQ) return;

  const q = _ctx.questions[_currentQ];
  const correctObs = q ? _ctx.observations[q.correctObservationIndex] : null;
  const pickedObs = q && _ctx.lastPickedChoiceIndex != null
    ? _ctx.observations[q.choiceObservationIndexes[_ctx.lastPickedChoiceIndex]]
    : null;
  logMultiplayerEvent('mp_round_complete', {
    session_id: _ctx.sessionId,
    room_code: _ctx.code,
    round: _currentQ + 1,
    observation_id: correctObs?.id ?? null,
    user_answer: getAnalyticsAnswer(pickedObs),
    correct_answer: getAnalyticsAnswer(correctObs),
    user_answer_genus: pickedObs?.taxon?.genus ?? null,
    correct_answer_genus: correctObs?.taxon?.genus ?? null,
    user_answer_species: pickedObs?.taxon?.species ?? null,
    correct_answer_species: correctObs?.taxon?.species ?? null,
    scoring: _ctx.setMeta.scoring,
    score,
    time_taken_ms: Date.now() - _startedAt,
    set: _ctx.setMeta.setKey,
    mode: _ctx.setMeta.mode,
  });

  showResult(score, correctChoiceIndex);

  if (_ctx.setMeta.mode === 'streak' && score !== 100) {
    _advanceTimer = setTimeout(() => showWaiting('Streak broken. Waiting for others...'), 1200);
    return;
  }

  _advanceTimer = setTimeout(() => {
    _currentQ++;
    preloadQuestionImages(_currentQ);
    if (_ctx.setMeta.mode === 'classic' && _currentQ >= _ctx.questions.length) {
      showWaiting('Done! Waiting for others...');
    } else {
      renderQuestion();
    }
  }, 1200);
}

export function applyGameOver({ finalLeaderboard, durationMs }, opts = {}) {
  if (!_ctx) return;
  if (_advanceTimer) clearTimeout(_advanceTimer);
  const myEntry = finalLeaderboard.find(p => p.id === _ctx.playerId);
  const myRank = finalLeaderboard.findIndex(p => p.id === _ctx.playerId) + 1 || null;
  logMultiplayerEvent('mp_session_end', {
    session_id: _ctx.sessionId,
    room_code: _ctx.code,
    set: _ctx.setMeta.setKey,
    mode: _ctx.setMeta.mode,
    total_score: myEntry?.score ?? 0,
    rounds_played: _ctx.loggedDisplays.size,
    final_rank: myRank,
    player_count: finalLeaderboard.length,
    duration_ms: durationMs,
    max_score: finalLeaderboard[0]?.score || 0,
  });

  const client = opts.client || _ctx.client;
  const isHost = opts.isHost !== undefined ? opts.isHost : _ctx.isHost;
  const code = _ctx.code;
  const container = _ctx.container;

  const hostActions = `
    <button class="btn btn-primary" id="play-again-btn">Play Again</button>
    <a class="btn btn-outline" href="${base}/party">Leave Party</a>
  `;
  const guestActions = `
    <p class="party-waiting-copy">Waiting for the host to start another round...</p>
    <a class="btn btn-outline" href="${base}/party">Leave Party</a>
  `;

  container.innerHTML = `
    <section class="party-panel party-results">
      <p class="party-eyebrow">Final results</p>
      <h1>Party ${escapeHtml(code)}</h1>
      <ol class="final-leaderboard">
        ${finalLeaderboard.map((p, i) => `
          <li class="rank-${i + 1}">
            <span class="rank">#${i + 1}</span>
            <strong>${escapeHtml(p.displayName)}</strong>
            <span>${p.score} pts</span>
          </li>
        `).join('')}
      </ol>
      <div class="party-result-actions">
        ${isHost ? hostActions : guestActions}
      </div>
    </section>
  `;

  if (isHost) {
    document.getElementById('play-again-btn')?.addEventListener('click', () => {
      client.send({ type: 'play-again' });
    });
  }

  _ctx = null;
  _preloadedImages.clear();
}

function renderQuestion() {
  if (!_ctx) return;
  if (_ctx.setMeta.mode === 'time_trial' && Date.now() >= _timeTrialDeadline) {
    sendTimeUp();
    showWaiting("Time's up! Waiting for others...");
    return;
  }

  const q = _ctx.questions[_currentQ];
  if (!q) {
    if (_ctx.setMeta.mode === 'time_trial') sendTimeUp();
    if (_ctx.setMeta.mode === 'streak') _ctx.client.send({ type: 'streak-broken' });
    showWaiting('Done! Waiting for others...');
    return;
  }

  const correct = _ctx.observations[q.correctObservationIndex];
  const choices = q.choiceObservationIndexes.map(index => _ctx.observations[index]).filter(Boolean);
  _ctx.container.innerHTML = `
    <div class="mp-game-shell">
      <section class="mp-main-panel">
        <div class="top-bar mp-top-bar">
          <a href="${base}/party" style="text-decoration:none;color:var(--accent);">Party</a>
          <span>${escapeHtml(_ctx.setMeta.name || _ctx.setMeta.setKey)}</span>
          <span>${questionLabel()}</span>
        </div>
        ${_ctx.setMeta.mode === 'time_trial' ? '<div class="timer-bar mp-timer"><span>Time left</span><strong id="time-left">60s</strong></div>' : ''}
        <div class="photo-hero">
          <img src="${escapeHtml(correct.photo_url || '')}" alt="Mystery bug" loading="eager">
          ${correct.attribution ? `<span class="photo-credit">${escapeHtml(correct.attribution)}</span>` : ''}
        </div>
        <div class="round-prompt">
          <span class="round-prompt-title">What's this bug?</span>
          ${correct.location ? `<span class="round-prompt-location">${escapeHtml(correct.location)}</span>` : ''}
        </div>
        <div class="choices stagger-in" id="choices">
          ${choices.map((choice, choiceIndex) => `
            <button class="choice" type="button" data-choice-index="${choiceIndex}">
              <span class="choice-name">${escapeHtml(getChoiceLabel(choice))}</span>
              <span class="choice-latin">${escapeHtml(getChoiceSubLabel(choice))}</span>
            </button>
          `).join('')}
        </div>
        <div id="mp-host-actions"></div>
      </section>
      <aside class="mp-leaderboard-sidebar" id="leaderboard-sidebar"></aside>
    </div>
  `;
  _startedAt = Date.now();
  _ctx.lastPickedChoiceIndex = null;

  if (!_ctx.loggedDisplays.has(_currentQ)) {
    _ctx.loggedDisplays.add(_currentQ);
    logMultiplayerEvent('mp_round_displayed', {
      session_id: _ctx.sessionId,
      room_code: _ctx.code,
      round: _currentQ + 1,
      observation_id: correct.id,
      set: _ctx.setMeta.setKey,
      mode: _ctx.setMeta.mode,
    });
  }

  _ctx.container.querySelectorAll('.choice').forEach(btn => {
    btn.addEventListener('click', () => {
      const choiceIndex = parseInt(btn.dataset.choiceIndex, 10);
      _ctx.lastPickedChoiceIndex = choiceIndex;
      _ctx.client.send({
        type: 'submit-answer',
        questionIndex: _currentQ,
        choiceIndex,
        elapsedMs: Date.now() - _startedAt,
      });
      _ctx.container.querySelectorAll('.choice').forEach(b => { b.disabled = true; });
      btn.classList.add('picked');
    });
  });

  renderLeaderboard();
  renderHostActions();
  updateTimerDisplay();
}

function questionLabel() {
  if (_ctx.setMeta.mode === 'classic') return `Question ${_currentQ + 1} of ${_ctx.questions.length}`;
  if (_ctx.setMeta.mode === 'time_trial') return `Question ${_currentQ + 1}`;
  return `Streak ${_currentQ + 1}`;
}

function getAnalyticsAnswer(obs) {
  if (!obs) return null;
  if (_ctx.setMeta.scoring === 'binary') return getBugs101Name(obs.taxon);
  return obs.taxon.genus || null;
}

function getChoiceLabel(obs) {
  if (_ctx.setMeta.scoring === 'binary') return getBugs101Name(obs.taxon);
  if (_ctx.setMeta.scoring === 'genus') return obs.taxon.genus || '???';
  return obs.taxon.common_name || obs.taxon.species || '???';
}

function getChoiceSubLabel(obs) {
  if (_ctx.setMeta.scoring === 'binary') return obs.taxon.order || '';
  if (_ctx.setMeta.scoring === 'genus') return obs.taxon.family || obs.taxon.order || '';
  return obs.taxon.species || '';
}

function renderLeaderboard() {
  const el = document.getElementById('leaderboard-sidebar');
  if (!el || !_ctx) return;
  const sorted = [..._ctx.leaderboard].sort((a, b) => b.score - a.score);
  el.innerHTML = `
    <h2>Leaderboard</h2>
    <ol class="mp-leaderboard-list">
      ${sorted.map((p, i) => `
        <li class="${p.finished ? 'finished' : ''}">
          <span class="rank">#${i + 1}</span>
          <strong>${escapeHtml(p.displayName)}</strong>
          <span>${p.score} pts</span>
        </li>
      `).join('')}
    </ol>
  `;
}

function renderHostActions() {
  const el = document.getElementById('mp-host-actions');
  if (!el || !_ctx) return;
  if (!_ctx.isHost) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = '<button class="btn btn-outline" id="end-game-btn">End Game</button>';
  document.getElementById('end-game-btn').addEventListener('click', () => {
    if (confirm('End the game for everyone?')) _ctx.client.send({ type: 'end-game' });
  });
}

function showResult(score, correctChoiceIndex) {
  const choices = _ctx.container.querySelectorAll('.choice');
  choices.forEach((el, i) => {
    if (i === correctChoiceIndex) el.classList.add('correct');
    else if (el.classList.contains('picked')) el.classList.add('miss');
    else el.classList.add('dimmed');
  });

  const overlay = document.createElement('div');
  overlay.className = 'mp-result-overlay';
  overlay.textContent = score > 0 ? `+${score}` : 'Miss';
  document.body.appendChild(overlay);
  setTimeout(() => overlay.remove(), 900);
}

function showWaiting(text, subtitle = 'Results will appear when everyone finishes.') {
  if (!_ctx) return;
  _ctx.container.innerHTML = `
    <div class="mp-game-shell">
      <section class="party-panel mp-waiting">
        <h1>${escapeHtml(text)}</h1>
        ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}
      </section>
      <aside class="mp-leaderboard-sidebar" id="leaderboard-sidebar"></aside>
    </div>
  `;
  renderLeaderboard();
}

function startTimeTrialTicker() {
  const tick = () => {
    if (!_ctx || _ctx.setMeta.mode !== 'time_trial') return;
    const remaining = Math.max(0, _timeTrialDeadline - Date.now());
    updateTimerDisplay(remaining);
    if (remaining <= 0) {
      sendTimeUp();
      showWaiting("Time's up! Waiting for others...");
      return;
    }
    requestAnimationFrame(tick);
  };
  tick();
}

function updateTimerDisplay(remaining = Math.max(0, _timeTrialDeadline - Date.now())) {
  const el = document.getElementById('time-left');
  if (!el) return;
  el.textContent = Math.ceil(remaining / 1000) + 's';
  if (remaining <= 10_000) el.classList.add('urgent');
}

function sendTimeUp() {
  if (_timeUpSent || !_ctx) return;
  _timeUpSent = true;
  _ctx.client.send({ type: 'time-up' });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
