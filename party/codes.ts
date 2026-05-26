const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LEN = 4;
const RESERVATION_PREFIX = 'room-code:';
const DEFAULT_RESERVATION_TTL_MS = 4 * 60 * 60 * 1000;
const DEFAULT_MAX_RESERVATION_ATTEMPTS = 200;

type RoomCodeStore = {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string | string[]): Promise<unknown>;
  list<T = unknown>(options?: { prefix?: string }): Promise<Map<string, T>>;
  transaction?<T>(closure: (txn: any) => Promise<T>): Promise<T>;
};

type RoomCodeReservation = {
  code: string;
  reservedAt: number;
  expiresAt: number;
};

export function generateCode(rng: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < CODE_LEN; i++) {
    s += ALPHABET[Math.floor(rng() * ALPHABET.length)];
  }
  return s;
}

export function isValidCodeShape(s: string): boolean {
  if (s.length !== CODE_LEN) return false;
  for (const ch of s) if (!ALPHABET.includes(ch)) return false;
  return true;
}

export async function reserveRoomCode(
  store: RoomCodeStore,
  opts: {
    now?: number;
    ttlMs?: number;
    maxAttempts?: number;
    rng?: () => number;
  } = {}
): Promise<string | null> {
  const reserve = async (txn: RoomCodeStore) => {
    const now = opts.now ?? Date.now();
    const ttlMs = opts.ttlMs ?? DEFAULT_RESERVATION_TTL_MS;
    const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_RESERVATION_ATTEMPTS;
    const rng = opts.rng ?? Math.random;

    await pruneExpiredRoomCodes(txn, now);

    for (let i = 0; i < maxAttempts; i++) {
      const code = generateCode(rng);
      const key = reservationKey(code);
      const existing = await txn.get<RoomCodeReservation>(key);
      if (existing && existing.expiresAt > now) continue;
      await txn.put<RoomCodeReservation>(key, { code, reservedAt: now, expiresAt: now + ttlMs });
      return code;
    }

    return null;
  };

  return store.transaction ? store.transaction(reserve) : reserve(store);
}

export async function pruneExpiredRoomCodes(store: RoomCodeStore, now: number = Date.now()): Promise<void> {
  const reservations = await store.list<RoomCodeReservation>({ prefix: RESERVATION_PREFIX });
  const expiredKeys: string[] = [];
  for (const [key, reservation] of reservations) {
    if (!reservation || reservation.expiresAt <= now) expiredKeys.push(key);
  }
  if (expiredKeys.length > 0) await store.delete(expiredKeys);
}

function reservationKey(code: string): string {
  return RESERVATION_PREFIX + code;
}
