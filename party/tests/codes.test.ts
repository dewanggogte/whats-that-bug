import { describe, it, expect, beforeEach } from 'vitest';
import { generateCode, isValidCodeShape } from '../codes';
import { createToken, verifyCreateToken } from '../create-token';
import { checkRateLimit, resetRateLimit } from '../rate-limit';
import { mulberry32 } from '../../src/scripts/rng.js';

describe('generateCode', () => {
  it('produces 4-character strings', () => {
    expect(generateCode().length).toBe(4);
  });

  it('uses only allowed alphabet', () => {
    for (let i = 0; i < 100; i++) {
      const c = generateCode();
      expect(isValidCodeShape(c)).toBe(true);
    }
  });

  it('is deterministic with a seeded rng', () => {
    expect(generateCode(mulberry32(1))).toEqual(generateCode(mulberry32(1)));
  });
});

describe('isValidCodeShape', () => {
  it('accepts valid codes', () => {
    expect(isValidCodeShape('ABCD')).toBe(true);
  });
  it('rejects codes with banned chars', () => {
    expect(isValidCodeShape('ABCO')).toBe(false);
    expect(isValidCodeShape('AB1D')).toBe(false);
  });
  it('rejects wrong length', () => {
    expect(isValidCodeShape('ABC')).toBe(false);
    expect(isValidCodeShape('ABCDE')).toBe(false);
  });
});

describe('rate limit', () => {
  beforeEach(() => resetRateLimit());

  it('allows up to 5 in an hour', () => {
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit('1.2.3.4').allowed).toBe(true);
    }
  });

  it('rejects the 6th', () => {
    for (let i = 0; i < 5; i++) checkRateLimit('1.2.3.4');
    const r = checkRateLimit('1.2.3.4');
    expect(r.allowed).toBe(false);
    expect(r.retryAfterMs).toBeGreaterThan(0);
  });

  it('isolates by IP', () => {
    for (let i = 0; i < 5; i++) checkRateLimit('1.2.3.4');
    expect(checkRateLimit('5.6.7.8').allowed).toBe(true);
  });

  it('forgets old hits', () => {
    const past = Date.now() - 2 * 60 * 60 * 1000;
    for (let i = 0; i < 5; i++) checkRateLimit('1.2.3.4', past);
    expect(checkRateLimit('1.2.3.4').allowed).toBe(true);
  });
});

describe('createToken', () => {
  it('verifies a fresh token for the same code', async () => {
    const token = await createToken('ABCD', 'secret', 1000);
    expect(await verifyCreateToken(token, 'ABCD', 'secret', 1000)).toBe(true);
  });

  it('rejects wrong room code', async () => {
    const token = await createToken('ABCD', 'secret', 1000);
    expect(await verifyCreateToken(token, 'WXYZ', 'secret', 1000)).toBe(false);
  });

  it('rejects expired tokens', async () => {
    const token = await createToken('ABCD', 'secret', 1000);
    expect(await verifyCreateToken(token, 'ABCD', 'secret', 20 * 60 * 1000)).toBe(false);
  });
});
