import { describe, it, expect } from 'vitest';
import {
  isSubEligible,
  generateWeekSlots,
  findDuePost,
  getUpcomingSlots,
} from '../scripts/reddit/calendar.mjs';
import { SUBREDDITS } from '../scripts/reddit/config.mjs';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Helper: ISO string for N days ago */
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// isSubEligible
// ---------------------------------------------------------------------------

describe('isSubEligible', () => {
  it('returns true when sub has never been posted', () => {
    const postLog = [];
    expect(isSubEligible('spiders', postLog, 14)).toBe(true);
  });

  it('returns false when posted too recently', () => {
    const postLog = [
      { subId: 'spiders', timestamp: daysAgo(3) },
    ];
    expect(isSubEligible('spiders', postLog, 14)).toBe(false);
  });

  it('returns true when enough days have passed', () => {
    const postLog = [
      { subId: 'spiders', timestamp: daysAgo(15) },
    ];
    expect(isSubEligible('spiders', postLog, 14)).toBe(true);
  });

  it('only considers posts to the same sub', () => {
    const postLog = [
      { subId: 'moths', timestamp: daysAgo(1) },
    ];
    // moths was posted yesterday, but we're checking spiders
    expect(isSubEligible('spiders', postLog, 14)).toBe(true);
  });

  it('uses the most recent post when multiple exist', () => {
    const postLog = [
      { subId: 'spiders', timestamp: daysAgo(30) },
      { subId: 'spiders', timestamp: daysAgo(5) },
    ];
    // Most recent was 5 days ago, minDaysBetween is 14
    expect(isSubEligible('spiders', postLog, 14)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// generateWeekSlots
// ---------------------------------------------------------------------------

describe('generateWeekSlots', () => {
  it('generates expected number of slots (up to cadence)', () => {
    // With a clean post log, many subs are eligible — should get cadence slots
    const weekStart = new Date('2026-04-06T00:00:00Z'); // a Monday
    const slots = generateWeekSlots(weekStart, [], 4);
    expect(slots).toHaveLength(4);
  });

  it('does not schedule the same sub twice in one week', () => {
    const weekStart = new Date('2026-04-06T00:00:00Z');
    // Use a high cadence to try to force duplicates — but there are enough subs
    const slots = generateWeekSlots(weekStart, [], 4);
    const subIds = slots.map(s => s.subId);
    expect(new Set(subIds).size).toBe(subIds.length);
  });

  it('respects minDaysBetween by excluding recently posted subs', () => {
    const weekStart = new Date('2026-04-06T00:00:00Z');
    // Post to ALL subs very recently so none are eligible
    const postLog = Object.keys(SUBREDDITS).map(
      subId => ({ subId, timestamp: daysAgo(1) })
    );
    const slots = generateWeekSlots(weekStart, postLog, 4);
    expect(slots).toHaveLength(0);
  });

  it('each slot has required fields', () => {
    const weekStart = new Date('2026-04-06T00:00:00Z');
    const slots = generateWeekSlots(weekStart, [], 4);
    for (const slot of slots) {
      expect(slot).toHaveProperty('subId');
      expect(slot).toHaveProperty('contentType');
      expect(slot).toHaveProperty('scheduledAt');
      expect(slot).toHaveProperty('status', 'pending');
      expect(slot).toHaveProperty('postData', null);
      // scheduledAt should be a valid ISO string
      expect(new Date(slot.scheduledAt).toISOString()).toBe(slot.scheduledAt);
    }
  });

  it('schedules on correct days of the week (Tue, Wed, Thu, Sat)', () => {
    const weekStart = new Date('2026-04-06T00:00:00Z'); // Monday
    const slots = generateWeekSlots(weekStart, [], 4);
    const expectedDays = [2, 3, 4, 6]; // Tue, Wed, Thu, Sat
    for (const slot of slots) {
      const d = new Date(slot.scheduledAt);
      expect(expectedDays).toContain(d.getUTCDay());
    }
  });

  it('limits slots to eligible sub count when fewer than cadence', () => {
    const weekStart = new Date('2026-04-06T00:00:00Z');
    // Post to all subs except 2 recently
    const allSubs = Object.keys(SUBREDDITS);
    const postLog = allSubs.slice(0, -2).map(subId => ({ subId, timestamp: daysAgo(1) }));
    const slots = generateWeekSlots(weekStart, postLog, 4);
    expect(slots.length).toBeLessThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// findDuePost
// ---------------------------------------------------------------------------

describe('findDuePost', () => {
  it('returns null when nothing is due', () => {
    const futureTime = new Date(Date.now() + 86400000).toISOString(); // tomorrow
    const slots = [
      { subId: 'spiders', status: 'ready', scheduledAt: futureTime },
    ];
    expect(findDuePost(slots)).toBeNull();
  });

  it('returns earliest due post', () => {
    const past1 = new Date(Date.now() - 7200000).toISOString(); // 2 hours ago
    const past2 = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago
    const slots = [
      { subId: 'moths', status: 'ready', scheduledAt: past2 },
      { subId: 'spiders', status: 'ready', scheduledAt: past1 },
    ];
    const due = findDuePost(slots);
    expect(due).not.toBeNull();
    expect(due.subId).toBe('spiders'); // earlier scheduledAt
  });

  it('skips posted slots', () => {
    const pastTime = new Date(Date.now() - 3600000).toISOString();
    const slots = [
      { subId: 'spiders', status: 'posted', scheduledAt: pastTime },
      { subId: 'moths', status: 'ready', scheduledAt: pastTime },
    ];
    const due = findDuePost(slots);
    expect(due.subId).toBe('moths');
  });

  it('returns null when all slots are posted', () => {
    const pastTime = new Date(Date.now() - 3600000).toISOString();
    const slots = [
      { subId: 'spiders', status: 'posted', scheduledAt: pastTime },
    ];
    expect(findDuePost(slots)).toBeNull();
  });

  it('returns null for empty slots array', () => {
    expect(findDuePost([])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getUpcomingSlots
// ---------------------------------------------------------------------------

describe('getUpcomingSlots', () => {
  it('returns non-posted slots sorted by scheduledAt ascending', () => {
    const t1 = new Date(Date.now() + 3600000).toISOString();
    const t2 = new Date(Date.now() + 7200000).toISOString();
    const t3 = new Date(Date.now() + 10800000).toISOString();
    const slots = [
      { subId: 'moths', status: 'pending', scheduledAt: t3 },
      { subId: 'spiders', status: 'ready', scheduledAt: t1 },
      { subId: 'bees', status: 'posted', scheduledAt: t2 },
    ];
    const upcoming = getUpcomingSlots(slots);
    expect(upcoming).toHaveLength(2); // excludes 'posted'
    expect(upcoming[0].subId).toBe('spiders');
    expect(upcoming[1].subId).toBe('moths');
  });

  it('returns empty array when all slots are posted', () => {
    const slots = [
      { subId: 'spiders', status: 'posted', scheduledAt: new Date().toISOString() },
    ];
    expect(getUpcomingSlots(slots)).toHaveLength(0);
  });
});
