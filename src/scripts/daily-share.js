/**
 * Daily challenge share text generation — emoji grid, flavor text, clipboard-ready output.
 */

export function getDailyFlavor(guessCount, solved) {
  if (!solved) return 'Better luck tomorrow!';
  if (guessCount === 1) return 'Incredible! First try! 🏆';
  if (guessCount === 2) return 'Impressive eye! 🔬';
  if (guessCount <= 4) return 'Well spotted!';
  return 'Just in time!';
}

export function generateDailyShareText({ mode, challengeNumber, solved, guesses, maxGuesses }) {
  const modeLabel = mode === 'bugs101' ? 'Bugs 101' : 'All Bugs';
  const guessCount = guesses.length;
  const scoreLabel = solved ? `${guessCount}/${maxGuesses}` : `X/${maxGuesses}`;
  const grid = guesses.map(correct => correct ? '🟩' : '🟥').join('');
  const remaining = solved ? '⬜'.repeat(maxGuesses - guessCount) : '';
  const flavor = getDailyFlavor(guessCount, solved);

  return [
    `🪲 What's That Bug`,
    modeLabel,
    `Daily #${challengeNumber} — ${scoreLabel}`,
    grid + remaining,
    '',
    flavor,
    '',
    'https://dewanggogte.com/games/bugs/daily?ref=share',
  ].join('\n');
}
