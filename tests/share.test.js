import { describe, it, expect } from 'vitest';
import { generateShareText, generateTimeTrialShareText, generateStreakShareText, scoreToEmoji } from '../src/scripts/share.js';

describe('scoreToEmoji', () => {
  it('maps 100 to green square', () => {
    expect(scoreToEmoji(100)).toBe('🟩');
  });

  it('maps 75 to yellow square', () => {
    expect(scoreToEmoji(75)).toBe('🟨');
  });

  it('maps 50 to yellow square', () => {
    expect(scoreToEmoji(50)).toBe('🟨');
  });

  it('maps 25 to red square', () => {
    expect(scoreToEmoji(25)).toBe('🟥');
  });

  it('maps 0 to red square', () => {
    expect(scoreToEmoji(0)).toBe('🟥');
  });
});

describe('generateShareText', () => {
  const history = [
    { score: 100 }, { score: 100 }, { score: 75 },
    { score: 100 }, { score: 0 },   { score: 100 },
    { score: 50 },  { score: 100 }, { score: 100 },
    { score: 75 },
  ];

  it('includes the game name and score', () => {
    const text = generateShareText(700, history, 'Beetles', 4);
    expect(text).toContain('What\'s That Bug?');
    expect(text).toContain('700/1000');
  });

  it('generates correct emoji grid', () => {
    const text = generateShareText(700, history, 'Beetles', 4);
    expect(text).toContain('🟩🟩🟨🟩🟥🟩🟨🟩🟩🟨');
  });

  it('includes correct count and streak', () => {
    const text = generateShareText(700, history, 'Beetles', 4);
    expect(text).toContain('6/10');
    expect(text).toContain('Streak: 4');
  });

  it('includes the set name', () => {
    const text = generateShareText(700, history, 'Beetles', 4);
    expect(text).toContain('Beetles');
  });

  it('includes a flavor line based on performance', () => {
    const text = generateShareText(700, history, 'Beetles', 4);
    expect(text).toContain('Not bad');
  });

  it('shows expert flavor for 8+ correct', () => {
    const goodHistory = Array(8).fill({ score: 100 }).concat([{ score: 0 }, { score: 0 }]);
    const text = generateShareText(800, goodHistory, 'Beetles', 8);
    expect(text).toContain('Bug expert');
  });
});

describe('generateTimeTrialShareText', () => {
  const history = [
    { score: 100 }, { score: 75 }, { score: 100 },
    { score: 0 }, { score: 100 }, { score: 50 },
    { score: 100 }, { score: 100 }, { score: 100 },
  ];

  it('includes Time Trial label', () => {
    const text = generateTimeTrialShareText(425, history, 7, 9);
    expect(text).toContain('Time Trial');
  });

  it('includes score and accuracy', () => {
    const text = generateTimeTrialShareText(425, history, 7, 9);
    expect(text).toContain('425 pts');
    expect(text).toContain('7/9 correct');
    expect(text).toContain('60s');
  });

  it('includes emoji grid', () => {
    const text = generateTimeTrialShareText(425, history, 7, 9);
    expect(text).toContain('🟩');
  });

  it('includes mode-specific share URL', () => {
    const text = generateTimeTrialShareText(425, history, 7, 9);
    expect(text).toContain('mode=time_trial');
  });

  it('picks flavor line based on accuracy', () => {
    const perfectHistory = Array(10).fill({ score: 100 });
    const text = generateTimeTrialShareText(1000, perfectHistory, 10, 10);
    expect(text).toContain('Lightning fast');
  });
});

describe('generateStreakShareText', () => {
  it('includes streak count', () => {
    const history = Array(14).fill({ score: 100 });
    const text = generateStreakShareText(14, history);
    expect(text).toContain('14');
    expect(text).toContain('in a row');
  });

  it('includes all-green emoji grid with no trailing red', () => {
    const history = Array(5).fill({ score: 100 });
    const text = generateStreakShareText(5, history);
    expect(text).toContain('🟩🟩🟩🟩🟩');
    expect(text).not.toContain('🟥');
  });

  it('includes mode-specific share URL', () => {
    const history = Array(3).fill({ score: 100 });
    const text = generateStreakShareText(3, history);
    expect(text).toContain('mode=streak');
  });

  it('picks flavor line based on streak length', () => {
    const longHistory = Array(20).fill({ score: 100 });
    const text = generateStreakShareText(20, longHistory);
    expect(text).toContain('Unstoppable');
  });
});
