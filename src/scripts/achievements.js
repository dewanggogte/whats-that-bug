/**
 * achievements.js — Achievement tracking and badge system.
 * All state persisted in localStorage. No server needed.
 *
 * Exported API (Contract B — consumed by Spec 3's game-ui.js):
 *   checkRoundAchievements(session, roundResult) → Achievement[]
 *   checkSessionAchievements(session, setKey) → Achievement[]
 *   checkDailyAchievements(playStreak) → Achievement[]
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

  // Daily-based
  { id: 'daily_devotee',   name: 'Daily Devotee',   description: '7-day daily play streak',        rarity: 'rare',      icon: '📅', check: 'daily' },
  { id: 'bug_whisperer',   name: 'Bug Whisperer',   description: '30-day daily play streak',       rarity: 'epic',      icon: '🌟', check: 'daily' },
];

// --- Storage Helpers ---

function getEarnedIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function markEarned(id) {
  const earned = getEarnedIds();
  if (earned.has(id)) return false;
  earned.add(id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...earned]));
  } catch { /* storage full */ }
  return true;
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

// --- Exported API (Contract B) ---

/**
 * Check achievements that can trigger after any round.
 * Called by game-ui.js handleAnswer().
 * Currently no per-round achievements defined, but the hook exists for future use.
 * @param {object} session
 * @param {{ score: number, correct: object }} roundResult
 * @returns {Achievement[]} newly earned achievements
 */
export function checkRoundAchievements(session, roundResult) {
  return [];
}

/**
 * Check achievements at session end.
 * Called by game-ui.js render*Summary().
 * @param {object} session
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

  // Order Expert — 90%+ on a themed set
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
