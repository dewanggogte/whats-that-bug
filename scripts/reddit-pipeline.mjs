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
const POSTED_PHOTOS_FILE = join(CACHE_DIR, 'reddit-posted-photos.json');

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

// ---- Posted photos tracking (persists across pipeline resets) ----
function loadPostedPhotos() {
  mkdirSync(CACHE_DIR, { recursive: true });
  if (existsSync(POSTED_PHOTOS_FILE)) {
    return JSON.parse(readFileSync(POSTED_PHOTOS_FILE, 'utf-8'));
  }
  return {}; // { obsId: { count, subreddits: ["r/spiders", ...], lastPosted: "..." } }
}

function savePostedPhotos(postedPhotos) {
  writeFileSync(POSTED_PHOTOS_FILE, JSON.stringify(postedPhotos, null, 2));
}

function recordPostedPhotos(subredditId, observationIds) {
  const postedPhotos = loadPostedPhotos();
  for (const obsId of observationIds) {
    const key = String(obsId);
    if (!postedPhotos[key]) {
      postedPhotos[key] = { count: 0, subreddits: [], lastPosted: null };
    }
    postedPhotos[key].count++;
    postedPhotos[key].subreddits.push(`r/${subredditId}`);
    postedPhotos[key].lastPosted = new Date().toISOString();
  }
  savePostedPhotos(postedPhotos);
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
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url.toString(), {
        headers: { 'User-Agent': 'WhatsThatBugGame/1.0 (educational project; reddit pipeline)' },
      });
      if (!res.ok) throw new Error(`API error ${res.status}: ${url.toString()}`);
      return res.json();
    } catch (e) {
      if (attempt < 3) {
        warn(`  Fetch failed (attempt ${attempt}/3): ${e.message}. Retrying in 3s...`);
        await sleep(3000);
      } else {
        throw e;
      }
    }
  }
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
  const postedPhotos = loadPostedPhotos();
  const previouslyPostedIds = new Set(Object.keys(postedPhotos));

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

    // Dedup + filter out previously posted photos
    let skippedPosted = 0;
    candidates = candidates.filter(c => {
      if (seenIds.has(c.id)) return false;
      if (previouslyPostedIds.has(String(c.id))) { skippedPosted++; return false; }
      seenIds.add(c.id);
      return true;
    });

    if (skippedPosted > 0) log(`  Filtered out ${skippedPosted} previously posted photos`);

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

// ---- Stage 3: Prepare helpers ----
function generatePostBody(sub, selectedObs) {
  const credits = selectedObs
    .map(o => o.attribution.replace(/\(c\)\s*/i, '').split(',')[0].trim())
    .filter((v, i, a) => a.indexOf(v) === i) // unique
    .join(', ');

  const gameUrl = 'https://dewanggogte.com/games/bugs/';
  const label = sub.categoryLabel;

  let body;
  if (sub.bodyTone === 'dramatic') {
    body = `These are some of the most stunning ${label} photos I've come across. I've been working on a "Guess the Bug" game (${gameUrl}) and have gone through thousands of ${label} photos in the process — these ones stopped me in my tracks.\n\nAll photos are research-grade observations from iNaturalist (CC BY licensed).\n📸 Credits: ${credits}`;
  } else if (sub.bodyTone === 'formal') {
    body = `I've been curating research-grade observations from iNaturalist for an insect identification game (${gameUrl}) and came across some remarkable photography. Sharing a few favourites here.\n\nAll observations are research-grade with CC BY licensing.\n📸 Credits: ${credits}`;
  } else if (sub.bodyTone === 'cute') {
    body = `I've been going through thousands of bug photos while working on a "Guess the Bug" game (${gameUrl}) and couldn't resist sharing some of the most adorable ones.\n\nAll photos from iNaturalist (CC BY licensed).\n📸 Credits: ${credits}`;
  } else {
    body = `I've been working on a "Guess the Bug" game (${gameUrl}) and have gone through thousands of ${label} photos in the process. Here are a few of my favourites. Enjoy!\n\nAll photos from iNaturalist (CC BY licensed).\n📸 Credits: ${credits}`;
  }

  return body;
}

function generateCaptions(selectedObs) {
  return selectedObs.map(obs => {
    const photographer = obs.attribution.replace(/\(c\)\s*/i, '').split(',')[0].trim();
    return `${obs.taxon.common_name} (${obs.taxon.species}) — 📸 ${photographer} via iNaturalist`;
  });
}

async function downloadImage(url, outputPath) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'WhatsThatBugGame/1.0 (educational project)' },
  });
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  writeFileSync(outputPath, buffer);
  return buffer.length;
}

// ---- Stage 3: Prepare ----
async function stagePrepare(state) {
  heading('Stage 3: Prepare Posts');

  for (const subId of state.targets) {
    const sub = SUBREDDITS.find(s => s.id === subId);
    const selectedIds = new Set(state.selections[subId] || []);
    if (selectedIds.size === 0) {
      warn(`r/${subId}: no selections, skipping`);
      continue;
    }

    const candidates = state.candidates[subId] || [];
    const selectedObs = candidates.filter(c => selectedIds.has(c.id));

    log(`r/${subId}: preparing ${selectedObs.length} images...`);

    // Create output directory
    const subDir = join(POSTS_DIR, `r-${subId}`);
    mkdirSync(subDir, { recursive: true });

    // Download images
    for (let i = 0; i < selectedObs.length; i++) {
      const obs = selectedObs[i];
      const imgUrl = obs.photo_url_original || obs.photo_url_large || obs.photo_url;
      const ext = imgUrl.match(/\.(jpe?g|png|gif|webp)/i)?.[1] || 'jpg';
      const filename = `${String(i + 1).padStart(3, '0')}.${ext}`;
      const outputPath = join(subDir, filename);

      if (existsSync(outputPath)) {
        log(`  ${filename}: already downloaded`);
        continue;
      }

      try {
        const size = await downloadImage(imgUrl, outputPath);
        log(`  ${filename}: ${(size / 1024).toFixed(0)} KB — ${obs.taxon.common_name}`);
        await sleep(500); // be nice to iNaturalist
      } catch (e) {
        warn(`  ${filename}: download failed — ${e.message}`);
      }
    }

    // Generate post content
    const title = sub.title;
    const body = generatePostBody(sub, selectedObs);
    const captions = generateCaptions(selectedObs);

    const post = { title, body, captions, images: selectedObs.map((obs, i) => {
      const ext = (obs.photo_url_original || obs.photo_url).match(/\.(jpe?g|png|gif|webp)/i)?.[1] || 'jpg';
      return {
        filename: `${String(i + 1).padStart(3, '0')}.${ext}`,
        caption: captions[i],
        obs_id: obs.id,
        inat_url: obs.inat_url,
      };
    })};

    state.posts[subId] = post;

    // Write human-readable preview
    const preview = `# Post for r/${subId}\n\n**Title:** ${title}\n\n**Body:**\n${body}\n\n**Images (${post.images.length}):**\n${post.images.map((img, i) => `${i + 1}. ${img.filename} — ${img.caption}`).join('\n')}\n`;
    writeFileSync(join(subDir, 'preview.md'), preview);
    writeFileSync(join(subDir, 'post.json'), JSON.stringify(post, null, 2));

    success(`r/${subId}: ${selectedObs.length} images downloaded, post prepared`);
  }

  saveState(state);
  state.stage = 'post';
  saveState(state);

  // Show previews
  heading('Post Previews');
  for (const subId of state.targets) {
    const post = state.posts[subId];
    if (!post) continue;
    console.log(`\x1b[1mr/${subId}\x1b[0m`);
    console.log(`  Title: ${post.title}`);
    console.log(`  Images: ${post.images.length}`);
    console.log(`  Body: ${post.body.slice(0, 80)}...`);
    console.log();
  }
  success('All posts prepared!');
}

// ---- Reddit API helpers ----
function loadRedditCredentials() {
  const envPath = join(ROOT, '.env');
  if (!existsSync(envPath)) return null;
  const env = {};
  readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
  });
  if (env.REDDIT_CLIENT_ID && env.REDDIT_CLIENT_SECRET && env.REDDIT_USERNAME && env.REDDIT_PASSWORD) {
    return env;
  }
  return null;
}

async function getRedditToken(creds) {
  const auth = Buffer.from(`${creds.REDDIT_CLIENT_ID}:${creds.REDDIT_CLIENT_SECRET}`).toString('base64');
  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'WhatsThatBugGame/1.0 (by /u/' + creds.REDDIT_USERNAME + ')',
    },
    body: `grant_type=password&username=${encodeURIComponent(creds.REDDIT_USERNAME)}&password=${encodeURIComponent(creds.REDDIT_PASSWORD)}`,
  });
  if (!res.ok) throw new Error(`Reddit auth failed: ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`Reddit auth error: ${data.error}`);
  return data.access_token;
}

async function uploadImageToReddit(token, imagePath, userAgent) {
  const filename = imagePath.split('/').pop();
  const ext = filename.split('.').pop().toLowerCase();
  const mimeType = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' }[ext] || 'image/jpeg';

  // Step 1: Get upload lease
  const leaseRes = await fetch('https://oauth.reddit.com/api/media/asset.json', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'User-Agent': userAgent,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `filepath=${encodeURIComponent(filename)}&mimetype=${encodeURIComponent(mimeType)}`,
  });
  if (!leaseRes.ok) throw new Error(`Upload lease failed: ${leaseRes.status}`);
  const lease = await leaseRes.json();

  // Step 2: Upload to S3
  const uploadUrl = `https:${lease.args.action}`;
  const formData = new FormData();
  for (const field of lease.args.fields) {
    formData.append(field.name, field.value);
  }
  const imageBuffer = readFileSync(imagePath);
  formData.append('file', new Blob([imageBuffer], { type: mimeType }), filename);

  const uploadRes = await fetch(uploadUrl, { method: 'POST', body: formData });
  if (!uploadRes.ok && uploadRes.status !== 201) {
    throw new Error(`S3 upload failed: ${uploadRes.status}`);
  }

  return lease.asset.asset_id;
}

async function submitGalleryPost(token, subreddit, title, body, assetIds, captions, userAgent) {
  const items = assetIds.map((id, i) => ({
    media_id: id,
    caption: captions[i] || '',
    outbound_url: '',
  }));

  const res = await fetch('https://oauth.reddit.com/api/submit', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'User-Agent': userAgent,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sr: subreddit,
      kind: 'gallery',
      title,
      text: body,
      items,
      resubmit: true,
      send_replies: true,
    }),
  });
  if (!res.ok) throw new Error(`Submit failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  if (!data.json?.data?.url) {
    throw new Error(`Submit error: ${JSON.stringify(data.json?.errors || data)}`);
  }
  return data.json.data.url;
}

// ---- Stage 4: Post ----
async function stagePost(state) {
  heading('Stage 4: Post to Reddit');

  const creds = loadRedditCredentials();
  if (!creds) {
    warn('No Reddit credentials found in .env');
    warn('To enable API posting, add to .env:');
    console.log('  REDDIT_CLIENT_ID=...');
    console.log('  REDDIT_CLIENT_SECRET=...');
    console.log('  REDDIT_USERNAME=...');
    console.log('  REDDIT_PASSWORD=...');
    console.log();
  }

  let token = null;
  let userAgent = null;
  if (creds) {
    userAgent = `WhatsThatBugGame/1.0 (by /u/${creds.REDDIT_USERNAME})`;
    try {
      token = await getRedditToken(creds);
      success('Reddit authenticated!');
    } catch (e) {
      warn(`Reddit auth failed: ${e.message}`);
      warn('Falling back to manual posting.');
    }
  }

  for (const subId of state.targets) {
    const post = state.posts[subId];
    if (!post) continue;

    if (state.posted[subId]) {
      log(`r/${subId}: already posted, skipping`);
      continue;
    }

    console.log(`\n\x1b[1mr/${subId}\x1b[0m — ${post.title}`);
    console.log(`  ${post.images.length} images`);

    const action = await ask(`  [A]PI post / [M]anual / [S]kip / [Q]uit: `);

    if (action.toLowerCase() === 'q') {
      log('Quitting. Run again to resume.');
      saveState(state);
      process.exit(0);
    }

    if (action.toLowerCase() === 's') {
      log('Skipped.');
      continue;
    }

    if (action.toLowerCase() === 'a') {
      if (!token) {
        warn('No Reddit token available. Use manual mode.');
        continue;
      }

      try {
        log('Uploading images...');
        const assetIds = [];
        for (const img of post.images) {
          const imgPath = join(POSTS_DIR, `r-${subId}`, img.filename);
          const assetId = await uploadImageToReddit(token, imgPath, userAgent);
          assetIds.push(assetId);
          log(`  Uploaded: ${img.filename}`);
          await sleep(1000);
        }

        log('Submitting gallery post...');
        const url = await submitGalleryPost(token, subId, post.title, post.body, assetIds, post.captions, userAgent);
        state.posted[subId] = { url, timestamp: new Date().toISOString(), method: 'api' };
        recordPostedPhotos(subId, post.images.map(img => img.obs_id));
        saveState(state);
        success(`Posted! ${url}`);
      } catch (e) {
        warn(`API posting failed: ${e.message}`);
        warn('Try manual posting instead.');
      }

    } else {
      // Manual mode
      console.log('\n  ── Manual Posting Instructions ──');
      console.log(`  1. Go to: https://www.reddit.com/r/${subId}/submit`);
      console.log(`  2. Select "Images & Video" or "Gallery"`);
      console.log(`  3. Title: ${post.title}`);
      console.log(`  4. Upload images from: scripts/reddit-posts/r-${subId}/`);
      console.log(`  5. Add captions:`);
      post.captions.forEach((c, i) => console.log(`     ${i + 1}. ${c}`));
      console.log(`  6. Body text:\n`);
      console.log(`     ${post.body.replace(/\n/g, '\n     ')}`);
      console.log();

      // Try to open the browser
      import('child_process').then(cp => {
        cp.exec(`open "https://www.reddit.com/r/${subId}/submit"`);
      });

      const done = await ask('  Mark as posted? (y/N): ');
      if (done.toLowerCase() === 'y') {
        state.posted[subId] = { timestamp: new Date().toISOString(), method: 'manual' };
        recordPostedPhotos(subId, post.images.map(img => img.obs_id));
        saveState(state);
        success('Marked as posted!');
      }
    }
  }

  saveState(state);
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
