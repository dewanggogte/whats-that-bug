# Dev Log

Interesting problems, non-obvious decisions, and lessons learned during development.

---

## 2026-05-19: Daily challenge — designing the failure class out instead of fixing the job

### The problem

The daily challenge had shown "No challenge today" for ~19 days. The surface bug was "the content pipeline wasn't re-run," but that's a symptom: the architecture *had* a job — a manual/cron `generate-daily.mjs` step that produced N future days of one-shot, date-keyed manifest entries. Any job-shaped thing has a "didn't run / ran and failed silently" failure mode, and a 7-day buffer just delays the blank, it doesn't remove it.

### Why it happened

Root cause was structural, not operational. One-shot per-date content + a generation step you must remember to run = an outage is only ever one missed run away. Adding monitoring/cron would have been treating the symptom.

### The fix

Make day→bug a **pure deterministic function of the date over a reusable pool**, computed client-side: `schedule[today]` if present, else `pool[hashDate(today) % pool.length]`. There is no job to fail. A blank day is now impossible by construction as long as the pool is non-empty — the hash fallback holds even if the look-ahead schedule lapses for months. Crops are stored per-observation and reused, so manual review effort is decoupled from daily supply (review once, serve forever).

### Key insight

When a recurring outage traces to "the job didn't run," the highest-leverage fix is often to delete the job, not harden it. Also: before building data enrichment, trace the data to its render site — the spec called for backfilling `wikipedia_summary` from a curated store, but `renderReveal()` never displays that field, so the entire backfill was dead work and was cut. Verifying the consumer before building the producer saved a whole pipeline.

---

## 2026-05-18: Self-describing option names + the getBugs101Name 9-file landmine

**The problem:** In genus/taxonomic-scored sets (e.g. "Eye Candy"), option cards showed a bare species common name with the Latin genus as subtitle — e.g. `Quebec Emerald` / *Somatochlora*. The common name alone doesn't tell a player what kind of bug it is, and for distractors it's an arbitrary representative species of that genus.

**The fix:** A display-layer `withGroupNoun()` in `game-ui.js` appends the lay group noun from the existing `getBugs101Name()` (`Quebec Emerald` → `Quebec Emerald Dragonfly`), skipping when the name already contains that word (`Wheel Bug`, `Lady Beetle`).

**Why it got bigger:** Sweeping all 4,032 observations showed ~67 double-noun / wrong-noun artifacts (`Asian Lady Beetle Ladybug`, `Woodland Meadow Katydid Cricket`, `… Termite Cockroach`). Root cause: `getBugs101Name` returned a vernacular that didn't match iNaturalist's common name. Fixed by `Coccinellidae→Beetle`, splitting `Tettigoniidae→Katydid` out of the cricket families, and adding a `TERMITE_FAMILIES→Termite` branch in Blattodea.

**Key insight (the landmine):** `getBugs101Name` is **copy-pasted across 6 files**, of which 4 produce the answer label (`game-engine.js`, `review-server.mjs`, `generate-daily.mjs`, `fetch-daily-candidates.mjs`) and 2 are a deliberately coarser `getBugs101Category` for set bucketing (`fetch-data.mjs`, `rebuild-sets.mjs`). It's also coupled to 3 hardcoded allow-lists (`daily-ui.js` autocomplete, `review-server.mjs` ×2, `generate-daily.mjs`). Any category change has a **9-file blast radius**, and the two function variants are intentionally *not* equivalent. The coarse variant only affects `bugs_101` set membership, not the displayed answer, so it was deliberately left untouched. Changing only the client copy would silently desync daily-challenge categorization from the runtime.

---

## 2026-04-17: Full UI Revamp + Profile Page

### The UI Revamp (20 commits)

**Problem:** The game UI was functional but felt like a utility app. Players weren't sharing results or coming back — the experience lacked the "juice" that makes games feel alive.

**Approach chosen:** Direction A (Evolution) — keep the warm terracotta palette but elevate it with:
- **Fraunces/Inter typography** — serif display font adds personality to scores and headings
- **Duolingo-style tactile buttons** — 3px colored bottom shadow + `translateY(3px)` press-down on `:active`. Small detail, big feel difference.
- **Warm-tinted shadows** — `rgba(184,90,59,0.08)` instead of gray. Subtle but keeps everything on-palette.
- **Gray-not-red error states** — Borrowed from Wordle's UX insight: wrong answers use warm gray (`#c4b5a8`), not red. Red triggers "I failed" emotions; gray says "not this one."
- **View Transitions API** — native browser cross-fade between quiz rounds, feature-detected
- **canvas-confetti** — 80 particles with terracotta/gold colors on perfect 1000 score

**Key insight:** The single biggest visual impact came from the Fraunces serif font on score numbers and headings. Changing just the font family on `.summary-score` from sans-serif to a variable serif made the results screen go from "data display" to "achievement celebration."

### Problems Encountered

**1. POTD clickability required data threading**
The Play of the Day card needed to link to the iNaturalist observation, but `history.push()` in the game engine only stored `correct_taxon`, not the full observation object with its URL. Had to thread `correct_inat_url` through `game-engine.js` → `history` → `game-ui.js` to make the card clickable.

**2. Share buttons double-classed**
Daily reveal's share icon buttons had `btn btn-outline share-icon-btn` which caused conflicting styles. The `btn-outline` added padding/border-radius that overrode `share-icon-btn`'s 42x42 square design. Fix: just remove the `btn btn-outline` prefix.

**3. Mobile grid breakpoint stale after CSS grid migration**
The old `flex-direction: column` mobile override for play-cards did nothing after Task 4 changed it from flexbox to CSS grid. Had to replace with grid-appropriate `grid-template-columns: 1fr` rules.

### Profile Page

**Problem:** Badges existed (10 achievements tracked in localStorage) but had no UI to view them. Leaderboard collected name/country fresh every time. No way to tie game sessions together across visits.

**Solution:**
- Persistent `user_id` (UUID in localStorage) — auto-attached to every game event and leaderboard submission via a single change in `enqueue()`
- Profile page at `/profile` with avatar picker, name/country, stats, badges, species log
- Leaderboard popup pre-fills from profile data; edits sync back

**UX iteration on profile:**
- First version showed the avatar grid always expanded with name/country fields visible. Research (Mobbin, GameUIDB) showed the standard pattern is tap-to-expand: large avatar with pencil indicator, grid hidden behind a tap. This matches what Duolingo, chess apps, and trivia games do.
- First version hid unearned badge names behind "???" — but this meant players had no idea what to aim for. Changed to show all badge names and descriptions, with locked ones grayed out. The description IS the goal ("Score 800+ in classic mode"), so hiding it defeats the purpose of a collectible system.

**Apps Script note:** The Google Sheets webhook now receives a `user_id` field in every event. A `user_id` column needs to be manually added to the Feedback and Leaderboard sheets in the Apps Script editor.
