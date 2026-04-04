/**
 * Leaderboard API client — fetch/submit leaderboard data via Google Apps Script.
 */

const WEBHOOK_URL = import.meta.env.PUBLIC_GOOGLE_SHEET_WEBHOOK_URL || '';

const LEADERBOARD_SETS = ['bugs_101_time_trial', 'bugs_101_streak', 'time_trial', 'streak'];

export function isLeaderboardEligible(setKey) {
  return LEADERBOARD_SETS.includes(setKey);
}

/**
 * Fetch all leaderboards from Apps Script.
 * Returns: { bugs_101_time_trial: Entry[], bugs_101_streak: Entry[], time_trial: Entry[], streak: Entry[] }
 * Each Entry: { rank, name, country, score, streak, questions, correct, timestamp }
 */
export async function fetchLeaderboards() {
  if (!WEBHOOK_URL) return null;
  const url = `${WEBHOOK_URL}?action=leaderboard`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Leaderboard fetch failed: ${res.status}`);
  return res.json();
}

/**
 * Submit a leaderboard entry and get back the updated top 10 for that board.
 */
export async function submitLeaderboardEntry(entry) {
  if (!WEBHOOK_URL) return null;
  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action: 'leaderboard_entry', ...entry }),
  });
  if (!res.ok) throw new Error(`Leaderboard submit failed: ${res.status}`);
  return res.json();
}

/**
 * Check if a score qualifies for the top 10.
 * Returns { qualifies: boolean, rank: number } where rank is 1-10 or 0 if not qualifying.
 */
export function checkTop10(board, score, isStreak) {
  if (!board || board.length === 0) return { qualifies: true, rank: 1 };

  const value = isStreak ? score : score; // both use numeric comparison
  const boardValues = board.map(e => isStreak ? (e.streak || 0) : (e.score || 0));

  // Find where this score would rank
  let rank = 1;
  for (const v of boardValues) {
    if (value > v) break;
    rank++;
  }

  if (rank <= 10) return { qualifies: true, rank };
  return { qualifies: false, rank };
}

/**
 * Check if this is a personal best for the given set key.
 * Compares against localStorage. Updates localStorage if it is.
 * Returns { isPersonalBest: boolean, previousBest: number }
 */
export function checkPersonalBest(setKey, score, isStreak) {
  const storageKey = `best_${setKey}`;
  const previousBest = parseInt(localStorage.getItem(storageKey) || '0', 10);
  const value = isStreak ? score : score;

  if (value > previousBest) {
    localStorage.setItem(storageKey, value.toString());
    return { isPersonalBest: true, previousBest };
  }
  return { isPersonalBest: false, previousBest };
}
