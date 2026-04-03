# Game Modes: Time Trial & Streak

**Date:** 2026-04-04
**Status:** Draft

---

## Overview

Add two new game modes to What's That Bug, plus game rules pop-ups for all sets, homepage card redesign, and header/about page cleanup.

- **Time Trial** — 60-second speed run, as many questions as possible, tiered points for speed
- **Streak** — infinite until a wrong answer, counts consecutive correct identifications

Both modes draw from the All Bugs observation pool (2,621 observations, 1,155 species) and use binary scoring (correct/wrong, no partial credit).

---

## 1. Time Trial Mode

### Core Mechanics

- 60-second countdown timer, unlimited questions
- Binary scoring: correct = points based on speed, wrong = 0
- Questions drawn from All Bugs pool with existing distractor algorithm
- Session ends when timer reaches 0 (mid-question is fine; banked score is final)

### Speed Bracket Scoring

| Answer Time | Points |
|-------------|--------|
| Under 3s    | 100    |
| 3-5s        | 75     |
| 5-8s        | 50     |
| 8-12s       | 25     |
| 12s+        | 10     |

Brackets derived from real player data: median correct answer ~6.5s, fast players ~3s, slow/careful ~17s. Most players will answer 5-12 questions in 60 seconds.

### During Play UI

- **Timer countdown** displayed prominently (top area)
- **Running score counter** (top area)
- **Photo + 4 choice buttons** (center/bottom)
- On correct answer:
  - Green border flash on screen
  - "+X" popup appears near score counter (stays visible ~500-1000ms)
  - Time taken for that question shown near timer (stays visible ~500-1000ms)
  - Next question advances immediately (flash/numbers persist as overlay while new question loads)
- On wrong answer:
  - Red border flash on screen
  - "+0" popup near score counter
  - Next question advances immediately
- No learning card shown for correct or wrong answers

### Results Screen

- Total score
- Questions answered + accuracy (e.g., "9/12 correct")
- Emoji grid: green per correct, red per wrong
- Share card
- Best score saved to localStorage (`best_time_trial`)
- "Play Again" + "Change Set" buttons

---

## 2. Streak Mode

### Core Mechanics

- No time limit, unlimited questions
- Binary scoring: correct continues the streak, wrong ends the game
- Questions drawn from All Bugs pool
- Session ends on first wrong answer

### During Play UI

- **Streak counter** displayed prominently (the main number on screen)
- **Photo + 4 choice buttons** (center/bottom)
- On correct answer:
  - Green border flash (~500ms delay before advancing)
  - Streak counter increments
  - No learning card shown
- On wrong answer:
  - Red border flash
  - Transitions to game over screen

### Game Over / Results Screen (merged with learning card)

- Learning card for the bug they got wrong:
  - Common name + species (italicized)
  - Wikipedia summary
  - Taxonomy breadcrumb explaining the mistake
  - iNaturalist link
- Final streak count displayed prominently
- Emoji grid: all greens (no trailing red)
- Share card
- Best streak saved to localStorage (`best_streak`)
- "Play Again" + "Change Set" buttons

---

## 3. Classic Mode (unchanged)

- 10 rounds, taxonomic distance scoring (0/25/50/75/100)
- Learning card after every answer
- Existing results screen
- No changes to mechanics

---

## 4. Game Rules Pop-up

Shown before the first question on **every** set (Time Trial, Streak, and all 7 existing sets).

### Design

- Overlay card on top of the game screen after the set loads
- Contains a **mini diagram/wireframe of the game screen layout**, labeling key areas (timer, score counter, photo area, choice buttons, etc.)
- Minimal text beneath the diagram explaining the core mechanic
- Auto-dismisses after ~5 seconds if player doesn't interact
- X button in top corner for manual dismiss
- Game/timer does NOT start until the popup is dismissed

### Content Per Mode

**Time Trial:**
- Diagram: timer countdown (top), score counter (top), photo (center), choices (bottom)
- Labels: "60 seconds", "Faster = more points"
- Text: speed bracket table, "Wrong = 0 points"

**Streak:**
- Diagram: streak counter (top), photo (center), choices (bottom)
- Labels: "Streak count", "One wrong = game over"
- Text: "No time pressure. Just don't miss."

**Classic (taxonomic sets):** All Bugs, Backyard Basics, Beetles, Butterflies & Moths, Spiders & Friends, Tiny Terrors
- Diagram: score counter (top), round counter (top), photo (center), choices (bottom)
- Labels: "10 rounds", scoring tiers (100/75/50/25/0)
- Text: "Closer guess = more points"

**Bugs 101 (binary):**
- Diagram: score counter (top), round counter (top), photo (center), choices (bottom)
- Labels: "10 rounds", "Right = 100, Wrong = 0"
- Text: "Identify the bug type"

---

## 5. Image Preloading

Image load times from iNaturalist CDN could stall gameplay, especially in Time Trial.

### Strategy

- **Time Trial:** preload a rolling batch of ~5 images ahead. Begin preloading when the player clicks the Time Trial card (images load during the rules popup). Refill the buffer as questions are answered.
- **Streak:** preload 2 images ahead. Begin on set selection.
- **Classic / all existing sets:** preload 2 images ahead. Begin on set selection.

If images are still too slow, add `?w=600` or similar resize params to iNaturalist URLs.

---

## 6. Homepage Set Cards

### New Mode Cards (Time Trial & Streak)

- Placed at the top of the grid, before all existing set cards
- Visually distinct from regular set cards:
  - Accent-colored border/background to signal "different game type"
  - Small "MODE" tag/label
  - Time Trial: stopwatch/lightning aesthetic
  - Streak: flame/chain aesthetic
- Card content: mode name, brief tagline, best score from localStorage
  - Time Trial tagline: e.g., "60 seconds. Go."
  - Streak tagline: e.g., "Don't miss."
- No difficulty badge (these aren't difficulty-tiered)

### Existing Set Cards

- Unchanged in styling and content
- Shifted below the two mode cards in the grid

---

## 7. Share Cards

### Time Trial Share Text

```
What's That Bug? — Time Trial

425 pts | 9/12 correct | 60s

(emoji grid: green/red per question)

https://dewanggogte.com/games/bugs/?ref=share&mode=time_trial
```

Flavor lines: "Lightning fast!" / "Speed demon!" / "Not bad for 60 seconds!" / "Bugs are tricky under pressure!"

### Streak Share Text

```
What's That Bug? — Streak

14 in a row

(emoji grid: all greens, no trailing red)

https://dewanggogte.com/games/bugs/?ref=share&mode=streak
```

Flavor lines: "Unstoppable!" / "Bug expert!" / "Solid run!" / "Give it a shot!"

### Classic Share Text (unchanged)

```
What's That Bug? — 750/1000

(emoji grid)

7/10 · Streak: 5 · Butterflies & Moths
(flavor line)

https://dewanggogte.com/games/bugs/?ref=share&set=butterflies_moths
```

---

## 8. Header & About Page Changes

- Remove Home and About links from the header navigation
- Delete the About page (`about.astro`) entirely
- Game rules pop-ups replace the need for a separate scoring explanation page

---

## 9. Data & State Changes

### sets.json — Two New Entries

```json
"time_trial": {
  "name": "Time Trial",
  "mode": "time_trial",
  "scoring": "binary",
  "observation_ids": "<reference the same observation_ids array as all_bugs — do not duplicate, share the reference>"
}
```

```json
"streak": {
  "name": "Streak",
  "mode": "streak",
  "scoring": "binary",
  "observation_ids": "<reference the same observation_ids array as all_bugs — do not duplicate, share the reference>"
}
```

### SessionState Extensions

- New `mode` field: `"classic"` | `"time_trial"` | `"streak"`
- Time Trial tracks: `timeRemaining`, `questionsAnswered`, `correctCount`
- Streak tracks: `currentStreak`
- No `maxRounds` limit for either new mode

### localStorage Keys

- `best_time_trial` — highest score (number)
- `best_streak` — longest streak (number)

### Feedback Logging

- All `round_complete` events gain a `mode` field
- All `session_end` events gain a `mode` field
- Time Trial `session_end` additionally logs: `questions_answered`, `correct_count`

---

## 10. Files Changed

| File | Change |
|------|--------|
| `src/scripts/game-engine.js` | SessionState mode field, mode configs, binary scoring path |
| `src/scripts/game-ui.js` | Game loop branching, timer, streak counter, flash effects, +X popup, preloading, rules popup |
| `src/scripts/share.js` | Mode-specific share text + URL params (`mode=time_trial`, `mode=streak`) |
| `src/scripts/feedback.js` | `mode` field in logged events |
| `src/pages/index.astro` | New mode cards at top, styled distinctly |
| `src/pages/play.astro` | Accept mode param |
| `src/styles/global.css` | Mode card styles, flash animations, timer/streak/popup UI, rules popup styles |
| `src/layouts/Base.astro` | Remove header nav links (Home, About) |
| `public/data/sets.json` | Two new set entries (time_trial, streak) |
| `src/pages/about.astro` | **Delete** |

---

## Risks & Tradeoffs

- **game-ui.js complexity**: Adding mode branching to a 490-line file increases cognitive load. Mitigated by extracting mode-specific UI into clearly labeled functions.
- **Image preloading memory**: Preloading 5 images for Time Trial could use ~5-10MB. Acceptable for a short session on modern devices.
- **iNaturalist CDN reliability**: Preloading helps but doesn't solve CDN outages. No mitigation planned — existing risk for all modes.
- **Timer fairness on slow connections**: A player on slow internet loses time to image loads even with preloading. The 5-image buffer should cover most cases. Could add resize params (`?w=600`) as a fallback.
- **Binary scoring simplification**: Time Trial and Streak lose the educational taxonomic-distance scoring. Acceptable trade — these modes prioritize speed/consistency over learning. Learning cards on wrong answers in Streak still provide education.
- **About page removal**: Scoring explanation moves to in-game rules popups. The about page contains iNaturalist/CC BY attribution and project credits — these must be relocated to the footer (already has personal site links) before deleting the page.
