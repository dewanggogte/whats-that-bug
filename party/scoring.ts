import type { Observation } from './data-loader';

const BEE_FAMILIES = ['Apidae', 'Megachilidae', 'Halictidae', 'Andrenidae', 'Colletidae'];
const ANT_FAMILIES = ['Formicidae', 'Mutillidae'];
const BUTTERFLY_FAMILIES = ['Nymphalidae', 'Papilionidae', 'Pieridae', 'Lycaenidae', 'Riodinidae', 'Hesperiidae'];
const CRICKET_FAMILIES = ['Gryllidae', 'Rhaphidophoridae', 'Anostostomatidae'];
const TERMITE_FAMILIES = ['Termitidae', 'Rhinotermitidae', 'Kalotermitidae', 'Hodotermitidae', 'Mastotermitidae', 'Stylotermitidae', 'Archotermopsidae', 'Serritermitidae'];
const DAMSELFLY_FAMILIES = ['Coenagrionidae', 'Calopterygidae', 'Lestidae', 'Platycnemididae', 'Platystictidae'];
const CICADA_FAMILIES = ['Cicadidae'];
const STINK_BUG_FAMILIES = ['Pentatomidae', 'Scutelleridae', 'Acanthosomatidae', 'Cydnidae', 'Tessaratomidae'];
const PLANTHOPPER_FAMILIES = ['Fulgoridae', 'Flatidae', 'Membracidae', 'Ischnorhinidae'];
const APHID_FAMILIES = ['Aphididae', 'Eriococcidae'];
const WATER_BUG_FAMILIES = ['Nepidae', 'Notonectidae', 'Belostomatidae'];
const MOSQUITO_FAMILIES = ['Culicidae'];

export function getBugs101Name(taxon: Observation['taxon']): string {
  if (taxon.order === 'Hymenoptera') {
    if (BEE_FAMILIES.includes(taxon.family || '')) {
      if (taxon.genus === 'Apis') return 'Honey Bee';
      if (taxon.genus === 'Bombus') return 'Bumble Bee';
      return 'Bee';
    }
    if (ANT_FAMILIES.includes(taxon.family || '')) return 'Ant';
    return 'Wasp';
  }
  if (taxon.order === 'Lepidoptera') {
    if (taxon.family === 'Papilionidae') return 'Swallowtail Butterfly';
    if (BUTTERFLY_FAMILIES.includes(taxon.family || '')) return 'Butterfly';
    if (taxon.family === 'Sphingidae') return 'Hawk Moth';
    if (taxon.family === 'Saturniidae') return 'Silk Moth';
    return 'Moth';
  }
  if (taxon.order === 'Orthoptera') {
    if (taxon.family === 'Tettigoniidae') return 'Bush Cricket';
    if (CRICKET_FAMILIES.includes(taxon.family || '')) return 'Cricket';
    return 'Grasshopper';
  }
  if (taxon.order === 'Odonata') {
    return DAMSELFLY_FAMILIES.includes(taxon.family || '') ? 'Damselfly' : 'Dragonfly';
  }
  if (taxon.order === 'Hemiptera') {
    if (CICADA_FAMILIES.includes(taxon.family || '')) return 'Cicada';
    if (STINK_BUG_FAMILIES.includes(taxon.family || '')) return 'Stink Bug';
    if (PLANTHOPPER_FAMILIES.includes(taxon.family || '')) return 'Planthopper';
    if (APHID_FAMILIES.includes(taxon.family || '')) return 'Aphid';
    if (WATER_BUG_FAMILIES.includes(taxon.family || '')) return 'Water Bug';
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
    if (MOSQUITO_FAMILIES.includes(taxon.family || '')) return 'Mosquito';
    if (taxon.family === 'Syrphidae') return 'Hover Fly';
    if (taxon.family === 'Tipulidae' || taxon.family === 'Limoniidae') return 'Crane Fly';
    return 'Fly';
  }
  if (taxon.order === 'Blattodea') {
    return TERMITE_FAMILIES.includes(taxon.family || '') ? 'Termite' : 'Cockroach';
  }
  const names: Record<string, string> = {
    'Ixodida': 'Tick', 'Scorpiones': 'Scorpion', 'Opiliones': 'Harvestman',
    'Mantodea': 'Mantis', 'Phasmida': 'Stick Insect', 'Neuroptera': 'Lacewing',
    'Dermaptera': 'Earwig', 'Ephemeroptera': 'Mayfly',
    'Trichoptera': 'Caddisfly', 'Scolopendromorpha': 'Centipede',
    'Isopoda': 'Woodlouse', 'Julida': 'Millipede',
  };
  return names[taxon.order || ''] || taxon.order_common || taxon.order || 'Unknown';
}

export function calculateScore(picked: Observation['taxon'], correct: Observation['taxon']): number {
  if (picked.species === correct.species) return 100;
  if (picked.genus === correct.genus) return 75;
  if (picked.family === correct.family) return 50;
  if (picked.order === correct.order) return 25;
  return 0;
}

export function calculateTimedScore(timeMs: number): number {
  if (timeMs < 3000) return 100;
  if (timeMs < 5000) return 75;
  if (timeMs < 8000) return 50;
  if (timeMs < 12000) return 25;
  return 10;
}

export type Scoring = 'binary' | 'genus' | 'species';

export function scoreAnswer(picked: Observation, correct: Observation, scoring: Scoring): number {
  if (scoring === 'binary') {
    return getBugs101Name(picked.taxon) === getBugs101Name(correct.taxon) ? 100 : 0;
  }
  if (scoring === 'genus') {
    return picked.taxon.genus === correct.taxon.genus ? 100 : 0;
  }
  return calculateScore(picked.taxon, correct.taxon);
}
