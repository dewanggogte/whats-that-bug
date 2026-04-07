#!/usr/bin/env node

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { createInterface } from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CACHE_DIR = join(ROOT, '.cache');
const STATE_FILE = join(CACHE_DIR, 'reddit-pipeline-state.json');
const POSTS_DIR = join(__dirname, 'reddit-posts');
const OBS_FILE = join(ROOT, 'public', 'data', 'observations.json');

const API_BASE = 'https://api.inaturalist.org/v1';
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ---- Subreddit config ----
const SUBREDDITS = [
  {
    id: 'NatureIsFuckingLit',
    name: 'r/NatureIsFuckingLit',
    subs: '~11.9M',
    title: '🔥 Some incredible insect photography from iNaturalist 🔥',
    bodyTone: 'dramatic',
    categoryLabel: 'insects',
    taxa: [
      { name: 'Insects (mixed)', taxon_id: 47158, per_page: 20 },
      { name: 'Arachnids (mixed)', taxon_id: 47119, per_page: 20 },
    ],
  },
  {
    id: 'spiders',
    name: 'r/spiders',
    subs: '~299K',
    title: 'Sharing some gorgeous spider photos',
    bodyTone: 'default',
    categoryLabel: 'spiders',
    taxa: [{ name: 'Spiders', taxon_id: 47118, per_page: 40 }],
  },
  {
    id: 'entomology',
    name: 'r/entomology',
    subs: '~208K',
    title: 'Some beautiful insect photography from iNaturalist',
    bodyTone: 'formal',
    categoryLabel: 'insects',
    taxa: [
      { name: 'Insects (mixed)', taxon_id: 47158, per_page: 20 },
      { name: 'Arachnids (mixed)', taxon_id: 47119, per_page: 20 },
    ],
  },
  {
    id: 'insects',
    name: 'r/insects',
    subs: '~194K',
    title: 'Sharing some gorgeous insect photos',
    bodyTone: 'default',
    categoryLabel: 'insects',
    taxa: [{ name: 'Insects (mixed)', taxon_id: 47158, per_page: 40 }],
  },
  {
    id: 'awwnverts',
    name: 'r/awwnverts',
    subs: '~136K',
    title: 'Some adorable bug photos I\'ve come across',
    bodyTone: 'cute',
    categoryLabel: 'bugs',
    taxa: [
      { name: 'Insects (mixed)', taxon_id: 47158, per_page: 20 },
      { name: 'Arachnids (mixed)', taxon_id: 47119, per_page: 20 },
    ],
  },
  {
    id: 'bees',
    name: 'r/bees',
    subs: '~58K',
    title: 'Sharing some gorgeous bee photos',
    bodyTone: 'default',
    categoryLabel: 'bees',
    taxa: [{ name: 'Bees', taxon_id: 630955, per_page: 40 }],
  },
  {
    id: 'moths',
    name: 'r/moths',
    subs: '~54K',
    title: 'Sharing some gorgeous moth photos',
    bodyTone: 'default',
    categoryLabel: 'moths',
    taxa: [{ name: 'Moths', taxon_id: 47157, per_page: 40, excludeSubtaxon: 47224 }],
  },
  {
    id: 'ants',
    name: 'r/ants',
    subs: '~28K',
    title: 'Sharing some gorgeous ant photos',
    bodyTone: 'default',
    categoryLabel: 'ants',
    taxa: [{ name: 'Ants', taxon_id: 47336, per_page: 40 }],
  },
  {
    id: 'butterflies',
    name: 'r/butterflies',
    subs: '~22K',
    title: 'Sharing some gorgeous butterfly photos',
    bodyTone: 'default',
    categoryLabel: 'butterflies',
    taxa: [{ name: 'Butterflies', taxon_id: 47224, per_page: 40 }],
  },
];

// ---- State management ----
function loadState() {
  mkdirSync(CACHE_DIR, { recursive: true });
  if (existsSync(STATE_FILE)) {
    return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
  }
  return { stage: 'config', targets: [], candidates: {}, selections: {}, posts: {}, posted: {} };
}

function saveState(state) {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ---- CLI helpers ----
function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => { rl.close(); resolve(answer.trim()); });
  });
}

function log(msg) { console.log(`\x1b[36m▸\x1b[0m ${msg}`); }
function success(msg) { console.log(`\x1b[32m✓\x1b[0m ${msg}`); }
function warn(msg) { console.log(`\x1b[33m⚠\x1b[0m ${msg}`); }
function heading(msg) { console.log(`\n\x1b[1m\x1b[35m═══ ${msg} ═══\x1b[0m\n`); }

// ---- Stage 0: Config ----
async function stageConfig(state) {
  heading('Stage 0: Configure Targets');

  console.log('Available subreddits:\n');
  SUBREDDITS.forEach((sub, i) => {
    const posted = state.posted[sub.id] ? ' (already posted)' : '';
    console.log(`  ${i + 1}. ${sub.name} (${sub.subs})${posted}`);
  });

  const input = await ask('\nWhich subreddits to target? (e.g. "1,2,5" or "all"): ');
  let indices;
  if (input.toLowerCase() === 'all') {
    indices = SUBREDDITS.map((_, i) => i);
  } else {
    indices = input.split(',').map(s => parseInt(s.trim()) - 1).filter(i => i >= 0 && i < SUBREDDITS.length);
  }

  if (indices.length === 0) {
    warn('No valid subreddits selected. Exiting.');
    process.exit(0);
  }

  state.targets = indices.map(i => SUBREDDITS[i].id);
  state.stage = 'fetch';
  saveState(state);

  success(`Targeting ${state.targets.length} subreddits: ${state.targets.map(id => 'r/' + id).join(', ')}`);
}

// ---- Fetch helpers ----
async function apiFetch(endpoint, params = {}) {
  const url = new URL(`${API_BASE}${endpoint}`);
  for (const [key, val] of Object.entries(params)) {
    url.searchParams.set(key, String(val));
  }
  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'WhatsThatBugGame/1.0 (educational project; reddit pipeline)' },
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${url.toString()}`);
  return res.json();
}

async function fetchTopObservations(taxonId, perPage, excludeSubtaxon) {
  log(`  Fetching taxon ${taxonId} (top ${perPage} by faves)...`);
  const params = {
    taxon_id: taxonId,
    quality_grade: 'research',
    photo_license: 'cc-by,cc-by-sa,cc0',
    photos: 'true',
    per_page: perPage,
    order_by: 'votes',
  };
  const data = await apiFetch('/observations', params);
  await sleep(1100);

  return (data.results || [])
    .filter(obs => {
      if (!obs.taxon?.preferred_common_name) return false;
      if (!obs.photos?.[0]) return false;
      if (excludeSubtaxon && (obs.taxon.ancestor_ids || []).includes(excludeSubtaxon)) return false;
      return true;
    })
    .map(obs => ({
      id: obs.id,
      photo_url: obs.photos[0].url?.replace('square', 'medium'),
      photo_url_large: obs.photos[0].url?.replace('square', 'large'),
      photo_url_original: obs.photos[0].url?.replace('square', 'original'),
      attribution: obs.photos[0].attribution || '(c) Unknown',
      faves_count: obs.faves_count || 0,
      taxon: {
        id: obs.taxon.id,
        species: obs.taxon.name,
        common_name: obs.taxon.preferred_common_name,
      },
      inat_url: obs.uri || `https://www.inaturalist.org/observations/${obs.id}`,
    }));
}

function scanExistingPool(targetTaxa) {
  if (!existsSync(OBS_FILE)) return [];
  const pool = JSON.parse(readFileSync(OBS_FILE, 'utf-8'));
  return pool
    .sort((a, b) => (b.num_agreements || 0) - (a.num_agreements || 0))
    .slice(0, 30)
    .map(obs => ({
      id: obs.id,
      photo_url: obs.photo_url,
      photo_url_large: obs.photo_url?.replace('/medium.', '/large.'),
      photo_url_original: obs.photo_url?.replace('/medium.', '/original.'),
      attribution: obs.attribution || '(c) Unknown',
      faves_count: 0,
      taxon: {
        id: obs.taxon?.id,
        species: obs.taxon?.species,
        common_name: obs.taxon?.common_name,
      },
      inat_url: obs.inat_url || `https://www.inaturalist.org/observations/${obs.id}`,
      fromExistingPool: true,
    }));
}

// ---- Stage 1: Fetch ----
async function stageFetch(state) {
  heading('Stage 1: Fetch Candidates');

  const seenIds = new Set();
  for (const subId of state.targets) {
    const sub = SUBREDDITS.find(s => s.id === subId);
    if (!sub) continue;

    if (state.candidates[subId]?.length > 0) {
      log(`${sub.name}: already have ${state.candidates[subId].length} candidates, skipping`);
      continue;
    }

    log(`${sub.name}: fetching from iNaturalist...`);
    let candidates = [];

    for (const taxon of sub.taxa) {
      const obs = await fetchTopObservations(taxon.taxon_id, taxon.per_page, taxon.excludeSubtaxon);
      candidates = candidates.concat(obs);
    }

    // Dedup
    candidates = candidates.filter(c => {
      if (seenIds.has(c.id)) return false;
      seenIds.add(c.id);
      return true;
    });

    state.candidates[subId] = candidates;
    success(`${sub.name}: ${candidates.length} candidates`);
    saveState(state);
  }

  // Also scan existing pool for broad subs
  const broadSubs = ['NatureIsFuckingLit', 'entomology', 'insects', 'awwnverts'];
  for (const subId of state.targets.filter(id => broadSubs.includes(id))) {
    const sub = SUBREDDITS.find(s => s.id === subId);
    const poolObs = scanExistingPool(sub.taxa)
      .filter(c => !seenIds.has(c.id));
    if (poolObs.length > 0) {
      state.candidates[subId] = [...(state.candidates[subId] || []), ...poolObs];
      poolObs.forEach(c => seenIds.add(c.id));
      log(`${sub.name}: added ${poolObs.length} from existing pool`);
      saveState(state);
    }
  }

  state.stage = 'review';
  saveState(state);
  success('Fetch complete!');
}

// ---- Stage 2: Review ----
async function stageReview(state) {
  heading('Stage 2: Review & Curate');

  // Check if selections already exist
  const hasSelections = Object.values(state.selections).some(arr => arr?.length > 0);
  if (hasSelections) {
    log('Existing selections found:');
    for (const [subId, ids] of Object.entries(state.selections)) {
      if (ids?.length > 0) log(`  r/${subId}: ${ids.length} selected`);
    }
    const redo = await ask('Re-do curation? (y/N): ');
    if (redo.toLowerCase() !== 'y') {
      state.stage = 'prepare';
      saveState(state);
      return;
    }
  }

  const PORT = 3847;
  const reviewHtml = readFileSync(join(__dirname, 'reddit-review.html'), 'utf-8');

  // Build data to inject
  const candidateData = {};
  const subMeta = {};
  for (const subId of state.targets) {
    if (!state.candidates[subId]?.length) continue;
    candidateData[subId] = state.candidates[subId];
    const sub = SUBREDDITS.find(s => s.id === subId);
    subMeta[subId] = { name: sub.name, title: sub.title };
  }

  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      if (req.method === 'GET' && req.url === '/') {
        const injectedScript = `<script>window.CANDIDATES = ${JSON.stringify(candidateData)}; window.SUB_META = ${JSON.stringify(subMeta)};</script>`;
        const html = reviewHtml.replace('</head>', injectedScript + '\n</head>');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
      } else if (req.method === 'POST' && req.url === '/api/save-selections') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            state.selections = JSON.parse(body);
            state.stage = 'prepare';
            saveState(state);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
            success('Selections saved!');
            server.close();
            resolve();
          } catch (e) {
            res.writeHead(400);
            res.end(e.message);
          }
        });
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.listen(PORT, () => {
      const url = `http://localhost:${PORT}`;
      log(`Review UI running at ${url}`);
      log('Opening browser...');
      import('child_process').then(cp => {
        cp.exec(`open "${url}"`);
      });
      log('Star 4-6 images per subreddit, then click "Done".');
      log('Waiting for selections...');
    });
  });
}

// ---- Stage 3: Prepare (placeholder — Task 4) ----
async function stagePrepare(state) {
  heading('Stage 3: Prepare Posts');
  log('Not yet implemented');
}

// ---- Stage 4: Post (placeholder — Task 5) ----
async function stagePost(state) {
  heading('Stage 4: Post to Reddit');
  log('Not yet implemented');
}

// ---- Main ----
async function main() {
  console.log('\n\x1b[1m🐛 Reddit Photo Pipeline\x1b[0m\n');

  const state = loadState();

  // Resume logic — jump to the right stage
  const stages = [
    { name: 'config', fn: stageConfig },
    { name: 'fetch', fn: stageFetch },
    { name: 'review', fn: stageReview },
    { name: 'prepare', fn: stagePrepare },
    { name: 'post', fn: stagePost },
  ];

  const startIdx = stages.findIndex(s => s.name === state.stage);
  if (startIdx > 0) {
    log(`Resuming from stage: ${state.stage}`);
    const resume = await ask('Continue from where you left off? (Y/n): ');
    if (resume.toLowerCase() === 'n') {
      const restart = await ask('Restart from scratch? This clears all state. (y/N): ');
      if (restart.toLowerCase() === 'y') {
        state.stage = 'config';
        state.targets = [];
        state.candidates = {};
        state.selections = {};
        state.posts = {};
        // Keep posted — don't lose track of what was already posted
        saveState(state);
      }
    }
  }

  const runFrom = stages.findIndex(s => s.name === state.stage);
  for (let i = runFrom; i < stages.length; i++) {
    await stages[i].fn(state);
  }

  console.log('\n\x1b[1m✨ Pipeline complete!\x1b[0m\n');
}

main().catch(err => {
  console.error('\x1b[31mPipeline failed:\x1b[0m', err);
  process.exit(1);
});
