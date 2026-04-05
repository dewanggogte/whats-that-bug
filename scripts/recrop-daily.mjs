#!/usr/bin/env node

/**
 * recrop-daily.mjs — Regenerate crops using corrected center points.
 *
 * After adjusting crop centers in the review tool (review-daily.html),
 * run this script to re-download originals and regenerate crops at the
 * corrected positions.
 *
 * Usage:
 *   node scripts/recrop-daily.mjs                  # recrop all entries
 *   node scripts/recrop-daily.mjs --date 2026-04-07  # recrop a specific date
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'public', 'data');
const DAILY_DIR = join(DATA_DIR, 'daily');
const MANIFEST_FILE = join(DAILY_DIR, 'manifest.json');
const OBS_FILE = join(DATA_DIR, 'observations.json');
const CANDIDATES_FILE = join(DAILY_DIR, 'candidates.json');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
let targetDate = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--date' && args[i + 1]) {
    targetDate = args[i + 1];
  }
}

// ---------------------------------------------------------------------------
// Crop dimension fractions — must match generate-daily.mjs
// ---------------------------------------------------------------------------
const BUGS101_FRACS = [0.12, 0.35, 0.65];
const ALLBUGS_FRACS = [0.08, 0.15, 0.25, 0.38, 0.55, 0.75];

// ---------------------------------------------------------------------------
// Image download (same as generate-daily.mjs)
// ---------------------------------------------------------------------------
async function downloadImage(photoUrl) {
  const originalUrl = photoUrl.replace('/medium.', '/original.');
  const largeUrl = photoUrl.replace('/medium.', '/large.');

  for (const url of [originalUrl, largeUrl]) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'WhatsThatBugGame/1.0 (educational project)' },
      });
      if (res.ok) {
        return Buffer.from(await res.arrayBuffer());
      }
    } catch {
      // try next
    }
  }
  throw new Error(`Failed to download: ${photoUrl}`);
}

// ---------------------------------------------------------------------------
// Crop generation (same as generate-daily.mjs)
// ---------------------------------------------------------------------------
async function generateCrop(imageBuffer, dimFraction, outputPath, cx, cy) {
  const metadata = await sharp(imageBuffer).metadata();
  const imgW = metadata.width;
  const imgH = metadata.height;

  const cropW = Math.max(Math.round(imgW * dimFraction), 64);
  const cropH = Math.max(Math.round(imgH * dimFraction), 64);

  let left = Math.round(cx * imgW - cropW / 2);
  let top = Math.round(cy * imgH - cropH / 2);
  left = Math.max(0, Math.min(left, imgW - cropW));
  top = Math.max(0, Math.min(top, imgH - cropH));

  await sharp(imageBuffer)
    .extract({ left, top, width: cropW, height: cropH })
    .resize(800, 600, { fit: 'cover' })
    .jpeg({ quality: 85 })
    .toFile(outputPath);
}

async function generateReveal(imageBuffer, outputPath) {
  await sharp(imageBuffer)
    .resize(1600, 1200, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toFile(outputPath);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('=== What\'s That Bug — Re-Crop Daily Challenges ===\n');

  if (!existsSync(MANIFEST_FILE)) {
    console.error('No manifest found. Run generate-daily first.');
    process.exit(1);
  }

  const manifest = JSON.parse(readFileSync(MANIFEST_FILE, 'utf-8'));
  const challenges = manifest.challenges || [];

  // Load observation pool to find photo URLs
  let obsPool = [];
  if (existsSync(CANDIDATES_FILE)) {
    obsPool = JSON.parse(readFileSync(CANDIDATES_FILE, 'utf-8'));
  }
  if (existsSync(OBS_FILE)) {
    obsPool = obsPool.concat(JSON.parse(readFileSync(OBS_FILE, 'utf-8')));
  }
  const obsById = new Map(obsPool.map(o => [o.id, o]));

  // Filter to target date if specified
  const toProcess = targetDate
    ? challenges.filter(c => c.date === targetDate)
    : challenges;

  if (toProcess.length === 0) {
    console.log('No challenges to process.');
    return;
  }

  console.log(`Processing ${toProcess.length} challenge(s)...\n`);

  for (const ch of toProcess) {
    console.log(`[${ch.date}] Day #${ch.number}`);

    const dayDir = join(DAILY_DIR, ch.date);
    mkdirSync(dayDir, { recursive: true });

    for (const [mode, prefix, fracs] of [
      ['bugs101', 'b101', BUGS101_FRACS],
      ['allbugs', 'all', ALLBUGS_FRACS],
    ]) {
      const data = ch[mode];
      const cx = data.center_x ?? 0.5;
      const cy = data.center_y ?? 0.5;

      // Find photo URL from observation pool
      const obs = obsById.get(data.observation_id);
      if (!obs) {
        console.warn(`  WARNING: observation ${data.observation_id} not found in pool, skipping ${mode}`);
        continue;
      }

      console.log(`  ${mode}: ${obs.taxon?.common_name || obs.taxon?.species || '?'}`);
      console.log(`    Center: (${(cx * 100).toFixed(1)}%, ${(cy * 100).toFixed(1)}%)`);

      // Download original
      let buffer;
      try {
        buffer = await downloadImage(obs.photo_url);
        const meta = await sharp(buffer).metadata();
        console.log(`    Downloaded: ${meta.width}x${meta.height}`);
      } catch (err) {
        console.error(`    ERROR downloading: ${err.message}`);
        continue;
      }

      // Regenerate crops
      const cropPaths = [];
      for (let i = 0; i < fracs.length; i++) {
        const filename = `${prefix}_${i + 1}.jpg`;
        const outputPath = join(dayDir, filename);
        await generateCrop(buffer, fracs[i], outputPath, cx, cy);
        cropPaths.push(`daily/${ch.date}/${filename}`);
        console.log(`    Crop ${i + 1}/${fracs.length}: ${Math.round(fracs[i] * 100)}% → ${filename}`);
      }

      // Regenerate reveal
      const revealFilename = `${prefix}_full.jpg`;
      await generateReveal(buffer, join(dayDir, revealFilename));
      console.log(`    Reveal → ${revealFilename}`);

      // Update manifest paths (in case they changed)
      data.crops = cropPaths;
      data.reveal = `daily/${ch.date}/${revealFilename}`;

      await sleep(300);
    }

    console.log();
  }

  // Save updated manifest
  writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
  console.log(`Manifest updated. Reload in review tool to verify.`);
}

main().catch(err => {
  console.error('Recrop failed:', err);
  process.exit(1);
});
