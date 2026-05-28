import { describe, expect, it } from 'vitest';
import { buildLearningCard, pairKey, pickContrastDimensions } from '../src/scripts/learning-card.js';

const correct = {
  taxon: {
    common_name: 'Seven-spotted Lady Beetle',
    species: 'Coccinella septempunctata',
    genus: 'Coccinella',
    family: 'Coccinellidae',
    order: 'Coleoptera',
  },
  wikipedia_summary: 'Lady beetles are rounded predatory beetles.',
  inat_url: 'https://example.com/correct',
};

const picked = {
  taxon: {
    common_name: 'Bold Jumper',
    species: 'Phidippus audax',
    genus: 'Phidippus',
    family: 'Salticidae',
    order: 'Araneae',
  },
};

describe('learning-card', () => {
  it('uses Bugs 101 pair tells when available', () => {
    const card = buildLearningCard({
      picked,
      correct,
      scoring: 'binary',
      bugs101Tells: {
        [pairKey('Beetle', 'Jumping Spider')]: 'beetles have hard wing covers; jumping spiders have eight legs and big front eyes',
      },
    });

    expect(card.verdict).toContain('Jumping Spider');
    expect(card.verdict).toContain('Beetle');
    expect(card.marks[0]).toContain('hard wing covers');
  });

  it('picks the highest-priority differing trait dimensions', () => {
    const traits = {
      Coccinella: { structure: 'round beetle body', wings: 'hard wing covers', size: '5-8 mm', color: 'red with black spots' },
      Phidippus: { structure: 'stocky spider body', wings: 'none', size: '4-15 mm', color: 'black with white spots' },
    };

    expect(pickContrastDimensions(traits.Phidippus, traits.Coccinella)).toEqual(['structure', 'wings']);

    const card = buildLearningCard({ picked, correct, scoring: 'genus', traits });
    expect(card.marks[0]).toContain('Body');
    expect(card.marks[1]).toContain('Wings');
  });

  it('falls back to taxonomy comparison when trait data is missing', () => {
    const card = buildLearningCard({ picked, correct, scoring: 'genus' });

    expect(card.marks).toContain('Genus: Coccinella, not Phidippus');
    expect(card.marks).toContain('Family: Coccinellidae, not Salticidae');
  });
});
