const WINDOW_MS = 60 * 60 * 1000;
const MAX_CREATES_PER_KEY = 15;

const hits = new Map<string, number[]>();

export function checkRateLimit(key: string, now: number = Date.now()): { allowed: boolean; retryAfterMs?: number } {
  const arr = (hits.get(key) || []).filter(t => now - t < WINDOW_MS);
  if (arr.length >= MAX_CREATES_PER_KEY) {
    const oldest = arr[0];
    return { allowed: false, retryAfterMs: WINDOW_MS - (now - oldest) };
  }
  arr.push(now);
  hits.set(key, arr);
  return { allowed: true };
}

export function resetRateLimit(): void {
  hits.clear();
}
