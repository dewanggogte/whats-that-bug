import QRCode from 'qrcode';
import { requestCreateRoom } from './client.js';
import { getUserId } from '../user-id.js';
import { logMultiplayerEvent } from '../feedback.js';

const base = window.__BASE || '';

export function initGroupCreate() {
  const btn = document.getElementById('create-group-session');
  if (!btn) return;
  btn.addEventListener('click', openGroupModal);
}

async function openGroupModal() {
  let sets = {};
  try {
    sets = await fetch(`${base}/data/sets.json`).then(r => r.json());
  } catch {}

  const setOptions = Object.entries(sets)
    .filter(([, v]) => Array.isArray(v.observation_ids) && v.observation_ids.length > 0)
    .map(([k, v]) => `<option value="${escapeHtml(k)}">${escapeHtml(v.name)}</option>`)
    .join('');

  const overlay = document.createElement('div');
  overlay.className = 'group-modal-overlay';
  overlay.innerHTML = `
    <div class="group-modal">
      <button class="group-modal-close" aria-label="Close">&times;</button>
      <h2>Create Group Session</h2>
      <div id="group-modal-body">
        <div class="party-form-row" style="flex-direction:column;align-items:flex-start;gap:8px;">
          <label class="party-label">Number of rooms</label>
          <div class="group-count-picker">
            <button class="group-count-btn selected" data-count="2" type="button">2</button>
            <button class="group-count-btn" data-count="3" type="button">3</button>
            <button class="group-count-btn" data-count="4" type="button">4</button>
          </div>
        </div>
        <div class="party-form-row">
          <label class="party-label" for="group-set-picker">Set</label>
          <select id="group-set-picker">${setOptions}</select>
        </div>
        <div class="party-form-row">
          <label class="party-label" for="group-mode-picker">Mode</label>
          <select id="group-mode-picker">
            <option value="classic">Classic (10 rounds)</option>
            <option value="time_trial">Time Trial (60s)</option>
            <option value="streak">Streak (until wrong)</option>
          </select>
        </div>
        <button class="btn btn-primary party-wide-btn" id="group-create-btn">Create Rooms</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  let selectedCount = 2;

  overlay.querySelectorAll('.group-count-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      overlay.querySelectorAll('.group-count-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedCount = parseInt(btn.dataset.count, 10);
    });
  });

  overlay.querySelector('.group-modal-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector('#group-create-btn').addEventListener('click', async () => {
    const setKey = overlay.querySelector('#group-set-picker').value;
    const scoringMode = overlay.querySelector('#group-mode-picker').value;
    const createBtn = overlay.querySelector('#group-create-btn');
    createBtn.disabled = true;
    createBtn.textContent = 'Creating rooms...';
    try {
      const rooms = await createGroupRooms(selectedCount, setKey, scoringMode);
      logMultiplayerEvent('mp_group_created', {
        room_count: selectedCount,
        set_key: setKey,
        scoring_mode: scoringMode,
      });
      showShareSheet(overlay, rooms, selectedCount);
    } catch {
      createBtn.disabled = false;
      createBtn.textContent = 'Create Rooms';
      alert('Could not create rooms. Please try again.');
    }
  });
}

async function createGroupRooms(count, setKey, scoringMode) {
  const userId = getUserId();
  const creates = Array.from({ length: count }, () =>
    requestCreateRoom({ userId, setKey, scoringMode })
  );
  const results = await Promise.all(creates);
  return results.map(({ code, createToken }) => {
    const url = `${window.location.origin}${base}/party?code=${encodeURIComponent(code)}&ct=${encodeURIComponent(createToken)}`;
    return { code, createToken, url };
  });
}

function showShareSheet(overlay, rooms, count) {
  const modalBody = overlay.querySelector('#group-modal-body');

  const roomRowsHTML = rooms.map((room, i) => `
    <div class="group-share-row">
      <div class="group-room-meta">
        <span class="group-room-label">Room ${i + 1}</span>
        <span class="group-room-code">${escapeHtml(room.code)}</span>
      </div>
      <canvas class="group-qr" id="group-qr-${i}" width="80" height="80" aria-label="QR code for room ${escapeHtml(room.code)}"></canvas>
      <button class="btn btn-outline group-copy-link" data-url="${escapeHtml(room.url)}">Copy Link</button>
    </div>
  `).join('');

  const allUrls = rooms.map(r => r.url).join('\n');

  modalBody.innerHTML = `
    <h3 style="margin-bottom:16px;">Your ${count} rooms are ready</h3>
    <div class="group-share-rows">${roomRowsHTML}</div>
    <button class="btn btn-primary party-wide-btn" id="group-copy-all" style="margin-top:12px;">Copy All Links</button>
    <p class="group-share-footer">Each room holds up to 20 players. Share one link per group.</p>
  `;

  rooms.forEach((room, i) => {
    const canvas = document.getElementById(`group-qr-${i}`);
    if (canvas) QRCode.toCanvas(canvas, room.url, { width: 80 }).catch(() => {});
  });

  modalBody.querySelectorAll('.group-copy-link').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ok = await writeToClipboard(btn.dataset.url);
      btn.textContent = ok ? 'Copied!' : 'Failed';
      setTimeout(() => { btn.textContent = 'Copy Link'; }, 1600);
    });
  });

  document.getElementById('group-copy-all').addEventListener('click', async () => {
    const allBtn = document.getElementById('group-copy-all');
    const ok = await writeToClipboard(allUrls);
    allBtn.textContent = ok ? 'Copied All!' : 'Failed';
    setTimeout(() => { allBtn.textContent = 'Copy All Links'; }, 1600);
  });
}

async function writeToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const el = document.createElement('textarea');
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    el.remove();
    return true;
  } catch {
    return false;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
