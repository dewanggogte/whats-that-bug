import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock localStorage
const store = {};
beforeEach(() => {
  Object.keys(store).forEach(k => delete store[k]);
  global.localStorage = {
    getItem: k => store[k] ?? null,
    setItem: (k, v) => { store[k] = v; },
    removeItem: k => { delete store[k]; },
  };
  // Reset module cache so each test gets fresh state
  vi.resetModules();
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

  it('awards perfect_round for 1000/1000 classic score', async () => {
    const { checkSessionAchievements } = await import('../src/scripts/achievements.js');
    const session = { mode: 'classic', totalScore: 1000, currentStreak: 0 };
    const result = checkSessionAchievements(session, 'all_bugs');
    expect(result.some(a => a.id === 'perfect_round')).toBe(true);
  });

  it('awards speed_demon for 500+ time trial score', async () => {
    const { checkSessionAchievements } = await import('../src/scripts/achievements.js');
    const session = { mode: 'time_trial', totalScore: 520, currentStreak: 0 };
    const result = checkSessionAchievements(session, 'time_trial');
    expect(result.some(a => a.id === 'speed_demon')).toBe(true);
  });

  it('awards unbreakable for 15+ streak', async () => {
    const { checkSessionAchievements } = await import('../src/scripts/achievements.js');
    const session = { mode: 'streak', totalScore: 0, currentStreak: 17 };
    const result = checkSessionAchievements(session, 'streak');
    expect(result.some(a => a.id === 'unbreakable')).toBe(true);
  });

  it('awards order_expert for 900+ on themed set', async () => {
    const { checkSessionAchievements } = await import('../src/scripts/achievements.js');
    const session = { mode: 'classic', totalScore: 950, currentStreak: 0 };
    const result = checkSessionAchievements(session, 'beetles');
    expect(result.some(a => a.id === 'order_expert')).toBe(true);
  });

  it('does not award order_expert on non-themed sets', async () => {
    const { checkSessionAchievements } = await import('../src/scripts/achievements.js');
    const session = { mode: 'classic', totalScore: 950, currentStreak: 0 };
    const result = checkSessionAchievements(session, 'all_bugs');
    expect(result.some(a => a.id === 'order_expert')).toBe(false);
  });

  it('awards century_club at 100 species', async () => {
    const species = Array.from({ length: 100 }, (_, i) => `Species_${i}`);
    store.wtb_species_seen = JSON.stringify(species);

    const { checkSessionAchievements } = await import('../src/scripts/achievements.js');
    const session = { mode: 'classic', totalScore: 500, currentStreak: 0 };
    const result = checkSessionAchievements(session, 'all_bugs');
    expect(result.some(a => a.id === 'century_club')).toBe(true);
  });

  it('awards entomologist at 500 species', async () => {
    const species = Array.from({ length: 500 }, (_, i) => `Species_${i}`);
    store.wtb_species_seen = JSON.stringify(species);

    const { checkSessionAchievements } = await import('../src/scripts/achievements.js');
    const session = { mode: 'classic', totalScore: 500, currentStreak: 0 };
    const result = checkSessionAchievements(session, 'all_bugs');
    expect(result.some(a => a.id === 'entomologist')).toBe(true);
    expect(result.some(a => a.id === 'century_club')).toBe(true);
  });

  it('getEarnedAchievements returns full definitions', async () => {
    store.wtb_achievements = JSON.stringify(['first_flight', 'bug_scholar']);
    const { getEarnedAchievements } = await import('../src/scripts/achievements.js');
    const earned = getEarnedAchievements();
    expect(earned).toHaveLength(2);
    expect(earned[0].icon).toBeDefined();
    expect(earned[0].name).toBeDefined();
  });

  it('getSpeciesCount returns 0 for new players', async () => {
    const { getSpeciesCount } = await import('../src/scripts/achievements.js');
    expect(getSpeciesCount()).toBe(0);
  });

  it('getSpeciesCount returns correct count', async () => {
    store.wtb_species_seen = JSON.stringify(['Apis mellifera', 'Danaus plexippus']);
    const { getSpeciesCount } = await import('../src/scripts/achievements.js');
    expect(getSpeciesCount()).toBe(2);
  });

  it('checkDailyAchievements awards daily_devotee at 7 days', async () => {
    const { checkDailyAchievements } = await import('../src/scripts/achievements.js');
    const result = checkDailyAchievements(7);
    expect(result.some(a => a.id === 'daily_devotee')).toBe(true);
  });

  it('checkDailyAchievements awards bug_whisperer at 30 days', async () => {
    const { checkDailyAchievements } = await import('../src/scripts/achievements.js');
    const result = checkDailyAchievements(30);
    expect(result.some(a => a.id === 'daily_devotee')).toBe(true);
    expect(result.some(a => a.id === 'bug_whisperer')).toBe(true);
  });

  it('renderAchievementToast returns HTML with name and icon', async () => {
    const { renderAchievementToast } = await import('../src/scripts/achievements.js');
    const html = renderAchievementToast({ id: 'test', name: 'Test', description: 'A test', rarity: 'common', icon: '🐛' });
    expect(html).toContain('🐛');
    expect(html).toContain('Test');
    expect(html).toContain('achievement-toast');
  });

  it('tracks session count in player stats', async () => {
    const { checkSessionAchievements } = await import('../src/scripts/achievements.js');
    const session = { mode: 'classic', totalScore: 300, currentStreak: 0 };
    checkSessionAchievements(session, 'all_bugs');
    checkSessionAchievements(session, 'all_bugs');
    const stats = JSON.parse(store.wtb_player_stats);
    expect(stats.session_count).toBe(2);
    expect(stats.last_played).toBeDefined();
  });

  it('checkRoundAchievements returns empty array (future hook)', async () => {
    const { checkRoundAchievements } = await import('../src/scripts/achievements.js');
    const result = checkRoundAchievements({}, {});
    expect(result).toEqual([]);
  });
});
