import { describe, it, expect } from 'vitest';
import { calculateScore, calculateTimedScore } from '../src/scripts/game-engine.js';

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
