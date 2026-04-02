/**
 * Social sharing utilities — emoji grid, clipboard copy, tweet intent.
 */

export function scoreToEmoji(score) {
  if (score === 100) return '🟩';
  if (score >= 50) return '🟨';
  return '🟥';
}

export function generateShareText(totalScore, history, setName, bestStreak) {
  const emojiGrid = history.map(h => scoreToEmoji(h.score)).join('');
  const correctCount = history.filter(h => h.score === 100).length;

  // Pick a flavor line based on performance
  let flavor;
  if (correctCount === 10) flavor = 'Perfect score! 🏆';
  else if (correctCount >= 8) flavor = 'Bug expert! 🔬';
  else if (correctCount >= 5) flavor = 'Not bad! Can you beat me?';
  else flavor = "Bugs are tricky! Give it a shot 👀";

  return [
    `🪲 What's That Bug? — ${totalScore}/1000`,
    '',
    emojiGrid,
    '',
    `${correctCount}/10 · Streak: ${bestStreak} · ${setName}`,
    flavor,
    '',
    'https://whats-that-bug.vercel.app',
  ].join('\n');
}

export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function openTweetIntent(text) {
  const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener');
}
