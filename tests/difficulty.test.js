import { describe, it, expect } from 'vitest';
import { SessionState } from '../src/scripts/game-engine.js';

// 12 observations across 3 orders so distractors can be generated
const observations = [
  { id: 1, taxon: { species: 'A', common_name: 'A', genus: 'GA', family: 'FA', order: 'OA' } },
  { id: 2, taxon: { species: 'B', common_name: 'B', genus: 'GB', family: 'FB', order: 'OB' } },
  { id: 3, taxon: { species: 'C', common_name: 'C', genus: 'GC', family: 'FC', order: 'OC' } },
  { id: 4, taxon: { species: 'D', common_name: 'D', genus: 'GD', family: 'FD', order: 'OA' } },
  { id: 5, taxon: { species: 'E', common_name: 'E', genus: 'GE', family: 'FE', order: 'OB' } },
  { id: 6, taxon: { species: 'F', common_name: 'F', genus: 'GF', family: 'FF', order: 'OC' } },
  { id: 7, taxon: { species: 'G', common_name: 'G', genus: 'GG', family: 'FG', order: 'OA' } },
  { id: 8, taxon: { species: 'H', common_name: 'H', genus: 'GH', family: 'FH', order: 'OB' } },
  { id: 9, taxon: { species: 'I', common_name: 'I', genus: 'GI', family: 'FI', order: 'OC' } },
  { id: 10, taxon: { species: 'J', common_name: 'J', genus: 'GJ', family: 'FJ', order: 'OA' } },
  { id: 11, taxon: { species: 'K', common_name: 'K', genus: 'GK', family: 'FK', order: 'OB' } },
  { id: 12, taxon: { species: 'L', common_name: 'L', genus: 'GL', family: 'FL', order: 'OC' } },
];

const taxonomy = {
  order: { OA: [0, 3, 6, 9], OB: [1, 4, 7, 10], OC: [2, 5, 8, 11] },
  family: { FA: [0], FB: [1], FC: [2], FD: [3], FE: [4], FF: [5], FG: [6], FH: [7], FI: [8], FJ: [9], FK: [10], FL: [11] },
  genus: { GA: [0], GB: [1], GC: [2], GD: [3], GE: [4], GF: [5], GG: [6], GH: [7], GI: [8], GJ: [9], GK: [10], GL: [11] },
};

const setDef = {
  name: 'Test Set',
  scoring: 'taxonomic',
  observation_ids: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

// Only obs 1 is easy, rest are medium/hard
const difficulty = {
  1: { tier: 'easy', difficulty: 0.1 },
  4: { tier: 'easy', difficulty: 0.15 },
  7: { tier: 'easy', difficulty: 0.2 },
  10: { tier: 'easy', difficulty: 0.25 },
  2: { tier: 'medium', difficulty: 0.4 },
  5: { tier: 'medium', difficulty: 0.45 },
  8: { tier: 'medium', difficulty: 0.5 },
  11: { tier: 'medium', difficulty: 0.55 },
  3: { tier: 'hard', difficulty: 0.8 },
  6: { tier: 'hard', difficulty: 0.85 },
  9: { tier: 'hard', difficulty: 0.9 },
  12: { tier: 'hard', difficulty: 0.95 },
};

describe('adaptive difficulty', () => {
  it('falls back to random when no difficulty data', () => {
    const session = new SessionState(observations, taxonomy, setDef, 'test');
    const round = session.nextRound();
    expect(round).not.toBeNull();
    expect(round.correct).toBeDefined();
    expect(round.choices).toHaveLength(4);
  });

  it('prefers easy observations in early rounds (rounds 1-3)', () => {
    const easyIds = new Set([1, 4, 7, 10]);
    let easyCount = 0;
    const trials = 200;

    for (let i = 0; i < trials; i++) {
      const session = new SessionState(
        observations, taxonomy, setDef, 'test', difficulty
      );
      const round = session.nextRound();
      if (easyIds.has(round.correct.id)) easyCount++;
    }

    // With 4 easy out of 12, random would give ~33%. Adaptive should give ~100%.
    expect(easyCount / trials).toBeGreaterThan(0.9);
  });

  it('prefers medium observations in middle rounds (rounds 4-7)', () => {
    const mediumIds = new Set([2, 5, 8, 11]);
    let mediumCount = 0;
    const trials = 100;

    for (let i = 0; i < trials; i++) {
      const session = new SessionState(
        observations, taxonomy, setDef, 'test', difficulty
      );
      // Burn through rounds 1-3
      for (let r = 0; r < 3; r++) {
        const round = session.nextRound();
        session.submitAnswer(round.correct.taxon);
      }
      // Round 4 should prefer medium
      const round4 = session.nextRound();
      if (mediumIds.has(round4.correct.id)) mediumCount++;
    }

    expect(mediumCount / trials).toBeGreaterThan(0.5);
  });

  it('prefers hard observations in late rounds (rounds 8-10)', () => {
    const hardIds = new Set([3, 6, 9, 12]);
    let hardCount = 0;
    const trials = 100;

    for (let i = 0; i < trials; i++) {
      const session = new SessionState(
        observations, taxonomy, setDef, 'test', difficulty
      );
      // Burn through rounds 1-7
      for (let r = 0; r < 7; r++) {
        const round = session.nextRound();
        session.submitAnswer(round.correct.taxon);
      }
      // Round 8 should prefer hard
      const round8 = session.nextRound();
      if (hardIds.has(round8.correct.id)) hardCount++;
    }

    expect(hardCount / trials).toBeGreaterThan(0.5);
  });

  it('does not use difficulty curve for non-classic modes', () => {
    const ttSetDef = { ...setDef, mode: 'time_trial', scoring: 'binary' };
    // Should not crash — difficulty param is accepted but ignored
    const session = new SessionState(
      observations, taxonomy, ttSetDef, 'test', difficulty
    );
    const round = session.nextRound();
    expect(round).not.toBeNull();
  });

  it('falls back gracefully when target tier pool is empty', () => {
    // Only easy observations, no medium/hard
    const easyOnlyDifficulty = {
      1: { tier: 'easy', difficulty: 0.1 },
      2: { tier: 'easy', difficulty: 0.15 },
      3: { tier: 'easy', difficulty: 0.2 },
      4: { tier: 'easy', difficulty: 0.1 },
      5: { tier: 'easy', difficulty: 0.15 },
      6: { tier: 'easy', difficulty: 0.2 },
      7: { tier: 'easy', difficulty: 0.1 },
      8: { tier: 'easy', difficulty: 0.15 },
      9: { tier: 'easy', difficulty: 0.2 },
      10: { tier: 'easy', difficulty: 0.1 },
      11: { tier: 'easy', difficulty: 0.15 },
      12: { tier: 'easy', difficulty: 0.2 },
    };

    const session = new SessionState(
      observations, taxonomy, setDef, 'test', easyOnlyDifficulty
    );

    // Should still work for all 10 rounds even though medium/hard tiers are empty
    for (let i = 0; i < 10; i++) {
      const round = session.nextRound();
      expect(round).not.toBeNull();
      session.submitAnswer(round.correct.taxon);
    }
  });
});
