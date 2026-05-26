const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LEN = 4;

export function isValidCodeShape(s) {
  if (s.length !== CODE_LEN) return false;
  for (const ch of s) if (!ALPHABET.includes(ch)) return false;
  return true;
}
