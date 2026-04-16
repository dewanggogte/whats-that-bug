# UI Revamp — Design Spec

**Date:** 2026-04-17
**Status:** Approved
**Direction:** Evolution (A) — same warm palette, elevated with award-winning techniques

## Overview

Full visual refresh of What's That Bug to make it feel like a polished game, not a utility app. Staying on Astro, purely CSS + client-side JS changes. No structural changes to game mechanics or data.

## Design Decisions

### Direction Chosen

**Evolution (Direction A)** — keep the warm terracotta palette and light mode default, but inject personality through typography, tactile interactions, and attention to visual hierarchy. Inspired by Awwwards winners, Duolingo's tactile UI, and Wordle's emotional intelligence.

### Typography

- **Display font:** Fraunces (Google Fonts, variable, free) — warm optical serif with personality. Used for: game title, section headings, score numbers, question prompts, leaderboard scores.
- **UI font:** Inter (Google Fonts, variable, free) — clean sans-serif for body text, choice labels, metadata, navigation.
- **Loading:** `font-display: swap` via Google Fonts CSS import. Fraunces is ~60KB variable, Inter is ~90KB variable. Both served from Google Fonts CDN with caching.

### Color Palette

Preserving existing CSS custom properties with these refinements:

```css
/* Keep existing values for: */
--bg: #faf8f5;           /* slightly warmer than current #fdfcfb */
--surface: #ffffff;       /* white cards instead of #f5f3f0 */
--text: #2c2420;          /* slightly warmer brown */
--text-secondary: #9a8f85; /* warm gray */
--accent: #b85a3b;        /* terracotta — unchanged */
--border: #ece8e2;        /* warmer border */

/* Key change: wrong answers use warm gray, not red */
--error: #c4b5a8;         /* warm gray for wrong answers (was #dc2626) */
--error-bg: #f5f3f0;      /* warm neutral (was #fef2f2 pink) */
--error-border: #d4c8ba;  /* warm border (was #fca5a5 red) */

/* Success stays green */
--success: #059669;       /* unchanged */
```

**Rationale for gray-not-red:** Wordle research shows neutral tones for wrong answers keep the emotional stakes low and encourage continued play. Red triggers stress/failure associations.

### Shadows

All shadows use warm-tinted values instead of gray:

```css
/* Cards and elevated elements */
box-shadow: 0 2px 0 #e0d5c8;                        /* tactile bottom shadow */
box-shadow: 0 4px 12px rgba(184, 90, 59, 0.08);     /* ambient glow */

/* Daily challenge banner */
box-shadow: 0 6px 20px rgba(184, 90, 59, 0.25);     /* strong warm glow */

/* Buttons (Duolingo-style tactile) */
box-shadow: 0 3px 0 #8a3f28;                         /* terracotta bottom border */
/* On :active, translateY(3px) and box-shadow: 0 0 0 */
```

### Button Design (Duolingo-style Tactile)

All interactive buttons get the "press-down" effect:

```css
.btn {
  border-radius: 12px;              /* was 8px */
  box-shadow: 0 3px 0 var(--btn-shadow);  /* colored bottom edge */
  transition: transform 0.1s ease, box-shadow 0.1s ease;
}
.btn:active {
  transform: translateY(3px);
  box-shadow: 0 0 0 var(--btn-shadow);
}
```

- **Primary buttons:** terracotta background, `#8a3f28` shadow
- **Choice cards:** white background, `#e0d5c8` shadow (changes to green/gray on answer)
- **Secondary buttons:** white background with border, `#ece8e2` shadow
- **Share icon buttons:** 42x42px squares with 12px radius (not circles)

## Screen-by-Screen Changes

### 1. Homepage (`/`)

- Logo text in Fraunces bold, terracotta color
- Title "What's That Bug?" in Fraunces 800 weight, larger (26px mobile)
- Subtitle more action-oriented: "1,000+ species. How many can you name?"
- Daily Challenge banner: multi-stop gradient (`#c06a3b` to `#e0a070`) with radial light effect and warm glow shadow
- Mode cards: white background, tactile bottom shadow, Fraunces for card titles, difficulty badge pill
- Section headings: Fraunces 16px bold (replacing uppercase text labels)
- Compete cards: lighter tactile treatment with neutral shadow

### 2. Quiz Round (`/play`)

**Top bar:** Unchanged layout. Round counter, score, set name.

**Progress bar (new):** 10 horizontal segments replacing text-only round indicator.
- Green (`#059669`) = correct
- Warm gray (`#c4b5a8`) = wrong
- Pulsing terracotta = current round (CSS `@keyframes pulse`)
- Empty = future rounds

**Photo container:**
- `border-radius: 16px` (was rectangular)
- Bottom gradient overlay for credit text (`linear-gradient(to top, rgba(26,26,46,0.6), transparent)`)
- More whitespace around photo (12px horizontal margin)

**Question prompt:**
- "What's this bug?" in Fraunces 18px bold
- Location in secondary color below

**Choice cards (2x2 grid):**
- White background, 14px radius, 1.5px border
- 3px warm-tinted bottom shadow (press-down on tap)
- Name in Inter 700, latin in Inter italic secondary
- On answer:
  - Correct: green border + green shadow + checkmark prefix
  - Player's wrong pick: warm gray border + gray shadow + X prefix + reduced opacity
  - Other choices: opacity 0.4 (dimmed)

**View Transitions (between rounds):**
```javascript
document.startViewTransition(() => {
  renderNextRound();
});
```
CSS customization via `::view-transition-old()` and `::view-transition-new()` for cross-fade effect. Fallback: direct DOM swap (no visible degradation for unsupported browsers).

### 3. Answer Reveal (post-answer feedback card)

**Correct answer:**
- Card: green-tinted background (`#f0fdf4`), green border
- Title: "Nailed it!" in Fraunces 16px bold, green
- Species info: name bold, scientific italic, Wikipedia blurb
- Score badge: green pill (`+100 pts`)
- "Learn more" link in terracotta

**Wrong answer:**
- Card: warm neutral background (`#faf8f5`), warm gray border (`#e0d5c8`)
- Title: "Not quite" in Fraunces 16px bold, warm gray
- Breadcrumb: "You guessed X, but this is Y"
- Score badge: warm gray pill (`+0 pts`)

**Difficulty reactions:** Keep existing "Too Easy / Just Right / Too Hard" buttons, restyle with tactile treatment.

**Next button:** Full-width terracotta with Duolingo press effect. "Next Round" or "See Results".

### 4. Results Screen (end of session)

**Layout (top to bottom):**
1. Set name in small uppercase Fraunces (secondary color)
2. Score in Fraunces 48px 900-weight, terracotta, with tween counter animation (existing)
3. "out of 1,000" subtitle
4. Round indicator dots: 28x28px squares with 8px radius. Green checkmark or warm gray X. Replaces raw emoji grid.
5. Stats row: 3 white cards (Correct, Best Streak, Accuracy) with Fraunces numbers
6. "Play of the Day" card: terracotta-tinted background, trophy icon, species name. Elevated from current inline text.
7. Share section (see below)
8. Action buttons: "Play Again" (primary) + "Change Set" (secondary outline), side by side
9. Recommendation card (existing, restyled)
10. Session feedback form (existing, restyled with tactile buttons)

**Time Trial results:** Same structure but stats show: Correct/Total, Accuracy, Avg pts/bug, Pts/second. Speed bracket pills preserved, restyled.

**Streak results:** Same structure but score is the streak count. Rank badge (Keep Trying / Getting Good / Sharp Eye / Expert / Legendary) in a styled pill.

### 5. Share Section

Contained in a white card with border and rounded corners:

1. **Flavor text** in Fraunces 16px bold — "Bug expert! Can your friends beat 750?"
2. **Hero CTA** — full-width terracotta button with share icon: "Challenge a Friend". Triggers native share on mobile, clipboard copy on desktop.
3. **Social icons row** — 4 square buttons (42x42, 12px radius):
   - WhatsApp, iMessage, X/Twitter, Copy
   - Tactile shadow treatment
   - Visual feedback on tap (checkmark for copy)

**Share text format** — unchanged. The existing emoji grid + score + URL format works well for social sharing. No changes to the text generation logic.

### 6. Leaderboard (`/leaderboard`)

**Header:** "Leaderboard" in Fraunces 20px bold. Countdown smaller, secondary, below title.

**Tab control:** iOS-style segmented control — gray track (`#ece8e2`, 10px radius, 3px padding), active tab is white card with subtle shadow.

**Table rows:**
- Alternating subtle background (every other row)
- Rank: Fraunces bold. Medal emoji for top 3, serif numbers for 4+
- Flag emoji + name: Inter 600
- Score: Fraunces 700, terracotta

**"You" row highlight:** Terracotta-tinted background (`rgba(184,90,59,0.08)`) with terracotta border. Name and rank in terracotta.

**Yesterday's champion:** Preserved, restyled with card treatment.

### 7. Daily Challenge (`/daily/play`)

Apply the same visual language:
- Fraunces for headings and score numbers
- Tactile submit button
- Photo with rounded corners and gradient overlay
- Autocomplete dropdown with warm styling
- History strip: round crop thumbnails with warm gray border (wrong) or no border (pending)
- Reveal screen: same card-based layout as classic results

### 8. Base Layout (`Base.astro`)

**Header:**
- Logo: Fraunces bold, terracotta color (not emoji + system font)
- Nav links: Inter 500, secondary color
- Sound/theme toggles: keep existing, slight radius increase

**Footer:** Unchanged structure, warm styling.

**Modals (stats, species, badges):** Apply white card treatment, Fraunces for titles.

## Animations

### Preserved (existing)
- Score tween counter (`tweenCounter()`)
- Emoji stagger animation
- Achievement toast slide-in
- Milestone celebrations (pulse, banner flash)
- Photo shake on wrong answer

### New
- **View Transitions API** for round-to-round changes. Feature-detected with fallback.
- **Button press-down** — CSS transform + shadow change on `:active` (0.1s ease)
- **Choice hover** — subtle `translateY(-2px)` lift on desktop hover
- **Progress segment pulse** — CSS keyframes on current round segment
- **Confetti on perfect score** — `canvas-confetti` library (~6KB gzipped) triggered when score = 1000. Particle count: 80, spread: 70, terracotta + gold color scheme.

### Not Adding
- No GSAP or Framer Motion — CSS animations + View Transitions + canvas-confetti cover all needs
- No page-level scroll animations — this is a game, not a marketing site
- No sound changes — existing sound system is solid

## Dependencies

### New
- **Fraunces font** (Google Fonts CDN) — ~60KB variable woff2
- **Inter font** (Google Fonts CDN) — ~90KB variable woff2
- **canvas-confetti** (npm) — ~6KB gzipped, zero dependencies. Used for perfect score celebration only.

### Performance Budget
- Font loading: `font-display: swap` prevents FOIT. Fonts load in parallel with page.
- Total new payload: ~156KB (fonts) + 6KB (confetti) = ~162KB. Acceptable for a game.
- All animations CSS-native except confetti. No runtime animation library.

## What's NOT Changing

- **Game mechanics** — scoring, taxonomy matching, streaks, achievements: all untouched
- **Game engine** (`game-engine.js`, `daily-engine.js`) — no changes
- **Data files** — observations, taxonomy, sets, difficulty: unchanged
- **Share text generation** — existing format works, no changes
- **Sound system** — existing sounds.js untouched
- **Analytics/feedback** — logging preserved
- **PWA manifest** — update theme-color to match new palette
- **SEO** — meta tags, structured data, canonical URLs: unchanged
- **Dark mode** — will inherit the new typography and button styles. Color variables for dark mode will be updated to match the warmer tone.

## Risks & Tradeoffs

1. **Font loading flash (FOUT):** Fraunces + Inter add ~150KB. With `font-display: swap`, text renders immediately in system fonts then shifts to custom fonts. Brief flash is acceptable for a game. Mitigated by Google Fonts CDN caching.

2. **View Transitions browser support:** ~85% as of 2026. Feature-detected with `if (document.startViewTransition)`. Unsupported browsers get instant DOM swap (current behavior). No degradation.

3. **canvas-confetti dependency:** Small, well-maintained (2M+ weekly npm downloads), zero transitive deps. Only fires on perfect scores, so most sessions never load it. Can be lazy-imported.

4. **Visual regression risk:** The CSS changes touch `global.css` (~3000 lines) and `game-ui.js` (HTML templates). No automated visual regression tests exist. Mitigation: test every screen manually in light/dark mode, mobile/desktop.

5. **Dark mode consistency:** The new warm gray for errors and warm-tinted shadows need corresponding dark mode values. This adds work but is straightforward — update the dark mode CSS variables block.

## Files Changed

### CSS
- `src/styles/global.css` — typography, colors, shadows, button styles, choice cards, progress bar, feedback cards, results screen, leaderboard, daily challenge

### JS (HTML template changes)
- `src/scripts/game-ui.js` — round renderer, feedback card, summary screens, share section
- `src/scripts/leaderboard-ui.js` — table renderer, tab control
- `src/scripts/daily-ui.js` — daily challenge screens

### Astro
- `src/layouts/Base.astro` — font imports, header logo styling
- `src/pages/index.astro` — homepage structure and class updates
- `src/pages/leaderboard.astro` — tab control markup

### New Files
- None (canvas-confetti installed via npm, fonts via CDN)

### Config
- `public/manifest.json` — update theme_color
