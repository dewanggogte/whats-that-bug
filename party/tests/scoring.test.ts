import { describe, it, expect } from 'vitest';
import { calculateScore, calculateTimedScore, scoreAnswer, getBugs101Name } from '../scoring';

describe('calculateScore', () => {
  const correct = { species: 'A', genus: 'G', family: 'F', order: 'O' };
  it('100 for species match because genus matches', () => {
    expect(calculateScore({ species: 'A', genus: 'G', family: 'F', order: 'O' }, correct)).toBe(100);
  });
  it('100 for genus match', () => {
    expect(calculateScore({ species: 'B', genus: 'G', family: 'F', order: 'O' }, correct)).toBe(100);
  });
  it('0 for family match with different genus', () => {
    expect(calculateScore({ species: 'B', genus: 'H', family: 'F', order: 'O' }, correct)).toBe(0);
  });
  it('0 for order match with different genus', () => {
    expect(calculateScore({ species: 'B', genus: 'H', family: 'X', order: 'O' }, correct)).toBe(0);
  });
  it('0 for nothing matches', () => {
    expect(calculateScore({ species: 'B', genus: 'H', family: 'X', order: 'Y' }, correct)).toBe(0);
  });
});

describe('getBugs101Name', () => {
  it('honey bee', () => {
    expect(getBugs101Name({ order: 'Hymenoptera', family: 'Apidae', genus: 'Apis' })).toBe('Honey Bee');
  });
  it('orb weaver spider', () => {
    expect(getBugs101Name({ order: 'Araneae', family: 'Araneidae' })).toBe('Orb Weaver Spider');
  });
  it('unknown order falls back to common name', () => {
    expect(getBugs101Name({ order: 'Mystery', order_common: 'Mystery Bug' })).toBe('Mystery Bug');
  });
});

describe('scoreAnswer dispatches by scoring strategy', () => {
  const correct = { id: 1, taxon: { species: 'A', genus: 'G', family: 'F', order: 'O' } };
  const sameGenus = { id: 2, taxon: { species: 'B', genus: 'G', family: 'F', order: 'O' } };
  it('binary returns 0 when categories differ', () => {
    const beetle = { id: 3, taxon: { order: 'Coleoptera' } };
    const fly = { id: 4, taxon: { order: 'Diptera' } };
    expect(scoreAnswer(fly, beetle, 'binary')).toBe(0);
  });
  it('genus returns 100 for same genus', () => {
    expect(scoreAnswer(sameGenus, correct, 'genus')).toBe(100);
  });
});

describe('calculateTimedScore', () => {
  it('matches single-player speed brackets', () => {
    expect(calculateTimedScore(2500)).toBe(100);
    expect(calculateTimedScore(4000)).toBe(75);
    expect(calculateTimedScore(7000)).toBe(50);
    expect(calculateTimedScore(10000)).toBe(25);
    expect(calculateTimedScore(15000)).toBe(10);
  });
});
