# Engagement Redesign — Design Spec

**Date:** 2026-04-08
**Context:** Post-launch analytics showed engagement metrics dropping ~50% from peak (Apr 4 → Apr 7). Root cause: mode composition shift to streak (71% of sessions, avg 4.2 rounds) from classic (10 rounds), plus power user drop-off from lack of discoverability/reminders. This spec addresses four areas to improve retention and session depth.

---

## 1. Daily Leaderboard Page

### Problem
The current all-time leaderboard is dominated by early power users. New players see unreachable scores and don't bother competing. This removes a key motivation loop for streak and time trial modes.

### Design

**Server side (Apps Script):**
- Modify the existing `?action=leaderboard` endpoint to filter entries where `timestamp >= today 00:00 ET`
- All entries remain in the sheet permanently — filtered on read, never deleted
- Response adds a `yesterday_champion` field per board: the single highest-scoring entry from the previous calendar day (ET). Fields: `name`, `country`, `score` (or `streak`)
- If no entries exist for yesterday, `yesterday_champion` is `null`

**Client side (`leaderboard.astro` + `leaderboard-ui.js`):**
- Page title: "Daily Leaderboard"
- Subtitle: "Resets every day at midnight ET"
- Countdown timer below subtitle: "Resets in Xh Ym" — computed client-side from `new Date()` to next midnight ET. Updates every minute via `setInterval`.
- Tab structure unchanged: Bugs 101 (Time Trial / Streaks), All Bugs (Time Trial / Streaks)
- Below each board's table: a muted line showing yesterday's winner — "Yesterday: {name} {flag} — {score}". Styled with reduced opacity, smaller font.
- Empty state: "No scores yet today — be the first!" centered in the table area
- Meta tags updated: title becomes "Daily Leaderboard — What's That Bug?", description updated accordingly

**Unchanged:**
- Leaderboard submission flow (`submitLeaderboardEntry`)
- In-game celebration popup (top-10 entry form, confetti) — still triggers when score qualifies for the daily top 10
- Personal best checks (localStorage, all-time)
- sessionStorage cache (5-min TTL)
- `checkTop10()` logic — compares against the daily board returned by the endpoint

### Risks & Tradeoffs
- **Cold-start problem:** Early in the day (ET morning), the board will be empty or sparse. Yesterday's champion provides minimal social proof but doesn't fully solve this. Acceptable at current traffic levels.
- **Timezone choice (ET vs IST vs UTC):** ET chosen because the majority of traffic comes from Reddit (US-dominated). If traffic shifts, this is a one-line change in Apps Script.
- **Sheet growth:** Entries accumulate indefinitely. At current volume (~120 entries/week), this won't be a problem for years. If needed later, an archival trigger can move entries older than 30 days to a separate sheet.

---

## 2. Session Percentiles (End-of-Game)

### Problem
Players finish a streak or time trial session with no context for whether their score is good. The rank labels (Keep Trying, Getting Good, etc.) are arbitrary thresholds that don't reflect actual player distribution.

### Design

**Data pipeline — `scripts/compute-percentiles.mjs`:**
- Reads the events sheet (exported CSV or Google Sheets API)
- Filters to `game_complete` events for eligible set keys: `bugs_101_streak`, `bugs_101_time_trial`, `streak`, `time_trial`
- For streak modes: extracts the streak count from `data_json`
- For time trial modes: extracts the score from `data_json`
- Groups sessions by set key, counts sessions per score value
- Computes cumulative distribution: for each score S, what percentage of sessions scored < S
- Outputs `public/data/percentiles.json`:

```json
{
  "generated": "2026-04-08T12:00:00Z",
  "bugs_101_streak": {
    "distribution": { "0": 5, "1": 12, "2": 34, "3": 67, ... },
    "totalSessions": 847
  },
  "bugs_101_time_trial": {
    "distribution": { "0": 2, "100": 8, "200": 15, ... },
    "totalSessions": 312
  },
  "streak": { ... },
  "time_trial": { ... }
}
```

- `distribution` maps score → count of sessions that achieved exactly that score
- Client computes percentile at runtime: `percentile = (sessions scoring < playerScore) / totalSessions * 100`
- Run as a build step: add to `package.json` scripts, executed before `astro build`

**UI — game-over screen integration:**

Applies to: `renderStreakGameOver()` and time trial summary renderer. Does NOT apply to classic 10-round mode.

New percentile card inserted between the score/stats section and the share section:
- Headline: "**Top X%**" in accent color, large font
- Subtitle: "Better than Y% of all [streak/time trial] sessions"
- Mini histogram: 10 bars representing score buckets, player's bucket highlighted in accent color (`--accent: #c4704b`), others in muted gray. Bars height proportional to count.
- X-axis labels: score range markers (e.g., 1, 5, 10, 15, 20+ for streak)
- Footer: "Based on N sessions" in muted small text

**Graceful degradation:**
- If `percentiles.json` fails to fetch (404, network error), the percentile card simply doesn't render. No error shown to user. The rest of the game-over screen is unaffected.

### Risks & Tradeoffs
- **Staleness:** Percentiles are frozen at deploy time. With ~400 total sessions, the distribution is still forming — a few hundred new sessions could shift percentiles meaningfully. Acceptable tradeoff: deploys happen during active traffic periods, and the distribution stabilizes as N grows.
- **Build-time dependency:** Requires access to the events sheet at build time. For now, use the existing Apps Script webhook (`?action=events` or similar) to fetch events — same pattern as the leaderboard fetch. This avoids adding Google Sheets API credentials to the build. If the webhook becomes a bottleneck, switch to a service account key in env vars.
- **Small sample sizes:** For less-played modes (e.g., `time_trial` all bugs), the distribution may be lumpy with few data points. The histogram will look sparse. This is honest — it shows real data. As traffic grows, it smooths out.
- **Not chosen — real-time approach:** Would add 1-3s cold-start delay at game-over and scan 20k+ event rows per request. Not worth it at current scale.

---

## 3. Streak Milestone Celebrations

### Problem
Streak mode has no intermediate feedback between the per-round correct/wrong flash and the game-over screen. Players on long streaks have no sense of accomplishment until they lose. This reduces the "one more round" impulse.

### Design

**Milestones:** 5, 10, 15, 25, 50

**In-game toasts (during play) — `handleStreakPostAnswer()` in `game-ui.js`:**

| Streak | Toast content | Extra visual | Duration |
|--------|--------------|-------------|----------|
| 5 | "Getting Good 🔥" | None | 2s |
| 10 | "Sharp Eye 🔥🔥" | Streak counter pulses gold | 2s |
| 15 | "Expert 🔥🔥🔥" | Streak counter pulses gold | 2s |
| 25 | "Legendary! 🔥🔥🔥🔥" | Gold pulse + full-width banner flash | 2.5s |
| 50 | "Unstoppable! 🔥🔥🔥🔥🔥" | Gold pulse + full-width banner flash | 2.5s |

**Toast implementation:**
- After the green flash settles (~300ms delay), check if `session.currentStreak` is a milestone value
- Render a toast element positioned top-right of the game screen (not the viewport — stays within the game container)
- Toast has slide-in animation, auto-dismisses after duration
- Styled similarly to existing achievement toasts but with a fire/warm gradient background

**Gold counter pulse (10, 15, 25, 50):**
- Add CSS class `milestone-pulse` to the `.streak-count` element
- `@keyframes milestone-pulse`: scale(1) → scale(1.3) with gold text-shadow glow → scale(1), over 600ms
- Class auto-removed after animation ends

**Banner flash (25, 50):**
- Inject a temporary `<div class="milestone-banner">` at top of `#game-screen`
- Full width, centered text, warm gradient background
- Fade-in 200ms → hold 2s → fade-out 300ms
- Removed from DOM after animation completes

**Game-over screen enhancement — `renderStreakGameOver()`:**
- If the player reached any milestone during the session, show the highest one as a badge below the rank label
- Format: "Reached {milestone} 🔥" with fire emoji count matching the tier
- This is additive — the existing rank labels (Keep Trying / Getting Good / Sharp Eye / Expert / Legendary) remain unchanged

**CSS additions to game styles:**
- `@keyframes milestone-pulse` — gold glow scale animation
- `.milestone-toast` — positioning, gradient background, slide-in/out
- `.milestone-banner` — full-width, centered, gradient, fade in/out
- `.milestone-badge` — game-over screen badge styling

### Risks & Tradeoffs
- **Timing overlap:** The toast fires ~300ms after the correct answer flash. If the player answers very quickly, the toast from one milestone could overlap with the next round loading. Mitigation: toast is absolutely positioned and doesn't block interaction; it's decorative only.
- **Achievement toast collision:** The existing achievement system fires toasts at session end, not mid-game. No conflict during play. However, on the game-over screen, if a milestone badge AND a session achievement toast both fire, they could visually compete. Mitigation: milestone badge is static (part of the layout), achievement toasts float above.
- **Not chosen — confetti/particles:** Tempting for 25+ but adds bundle weight and complexity. The gold pulse + banner is sufficient dopamine without a particle library.

---

## 4. Homepage Hierarchy

### Problem
The current homepage presents 6+ mode buttons with equal visual weight. New users face choice overload. Daily Challenge occupies prime real estate despite being a secondary mode. Classic (the intended entry point) competes equally with Streak and Time Trial for first clicks.

### Design

**Layout (top to bottom):**

**A. Daily Challenge banner strip**
- Slim, full-width strip below the nav/header
- Muted background (slightly darker than page bg, or subtle border)
- Content: "📅 Daily Challenge — a new mystery bug every day" with a "Play →" link
- No accent border, no "New" badge — this is intentionally de-emphasized
- Replaces the current prominent Daily Challenge card

**B. Play section**
- Section header: "Play"
- Two large cards, side by side (flex row, equal width):
  - **Bugs 101**: icon 🔰, title "Bugs 101", subtitle "Identify by type", detail "10 rounds · Beginner"
  - **All Bugs**: icon 🌍, title "All Bugs", subtitle "Name exact species", detail "10 rounds · Expert"
- Cards have accent bottom border (current card styling), are the largest interactive elements on the page
- These link directly to classic mode for their respective sets
- This is the primary CTA — new users see exactly 2 choices

**C. Compete section**
- Section header: "Compete"
- Subtitle: "Race the clock or test your streak"
- 2×2 grid of smaller cards:
  - ⏱️ Time Trial · Bugs 101
  - 🎯 Streaks · Bugs 101
  - ⏱️ Time Trial · All Bugs
  - 🎯 Streaks · All Bugs
- Cards are visually smaller than Play cards — secondary action

**D. Explore section**
- Section header: "Explore"
- Subtitle: "Themed deep dives"
- Horizontal flex-wrap of themed set chips/pills (current themed set styling)
- Sets: Backyard, Tiny Terrors, Beetles, Butterflies, Spiders, etc.

**E. Player stats card**
- Unchanged: appears after 3+ sessions, shows at bottom

**File changes:** Primarily `src/pages/index.astro` and associated CSS. The mode cards' click handlers and routing remain the same — only layout and visual hierarchy changes.

### Risks & Tradeoffs
- **Returning streak players:** Players who primarily play streak mode now need to scroll past the Play section to reach Compete. One extra scroll. Acceptable: these are engaged users who know what they want.
- **Daily Challenge visibility:** Moving it from a prominent card to a subtle banner reduces its discoverability. This is intentional — the analysis showed Daily Challenge was added just before the engagement drop and may have been splitting attention. The banner keeps it accessible without competing for first click.
- **Mobile layout:** The two Play cards should stack vertically on narrow screens (< 480px). The Compete 2×2 grid should also stack to a single column. Standard responsive behavior.

---

## Summary of Decisions

| Area | Approach | Key detail |
|------|----------|-----------|
| Daily Leaderboard | Server-side daily filter (ET) + yesterday's champion | Midnight ET reset, single winner shown per board |
| Session Percentiles | Pre-computed static JSON at build time | Histogram + "Top X%" on game-over screen |
| Streak Milestones | Tiered celebrations | Toast → toast+gold pulse → toast+pulse+banner |
| Homepage | Classic first, daily as banner | Play → Compete → Explore hierarchy |
