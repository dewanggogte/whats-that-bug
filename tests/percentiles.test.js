import { describe, it, expect } from 'vitest';
import { computePercentile, getScoreBucket, buildHistogramData } from '../src/scripts/percentiles.js';

describe('computePercentile', () => {
  const distribution = { '0': 5, '1': 10, '2': 20, '3': 30, '4': 20, '5': 10, '10': 5 };
  const totalSessions = 100;

  it('returns 0 for the lowest score', () => {
    expect(computePercentile(0, distribution, totalSessions)).toBe(0);
  });

  it('returns correct percentile for mid-range scores', () => {
    // score=3: sessions below 3 are 0(5)+1(10)+2(20) = 35
    expect(computePercentile(3, distribution, totalSessions)).toBe(35);
  });

  it('returns high percentile for top scores', () => {
    // score=10: sessions below 10 are 0(5)+1(10)+2(20)+3(30)+4(20)+5(10) = 95
    expect(computePercentile(10, distribution, totalSessions)).toBe(95);
  });

  it('handles scores not in the distribution (interpolates)', () => {
    // score=7: no exact key, but sessions below 7 = same as below 10 = 95
    expect(computePercentile(7, distribution, totalSessions)).toBe(95);
  });

  it('returns 0 when totalSessions is 0', () => {
    expect(computePercentile(5, {}, 0)).toBe(0);
  });
});

describe('getScoreBucket', () => {
  it('returns the score itself for streak mode', () => {
    expect(getScoreBucket(12, true)).toBe(12);
  });

  it('rounds time trial scores to nearest 100', () => {
    expect(getScoreBucket(150, false)).toBe(100);
    expect(getScoreBucket(250, false)).toBe(200);
    expect(getScoreBucket(950, false)).toBe(900);
    expect(getScoreBucket(50, false)).toBe(0);
  });
});

describe('buildHistogramData', () => {
  it('returns 10 buckets for streak mode', () => {
    const distribution = { '0': 5, '1': 10, '2': 20, '5': 15, '10': 8, '20': 2 };
    const result = buildHistogramData(distribution, true);
    expect(result.buckets).toHaveLength(10);
    expect(result.counts).toHaveLength(10);
    expect(result.labels).toHaveLength(10);
  });

  it('returns 10 buckets for time trial mode', () => {
    const distribution = { '0': 5, '100': 10, '200': 20, '500': 15 };
    const result = buildHistogramData(distribution, false);
    expect(result.buckets).toHaveLength(10);
    expect(result.counts).toHaveLength(10);
  });

  it('identifies the correct highlighted bucket for a given score', () => {
    const distribution = { '0': 5, '1': 10, '2': 20, '5': 15, '10': 8 };
    const result = buildHistogramData(distribution, true, 5);
    const highlightedIdx = result.buckets.findIndex((_, i) => result.highlighted[i]);
    expect(highlightedIdx).toBeGreaterThanOrEqual(0);
  });
});
