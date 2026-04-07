# Image Processing Pipeline

## Overview

The image processing pipeline identifies bad or misleading observations in the general pool (~2,600 observations) that cause unfair misses, and provides a review workflow to approve, reject, or flag them. The daily challenge pipeline already has robust vetting (resolution checks, entropy-based cropping, manual review), but the general pool had none until this work.

---

## Components

### 1. Data-Driven Flagging Script

**File:** `scripts/flag-images.py`

A CLI tool that analyzes `round_complete` event data to score observation quality.

**Usage:**
```bash
python3 scripts/flag-images.py <path-to-csv>
```

**Input:** CSV with `round_complete` rows. Supports flat columns (`observation_id`, `score`, `time_taken_ms`, `user_answer`, `correct_answer`) or a nested `data_json` column containing those fields.

**Scoring formula:**
```
quality_score = (miss_rate × 0.4) + (confusion_density × 0.3) + (time_anomaly × 0.2) + (bad_reports × 0.1)
```

| Signal | Weight | How it's computed |
|--------|--------|-------------------|
| Miss rate | 0.4 | `wrong_count / total_attempts` per observation |
| Confusion density | 0.3 | Binary — 1.0 if the species appears in the top 50 confusion pairs, 0.0 otherwise |
| Time anomaly | 0.2 | Linear scale from 0.0 (at global median time) to 1.0 (at 2x median), capped |
| Bad reports | 0.1 | Placeholder — hardcoded to 0.0, not yet wired to `bad_photo` events |

**Thresholds:**
- Minimum 3 attempts before scoring (`MIN_ATTEMPTS = 3`)
- Flagged for review if `quality_score > 0.6` (`FLAG_THRESHOLD`)

**Output:**
- Terminal report: summary stats, ranked table of worst observations, top 20 confusion pairs
- `scripts/flagged-observations.json`: top 100 observations as JSON (consumed by the review server)

---

### 2. General Pool Review Server

**Files:**
- `scripts/review-server.mjs` — API endpoints (added to the existing daily challenge review server)
- `scripts/review-general.html` — Review UI
- `public/data/reviewed-observations.json` — Persisted review state

**Start the server:**
```bash
node scripts/review-server.mjs [port]
```
Default port is 3333. The general pool review UI is at `http://localhost:3333/general`.

#### API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/general/batch?size=20` | Returns a batch of unreviewed observations, flagged-first sorted by quality_score descending |
| POST | `/api/general/review` | Records a review decision for an observation |
| GET | `/api/general/stats` | Returns aggregate counts (reviewed, approved, rejected, flagged, remaining) |

**POST `/api/general/review` body:**
```json
{
  "observation_id": 12345,
  "status": "approved | rejected | flagged",
  "reason": "blurry | wrong_species | cant_see_bug | misleading | other"
}
```
Reason is required for `rejected` and `flagged` statuses.

#### Review UI Features

- 4-column responsive card grid (3 on tablet, 2 on mobile)
- Each card shows: photo, species name, location, flag data (miss rate, quality score, sample size)
- Actions: Approve (instant), Reject/Flag (shows reason selector first)
- Keyboard shortcuts: `1` approve, `2` reject, `3` flag, `Tab`/`Shift+Tab` navigate
- Sticky header with live stats and progress bar
- Reviewed cards fade to 40% opacity with a status badge, then clear on next batch load

#### Review State (`reviewed-observations.json`)

```json
{
  "version": 1,
  "last_updated": "2026-04-07T00:00:00Z",
  "observations": {
    "12345": {
      "status": "approved",
      "reviewed_at": "2026-04-07T12:00:00Z"
    },
    "67890": {
      "status": "rejected",
      "reason": "blurry",
      "reviewed_at": "2026-04-07T12:01:00Z"
    }
  }
}
```

Currently empty — no reviews have been performed yet.

---

## End-to-End Workflow

1. Export `round_complete` events from Google Sheets as CSV
2. Run `python3 scripts/flag-images.py <csv>` to generate `scripts/flagged-observations.json`
3. Start the review server: `node scripts/review-server.mjs`
4. Open `http://localhost:3333/general` and review observations (flagged ones surface first)
5. Decisions persist to `public/data/reviewed-observations.json`

---

## What's Not Implemented

| PRD Section | Description | Status |
|-------------|-------------|--------|
| 1A (partial) | `bad_photo` event cross-referencing in the flagging script | Placeholder — `bad_reports` weight is hardcoded to 0.0 |
| 1B | Automated image quality checks in `fetch-data.mjs` (resolution minimum 800px, aspect ratio filtering, photo count preference) | Not started |
| 1D | Community flagging enhancements (reason selector on the in-game report button, auto-flag after 3+ reports, surface in review server) | Not started |
| — | Actually running the pipeline against real data and performing reviews | Not started |
