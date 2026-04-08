/**
 * Game engine — pure logic, no DOM dependencies.
 * Handles scoring, distractor generation, and session state.
 */

// --- Bugs 101 category mapping ---
const BEE_FAMILIES = ['Apidae', 'Megachilidae', 'Halictidae', 'Andrenidae', 'Colletidae'];
const ANT_FAMILIES = ['Formicidae', 'Mutillidae'];
const BUTTERFLY_FAMILIES = ['Nymphalidae', 'Papilionidae', 'Pieridae', 'Lycaenidae', 'Riodinidae', 'Hesperiidae'];
const CRICKET_FAMILIES = ['Gryllidae', 'Rhaphidophoridae', 'Anostostomatidae', 'Tettigoniidae'];
const DAMSELFLY_FAMILIES = ['Coenagrionidae', 'Calopterygidae', 'Lestidae', 'Platycnemididae', 'Platystictidae'];
const CICADA_FAMILIES = ['Cicadidae'];
const STINK_BUG_FAMILIES = ['Pentatomidae', 'Scutelleridae', 'Acanthosomatidae', 'Cydnidae', 'Tessaratomidae'];
const PLANTHOPPER_FAMILIES = ['Fulgoridae', 'Flatidae', 'Membracidae', 'Ischnorhinidae'];
const APHID_FAMILIES = ['Aphididae', 'Eriococcidae'];
const WATER_BUG_FAMILIES = ['Nepidae', 'Notonectidae', 'Belostomatidae'];

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
    if (taxon.family === 'Coccinellidae') return 'Ladybug';
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
    if (taxon.family === 'Syrphidae') return 'Hover Fly';
    if (taxon.family === 'Tipulidae' || taxon.family === 'Limoniidae') return 'Crane Fly';
    return 'Fly';
  }
  const names = {
    'Ixodida': 'Tick', 'Scorpiones': 'Scorpion', 'Opiliones': 'Harvestman',
    'Mantodea': 'Mantis', 'Phasmida': 'Stick Insect', 'Neuroptera': 'Lacewing',
    'Blattodea': 'Cockroach', 'Dermaptera': 'Earwig', 'Ephemeroptera': 'Mayfly',
    'Trichoptera': 'Caddisfly', 'Scolopendromorpha': 'Centipede',
    'Isopoda': 'Woodlouse', 'Julida': 'Millipede',
  };
  return names[taxon.order] || taxon.order_common || taxon.order;
}

/**
 * Calculate score based on taxonomic distance between picked and correct taxon.
 * @param {{ species: string, genus: string, family: string, order: string }} picked
 * @param {{ species: string, genus: string, family: string, order: string }} correct
 * @returns {number} 0 | 25 | 50 | 75 | 100
 */
export function calculateScore(picked, correct) {
  if (picked.species === correct.species) return 100;
  if (picked.genus === correct.genus) return 75;
  if (picked.family === correct.family) return 50;
  if (picked.order === correct.order) return 25;
  return 0;
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

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickRandomN(arr, n) {
  return shuffle(arr).slice(0, n);
}

/**
 * Generate 3 distractors for Bugs 101 mode — each with a DIFFERENT category name.
 */
export function generateBugs101Distractors(correct, taxonomy, observations) {
  const correctCategory = getBugs101Name(correct.taxon);
  const distractors = [];
  const usedCategories = new Set([correctCategory]);

  // Build a pool of all observations, shuffled
  const allIndices = Object.values(taxonomy.order).flat();
  const shuffled = shuffle(allIndices);

  for (const idx of shuffled) {
    if (distractors.length >= 3) break;
    const pick = observations[idx];
    if (!pick) continue;
    const category = getBugs101Name(pick.taxon);
    if (usedCategories.has(category)) continue;
    distractors.push(pick);
    usedCategories.add(category);
  }
  return distractors;
}

export function generateDistractors(correct, taxonomy, observations) {
  const correctSpecies = correct.taxon.species;
  const distractors = [];
  const usedSpecies = new Set([correctSpecies]);

  function pickFromTier(tierName, tierKey) {
    const candidates = (taxonomy[tierName]?.[tierKey] || [])
      .map(i => observations[i])
      .filter(obs => !usedSpecies.has(obs.taxon.species));
    if (candidates.length === 0) return false;
    const pick = pickRandom(candidates);
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
    const pick = pickRandom(familyCandidates);
    distractors.push(pick);
    usedSpecies.add(pick.taxon.species);
  }

  // Tier 3: same order, different family — fill remaining slots
  const needed = 3 - distractors.length;
  if (needed > 0) {
    const orderCandidates = (taxonomy.order?.[correct.taxon.order] || [])
      .map(i => observations[i])
      .filter(obs => !usedSpecies.has(obs.taxon.species));
    const picks = pickRandomN(orderCandidates, needed);
    for (const pick of picks) {
      distractors.push(pick);
      usedSpecies.add(pick.taxon.species);
    }
  }

  return distractors;
}

const ROUNDS_PER_SESSION = 10;
const RECENT_SESSIONS_TO_TRACK = 3;

function getRecentlyUsedIds(setKey) {
  try {
    const raw = localStorage.getItem(`recent_${setKey}`);
    if (!raw) return new Set();
    const sessions = JSON.parse(raw);
    return new Set(sessions.flat());
  } catch {
    return new Set();
  }
}

function saveUsedIds(setKey, ids) {
  try {
    const raw = localStorage.getItem(`recent_${setKey}`);
    const sessions = raw ? JSON.parse(raw) : [];
    sessions.unshift([...ids]);
    // Keep only the last N sessions
    while (sessions.length > RECENT_SESSIONS_TO_TRACK) sessions.pop();
    localStorage.setItem(`recent_${setKey}`, JSON.stringify(sessions));
  } catch { /* localStorage unavailable */ }
}

export class SessionState {
  constructor(observations, taxonomy, setDef, setKey, difficulty = null) {
    this.observations = observations;
    this.taxonomy = taxonomy;
    this.setDef = setDef;
    this.setKey = setKey;
    this._difficulty = difficulty;
    this.mode = setDef.mode || 'classic';
    this.sessionId = crypto.randomUUID?.() || Math.random().toString(36).slice(2);
    this.currentRound = 0;
    this.totalScore = 0;
    this.history = [];
    this._usedObservationIds = new Set();
    this._currentCorrect = null;
    this.questionsAnswered = 0;
    this.correctCount = 0;
    this.currentStreak = 0;
    this.streakBroken = false;

    const fullPool = setDef.observation_ids.map(i => observations[i]).filter(Boolean);
    const recentIds = getRecentlyUsedIds(setKey);
    const freshPool = fullPool.filter(obs => !recentIds.has(obs.id));
    // Prioritize fresh observations, but backfill from recent if needed
    if (freshPool.length >= ROUNDS_PER_SESSION) {
      this._pool = freshPool;
    } else {
      // Put fresh first so they're picked before recent repeats
      const recentPool = fullPool.filter(obs => recentIds.has(obs.id));
      this._pool = [...freshPool, ...shuffle(recentPool)];
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

    // Pick observation based on difficulty curve (classic only, when difficulty data exists)
    let correct;
    if (this.mode === 'classic' && this._difficulty) {
      correct = this._pickByDifficulty(available);
    } else {
      correct = pickRandom(available);
    }

    this._usedObservationIds.add(correct.id);
    this._currentCorrect = correct;
    this.currentRound++;

    const isBugs101 = this.setDef.scoring === 'binary';
    let distractors;
    if (isBugs101) {
      distractors = generateBugs101Distractors(correct, this.taxonomy, this.observations);
    } else if (this._difficulty && this.currentRound <= 3) {
      // Easy rounds in All Bugs: use cross-order distractors for visual distinction
      distractors = generateBugs101Distractors(correct, this.taxonomy, this.observations);
    } else {
      distractors = generateDistractors(correct, this.taxonomy, this.observations);
    }

    const choices = shuffle([correct, ...distractors]);
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
      return pickRandom(tierPool);
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
      if (fallback.length > 0) return pickRandom(fallback);
    }

    return pickRandom(available);
  }

  submitAnswer(pickedTaxon) {
    const correct = this._currentCorrect;
    const isBinary = this.setDef.scoring === 'binary';
    const score = isBinary
      ? (getBugs101Name(pickedTaxon) === getBugs101Name(correct.taxon) ? 100 : 0)
      : calculateScore(pickedTaxon, correct.taxon);
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
      picked_taxon: pickedTaxon,
      score,
    });
    // Save used IDs after last round (classic mode only) so next session avoids repeats
    if (this.mode === 'classic' && this.isComplete) {
      saveUsedIds(this.setKey, this._usedObservationIds);
    }
    return { score, correct };
  }
}
