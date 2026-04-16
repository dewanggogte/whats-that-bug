# Dev Log

Interesting problems, non-obvious decisions, and lessons learned during development.

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
