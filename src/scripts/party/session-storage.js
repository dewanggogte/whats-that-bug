const KEY_PREFIX = 'wtb_party_';

export function loadPartySession(code) {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + code);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function savePartySession(code, next) {
  try {
    const previous = loadPartySession(code) || {};
    localStorage.setItem(KEY_PREFIX + code, JSON.stringify({ ...previous, ...definedOnly(next), savedAt: Date.now() }));
  } catch { /* ignore */ }
}

export function clearPartySession(code) {
  try {
    localStorage.removeItem(KEY_PREFIX + code);
  } catch { /* ignore */ }
}

export function pruneOldPartySessions() {
  try {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(KEY_PREFIX)) continue;
      try {
        const v = JSON.parse(localStorage.getItem(k));
        if (now - (v.savedAt || 0) > day) localStorage.removeItem(k);
      } catch {
        localStorage.removeItem(k);
      }
    }
  } catch { /* ignore */ }
}

function definedOnly(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined));
}
