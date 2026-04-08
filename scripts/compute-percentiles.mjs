#!/usr/bin/env node

/**
 * Compute percentile distributions from the events sheet.
 * Reads events via the Apps Script webhook or from a local CSV export,
 * and outputs public/data/percentiles.json.
 *
 * Usage: node scripts/compute-percentiles.mjs
 * Env: PUBLIC_GOOGLE_SHEET_WEBHOOK_URL (optional — falls back to CSV)
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, '..', 'public', 'data', 'percentiles.json');

const WEBHOOK_URL = process.env.PUBLIC_GOOGLE_SHEET_WEBHOOK_URL || '';

const ELIGIBLE_SETS = ['bugs_101_streak', 'bugs_101_time_trial', 'streak', 'time_trial'];

/**
 * Fetch events from the webhook, or fall back to a local CSV export.
 * To use CSV fallback: export the Events sheet as CSV to analytics/output/events.csv
 */
async function fetchEvents() {
  if (WEBHOOK_URL) {
    try {
      console.log('Fetching events from webhook...');
      const res = await fetch(`${WEBHOOK_URL}?action=events`);
      if (res.ok) {
        const data = await res.json();
        console.log(`Fetched ${data.length} events from webhook`);
        return data;
      }
      console.warn(`Webhook returned ${res.status}, falling back to CSV...`);
    } catch (err) {
      console.warn(`Webhook failed: ${err.message}, falling back to CSV...`);
    }
  }

  const csvPath = join(__dirname, '..', 'analytics', 'output', 'events.csv');
  if (!existsSync(csvPath)) {
    throw new Error(
      `No events source available. Either set PUBLIC_GOOGLE_SHEET_WEBHOOK_URL ` +
      `or export the Events sheet as CSV to ${csvPath}`
    );
  }

  console.log(`Reading events from ${csvPath}...`);
  const csv = readFileSync(csvPath, 'utf-8');
  const lines = csv.trim().split('\n');
  const headers = lines[0].split(',');
  const events = lines.slice(1).map(line => {
    const values = line.split(',');
    const obj = {};
    headers.forEach((h, i) => { obj[h.trim()] = values[i]?.trim(); });
    if (obj.total_score) obj.total_score = Number(obj.total_score);
    if (obj.rounds_played) obj.rounds_played = Number(obj.rounds_played);
    return obj;
  });
  console.log(`Read ${events.length} events from CSV`);
  return events;
}

function isStreakSet(setKey) {
  return setKey.includes('streak');
}

function extractScore(event) {
  const setKey = event.set || '';
  if (isStreakSet(setKey)) {
    const roundsPlayed = event.rounds_played || 0;
    return Math.max(0, roundsPlayed - 1);
  } else {
    return event.total_score || 0;
  }
}

function computeDistributions(events) {
  const distributions = {};

  for (const setKey of ELIGIBLE_SETS) {
    distributions[setKey] = { distribution: {}, totalSessions: 0 };
  }

  const sessionEndEvents = events.filter(e => e.type === 'session_end');

  for (const event of sessionEndEvents) {
    const setKey = event.set || '';
    if (!ELIGIBLE_SETS.includes(setKey)) continue;

    const score = extractScore(event);
    const scoreKey = String(score);

    distributions[setKey].distribution[scoreKey] =
      (distributions[setKey].distribution[scoreKey] || 0) + 1;
    distributions[setKey].totalSessions += 1;
  }

  return distributions;
}

async function main() {
  try {
    const events = await fetchEvents();
    const distributions = computeDistributions(events);

    const output = {
      generated: new Date().toISOString(),
      ...distributions,
    };

    mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
    writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));

    console.log(`\nPercentiles written to ${OUTPUT_PATH}`);
    for (const [key, data] of Object.entries(distributions)) {
      console.log(`  ${key}: ${data.totalSessions} sessions`);
    }
  } catch (err) {
    console.error('Failed to compute percentiles:', err.message);
    process.exit(1);
  }
}

main();
