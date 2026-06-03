# Design: Popup Tracking + Multiplayer Nudge & Walkthrough

**Date:** 2026-06-03
**Status:** Approved (pending implementation plan)

## Summary

Three related changes to the homepage/party experience:

1. **Full-funnel tracking** for all promotional popups (Calendly interview, Ko-fi support, and the new multiplayer nudge) via the existing `feedback.js` logging pipeline.
2. A **multiplayer nudge popup** that encourages returning solo players to invite friends, shown on the homepage and after a solo game ends.
3. A **collapsible walkthrough** on the `/party` landing explaining how to create a room, share the code, and play together.

These build on existing patterns: the `onboarding-overlay`/`onboarding-card` modal style, the `feedback.js` `enqueue()` pipeline, and the homepage popup chain in `index.astro`.

## Context

- The Calendly interview popup (`src/scripts/interview-prompt.js`) and Ko-fi support popup (`src/scripts/support-prompt.js`) are **already live** on the homepage, chained at `src/pages/index.astro:275`:
  ```js
  if (!maybeShowInterviewPrompt()) maybeShowSupportPrompt();
  ```
- Neither popup is tracked server-side today — impressions only touch `localStorage`, so there is no impression count in the Google Sheet.
- The logging pipeline (`src/scripts/feedback.js`) batches events via `enqueue()` and POSTs to a Google Apps Script webhook. It already exposes `logMultiplayerEvent()` and many `log*` functions.
- The `/party` landing (`src/pages/party/index.astro`) has Create/Join panels but no walkthrough. It is already instrumented with `mp_*` events.

## Decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Homepage popup strategy | One per visit, fixed priority order |
| Priority order | **Nudge → Interview → Support** |
| MP nudge surfaces | Homepage **and** post-game |
| Homepage nudge bar | `session_count ≥ 3` and `play_dates.length ≥ 2` |
| Tracking scope | Full funnel: impression + outcome (cta/dismiss/snooze) |
| Calendly conditions | Unchanged |
| Walkthrough form | Collapsible / first-visit (expanded first time, then a one-line bar) |
| Nudge copy/tone | Warm / social — "Bugs are better with friends" |

## Component 1: Full-funnel popup tracking

### New logging function (`feedback.js`)

```js
export function logPopupEvent(popup, action, extra = {}) {
  enqueue({ type: 'popup_event', popup, action, ...extra });
  if (action === 'cta' || action === 'dismiss') flush();
}
```

- `popup`: `'interview' | 'support' | 'mp_nudge'`
- `action`: `'impression' | 'cta' | 'dismiss' | 'snooze'`
- Flush immediately on `cta`/`dismiss` so terminal outcomes survive navigation (the unload beacon already covers `impression`/`snooze` if still queued).
- Naming follows the existing `type`-keyed event convention; `user_id`, `event_id`, `timestamp` are added by `enqueue()`.

### Wiring

**`interview-prompt.js`**
- `recordImpression()` → also `logPopupEvent('interview', 'impression')`.
- `close()` currently takes a single `done` boolean. Add an explicit action so the three outcomes are distinguishable:
  - Schedule/Email links (`.interview-primary`, `.interview-secondary`) → `cta`
  - "No thanks" (`.interview-dismiss`) → `dismiss`
  - ×, Esc, backdrop → `snooze`
- The existing `markDone()`/`snooze()` localStorage behavior is unchanged; we only add the log call mapped to the action.

**`support-prompt.js`**
- On modal create → `logPopupEvent('support', 'impression')`.
- `.support-cta` (Ko-fi click) → `cta`.
- `.support-dismiss` and ×/Esc/backdrop → `dismiss`/`snooze` respectively. (Current code treats all closes as `snooze`; we map the explicit dismiss button to `dismiss`, backdrop/Esc to `snooze`. localStorage snooze behavior unchanged.)

**`mp-nudge.js`** — same impression/cta/dismiss/snooze pattern (see Component 2).

### Not retroactive

Historical impressions were never sent and cannot be recovered. The count starts accumulating at deploy.

## Component 2: Multiplayer nudge (`src/scripts/mp-nudge.js`)

A new module mirroring `interview-prompt.js`/`support-prompt.js` structure. Warm/social copy, `onboarding-overlay`/`onboarding-card` markup, terracotta palette.

### Shared localStorage keys

```
wtb_mp_nudge_snoozed     // timestamp of last dismissal
wtb_mp_nudge_done        // '1' once actioned (clicked CTA or final dismiss)
wtb_mp_nudge_impressions // integer cap counter
wtb_mp_played            // '1' once the player has entered a party room
```

`wtb_mp_played` is set from the party room flow (when a player enters a room) so the nudge stops once they've actually tried multiplayer. Both entry points share these keys, so dismissing in one place quiets the other.

### Entry point A — homepage `maybeShowMpNudge()`

Eligible when **all** are true:
- `wtb_mp_nudge_done !== '1'`
- `wtb_mp_played !== '1'`
- `impressions < MAX_IMPRESSIONS` (cap = 2)
- `session_count ≥ 3`
- `play_dates.length ≥ 2`
- not snoozed, or snooze older than `SNOOZE_DAYS` (30)

Returns `true` when it claims the visit (so the homepage chain can stop). Shows after an ~800ms delay like the others. Logs `impression` on show.

### Entry point B — post-game `maybeShowMpNudgePostGame()`

Looser bar, its own snooze cadence so it doesn't nag every game:
- `wtb_mp_nudge_done !== '1'`, `wtb_mp_played !== '1'`
- `impressions < MAX_IMPRESSIONS` (shared cap = 2)
- `session_count ≥ 2`
- A separate post-game snooze (`SNOOZE_DAYS` = 7) so consecutive games don't re-prompt.

Hooked at the end of each summary render: `renderClassicSummary`, `renderTimeTrialSummary`, `renderStreakGameOver` in `game-ui.js`. (All three already call `renderRecommendation()`, confirming a shared post-game surface.)

### Card content (approved copy)

- Icon: 🎉
- Heading: **Bugs are better with friends**
- Body: "You've been playing solo for a while — why not race a friend? Create a private room, share a 4-letter code, and see who knows their bugs best."
- Primary CTA: **Start a room** → links to `/party` (logs `cta`, marks done)
- Dismiss: **Maybe later** (logs `dismiss`/`snooze`)

## Component 3: Homepage popup orchestration

Replace the two-line chain at `index.astro:275` with an ordered "first eligible wins" loop:

```js
import { maybeShowMpNudge } from '../scripts/mp-nudge.js';
import { maybeShowInterviewPrompt } from '../scripts/interview-prompt.js';
import { maybeShowSupportPrompt } from '../scripts/support-prompt.js';

for (const show of [maybeShowMpNudge, maybeShowInterviewPrompt, maybeShowSupportPrompt]) {
  if (show()) break;
}
```

`maybeShowSupportPrompt` currently returns `undefined`; update it to return a boolean (`true` when it shows, `false` otherwise) for consistency with the others.

## Component 4: Party walkthrough (collapsible / first-visit)

On the `/party` landing view (`party/index.astro`), add a 4-step "How multiplayer works" block above the Create/Join grid:

1. **Create** — Tap Create Room for a 4-char code
2. **Share** — Send the code or link to friends
3. **Join** — They enter the code & a name
4. **Play** — Everyone races the same bugs on a live leaderboard

Behavior:
- First visit: steps expanded.
- After first visit: collapsed to a one-line "How multiplayer works" toggle bar; clicking expands.
- State persisted in `localStorage` key `wtb_party_walkthrough_seen`.
- Lives in the landing view only; hidden once the room view is active (the existing `landingView.hidden` toggle handles this since the block sits inside `#party-landing-view`).

Implementation: static markup + a small toggle script in `party/index.astro`. Styling matches the existing `party-*` classes and terracotta palette.

## Data flow

```
Popup shown ──► logPopupEvent(popup,'impression') ──► enqueue ──► (batch) ──► webhook
User clicks CTA ──► logPopupEvent(popup,'cta') ──► enqueue + flush ──► webhook
User dismisses ──► logPopupEvent(popup,'dismiss'|'snooze') ──► enqueue + flush ──► webhook
```

The Google Sheet gains `popup_event` rows; reach = count of `action='impression'` per `popup`, click-through = `cta / impression`.

## Testing

- **Unit (`feedback.test.js` style):** `logPopupEvent` enqueues the correct shape and flushes on `cta`/`dismiss` but not `impression`/`snooze`.
- **mp-nudge eligibility:** unit tests for `shouldShow` homepage vs post-game given session/day counts, `wtb_mp_played`, caps, and snooze windows (mirrors how interview/support logic would be tested — pure functions over localStorage state).
- **Manual:** verify homepage chain order (nudge pre-empts interview pre-empts support), post-game nudge appears and respects its snooze, walkthrough collapses after first visit, and `popup_event` rows land in the sheet for each action.

## Risks & tradeoffs

- **Tracking is not retroactive** — the impression count only starts at deploy; past shows are unrecoverable.
- **Three homepage popups** — one-per-visit ordering prevents stacking, but an engaged player can still see nudge → interview → support across successive visits. No global cross-type cooldown (deliberately deferred); easy to add later if it feels naggy.
- **Post-game nudge is a 4th surface** competing with the existing "play next" recommendation on the summary screen — two CTAs post-game. Mitigated by the shared impression cap and a 7-day post-game snooze.
- **`wtb_mp_played` is per-browser** — a player who tried multiplayer on another device still gets nudged. Acceptable and consistent with the app's localStorage-based gating.
- **Alternatives considered:** global cooldown across all popups (rejected — more state, user preferred simple priority); always-visible walkthrough strip (rejected in favor of collapsible to keep the landing clean for repeat hosts); impressions-only tracking (rejected — full funnel is near-free and far more useful).

## Out of scope

- Backfilling historical popup impressions.
- A/B testing nudge copy.
- Server-side dedup of popup events beyond the existing `event_id` mechanism.
- Changes to Calendly/Ko-fi trigger conditions.
