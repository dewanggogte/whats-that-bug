/**
 * Performance tracker for the Reddit content pipeline.
 *
 * Tracks which posts were made, prevents photo reuse across subreddits,
 * records engagement metrics, and provides per-subreddit analytics.
 *
 * Two persistent files:
 *   .cache/reddit-post-log.json    — ordered array of every post
 *   .cache/reddit-posted-photos.json — observation-ID reuse index
 *
 * The posted-photos file predates this module and its shape is preserved
 * for backward compatibility.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { CACHE_DIR } from './config.mjs';

// ---------------------------------------------------------------------------
// File paths
// ---------------------------------------------------------------------------

const POST_LOG_FILE = join(CACHE_DIR, 'reddit-post-log.json');
const POSTED_PHOTOS_FILE = join(CACHE_DIR, 'reddit-posted-photos.json');

/** Ensure the cache directory exists before any write. */
function ensureCacheDir() {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
}

// ---------------------------------------------------------------------------
// Post log  —  ordered history of every Reddit post
// ---------------------------------------------------------------------------
// Shape: Array<{
//   subId, contentType, url, title, timestamp, observationIds, engagement
// }>

/**
 * Load the post log from disk. Returns an empty array if the file
 * doesn't exist yet.
 */
export function loadPostLog() {
  if (!existsSync(POST_LOG_FILE)) return [];
  return JSON.parse(readFileSync(POST_LOG_FILE, 'utf-8'));
}

/** Write the full post log array to disk. */
export function savePostLog(log) {
  ensureCacheDir();
  writeFileSync(POST_LOG_FILE, JSON.stringify(log, null, 2) + '\n');
}

/**
 * Append a new entry to the post log.
 *
 * @param {{ subId: string, contentType: string, url: string, title: string, observationIds: string[] }} entry
 * @returns {Array} The updated post log.
 */
export function logPost({ subId, contentType, url, title, observationIds }) {
  const log = loadPostLog();
  log.push({
    subId,
    contentType,
    url,
    title,
    timestamp: new Date().toISOString(),
    observationIds: observationIds ?? [],
    engagement: null,
  });
  savePostLog(log);
  return log;
}

/**
 * Record engagement metrics for an existing post.
 *
 * @param {number} postIndex  Index into the post log array.
 * @param {object} engagement  Metrics object (upvotes, comments, etc.).
 * @returns {Array} The updated post log.
 */
export function updateEngagement(postIndex, engagement) {
  const log = loadPostLog();
  if (postIndex < 0 || postIndex >= log.length) {
    throw new RangeError(
      `postIndex ${postIndex} out of range (log has ${log.length} entries)`
    );
  }
  log[postIndex].engagement = {
    ...engagement,
    recordedAt: new Date().toISOString(),
  };
  savePostLog(log);
  return log;
}

// ---------------------------------------------------------------------------
// Posted photos  —  observation-ID reuse tracker
// ---------------------------------------------------------------------------
// Shape: { [obsId]: { count: number, subreddits: string[], lastPosted: ISO } }

/**
 * Load the posted-photos index. Returns an empty object if the file
 * doesn't exist yet.
 */
export function loadPostedPhotos() {
  if (!existsSync(POSTED_PHOTOS_FILE)) return {};
  return JSON.parse(readFileSync(POSTED_PHOTOS_FILE, 'utf-8'));
}

/** Write the full posted-photos object to disk. */
export function savePostedPhotos(photos) {
  ensureCacheDir();
  writeFileSync(POSTED_PHOTOS_FILE, JSON.stringify(photos, null, 2) + '\n');
}

/**
 * Record that a set of observation IDs were posted to a subreddit.
 * Increments count, appends the subreddit if new, and updates lastPosted.
 *
 * @param {string} subId   Subreddit key from config (e.g. "spiders").
 * @param {string[]} observationIds  iNaturalist observation IDs used.
 */
export function recordPostedPhotos(subId, observationIds) {
  const photos = loadPostedPhotos();
  const now = new Date().toISOString();
  const subName = `r/${subId}`;

  for (const id of observationIds) {
    const key = String(id);
    if (!photos[key]) {
      photos[key] = { count: 0, subreddits: [], lastPosted: now };
    }
    photos[key].count += 1;
    if (!photos[key].subreddits.includes(subName)) {
      photos[key].subreddits.push(subName);
    }
    photos[key].lastPosted = now;
  }

  savePostedPhotos(photos);
}

/**
 * Return a Set of all observation IDs that have been posted anywhere.
 * Useful for filtering candidates during photo selection.
 */
export function getPostedIds() {
  return new Set(Object.keys(loadPostedPhotos()));
}

// ---------------------------------------------------------------------------
// Per-subreddit analytics
// ---------------------------------------------------------------------------

/**
 * Compute summary statistics for a single subreddit.
 *
 * @param {string} subId  Subreddit key from config (e.g. "spiders").
 * @returns {{ totalPosts: number, lastPosted: string|null, avgUpvotes: number|null, bestPost: object|null, contentTypeCounts: object }}
 */
export function getSubStats(subId) {
  const log = loadPostLog();
  const entries = log.filter((e) => e.subId === subId);

  const contentTypeCounts = { gallery: 0, challenge: 0, text: 0 };
  let bestPost = null;
  let upvoteSum = 0;
  let upvoteCount = 0;

  for (const entry of entries) {
    // Tally content types
    if (entry.contentType in contentTypeCounts) {
      contentTypeCounts[entry.contentType] += 1;
    }

    // Track engagement stats
    if (entry.engagement && typeof entry.engagement.upvotes === 'number') {
      upvoteSum += entry.engagement.upvotes;
      upvoteCount += 1;

      if (!bestPost || entry.engagement.upvotes > bestPost.engagement.upvotes) {
        bestPost = entry;
      }
    }
  }

  // Most recent post timestamp
  const lastPosted =
    entries.length > 0 ? entries[entries.length - 1].timestamp : null;

  return {
    totalPosts: entries.length,
    lastPosted,
    avgUpvotes: upvoteCount > 0 ? upvoteSum / upvoteCount : null,
    bestPost,
    contentTypeCounts,
  };
}
