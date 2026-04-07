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

// ---- Stage 1: Fetch (placeholder — Task 2) ----
async function stageFetch(state) {
  heading('Stage 1: Fetch Candidates');
  log('Not yet implemented');
}

// ---- Stage 2: Review (placeholder — Task 3) ----
async function stageReview(state) {
  heading('Stage 2: Review & Curate');
  log('Not yet implemented');
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
