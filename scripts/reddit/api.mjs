#!/usr/bin/env node

/**
 * Reddit API module — OAuth2 auth, image upload, and post submission.
 *
 * These functions use Reddit's official API endpoints. They require an
 * approved Reddit API application (script type) with credentials stored
 * in .env at the project root. The module degrades gracefully when
 * credentials are missing.
 *
 * Run directly for a quick auth/identity test:
 *   node scripts/reddit/api.mjs [--upload]
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

// ── Credential loading ──────────────────────────────────────────────────────

const REQUIRED_KEYS = [
  'REDDIT_CLIENT_ID',
  'REDDIT_CLIENT_SECRET',
  'REDDIT_USERNAME',
  'REDDIT_PASSWORD',
];

/**
 * Reads Reddit credentials from the project .env file.
 * Returns an object with the four credential keys, or null if any are missing.
 */
export function loadCredentials() {
  const envPath = join(ROOT, '.env');
  if (!existsSync(envPath)) return null;

  const env = {};
  readFileSync(envPath, 'utf-8')
    .split('\n')
    .forEach((line) => {
      const match = line.match(/^([^#=][^=]*)=(.*)$/);
      if (match) env[match[1].trim()] = match[2].trim();
    });

  const hasAll = REQUIRED_KEYS.every((k) => env[k]);
  if (!hasAll) return null;

  // Return only the keys we care about
  return Object.fromEntries(REQUIRED_KEYS.map((k) => [k, env[k]]));
}

// ── OAuth2 token ─────────────────────────────────────────────────────────────

/**
 * Obtains an OAuth2 bearer token using the password grant.
 * Returns { token, userAgent }.
 */
export async function getToken(creds) {
  const userAgent = `WhatsThatBugGame/1.0 (by /u/${creds.REDDIT_USERNAME})`;
  const auth = Buffer.from(
    `${creds.REDDIT_CLIENT_ID}:${creds.REDDIT_CLIENT_SECRET}`,
  ).toString('base64');

  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': userAgent,
    },
    body: `grant_type=password&username=${encodeURIComponent(creds.REDDIT_USERNAME)}&password=${encodeURIComponent(creds.REDDIT_PASSWORD)}`,
  });

  if (!res.ok) throw new Error(`Reddit auth failed: ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`Reddit auth error: ${data.error}`);

  return { token: data.access_token, userAgent };
}

// ── Image upload ─────────────────────────────────────────────────────────────

const MIME_TYPES = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
};

/**
 * Uploads an image to Reddit via the media asset lease + S3 flow.
 * Returns the asset_id string needed for gallery submissions.
 */
export async function uploadImage(token, imagePath, userAgent) {
  const filename = imagePath.split('/').pop();
  const ext = filename.split('.').pop().toLowerCase();
  const mimeType = MIME_TYPES[ext] || 'image/jpeg';

  // Step 1: Request an upload lease from Reddit
  const leaseRes = await fetch(
    'https://oauth.reddit.com/api/media/asset.json',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': userAgent,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `filepath=${encodeURIComponent(filename)}&mimetype=${encodeURIComponent(mimeType)}`,
    },
  );
  if (!leaseRes.ok) throw new Error(`Upload lease failed: ${leaseRes.status}`);
  const lease = await leaseRes.json();

  // Step 2: Upload the file to the S3 endpoint Reddit provided
  const uploadUrl = `https:${lease.args.action}`;
  const formData = new FormData();
  for (const field of lease.args.fields) {
    formData.append(field.name, field.value);
  }
  const imageBuffer = readFileSync(imagePath);
  formData.append(
    'file',
    new Blob([imageBuffer], { type: mimeType }),
    filename,
  );

  const uploadRes = await fetch(uploadUrl, { method: 'POST', body: formData });
  if (!uploadRes.ok && uploadRes.status !== 201) {
    throw new Error(`S3 upload failed: ${uploadRes.status}`);
  }

  return lease.asset.asset_id;
}

// ── Post submission ──────────────────────────────────────────────────────────

/**
 * Submits a gallery post (multiple images). Returns the post URL.
 */
export async function submitGallery(
  token,
  subreddit,
  title,
  body,
  assetIds,
  captions,
  userAgent,
) {
  const items = assetIds.map((id, i) => ({
    media_id: id,
    caption: captions[i] || '',
    outbound_url: '',
  }));

  const res = await fetch('https://oauth.reddit.com/api/submit', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
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
    throw new Error(
      `Submit error: ${JSON.stringify(data.json?.errors || data)}`,
    );
  }
  return data.json.data.url;
}

/**
 * Submits a text (self) post. Returns the post URL.
 */
export async function submitText(token, subreddit, title, body, userAgent) {
  const res = await fetch('https://oauth.reddit.com/api/submit', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': userAgent,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sr: subreddit,
      kind: 'self',
      title,
      text: body,
      resubmit: true,
      send_replies: true,
    }),
  });

  if (!res.ok) throw new Error(`Submit failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  if (!data.json?.data?.url) {
    throw new Error(
      `Submit error: ${JSON.stringify(data.json?.errors || data)}`,
    );
  }
  return data.json.data.url;
}

/**
 * Posts a comment on an existing post.
 * `postFullname` is the thing_id like "t3_abc123".
 */
export async function submitComment(token, postFullname, body, userAgent) {
  const res = await fetch('https://oauth.reddit.com/api/comment', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': userAgent,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `thing_id=${encodeURIComponent(postFullname)}&text=${encodeURIComponent(body)}`,
  });

  if (!res.ok) throw new Error(`Comment failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  if (data.json?.errors?.length) {
    throw new Error(`Comment error: ${JSON.stringify(data.json.errors)}`);
  }
  return data;
}

/**
 * Returns the authenticated user's identity (username, karma, etc.).
 */
export async function getIdentity(token, userAgent) {
  const res = await fetch('https://oauth.reddit.com/api/v1/me', {
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': userAgent,
    },
  });

  if (!res.ok) throw new Error(`Identity request failed: ${res.status}`);
  return res.json();
}

// ── CLI test mode ────────────────────────────────────────────────────────────

const log = (msg) => console.log(`\x1b[36m▸\x1b[0m ${msg}`);
const success = (msg) => console.log(`\x1b[32m✓\x1b[0m ${msg}`);
const warn = (msg) => console.log(`\x1b[33m!\x1b[0m ${msg}`);
const fail = (msg) => console.log(`\x1b[31m✗\x1b[0m ${msg}`);

async function main() {
  console.log('\n\x1b[1mReddit API — test mode\x1b[0m\n');

  // 1. Load credentials
  log('Loading credentials from .env...');
  const creds = loadCredentials();
  if (!creds) {
    warn('No Reddit credentials found in .env.');
    warn('Required keys: REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD');
    process.exit(1);
  }
  success(`Credentials loaded for u/${creds.REDDIT_USERNAME}`);

  // 2. Auth
  log('Requesting OAuth2 token...');
  const { token, userAgent } = await getToken(creds);
  success('Token obtained');

  // 3. Identity
  log('Fetching identity...');
  const identity = await getIdentity(token, userAgent);
  success(`Logged in as: u/${identity.name}`);
  log(`  Comment karma: ${identity.comment_karma}`);
  log(`  Link karma:    ${identity.link_karma}`);

  // 4. Optional: image upload test
  const doUpload = process.argv.includes('--upload');
  if (doUpload) {
    const testImage = join(__dirname, '..', 'reddit-posts', 'r-spiders', '001.jpg');
    if (!existsSync(testImage)) {
      warn(`Test image not found: ${testImage}`);
      warn('Skipping upload test.');
    } else {
      log(`Uploading test image: ${testImage}`);
      const assetId = await uploadImage(token, testImage, userAgent);
      success(`Upload successful — asset_id: ${assetId}`);
    }
  } else {
    log('Pass --upload to test image upload (uses scripts/reddit-posts/r-spiders/001.jpg)');
  }

  console.log('\n\x1b[32mAll tests passed.\x1b[0m\n');
}

// Run if executed directly (not imported)
// In ESM, there's no require.main, so we compare the resolved file URL.
const isDirectRun =
  process.argv[1] &&
  new URL(import.meta.url).pathname === new URL(`file://${process.argv[1]}`).pathname;

if (isDirectRun) {
  main().catch((err) => {
    fail(err.message);
    process.exit(1);
  });
}
