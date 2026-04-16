# Profile Page & Persistent User ID — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Add a profile page with avatar/name/country, persistent user_id for cross-session tracking, and integrate with existing logging + leaderboard systems.

**Architecture:** New `user-id.js` module provides a singleton UUID. Profile data stored in `wtb_profile` localStorage key. New `/profile` Astro page with `profile-ui.js` rendering avatar picker, identity fields, stats, badges, and species log. Leaderboard popup pre-fills from profile. All events auto-include user_id.

**Tech Stack:** Astro 4, vanilla JS, localStorage, existing countries.js for dropdown

---

### Task 1: Create user-id module and integrate into event logging

**Files:**
- Create: `src/scripts/user-id.js`
- Modify: `src/scripts/feedback.js` (enqueue function, ~line 56)
- Modify: `src/scripts/leaderboard.js` (submitLeaderboardEntry, ~line 67)

- [ ] **Step 1: Create `src/scripts/user-id.js`**

```js
/**
 * Persistent user ID — generated once, stored forever in localStorage.
 * Used to tie game sessions together across visits.
 */

const STORAGE_KEY = 'wtb_user_id';

function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

let cachedId = null;

export function getUserId() {
  if (cachedId) return cachedId;
  try {
    cachedId = localStorage.getItem(STORAGE_KEY);
    if (!cachedId) {
      cachedId = generateUUID();
      localStorage.setItem(STORAGE_KEY, cachedId);
    }
  } catch {
    cachedId = generateUUID();
  }
  return cachedId;
}
```

- [ ] **Step 2: Modify `src/scripts/feedback.js` enqueue() to auto-attach user_id**

In the `enqueue` function (~line 56), add `user_id` to every event payload automatically:

```js
// Add this import at top:
import { getUserId } from './user-id.js';

// In enqueue(), change the push to include user_id:
function enqueue(data) {
  if (!WEBHOOK_URL) {
    console.warn('[feedback] No webhook URL configured:', data.type);
    return;
  }
  queue.push({
    ...data,
    user_id: getUserId(),
    event_id: eventId(),
    timestamp: new Date().toISOString(),
  });
  // ... rest unchanged
}
```

- [ ] **Step 3: Modify `src/scripts/leaderboard.js` submitLeaderboardEntry to include user_id**

```js
// Add import at top:
import { getUserId } from './user-id.js';

// In submitLeaderboardEntry(), add user_id to the body:
export async function submitLeaderboardEntry(entry) {
  if (!WEBHOOK_URL) return null;
  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action: 'leaderboard_entry', user_id: getUserId(), ...entry }),
  });
  if (!res.ok) throw new Error(`Leaderboard submit failed: ${res.status}`);
  return res.json();
}
```

- [ ] **Step 4: Commit**

```bash
git add src/scripts/user-id.js src/scripts/feedback.js src/scripts/leaderboard.js
git commit -m "feat: add persistent user_id, attach to all events and leaderboard submissions"
```

---

### Task 2: Export player stats and add best-score helpers in achievements.js

**Files:**
- Modify: `src/scripts/achievements.js`

- [ ] **Step 1: Export `getPlayerStats` (currently private) and add helper functions**

Make `getPlayerStats` public and add `getAllBestScores()`:

```js
// Change `function getPlayerStats()` to `export function getPlayerStats()`

// Add new export after getSpeciesCount():
/**
 * Get all per-set best scores/streaks from localStorage.
 * Returns { setKey: number } for all best_* keys.
 */
export function getAllBestScores() {
  const bests = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('best_')) {
      const setKey = key.slice(5); // remove 'best_' prefix
      bests[setKey] = parseInt(localStorage.getItem(key) || '0', 10);
    }
  }
  return bests;
}

/**
 * Get the species seen list (names).
 * @returns {string[]}
 */
export function getSpeciesList() {
  try {
    return JSON.parse(localStorage.getItem('wtb_species_seen') || '[]');
  } catch {
    return [];
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/scripts/achievements.js
git commit -m "feat: export getPlayerStats and add getAllBestScores/getSpeciesList helpers"
```

---

### Task 3: Create profile page UI module

**Files:**
- Create: `src/scripts/profile-ui.js`

This is the core profile page renderer. It reads from localStorage and renders:
- Avatar picker (5x4 grid of emoji, selected one gets terracotta ring)
- Name input + country dropdown (reuses `renderCountryOptions` from countries.js)
- Save button that persists to `wtb_profile`
- Stats card (2x2 grid: sessions, species, best score, best streak)
- Badges section (all 10, earned = color, unearned = gray + "???")
- Species log (count + scrollable alphabetical list)

- [ ] **Step 1: Create `src/scripts/profile-ui.js`**

```js
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
  return getProfile().avatar || '🪲';
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

  const selectedAvatar = profile.avatar || '🪲';

  container.innerHTML = `
    <section class="profile-section profile-identity">
      <div class="profile-avatar-display" id="profile-avatar-display">${selectedAvatar}</div>
      <div class="profile-avatar-grid" id="profile-avatar-grid">
        ${AVATARS.map(a => `<button class="profile-avatar-opt${a === selectedAvatar ? ' selected' : ''}" data-avatar="${a}">${a}</button>`).join('')}
      </div>
      <div class="profile-fields">
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
      <h2>Badges</h2>
      <div class="profile-badges-grid">
        ${ACHIEVEMENT_DEFS.map(def => {
          const isEarned = earnedIds.has(def.id);
          return `<div class="profile-badge${isEarned ? ' earned' : ' locked'}">
            <span class="profile-badge-icon">${isEarned ? def.icon : '🔒'}</span>
            <span class="profile-badge-name">${isEarned ? def.name : '???'}</span>
            ${isEarned ? `<span class="profile-badge-desc">${def.description}</span>` : ''}
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

  // Wire up avatar picker
  container.querySelectorAll('.profile-avatar-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.profile-avatar-opt').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      document.getElementById('profile-avatar-display').textContent = btn.dataset.avatar;
    });
  });

  // Wire up save
  document.getElementById('profile-save')?.addEventListener('click', () => {
    const selectedBtn = container.querySelector('.profile-avatar-opt.selected');
    const avatar = selectedBtn?.dataset.avatar || '🪲';
    const name = document.getElementById('profile-name')?.value.trim() || '';
    const country = document.getElementById('profile-country')?.value || '';
    saveProfile({ avatar, name, country });
    // Update header avatar
    const headerAvatar = document.getElementById('header-avatar');
    if (headerAvatar) headerAvatar.textContent = avatar;
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

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
```

Note: `renderCountryOptions` currently doesn't accept a pre-selected value. Check if it does — if not, update the call to pass the selected country code. The current signature in `countries.js` is `renderCountryOptions()` with no params. The profile page needs to pre-select the saved country. Either modify `renderCountryOptions` to accept an optional selected code, or set the select value after rendering via JS.

- [ ] **Step 2: Commit**

```bash
git add src/scripts/profile-ui.js
git commit -m "feat: create profile-ui.js with avatar picker, stats, badges, species log"
```

---

### Task 4: Create profile Astro page

**Files:**
- Create: `src/pages/profile.astro`

- [ ] **Step 1: Create `src/pages/profile.astro`**

```astro
---
import Base from '../layouts/Base.astro';
---
<Base
  title="Your Profile — What's That Bug?"
  description="View your bug-hunting stats, badges, and species discoveries"
  canonicalPath="/profile"
>
  <div class="container" style="max-width: 600px; margin: 0 auto; padding: 16px;">
    <div id="profile-root"></div>
  </div>

  <script>
    import { initProfilePage } from '../scripts/profile-ui.js';
    document.addEventListener('DOMContentLoaded', initProfilePage);
  </script>
</Base>
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/profile.astro
git commit -m "feat: add /profile Astro page"
```

---

### Task 5: Add header avatar button and pre-fill leaderboard from profile

**Files:**
- Modify: `src/layouts/Base.astro` (header nav, ~line 94)
- Modify: `src/scripts/leaderboard-ui.js` (celebration popup, ~line 145-150)

- [ ] **Step 1: Add avatar button to header nav in Base.astro**

In the `<nav class="site-nav">` section (~line 94), add a profile link before "Leaderboard":

```html
<nav class="site-nav">
  <a href="/profile" class="header-avatar-link" id="header-avatar-link">
    <span class="header-avatar" id="header-avatar">🪲</span>
  </a>
  <a href="/leaderboard">Leaderboard</a>
  <!-- ...sound toggle, theme toggle... -->
</nav>
```

Add an inline script (after the theme toggle script) to set the avatar from localStorage on load:

```html
<script is:inline>
  (function() {
    try {
      var profile = JSON.parse(localStorage.getItem('wtb_profile') || '{}');
      var el = document.getElementById('header-avatar');
      if (el && profile.avatar) el.textContent = profile.avatar;
    } catch {}
  })();
</script>
```

- [ ] **Step 2: Pre-fill leaderboard popup from profile data**

In `src/scripts/leaderboard-ui.js`, in `showCelebrationPopup()`, pre-fill the name input and country select from `wtb_profile`:

After the overlay is appended to the DOM (~after line 166), add:

```js
// Pre-fill from profile
try {
  const profile = JSON.parse(localStorage.getItem('wtb_profile') || '{}');
  if (profile.name) {
    const nameInput = overlay.querySelector('#lb-name');
    if (nameInput) nameInput.value = profile.name;
  }
  if (profile.country) {
    const countrySelect = overlay.querySelector('#lb-country');
    if (countrySelect) countrySelect.value = profile.country;
  }
} catch {}
```

Also in `submitEntry`, after successful submission, write name/country back to profile:

```js
// After the submitLeaderboardEntry() call succeeds, sync back to profile:
try {
  const current = JSON.parse(localStorage.getItem('wtb_profile') || '{}');
  if (name) current.name = name;
  if (country) current.country = country;
  localStorage.setItem('wtb_profile', JSON.stringify(current));
} catch {}
```

- [ ] **Step 3: Commit**

```bash
git add src/layouts/Base.astro src/scripts/leaderboard-ui.js
git commit -m "feat: add header avatar button and pre-fill leaderboard popup from profile"
```

---

### Task 6: Add profile page CSS styles

**Files:**
- Modify: `src/styles/global.css` (append profile section)

- [ ] **Step 1: Add profile styles at end of global.css**

```css
/* ── Profile Page ── */

.profile-section {
  margin-bottom: 24px;
}

.profile-section h2 {
  font-family: var(--font-display);
  font-size: 1.2rem;
  font-weight: 700;
  margin-bottom: 12px;
}

.profile-identity {
  text-align: center;
  padding: 24px 0;
}

.profile-avatar-display {
  font-size: 64px;
  line-height: 1;
  margin-bottom: 16px;
}

.profile-avatar-grid {
  display: grid;
  grid-template-columns: repeat(5, 48px);
  gap: 8px;
  justify-content: center;
  margin-bottom: 20px;
}

.profile-avatar-opt {
  width: 48px;
  height: 48px;
  font-size: 24px;
  border: 2px solid var(--border);
  border-radius: 50%;
  background: var(--surface);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.15s, transform 0.15s;
}

.profile-avatar-opt:hover {
  border-color: var(--primary);
  transform: scale(1.1);
}

.profile-avatar-opt.selected {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(184, 90, 59, 0.2);
}

.profile-fields {
  max-width: 320px;
  margin: 0 auto;
  text-align: left;
}

.profile-field {
  margin-bottom: 12px;
}

.profile-field label {
  display: block;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.profile-save-btn {
  width: 100%;
  margin-top: 4px;
}

.profile-save-status {
  display: block;
  text-align: center;
  color: var(--primary);
  font-size: 0.85rem;
  font-weight: 600;
  min-height: 20px;
  margin-top: 8px;
}

/* Stats grid */
.profile-stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.profile-stat-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
  text-align: center;
  box-shadow: 0 2px 8px rgba(184, 90, 59, 0.06);
}

.profile-stat-value {
  display: block;
  font-family: var(--font-display);
  font-size: 1.8rem;
  font-weight: 800;
  color: var(--text);
  line-height: 1.2;
}

.profile-stat-label {
  display: block;
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-top: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Badges */
.profile-badges-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
}

.profile-badge {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px 10px;
  text-align: center;
  box-shadow: 0 2px 8px rgba(184, 90, 59, 0.06);
}

.profile-badge.locked {
  opacity: 0.5;
}

.profile-badge-icon {
  display: block;
  font-size: 28px;
  margin-bottom: 6px;
}

.profile-badge-name {
  display: block;
  font-family: var(--font-display);
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text);
}

.profile-badge-desc {
  display: block;
  font-size: 0.7rem;
  color: var(--text-secondary);
  margin-top: 2px;
}

/* Species */
.profile-species-count {
  font-weight: 400;
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.profile-species-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 300px;
  overflow-y: auto;
}

.profile-species-tag {
  display: inline-block;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 4px 12px;
  font-size: 0.78rem;
  font-style: italic;
  color: var(--text);
}

.profile-show-all-btn {
  display: block;
  margin: 12px auto 0;
  background: none;
  border: none;
  color: var(--primary);
  font-size: 0.85rem;
  cursor: pointer;
  text-decoration: underline;
}

.profile-empty {
  text-align: center;
  color: var(--text-secondary);
  font-size: 0.85rem;
  padding: 16px 0;
}

.profile-user-id {
  text-align: center;
  color: var(--text-secondary);
  font-size: 0.75rem;
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}

.profile-user-id code {
  font-family: monospace;
  background: var(--bg);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.75rem;
}

/* Header avatar */
.header-avatar-link {
  text-decoration: none;
  display: flex;
  align-items: center;
}

.header-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  font-size: 20px;
  border: 2px solid var(--border);
  border-radius: 50%;
  background: var(--surface);
  transition: border-color 0.15s;
}

.header-avatar-link:hover .header-avatar {
  border-color: var(--primary);
}

/* Dark mode adjustments */
[data-theme="dark"] .profile-avatar-opt.selected {
  box-shadow: 0 0 0 3px rgba(224, 160, 112, 0.25);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/styles/global.css
git commit -m "feat: add profile page CSS styles and header avatar styling"
```

---

### Task 7: Handle renderCountryOptions pre-selection

**Files:**
- Modify: `src/scripts/countries.js` (renderCountryOptions function)

The current `renderCountryOptions()` takes no arguments. The profile page needs to pre-select the user's saved country. Either:
1. Add an optional `selectedCode` parameter, or
2. Set the select value via JS after rendering

Option 1 is cleaner. Update the function signature:

- [ ] **Step 1: Update renderCountryOptions to accept optional selectedCode**

Find the current `renderCountryOptions` function and add an optional parameter:

```js
export function renderCountryOptions(selectedCode = '') {
  return `<option value="">-- Select country --</option>` +
    COUNTRIES.map(c => 
      `<option value="${c.code}"${c.code === selectedCode ? ' selected' : ''}>${c.flag} ${c.name}</option>`
    ).join('');
}
```

Check that existing callers (leaderboard-ui.js) don't break — they call `renderCountryOptions()` with no args, so the default `''` means nothing is pre-selected, same as before.

- [ ] **Step 2: Commit**

```bash
git add src/scripts/countries.js
git commit -m "feat: add optional selectedCode param to renderCountryOptions"
```
