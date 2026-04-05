#!/usr/bin/env node

/**
 * review-server.mjs — Unified daily challenge review tool.
 *
 * One command, one browser tab. No file shuffling.
 *
 * Usage:
 *   npm run review-daily        # starts on port 3333
 *   npm run review-daily -- 4444 # custom port
 *
 * Features:
 *   - Serves the review UI + images from one local server
 *   - Click to set crop center → re-crops immediately on the server
 *   - Approve/reject updates manifest in-place on disk
 *   - Regenerate specific days with one click
 */

import { createServer } from 'http';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'public', 'data');
const DAILY_DIR = join(DATA_DIR, 'daily');
const MANIFEST_FILE = join(DAILY_DIR, 'manifest.json');
const CANDIDATES_FILE = join(DAILY_DIR, 'candidates.json');
const OBS_FILE = join(DATA_DIR, 'observations.json');

const PORT = parseInt(process.argv[2] || '3333', 10);
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Crop fractions — must match generate-daily.mjs
const BUGS101_FRACS = [0.12, 0.35, 0.65];
const ALLBUGS_FRACS = [0.08, 0.15, 0.25, 0.38, 0.55, 0.75];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadManifest() {
  if (!existsSync(MANIFEST_FILE)) return { challenges: [] };
  return JSON.parse(readFileSync(MANIFEST_FILE, 'utf-8'));
}

function saveManifest(manifest) {
  writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
}

function loadObsPool() {
  let pool = [];
  if (existsSync(CANDIDATES_FILE)) {
    pool = pool.concat(JSON.parse(readFileSync(CANDIDATES_FILE, 'utf-8')));
  }
  if (existsSync(OBS_FILE)) {
    pool = pool.concat(JSON.parse(readFileSync(OBS_FILE, 'utf-8')));
  }
  return new Map(pool.map(o => [o.id, o]));
}

async function downloadImage(photoUrl) {
  const originalUrl = photoUrl.replace('/medium.', '/original.');
  const largeUrl = photoUrl.replace('/medium.', '/large.');
  for (const url of [originalUrl, largeUrl]) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'WhatsThatBugGame/1.0 (educational project)' },
      });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
    } catch { /* try next */ }
  }
  throw new Error(`Failed to download: ${photoUrl}`);
}

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

async function recropEntry(challenge, modeKey) {
  const data = challenge[modeKey];
  const cx = data.center_x ?? 0.5;
  const cy = data.center_y ?? 0.5;
  const prefix = modeKey === 'bugs101' ? 'b101' : 'all';
  const fracs = modeKey === 'bugs101' ? BUGS101_FRACS : ALLBUGS_FRACS;
  const dayDir = join(DAILY_DIR, challenge.date);
  mkdirSync(dayDir, { recursive: true });

  const obsPool = loadObsPool();
  const obs = obsPool.get(data.observation_id);
  if (!obs) throw new Error(`Observation ${data.observation_id} not found in pool`);

  const buffer = await downloadImage(obs.photo_url);
  const meta = await sharp(buffer).metadata();

  const cropPaths = [];
  for (let i = 0; i < fracs.length; i++) {
    const filename = `${prefix}_${i + 1}.jpg`;
    await generateCrop(buffer, fracs[i], join(dayDir, filename), cx, cy);
    cropPaths.push(`daily/${challenge.date}/${filename}`);
  }

  const revealFilename = `${prefix}_full.jpg`;
  await generateReveal(buffer, join(dayDir, revealFilename));

  data.crops = cropPaths;
  data.reveal = `daily/${challenge.date}/${revealFilename}`;

  return { width: meta.width, height: meta.height };
}

// ---------------------------------------------------------------------------
// MIME types
// ---------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

// ---------------------------------------------------------------------------
// Review UI HTML (embedded — no separate file needed)
// ---------------------------------------------------------------------------
function getReviewHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Daily Challenge Review</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, sans-serif; background: #1a1917; color: #e0ddd8; padding: 24px; }
  h1 { margin-bottom: 8px; }
  .subtitle { color: #9a9590; font-size: 14px; margin-bottom: 20px; }
  .challenge { border: 2px solid #2e2c28; border-radius: 12px; padding: 20px; margin-bottom: 24px; }
  .challenge.approved { border-color: #059669; }
  .challenge-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
  .challenge-header h2 { font-size: 18px; }
  .badge { padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; }
  .badge.pending { background: #7c5a1e; color: #fde047; }
  .badge.approved { background: #1a5c33; color: #86efac; }
  .badge.recropping { background: #1e3a7c; color: #93c5fd; }
  .mode-section { margin-bottom: 20px; }
  .mode-section h3 { margin-bottom: 6px; font-size: 15px; color: #9a9590; }
  .answer { margin: 6px 0; font-size: 14px; }
  .answer strong { color: #d4794e; }
  .answer .warn { color: #dc2626; font-weight: 600; }
  .crops { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 6px; align-items: end; }
  .crop-item { text-align: center; }
  .crop-item img { height: 120px; border-radius: 6px; border: 1px solid #2e2c28; }
  .crop-item img.reveal { border: 2px solid #d4794e; }
  .crop-item .label { font-size: 10px; color: #9a9590; margin-top: 2px; }
  .center-row { display: flex; gap: 16px; align-items: flex-start; margin-top: 10px; }
  .center-picker { position: relative; display: inline-block; cursor: crosshair; flex-shrink: 0; }
  .center-picker img { max-height: 280px; border-radius: 8px; border: 2px solid #2e2c28; display: block; }
  .crosshair {
    position: absolute; width: 20px; height: 20px; border-radius: 50%;
    border: 2px solid #4aff44; background: rgba(68, 255, 68, 0.25);
    transform: translate(-50%, -50%); pointer-events: none;
  }
  .crosshair::after {
    content: '+'; position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
    color: #4aff44; font-size: 14px; font-weight: 700;
  }
  .center-info { font-size: 12px; color: #9a9590; min-width: 140px; }
  .center-info .coord { font-family: monospace; color: #d4794e; }
  .actions { display: flex; gap: 10px; margin-top: 14px; flex-wrap: wrap; }
  .btn { padding: 8px 20px; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 13px; }
  .btn-approve { background: #059669; color: white; }
  .btn-reject { background: #dc2626; color: white; }
  .btn-recrop { background: #2563eb; color: white; }
  .btn:hover { filter: brightness(0.9); }
  .btn:disabled { opacity: 0.4; cursor: default; filter: none; }
  .status-bar { position: sticky; top: 0; background: #222120; padding: 12px 16px; border-radius: 8px; margin-bottom: 20px; z-index: 10; font-size: 14px; color: #9a9590; }
  .spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid #9a9590; border-top-color: #d4794e; border-radius: 50%; animation: spin 0.6s linear infinite; margin-left: 6px; vertical-align: middle; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: #059669; color: white; padding: 10px 24px; border-radius: 8px; font-weight: 600; font-size: 14px; z-index: 100; transition: opacity 0.3s; }
  .toast.error { background: #dc2626; }
</style>
</head>
<body>
<h1>Daily Challenge Review</h1>
<p class="subtitle">Click the reveal image to set crop center. Hit "Re-crop" to regenerate. Approve when happy.</p>

<div class="status-bar" id="status">Loading...</div>
<div id="challenges"></div>
<div id="toast" class="toast" style="display:none;"></div>

<script>
const B101_FRACS = ['12%', '35%', '65%'];
const ALL_FRACS = ['8%', '15%', '25%', '38%', '55%', '75%'];
const VALID_B101 = new Set(['Ant','Aphid','Bee','Beetle','Butterfly','Caddisfly','Cicada','Cockroach','Cricket','Damselfly','Dragonfly','Earwig','Fly','Grasshopper','Harvestman','Isopods','Lacewing','Mantis','Mayfly','Moth','Planthopper','Scorpion','Spider','Stick Insect','Stink Bug','Tick','True Bug','Wasp','Water Bug']);

let manifest = null;
let busy = false;

async function load() {
  const res = await fetch('/api/manifest');
  manifest = await res.json();
  render();
}

function toast(msg, isError) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast' + (isError ? ' error' : '');
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 3000);
}

function cacheBust(url) {
  return url + (url.includes('?') ? '&' : '?') + 't=' + Date.now();
}

function render() {
  const chs = manifest.challenges;
  const approved = chs.filter(c => c.approved).length;
  const problems = chs.filter(c => {
    const b101Invalid = !VALID_B101.has(c.bugs101?.answer_common || '');
    const allMissing = !c.allbugs?.answer_species;
    return b101Invalid || allMissing;
  }).length;
  document.getElementById('status').innerHTML =
    approved + '/' + chs.length + ' approved' +
    (problems > 0 ? ' · <span style="color:#dc2626;">' + problems + ' with issues</span>' : '');

  document.getElementById('challenges').innerHTML = chs.map((ch, idx) => {
    const b101Valid = VALID_B101.has(ch.bugs101?.answer_common || '');
    const allValid = !!ch.allbugs?.answer_species && !!ch.allbugs?.answer_common;
    const badgeClass = ch.approved ? 'approved' : 'pending';
    const badgeText = ch.approved ? 'Approved' : 'Pending';

    return '<div class="challenge ' + (ch.approved ? 'approved' : '') + '" id="ch-' + idx + '">' +
      '<div class="challenge-header">' +
        '<h2>Day #' + ch.number + ' — ' + ch.date + '</h2>' +
        '<span class="badge ' + badgeClass + '">' + badgeText + '</span>' +
      '</div>' +
      renderMode(ch, idx, 'bugs101', 'Bugs 101', B101_FRACS, b101Valid) +
      renderMode(ch, idx, 'allbugs', 'All Bugs', ALL_FRACS, allValid) +
      '<div class="actions">' +
        '<button class="btn btn-approve" onclick="approve(' + idx + ')"' + (ch.approved ? ' disabled' : '') + '>Approve</button>' +
        '<button class="btn btn-reject" onclick="reject(' + idx + ')">Reject</button>' +
      '</div>' +
    '</div>';
  }).join('');

  // Attach center-picker click handlers
  document.querySelectorAll('.center-picker').forEach(picker => {
    picker.onclick = (e) => {
      if (busy) return;
      const img = picker.querySelector('img');
      const rect = img.getBoundingClientRect();
      const x = Math.round(((e.clientX - rect.left) / rect.width) * 1000) / 1000;
      const y = Math.round(((e.clientY - rect.top) / rect.height) * 1000) / 1000;
      const idx = parseInt(picker.dataset.idx);
      const mode = picker.dataset.mode;
      setCenter(idx, mode, x, y);
    };
  });
}

function renderMode(ch, idx, mode, title, fracLabels, isValid) {
  const data = ch[mode];
  const cx = data.center_x ?? 0.5;
  const cy = data.center_y ?? 0.5;

  let answerLine;
  if (mode === 'bugs101') {
    answerLine = 'Answer: <strong>' + esc(data.answer_common || '?') + '</strong> (' + esc(data.answer_order || '?') + ')';
    if (!isValid) answerLine += ' <span class="warn">NOT IN OPTIONS</span>';
  } else {
    answerLine = 'Answer: <strong>' + esc(data.answer_common || '?') + '</strong> (<em>' + esc(data.answer_species || 'MISSING') + '</em>)';
    if (!isValid) answerLine += ' <span class="warn">INCOMPLETE</span>';
  }

  return '<div class="mode-section">' +
    '<h3>' + title + '</h3>' +
    '<div class="answer">' + answerLine + '</div>' +
    '<div class="crops">' +
      data.crops.map((c, i) =>
        '<div class="crop-item"><img src="' + cacheBust('/images/' + c) + '"><div class="label">' + (fracLabels[i] || '') + '</div></div>'
      ).join('') +
      '<div class="crop-item"><img src="' + cacheBust('/images/' + data.reveal) + '" class="reveal"><div class="label">Reveal</div></div>' +
    '</div>' +
    '<div class="center-row">' +
      '<div class="center-picker" data-idx="' + idx + '" data-mode="' + mode + '">' +
        '<img src="' + cacheBust('/images/' + data.reveal) + '">' +
        '<div class="crosshair" style="left:' + (cx*100) + '%;top:' + (cy*100) + '%;"></div>' +
      '</div>' +
      '<div class="center-info">' +
        '<div>Center: <span class="coord">' + (cx*100).toFixed(1) + '%, ' + (cy*100).toFixed(1) + '%</span></div>' +
        '<button class="btn btn-recrop" style="margin-top:8px;" onclick="recrop(' + idx + ',\\'' + mode + '\\')">Re-crop</button>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

async function setCenter(idx, mode, x, y) {
  manifest.challenges[idx][mode].center_x = x;
  manifest.challenges[idx][mode].center_y = y;
  manifest.challenges[idx].approved = false;
  // Save to disk immediately
  await fetch('/api/manifest', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(manifest) });
  render();
  toast('Center set — hit Re-crop to apply');
}

async function recrop(idx, mode) {
  if (busy) return;
  busy = true;
  toast('Re-cropping ' + mode + '...');
  try {
    const res = await fetch('/api/recrop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idx, mode }),
    });
    if (!res.ok) throw new Error(await res.text());
    manifest = await (await fetch('/api/manifest')).json();
    render();
    toast('Re-cropped!');
  } catch (err) {
    toast('Error: ' + err.message, true);
  }
  busy = false;
}

async function approve(idx) {
  manifest.challenges[idx].approved = true;
  await fetch('/api/manifest', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(manifest) });
  render();
  toast('Approved #' + manifest.challenges[idx].number);
}

async function reject(idx) {
  if (!confirm('Remove day #' + manifest.challenges[idx].number + '?')) return;
  manifest.challenges.splice(idx, 1);
  await fetch('/api/manifest', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(manifest) });
  render();
  toast('Removed');
}

load();
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// HTTP Server
// ---------------------------------------------------------------------------
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // --- UI ---
  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(getReviewHTML());
    return;
  }

  // --- API: GET manifest ---
  if (url.pathname === '/api/manifest' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(readFileSync(MANIFEST_FILE, 'utf-8'));
    return;
  }

  // --- API: POST manifest (save) ---
  if (url.pathname === '/api/manifest' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    writeFileSync(MANIFEST_FILE, JSON.stringify(JSON.parse(body), null, 2));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"ok":true}');
    return;
  }

  // --- API: POST recrop ---
  if (url.pathname === '/api/recrop' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    const { idx, mode } = JSON.parse(body);

    const manifest = loadManifest();
    const ch = manifest.challenges[idx];
    if (!ch) {
      res.writeHead(404);
      res.end('Challenge not found');
      return;
    }

    try {
      console.log(`Re-cropping ${ch.date} ${mode}...`);
      const dims = await recropEntry(ch, mode);
      console.log(`  Done (${dims.width}x${dims.height})`);
      saveManifest(manifest);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, width: dims.width, height: dims.height }));
    } catch (err) {
      console.error(`  Error: ${err.message}`);
      res.writeHead(500);
      res.end(err.message);
    }
    return;
  }

  // --- Serve images from public/data/ ---
  if (url.pathname.startsWith('/images/daily/')) {
    const filePath = join(DATA_DIR, url.pathname.replace('/images/', ''));
    if (existsSync(filePath)) {
      const ext = extname(filePath);
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      res.end(readFileSync(filePath));
      return;
    }
    res.writeHead(404);
    res.end('Image not found');
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`\n🪲 Daily Challenge Review Server\n`);
  console.log(`   http://localhost:${PORT}\n`);
  console.log(`   Click the reveal image to set crop center.`);
  console.log(`   Hit "Re-crop" to regenerate crops from the server.`);
  console.log(`   Approve when you're happy. Everything saves to disk automatically.\n`);
  console.log(`   Press Ctrl+C to stop.\n`);
});
