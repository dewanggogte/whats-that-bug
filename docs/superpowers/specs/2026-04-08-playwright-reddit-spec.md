# Playwright Reddit Automation — Design Spec

> **Status:** Implementation complete — `scripts/reddit/human.mjs` and `scripts/reddit/poster.mjs` are built. This spec documents the design for reference.

Post to Reddit via a real Chromium browser session instead of the API (which requires approval). Every interaction uses human-behavior simulation to avoid detection. The browser always runs headed so the operator can see and approve every action.

## 1. Architecture

### File structure

```
scripts/reddit/
  poster.mjs      # Post orchestrator — session management, gallery/text/comment flows
  human.mjs       # Human behavior layer — typing, clicking, scrolling, delays
  config.mjs      # Subreddit config, templates
  content.mjs     # Post content generation
  api.mjs         # iNaturalist API queries
  copy.mjs        # Post copy/template helpers
  tracker.mjs     # Post tracking (what was posted where)
  calendar.mjs    # Scheduling logic
```

### Dependencies

- `playwright` (Chromium only — no Firefox/WebKit needed)

### Session persistence

Browser state (cookies, localStorage) saved to `.cache/reddit-browser-state/state.json` via Playwright's `storageState` API. Loaded on startup, saved after login and before browser close. This avoids re-authenticating on every run.

## 2. Human Behavior Layer (`human.mjs`)

All browser interactions go through these functions. `poster.mjs` never calls raw Playwright methods like `page.click()` or `page.fill()`.

### `slowType(page, selector, text)`

Types text character-by-character with realistic timing:
- 40–120ms delay per keystroke
- 5% chance of a longer 200–400ms "thinking" pause on any character
- 100–300ms post-completion delay (reviewing what was typed)
- Clicks the target element first to focus it

### `slowClick(page, selector)`

Clicks with human-like mouse movement:
- Waits for the element to appear (10s timeout)
- Calculates target: element center ±5px random offset
- Moves mouse from current tracked position to target in 3–6 interpolated steps with ease-out deceleration and ±2px jitter per step
- `mousedown` → 50–150ms hold → `mouseup` (not a single `.click()`)
- 200–500ms post-click delay

### `humanDelay(min, max)`

Pauses for a random duration using normal distribution (Box-Muller transform), centered at the midpoint of `[min, max]` with stddev = range/4. More natural than uniform random — values cluster around the middle.

### `randomScroll(page)`

Called between actions to add organic noise:
- 30% chance of firing (70% no-op)
- Scrolls 50–200px, randomly up or down
- 200–500ms pause after scrolling

### `tabBehavior(page)`

Simulates natural behavior after navigating to a new page:
1. Wait 1–3s (reading the page)
2. Scroll down 100–300px
3. Scroll back up by a similar amount
4. 20% chance of hovering a random `<a>` or `<button>` element (visual scanning)

## 3. Auth Flow

Managed by `ensureSession()` in `poster.mjs`. Returns `{ browser, context, page }`.

1. Launch Chromium with `--disable-blink-features=AutomationControlled`
2. Create browser context with saved `storageState` (if exists), custom viewport (1280x900), and a standard Chrome user agent string
3. Navigate to `reddit.com/` and check for logged-in indicators:
   - `#expand-user-drawer-button`
   - `[data-testid="user-drawer-button"]`
   - `button[aria-label*="profile"]`
4. If logged in: done
5. If not logged in:
   - Navigate to `reddit.com/login`
   - Run `tabBehavior` (natural page-load behavior)
   - Print instructions to terminal
   - **Pause** — wait for operator to complete login manually in the browser (handles username, password, 2FA, CAPTCHAs)
   - After operator presses Enter, navigate back to reddit.com and verify logged-in state
   - Save `storageState` to disk

The login flow is deliberately manual. Automating credential entry creates a single point of failure when Reddit changes their login UI, and storing plaintext credentials is a security risk. The operator types their own password.

## 4. Gallery Post Flow

`postGallery(page, subreddit, title, body, imagePaths, captions)`

1. Navigate to `reddit.com/r/{subreddit}/submit`
2. `tabBehavior` (natural page-load pause)
3. `slowClick` the "Images & Video" / "Images" tab (graceful fallback if tab not found)
4. Upload images via `page.setInputFiles()` on `input[type="file"][accept*="image"]`
   - Uses `setInputFiles` rather than drag-and-drop simulation — more reliable across Reddit UI versions
5. Wait 3–5s for uploads to process
6. `slowType` the title into the title field
7. `slowType` the body into the body/text field (if provided)
8. **PAUSE** — print post preview to terminal (subreddit, title, body, image count), ask `Submit this post? (y/N)`
9. If approved: `slowClick` the submit button, wait for URL to match `/comments/` (30s timeout)
10. Return the post URL (or `null` if declined)

Minimum 2s delay (`ACTION_DELAY`) between each Reddit action.

## 5. Text Post Flow

`postText(page, subreddit, title, body)`

Same as gallery post flow but:
- Selects "Text" tab instead of "Images" tab
- No file upload step
- Everything else identical: title, body, approval pause, submit

## 6. Follow-up Comment Flow

`postComment(page, postUrl, commentText)`

1. Navigate to the post URL
2. `tabBehavior` (natural page-load pause)
3. `slowClick` the comment composer (tries multiple selectors for new/old Reddit)
4. `slowType` the comment text
5. `randomScroll` (organic noise)
6. `slowClick` the "Comment" submit button

No approval pause for comments (unlike posts).

## 7. Anti-Detection Considerations

| Technique | Rationale |
|-----------|-----------|
| Stock Chromium with `--disable-blink-features=AutomationControlled` | Avoids the most common Playwright detection flag. No patched browser needed. |
| Human-like random delays on all actions | Every click, type, and scroll uses randomized timing with normal distribution. No fixed intervals. |
| Mouse movement interpolation | 3–6 step ease-out curve with jitter, not instant teleportation. |
| `mousedown`/`mouseup` instead of `.click()` | Real users don't produce instant click events. |
| `tabBehavior` on every page load | Natural reading/scrolling before interacting, plus random element hovers. |
| Session reuse via `storageState` | Login once, reuse cookies. Avoids repeated login flows that look automated. |
| Custom user agent | Standard Chrome UA string instead of Playwright's default. |
| Headed browser (always visible) | Operator sees exactly what's happening. Also avoids headless detection. |
| Terminal approval before every post | Human in the loop prevents runaway posting. |

### Rate limiting (enforced by the caller, not `poster.mjs`)

- Max 1 post per session
- Max 2 sessions per day
- Don't navigate directly to `/submit` — the current implementation does go directly, but a future improvement would be to browse the subreddit briefly first

## 8. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Reddit UI changes breaking selectors | High | Multiple fallback selectors for every element. Selectors use semantic attributes (`data-testid`, `aria-label`, `:has-text()`) over fragile class names. Manual testing needed periodically. |
| Account suspension for automated behavior | Medium | Human behavior layer, rate limiting, headed browser. Account is real and also used manually. No spammy patterns. |
| 2FA blocking automated login | Low | Login is manual — operator completes 2FA themselves in the browser. Not a blocker, just a minor inconvenience. |
| CAPTCHA during login or posting | Medium | Login is manual (operator solves it). If CAPTCHA appears during posting, the headed browser makes it visible — operator can intervene. No automated CAPTCHA solving. |
| New Reddit vs old Reddit UI differences | Medium | Selectors target new Reddit (sh.reddit.com / shreddit components). Old Reddit (`old.reddit.com`) is not supported. If Reddit serves old UI unexpectedly, selectors will fail gracefully. |

## 9. Session Cleanup

`closeBrowser(browser)` saves the current `storageState` from the first browser context before closing. This ensures session cookies are preserved even if the caller forgets to save state explicitly.
