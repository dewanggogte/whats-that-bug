import { describe, expect, it } from 'vitest';
import { buildLearningCard, firstSentence, pairKey, stripHtml } from '../src/scripts/learning-card.js';

const spider = {
  taxon: {
    common_name: 'Bold Jumper',
    species: 'Phidippus audax',
    genus: 'Phidippus',
    family: 'Salticidae',
    order: 'Araneae',
  },
  wikipedia_summary: 'The bold jumper is a common jumping spider. It has iridescent chelicerae.',
  inat_url: 'https://example.com/spider',
};

const beetlePick = {
  taxon: {
    common_name: 'Seven-spotted Lady Beetle',
    species: 'Coccinella septempunctata',
    genus: 'Coccinella',
    family: 'Coccinellidae',
    order: 'Coleoptera',
  },
};

describe('pairKey', () => {
  it('is order-independent and pipe-joined', () => {
    expect(pairKey('Spider', 'Beetle')).toBe('Beetle|Spider');
    expect(pairKey('Beetle', 'Spider')).toBe('Beetle|Spider');
  });
});

describe('stripHtml / firstSentence', () => {
  it('strips tags and collapses whitespace', () => {
    expect(stripHtml('<p>Hello <strong>there</strong></p>')).toBe('Hello there');
  });

  it('returns only the first sentence', () => {
    expect(firstSentence('<p>Big eyes. Jumps far. Eats flies.</p>')).toBe('Big eyes.');
  });

  it('returns the whole string when there is no terminal punctuation', () => {
    expect(firstSentence('a lone fragment')).toBe('a lone fragment');
  });
});

describe('buildLearningCard - Bugs 101 tier', () => {
  it('uses the pairwise tell looked up by category pair', () => {
    const card = buildLearningCard({
      picked: beetlePick,
      correct: spider,
      scoring: 'binary',
      bugs101Tells: {
        [pairKey('Beetle', 'Jumping Spider')]: 'spiders have 8 legs and two huge front-facing eyes',
      },
    });

    expect(card.title).toBe('Close one!');
    expect(card.answerName).toBe('Bold Jumper');
    expect(card.answerSci).toBe('Phidippus audax');
    expect(card.tell).toBe('spiders have 8 legs and two huge front-facing eyes');
    expect(card.learnMoreUrl).toBe('https://example.com/spider');
  });

  it('falls back to the correct category key_mark when no pairwise tell exists', () => {
    const card = buildLearningCard({
      picked: beetlePick,
      correct: spider,
      scoring: 'binary',
      traits: {
        'Jumping Spider': { key_mark: 'two huge front-facing eyes' },
      },
    });

    expect(card.tell).toBe('two huge front-facing eyes');
  });

  it('returns an empty tell when no pairwise or trait data exists', () => {
    const card = buildLearningCard({ picked: beetlePick, correct: spider, scoring: 'binary' });

    expect(card.tell).toBe('');
  });
});

describe('buildLearningCard - genus tier', () => {
  it('uses the correct genus key_mark regardless of the pick', () => {
    const card = buildLearningCard({
      picked: beetlePick,
      correct: spider,
      scoring: 'genus',
      traits: {
        Phidippus: { key_mark: 'oversized front eyes' },
        Coccinella: { key_mark: 'round red beetle body with black spots' },
      },
    });

    expect(card.tell).toBe('oversized front eyes');
  });

  it('returns an empty tell when the correct genus has no trait data', () => {
    const card = buildLearningCard({ picked: beetlePick, correct: spider, scoring: 'genus', traits: {} });

    expect(card.tell).toBe('');
  });
});

describe('buildLearningCard - fun fact', () => {
  it('prefers species-content summary, stripped to one sentence', () => {
    const card = buildLearningCard({
      picked: beetlePick,
      correct: spider,
      scoring: 'genus',
      speciesContent: {
        'Phidippus audax': { summary: '<p>It can <strong>see</strong> in color. More text here.</p>' },
      },
    });

    expect(card.funFact).toBe('It can see in color.');
  });

  it('falls back to wikipedia_summary first sentence', () => {
    const card = buildLearningCard({ picked: beetlePick, correct: spider, scoring: 'genus' });

    expect(card.funFact).toBe('The bold jumper is a common jumping spider.');
  });
});
