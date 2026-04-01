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

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickRandomN(arr, n) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
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
