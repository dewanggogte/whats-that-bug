# Spec 3: Game UI Enhancements

**PRD features merged:** #7 Micro-animations JS triggers (4B), #8 In-session progress indicators (4C), #9 Post-session comeback hooks (4D)

**Files owned (only this spec touches these):**
- Modify: `src/scripts/game-ui.js` (1,111 lines — the main game UI)

**Dependencies (contracts consumed — defined upfront, implementable in parallel):**
- **Contract A (from Spec 1):** CSS class names for animations, progress bar, and modals
- **Contract B (from Spec 4):** Achievement JS API from `achievements.js`
- **Contract C wiring (from Spec 2):** `difficulty.json` fetch + pass to SessionState

If Specs 1, 2, or 4 haven't merged yet, this spec's code still works — CSS classes degrade gracefully (no animation, but no errors), achievement imports can be guarded with `try/catch`, and difficulty data defaults to `null`.

---

## Context

`game-ui.js` is the largest JS file (1,111 lines). It handles:
- `initGame()` — data loading, session creation, initial render
- `renderRound()` — displays the bug photo and 4 choice buttons
- `handleAnswer()` — scores the answer, plays sounds, triggers post-answer flow
- Mode-specific post-answer handlers (`handleClassicPostAnswer`, `handleTimeTrialPostAnswer`, `handleStreakPostAnswer`)
- Summary screens (`renderClassicSummary`, `renderTimeTrialSummary`, `renderStreakGameOver`)
- Share and feedback form rendering

This spec adds 3 new capabilities layered onto the existing flow:
1. **Micro-animations** — visual polish on transitions, answers, and summaries
2. **Progress indicators** — in-session awareness of score pace and streak
3. **Post-session hooks** — recommendations and comeback messaging

---

## Part 1: Wire Difficulty Data (Spec 2 integration point)

In `initGame()` (line 132), add `difficulty.json` to the data fetches.

**Current code (line 138-140):**
```javascript
const [obsRes, taxRes, setsRes] = await Promise.all([
  fetch(`${base}/data/observations.json`),
  fetch(`${base}/data/taxonomy.json`),
  fetch(`${base}/data/sets.json`),
]);
```

**New code:**
```javascript
const [obsRes, taxRes, setsRes, diffRes] = await Promise.all([
  fetch(`${base}/data/observations.json`),
  fetch(`${base}/data/taxonomy.json`),
  fetch(`${base}/data/sets.json`),
  fetch(`${base}/data/difficulty.json`).catch(() => ({ ok: false })),
]);
```

After the existing parse block (line 147-151), add:
```javascript
const difficulty = diffRes.ok ? await diffRes.json().catch(() => null) : null;
```

Then update the SessionState constructor call (line 165):
```javascript
session = new SessionState(observations, taxonomy, setDef, currentSetKey, difficulty);
```

**If `difficulty.json` doesn't exist** (Spec 2 hasn't been run), the fetch 404s, `catch` returns `{ ok: false }`, difficulty is `null`, and SessionState falls back to random selection. No errors.

---

## Part 2: Micro-animations (PRD 4B)

These are JS-side triggers that add CSS animation classes from Contract A (Spec 1).

### 2A. Choice Button Stagger

In `renderRound()` (line 333), after the choices HTML is rendered, add the `stagger-in` class to the choices container:

**In the `container.innerHTML` template (around line 386):**
```html
<div class="choices stagger-in" id="choices">
```

This is a single class name addition to the existing `<div class="choices">`. The `.stagger-in` class (from Spec 1) will add 50ms delays to each child `.choice` element.

### 2B. Answer Flash Enhancement

In `handleClassicPostAnswer()` (line 573), the feedback card is currently inserted without animation. Add the `anim-slide-up` class:

**Current (line 612):**
```html
<div class="feedback-card ${feedbackClass}" style="margin-top: 16px;">
```

**New:**
```html
<div class="feedback-card ${feedbackClass} anim-slide-up" style="margin-top: 16px;">
```

### 2C. Score Popup Float Animation

The time trial score popup (line 515-518) already shows `+${score}` text. Add the float-up animation class:

**Current behavior:** The popup uses `.score-popup.visible` which has CSS positioning. After the popup is shown, it fades. Enhance it:

After line 518 (`popup.className = ...`), the popup already becomes visible. Add the float animation by setting:
```javascript
if (popup) {
  popup.textContent = `+${score}`;
  popup.className = `score-popup visible anim-float-up ${score === 0 ? 'miss' : ''}`;
}
```

### 2D. Streak Counter Bounce

In `handleStreakPostAnswer()` (line 548), when the streak count updates, add a bounce animation:

**After line 557 (`if (streakEl) streakEl.textContent = session.currentStreak;`):**
```javascript
if (streakEl) {
  streakEl.textContent = session.currentStreak;
  streakEl.classList.add('anim-scale-bounce');
  // Remove class after animation completes so it can replay next round
  setTimeout(() => streakEl.classList.remove('anim-scale-bounce'), 250);
}
```

### 2E. Wrong Answer Shake

In `handleAnswer()` (line 434), when a wrong answer is selected, the choice gets `.miss` class. Add a shake to the photo:

**After the highlight loop (line 468-482), add:**
```javascript
// Shake photo on wrong answer
if (score === 0) {
  const photoHero = container.querySelector('.photo-hero');
  if (photoHero) {
    photoHero.classList.add('anim-shake');
    setTimeout(() => photoHero.classList.remove('anim-shake'), 350);
  }
}
```

### 2F. Emoji Grid Stagger on Summary Screens

The summary screens render emoji grids as inline text. Convert them to use staggered animation.

**In `renderClassicSummary()` (line 754):**

Replace:
```javascript
<div class="emoji-grid">${session.history.map(h =>
  h.score === 100 ? '🟩' : h.score >= 50 ? '🟨' : '🟥'
).join('')}</div>
```

With:
```javascript
<div class="emoji-grid emoji-stagger">${session.history.map((h, i) => {
  const emoji = h.score === 100 ? '🟩' : h.score >= 50 ? '🟨' : '🟥';
  return `<span class="emoji-char" style="animation-delay:${i * 100}ms">${emoji}</span>`;
}).join('')}</div>
```

Apply the same pattern to:
- `renderTimeTrialSummary()` (line 788) — same structure
- `renderStreakGameOver()` (line 880) — same structure

### 2G. Score Counter Tween on Summary

In summary screens, the score number should animate up from 0. This is a JS tween, not CSS.

Add a helper function near the top of the file (after the `escapeHTML` function):

```javascript
/**
 * Animate a number from 0 to target over duration ms.
 * @param {HTMLElement} el — element whose textContent will be updated
 * @param {number} target — final number
 * @param {number} duration — animation duration in ms
 * @param {string} [suffix=''] — text appended after number (e.g., ' / 1000')
 */
function tweenCounter(el, target, duration = 500, suffix = '') {
  if (!el) return;
  const start = performance.now();
  function step(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    // Ease-out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(target * eased) + suffix;
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
```

In `renderClassicSummary()`, after `container.innerHTML = ...`, add:
```javascript
// Tween the score counter
const scoreEl = container.querySelector('.summary-score');
tweenCounter(scoreEl, session.totalScore, 600, ' / 1000');
```

Same for time trial (`renderTimeTrialSummary`) and streak (`renderStreakGameOver`) — adjust the suffix accordingly:
- Time trial: `tweenCounter(scoreEl, session.totalScore, 600, ' pts')`
- Streak: `tweenCounter(scoreEl, session.currentStreak, 400, '')`

---

## Part 3: In-Session Progress Indicators (PRD 4C)

### 3A. Progress Bar (Classic Mode)

Add a 10-segment progress bar below the top bar in classic mode. Each segment fills based on round results.

**In `renderRound()` (line 333):**

After the `topBarHTML` block, before the `container.innerHTML` template, add progress bar generation for classic mode:

```javascript
let progressHTML = '';
if (mode === 'classic') {
  const segments = [];
  for (let i = 0; i < 10; i++) {
    let cls = 'session-progress-segment';
    if (i < session.history.length) {
      const h = session.history[i];
      if (h.score === 100) cls += ' filled';
      else if (h.score >= 50) cls += ' filled-close';
      else cls += ' filled-miss';
    } else if (i === session.history.length) {
      cls += ' current';
    }
    segments.push(`<div class="${cls}"></div>`);
  }
  progressHTML = `<div class="session-progress">${segments.join('')}</div>`;
}
```

Then insert `${progressHTML}` in the `container.innerHTML` template, right after `${topBarHTML}`:

```html
<div class="container" id="game-screen">
  ${topBarHTML}
  ${progressHTML}
  <div class="photo-hero">
```

### 3B. Running Streak Indicator (Classic Mode)

Currently, the streak is only shown at session end. Show it live during the game.

**In the classic mode `topBarHTML` (line 361-368):**

Replace:
```javascript
topBarHTML = `
  <div class="top-bar">
    <a href="${base}/" style="text-decoration:none;color:var(--accent);">← Sets</a>
    <span>Round ${displayRound} of 10 · ${session.totalScore} pts</span>
    <span>${session.setDef.name}</span>
  </div>
`;
```

With:
```javascript
const streakDisplay = session.currentStreak > 1
  ? `<span class="top-bar-streak">${session.currentStreak} streak</span>`
  : '';
topBarHTML = `
  <div class="top-bar">
    <a href="${base}/" style="text-decoration:none;color:var(--accent);">← Sets</a>
    <span>Round ${displayRound} of 10 · ${session.totalScore} pts ${streakDisplay}</span>
    <span>${session.setDef.name}</span>
  </div>
`;
```

Add minimal inline style for `.top-bar-streak` or define in global.css via Spec 1. If using inline:
```html
<span style="color:var(--success);font-weight:600;font-size:0.85rem;margin-left:4px;">
```

---

## Part 4: Post-Session Comeback Hooks (PRD 4D)

### 4A. Post-Session Recommendation

After the summary screen, show a contextual recommendation to guide the player's next action.

Add a helper function:

```javascript
/**
 * Generate a recommendation message based on session performance.
 * Returns { text: string, link: string, linkText: string } or null.
 */
function getPostSessionRecommendation(totalScore, setKey, mode) {
  // Bugs 101 players who did well → suggest All Bugs
  if (setKey === 'bugs_101' && totalScore >= 800) {
    return {
      text: "You're crushing Bugs 101!",
      link: `${base}/play?set=all_bugs`,
      linkText: 'Try All Bugs →',
    };
  }

  // Classic players who did well → suggest time trial
  if (mode === 'classic' && totalScore >= 700 && !setKey.includes('time_trial')) {
    return {
      text: 'Nice score! Think you can do it under pressure?',
      link: `${base}/play?set=${setKey.replace('bugs_101', 'bugs_101_time_trial').replace('all_bugs', 'time_trial')}`,
      linkText: 'Try Time Trial →',
    };
  }

  // Streak players → encourage trying to beat their best
  if (mode === 'streak') {
    const bestKey = `best_${setKey}`;
    const best = parseInt(localStorage.getItem(bestKey) || '0', 10);
    if (best > 0) {
      return {
        text: `Your best streak: ${best}. Go again?`,
        link: null,
        linkText: null,
      };
    }
  }

  // All Bugs players who struggled → suggest themed sets
  if (setKey === 'all_bugs' && totalScore < 400) {
    return {
      text: 'Try a themed set to focus on one group.',
      link: `${base}/`,
      linkText: 'Browse sets →',
    };
  }

  return null;
}
```

### 4B. Render Recommendation in Summary Screens

In each summary render function, add a recommendation block after the play again / change set buttons.

**In `renderClassicSummary()`**, after the "Play Again / Change Set" button div (around line 762):

```javascript
const rec = getPostSessionRecommendation(session.totalScore, currentSetKey, session.mode);
const recHTML = rec ? `
  <div class="recommendation anim-fade-in" style="text-align:center;margin-top:16px;padding:12px;background:var(--surface);border:1px solid var(--border);border-radius:12px;">
    <p style="margin-bottom:8px;color:var(--text-secondary);">${escapeHTML(rec.text)}</p>
    ${rec.link ? `<a href="${escapeHTML(rec.link)}" class="btn btn-outline" style="font-size:0.9rem;">${escapeHTML(rec.linkText)}</a>` : ''}
  </div>
` : '';
```

Insert `${recHTML}` after the play-again buttons in the template.

Apply the same pattern to `renderTimeTrialSummary()` and `renderStreakGameOver()`.

### 4C. "Play of the Day" Highlight

After session end in classic mode, highlight the hardest bug the player got right.

Add a helper:

```javascript
/**
 * Find the "play of the day" — hardest observation the player got right.
 * Returns { observation_id, common_name, species, missRateText } or null.
 */
function getPlayOfTheDay(history) {
  // Without difficulty data, we can't determine which was "hardest" —
  // use a simple heuristic: the observation that took the longest to answer correctly
  const correctRounds = history.filter(h => h.score === 100);
  if (correctRounds.length === 0) return null;

  // We don't store time_taken in history entries, so pick the last correct answer
  // (later rounds are harder by default in adaptive mode)
  const pick = correctRounds[correctRounds.length - 1];
  return {
    common_name: pick.correct_taxon.common_name,
    species: pick.correct_taxon.species,
  };
}
```

In `renderClassicSummary()`, add after the emoji grid:

```javascript
const potd = getPlayOfTheDay(session.history);
const potdHTML = potd ? `
  <p class="anim-fade-in" style="font-size:0.85rem;color:var(--text-secondary);margin-top:8px;">
    Best ID: <strong>${escapeHTML(potd.common_name)}</strong> (<em>${escapeHTML(potd.species)}</em>)
  </p>
` : '';
```

Insert `${potdHTML}` after the emoji grid.

---

## Part 5: Achievement Integration (Contract B)

Import and call the achievement system from Spec 4. This is the bridge between the achievement logic (Spec 4) and the game flow (this spec).

### 5A. Import

At the top of `game-ui.js`, add:

```javascript
import { checkRoundAchievements, checkSessionAchievements, renderAchievementToast } from './achievements.js';
```

**Guard:** If `achievements.js` doesn't exist yet (Spec 4 hasn't merged), this import will cause a build error. To keep Spec 3 mergeable independently, use a dynamic import with fallback:

```javascript
// At the top of game-ui.js, after other imports:
let achievementsModule = null;
import('./achievements.js')
  .then(m => { achievementsModule = m; })
  .catch(() => { /* achievements.js not available yet — skip */ });
```

### 5B. Hook into handleAnswer()

After the sound effects block (line 492-494), add:

```javascript
// Check for achievements
if (achievementsModule) {
  const newAchievements = achievementsModule.checkRoundAchievements(session, { score, correct });
  for (const ach of newAchievements) {
    showAchievementToast(ach);
  }
}
```

### 5C. Hook into Summary Screens

In each `render*Summary()` function, after `container.innerHTML = ...`, add:

```javascript
// Check session-end achievements
if (achievementsModule) {
  const newAchievements = achievementsModule.checkSessionAchievements(session, currentSetKey);
  // Stagger toasts so they don't overlap
  newAchievements.forEach((ach, i) => {
    setTimeout(() => showAchievementToast(ach), i * 1500);
  });
}
```

### 5D. Toast Display Helper

```javascript
/**
 * Show an achievement toast notification.
 * Uses CSS classes from Contract A (.achievement-toast, etc.)
 * @param {{ id: string, name: string, description: string, icon: string }} achievement
 */
function showAchievementToast(achievement) {
  const toast = document.createElement('div');
  toast.className = 'achievement-toast';
  toast.innerHTML = `
    <span class="achievement-toast-icon">${achievement.icon}</span>
    <div class="achievement-toast-text">
      <span class="achievement-toast-name">${escapeHTML(achievement.name)}</span>
      <span class="achievement-toast-desc">${escapeHTML(achievement.description)}</span>
    </div>
  `;
  document.body.appendChild(toast);

  // Auto-dismiss after 3 seconds
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 500);
  }, 3000);
}
```

---

## Part 6: Species Counter for Share Cards (PRD 6A)

Track unique species identified in localStorage and include the count in share text.

### 6A. Track Species

In `handleAnswer()`, after logging the round (line 489), add:

```javascript
// Track unique species for milestone tracking
if (score === 100) {
  try {
    const seen = JSON.parse(localStorage.getItem('wtb_species_seen') || '[]');
    if (!seen.includes(correct.taxon.species)) {
      seen.push(correct.taxon.species);
      localStorage.setItem('wtb_species_seen', JSON.stringify(seen));
    }
  } catch { /* localStorage full or unavailable */ }
}
```

### 6B. Show in Share Text

In `renderClassicSummary()`, add the species count to the subtitle line:

```javascript
const speciesCount = (() => {
  try { return JSON.parse(localStorage.getItem('wtb_species_seen') || '[]').length; }
  catch { return 0; }
})();
const speciesLine = speciesCount > 10 ? `<p class="subtitle" style="font-size:0.8rem;">${speciesCount} species identified so far</p>` : '';
```

Insert `${speciesLine}` below the existing subtitle in the summary template.

---

## Implementation Order

Within this spec, implement in this order:

1. **Difficulty wiring** (Part 1) — 2-line change, gets it out of the way
2. **tweenCounter helper + emoji stagger** (Parts 2F, 2G) — foundation for summary animations
3. **Progress bar** (Part 3A) — new visual component, easy to test
4. **Choice stagger + answer animations** (Parts 2A-2E) — layered onto existing flow
5. **Post-session hooks** (Part 4) — new content blocks in summary screens
6. **Achievement integration** (Part 5) — dynamic import, graceful degradation
7. **Species counter** (Part 6) — small localStorage addition

---

## Testing

1. **Visual regression:** Play through a complete classic, time trial, and streak session. Verify all animations trigger at the right moments.
2. **No-dependency mode:** Delete/rename `difficulty.json` and `achievements.js`. Verify the game works without errors — all features should degrade gracefully.
3. **Progress bar:** Play a classic session and verify the bar fills correctly (green/yellow/red) and the current segment pulses.
4. **Score tween:** Verify the summary score counts up from 0 smoothly.
5. **Emoji stagger:** Verify emojis appear one at a time on summary screens.
6. **Recommendations:** Score 800+ on Bugs 101, verify "Try All Bugs →" appears. Score <400 on All Bugs, verify "Try a themed set" appears.
7. **Mobile:** Test on a 375px viewport to ensure progress bar, animations, and recommendations render correctly.

---

## Risks

- **`game-ui.js` is the largest file** — this spec makes many changes across it. Use careful line targeting and test frequently.
- **Animation performance:** The tweenCounter uses `requestAnimationFrame` which is lightweight. The CSS animations are hardware-accelerated (transform, opacity). No performance concerns expected.
- **Dynamic import for achievements:** The `import('./achievements.js').catch()` pattern means there's a brief window at page load where `achievementsModule` is null. This is fine — the first round takes several seconds of player interaction, so the import resolves well before any achievement check runs.
- **localStorage species tracking:** The `wtb_species_seen` array grows unboundedly. With 2,621 max species, the JSON is ~100KB worst case — well within localStorage limits (typically 5-10MB). No cleanup needed.
