import { describe, it, expect } from 'vitest';
import { generateShareText, scoreToEmoji } from '../src/scripts/share.js';

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
    expect(text).toContain('6/10 correct');
    expect(text).toContain('Streak: 4');
  });

  it('includes the set name', () => {
    const text = generateShareText(700, history, 'Beetles', 4);
    expect(text).toContain('Set: Beetles');
  });
});
