# UI Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the What's That Bug UI from a functional quiz into a polished, vibrant game by applying Fraunces serif typography, Duolingo-style tactile buttons, warm-tinted shadows, and gray-not-red error states across all screens.

**Architecture:** Purely CSS + client-side JS template changes within the existing Astro framework. No changes to game logic, data files, or server-side code. Font loading via Google Fonts CDN, confetti via canvas-confetti npm package.

**Tech Stack:** Astro 4, vanilla CSS custom properties, vanilla JS DOM templates, Google Fonts (Fraunces + Inter), canvas-confetti

**Spec:** `docs/superpowers/specs/2026-04-17-ui-revamp-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/layouts/Base.astro` | Modify | Font imports, header logo styling |
| `src/styles/global.css` | Modify | All visual token and component style changes |
| `src/pages/index.astro` | Modify | Homepage structure (daily banner, mode cards, section headings) |
| `src/pages/leaderboard.astro` | Modify | Tab control markup |
| `src/scripts/game-ui.js` | Modify | Round HTML template, feedback card, summary screens, share section, progress bar, View Transitions, confetti |
| `src/scripts/leaderboard-ui.js` | Modify | Table row HTML template |
| `src/scripts/daily-ui.js` | Modify | Daily challenge screens (typography classes, button classes) |
| `public/manifest.json` | Modify | Update theme_color |
| `package.json` | Modify | Add canvas-confetti dependency |

---

### Task 1: Install canvas-confetti and add font imports

**Files:**
- Modify: `package.json`
- Modify: `src/layouts/Base.astro:22-29` (head section)
- Modify: `public/manifest.json`

- [ ] **Step 1: Install canvas-confetti**

Run: `npm install canvas-confetti`

Expected: package.json updated with `canvas-confetti` in dependencies.

- [ ] **Step 2: Add Google Fonts preconnect and stylesheet to Base.astro**

In `src/layouts/Base.astro`, after line 25 (`<link rel="icon" ...>`), add the font imports:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
```

- [ ] **Step 3: Update manifest.json theme_color**

In `public/manifest.json`, change `theme_color` to `#b85a3b` (terracotta) to match the brand.

- [ ] **Step 4: Verify fonts load**

Run: `npm run dev`

Open the site in a browser. Open DevTools > Network tab, filter by "font". Verify Fraunces and Inter woff2 files are loaded. Check the Elements panel — `document.fonts` should include both families.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/layouts/Base.astro public/manifest.json
git commit -m "chore: add Fraunces + Inter fonts and canvas-confetti dependency"
```

---

### Task 2: Update CSS design tokens (colors, typography, shadows)

**Files:**
- Modify: `src/styles/global.css:1-131` (CSS custom properties and base styles)

This task updates the foundational tokens that everything else builds on. No visual changes yet — just the variables.

- [ ] **Step 1: Update light mode custom properties**

In `src/styles/global.css`, replace the `:root` block (lines 4-53) with:

```css
:root {
  --bg: #faf8f5;
  --surface: #ffffff;
  --text: #2c2420;
  --text-secondary: #9a8f85;
  --accent: #b85a3b;
  --border: #ece8e2;

  --success: #059669;
  --success-bg: #f0fdf4;
  --success-border: #86efac;

  --warning: #b85a3b;
  --warning-bg: #fefce8;
  --warning-border: #fde047;

  --error: #c4b5a8;
  --error-bg: #f5f3f0;
  --error-border: #d4c8ba;

  --photo-bg: #1a1a2e;

  /* Spacing scale (8px grid) */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;

  /* Border radius scale */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 20px;
  --radius-full: 99px;

  /* Transition defaults */
  --transition-fast: 150ms ease-out;
  --transition-normal: 300ms ease-out;
  --transition-modal: 340ms ease-out;

  /* Typography scale */
  --text-xs:  0.75rem;
  --text-sm:  0.85rem;
  --text-base: 1rem;
  --text-lg:  1.15rem;
  --text-xl:  1.5rem;
  --text-2xl: 2rem;

  /* Font families */
  --font-display: 'Fraunces', Georgia, serif;
  --font-ui: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, sans-serif;
}
```

Key changes: `--bg` warmer, `--surface` now white, `--text` warmer brown, `--text-secondary` warm gray, `--border` warmer, `--error` changed from red to warm gray. Added `--font-display` and `--font-ui` variables.

- [ ] **Step 2: Update dark mode custom properties**

Replace both dark mode blocks (the `@media (prefers-color-scheme: dark)` block and the `[data-theme="dark"]` block) with updated warm-gray error colors:

In the `@media (prefers-color-scheme: dark)` block, change the error variables:
```css
    --error: #a09080;
    --error-bg: #2a2520;
    --error-border: #3d3530;
```

In the `[data-theme="dark"]` block, make the same error variable changes:
```css
    --error: #a09080;
    --error-bg: #2a2520;
    --error-border: #3d3530;
```

- [ ] **Step 3: Update base body font-family**

In the `body` rule (around line 124), change `font-family` to use the new variable:

```css
body {
  background-color: var(--bg);
  color: var(--text);
  font-family: var(--font-ui);
  font-size: 16px;
  line-height: 1.6;
  min-height: 100vh;
  overflow-x: hidden;
  width: 100%;
  max-width: 100vw;
}
```

- [ ] **Step 4: Add display font utility classes**

After the `.subtitle` rule (around line 222), add:

```css
/* Display font for headings, scores, game title */
.font-display {
  font-family: var(--font-display);
}

h1, h2 {
  font-family: var(--font-display);
}
```

- [ ] **Step 5: Verify token changes**

Run: `npm run dev`

Open the homepage. Text should now render in Inter (sans-serif) for body and Fraunces (serif) for h1/h2. Colors should be slightly warmer. Wrong answer states should appear warm gray instead of red.

- [ ] **Step 6: Commit**

```bash
git add src/styles/global.css
git commit -m "style: update design tokens — warmer palette, Fraunces/Inter fonts, gray-not-red errors"
```

---

### Task 3: Restyle header and buttons with tactile treatment

**Files:**
- Modify: `src/styles/global.css:136-265` (header, buttons)
- Modify: `src/layouts/Base.astro:89` (logo markup)

- [ ] **Step 1: Update header logo styling**

In `src/styles/global.css`, replace the `.site-logo` rules (around lines 153-162):

```css
.site-logo {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.1rem;
  color: var(--accent);
  text-decoration: none;
  letter-spacing: -0.3px;
}

.site-logo:hover {
  opacity: 0.85;
}
```

- [ ] **Step 2: Update button base styles for tactile effect**

Replace the `.btn` rules (around lines 227-265):

```css
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: var(--radius-md);
  font-family: var(--font-ui);
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition: transform 0.1s ease, box-shadow 0.1s ease, opacity 0.15s ease;
  text-decoration: none;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
  box-shadow: 0 3px 0 #8a3f28;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.92;
}

.btn-primary:active:not(:disabled) {
  transform: translateY(3px);
  box-shadow: 0 0 0 #8a3f28;
}

.btn-outline {
  background: var(--surface);
  color: var(--text);
  border-color: var(--border);
  box-shadow: 0 2px 0 var(--border);
}

.btn-outline:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}

.btn-outline:active:not(:disabled) {
  transform: translateY(2px);
  box-shadow: 0 0 0 var(--border);
}

#play-again-btn,
#change-set-btn {
  border-color: var(--accent);
  color: var(--accent);
}
```

- [ ] **Step 3: Verify header and buttons**

Run dev server. Check:
- Logo text is in Fraunces serif, terracotta color
- All buttons have a visible bottom shadow
- Clicking buttons shows press-down effect (translateY + shadow collapse)

- [ ] **Step 4: Commit**

```bash
git add src/styles/global.css src/layouts/Base.astro
git commit -m "style: tactile buttons with press-down effect, Fraunces logo"
```

---

### Task 4: Restyle homepage (daily banner, mode cards, sections)

**Files:**
- Modify: `src/pages/index.astro:28-107` (homepage HTML structure)
- Modify: `src/styles/global.css` (homepage component styles, around lines 2835-2970)

- [ ] **Step 1: Update homepage hero and daily banner markup**

In `src/pages/index.astro`, replace the hero and daily banner section (lines 29-40):

```html
<div style="text-align: center; padding: 28px 0 12px;">
  <h1 style="font-size: 1.8rem; letter-spacing: -0.5px;">What's That Bug?</h1>
  <p class="subtitle">Identify insects from real photos. 1,000+ species. How many can you name?</p>
</div>

<!-- Daily Challenge — gradient banner -->
<div class="daily-banner">
  <span class="daily-banner-text"><strong>Daily Challenge</strong> — a new mystery bug every day</span>
  <span class="daily-banner-status">
    <a href="/daily/play?mode=bugs101" class="daily-banner-link" id="daily-link-bugs101">Play &rarr;</a>
  </span>
</div>
```

- [ ] **Step 2: Update play cards markup**

In `src/pages/index.astro`, update the play cards section (lines 43-59) to add detail badges:

```html
<div class="homepage-section">
  <h2 class="homepage-section-title">Play</h2>
  <div class="play-cards">
    <a href="/play?set=bugs_101" class="play-card">
      <span class="play-card-icon">🔰</span>
      <span class="play-card-title">Bugs 101</span>
      <span class="play-card-subtitle">Identify by type</span>
      <span class="play-card-detail">10 rounds · Beginner</span>
    </a>
    <a href="/play?set=all_bugs" class="play-card">
      <span class="play-card-icon">🌍</span>
      <span class="play-card-title">All Bugs</span>
      <span class="play-card-subtitle">Name the genus</span>
      <span class="play-card-detail">10 rounds · Expert</span>
    </a>
  </div>
</div>
```

- [ ] **Step 3: Restyle daily banner CSS**

In `src/styles/global.css`, replace the `.daily-banner` styles (around line 2835):

```css
.daily-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: linear-gradient(135deg, #c06a3e 0%, #d4895a 50%, #e0a070 100%);
  color: #fff;
  padding: 14px 18px;
  border-radius: 14px;
  margin-bottom: 24px;
  font-size: var(--text-sm);
  box-shadow: 0 6px 20px rgba(184, 90, 59, 0.25), 0 2px 6px rgba(184, 90, 59, 0.15);
  position: relative;
  overflow: hidden;
}

.daily-banner::before {
  content: '';
  position: absolute;
  top: -50%;
  right: -20%;
  width: 100px;
  height: 100px;
  background: radial-gradient(circle, rgba(255,255,255,0.15) 0%, transparent 70%);
  pointer-events: none;
}

.daily-banner-text {
  color: rgba(255,255,255,0.95);
}

.daily-banner-link {
  background: rgba(255,255,255,0.25);
  color: #fff;
  padding: 5px 14px;
  border-radius: 10px;
  text-decoration: none;
  font-weight: 700;
  font-size: var(--text-sm);
  backdrop-filter: blur(4px);
  transition: background var(--transition-fast);
}

.daily-banner-link:hover {
  background: rgba(255,255,255,0.35);
}
```

- [ ] **Step 4: Restyle play cards CSS**

Replace the `.play-card` styles (around line 2880):

```css
.play-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.play-card {
  background: var(--surface);
  border: 1.5px solid var(--border);
  border-radius: 14px;
  padding: 20px 14px;
  text-align: center;
  text-decoration: none;
  color: var(--text);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  box-shadow: 0 2px 0 #d4a07a, 0 4px 12px rgba(184, 90, 59, 0.08);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.play-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 0 #d4a07a, 0 8px 20px rgba(184, 90, 59, 0.12);
}

.play-card:active {
  transform: translateY(2px);
  box-shadow: 0 0 0 #d4a07a, 0 1px 4px rgba(184, 90, 59, 0.08);
}

.play-card-icon {
  font-size: 28px;
  margin-bottom: 4px;
}

.play-card-title {
  font-family: var(--font-display);
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.2px;
}

.play-card-subtitle {
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.play-card-detail {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--accent);
  background: rgba(184, 90, 59, 0.08);
  padding: 2px 10px;
  border-radius: 6px;
  margin-top: 4px;
}
```

- [ ] **Step 5: Restyle section headings and compete cards CSS**

Replace `.homepage-section-title` to use Fraunces:

```css
.homepage-section-title {
  font-family: var(--font-display);
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 4px;
  letter-spacing: -0.2px;
}
```

Replace `.compete-card` styles (around line 2935):

```css
.compete-card {
  background: var(--surface);
  border: 1.5px solid var(--border);
  border-radius: 14px;
  padding: 14px 12px;
  text-align: center;
  text-decoration: none;
  color: var(--text);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  box-shadow: 0 2px 0 var(--border), 0 4px 12px rgba(0, 0, 0, 0.03);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.compete-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 0 var(--border), 0 8px 16px rgba(0, 0, 0, 0.05);
}

.compete-card:active {
  transform: translateY(2px);
  box-shadow: 0 0 0 var(--border);
}
```

- [ ] **Step 6: Verify homepage**

Run dev server. Check:
- Daily banner is a gradient strip with warm glow shadow
- Play cards have terracotta bottom shadow and press-down on click
- Section headings are in Fraunces
- Compete cards have lighter tactile treatment

- [ ] **Step 7: Commit**

```bash
git add src/pages/index.astro src/styles/global.css
git commit -m "style: restyle homepage — gradient daily banner, tactile mode cards, Fraunces headings"
```

---

### Task 5: Add progress bar and restyle quiz round screen

**Files:**
- Modify: `src/scripts/game-ui.js:348-458` (renderRound function)
- Modify: `src/styles/global.css` (add progress bar styles, update photo/choice/prompt styles)

- [ ] **Step 1: Add progress bar CSS**

In `src/styles/global.css`, after the `.top-bar` styles (around line 536), add:

```css
/* =============================================
   Session Progress Bar
   ============================================= */
.session-progress {
  display: flex;
  gap: 3px;
  padding: 8px 16px 4px;
}

.session-progress-segment {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: var(--border);
  transition: background 0.3s ease;
}

.session-progress-segment.filled {
  background: var(--success);
}

.session-progress-segment.filled-miss {
  background: var(--error);
}

.session-progress-segment.current {
  background: var(--accent);
  animation: pulse-segment 1.5s ease-in-out infinite;
}

@keyframes pulse-segment {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}
```

- [ ] **Step 2: Update photo hero CSS**

Replace the `.photo-hero` styles (around line 306):

```css
.photo-hero {
  background: var(--photo-bg);
  border-radius: 16px;
  overflow: hidden;
  aspect-ratio: 16 / 10;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 12px 0;
  position: relative;
}

.photo-hero img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.photo-hero::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 40%;
  background: linear-gradient(to top, rgba(26, 26, 46, 0.5), transparent);
  pointer-events: none;
}
```

Update `.photo-credit` (around line 347):

```css
.photo-hero .photo-credit {
  position: absolute;
  bottom: 8px;
  left: 12px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 9px;
  z-index: 1;
  max-width: 60%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

- [ ] **Step 3: Update round prompt CSS**

Replace `.round-prompt` styles (around line 365):

```css
.round-prompt {
  text-align: center;
  padding: 8px 16px 4px;
}

.round-prompt-title {
  font-family: var(--font-display);
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text);
  display: block;
}

.round-prompt-location {
  font-size: 0.8rem;
  color: var(--text-secondary);
  display: block;
  margin-top: 2px;
}
```

- [ ] **Step 4: Update choice card CSS**

Replace `.choice` styles (around line 398):

```css
.choices {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 24px;
}

.choice {
  background: var(--surface);
  border: 1.5px solid var(--border);
  border-radius: 14px;
  padding: 14px 12px;
  cursor: pointer;
  text-align: center;
  box-shadow: 0 3px 0 #e0d5c8;
  transition: transform 0.1s ease, box-shadow 0.1s ease, border-color 0.15s ease;
}

.choice:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 5px 0 #e0d5c8;
}

.choice:active:not(:disabled) {
  transform: translateY(3px);
  box-shadow: 0 0 0 #e0d5c8;
}

.choice-name {
  font-weight: 700;
  font-size: var(--text-base);
  color: var(--text);
  display: block;
}

.choice-latin {
  font-style: italic;
  font-size: var(--text-sm);
  color: var(--text-secondary);
  display: block;
  margin-top: 3px;
}

/* Choice result states */
.choice.correct {
  border-color: var(--success);
  background: var(--success-bg);
  box-shadow: 0 3px 0 var(--success);
}

.choice.correct .choice-name {
  color: var(--success);
}

.choice.close {
  border-color: var(--warning-border);
  background: var(--warning-bg);
  box-shadow: 0 3px 0 var(--warning);
}

.choice.close .choice-name {
  color: var(--warning);
}

.choice.miss {
  border-color: var(--error-border);
  background: var(--error-bg);
  box-shadow: 0 3px 0 var(--error);
  opacity: 0.6;
}

.choice.miss .choice-name {
  color: var(--error);
}

/* Dimmed state for non-selected, non-correct choices */
.choice.dimmed {
  opacity: 0.4;
  pointer-events: none;
}
```

- [ ] **Step 5: Update renderRound() in game-ui.js to use centered prompt layout**

In `src/scripts/game-ui.js`, in the `renderRound()` function (around line 419), update the round prompt HTML:

Change:
```javascript
<div class="round-prompt">
  <span class="round-prompt-title">What's this bug?</span>
  <span class="round-prompt-location">${escapeHTML(correct.location)}</span>
</div>
```

To:
```javascript
<div class="round-prompt">
  <span class="round-prompt-title">What's this bug?</span>
  <span class="round-prompt-location">${correct.location ? '📍 ' + escapeHTML(correct.location) : ''}</span>
</div>
```

- [ ] **Step 6: Add dimmed class to non-relevant choices after answer**

In `src/scripts/game-ui.js`, in the `handleAnswer()` function (around line 488-504), after the choice highlight loop, add dimming for unrelated choices:

After the existing `choices.forEach` loop that adds `correct`/`miss` classes, add:

```javascript
// Dim choices that are neither correct nor the player's pick
choiceEls.forEach(el => {
  if (!el.classList.contains('correct') && !el.classList.contains('miss') && !el.classList.contains('close')) {
    el.classList.add('dimmed');
  }
});
```

- [ ] **Step 7: Verify quiz round screen**

Run dev server. Start a Bugs 101 game. Check:
- Progress bar shows colored segments
- Photo has rounded corners with gradient overlay
- Choices have tactile shadow and press-down on click
- After answering, correct is green, wrong is warm gray, others are dimmed

- [ ] **Step 8: Commit**

```bash
git add src/styles/global.css src/scripts/game-ui.js
git commit -m "style: restyle quiz round — progress bar, tactile choices, rounded photo, gray-not-red"
```

---

### Task 6: Restyle feedback card and next button

**Files:**
- Modify: `src/styles/global.css:465-520` (feedback card, reactions)
- Modify: `src/scripts/game-ui.js:636-708` (handleClassicPostAnswer)

- [ ] **Step 1: Update feedback card CSS**

Replace `.feedback-card` styles (around line 465):

```css
.feedback-card {
  border-radius: 14px;
  padding: 16px 20px;
  border: 1px solid;
  margin-bottom: 20px;
}

.feedback-card .feedback-title {
  font-family: var(--font-display);
  font-size: 1.1rem;
  font-weight: 700;
  margin-bottom: 6px;
}

.feedback-card .feedback-body {
  font-size: var(--text-sm);
  line-height: 1.5;
  color: var(--text);
}

.feedback-card.exact {
  background: var(--success-bg);
  border-color: var(--success-border);
}

.feedback-card.exact .feedback-title {
  color: var(--success);
}

.feedback-card.close {
  background: var(--warning-bg);
  border-color: var(--warning-border);
}

.feedback-card.close .feedback-title {
  color: var(--warning);
}

.feedback-card.miss {
  background: var(--error-bg);
  border-color: var(--error-border);
}

.feedback-card.miss .feedback-title {
  color: var(--error);
}
```

- [ ] **Step 2: Add full-width next button style**

After the feedback card styles, add:

```css
.btn-next-round {
  display: block;
  width: 100%;
  padding: 14px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: var(--radius-md);
  font-family: var(--font-ui);
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 3px 0 #8a3f28;
  transition: transform 0.1s ease, box-shadow 0.1s ease;
  text-align: center;
}

.btn-next-round:active {
  transform: translateY(3px);
  box-shadow: 0 0 0 #8a3f28;
}
```

- [ ] **Step 3: Update handleClassicPostAnswer() to use new button class**

In `src/scripts/game-ui.js`, in `handleClassicPostAnswer()` (around line 682), change the next button:

```javascript
<div style="text-align: center; margin-top: 16px;">
  <button class="btn-next-round" id="next-btn">
    ${session.isComplete ? 'See Results' : 'Next Round →'}
  </button>
</div>
```

- [ ] **Step 4: Update reaction buttons CSS**

Replace `.reaction-btn` styles (around line 501):

```css
.reaction-btn {
  background: var(--surface);
  border: 1.5px solid var(--border);
  color: var(--text);
  border-radius: var(--radius-md);
  padding: 8px 16px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 2px 0 var(--border);
  transition: transform 0.1s ease, box-shadow 0.1s ease, border-color 0.15s ease;
}

.reaction-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.reaction-btn:active {
  transform: translateY(2px);
  box-shadow: 0 0 0 var(--border);
}

.reaction-btn.active, .reaction-btn.selected {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
  box-shadow: 0 2px 0 #8a3f28;
}
```

- [ ] **Step 5: Verify feedback card**

Play through a round. Check:
- Correct feedback card has green tint with Fraunces title
- Wrong feedback card has warm gray tint (not red/pink)
- Next button is full-width terracotta with press-down
- Reaction buttons have tactile treatment

- [ ] **Step 6: Commit**

```bash
git add src/styles/global.css src/scripts/game-ui.js
git commit -m "style: restyle feedback card, tactile next button, gray-not-red wrong answers"
```

---

### Task 7: Restyle results/summary screens

**Files:**
- Modify: `src/styles/global.css:570-800` (summary, emoji grid, share section, stats)
- Modify: `src/scripts/game-ui.js:922-989` (renderClassicSummary)
- Modify: `src/scripts/game-ui.js:991-1103` (renderTimeTrialSummary)
- Modify: `src/scripts/game-ui.js:1105-1228` (renderStreakGameOver)

- [ ] **Step 1: Update summary CSS**

Replace `.summary` and `.summary-score` styles (around line 570):

```css
.summary {
  text-align: center;
  padding: 32px 0;
}

.summary-set-label {
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 4px;
}

.summary-score {
  font-family: var(--font-display);
  font-size: 3rem;
  font-weight: 900;
  color: var(--accent);
  line-height: 1;
  margin-bottom: 4px;
}

.summary-sub {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  margin-bottom: 16px;
}
```

- [ ] **Step 2: Replace emoji grid with round indicator dots**

Replace `.emoji-grid` styles (around line 727):

```css
.round-dots {
  display: flex;
  justify-content: center;
  gap: 6px;
  margin: 12px 0;
}

.round-dot {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  color: #fff;
}

.round-dot.correct {
  background: var(--success);
}

.round-dot.wrong {
  background: var(--error);
}

/* Keep emoji-grid for backwards compat with time trial/streak */
.emoji-grid {
  font-size: 24px;
  letter-spacing: 4px;
  margin: 16px 0;
}
```

- [ ] **Step 3: Add stats cards and POTD card CSS**

After the round dots CSS, add:

```css
.summary-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin: 16px 0;
}

.summary-stat {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 12px 8px;
  text-align: center;
}

.summary-stat-val {
  font-family: var(--font-display);
  font-size: 1.3rem;
  font-weight: 800;
  color: var(--text);
}

.summary-stat-label {
  font-size: var(--text-xs);
  color: var(--text-secondary);
  font-weight: 500;
  margin-top: 2px;
}

.potd-card {
  background: rgba(184, 90, 59, 0.06);
  border: 1px solid rgba(184, 90, 59, 0.15);
  border-radius: var(--radius-md);
  padding: 12px;
  margin: 12px 0;
  text-align: left;
  display: flex;
  align-items: center;
  gap: 12px;
}

.potd-card-icon {
  font-size: 28px;
  flex-shrink: 0;
}

.potd-card-text {
  font-size: var(--text-sm);
  line-height: 1.4;
}

.potd-card-text strong {
  font-size: var(--text-sm);
  color: var(--text);
  display: block;
}

.potd-card-text em {
  color: var(--text-secondary);
}
```

- [ ] **Step 4: Update share section CSS**

Replace `.share-section` styles (around line 736):

```css
.share-section {
  margin: 20px 0;
  padding: 20px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  text-align: center;
}

.share-flavor {
  font-family: var(--font-display);
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 12px;
}

.btn-share-hero {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 14px 24px;
  font-size: 1rem;
  font-weight: 700;
  margin-bottom: 12px;
  box-shadow: 0 3px 0 #8a3f28;
}

.btn-share-hero:active {
  transform: translateY(3px);
  box-shadow: 0 0 0 #8a3f28;
}

.btn-share-hero svg {
  flex-shrink: 0;
}

.share-buttons-secondary {
  display: flex;
  gap: 10px;
  justify-content: center;
}

.share-icon-btn {
  width: 42px;
  height: 42px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  background: var(--bg);
  border: 1.5px solid var(--border);
  box-shadow: 0 2px 0 var(--border);
  cursor: pointer;
  transition: transform 0.1s ease, box-shadow 0.1s ease;
}

.share-icon-btn:active {
  transform: translateY(2px);
  box-shadow: 0 0 0 var(--border);
}

.share-icon-btn svg {
  flex-shrink: 0;
}
```

- [ ] **Step 5: Update renderClassicSummary() in game-ui.js**

In `src/scripts/game-ui.js`, replace the container.innerHTML in `renderClassicSummary()` (around line 948):

```javascript
const exactCount = session.history.filter(h => h.score === 100).length;
const missCount = session.history.filter(h => h.score < 100).length;
const accuracy = Math.round((exactCount / session.history.length) * 100);

// Round indicator dots instead of emoji grid
const roundDots = session.history.map((h, i) => {
  const cls = h.score === 100 ? 'correct' : 'wrong';
  const icon = h.score === 100 ? '✓' : '✗';
  return `<div class="round-dot ${cls}" style="animation-delay:${i * 80}ms">${icon}</div>`;
}).join('');

const potd = getPlayOfTheDay(session.history);
const potdHTML = potd ? `
  <div class="potd-card">
    <span class="potd-card-icon">🏆</span>
    <div class="potd-card-text">
      <strong>Play of the Day</strong>
      <em>${escapeHTML(potd.common_name)} (${escapeHTML(potd.species)})</em>
    </div>
  </div>
` : '';

container.innerHTML = `
  <div class="container">
    <div class="summary">
      <div class="summary-set-label">${escapeHTML(session.setDef.name)}</div>
      <div class="summary-score">${session.totalScore}</div>
      <div class="summary-sub">out of 1,000</div>

      <div class="round-dots anim-fade-in">${roundDots}</div>

      <div class="summary-stats">
        <div class="summary-stat">
          <div class="summary-stat-val">${exactCount}</div>
          <div class="summary-stat-label">Correct</div>
        </div>
        <div class="summary-stat">
          <div class="summary-stat-val">${session.bestStreak}</div>
          <div class="summary-stat-label">Best Streak</div>
        </div>
        <div class="summary-stat">
          <div class="summary-stat-val">${accuracy}%</div>
          <div class="summary-stat-label">Accuracy</div>
        </div>
      </div>

      ${potdHTML}

      ${renderShareSection(getClassicFlavor(exactCount))}

      <div style="margin-top: 24px; display: flex; gap: 12px; justify-content: center;">
        <button class="btn btn-primary" id="play-again-btn">Play Again</button>
        <a href="${base}/" class="btn btn-outline" id="change-set-btn">Change Set</a>
      </div>
      ${recHTML}
    </div>

    ${renderSessionFeedbackForm()}
  </div>
`;
```

Note: Keep the existing `tweenCounter`, `attachShareHandlers`, `attachPlayAgainHandlers`, `attachSessionFeedbackHandlers`, and achievement check calls after the innerHTML assignment — those remain unchanged.

- [ ] **Step 6: Update time trial and streak summary HTML with Fraunces classes**

In `renderTimeTrialSummary()` (around line 1039), update the h1:
```javascript
<h1>⏱️ Time Trial</h1>
```
To:
```javascript
<div class="summary-set-label">Time Trial</div>
```

And the summary score:
```javascript
<div class="summary-score">${session.totalScore} pts</div>
```
Stays the same (already has class).

In `renderStreakGameOver()` (around line 1161), update the h1:
```javascript
<h1>🎯 Streaks</h1>
```
To:
```javascript
<div class="summary-set-label">Streaks</div>
```

Also update the `.tt-stats` to use `summary-stats` class and Fraunces values:
```javascript
<div class="summary-stats">
  <div class="summary-stat">
    <div class="summary-stat-val">${correctCount}/${totalQ}</div>
    <div class="summary-stat-label">Correct</div>
  </div>
  ...
</div>
```

- [ ] **Step 7: Verify results screens**

Play a full 10-round classic game. Check:
- Score displays in large Fraunces font, terracotta
- Round dots show checkmarks/X in colored squares (not raw emoji)
- Stats in white cards with Fraunces numbers
- "Play of the Day" is a proper card with trophy icon
- Share section is in a white card container
- Action buttons have tactile treatment

- [ ] **Step 8: Commit**

```bash
git add src/styles/global.css src/scripts/game-ui.js
git commit -m "style: restyle results screens — round dots, stat cards, POTD card, share card"
```

---

### Task 8: Restyle leaderboard page

**Files:**
- Modify: `src/pages/leaderboard.astro:9-30` (tab markup)
- Modify: `src/scripts/leaderboard-ui.js:24-57` (table renderer)
- Modify: `src/styles/global.css` (leaderboard styles, around line 1594 and 1942)

- [ ] **Step 1: Update leaderboard page heading markup**

In `src/pages/leaderboard.astro`, replace the heading section (lines 10-14):

```html
<div style="text-align:center;padding:24px 0 8px;">
  <h1 style="font-size:1.4rem;letter-spacing:-0.3px;">Leaderboard</h1>
  <p class="subtitle">Resets every day at midnight ET</p>
  <p class="lb-countdown" id="lb-countdown" style="font-size:0.8rem;color:var(--text-secondary);margin-top:4px;"></p>
</div>
```

- [ ] **Step 2: Update tab markup for segmented control style**

In `src/pages/leaderboard.astro`, replace the tab buttons (around line 19-21):

```html
<div class="lb-tabs-segmented" data-group="bugs101">
  <button class="lb-tab-seg active" data-board="bugs_101_time_trial">Time Trial</button>
  <button class="lb-tab-seg" data-board="bugs_101_streak">Streaks</button>
</div>
```

Update the tab switching JS (around line 37-49) to use the new class names:

```javascript
document.querySelectorAll('.lb-tabs-segmented').forEach(tabGroup => {
  tabGroup.querySelectorAll('.lb-tab-seg').forEach(tab => {
    tab.addEventListener('click', () => {
      tabGroup.querySelectorAll('.lb-tab-seg').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const boardKey = tab.dataset.board;
      const parent = tabGroup.closest('.mode-group');
      parent.querySelectorAll('.lb-tab-content').forEach(c => c.classList.remove('active'));
      parent.querySelector(`#board-${boardKey}`)?.classList.add('active');
    });
  });
});
```

- [ ] **Step 3: Add segmented tab CSS**

In `src/styles/global.css`, replace the `.lb-tabs` / `.lb-tab` styles (around line 1942):

```css
.lb-tabs-segmented {
  display: flex;
  background: var(--border);
  border-radius: 10px;
  padding: 3px;
  margin-bottom: 16px;
}

.lb-tab-seg {
  flex: 1;
  padding: 8px;
  border-radius: 8px;
  text-align: center;
  font-family: var(--font-ui);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  border: none;
  background: none;
  transition: background var(--transition-fast), color var(--transition-fast), box-shadow var(--transition-fast);
}

.lb-tab-seg:hover {
  color: var(--text);
}

.lb-tab-seg.active {
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}
```

- [ ] **Step 4: Update leaderboard table row renderer**

In `src/scripts/leaderboard-ui.js`, update `renderLeaderboardTable()` (around line 29-56). Replace the row template:

```javascript
const rows = board.map((entry, i) => {
  const rank = i + 1;
  const isHighlighted = rank === highlightRank;
  let rankDisplay;
  if (rank === 1) rankDisplay = '🥇';
  else if (rank === 2) rankDisplay = '🥈';
  else if (rank === 3) rankDisplay = '🥉';
  else rankDisplay = rank;

  const flag = getFlagForCode(entry.country);
  const name = escapeHTML(entry.name || 'Anonymous Bug Hunter');
  const value = isStreak ? (entry.streak || 0) : (entry.score || 0);
  const valueLabel = isStreak ? `${value} streak` : `${value} pts`;

  const highlightClass = isHighlighted ? ' lb-row-you' : '';
  const rankColorClass = rank === 1 ? ' lb-rank-gold' : rank === 2 ? ' lb-rank-silver' : rank === 3 ? ' lb-rank-bronze' : '';

  return `
    <div class="lb-row${highlightClass}">
      <span class="lb-rank${rankColorClass}">${rankDisplay}</span>
      <span class="lb-name"><span class="lb-flag">${flag}</span>${name}</span>
      <span class="lb-value">${valueLabel}</span>
    </div>
  `;
}).join('');
```

- [ ] **Step 5: Update leaderboard row CSS**

Replace the `.lb-table` / `.lb-row` styles (around line 1594):

```css
.lb-table {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.lb-row {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  border-radius: 10px;
  gap: 12px;
}

.lb-row:nth-child(odd) {
  background: rgba(245, 243, 240, 0.5);
}

.lb-rank {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 1rem;
  width: 32px;
  text-align: center;
  flex-shrink: 0;
  color: var(--text-secondary);
}

.lb-rank-gold { color: #d4a017; }
.lb-rank-silver { color: #8a8a8a; }
.lb-rank-bronze { color: #b87333; }

.lb-name {
  flex: 1;
  font-weight: 600;
  font-size: var(--text-sm);
}

.lb-flag {
  margin-right: 6px;
}

.lb-value {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: var(--text-sm);
  color: var(--accent);
  flex-shrink: 0;
}

.lb-row-you {
  background: rgba(184, 90, 59, 0.08) !important;
  border: 1.5px solid rgba(184, 90, 59, 0.2);
}

.lb-row-you .lb-rank,
.lb-row-you .lb-name {
  color: var(--accent);
}
```

- [ ] **Step 6: Verify leaderboard**

Open `/leaderboard`. Check:
- Heading in Fraunces, countdown small and secondary
- iOS-style segmented tab control
- Rows with Fraunces rank numbers, terracotta scores
- Medal emoji for top 3

- [ ] **Step 7: Commit**

```bash
git add src/pages/leaderboard.astro src/scripts/leaderboard-ui.js src/styles/global.css
git commit -m "style: restyle leaderboard — segmented tabs, warm row styling, Fraunces scores"
```

---

### Task 9: Restyle daily challenge screens

**Files:**
- Modify: `src/scripts/daily-ui.js` (apply Fraunces classes to headings, tactile submit button)
- Modify: `src/styles/global.css` (daily challenge specific styles)

- [ ] **Step 1: Grep for daily challenge HTML templates in daily-ui.js**

Run: `grep -n 'innerHTML\|class="' src/scripts/daily-ui.js | head -40`

This identifies all the HTML template insertion points that need class updates.

- [ ] **Step 2: Update daily-ui.js heading classes**

In all `innerHTML` assignments in `daily-ui.js` that use `<h1>` or `<h2>` tags, ensure they inherit the Fraunces display font (they already do via the global `h1, h2` rule from Task 2). No class changes needed for headings.

For the submit button, find the daily challenge submit button markup and change it from:
```javascript
class="btn btn-primary"
```
To:
```javascript
class="btn-next-round"
```

For the share section in the reveal screen, the daily share buttons already use the same `.share-section` / `.btn-share-hero` / `.share-icon-btn` classes that were restyled in Task 7.

- [ ] **Step 3: Update daily challenge photo container styling**

In `src/styles/global.css`, find the daily challenge photo styles and ensure the crop images use the same rounded treatment:

```css
.daily-photo {
  border-radius: 16px;
  overflow: hidden;
}
```

- [ ] **Step 4: Verify daily challenge**

Open `/daily/play?mode=bugs101`. Check:
- Heading in Fraunces
- Submit button is full-width terracotta with press-down
- Photo has rounded corners
- Reveal screen uses same warm styling as classic results

- [ ] **Step 5: Commit**

```bash
git add src/scripts/daily-ui.js src/styles/global.css
git commit -m "style: apply revamp styling to daily challenge screens"
```

---

### Task 10: Add View Transitions and confetti celebration

**Files:**
- Modify: `src/scripts/game-ui.js:324-346` (startRound — wrap in View Transition)
- Modify: `src/scripts/game-ui.js:922-989` (renderClassicSummary — add confetti)
- Modify: `src/styles/global.css` (View Transition CSS)

- [ ] **Step 1: Add View Transition CSS**

In `src/styles/global.css`, at the end of the animations section, add:

```css
/* =============================================
   View Transitions
   ============================================= */
::view-transition-old(root) {
  animation: 200ms ease-out fade-out;
}

::view-transition-new(root) {
  animation: 200ms ease-in fade-in;
}

@keyframes fade-out {
  from { opacity: 1; }
  to { opacity: 0; }
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

- [ ] **Step 2: Wrap round transitions in View Transitions API**

In `src/scripts/game-ui.js`, in the `startRound()` function (around line 324), wrap the DOM update in a View Transition:

Replace:
```javascript
function startRound() {
  currentRound = getNextRound();
```

With:
```javascript
function startRound() {
  currentRound = getNextRound();
```

Then where `renderRound()` and `window.scrollTo()` are called (around line 344-345), wrap them:

```javascript
if (document.startViewTransition && displayRound > 1) {
  document.startViewTransition(() => {
    renderRound();
    window.scrollTo({ top: 0 });
  });
} else {
  renderRound();
  window.scrollTo({ top: 0 });
}
```

Note: Only apply View Transition after the first round (displayRound > 1) to avoid a transition on initial load.

- [ ] **Step 3: Add confetti on perfect score**

In `src/scripts/game-ui.js`, at the top of the file (after the existing imports), add a lazy confetti import:

```javascript
let confettiModule = null;
import('canvas-confetti')
  .then(m => { confettiModule = m.default || m; })
  .catch(() => { /* confetti not available — skip */ });
```

Then in `renderClassicSummary()`, after the `tweenCounter` call, add:

```javascript
// Confetti celebration on perfect score
if (session.totalScore === 1000 && confettiModule) {
  setTimeout(() => {
    confettiModule({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#b85a3b', '#d4a07a', '#e8a54b', '#059669', '#ffd700'],
    });
  }, 600);
}
```

- [ ] **Step 4: Verify View Transitions and confetti**

Run dev server. Play through a game:
- Advancing between rounds should show a smooth cross-fade (in Chrome/Safari)
- Get a perfect score (all 10 correct) to verify confetti fires with terracotta/gold colors
- In Firefox (if no View Transition support), verify the game still works normally with instant DOM swaps

- [ ] **Step 5: Commit**

```bash
git add src/styles/global.css src/scripts/game-ui.js
git commit -m "feat: add View Transitions between rounds and confetti on perfect score"
```

---

### Task 11: Dark mode consistency pass

**Files:**
- Modify: `src/styles/global.css` (dark mode blocks and component overrides)

- [ ] **Step 1: Update dark mode shadows**

In dark mode, warm-tinted shadows should use darker warm tones. Add after the dark mode variable blocks:

```css
/* Dark mode shadow overrides */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .play-card,
  :root:not([data-theme="light"]) .compete-card {
    box-shadow: 0 2px 0 rgba(212, 121, 78, 0.2), 0 4px 12px rgba(0, 0, 0, 0.2);
  }

  :root:not([data-theme="light"]) .choice {
    box-shadow: 0 3px 0 rgba(255, 255, 255, 0.08);
  }

  :root:not([data-theme="light"]) .btn-primary {
    box-shadow: 0 3px 0 rgba(0, 0, 0, 0.3);
  }

  :root:not([data-theme="light"]) .btn-next-round {
    box-shadow: 0 3px 0 rgba(0, 0, 0, 0.3);
  }

  :root:not([data-theme="light"]) .btn-outline,
  :root:not([data-theme="light"]) .share-icon-btn,
  :root:not([data-theme="light"]) .reaction-btn {
    box-shadow: 0 2px 0 rgba(255, 255, 255, 0.05);
  }

  :root:not([data-theme="light"]) .lb-row:nth-child(odd) {
    background: rgba(255, 255, 255, 0.03);
  }
}

:root[data-theme="dark"] .play-card,
:root[data-theme="dark"] .compete-card {
  box-shadow: 0 2px 0 rgba(212, 121, 78, 0.2), 0 4px 12px rgba(0, 0, 0, 0.2);
}

:root[data-theme="dark"] .choice {
  box-shadow: 0 3px 0 rgba(255, 255, 255, 0.08);
}

:root[data-theme="dark"] .btn-primary,
:root[data-theme="dark"] .btn-next-round {
  box-shadow: 0 3px 0 rgba(0, 0, 0, 0.3);
}

:root[data-theme="dark"] .btn-outline,
:root[data-theme="dark"] .share-icon-btn,
:root[data-theme="dark"] .reaction-btn {
  box-shadow: 0 2px 0 rgba(255, 255, 255, 0.05);
}

:root[data-theme="dark"] .lb-row:nth-child(odd) {
  background: rgba(255, 255, 255, 0.03);
}
```

- [ ] **Step 2: Verify dark mode**

Toggle to dark mode. Check every screen:
- Homepage: cards have visible but subtle shadows
- Quiz: choices have light shadow, press-down still works
- Results: score readable, stats cards visible
- Leaderboard: rows alternate correctly

- [ ] **Step 3: Commit**

```bash
git add src/styles/global.css
git commit -m "style: dark mode shadow overrides for tactile components"
```

---

### Task 12: Responsive and mobile polish pass

**Files:**
- Modify: `src/styles/global.css` (responsive breakpoints)

- [ ] **Step 1: Update mobile breakpoints**

Find existing `@media (max-width: 480px)` blocks and add/update rules for new components:

```css
@media (max-width: 480px) {
  .summary-score {
    font-size: 2.5rem;
  }

  .summary-stats {
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }

  .summary-stat {
    padding: 10px 6px;
  }

  .summary-stat-val {
    font-size: 1.1rem;
  }

  .round-dots {
    gap: 4px;
  }

  .round-dot {
    width: 24px;
    height: 24px;
    font-size: 11px;
  }

  .share-icon-btn {
    width: 38px;
    height: 38px;
  }

  .n-prompt-title {
    font-size: 1rem;
  }

  .play-card {
    padding: 16px 10px;
  }

  .play-card-title {
    font-size: 1rem;
  }
}
```

- [ ] **Step 2: Verify on mobile viewport**

Open DevTools, toggle responsive mode to 375px width. Check:
- Homepage cards don't overflow
- Quiz choices fit in 2 columns
- Results score doesn't overflow
- Round dots are appropriately sized
- Share buttons are tappable (min 38px)

- [ ] **Step 3: Commit**

```bash
git add src/styles/global.css
git commit -m "style: responsive polish for mobile viewports"
```

---

### Task 13: Manual QA pass across all screens

**Files:** None (verification only)

- [ ] **Step 1: Test homepage**

Open `/`. Check: daily banner gradient, mode cards tactile, section headings in Fraunces, compete section, themed buttons, player stats card (if available).

- [ ] **Step 2: Test classic game flow**

Play `/play?set=bugs_101`. Check all 10 rounds: progress bar updates, photo rounded, choices tactile, feedback cards correct/wrong styling, results screen with dots/stats/POTD/share.

- [ ] **Step 3: Test time trial**

Play `/play?set=bugs_101_time_trial`. Check: timer display, fast transitions, score popup, results with time trial stats.

- [ ] **Step 4: Test streak mode**

Play `/play?set=bugs_101_streak`. Check: streak counter, green flash on correct, results with streak rank.

- [ ] **Step 5: Test daily challenge**

Open `/daily/play?mode=bugs101`. Check: photo, autocomplete, submit button, reveal screen.

- [ ] **Step 6: Test leaderboard**

Open `/leaderboard`. Check: segmented tabs, row styling, countdown.

- [ ] **Step 7: Test dark mode**

Toggle dark mode. Visit all pages. Check: shadows visible, text readable, cards distinguishable.

- [ ] **Step 8: Test mobile (375px)**

Repeat steps 1-7 in mobile viewport. Check: no overflow, tappable targets, readable text.

- [ ] **Step 9: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: QA polish fixes from manual testing"
```
