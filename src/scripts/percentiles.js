/**
 * Percentile computation and histogram rendering.
 * Pure functions for logic; one DOM function for rendering the card.
 */

let percentileData = null;
let loadPromise = null;

/**
 * Load percentiles.json (cached — only fetches once).
 */
export function loadPercentiles() {
  if (percentileData) return Promise.resolve(percentileData);
  if (loadPromise) return loadPromise;

  const basePath = window?.__BASE || '';
  loadPromise = fetch(`${basePath}/data/percentiles.json`)
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then(data => {
      percentileData = data;
      return data;
    })
    .catch(() => {
      loadPromise = null;
      return null;
    });

  return loadPromise;
}

/**
 * Compute what percentile a score falls at.
 * Returns 0-99 (percentage of sessions that scored LESS than this score).
 */
export function computePercentile(score, distribution, totalSessions) {
  if (!totalSessions || totalSessions === 0) return 0;

  let below = 0;
  for (const [key, count] of Object.entries(distribution)) {
    if (Number(key) < score) below += count;
  }
  return Math.round((below / totalSessions) * 100);
}

/**
 * Map a raw score to its bucket key.
 * Streak: exact integer. Time trial: rounded to nearest 100.
 */
export function getScoreBucket(score, isStreak) {
  if (isStreak) return score;
  return Math.floor(score / 100) * 100;
}

/**
 * Build histogram data: 10 visual buckets from a distribution.
 */
export function buildHistogramData(distribution, isStreak, playerScore = null) {
  let boundaries;
  if (isStreak) {
    boundaries = [0, 2, 4, 6, 8, 10, 13, 16, 20, 25];
  } else {
    boundaries = [0, 100, 200, 300, 400, 500, 600, 700, 800, 900];
  }

  const labels = isStreak
    ? ['0-1', '2-3', '4-5', '6-7', '8-9', '10-12', '13-15', '16-19', '20-24', '25+']
    : ['0', '100', '200', '300', '400', '500', '600', '700', '800', '900+'];

  const counts = new Array(10).fill(0);
  const highlighted = new Array(10).fill(false);

  for (const [key, count] of Object.entries(distribution)) {
    const val = Number(key);
    let bucketIdx = boundaries.length - 1;
    for (let i = boundaries.length - 1; i >= 0; i--) {
      if (val >= boundaries[i]) {
        bucketIdx = i;
        break;
      }
    }
    counts[bucketIdx] += count;
  }

  if (playerScore !== null) {
    let playerBucketIdx = boundaries.length - 1;
    for (let i = boundaries.length - 1; i >= 0; i--) {
      if (playerScore >= boundaries[i]) {
        playerBucketIdx = i;
        break;
      }
    }
    highlighted[playerBucketIdx] = true;
  }

  return { buckets: boundaries, counts, labels, highlighted };
}

/**
 * Render the percentile card HTML for the game-over screen.
 * Returns an HTML string, or empty string if data unavailable.
 */
export function renderPercentileCard(score, setKey, isStreak) {
  if (!percentileData) return '';

  const setData = percentileData[setKey];
  if (!setData || !setData.distribution || !setData.totalSessions) return '';

  const percentile = computePercentile(score, setData.distribution, setData.totalSessions);
  const topPercent = 100 - percentile;
  const histogram = buildHistogramData(setData.distribution, isStreak, score);

  const maxCount = Math.max(...histogram.counts, 1);
  const bars = histogram.counts.map((count, i) => {
    const heightPct = Math.max((count / maxCount) * 100, 2);
    const color = histogram.highlighted[i] ? 'var(--accent)' : 'var(--border)';
    return `<div style="flex:1;background:${color};height:${heightPct}%;border-radius:2px;"></div>`;
  }).join('');

  const labelHTML = histogram.labels
    .filter((_, i) => i === 0 || i === 4 || i === 9)
    .map(l => `<span>${l}</span>`).join('');

  const modeLabel = isStreak ? 'streak' : 'time trial';

  return `
    <div class="percentile-card" style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:16px;margin-top:16px;text-align:center;">
      <div style="font-size:var(--text-2xl);font-weight:700;color:var(--accent);">Top ${topPercent}%</div>
      <div style="font-size:var(--text-sm);color:var(--text-secondary);margin-top:4px;">Better than ${percentile}% of all ${modeLabel} sessions</div>
      <div style="margin-top:12px;display:flex;gap:2px;height:40px;align-items:flex-end;">${bars}</div>
      <div style="display:flex;justify-content:space-between;font-size:0.65rem;color:var(--text-secondary);margin-top:2px;">${labelHTML}</div>
      <div style="font-size:0.7rem;color:var(--text-secondary);margin-top:6px;">Based on ${setData.totalSessions.toLocaleString()} sessions</div>
    </div>
  `;
}
