/**
 * Social sharing utilities — emoji grid, clipboard copy, tweet intent.
 */

export function scoreToEmoji(score) {
  if (score === 100) return '🟩';
  if (score >= 50) return '🟨';
  return '🟥';
}

export function getClassicFlavor(correctCount) {
  if (correctCount === 10) return 'Perfect score! 🏆';
  if (correctCount >= 8) return 'Bug expert! 🔬';
  if (correctCount >= 5) return 'Not bad! Can you beat me?';
  return 'Bugs are tricky! Give it a shot 👀';
}

export function generateShareText(totalScore, history, setName, bestStreak) {
  const emojiGrid = history.map(h => scoreToEmoji(h.score)).join('');
  const correctCount = history.filter(h => h.score === 100).length;
  const flavor = getClassicFlavor(correctCount);

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

export function getTimeTrialFlavor(correctCount, totalQuestions) {
  if (correctCount === totalQuestions && totalQuestions >= 8) return 'Lightning fast! ⚡';
  if (correctCount >= totalQuestions * 0.8) return 'Speed demon! 🔬';
  if (correctCount >= totalQuestions * 0.5) return 'Not bad for 60 seconds!';
  return 'Bugs are tricky under pressure! 👀';
}

export function generateTimeTrialShareText(totalScore, history, correctCount, totalQuestions, setKey) {
  const emojiGrid = history.map(h => scoreToEmoji(h.score)).join('');
  const label = setKey?.startsWith('bugs_101') ? 'Bugs 101 — Time Trial' : 'Time Trial';
  const flavor = getTimeTrialFlavor(correctCount, totalQuestions);

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

export function getStreakFlavor(streakCount) {
  if (streakCount >= 20) return 'Unstoppable! 🏆';
  if (streakCount >= 10) return 'Bug expert! 🔬';
  if (streakCount >= 5) return 'Solid run!';
  return 'Give it a shot! 👀';
}

export function generateStreakShareText(streakCount, history, setKey) {
  const emojiGrid = history.filter(h => h.score === 100).map(() => '🟩').join('');
  const label = setKey?.startsWith('bugs_101') ? 'Bugs 101 — Streaks' : 'Streaks';
  const flavor = getStreakFlavor(streakCount);

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

/**
 * Generate share text for a leaderboard entry.
 * rank: 1-10, setKey: e.g. 'bugs_101_time_trial', score: number, streak: number (for streak modes)
 */
export function generateLeaderboardShareText(rank, setKey, score, streak) {
  const isStreak = setKey.includes('streak');
  const isBugs101 = setKey.startsWith('bugs_101');

  const modeLabel = isStreak ? 'Streaks' : 'Time Trial';
  const modeIcon = isStreak ? '🎯' : '⏱️';
  const setLabel = isBugs101 ? `Bugs 101 ${modeLabel}` : `All Bugs ${modeLabel}`;
  const scoreText = isStreak ? `${streak} in a row` : `${score} pts`;

  // Medal emoji
  let medal;
  if (rank === 1) medal = '🥇';
  else if (rank === 2) medal = '🥈';
  else if (rank === 3) medal = '🥉';
  else medal = '🏆';

  // Record line
  let recordLine;
  if (rank === 1) recordLine = '⚡ WORLD RECORD ⚡';
  else if (rank <= 3) recordLine = '👑 NEW RECORD 👑';
  else recordLine = '🚨 NEW RECORD 🚨';

  // Heading
  let heading;
  if (rank === 1) heading = `⚡${medal}🪲 I'm the #1 Bug Identifier in the WORLD!`;
  else heading = `${medal}🪲 I'm ranked #${rank} in the WORLD on What's That Bug!`;

  // CTA
  const cta = rank === 1 ? 'Come dethrone me' : 'Think you can beat me?';

  const modeParam = isStreak ? 'streak' : 'time_trial';

  return [
    heading,
    '',
    `${modeIcon} ${setLabel} — ${scoreText}`,
    '',
    recordLine,
    '',
    cta,
    `https://dewanggogte.com/games/bugs/?ref=share&mode=${modeParam}`,
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
  const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener');
}

export function openIMessage(text) {
  window.location.href = `sms:&body=${encodeURIComponent(text)}`;
}

export function openTweetIntent(text) {
  const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener');
}

export function canNativeShare() {
  return typeof navigator !== 'undefined' && !!navigator.share;
}

export async function nativeShare(text) {
  if (!navigator.share) return false;
  try {
    await navigator.share({ text });
    return true;
  } catch {
    return false;
  }
}
