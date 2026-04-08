/**
 * Calendar & queue system for the Reddit content pipeline.
 * Manages the weekly posting schedule, eligibility checks, and slot lifecycle.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { CACHE_DIR, SUBREDDITS, WEEKLY_CADENCE } from './config.mjs';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Days of the week to post: Tue, Wed, Thu, Sat (0 = Sun, 6 = Sat) */
const POST_DAYS = [2, 3, 4, 6];

const CALENDAR_PATH = join(CACHE_DIR, 'reddit-calendar.json');
const POST_LOG_PATH = join(CACHE_DIR, 'reddit-post-log.json');
const POST_TIMES_CACHE = join(CACHE_DIR, 'reddit-post-times.json');

/** Cache TTL for optimal posting times: 7 days in milliseconds */
const POST_TIMES_TTL = 7 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Persistence: Calendar
// ---------------------------------------------------------------------------

/**
 * Load the calendar from disk. Returns a default empty calendar if the file
 * doesn't exist or can't be parsed.
 * @returns {{ slots: Array, generatedAt: string|null }}
 */
export function loadCalendar() {
  try {
    const raw = readFileSync(CALENDAR_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { slots: [], generatedAt: null };
  }
}

/**
 * Save the calendar to disk, creating the cache directory if needed.
 * @param {{ slots: Array, generatedAt: string|null }} cal
 */
export function saveCalendar(cal) {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(CALENDAR_PATH, JSON.stringify(cal, null, 2));
}

// ---------------------------------------------------------------------------
// Persistence: Post log
// ---------------------------------------------------------------------------

/**
 * Load the post log from disk. Returns an empty array if the file doesn't
 * exist or can't be parsed.
 * @returns {Array<{ subId: string, contentType: string, timestamp: string, url?: string, title: string, observationIds: string[], engagement?: object }>}
 */
export function loadPostLog() {
  try {
    const raw = readFileSync(POST_LOG_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/**
 * Save the post log to disk, creating the cache directory if needed.
 * @param {Array} log
 */
export function savePostLog(log) {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(POST_LOG_PATH, JSON.stringify(log, null, 2));
}

// ---------------------------------------------------------------------------
// Optimal posting times (laterforreddit.com)
// ---------------------------------------------------------------------------

/**
 * Load the cached optimal posting times. Returns an empty object if the
 * cache file doesn't exist or can't be parsed.
 * @returns {{ [subId: string]: { hour: number, minute: number, fetchedAt: string } }}
 */
function loadPostTimesCache() {
  try {
    if (!existsSync(POST_TIMES_CACHE)) return {};
    return JSON.parse(readFileSync(POST_TIMES_CACHE, 'utf-8'));
  } catch {
    return {};
  }
}

/**
 * Save the posting times cache to disk.
 * @param {object} cache
 */
function savePostTimesCache(cache) {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(POST_TIMES_CACHE, JSON.stringify(cache, null, 2));
}

/**
 * Fetch the optimal posting time for a subreddit from laterforreddit.com.
 *
 * Fetches the analysis page and parses the best day/time from the HTML
 * response. Results are cached for 7 days so repeated runs don't hit
 * the service unnecessarily.
 *
 * Falls back to the hardcoded `postWindow` from config if the fetch fails
 * or no data can be parsed.
 *
 * @param {string} subId - Key into SUBREDDITS config
 * @returns {Promise<{ hour: number, minute: number }>}
 */
export async function fetchOptimalTimes(subId) {
  const subConfig = SUBREDDITS[subId];
  const fallback = subConfig?.postWindow ?? { hour: 8, minute: 0 };

  // Check cache first
  const cache = loadPostTimesCache();
  const cached = cache[subId];
  if (cached && cached.fetchedAt) {
    const age = Date.now() - new Date(cached.fetchedAt).getTime();
    if (age < POST_TIMES_TTL) {
      return { hour: cached.hour, minute: cached.minute };
    }
  }

  // Fetch from laterforreddit.com
  const subName = subId; // The config key matches the subreddit name
  const url = `https://laterforreddit.com/analysis/${subName}`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'WhatsThattBug-Pipeline/1.0' },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return fallback;
    }

    const html = await res.text();

    // laterforreddit.com embeds the best time in the page. Common patterns:
    //   "The best time to post ... is <day> at <time>"
    //   or structured data in a JSON blob on the page.
    // We try both approaches.

    // Approach 1: Look for a JSON data blob (more reliable if present)
    const jsonMatch = html.match(/bestTime["\s:]+\{[^}]*hour["\s:]+(\d+)[^}]*minute["\s:]+(\d+)/i);
    if (jsonMatch) {
      const hour = parseInt(jsonMatch[1], 10);
      const minute = parseInt(jsonMatch[2], 10);
      if (!isNaN(hour) && hour >= 0 && hour <= 23) {
        cache[subId] = { hour, minute: minute || 0, fetchedAt: new Date().toISOString() };
        savePostTimesCache(cache);
        return { hour, minute: minute || 0 };
      }
    }

    // Approach 2: Parse natural language pattern
    // e.g. "best time to post is Monday at 7:00 AM" or "10:30 AM"
    const timeMatch = html.match(/best\s+time\s+to\s+post.*?(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (timeMatch) {
      let hour = parseInt(timeMatch[1], 10);
      const minute = parseInt(timeMatch[2], 10);
      const ampm = timeMatch[3].toUpperCase();

      // Convert 12-hour to 24-hour
      if (ampm === 'PM' && hour !== 12) hour += 12;
      if (ampm === 'AM' && hour === 12) hour = 0;

      if (hour >= 0 && hour <= 23) {
        cache[subId] = { hour, minute, fetchedAt: new Date().toISOString() };
        savePostTimesCache(cache);
        return { hour, minute };
      }
    }

    // Could not parse — fall back but don't cache the failure
    return fallback;
  } catch {
    // Network error, timeout, etc. — use fallback
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

/**
 * Check whether a subreddit is eligible for posting based on how recently
 * it was last posted to.
 *
 * @param {string} subId - Key into SUBREDDITS config
 * @param {Array<{ subId: string, timestamp: string }>} postLog
 * @param {number} minDaysBetween - Minimum days between posts to this sub
 * @returns {boolean}
 */
export function isSubEligible(subId, postLog, minDaysBetween) {
  const subPosts = postLog.filter(p => p.subId === subId);
  if (subPosts.length === 0) return true;

  // Find the most recent post
  const mostRecent = subPosts.reduce((latest, p) =>
    new Date(p.timestamp) > new Date(latest.timestamp) ? p : latest
  );

  const daysSince = (Date.now() - new Date(mostRecent.timestamp).getTime()) / (1000 * 60 * 60 * 24);
  return daysSince >= minDaysBetween;
}

// ---------------------------------------------------------------------------
// ET → UTC conversion
// ---------------------------------------------------------------------------

/**
 * Convert an Eastern Time hour/minute + date to a UTC ISO string.
 * Uses a simple EDT/EST heuristic: months 3–10 (Mar–Nov second Sunday)
 * are EDT (UTC-4), months 11–2 are EST (UTC-5).
 *
 * This is a rough approximation — exact DST boundaries shift by a few days
 * each year, but for scheduling posts a small offset is acceptable.
 *
 * @param {Date} date - The date (in UTC) to combine with the ET time
 * @param {{ hour: number, minute: number }} postWindow
 * @returns {string} ISO string in UTC
 */
function etToUtc(date, postWindow) {
  // Determine offset based on month (1-indexed from getUTCMonth()+1)
  const month = date.getUTCMonth() + 1; // 1=Jan, 12=Dec
  // EDT (UTC-4) for months March(3) through November first Sunday(~10)
  // Spec says: EDT offset = -4 for months 2-10, EST offset = -5 for 11-1
  const isEDT = month >= 2 && month <= 10;
  const offsetHours = isEDT ? 4 : 5;

  const utc = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    postWindow.hour + offsetHours,
    postWindow.minute,
    0,
    0
  ));
  return utc.toISOString();
}

// ---------------------------------------------------------------------------
// Slot generation
// ---------------------------------------------------------------------------

/**
 * Simple Fisher-Yates shuffle (in-place, returns same array).
 * @template T
 * @param {T[]} arr
 * @returns {T[]}
 */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Determine content type for a slot, alternating gallery/challenge based on
 * the sub's last post type. Defaults to 'gallery' if no history.
 *
 * @param {string} subId
 * @param {Array<{ subId: string, contentType: string }>} postLog
 * @param {object} subConfig - The subreddit config entry
 * @returns {string}
 */
function pickContentType(subId, postLog, subConfig) {
  const allowedTypes = subConfig.contentTypes;

  // If only one type is allowed, use it
  if (allowedTypes.length === 1) return allowedTypes[0];

  // Find last post to this sub to alternate
  const subPosts = postLog.filter(p => p.subId === subId);
  if (subPosts.length === 0) return 'gallery';

  const mostRecent = subPosts.reduce((latest, p) =>
    new Date(p.timestamp) > new Date(latest.timestamp) ? p : latest
  );

  // Alternate between gallery and challenge
  if (mostRecent.contentType === 'gallery' && allowedTypes.includes('challenge')) {
    return 'challenge';
  }
  return 'gallery';
}

/**
 * Generate weekly posting slots starting from a given Monday.
 *
 * Uses optimal posting times from laterforreddit.com when available,
 * falling back to the hardcoded postWindow from config.
 *
 * @param {Date} weekStart - The Monday of the target week
 * @param {Array<{ subId: string, timestamp: string, contentType?: string }>} postLog
 * @param {number} [cadence] - Target posts per week (defaults to WEEKLY_CADENCE)
 * @returns {Promise<Array<{ subId: string, contentType: string, scheduledAt: string, status: string, postData: null }>>}
 */
export async function generateWeekSlots(weekStart, postLog, cadence = WEEKLY_CADENCE) {
  // Get all eligible subs
  const eligible = Object.entries(SUBREDDITS)
    .filter(([subId, config]) => isSubEligible(subId, postLog, config.minDaysBetween))
    .map(([subId]) => subId);

  // Shuffle for variety
  shuffle(eligible);

  // How many slots to fill
  const slotCount = Math.min(cadence, eligible.length, POST_DAYS.length);

  const slots = [];
  for (let i = 0; i < slotCount; i++) {
    const subId = eligible[i];
    const subConfig = SUBREDDITS[subId];
    const contentType = pickContentType(subId, postLog, subConfig);

    // Calculate the date for this slot's day-of-week
    // weekStart is Monday (day 1). POST_DAYS[i] is the target day.
    // Offset from Monday = POST_DAYS[i] - 1
    const slotDate = new Date(weekStart);
    slotDate.setUTCDate(slotDate.getUTCDate() + (POST_DAYS[i] - 1));

    // Try optimal time from laterforreddit.com, fall back to config
    const postWindow = await fetchOptimalTimes(subId);
    const scheduledAt = etToUtc(slotDate, postWindow);

    slots.push({
      subId,
      contentType,
      scheduledAt,
      status: 'pending',
      postData: null,
    });
  }

  return slots;
}

// ---------------------------------------------------------------------------
// Queue helpers
// ---------------------------------------------------------------------------

/**
 * Find the earliest slot that is ready and due (scheduledAt <= now).
 *
 * @param {Array<{ status: string, scheduledAt: string }>} slots
 * @returns {object|null} The due slot, or null if nothing is due
 */
export function findDuePost(slots) {
  const now = new Date();
  const readyAndDue = slots
    .filter(s => s.status === 'ready' && new Date(s.scheduledAt) <= now);

  if (readyAndDue.length === 0) return null;

  // Return the earliest
  return readyAndDue.reduce((earliest, s) =>
    new Date(s.scheduledAt) < new Date(earliest.scheduledAt) ? s : earliest
  );
}

/**
 * Get all non-posted slots sorted by scheduledAt ascending.
 *
 * @param {Array<{ status: string, scheduledAt: string }>} slots
 * @returns {Array} Sorted non-posted slots
 */
export function getUpcomingSlots(slots) {
  return slots
    .filter(s => s.status !== 'posted')
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
}
