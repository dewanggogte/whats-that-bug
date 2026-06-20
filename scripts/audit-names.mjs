/**
 * Audit display names for redundant category suffixes.
 * Run: node scripts/audit-names.mjs
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const observations = JSON.parse(
  readFileSync(join(__dirname, '../public/data/observations.json'), 'utf8')
);

// Mirrors game-engine.js — keep in sync
const BEE_FAMILIES = ['Apidae', 'Megachilidae', 'Halictidae', 'Andrenidae', 'Colletidae'];
const ANT_FAMILIES = ['Formicidae', 'Mutillidae'];
const BUTTERFLY_FAMILIES = ['Nymphalidae', 'Papilionidae', 'Pieridae', 'Lycaenidae', 'Riodinidae', 'Hesperiidae'];
const CRICKET_FAMILIES = ['Gryllidae', 'Rhaphidophoridae', 'Anostostomatidae'];
const TERMITE_FAMILIES = ['Termitidae', 'Rhinotermitidae', 'Kalotermitidae', 'Hodotermitidae', 'Mastotermitidae', 'Stylotermitidae', 'Archotermopsidae', 'Serritermitidae'];
const DAMSELFLY_FAMILIES = ['Coenagrionidae', 'Calopterygidae', 'Lestidae', 'Platycnemididae', 'Platystictidae'];
const CICADA_FAMILIES = ['Cicadidae'];
const STINK_BUG_FAMILIES = ['Pentatomidae', 'Scutelleridae', 'Acanthosomatidae', 'Cydnidae', 'Tessaratomidae'];
const PLANTHOPPER_FAMILIES = ['Fulgoridae', 'Flatidae', 'Ischnorhinidae'];
const TREEHOPPER_FAMILIES = ['Membracidae'];
const APHID_FAMILIES = ['Aphididae', 'Eriococcidae'];
const WATER_BUG_FAMILIES = ['Nepidae', 'Notonectidae', 'Belostomatidae'];
const MOSQUITO_FAMILIES = ['Culicidae'];

function getBugs101Name(taxon) {
  if (taxon.order === 'Hymenoptera') {
    if (BEE_FAMILIES.includes(taxon.family)) {
      if (taxon.genus === 'Apis') return 'Honey Bee';
      if (taxon.genus === 'Bombus') return 'Bumble Bee';
      return 'Bee';
    }
    if (ANT_FAMILIES.includes(taxon.family)) return 'Ant';
    return 'Wasp';
  }
  if (taxon.order === 'Lepidoptera') {
    if (taxon.family === 'Papilionidae') return 'Swallowtail Butterfly';
    if (BUTTERFLY_FAMILIES.includes(taxon.family)) return 'Butterfly';
    if (taxon.family === 'Sphingidae') return 'Hawk Moth';
    if (taxon.family === 'Saturniidae') return 'Silk Moth';
    return 'Moth';
  }
  if (taxon.order === 'Orthoptera') {
    if (taxon.family === 'Tettigoniidae') return 'Bush Cricket';
    if (CRICKET_FAMILIES.includes(taxon.family)) return 'Cricket';
    return 'Grasshopper';
  }
  if (taxon.order === 'Odonata') {
    return DAMSELFLY_FAMILIES.includes(taxon.family) ? 'Damselfly' : 'Dragonfly';
  }
  if (taxon.order === 'Hemiptera') {
    if (CICADA_FAMILIES.includes(taxon.family)) return 'Cicada';
    if (STINK_BUG_FAMILIES.includes(taxon.family)) return 'Stink Bug';
    if (TREEHOPPER_FAMILIES.includes(taxon.family)) return 'Treehopper';
    if (PLANTHOPPER_FAMILIES.includes(taxon.family)) return 'Planthopper';
    if (APHID_FAMILIES.includes(taxon.family)) return 'Aphid';
    if (WATER_BUG_FAMILIES.includes(taxon.family)) return 'Water Bug';
    return 'True Bug';
  }
  if (taxon.order === 'Coleoptera') {
    if (taxon.family === 'Lucanidae') return 'Stag Beetle';
    if (taxon.family === 'Scarabaeidae') return 'Scarab Beetle';
    if (taxon.family === 'Cerambycidae') return 'Longhorn Beetle';
    if (taxon.family === 'Curculionidae') return 'Weevil';
    return 'Beetle';
  }
  if (taxon.order === 'Araneae') {
    if (taxon.family === 'Salticidae') return 'Jumping Spider';
    if (taxon.family === 'Theraphosidae') return 'Tarantula';
    if (taxon.family === 'Araneidae' || taxon.family === 'Nephilidae') return 'Orb Weaver Spider';
    return 'Spider';
  }
  if (taxon.order === 'Diptera') {
    if (MOSQUITO_FAMILIES.includes(taxon.family)) return 'Mosquito';
    if (taxon.family === 'Syrphidae') return 'Hover Fly';
    if (taxon.family === 'Tipulidae' || taxon.family === 'Limoniidae') return 'Crane Fly';
    return 'Fly';
  }
  if (taxon.order === 'Blattodea') {
    return TERMITE_FAMILIES.includes(taxon.family) ? 'Termite' : 'Cockroach';
  }
  const names = {
    'Ixodida': 'Tick', 'Scorpiones': 'Scorpion', 'Opiliones': 'Harvestman',
    'Mantodea': 'Mantis', 'Phasmida': 'Stick Insect', 'Neuroptera': 'Lacewing',
    'Dermaptera': 'Earwig', 'Ephemeroptera': 'Mayfly',
    'Trichoptera': 'Caddisfly', 'Scolopendromorpha': 'Centipede',
    'Isopoda': 'Woodlouse', 'Julida': 'Millipede',
  };
  return names[taxon.order] || taxon.order_common || taxon.order;
}

const CATEGORY_SYNONYMS = {
  'cricket':     ['katydid', 'weta'],
  'grasshopper': ['locust'],
};

function withGroupNoun(taxon) {
  const categoryLabel = getBugs101Name(taxon);
  const lastWord = categoryLabel.split(' ').pop();
  const name = taxon.common_name.toLowerCase();
  const lowerNoun = lastWord.toLowerCase();
  if (name.includes(lowerNoun)) return taxon.common_name;
  const synonyms = CATEGORY_SYNONYMS[lowerNoun] || [];
  if (synonyms.some(s => name.includes(s))) return taxon.common_name;
  return `${taxon.common_name} ${lastWord}`;
}

// Check for display names where the appended noun appears redundantly.
// Only flag when a noun was actually appended (display !== common_name)
// AND that noun already appeared in the original common name — meaning the
// fix missed a case.
const issues = [];
const seen = new Set();

for (const obs of observations) {
  const { taxon } = obs;
  if (!taxon?.common_name) continue;

  const display = withGroupNoun(taxon);

  // No noun was appended — nothing to audit here
  if (display === taxon.common_name) continue;

  const appended = display.slice(taxon.common_name.length).trim().toLowerCase();
  const originalLower = taxon.common_name.toLowerCase();

  // Flag if the appended word was already present in the original name
  if (originalLower.includes(appended)) {
    const key = `${taxon.common_name}|${taxon.family}`;
    if (!seen.has(key)) {
      seen.add(key);
      issues.push({ display, common_name: taxon.common_name, family: taxon.family, category: getBugs101Name(taxon) });
    }
  }
}

if (issues.length === 0) {
  console.log('✓ No redundant display names found.');
} else {
  console.log(`Found ${issues.length} issue(s):\n`);
  for (const { display, common_name, family, category } of issues) {
    console.log(`  DISPLAY : "${display}"`);
    console.log(`  NAME    : "${common_name}"  FAMILY: ${family}  CATEGORY: ${category}\n`);
  }
}
