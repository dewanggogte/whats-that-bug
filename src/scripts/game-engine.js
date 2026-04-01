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
