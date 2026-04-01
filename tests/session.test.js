import { describe, it, expect, beforeEach } from 'vitest';
import { SessionState } from '../src/scripts/game-engine.js';

const observations = [
  { id: 1, taxon: { species: 'A', common_name: 'A', genus: 'G1', family: 'F1', order: 'O1' } },
  { id: 2, taxon: { species: 'B', common_name: 'B', genus: 'G1', family: 'F1', order: 'O1' } },
  { id: 3, taxon: { species: 'C', common_name: 'C', genus: 'G2', family: 'F1', order: 'O1' } },
  { id: 4, taxon: { species: 'D', common_name: 'D', genus: 'G3', family: 'F2', order: 'O1' } },
  { id: 5, taxon: { species: 'E', common_name: 'E', genus: 'G4', family: 'F3', order: 'O1' } },
  { id: 6, taxon: { species: 'F', common_name: 'F', genus: 'G5', family: 'F4', order: 'O1' } },
  { id: 7, taxon: { species: 'G', common_name: 'G', genus: 'G6', family: 'F5', order: 'O1' } },
  { id: 8, taxon: { species: 'H', common_name: 'H', genus: 'G7', family: 'F6', order: 'O1' } },
  { id: 9, taxon: { species: 'I', common_name: 'I', genus: 'G8', family: 'F7', order: 'O1' } },
  { id: 10, taxon: { species: 'J', common_name: 'J', genus: 'G9', family: 'F8', order: 'O1' } },
  { id: 11, taxon: { species: 'K', common_name: 'K', genus: 'G10', family: 'F9', order: 'O1' } },
];

const taxonomy = {
  order: { O1: [0,1,2,3,4,5,6,7,8,9,10] },
  family: { F1: [0,1,2], F2: [3], F3: [4], F4: [5], F5: [6], F6: [7], F7: [8], F8: [9], F9: [10] },
  genus: { G1: [0,1], G2: [2], G3: [3], G4: [4], G5: [5], G6: [6], G7: [7], G8: [8], G9: [9], G10: [10] },
};

const setDef = {
  name: 'Test Set',
  scoring: 'taxonomic',
  observation_ids: [0,1,2,3,4,5,6,7,8,9,10],
};

describe('SessionState', () => {
  let session;

  beforeEach(() => {
    session = new SessionState(observations, taxonomy, setDef);
  });

  it('starts at round 0 with score 0', () => {
    expect(session.currentRound).toBe(0);
    expect(session.totalScore).toBe(0);
    expect(session.isComplete).toBe(false);
  });

  it('generates a valid round with correct + 3 distractors', () => {
    const round = session.nextRound();
    expect(round.correct).toBeDefined();
    expect(round.choices).toHaveLength(4);
    expect(round.choices.map(c => c.taxon.species)).toContain(round.correct.taxon.species);
    expect(session.currentRound).toBe(1);
  });

  it('records an answer and accumulates score', () => {
    const round = session.nextRound();
    const result = session.submitAnswer(round.correct.taxon);
    expect(result.score).toBe(100);
    expect(session.totalScore).toBe(100);
  });

  it('tracks round history', () => {
    const round = session.nextRound();
    session.submitAnswer(round.correct.taxon);
    expect(session.history).toHaveLength(1);
    expect(session.history[0].score).toBe(100);
  });

  it('completes after 10 rounds', () => {
    for (let i = 0; i < 10; i++) {
      const round = session.nextRound();
      session.submitAnswer(round.correct.taxon);
    }
    expect(session.isComplete).toBe(true);
    expect(session.currentRound).toBe(10);
  });

  it('does not generate round 11', () => {
    for (let i = 0; i < 10; i++) {
      const round = session.nextRound();
      session.submitAnswer(round.correct.taxon);
    }
    expect(session.nextRound()).toBeNull();
  });

  it('calculates best streak', () => {
    for (let i = 0; i < 10; i++) {
      const round = session.nextRound();
      if (i === 3) {
        session.submitAnswer({ species: 'Z', genus: 'Z', family: 'Z', order: 'Z' });
      } else {
        session.submitAnswer(round.correct.taxon);
      }
    }
    expect(session.bestStreak).toBe(6);
  });

  it('generates a unique session_id', () => {
    const session2 = new SessionState(observations, taxonomy, setDef);
    expect(session.sessionId).toBeTruthy();
    expect(session.sessionId).not.toBe(session2.sessionId);
  });

  it('does not repeat observations within a session', () => {
    const seen = new Set();
    for (let i = 0; i < 10; i++) {
      const round = session.nextRound();
      expect(seen.has(round.correct.id)).toBe(false);
      seen.add(round.correct.id);
      session.submitAnswer(round.correct.taxon);
    }
  });
});
