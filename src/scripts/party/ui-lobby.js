import QRCode from 'qrcode';
import { getUserId } from '../user-id.js';
import { createPartyClient } from './client.js';
import { loadPartySession, savePartySession, pruneOldPartySessions } from './session-storage.js';
import { isValidCodeShape } from './codes-client.js';
import { PARTY_PROTOCOL_VERSION } from './protocol.js';
import { initGameUI, applyState, applyLeaderboard, applyQuestionResult, applyGameOver } from './ui-game.js';

export async function initPartyRoom(code) {
  const base = window.__BASE || '';
  pruneOldPartySessions();

  if (!isValidCodeShape(code)) {
    document.querySelector('.party-room').innerHTML = `<section class="party-panel"><h1>Invalid party code</h1><p><a href="${base}/party">Back to party mode</a></p></section>`;
    return;
  }

  const userId = getUserId();
  const displayName = await promptForName(code);
  const partySession = loadPartySession(code) || {};
  let playerId = partySession.playerId || null;
  const [sets] = await Promise.all([
    fetch(`${base}/data/sets.json`).then(r => r.json()),
  ]);

  const content = document.getElementById('party-content');
  let currentState = null;
  let gameStartedMsg = null;
  let fatalShown = false;
  const createToken = sessionStorage.getItem(`wtb_party_create_${code}`) || undefined;

  const FATAL_ERROR_CODES = new Set(['ROOM_NOT_FOUND', 'GAME_IN_PROGRESS', 'ROOM_FULL', 'AT_CAPACITY', 'BAD_REJOIN_TOKEN', 'CONFIG_ERROR']);

  const client = createPartyClient({
    roomCode: code,
    userId,
    displayName,
    createToken,
    rejoinToken: partySession.rejoinToken,
    onOpen: () => {
      if (!fatalShown) content.innerHTML = '<div class="party-panel"><p>Connecting...</p></div>';
    },
    onMessage: (msg) => {
      if (msg.type === 'identified') {
        if (!hasCurrentProtocol(msg)) return renderProtocolMismatch(client);
        playerId = msg.playerId;
        savePartySession(code, { displayName, playerId, rejoinToken: msg.rejoinToken });
        sessionStorage.removeItem(`wtb_party_create_${code}`);
        if (currentState) renderRoom();
      } else if (msg.type === 'state') {
        if (!hasCurrentProtocol(msg.state)) return renderProtocolMismatch(client);
        currentState = msg.state;
        if (gameStartedMsg && currentState.status === 'lobby') {
          gameStartedMsg = null;
          renderRoom();
        } else if (gameStartedMsg) {
          applyState(currentState);
        } else {
          renderRoom();
        }
      } else if (msg.type === 'game-started') {
        if (!hasCurrentProtocol(msg)) return renderProtocolMismatch(client);
        gameStartedMsg = msg;
        renderGame(msg);
      } else if (msg.type === 'leaderboard-update') {
        applyLeaderboard(msg.leaderboard);
      } else if (msg.type === 'question-result') {
        applyQuestionResult(msg);
      } else if (msg.type === 'game-over') {
        applyGameOver(msg, { client, isHost: currentState?.hostId === playerId });
      } else if (msg.type === 'kicked') {
        alert('You were removed from the party.');
        window.location.href = `${base}/party`;
      } else if (msg.type === 'error') {
        if (FATAL_ERROR_CODES.has(msg.code)) {
          renderFatal(msg.code, msg.message);
          client.close();
        } else {
          showError(msg.message);
        }
      }
    },
    onClose: () => {
      if (!fatalShown) showError('Disconnected. Try refreshing.');
    },
  });

  let renderedAs = null; // 'host' | 'guest' — track which skeleton is mounted

  function renderRoom() {
    if (!currentState) return;
    if (currentState.status === 'playing') return;
    if (currentState.status === 'ended') {
      content.innerHTML = `<section class="party-panel"><h1>Party ended</h1><p><a href="${base}/party">Create or join another party</a></p></section>`;
      renderedAs = null;
      return;
    }

    const isHost = currentState.hostId === playerId;
    const role = isHost ? 'host' : 'guest';

    if (renderedAs !== role) {
      // First render or host changed — rebuild from scratch
      fullRender(isHost);
      renderedAs = role;
    } else {
      // Just patch the bits that can change without destroying open dropdowns
      updatePlayerCountHeader();
      updateRoster(isHost);
      if (isHost) updateStartButton();
      else updateGuestSelection();
    }
  }

  function fullRender(isHost) {
    content.innerHTML = `
      <div class="party-lobby-grid">
        <section class="party-panel party-share-panel">
          <p class="party-eyebrow">Party code</p>
          <h1 class="room-code">${escapeHtml(code)}</h1>
          <div class="party-share-actions">
            <button class="btn btn-outline" id="copy-link">Copy Link</button>
            <canvas id="qr" width="128" height="128" aria-label="QR code for party link"></canvas>
          </div>
        </section>

        <section class="party-panel lobby-roster">
          <h2 id="player-count-header"></h2>
          <ul class="party-player-list" id="player-list"></ul>
        </section>
      </div>

      <section class="party-panel" id="controls-panel">
        ${isHost ? renderHostControls() : renderGuestSelection()}
      </section>
      <div id="error-bar" class="error-bar" hidden></div>
    `;

    QRCode.toCanvas(document.getElementById('qr'), window.location.href, { width: 128 }).catch(() => {});
    document.getElementById('copy-link').addEventListener('click', copyRoomLink);
    updatePlayerCountHeader();
    updateRoster(isHost);
    if (isHost) wireHostControls();
  }

  function updatePlayerCountHeader() {
    const el = document.getElementById('player-count-header');
    if (!el) return;
    el.textContent = `Players (${connectedCount()} connected · ${currentState.players.length}/5 in room)`;
  }

  function updateRoster(isHost) {
    const list = document.getElementById('player-list');
    if (!list) return;
    list.innerHTML = currentState.players.map(p => `
      <li class="party-player ${p.id === currentState.hostId ? 'host' : ''} ${!p.connected ? 'disconnected' : ''}">
        <span>
          <strong>${escapeHtml(p.displayName)}</strong>
          ${p.id === currentState.hostId ? '<span class="host-pill">Host</span>' : ''}
          ${!p.connected ? '<span class="offline-pill">Disconnected</span>' : ''}
          ${p.wins > 0 ? `<span class="wins-pill" title="${p.wins} ${p.wins === 1 ? 'win' : 'wins'} this party">🏆 ${p.wins}</span>` : ''}
        </span>
        ${isHost && p.id !== playerId ? `<button class="btn-mini kick" data-id="${escapeHtml(p.id)}">Kick</button>` : ''}
      </li>
    `).join('');
    list.querySelectorAll('button.kick').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.closest('.party-player')?.querySelector('strong')?.textContent || 'this player';
        if (confirm(`Kick ${name}?`)) client.send({ type: 'kick-player', playerId: btn.dataset.id });
      });
    });
  }

  function updateStartButton() {
    const btn = document.getElementById('start-game');
    if (!btn) return;
    const connected = connectedCount();
    btn.disabled = connected < 2;
    btn.textContent = connected < 2 ? 'Need 2+ Connected Players' : 'Start Game';
  }

  function updateGuestSelection() {
    const panel = document.getElementById('controls-panel');
    if (!panel) return;
    panel.innerHTML = renderGuestSelection();
  }

  function connectedCount() {
    return currentState.players.filter(p => p.connected).length;
  }

  function renderHostControls() {
    const selectedSet = currentState.selection?.setKey || 'bugs_101';
    const selectedMode = currentState.selection?.mode || 'classic';
    const setOptions = Object.entries(sets)
      .filter(([, v]) => Array.isArray(v.observation_ids) && v.observation_ids.length > 0)
      .map(([k, v]) => `<option value="${escapeHtml(k)}" ${k === selectedSet ? 'selected' : ''}>${escapeHtml(v.name)}</option>`)
      .join('');
    const connected = connectedCount();
    return `
      <div class="host-controls">
        <h2>Game Setup</h2>
        <div class="party-form-row">
          <label class="party-label" for="set-picker">Set</label>
          <select id="set-picker">${setOptions}</select>
        </div>
        <div class="party-form-row">
          <label class="party-label" for="mode-picker">Mode</label>
          <select id="mode-picker">
            <option value="classic" ${selectedMode === 'classic' ? 'selected' : ''}>Classic (10 rounds)</option>
            <option value="time_trial" ${selectedMode === 'time_trial' ? 'selected' : ''}>Time Trial (60s)</option>
            <option value="streak" ${selectedMode === 'streak' ? 'selected' : ''}>Streak (until wrong)</option>
          </select>
        </div>
        <button class="btn btn-primary party-wide-btn" id="start-game" ${connected < 2 ? 'disabled' : ''}>
          ${connected < 2 ? 'Need 2+ Connected Players' : 'Start Game'}
        </button>
      </div>
    `;
  }

  function renderGuestSelection() {
    const sel = currentState.selection;
    const setName = sel?.setKey ? (sets[sel.setKey]?.name || sel.setKey) : 'Not picked yet';
    const modeLabel = sel?.mode ? modeDisplayName(sel.mode) : 'Not picked yet';
    return `
      <div class="host-controls">
        <h2>Game Setup</h2>
        <div class="party-form-row"><span class="party-label">Set</span><strong>${escapeHtml(setName)}</strong></div>
        <div class="party-form-row"><span class="party-label">Mode</span><strong>${escapeHtml(modeLabel)}</strong></div>
        <p class="party-waiting-copy">Waiting for the host to start the game.</p>
      </div>
    `;
  }

  function renderFatal(errorCode, message) {
    fatalShown = true;
    const safeMessage = escapeHtml(message || 'Could not join this party.');
    content.innerHTML = `
      <section class="party-panel">
        <p class="party-eyebrow">${escapeHtml(errorCode)}</p>
        <h1>Can't join party ${escapeHtml(code)}</h1>
        <p>${safeMessage}</p>
        <p><a class="btn btn-outline" href="${base}/party">Back to party</a></p>
      </section>
    `;
  }

  function renderProtocolMismatch(client) {
    renderFatal(
      'PROTOCOL_MISMATCH',
      'Multiplayer is updating. Refresh in a minute, then create a new party.'
    );
    client.close();
  }

  function wireHostControls() {
    const setPicker = document.getElementById('set-picker');
    const modePicker = document.getElementById('mode-picker');
    const sendSelection = () => {
      client.send({ type: 'set-selection', setKey: setPicker.value, mode: modePicker.value });
    };
    setPicker.addEventListener('change', sendSelection);
    modePicker.addEventListener('change', sendSelection);
    if (!currentState.selection) sendSelection();
    document.getElementById('start-game').addEventListener('click', () => {
      client.send({ type: 'start-game' });
    });
  }

  function renderGame(msg) {
    initGameUI(content, {
      code,
      playerId,
      state: currentState,
      gameStarted: msg,
      client,
      isHost: currentState?.hostId === playerId,
    });
  }

  function showError(msg) {
    let bar = document.getElementById('error-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'error-bar';
      bar.className = 'error-bar';
      content.prepend(bar);
    }
    bar.textContent = msg;
    bar.hidden = false;
    setTimeout(() => { bar.hidden = true; }, 4000);
  }
}

function hasCurrentProtocol(msg) {
  return msg?.protocolVersion === PARTY_PROTOCOL_VERSION;
}

function promptForName(code) {
  const session = loadPartySession(code);
  const nameInput = document.getElementById('display-name');
  const enterBtn = document.getElementById('enter-room');
  if (session?.displayName) nameInput.value = session.displayName;
  nameInput.focus();

  return new Promise(resolve => {
    const enter = () => {
      const name = nameInput.value.trim().slice(0, 20);
      if (!name) {
        nameInput.focus();
        return;
      }
      savePartySession(code, { displayName: name });
      document.getElementById('name-prompt').hidden = true;
      document.getElementById('party-content').hidden = false;
      resolve(name);
    };
    enterBtn.addEventListener('click', enter);
    nameInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') enter();
    });
  });
}

function copyRoomLink() {
  const text = window.location.href;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  const input = document.createElement('input');
  input.value = text;
  document.body.appendChild(input);
  input.select();
  document.execCommand('copy');
  input.remove();
}

function modeDisplayName(mode) {
  if (mode === 'classic') return 'Classic (10 rounds)';
  if (mode === 'time_trial') return 'Time Trial (60s)';
  if (mode === 'streak') return 'Streak (until wrong)';
  return mode;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
