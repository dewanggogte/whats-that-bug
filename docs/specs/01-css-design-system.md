# Spec 1: CSS Design System & Animation Library

**PRD features merged:** #10 CSS Cleanup (3B), #15 Modal/Popup System Overhaul (3D), #7 Micro-animations keyframes (4B)

**Files owned (only this spec touches these):**
- Modify: `src/styles/global.css`

**Files NOT touched:** No JS files. No Astro pages. This is pure CSS work.

**Contract produced:** CSS class names listed in Contract A below. These class names are frozen — Spec 3 (Game UI Enhancements) references them. Do not rename without coordinating.

---

## Context

The game is an Astro site at `src/`. Styles live in a single `src/styles/global.css` (2,359 lines). The file already has:
- CSS custom properties for light/dark themes (`:root`, `@media prefers-color-scheme`)
- Multiple ad-hoc modal patterns (`.rules-overlay`, `.lb-popup-overlay`, `.onboarding-overlay`) each with their own animation approach
- Basic `.flash-correct` / `.flash-wrong` keyframes
- Inconsistent spacing, border radius, and typography sizing

The warm/terracotta color palette (`--accent: #b85a3b` light, `#d4794e` dark) should be preserved — it's a deliberate design choice.

---

## Part 1: Design Token Cleanup

### 1A. Spacing Scale

Add a spacing scale as custom properties. Replace ad-hoc pixel values throughout the file with these tokens.

Add to `:root` (after the existing color properties):

```css
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
```

### 1B. Border Strategy

Standardize borders across the file. Replace existing border declarations with a consistent pattern:

- **Subtle dividers:** `1px solid var(--border)` (already used in most places — keep as-is)
- **Accent callouts:** `border-left: 3px solid var(--accent)` for feedback cards and callout elements
- **Surface containers:** `1px solid rgba(255,255,255,0.08)` in dark mode for floating elements

### 1C. Typography Tightening

Audit and standardize font sizes. The current file uses `2rem`, `1.1rem`, `0.9rem`, `0.85rem`, `0.78rem`, `13px`, `12px`, `14px` etc. inconsistently.

Standardize to this scale:
```
--text-xs:  0.75rem  (12px) — hints, captions
--text-sm:  0.85rem  (13.6px) — secondary text, metadata
--text-base: 1rem    (16px) — body text
--text-lg:  1.15rem  (18.4px) — section headers
--text-xl:  1.5rem   (24px) — page titles
--text-2xl: 2rem     (32px) — hero scores
```

Add these as custom properties. Then update existing rules to use them. Focus on the most impactful:
- `.summary-score` — currently `font-size: 3rem`, keep as special case
- `.subtitle` — use `--text-sm`
- `.badge` — use `--text-xs`
- `.choice-name` — use `--text-base`
- `.choice-latin` — use `--text-sm`

### 1D. Border Radius Standardization

Replace hardcoded border-radius values:
- Cards (`.feedback-card`, `.rules-card`, `.lb-popup`, `.onboarding-card`): `var(--radius-md)` (12px)
- Buttons (`.btn`): `var(--radius-sm)` (8px)
- Pills/badges (`.badge`, `.diff-badge`): `var(--radius-full)` (99px)
- Photo hero: `var(--radius-md)` (12px) — already correct

---

## Part 2: Animation Library

Add a reusable animation system. These keyframes and utility classes will be consumed by Spec 3 (Game UI Enhancements) to add micro-animations to gameplay.

### 2A. Keyframes

Add these keyframes (place them together in a new `/* Animations */` section, before the existing `@keyframes flashGreen`):

```css
/* =============================================
   Animation Library
   ============================================= */

@keyframes animFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes animSlideUp {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes animScaleBounce {
  0% { transform: scale(1); }
  50% { transform: scale(1.3); }
  100% { transform: scale(1); }
}

@keyframes animShake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-4px); }
  40% { transform: translateX(4px); }
  60% { transform: translateX(-4px); }
  80% { transform: translateX(4px); }
}

@keyframes animFloatUp {
  0% { opacity: 1; transform: translateY(0); }
  100% { opacity: 0; transform: translateY(-20px); }
}

@keyframes animCountUp {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes animEmojiPop {
  0% { opacity: 0; transform: scale(0.5); }
  70% { transform: scale(1.1); }
  100% { opacity: 1; transform: scale(1); }
}
```

### 2B. Utility Classes

```css
/* Animation utility classes */
.anim-fade-in {
  animation: animFadeIn var(--transition-normal) ease-out both;
}

.anim-slide-up {
  animation: animSlideUp var(--transition-modal) ease-out both;
}

.anim-scale-bounce {
  animation: animScaleBounce 200ms ease-out;
}

.anim-shake {
  animation: animShake 300ms ease-out;
}

.anim-float-up {
  animation: animFloatUp 600ms ease-out forwards;
}

/* Stagger children — add .stagger-in to parent, children get delayed entry */
.stagger-in > * {
  opacity: 0;
  animation: animSlideUp var(--transition-normal) ease-out both;
}
.stagger-in > *:nth-child(1) { animation-delay: 0ms; }
.stagger-in > *:nth-child(2) { animation-delay: 50ms; }
.stagger-in > *:nth-child(3) { animation-delay: 100ms; }
.stagger-in > *:nth-child(4) { animation-delay: 150ms; }

/* Emoji grid stagger — add .emoji-stagger to grid, wrap each emoji in .emoji-char */
.emoji-stagger .emoji-char {
  display: inline-block;
  opacity: 0;
  animation: animEmojiPop 200ms ease-out both;
}
/* Delays are set dynamically via inline style: style="animation-delay: ${i * 100}ms" */
```

### 2C. Refine Existing Flash Animations

Replace the current `.flash-correct` and `.flash-wrong` (around line 1248) with improved versions:

```css
/* Replace existing flash-correct / flash-wrong */
.flash-correct {
  animation: flashGreen 400ms ease-out;
}

.flash-wrong {
  animation: flashRed 400ms ease-out, animShake 300ms ease-out;
}

@keyframes flashGreen {
  0% { box-shadow: inset 0 0 0 0 rgba(5, 150, 105, 0); }
  50% { box-shadow: inset 0 0 0 3px rgba(5, 150, 105, 0.4); }
  100% { box-shadow: inset 0 0 0 0 rgba(5, 150, 105, 0); }
}

@keyframes flashRed {
  0% { box-shadow: inset 0 0 0 0 rgba(220, 38, 38, 0); }
  50% { box-shadow: inset 0 0 0 3px rgba(220, 38, 38, 0.3); }
  100% { box-shadow: inset 0 0 0 0 rgba(220, 38, 38, 0); }
}
```

---

## Part 3: Session Progress Bar

New component used by Spec 3 to show round completion during classic mode.

```css
/* =============================================
   Session Progress Bar
   ============================================= */
.session-progress {
  display: flex;
  gap: 3px;
  padding: var(--space-2) 0;
}

.session-progress-segment {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: var(--border);
  transition: background var(--transition-fast);
}

.session-progress-segment.filled {
  background: var(--success);
}

.session-progress-segment.filled-close {
  background: var(--warning);
}

.session-progress-segment.filled-miss {
  background: var(--error);
}

.session-progress-segment.current {
  background: var(--accent);
  animation: pulse 1.5s ease-in-out infinite;
}
```

---

## Part 4: Unified Modal System

The codebase has 3 modal patterns with different class names, animations, and behaviors:
1. `.rules-overlay` / `.rules-card` — game rules popup (game-ui.js)
2. `.lb-popup-overlay` / `.lb-popup` — leaderboard celebration (leaderboard-ui.js)
3. `.onboarding-overlay` / `.onboarding-card` — first-visit modals (onboarding.js)

### 4A. Base Modal Classes

Add new base modal classes. Do NOT delete the existing modal styles yet — the JS still references them. Instead, add the new base classes so Spec 3 can migrate the JS incrementally.

```css
/* =============================================
   Modal Base System
   ============================================= */
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity var(--transition-modal);
  padding: var(--space-4);
}

.modal-backdrop.visible {
  opacity: 1;
}

.modal-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-6);
  max-width: 420px;
  width: 100%;
  max-height: 85vh;
  overflow-y: auto;
  transform: translateY(16px);
  opacity: 0;
  transition: transform var(--transition-modal), opacity var(--transition-modal);
}

.modal-backdrop.visible .modal-card {
  transform: translateY(0);
  opacity: 1;
}

.modal-card--bottom {
  /* Bottom-sheet variant for mobile — applied via media query */
}

@media (max-width: 600px) {
  .modal-backdrop {
    align-items: flex-end;
    padding: 0;
  }

  .modal-card {
    max-width: 100%;
    border-radius: var(--radius-md) var(--radius-md) 0 0;
    max-height: 80vh;
    padding: var(--space-6) var(--space-4);
  }

  .modal-backdrop.visible .modal-card {
    transform: translateY(0);
  }
}
```

### 4B. Achievement Toast (for Spec 4)

```css
/* =============================================
   Achievement Toast
   ============================================= */
.achievement-toast {
  position: fixed;
  top: var(--space-4);
  right: var(--space-4);
  z-index: 250;
  background: var(--surface);
  border: 1px solid var(--accent);
  border-left: 3px solid var(--accent);
  border-radius: var(--radius-sm);
  padding: var(--space-3) var(--space-4);
  display: flex;
  align-items: center;
  gap: var(--space-3);
  animation: animSlideUp var(--transition-normal) ease-out both;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  max-width: 320px;
}

.achievement-toast-icon {
  font-size: 1.5rem;
  flex-shrink: 0;
}

.achievement-toast-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.achievement-toast-name {
  font-weight: 600;
  font-size: var(--text-sm);
  color: var(--text);
}

.achievement-toast-desc {
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.achievement-toast.fade-out {
  animation: animFloatUp 400ms ease-out forwards;
}
```

---

## Part 5: Score Counter Transition

For animating score changes (Spec 3 will add/remove a class to trigger this):

```css
/* Score counter animation */
.score-counter-tween {
  display: inline-block;
  animation: animCountUp 300ms ease-out;
}
```

---

## Implementation Notes

### What to change vs. what to leave alone

- **Change:** Spacing values, border-radius values, font-size values, add new animation/modal/progress classes
- **Leave alone:** All color values (the palette is intentional), all layout structure, all JS-facing class names that JS currently references (`.rules-overlay`, `.lb-popup-overlay`, `.onboarding-overlay`, `.flash-correct`, `.flash-wrong`)
- **Keep old modal classes:** The existing `.rules-overlay`, `.lb-popup-overlay`, `.onboarding-overlay` classes must remain because JS files reference them. The new `.modal-backdrop` / `.modal-card` system exists alongside them. Spec 3 will migrate the JS to use the new classes, and a cleanup pass will remove the old ones later.

### Testing

1. Run `npm run dev` and verify the site renders correctly on both light and dark modes
2. Check that all existing pages load without visual regression: `/`, `/play?set=all_bugs`, `/play?set=bugs_101_time_trial`, `/daily/play?mode=bugs101`, `/leaderboard`
3. Verify new animation classes work by temporarily adding them to elements in browser DevTools
4. Check mobile responsive behavior at 375px and 600px breakpoints

### Risks

- **Spacing token migration** can introduce subtle layout shifts if padding/margin values are changed on existing elements. Test all pages visually after each batch of changes.
- **Adding `backdrop-filter: blur(4px)`** may cause performance issues on low-end mobile devices. The existing onboarding already uses this pattern, so it's a known-safe approach for this user base.

---

## Contract A: CSS Classes Produced

This is the authoritative list of CSS classes this spec creates. Spec 3 will reference these. Do not rename.

```
.anim-fade-in
.anim-slide-up
.anim-scale-bounce
.anim-shake
.anim-float-up
.stagger-in
.emoji-stagger / .emoji-char
.session-progress / .session-progress-segment / .filled / .filled-close / .filled-miss / .current
.score-counter-tween
.modal-backdrop / .modal-backdrop.visible
.modal-card / .modal-card--bottom
.achievement-toast / .achievement-toast-icon / .achievement-toast-text / .achievement-toast-name / .achievement-toast-desc / .achievement-toast.fade-out
.flash-correct (refined)
.flash-wrong (refined, now includes shake)
```
