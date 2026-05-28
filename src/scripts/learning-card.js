import { getBugs101Name } from './game-engine.js';

export const TRAIT_PRIORITY = ['structure', 'wings', 'size', 'color'];

export function pairKey(a, b) {
  return [String(a || ''), String(b || '')].sort().join('|');
}

export function normalize(s) {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function stripHtml(html) {
  return String(html ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

export function firstSentence(text) {
  const t = stripHtml(text);
  if (!t) return '';
  const match = t.match(/^.*?[.!?](\s|$)/);
  return match ? match[0].trim() : t;
}

export function pickContrastDimensions(pickedTraits, correctTraits, limit = 2) {
  if (!pickedTraits || !correctTraits) return [];
  const dimensions = [];
  for (const dim of TRAIT_PRIORITY) {
    const picked = normalize(pickedTraits[dim]);
    const correct = normalize(correctTraits[dim]);
    if (picked && correct && picked !== correct) dimensions.push(dim);
    if (dimensions.length >= limit) break;
  }
  return dimensions;
}

function safeBugs101Name(taxon) {
  return getBugs101Name(taxon || {}) || taxon?.order_common || taxon?.order || 'Unknown';
}

function answerLabel(taxon, scoring) {
  if (scoring === 'binary') return safeBugs101Name(taxon);
  return taxon?.genus || taxon?.common_name || taxon?.species || 'Unknown';
}

function displayName(taxon, scoring) {
  return taxon?.common_name || answerLabel(taxon, scoring);
}

function latinLabel(taxon, scoring) {
  if (scoring === 'binary') return taxon?.order || taxon?.genus || taxon?.species || '';
  return taxon?.genus || taxon?.species || taxon?.order || '';
}

function familyLabel(taxon) {
  return taxon?.family_common || taxon?.family || '';
}

function pushMark(marks, text) {
  const cleaned = String(text || '').trim();
  if (cleaned && !marks.includes(cleaned)) marks.push(cleaned);
}

function traitMarks({ scoring, pickedTaxon, correctTaxon, traits, bugs101Tells, pickedLabel, correctLabel }) {
  const marks = [];

  if (scoring === 'binary') {
    const pairTell = bugs101Tells[pairKey(pickedLabel, correctLabel)];
    if (pairTell) pushMark(marks, `It is a ${correctLabel}, not a ${pickedLabel}: ${pairTell}`);
  }

  const pickedTraits = traits[scoring === 'binary' ? pickedLabel : pickedTaxon?.genus];
  const correctTraits = traits[scoring === 'binary' ? correctLabel : correctTaxon?.genus];

  for (const dim of pickContrastDimensions(pickedTraits, correctTraits)) {
    const label = dim === 'structure' ? 'Body' : dim[0].toUpperCase() + dim.slice(1);
    pushMark(marks, `${label}: ${correctLabel} has ${correctTraits[dim]}, while ${pickedLabel} has ${pickedTraits[dim]}`);
  }

  if (marks.length === 0 && correctTraits?.key_mark) {
    pushMark(marks, `${correctLabel}: ${correctTraits.key_mark}`);
  }

  return marks;
}

function taxonomyFallbackMarks({ scoring, pickedTaxon, correctTaxon, pickedLabel, correctLabel }) {
  const marks = [];

  if (pickedLabel !== correctLabel) {
    pushMark(marks, `${scoring === 'binary' ? 'Type' : 'Genus'}: ${correctLabel}, not ${pickedLabel}`);
  }

  const correctFamily = familyLabel(correctTaxon);
  const pickedFamily = familyLabel(pickedTaxon);
  if (correctFamily && pickedFamily && correctFamily !== pickedFamily) {
    pushMark(marks, `Family: ${correctFamily}, not ${pickedFamily}`);
  } else if (correctFamily) {
    pushMark(marks, `Family clue: compare details in ${correctFamily}`);
  }

  if (correctTaxon?.order && pickedTaxon?.order && correctTaxon.order !== pickedTaxon.order) {
    pushMark(marks, `Order: ${correctTaxon.order}, not ${pickedTaxon.order}`);
  } else if (correctTaxon?.order) {
    pushMark(marks, `Order clue: both answers sit close to ${correctTaxon.order}, so small shape details matter`);
  }

  return marks;
}

export function buildLearningCard({ picked, correct, scoring, traits = {}, bugs101Tells = {}, speciesContent = {} } = {}) {
  const pickedTaxon = picked?.taxon || {};
  const correctTaxon = correct?.taxon || {};
  const pickedLabel = answerLabel(pickedTaxon, scoring);
  const correctLabel = answerLabel(correctTaxon, scoring);
  const speciesEntry = speciesContent[correctTaxon.species] || {};
  const funFact = firstSentence(speciesEntry.summary || correct?.wikipedia_summary || '');

  const marks = [
    ...traitMarks({ scoring, pickedTaxon, correctTaxon, traits, bugs101Tells, pickedLabel, correctLabel }),
    ...taxonomyFallbackMarks({ scoring, pickedTaxon, correctTaxon, pickedLabel, correctLabel }),
  ].slice(0, 3);

  if (marks.length === 0 && funFact) pushMark(marks, funFact);

  return {
    title: 'Not quite',
    verdict: `You guessed ${pickedLabel}. The answer is ${correctLabel}.`,
    guessedName: displayName(pickedTaxon, scoring),
    guessedSci: latinLabel(pickedTaxon, scoring),
    answerName: displayName(correctTaxon, scoring),
    answerSci: correctTaxon.species || latinLabel(correctTaxon, scoring),
    marks,
    funFact,
    learnMoreUrl: correct?.inat_url || '',
  };
}
