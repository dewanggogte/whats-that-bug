import { describe, it, expect } from 'vitest';
import { generateDistractors } from '../src/scripts/game-engine.js';

const observations = [
  { id: 1, taxon: { species: 'Cotinis mutabilis', common_name: 'Figeater Beetle', genus: 'Cotinis', family: 'Scarabaeidae', order: 'Coleoptera' } },
  { id: 2, taxon: { species: 'Cotinis nitida', common_name: 'Green June Beetle', genus: 'Cotinis', family: 'Scarabaeidae', order: 'Coleoptera' } },
  { id: 3, taxon: { species: 'Popillia japonica', common_name: 'Japanese Beetle', genus: 'Popillia', family: 'Scarabaeidae', order: 'Coleoptera' } },
  { id: 4, taxon: { species: 'Cerambyx cerdo', common_name: 'Great Capricorn Beetle', genus: 'Cerambyx', family: 'Cerambycidae', order: 'Coleoptera' } },
  { id: 5, taxon: { species: 'Anoplophora glabripennis', common_name: 'Asian Longhorned Beetle', genus: 'Anoplophora', family: 'Cerambycidae', order: 'Coleoptera' } },
  { id: 6, taxon: { species: 'Musca domestica', common_name: 'House Fly', genus: 'Musca', family: 'Muscidae', order: 'Diptera' } },
];

const taxonomy = {
  order: { Coleoptera: [0, 1, 2, 3, 4], Diptera: [5] },
  family: { Scarabaeidae: [0, 1, 2], Cerambycidae: [3, 4], Muscidae: [5] },
  genus: { Cotinis: [0, 1], Popillia: [2], Cerambyx: [3], Anoplophora: [4], Musca: [5] },
};

describe('generateDistractors', () => {
  it('returns exactly 3 distractors', () => {
    const result = generateDistractors(observations[0], taxonomy, observations);
    expect(result).toHaveLength(3);
  });

  it('never includes the correct answer', () => {
    for (let i = 0; i < 20; i++) {
      const result = generateDistractors(observations[0], taxonomy, observations);
      const species = result.map(d => d.taxon.species);
      expect(species).not.toContain('Cotinis mutabilis');
    }
  });

  it('returns unique species (no duplicate distractors)', () => {
    for (let i = 0; i < 20; i++) {
      const result = generateDistractors(observations[0], taxonomy, observations);
      const species = result.map(d => d.taxon.species);
      expect(new Set(species).size).toBe(3);
    }
  });

  it('prefers distractors from same genus and family', () => {
    const result = generateDistractors(observations[0], taxonomy, observations);
    const families = result.map(d => d.taxon.family);
    expect(families).toContain('Scarabaeidae');
  });

  it('all distractors come from the same order when possible', () => {
    const result = generateDistractors(observations[0], taxonomy, observations);
    const orders = result.map(d => d.taxon.order);
    orders.forEach(order => {
      expect(order).toBe('Coleoptera');
    });
  });
});
