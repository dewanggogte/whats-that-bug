import { describe, expect, it } from 'vitest';
import { coverageReport, expectedPairKeys, validateTellEntry, validateTraitEntry } from '../scripts/validate-traits.mjs';

describe('validateTraitEntry', () => {
  const good = {
    structure: '2 parts, 8 legs',
    wings: 'none',
    size: '4-18 mm',
    color: 'fuzzy',
    key_mark: 'big eyes',
  };

  it('passes a complete short entry', () => {
    expect(validateTraitEntry(good)).toEqual([]);
  });

  it('flags a missing field', () => {
    const { wings, ...rest } = good;

    expect(validateTraitEntry(rest)).toContain('missing wings');
  });

  it('flags an over-long field', () => {
    expect(validateTraitEntry({ ...good, color: 'x'.repeat(130) })).toContain('color too long (130)');
  });
});

describe('validateTellEntry', () => {
  it('passes a sorted pair key and short tell', () => {
    expect(validateTellEntry('Beetle|Jumping Spider', 'spiders have 8 legs')).toEqual([]);
  });

  it('flags unsorted pair keys', () => {
    expect(validateTellEntry('Jumping Spider|Beetle', 'spiders have 8 legs')).toContain('pair key not sorted');
  });

  it('flags empty tells', () => {
    expect(validateTellEntry('Beetle|Jumping Spider', '')).toContain('missing tell');
  });
});

describe('coverageReport', () => {
  it('lists required keys absent from data', () => {
    const report = coverageReport(['Phidippus', 'Beetle'], { Phidippus: {} });

    expect(report.missing).toEqual(['Beetle']);
    expect(report.present).toBe(1);
  });
});

describe('expectedPairKeys', () => {
  it('returns every unordered category pair', () => {
    expect(expectedPairKeys(['Spider', 'Beetle', 'Ant'])).toEqual([
      'Ant|Beetle',
      'Ant|Spider',
      'Beetle|Spider',
    ]);
  });
});
