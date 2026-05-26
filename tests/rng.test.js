import { describe, it, expect } from 'vitest';
import { mulberry32, hashString, seededShuffle, seededPick } from '../src/scripts/rng.js';

describe('mulberry32', () => {
  it('produces deterministic sequences for the same seed', () => {
    const r1 = mulberry32(42);
    const r2 = mulberry32(42);
    const seq1 = [r1(), r1(), r1(), r1(), r1()];
    const seq2 = [r2(), r2(), r2(), r2(), r2()];
    expect(seq1).toEqual(seq2);
  });

  it('produces different sequences for different seeds', () => {
    const r1 = mulberry32(42);
    const r2 = mulberry32(43);
    expect(r1()).not.toEqual(r2());
  });

  it('returns values in [0, 1)', () => {
    const r = mulberry32(123);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('hashString', () => {
  it('produces a 32-bit integer', () => {
    const h = hashString('ABCD');
    expect(Number.isInteger(h)).toBe(true);
  });

  it('is deterministic', () => {
    expect(hashString('ABCD')).toEqual(hashString('ABCD'));
  });

  it('differs for different inputs', () => {
    expect(hashString('ABCD')).not.toEqual(hashString('ABCE'));
  });
});

describe('seededShuffle', () => {
  it('produces the same permutation for the same seed', () => {
    const arr = [1, 2, 3, 4, 5];
    const a = seededShuffle(arr, mulberry32(7));
    const b = seededShuffle(arr, mulberry32(7));
    expect(a).toEqual(b);
  });

  it('does not mutate input', () => {
    const arr = [1, 2, 3, 4, 5];
    seededShuffle(arr, mulberry32(7));
    expect(arr).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('seededPick', () => {
  it('picks deterministically for the same seed', () => {
    const arr = ['a', 'b', 'c'];
    expect(seededPick(arr, mulberry32(8))).toBe(seededPick(arr, mulberry32(8)));
  });
});
