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
const CANDIDATES_FILE = join(DAILY_DIR, 'candidates.json');
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

// Minimum resolution for the short side of the original image.
// Below this, crops are too blurry to be useful.
const MIN_SHORT_SIDE = 1200;

/**
 * Find the "attention point" in an image using Sharp's entropy-based strategy.
 * Returns { x, y } as fractions (0-1) of the image dimensions.
 *
 * Sharp doesn't expose the attention point directly, but we can infer it:
 * resize to 1x1 with position:'attention' and compare with center-crop to
 * detect offset. For simplicity, we use a tile-based entropy approach:
 * divide the image into a grid, compute entropy per tile, and pick the
 * tile with highest entropy (most visual detail = likely the subject).
 */
async function findAttentionPoint(imageBuffer) {
  const metadata = await sharp(imageBuffer).metadata();
  const imgW = metadata.width;
  const imgH = metadata.height;

  // Divide into a 5x5 grid and compute each tile's entropy via Sharp stats
  const gridSize = 5;
  const tileW = Math.floor(imgW / gridSize);
  const tileH = Math.floor(imgH / gridSize);

  let bestEntropy = -1;
  let bestX = 0.5;
  let bestY = 0.5;

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const left = col * tileW;
      const top = row * tileH;
      try {
        const stats = await sharp(imageBuffer)
          .extract({ left, top, width: tileW, height: tileH })
          .stats();
        // Entropy proxy: sum of standard deviations across channels.
        // High std dev = lots of visual detail = likely the subject.
        const entropy = stats.channels.reduce((sum, ch) => sum + ch.stdev, 0);
        if (entropy > bestEntropy) {
          bestEntropy = entropy;
          bestX = (left + tileW / 2) / imgW;
          bestY = (top + tileH / 2) / imgH;
        }
      } catch {
        // skip tiles that fail (edge cases)
      }
    }
  }

  return { x: bestX, y: bestY };
}

/**
 * Generate a crop at a given dimension fraction, centered on the attention point.
 *
 * dimFraction is a LINEAR dimension fraction (not area):
 *   0.10 means the crop shows 10% of width × 10% of height.
 *
 * The crop is centered on (cx, cy) but clamped to stay within image bounds.
 */
async function generateCrop(imageBuffer, dimFraction, outputPath, cx, cy, { width = 800, height = 600, quality = 85 } = {}) {
  const metadata = await sharp(imageBuffer).metadata();
  const imgW = metadata.width;
  const imgH = metadata.height;

  const cropW = Math.max(Math.round(imgW * dimFraction), 64);
  const cropH = Math.max(Math.round(imgH * dimFraction), 64);

  // Center on attention point, but clamp to image bounds
  let left = Math.round(cx * imgW - cropW / 2);
  let top = Math.round(cy * imgH - cropH / 2);
  left = Math.max(0, Math.min(left, imgW - cropW));
  top = Math.max(0, Math.min(top, imgH - cropH));

  await sharp(imageBuffer)
    .extract({ left, top, width: cropW, height: cropH })
    .resize(width, height, { fit: 'cover' })
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
 * Check original photo dimensions via the iNaturalist API.
 * Returns { width, height } or null if unavailable.
 */
async function checkPhotoDimensions(observationId) {
  try {
    const url = `https://api.inaturalist.org/v1/observations/${observationId}?fields=photos.original_dimensions`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'WhatsThatBugGame/1.0 (educational project)' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const photos = data.results?.[0]?.photos;
    if (photos?.[0]?.original_dimensions) {
      return photos[0].original_dimensions;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Select a candidate observation from the pool, avoiding already-used IDs.
 * Checks image resolution via API and rejects images below MIN_SHORT_SIDE.
 * For bugs101: rotates through unique orders for variety.
 * Returns the observation object or null if exhausted.
 */
async function selectCandidate(observations, usedIds, { mode = 'bugs101', orderRotation = null } = {}) {
  const available = observations.filter(o => !usedIds.has(o.id));

  if (available.length === 0) return null;

  // Shuffle available to randomize within order constraints
  for (let i = available.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [available[i], available[j]] = [available[j], available[i]];
  }

  // Try candidates, checking resolution (from stored data or API fallback)
  const maxAttempts = 20;
  let attempts = 0;

  async function tryCandidate(obs) {
    attempts++;
    // If the candidate pool already has dimensions (from fetch-daily-candidates),
    // use those directly — no API call needed.
    let w = obs.photo_width || 0;
    let h = obs.photo_height || 0;

    if (w === 0 || h === 0) {
      // Fallback: check via API (for non-curated observations)
      const dims = await checkPhotoDimensions(obs.id);
      if (!dims) {
        console.log(`    [skip] ${obs.id} — could not check dimensions`);
        return false;
      }
      w = dims.width;
      h = dims.height;
    }

    const minSide = Math.min(w, h);
    if (minSide < MIN_SHORT_SIDE) {
      console.log(`    [skip] ${obs.id} ${obs.taxon.common_name || obs.taxon.species} — too small (${w}x${h})`);
      return false;
    }
    console.log(`    [ok]   ${obs.id} ${obs.taxon.common_name || obs.taxon.species} — ${w}x${h}`);
    return true;
  }

  if (mode === 'bugs101' && orderRotation) {
    const rotationCopy = [...orderRotation];
    for (let i = 0; i < rotationCopy.length && attempts < maxAttempts; i++) {
      const targetOrder = rotationCopy[i];
      const orderCandidates = available.filter(o => o.taxon.order === targetOrder);
      for (const candidate of orderCandidates) {
        if (attempts >= maxAttempts) break;
        await sleep(300); // rate limit API
        if (await tryCandidate(candidate)) {
          // Move this order to the back of the rotation
          const idx = orderRotation.indexOf(targetOrder);
          if (idx !== -1) {
            orderRotation.push(orderRotation.splice(idx, 1)[0]);
          }
          return candidate;
        }
      }
    }
    // Fallback: any available with good resolution
    for (const candidate of available) {
      if (attempts >= maxAttempts) break;
      await sleep(300);
      if (await tryCandidate(candidate)) return candidate;
    }
    return null;
  }

  // For allbugs: try random candidates until one passes resolution check
  for (const candidate of available) {
    if (attempts >= maxAttempts) break;
    await sleep(300);
    if (await tryCandidate(candidate)) return candidate;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------
async function main() {
  const { days, startDate } = parseArgs();

  console.log('=== What\'s That Bug — Daily Content Pipeline ===\n');
  console.log(`Generating ${days} day(s) starting ${startDate}\n`);

  // Load curated candidates pool (preferred) or fall back to general observations
  let observations;
  if (existsSync(CANDIDATES_FILE)) {
    observations = JSON.parse(readFileSync(CANDIDATES_FILE, 'utf-8'));
    console.log(`Loaded ${observations.length} curated daily candidates`);
  } else if (existsSync(OBS_FILE)) {
    observations = JSON.parse(readFileSync(OBS_FILE, 'utf-8'));
    console.log(`Loaded ${observations.length} observations (no curated pool found — run fetch-daily-candidates.mjs first for best results)`);
  } else {
    console.error(`Error: No data found. Run "npm run fetch-daily-candidates" or "npm run fetch-data" first.`);
    process.exit(1);
  }

  // Load used-observations tracker
  let usedObs = { bugs101: [], allbugs: [] };
  if (existsSync(USED_FILE)) {
    try { usedObs = JSON.parse(readFileSync(USED_FILE, 'utf-8')); } catch {}
  }
  const usedBugs101Ids = new Set(usedObs.bugs101 || []);
  const usedAllbugsIds = new Set(usedObs.allbugs || []);

  // Load existing manifest — file stores { challenges: [...] }
  let manifest = [];
  if (existsSync(MANIFEST_FILE)) {
    try {
      const raw = JSON.parse(readFileSync(MANIFEST_FILE, 'utf-8'));
      manifest = Array.isArray(raw) ? raw : (raw.challenges || []);
    } catch {}
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

    // --- Select bugs101 candidate (with resolution check) ---
    console.log('  Selecting bugs101 candidate...');
    const bugs101Obs = await selectCandidate(observations, usedBugs101Ids, {
      mode: 'bugs101',
      orderRotation,
    });
    if (!bugs101Obs) {
      console.warn('  WARNING: No more unused bugs101 candidates with sufficient resolution');
      continue;
    }

    // --- Select allbugs candidate (with resolution check) ---
    console.log('  Selecting allbugs candidate...');
    const allbugsObs = await selectCandidate(observations, usedAllbugsIds, {
      mode: 'allbugs',
    });
    if (!allbugsObs) {
      console.warn('  WARNING: No more unused allbugs candidates with sufficient resolution');
      continue;
    }

    // --- Process bugs101 ---
    // Dimension-based crops: fraction of each linear dimension (not area).
    // 0.12 = show 12% of width and 12% of height → a tight close-up.
    console.log(`  Bugs101: ${bugs101Obs.taxon.common_name} (${bugs101Obs.taxon.order})`);
    let bugs101Entry;
    try {
      bugs101Entry = await processObservation(bugs101Obs, dayDir, date, 'b101', {
        cropDimFractions: [0.12, 0.35, 0.65],
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
        cropDimFractions: [0.08, 0.15, 0.25, 0.38, 0.55, 0.75],
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

  // Save manifest — wrap in { challenges: [...] } for the client
  writeFileSync(MANIFEST_FILE, JSON.stringify({ challenges: manifest }, null, 2));
  console.log(`\nManifest saved: ${manifest.length} total entries`);

  // Save used observations
  usedObs.bugs101 = [...usedBugs101Ids];
  usedObs.allbugs = [...usedAllbugsIds];
  writeFileSync(USED_FILE, JSON.stringify(usedObs, null, 2));
  console.log(`Used observations saved: ${usedObs.bugs101.length} bugs101, ${usedObs.allbugs.length} allbugs`);

  console.log('\nDone! Review manifest and set "approved: true" for entries to go live.');
}

/**
 * Download image, detect attention point, generate progressive crops and reveal.
 * Returns a partial manifest entry (without answer fields — caller adds those).
 *
 * cropDimFractions are LINEAR dimension fractions — 0.12 means each crop
 * dimension is 12% of the original, centered on the detected attention point.
 */
async function processObservation(obs, dayDir, date, prefix, { cropDimFractions }) {
  // Download original image
  const { buffer, url: downloadedUrl } = await downloadImage(obs.photo_url);
  const metadata = await sharp(buffer).metadata();

  console.log(`    Downloaded: ${metadata.width}x${metadata.height} from ${downloadedUrl.includes('/original.') ? 'original' : 'large'}`);

  // Find the attention point (where the subject likely is)
  const attention = await findAttentionPoint(buffer);
  console.log(`    Attention point: (${(attention.x * 100).toFixed(0)}%, ${(attention.y * 100).toFixed(0)}%)`);

  // Generate crops centered on attention point
  const cropPaths = [];
  for (let i = 0; i < cropDimFractions.length; i++) {
    const frac = cropDimFractions[i];
    const filename = `${prefix}_${i + 1}.jpg`;
    const outputPath = join(dayDir, filename);
    await generateCrop(buffer, frac, outputPath, attention.x, attention.y);
    cropPaths.push(`daily/${date}/${filename}`);
    console.log(`    Crop ${i + 1}/${cropDimFractions.length}: ${Math.round(frac * 100)}% of each dim → ${filename}`);
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
