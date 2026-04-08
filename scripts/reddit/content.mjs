/**
 * Content generator — produces gallery and challenge photo candidates.
 *
 * Sources:
 *   1. iNaturalist API (research-grade observations sorted by faves)
 *   2. Local observation pool (public/data/observations.json)
 *
 * Exports:
 *   - fetchGalleryCandidates(subId, postedIds?)
 *   - pickChallengeCandidates(subId, postedIds?, count?)
 *   - scanExistingPool(subId, postedIds?, limit?)
 */

import { readFileSync } from 'fs';
import { INAT_API, OBS_FILE, SUBREDDITS } from './config.mjs';

// ── Helpers ─────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const USER_AGENT = 'WhatsThatBugGame/1.0 (educational project; reddit pipeline)';

/**
 * Mapping from taxon_id → order names used to filter the local observation pool.
 * null means "accept all orders" (no filtering).
 */
const ORDER_MAP = {
  47118:  ['Araneae'],                                       // spiders
  630955: ['Hymenoptera'],                                   // bees
  47157:  ['Lepidoptera'],                                   // moths
  47336:  ['Hymenoptera'],                                   // ants
  47224:  ['Lepidoptera'],                                   // butterflies
  47158:  null,                                              // insects (all)
  47119:  ['Araneae', 'Scorpiones', 'Opiliones', 'Acari'],  // arachnids
};

/**
 * Fetches a single iNaturalist observations page with retry logic.
 * 3 attempts, 3 s pause between retries.
 */
async function fetchInatPage(params) {
  const qs = new URLSearchParams(params).toString();
  const url = `${INAT_API}/observations?${qs}`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
      });
      if (!res.ok) {
        throw new Error(`iNat API ${res.status}: ${await res.text()}`);
      }
      const data = await res.json();
      return data.results || [];
    } catch (err) {
      if (attempt === 3) throw err;
      console.warn(`  ⚠ iNat request failed (attempt ${attempt}/3): ${err.message}`);
      await sleep(3000);
    }
  }
}

/**
 * Transforms a raw iNaturalist observation into our candidate shape.
 */
function mapObservation(obs) {
  const photo = obs.photos[0];
  // iNat photo URLs use "square" by default — swap to the size we need
  const baseUrl = photo.url.replace('/square.', '/medium.');
  return {
    id: obs.id,
    photo_url: baseUrl,
    photo_url_large: baseUrl.replace('/medium.', '/large.'),
    photo_url_original: baseUrl.replace('/medium.', '/original.'),
    attribution: photo.attribution,
    faves_count: obs.faves_count ?? 0,
    taxon: {
      id: obs.taxon.id,
      species: obs.taxon.name,
      common_name: obs.taxon.preferred_common_name,
    },
    inat_url: obs.uri,
  };
}

/**
 * Transforms a local pool observation into the candidate shape.
 * Adds `fromPool: true` so downstream code knows the source.
 */
function mapPoolObservation(obs) {
  const baseUrl = obs.photo_url; // already /medium
  return {
    id: obs.id,
    photo_url: baseUrl,
    photo_url_large: baseUrl.replace('/medium.', '/large.'),
    photo_url_original: baseUrl.replace('/medium.', '/original.'),
    attribution: obs.attribution,
    faves_count: obs.num_agreements ?? 0,
    taxon: {
      id: obs.taxon.id,
      species: obs.taxon.species,
      common_name: obs.taxon.common_name,
    },
    inat_url: obs.inat_url,
    fromPool: true,
  };
}

/**
 * Reads and parses the local observation pool (observations.json).
 * Cached in-process so repeated calls in the same run don't re-read disk.
 */
let _poolCache = null;
function readPool() {
  if (!_poolCache) {
    _poolCache = JSON.parse(readFileSync(OBS_FILE, 'utf-8'));
  }
  return _poolCache;
}

/**
 * Collects the set of allowed order names for a subreddit's taxa.
 * Returns null if any taxon maps to null (meaning "accept all").
 */
function allowedOrders(sub) {
  const orders = new Set();
  for (const t of sub.taxa) {
    const mapped = ORDER_MAP[t.taxon_id];
    if (mapped === null || mapped === undefined) return null; // accept everything
    mapped.forEach((o) => orders.add(o));
  }
  return orders;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Fetches gallery candidates from the iNaturalist API.
 *
 * For each taxon configured on the subreddit, queries iNat for top-voted
 * research-grade observations with CC-licensed photos.
 *
 * @param {string} subId        Key into SUBREDDITS (e.g. 'spiders')
 * @param {Set<number>} [postedIds]  Observation IDs already posted
 * @returns {Promise<object[]>}  Array of candidate objects
 */
export async function fetchGalleryCandidates(subId, postedIds = new Set()) {
  const sub = SUBREDDITS[subId];
  if (!sub) throw new Error(`Unknown subreddit key: ${subId}`);

  const candidates = [];

  for (let i = 0; i < sub.taxa.length; i++) {
    const taxon = sub.taxa[i];

    // Rate limit: sleep between calls (skip before the first one)
    if (i > 0) await sleep(1100);

    console.log(`  Fetching ${taxon.name} (taxon ${taxon.taxon_id})...`);

    const results = await fetchInatPage({
      taxon_id: taxon.taxon_id,
      quality_grade: 'research',
      photo_license: 'cc-by,cc-by-sa,cc0',
      photos: 'true',
      per_page: taxon.per_page,
      order_by: 'votes',
    });

    for (const obs of results) {
      // Must have a common name
      if (!obs.taxon?.preferred_common_name) continue;
      // Must have photos
      if (!obs.photos?.length) continue;
      // Skip already-posted observations
      if (postedIds.has(obs.id)) continue;
      // Exclude subtaxon if configured (e.g. moths sub excludes butterflies)
      if (taxon.excludeSubtaxon && obs.taxon.ancestor_ids?.includes(taxon.excludeSubtaxon)) continue;

      candidates.push(mapObservation(obs));
    }
  }

  return candidates;
}

/**
 * Picks standout challenge photo candidates from the local observation pool.
 *
 * Filters to taxa relevant to the subreddit (by order name), sorts by
 * num_agreements descending, and returns the top `count`.
 *
 * @param {string} subId        Key into SUBREDDITS
 * @param {Set<number>} [postedIds]  Observation IDs already posted
 * @param {number} [count=5]    How many candidates to return
 * @returns {object[]}          Array of candidate objects with fromPool: true
 */
export function pickChallengeCandidates(subId, postedIds = new Set(), count = 5) {
  const sub = SUBREDDITS[subId];
  if (!sub) throw new Error(`Unknown subreddit key: ${subId}`);

  const pool = readPool();
  const orders = allowedOrders(sub);

  const filtered = pool.filter((obs) => {
    if (postedIds.has(obs.id)) return false;
    if (!obs.taxon?.common_name) return false;
    if (!obs.photo_url) return false;
    // If orders is null, accept all; otherwise filter by order
    if (orders !== null && !orders.has(obs.taxon.order)) return false;
    return true;
  });

  // Sort by community agreement (best first)
  filtered.sort((a, b) => (b.num_agreements ?? 0) - (a.num_agreements ?? 0));

  return filtered.slice(0, count).map(mapPoolObservation);
}

/**
 * Scans the observation pool for gallery supplement candidates.
 *
 * Similar to challenge picking but without order filtering — returns the
 * top observations by agreement count regardless of taxon.
 *
 * @param {string} subId        Key into SUBREDDITS
 * @param {Set<number>} [postedIds]  Observation IDs already posted
 * @param {number} [limit=15]   How many candidates to return
 * @returns {object[]}          Array of candidate objects with fromPool: true
 */
export function scanExistingPool(subId, postedIds = new Set(), limit = 15) {
  const sub = SUBREDDITS[subId];
  if (!sub) throw new Error(`Unknown subreddit key: ${subId}`);

  const pool = readPool();

  const filtered = pool.filter((obs) => {
    if (postedIds.has(obs.id)) return false;
    if (!obs.taxon?.common_name) return false;
    if (!obs.photo_url) return false;
    return true;
  });

  filtered.sort((a, b) => (b.num_agreements ?? 0) - (a.num_agreements ?? 0));

  return filtered.slice(0, limit).map(mapPoolObservation);
}
