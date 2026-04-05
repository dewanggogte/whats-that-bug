import { describe, it, expect } from 'vitest';
import { generateDailyShareText, getDailyFlavor } from '../src/scripts/daily-share.js';

describe('generateDailyShareText', () => {
  it('generates Bugs 101 share text with correct format', () => {
    const text = generateDailyShareText({
      mode: 'bugs101', challengeNumber: 42, solved: true,
      guesses: [false, true], maxGuesses: 3,
    });
    expect(text).toContain("🪲 What's That Bug");
    expect(text).toContain('Bugs 101');
    expect(text).toContain('Daily #42 — 2/3');
    expect(text).toContain('🟥🟩⬜');
  });

  it('generates All Bugs share text', () => {
    const text = generateDailyShareText({
      mode: 'allbugs', challengeNumber: 42, solved: true,
      guesses: [false, false, false, false, true], maxGuesses: 6,
    });
    expect(text).toContain('All Bugs');
    expect(text).toContain('Daily #42 — 5/6');
    expect(text).toContain('🟥🟥🟥🟥🟩⬜');
  });

  it('shows X for failed attempt', () => {
    const text = generateDailyShareText({
      mode: 'bugs101', challengeNumber: 42, solved: false,
      guesses: [false, false, false], maxGuesses: 3,
    });
    expect(text).toContain('Daily #42 — X/3');
    expect(text).toContain('🟥🟥🟥');
    expect(text).not.toContain('⬜');
  });

  it('shows solved in 1 guess', () => {
    const text = generateDailyShareText({
      mode: 'allbugs', challengeNumber: 1, solved: true,
      guesses: [true], maxGuesses: 6,
    });
    expect(text).toContain('Daily #1 — 1/6');
    expect(text).toContain('🟩⬜⬜⬜⬜⬜');
  });

  it('includes share URL', () => {
    const text = generateDailyShareText({
      mode: 'bugs101', challengeNumber: 42, solved: true,
      guesses: [true], maxGuesses: 3,
    });
    expect(text).toContain('ref=share');
  });
});

describe('getDailyFlavor', () => {
  it('returns first-guess flavor', () => {
    expect(getDailyFlavor(1, true).length).toBeGreaterThan(0);
  });
  it('returns failure flavor', () => {
    expect(getDailyFlavor(6, false).length).toBeGreaterThan(0);
  });
});
