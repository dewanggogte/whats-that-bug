import { getBugs101Name } from './game-engine.js';

export function pairKey(a, b) {
  return [String(a || ''), String(b || '')].sort().join('|');
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

function safeBugs101Name(taxon) {
  return getBugs101Name(taxon || {}) || taxon?.order_common || taxon?.order || 'Unknown';
}

function quickestTell({ scoring, pickedTaxon, correctTaxon, traits, bugs101Tells }) {
  if (scoring === 'binary') {
    const pickedLabel = safeBugs101Name(pickedTaxon);
    const correctLabel = safeBugs101Name(correctTaxon);
    const pairTell = bugs101Tells[pairKey(pickedLabel, correctLabel)];
    if (pairTell) return { tell: pairTell, isPairTell: true };
    return { tell: traits[correctLabel]?.key_mark || '', isPairTell: false };
  }

  return { tell: traits[correctTaxon?.genus]?.key_mark || '', isPairTell: false };
}

export function buildLearningCard({ picked, correct, scoring, traits = {}, bugs101Tells = {}, speciesContent = {} } = {}) {
  const pickedTaxon = picked?.taxon || {};
  const correctTaxon = correct?.taxon || {};
  const speciesEntry = speciesContent[correctTaxon.species] || {};
  const funFact = firstSentence(speciesEntry.summary || correct?.wikipedia_summary || '');
  const { tell, isPairTell } = quickestTell({ scoring, pickedTaxon, correctTaxon, traits, bugs101Tells });

  return {
    title: 'Close one!',
    answerName: correctTaxon.common_name || correctTaxon.genus || correctTaxon.species || 'Unknown',
    answerSci: correctTaxon.species || correctTaxon.genus || correctTaxon.order || '',
    tell,
    isPairTell,
    pickedName: pickedTaxon.common_name || pickedTaxon.genus || pickedTaxon.species || '',
    funFact,
    learnMoreUrl: correct?.inat_url || '',
  };
}
