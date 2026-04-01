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

  return [
    `🪲 What's That Bug? — ${totalScore}/1000`,
    '',
    emojiGrid,
    '',
    `${correctCount}/10 correct · Streak: ${bestStreak} · Set: ${setName}`,
    'Play at whatsthatbug.app',
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
