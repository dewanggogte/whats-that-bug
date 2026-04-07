# What's That Bug? — v2 Product Requirements Document

**Date:** 2026-04-07
**Status:** Draft — awaiting review

---

## Overview

The game is functional and has solid mechanics (classic/time trial/streak/daily modes, leaderboards, share cards). This PRD addresses the next layer: making it **sticky, polished, and data-driven**.

The core problems:
1. Players play 3-5 sessions, hit a personal best, then churn — no long-term progression
2. Bad images cause unfair streak-breaking and frustration
3. The UI is functional but lacks the "juice" that makes games feel alive
4. Analytics data exists but isn't being systematically used to improve the game
5. The end-of-session experience is abrupt — no comeback hooks

---

## Feature Areas

### 1. Image Quality Pipeline

**Problem:** The 2,621 observations in the general pool have no image quality vetting. Players lose streaks to blurry, obscure, or misleading photos. The daily challenge pipeline has robust vetting (resolution checks, entropy-based cropping, manual review), but none of this applies to the main game.

**Goal:** Ensure every image served in classic/time trial/streak modes is fair and identifiable.

#### 1A. Data-Driven Flagging (Quick Win)

Use existing `round_complete` event data from Google Sheets to identify problem images:

- **Miss rate per observation**: `wrong_count / total_attempts` — flag observations with >70% miss rate
- **Confusion density**: If an observation frequently appears in top confusion pairs (correct species X always guessed as species Y), the image may be misleading
- **Time anomaly**: If average time-to-answer is >2x the mode median, the image may be ambiguous
- **Bad photo reports**: Already tracked via `bad_photo` events — cross-reference with miss rate

**Output:** A ranked list of the worst 50-100 observations, flagged for manual review.

**Scoring formula:**
```
quality_score = (miss_rate * 0.4) + (confusion_density * 0.3) + (time_anomaly * 0.2) + (bad_reports * 0.1)
Flag for review if quality_score > 0.6
```

#### 1B. Automated Image Quality Checks

Add pre-flight checks to `fetch-data.mjs` for all observations:

- **Resolution minimum**: Reject photos where the short side is <800px (daily uses 1200px, but the main game shows smaller images so 800px is sufficient)
- **Aspect ratio**: Prefer landscape/square; flag extreme portrait shots
- **Photo count**: Prefer observations with multiple photos (fallback options)

#### 1C. Review Server for General Pool

Extend `review-server.mjs` to support batch review of non-daily observations:

- **Batch mode**: Load 20-50 observations at a time (not all 2,621 at once)
- **Quick actions**: Approve / Reject / Flag for replacement
- **Priority sorting**: Show data-flagged observations first (from 1A)
- **Status tracking**: Save review state to a `reviewed-observations.json` manifest
- **Progressive rollout**: Review the worst 100 first, then expand

**Feasibility note:** Reviewing all 2,621 images manually is ~4-6 hours of work. Prioritizing via data (1A) means you review the worst 100 first, which takes ~30 minutes and captures most player-facing issues.

#### 1D. Community Flagging

The "Report photo" button already exists and logs `bad_photo` events. Enhance it:

- Show a brief reason selector (blurry, wrong species, can't see bug, offensive)
- Auto-flag observations that get 3+ reports for admin review
- Surface flagged images in the review server dashboard

---

### 2. Difficulty System

**Problem:** Half of play sessions are Bugs 101, which needs to be competitive without being impossible for untrained players. The current difficulty is random — a new player might get an easy round followed by an impossible one.

**Goal:** Create a smooth difficulty curve that rewards learning and keeps both beginners and experts engaged.

#### 2A. Observation Difficulty Scoring

Score every observation using historical player data:

```
difficulty = weighted_average(
  miss_rate_bugs101 * 0.3,      # How often Bugs 101 players get it wrong
  miss_rate_allbugs * 0.3,       # How often All Bugs players get it wrong
  avg_time_to_answer * 0.2,      # Longer = harder to identify
  visual_ambiguity * 0.2         # How often it's confused with other species
)
```

Bucket into tiers: **Easy** (0-0.3), **Medium** (0.3-0.6), **Hard** (0.6-1.0).

This scoring should be recalculated weekly as more data comes in.

#### 2B. Adaptive Session Difficulty

Instead of random observation selection, structure sessions with a difficulty curve:

- **Rounds 1-3**: Draw from Easy pool (warm-up, build confidence)
- **Rounds 4-7**: Draw from Medium pool (challenge)
- **Rounds 8-10**: Draw from Hard pool (climax)

For Bugs 101 specifically:
- Easy = visually distinct bugs (ladybug, monarch butterfly, garden spider)
- Hard = visually similar bugs within the same broad category (different moths, similar beetles)

#### 2C. Difficulty-Based Sets

Add explicit difficulty tiers as selectable options on the home page:

- **Bugs 101 Easy**: Common, visually distinct bugs — for first-timers
- **Bugs 101 Challenge**: Visually similar bugs within categories — for returning players
- **All Bugs Easy/Medium/Hard**: Tiered by historical miss rate

**Alternative approach:** Instead of separate sets, add a difficulty toggle (Easy/Medium/Hard) that filters the existing observation pool. This avoids set proliferation and keeps the UI clean.

#### 2D. Distractor Difficulty Tuning

The distractor engine already controls taxonomic distance (same genus = hardest). Tie this to the difficulty system:

- **Easy mode**: Distractors always from different orders (visually distinct)
- **Medium mode**: Distractors from same order but different families
- **Hard mode**: Distractors from same family or genus (current "All Bugs" behavior)

---

### 3. UI Polish & Onboarding

**Problem:** The UI is functional but doesn't feel premium. The bengaluru.rent reference shows how a clean onboarding flow with well-timed popups creates trust and engagement without being annoying.

**Goal:** Clean up the visual design and add an onboarding/nudge system inspired by bengaluru.rent.

#### 3A. Onboarding Popup Sequence

Implement a sequential modal flow for first-time visitors (bengaluru.rent pattern):

**Modal 1 — Welcome (first visit only)**
```
What's That Bug?

See a bug. Guess its name. Learn something new.

2,600+ research-grade photos from iNaturalist.
No login. No tracking. Just bugs.

[Let's play ->]
```

**Modal 2 — How It Works (first visit only)**
```
How scoring works

Exact species: 100 pts
Same genus: 75 pts
Same family: 50 pts
Same order: 25 pts

New here? Start with Bugs 101 — it's easier.

[Got it ->]
```

**Modal 3 — Support Nudge (shown once, after 3+ sessions)**
```
[coffee emoji]
Built for fun. Runs on caffeine.

If you're enjoying the game, consider buying me a coffee.
It keeps the bugs coming.

[Buy me a coffee ->] (links to Ko-fi/GitHub Sponsors)
[Maybe later]
[Skip]
```

**Implementation pattern (from bengaluru.rent):**
- Chain modals with `setTimeout(openNext, 360)` after CSS fade-out (340ms)
- Use `localStorage` flags: `wtb_seen_welcome`, `wtb_seen_scoring`, `wtb_nudged`
- z-index layering: onboarding modals at 200, game modals at 100
- Backdrop: `rgba(0,0,0,0.65)` with `backdrop-filter: blur(4px)`
- Non-blocking: game content loads behind modals
- Bottom-sheet on mobile (`align-items: flex-end`), centered on desktop

#### 3B. CSS Cleanup

Apply bengaluru.rent's design principles:

- **Consistent spacing**: Adopt an 8px grid (8, 12, 16, 24, 32px)
- **Border strategy**: `1px solid rgba(255,255,255,0.08)` for subtle dividers, `border-left: 3px solid accent` for callouts
- **Color opacity over hex**: Use `rgba(255,255,255, X%)` for dark theme elements
- **Accent color layering**: Background at 8% opacity, border at 20%, text at full
- **Glassmorphism (restrained)**: Only for floating elements (toasts, banners), not every card
- **Typography tightening**: Reduce font size variance, consistent weight hierarchy
- **Border radius**: Standardize to 12px for cards, 8px for buttons, 20px for pills

#### 3C. Leaderboard Check UX Fix

**Current problem:** `handleLeaderboardCheck()` has no timeout. If Google Apps Script is slow (cold start, network), users stare at "Checking leaderboard..." indefinitely.

**Fix:**
- Add a 3-second timeout with `Promise.race()`
- Show progressive messages: "Checking leaderboard..." -> "Almost there..." (at 2s)
- On timeout: skip leaderboard, show results immediately with "Couldn't reach leaderboard" note
- **Background fetch**: Start the leaderboard check at round 8 (not after round 10), so data is likely ready by session end
- Cache leaderboard data for 5 minutes in sessionStorage to avoid redundant fetches

#### 3D. Modal/Popup System Overhaul

Standardize all modals to follow the bengaluru.rent card-in-backdrop pattern:

```html
<div class="modal-backdrop" onclick="close()">
  <div class="modal-card" onclick="event.stopPropagation()">
    <!-- content -->
  </div>
</div>
```

- Consistent enter/exit animations (fade + translateY 16px, 340ms)
- Mobile: bottom-sheet positioning
- Desktop: center positioning
- Dismiss on backdrop click
- Keyboard: Escape to close

---

### 4. Engagement & Retention ("Make It Exciting")

**Problem:** The game lacks the psychological reward loops that keep players returning. No progression, no celebrations, no "one more round" hooks. Compare to Duolingo (streaks, XP, leagues), Wordle (daily ritual, share grid), or any mobile game (sound design, animations, achievements).

**Goal:** Add the "juice" layer — sounds, animations, progression, and comeback hooks.

#### 4A. Sound Design

Expand beyond the single correct-answer ding:

| Event | Sound | Character |
|-------|-------|-----------|
| Correct answer | Ascending chime (current ding, refined) | Bright, satisfying |
| Wrong answer | Soft descending tone (not punishing) | Gentle "nope" |
| Perfect score (100pts) | Sparkle/flourish | Celebration |
| Streak milestone (5, 10, 15...) | Cumulative chime (pitch rises with streak) | Building excitement |
| Timer warning (10s left) | Subtle tick acceleration | Urgency |
| Timer expired | Soft gong | Finality |
| Session complete | Fanfare (short, 1-2s) | Achievement |
| New personal best | Extended fanfare + sparkle | Big moment |
| Top 10 leaderboard | Victory theme (2-3s) | Peak celebration |
| Daily challenge correct | Reveal flourish | Discovery |
| UI interactions | Subtle clicks on button press | Tactile feedback |

**Implementation:** Web Audio API (already used for the ding). Create a `sounds.js` module with synthesized sounds — no audio file downloads needed. Add a mute toggle in settings (persist to localStorage).

**Design principle:** Sounds should be *synthesized* (not sampled) so they load instantly and feel native to the game. Keep them short (50-300ms for UI, up to 2s for celebrations).

#### 4B. Micro-Animations & "Juice"

Add visual feedback to every meaningful interaction:

**Between rounds:**
- Image crossfade transition (300ms) instead of instant swap
- Choice buttons stagger-in (50ms delay per button)
- Score counter animates up (tween from old total to new)

**On answer:**
- Correct: Green pulse on image border, "+100 pts" floats up and fades (already exists in time trial — extend to all modes)
- Wrong: Subtle red shake (CSS `translateX(±4px)` for 300ms), show correct answer highlighted
- Streak counter: Animate increment with scale bounce (1.0 -> 1.3 -> 1.0, 200ms)

**Session end:**
- Emoji grid builds one square at a time (100ms stagger per square)
- Stats counter up from 0 (score, accuracy, streak — 500ms tween each)
- If new personal best: confetti burst + "New PB!" badge pulse

**Daily challenge:**
- Crop reveal: Smooth zoom-out transition (not instant swap)
- Guess feedback: Tile flip animation (like Wordle)
- Streak fire emoji gets larger with streak length

#### 4C. In-Session Progress & Feedback

Show players how they're doing *during* the session, not just at the end:

- **Progress bar**: Visual bar at top showing rounds completed (10 segments for classic)
- **Running streak indicator**: "Streak: 5" shown prominently during classic mode (currently hidden until end)
- **Score pace indicator**: Subtle "On pace for 850/1000" or star rating that updates each round
- **"You beat X% of players" context**: After each round, briefly flash if the player scored above average on that observation

#### 4D. Comeback Hooks

Give players reasons to return:

- **"Your streak is at risk"**: On the daily challenge landing, if player has a 3+ day streak and hasn't played today, show urgency messaging
- **Personal stats summary**: "This week: 5 sessions, 3,200 total pts, best streak 12" — shown on home page
- **"Play of the day"**: After session, highlight the hardest bug the player got right ("Only 23% of players identified this one!")
- **Post-session recommendation**: "You scored 900/1000 on Bugs 101. Ready for All Bugs?" or "Try the Beetle set next"
- **Milestone celebrations**: "You've identified 100 unique species!" tracked in localStorage

#### 4E. Achievement System (Future)

A badge/achievement system for long-term engagement:

| Achievement | Criteria | Rarity |
|-------------|----------|--------|
| First Flight | Complete your first session | Common |
| Bug Scholar | Score 800+ in classic mode | Uncommon |
| Speed Demon | Score 500+ in time trial | Uncommon |
| Unbreakable | 15+ streak in streak mode | Rare |
| Daily Devotee | 7-day daily play streak | Rare |
| Perfect Round | 1000/1000 in classic | Very Rare |
| Century Club | Identify 100 unique species | Rare |
| Order Expert | Score 90%+ on a themed set | Uncommon |
| Bug Whisperer | 30-day daily play streak | Epic |
| Entomologist | Identify 500 unique species | Legendary |

**Implementation:** localStorage-based tracking. Show earned badges on home page and in share cards. No server needed.

#### 4F. Session Feedback Form Gap

Currently, only classic mode shows the post-session feedback form. Time trial and streak modes skip it entirely.

**Fix:** Add the feedback form to all modes. This recovers qualitative data from ~50% of sessions that currently go untracked.

---

### 5. Analytics Centralization

**Problem:** Data exists in Google Sheets (game events) and Umami (pageviews/sessions), but they're analyzed separately. The `analytics/dump.py` dashboard is a good start but needs to become the single source of truth.

**Goal:** A unified analytics pipeline that surfaces actionable insights automatically.

#### 5A. Unified Dashboard

Merge `scripts/analyze-feedback.py` and `analytics/dump.py` into one pipeline:

- **Input**: Google Sheets export (game events) + Umami API (pageviews, sessions, referrers)
- **Output**: Single `dashboard.html` with all tabs:
  - **Traffic**: Pageviews, unique visitors, referrers, device split (from Umami)
  - **Funnel**: Visit -> Play -> Complete -> Share conversion (merged Umami + Sheets)
  - **Game performance**: Scores, completion rates, mode popularity, set popularity
  - **Image quality**: Worst observations by miss rate, bad photo reports, confusion pairs
  - **Daily challenge**: Participation, solve rates, streak distributions
  - **Leaderboard**: Submission rates, score distributions, geographic spread
  - **Player feedback**: Difficulty ratings, free text, play-again intent

#### 5B. Automated Insights

Add an "insights" section that flags anomalies and trends:

- **Traffic spikes**: "Reddit referrals up 300% today" (from Umami)
- **Drop-off alerts**: "Round 7 drop-off rate increased 15% this week"
- **Image flags**: "Observation #148203 has 100% miss rate across 5 attempts — review needed"
- **Mode trends**: "Time trial sessions up 40% since last week"
- **Feedback themes**: Group free-text feedback by keyword (difficulty, images, bugs, UI)

#### 5C. Weekly Report Script

A script that runs weekly (cron or manual) and outputs a summary:

```
What's That Bug — Weekly Report (Mar 31 - Apr 6)

Sessions: 1,247 (+12% vs prev week)
Completion rate: 68% (stable)
Share rate: 14% (+3%)
Daily challenge: 89 unique players, avg solve in 2.1 guesses

Top issues:
- 3 new bad_photo reports (obs #123, #456, #789)
- Beetles set has 45% drop-off at round 5 (investigate difficulty)
- "too hard" feedback spiked on Apr 3 (check what set was trending)

Action items:
- Review flagged observations
- Consider adding easier beetles to the pool
```

#### 5D. Finish Umami Integration

The `.env` in `analytics/` has empty Umami credentials. Fill these in to enable the Umami data pipeline in `dump.py`.

---

### 6. Smaller Improvements

#### 6A. Share Card Enhancement

- Add observation count milestone to share text: "I've identified 47 species so far!"
- Add difficulty context: "Scored 900 on Hard mode"
- Consider adding a visual share card (canvas-rendered image) for platforms that preview images

#### 6B. First-Time Experience

- Default new players to Bugs 101 with a gentle prompt
- Show scoring rules *before* first game (not just as a popup during game)
- Add a "practice round" that doesn't count toward stats

#### 6C. Leaderboard Improvements

- Link to `/leaderboard` from session summary screen
- Add "Your rank: #42 of 1,200 players" context (not just top 10)
- Consider weekly/monthly leaderboards alongside all-time (prevents stale boards)

---

## Implementation Priority

### Phase 1 — Quick Wins (1-2 days each)

| # | Feature | Impact | Effort | Section |
|---|---------|--------|--------|---------|
| 1 | Leaderboard check timeout + background prefetch | High | Low | 3C |
| 2 | Data-driven image flagging script | High | Low | 1A |
| 3 | Sound effects (correct/wrong/streak/session end) | High | Medium | 4A |
| 4 | Onboarding popup sequence | Medium | Medium | 3A |
| 5 | Add feedback form to time trial + streak modes | Medium | Low | 4F |

### Phase 2 — Core Engagement (3-5 days each)

| # | Feature | Impact | Effort | Section |
|---|---------|--------|--------|---------|
| 6 | Observation difficulty scoring | High | Medium | 2A |
| 7 | Micro-animations (score tween, emoji stagger, transitions) | High | Medium | 4B |
| 8 | In-session progress indicators | Medium | Low | 4C |
| 9 | Comeback hooks (streak warnings, post-session recommendations) | Medium | Medium | 4D |
| 10 | CSS cleanup (spacing, borders, typography) | Medium | Medium | 3B |

### Phase 3 — Infrastructure & Depth (1 week+)

| # | Feature | Impact | Effort | Section |
|---|---------|--------|--------|---------|
| 11 | Review server for general pool | High | High | 1C |
| 12 | Adaptive session difficulty | High | Medium | 2B |
| 13 | Unified analytics dashboard | Medium | Medium | 5A |
| 14 | Achievement badge system | Medium | High | 4E |
| 15 | Modal/popup system overhaul | Medium | Medium | 3D |

### Phase 4 — Future

| # | Feature | Impact | Effort | Section |
|---|---------|--------|--------|---------|
| 16 | Weekly automated insights report | Low | Medium | 5C |
| 17 | Difficulty-based sets / toggle | Medium | Medium | 2C |
| 18 | Community flagging enhancements | Low | Low | 1D |
| 19 | Visual share cards (canvas-rendered) | Low | Medium | 6A |
| 20 | Weekly/monthly leaderboards | Medium | Medium | 6C |

---

## Risks & Tradeoffs

### Over-gamification
Adding too many progression systems (XP, levels, badges, streaks, achievements) can make the game feel like a chore rather than fun. **Mitigation:** Start with sounds + animations (emotional reward) before adding tracking systems (extrinsic reward). Let player feedback guide how far to go.

### Difficulty scoring cold start
New observations have no play data, so difficulty scores default to "Medium." **Mitigation:** Use taxonomic features as a prior (same-genus distractors = harder) until enough play data accumulates.

### Image review burden
Even with data-driven prioritization, manually reviewing 100+ images takes time. **Mitigation:** Batch review in sessions of 20-30. The review server already supports this workflow. Focus on the worst offenders first — diminishing returns beyond the top 100.

### Sound fatigue
Players who play many sessions may find sounds annoying. **Mitigation:** Mute toggle (persistent), keep sounds short (<300ms for UI, <2s for celebrations), use subtle tones not aggressive effects.

### Analytics complexity
Merging Umami + Google Sheets into one pipeline adds maintenance burden. **Mitigation:** Keep it as a local script (not a deployed service). Run manually or weekly via cron. The dashboard is a static HTML file — no server needed.

### Modal fatigue (onboarding)
Too many popups on first visit can drive players away. **Mitigation:** Follow bengaluru.rent's principle: max 2-3 modals on first visit, each dismissible in one click, well-timed transitions (360ms gaps). Support nudge shown only after 3+ sessions, never repeated.

### localStorage limitations
Achievement tracking, personal bests, and difficulty scores all use localStorage. This means progress is lost if the player clears browser data or switches devices. **Mitigation:** Acceptable for now (no auth system). If/when user accounts are added, migrate localStorage state to a server.

---

## Success Metrics

| Metric | Current (est.) | Target | How to Measure |
|--------|---------------|--------|----------------|
| Session completion rate | ~68% | 80% | Google Sheets funnel |
| Share rate | ~14% | 25% | Google Sheets session_end events |
| Return rate (play 2+ sessions) | Unknown | 40% | Umami returning visitors |
| Daily challenge participation | ~89/day | 200/day | Daily event counts |
| Daily play streak (avg) | Unknown | 5 days | localStorage stats + daily events |
| Bad photo reports | ~3/week | <1/week | bad_photo events |
| "Too hard" feedback rate | Unknown | <15% | Round reaction events |
| Average session duration | Unknown | 4+ minutes | Umami session duration |

---

## Open Questions

1. **Auth / accounts**: Should we add optional user accounts (Google sign-in) to persist progress across devices? This would unlock cross-device streaks and server-side leaderboards but adds significant complexity.
2. **Notifications**: Web push notifications for daily challenge reminders? High impact for retention but requires service worker + opt-in flow.
3. **Seasonal events**: Themed tournaments (e.g., "Spider Week", "Moth March") with limited-time leaderboards? High effort but creates urgency and shareability.
4. **Social features**: Friend leaderboards, head-to-head challenges, or shared lobbies? Major undertaking but could be the biggest retention driver.
5. **Monetization timing**: When does the "buy me a coffee" nudge become something more structured (premium sets, ad-free mode, supporter badge)?
