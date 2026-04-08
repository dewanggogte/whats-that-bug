/**
 * Human behavior simulation for Playwright browser automation.
 *
 * These utilities add realistic timing, mouse movement, and scrolling
 * to make automated interactions look more natural. Every action in
 * poster.mjs should use these instead of raw Playwright methods.
 */

// ── Random helpers ───────────────────────────────────────────────────────────

/**
 * Returns a random integer between min (inclusive) and max (inclusive).
 */
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Approximate normal distribution using Box-Muller transform.
 * Returns a value centered on `mean` with standard deviation `stddev`,
 * clamped to [min, max].
 */
function normalRandom(mean, stddev, min, max) {
  // Box-Muller: two uniform randoms -> one normally-distributed value
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const value = mean + z * stddev;
  return Math.round(Math.max(min, Math.min(max, value)));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Track mouse position so moveMouse can interpolate from where we actually are
let currentMouseX = 0;
let currentMouseY = 0;

// ── Typing ───────────────────────────────────────────────────────────────────

/**
 * Types text into an element with per-keystroke delays that mimic a real
 * person. Each character waits 40-120ms, with a ~5% chance of a longer
 * 200-400ms "thinking" pause.
 */
export async function slowType(page, selector, text) {
  await page.click(selector);
  for (const char of text) {
    await page.keyboard.type(char);

    // ~5% chance of a longer pause (simulates thinking/distraction)
    if (Math.random() < 0.05) {
      await sleep(randInt(200, 400));
    } else {
      await sleep(randInt(40, 120));
    }
  }
  // Brief pause after finishing typing, like a real person reviewing input
  await humanDelay(100, 300);
}

// ── Clicking ─────────────────────────────────────────────────────────────────

/**
 * Clicks an element with a human-like mouse movement: locates the element,
 * applies a small random offset from center, moves the mouse along a
 * bezier-ish path, then does a mousedown → pause → mouseup.
 */
export async function slowClick(page, selector) {
  const el = await page.waitForSelector(selector, { timeout: 10_000 });
  const box = await el.boundingBox();
  if (!box) throw new Error(`Element not visible: ${selector}`);

  // Target point: center of element ± up to 5px
  const targetX = box.x + box.width / 2 + randInt(-5, 5);
  const targetY = box.y + box.height / 2 + randInt(-5, 5);

  // Move mouse in steps to approximate a bezier curve (3-6 steps)
  await moveMouse(page, targetX, targetY);

  // Human-like click: mousedown, brief hold, mouseup
  await page.mouse.down();
  await sleep(randInt(50, 150));
  await page.mouse.up();
  // Brief pause after clicking, like a person waiting for feedback
  await humanDelay(200, 500);
}

/**
 * Moves the mouse from its current position to (targetX, targetY) in
 * several small steps with slight randomness, approximating a bezier curve.
 */
async function moveMouse(page, targetX, targetY) {
  const startX = currentMouseX;
  const startY = currentMouseY;
  const steps = randInt(3, 6);
  for (let i = 1; i <= steps; i++) {
    // Linear interpolation with small jitter
    const progress = i / steps;
    // Ease-out: decelerate as we approach the target
    const eased = 1 - Math.pow(1 - progress, 2);
    const x = startX + (targetX - startX) * eased + randInt(-2, 2);
    const y = startY + (targetY - startY) * eased + randInt(-2, 2);
    await page.mouse.move(x, y);
    await sleep(randInt(10, 30));
  }
  // Final precise move to target
  await page.mouse.move(targetX, targetY);
  currentMouseX = targetX;
  currentMouseY = targetY;
}

// ── Delays ───────────────────────────────────────────────────────────────────

/**
 * Waits for a random duration between min and max milliseconds, using a
 * normal distribution centered at the midpoint. This produces more
 * natural-feeling pauses than a uniform random.
 */
export async function humanDelay(min, max) {
  const mean = (min + max) / 2;
  const stddev = (max - min) / 4; // ~95% of values within [min, max]
  const ms = normalRandom(mean, stddev, min, max);
  await sleep(ms);
}

// ── Scrolling ────────────────────────────────────────────────────────────────

/**
 * 30% chance of performing a small random scroll (50-200px).
 * Call this between actions to add organic browsing noise.
 */
export async function randomScroll(page) {
  if (Math.random() > 0.3) return; // 70% of the time, do nothing
  let distance = randInt(50, 200);
  const direction = Math.random() < 0.5 ? 1 : -1;
  distance *= direction;
  await page.mouse.wheel(0, distance);
  await sleep(randInt(200, 500));
}

// ── Tab behavior ─────────────────────────────────────────────────────────────

/**
 * Simulates natural behavior after loading a new page:
 * - Wait 1-3 seconds (reading the page)
 * - Scroll down 100-300px
 * - 20% chance of hovering a non-target element (generic link/button)
 *
 * Call this after navigation to a new page, before interacting with
 * the target elements.
 */
export async function tabBehavior(page) {
  // Read the page briefly
  await humanDelay(1000, 3000);

  // Scroll down a bit as if scanning
  const scrollAmount = randInt(100, 300);
  await page.mouse.wheel(0, scrollAmount);
  await sleep(randInt(300, 600));

  // Scroll back up by a similar amount (natural reading behavior)
  const scrollBack = randInt(80, scrollAmount);
  await page.mouse.wheel(0, -scrollBack);
  await sleep(randInt(200, 400));

  // Occasionally hover a random element (simulates visual scanning)
  if (Math.random() < 0.2) {
    try {
      // Try to find a generic interactive element to hover
      const candidates = await page.$$('a, button');
      if (candidates.length > 0) {
        const el = candidates[randInt(0, candidates.length - 1)];
        const box = await el.boundingBox();
        if (box) {
          await page.mouse.move(
            box.x + box.width / 2 + randInt(-3, 3),
            box.y + box.height / 2 + randInt(-3, 3),
          );
          await sleep(randInt(200, 500));
        }
      }
    } catch {
      // Element might have disappeared — not worth retrying
    }
  }
}
