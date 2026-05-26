const TOKEN_TTL_MS = 10 * 60 * 1000;

export async function createToken(code: string, secret: string, now: number = Date.now()): Promise<string> {
  const payload = `${code}.${now}`;
  const sig = await hmac(payload, secret);
  return `${payload}.${sig}`;
}

export async function verifyCreateToken(
  token: string | undefined,
  code: string,
  secret: string,
  now: number = Date.now()
): Promise<boolean> {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [tokenCode, issuedAtRaw, sig] = parts;
  const issuedAt = Number(issuedAtRaw);
  if (tokenCode !== code || !Number.isFinite(issuedAt)) return false;
  if (now - issuedAt > TOKEN_TTL_MS) return false;
  const expected = await hmac(`${tokenCode}.${issuedAt}`, secret);
  return sig === expected;
}

async function hmac(payload: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}
