const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LEN = 4;

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
