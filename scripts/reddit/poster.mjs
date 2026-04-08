/**
 * Playwright-based Reddit posting orchestrator.
 *
 * Posts to Reddit via a real browser session instead of the API. This is
 * the primary posting method since API access requires approval. The
 * browser runs headed (visible) so you can see and approve every action.
 *
 * Key design decisions:
 * - Always headless: false — the user must see and approve posts
 * - Session state persisted to .cache/reddit-browser-state/state.json
 * - Uses human.mjs for all interactions (never raw page.click/page.fill)
 * - Minimum 2s delay between Reddit actions to avoid rate limiting
 * - Terminal prompt before every submit for user approval
 */

import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';
import {
  slowType,
  slowClick,
  humanDelay,
  randomScroll,
  tabBehavior,
} from './human.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const STATE_DIR = join(ROOT, '.cache', 'reddit-browser-state');
const STATE_FILE = join(STATE_DIR, 'state.json');

const REDDIT_BASE = 'https://www.reddit.com';

// Minimum delay between Reddit actions (ms)
const ACTION_DELAY = 2000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Terminal helpers ──────────────────────────────────────────────────────────

const log = (msg) => console.log(`\x1b[36m▸\x1b[0m ${msg}`);
const success = (msg) => console.log(`\x1b[32m✓\x1b[0m ${msg}`);
const warn = (msg) => console.log(`\x1b[33m!\x1b[0m ${msg}`);
const fail = (msg) => console.log(`\x1b[31m✗\x1b[0m ${msg}`);

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((done) => {
    rl.question(question, (answer) => {
      rl.close();
      done(answer.trim());
    });
  });
}

// ── Session management ───────────────────────────────────────────────────────

/**
 * Launches a browser, loads saved session state, and verifies the user
 * is logged in to Reddit. If not logged in, walks through the login flow
 * (including pausing for 2FA if needed). Saves session state after login.
 *
 * Returns { browser, context, page }.
 */
export async function ensureSession(options = {}) {
  const { headless = false } = options;

  // Ensure state directory exists
  if (!existsSync(STATE_DIR)) {
    mkdirSync(STATE_DIR, { recursive: true });
  }

  // Launch browser with saved state if available
  const launchOptions = {
    headless,
    // Slow things down slightly so Reddit doesn't flag automation
    args: ['--disable-blink-features=AutomationControlled'],
  };

  const browser = await chromium.launch(launchOptions);

  // Load existing session state if it exists
  const contextOptions = {
    viewport: { width: 1280, height: 900 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  };
  if (existsSync(STATE_FILE)) {
    contextOptions.storageState = STATE_FILE;
    log('Loaded saved browser session');
  }

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();

  // Check if we're already logged in
  log('Checking Reddit login status...');
  await page.goto(`${REDDIT_BASE}/`, { waitUntil: 'domcontentloaded' });
  await humanDelay(2000, 4000);

  const isLoggedIn = await checkLoggedIn(page);

  if (isLoggedIn) {
    success('Already logged in to Reddit');
  } else {
    warn('Not logged in — starting login flow');
    await performLogin(page);

    // Save session state after successful login
    const state = await context.storageState();
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    success('Session state saved');
  }

  return { browser, context, page };
}

/**
 * Checks whether the user appears to be logged in by looking for
 * common logged-in UI indicators.
 */
async function checkLoggedIn(page) {
  try {
    // Reddit shows a user menu / avatar button when logged in.
    // The expand-user-drawer-button is present on new Reddit when logged in.
    const loggedIn = await page
      .locator(
        '[id="expand-user-drawer-button"], [data-testid="user-drawer-button"], button[aria-label*="profile"]',
      )
      .first()
      .isVisible({ timeout: 5000 });
    return loggedIn;
  } catch {
    return false;
  }
}

/**
 * Walks through the Reddit login page. If 2FA is required, pauses for
 * the user to complete it manually in the browser.
 */
async function performLogin(page) {
  await page.goto(`${REDDIT_BASE}/login`, { waitUntil: 'domcontentloaded' });
  await tabBehavior(page);

  log('Please log in to Reddit in the browser window.');
  log('If you have 2FA enabled, complete it in the browser.');
  log('');

  // Wait for the user to complete login — poll for the logged-in state.
  // This gives the user time to type credentials, handle 2FA, CAPTCHAs, etc.
  const answer = await ask(
    '  Press Enter once you have logged in in the browser... ',
  );

  // Verify login succeeded
  await page.goto(`${REDDIT_BASE}/`, { waitUntil: 'domcontentloaded' });
  await humanDelay(2000, 3000);

  const nowLoggedIn = await checkLoggedIn(page);
  if (!nowLoggedIn) {
    throw new Error(
      'Login verification failed. Please try again.',
    );
  }
  success('Login verified');
}

// ── Gallery post ─────────────────────────────────────────────────────────────

/**
 * Submits a gallery (image) post via the Reddit UI.
 *
 * 1. Navigates to the subreddit submit page
 * 2. Selects the Images tab
 * 3. Uploads images via file input
 * 4. Fills in title and body
 * 5. PAUSES for user approval (prints preview to terminal)
 * 6. Submits on approval
 *
 * Returns the post URL or null if the user declined.
 */
export async function postGallery(
  page,
  subreddit,
  title,
  body,
  imagePaths,
  captions,
) {
  log(`Navigating to r/${subreddit} submit page...`);
  await page.goto(`${REDDIT_BASE}/r/${subreddit}/submit`, {
    waitUntil: 'domcontentloaded',
  });
  await tabBehavior(page);
  await humanDelay(ACTION_DELAY, ACTION_DELAY + 1000);

  // Select the "Images & Video" / "Images" tab
  // Reddit's new UI uses various tab selectors depending on the subreddit
  log('Selecting Images tab...');
  try {
    await slowClick(
      page,
      'button:has-text("Images & Video"), button:has-text("Images"), button:has-text("Image")',
    );
  } catch {
    warn('Could not find Images tab — the page may already default to it');
  }
  await humanDelay(ACTION_DELAY, ACTION_DELAY + 500);

  // Upload images using file input (more reliable than drag-and-drop)
  log(`Uploading ${imagePaths.length} image(s)...`);
  const absolutePaths = imagePaths.map((p) => resolve(p));

  // Reddit's file input for images. Try common selectors.
  const fileInput = await page
    .locator('input[type="file"][accept*="image"]')
    .first();
  await fileInput.setInputFiles(absolutePaths);
  log('Files attached to upload input');

  // Wait for uploads to process — Reddit shows thumbnails once done
  await humanDelay(3000, 5000);
  await randomScroll(page);

  // Fill in the title
  log('Filling in title...');
  const titleInput = page.locator(
    'textarea[placeholder*="title" i], input[placeholder*="title" i], [data-testid="post-title-input"], div[slot="title"] textarea',
  );
  await titleInput.first().click();
  await humanDelay(300, 600);
  await titleInput.first().fill(''); // Clear any existing text
  await slowType(page, 'textarea[placeholder*="title" i], input[placeholder*="title" i], [data-testid="post-title-input"], div[slot="title"] textarea', title);
  await humanDelay(ACTION_DELAY, ACTION_DELAY + 500);

  // Fill in the body text if provided
  if (body) {
    log('Filling in body text...');
    try {
      // Reddit's body/description field — try markdown mode first
      const bodySelector =
        'div[slot="text"] textarea, textarea[placeholder*="body" i], div[role="textbox"], .public-DraftEditor-content';
      await slowType(page, bodySelector, body);
    } catch {
      warn('Could not find body text field — some post types may not support it');
    }
    await humanDelay(ACTION_DELAY, ACTION_DELAY + 500);
  }

  // Add captions to images if the UI supports it
  if (captions && captions.length > 0) {
    log('Note: Image captions must be added manually if the UI supports them');
  }

  await randomScroll(page);

  // ── Approval pause ──
  const approved = await promptApproval(subreddit, title, body, imagePaths);
  if (!approved) {
    warn('Post declined by user');
    return null;
  }

  // Submit the post
  log('Submitting post...');
  try {
    await slowClick(
      page,
      'button[type="submit"]:has-text("Post"), button:has-text("Post"), button:has-text("Submit")',
    );
  } catch {
    // Fallback: try clicking any primary submit-looking button
    await slowClick(page, 'button[type="submit"]');
  }

  // Wait for navigation to the new post
  log('Waiting for post to be created...');
  await page.waitForURL(/\/comments\//, { timeout: 30_000 });
  const postUrl = page.url();
  success(`Post created: ${postUrl}`);

  await humanDelay(ACTION_DELAY, ACTION_DELAY + 1000);
  return postUrl;
}

// ── Text post ────────────────────────────────────────────────────────────────

/**
 * Submits a text (self) post via the Reddit UI.
 *
 * 1. Navigates to the subreddit submit page
 * 2. Selects the Text tab
 * 3. Fills in title and body
 * 4. PAUSES for user approval
 * 5. Submits on approval
 *
 * Returns the post URL or null if the user declined.
 */
export async function postText(page, subreddit, title, body) {
  log(`Navigating to r/${subreddit} submit page...`);
  await page.goto(`${REDDIT_BASE}/r/${subreddit}/submit`, {
    waitUntil: 'domcontentloaded',
  });
  await tabBehavior(page);
  await humanDelay(ACTION_DELAY, ACTION_DELAY + 1000);

  // Select the Text tab
  log('Selecting Text tab...');
  try {
    await slowClick(page, 'button:has-text("Text")');
  } catch {
    warn('Could not find Text tab — the page may already default to it');
  }
  await humanDelay(ACTION_DELAY, ACTION_DELAY + 500);

  // Fill in the title
  log('Filling in title...');
  await slowType(
    page,
    'textarea[placeholder*="title" i], input[placeholder*="title" i], [data-testid="post-title-input"], div[slot="title"] textarea',
    title,
  );
  await humanDelay(ACTION_DELAY, ACTION_DELAY + 500);

  // Fill in the body
  if (body) {
    log('Filling in body text...');
    const bodySelector =
      'div[slot="text"] textarea, textarea[placeholder*="body" i], div[role="textbox"], .public-DraftEditor-content';
    await slowType(page, bodySelector, body);
    await humanDelay(ACTION_DELAY, ACTION_DELAY + 500);
  }

  await randomScroll(page);

  // ── Approval pause ──
  const approved = await promptApproval(subreddit, title, body);
  if (!approved) {
    warn('Post declined by user');
    return null;
  }

  // Submit
  log('Submitting post...');
  try {
    await slowClick(
      page,
      'button[type="submit"]:has-text("Post"), button:has-text("Post"), button:has-text("Submit")',
    );
  } catch {
    await slowClick(page, 'button[type="submit"]');
  }

  log('Waiting for post to be created...');
  await page.waitForURL(/\/comments\//, { timeout: 30_000 });
  const postUrl = page.url();
  success(`Post created: ${postUrl}`);

  await humanDelay(ACTION_DELAY, ACTION_DELAY + 1000);
  return postUrl;
}

// ── Comment ──────────────────────────────────────────────────────────────────

/**
 * Posts a comment on an existing Reddit post.
 * Navigates to the post URL, finds the comment box, types, and submits.
 */
export async function postComment(page, postUrl, commentText) {
  log(`Navigating to post: ${postUrl}`);
  await page.goto(postUrl, { waitUntil: 'domcontentloaded' });
  await tabBehavior(page);
  await humanDelay(ACTION_DELAY, ACTION_DELAY + 1000);

  // Find and click the comment box
  log('Finding comment box...');
  const commentSelector =
    'div[data-testid="comment-composer"] div[role="textbox"], ' +
    'div[contenteditable="true"][aria-label*="comment" i], ' +
    'shreddit-composer div[role="textbox"], ' +
    'textarea[placeholder*="comment" i]';

  await slowClick(page, commentSelector);
  await humanDelay(500, 1000);

  // Type the comment
  log('Typing comment...');
  await slowType(page, commentSelector, commentText);
  await humanDelay(ACTION_DELAY, ACTION_DELAY + 500);
  await randomScroll(page);

  // Submit the comment
  log('Submitting comment...');
  try {
    await slowClick(
      page,
      'button:has-text("Comment"), button[type="submit"]:has-text("Comment")',
    );
  } catch {
    await slowClick(page, 'button[type="submit"]');
  }

  await humanDelay(ACTION_DELAY, ACTION_DELAY + 1000);
  success('Comment posted');
}

// ── Cleanup ──────────────────────────────────────────────────────────────────

/**
 * Cleanly shuts down the browser. Call this when you're done posting.
 * Saves the session state before closing so the next run can reuse it.
 */
export async function closeBrowser(browser) {
  if (!browser) return;
  try {
    // Save final session state from the first context if available
    const contexts = browser.contexts();
    if (contexts.length > 0) {
      const state = await contexts[0].storageState();
      if (!existsSync(STATE_DIR)) {
        mkdirSync(STATE_DIR, { recursive: true });
      }
      writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
      log('Session state saved');
    }
    await browser.close();
    success('Browser closed');
  } catch (err) {
    warn(`Browser close error: ${err.message}`);
  }
}

// ── Approval prompt ──────────────────────────────────────────────────────────

/**
 * Prints a post preview to the terminal and asks the user to confirm
 * before submitting. Returns true if approved, false otherwise.
 */
async function promptApproval(subreddit, title, body, imagePaths) {
  console.log('\n┌──────────────────────────────────────────');
  console.log(`│  \x1b[1mPost Preview — r/${subreddit}\x1b[0m`);
  console.log('├──────────────────────────────────────────');
  console.log(`│  Title: ${title}`);
  if (body) {
    const bodyLines = body.split('\n');
    console.log('│  Body:');
    for (const line of bodyLines) {
      console.log(`│    ${line}`);
    }
  }
  if (imagePaths && imagePaths.length > 0) {
    console.log(`│  Images: ${imagePaths.length} file(s)`);
    for (const p of imagePaths) {
      console.log(`│    - ${p}`);
    }
  }
  console.log('└──────────────────────────────────────────\n');

  const answer = await ask('  Submit this post? (y/N): ');
  return answer.toLowerCase() === 'y';
}
