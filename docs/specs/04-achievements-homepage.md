# Spec 4: Achievement & Homepage System

**PRD features merged:** #14 Achievement Badge System (4E), #9 Homepage Comeback Hooks (4D)

**Files owned (only this spec touches these):**
- Create: `src/scripts/achievements.js` — achievement logic, localStorage tracking, exported API
- Modify: `src/pages/index.astro` — homepage stats, streak warnings, achievement display

**Dependencies:** None. This spec is fully independent.

**Contract produced:** Contract B — the achievements.js exported API. Spec 3 imports and calls these functions from `game-ui.js`.

---

## Context

The homepage (`index.astro`) currently shows:
- Mode groups (Daily Challenge, Bugs 101, All Bugs, Themed Sets)
- Best scores from localStorage (displayed on mode buttons via inline `<script>`)
- Daily challenge status (played today? streak count?)
- First-visit onboarding (imported from `onboarding.js`)

There is no progression system. Players have no sense of cumulative accomplishment or reason to return. This spec adds:
1. An achievement system that tracks milestones in localStorage
2. Homepage "comeback hooks" — streak warnings, weekly stats, achievement badges

---

## Part 1: Achievement System (`achievements.js`)

### 1A. Achievement Definitions

```javascript
/**
 * achievements.js — Achievement tracking and badge system.
 * All state persisted in localStorage. No server needed.
 *
 * Exported API (Contract B — consumed by Spec 3's game-ui.js):
 *   checkRoundAchievements(session, roundResult) → Achievement[]
 *   checkSessionAchievements(session, setKey) → Achievement[]
 *   renderAchievementToast(achievement) → string
 *   getEarnedAchievements() → Achievement[]
 *   getSpeciesCount() → number
 */

const STORAGE_KEY = 'wtb_achievements';
const SPECIES_KEY = 'wtb_species_seen';
const STATS_KEY = 'wtb_player_stats';

/**
 * @typedef {{ id: string, name: string, description: string, rarity: string, icon: string }} Achievement
 */

const ACHIEVEMENT_DEFS = [
  // Session-based
  { id: 'first_flight',    name: 'First Flight',    description: 'Complete your first session',    rarity: 'common',    icon: '🦋', check: 'session' },
  { id: 'bug_scholar',     name: 'Bug Scholar',     description: 'Score 800+ in classic mode',     rarity: 'uncommon',  icon: '🔬', check: 'session' },
  { id: 'speed_demon',     name: 'Speed Demon',     description: 'Score 500+ in time trial',       rarity: 'uncommon',  icon: '⚡', check: 'session' },
  { id: 'unbreakable',     name: 'Unbreakable',     description: '15+ streak in streak mode',      rarity: 'rare',      icon: '🛡️', check: 'session' },
  { id: 'perfect_round',   name: 'Perfect Round',   description: '1000/1000 in classic mode',      rarity: 'very_rare', icon: '💎', check: 'session' },

  // Cumulative (checked at session end)
  { id: 'century_club',    name: 'Century Club',    description: 'Identify 100 unique species',    rarity: 'rare',      icon: '💯', check: 'cumulative' },
  { id: 'order_expert',    name: 'Order Expert',    description: 'Score 90%+ on a themed set',     rarity: 'uncommon',  icon: '🎯', check: 'session' },
  { id: 'entomologist',    name: 'Entomologist',    description: 'Identify 500 unique species',    rarity: 'legendary', icon: '🏆', check: 'cumulative' },

  // Daily-based (checked externally — daily-ui.js would call these if needed)
  { id: 'daily_devotee',   name: 'Daily Devotee',   description: '7-day daily play streak',        rarity: 'rare',      icon: '📅', check: 'daily' },
  { id: 'bug_whisperer',   name: 'Bug Whisperer',   description: '30-day daily play streak',       rarity: 'epic',      icon: '🌟', check: 'daily' },
];
```

### 1B. Storage Helpers

```javascript
function getEarnedIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function markEarned(id) {
  const earned = getEarnedIds();
  if (earned.has(id)) return false; // already earned
  earned.add(id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...earned]));
  } catch { /* storage full */ }
  return true; // newly earned
}

function getPlayerStats() {
  try {
    return JSON.parse(localStorage.getItem(STATS_KEY) || '{}');
  } catch {
    return {};
  }
}

function updatePlayerStats(updates) {
  const stats = getPlayerStats();
  Object.assign(stats, updates);
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch { /* storage full */ }
  return stats;
}
```

### 1C. Check Functions (Exported — Contract B)

```javascript
/**
 * Check achievements that can trigger after any round.
 * Called by game-ui.js handleAnswer().
 * Currently no per-round achievements defined, but the hook exists for future use.
 * @param {SessionState} session
 * @param {{ score: number, correct: object }} roundResult
 * @returns {Achievement[]} newly earned achievements
 */
export function checkRoundAchievements(session, roundResult) {
  // Reserved for future per-round achievements (e.g., "identify 5 in a row")
  // Currently returns empty — keeps the hook in place without overhead
  return [];
}

/**
 * Check achievements at session end.
 * Called by game-ui.js render*Summary().
 * @param {SessionState} session
 * @param {string} setKey
 * @returns {Achievement[]} newly earned achievements
 */
export function checkSessionAchievements(session, setKey) {
  const earned = getEarnedIds();
  const newlyEarned = [];

  function award(id) {
    if (earned.has(id)) return;
    if (markEarned(id)) {
      const def = ACHIEVEMENT_DEFS.find(d => d.id === id);
      if (def) newlyEarned.push(def);
    }
  }

  // Track session count
  const stats = getPlayerStats();
  const sessionCount = (stats.session_count || 0) + 1;
  updatePlayerStats({ session_count: sessionCount, last_played: new Date().toISOString() });

  // First Flight — any completed session
  award('first_flight');

  // Bug Scholar — 800+ in classic
  if (session.mode === 'classic' && session.totalScore >= 800) {
    award('bug_scholar');
  }

  // Perfect Round — 1000/1000 in classic
  if (session.mode === 'classic' && session.totalScore === 1000) {
    award('perfect_round');
  }

  // Speed Demon — 500+ in time trial
  if (session.mode === 'time_trial' && session.totalScore >= 500) {
    award('speed_demon');
  }

  // Unbreakable — 15+ in streak
  if (session.mode === 'streak' && session.currentStreak >= 15) {
    award('unbreakable');
  }

  // Order Expert — 90%+ on a themed set (not bugs_101 or all_bugs)
  const themedSets = ['backyard_basics', 'tiny_terrors', 'beetles', 'butterflies_moths', 'spiders'];
  if (themedSets.includes(setKey) && session.mode === 'classic' && session.totalScore >= 900) {
    award('order_expert');
  }

  // Cumulative species checks
  const speciesCount = getSpeciesCount();
  if (speciesCount >= 100) award('century_club');
  if (speciesCount >= 500) award('entomologist');

  return newlyEarned;
}

/**
 * Check daily-streak achievements.
 * Called from daily-ui.js after a daily challenge is completed.
 * @param {number} playStreak — current consecutive days played
 * @returns {Achievement[]} newly earned achievements
 */
export function checkDailyAchievements(playStreak) {
  const newlyEarned = [];

  function award(id) {
    if (markEarned(id)) {
      const def = ACHIEVEMENT_DEFS.find(d => d.id === id);
      if (def) newlyEarned.push(def);
    }
  }

  if (playStreak >= 7) award('daily_devotee');
  if (playStreak >= 30) award('bug_whisperer');

  return newlyEarned;
}

/**
 * Render achievement toast HTML.
 * @param {Achievement} achievement
 * @returns {string} HTML string
 */
export function renderAchievementToast(achievement) {
  return `
    <div class="achievement-toast">
      <span class="achievement-toast-icon">${achievement.icon}</span>
      <div class="achievement-toast-text">
        <span class="achievement-toast-name">${achievement.name}</span>
        <span class="achievement-toast-desc">${achievement.description}</span>
      </div>
    </div>
  `;
}

/**
 * Get all earned achievements with full definitions.
 * @returns {Achievement[]}
 */
export function getEarnedAchievements() {
  const earnedIds = getEarnedIds();
  return ACHIEVEMENT_DEFS.filter(d => earnedIds.has(d.id));
}

/**
 * Get count of unique species the player has identified.
 * @returns {number}
 */
export function getSpeciesCount() {
  try {
    return JSON.parse(localStorage.getItem(SPECIES_KEY) || '[]').length;
  } catch {
    return 0;
  }
}
```

---

## Part 2: Homepage Comeback Hooks (`index.astro`)

### 2A. Weekly Stats Summary

Add a stats card to the homepage that shows the player's week at a glance. This goes in the `<script>` section at the bottom of `index.astro`.

**Add a new `<script>` block** (after the existing onboarding script at line 200-203):

```html
<script>
  // --- Player Stats Card ---
  // Dynamic import so the build doesn't break if achievements.js hasn't merged yet
  try {
    const { getEarnedAchievements, getSpeciesCount } = await import('../scripts/achievements.js');
    const stats = JSON.parse(localStorage.getItem('wtb_player_stats') || '{}');
    const speciesCount = getSpeciesCount();
    const sessionCount = stats.session_count || 0;
    const achievements = getEarnedAchievements();

    // Only show stats card if player has at least 3 sessions (not first-timers)
    if (sessionCount >= 3) {
      const statsCard = document.createElement('div');
      statsCard.className = 'player-stats-card';
      statsCard.innerHTML = `
        <div class="stats-row">
          <div class="stat-item">
            <span class="stat-value">${sessionCount}</span>
            <span class="stat-label">sessions</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">${speciesCount}</span>
            <span class="stat-label">species ID'd</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">${achievements.length}</span>
            <span class="stat-label">badges</span>
          </div>
        </div>
        ${achievements.length > 0 ? `
          <div class="stats-badges">
            ${achievements.map(a => `<span title="${a.name}: ${a.description}">${a.icon}</span>`).join(' ')}
          </div>
        ` : ''}
      `;

      // Insert after the page title, before the first mode-group
      const container = document.querySelector('.container');
      const firstModeGroup = container.querySelector('.mode-group');
      if (firstModeGroup) {
        container.insertBefore(statsCard, firstModeGroup);
      }
    }
  } catch { /* ignore — non-critical UI enhancement */ }
</script>
```

### 2B. Daily Streak Warning

If the player has a 3+ day daily play streak and hasn't played today, show urgency messaging on the daily challenge card.

**Modify the existing daily challenge script** (lines 173-198 in `index.astro`):

After the existing streak display logic (line 192-196), add:

```javascript
// Streak at risk warning
if (streaks.playStreak >= 3 && !result) {
  // Player has streak but hasn't played today
  const streakWarning = document.createElement('div');
  streakWarning.className = 'streak-warning';
  streakWarning.textContent = `${streaks.playStreak}-day streak at risk!`;
  const dailyGroup = document.querySelector('.mode-group[style*="border"]');
  if (dailyGroup) {
    const header = dailyGroup.querySelector('.mode-group-header');
    if (header) header.appendChild(streakWarning);
  }
}
```

### 2C. Stats Card CSS

Add these styles. Since this spec doesn't own `global.css` (Spec 1 does), add them as a `<style>` tag inside the `index.astro` page. Astro scopes `<style>` by default, but use `is:global` if the elements are injected via JS:

```html
<style is:global>
  .player-stats-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 20px;
  }

  .stats-row {
    display: flex;
    justify-content: space-around;
    text-align: center;
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .stat-value {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--accent);
  }

  .stat-label {
    font-size: 0.8rem;
    color: var(--text-secondary);
  }

  .stats-badges {
    margin-top: 12px;
    text-align: center;
    font-size: 1.3rem;
    letter-spacing: 4px;
  }

  .streak-warning {
    display: inline-block;
    margin-top: 4px;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--error);
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }
</style>
```

---

## Part 3: Milestone Celebrations

### 3A. Species Milestone Check

When the species count crosses a milestone (50, 100, 250, 500, 1000), the achievement system handles it via `century_club` and `entomologist`. But for smaller milestones (every 50), we can show a subtle note on the homepage.

**In the homepage stats script (Part 2A)**, add after the speciesCount calculation:

```javascript
// Species milestone — show once per milestone
const milestones = [50, 100, 150, 200, 250, 500, 1000];
const milestone = milestones.filter(m => speciesCount >= m).pop();
const lastCelebrated = parseInt(localStorage.getItem('wtb_last_milestone') || '0', 10);

if (milestone && milestone > lastCelebrated) {
  localStorage.setItem('wtb_last_milestone', milestone.toString());
  // Show brief celebration on next page load — store flag
  localStorage.setItem('wtb_show_milestone', milestone.toString());
}

const pendingMilestone = localStorage.getItem('wtb_show_milestone');
if (pendingMilestone) {
  localStorage.removeItem('wtb_show_milestone');
  // Insert milestone banner
  const banner = document.createElement('div');
  banner.className = 'milestone-banner';
  banner.innerHTML = `🎉 You've identified <strong>${pendingMilestone}</strong> unique species!`;
  const container = document.querySelector('.container');
  container.insertBefore(banner, container.firstChild);
  // Auto-dismiss after 5 seconds
  setTimeout(() => { banner.style.opacity = '0'; setTimeout(() => banner.remove(), 500); }, 5000);
}
```

Add to the `<style is:global>` block:

```css
.milestone-banner {
  background: var(--accent);
  color: white;
  text-align: center;
  padding: 12px 16px;
  border-radius: 12px;
  margin-bottom: 16px;
  font-size: 0.95rem;
  transition: opacity 500ms ease-out;
}
```

---

## Testing

### Unit tests

Create `tests/achievements.test.js`:

```javascript
import { describe, it, expect, beforeEach } from 'vitest';

// Mock localStorage
const store = {};
beforeEach(() => {
  Object.keys(store).forEach(k => delete store[k]);
  global.localStorage = {
    getItem: k => store[k] ?? null,
    setItem: (k, v) => { store[k] = v; },
    removeItem: k => { delete store[k]; },
  };
});

describe('achievements', () => {
  it('awards first_flight on any session completion', async () => {
    const { checkSessionAchievements } = await import('../src/scripts/achievements.js');
    const session = { mode: 'classic', totalScore: 300, currentStreak: 0 };
    const result = checkSessionAchievements(session, 'all_bugs');
    expect(result.some(a => a.id === 'first_flight')).toBe(true);
  });

  it('does not re-award existing achievements', async () => {
    const { checkSessionAchievements } = await import('../src/scripts/achievements.js');
    const session = { mode: 'classic', totalScore: 300, currentStreak: 0 };
    checkSessionAchievements(session, 'all_bugs'); // first call
    const result = checkSessionAchievements(session, 'all_bugs'); // second call
    expect(result.some(a => a.id === 'first_flight')).toBe(false);
  });

  it('awards bug_scholar for 800+ classic score', async () => {
    const { checkSessionAchievements } = await import('../src/scripts/achievements.js');
    const session = { mode: 'classic', totalScore: 850, currentStreak: 0 };
    const result = checkSessionAchievements(session, 'all_bugs');
    expect(result.some(a => a.id === 'bug_scholar')).toBe(true);
  });

  it('awards century_club at 100 species', async () => {
    // Seed 100 species
    const species = Array.from({ length: 100 }, (_, i) => `Species_${i}`);
    store.wtb_species_seen = JSON.stringify(species);

    const { checkSessionAchievements } = await import('../src/scripts/achievements.js');
    const session = { mode: 'classic', totalScore: 500, currentStreak: 0 };
    const result = checkSessionAchievements(session, 'all_bugs');
    expect(result.some(a => a.id === 'century_club')).toBe(true);
  });

  it('getEarnedAchievements returns full definitions', async () => {
    store.wtb_achievements = JSON.stringify(['first_flight', 'bug_scholar']);
    const { getEarnedAchievements } = await import('../src/scripts/achievements.js');
    const earned = getEarnedAchievements();
    expect(earned).toHaveLength(2);
    expect(earned[0].icon).toBeDefined();
  });
});
```

### Manual testing

1. **Fresh player:** Clear localStorage. Visit homepage — no stats card, no achievements.
2. **After 3 sessions:** Stats card appears with session count and species count.
3. **Achievement toast:** Play a classic session to completion — "First Flight" toast should appear (requires Spec 3 integration).
4. **Daily streak warning:** Set up a 3-day daily streak in localStorage, then visit homepage before playing today's daily. Warning should appear.
5. **Species milestone:** Set `wtb_species_seen` to an array of 49 items, play one more correct round, then visit homepage — "50 species" banner should appear.

---

## Risks

- **localStorage bloat:** The `wtb_species_seen` array stores species names. At 2,621 max species with ~20 chars each, that's ~52KB — well within localStorage limits. The `wtb_achievements` array stores IDs (10 max = negligible).
- **Achievement inflation:** Starting with 10 achievements is modest. The "First Flight" common achievement ensures every player gets early positive reinforcement. Rarer achievements provide long-term goals. Don't add achievements that feel like participation trophies — each should feel earned.
- **Homepage JS execution order:** The stats card script runs after the DOM is loaded (Astro scripts are deferred by default). It inserts elements via `insertBefore`, which may cause a brief layout shift. To mitigate, the stats card is inserted before the first mode-group, which is below the fold on mobile — the shift is invisible.
- **Contract B stability:** The exported function signatures (`checkRoundAchievements`, `checkSessionAchievements`, `getEarnedAchievements`, `getSpeciesCount`) are frozen. Adding new achievements or changing criteria is fine, but the function signatures must not change — Spec 3 depends on them.

---

## Contract B: Achievements API Produced

This is the authoritative API. Spec 3 imports these functions.

```javascript
// All functions are named exports from 'src/scripts/achievements.js'

export function checkRoundAchievements(session, roundResult) → Achievement[]
// session: { mode, totalScore, currentStreak, history, questionsAnswered, correctCount }
// roundResult: { score: number, correct: { id, taxon } }
// Returns: array of newly earned Achievement objects (empty if none)

export function checkSessionAchievements(session, setKey) → Achievement[]
// session: same as above
// setKey: string (e.g., 'all_bugs', 'bugs_101_time_trial')
// Returns: array of newly earned Achievement objects (empty if none)

export function checkDailyAchievements(playStreak) → Achievement[]
// playStreak: number of consecutive days played
// Returns: array of newly earned Achievement objects (empty if none)

export function renderAchievementToast(achievement) → string
// Returns: HTML string for a toast notification

export function getEarnedAchievements() → Achievement[]
// Returns: all earned achievements with full definitions

export function getSpeciesCount() → number
// Returns: count of unique species in localStorage

// Achievement type:
// { id: string, name: string, description: string, rarity: string, icon: string }
```
