#!/usr/bin/env node
// Validates learning-card traits and Bugs 101 pairwise tells against the live sets.

import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const TRAIT_FIELDS = ['structure', 'wings', 'size', 'color', 'key_mark'];
const MAX_TRAIT_LEN = 120;
const MAX_TELL_LEN = 160;

function sortedPairKey(a, b) {
  return [String(a || ''), String(b || '')].sort().join('|');
}

export function validateTraitEntry(entry) {
  const errors = [];
  if (!entry || typeof entry !== 'object') return ['not an object'];

  for (const field of TRAIT_FIELDS) {
    const value = String(entry[field] || '').trim();
    if (!value) errors.push(`missing ${field}`);
    else if (value.length > MAX_TRAIT_LEN) errors.push(`${field} too long (${value.length})`);
  }

  return errors;
}

export function validateTellEntry(key, tell) {
  const errors = [];
  const parts = String(key || '').split('|');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    errors.push('invalid pair key');
  } else if (sortedPairKey(parts[0], parts[1]) !== key) {
    errors.push('pair key not sorted');
  }

  const value = String(tell || '').trim();
  if (!value) errors.push('missing tell');
  else if (value.length > MAX_TELL_LEN) errors.push(`tell too long (${value.length})`);

  return errors;
}

export function coverageReport(requiredKeys, data) {
  const missing = requiredKeys.filter(key => !data[key]);
  return { required: requiredKeys.length, present: requiredKeys.length - missing.length, missing };
}

export function expectedPairKeys(categories) {
  const sorted = [...new Set(categories)].sort();
  const pairs = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      pairs.push(sortedPairKey(sorted[i], sorted[j]));
    }
  }
  return pairs;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const root = join(__dirname, '..');
  const traitsPath = join(root, 'public', 'data', 'taxon-traits.json');
  const tellsPath = join(root, 'public', 'data', 'bugs101-tells.json');
  const observations = JSON.parse(readFileSync(join(root, 'public', 'data', 'observations.json'), 'utf-8'));
  const sets = JSON.parse(readFileSync(join(root, 'public', 'data', 'sets.json'), 'utf-8'));
  const traits = JSON.parse(readFileSync(traitsPath, 'utf-8'));
  const tells = existsSync(tellsPath) ? JSON.parse(readFileSync(tellsPath, 'utf-8')) : {};
  const { getBugs101Name } = await import('../src/scripts/game-engine.js');

  let traitErrors = 0;
  for (const [key, entry] of Object.entries(traits)) {
    const errors = validateTraitEntry(entry);
    if (errors.length) {
      traitErrors++;
      console.log(`  x trait ${key}: ${errors.join(', ')}`);
    }
  }

  let tellErrors = 0;
  for (const [key, tell] of Object.entries(tells)) {
    const errors = validateTellEntry(key, tell);
    if (errors.length) {
      tellErrors++;
      console.log(`  x tell ${key}: ${errors.join(', ')}`);
    }
  }

  const liveGenera = new Set();
  const liveCategories = new Set();
  for (const def of Object.values(sets)) {
    for (const id of def.observation_ids) {
      const taxon = observations[id].taxon;
      if (def.scoring === 'binary') liveCategories.add(getBugs101Name(taxon));
      else if (taxon.genus) liveGenera.add(taxon.genus);
    }
  }

  const genusCoverage = coverageReport([...liveGenera], traits);
  const categoryCoverage = coverageReport([...liveCategories], traits);
  const tellCoverage = coverageReport(expectedPairKeys([...liveCategories]), tells);

  console.log(`\nTrait schema errors: ${traitErrors}`);
  console.log(`Tell schema errors: ${tellErrors}`);
  console.log(`Genus trait coverage: ${genusCoverage.present}/${genusCoverage.required} (missing ${genusCoverage.missing.length})`);
  console.log(`Bugs 101 trait coverage: ${categoryCoverage.present}/${categoryCoverage.required} (missing ${categoryCoverage.missing.length})`);
  console.log(`Bugs 101 tell coverage: ${tellCoverage.present}/${tellCoverage.required} (missing ${tellCoverage.missing.length})`);

  if (genusCoverage.missing.length) console.log(`  Missing genera: ${genusCoverage.missing.slice(0, 30).join(', ')}${genusCoverage.missing.length > 30 ? ' ...' : ''}`);
  if (categoryCoverage.missing.length) console.log(`  Missing categories: ${categoryCoverage.missing.join(', ')}`);
  if (tellCoverage.missing.length) console.log(`  Missing tells: ${tellCoverage.missing.slice(0, 30).join(', ')}${tellCoverage.missing.length > 30 ? ' ...' : ''}`);

  const failed = traitErrors || tellErrors || genusCoverage.missing.length || categoryCoverage.missing.length || tellCoverage.missing.length;
  process.exit(failed ? 1 : 0);
}
