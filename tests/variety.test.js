import { describe, it, expect, beforeEach } from 'vitest';
import { SessionState, getBugs101Name } from '../src/scripts/game-engine.js';

// Observations spanning 6 distinct Bugs 101 categories, 3 per category (18 total).
const observations = [
  // Beetles (Coleoptera / Scarabaeidae)
  { id: 1,  taxon: { species: 'A1', common_name: 'A1', genus: 'G1',  family: 'Scarabaeidae', order: 'Coleoptera', class: 'Insecta' } },
  { id: 2,  taxon: { species: 'A2', common_name: 'A2', genus: 'G2',  family: 'Scarabaeidae', order: 'Coleoptera', class: 'Insecta' } },
  { id: 3,  taxon: { species: 'A3', common_name: 'A3', genus: 'G3',  family: 'Scarabaeidae', order: 'Coleoptera', class: 'Insecta' } },
  // Butterflies (Lepidoptera / Nymphalidae)
  { id: 4,  taxon: { species: 'B1', common_name: 'B1', genus: 'G4',  family: 'Nymphalidae',  order: 'Lepidoptera', class: 'Insecta' } },
  { id: 5,  taxon: { species: 'B2', common_name: 'B2', genus: 'G5',  family: 'Nymphalidae',  order: 'Lepidoptera', class: 'Insecta' } },
  { id: 6,  taxon: { species: 'B3', common_name: 'B3', genus: 'G6',  family: 'Nymphalidae',  order: 'Lepidoptera', class: 'Insecta' } },
  // Dragonflies (Odonata / Libellulidae)
  { id: 7,  taxon: { species: 'C1', common_name: 'C1', genus: 'G7',  family: 'Libellulidae',  order: 'Odonata', class: 'Insecta' } },
  { id: 8,  taxon: { species: 'C2', common_name: 'C2', genus: 'G8',  family: 'Libellulidae',  order: 'Odonata', class: 'Insecta' } },
  { id: 9,  taxon: { species: 'C3', common_name: 'C3', genus: 'G9',  family: 'Libellulidae',  order: 'Odonata', class: 'Insecta' } },
  // Bees (Hymenoptera / Apidae)
  { id: 10, taxon: { species: 'D1', common_name: 'D1', genus: 'G10', family: 'Apidae',        order: 'Hymenoptera', class: 'Insecta' } },
  { id: 11, taxon: { species: 'D2', common_name: 'D2', genus: 'G11', family: 'Apidae',        order: 'Hymenoptera', class: 'Insecta' } },
  { id: 12, taxon: { species: 'D3', common_name: 'D3', genus: 'G12', family: 'Apidae',        order: 'Hymenoptera', class: 'Insecta' } },
  // Spiders (Araneae / Salticidae)
  { id: 13, taxon: { species: 'E1', common_name: 'E1', genus: 'G13', family: 'Salticidae',    order: 'Araneae', class: 'Arachnida' } },
  { id: 14, taxon: { species: 'E2', common_name: 'E2', genus: 'G14', family: 'Salticidae',    order: 'Araneae', class: 'Arachnida' } },
  { id: 15, taxon: { species: 'E3', common_name: 'E3', genus: 'G15', family: 'Salticidae',    order: 'Araneae', class: 'Arachnida' } },
  // Mantises (Mantodea / Mantidae)
  { id: 16, taxon: { species: 'F1', common_name: 'F1', genus: 'G16', family: 'Mantidae',      order: 'Mantodea', class: 'Insecta' } },
  { id: 17, taxon: { species: 'F2', common_name: 'F2', genus: 'G17', family: 'Mantidae',      order: 'Mantodea', class: 'Insecta' } },
  { id: 18, taxon: { species: 'F3', common_name: 'F3', genus: 'G18', family: 'Mantidae',      order: 'Mantodea', class: 'Insecta' } },
];

const taxonomy = {
  order: {
    Coleoptera: [0,1,2], Lepidoptera: [3,4,5], Odonata: [6,7,8],
    Hymenoptera: [9,10,11], Araneae: [12,13,14], Mantodea: [15,16,17],
  },
  family: {
    Scarabaeidae: [0,1,2], Nymphalidae: [3,4,5], Libellulidae: [6,7,8],
    Apidae: [9,10,11], Salticidae: [12,13,14], Mantidae: [15,16,17],
  },
  genus: Object.fromEntries(Array.from({length: 18}, (_, i) => [`G${i+1}`, [i]])),
};

const bugs101Set = {
  name: 'Bugs 101',
  scoring: 'binary',
  observation_ids: Array.from({length: 18}, (_, i) => i),
};

describe('Bugs 101 category variety', () => {
  it('never shows the same category in consecutive rounds', () => {
    for (let trial = 0; trial < 50; trial++) {
      const session = new SessionState(observations, taxonomy, bugs101Set, 'bugs_101');
      const categories = [];

      for (let round = 0; round < 10; round++) {
        const r = session.nextRound();
        if (!r) break;
        categories.push(getBugs101Name(r.correct.taxon));
        session.submitAnswer(r.correct.taxon);
      }

      for (let i = 1; i < categories.length; i++) {
        expect(categories[i], `Trial ${trial}, round ${i}: ${categories.slice(0, i+1).join(' → ')}`).not.toBe(categories[i - 1]);
      }
    }
  });

  it('does not repeat a category within the last 3 rounds', () => {
    for (let trial = 0; trial < 50; trial++) {
      const session = new SessionState(observations, taxonomy, bugs101Set, 'bugs_101');
      const categories = [];

      for (let round = 0; round < 10; round++) {
        const r = session.nextRound();
        if (!r) break;
        categories.push(getBugs101Name(r.correct.taxon));
        session.submitAnswer(r.correct.taxon);
      }

      for (let i = 3; i < categories.length; i++) {
        const window = categories.slice(i - 3, i);
        expect(window, `Trial ${trial}, round ${i}: ${categories.join(' → ')}`).not.toContain(categories[i]);
      }
    }
  });

  it('variety tracking does not apply to genus scoring sets', () => {
    const allBugsSet = { ...bugs101Set, scoring: 'genus' };
    const session = new SessionState(observations, taxonomy, allBugsSet, 'all_bugs');
    for (let round = 0; round < 10; round++) {
      const r = session.nextRound();
      if (!r) break;
      session.submitAnswer(r.correct.taxon);
    }
    expect(session.currentRound).toBeGreaterThanOrEqual(10);
  });

  it('falls back gracefully when fewer than 4 categories exist', () => {
    const smallObs = observations.slice(0, 3);
    const smallTax = {
      order: { Coleoptera: [0,1,2] },
      family: { Scarabaeidae: [0,1,2] },
      genus: { G1: [0], G2: [1], G3: [2] },
    };
    const smallSet = { name: 'Small', scoring: 'binary', observation_ids: [0,1,2] };
    const session = new SessionState(smallObs, smallTax, smallSet, 'small');
    const r = session.nextRound();
    expect(r).not.toBeNull();
    expect(r.correct).toBeDefined();
  });
});
