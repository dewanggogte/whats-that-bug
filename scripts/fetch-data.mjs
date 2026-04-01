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

const TINY_TERRORS_TAXA = [
  47424, 122283, 41191, 49627, 83723, 47157, 49556, 48311, 81746, 52775,
];

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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

  while (fetched < count) {
    const perPage = Math.min(200, count - fetched);
    console.log(`  Fetching page ${page} (${fetched}/${count})...`);
    try {
      const data = await apiFetch('/observations', {
        taxon_id: taxonId,
        place_id: placeId,
        quality_grade: 'research',
        photo_license: 'cc-by',
        photos: 'true',
        per_page: perPage,
        page: page,
        order_by: 'random',
      });
      if (!data.results || data.results.length === 0) break;
      for (const obs of data.results) {
        if (!obs.taxon?.preferred_common_name) continue;
        if (!obs.taxon?.rank || obs.taxon.rank !== 'species') continue;
        if ((obs.num_identification_agreements || 0) < 3) continue;
        if (!obs.photos?.[0]) continue;
        const photo = obs.photos[0];
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
  const indicesWhere = (fn) => observations
    .map((obs, i) => fn(obs) ? i : -1)
    .filter(i => i !== -1);

  const bugs101Orders = new Map();
  for (let i = 0; i < observations.length; i++) {
    const order = observations[i].taxon.order;
    if (!bugs101Orders.has(order)) bugs101Orders.set(order, i);
  }
  sets.bugs_101 = {
    name: 'Bugs 101',
    description: "Can you tell a beetle from a butterfly? Start here.",
    scoring: 'binary',
    observation_ids: [...bugs101Orders.values()],
  };

  sets.all_bugs = {
    name: 'All Bugs',
    description: "Random bugs from around the world. Full species ID.",
    scoring: 'taxonomic',
    observation_ids: observations.map((_, i) => i),
  };

  const withCounts = observations.map((obs, i) => ({
    index: i,
    count: taxa.get(obs.taxon.id)?.observations_count || 0,
  }));
  withCounts.sort((a, b) => b.count - a.count);
  sets.backyard_basics = {
    name: 'Backyard Basics',
    description: "The 200 most commonly observed species worldwide.",
    scoring: 'taxonomic',
    observation_ids: withCounts.slice(0, 200).map(w => w.index),
  };

  sets.beetles = {
    name: 'Beetles',
    description: "The most species-rich insect order. 400,000+ species exist.",
    scoring: 'taxonomic',
    observation_ids: indicesWhere(o => o.taxon.order === 'Coleoptera'),
  };

  sets.butterflies_moths = {
    name: 'Butterflies & Moths',
    description: "Lepidoptera — from tiny moths to giant swallowtails.",
    scoring: 'taxonomic',
    observation_ids: indicesWhere(o => o.taxon.order === 'Lepidoptera'),
  };

  sets.spiders = {
    name: 'Spiders & Friends',
    description: "Arachnids — spiders, scorpions, ticks, and mites.",
    scoring: 'taxonomic',
    observation_ids: indicesWhere(o => o.taxon.class === 'Arachnida'),
  };

  const terrorTaxonIds = new Set(TINY_TERRORS_TAXA);
  sets.tiny_terrors = {
    name: 'Tiny Terrors',
    description: "Household bugs people worry about. Learn what's actually in your home.",
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

  const enriched = enrichObservations(allObservations, taxa);
  console.log(`Enriched observations: ${enriched.length}`);

  let taxonomyIndex = buildTaxonomyIndex(enriched);
  const validated = validateDistractors(enriched, taxonomyIndex);
  const finalIndex = buildTaxonomyIndex(validated);

  console.log('\nBuilding sets...');
  const sets = buildSets(validated, taxa);

  console.log('\nWriting output files...');
  writeFileSync(join(DATA_DIR, 'observations.json'), JSON.stringify(validated, null, 2));
  console.log(`  observations.json: ${validated.length} records`);
  writeFileSync(join(DATA_DIR, 'taxonomy.json'), JSON.stringify(finalIndex, null, 2));
  console.log(`  taxonomy.json: ${Object.keys(finalIndex.order).length} orders, ${Object.keys(finalIndex.family).length} families`);
  writeFileSync(join(DATA_DIR, 'sets.json'), JSON.stringify(sets, null, 2));
  console.log(`  sets.json: ${Object.keys(sets).length} sets`);
  console.log('\nDone!');
}

main().catch(err => {
  console.error('Pipeline failed:', err);
  process.exit(1);
});
