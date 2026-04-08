/**
 * Streak milestone definitions and logic.
 * Pure functions — no DOM dependencies.
 */

export const MILESTONES = [
  { streak: 5,  label: 'Getting Good',  fires: 1, tier: 'toast' },
  { streak: 10, label: 'Sharp Eye',     fires: 2, tier: 'toast-pulse' },
  { streak: 15, label: 'Expert',        fires: 3, tier: 'toast-pulse' },
  { streak: 25, label: 'Legendary!',    fires: 4, tier: 'banner' },
  { streak: 50, label: 'Unstoppable!',  fires: 5, tier: 'banner' },
];

export function checkMilestone(streak) {
  return MILESTONES.find(m => m.streak === streak) || null;
}

export function getHighestMilestone(streak) {
  let highest = null;
  for (const m of MILESTONES) {
    if (streak >= m.streak) highest = m;
  }
  return highest;
}

export function milestoneFireEmoji(fires) {
  return '🔥'.repeat(fires);
}
