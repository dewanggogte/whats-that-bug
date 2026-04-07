#!/usr/bin/env node
/**
 * Calculate difficulty scores for observations based on exported game event data.
 *
 * Usage:
 *   node scripts/calculate-difficulty.mjs path/to/round_complete.csv
 *   node scripts/calculate-difficulty.mjs path/to/events.json
 *
 * Expects columns: observation_id, user_answer, correct_answer, score, time_taken_ms, set, mode
 * Writes output to public/data/difficulty.json
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: node scripts/calculate-difficulty.mjs <path-to-csv-or-json>');
  process.exit(1);
}

// --- Parse input ---

function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = values[i]; });
    return obj;
  });
}

const raw = readFileSync(resolve(inputPath), 'utf-8');
const ext = extname(inputPath).toLowerCase();
const events = ext === '.json' ? JSON.parse(raw) : parseCSV(raw);

console.log(`Loaded ${events.length} round_complete events`);

// --- Aggregate per observation ---

const obsStats = new Map(); // observation_id -> { total, wrong, wrongAnswers: Set, times: [], bugs101Total, bugs101Wrong }

for (const e of events) {
  const id = String(e.observation_id);
  const score = Number(e.score);
  const time = Number(e.time_taken_ms);
  const set = e.set || '';
  const mode = e.mode || '';
  const isBugs101 = set.startsWith('bugs_101');
  const isBinaryMode = mode === 'binary' || isBugs101;

  if (!obsStats.has(id)) {
    obsStats.set(id, {
      total: 0, wrong: 0,
      wrongAnswers: new Set(),
      times: [],
      bugs101Total: 0, bugs101Wrong: 0,
    });
  }

  const s = obsStats.get(id);
  s.total++;
  s.times.push(time);

  // Determine if this was a miss
  const isMiss = isBinaryMode ? score === 0 : score < 100;
  if (isMiss) {
    s.wrong++;
    if (e.user_answer) s.wrongAnswers.add(e.user_answer);
  }

  if (isBugs101) {
    s.bugs101Total++;
    if (isMiss) s.bugs101Wrong++;
  }
}

// --- Compute global medians and maxes ---

const allTimes = [];
const allConfusionDensities = [];

for (const s of obsStats.values()) {
  const avgTime = s.times.reduce((a, b) => a + b, 0) / s.times.length;
  s.avgTime = avgTime;
  allTimes.push(avgTime);

  s.confusionDensity = s.wrongAnswers.size / s.total;
  allConfusionDensities.push(s.confusionDensity);
}

function median(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

const medianTime = median(allTimes);
const maxConfusionDensity = Math.max(...allConfusionDensities, 0.001); // avoid division by zero

// --- Score each observation ---

const MIN_SAMPLE_SIZE = 3;
const result = {};

for (const [id, s] of obsStats) {
  if (s.total < MIN_SAMPLE_SIZE) {
    // Insufficient data — default to medium
    result[id] = {
      difficulty: 0.45,
      tier: 'medium',
      miss_rate: s.total > 0 ? s.wrong / s.total : 0,
      avg_time_ms: Math.round(s.avgTime),
      sample_size: s.total,
    };
    continue;
  }

  const missRate = s.wrong / s.total;

  // Time anomaly: how much slower than median, capped at 3x
  const timeAnomaly = Math.min(s.avgTime / medianTime, 3.0);
  // Normalize: 1.0 = median (no anomaly), 3.0 = max anomaly -> [0, 1]
  const normalizedTimeAnomaly = Math.max(0, Math.min(1, (timeAnomaly - 1.0) / 2.0));

  const normalizedConfusionDensity = s.confusionDensity / maxConfusionDensity;

  // Bugs 101 miss rate (falls back to overall miss rate)
  const missRateInBugs101 = s.bugs101Total >= 1
    ? s.bugs101Wrong / s.bugs101Total
    : missRate;

  const difficulty =
    (missRate * 0.35) +
    (normalizedConfusionDensity * 0.25) +
    (normalizedTimeAnomaly * 0.2) +
    (missRateInBugs101 * 0.2);

  let tier;
  if (difficulty < 0.3) tier = 'easy';
  else if (difficulty < 0.6) tier = 'medium';
  else tier = 'hard';

  result[id] = {
    difficulty: Math.round(difficulty * 1000) / 1000,
    tier,
    miss_rate: Math.round(missRate * 1000) / 1000,
    avg_time_ms: Math.round(s.avgTime),
    sample_size: s.total,
  };
}

// --- Write output ---

const outputPath = resolve('public/data/difficulty.json');
writeFileSync(outputPath, JSON.stringify(result, null, 2));

// --- Print summary ---

const entries = Object.values(result);
const withData = entries.filter(e => e.sample_size >= MIN_SAMPLE_SIZE);
const insufficient = entries.filter(e => e.sample_size < MIN_SAMPLE_SIZE);
const easy = withData.filter(e => e.tier === 'easy').length;
const med = withData.filter(e => e.tier === 'medium').length;
const hard = withData.filter(e => e.tier === 'hard').length;

console.log(`\nProcessed ${withData.length} observations with sufficient data (${MIN_SAMPLE_SIZE}+ attempts)`);
console.log(`Tier distribution: ${easy} easy, ${med} medium, ${hard} hard`);
console.log(`${insufficient.length} observations have insufficient data (defaulted to medium)`);

// Top 10 hardest/easiest (from those with sufficient data)
const sorted = [...withData].sort((a, b) => b.difficulty - a.difficulty);
const top10Hard = sorted.slice(0, 10);
const top10Easy = sorted.slice(-10).reverse();

console.log(`\nTop 10 hardest:`);
for (const e of top10Hard) {
  const id = Object.keys(result).find(k => result[k] === e);
  console.log(`  ${id}: difficulty=${e.difficulty}, miss_rate=${e.miss_rate}, samples=${e.sample_size}`);
}

console.log(`\nTop 10 easiest:`);
for (const e of top10Easy) {
  const id = Object.keys(result).find(k => result[k] === e);
  console.log(`  ${id}: difficulty=${e.difficulty}, miss_rate=${e.miss_rate}, samples=${e.sample_size}`);
}

console.log(`\nWritten to ${outputPath}`);
