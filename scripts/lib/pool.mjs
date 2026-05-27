// scripts/lib/pool.mjs
// Pure helpers for the daily-challenge pool tooling. No image IO here.
//
// CANONICAL node-side source of getBugs101Name + VALID_BUGS101_NAMES.
// review-server.mjs imports from here (its old local copy is deleted in
// a later task). generate-daily.mjs keeps its own copy only because it is
// being retired/unwired — do not add new copies; import from this file.
//
// hashDate mirrors src/scripts/daily-engine.js intentionally — the src/
// (browser) and scripts/ (node) trees are not bundled together, so that
// one ~6-line function is duplicated across the runtime boundary by design.

const VALID_BUGS101_NAMES = new Set([
  'Ant', 'Aphid', 'Bee', 'Beetle', 'Bumble Bee', 'Butterfly', 'Caddisfly',
  'Centipede', 'Cicada', 'Cockroach', 'Crane Fly', 'Cricket', 'Damselfly',
  'Dragonfly', 'Earwig', 'Fly', 'Grasshopper', 'Harvestman', 'Hawk Moth',
  'Honey Bee', 'Hover Fly', 'Jumping Spider', 'Bush Cricket', 'Lacewing',
  'Longhorn Beetle', 'Mantis', 'Mayfly', 'Millipede', 'Moth', 'Orb Weaver',
  'Planthopper', 'Scarab', 'Scorpion', 'Silk Moth', 'Spider', 'Stag Beetle',
  'Stick Insect', 'Stink Bug', 'Swallowtail', 'Tarantula', 'Termite', 'Tick', 'True Bug',
  'Wasp', 'Water Bug', 'Weevil', 'Woodlouse',
]);

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

// Mirrors getBugs101Name in scripts/review-server.mjs (the prior canonical copy).
export function getBugs101Name(taxon) {
  if (!taxon) return undefined;
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
    if (taxon.family === 'Papilionidae') return 'Swallowtail';
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
    if (PLANTHOPPER_FAMILIES.includes(taxon.family)) return 'Planthopper';
    if (APHID_FAMILIES.includes(taxon.family)) return 'Aphid';
    if (WATER_BUG_FAMILIES.includes(taxon.family)) return 'Water Bug';
    return 'True Bug';
  }
  if (taxon.order === 'Coleoptera') {
    if (taxon.family === 'Lucanidae') return 'Stag Beetle';
    if (taxon.family === 'Scarabaeidae') return 'Scarab';
    if (taxon.family === 'Cerambycidae') return 'Longhorn Beetle';
    if (taxon.family === 'Curculionidae') return 'Weevil';
    return 'Beetle';
  }
  if (taxon.order === 'Araneae') {
    if (taxon.family === 'Salticidae') return 'Jumping Spider';
    if (taxon.family === 'Theraphosidae') return 'Tarantula';
    if (taxon.family === 'Araneidae' || taxon.family === 'Nephilidae') return 'Orb Weaver';
    return 'Spider';
  }
  if (taxon.order === 'Diptera') {
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

export { VALID_BUGS101_NAMES };

export function hashDate(dateStr) {
  let h = 0x811c9dc5;
  for (let i = 0; i < dateStr.length; i++) {
    h ^= dateStr.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00Z'); // noon UTC avoids DST edges
  d.setUTCDate(d.getUTCDate() + n);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function avoidWindowSize(poolSize) {
  return Math.min(poolSize - 1, 30);
}

/**
 * Extend `schedule` forward `days` dates from `fromDate` (inclusive).
 * Existing keys are never rewritten. Each new date deterministically picks
 * a pool entry, excluding ids used within the previous `avoidWindowSize`
 * scheduled days to prevent clustering.
 */
export function topUpSchedule(pool, schedule, fromDate, days) {
  const out = { ...schedule };
  const ids = pool.map(p => p.id);
  if (ids.length === 0) return out;
  const window = avoidWindowSize(ids.length);
  let date = fromDate;
  for (let i = 0; i < days; i++) {
    if (!(date in out)) {
      const recent = new Set();
      let d = addDays(date, -1);
      for (let k = 0; k < window; k++) {
        if (out[d] != null) recent.add(out[d]);
        d = addDays(d, -1);
      }
      const candidates = ids.filter(id => !recent.has(id));
      const pickFrom = candidates.length ? candidates : ids;
      out[date] = pickFrom[hashDate(date) % pickFrom.length];
    }
    date = addDays(date, 1);
  }
  return out;
}

/**
 * Transform a manifest into pool entries (pure — no image IO).
 * - bugs101 entries: kept verbatim, source:'bugs101', needsRecrop:false.
 * - allbugs entries: name re-derived via getBugs101Name(candidate taxon),
 *   source:'allbugs', needsRecrop:true (caller regenerates crops from center).
 * - de-dupe by observation id, first occurrence wins (bugs101 precede allbugs
 *   within a day, so a native bugs101 entry beats the derived one).
 * Returns { entries, dropped:[{id,reason}] }.
 */
export function buildPoolEntries(manifest, candidatesById) {
  const entries = [];
  const dropped = [];
  const seen = new Set();

  for (const ch of manifest.challenges) {
    for (const kind of ['bugs101', 'allbugs']) {
      const e = ch[kind];
      if (!e || e.observation_id == null) continue;
      const id = e.observation_id;
      if (seen.has(id)) continue;

      if (kind === 'bugs101') {
        seen.add(id);
        entries.push({
          id,
          answer_common: e.answer_common,
          answer_order: e.answer_order,
          crops: e.crops,
          reveal: e.reveal,
          attribution: e.attribution || '',
          wikipedia_summary: e.wikipedia_summary || '',
          inat_url: e.inat_url || '',
          center_x: e.center_x ?? 0.5,
          center_y: e.center_y ?? 0.5,
          source: 'bugs101',
          needsRecrop: false,
        });
      } else {
        const cand = candidatesById.get(id);
        const name = cand ? getBugs101Name(cand.taxon) : undefined;
        if (!name || !VALID_BUGS101_NAMES.has(name)) {
          dropped.push({ id, reason: `no valid Bugs 101 name (${cand?.taxon?.order || 'unknown'})` });
          continue;
        }
        seen.add(id);
        entries.push({
          id,
          answer_common: name,
          answer_order: cand.taxon.order,
          crops: [],
          reveal: e.reveal,
          attribution: e.attribution || cand.attribution || '',
          wikipedia_summary: e.wikipedia_summary || '',
          inat_url: e.inat_url || cand.inat_url || '',
          center_x: e.center_x ?? 0.5,
          center_y: e.center_y ?? 0.5,
          photo_url: cand.photo_url,
          source: 'allbugs',
          needsRecrop: true,
        });
      }
    }
  }
  return { entries, dropped };
}
