# Leaderboard System

**Date:** 2026-04-04
**Status:** Draft

---

## Overview

Add a global leaderboard system to What's That Bug for the 4 competitive modes: Bugs 101 Time Trial, Bugs 101 Streaks, All Bugs Time Trial, All Bugs Streaks. Players can optionally add their name and country flag when they achieve a top-10 score. Personal best celebrations motivate players who don't make the board.

---

## 1. Apps Script Backend

### New Google Sheet Tab: "Leaderboard"

Columns: `timestamp`, `session_id`, `set_key`, `score`, `streak`, `name`, `country`, `questions_answered`, `correct_count`

### GET `?action=leaderboard`

- Returns JSON: `{ bugs_101_time_trial: [...], bugs_101_streak: [...], time_trial: [...], streak: [...] }`
- Each board: array of up to 10 entries, sorted by score (Time Trial) or streak (Streaks)
- Each entry: `{ rank, name, country, score, streak, questions, correct, timestamp }`
- Entries without a name show as "Anonymous Bug Hunter"

### POST `?action=leaderboard_entry`

- Body: `{ session_id, set_key, score, streak, name, country, questions_answered, correct_count }`
- Writes to the Leaderboard sheet tab
- Returns the updated top 10 for that specific board

### Seeding

Pre-populate the Leaderboard sheet with top scores from the existing feedback CSV so the boards aren't empty at launch. All seeded entries use "Anonymous Bug Hunter" as name with no country.

---

## 2. Client-Side Flow

### Session End Sequence

1. Game ends (timer expires / wrong answer / 10 rounds complete)
2. Show loading spinner: "Checking leaderboard..."
3. Fetch `GET ?action=leaderboard` for the current set+mode
4. Compare player's score/streak against the #10 entry on the board:
   - **Top 10 worthy** → show Celebration Popup
   - **Not top 10, but personal best** (compare against localStorage) → show Personal Best Popup
   - **Neither** → show normal results screen
5. If fetch fails (network error), skip leaderboard logic entirely and show normal results

### Leaderboard-Eligible Modes

Only 4 set keys participate: `bugs_101_time_trial`, `bugs_101_streak`, `time_trial`, `streak`

Classic and themed sets show the normal results screen with no leaderboard check.

---

## 3. Celebration Popup (Top 10)

**Overlay popup with:**

- Celebratory heading with rank:
  - #1: "⚡ You're #1!"
  - #2-3: "You're #2!" / "You're #3!"
  - #4-10: "You're #N!"
- Medal emoji: 🥇 (#1), 🥈 (#2), 🥉 (#3), 🏆 (#4-10)
- Their score (Time Trial) or streak count (Streaks) displayed prominently
- Name input field — placeholder: "Anonymous Bug Hunter", optional
- Country dropdown — full ~200 countries with flag emojis, optional
- "Submit to Leaderboard" button
- Top 10 board shown below with their entry highlighted/pulsing
- Share buttons (WhatsApp, iMessage, X, Copy) with rank-specific share text
- X button to close — always submits the entry (as "Anonymous Bug Hunter" with no country if fields are empty). A top-10 score always goes on the board; the name/country are optional decoration.
- After submit/close, the normal results screen shows underneath

---

## 4. Personal Best Popup (Not Top 10)

**Overlay popup with:**

- Heading: "New Personal Best!"
- Their score/streak + previous best shown
- Top 10 leaderboard displayed below for motivation
- Below the board: "You're #47 — keep climbing!" or "Outside top 10 — keep climbing!" if exact rank unknown
- Share buttons (same as normal results share text, no rank mention)
- X button to close → transitions to normal results screen

---

## 5. Leaderboard Page

**Route:** `/leaderboard`

**Header:** Add "Leaderboard" link to site header next to theme toggle.

**Layout:**

- Page title: "Leaderboard"
- Two card sections (matching homepage mode-group style):
  - **Bugs 101** — tabs: Time Trial | Streaks
  - **All Bugs** — tabs: Time Trial | Streaks
- Default active tab: Time Trial for each section

**Each leaderboard table:**

- 10 rows: rank, circular country flag emoji (or blank), name (or "Anonymous Bug Hunter"), score/streak
- #1 gold highlight, #2 silver, #3 bronze
- Compact rows, fits mobile without scrolling

**Loading state:** Spinner centered in each section while fetching. On error: "Couldn't load leaderboard. Try again later."

**Data:** Fetched once on page load. No auto-refresh.

---

## 6. Share Text for Leaderboard Moments

### #1 (World Record)

```
⚡🥇🪲 I'm the #1 Bug Identifier in the WORLD!

⏱️ Bugs 101 Time Trial — 1850 pts

⚡ WORLD RECORD ⚡

Come dethrone me
https://dewanggogte.com/games/bugs/?ref=share&mode=time_trial
```

### #2-3

```
🥈🪲 I'm ranked #2 in the WORLD on What's That Bug!

🎯 All Bugs Streaks — 21 in a row

👑 NEW RECORD 👑

Think you can beat me?
https://dewanggogte.com/games/bugs/?ref=share&mode=streak
```

### #4-10

```
🏆🪲 I'm ranked #7 in the WORLD on What's That Bug!

🎯 All Bugs Streaks — 14 in a row

🚨 NEW RECORD 🚨

Think you can beat me?
https://dewanggogte.com/games/bugs/?ref=share&mode=streak
```

### Personal Best (not top 10)

Same as current mode-specific share text (no rank mention).

---

## 7. Loading States

- **Session end → leaderboard check:** Spinner overlay with "Checking leaderboard..." between the last answer and the popup/results screen
- **Celebration popup → submit:** Button shows spinner while POSTing, then updates the board inline
- **Leaderboard page → load:** Spinner in each section card, replaced by table on success
- **All failures:** Graceful fallback — skip popup (session end) or show error message (leaderboard page)

---

## 8. Country Selector

- Full list of ~200 countries
- Each option shows: flag emoji + country name (e.g., "🇺🇸 United States")
- Dropdown sorted alphabetically by country name
- First option: empty/blank (no country selected)
- Flag emojis render natively (circular on iOS/macOS, rectangular on Android/Windows)

---

## 9. Files Changed

| File | Change |
|------|--------|
| `src/scripts/leaderboard.js` | **New** — fetch/submit leaderboard data, top-10 check logic |
| `src/scripts/leaderboard-ui.js` | **New** — celebration popup, personal best popup, leaderboard table rendering |
| `src/scripts/countries.js` | **New** — country list with flag emojis |
| `src/scripts/game-ui.js` | Modify — integrate leaderboard check at session end |
| `src/scripts/share.js` | Modify — add rank-specific share text generators |
| `src/pages/leaderboard.astro` | **New** — leaderboard page |
| `src/layouts/Base.astro` | Modify — add Leaderboard link to header |
| `src/styles/global.css` | Modify — leaderboard table, popup, tab, loading spinner styles |
| Google Apps Script | Modify — add GET leaderboard + POST leaderboard_entry endpoints |

---

## 10. Risks & Tradeoffs

- **Apps Script latency (~500ms-1s):** Acceptable since it only happens at session end, masked by loading spinner. If latency becomes a problem, could cache in localStorage with TTL.
- **No anti-cheat:** Client-trusted scores. Round-by-round data in the sheet enables manual auditing. Can add server validation later if abuse appears.
- **Race condition:** Two players finish simultaneously, both see themselves as #10, but only one actually makes it. Edge case at this scale, not worth solving.
- **Country flags rendering:** Native emoji flags look different across platforms (circular on Apple, rectangular on others). Acceptable — no external dependency needed.
- **Apps Script concurrent execution limit (~30):** Could be hit if the game goes viral. Mitigation: cache leaderboard in localStorage with short TTL to reduce reads.
