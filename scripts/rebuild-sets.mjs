#!/usr/bin/env node

/**
 * Rebuild sets.json from existing observations.json + blocklist.json
 * without re-fetching data from iNaturalist.
 *
 * Usage: node scripts/rebuild-sets.mjs
 *
 * This is useful after updating blocklist.json from the review tool —
 * it regenerates all game sets with blocked observations excluded.
 */

import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'public', 'data');

// These must match fetch-data.mjs — duplicated here to avoid coupling
const TINY_TERRORS_TAXA = [
  81769, 52134, 51672, 53667, 70144, 61860, 83204, 47336,
  48301, 47793, 81951, 52747, 49556, 47735, 47742, 52381,
  67742, 84718, 52884, 47370, 48894, 48736,
];

const ICK_ORDERS = new Set([
  'Ixodida', 'Blattodea', 'Scolopendromorpha', 'Dermaptera',
  'Siphonaptera', 'Zygentoma',
]);
const ICK_CLASSES = new Set(['Chilopoda', 'Diplopoda']);
const ICK_FAMILIES = new Set([
  'Culicidae', 'Cimicidae', 'Aphididae', 'Dermestidae',
]);
function isIcky(obs) {
  const t = obs.taxon;
  return ICK_ORDERS.has(t.order) || ICK_CLASSES.has(t.class) || ICK_FAMILIES.has(t.family);
}

function loadJSON(path) {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function main() {
  console.log('=== Rebuild Sets ===\n');

  const observations = loadJSON(join(DATA_DIR, 'observations.json'));
  const taxonomy = loadJSON(join(DATA_DIR, 'taxonomy.json'));
  console.log(`Loaded ${observations.length} observations`);

  // Build taxa map from taxonomy.json (taxon_id -> { observations_count, ... })
  const taxa = new Map();
  for (const [, entries] of Object.entries(taxonomy)) {
    if (typeof entries !== 'object') continue;
    for (const [, taxon] of Object.entries(entries)) {
      if (taxon.id) taxa.set(taxon.id, taxon);
    }
  }

  // Load blocklist
  const blocklistPath = join(DATA_DIR, 'blocklist.json');
  let blockedIds = new Set();
  if (existsSync(blocklistPath)) {
    const blocklist = loadJSON(blocklistPath);
    blockedIds = new Set(blocklist.map(b => b.observation_id));
    console.log(`Blocklist: ${blockedIds.size} observations excluded`);
  }

  // Helpers
  const indicesWhere = (fn) => observations
    .map((obs, i) => fn(obs) ? i : -1)
    .filter(i => i !== -1 && !blockedIds.has(observations[i].id));

  const mainPool = observations
    .map((obs, i) => ({ obs, i }))
    .filter(({ obs }) => !isIcky(obs) && obs.taxon.order !== 'Isopoda')
    .filter(({ obs }) => !blockedIds.has(obs.id))
    .map(({ i }) => i);

  const sets = {};

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

  // Backyard Basics
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

  // Eye Candy: cap icky taxa so the set stays beautiful
  const EYE_CANDY_ORDER_CAPS = { 'Araneae': 4, 'Scorpiones': 3 };
  const EYE_CANDY_FAMILY_CAPS = { 'Formicidae': 2, 'Acrididae': 3 };
  const featuredIndices = indicesWhere(o => o.featured === true);
  const ecOrderCounts = {};
  const ecFamilyCounts = {};
  const eyeCandyIds = [];
  for (const i of featuredIndices) {
    const obs = observations[i];
    const order = obs.taxon.order;
    const family = obs.taxon.family;
    if (EYE_CANDY_FAMILY_CAPS[family] !== undefined) {
      ecFamilyCounts[family] = (ecFamilyCounts[family] || 0) + 1;
      if (ecFamilyCounts[family] > EYE_CANDY_FAMILY_CAPS[family]) continue;
    }
    if (EYE_CANDY_ORDER_CAPS[order] !== undefined) {
      ecOrderCounts[order] = (ecOrderCounts[order] || 0) + 1;
      if (ecOrderCounts[order] > EYE_CANDY_ORDER_CAPS[order]) continue;
    }
    eyeCandyIds.push(i);
  }
  sets.eye_candy = {
    name: 'Eye Candy',
    description: "The most beautiful bug photos on iNaturalist.",
    difficulty: 'themed',
    scoring: 'taxonomic',
    observation_ids: eyeCandyIds,
  };

  // Tiny Terrors: match by taxonomy names since observations.json lacks ancestor_ids.
  // These correspond to the TINY_TERRORS_TAXA IDs in fetch-data.mjs.
  const TERROR_ORDERS = new Set([
    'Blattodea', 'Ixodida', 'Siphonaptera', 'Zygentoma',
    'Dermaptera', 'Isopoda', 'Scorpiones',
  ]);
  const TERROR_FAMILIES = new Set([
    'Culicidae', 'Cimicidae', 'Muscidae', 'Calliphoridae', 'Formicidae',
    'Dermestidae', 'Vespidae', 'Pentatomidae', 'Aphididae', 'Drosophilidae',
    'Gryllidae', 'Curculionidae',
  ]);
  const TERROR_CLASSES = new Set(['Chilopoda', 'Diplopoda']);
  const TERROR_GENERA = new Set(['Latrodectus']);

  sets.tiny_terrors = {
    name: 'Tiny Terrors',
    description: "Bugs you find at home — roaches, ticks, bed bugs, and more.",
    difficulty: 'themed',
    scoring: 'taxonomic',
    observation_ids: indicesWhere(o => {
      const t = o.taxon;
      return TERROR_ORDERS.has(t.order) ||
        TERROR_FAMILIES.has(t.family) ||
        TERROR_CLASSES.has(t.class) ||
        TERROR_GENERA.has(t.genus);
    }),
  };

  // Game mode variants
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

  for (const [key, set] of Object.entries(sets)) {
    console.log(`  ${set.name}: ${set.observation_ids.length} observations`);
  }

  writeFileSync(join(DATA_DIR, 'sets.json'), JSON.stringify(sets, null, 2));
  console.log(`\nWritten sets.json (${Object.keys(sets).length} sets)`);
}

main();
