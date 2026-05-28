# Wrong-Answer Learning Card — Design Spec

**Date:** 2026-05-28
**Status:** Approved for planning

## Problem

Today's wrong-answer feedback card in Classic mode only states that the pick was wrong and names the correct answer. It teaches nothing about *how* to tell the two bugs apart. We want to turn it into a light "learning card" that surfaces the single most useful diagnostic difference between the player's wrong pick and the correct answer — breezy, not a homework quiz.

## Scope

**In scope:**
- Redesign the wrong-answer card in **Classic** mode (all sets).
- Show the same learning card on the **Streak** game-over screen (the bug that ended the run).

**Out of scope:**
- **Time Trial** — left untouched; its fast auto-advance flow has no per-round card.
- **Correct-answer** card — unchanged (keeps current celebratory treatment).
- Daily challenge card — unchanged.

## Card Design (Direction C — "friendly nudge")

Light, conversational, no emojis. Inserted below the mystery photo on a wrong answer, replacing the current `.feedback-card.miss` content.

Layout, top to bottom:
1. **Result title** — `Close one!` (or `Not quite`), in the accent terracotta.
2. **Answer line** — **Common Name** *(scientific name, italic, muted)*.
3. **Quickest tell** — one sentence, lead-in `Quickest tell:` in accent, then the single most useful diagnostic difference.
4. **Fun fact** — one short line (muted), separated by spacing.
5. **Actions** — existing reactions (Too Easy / Just Right / Too Hard), `Learn more →` link, `Next Round →` button.

Styling reuses existing tokens: `--surface`, `--border`, `--accent` (#b85a3b), Fraunces (display) + Inter (UI). No new color system.

## How the "Quickest tell" is generated

Three-tier resolution, evaluated per round at runtime from the player's pick and the correct answer:

### Tier 1 — Bugs 101 (binary set, 32 categories)
Look up a hand/LLM-authored **pairwise giveaway** by the unordered category pair of {picked category, correct category}. The card phrases it directionally: *"It's a {correct}, not a {picked} — {giveaway}."* ~496 possible unordered pairs (C(32,2)), fully enumerable.

### Tier 2 — Genus sets (genus scoring)
Contrast the **structured traits** of the picked genus vs. the correct genus across four dimensions, in fixed priority order:

1. `structure` (body plan + legs/antennae)
2. `wings` (wing covers / wing type / wingless)
3. `size`
4. `color` (color & pattern)

Walk the dimensions in order; the **first dimension whose two values clearly differ** becomes the tell: *"{Correct} has {correct value}, while {your pick} has {picked value}."* "Clearly differ" = normalized string comparison is unequal (structure and wings differ reliably; size/color are fuzzier and rank last).

### Tier 3 — Fallback
- If pick and answer are too similar to contrast (typically same-family genera with near-identical traits), show the **correct answer's `key_mark`** alone: *"{Correct} — {key_mark}."*
- If no trait data exists for the relevant taxa at all, fall back to today's behavior (plain answer + trimmed blurb).

## Content & Generation

### Data files (new)
- `public/data/taxon-traits.json` — keyed by **genus name** (~1,062) **and** Bugs 101 **category label** (32). Each entry:
  ```json
  {
    "structure": "2 body sections, 8 legs, no antennae",
    "wings": "none",
    "size": "4–18 mm",
    "color": "fuzzy, large forward-facing eyes, bold facial markings",
    "key_mark": "big front eyes and a stocky, jerky-moving body"
  }
  ```
  Values are terse, photo-checkable phrases.
- `public/data/bugs101-tells.json` — keyed by unordered category pair (e.g. `"Beetle|Spider"`, keys sorted alphabetically) → one giveaway string.

### Generation scripts (new, reuse `curate-species-content.js` harness)
The existing harness pattern: batched `claude -p` calls, JSON in/out, resumable (skips already-done keys), concurrency waves, saves progress per wave, grounded on source data to curb hallucination.

- `scripts/generate-taxon-traits.mjs` — for each genus, aggregate its constituent species' Wikipedia extracts (`data/species-wikipedia-raw.json`) + `species-content.json` summaries as grounding context, prompt for the five-field trait object. Same batching/resume/wave structure. Bugs 101 categories generated in the same run from representative species per category.
- `scripts/generate-bugs101-tells.mjs` — generate one giveaway line per unordered category pair, grounded on the two categories' trait entries.

### Validation pass
Because genus-level claims carry accuracy stakes (a wrong field mark mis-teaches):
- Schema check: all five fields present and non-empty; each within a length cap (e.g. ≤ 90 chars).
- Coverage report: which genera/categories in the live sets lack entries.
- Spot-review: sample N entries for manual accuracy review before shipping.

## Runtime Wiring

- New module `src/scripts/learning-card.js`, exporting a pure function:
  ```
  buildLearningCard(picked, correct, setKey, { traits, bugs101Tells, speciesContent })
    → { title, answerName, answerSci, tell, funFact, learnMoreUrl }
  ```
  Pure and dependency-injected so it is unit-testable in isolation (no DOM, no fetch).
- `src/scripts/game-ui.js`:
  - `handleClassicPostAnswer` — on the miss path (`score < 100`), render the new card from `buildLearningCard` output instead of the current inline breadcrumb/blurb. The correct path is unchanged.
  - Streak game-over renderer (`renderStreakGameOver`) — render the same learning card for the bug that ended the run.
- Trait/tell/species-content JSON loaded alongside existing game data.
- Fun fact prefers `species-content.json[correct.species].summary` (HTML stripped, trimmed to one sentence), falling back to `correct.wikipedia_summary`.

## Testing / Verification

- **Unit (`buildLearningCard`):** Tier 1 returns the pairwise line for a known Bugs 101 pair; Tier 2 surfaces the highest-priority differing dimension; Tier 3 falls back to `key_mark` when traits match, and to the plain blurb when traits are absent. Verify directional phrasing (correct vs. picked).
- **Content validation:** the validation pass reports 100% coverage for genera/categories present in shipped sets, or an explicit allowlist of accepted gaps.
- **Manual UI:** play Classic in Bugs 101 (pairwise line) and a genus set (contrast + same-family fallback), and trigger a Streak game-over — confirm the card renders, copy reads breezy, actions work, mobile layout holds.

## Risks & Tradeoffs

- **Genus-level granularity (chosen over family-level):** ~4× the generation cost and higher accuracy risk than family-level traits, and most added specificity is wasted on same-family pairs that fall back to `key_mark` anyway. Accepted in favor of specificity; mitigated by grounding generation on existing Wikipedia/species-content data and a validation/spot-review step.
- **Weak templated contrasts:** when two genera differ only in `color`, the genus-set tell can read thin ("browner than yours"). Bugs 101 (the highest-traffic beginner set) gets strong hand-authored lines; genus sets are best-effort by design.
- **Content staleness:** trait/tell files must be regenerated when the species pool changes (new genera/categories). The coverage report surfaces gaps; resumable scripts make incremental top-ups cheap.
- **No image-aware "why not your pick":** the tell describes how the two taxa differ in general, not what's visible in the specific photo (no runtime vision). Accepted — diagnostic field marks are the practical substitute.

## Alternatives Considered

- **Pre-generated pairwise diagnostics for all sets** — rejected: ~88k plausible genus pairs for `all_bugs` alone makes batch generation and payload size intractable.
- **Runtime LLM generation (serverless + cache)** for bespoke per-pair tells — rejected for now: adds infra, per-call cost, and latency, and breaks the static-site model.
- **Family-level traits (~257 entries)** — recommended but declined by the user in favor of genus-level specificity.
- **Denser card layouts (side-by-side columns / diff table)** — rejected: read like a quiz; the goal is light and breezy.
