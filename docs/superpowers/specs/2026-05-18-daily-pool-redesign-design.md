# Daily Challenge — Reusable Pool Redesign

**Date**: 2026-05-18
**Status**: Approved

## Overview

The daily challenge has had no content since 2026-04-29 (last manifest entry) — players have seen "No challenge today" for ~19 days. The current pipeline (`generate-daily.mjs`) is a one-shot, per-day, manual generate-and-review process that runs dry whenever it isn't manually re-run.

This redesign replaces the date-keyed, single-use manifest with a **reusable approved-image pool** plus a **deterministic client-side selector**, so that:

- An image is manually cropped and approved **once**, then reused for the daily challenge as many times as needed.
- There is **structurally never a day without a valid daily challenge** (no cron, no job that can silently break).
- The **All Bugs daily is discontinued**; only the Bugs 101 daily remains. Existing approved All Bugs images are repurposed as Bugs 101 challenges.

### Goals

- Eliminate the recurring "no challenge today" outage by design.
- Decouple manual cropping effort from daily content supply (crop once, serve forever).
- Reduce the daily challenge to a single mode (Bugs 101) with minimal dead code left behind.
- Seed the pool from existing approved content with near-zero new manual work.

### Non-goals

- No server-side state, database, cron, or CI job (the site stays a static Astro build on Vercel).
- No change to streak logic, event logging, or the leaderboard.
- No change to the core game modes (Classic / Time Trial etc.) — only the daily challenge.

## Current State (verified 2026-05-18)

- `public/data/daily/manifest.json` contains **23 Bugs 101 + 23 All Bugs** challenge entries (2026-04-05 → 2026-04-29, with gaps). All are `approved: true` and went live.
- Every entry stores a human-relevant crop center (`center_x`, `center_y`), `attribution`, `inat_url`, and a partial `wikipedia_summary`.
- All 23 All Bugs `observation_id`s join cleanly to taxon in `public/data/daily/candidates.json`. **22 of 23** map to a valid Bugs 101 name via the existing `getBugs101Name()`; 1 (order Mecoptera, "Gold rush hanging scorpionfly") has no valid Bugs 101 name and is dropped.
- `candidates.json` holds 390 curated observations; ~360 are unused (per `used-observations.json`) — ample supply for future batch cropping.
- Wikipedia summaries: 16/23 Bugs 101 and 21/23 All Bugs entries have one.
- Client: a single gameplay page `src/pages/daily/play.astro` reads `?mode=bugs101|allbugs`. The homepage `src/pages/index.astro` hosts the daily entry card(s). There is no separate `/daily` hub page.
- Selection is computed from a fixed epoch: `EPOCH = 2026-04-05`, so 2026-05-18 is challenge #44.

## Architecture

### 1. Data model

Two new files under `public/data/daily/`, which together replace `manifest.json` for the daily feature.

**`approved-pool.json`** — the image bank. Append-only array; `id` (iNaturalist observation id) is the dedupe key.

```jsonc
[
  {
    "id": 79066650,
    "answer_common": "Beetle",            // the Bugs 101 answer (matches BUGS101_OPTIONS)
    "answer_order": "Coleoptera",
    "crops": [
      "pool/79066650/1.jpg",
      "pool/79066650/2.jpg",
      "pool/79066650/3.jpg"
    ],
    "reveal": "pool/79066650/full.jpg",
    "attribution": "(c) Jane Doe, some rights reserved (CC BY)",
    "wikipedia_summary": "Beetles are insects forming the order Coleoptera...",
    "inat_url": "https://www.inaturalist.org/observations/79066650",
    "center_x": 0.52,
    "center_y": 0.47,
    "added": "2026-05-18"
  }
]
```

**`daily-schedule.json`** — date → pool entry id, pre-filled ~90 days ahead.

```jsonc
{
  "2026-05-18": 79066650,
  "2026-05-19": 45406081
}
```

**Crop storage layout**: crops are keyed by observation, not by date — this is what makes reuse possible.

```
public/data/daily/pool/<observation_id>/
  1.jpg   2.jpg   3.jpg     # Bugs 101 crops at dim fractions [0.12, 0.35, 0.65]
  full.jpg                  # reveal image (≤1600x1200, quality 90)
```

Crop dimensions and quality match the existing pipeline (`generate-daily.mjs`): crops resized to 800x600 cover, quality 85; reveal `fit: inside` ≤1600x1200, quality 90.

### 2. Migration (`scripts/migrate-pool.mjs`, one-time)

Reads the current `manifest.json` and, for each challenge:

- **Bugs 101 entry** → copy directly into the pool. It already has the correct `answer_common`, `answer_order`, 3 crops at the right fractions, reveal, attribution, and center. Copy/rename crop files into `pool/<id>/`.
- **All Bugs entry** → join `observation_id` to `candidates.json` to get `taxon`; run the existing `getBugs101Name(taxon)` to derive `answer_common` and use `taxon.order` as `answer_order`. Re-download the original image and regenerate 3 Bugs 101 crops at `[0.12, 0.35, 0.65]` centered on the **already-approved** `center_x/center_y`, and regenerate the reveal from that same re-downloaded original (consistent sizing with the new crops). Drop the 1 entry whose taxon has no valid Bugs 101 name.
- **De-dupe** by `observation_id`: if the same observation backed both a Bugs 101 and an All Bugs day, keep a single pool entry.
- **Backfill missing `wikipedia_summary`**: for entries with an empty summary, look the species/taxon up in the existing curated species-content store (produced by `curate-species-content.js`); if not found, leave it `""` (reveal degrades gracefully).

Output: `approved-pool.json` with ~45 entries (23 Bugs 101 + 22 derived − duplicates) and all crops under `pool/`. The script then performs an initial schedule top-up (see §4) to fill `daily-schedule.json` 90 days out.

The migration is idempotent: re-running it rebuilds the pool from the manifest without duplicating entries (keyed by `id`).

### 3. Selector (client-side, deterministic)

`src/scripts/daily-engine.js` gains:

```
getTodaysEntry(pool, schedule, todayET) -> entry | null
  1. If schedule[todayET] is set AND that id exists in pool -> return that entry.
  2. Else fallback: return pool[ hash(todayET) % pool.length ].
  3. If pool is empty -> null (only possible before first migration).
```

`hash` is a small deterministic string hash (e.g. a 32-bit FNV-1a over the date string) — same input always yields the same index, so all players see the same bug on a given date, and the answer is impossible to be "blank" while the pool is non-empty.

`src/scripts/daily-ui.js`:

- Fetches `approved-pool.json` and `daily-schedule.json` instead of `manifest.json`.
- Removes the `manifest.challenges.find(c => c.date === today && c.approved)` lookup; uses `getTodaysEntry()`.
- Challenge numbering and streaks stay date-based and unchanged (`getChallengeNumber()` still uses `EPOCH`). Today renders as "Daily #44"; the #26–43 gap is cosmetic (appears only in share text) and is intentionally **not** backfilled.

### 4. Batch crop/approve tool

Adapt the existing `scripts/review-server.mjs` (preserve its click-to-set-center + server-side re-crop UX — do not rebuild it) into a **pool builder**, run via `npm run review-daily`:

- **Source**: observations from `candidates.json` that are unused, resolve to a valid Bugs 101 name (`getBugs101Name` ∈ `VALID_BUGS101_NAMES`), and whose original short side ≥ 1200px.
- **Per candidate**: download original → auto-attention crop (existing entropy heuristic) → display in browser → user clicks the true subject center → "Re-crop" regenerates the 3 Bugs 101 crops server-side → **"Approve"** appends the entry to `approved-pool.json`, writes crops to `pool/<id>/`, and marks the source observation used. **"Skip"** advances to the next candidate and marks the source skipped (won't resurface).
- **"Top up schedule"** action: extends `daily-schedule.json` from the last scheduled date (or today) to **today + 90 days**. For each unfilled date, pick a pool entry via a deterministic per-date shuffle, **excluding any entry used within the previous `min(poolSize − 1, 30)` days** to prevent clustering. Existing schedule entries are never rewritten (past/near-future dates stay stable as the pool grows).

Bugs 101 only — the tool has no All Bugs path.

### 5. All Bugs daily removal

- `src/scripts/daily-ui.js`: remove `mode === 'allbugs'` branches, the species-autocomplete path, the 6-guess path, and `allSpeciesList` loading. Hard-pin `mode = 'bugs101'`, `maxGuesses = 3`.
- `src/pages/daily/play.astro`: drop `?mode` handling (always Bugs 101).
- `src/pages/index.astro`: collapse the two daily cards into a single Bugs 101 daily card.
- `scripts/generate-daily.mjs`: retired — left in the repo for reference but unwired from `package.json` scripts (the `generate-daily` script entry is removed; `review-daily` now points at the adapted pool builder).
- `daily_allbugs_*` localStorage keys: left untouched (dead but harmless; no migration of player data needed).
- `public/data/daily/<date>/` folders and `manifest.json`: retained until the client cutover is verified, then removed in a single explicit cleanup commit.

## What Stays The Same

- Astro static build, Vercel deploy, vanilla JS, no framework.
- `daily-engine.js` streak math, `getTodayET()`, `getChallengeNumber()`, `EPOCH`.
- Event logging (`daily_start`, `daily_guess`, `daily_complete`) and the Google Sheets webhook.
- Leaderboard, profile, achievements, and all non-daily game modes.
- `sharp` for crop generation; no new dependencies.

## Risks & Tradeoffs

| Risk / Tradeoff | Assessment / Mitigation |
|---|---|
| ~14 of 45 migrated entries lack a Wikipedia blurb | Backfill from the existing curated species store during migration; reveal screen degrades gracefully to no blurb if still missing. Not a blocker. |
| All Bugs approved center reused at tighter Bugs 101 zoom | Tightest fractions (0.08 vs 0.12) are close, so the center transfers well. The batch tool can re-center any that look off after migration. |
| Small pool at launch (~45) → a bug recurs ~every 45 days | Accepted per the "reuse as much as wanted" requirement. Pool grows via batch cropping. The `min(poolSize−1, 30)`-day repeat-avoidance window prevents same-bug clustering within a cycle. |
| Schedule + pool JSON expose upcoming answers to anyone reading the file | Same accepted risk as today's `manifest.json`. Documented, not mitigated (acceptable for this game). |
| Schedule lapses (user stops topping up for months) | Client hash fallback still serves a valid bug every day — "never blank" holds without the schedule. |
| Dead code: `generate-daily.mjs` left in repo | Intentional, low-cost. Unwired from npm scripts so it can't be run by mistake; removable later. |
| Deleting old `public/data/daily/<date>/` committed assets | Destructive on tracked files. Done only after client cutover is verified, as one explicit, reviewable cleanup commit. |
| Migration correctness (re-derived names, dedupe) | Migration script is idempotent and keyed by `observation_id`; output pool is reviewable in the batch tool before cutover. |

## Alternatives Considered

- **Scheduled CI/cron job writing a date-keyed manifest** — rejected: reintroduces the exact failure mode (a silently broken job) that caused the current outage, and adds CI/commit-from-CI machinery for no benefit on a static site.
- **Pure modulo selector (`daysSinceEpoch % pool.length`), no schedule** — rejected in favor of the schedule because adding images would reshuffle every future date's bug; the schedule keeps future dates stable while the hash fallback preserves the "never blank" guarantee at near-zero extra cost.
- **Start the pool empty, re-crop all 45 by hand** — rejected: the existing entries passed the historical manual-review gate; re-cropping ~45 already-approved images is wasted effort. Harvesting them is near-zero work.

## Out of Scope (future, not in this build)

- Server-side streak validation or anti-cheat.
- Daily challenge leaderboard / global solve-rate stats.
- Difficulty balancing of pool selection (e.g., easier bugs early in the week).
- Automated quality scoring to reduce manual cropping further.
