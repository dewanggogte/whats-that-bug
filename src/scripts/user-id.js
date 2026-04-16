/**
 * Persistent user ID — generated once, stored forever in localStorage.
 * Used to tie game sessions together across visits.
 */

const STORAGE_KEY = 'wtb_user_id';

function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

let cachedId = null;

export function getUserId() {
  if (cachedId) return cachedId;
  try {
    cachedId = localStorage.getItem(STORAGE_KEY);
    if (!cachedId) {
      cachedId = generateUUID();
      localStorage.setItem(STORAGE_KEY, cachedId);
    }
  } catch {
    cachedId = generateUUID();
  }
  return cachedId;
}
