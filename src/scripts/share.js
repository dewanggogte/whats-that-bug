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
    'https://dewanggogte.com/games/bugs/?ref=share',
  ].join('\n');
}

export function generateTimeTrialShareText(totalScore, history, correctCount, totalQuestions, setKey) {
  const emojiGrid = history.map(h => scoreToEmoji(h.score)).join('');
  const label = setKey?.startsWith('bugs_101') ? 'Bugs 101 — Time Trial' : 'Time Trial';

  let flavor;
  if (correctCount === totalQuestions && totalQuestions >= 8) flavor = 'Lightning fast! ⚡';
  else if (correctCount >= totalQuestions * 0.8) flavor = 'Speed demon! 🔬';
  else if (correctCount >= totalQuestions * 0.5) flavor = 'Not bad for 60 seconds!';
  else flavor = 'Bugs are tricky under pressure! 👀';

  return [
    `🪲 What's That Bug? — ${label}`,
    '',
    `${totalScore} pts | ${correctCount}/${totalQuestions} correct | 60s`,
    '',
    emojiGrid,
    '',
    flavor,
    '',
    `https://dewanggogte.com/games/bugs/?ref=share&mode=time_trial`,
  ].join('\n');
}

export function generateStreakShareText(streakCount, history, setKey) {
  const emojiGrid = history.filter(h => h.score === 100).map(() => '🟩').join('');
  const label = setKey?.startsWith('bugs_101') ? 'Bugs 101 — Streaks' : 'Streaks';

  let flavor;
  if (streakCount >= 20) flavor = 'Unstoppable! 🏆';
  else if (streakCount >= 10) flavor = 'Bug expert! 🔬';
  else if (streakCount >= 5) flavor = 'Solid run!';
  else flavor = 'Give it a shot! 👀';

  return [
    `🪲 What's That Bug? — ${label}`,
    '',
    `${streakCount} in a row`,
    '',
    emojiGrid,
    '',
    flavor,
    '',
    `https://dewanggogte.com/games/bugs/?ref=share&mode=streak`,
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

export function openWhatsApp(text) {
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener');
}

export function openIMessage(text) {
  window.location.href = `sms:&body=${encodeURIComponent(text)}`;
}

export function openTweetIntent(text) {
  const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener');
}
