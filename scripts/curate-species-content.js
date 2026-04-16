#!/usr/bin/env node
// scripts/curate-species-content.js
//
// Processes species-wikipedia-raw.json through Claude CLI to produce
// fun-fact summaries for species pages.
//
// Usage: node scripts/curate-species-content.js [--batch-size 25] [--model sonnet] [--concurrency 10]
//
// Supports resuming — already-curated species are skipped.
// Saves progress after each wave to public/data/species-content.json.

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const RAW_PATH = join(ROOT, 'data', 'species-wikipedia-raw.json');
const OUTPUT_PATH = join(ROOT, 'public', 'data', 'species-content.json');

// --- CLI args ---
const args = process.argv.slice(2);
function getArg(name, fallback) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}
const BATCH_SIZE = parseInt(getArg('batch-size', '25'), 10);
const MODEL = getArg('model', 'sonnet');
const CONCURRENCY = parseInt(getArg('concurrency', '10'), 10);

// --- Load data ---
if (!existsSync(RAW_PATH)) {
  console.error(`Raw data not found at ${RAW_PATH}`);
  console.error('Run: node scripts/fetch-species-wikipedia.js');
  process.exit(1);
}

const raw = JSON.parse(readFileSync(RAW_PATH, 'utf-8'));
const output = existsSync(OUTPUT_PATH)
  ? JSON.parse(readFileSync(OUTPUT_PATH, 'utf-8'))
  : {};

// --- Filter to uncurated species with content ---
const pending = Object.entries(raw).filter(
  ([name, data]) => data?.extract && !output[name]
);

console.log(`Raw entries: ${Object.keys(raw).length}`);
console.log(`Already curated: ${Object.keys(output).length}`);
console.log(`Pending: ${pending.length}`);
console.log(`Batch size: ${BATCH_SIZE}, Model: ${MODEL}, Concurrency: ${CONCURRENCY}`);

if (pending.length === 0) {
  console.log('\nAll species already curated. Nothing to do.');
  process.exit(0);
}

// --- Prompt template ---
const SYSTEM_PROMPT = `You are a nature writer producing fun-fact summaries for an insect identification game website called "What's That Bug?". You receive JSON with Wikipedia extracts for insect species. You return JSON with curated HTML summaries.

Output ONLY valid JSON — no markdown fences, no commentary, no explanation. The response must start with { and end with }.

For each species, produce: { "summary": "<p>...</p>" }

Writing rules:
- 100-200 words per summary (shorter is better)
- Lead with the most surprising or memorable fact
- Use <strong> to highlight 2-3 key facts per summary
- Conversational, enthusiastic tone — nature guide, not encyclopedia
- Focus on fun facts: unusual behaviors, surprising abilities, weird biology, records
- Skip dry taxonomic descriptions
- 1-2 short paragraphs wrapped in <p> tags
- Do NOT include the species name (it's already in the page heading)
- Do NOT use emoji`;

function buildUserPrompt(batch) {
  const input = {};
  for (const [name, data] of batch) {
    input[name] = {
      extract: data.extract,
      commonName: data.commonName || '',
    };
  }
  return `Curate these ${batch.length} species. Return a JSON object with the same keys.\n\n${JSON.stringify(input)}`;
}

// --- Run a single batch, returns { results, cost, elapsed } or throws ---
function runBatch(batch, batchIdx, totalBatches) {
  const names = batch.map(([n]) => n);
  const first = batch[0][1].commonName || batch[0][0];
  const last = batch[batch.length - 1][1].commonName || batch[batch.length - 1][0];
  const label = `Batch ${batchIdx + 1}/${totalBatches}`;

  console.log(`  ▶ ${label} — ${batch.length} species (${first} → ${last})`);

  const userPrompt = buildUserPrompt(batch);
  const start = Date.now();

  return new Promise((resolve, reject) => {
    const child = execFile('claude', [
      '-p',
      '--model', MODEL,
      '--output-format', 'json',
      '--no-session-persistence',
      '--tools', '',
      '--system-prompt', SYSTEM_PROMPT,
    ], {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
      timeout: 600_000,
    }, (err, stdout) => {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);

      if (err) {
        console.error(`  ✗ ${label} failed (${elapsed}s): ${err.message.split('\n')[0]}`);
        return resolve({ names, results: null, label });
      }

      try {
        const envelope = JSON.parse(stdout);
        if (envelope.is_error) {
          console.error(`  ✗ ${label} error (${elapsed}s): ${envelope.result}`);
          return resolve({ names, results: null, label });
        }

        const text = envelope.result;
        let parsed;
        try {
          const cleaned = text
            .replace(/^```json?\n?/m, '')
            .replace(/\n?```$/m, '')
            .trim();
          parsed = JSON.parse(cleaned);
        } catch {
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error('Could not parse JSON from response');
          }
        }

        const cost = envelope.total_cost_usd || 0;
        const results = {};
        let added = 0;
        for (const name of names) {
          if (parsed[name]?.summary) {
            results[name] = { summary: parsed[name].summary };
            added++;
          }
        }

        console.log(`  ✓ ${label} — ${added}/${batch.length} curated (${elapsed}s, $${cost.toFixed(4)})`);

        if (added < batch.length) {
          const missing = names.filter((n) => !parsed[n]?.summary);
          console.log(`    ⚠ Missing: ${missing.join(', ')}`);
        }

        resolve({ names, results, label });
      } catch (parseErr) {
        console.error(`  ✗ ${label} parse error (${elapsed}s): ${parseErr.message}`);
        resolve({ names, results: null, label });
      }
    });

    // Pipe the user prompt to stdin
    child.stdin.write(userPrompt);
    child.stdin.end();
  });
}

// --- Split into batches ---
const batches = [];
for (let i = 0; i < pending.length; i += BATCH_SIZE) {
  batches.push(pending.slice(i, i + BATCH_SIZE));
}

console.log(`\nProcessing ${batches.length} batches in waves of ${CONCURRENCY}...\n`);

// --- Process in waves of CONCURRENCY ---
const startTime = Date.now();
let totalCurated = Object.keys(output).length;
let totalFailed = 0;

for (let w = 0; w < batches.length; w += CONCURRENCY) {
  const wave = batches.slice(w, w + CONCURRENCY);
  const waveNum = Math.floor(w / CONCURRENCY) + 1;
  const totalWaves = Math.ceil(batches.length / CONCURRENCY);

  console.log(`━━━ Wave ${waveNum}/${totalWaves} (${wave.length} parallel batches) ━━━`);

  const waveStart = Date.now();
  const promises = wave.map((batch, j) => runBatch(batch, w + j, batches.length));
  const results = await Promise.all(promises);

  // Merge all successful results into output
  let waveAdded = 0;
  let waveFailed = 0;
  for (const { results: batchResults } of results) {
    if (batchResults) {
      Object.assign(output, batchResults);
      waveAdded += Object.keys(batchResults).length;
    } else {
      waveFailed++;
    }
  }

  totalCurated += waveAdded;
  totalFailed += waveFailed;

  // Save after each wave
  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));

  const waveElapsed = ((Date.now() - waveStart) / 1000).toFixed(1);
  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  const remaining = batches.length - (w + wave.length);

  console.log(`\n  Wave done: +${waveAdded} species in ${waveElapsed}s | Total: ${totalCurated} curated | ${remaining} batches left | ${totalElapsed}s elapsed\n`);
}

console.log('━━━ Done! ━━━');
console.log(`Total curated: ${totalCurated}`);
console.log(`Failed batches: ${totalFailed} (re-run to retry)`);
console.log(`Total time: ${((Date.now() - startTime) / 1000).toFixed(0)}s`);
console.log(`Output: ${OUTPUT_PATH}`);
