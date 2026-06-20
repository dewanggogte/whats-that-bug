/**
 * Game engine — pure logic, no DOM dependencies.
 * Handles scoring, distractor generation, and session state.
 */

// Classes that are bugs — used by game-ui.js to skip the group-noun suffix for wildlife
export const BUG_CLASSES = new Set(['Insecta', 'Arachnida', 'Chilopoda', 'Diplopoda']);

// --- Bugs 101 category mapping ---
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

export function getBugs101Name(taxon) {
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

/**
 * Calculate score for genus-level identification.
 * @param {{ species: string, genus: string, family: string, order: string }} picked
 * @param {{ species: string, genus: string, family: string, order: string }} correct
 * @returns {number} 0 | 100
 */
export function calculateScore(picked, correct) {
  return picked.genus === correct.genus ? 100 : 0;
}

/**
 * Calculate score for Time Trial mode based on answer speed.
 * @param {number} timeMs — milliseconds taken to answer
 * @returns {number} 100 | 75 | 50 | 25 | 10
 */
export function calculateTimedScore(timeMs) {
  if (timeMs < 3000) return 100;
  if (timeMs < 5000) return 75;
  if (timeMs < 8000) return 50;
  if (timeMs < 12000) return 25;
  return 10;
}

const defaultRng = Math.random;

function shuffleWith(arr, rng = defaultRng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickRandomWith(arr, rng = defaultRng) {
  return arr[Math.floor(rng() * arr.length)];
}

function pickRandomNWith(arr, n, rng = defaultRng) {
  return shuffleWith(arr, rng).slice(0, n);
}

/**
 * Check if two category names conflict — either identical or one is a
 * sub-category of the other (e.g. "Swallowtail Butterfly" vs "Butterfly").
 * Uses word-boundary matching so "Dragonfly" doesn't conflict with "Fly".
 */
function categoriesConflict(a, b) {
  if (a === b) return true;
  const wordsA = a.split(' ');
  const wordsB = b.split(' ');
  if (wordsA.length === 1 && wordsB.includes(a)) return true;
  if (wordsB.length === 1 && wordsA.includes(b)) return true;
  return false;
}

/**
 * Check if a candidate category conflicts with any already-used category.
 */
function conflictsWithUsed(candidate, usedCategories) {
  for (const used of usedCategories) {
    if (categoriesConflict(candidate, used)) return true;
  }
  return false;
}

/**
 * Generate 3 distractors for Bugs 101 mode — each with a DIFFERENT category name.
 * Also prevents parent/child category pairs (e.g. "Butterfly" + "Swallowtail Butterfly").
 */
export function generateBugs101Distractors(correct, taxonomy, observations, rng = defaultRng) {
  const correctCategory = getBugs101Name(correct.taxon);
  const distractors = [];
  const usedCategories = new Set([correctCategory]);

  // Build a pool of all observations, shuffled
  const allIndices = Object.values(taxonomy.order).flat();
  const shuffled = shuffleWith(allIndices, rng);

  for (const idx of shuffled) {
    if (distractors.length >= 3) break;
    const pick = observations[idx];
    if (!pick) continue;
    const category = getBugs101Name(pick.taxon);
    if (conflictsWithUsed(category, usedCategories)) continue;
    distractors.push(pick);
    usedCategories.add(category);
  }
  return distractors;
}

/**
 * Generate 3 distractors for genus-level scoring — each with a DIFFERENT genus.
 * Prioritizes same-family picks for difficulty, then same-order, then any.
 */
export function generateGenusDistractors(correct, taxonomy, observations, rng = defaultRng) {
  const distractors = [];
  const usedGenera = new Set([correct.taxon.genus]);

  // Tier 1: same family, different genus (up to 2)
  const familyCandidates = shuffleWith(
    (taxonomy.family?.[correct.taxon.family] || [])
      .map(i => observations[i])
      .filter(obs => obs && !usedGenera.has(obs.taxon.genus)),
    rng
  );
  for (const pick of familyCandidates) {
    if (distractors.length >= 2) break;
    if (usedGenera.has(pick.taxon.genus)) continue;
    distractors.push(pick);
    usedGenera.add(pick.taxon.genus);
  }

  // Tier 2: same order, different genus — fill remaining
  if (distractors.length < 3) {
    const orderCandidates = shuffleWith(
      (taxonomy.order?.[correct.taxon.order] || [])
        .map(i => observations[i])
        .filter(obs => obs && !usedGenera.has(obs.taxon.genus)),
      rng
    );
    for (const pick of orderCandidates) {
      if (distractors.length >= 3) break;
      if (usedGenera.has(pick.taxon.genus)) continue;
      distractors.push(pick);
      usedGenera.add(pick.taxon.genus);
    }
  }

  // Tier 3: any order — fill remaining
  if (distractors.length < 3) {
    const allIndices = shuffleWith(Object.values(taxonomy.order).flat(), rng);
    for (const idx of allIndices) {
      if (distractors.length >= 3) break;
      const pick = observations[idx];
      if (!pick || usedGenera.has(pick.taxon.genus)) continue;
      distractors.push(pick);
      usedGenera.add(pick.taxon.genus);
    }
  }

  return distractors;
}

export function generateDistractors(correct, taxonomy, observations, rng = defaultRng) {
  const correctSpecies = correct.taxon.species;
  const distractors = [];
  const usedSpecies = new Set([correctSpecies]);

  function pickFromTier(tierName, tierKey) {
    const candidates = (taxonomy[tierName]?.[tierKey] || [])
      .map(i => observations[i])
      .filter(obs => !usedSpecies.has(obs.taxon.species));
    if (candidates.length === 0) return false;
    const pick = pickRandomWith(candidates, rng);
    distractors.push(pick);
    usedSpecies.add(pick.taxon.species);
    return true;
  }

  // Tier 1: same genus
  pickFromTier('genus', correct.taxon.genus);

  // Tier 2: same family, different genus
  const familyCandidates = (taxonomy.family?.[correct.taxon.family] || [])
    .map(i => observations[i])
    .filter(obs => !usedSpecies.has(obs.taxon.species) && obs.taxon.genus !== correct.taxon.genus);
  if (familyCandidates.length > 0) {
    const pick = pickRandomWith(familyCandidates, rng);
    distractors.push(pick);
    usedSpecies.add(pick.taxon.species);
  }

  // Tier 3: same order, different family — fill remaining slots
  const needed = 3 - distractors.length;
  if (needed > 0) {
    const orderCandidates = (taxonomy.order?.[correct.taxon.order] || [])
      .map(i => observations[i])
      .filter(obs => !usedSpecies.has(obs.taxon.species));
    const picks = pickRandomNWith(orderCandidates, needed, rng);
    for (const pick of picks) {
      distractors.push(pick);
      usedSpecies.add(pick.taxon.species);
    }
  }

  return distractors;
}

const ROUNDS_PER_SESSION = 10;
const RECENT_SESSIONS_TO_TRACK = 3;

export function modeKey(setKey, mode) {
  return `${setKey}_${mode || 'classic'}`;
}

export function bestStorageKey(setKey, mode) {
  return `best_${modeKey(setKey, mode)}`;
}

export function recentStorageKey(setKey, mode) {
  return `recent_${modeKey(setKey, mode)}`;
}

function copyStorageValue(oldKey, newKey) {
  if (oldKey === newKey) return;
  try {
    if (localStorage.getItem(newKey) !== null) return;
    const oldValue = localStorage.getItem(oldKey);
    if (oldValue !== null) localStorage.setItem(newKey, oldValue);
  } catch { /* localStorage unavailable */ }
}

export function migrateBestStorageKey(setKey, mode) {
  const key = bestStorageKey(setKey, mode);
  if ((mode || 'classic') === 'classic') copyStorageValue(`best_${setKey}`, key);
  if (setKey === 'all_bugs' && mode === 'time_trial') copyStorageValue('best_time_trial', key);
  if (setKey === 'all_bugs' && mode === 'streak') copyStorageValue('best_streak', key);
  return key;
}

function migrateRecentStorageKey(setKey, mode) {
  const key = recentStorageKey(setKey, mode);
  if ((mode || 'classic') === 'classic') copyStorageValue(`recent_${setKey}`, key);
  return key;
}

function getRecentlyUsedIds(setKey, mode) {
  try {
    const raw = localStorage.getItem(migrateRecentStorageKey(setKey, mode));
    if (!raw) return new Set();
    const sessions = JSON.parse(raw);
    return new Set(sessions.flat());
  } catch {
    return new Set();
  }
}

function saveUsedIds(setKey, mode, ids) {
  try {
    const key = migrateRecentStorageKey(setKey, mode);
    const raw = localStorage.getItem(key);
    const sessions = raw ? JSON.parse(raw) : [];
    sessions.unshift([...ids]);
    // Keep only the last N sessions
    while (sessions.length > RECENT_SESSIONS_TO_TRACK) sessions.pop();
    localStorage.setItem(key, JSON.stringify(sessions));
  } catch { /* localStorage unavailable */ }
}

export class SessionState {
  constructor(observations, taxonomy, setDef, setKey, difficulty = null, mode = 'classic', rng = null) {
    this.observations = observations;
    this.taxonomy = taxonomy;
    this.setDef = setDef;
    this.setKey = setKey;
    this._difficulty = difficulty;
    this.mode = mode;
    this._rng = rng;
    this.sessionId = crypto.randomUUID?.() || Math.random().toString(36).slice(2);
    this.currentRound = 0;
    this.totalScore = 0;
    this.history = [];
    this._usedObservationIds = new Set();
    this._currentCorrect = null;
    this._recentCategories = [];
    this.questionsAnswered = 0;
    this.correctCount = 0;
    this.currentStreak = 0;
    this.streakBroken = false;

    const fullPool = setDef.observation_ids.map(i => observations[i]).filter(Boolean);
    const recentIds = getRecentlyUsedIds(setKey, mode);
    const freshPool = fullPool.filter(obs => !recentIds.has(obs.id));
    // Prioritize fresh observations, but backfill from recent if needed
    if (freshPool.length >= ROUNDS_PER_SESSION) {
      this._pool = freshPool;
    } else {
      // Put fresh first so they're picked before recent repeats
      const recentPool = fullPool.filter(obs => recentIds.has(obs.id));
      this._pool = [...freshPool, ...shuffleWith(recentPool, this._rng || defaultRng)];
    }
  }

  get isComplete() {
    if (this.mode === 'time_trial' || this.mode === 'streak') return false;
    return this.currentRound >= ROUNDS_PER_SESSION;
  }

  get bestStreak() {
    let best = 0;
    let current = 0;
    for (const entry of this.history) {
      if (entry.score === 100) {
        current++;
        best = Math.max(best, current);
      } else {
        current = 0;
      }
    }
    return best;
  }

  nextRound() {
    if (this.isComplete) return null;
    let available = this._pool.filter(obs => !this._usedObservationIds.has(obs.id));
    // For non-classic modes, recycle the pool when exhausted so game continues indefinitely
    if (available.length === 0 && this.mode !== 'classic') {
      this._usedObservationIds.clear();
      available = [...this._pool];
    }
    if (available.length === 0) return null;

    // Bugs 101: avoid repeating categories from the last 3 rounds
    if (this.setDef.scoring === 'binary' && this._recentCategories.length > 0) {
      const recentSet = new Set(this._recentCategories);
      const freshCategory = available.filter(obs => !recentSet.has(getBugs101Name(obs.taxon)));
      if (freshCategory.length > 0) {
        available = freshCategory;
      }
    }

    // Pick observation based on difficulty curve (classic only, when difficulty data exists)
    let correct;
    if (this.mode === 'classic' && this._difficulty) {
      correct = this._pickByDifficulty(available);
    } else {
      correct = pickRandomWith(available, this._rng || defaultRng);
    }

    this._usedObservationIds.add(correct.id);
    this._currentCorrect = correct;
    this.currentRound++;

    const scoring = this.setDef.scoring;
    let distractors;
    if (scoring === 'binary') {
      distractors = generateBugs101Distractors(correct, this.taxonomy, this.observations, this._rng || defaultRng);
    } else {
      if (this._difficulty && this.currentRound <= 3) {
        // Easy rounds: cross-order distractors for visual distinction
        distractors = generateBugs101Distractors(correct, this.taxonomy, this.observations, this._rng || defaultRng);
      } else {
        distractors = generateGenusDistractors(correct, this.taxonomy, this.observations, this._rng || defaultRng);
      }
    }

    const choices = shuffleWith([correct, ...distractors], this._rng || defaultRng);
    return { correct, choices };
  }

  _pickByDifficulty(available) {
    const round = this.currentRound + 1; // currentRound hasn't been incremented yet

    let targetTier;
    if (round <= 3) targetTier = 'easy';
    else if (round <= 7) targetTier = 'medium';
    else targetTier = 'hard';

    // Split available into target tier
    const tierPool = available.filter(obs => {
      const d = this._difficulty[obs.id];
      return d ? d.tier === targetTier : targetTier === 'medium'; // unknown = medium
    });

    if (tierPool.length > 0) {
      return pickRandomWith(tierPool, this._rng || defaultRng);
    }

    // Try adjacent tiers before falling back to fully random
    const fallbackOrder = targetTier === 'easy'
      ? ['medium', 'hard']
      : targetTier === 'hard'
        ? ['medium', 'easy']
        : ['easy', 'hard'];

    for (const tier of fallbackOrder) {
      const fallback = available.filter(obs => {
        const d = this._difficulty[obs.id];
        return d ? d.tier === tier : tier === 'medium';
      });
      if (fallback.length > 0) return pickRandomWith(fallback, this._rng || defaultRng);
    }

    return pickRandomWith(available, this._rng || defaultRng);
  }

  submitAnswer(pickedTaxon) {
    const correct = this._currentCorrect;
    // Track category for variety filtering (Bugs 101 only)
    if (this.setDef.scoring === 'binary') {
      this._recentCategories.push(getBugs101Name(correct.taxon));
      if (this._recentCategories.length > 3) {
        this._recentCategories.shift();
      }
    }
    const scoring = this.setDef.scoring;
    let score;
    if (scoring === 'binary') {
      score = getBugs101Name(pickedTaxon) === getBugs101Name(correct.taxon) ? 100 : 0;
    } else {
      score = calculateScore(pickedTaxon, correct.taxon);
    }
    this.totalScore += score;
    this.questionsAnswered++;
    if (score === 100) {
      this.correctCount++;
      this.currentStreak++;
    } else {
      if (this.mode === 'streak') {
        // Don't reset — currentStreak represents the final streak at time of break
        this.streakBroken = true;
      } else {
        this.currentStreak = 0;
      }
    }
    this.history.push({
      round: this.currentRound,
      observation_id: correct.id,
      correct_taxon: correct.taxon,
      correct_inat_url: correct.inat_url || '',
      picked_taxon: pickedTaxon,
      score,
    });
    // Save used IDs after last round (classic mode only) so next session avoids repeats
    if (this.mode === 'classic' && this.isComplete) {
      saveUsedIds(this.setKey, this.mode, this._usedObservationIds);
    }
    return { score, correct };
  }
}
