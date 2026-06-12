import { describe, it, expect, beforeEach } from 'vitest';
import { generateCode, isValidCodeShape, reserveRoomCode } from '../codes';
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

describe('reserveRoomCode', () => {
  it('skips an already-reserved active code', async () => {
    const storage = new FakeStorage();
    const first = await reserveRoomCode(storage, { rng: () => 0, now: 0, ttlMs: 1000 });
    const second = await reserveRoomCode(storage, {
      rng: sequenceRng([0, 0, 0, 0, 0.04, 0.04, 0.04, 0.04]),
      now: 1,
      ttlMs: 1000,
      maxAttempts: 2,
    });
    expect(first).toBe('AAAA');
    expect(second).toBe('BBBB');
  });

  it('returns null when it cannot find a free code within the attempt limit', async () => {
    const storage = new FakeStorage();
    await reserveRoomCode(storage, { rng: () => 0, now: 0, ttlMs: 1000 });
    const code = await reserveRoomCode(storage, { rng: () => 0, now: 1, ttlMs: 1000, maxAttempts: 2 });
    expect(code).toBeNull();
  });

  it('reuses expired reservations', async () => {
    const storage = new FakeStorage();
    await reserveRoomCode(storage, { rng: () => 0, now: 0, ttlMs: 1000 });
    const code = await reserveRoomCode(storage, { rng: () => 0, now: 1001, ttlMs: 1000 });
    expect(code).toBe('AAAA');
  });
});

describe('rate limit', () => {
  beforeEach(() => resetRateLimit());

  it('allows up to 15 in an hour', () => {
    for (let i = 0; i < 15; i++) {
      expect(checkRateLimit('1.2.3.4').allowed).toBe(true);
    }
  });

  it('rejects the 16th', () => {
    for (let i = 0; i < 15; i++) checkRateLimit('1.2.3.4');
    const r = checkRateLimit('1.2.3.4');
    expect(r.allowed).toBe(false);
    expect(r.retryAfterMs).toBeGreaterThan(0);
  });

  it('isolates by key', () => {
    for (let i = 0; i < 15; i++) checkRateLimit('1.2.3.4');
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

class FakeStorage {
  private values = new Map<string, unknown>();

  async get<T = unknown>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }

  async put<T>(key: string, value: T): Promise<void> {
    this.values.set(key, value);
  }

  async delete(key: string | string[]): Promise<unknown> {
    if (Array.isArray(key)) {
      let deleted = 0;
      for (const k of key) {
        if (this.values.delete(k)) deleted++;
      }
      return deleted;
    }
    return this.values.delete(key);
  }

  async list<T = unknown>(options: { prefix?: string } = {}): Promise<Map<string, T>> {
    const out = new Map<string, T>();
    for (const [key, value] of this.values) {
      if (!options.prefix || key.startsWith(options.prefix)) out.set(key, value as T);
    }
    return out;
  }

  async transaction<T>(closure: (txn: FakeStorage) => Promise<T>): Promise<T> {
    return closure(this);
  }
}

function sequenceRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++] ?? values[values.length - 1] ?? 0;
}
