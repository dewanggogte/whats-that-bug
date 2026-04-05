#!/usr/bin/env node

/**
 * fetch-daily-candidates.mjs — Curate a pool of high-quality macro insect
 * photos from iNaturalist for the daily challenge.
 *
 * Queries the most-favorited insect observations (community favorites tend to
 * be stunning close-ups), filters for:
 *   - CC BY license
 *   - Research grade
 *   - High original resolution (≥ 1200px short side)
 *   - Square-ish aspect ratio (0.6–1.6, suggesting close-up framing)
 *   - Species-rank identification with ≥ 3 agreements
 *
 * Outputs public/data/daily/candidates.json — the pool that generate-daily.mjs
 * selects from. Run this once, or periodically to refresh the pool.
 *
 * Usage:
 *   node scripts/fetch-daily-candidates.mjs                # default: 200 candidates
 *   node scripts/fetch-daily-candidates.mjs --target 300   # custom target
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'public', 'data');
const DAILY_DIR = join(DATA_DIR, 'daily');
const OUTPUT_FILE = join(DAILY_DIR, 'candidates.json');
const CACHE_DIR = join(ROOT, '.cache');
const TAXA_CACHE = join(CACHE_DIR, 'taxa.json');

const API_BASE = 'https://api.inaturalist.org/v1';
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// Minimum short-side resolution for the original photo.
const MIN_SHORT_SIDE = 1200;

// Aspect ratio range — photos outside this are likely habitat/landscape shots.
// Close-up/macro photos tend to be roughly square or mildly rectangular.
const MIN_ASPECT = 0.6;
const MAX_ASPECT = 1.6;

// Taxon IDs to query. We query broad groups separately to ensure taxonomic diversity.
const TAXON_GROUPS = [
  { name: 'Insects', taxon_id: 47158, pages: 15 },    // Insecta
  { name: 'Arachnids', taxon_id: 47119, pages: 4 },   // Arachnida (spiders, scorpions)
];

// Orders we want represented. We'll ensure minimum coverage.
const DESIRED_ORDERS = [
  'Coleoptera', 'Lepidoptera', 'Hymenoptera', 'Diptera', 'Odonata',
  'Hemiptera', 'Orthoptera', 'Mantodea', 'Araneae', 'Scorpiones',
  'Blattodea', 'Dermaptera', 'Neuroptera', 'Phasmida',
];

// Bugs 101 name mapping (same as generate-daily.mjs / game-ui.js)
const BEE_FAMILIES = ['Apidae', 'Megachilidae', 'Halictidae', 'Andrenidae', 'Colletidae'];
const ANT_FAMILIES = ['Formicidae', 'Mutillidae'];
const BUTTERFLY_FAMILIES = ['Nymphalidae', 'Papilionidae', 'Pieridae', 'Lycaenidae', 'Riodinidae', 'Hesperiidae'];
const CRICKET_FAMILIES = ['Gryllidae', 'Rhaphidophoridae', 'Anostostomatidae', 'Tettigoniidae'];
const DAMSELFLY_FAMILIES = ['Coenagrionidae', 'Calopterygidae', 'Lestidae', 'Platycnemididae', 'Platystictidae'];
const CICADA_FAMILIES = ['Cicadidae'];
const STINK_BUG_FAMILIES = ['Pentatomidae', 'Scutelleridae', 'Acanthosomatidae', 'Cydnidae', 'Tessaratomidae'];
const PLANTHOPPER_FAMILIES = ['Fulgoridae', 'Flatidae', 'Membracidae', 'Ischnorhinidae'];
const APHID_FAMILIES = ['Aphididae', 'Eriococcidae'];
const WATER_BUG_FAMILIES = ['Nepidae', 'Notonectidae', 'Belostomatidae'];
const ORDER_NAMES = {
  'Coleoptera': 'Beetle', 'Ixodida': 'Tick', 'Araneae': 'Spider',
  'Scorpiones': 'Scorpion', 'Opiliones': 'Harvestman', 'Mantodea': 'Mantis',
  'Diptera': 'Fly', 'Phasmida': 'Stick Insect', 'Neuroptera': 'Lacewing',
  'Blattodea': 'Cockroach', 'Dermaptera': 'Earwig', 'Ephemeroptera': 'Mayfly',
  'Trichoptera': 'Caddisfly',
};

function getBugs101Name(taxon) {
  if (taxon.order === 'Hymenoptera') {
    if (BEE_FAMILIES.includes(taxon.family)) return 'Bee';
    if (ANT_FAMILIES.includes(taxon.family)) return 'Ant';
    return 'Wasp';
  }
  if (taxon.order === 'Lepidoptera') {
    return BUTTERFLY_FAMILIES.includes(taxon.family) ? 'Butterfly' : 'Moth';
  }
  if (taxon.order === 'Orthoptera') {
    return CRICKET_FAMILIES.includes(taxon.family) ? 'Cricket' : 'Grasshopper';
  }
  if (taxon.order === 'Odonata') {
    return DAMSELFLY_FAMILIES.includes(taxon.family) ? 'Damselfly' : 'Dragonfly';
  }
  if (taxon.order === 'Hemiptera') {
    if (CICADA_FAMILIES.includes(taxon.family)) return 'Cicada';
    if (STINK_BUG_FAMILIES.includes(taxon.family)) return 'Stink Bug';
    if (PLANTHOPPER_FAMILIES.includes(taxon.family)) return 'Planthopper';
    if (APHID_FAMILIES.includes(taxon.family)) return 'Aphid';
    if (WATER_BUG_FAMILIES.includes(taxon.family)) return 'Water Bug';
    return 'True Bug';
  }
  return ORDER_NAMES[taxon.order] || taxon.order_common || taxon.order;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function apiFetch(endpoint, params = {}) {
  const url = new URL(`${API_BASE}${endpoint}`);
  for (const [key, val] of Object.entries(params)) {
    url.searchParams.set(key, String(val));
  }
  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'WhatsThatBugGame/1.0 (educational project)' },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${url.toString()}`);
  return res.json();
}

/**
 * Fetch taxonomy details (genus, family, order) for a batch of taxon IDs.
 * Uses a local cache to avoid redundant API calls.
 */
async function fetchTaxonomy(taxonIds) {
  mkdirSync(CACHE_DIR, { recursive: true });
  let cache = {};
  if (existsSync(TAXA_CACHE)) {
    try { cache = JSON.parse(readFileSync(TAXA_CACHE, 'utf-8')); } catch {}
  }

  const uncached = taxonIds.filter(id => !cache[id]);
  if (uncached.length > 0) {
    console.log(`  Fetching taxonomy for ${uncached.length} uncached taxa...`);
    for (let i = 0; i < uncached.length; i += 30) {
      const batch = uncached.slice(i, i + 30);
      try {
        const data = await apiFetch('/taxa/' + batch.join(','));
        for (const taxon of data.results || []) {
          const ancestors = taxon.ancestors || [];
          const orderAnc = ancestors.find(a => a.rank === 'order');
          const familyAnc = ancestors.find(a => a.rank === 'family');
          const genusAnc = ancestors.find(a => a.rank === 'genus');
          cache[taxon.id] = {
            id: taxon.id,
            species: taxon.name,
            common_name: taxon.preferred_common_name || '',
            genus: genusAnc?.name || taxon.name.split(' ')[0] || '',
            family: familyAnc?.name || '',
            order: orderAnc?.name || '',
            genus_common: genusAnc?.preferred_common_name || '',
            family_common: familyAnc?.preferred_common_name || '',
            order_common: orderAnc?.preferred_common_name || '',
            wikipedia_summary: taxon.wikipedia_summary
              ? taxon.wikipedia_summary.replace(/<[^>]+>/g, '').slice(0, 150)
              : '',
          };
        }
      } catch (err) {
        console.warn(`    Taxonomy batch error: ${err.message}`);
      }
      await sleep(1100);
    }
    writeFileSync(TAXA_CACHE, JSON.stringify(cache, null, 2));
  }

  return cache;
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  let target = 200;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--target' && args[i + 1]) {
      target = parseInt(args[i + 1], 10);
    }
  }

  console.log('=== What\'s That Bug — Daily Challenge Candidate Curator ===\n');
  console.log(`Target: ${target} high-quality macro candidates\n`);

  mkdirSync(DAILY_DIR, { recursive: true });

  // Load existing candidates to avoid re-fetching
  let existing = [];
  if (existsSync(OUTPUT_FILE)) {
    try { existing = JSON.parse(readFileSync(OUTPUT_FILE, 'utf-8')); } catch {}
  }
  const existingIds = new Set(existing.map(c => c.id));
  console.log(`Existing candidates: ${existing.length}`);

  // Phase 1: Fetch highly-favorited observations from iNaturalist
  const rawCandidates = [];

  for (const group of TAXON_GROUPS) {
    console.log(`\nFetching ${group.name} (top-favorited, CC BY, research grade)...`);

    for (let page = 1; page <= group.pages; page++) {
      console.log(`  Page ${page}/${group.pages}...`);
      try {
        const data = await apiFetch('/observations', {
          taxon_id: group.taxon_id,
          quality_grade: 'research',
          photo_license: 'cc-by',
          photos: 'true',
          order_by: 'votes',
          per_page: 50,
          page,
        });

        if (!data.results || data.results.length === 0) {
          console.log('    No more results');
          break;
        }

        for (const obs of data.results) {
          // Skip if already in our pool
          if (existingIds.has(obs.id)) continue;

          // Must have species-level ID with agreements
          if (!obs.taxon?.name || obs.taxon.rank !== 'species') continue;
          if ((obs.num_identification_agreements || 0) < 3) continue;

          // Check photo quality
          const photo = obs.photos?.[0];
          if (!photo?.original_dimensions) continue;

          const w = photo.original_dimensions.width;
          const h = photo.original_dimensions.height;
          const minSide = Math.min(w, h);
          const aspect = w / h;

          // Resolution filter
          if (minSide < MIN_SHORT_SIDE) continue;

          // Aspect ratio filter (reject ultra-wide panoramas)
          if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) continue;

          const photoUrl = photo.url?.replace('square', 'medium');
          if (!photoUrl) continue;

          rawCandidates.push({
            id: obs.id,
            photo_url: photoUrl,
            photo_width: w,
            photo_height: h,
            attribution: photo.attribution || '(c) Unknown',
            taxon_id: obs.taxon.id,
            taxon_name: obs.taxon.name,
            common_name: obs.taxon.preferred_common_name || '',
            faves: obs.faves_count || 0,
            inat_url: obs.uri || `https://www.inaturalist.org/observations/${obs.id}`,
          });
        }

        console.log(`    Collected ${rawCandidates.length} candidates so far`);
      } catch (err) {
        console.warn(`    API error: ${err.message}`);
      }

      await sleep(1100); // respect rate limits
    }
  }

  console.log(`\nRaw candidates after filtering: ${rawCandidates.length}`);

  if (rawCandidates.length === 0) {
    console.log('No new candidates found. Pool unchanged.');
    return;
  }

  // Phase 2: Fetch full taxonomy for all candidates
  const taxonIds = [...new Set(rawCandidates.map(c => c.taxon_id))];
  console.log(`\nFetching taxonomy for ${taxonIds.length} unique taxa...`);
  const taxaCache = await fetchTaxonomy(taxonIds);

  // Phase 3: Enrich candidates with taxonomy and compute bugs101 name
  const enriched = [];
  for (const raw of rawCandidates) {
    const taxon = taxaCache[raw.taxon_id];
    if (!taxon) {
      console.warn(`  Skipping ${raw.id} — taxonomy not found for taxon ${raw.taxon_id}`);
      continue;
    }

    enriched.push({
      id: raw.id,
      photo_url: raw.photo_url,
      photo_width: raw.photo_width,
      photo_height: raw.photo_height,
      attribution: raw.attribution,
      faves: raw.faves,
      inat_url: raw.inat_url,
      taxon: {
        id: raw.taxon_id,
        species: taxon.species,
        common_name: taxon.common_name || raw.common_name,
        genus: taxon.genus,
        family: taxon.family,
        order: taxon.order,
        genus_common: taxon.genus_common,
        family_common: taxon.family_common,
        order_common: taxon.order_common,
      },
      bugs101_name: getBugs101Name(taxon),
      wikipedia_summary: taxon.wikipedia_summary || '',
    });
  }

  // Phase 4: Sort by faves (best first) and cap at target
  enriched.sort((a, b) => b.faves - a.faves);

  // Merge with existing, de-duplicate, cap at target
  const merged = [...existing];
  const mergedIds = new Set(merged.map(c => c.id));
  for (const c of enriched) {
    if (!mergedIds.has(c.id)) {
      merged.push(c);
      mergedIds.add(c.id);
    }
  }

  // Sort final pool by faves
  merged.sort((a, b) => (b.faves || 0) - (a.faves || 0));

  // Print taxonomy distribution
  const orderDist = {};
  for (const c of merged) {
    const order = c.taxon?.order || c.bugs101_name || 'Unknown';
    orderDist[order] = (orderDist[order] || 0) + 1;
  }
  console.log(`\n=== Taxonomy Distribution (${merged.length} candidates) ===`);
  for (const [order, count] of Object.entries(orderDist).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${order}: ${count}`);
  }

  // Check for under-represented orders
  const missingOrders = DESIRED_ORDERS.filter(o => !orderDist[o] || orderDist[o] < 3);
  if (missingOrders.length > 0) {
    console.log(`\n  Under-represented orders: ${missingOrders.join(', ')}`);
    console.log('  Consider running targeted fetches for these.');
  }

  // Save
  writeFileSync(OUTPUT_FILE, JSON.stringify(merged, null, 2));
  console.log(`\nSaved ${merged.length} candidates to ${OUTPUT_FILE}`);
  console.log('Top 10 by faves:');
  for (const c of merged.slice(0, 10)) {
    const name = c.taxon?.common_name || c.taxon?.species || '?';
    console.log(`  ${c.id}: ${name} (${c.taxon?.order}) — ${c.photo_width}x${c.photo_height} — ${c.faves} faves`);
  }
}

main().catch(err => {
  console.error('Pipeline failed:', err);
  process.exit(1);
});
