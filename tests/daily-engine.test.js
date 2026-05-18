import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getTodayET,
  getChallengeNumber,
  validateGuess,
  calculateStreaks,
  loadDailyState,
  saveDailyResult,
  loadHistory,
  getCountdownToReset,
  hashDate,
  getTodaysEntry,
} from '../src/scripts/daily-engine.js';

// --- Mock localStorage for Node environment ---
// Vitest runs in Node by default (no browser globals), so we provide a
// simple in-memory shim that the module's try/catch will use safely.
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: vi.fn((key) => store[key] ?? null),
    setItem: vi.fn((key, value) => { store[key] = String(value); }),
    removeItem: vi.fn((key) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();

// Attach to globalThis so the module can reference `localStorage`
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

// ──────────────────────────────────────────────
// getTodayET
// ──────────────────────────────────────────────
describe('getTodayET', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns date string in YYYY-MM-DD format', () => {
    const result = getTodayET();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('uses Eastern Time, not UTC — 03:00 UTC in EDT is still previous day', () => {
    // 03:00 UTC on April 7 = 11:00 PM EDT on April 6
    vi.setSystemTime(new Date('2026-04-07T03:00:00Z'));
    expect(getTodayET()).toBe('2026-04-06');
  });

  it('rolls over at midnight ET — 04:01 UTC in EDT is next day', () => {
    // 04:01 UTC on April 7 = 12:01 AM EDT on April 7
    vi.setSystemTime(new Date('2026-04-07T04:01:00Z'));
    expect(getTodayET()).toBe('2026-04-07');
  });
});

// ──────────────────────────────────────────────
// getChallengeNumber
// ──────────────────────────────────────────────
describe('getChallengeNumber', () => {
  it('returns 1 for the epoch date 2026-04-05', () => {
    expect(getChallengeNumber('2026-04-05')).toBe(1);
  });

  it('increments by 1 per day', () => {
    expect(getChallengeNumber('2026-04-06')).toBe(2);
    expect(getChallengeNumber('2026-04-15')).toBe(11);
  });

  it('returns 0 for the day before epoch', () => {
    expect(getChallengeNumber('2026-04-04')).toBe(0);
  });
});

// ──────────────────────────────────────────────
// validateGuess
// ──────────────────────────────────────────────
describe('validateGuess', () => {
  it('returns correct:true for exact match', () => {
    expect(validateGuess('Beetle', 'Beetle')).toEqual({ correct: true });
  });

  it('is case-insensitive', () => {
    expect(validateGuess('beetle', 'Beetle')).toEqual({ correct: true });
  });

  it('trims whitespace', () => {
    expect(validateGuess('  Beetle  ', 'Beetle')).toEqual({ correct: true });
  });

  it('returns correct:false for wrong answer', () => {
    expect(validateGuess('Spider', 'Beetle')).toEqual({ correct: false });
  });

  it('handles scientific names', () => {
    expect(validateGuess('Apis mellifera', 'Apis mellifera')).toEqual({ correct: true });
  });
});

// ──────────────────────────────────────────────
// calculateStreaks
// ──────────────────────────────────────────────
describe('calculateStreaks', () => {
  it('returns 1/1 for a single win today', () => {
    const history = { '2026-04-07': { solved: true, guesses: 2 } };
    expect(calculateStreaks(history, '2026-04-07')).toEqual({ playStreak: 1, winStreak: 1 });
  });

  it('returns 1/0 for a single loss today', () => {
    const history = { '2026-04-07': { solved: false, guesses: 3 } };
    expect(calculateStreaks(history, '2026-04-07')).toEqual({ playStreak: 1, winStreak: 0 });
  });

  it('counts consecutive days for play streak', () => {
    const history = {
      '2026-04-05': { solved: true, guesses: 1 },
      '2026-04-06': { solved: false, guesses: 3 },
      '2026-04-07': { solved: true, guesses: 2 },
    };
    expect(calculateStreaks(history, '2026-04-07').playStreak).toBe(3);
  });

  it('breaks play streak on missed day', () => {
    const history = {
      '2026-04-04': { solved: true, guesses: 1 },
      // 2026-04-05 is missing — gap
      '2026-04-06': { solved: true, guesses: 2 },
      '2026-04-07': { solved: true, guesses: 1 },
    };
    expect(calculateStreaks(history, '2026-04-07').playStreak).toBe(2);
  });

  it('counts consecutive wins for win streak', () => {
    const history = {
      '2026-04-05': { solved: true, guesses: 1 },
      '2026-04-06': { solved: true, guesses: 2 },
      '2026-04-07': { solved: true, guesses: 1 },
    };
    expect(calculateStreaks(history, '2026-04-07').winStreak).toBe(3);
  });

  it('breaks win streak on loss but keeps play streak', () => {
    const history = {
      '2026-04-05': { solved: true, guesses: 1 },
      '2026-04-06': { solved: false, guesses: 3 },
      '2026-04-07': { solved: true, guesses: 1 },
    };
    const result = calculateStreaks(history, '2026-04-07');
    expect(result.playStreak).toBe(3);
    expect(result.winStreak).toBe(1);
  });

  it('returns 0/0 for empty history', () => {
    expect(calculateStreaks({}, '2026-04-07')).toEqual({ playStreak: 0, winStreak: 0 });
  });
});

// ──────────────────────────────────────────────
// State persistence: loadDailyState, saveDailyResult, loadHistory
// ──────────────────────────────────────────────
describe('loadDailyState', () => {
  beforeEach(() => { localStorageMock.clear(); });

  it('returns null for unplayed date', () => {
    expect(loadDailyState('bugs101', '2026-04-07')).toBeNull();
  });

  it('returns saved result for a played date', () => {
    const history = { '2026-04-07': { solved: true, guesses: 2, answer: 'Beetle' } };
    localStorageMock.setItem('daily_bugs101_history', JSON.stringify(history));
    expect(loadDailyState('bugs101', '2026-04-07')).toEqual({ solved: true, guesses: 2, answer: 'Beetle' });
  });
});

describe('saveDailyResult', () => {
  beforeEach(() => { localStorageMock.clear(); });

  it('persists result to localStorage', () => {
    saveDailyResult('bugs101', '2026-04-07', { solved: true, guesses: 1, answer: 'Beetle' });
    const stored = JSON.parse(localStorageMock.getItem('daily_bugs101_history'));
    expect(stored['2026-04-07']).toEqual({ solved: true, guesses: 1, answer: 'Beetle' });
  });

  it('preserves existing entries when saving new ones', () => {
    saveDailyResult('bugs101', '2026-04-06', { solved: false, guesses: 3, answer: 'Spider' });
    saveDailyResult('bugs101', '2026-04-07', { solved: true, guesses: 1, answer: 'Beetle' });
    const stored = JSON.parse(localStorageMock.getItem('daily_bugs101_history'));
    expect(stored['2026-04-06']).toEqual({ solved: false, guesses: 3, answer: 'Spider' });
    expect(stored['2026-04-07']).toEqual({ solved: true, guesses: 1, answer: 'Beetle' });
  });
});

describe('loadHistory', () => {
  beforeEach(() => { localStorageMock.clear(); });

  it('returns empty object when no history exists', () => {
    expect(loadHistory('bugs101')).toEqual({});
  });

  it('returns full history object', () => {
    const history = {
      '2026-04-06': { solved: false, guesses: 3 },
      '2026-04-07': { solved: true, guesses: 1 },
    };
    localStorageMock.setItem('daily_bugs101_history', JSON.stringify(history));
    expect(loadHistory('bugs101')).toEqual(history);
  });
});

// ──────────────────────────────────────────────
// getCountdownToReset
// ──────────────────────────────────────────────
describe('getCountdownToReset', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns hours and minutes until midnight ET', () => {
    // 10:00 PM ET = 02:00 UTC next day (during EDT)
    // Set to April 7 02:00 UTC = April 6 10:00 PM EDT
    vi.setSystemTime(new Date('2026-04-07T02:00:00Z'));
    const result = getCountdownToReset();
    expect(result).toEqual({ hours: 2, minutes: 0 });
  });

  it('returns small values close to midnight', () => {
    // 11:30 PM ET = 03:30 UTC (during EDT)
    vi.setSystemTime(new Date('2026-04-07T03:30:00Z'));
    const result = getCountdownToReset();
    expect(result).toEqual({ hours: 0, minutes: 30 });
  });
});

// ──────────────────────────────────────────────
// hashDate
// ──────────────────────────────────────────────
describe('hashDate', () => {
  it('is deterministic for the same date', () => {
    expect(hashDate('2026-05-18')).toBe(hashDate('2026-05-18'));
  });

  it('returns an unsigned 32-bit integer', () => {
    const h = hashDate('2026-05-18');
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
  });

  it('differs for different dates', () => {
    expect(hashDate('2026-05-18')).not.toBe(hashDate('2026-05-19'));
  });
});

// ──────────────────────────────────────────────
// getTodaysEntry
// ──────────────────────────────────────────────
describe('getTodaysEntry', () => {
  const pool = [
    { id: 11, answer_common: 'Beetle' },
    { id: 22, answer_common: 'Moth' },
    { id: 33, answer_common: 'Spider' },
  ];

  it('returns the scheduled entry when the date is in the schedule', () => {
    expect(getTodaysEntry(pool, { '2026-05-18': 22 }, '2026-05-18')).toEqual({ id: 22, answer_common: 'Moth' });
  });

  it('falls back to hash selection when the date is not scheduled', () => {
    const e = getTodaysEntry(pool, {}, '2026-05-18');
    expect(pool).toContain(e);
    expect(getTodaysEntry(pool, {}, '2026-05-18')).toBe(e); // deterministic
  });

  it('falls back to hash when the scheduled id is missing from the pool', () => {
    const e = getTodaysEntry(pool, { '2026-05-18': 999 }, '2026-05-18');
    expect(pool).toContain(e);
  });

  it('returns null for an empty pool', () => {
    expect(getTodaysEntry([], { '2026-05-18': 1 }, '2026-05-18')).toBeNull();
  });
});
