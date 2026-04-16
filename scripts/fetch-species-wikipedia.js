#!/usr/bin/env node
// scripts/fetch-species-wikipedia.js
//
// Fetches Wikipedia article summaries for all species in observations.json.
// Outputs data/species-wikipedia-raw.json for curation through Claude.
//
// Usage: node scripts/fetch-species-wikipedia.js
//
// Rate-limited: ~100ms between requests to be respectful to Wikipedia's API.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OBS_PATH = join(ROOT, 'public', 'data', 'observations.json');
const OUTPUT_DIR = join(ROOT, 'data');
const OUTPUT_PATH = join(OUTPUT_DIR, 'species-wikipedia-raw.json');

const WIKI_API = 'https://en.wikipedia.org/api/rest_v1/page/summary';
const DELAY_MS = 100;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWikiSummary(title) {
  const encoded = encodeURIComponent(title.replace(/ /g, '_'));
  const url = `${WIKI_API}/${encoded}`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'WhatsThatBug/1.0 (game; contact: hello@mukul-mehta.in)' },
    });

    if (res.status === 404) return null;
    if (!res.ok) {
      console.error(`  HTTP ${res.status} for "${title}"`);
      return null;
    }

    const data = await res.json();
    if (data.type === 'disambiguation') return null;

    return {
      title: data.title,
      extract: data.extract || '',
      extractHtml: data.extract_html || '',
      thumbnail: data.thumbnail?.source || null,
      wikiUrl: data.content_urls?.desktop?.page || null,
    };
  } catch (err) {
    console.error(`  Error for "${title}": ${err.message}`);
    return null;
  }
}

async function main() {
  console.log('Loading observations...');
  const observations = JSON.parse(readFileSync(OBS_PATH, 'utf-8'));

  // Collect unique species
  const speciesSet = new Map();
  for (const obs of observations) {
    const sp = obs.taxon?.species;
    if (!sp || speciesSet.has(sp)) continue;
    speciesSet.set(sp, {
      commonName: obs.taxon.common_name || '',
      genus: obs.taxon.genus || '',
    });
  }

  console.log(`Found ${speciesSet.size} unique species.`);

  // Load existing results to support resuming
  let existing = {};
  if (existsSync(OUTPUT_PATH)) {
    existing = JSON.parse(readFileSync(OUTPUT_PATH, 'utf-8'));
    console.log(`Loaded ${Object.keys(existing).length} existing entries — will skip them.`);
  }

  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

  const results = { ...existing };
  let fetched = 0;
  let found = 0;
  let skipped = Object.keys(existing).length;
  const total = speciesSet.size;

  for (const [scientificName, meta] of speciesSet) {
    if (results[scientificName]) continue;

    fetched++;
    if (fetched % 50 === 0) {
      console.log(`  Progress: ${fetched + skipped}/${total} (${found} found so far)`);
      // Save progress periodically
      writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2));
    }

    // Try species article first
    let result = await fetchWikiSummary(scientificName);

    // Fall back to genus article
    if (!result && meta.genus) {
      result = await fetchWikiSummary(meta.genus);
      if (result) result._fallbackLevel = 'genus';
    }

    if (result) {
      results[scientificName] = {
        ...result,
        commonName: meta.commonName,
      };
      found++;
    } else {
      results[scientificName] = null;
    }

    await sleep(DELAY_MS);
  }

  writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2));

  const nullCount = Object.values(results).filter(v => v === null).length;
  const genusCount = Object.values(results).filter(v => v?._fallbackLevel === 'genus').length;
  console.log(`\nDone! ${Object.keys(results).length} total entries.`);
  console.log(`  Species-level: ${Object.keys(results).length - nullCount - genusCount}`);
  console.log(`  Genus-level fallback: ${genusCount}`);
  console.log(`  No content: ${nullCount}`);
  console.log(`Saved to: ${OUTPUT_PATH}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
