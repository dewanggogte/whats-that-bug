/**
 * Profile page UI — avatar picker, identity, stats, badges, species log.
 */

import { renderCountryOptions, getFlagForCode } from './countries.js';
import { getUserId } from './user-id.js';
import { getEarnedAchievements, getSpeciesCount, getPlayerStats, getAllBestScores, getSpeciesList, ACHIEVEMENT_DEFS } from './achievements.js';

const PROFILE_KEY = 'wtb_profile';

const AVATARS = [
  '🪲', '🐛', '🦋', '🐝', '🐞',
  '🦗', '🕷️', '🦂', '🐜', '🪳',
  '🦟', '🪰', '🐌', '🦠', '🪱',
  '🐚', '🦎', '🐸', '🪷', '🌿',
];

export function getProfile() {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}');
  } catch {
    return {};
  }
}

export function saveProfile(updates) {
  const profile = getProfile();
  Object.assign(profile, updates);
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch { /* storage full */ }
  return profile;
}

export function getAvatar() {
  return getProfile().avatar || AVATARS[0];
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function initProfilePage() {
  const container = document.getElementById('profile-root');
  if (!container) return;

  const profile = getProfile();
  const stats = getPlayerStats();
  const earned = getEarnedAchievements();
  const earnedIds = new Set(earned.map(a => a.id));
  const speciesCount = getSpeciesCount();
  const speciesList = getSpeciesList();
  const bests = getAllBestScores();

  // Compute aggregate stats
  const bestScore = Object.entries(bests)
    .filter(([k]) => !k.includes('streak'))
    .reduce((max, [, v]) => Math.max(max, v), 0);
  const bestStreak = Object.entries(bests)
    .filter(([k]) => k.includes('streak'))
    .reduce((max, [, v]) => Math.max(max, v), 0);

  const selectedAvatar = profile.avatar || AVATARS[0];

  const flagHTML = profile.country ? ` ${getFlagForCode(profile.country)}` : '';
  const displayName = escapeHTML(profile.name || 'Anonymous Bug Hunter');

  container.innerHTML = `
    <section class="profile-section profile-identity">
      <button class="profile-avatar-display" id="profile-avatar-display" aria-label="Change avatar">
        ${selectedAvatar}
        <span class="profile-avatar-edit">&#9998;</span>
      </button>
      <div class="profile-name-display">${displayName}${flagHTML}</div>
      <div class="profile-avatar-grid" id="profile-avatar-grid">
        ${AVATARS.map(a => `<button class="profile-avatar-opt${a === selectedAvatar ? ' selected' : ''}" data-avatar="${a}">${a}</button>`).join('')}
      </div>
      <div class="profile-fields" id="profile-fields">
        <div class="profile-field">
          <label for="profile-name">Name</label>
          <input type="text" id="profile-name" class="lb-input" placeholder="Anonymous Bug Hunter" maxlength="30" value="${escapeHTML(profile.name || '')}">
        </div>
        <div class="profile-field">
          <label for="profile-country">Country</label>
          <select id="profile-country" class="lb-select">
            ${renderCountryOptions(profile.country || '')}
          </select>
        </div>
        <button class="btn btn-primary profile-save-btn" id="profile-save">Save</button>
        <span class="profile-save-status" id="profile-save-status"></span>
      </div>
    </section>

    <section class="profile-section profile-stats">
      <h2>Your Stats</h2>
      <div class="profile-stats-grid">
        <div class="profile-stat-card">
          <span class="profile-stat-value">${stats.session_count || 0}</span>
          <span class="profile-stat-label">Sessions</span>
        </div>
        <div class="profile-stat-card">
          <span class="profile-stat-value">${speciesCount}</span>
          <span class="profile-stat-label">Species</span>
        </div>
        <div class="profile-stat-card">
          <span class="profile-stat-value">${bestScore}</span>
          <span class="profile-stat-label">Best Score</span>
        </div>
        <div class="profile-stat-card">
          <span class="profile-stat-value">${bestStreak}</span>
          <span class="profile-stat-label">Best Streak</span>
        </div>
      </div>
    </section>

    <section class="profile-section profile-badges">
      <h2>Badges <span class="profile-badges-count">${earned.length}/${ACHIEVEMENT_DEFS.length}</span></h2>
      <div class="profile-badges-grid">
        ${ACHIEVEMENT_DEFS.map(def => {
          const isEarned = earnedIds.has(def.id);
          return `<div class="profile-badge${isEarned ? ' earned' : ' locked'}">
            <span class="profile-badge-icon">${isEarned ? def.icon : '🔒'}</span>
            <span class="profile-badge-name">${escapeHTML(def.name)}</span>
            <span class="profile-badge-desc">${escapeHTML(def.description)}</span>
          </div>`;
        }).join('')}
      </div>
    </section>

    <section class="profile-section profile-species">
      <h2>Species Discovered <span class="profile-species-count">(${speciesCount})</span></h2>
      ${speciesList.length > 0
        ? `<div class="profile-species-list" id="profile-species-list">
            ${speciesList.sort().slice(0, 50).map(s => `<span class="profile-species-tag">${escapeHTML(s)}</span>`).join('')}
          </div>
          ${speciesList.length > 50 ? `<button class="profile-show-all-btn" id="profile-show-all">Show all ${speciesList.length} species</button>` : ''}`
        : '<p class="profile-empty">Play some rounds to start discovering species!</p>'}
    </section>

    <div class="profile-user-id">
      Player ID: <code>${getUserId().slice(0, 8)}</code>
    </div>
  `;

  // Wire up avatar tap-to-expand
  const avatarDisplay = document.getElementById('profile-avatar-display');
  const avatarGrid = document.getElementById('profile-avatar-grid');
  const fieldsBlock = document.getElementById('profile-fields');

  avatarDisplay?.addEventListener('click', () => {
    const isOpen = avatarGrid.classList.toggle('open');
    if (isOpen) fieldsBlock.classList.add('open');
  });

  // Wire up avatar picker
  container.querySelectorAll('.profile-avatar-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.profile-avatar-opt').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      // Update the display avatar (keep the edit pencil)
      const display = document.getElementById('profile-avatar-display');
      if (display) {
        display.innerHTML = `${btn.dataset.avatar}<span class="profile-avatar-edit">&#9998;</span>`;
      }
    });
  });

  // Wire up save
  document.getElementById('profile-save')?.addEventListener('click', () => {
    const selectedBtn = container.querySelector('.profile-avatar-opt.selected');
    const avatar = selectedBtn?.dataset.avatar || AVATARS[0];
    const name = document.getElementById('profile-name')?.value.trim() || '';
    const country = document.getElementById('profile-country')?.value || '';
    saveProfile({ avatar, name, country });

    // Update header avatar
    const headerAvatar = document.getElementById('header-avatar');
    if (headerAvatar) headerAvatar.textContent = avatar;

    // Update display name + flag
    const nameDisplay = container.querySelector('.profile-name-display');
    if (nameDisplay) {
      const flag = country ? ` ${getFlagForCode(country)}` : '';
      nameDisplay.innerHTML = `${escapeHTML(name || 'Anonymous Bug Hunter')}${flag}`;
    }

    // Collapse the edit section
    avatarGrid.classList.remove('open');
    fieldsBlock.classList.remove('open');

    const status = document.getElementById('profile-save-status');
    if (status) {
      status.textContent = 'Saved!';
      setTimeout(() => { status.textContent = ''; }, 2000);
    }
  });

  // Wire up show all species
  document.getElementById('profile-show-all')?.addEventListener('click', () => {
    const list = document.getElementById('profile-species-list');
    if (list) {
      list.innerHTML = speciesList.sort().map(s => `<span class="profile-species-tag">${escapeHTML(s)}</span>`).join('');
    }
    document.getElementById('profile-show-all')?.remove();
  });
}
