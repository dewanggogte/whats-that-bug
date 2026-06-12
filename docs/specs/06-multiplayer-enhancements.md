# Spec 06: Multiplayer Enhancements

Derived from production log analysis (June 2026). Five targeted improvements addressing an active breakage, partially-wired features, and gaps surfaced by real play sessions.

**Parts:**
- A — Fix per-IP rate limit breaking corporate group play (active issue)
- B — Wire daily challenge end screen to the existing multiplayer nudge
- C — Raise player cap to 20 and add group session creation flow
- D — Nudge high-scoring binary players toward genus mode
- E — Expose host kick controls during active gameplay

**Files owned:**
| Part | Files |
|------|-------|
| A | `party/rate-limit.ts`, `party/server.ts` |
| B | `src/scripts/daily-ui.js` |
| C | `party/room-state.ts`, `src/scripts/party/ui-lobby.js`, new `src/scripts/party/ui-group.js` |
| D | `src/scripts/game-ui.js` |
| E | `src/scripts/party/ui-game.js` |

**Dependencies:** None. All parts are fully independent.

---

## Context

Log analysis from a June 2026 evening session (15 rooms, ~14 players) revealed:
1. Three users hit HTTP 429 simultaneously from a shared corporate IP (Teams referrer). The per-IP rate limit is the wrong primitive for group play.
2. `mp-nudge.js` exports `maybeShowMpNudgePostGame()` and it is called from `game-ui.js` — but `daily-ui.js` never imports or calls it. Daily challenge players never see the multiplayer prompt.
3. Groups of 14 self-sort into parallel rooms by hand. No tooling exists to generate multiple pre-configured rooms at once.
4. Genus mode has active players in the logs but no in-product discoverability path.
5. Host kick works server-side (`handleKick` / `kickPlayer`) but the UI is only rendered in the lobby — not during active gameplay.

---

## Part A: Per-IP Rate Limit Fix

### Problem

`party/rate-limit.ts:1-2` enforces 5 room creates per IP per 60-minute window. Three users (`496c13cc`, `b645cf62`, `dbe9e6c3`) exhausted this from the same apparent corporate NAT at 22:06:35. The block was never lifted in the observed log window.

### A1. Update `party/rate-limit.ts`

Raise the limit and switch the key from IP to a caller-supplied string (so the server can pass `userId` or IP):

```typescript
// Replace existing constants:
const WINDOW_MS = 60 * 60 * 1000;
const MAX_CREATES = 5;

// With:
const WINDOW_MS = 60 * 60 * 1000;
const MAX_CREATES_PER_KEY = 15;
```

Change the exported function signature so the key is passed in rather than derived internally:

```typescript
// Before:
export function checkRateLimit(ip: string): boolean

// After:
export function checkRateLimit(key: string): boolean
```

The internal store (Map or similar) uses whatever string is passed as the key — no other changes needed inside the function.

### A2. Update call site in `party/server.ts:104-108`

Pass `userId` as the rate limit key when available; fall back to IP for unauthenticated requests:

```typescript
const userId = body?.userId ?? null;
const clientIp = request.headers.get('cf-connecting-ip')
  ?? request.headers.get('x-forwarded-for')
  ?? 'unknown';
const rateLimitKey = userId ?? clientIp;

if (!checkRateLimit(rateLimitKey)) {
  return new Response('Too many rooms created', { status: 429 });
}
```

Per-user limiting means each individual is capped at 15 rooms/hour regardless of their network. A group of 10 people on corporate NAT each get their own independent quota.

---

## Part B: Daily Challenge → Multiplayer Nudge

### Problem

`mp-nudge.js:151-154` exports `maybeShowMpNudgePostGame()`. It is imported and called in `game-ui.js` post-session. `daily-ui.js:449-582` (`renderReveal`) never imports or calls it.

### B1. Modify `src/scripts/daily-ui.js`

Add import at the top alongside existing imports:

```javascript
import { maybeShowMpNudgePostGame } from './mp-nudge.js';
```

Call it at the bottom of `renderReveal()`, after all reveal content is rendered:

```javascript
// At the bottom of renderReveal():
maybeShowMpNudgePostGame();
```

That is the entire change. The nudge handles its own impression tracking, frequency capping, and snooze logic internally.

---

## Part C: Raise Player Cap to 20 + Group Session Creation

### C1. Raise the player cap

In `party/room-state.ts`, find the constant enforcing the 5-player limit and raise it:

```typescript
const MAX_PLAYERS = 20; // raised from 5
```

In `src/scripts/party/ui-lobby.js:164-167`, the header displays `"Players (X connected · Y/5 in room)"`. Replace the hardcoded `5` with `MAX_PLAYERS`. Since this value crosses the server/client boundary, the cleanest approach is to include it in the room state broadcast (the server already sends full state to all clients on every change) — add it to the state object, or derive it from an imported shared constant if one exists.

**UI scaling note:** With 20 players the lobby roster list will be tall. Add `max-height: 360px; overflow-y: auto;` to the roster container if it doesn't already have it.

### C2. Group session creation

Add a "Create Group Session" flow alongside the existing single-room path. The organizer generates N pre-configured rooms in one action and gets all invite links at once.

**New file: `src/scripts/party/ui-group.js`**

#### Room creation

```javascript
async function createGroupRooms(count, setKey, scoringMode) {
  const creates = Array.from({ length: count }, () =>
    requestCreateRoom({ setKey, scoringMode })
  );
  return Promise.all(creates); // [{ roomId: 'XXXX', url: '...' }, ...]
}
```

Reuses the existing `requestCreateRoom()` function — no new API surface needed. The N parallel calls each consume one slot of the rate limit quota (now 15/hour after Part A).

#### Modal UI

Triggered by a "Create Group Session" button on the party landing page. The modal collects:
- Number of rooms: 2 / 3 / 4 (segmented control or radio)
- Game set: same dropdown as single-room creation
- Scoring mode: binary / genus

On "Create Rooms", call `createGroupRooms()` and replace the modal body with a share sheet.

#### Share sheet

After creation:
- Heading: "Your [N] rooms are ready"
- One row per room: room code (large monospace), individual "Copy Link" button, QR code (import the existing QR helper used in the single-room lobby)
- "Copy All Links" button — puts all N URLs on the clipboard as a newline-separated list
- Footer note: "Each room holds up to 20 players. Share one link per group."

#### No coordination mechanic (by design)

Rooms are independent after creation. Each room's host starts their own game. There is no "launch all rooms simultaneously" server mechanism — groups self-coordinate the same way they do today. The value is link generation and sharing, not orchestration.

#### Analytics

Log one event after successful group creation:

```javascript
logEvent('mp_group_created', {
  room_count: count,
  set_key: setKey,
  scoring_mode: scoringMode,
});
```

#### Wiring

Add a "Create Group Session" link below the existing "Create Room" button on the party landing page. The page script imports `ui-group.js` and calls `initGroupCreate()` on load to attach the click handler.

---

## Part D: Genus Mode Progression Nudge

### Problem

No in-product path exists to discover genus mode. It has active users in logs but only via direct URL manipulation or prior knowledge.

### D1. Add nudge logic to `src/scripts/game-ui.js`

At the end of the solo session summary render, call a new function:

```javascript
function maybeNudgeGenusMode(session) {
  if (session.scoringMode !== 'binary') return;

  const correctCount = session.rounds.filter(r => r.score > 0).length;
  if (correctCount < 8) return; // threshold: 80%+

  if (!setSupportsGenusMode(session.setKey)) return;

  const lastShown = parseInt(localStorage.getItem('genus_nudge_last_shown') ?? '0');
  if (Date.now() - lastShown < 3 * 24 * 60 * 60 * 1000) return;

  localStorage.setItem('genus_nudge_last_shown', String(Date.now()));
  showGenusModeNudge(session.setKey);
}

function setSupportsGenusMode(setKey) {
  // Binary-only sets have no genus variant
  const binaryOnly = ['bugs_101', 'backyard_basics'];
  return !binaryOnly.includes(setKey);
}

function showGenusModeNudge(setKey) {
  const nudge = document.createElement('div');
  nudge.className = 'genus-nudge-card';
  nudge.innerHTML = `
    <p>Nice score! Ready for a harder challenge?</p>
    <a href="?set=${setKey}&mode=genus" class="btn-secondary">Try Genus Mode →</a>
  `;
  document.querySelector('#session-summary')?.appendChild(nudge);
}
```

Call `maybeNudgeGenusMode(session)` at the end of the summary render, after the summary HTML is in the DOM.

**Verify before implementing:** Confirm the `binaryOnly` set list against `public/data/sets.json`. The list above is based on log observations — adjust if the data disagrees.

---

## Part E: Mid-Game Host Kick UI

### Problem

`handleKick` (`party/server.ts:382-401`) and `kickPlayer` (`party/room-state.ts:100-105`) work correctly server-side. Kick buttons render in `ui-lobby.js:194-201` via `updateRoster()`, which is only called from `renderRoom()`. `renderRoom()` returns early when `status === 'playing'` (`ui-lobby.js:101`), so there is no kick UI during an active game.

### E1. Modify `src/scripts/party/ui-game.js`

In `renderHostActions()` (`ui-game.js:366-377`), add a collapsible players panel after the existing "End Game" button. `<details>/<summary>` keeps it out of the way by default:

```javascript
function renderHostActions(state, myUserId) {
  const container = document.querySelector('#mp-host-actions');
  if (!container) return;

  // Preserve open/closed state across re-renders
  const wasOpen = container.querySelector('.host-players-panel')?.open ?? false;

  // ... existing End Game button (unchanged) ...

  const playerRows = state.players
    .filter(p => p.userId !== myUserId)
    .map(p => `
      <div class="host-player-row">
        <span class="player-name">${escapeHtml(p.name)}</span>
        ${p.connected ? '' : '<span class="player-disconnected">(disconnected)</span>'}
        <button class="kick-btn" data-userid="${p.userId}"
                aria-label="Remove ${escapeHtml(p.name)}">Remove</button>
      </div>
    `).join('');

  const panel = document.createElement('details');
  panel.className = 'host-players-panel';
  panel.open = wasOpen;
  panel.innerHTML = `
    <summary>Players (${state.players.length})</summary>
    <div class="host-players-list">${playerRows}</div>
  `;
  container.appendChild(panel);

  panel.querySelectorAll('.kick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.closest('.host-player-row').querySelector('.player-name').textContent;
      if (confirm(`Remove ${name} from the game?`)) {
        client.send({ type: 'kick', userId: btn.dataset.userid });
      }
    });
  });
}
```

The `wasOpen` preservation prevents the panel collapsing on every new round render. The `escapeHtml` helper is already present in the file.

---

## Testing

**Part A**
- Create 15 rooms rapidly under the same `userId` and verify the 16th is blocked.
- Repeat from two different `userId`s on the same IP — each should get their own independent quota.

**Part B**
- Complete a daily challenge; verify the multiplayer nudge modal appears after the reveal.
- Dismiss it, complete another daily challenge within the snooze window; verify it does not appear again.

**Part C**
- Join a room as the 20th player; verify entry is allowed.
- Attempt to join as the 21st; verify rejection with a clear error message.
- Use the group creation flow to create 3 rooms; verify all 3 room codes and invite links are shown.
- Verify "Copy All Links" places all 3 URLs on the clipboard.

**Part D**
- Complete a 10/10 binary session on `all_bugs`; verify the genus nudge card appears in the summary.
- Complete a 6/10 binary session; verify no nudge.
- Complete a 10/10 binary session on `bugs_101`; verify no nudge (binary-only set).
- Trigger the nudge, reload, complete another high-scoring session within 3 days; verify no nudge (frequency cap).

**Part E**
- As host during an active game, verify the Players panel is present and lists all other players.
- Verify the host's own name is not listed with a kick button.
- Open the panel, start a new round; verify it stays open across the re-render.
- Kick a player mid-game; verify they receive a kicked message and the host's list updates.

---

## Risks

| Part | Risk | Mitigation |
|------|------|------------|
| A | Removing per-IP guardrail; a user generating many userIds could bypass the limit | userId is a server-issued session token, not user-supplied input; not trivially forgeable |
| C (cap) | 20-player game is untested; distractor generation and results display were built for small groups | Monitor first 20-player sessions; no code change needed until an edge case surfaces |
| C (group) | N parallel `__create` calls consume N rate-limit slots | After Part A, the limit is 15/user/hour — a 4-room group session uses 4 slots, well within budget |
| D | `binaryOnly` set list is hardcoded | Verify against `sets.json` before implementing; add a data-driven check if the set list grows |
| E | Players panel re-renders on every round | The `wasOpen` preservation (read before clear, restore after append) handles this |
