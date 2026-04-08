#!/usr/bin/env node

/**
 * Main CLI for the Reddit content pipeline.
 *
 * Commands:
 *   generate        Create a posting calendar and fetch content candidates
 *   review          Open browser UI for curation
 *   prepare         Download images and finalize posts
 *   post            Post the next due item to Reddit via Playwright
 *   status          Show calendar, post history, and per-sub stats
 *   log-engagement  Record post performance
 *
 * Usage:
 *   node scripts/reddit/pipeline.mjs [command]
 *   npm run reddit [command]
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join, extname } from 'path';
import { createInterface } from 'readline';

// ── Module imports ──────────────────────────────────────────────────────────

import { CACHE_DIR, POSTS_DIR, SUBREDDITS, CONTENT_TYPES } from './config.mjs';
import { loadCredentials, getToken, uploadImage, submitGallery, submitText, submitComment } from './api.mjs';
import { fetchGalleryCandidates, pickChallengeCandidates, scanExistingPool } from './content.mjs';
import { generateTitle, generateBody, generateFollowupComment, generateCaptions } from './copy.mjs';
import { loadCalendar, saveCalendar, generateWeekSlots, findDuePost, getUpcomingSlots } from './calendar.mjs';
import { loadPostLog, savePostLog, logPost, updateEngagement, loadPostedPhotos, recordPostedPhotos, getPostedIds, getSubStats } from './tracker.mjs';
import { ensureSession, postGallery, postText, postComment, closeBrowser } from './poster.mjs';
import { startReviewServer } from './review-server.mjs';

// ── State file ──────────────────────────────────────────────────────────────

const STATE_FILE = join(CACHE_DIR, 'reddit-content-state.json');

function loadState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    return { candidates: {}, selections: {} };
  }
}

function saveState(state) {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ── CLI styling helpers ─────────────────────────────────────────────────────

const log     = (msg) => console.log(`\x1b[36m▸\x1b[0m ${msg}`);
const ok      = (msg) => console.log(`\x1b[32m✓\x1b[0m ${msg}`);
const warn    = (msg) => console.log(`\x1b[33m⚠\x1b[0m ${msg}`);
const heading = (text) => console.log(`\n\x1b[1m\x1b[35m═══ ${text} ═══\x1b[0m\n`);
const bold    = (text) => `\x1b[1m${text}\x1b[0m`;

// ── Utility helpers ─────────────────────────────────────────────────────────

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((done) => {
    rl.question(question, (answer) => {
      rl.close();
      done(answer.trim());
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Format an ISO date string as a readable short date + time.
 * e.g. "Tue Apr 8, 7:00 AM"
 */
function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

/**
 * Status icon for calendar slots.
 */
function statusIcon(status) {
  if (status === 'posted') return '\x1b[32m✓\x1b[0m';
  if (status === 'ready')  return '\x1b[33m●\x1b[0m';
  return '○';
}

/**
 * Get the sub directory for downloaded images.
 */
function subPostDir(subId) {
  return join(POSTS_DIR, `r-${subId}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// COMMANDS
// ═══════════════════════════════════════════════════════════════════════════

// ── generate ────────────────────────────────────────────────────────────────

async function cmdGenerate() {
  heading('Generate Posting Calendar');

  // 1. Load post log from tracker
  const postLog = loadPostLog();
  log(`Post log loaded (${postLog.length} entries)`);

  // 2. Check for existing unposted slots
  const cal = loadCalendar();
  const unposted = cal.slots.filter(s => s.status !== 'posted');
  if (unposted.length > 0) {
    warn(`Found ${unposted.length} unposted slot(s) in existing calendar.`);
    const answer = await ask('  Overwrite existing calendar? (y/N): ');
    if (answer.toLowerCase() !== 'y') {
      log('Keeping existing calendar. Exiting.');
      return;
    }
  }

  // 3. Generate week slots
  const slots = generateWeekSlots(new Date(), postLog);
  log(`Generated ${slots.length} slot(s):\n`);

  for (const slot of slots) {
    const sub = SUBREDDITS[slot.subId];
    const typeLabel = CONTENT_TYPES[slot.contentType]?.label ?? slot.contentType;
    console.log(`  ${statusIcon(slot.status)}  ${bold(sub.name)}  ${typeLabel}  ${fmtDate(slot.scheduledAt)}`);
  }
  console.log('');

  // 4. Fetch candidates for each slot
  const state = loadState();
  state.candidates = {};
  state.selections = {};
  const postedIds = getPostedIds();

  for (const slot of slots) {
    const subId = slot.subId;
    const sub = SUBREDDITS[subId];

    if (slot.contentType === 'gallery') {
      log(`Fetching gallery candidates for ${sub.name}...`);
      const apiCandidates = await fetchGalleryCandidates(subId, postedIds);
      const poolCandidates = scanExistingPool(subId, postedIds);
      // Merge, dedup by id
      const seen = new Set();
      const merged = [];
      for (const c of [...apiCandidates, ...poolCandidates]) {
        if (!seen.has(c.id)) {
          seen.add(c.id);
          merged.push(c);
        }
      }
      state.candidates[subId] = merged;
      ok(`${merged.length} gallery candidates for ${sub.name}`);

    } else if (slot.contentType === 'challenge') {
      log(`Picking challenge candidates for ${sub.name}...`);
      const candidates = pickChallengeCandidates(subId, postedIds, 10);
      state.candidates[subId] = candidates;
      ok(`${candidates.length} challenge candidates for ${sub.name}`);

    } else {
      // text — no candidates needed
      state.candidates[subId] = [];
      log(`Text post for ${sub.name} — no candidates needed`);
    }
  }

  // 5. Generate initial title/body for each slot
  for (const slot of slots) {
    const sub = SUBREDDITS[slot.subId];
    const candidates = state.candidates[slot.subId] || [];

    // Extract credits from candidates for body generation
    const credits = candidates.slice(0, 6).map(c => {
      const match = c.attribution?.match(/\(c\)\s*([^,]+)/i);
      return match ? match[1].trim() : 'Unknown';
    });

    const title = generateTitle(slot.contentType, slot.subId, sub);
    const body = generateBody(slot.contentType, sub, {
      credits,
      includeGameLink: false,
    });

    slot.postData = {
      title,
      body,
      gameLinkInBody: false,
    };
  }

  // 6. Save calendar and state
  const newCal = {
    slots,
    generatedAt: new Date().toISOString(),
  };
  saveCalendar(newCal);
  saveState(state);

  ok('Calendar and candidates saved.');
  log(`Next step: run ${bold('npm run reddit-review')} to curate content.\n`);
}

// ── review ──────────────────────────────────────────────────────────────────

async function cmdReview() {
  heading('Review & Curate Content');

  const cal = loadCalendar();
  const state = loadState();

  // Filter to pending slots only
  const pendingSlots = cal.slots.filter(s => s.status === 'pending');
  if (pendingSlots.length === 0) {
    warn('No pending slots to review. Run "generate" first.');
    return;
  }

  log(`${pendingSlots.length} pending slot(s) to review.`);

  // Build candidate data and sub meta for the review UI
  const candidateData = {};
  const subMeta = {};

  for (const slot of pendingSlots) {
    const sub = SUBREDDITS[slot.subId];
    candidateData[slot.subId] = state.candidates[slot.subId] || [];
    subMeta[slot.subId] = {
      name: sub.name,
      contentType: slot.contentType,
      title: slot.postData?.title ?? '',
      body: slot.postData?.body ?? '',
      gameLinkInBody: slot.postData?.gameLinkInBody ?? false,
      scheduledAt: slot.scheduledAt,
    };
  }

  // Start review server — resolves when user saves from browser
  log('Starting review server...');
  await startReviewServer(candidateData, subMeta, pendingSlots, (savedData) => {
    // onSave callback: apply edits back to calendar and state
    for (const [subId, data] of Object.entries(savedData)) {
      // Save selections to state
      if (data.selections) {
        state.selections[subId] = data.selections;
      }

      // Save edited title/body/gameLinkInBody to calendar slot
      const slot = cal.slots.find(s => s.subId === subId && s.status === 'pending');
      if (slot && slot.postData) {
        if (data.title !== undefined) slot.postData.title = data.title;
        if (data.body !== undefined) slot.postData.body = data.body;
        if (data.gameLinkInBody !== undefined) slot.postData.gameLinkInBody = data.gameLinkInBody;
      }
    }

    saveCalendar(cal);
    saveState(state);
    ok('Selections and edits saved.');
  });

  ok('Review complete.');
  log(`Next step: run ${bold('npm run reddit-prepare')} to download images and finalize.\n`);
}

// ── prepare ─────────────────────────────────────────────────────────────────

async function cmdPrepare() {
  heading('Prepare Posts');

  const cal = loadCalendar();
  const state = loadState();
  let preparedCount = 0;

  for (const slot of cal.slots) {
    if (slot.status !== 'pending') continue;

    const subId = slot.subId;
    const sub = SUBREDDITS[subId];
    const selections = state.selections[subId];

    // Text posts don't need image downloads
    if (slot.contentType === 'text') {
      const title = slot.postData?.title ?? generateTitle('text', subId, sub);
      const body = slot.postData?.body ?? '[Text post — write body manually]';

      const dir = subPostDir(subId);
      mkdirSync(dir, { recursive: true });

      const postData = { title, body, captions: [], followupComment: null, images: [] };
      writeFileSync(join(dir, 'post.json'), JSON.stringify(postData, null, 2));
      writeFileSync(join(dir, 'preview.md'), buildPreviewMd(subId, sub, postData));

      slot.postData = { ...slot.postData, ...postData };
      slot.status = 'ready';
      ok(`Text post for ${sub.name} is ready.`);
      preparedCount++;
      continue;
    }

    // Gallery / challenge: need selections
    if (!selections || selections.length === 0) {
      warn(`No selections for ${sub.name} — skipping. Run "review" first.`);
      continue;
    }

    // Find the selected observations from candidates
    const allCandidates = state.candidates[subId] || [];
    const selectedObs = selections
      .map(id => allCandidates.find(c => String(c.id) === String(id)))
      .filter(Boolean);

    if (selectedObs.length === 0) {
      warn(`Selected observations not found in candidates for ${sub.name} — skipping.`);
      continue;
    }

    log(`Preparing ${sub.name}: ${selectedObs.length} image(s) to download...`);

    // Create post directory
    const dir = subPostDir(subId);
    mkdirSync(dir, { recursive: true });

    // Download images
    const images = [];
    for (let i = 0; i < selectedObs.length; i++) {
      const obs = selectedObs[i];

      // Try original, then large, then medium
      const urls = [obs.photo_url_original, obs.photo_url_large, obs.photo_url].filter(Boolean);
      let downloaded = false;

      for (const url of urls) {
        try {
          const res = await fetch(url);
          if (!res.ok) continue;

          const buffer = Buffer.from(await res.arrayBuffer());
          // Determine extension from URL or content type
          const urlExt = extname(new URL(url).pathname) || '.jpg';
          const filename = `${String(i + 1).padStart(3, '0')}${urlExt}`;
          const filePath = join(dir, filename);
          writeFileSync(filePath, buffer);

          images.push({
            filename,
            caption: '',
            obs_id: obs.id,
            inat_url: obs.inat_url,
          });

          ok(`  Downloaded ${filename} (obs ${obs.id})`);
          downloaded = true;
          break;
        } catch (err) {
          // Try next URL
        }
      }

      if (!downloaded) {
        warn(`  Failed to download image for obs ${obs.id}`);
      }

      // Rate limit between downloads
      if (i < selectedObs.length - 1) await sleep(500);
    }

    // Use edited title/body from review, fall back to generated
    const title = slot.postData?.title ?? generateTitle(slot.contentType, subId, sub);
    const body = slot.postData?.body ?? generateBody(slot.contentType, sub, {
      credits: selectedObs.map(o => {
        const match = o.attribution?.match(/\(c\)\s*([^,]+)/i);
        return match ? match[1].trim() : 'Unknown';
      }),
      includeGameLink: slot.postData?.gameLinkInBody ?? false,
    });

    // Generate captions
    const captions = generateCaptions(selectedObs);
    images.forEach((img, i) => { img.caption = captions[i] || ''; });

    // Generate follow-up comment if game link is NOT in body
    const gameLinkInBody = slot.postData?.gameLinkInBody ?? false;
    const followupComment = gameLinkInBody ? null : generateFollowupComment(slot.contentType, sub);

    const postData = {
      title,
      body,
      captions,
      followupComment,
      images,
    };

    // Write preview and post data
    writeFileSync(join(dir, 'post.json'), JSON.stringify(postData, null, 2));
    writeFileSync(join(dir, 'preview.md'), buildPreviewMd(subId, sub, postData));

    slot.postData = { ...slot.postData, ...postData };
    slot.status = 'ready';
    ok(`${sub.name} ready (${images.length} image(s))`);
    preparedCount++;
  }

  saveCalendar(cal);

  console.log('');
  if (preparedCount === 0) {
    warn('No posts were prepared. Make sure you have reviewed and selected content.');
  } else {
    // Show preview of all ready posts
    heading('Ready Posts');
    for (const slot of cal.slots.filter(s => s.status === 'ready')) {
      const sub = SUBREDDITS[slot.subId];
      const pd = slot.postData;
      console.log(`  ${statusIcon('ready')}  ${bold(sub.name)}  ${fmtDate(slot.scheduledAt)}`);
      console.log(`     Title: ${pd.title}`);
      if (pd.images?.length) console.log(`     Images: ${pd.images.length}`);
      console.log('');
    }
    log(`Next step: run ${bold('npm run reddit-post')} when ready to publish.\n`);
  }
}

/**
 * Build a human-readable preview markdown string for a post.
 */
function buildPreviewMd(subId, sub, postData) {
  const lines = [
    `# ${sub.name} — Post Preview`,
    '',
    `**Title:** ${postData.title}`,
    '',
    '**Body:**',
    postData.body,
    '',
  ];

  if (postData.images?.length) {
    lines.push(`**Images:** ${postData.images.length}`);
    for (const img of postData.images) {
      lines.push(`- ${img.filename} — ${img.caption} ([iNat](${img.inat_url}))`);
    }
    lines.push('');
  }

  if (postData.followupComment) {
    lines.push('**Follow-up comment:**');
    lines.push(postData.followupComment);
    lines.push('');
  }

  return lines.join('\n');
}

// ── post ────────────────────────────────────────────────────────────────────

async function cmdPost() {
  heading('Post to Reddit');

  const cal = loadCalendar();

  // 1. Find a due post, or let user pick from ready slots
  let slot = findDuePost(cal.slots);

  if (!slot) {
    const readySlots = cal.slots.filter(s => s.status === 'ready');
    if (readySlots.length === 0) {
      warn('No ready posts. Run "prepare" first.');
      return;
    }

    log('No posts are due yet. Ready posts:');
    readySlots.forEach((s, i) => {
      const sub = SUBREDDITS[s.subId];
      console.log(`  [${i + 1}] ${sub.name}  ${fmtDate(s.scheduledAt)}  "${s.postData?.title ?? '(no title)'}"`);
    });
    console.log('');
    const pick = await ask('  Post which? (number, or Enter to cancel): ');
    const idx = parseInt(pick, 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= readySlots.length) {
      log('Cancelled.');
      return;
    }
    slot = readySlots[idx];
  } else {
    log(`Due post found: ${SUBREDDITS[slot.subId].name}`);
  }

  const sub = SUBREDDITS[slot.subId];
  const pd = slot.postData;
  const subredditName = slot.subId; // poster expects the sub key, not the display name

  // 2. Show full post preview
  heading(`Posting to ${sub.name}`);
  console.log(`  ${bold('Title:')} ${pd.title}`);
  console.log(`  ${bold('Body:')}`);
  pd.body.split('\n').forEach(line => console.log(`    ${line}`));
  if (pd.images?.length) {
    console.log(`  ${bold('Images:')} ${pd.images.length}`);
    pd.images.forEach(img => console.log(`    - ${img.filename}: ${img.caption}`));
  }
  if (pd.followupComment) {
    console.log(`  ${bold('Follow-up comment:')} ${pd.followupComment}`);
  }
  console.log('');

  // 3. Ask for confirmation
  // Check if API credentials exist — offer choice if so
  const creds = loadCredentials();
  let method = 'playwright';

  if (creds) {
    const choice = await ask('  Post via [P]laywright (browser) or [A]PI? (P/a): ');
    if (choice.toLowerCase() === 'a') {
      method = 'api';
    }
  } else {
    const confirm = await ask('  Proceed with Playwright posting? (y/N): ');
    if (confirm.toLowerCase() !== 'y') {
      log('Cancelled.');
      return;
    }
  }

  let postUrl = null;

  if (method === 'api') {
    // API posting path
    postUrl = await postViaApi(creds, slot, sub, pd);
  } else {
    // Playwright posting path
    postUrl = await postViaPlaywright(slot, sub, pd, subredditName);
  }

  if (!postUrl) {
    warn('Post was not submitted (declined or failed).');
    return;
  }

  // 5. Update tracking
  slot.status = 'posted';
  slot.postData.url = postUrl;
  saveCalendar(cal);

  const observationIds = (pd.images || []).map(img => String(img.obs_id)).filter(Boolean);
  logPost({
    subId: slot.subId,
    contentType: slot.contentType,
    url: postUrl,
    title: pd.title,
    observationIds,
  });
  if (observationIds.length > 0) {
    recordPostedPhotos(slot.subId, observationIds);
  }

  ok(`Post tracked and photos recorded.`);
}

async function postViaPlaywright(slot, sub, pd, subredditName) {
  log('Launching browser...');
  const { browser, page } = await ensureSession();

  let postUrl = null;
  try {
    if (slot.contentType === 'text') {
      postUrl = await postText(page, subredditName, pd.title, pd.body);
    } else {
      // Gallery or challenge — both use image posting
      const dir = subPostDir(slot.subId);
      const imagePaths = (pd.images || []).map(img => join(dir, img.filename));
      postUrl = await postGallery(page, subredditName, pd.title, pd.body, imagePaths, pd.captions || []);
    }

    // Follow-up comment if configured
    if (postUrl && pd.followupComment) {
      log('Waiting 5s before posting follow-up comment...');
      await sleep(5000);
      await postComment(page, postUrl, pd.followupComment);
      ok('Follow-up comment posted.');
    }
  } finally {
    await closeBrowser(browser);
  }

  return postUrl;
}

async function postViaApi(creds, slot, sub, pd) {
  log('Authenticating via Reddit API...');
  const { token, userAgent } = await getToken(creds);
  ok('Authenticated');

  let postUrl = null;
  const subredditName = slot.subId;

  if (slot.contentType === 'text') {
    postUrl = await submitText(token, subredditName, pd.title, pd.body, userAgent);
  } else {
    // Upload images first
    const dir = subPostDir(slot.subId);
    const assetIds = [];
    for (const img of pd.images || []) {
      const imgPath = join(dir, img.filename);
      log(`Uploading ${img.filename}...`);
      const assetId = await uploadImage(token, imgPath, userAgent);
      assetIds.push(assetId);
      ok(`  Uploaded (asset: ${assetId})`);
    }

    postUrl = await submitGallery(token, subredditName, pd.title, pd.body, assetIds, pd.captions || [], userAgent);
  }

  if (postUrl) {
    ok(`Post created: ${postUrl}`);

    // Follow-up comment
    if (pd.followupComment) {
      log('Posting follow-up comment via API...');
      // Extract thing_id from URL — Reddit post URLs contain the post ID
      // URL format: https://www.reddit.com/r/sub/comments/ABC123/...
      const match = postUrl.match(/\/comments\/([a-z0-9]+)/i);
      if (match) {
        const thingId = `t3_${match[1]}`;
        await submitComment(token, thingId, pd.followupComment, userAgent);
        ok('Follow-up comment posted.');
      } else {
        warn('Could not extract post ID for follow-up comment.');
      }
    }
  }

  return postUrl;
}

// ── status ──────────────────────────────────────────────────────────────────

async function cmdStatus() {
  heading('Pipeline Status');

  const cal = loadCalendar();
  const postLog = loadPostLog();

  // Calendar overview
  if (cal.slots.length === 0) {
    log('No calendar generated yet. Run "generate" to create one.');
  } else {
    console.log(`  Calendar generated: ${fmtDate(cal.generatedAt)}\n`);
    for (const slot of cal.slots) {
      const sub = SUBREDDITS[slot.subId];
      const typeLabel = CONTENT_TYPES[slot.contentType]?.label ?? slot.contentType;
      const title = slot.postData?.title ? `  "${slot.postData.title}"` : '';
      console.log(`  ${statusIcon(slot.status)}  ${bold(sub?.name ?? slot.subId)}  ${typeLabel}  ${fmtDate(slot.scheduledAt)}${title}`);
    }
    console.log('');
    console.log(`  Legend: \x1b[32m✓\x1b[0m posted  \x1b[33m●\x1b[0m ready  ○ pending\n`);
  }

  // Recent post history
  if (postLog.length > 0) {
    heading('Recent Posts');
    const recent = postLog.slice(-5).reverse();
    for (const entry of recent) {
      const sub = SUBREDDITS[entry.subId];
      const date = fmtDate(entry.timestamp);
      const eng = entry.engagement
        ? `  ↑${entry.engagement.upvotes ?? '?'} 💬${entry.engagement.comments ?? '?'}`
        : '';
      console.log(`  ${bold(sub?.name ?? entry.subId)}  ${date}  "${entry.title}"${eng}`);
      if (entry.url) console.log(`    ${entry.url}`);
    }
    console.log('');
  }

  // Per-sub stats
  heading('Per-Subreddit Stats');
  const subIds = [...new Set(postLog.map(e => e.subId))];
  if (subIds.length === 0) {
    log('No posts yet — stats will appear after your first post.');
  } else {
    for (const subId of subIds) {
      const stats = getSubStats(subId);
      const sub = SUBREDDITS[subId];
      const name = sub?.name ?? subId;
      const avg = stats.avgUpvotes !== null ? `avg ↑${Math.round(stats.avgUpvotes)}` : 'no engagement data';
      const last = stats.lastPosted ? fmtDate(stats.lastPosted) : 'never';
      console.log(`  ${bold(name)}  ${stats.totalPosts} post(s)  ${avg}  last: ${last}`);
    }
    console.log('');
  }
}

// ── log-engagement ──────────────────────────────────────────────────────────

async function cmdLogEngagement() {
  heading('Log Post Engagement');

  const postLog = loadPostLog();
  const needsEngagement = postLog
    .map((entry, index) => ({ ...entry, index }))
    .filter(e => !e.engagement);

  if (needsEngagement.length === 0) {
    ok('All posts have engagement data recorded. Nothing to do.');
    return;
  }

  log(`${needsEngagement.length} post(s) without engagement data:\n`);

  for (const entry of needsEngagement) {
    const sub = SUBREDDITS[entry.subId];
    console.log(`  ${bold(sub?.name ?? entry.subId)}  ${fmtDate(entry.timestamp)}`);
    console.log(`  "${entry.title}"`);
    if (entry.url) console.log(`  ${entry.url}`);
    console.log('');

    const upvotesStr = await ask('  Upvotes (or Enter to skip): ');
    if (upvotesStr === '') {
      log('Skipped.');
      console.log('');
      continue;
    }

    const upvotes = parseInt(upvotesStr, 10);
    if (isNaN(upvotes)) {
      warn('Invalid number — skipping.');
      console.log('');
      continue;
    }

    const commentsStr = await ask('  Comments: ');
    const comments = parseInt(commentsStr, 10) || 0;

    updateEngagement(entry.index, { upvotes, comments });
    ok(`Engagement saved for "${entry.title}"`);
    console.log('');
  }

  ok('Engagement logging complete.');
}

// ═══════════════════════════════════════════════════════════════════════════
// CLI ROUTER
// ═══════════════════════════════════════════════════════════════════════════

function showHelp() {
  console.log(`
\x1b[1mReddit Content Pipeline\x1b[0m

Usage: node scripts/reddit/pipeline.mjs [command]

\x1b[1mCommands:\x1b[0m
  generate        Create a posting calendar and fetch content candidates
  review          Open browser UI for photo curation and post editing
  prepare         Download images and finalize posts for publishing
  post            Post the next due item to Reddit
  status          Show calendar, post history, and per-sub stats
  log-engagement  Record upvotes and comments for past posts

\x1b[1mWorkflow:\x1b[0m
  generate → review → prepare → post

\x1b[1mnpm scripts:\x1b[0m
  npm run reddit              Show this help
  npm run reddit-generate     Generate calendar
  npm run reddit-review       Open review UI
  npm run reddit-prepare      Prepare posts
  npm run reddit-post         Post to Reddit
  npm run reddit-status       View status
`);
}

const command = process.argv[2];

const COMMANDS = {
  generate: cmdGenerate,
  review: cmdReview,
  prepare: cmdPrepare,
  post: cmdPost,
  status: cmdStatus,
  'log-engagement': cmdLogEngagement,
};

if (!command || !COMMANDS[command]) {
  showHelp();
  if (command) {
    console.error(`\x1b[31mUnknown command: ${command}\x1b[0m\n`);
    process.exit(1);
  }
} else {
  COMMANDS[command]().catch(err => {
    console.error(`\n\x1b[31m✗ ${err.message}\x1b[0m`);
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  });
}
