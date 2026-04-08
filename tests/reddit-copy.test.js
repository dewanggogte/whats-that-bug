import { describe, it, expect } from 'vitest';
import {
  generateTitle,
  generateBody,
  generateFollowupComment,
  generateCaptions,
} from '../scripts/reddit/copy.mjs';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const defaultSubConfig = {
  name: 'r/spiders',
  tone: 'default',
  categoryLabel: 'spiders',
};

const nifSubConfig = {
  name: 'r/NatureIsFuckingLit',
  tone: 'dramatic',
  categoryLabel: 'insects',
  titlePrefix: '🔥 ',
  titleSuffix: ' 🔥',
};

const cuteSubConfig = {
  name: 'r/awwnverts',
  tone: 'cute',
  categoryLabel: 'bugs',
};

const formalSubConfig = {
  name: 'r/entomology',
  tone: 'formal',
  categoryLabel: 'insects',
};

const textSubConfig = {
  name: 'r/WebGames',
  tone: 'casual',
  categoryLabel: 'game',
};

const challengeObs = {
  taxon: { common_name: 'Bold Jumping Spider', species: 'Phidippus audax' },
  attribution: '(c) Alice Smith, some rights reserved (CC BY)',
};

const sampleObservations = [
  {
    taxon: { common_name: 'Bold Jumping Spider', species: 'Phidippus audax' },
    attribution: '(c) Alice Smith, some rights reserved (CC BY)',
  },
  {
    taxon: { common_name: 'Garden Spider', species: 'Argiope aurantia' },
    attribution: '(c) Bob Jones, some rights reserved (CC BY-NC)',
  },
  {
    taxon: { common_name: 'Monarch Butterfly', species: 'Danaus plexippus' },
    attribution: '(c) Charlie Brown, some rights reserved (CC BY)',
  },
];

// ---------------------------------------------------------------------------
// generateTitle
// ---------------------------------------------------------------------------

describe('generateTitle', () => {
  it('returns a non-empty string for gallery content', () => {
    const title = generateTitle('gallery', 'spiders', defaultSubConfig);
    expect(title).toBeTruthy();
    expect(typeof title).toBe('string');
    expect(title.length).toBeGreaterThan(0);
  });

  it('returns a non-empty string for text content', () => {
    const title = generateTitle('text', 'WebGames', textSubConfig);
    expect(title).toBeTruthy();
    expect(typeof title).toBe('string');
  });

  it('adds fire emoji prefix/suffix for NatureIsFuckingLit', () => {
    const title = generateTitle('gallery', 'NatureIsFuckingLit', nifSubConfig);
    expect(title.startsWith('🔥 ')).toBe(true);
    expect(title.endsWith(' 🔥')).toBe(true);
  });

  it('generates challenge titles in question format', () => {
    const title = generateTitle('challenge', 'spiders', defaultSubConfig, challengeObs);
    expect(title).toBeTruthy();
    // Challenge titles should contain a question mark or question-like phrasing
    expect(title).toMatch(/\?|identify|species|what|guess|can you|name/i);
  });

  it('produces variety across multiple calls (>1 unique in 20 calls)', () => {
    const titles = new Set();
    for (let i = 0; i < 20; i++) {
      titles.add(generateTitle('gallery', 'spiders', defaultSubConfig));
    }
    expect(titles.size).toBeGreaterThan(1);
  });

  it('does not mention iNaturalist or research-grade in titles', () => {
    for (let i = 0; i < 20; i++) {
      const title = generateTitle('gallery', 'spiders', defaultSubConfig);
      expect(title.toLowerCase()).not.toContain('inaturalist');
      expect(title.toLowerCase()).not.toContain('research-grade');
    }
  });
});

// ---------------------------------------------------------------------------
// generateBody
// ---------------------------------------------------------------------------

describe('generateBody', () => {
  it('includes photographer credits', () => {
    const body = generateBody('gallery', defaultSubConfig, {
      credits: ['Alice Smith', 'Bob Jones', 'Charlie Brown'],
      includeGameLink: false,
    });
    expect(body).toContain('Alice Smith');
    expect(body).toContain('Bob Jones');
    expect(body).toContain('Charlie Brown');
  });

  it('formats credits with Oxford comma', () => {
    const body = generateBody('gallery', defaultSubConfig, {
      credits: ['Alice', 'Bob', 'Charlie'],
      includeGameLink: false,
    });
    expect(body).toContain('Alice, Bob, and Charlie');
  });

  it('conditionally includes game link when includeGameLink is true', () => {
    const body = generateBody('gallery', defaultSubConfig, {
      credits: ['Alice Smith'],
      includeGameLink: true,
    });
    expect(body).toContain('dewanggogte.com');
  });

  it('omits game link when includeGameLink is false', () => {
    const body = generateBody('gallery', defaultSubConfig, {
      credits: ['Alice Smith'],
      includeGameLink: false,
    });
    expect(body).not.toContain('dewanggogte.com');
  });

  it('includes iNaturalist mention in gallery body', () => {
    const body = generateBody('gallery', defaultSubConfig, {
      credits: ['Alice Smith'],
      includeGameLink: false,
    });
    expect(body.toLowerCase()).toContain('inaturalist');
  });

  it('returns placeholder prompt for text content', () => {
    const body = generateBody('text', textSubConfig, {
      credits: [],
      includeGameLink: false,
    });
    expect(body).toBeTruthy();
    expect(typeof body).toBe('string');
  });

  it('generates challenge body with question framing', () => {
    const body = generateBody('challenge', defaultSubConfig, {
      credits: ['Alice Smith'],
      includeGameLink: false,
      challengeObs,
    });
    expect(body).toBeTruthy();
    expect(typeof body).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// generateFollowupComment
// ---------------------------------------------------------------------------

describe('generateFollowupComment', () => {
  it('includes game link', () => {
    const comment = generateFollowupComment('gallery', defaultSubConfig);
    expect(comment).toContain('dewanggogte.com');
  });

  it('returns a non-empty string', () => {
    const comment = generateFollowupComment('gallery', defaultSubConfig);
    expect(typeof comment).toBe('string');
    expect(comment.length).toBeGreaterThan(0);
  });

  it('works for challenge content type', () => {
    const comment = generateFollowupComment('challenge', defaultSubConfig);
    expect(comment).toContain('dewanggogte.com');
  });
});

// ---------------------------------------------------------------------------
// generateCaptions
// ---------------------------------------------------------------------------

describe('generateCaptions', () => {
  it('generates correct format per observation', () => {
    const captions = generateCaptions(sampleObservations);
    expect(captions).toHaveLength(3);

    // First caption: check format
    expect(captions[0]).toContain('Bold Jumping Spider');
    expect(captions[0]).toContain('Phidippus audax');
    expect(captions[0]).toContain('Alice Smith');
    expect(captions[0]).toContain('iNaturalist');
    expect(captions[0]).toContain('📸');
  });

  it('extracts photographer name from attribution string', () => {
    const captions = generateCaptions([
      {
        taxon: { common_name: 'Honeybee', species: 'Apis mellifera' },
        attribution: '(c) Jane Doe, some rights reserved (CC BY)',
      },
    ]);
    expect(captions[0]).toContain('Jane Doe');
    // Should not contain the full raw attribution
    expect(captions[0]).not.toContain('some rights reserved');
  });

  it('uses species in italics format (parenthesized)', () => {
    const captions = generateCaptions(sampleObservations);
    // Species name should be in parens: "Common Name (Species name)"
    expect(captions[0]).toMatch(/Bold Jumping Spider\s*\(.*Phidippus audax.*\)/);
  });
});
