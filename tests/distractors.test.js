import { describe, it, expect } from 'vitest';
import { generateDistractors, generateBugs101Distractors, getBugs101Name } from '../src/scripts/game-engine.js';

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

// --- Bugs 101 distractor tests ---

const bugs101Observations = [
  // Swallowtail (Papilionidae → "Swallowtail Butterfly")
  { id: 10, taxon: { species: 'Battus polydamas', common_name: 'Polydamas Swallowtail', genus: 'Battus', family: 'Papilionidae', order: 'Lepidoptera' } },
  // Nymphalidae → "Butterfly"
  { id: 11, taxon: { species: 'Vanessa cardui', common_name: 'Painted Lady', genus: 'Vanessa', family: 'Nymphalidae', order: 'Lepidoptera' } },
  // Sphingidae → "Hawk Moth"
  { id: 12, taxon: { species: 'Manduca sexta', common_name: 'Tobacco Hornworm Moth', genus: 'Manduca', family: 'Sphingidae', order: 'Lepidoptera' } },
  // Geometridae → "Moth"
  { id: 13, taxon: { species: 'Biston betularia', common_name: 'Peppered Moth', genus: 'Biston', family: 'Geometridae', order: 'Lepidoptera' } },
  // Coccinellidae → "Ladybug"
  { id: 14, taxon: { species: 'Coccinella septempunctata', common_name: 'Seven-spot Ladybird', genus: 'Coccinella', family: 'Coccinellidae', order: 'Coleoptera' } },
  // Scarabaeidae → "Scarab Beetle"
  { id: 15, taxon: { species: 'Cotinis mutabilis', common_name: 'Figeater Beetle', genus: 'Cotinis', family: 'Scarabaeidae', order: 'Coleoptera' } },
  // Formicidae → "Ant"
  { id: 16, taxon: { species: 'Solenopsis invicta', common_name: 'Red Imported Fire Ant', genus: 'Solenopsis', family: 'Formicidae', order: 'Hymenoptera' } },
  // Muscidae → "Fly"
  { id: 17, taxon: { species: 'Musca domestica', common_name: 'House Fly', genus: 'Musca', family: 'Muscidae', order: 'Diptera' } },
];

const bugs101Taxonomy = {
  order: {
    Lepidoptera: [0, 1, 2, 3],
    Coleoptera: [4, 5],
    Hymenoptera: [6],
    Diptera: [7],
  },
  family: {
    Papilionidae: [0], Nymphalidae: [1], Sphingidae: [2], Geometridae: [3],
    Coccinellidae: [4], Scarabaeidae: [5], Formicidae: [6], Muscidae: [7],
  },
  genus: {
    Battus: [0], Vanessa: [1], Manduca: [2], Biston: [3],
    Coccinella: [4], Cotinis: [5], Solenopsis: [6], Musca: [7],
  },
};

describe('generateBugs101Distractors', () => {
  it('never includes a parent/child category pair like "Butterfly" + "Swallowtail Butterfly"', () => {
    const correct = bugs101Observations[0]; // Swallowtail Butterfly
    for (let i = 0; i < 50; i++) {
      const result = generateBugs101Distractors(correct, bugs101Taxonomy, bugs101Observations);
      const names = result.map(d => getBugs101Name(d.taxon));
      // "Butterfly" should never appear alongside "Swallowtail Butterfly"
      expect(names).not.toContain('Butterfly');
    }
  });

  it('never includes a parent/child category pair like "Moth" + "Hawk Moth"', () => {
    const correct = bugs101Observations[2]; // Hawk Moth
    for (let i = 0; i < 50; i++) {
      const result = generateBugs101Distractors(correct, bugs101Taxonomy, bugs101Observations);
      const names = result.map(d => getBugs101Name(d.taxon));
      expect(names).not.toContain('Moth');
    }
  });

  it('allows unrelated categories to co-exist', () => {
    const correct = bugs101Observations[0]; // Swallowtail Butterfly
    let sawMultipleOrders = false;
    for (let i = 0; i < 50; i++) {
      const result = generateBugs101Distractors(correct, bugs101Taxonomy, bugs101Observations);
      const names = result.map(d => getBugs101Name(d.taxon));
      // These should be allowed since they don't conflict
      const unrelated = names.filter(n => !['Butterfly', 'Swallowtail Butterfly'].includes(n));
      if (unrelated.length === result.length) sawMultipleOrders = true;
    }
    expect(sawMultipleOrders).toBe(true);
  });
});
