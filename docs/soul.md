# What's That Bug UX Soul

This document captures the product and UX preferences that should guide future work on What's That Bug. It is not a feature spec. It is the taste compass for design, content, flow, and interaction decisions.

## Product Feeling

What's That Bug should feel like a polished game first and an educational reference second.

The player should feel:

- Curious, not tested.
- Encouraged, not punished.
- In motion, not stuck in setup.
- Like they are learning to see patterns, not memorizing encyclopedia entries.

The game can be nerdy, but it should not feel academic. It can be cute, but it should not feel childish. It should feel warm, tactile, and alive.

## Core UX Principles

1. Preserve the game loop.

The basic loop is strong: see bug, choose answer, learn something, continue. Most UX changes should sharpen this loop rather than add new branches around it.

2. Polish before changing flows.

The preferred first move is usually better hierarchy, spacing, copy, animation, contrast, or state clarity. New mechanics and new flows should be added only when they solve a clear problem that polish cannot solve.

3. Keep decisions explicit when they matter.

Mode selection matters. Players should clearly see Classic, Time Trial, and Streaks. Do not hide mode choice behind an over-optimized one-tap path.

4. Reduce interruption, not intention.

If a screen gives the player a meaningful choice, keep it. If a screen exists mostly to buy load time or explain obvious rules, remove it or turn it into a lightweight state.

5. Teach through contrast.

The best learning moment is not "this is the correct answer." It is "here is how this differs from what you guessed."

6. Never make learning a dropoff trap.

Learning content should fit inside the play rhythm. It should not become a full-screen interstitial after every answer.

## Visual Design Preferences

The preferred visual language is warm, polished, playful, and tactile.

Use:

- Cream and warm off-white backgrounds.
- Dark brown hero cards for high-emphasis moments.
- Terracotta primary actions.
- Rounded cards and large tap targets.
- Tactile button shadows and press states.
- Fraunces for expressive headings, score numbers, and celebratory moments.
- Inter for UI text, controls, and supporting copy.
- Soft surfaces with strong enough text contrast.

Avoid:

- Generic SaaS dashboards.
- Overly clean but lifeless white-card layouts.
- Harsh red failure states.
- Cute decoration that competes with the bug photo.
- Big visual rewrites that do not improve the core game loop.

The design should feel more like a crafted casual game than a database front-end.

## Content Voice

Copy should be short, direct, and game-like.

Preferred copy style:

- Active verbs.
- Short sentences.
- Concrete promises.
- Friendly but not cloying.
- Educational only when useful.

Good examples:

- `Choose a set, then pick how you want to play.`
- `Game is starting... Please wait`
- `Close, but it is a beetle.`
- `Here is what gives this one away.`

Avoid:

- Over-explaining rules before play.
- Technical implementation language like `preloading 3 questions`.
- Too much "research-grade" or iNaturalist glazing.
- Fake rewards or claims that are not backed by a real feature.
- Dense encyclopedia copy in the main game loop.

Latin names are useful, but they are supporting information. Common names should be the primary readable label in answer options, followed by the Latin/scientific label in smaller italic text.

## Launch Flow

The launch flow should be set-first and mode-second.

Preferred behavior:

- Player chooses a set.
- A prominent mode selection panel appears.
- Classic, Time Trial, and Streaks are all easy to compare.
- The selected set remains visually anchored.
- After mode selection, show a dedicated preload state.

The rules popup should be removed. It existed mostly as a time bank for preloading. The better replacement is a purposeful loading screen with this copy:

`Game is starting... Please wait`

Do not add last-used mode memory unless there is a clear product reason later. It is not part of the current preferred flow.

## Gameplay Screen

Active gameplay should feel focused and mobile-first.

Preferred behavior:

- Hide or compress global site chrome during active play.
- Use a compact game HUD with only gameplay-critical information.
- Keep a clear back link.
- Keep progress, score, timer, or streak visible depending on mode.
- Prioritize the photo, prompt, and answer options.

The bug photo is the center of the experience. It should not be crowded by navigation or decorative elements.

Hard requirements:

- Photographer credit must remain visible on the image for iNaturalist compliance.
- `Report photo` should be explicit text, not just a flag icon.
- Answer options should show common name first and Latin/scientific label second in smaller italic text.

Future idea:

- A `Hints` toggle could swap Latin labels for identifying features. This changes difficulty and learning style, so treat it as a separate product decision.

## Feedback And Learning

Feedback should teach the player how to see better next time.

Wrong-answer feedback should include:

- A clear verdict.
- What the player chose.
- What the actual answer is.
- Two or three visible traits that distinguish the two.
- A secondary `Learn more` link.
- A clear `Next` action.

The placement matters. Keep the feedback card below the options, using the current smooth animated card pattern. Do not turn this into a full-screen learning screen after every question.

Correct-answer feedback should stay lighter. A correct answer should feel good and keep momentum.

The learning card should feel like a friendly nudge, not a lesson plan.

## Results Screens

Results should celebrate, invite replay, and encourage sharing.

Preferred hierarchy:

1. Score celebration.
2. `Play Again` as the primary action.
3. Visible sharing action, such as `Share Score` or `Challenge a Friend`.
4. Secondary actions like `Change Set` or another mode.
5. Feedback form lower down.

Sharing should stay visible because it supports game reach. The fix is not to bury sharing. The fix is to make sharing clean and visually secondary to replay.

Avoid:

- `top photo unlocked` unless it becomes a real feature.
- `Your pattern` unless the app has real data to support it.
- `Review misses` unless that flow exists.
- Results screens where feedback forms outrank replay or sharing.

## Daily Challenge

Daily should remain an exact-answer challenge for now.

Preferred improvements:

- Better pill spacing.
- Stronger selected state.
- Better submit hierarchy.
- More comfortable mobile targets.
- Optional lightweight filtering if it preserves the exact-answer model.

Avoid for now:

- Turning daily into a two-step category puzzle.
- Adding visual trait clusters as the main answer flow.
- Changing the daily objective as part of a general UI polish pass.

Daily can become a more guided recognition puzzle later, but that is a separate feature decision.

## Genera And Learning Pages

Learning/reference pages should support the game, not distract from it.

The genera index should stay a reference surface, but it should not be an overwhelming wall of cards.

Preferred direction:

- Search-first.
- Paginated or virtualized results.
- Bounded page height.
- Fast filtering.
- Clear links into species pages.

Avoid for this pass:

- A full guided learning hub.
- Large new learning paths by visual trait.
- Major information architecture changes unless the game loop needs them.

## Multiplayer

Multiplayer should feel like a shared game room, not a form workflow.

Preferred direction:

- Keep the `Multiplayer Beta` tag visible and intentional.
- Make the room code prominent.
- Make host setup clear.
- Make ready, joining, disconnected, and loading states readable as text.
- Keep players oriented around one cohesive room board.

Multiplayer is still in development, so the beta label is a feature, not an apology. It sets expectations honestly.

Avoid:

- Adding new multiplayer mechanics during visual polish.
- Hiding important room state in subtle styling.
- Making host and guest views feel like unrelated pages.

## Accessibility And Legibility

The app can stay soft and warm, but text and controls must be readable.

Preferences:

- Separate decorative tints from semantic UI tokens.
- Use stronger text colors for instructional and secondary copy.
- Use readable danger/miss states.
- Do not rely on opacity alone for wrong answers or disabled states.
- Add visible keyboard focus styles.
- Keep touch targets comfortable on mobile.

Accessibility improvements are not at odds with the game's visual style. They make the game easier to play in real conditions, especially on mobile.

## Growth And Sharing

Sharing is part of the product, not an afterthought.

Preferred behavior:

- Keep share visible on results screens.
- Make the share action feel celebratory.
- Use competitive copy when appropriate, like challenging a friend to beat a score.
- Preserve existing native share and platform-specific share options.

Do not let sharing overwhelm replay. Replay remains primary, but sharing should stay in the visible result flow.

## Implementation Taste

Prefer small, direct changes that improve the game immediately.

Good implementation style:

- Minimal new abstractions.
- Reuse existing routes and state where possible.
- Keep current mechanics unless the spec explicitly changes them.
- Avoid new dependencies.
- Prefer CSS and markup polish before new logic.
- Use real data only. Do not invent result claims or rewards.

When choosing between two valid approaches, pick the one that preserves the current game loop with less new machinery.

## UX Decision Checklist

Before shipping a UX change, ask:

- Does this make the first answer easier to reach without hiding meaningful choices?
- Does this keep the photo and answer options central?
- Does this teach through visible differences rather than generic facts?
- Does this preserve momentum after each answer?
- Does this keep sharing visible without burying replay?
- Does this improve mobile play?
- Does this use real product behavior and real data?
- Does this keep the warm polished game feel?

If the answer is no, the change probably needs to be simplified or moved to a separate feature discussion.
