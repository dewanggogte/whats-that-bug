# Image Quality Pipeline — Design Spec

**Date**: 2026-04-08
**Branch**: `feat/image-quality-pipeline` (off `main`)

## Problem

The ~3000 observation dataset has no image quality checks beyond iNaturalist metadata filters. Player feedback consistently flags blurry, zoomed-out, or obscured photos. The current fetch pipeline only checks: research grade, CC-BY license, >=3 ID agreements, species rank, and common name. Photo quality itself is never evaluated.

## Solution: Two-Stage Quality Pipeline

### Stage 1: Pre-fetch gate (in `fetch-data.mjs`)

Add two metadata checks to `fetchObservations()` using data already in the iNaturalist API response (no extra downloads):

- **Resolution**: Reject observations where `original_dimensions` short side < 800px
- **Aspect ratio**: Reject observations where width/height ratio is outside 0.6–1.8

These use `obs.photos[].original_dimensions` which the API already returns. The existing `pickBestPhoto()` function reads these fields — rejection logic wraps around it. Rejected observations never enter `observations.json`.

Log rejected counts per taxon so species with few observations can be monitored.

### Stage 2: Post-fetch scoring (`scripts/score-images.mjs`)

Standalone script, run independently after a fetch:

1. Read `public/data/observations.json`
2. Download each observation's `medium.jpg` (~50–100KB) with 1.1s rate-limiting
3. Cache downloads in `.cache/images/` (keyed by observation ID) — re-runs skip existing
4. Run 4 Sharp-based quality checks per image
5. Compute overall quality score (0–1)
6. Write `public/data/quality-scores.json`

#### Quality checks

| Check | Method | Good signal | Bad signal |
|-------|--------|-------------|------------|
| Blur | Avg channel stdev via `sharp.stats()` | stdev > 50 (sharp) | stdev < 20 (blurry) |
| Brightness | Mean pixel value across channels | 40–220 (balanced) | <40 (dark) or >220 (blown out) |
| Entropy | Stdev-based information density | High (detail-rich) | Low (flat/featureless) |
| Subject prominence | Entropy of center 33% crop vs full image | Center >> edges (clear subject) | Even distribution (no focal point) |

#### Overall score formula

```
overall = (blur * 0.35) + (brightness * 0.20) + (entropy * 0.20) + (subject_prominence * 0.25)
```

Blur weighted highest (most common player complaint). Subject prominence second ("can't see the bug" is next most common).

#### Auto-flag threshold

Observations with `overall < 0.4` are automatically added to the review tool as candidates.

### Integration with review tool

`compile-review.py` gains a third data source:

1. `bad_photo` user reports from Google Sheets CSV (existing)
2. Statistical flags from `flag-images.py` miss-rate analysis (existing)
3. **New**: Quality scores below threshold from `quality-scores.json`

The review HTML tool (`review-flagged.html`) stays unchanged — it just receives more candidates with quality score metadata displayed as additional pills.

### Output files

| File | Contents |
|------|----------|
| `public/data/quality-scores.json` | Per-observation scores: `{ observation_id, blur, brightness, entropy, subject_prominence, overall }` |
| `.cache/images/{id}_medium.jpg` | Cached medium downloads (gitignored) |

## Commands

```bash
npm run fetch-data          # Fetches with pre-fetch gate (resolution + aspect ratio)
npm run score-images        # Downloads mediums, runs Sharp analysis, writes quality-scores.json
npm run compile-review      # Compiles flagged candidates (now includes quality scores)
npm run review-flagged      # Opens review UI
npm run rebuild-sets        # Regenerates sets.json with blocklist applied
```

## Risks & tradeoffs

- **False positives on subject prominence**: Artistic habitat shots or photos with uniform bokeh backgrounds may score low but still be good game images. Human review catches these.
- **iNaturalist rate limiting**: ~3000 downloads at 1.1s = ~55 minutes for a cold run. Respects API with User-Agent header and courtesy delays. Cached re-runs (Sharp analysis only) take ~2–3 minutes.
- **Sharp heuristics aren't vision models**: Entropy-based blur detection can be fooled by intentionally soft backgrounds. Weights are tunable after seeing real results.
- **Species coverage**: The 800px resolution gate may reject the only photos for rare species. Per-taxon rejection logging lets us monitor this.

## Out of scope

- Vision API evaluation (Claude, etc.) — deferred to future iteration
- Color/white-balance analysis — diminishing returns for complexity
- Full-resolution download for general pool — reserved for daily challenge only
- Automated re-fetching of replacements for rejected observations — manual for now
