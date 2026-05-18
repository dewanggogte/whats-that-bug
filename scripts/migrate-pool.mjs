#!/usr/bin/env node
/**
 * migrate-pool.mjs — one-time migration from manifest.json to the
 * reusable approved-pool model.
 *
 * - bugs101 entries: copy their 3 crops + reveal into daily/pool/<id>/.
 * - allbugs entries: re-derive a Bugs 101 name, re-download the original,
 *   regenerate 3 Bugs 101 crops + reveal from the already-approved center.
 * - de-dupe by observation id.
 * - write approved-pool.json and an initial 90-day daily-schedule.json.
 *
 * Idempotent: rebuilds from manifest.json each run (keyed by id).
 *
 * Usage: node scripts/migrate-pool.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { buildPoolEntries, topUpSchedule } from './lib/pool.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'public', 'data');
const DAILY_DIR = join(DATA_DIR, 'daily');
const POOL_DIR = join(DAILY_DIR, 'pool');
const MANIFEST_FILE = join(DAILY_DIR, 'manifest.json');
const CANDIDATES_FILE = join(DAILY_DIR, 'candidates.json');
const POOL_FILE = join(DAILY_DIR, 'approved-pool.json');
const SCHEDULE_FILE = join(DAILY_DIR, 'daily-schedule.json');

const BUGS101_FRACS = [0.12, 0.35, 0.65];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function todayET() {
  const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const y = et.getFullYear();
  const m = String(et.getMonth() + 1).padStart(2, '0');
  const d = String(et.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function downloadOriginal(photoUrl) {
  for (const url of [photoUrl.replace('/medium.', '/original.'), photoUrl.replace('/medium.', '/large.')]) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'WhatsThatBugGame/1.0 (educational project)' } });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
    } catch { /* try next */ }
  }
  throw new Error(`download failed: ${photoUrl}`);
}

async function generateCrop(buf, frac, outPath, cx, cy) {
  const meta = await sharp(buf).metadata();
  const cw = Math.max(Math.round(meta.width * frac), 64);
  const chh = Math.max(Math.round(meta.height * frac), 64);
  let left = Math.max(0, Math.min(Math.round(cx * meta.width - cw / 2), meta.width - cw));
  let top = Math.max(0, Math.min(Math.round(cy * meta.height - chh / 2), meta.height - chh));
  await sharp(buf).extract({ left, top, width: cw, height: chh })
    .resize(800, 600, { fit: 'cover' }).jpeg({ quality: 85 }).toFile(outPath);
}

async function generateReveal(buf, outPath) {
  await sharp(buf).resize(1600, 1200, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 }).toFile(outPath);
}

async function main() {
  const manifest = JSON.parse(readFileSync(MANIFEST_FILE, 'utf-8'));
  const candidates = JSON.parse(readFileSync(CANDIDATES_FILE, 'utf-8'));
  const candById = new Map(candidates.map(o => [o.id, o]));

  const { entries, dropped } = buildPoolEntries(manifest, candById);
  console.log(`Building pool: ${entries.length} entries, ${dropped.length} dropped`);
  for (const d of dropped) console.log(`  drop ${d.id}: ${d.reason}`);

  mkdirSync(POOL_DIR, { recursive: true });
  const pool = [];

  for (const e of entries) {
    const dir = join(POOL_DIR, String(e.id));
    mkdirSync(dir, { recursive: true });
    const cropPaths = [];

    if (e.source === 'bugs101') {
      // Copy existing crop + reveal files verbatim.
      for (let i = 0; i < e.crops.length; i++) {
        const src = join(DATA_DIR, e.crops[i]);
        const dest = join(dir, `${i + 1}.jpg`);
        copyFileSync(src, dest);
        cropPaths.push(`daily/pool/${e.id}/${i + 1}.jpg`);
      }
      copyFileSync(join(DATA_DIR, e.reveal), join(dir, 'full.jpg'));
    } else {
      // allbugs: re-download original, regenerate Bugs 101 crops + reveal.
      console.log(`  recrop ${e.id} (${e.answer_common}) from original...`);
      const buf = await downloadOriginal(e.photo_url);
      for (let i = 0; i < BUGS101_FRACS.length; i++) {
        await generateCrop(buf, BUGS101_FRACS[i], join(dir, `${i + 1}.jpg`), e.center_x, e.center_y);
        cropPaths.push(`daily/pool/${e.id}/${i + 1}.jpg`);
      }
      await generateReveal(buf, join(dir, 'full.jpg'));
      await sleep(500); // be polite to iNaturalist
    }

    pool.push({
      id: e.id,
      answer_common: e.answer_common,
      answer_order: e.answer_order,
      crops: cropPaths,
      reveal: `daily/pool/${e.id}/full.jpg`,
      attribution: e.attribution,
      wikipedia_summary: e.wikipedia_summary,
      inat_url: e.inat_url,
      center_x: e.center_x,
      center_y: e.center_y,
      added: todayET(),
    });
  }

  writeFileSync(POOL_FILE, JSON.stringify(pool, null, 2));
  console.log(`Wrote ${pool.length} entries to ${POOL_FILE}`);

  const existingSchedule = existsSync(SCHEDULE_FILE)
    ? JSON.parse(readFileSync(SCHEDULE_FILE, 'utf-8')) : {};
  const schedule = topUpSchedule(pool, existingSchedule, todayET(), 90);
  writeFileSync(SCHEDULE_FILE, JSON.stringify(schedule, null, 2));
  console.log(`Wrote ${Object.keys(schedule).length}-day schedule to ${SCHEDULE_FILE}`);
}

main().catch(err => { console.error('Migration failed:', err); process.exit(1); });
