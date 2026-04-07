# Image Quality Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two-stage image quality filtering — metadata-based pre-fetch gate in the fetch pipeline, and a standalone Sharp-based scoring script for post-fetch analysis.

**Architecture:** Stage 1 adds resolution (>=800px short side) and aspect ratio (0.6–1.8) checks into `fetchObservations()` in `fetch-data.mjs`. Stage 2 is a new `score-images.mjs` script that downloads medium JPEGs, runs 4 Sharp heuristics (blur, brightness, entropy, subject prominence), and writes per-observation quality scores. The existing `compile-review.py` is extended to pull in low-scoring observations as review candidates.

**Tech Stack:** Node.js, Sharp (already a devDep), vitest for tests

**Branch:** `feat/image-quality-pipeline` (off `main`)

---

### Task 1: Create branch and scaffold scoring module

**Files:**
- Create: `scripts/lib/image-quality.mjs`
- Create: `tests/image-quality.test.js`

- [ ] **Step 1: Create the feature branch**

```bash
git checkout main
git checkout -b feat/image-quality-pipeline
```

- [ ] **Step 2: Create the scoring module with exported constants and stubs**

Create `scripts/lib/image-quality.mjs`:

```javascript
import sharp from 'sharp';

// --- Thresholds (pre-fetch gate) ---
export const MIN_SHORT_SIDE = 800;
export const MIN_ASPECT_RATIO = 0.6;
export const MAX_ASPECT_RATIO = 1.8;

// --- Scoring weights ---
export const WEIGHTS = {
  blur: 0.35,
  brightness: 0.20,
  entropy: 0.20,
  subject_prominence: 0.25,
};

// --- Auto-flag threshold ---
export const FLAG_THRESHOLD = 0.4;

/**
 * Check if a photo passes the pre-fetch metadata gate.
 * @param {{ width: number, height: number }} dimensions - original_dimensions from iNat API
 * @returns {{ pass: boolean, reason?: string }}
 */
export function passesMetadataGate(dimensions) {
  if (!dimensions || !dimensions.width || !dimensions.height) {
    return { pass: true }; // no dimensions available — let it through
  }
  const { width, height } = dimensions;
  const shortSide = Math.min(width, height);
  if (shortSide < MIN_SHORT_SIDE) {
    return { pass: false, reason: `resolution_${shortSide}px` };
  }
  const ratio = width / height;
  if (ratio < MIN_ASPECT_RATIO || ratio > MAX_ASPECT_RATIO) {
    return { pass: false, reason: `aspect_ratio_${ratio.toFixed(2)}` };
  }
  return { pass: true };
}

/**
 * Normalize a value into 0–1 range using a linear ramp between lo and hi.
 * Values at or below lo → 0, at or above hi → 1.
 */
function normalize(value, lo, hi) {
  if (hi === lo) return 0.5;
  return Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
}

/**
 * Score blur from Sharp stats. Higher stdev = sharper image = higher score.
 * @param {object} stats - result of sharp.stats()
 * @returns {number} 0–1
 */
export function scoreBlur(stats) {
  const avgStdev = stats.channels.reduce((sum, ch) => sum + ch.stdev, 0) / stats.channels.length;
  // stdev < 20 is very blurry (0.0), stdev > 50 is sharp (1.0)
  return normalize(avgStdev, 20, 50);
}

/**
 * Score brightness from Sharp stats. Mid-range mean is best.
 * @param {object} stats - result of sharp.stats()
 * @returns {number} 0–1
 */
export function scoreBrightness(stats) {
  const avgMean = stats.channels.reduce((sum, ch) => sum + ch.mean, 0) / stats.channels.length;
  // Ideal range: 40–220. Score drops toward 0 outside this range.
  if (avgMean < 40) return normalize(avgMean, 0, 40);
  if (avgMean > 220) return normalize(avgMean, 255, 220); // inverted: 255→0, 220→1
  return 1.0;
}

/**
 * Score entropy (information density) from Sharp stats.
 * Uses average channel stdev as a proxy — images with more detail have higher stdev.
 * @param {object} stats - result of sharp.stats()
 * @returns {number} 0–1
 */
export function scoreEntropy(stats) {
  const avgStdev = stats.channels.reduce((sum, ch) => sum + ch.stdev, 0) / stats.channels.length;
  // stdev < 15 is very flat/featureless (0.0), stdev > 60 is detail-rich (1.0)
  return normalize(avgStdev, 15, 60);
}

/**
 * Score subject prominence by comparing center-crop entropy to full-image entropy.
 * A clear macro subject has higher detail in the center than at the edges.
 * @param {Buffer} buffer - image file buffer
 * @param {object} fullStats - sharp.stats() of the full image
 * @returns {Promise<number>} 0–1
 */
export async function scoreSubjectProminence(buffer, fullStats) {
  const meta = await sharp(buffer).metadata();
  const w = meta.width;
  const h = meta.height;

  // Extract center 33% crop
  const cropW = Math.round(w / 3);
  const cropH = Math.round(h / 3);
  const left = Math.round((w - cropW) / 2);
  const top = Math.round((h - cropH) / 2);

  const centerStats = await sharp(buffer)
    .extract({ left, top, width: cropW, height: cropH })
    .stats();

  const fullStdev = fullStats.channels.reduce((s, ch) => s + ch.stdev, 0) / fullStats.channels.length;
  const centerStdev = centerStats.channels.reduce((s, ch) => s + ch.stdev, 0) / centerStats.channels.length;

  if (fullStdev === 0) return 0.5;

  // Ratio > 1 means center has more detail than average — good subject prominence
  const ratio = centerStdev / fullStdev;
  // ratio ~0.8 or below means subject isn't centered (0.0), ratio ~1.3+ means clear center subject (1.0)
  return normalize(ratio, 0.8, 1.3);
}

/**
 * Run all quality checks on an image buffer.
 * @param {Buffer} buffer - image file buffer
 * @returns {Promise<{ blur: number, brightness: number, entropy: number, subject_prominence: number, overall: number }>}
 */
export async function scoreImage(buffer) {
  const fullStats = await sharp(buffer).stats();

  const blur = scoreBlur(fullStats);
  const brightness = scoreBrightness(fullStats);
  const entropy = scoreEntropy(fullStats);
  const subject_prominence = await scoreSubjectProminence(buffer, fullStats);

  const overall =
    blur * WEIGHTS.blur +
    brightness * WEIGHTS.brightness +
    entropy * WEIGHTS.entropy +
    subject_prominence * WEIGHTS.subject_prominence;

  return { blur, brightness, entropy, subject_prominence, overall };
}
```

- [ ] **Step 3: Commit scaffold**

```bash
mkdir -p scripts/lib
git add scripts/lib/image-quality.mjs
git commit -m "feat: scaffold image quality scoring module"
```

---

### Task 2: Write tests for scoring functions

**Files:**
- Create: `tests/image-quality.test.js`

- [ ] **Step 1: Write tests for passesMetadataGate**

Create `tests/image-quality.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import {
  passesMetadataGate,
  scoreBlur,
  scoreBrightness,
  scoreEntropy,
  MIN_SHORT_SIDE,
  MIN_ASPECT_RATIO,
  MAX_ASPECT_RATIO,
} from '../scripts/lib/image-quality.mjs';

describe('passesMetadataGate', () => {
  it('passes a large landscape photo', () => {
    const result = passesMetadataGate({ width: 1600, height: 1200 });
    expect(result.pass).toBe(true);
  });

  it('rejects a small photo below 800px short side', () => {
    const result = passesMetadataGate({ width: 1000, height: 500 });
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/resolution/);
  });

  it('rejects an extreme portrait (ratio < 0.6)', () => {
    const result = passesMetadataGate({ width: 800, height: 2000 });
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/aspect_ratio/);
  });

  it('rejects an extreme panorama (ratio > 1.8)', () => {
    const result = passesMetadataGate({ width: 3600, height: 1000 });
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/aspect_ratio/);
  });

  it('passes when no dimensions available', () => {
    const result = passesMetadataGate(null);
    expect(result.pass).toBe(true);
  });

  it('passes when dimensions are zero', () => {
    const result = passesMetadataGate({ width: 0, height: 0 });
    expect(result.pass).toBe(true);
  });

  it('passes a square 800px photo at the boundary', () => {
    const result = passesMetadataGate({ width: 800, height: 800 });
    expect(result.pass).toBe(true);
  });

  it('passes at aspect ratio boundaries', () => {
    // ratio = 0.6 exactly (1200/2000)
    expect(passesMetadataGate({ width: 1200, height: 2000 }).pass).toBe(true);
    // ratio = 1.8 exactly (1800/1000)
    expect(passesMetadataGate({ width: 1800, height: 1000 }).pass).toBe(true);
  });
});

// Mock Sharp stats shape for unit-testing score functions
function makeStats(channels) {
  return {
    channels: channels.map(([mean, stdev]) => ({
      mean,
      stdev,
      min: 0,
      max: 255,
    })),
  };
}

describe('scoreBlur', () => {
  it('returns 1.0 for very sharp image (stdev=60)', () => {
    const stats = makeStats([[128, 60], [128, 60], [128, 60]]);
    expect(scoreBlur(stats)).toBe(1.0);
  });

  it('returns 0.0 for very blurry image (stdev=10)', () => {
    const stats = makeStats([[128, 10], [128, 10], [128, 10]]);
    expect(scoreBlur(stats)).toBe(0.0);
  });

  it('returns ~0.5 for mid-range stdev=35', () => {
    const stats = makeStats([[128, 35], [128, 35], [128, 35]]);
    expect(scoreBlur(stats)).toBeCloseTo(0.5, 1);
  });
});

describe('scoreBrightness', () => {
  it('returns 1.0 for well-exposed image (mean=128)', () => {
    const stats = makeStats([[128, 40], [128, 40], [128, 40]]);
    expect(scoreBrightness(stats)).toBe(1.0);
  });

  it('returns 0.0 for completely dark image (mean=0)', () => {
    const stats = makeStats([[0, 10], [0, 10], [0, 10]]);
    expect(scoreBrightness(stats)).toBe(0.0);
  });

  it('returns 0.0 for completely blown-out image (mean=255)', () => {
    const stats = makeStats([[255, 10], [255, 10], [255, 10]]);
    expect(scoreBrightness(stats)).toBe(0.0);
  });

  it('returns ~0.5 for dim image (mean=20)', () => {
    const stats = makeStats([[20, 10], [20, 10], [20, 10]]);
    expect(scoreBrightness(stats)).toBeCloseTo(0.5, 1);
  });
});

describe('scoreEntropy', () => {
  it('returns 1.0 for detail-rich image (stdev=70)', () => {
    const stats = makeStats([[128, 70], [128, 70], [128, 70]]);
    expect(scoreEntropy(stats)).toBe(1.0);
  });

  it('returns 0.0 for flat featureless image (stdev=10)', () => {
    const stats = makeStats([[128, 10], [128, 10], [128, 10]]);
    expect(scoreEntropy(stats)).toBe(0.0);
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run tests/image-quality.test.js`

Expected: All tests pass (the functions are already implemented in the module from Task 1).

- [ ] **Step 3: Commit tests**

```bash
git add tests/image-quality.test.js
git commit -m "test: add unit tests for image quality scoring functions"
```

---

### Task 3: Add pre-fetch gate to fetch-data.mjs

**Files:**
- Modify: `scripts/fetch-data.mjs` — `pickBestPhoto()` (lines 97–124) and `fetchObservations()` (lines 160–168)

- [ ] **Step 1: Import the gate function at the top of fetch-data.mjs**

Add after the existing imports (after line 5):

```javascript
import { passesMetadataGate } from './lib/image-quality.mjs';
```

- [ ] **Step 2: Add a rejection counter and gate check in fetchObservations()**

In `fetchObservations()`, after the `pickBestPhoto()` call (after current line 166) and before the `photoUrl` check, add the gate. Replace this block:

```javascript
        // Pick the best photo: prefer landscape/square, larger dimensions
        const photo = pickBestPhoto(obs.photos);
        const photoUrl = photo.url?.replace('square', 'medium');
        if (!photoUrl) continue;
```

With:

```javascript
        // Pick the best photo: prefer landscape/square, larger dimensions
        const photo = pickBestPhoto(obs.photos);
        const photoUrl = photo.url?.replace('square', 'medium');
        if (!photoUrl) continue;
        // Pre-fetch quality gate: resolution + aspect ratio
        const gate = passesMetadataGate(photo.original_dimensions);
        if (!gate.pass) {
          gateRejections.total++;
          const taxonName = obs.taxon?.name || 'unknown';
          gateRejections.byTaxon[taxonName] = (gateRejections.byTaxon[taxonName] || 0) + 1;
          continue;
        }
```

- [ ] **Step 3: Add the rejection tracker at the top of fetchObservations()**

Add after `const observations = [];` (line 139):

```javascript
  const gateRejections = { total: 0, byTaxon: {} };
```

- [ ] **Step 4: Log rejections at the end of fetchObservations()**

Add before the `return observations;` statement at the end of the function:

```javascript
  if (gateRejections.total > 0) {
    console.log(`  Quality gate rejected: ${gateRejections.total} observations`);
    const topRejected = Object.entries(gateRejections.byTaxon)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    for (const [taxon, count] of topRejected) {
      console.log(`    ${taxon}: ${count}`);
    }
  }
```

- [ ] **Step 5: Run existing tests to verify no regressions**

Run: `npx vitest run`

Expected: All 119+ tests pass.

- [ ] **Step 6: Commit**

```bash
git add scripts/fetch-data.mjs
git commit -m "feat: add pre-fetch quality gate (resolution + aspect ratio)"
```

---

### Task 4: Build score-images.mjs script

**Files:**
- Create: `scripts/score-images.mjs`

- [ ] **Step 1: Create the scoring script**

Create `scripts/score-images.mjs`:

```javascript
#!/usr/bin/env node

/**
 * Image Quality Scoring Pipeline
 *
 * Downloads medium.jpg for each observation, runs Sharp-based quality checks,
 * and writes per-observation quality scores to public/data/quality-scores.json.
 *
 * Usage: node scripts/score-images.mjs [--force] [--threshold 0.4]
 *
 * Options:
 *   --force       Re-download and re-score all images (ignore cache)
 *   --threshold N Override the auto-flag threshold (default: 0.4)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { scoreImage, FLAG_THRESHOLD } from './lib/image-quality.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'public', 'data');
const CACHE_DIR = join(ROOT, '.cache', 'images');
const OBSERVATIONS_PATH = join(DATA_DIR, 'observations.json');
const OUTPUT_PATH = join(DATA_DIR, 'quality-scores.json');

const RATE_LIMIT_MS = 1100; // 1.1s between downloads (iNaturalist courtesy)
const USER_AGENT = 'WhatsThatBugGame/1.0 (educational project)';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    force: args.includes('--force'),
    threshold: (() => {
      const idx = args.indexOf('--threshold');
      return idx >= 0 && args[idx + 1] ? parseFloat(args[idx + 1]) : FLAG_THRESHOLD;
    })(),
  };
}

function getCachePath(observationId) {
  return join(CACHE_DIR, `${observationId}_medium.jpg`);
}

async function downloadImage(url, observationId) {
  const cachePath = getCachePath(observationId);
  if (existsSync(cachePath)) {
    return readFileSync(cachePath);
  }

  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  writeFileSync(cachePath, buffer);
  return buffer;
}

async function main() {
  const opts = parseArgs();

  mkdirSync(CACHE_DIR, { recursive: true });

  console.log('=== Image Quality Scoring ===\n');

  const observations = JSON.parse(readFileSync(OBSERVATIONS_PATH, 'utf-8'));
  console.log(`Loaded ${observations.length} observations`);
  console.log(`Flag threshold: ${opts.threshold}`);
  console.log(`Cache: ${CACHE_DIR}`);
  if (opts.force) console.log('Force mode: re-scoring all images\n');

  // Load existing scores for incremental runs
  let existingScores = {};
  if (!opts.force && existsSync(OUTPUT_PATH)) {
    try {
      const existing = JSON.parse(readFileSync(OUTPUT_PATH, 'utf-8'));
      for (const entry of existing) {
        existingScores[entry.observation_id] = entry;
      }
      console.log(`Loaded ${Object.keys(existingScores).length} existing scores (incremental mode)\n`);
    } catch { /* start fresh */ }
  }

  const scores = [];
  let downloaded = 0;
  let cached = 0;
  let failed = 0;
  let skipped = 0;
  const startTime = Date.now();

  for (let i = 0; i < observations.length; i++) {
    const obs = observations[i];
    const id = obs.id;

    // Skip if already scored and not forcing
    if (!opts.force && existingScores[id]) {
      scores.push(existingScores[id]);
      skipped++;
      continue;
    }

    const pct = ((i + 1) / observations.length * 100).toFixed(1);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    process.stdout.write(`\r  [${pct}%] Scoring ${i + 1}/${observations.length} (${elapsed}s elapsed, ${failed} failed)`);

    try {
      const wasCached = existsSync(getCachePath(id));
      const buffer = await downloadImage(obs.photo_url, id);

      if (wasCached) {
        cached++;
      } else {
        downloaded++;
        await sleep(RATE_LIMIT_MS);
      }

      const result = await scoreImage(buffer);
      scores.push({
        observation_id: id,
        species: obs.taxon?.species || '',
        common_name: obs.taxon?.common_name || '',
        blur: Math.round(result.blur * 1000) / 1000,
        brightness: Math.round(result.brightness * 1000) / 1000,
        entropy: Math.round(result.entropy * 1000) / 1000,
        subject_prominence: Math.round(result.subject_prominence * 1000) / 1000,
        overall: Math.round(result.overall * 1000) / 1000,
      });
    } catch (err) {
      failed++;
      scores.push({
        observation_id: id,
        species: obs.taxon?.species || '',
        common_name: obs.taxon?.common_name || '',
        blur: null,
        brightness: null,
        entropy: null,
        subject_prominence: null,
        overall: null,
        error: err.message,
      });
    }
  }

  console.log('\n');

  // Write output
  scores.sort((a, b) => (a.overall ?? 1) - (b.overall ?? 1)); // worst first
  writeFileSync(OUTPUT_PATH, JSON.stringify(scores, null, 2));

  // Summary
  const scored = scores.filter(s => s.overall != null);
  const flagged = scored.filter(s => s.overall < opts.threshold);

  console.log('=== Summary ===');
  console.log(`  Total observations: ${observations.length}`);
  console.log(`  Downloaded: ${downloaded} | Cached: ${cached} | Skipped: ${skipped} | Failed: ${failed}`);
  console.log(`  Scored: ${scored.length}`);
  console.log(`  Flagged (overall < ${opts.threshold}): ${flagged.length}`);
  console.log(`  Output: ${OUTPUT_PATH}`);

  if (flagged.length > 0) {
    console.log(`\n  Worst 10:`);
    for (const s of flagged.slice(0, 10)) {
      console.log(`    ${(s.common_name || s.species).padEnd(35)} overall=${s.overall} blur=${s.blur} bright=${s.brightness} ent=${s.entropy} subj=${s.subject_prominence}`);
    }
  }

  console.log('\nDone!');
}

main().catch(err => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Commit**

```bash
git add scripts/score-images.mjs
git commit -m "feat: add image quality scoring script (score-images.mjs)"
```

---

### Task 5: Add npm script and test against a small sample

**Files:**
- Modify: `package.json` — add `score-images` script

- [ ] **Step 1: Add npm script to package.json**

Add to the `"scripts"` object in `package.json`:

```json
"score-images": "node scripts/score-images.mjs"
```

- [ ] **Step 2: Test against a small sample by downloading and scoring 3 images manually**

Run a quick smoke test — score just a few images to verify the pipeline works end-to-end:

```bash
node -e "
import { readFileSync } from 'fs';
import { scoreImage } from './scripts/lib/image-quality.mjs';
const obs = JSON.parse(readFileSync('public/data/observations.json','utf-8'));
const first = obs[0];
console.log('Testing:', first.taxon.common_name, first.photo_url);
const res = await fetch(first.photo_url);
const buf = Buffer.from(await res.arrayBuffer());
const scores = await scoreImage(buf);
console.log('Scores:', scores);
"
```

Expected: Prints score object with blur, brightness, entropy, subject_prominence, overall — all numbers between 0 and 1.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "feat: add score-images npm script"
```

---

### Task 6: Integrate quality scores into compile-review.py

**Files:**
- Modify: `scripts/compile-review.py` — add quality-scores.json as a third source

- [ ] **Step 1: Add the quality scores path constant**

Add after the existing path constants (around line 24):

```python
QUALITY_SCORES_JSON = ROOT / "public" / "data" / "quality-scores.json"
IMAGE_QUALITY_THRESHOLD = 0.4
```

- [ ] **Step 2: Add a loader function for quality scores**

Add after the `load_flagged()` function:

```python
def load_quality_scores():
    """Load image quality scores from score-images.mjs output."""
    if not QUALITY_SCORES_JSON.exists():
        return {}
    with open(QUALITY_SCORES_JSON) as f:
        scores = json.load(f)
    return {str(s["observation_id"]): s for s in scores if s.get("overall") is not None}
```

- [ ] **Step 3: Add quality scores as a candidate source in main()**

In `main()`, after the "Loading statistically flagged observations" section (around line 124), add:

```python
    print("Loading image quality scores...")
    quality_scores = load_quality_scores()
    low_quality = {oid: s for oid, s in quality_scores.items() if s["overall"] < IMAGE_QUALITY_THRESHOLD}
    print(f"  {len(low_quality)} observations below quality threshold {IMAGE_QUALITY_THRESHOLD}")
```

Then add a third source block after `# Source 2: statistically flagged` (around line 139):

```python
    # Source 3: low image quality scores
    for obs_id in low_quality:
        candidate_ids.add(obs_id)
```

- [ ] **Step 4: Include quality score data in candidate entries**

In the candidate-building loop, after the existing `flag_entry` lookup (around line 156), add:

```python
        qs_entry = quality_scores.get(obs_id)
```

Update the `sources` list to include image quality:

```python
        if qs_entry and qs_entry.get("overall", 1) < IMAGE_QUALITY_THRESHOLD:
            sources.append("low_image_quality")
```

Add quality score fields to the entry dict, after the existing `confusion_density` block (around line 191):

```python
        if qs_entry:
            entry["image_blur"] = qs_entry.get("blur")
            entry["image_brightness"] = qs_entry.get("brightness")
            entry["image_entropy"] = qs_entry.get("entropy")
            entry["image_subject_prominence"] = qs_entry.get("subject_prominence")
            entry["image_overall"] = qs_entry.get("overall")
        else:
            entry["image_blur"] = None
            entry["image_brightness"] = None
            entry["image_entropy"] = None
            entry["image_subject_prominence"] = None
            entry["image_overall"] = None
```

- [ ] **Step 5: Test compile-review.py still runs without quality-scores.json**

Run: `python3 scripts/compile-review.py`

Expected: Runs successfully, prints "0 observations below quality threshold" (since quality-scores.json doesn't exist yet on this branch).

- [ ] **Step 6: Commit**

```bash
git add scripts/compile-review.py
git commit -m "feat: integrate image quality scores into review candidate compilation"
```

---

### Task 7: Add quality score pills to review-flagged.html

**Files:**
- Modify: `scripts/review-flagged.html` — display image quality scores in card pills

- [ ] **Step 1: Add quality score pills to the createCard function**

In `scripts/review-flagged.html`, in the `createCard()` function, find the flag pills section that builds the `pills` string. After the existing `attempts` pill, add:

```javascript
  if (c.image_overall != null) {
    const iqColor = c.image_overall < 0.4 ? 'miss-rate' : 'attempts';
    pills += `<span class="flag-pill ${iqColor}">IQ: ${(c.image_overall * 100).toFixed(0)}%</span>`;
  }
  if (c.sources.includes('low_image_quality')) {
    pills += `<span class="flag-pill stat-flag">low quality</span>`;
  }
```

- [ ] **Step 2: Add filter option for image quality source**

In the `filter-source` select element, add a new option:

```html
<option value="low_image_quality">Low image quality only</option>
```

And update the `applyFilters()` function's source filter section to handle it:

```javascript
    else if (sourceFilter === 'low_image_quality') show = c.sources.includes('low_image_quality');
```

- [ ] **Step 3: Commit**

```bash
git add scripts/review-flagged.html
git commit -m "feat: show image quality scores in review tool"
```

---

### Task 8: Run full test suite and verify end-to-end

**Files:** None (verification only)

- [ ] **Step 1: Run all vitest tests**

Run: `npx vitest run`

Expected: All tests pass (119 existing + new image-quality tests).

- [ ] **Step 2: Smoke test the full pipeline**

Run the scoring script against a small subset to verify end-to-end:

```bash
node -e "
import { readFileSync, writeFileSync } from 'fs';
// Create a tiny observations.json with just 5 entries for testing
const obs = JSON.parse(readFileSync('public/data/observations.json','utf-8'));
writeFileSync('/tmp/wtb-test-obs.json', JSON.stringify(obs.slice(0, 5)));
console.log('Created test file with 5 observations');
"
```

Then verify `compile-review.py` accepts the new fields without errors:

```bash
python3 scripts/compile-review.py
```

- [ ] **Step 3: Commit any fixes and final commit**

```bash
git add -A
git status
# Only commit if there are changes
git diff --cached --quiet || git commit -m "chore: final verification and cleanup"
```
