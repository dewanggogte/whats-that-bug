const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 5;

const hits = new Map<string, number[]>();

export function checkRateLimit(ip: string, now: number = Date.now()): { allowed: boolean; retryAfterMs?: number } {
  const arr = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  if (arr.length >= MAX_PER_WINDOW) {
    const oldest = arr[0];
    return { allowed: false, retryAfterMs: WINDOW_MS - (now - oldest) };
  }
  arr.push(now);
  hits.set(ip, arr);
  return { allowed: true };
}

export function resetRateLimit(): void {
  hits.clear();
}
