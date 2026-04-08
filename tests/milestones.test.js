import { describe, it, expect } from 'vitest';
import { MILESTONES, checkMilestone, getHighestMilestone } from '../src/scripts/milestones.js';

describe('MILESTONES', () => {
  it('defines milestones at 5, 10, 15, 25, 50', () => {
    expect(MILESTONES.map(m => m.streak)).toEqual([5, 10, 15, 25, 50]);
  });

  it('each milestone has label, tier, and fire count', () => {
    for (const m of MILESTONES) {
      expect(m).toHaveProperty('label');
      expect(m).toHaveProperty('tier');
      expect(m).toHaveProperty('fires');
      expect(['toast', 'toast-pulse', 'banner']).toContain(m.tier);
    }
  });
});

describe('checkMilestone', () => {
  it('returns null for non-milestone streaks', () => {
    expect(checkMilestone(1)).toBeNull();
    expect(checkMilestone(4)).toBeNull();
    expect(checkMilestone(6)).toBeNull();
    expect(checkMilestone(11)).toBeNull();
  });

  it('returns milestone object for exact milestone values', () => {
    const m5 = checkMilestone(5);
    expect(m5).not.toBeNull();
    expect(m5.streak).toBe(5);
    expect(m5.label).toBe('Getting Good');
    expect(m5.tier).toBe('toast');

    const m10 = checkMilestone(10);
    expect(m10.label).toBe('Sharp Eye');
    expect(m10.tier).toBe('toast-pulse');

    const m25 = checkMilestone(25);
    expect(m25.label).toBe('Legendary!');
    expect(m25.tier).toBe('banner');
  });
});

describe('getHighestMilestone', () => {
  it('returns null if streak is below 5', () => {
    expect(getHighestMilestone(0)).toBeNull();
    expect(getHighestMilestone(4)).toBeNull();
  });

  it('returns the highest milestone at or below the streak', () => {
    expect(getHighestMilestone(5).streak).toBe(5);
    expect(getHighestMilestone(9).streak).toBe(5);
    expect(getHighestMilestone(10).streak).toBe(10);
    expect(getHighestMilestone(24).streak).toBe(15);
    expect(getHighestMilestone(25).streak).toBe(25);
    expect(getHighestMilestone(100).streak).toBe(50);
  });
});
