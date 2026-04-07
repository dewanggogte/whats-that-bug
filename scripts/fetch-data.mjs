#!/usr/bin/env node

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'public', 'data');
const CACHE_DIR = join(ROOT, '.cache');

const API_BASE = 'https://api.inaturalist.org/v1';
const INSECTA_TAXON_ID = 47158;
const ARACHNIDA_TAXON_ID = 47119;

const REGIONS = [
  { name: 'North America', place_id: 97394, target: 1800 },
  { name: 'Europe',        place_id: 97391, target: 1250 },
  { name: 'Asia',          place_id: 97395, target: 750 },
  { name: 'South America', place_id: 97389, target: 500 },
  { name: 'Oceania',       place_id: 97392, target: 350 },
  { name: 'Africa',        place_id: 97393, target: 350 },
];

// Household and backyard pests — taxon IDs verified against iNaturalist API.
// The set filter matches any observation whose ancestor_ids include these,
// so family/order-level IDs pull in all species within that group.
const TINY_TERRORS_TAXA = [
  81769,  // Cockroaches & Termites (Blattodea, order)
  52134,  // Mosquitoes (Culicidae, family)
  51672,  // Ticks (Ixodida, order)
  53667,  // Bed Bugs (Cimicidae, family)
  70144,  // House Flies (Muscidae, family)
  61860,  // Blow Flies (Calliphoridae, family)
  83204,  // Fleas (Siphonaptera, order)
  47336,  // Ants (Formicidae, family)
  48301,  // Silverfish (Zygentoma, order)
  47793,  // Earwigs (Dermaptera, order)
  81951,  // Carpet Beetles (Dermestidae, family)
  52747,  // Wasps & Hornets (Vespidae, family)
  49556,  // Centipedes (Chilopoda, class)
  47735,  // Millipedes (Diplopoda, class)
  47742,  // Stink Bugs (Pentatomidae, family)
  52381,  // Aphids (Aphididae, family)
  67742,  // Fruit Flies (Drosophilidae, family)
  84718,  // Sowbugs & Pillbugs (Oniscidea, suborder)
  52884,  // Crickets (Gryllidae, family)
  47370,  // Widow Spiders (Latrodectus, genus)
  48894,  // Scorpions (Scorpiones, order)
  48736,  // Weevils (Curculionidae, family)
  47424,  // Tarantulas (Theraphosidae, family)
  48140,  // Brown Recluse & kin (Sicariidae, family)
  124262, // Clothes Moths (Tineidae, family)
  51225,  // Crane Flies (Tipulidae, family)
];
const TINY_TERRORS_PER_TAXON = 30;

// Order-level balancing: no single order should dominate the dataset,
// and every order should have enough observations for variety.
const MAX_ORDER_SHARE = 0.15; // default cap: 15% of total
const MIN_ORDER_SHARE = 0.03; // boost under-represented orders to at least 3%
// Per-order overrides for groups that are unpleasant in large doses
const ORDER_CAP_OVERRIDES = {
  'Lepidoptera': 0.25,       // butterflies & moths — popular, visually diverse
  'Blattodea': 0.01,         // cockroaches — visceral disgust
  'Ixodida': 0.02,           // ticks — engorged close-ups are unsettling
  'Araneae': 0.06,           // spiders — arachnophobia, but still a draw
  'Scolopendromorpha': 0.02, // centipedes — many-legged nightmares
};
const ORDER_TAXON_IDS = {
  'Lepidoptera': 47157,
  'Hymenoptera': 47201,
  'Odonata': 47792,
  'Coleoptera': 47208,
  'Hemiptera': 47744,
  'Araneae': 47118,
  'Orthoptera': 47651,
  'Diptera': 47822,
  'Mantodea': 48112,
  'Scorpiones': 48894,
  'Ixodida': 51672,
  'Isopoda': 48147,
  'Scolopendromorpha': 53763,
  'Opiliones': 47367,
  'Blattodea': 81769,
  'Dermaptera': 47793,
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Pick the best photo from an observation's photo array.
 * Prefers landscape/square aspect ratios (better for the game's 16:9 display)
 * and larger original dimensions (correlates with intentional photography).
 * Falls back to the first photo if no dimension data is available.
 */
function pickBestPhoto(photos) {
  if (photos.length === 1) return photos[0];

  let best = photos[0];
  let bestScore = -1;

  for (const photo of photos) {
    let score = 0;
    const w = photo.original_dimensions?.width || 0;
    const h = photo.original_dimensions?.height || 0;

    if (w > 0 && h > 0) {
      const ratio = w / h;
      // Landscape (ratio > 1) or square (ratio ~1) scores higher than portrait
      if (ratio >= 1) score += 2;
      else if (ratio >= 0.75) score += 1;
      // Larger photos score higher (normalized to 0-3 range)
      score += Math.min(3, (w * h) / (1000 * 1000));
    }

    if (score > bestScore) {
      bestScore = score;
      best = photo;
    }
  }

  return best;
}

async function apiFetch(endpoint, params = {}) {
  const url = new URL(`${API_BASE}${endpoint}`);
  for (const [key, val] of Object.entries(params)) {
    url.searchParams.set(key, val);
  }
  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'WhatsThatBugGame/1.0 (educational project)' },
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${url.toString()}`);
  return res.json();
}

async function fetchObservations(taxonId, placeId, count) {
  const observations = [];
  let fetched = 0;
  let page = 1;
  const maxPages = Math.max(10, Math.ceil(count / 10)); // safety: stop after N pages with diminishing returns

  while (fetched < count && page <= maxPages) {
    const perPage = Math.min(200, count - fetched);
    console.log(`  Fetching page ${page} (${fetched}/${count})...`);
    try {
      const params = {
        taxon_id: taxonId,
        quality_grade: 'research',
        photo_license: 'cc-by',
        photos: 'true',
        per_page: perPage,
        page: page,
        order_by: 'random',
      };
      if (placeId) params.place_id = placeId;
      const data = await apiFetch('/observations', params);
      if (!data.results || data.results.length === 0) break;
      for (const obs of data.results) {
        if (!obs.taxon?.preferred_common_name) continue;
        if (!obs.taxon?.rank || obs.taxon.rank !== 'species') continue;
        if ((obs.num_identification_agreements || 0) < 3) continue;
        if (!obs.photos?.[0]) continue;
        // Pick the best photo: prefer landscape/square, larger dimensions
        const photo = pickBestPhoto(obs.photos);
        const photoUrl = photo.url?.replace('square', 'medium');
        if (!photoUrl) continue;
        observations.push({
          id: obs.id,
          photo_url: photoUrl,
          attribution: photo.attribution || '(c) Unknown',
          taxon: {
            id: obs.taxon.id,
            species: obs.taxon.name,
            common_name: obs.taxon.preferred_common_name,
            ancestor_ids: obs.taxon.ancestor_ids || [],
          },
          location: obs.place_guess || 'Unknown location',
          observed_on: obs.observed_on || '',
          inat_url: obs.uri || `https://www.inaturalist.org/observations/${obs.id}`,
          num_agreements: obs.num_identification_agreements || 0,
        });
        fetched++;
        if (fetched >= count) break;
      }
    } catch (err) {
      console.warn(`  Warning: API error on page ${page}: ${err.message}`);
      break;
    }
    page++;
    await sleep(1100);
  }
  return observations;
}

async function fetchTaxonomy(taxonIds) {
  mkdirSync(CACHE_DIR, { recursive: true });
  const cacheFile = join(CACHE_DIR, 'taxa.json');
  let cache = {};
  if (existsSync(cacheFile)) {
    try { cache = JSON.parse(readFileSync(cacheFile, 'utf-8')); } catch {}
  }
  const taxa = new Map();
  const uncached = taxonIds.filter(id => !cache[id]);
  console.log(`Fetching taxonomy: ${taxonIds.length} taxa (${uncached.length} uncached)...`);
  for (let i = 0; i < uncached.length; i += 30) {
    const batch = uncached.slice(i, i + 30);
    console.log(`  Taxonomy batch ${Math.floor(i / 30) + 1}/${Math.ceil(uncached.length / 30)}...`);
    try {
      const data = await apiFetch('/taxa/' + batch.join(','));
      for (const taxon of data.results || []) {
        const record = {
          id: taxon.id,
          name: taxon.name,
          common_name: taxon.preferred_common_name || '',
          rank: taxon.rank,
          ancestor_ids: taxon.ancestor_ids || [],
          ancestors: (taxon.ancestors || []).map(a => ({
            id: a.id, name: a.name, rank: a.rank,
            common_name: a.preferred_common_name || '',
          })),
          wikipedia_summary: taxon.wikipedia_summary
            ? taxon.wikipedia_summary.replace(/<[^>]+>/g, '').slice(0, 150)
            : '',
          observations_count: taxon.observations_count || 0,
        };
        cache[taxon.id] = record;
      }
    } catch (err) {
      console.warn(`  Warning: taxonomy batch error: ${err.message}`);
    }
    await sleep(1100);
  }
  writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
  for (const id of taxonIds) {
    if (cache[id]) taxa.set(id, cache[id]);
  }
  return taxa;
}

function enrichObservations(observations, taxa) {
  return observations.map(obs => {
    const taxon = taxa.get(obs.taxon.id);
    if (!taxon) return null;
    const ancestors = taxon.ancestors || [];
    const findRank = (rank) => ancestors.find(a => a.rank === rank);
    const genus = findRank('genus');
    const family = findRank('family');
    const order = findRank('order');
    const cls = findRank('class');
    if (!order) return null;
    return {
      ...obs,
      taxon: {
        ...obs.taxon,
        genus: genus?.name || '',
        family: family?.name || '',
        order: order?.name || '',
        class: cls?.name || 'Insecta',
        genus_common: genus?.common_name || '',
        family_common: family?.common_name || '',
        order_common: order?.common_name || '',
      },
      wikipedia_summary: taxon.wikipedia_summary || '',
    };
  }).filter(Boolean);
}

function buildTaxonomyIndex(observations) {
  const index = { order: {}, family: {}, genus: {} };
  observations.forEach((obs, i) => {
    const { order, family, genus } = obs.taxon;
    if (order) (index.order[order] ??= []).push(i);
    if (family) (index.family[family] ??= []).push(i);
    if (genus) (index.genus[genus] ??= []).push(i);
  });
  return index;
}

/**
 * Balance observations so no single order dominates and all orders
 * have enough representation for interesting gameplay.
 * Returns: { balanced, boostList } where boostList has orders needing more.
 */
function balanceByOrder(observations) {
  console.log('\nBalancing observations by order...');

  // Group by order
  const byOrder = new Map();
  for (const obs of observations) {
    const order = obs.taxon.order;
    if (!byOrder.has(order)) byOrder.set(order, []);
    byOrder.get(order).push(obs);
  }

  const total = observations.length;
  const defaultMax = Math.floor(total * MAX_ORDER_SHARE);

  // Cap over-represented orders by random sampling
  const balanced = [];
  for (const [order, orderObs] of byOrder) {
    const cap = ORDER_CAP_OVERRIDES[order]
      ? Math.floor(total * ORDER_CAP_OVERRIDES[order])
      : defaultMax;
    if (orderObs.length > cap) {
      // Shuffle and take maxPerOrder
      for (let i = orderObs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [orderObs[i], orderObs[j]] = [orderObs[j], orderObs[i]];
      }
      balanced.push(...orderObs.slice(0, cap));
      console.log(`  Capped ${order}: ${orderObs.length} → ${cap}${ORDER_CAP_OVERRIDES[order] ? ` (override ${(ORDER_CAP_OVERRIDES[order]*100)}%)` : ''}`);
    } else {
      balanced.push(...orderObs);
    }
  }

  // Calculate min threshold based on new total
  const newTotal = balanced.length;
  const minPerOrder = Math.ceil(newTotal * MIN_ORDER_SHARE);

  // Find under-represented orders
  const newCounts = new Map();
  for (const obs of balanced) {
    const order = obs.taxon.order;
    newCounts.set(order, (newCounts.get(order) || 0) + 1);
  }

  const boostList = [];
  for (const [order, count] of newCounts) {
    if (count < minPerOrder) {
      const taxonId = ORDER_TAXON_IDS[order];
      if (taxonId) {
        const needed = minPerOrder - count;
        boostList.push({ order, taxonId, needed });
        console.log(`  Boost ${order}: have ${count}, need ${needed} more (target ${minPerOrder})`);
      } else {
        console.warn(`  Warning: no taxon ID mapped for ${order}, skipping boost`);
      }
    }
  }

  console.log(`  Balanced total: ${newTotal} (was ${total})`);
  return { balanced, boostList };
}

function validateDistractors(observations, index) {
  const valid = [];
  let dropped = 0;
  for (const obs of observations) {
    const orderPeers = index.order[obs.taxon.order] || [];
    const otherSpecies = new Set();
    for (const idx of orderPeers) {
      const peer = observations[idx];
      if (peer.taxon.species !== obs.taxon.species) {
        otherSpecies.add(peer.taxon.species);
      }
    }
    if (otherSpecies.size >= 3) {
      valid.push(obs);
    } else {
      dropped++;
    }
  }
  console.log(`Distractor validation: ${valid.length} valid, ${dropped} dropped`);
  return valid;
}

function buildSets(observations, taxa) {
  const sets = {};

  // Load blocklist — individual observations flagged for removal via review
  const blocklistPath = join(DATA_DIR, 'blocklist.json');
  let blockedIds = new Set();
  if (existsSync(blocklistPath)) {
    try {
      const blocklist = JSON.parse(readFileSync(blocklistPath, 'utf-8'));
      blockedIds = new Set(blocklist.map(b => b.observation_id));
      if (blockedIds.size > 0) {
        console.log(`  Blocklist: ${blockedIds.size} observations excluded`);
      }
    } catch (e) {
      console.warn(`  Warning: could not read blocklist.json: ${e.message}`);
    }
  }

  const indicesWhere = (fn) => observations
    .map((obs, i) => fn(obs) ? i : -1)
    .filter(i => i !== -1 && !blockedIds.has(observations[i].id));

  // Exclude ick-inducing orders (keep scorpions — they're cool)
  const EXCLUDED_ORDERS = new Set([
    'Ixodida',            // Ticks
    'Blattodea',          // Cockroaches
    'Scolopendromorpha',  // Centipedes
    'Dermaptera',         // Earwigs
  ]);
  const mainPool = observations
    .map((obs, i) => ({ obs, i }))
    .filter(({ obs }) => !EXCLUDED_ORDERS.has(obs.taxon.order))
    .filter(({ obs }) => !blockedIds.has(obs.id))
    .map(({ i }) => i);

  sets.bugs_101 = {
    name: 'Bugs 101',
    description: "Identify bugs by type — beetle, spider, butterfly, and more.",
    difficulty: 'beginner',
    scoring: 'binary',
    observation_ids: mainPool,
  };

  sets.all_bugs = {
    name: 'All Bugs',
    description: "Name the exact species. Partial credit for close guesses.",
    difficulty: 'expert',
    scoring: 'taxonomic',
    observation_ids: mainPool,
  };

  // Top ~100 most common species, with up to 3 observations each for photo variety
  const BACKYARD_SPECIES_COUNT = 100;
  const BACKYARD_OBS_PER_SPECIES = 3;
  const withCounts = observations
    .map((obs, i) => ({
      index: i,
      species: obs.taxon.species,
      count: taxa.get(obs.taxon.id)?.observations_count || 0,
      blocked: blockedIds.has(obs.id),
    }))
    .filter(e => !e.blocked);
  withCounts.sort((a, b) => b.count - a.count);
  const backyardSpeciesSeen = new Set();
  const backyardTopSpecies = [];
  for (const entry of withCounts) {
    if (backyardSpeciesSeen.has(entry.species)) continue;
    backyardSpeciesSeen.add(entry.species);
    backyardTopSpecies.push(entry.species);
    if (backyardTopSpecies.length >= BACKYARD_SPECIES_COUNT) break;
  }
  const backyardSpeciesSet = new Set(backyardTopSpecies);
  const backyardPerSpecies = new Map();
  for (const entry of withCounts) {
    if (!backyardSpeciesSet.has(entry.species)) continue;
    const arr = backyardPerSpecies.get(entry.species) || [];
    if (arr.length >= BACKYARD_OBS_PER_SPECIES) continue;
    arr.push(entry.index);
    backyardPerSpecies.set(entry.species, arr);
  }
  sets.backyard_basics = {
    name: 'Backyard Basics',
    description: "The 100 most common species. A good step up from Bugs 101.",
    difficulty: 'intermediate',
    scoring: 'taxonomic',
    observation_ids: [...backyardPerSpecies.values()].flat(),
  };

  sets.beetles = {
    name: 'Beetles',
    description: "All Coleoptera — tell a ladybug from a longhorn.",
    difficulty: 'themed',
    scoring: 'taxonomic',
    observation_ids: indicesWhere(o => o.taxon.order === 'Coleoptera'),
  };

  sets.butterflies_moths = {
    name: 'Butterflies & Moths',
    description: "All Lepidoptera — moths, skippers, and swallowtails.",
    difficulty: 'themed',
    scoring: 'taxonomic',
    observation_ids: indicesWhere(o => o.taxon.order === 'Lepidoptera'),
  };

  sets.spiders = {
    name: 'Spiders & Friends',
    description: "All Arachnida — spiders, scorpions, and their relatives.",
    difficulty: 'themed',
    scoring: 'taxonomic',
    observation_ids: indicesWhere(o => o.taxon.class === 'Arachnida'),
  };

  const terrorTaxonIds = new Set(TINY_TERRORS_TAXA);
  sets.tiny_terrors = {
    name: 'Tiny Terrors',
    description: "Bugs you find at home — roaches, ticks, bed bugs, and more.",
    difficulty: 'themed',
    scoring: 'taxonomic',
    observation_ids: indicesWhere(o => {
      return terrorTaxonIds.has(o.taxon.id) ||
        (o.taxon.ancestor_ids || []).some(id => terrorTaxonIds.has(id));
    }),
  };

  for (const [key, set] of Object.entries(sets)) {
    console.log(`  Set "${set.name}": ${set.observation_ids.length} observations`);
  }
  return sets;
}

async function main() {
  mkdirSync(DATA_DIR, { recursive: true });
  console.log('=== What\'s That Bug — Data Pipeline ===\n');

  let allObservations = [];
  for (const region of REGIONS) {
    console.log(`\nFetching ${region.name} (target: ${region.target})...`);
    const insectTarget = Math.round(region.target * 0.9);
    const insects = await fetchObservations(INSECTA_TAXON_ID, region.place_id, insectTarget);
    console.log(`  Got ${insects.length} insect observations`);
    const arachnidTarget = Math.round(region.target * 0.1);
    const arachnids = await fetchObservations(ARACHNIDA_TAXON_ID, region.place_id, arachnidTarget);
    console.log(`  Got ${arachnids.length} arachnid observations`);
    allObservations = allObservations.concat(insects, arachnids);
  }

  // Targeted fetch for household pest taxa — many don't appear in random
  // Insecta/Arachnida sampling (e.g. cockroaches, bed bugs, centipedes).
  // Fetches globally (no region filter) to maximise variety.
  console.log(`\nFetching targeted pest observations (${TINY_TERRORS_TAXA.length} taxa)...`);
  for (const taxonId of TINY_TERRORS_TAXA) {
    const pestObs = await fetchObservations(taxonId, null, TINY_TERRORS_PER_TAXON);
    console.log(`  Taxon ${taxonId}: got ${pestObs.length} observations`);
    allObservations = allObservations.concat(pestObs);
  }

  const seen = new Set();
  allObservations = allObservations.filter(obs => {
    if (seen.has(obs.id)) return false;
    seen.add(obs.id);
    return true;
  });
  console.log(`\nTotal unique observations: ${allObservations.length}`);

  const taxonIds = [...new Set(allObservations.map(o => o.taxon.id))];
  const taxa = await fetchTaxonomy(taxonIds);
  console.log(`Fetched taxonomy for ${taxa.size} taxa`);

  let enriched = enrichObservations(allObservations, taxa);
  console.log(`Enriched observations: ${enriched.length}`);

  // Balance: cap over-represented orders, boost under-represented ones
  const { balanced, boostList } = balanceByOrder(enriched);

  if (boostList.length > 0) {
    console.log(`\nFetching boost observations for ${boostList.length} under-represented orders...`);
    let boostObs = [];
    for (const { order, taxonId, needed } of boostList) {
      const fetched = await fetchObservations(taxonId, null, needed);
      console.log(`  ${order} (${taxonId}): got ${fetched.length}/${needed}`);
      boostObs = boostObs.concat(fetched);
    }

    // Dedup boost against existing
    const existingIds = new Set(balanced.map(o => o.id));
    boostObs = boostObs.filter(o => !existingIds.has(o.id));

    if (boostObs.length > 0) {
      // Enrich new observations
      const boostTaxonIds = [...new Set(boostObs.map(o => o.taxon.id))];
      const boostTaxa = await fetchTaxonomy(boostTaxonIds);
      for (const [id, t] of boostTaxa) taxa.set(id, t);
      const boostEnriched = enrichObservations(boostObs, taxa);
      console.log(`  Added ${boostEnriched.length} boost observations`);
      enriched = [...balanced, ...boostEnriched];
    } else {
      enriched = balanced;
    }
  } else {
    enriched = balanced;
  }

  let taxonomyIndex = buildTaxonomyIndex(enriched);
  const validated = validateDistractors(enriched, taxonomyIndex);
  const finalIndex = buildTaxonomyIndex(validated);

  console.log('\nBuilding sets...');
  const sets = buildSets(validated, taxa);

  console.log('\nWriting output files...');
  // Strip ancestor_ids from client output — only needed during build for set generation
  const clientObservations = validated.map(obs => {
    const { ancestor_ids, ...taxonRest } = obs.taxon;
    return { ...obs, taxon: taxonRest };
  });
  writeFileSync(join(DATA_DIR, 'observations.json'), JSON.stringify(clientObservations, null, 2));
  console.log(`  observations.json: ${validated.length} records`);
  writeFileSync(join(DATA_DIR, 'taxonomy.json'), JSON.stringify(finalIndex, null, 2));
  console.log(`  taxonomy.json: ${Object.keys(finalIndex.order).length} orders, ${Object.keys(finalIndex.family).length} families`);
  // Add game mode variants (Time Trial + Streaks for Bugs 101 and All Bugs)
  sets.time_trial = {
    name: 'Time Trial', description: '60 seconds. How many can you identify?',
    mode: 'time_trial', scoring: 'taxonomic', difficulty: 'expert',
    observation_ids: sets.all_bugs.observation_ids,
  };
  sets.streak = {
    name: 'Streaks', description: 'How many in a row? One wrong and it is over.',
    mode: 'streak', scoring: 'taxonomic', difficulty: 'expert',
    observation_ids: sets.all_bugs.observation_ids,
  };
  sets.bugs_101_time_trial = {
    name: 'Time Trial', description: '60 seconds. How many bug types can you identify?',
    mode: 'time_trial', scoring: 'binary', difficulty: 'beginner',
    observation_ids: sets.bugs_101.observation_ids,
  };
  sets.bugs_101_streak = {
    name: 'Streaks', description: 'How many bug types in a row? One wrong and it is over.',
    mode: 'streak', scoring: 'binary', difficulty: 'beginner',
    observation_ids: sets.bugs_101.observation_ids,
  };

  writeFileSync(join(DATA_DIR, 'sets.json'), JSON.stringify(sets, null, 2));
  console.log(`  sets.json: ${Object.keys(sets).length} sets`);
  console.log('\nDone!');
}

main().catch(err => {
  console.error('Pipeline failed:', err);
  process.exit(1);
});
