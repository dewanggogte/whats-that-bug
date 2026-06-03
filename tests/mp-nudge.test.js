import { describe, it, expect, beforeEach, vi } from 'vitest';

// localStorage mock backed by a plain object
const store = {};
const localStorageMock = {
  getItem: vi.fn(k => (k in store ? store[k] : null)),
  setItem: vi.fn((k, v) => { store[k] = String(v); }),
  removeItem: vi.fn(k => { delete store[k]; }),
};
vi.stubGlobal('localStorage', localStorageMock);

import { shouldShowHomepage, shouldShowPostGame } from '../src/scripts/mp-nudge.js';

const DAY = 86400000;

function setStats({ sessions = 0, days = 0 } = {}) {
  store['wtb_player_stats'] = JSON.stringify({
    session_count: sessions,
    play_dates: Array.from({ length: days }, (_, i) => `2026-06-0${i + 1}`),
  });
}

describe('mp-nudge eligibility', () => {
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
  });

  // ── Homepage ────────────────────────────────────────────────────────────────

  it('homepage: eligible at 3 sessions / 2 days, fresh state', () => {
    setStats({ sessions: 3, days: 2 });
    expect(shouldShowHomepage()).toBe(true);
  });

  it('homepage: not eligible below session threshold', () => {
    setStats({ sessions: 2, days: 2 });
    expect(shouldShowHomepage()).toBe(false);
  });

  it('homepage: not eligible below play-days threshold', () => {
    setStats({ sessions: 5, days: 1 });
    expect(shouldShowHomepage()).toBe(false);
  });

  it('homepage: suppressed once multiplayer played', () => {
    setStats({ sessions: 5, days: 3 });
    store['wtb_mp_played'] = '1';
    expect(shouldShowHomepage()).toBe(false);
  });

  it('homepage: suppressed when done', () => {
    setStats({ sessions: 5, days: 3 });
    store['wtb_mp_nudge_done'] = '1';
    expect(shouldShowHomepage()).toBe(false);
  });

  it('homepage: suppressed at impression cap', () => {
    setStats({ sessions: 5, days: 3 });
    store['wtb_mp_nudge_impressions'] = '2';
    expect(shouldShowHomepage()).toBe(false);
  });

  it('homepage: suppressed within 30-day snooze, eligible after', () => {
    setStats({ sessions: 5, days: 3 });
    store['wtb_mp_nudge_snoozed'] = String(Date.now() - 10 * DAY);
    expect(shouldShowHomepage()).toBe(false);

    store['wtb_mp_nudge_snoozed'] = String(Date.now() - 31 * DAY);
    expect(shouldShowHomepage()).toBe(true);
  });

  // ── Post-game ─────────────────────────────────────────────────────────────────

  it('post-game: eligible at 2 sessions, fresh state', () => {
    setStats({ sessions: 2, days: 1 });
    expect(shouldShowPostGame()).toBe(true);
  });

  it('post-game: not eligible below 2 sessions', () => {
    setStats({ sessions: 1, days: 1 });
    expect(shouldShowPostGame()).toBe(false);
  });

  it('post-game: uses a 7-day snooze window', () => {
    setStats({ sessions: 5, days: 1 });
    store['wtb_mp_nudge_snoozed'] = String(Date.now() - 3 * DAY);
    expect(shouldShowPostGame()).toBe(false);

    store['wtb_mp_nudge_snoozed'] = String(Date.now() - 8 * DAY);
    expect(shouldShowPostGame()).toBe(true);
  });

  it('post-game: shares the played + cap guards', () => {
    setStats({ sessions: 5, days: 1 });
    store['wtb_mp_played'] = '1';
    expect(shouldShowPostGame()).toBe(false);
  });
});
