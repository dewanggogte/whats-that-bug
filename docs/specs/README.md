# Phase 2+3 Consolidated Feature Specs

These specs consolidate PRD v2 Phase 2 (Core Engagement) and Phase 3 (Infrastructure & Depth) into 5 parallel workstreams, grouped by file ownership to minimize merge conflicts.

## Specs

| # | Spec | PRD Features Merged | Primary Files Owned |
|---|------|---------------------|---------------------|
| 1 | [CSS Design System & Animation Library](01-css-design-system.md) | #10 CSS cleanup, #15 Modal overhaul, #7 animation keyframes | `global.css` |
| 2 | [Difficulty Engine & Adaptive Play](02-difficulty-engine.md) | #6 Difficulty scoring, #12 Adaptive sessions | `game-engine.js`, new scripts/data |
| 3 | [Game UI Enhancements](03-game-ui-enhancements.md) | #7 Animation triggers, #8 Progress indicators, #9 Post-session hooks | `game-ui.js` |
| 4 | [Achievement & Homepage System](04-achievements-homepage.md) | #14 Achievements, #9 Homepage comeback hooks | new `achievements.js`, `index.astro` |
| 5 | [Backend Tooling](05-backend-tooling.md) | #11 Review server, #13 Unified analytics | `scripts/`, `analytics/` |

## Dependency Graph

```
Spec 1 (CSS) ───────────┐
                         ├──→ Spec 3 (Game UI) ← merge point
Spec 4 (Achievements) ──┘

Spec 2 (Difficulty Engine) ── independent
Spec 5 (Backend Tooling)  ── independent
```

### What "independent" means in practice

- **Specs 2 and 5** have zero file overlap with any other spec. They can run at any time, in any order, with no coordination.
- **Specs 1 and 4** are independent of each other and can run in parallel. They each produce **contracts** (CSS class names and JS function signatures) that Spec 3 consumes.
- **Spec 3** is the integration point. It depends on the contracts from Specs 1 and 4, but NOT on their completion. The contracts are defined upfront in each spec, so Spec 3 can run in parallel — it just references the agreed-upon class names and function signatures.

### Merge order

All 5 specs can run simultaneously. When merging branches back to the feature branch:

1. Merge **Spec 1** first (CSS foundation — no conflicts possible)
2. Merge **Spec 4** next (new file `achievements.js` + `index.astro` — no conflicts with Spec 1)
3. Merge **Spec 2** next (new files + `game-engine.js` — no conflicts with 1 or 4)
4. Merge **Spec 5** next (backend files only — no conflicts with anything)
5. Merge **Spec 3** last (`game-ui.js` — imports from Spec 4's `achievements.js`, uses Spec 1's CSS classes)

If Spec 3 finishes before Specs 1/4, its code will still work — it references CSS classes and JS imports that will exist once the other branches merge. The only failure mode is if a contract changes, which is why contracts are frozen upfront.

### Build safety

The Astro/Vite build follows the import graph from `.astro` pages. A static `import` of a file that doesn't exist will **break the build**. To prevent this:

- **Spec 3** uses `import('./achievements.js').catch()` (dynamic) — Vite treats this as an optional async chunk. If the file doesn't exist at build time, the `.catch()` fires at runtime. No build error.
- **Spec 4** uses `await import('../scripts/achievements.js')` inside a `try/catch` in `index.astro` — same principle.
- **Spec 2** adds an optional `difficulty` param to `SessionState`. Spec 3 adds a `fetch('difficulty.json').catch()`. If the JSON doesn't exist, the fetch 404s at runtime and difficulty falls back to `null`. No build error.
- **Spec 1** only adds CSS classes. Missing CSS classes = no visual effect, never a build or runtime error.
- **Spec 5** touches only `scripts/` and `analytics/` (Node.js CLI tools), which are never part of the Astro build.

**Every spec builds and runs in isolation.** Any merge order produces a working build.

## Contracts

Contracts are the shared interfaces between specs. They are duplicated in each spec that produces or consumes them, so every session has the full picture without reading other specs.

### Contract A: CSS Classes (Spec 1 produces, Spec 3 consumes)

```
Animation classes:
  .anim-fade-in          — opacity 0→1, 300ms ease-out
  .anim-slide-up         — translateY(16px)→0 + fade, 340ms ease-out
  .anim-scale-bounce     — scale 1→1.3→1, 200ms ease-out
  .anim-shake            — translateX ±4px, 300ms
  .anim-float-up         — translateY(0)→(-20px) + fade out, 600ms

Progress bar:
  .session-progress          — container
  .session-progress-segment  — individual segment
  .session-progress-segment.filled        — completed (green)
  .session-progress-segment.filled-close  — partial score (yellow)
  .session-progress-segment.filled-miss   — missed (red)

Stagger delay:
  .stagger-in            — applies --stagger-delay for child animations
  .stagger-in > *:nth-child(N) — delay = N * 50ms

Emoji grid animation:
  .emoji-stagger .emoji-char        — individual emoji with stagger-in
  .emoji-stagger .emoji-char:nth-child(N) — delay = N * 100ms

Score counter:
  .score-counter-tween   — CSS transition on content change

Modal base (replaces .rules-overlay, .lb-popup-overlay, .onboarding-overlay):
  .modal-backdrop        — full-screen overlay with blur
  .modal-card            — centered card with enter/exit animations
  .modal-card--bottom    — bottom-sheet variant for mobile

Flash (existing, refined):
  .flash-correct         — green pulse on photo border
  .flash-wrong           — red pulse + subtle shake
```

### Contract B: Achievements API (Spec 4 produces, Spec 3 consumes)

```javascript
// src/scripts/achievements.js — exported functions

/** Check all achievements after a round. Call from handleAnswer(). */
export function checkRoundAchievements(session, roundResult) → Achievement[]

/** Check all achievements at session end. Call from render*Summary(). */
export function checkSessionAchievements(session, setKey) → Achievement[]

/** Render achievement toast HTML for display. */
export function renderAchievementToast(achievement) → string

/** Get all earned achievements for homepage display. */
export function getEarnedAchievements() → Achievement[]

/** Get count of unique species identified (for share cards / homepage). */
export function getSpeciesCount() → number

// Types
Achievement = { id: string, name: string, description: string, rarity: string, icon: string }
```

### Contract C: Difficulty Data (Spec 2 produces, internal to Spec 2)

```json
// public/data/difficulty.json — consumed by game-engine.js (both owned by Spec 2)
{
  "observation_id": {
    "difficulty": 0.0-1.0,
    "tier": "easy" | "medium" | "hard",
    "miss_rate": 0.0-1.0,
    "avg_time_ms": number,
    "sample_size": number
  }
}
```

This contract is internal to Spec 2. No other spec reads `difficulty.json` directly.
