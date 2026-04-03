/**
 * Game engine — pure logic, no DOM dependencies.
 * Handles scoring, distractor generation, and session state.
 */

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
 * Generate 3 distractors for Bugs 101 mode — from DIFFERENT orders.
 */
export function generateBugs101Distractors(correct, taxonomy, observations) {
  const correctOrder = correct.taxon.order;
  const distractors = [];
  const usedOrders = new Set([correctOrder]);

  const allOrders = Object.keys(taxonomy.order);
  const shuffledOrders = shuffle(allOrders);

  for (const order of shuffledOrders) {
    if (usedOrders.has(order)) continue;
    if (distractors.length >= 3) break;
    const candidates = taxonomy.order[order];
    if (!candidates || candidates.length === 0) continue;
    const pick = observations[candidates[Math.floor(Math.random() * candidates.length)]];
    if (pick) {
      distractors.push(pick);
      usedOrders.add(order);
    }
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
  constructor(observations, taxonomy, setDef, setKey) {
    this.observations = observations;
    this.taxonomy = taxonomy;
    this.setDef = setDef;
    this.setKey = setKey;
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
    const correct = pickRandom(available);
    this._usedObservationIds.add(correct.id);
    this._currentCorrect = correct;
    this.currentRound++;
    const isBugs101 = this.setDef.scoring === 'binary';
    const distractors = isBugs101
      ? generateBugs101Distractors(correct, this.taxonomy, this.observations)
      : generateDistractors(correct, this.taxonomy, this.observations);
    const choices = shuffle([correct, ...distractors]);
    return { correct, choices };
  }

  submitAnswer(pickedTaxon) {
    const correct = this._currentCorrect;
    const isBinary = this.setDef.scoring === 'binary';
    const score = isBinary
      ? (pickedTaxon.order === correct.taxon.order ? 100 : 0)
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
