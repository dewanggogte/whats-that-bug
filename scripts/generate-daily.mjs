#!/usr/bin/env node

/**
 * generate-daily.mjs — Content pipeline for daily challenge images.
 *
 * Downloads original-resolution photos from iNaturalist, checks dimensions,
 * generates progressive zoom crops with Sharp, and writes a manifest for the
 * daily challenge pages to consume at build time.
 *
 * Usage:
 *   node scripts/generate-daily.mjs                          # 7 days starting tomorrow ET
 *   node scripts/generate-daily.mjs --days 14                # 14 days
 *   node scripts/generate-daily.mjs --start-date 2026-04-10  # custom start
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'public', 'data');
const DAILY_DIR = join(DATA_DIR, 'daily');
const OBS_FILE = join(DATA_DIR, 'observations.json');
const USED_FILE = join(DAILY_DIR, 'used-observations.json');
const MANIFEST_FILE = join(DAILY_DIR, 'manifest.json');

// Challenge numbering starts at this date (day 1)
const EPOCH = '2026-04-07';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
function parseArgs() {
  const args = process.argv.slice(2);
  let days = 7;
  let startDate = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--days' && args[i + 1]) {
      days = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--start-date' && args[i + 1]) {
      startDate = args[i + 1];
      i++;
    }
  }

  if (!startDate) {
    // Default: tomorrow in US Eastern Time
    const now = new Date();
    const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    et.setDate(et.getDate() + 1);
    startDate = formatDate(et);
  }

  return { days, startDate };
}

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00Z'); // noon UTC avoids DST edge cases
  d.setUTCDate(d.getUTCDate() + n);
  return formatDate(d);
}

function dayNumber(dateStr) {
  const epoch = new Date(EPOCH + 'T00:00:00Z');
  const target = new Date(dateStr + 'T00:00:00Z');
  return Math.round((target - epoch) / (24 * 60 * 60 * 1000)) + 1;
}

// ---------------------------------------------------------------------------
// Bugs 101 display name logic (mirrored from game-ui.js)
// ---------------------------------------------------------------------------
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
    if (CRICKET_FAMILIES.includes(taxon.family)) return 'Cricket';
    return 'Grasshopper';
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
// Image download
// ---------------------------------------------------------------------------
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Download the highest-resolution version of an iNaturalist photo.
 * Tries /original. first; falls back to /large. if that 404s.
 * Returns a Buffer.
 */
async function downloadImage(photoUrl) {
  // photoUrl is the /medium. version from observations.json
  const originalUrl = photoUrl.replace('/medium.', '/original.');
  const largeUrl = photoUrl.replace('/medium.', '/large.');

  for (const url of [originalUrl, largeUrl]) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'WhatsThatBugGame/1.0 (educational project)' },
      });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        return { buffer: buf, url };
      }
    } catch {
      // try next URL
    }
  }

  throw new Error(`Failed to download image: ${photoUrl}`);
}

// ---------------------------------------------------------------------------
// Crop generation
// ---------------------------------------------------------------------------

/**
 * Generate a center crop at a given zoom percentage of the original image.
 * zoom = 0.2 means the crop covers 20% of the image area (sqrt(0.2) of each dimension).
 */
async function generateCrop(imageBuffer, zoom, outputPath, { width = 800, height = 600, quality = 85 } = {}) {
  const metadata = await sharp(imageBuffer).metadata();
  const imgW = metadata.width;
  const imgH = metadata.height;

  // sqrt(zoom) for each dimension so area is proportional to zoom
  const cropW = Math.round(imgW * Math.sqrt(zoom));
  const cropH = Math.round(imgH * Math.sqrt(zoom));

  // Center the crop
  const left = Math.round((imgW - cropW) / 2);
  const top = Math.round((imgH - cropH) / 2);

  await sharp(imageBuffer)
    .extract({ left, top, width: cropW, height: cropH })
    .resize(width, height, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality })
    .toFile(outputPath);
}

/**
 * Generate the full reveal image — resized to fit 1600x1200.
 */
async function generateReveal(imageBuffer, outputPath) {
  await sharp(imageBuffer)
    .resize(1600, 1200, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toFile(outputPath);
}

// ---------------------------------------------------------------------------
// Candidate selection
// ---------------------------------------------------------------------------

/**
 * Select a candidate observation from the pool, avoiding already-used IDs.
 * For bugs101: rotates through unique orders for variety.
 * Returns the observation object or null if exhausted.
 */
function selectCandidate(observations, usedIds, { mode = 'bugs101', orderRotation = null } = {}) {
  const available = observations.filter(o => !usedIds.has(o.id));

  if (available.length === 0) return null;

  if (mode === 'bugs101' && orderRotation) {
    // Try each order in rotation until we find an available observation
    for (let i = 0; i < orderRotation.length; i++) {
      const targetOrder = orderRotation[0];
      const match = available.find(o => o.taxon.order === targetOrder);
      if (match) {
        // Move this order to the back of the rotation
        orderRotation.push(orderRotation.shift());
        return match;
      }
      // This order exhausted, skip it
      orderRotation.shift();
    }
    // Fallback: any available observation
    return available[0];
  }

  // For allbugs: just pick randomly
  const idx = Math.floor(Math.random() * available.length);
  return available[idx];
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------
async function main() {
  const { days, startDate } = parseArgs();

  console.log('=== What\'s That Bug — Daily Content Pipeline ===\n');
  console.log(`Generating ${days} day(s) starting ${startDate}\n`);

  // Load observations
  if (!existsSync(OBS_FILE)) {
    console.error(`Error: ${OBS_FILE} not found. Run "npm run fetch-data" first.`);
    process.exit(1);
  }
  const observations = JSON.parse(readFileSync(OBS_FILE, 'utf-8'));
  console.log(`Loaded ${observations.length} observations`);

  // Load used-observations tracker
  let usedObs = { bugs101: [], allbugs: [] };
  if (existsSync(USED_FILE)) {
    try { usedObs = JSON.parse(readFileSync(USED_FILE, 'utf-8')); } catch {}
  }
  const usedBugs101Ids = new Set(usedObs.bugs101 || []);
  const usedAllbugsIds = new Set(usedObs.allbugs || []);

  // Load existing manifest
  let manifest = [];
  if (existsSync(MANIFEST_FILE)) {
    try { manifest = JSON.parse(readFileSync(MANIFEST_FILE, 'utf-8')); } catch {}
  }
  const existingDates = new Set(manifest.map(e => e.date));

  // Build order rotation for bugs101 variety — start with all unique orders
  const allOrders = [...new Set(observations.map(o => o.taxon.order))];
  // Shuffle the order list for randomness
  for (let i = allOrders.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allOrders[i], allOrders[j]] = [allOrders[j], allOrders[i]];
  }
  const orderRotation = [...allOrders];

  mkdirSync(DAILY_DIR, { recursive: true });

  for (let d = 0; d < days; d++) {
    const date = addDays(startDate, d);
    const num = dayNumber(date);

    if (existingDates.has(date)) {
      console.log(`\n[${date}] Day #${num} — already in manifest, skipping`);
      continue;
    }

    console.log(`\n[${date}] Day #${num}`);

    const dayDir = join(DAILY_DIR, date);
    mkdirSync(dayDir, { recursive: true });

    // --- Select bugs101 candidate ---
    const bugs101Obs = selectCandidate(observations, usedBugs101Ids, {
      mode: 'bugs101',
      orderRotation,
    });
    if (!bugs101Obs) {
      console.warn('  WARNING: No more unused bugs101 candidates available');
      continue;
    }

    // --- Select allbugs candidate ---
    const allbugsObs = selectCandidate(observations, usedAllbugsIds, {
      mode: 'allbugs',
    });
    if (!allbugsObs) {
      console.warn('  WARNING: No more unused allbugs candidates available');
      continue;
    }

    // --- Process bugs101 ---
    console.log(`  Bugs101: ${bugs101Obs.taxon.common_name} (${bugs101Obs.taxon.order})`);
    let bugs101Entry;
    try {
      bugs101Entry = await processObservation(bugs101Obs, dayDir, date, 'b101', {
        cropZooms: [0.20, 0.50, 0.80],
      });
      bugs101Entry.answer_order = bugs101Obs.taxon.order;
      bugs101Entry.answer_common = getBugs101Name(bugs101Obs.taxon);
    } catch (err) {
      console.error(`  ERROR processing bugs101: ${err.message}`);
      continue;
    }

    // --- Process allbugs ---
    console.log(`  AllBugs: ${allbugsObs.taxon.common_name} (${allbugsObs.taxon.species})`);
    let allbugsEntry;
    try {
      allbugsEntry = await processObservation(allbugsObs, dayDir, date, 'all', {
        cropZooms: [0.15, 0.25, 0.35, 0.50, 0.70, 0.90],
      });
      allbugsEntry.answer_species = allbugsObs.taxon.species;
      allbugsEntry.answer_common = allbugsObs.taxon.common_name;
    } catch (err) {
      console.error(`  ERROR processing allbugs: ${err.message}`);
      continue;
    }

    // Mark as used
    usedBugs101Ids.add(bugs101Obs.id);
    usedAllbugsIds.add(allbugsObs.id);

    // Add manifest entry
    manifest.push({
      date,
      number: num,
      approved: false,
      bugs101: bugs101Entry,
      allbugs: allbugsEntry,
    });

    existingDates.add(date);

    // Be polite to iNaturalist servers
    await sleep(500);
  }

  // Save manifest
  writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
  console.log(`\nManifest saved: ${manifest.length} total entries`);

  // Save used observations
  usedObs.bugs101 = [...usedBugs101Ids];
  usedObs.allbugs = [...usedAllbugsIds];
  writeFileSync(USED_FILE, JSON.stringify(usedObs, null, 2));
  console.log(`Used observations saved: ${usedObs.bugs101.length} bugs101, ${usedObs.allbugs.length} allbugs`);

  console.log('\nDone! Review manifest and set "approved: true" for entries to go live.');
}

/**
 * Download image, check dimensions, generate crops and reveal for one observation.
 * Returns a partial manifest entry (without answer fields — caller adds those).
 */
async function processObservation(obs, dayDir, date, prefix, { cropZooms }) {
  // Download original image
  const { buffer, url: downloadedUrl } = await downloadImage(obs.photo_url);
  const metadata = await sharp(buffer).metadata();
  const minDim = Math.min(metadata.width, metadata.height);

  console.log(`    Downloaded: ${metadata.width}x${metadata.height} from ${downloadedUrl.includes('/original.') ? 'original' : 'large'}`);

  if (minDim < 1500) {
    console.warn(`    WARNING: Image smaller than 1500px (${metadata.width}x${metadata.height}) — crops may look soft`);
  }

  // Generate crops
  const cropPaths = [];
  for (let i = 0; i < cropZooms.length; i++) {
    const zoom = cropZooms[i];
    const filename = `${prefix}_${i + 1}.jpg`;
    const outputPath = join(dayDir, filename);
    await generateCrop(buffer, zoom, outputPath);
    cropPaths.push(`daily/${date}/${filename}`);
    console.log(`    Crop ${i + 1}/${cropZooms.length}: ${Math.round(zoom * 100)}% zoom → ${filename}`);
  }

  // Generate reveal
  const revealFilename = `${prefix}_full.jpg`;
  const revealPath = join(dayDir, revealFilename);
  await generateReveal(buffer, revealPath);
  console.log(`    Reveal → ${revealFilename}`);

  return {
    observation_id: obs.id,
    crops: cropPaths,
    reveal: `daily/${date}/${revealFilename}`,
    attribution: obs.attribution,
    wikipedia_summary: obs.wikipedia_summary || '',
    inat_url: obs.inat_url,
  };
}

main().catch(err => {
  console.error('Pipeline failed:', err);
  process.exit(1);
});
