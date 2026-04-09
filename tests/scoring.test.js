import { describe, it, expect } from 'vitest';
import { calculateScore, calculateTimedScore, SessionState } from '../src/scripts/game-engine.js';

const figeater = {
  species: 'Cotinis mutabilis',
  genus: 'Cotinis',
  family: 'Scarabaeidae',
  order: 'Coleoptera',
};

describe('calculateScore', () => {
  it('returns 100 for exact species match', () => {
    const picked = { ...figeater };
    expect(calculateScore(picked, figeater)).toBe(100);
  });

  it('returns 75 for same genus, different species', () => {
    const picked = { ...figeater, species: 'Cotinis nitida' };
    expect(calculateScore(picked, figeater)).toBe(75);
  });

  it('returns 50 for same family, different genus', () => {
    const picked = { ...figeater, species: 'Popillia japonica', genus: 'Popillia' };
    expect(calculateScore(picked, figeater)).toBe(50);
  });

  it('returns 25 for same order, different family', () => {
    const picked = {
      species: 'Cerambyx cerdo',
      genus: 'Cerambyx',
      family: 'Cerambycidae',
      order: 'Coleoptera',
    };
    expect(calculateScore(picked, figeater)).toBe(25);
  });

  it('returns 0 for different order', () => {
    const picked = {
      species: 'Musca domestica',
      genus: 'Musca',
      family: 'Muscidae',
      order: 'Diptera',
    };
    expect(calculateScore(picked, figeater)).toBe(0);
  });
});

describe('genus scoring (100 or 0)', () => {
  const observations = [
    { id: 1, taxon: { species: 'Cotinis mutabilis', common_name: 'Fig Beetle', genus: 'Cotinis', family: 'Scarabaeidae', order: 'Coleoptera' } },
    { id: 2, taxon: { species: 'Cotinis nitida', common_name: 'June Bug', genus: 'Cotinis', family: 'Scarabaeidae', order: 'Coleoptera' } },
    { id: 3, taxon: { species: 'Popillia japonica', common_name: 'Japanese Beetle', genus: 'Popillia', family: 'Scarabaeidae', order: 'Coleoptera' } },
    { id: 4, taxon: { species: 'Cerambyx cerdo', common_name: 'Great Capricorn', genus: 'Cerambyx', family: 'Cerambycidae', order: 'Coleoptera' } },
    { id: 5, taxon: { species: 'Musca domestica', common_name: 'House Fly', genus: 'Musca', family: 'Muscidae', order: 'Diptera' } },
  ];
  const taxonomy = {
    order: { Coleoptera: [0,1,2,3], Diptera: [4] },
    family: { Scarabaeidae: [0,1,2], Cerambycidae: [3], Muscidae: [4] },
    genus: { Cotinis: [0,1], Popillia: [2], Cerambyx: [3], Musca: [4] },
  };
  const setDef = { name: 'Test', scoring: 'genus', observation_ids: [0,1,2,3,4] };

  it('returns 100 for same genus (different species)', () => {
    const session = new SessionState(observations, taxonomy, setDef, 'test');
    session.nextRound();
    session._currentCorrect = observations[0];
    const result = session.submitAnswer(observations[1].taxon);
    expect(result.score).toBe(100);
  });

  it('returns 0 for different genus, same family', () => {
    const session = new SessionState(observations, taxonomy, setDef, 'test');
    session.nextRound();
    session._currentCorrect = observations[0];
    const result = session.submitAnswer(observations[2].taxon);
    expect(result.score).toBe(0);
  });

  it('returns 0 for different order', () => {
    const session = new SessionState(observations, taxonomy, setDef, 'test');
    session.nextRound();
    session._currentCorrect = observations[0];
    const result = session.submitAnswer(observations[4].taxon);
    expect(result.score).toBe(0);
  });
});

describe('calculateTimedScore', () => {
  it('returns 100 for answer under 3 seconds', () => {
    expect(calculateTimedScore(2000)).toBe(100);
    expect(calculateTimedScore(2999)).toBe(100);
  });

  it('returns 75 for answer between 3-5 seconds', () => {
    expect(calculateTimedScore(3000)).toBe(75);
    expect(calculateTimedScore(4999)).toBe(75);
  });

  it('returns 50 for answer between 5-8 seconds', () => {
    expect(calculateTimedScore(5000)).toBe(50);
    expect(calculateTimedScore(7999)).toBe(50);
  });

  it('returns 25 for answer between 8-12 seconds', () => {
    expect(calculateTimedScore(8000)).toBe(25);
    expect(calculateTimedScore(11999)).toBe(25);
  });

  it('returns 10 for answer over 12 seconds', () => {
    expect(calculateTimedScore(12000)).toBe(10);
    expect(calculateTimedScore(30000)).toBe(10);
  });

  it('returns 100 for zero ms (edge case)', () => {
    expect(calculateTimedScore(0)).toBe(100);
  });
});
