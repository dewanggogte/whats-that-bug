import { describe, it, expect } from 'vitest';
import { calculateScore } from '../src/scripts/game-engine.js';

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
