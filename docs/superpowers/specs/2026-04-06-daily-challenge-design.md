# Daily Challenge — Design Spec

**Date**: 2026-04-06
**Status**: Approved

## Overview

Two daily challenges for What's That Bug — one beginner-friendly (Bugs 101 level, order/common-name identification) and one expert (All Bugs level, full species identification). Both use a progressive zoom-out crop reveal mechanic: players see a tightly cropped portion of an insect image and guess what it is. Wrong guesses reveal a wider crop. Same puzzle for all players each day.

**Goals**:
- Create a daily habit loop that drives retention (currently 1.2x visit-to-visitor ratio — nearly zero repeat visits)
- Enable organic virality through a shareable, spoiler-free result format
- Serve both player cohorts: the 42% who play Bugs 101 and the 42% who play expert sets
- Increase share rate (currently 1.5% of sessions)

## Two Daily Challenges

### Bugs 101 Daily
- **Identification level**: Order/common name (~15-20 options: Beetle, Spider, Moth, Butterfly, Mantis, Cockroach, Bee, Ant, Dragonfly, Fly, Cricket/Grasshopper, Stick Insect, True Bug, Earwig, Centipede/Millipede, etc.)
- **Guesses**: 3
- **Crops**: 3 zoom levels (~20%, ~50%, ~80% of subject area)
- **Input**: Free-text with autocomplete dropdown from the fixed common-name list
- **Target audience**: Casual players, Bugs 101 aces looking for a new challenge format, newcomers

### All Bugs Daily
- **Identification level**: Species (common name or scientific name, ~1,155 species in current dataset)
- **Guesses**: 6
- **Crops**: 6 zoom levels (~15%, ~25%, ~35%, ~50%, ~70%, ~90% of subject area)
- **Input**: Free-text with autocomplete dropdown, searchable by common name OR scientific name
- **Target audience**: Learners, solid players, enthusiasts, competitive players

### Different Images
Each daily uses a different insect image. No cross-contamination — solving Bugs 101 gives no hints about the All Bugs answer.

## Gameplay Flow

### Start Screen
- Crop #1 (tightest zoom) displayed prominently (top ~60% of screen on mobile)
- Text input with autocomplete dropdown below the image
- Submit button, large and thumb-friendly

### Guess Loop
1. Player types and selects an answer from the autocomplete
2. **Correct** → celebration transition to reveal screen
3. **Wrong** → answer shows briefly in red, then transitions to next (wider) crop
4. Wrong guesses appear as crossed-out entries in a guess history strip
5. Players can tap previous crop thumbnails in the history strip to review earlier crops

### Reveal Screen (win or lose)
- Full uncropped image, beautifully displayed
- Species name (common + scientific)
- Wikipedia summary blurb
- iNaturalist link
- Photo attribution (CC BY)
- Share button
- Streak counter display (play-streak + win-streak)
- Countdown to next puzzle ("Next bug in 5h 23m")

### Lockout
Once a player completes today's challenge (win or lose), it's locked for that day. They see their result and the reveal screen. No replaying. State stored in localStorage keyed by date.

### Autocomplete Behavior
- **Bugs 101**: Flat list, no hierarchy. Simple prefix matching. Type "be" → "Beetle", "Bee".
- **All Bugs**: Searchable by common name OR scientific name. Type "honey" → "Western Honey Bee (Apis mellifera)". Type "apis" → same. Forgiving of minor typos where feasible.

## Streaks and State

### Daily Reset
- Midnight Eastern Time (05:00 UTC)
- Aligns with peak traffic window (US evening)

### Two Streak Types
- **Play streak**: Maintained by playing today's challenge (win or lose). Displayed prominently. "Day 47"
- **Win streak**: Maintained only by solving correctly. Displayed secondarily.
- Both are strict — missing a day resets to 0, no forgiveness mechanism.

### Local State (localStorage)

```
daily_bugs101_history: {
  "2026-04-07": { "solved": true, "guesses": 2, "answer": "Beetle" },
  "2026-04-08": { "solved": false, "guesses": 3, "answer": "Mantis" }
}
daily_allbugs_history: { ... same structure ... }
daily_bugs101_play_streak: 12
daily_bugs101_win_streak: 8
daily_allbugs_play_streak: 5
daily_allbugs_win_streak: 3
```

## Sharing

### Format
Three-line text header + emoji grid. Binary feedback (red = wrong, green = correct, white = unused).

**Bugs 101 Daily:**
```
🪲 What's That Bug
Bugs 101
Daily #42 — 2/3
🟥🟩⬜
```

**All Bugs Daily:**
```
🪲 What's That Bug
All Bugs
Daily #42 — 5/6
🟥🟥🟥🟥🟩⬜
```

**Failed attempt:**
```
🪲 What's That Bug
Bugs 101
Daily #42 — X/3
🟥🟥🟥
```

### Share Channels
Same as existing game: clipboard copy, WhatsApp, iMessage, X/Twitter, native share.
Share URL includes `?ref=share` parameter for attribution tracking.

## Content Pipeline

### Weekly Batch Generation

A script (`scripts/generate-daily.mjs`) runs weekly (via GitHub Actions cron or manually) to generate the next 7 days of challenges. This buffer handles occasional CI hiccups.

**Steps:**

1. **Candidate selection** from the 2,621 observation pool:
   - Filter for original image resolution >= 1500px on short side
   - Filter for subject prominence (not distant/blurry shots — multiple free-text complaints about photo quality confirm this matters)
   - Exclude previously used observations (tracked in a history manifest)
   - Bugs 101 daily: rotate through orders for variety
   - All Bugs daily: prioritize species with distinctive visual features

2. **Original image download** — fetch `original.jpeg` from iNaturalist S3 (not `medium.jpeg`). Only 7-10 images per batch, so bandwidth is negligible.

3. **Crop generation** with Sharp:
   - Detect subject region (center-of-mass / saliency heuristic)
   - Generate crops at progressive zoom levels centered on subject:
     - Bugs 101: 3 crops at ~20%, ~50%, ~80%
     - All Bugs: 6 crops at ~15%, ~25%, ~35%, ~50%, ~70%, ~90%
   - Generate full reveal image
   - Resize all crops to consistent display dimensions (e.g., 800x600) for fast mobile loading
   - Output to `public/data/daily/YYYY-MM-DD/`

4. **Review tool** (`scripts/review-daily.html`):
   - Local HTML page, opens in browser
   - Shows upcoming 7-10 days of challenges
   - For each day: side-by-side display of all crops + full reveal + answer
   - Approve/reject per challenge
   - Rejected challenges replaced from candidate pool
   - Outputs approved manifest

5. **Deploy** — approved crops committed to repo, standard Vercel deploy.

### Manifest Structure

`public/data/daily/manifest.json`:

```json
{
  "challenges": [
    {
      "date": "2026-04-07",
      "number": 1,
      "bugs101": {
        "observation_id": 12345,
        "answer_order": "Coleoptera",
        "answer_common": "Beetle",
        "crops": [
          "daily/2026-04-07/b101_1.jpg",
          "daily/2026-04-07/b101_2.jpg",
          "daily/2026-04-07/b101_3.jpg"
        ],
        "reveal": "daily/2026-04-07/b101_full.jpg",
        "attribution": "(c) Jane Doe, CC BY",
        "wikipedia_summary": "Beetles are insects forming the order Coleoptera...",
        "inat_url": "https://www.inaturalist.org/observations/12345"
      },
      "allbugs": {
        "observation_id": 67890,
        "answer_species": "Apis mellifera",
        "answer_common": "Western Honey Bee",
        "crops": [
          "daily/2026-04-07/expert_1.jpg",
          "daily/2026-04-07/expert_2.jpg",
          "daily/2026-04-07/expert_3.jpg",
          "daily/2026-04-07/expert_4.jpg",
          "daily/2026-04-07/expert_5.jpg",
          "daily/2026-04-07/expert_6.jpg"
        ],
        "reveal": "daily/2026-04-07/expert_full.jpg",
        "attribution": "(c) John Smith, CC BY",
        "wikipedia_summary": "The western honey bee or European honey bee...",
        "inat_url": "https://www.inaturalist.org/observations/67890"
      }
    }
  ]
}
```

### Image Resolution Strategy
Current game uses `medium.jpeg` (~500-800px) from iNaturalist. For the daily challenge, we fetch `original.jpeg` (~2000-4000px+) since we only need 1-2 images per day. This provides enough resolution for meaningful tight crops. Candidates with originals below 1500px on the short side are filtered out.

## Technical Architecture

### New Files

| File | Purpose |
|------|---------|
| `src/pages/daily.astro` | Daily challenge hub page |
| `src/pages/daily/play.astro` | Daily gameplay page (`?mode=bugs101` or `?mode=allbugs`) |
| `src/scripts/daily-engine.js` | Game logic: guess validation, crop progression, state management |
| `src/scripts/daily-ui.js` | DOM rendering: crop display, autocomplete, guess history, reveal |
| `scripts/generate-daily.mjs` | Weekly batch pipeline: candidate selection, image download, crop generation |
| `scripts/review-daily.html` | Local review tool for manual approval |
| `public/data/daily/manifest.json` | Challenge definitions and metadata |
| `public/data/daily/YYYY-MM-DD/` | Pre-cropped images per day |

### Data Flow

```
Weekly cron (GitHub Actions) or manual trigger
  → scripts/generate-daily.mjs
    → fetches original images from iNaturalist S3
    → Sharp generates crops
    → outputs to public/data/daily/YYYY-MM-DD/
    → updates manifest.json with candidates
  → manual review via scripts/review-daily.html
  → approved → git commit & Vercel deploy

Client loads /daily
  → fetches manifest.json (short cache, e.g., 1 hour — changes weekly)
  → determines today's date (ET timezone)
  → checks localStorage for today's completion status
  → if not played: loads crops progressively as player guesses
  → if played: shows reveal screen with stored result
```

### Event Logging

Same `feedback.js` pipeline to Google Sheets webhook. New event types:

- `daily_start` — session_id, mode (bugs101/allbugs), date, challenge_number
- `daily_guess` — session_id, guess_number, user_answer, correct (bool), mode, date
- `daily_complete` — session_id, mode, solved (bool), guesses_used, date, share_clicked, play_streak, win_streak

### Dependencies

- **sharp** (build-time only) — image processing for crop generation. ~50M weekly downloads, actively maintained, no client bundle impact.

### What Stays The Same
- Astro 4.0 static site architecture
- Vercel deployment
- Vanilla JS (no framework)
- GoatCounter + Umami analytics
- Google Sheets event logging via Apps Script webhook
- All existing game modes untouched

## Mobile-First Layout

- Image occupies top ~60% of viewport
- Guess history as horizontal thumbnail strip between image and input
- Text input with autocomplete dropdown below
- Large submit button, thumb-friendly
- Reveal screen: full image, info card, share buttons, streak display

## Homepage Integration

New "Daily Challenge" section at the top of the homepage, above existing game modes. Two cards:

- **Bugs 101 Daily** — shows status: "Play today's challenge", "Solved in 2/3!", or streak count
- **All Bugs Daily** — same status pattern

Visual priority: daily challenges should be the first thing returning players see.

## Future Enhancements (not in v1)

These are documented for future consideration, not part of the initial build:

1. **Different-parts crop mode** — instead of zoom-out, show different diagnostic parts of the insect (leg, antenna, wing, head) at similar zoom levels. More like a jigsaw than a zoom. Requires more sophisticated crop selection in the pipeline.

2. **Text hints at later guess stages** — habitat, geographic range, behavior descriptions, taxonomic narrowing. E.g., "This insect is nocturnal" or "Family: Apidae".

3. **Global solve-rate stats** — "42% of players solved today's challenge". Requires server-side tracking.

4. **Server-side streak validation** — prevent localStorage manipulation. Move streak state to the Google Sheets backend or a lightweight database.

5. **Daily challenge leaderboard** — rank by fewest guesses, or time-to-solve for tiebreaking.

6. **Streak forgiveness** — "streak freeze" tokens, grace periods. Add if player feedback indicates strict streaks cause frustration/abandonment.

7. **Notification/reminder system** — email or push notification to remind players of their streak. Requires opt-in mechanism.

## Risks and Tradeoffs

| Risk | Mitigation |
|------|------------|
| Automated crop selection picks uninteresting/undiagnostic region | Manual review tool is a hard gate — no image goes live without approval |
| Some images too small/blurry for meaningful crops | Filter candidates by original resolution >= 1500px; photo quality complaints from player feedback confirm this matters |
| GitHub Actions cron fails, no new challenges generated | 7-day buffer means a single failure is invisible to players; alerts on failure |
| Player inspects manifest.json to see today's answer | Acceptable risk for v1. Manifest could be obfuscated or split in future if it becomes a problem |
| localStorage streak data can be faked | Acceptable for v1. Not worth server-side validation until the feature proves retention value |
| Autocomplete UX on mobile may be clunky | Must test thoroughly on iOS Safari and Android Chrome; may need custom dropdown rather than native datalist |
| Only ~2,621 observations in pool; daily usage = ~730/year | Pool lasts ~3.5 years for both dailies combined. Can be expanded by fetching more observations from iNaturalist. |
