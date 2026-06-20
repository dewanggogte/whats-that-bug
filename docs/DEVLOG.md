# Dev Log

Interesting problems, non-obvious decisions, and lessons learned during development.

---

## 2026-06-13: Group session share links silently break without the createToken — spec missed it

### The problem

Spec 06 Part C2 says group session creation "reuses the existing `requestCreateRoom()` function — no new API surface needed." That's true for the server. But the spec's share sheet just copies the room URL (`/party?code=ABCD`). Anyone who clicks that link and is the first to join gets rejected with `ROOM_NOT_FOUND`.

### Why it happened

The room creation endpoint returns a `{ code, createToken }` pair. The token is a server-issued HMAC that proves you're the legitimate creator of that room. The `handleIdentify` handler on the server checks it on the **first** connection to an empty room — if the token is absent or invalid, the connection is rejected. For single-room creation, this is invisible: the organizer stores the token in `sessionStorage` before navigating, and is always the first to connect. For group sessions, the organizer creates N rooms and then hands links to N other people. Those people are the first to navigate to each room — and they have no token.

The spec's "no new API surface" claim is correct (no new endpoints), but it glosses over the client-side requirement: the token must travel with the share link.

### The fix

Embed the `createToken` as a `ct` query param in group session URLs:
```
/party?code=ABCD&ct=<token>
```
`showRoom()` in `index.astro` already runs before `initPartyRoom()`. One line reads the `ct` param and writes it to `sessionStorage` under the same key the lobby code already looks for (`wtb_party_create_${code}`). The token is then consumed normally on first join. No server changes, no new storage keys.

The token is a one-time proof-of-creation — it only passes verification when the room has zero players. Embedding it in a URL is safe in this context: it can't be replayed once a player has joined, and it carries no user data.

### Key insight

"Reuse existing function X — no new API surface" can mask a hidden coupling: that function may depend on side-effects (here, a `sessionStorage` write) that happen automatically in the single-flow path but silently don't in the new flow. When adapting a single-item flow to a bulk flow, trace every side-effect of the original path and check whether it still fires for each item.

---

## 2026-06-12: Log analysis reveals per-IP rate limit is the wrong primitive for corporate group play

### The problem

Three users hit HTTP 429 simultaneously at 22:06:35 during an evening multiplayer session (~14 players, 15 rooms). All three had a `statics.teams.cdn.office.net` referrer — the Teams desktop client injects this when a user opens a link from a chat message. The rate limit was never lifted in the observed log window, meaning those three players were locked out for the rest of the session.

### Why it happened

`party/rate-limit.ts` keys the limit on the request IP and allows 5 room creates per IP per hour. Corporate offices route all employee traffic through a shared NAT, so every player in the office appears as a single IP. A group of friends playing from work can exhaust the limit in minutes — not through abuse, but through normal group play.

The Teams referrer was the tell. Without it, this would look like three unrelated users coincidentally hitting the limit at the same second.

### The fix

Switch the rate limit key from IP to `userId` (the server-issued session token already present on every party request), with IP as fallback for unauthenticated requests. Raise the per-key limit from 5 to 15. Spec 06 Part A covers the exact changes to `party/rate-limit.ts` and the call site in `party/server.ts`.

### Key insight

Per-IP rate limiting is the right primitive for preventing anonymous abuse, but the wrong one for any feature where a legitimate use case involves multiple people on the same network acting simultaneously. Group play, team tools, classroom use — all of these punish per-IP limits. When you already have a user identity in the request (even a pseudonymous session token), use it as the rate limit key. IP should be the fallback of last resort, not the default.

---

## 2026-06-03: Funnel events *still* lost on navigation — `pagehide` + `sendBeacon` isn't reliable for programmatic nav

### The problem

A follow-up to the 2026-06-01 funnel entry below. After adding a `pagehide` listener that beacons the queue, `mp_create_click` / `mp_room_created` / `mp_join_click` were *still* missing on some sessions. Two real sessions on the **identical** create flow disagreed: one (`313c252b`) lost both create-handler events; another (`a9404e91`) kept both. Same code path, different outcome — a race, not a logic bug.

### Why it happened

The 2026-06-01 fix assumed `pagehide` → `sendBeacon` reliably flushes the queue on same-tab navigation. It doesn't — `sendBeacon` fired during the unload of a JS-initiated `window.location.href` is dropped by the browser intermittently. `mp_landing` always survived only because the 5s batch timer flushed it (via `keepalive` fetch) *before* the click, never because the beacon worked. The tell: every **single-player** logger (`logRoundComplete`, `logSessionEnd`, …) calls `flush()` inline and never loses events, while `logMultiplayerEvent` only *enqueues* — so the multiplayer events logged microseconds before a navigation were the only ones exposed.

### The fix

Call the existing `flush()` synchronously right before each programmatic navigation that follows an mp event (create, join, kicked). `flush()` uses a `keepalive` fetch, kicked off **while the page is still fully alive** — the demonstrably reliable path here. It `queue.splice(0)`s, so the `pagehide` handler stays as a no-op safety net (no dupes), and batching is otherwise preserved.

### Key insight

`sendBeacon` is sold as *the* unload-time transport, but for a navigation **you initiate in JS**, the reliable move is to send the request yourself *before* triggering the navigation — don't defer to the unload event you just caused. `keepalive: true` fetch started pre-navigation survives the page teardown; a beacon queued mid-unload may not. And when one family of events drops while a sibling family on the same queue never does, look at *who flushes inline* — the asymmetry points straight at the cause.

---

## 2026-06-01: "PartyKit server keeps stopping" — a Vercel *Sensitive* flag silently emptying a build-time `PUBLIC_` var

### The problem

Multiplayer room creation broke intermittently — users got "PartyKit server is not running." Redeploying "fixed" it for a while, then it broke again. The whole mental model was wrong: PartyKit runs on Cloudflare Durable Objects (serverless, on-demand), so there is no long-lived process to crash. "The server stopped" was a misread.

### Why it happened

The deployed client bundle had `getPartyHost()` minified down to an **unconditional** `throw new Error("PUBLIC_PARTY_HOST is not configured")` — so `requestCreateRoom()` threw on its first line, *before* any `fetch`. That's why no `__create` request ever showed in the Network tab (which sent us chasing a backend rate-limiter for two rounds). The host string was empty at build time.

Root cause: `PUBLIC_PARTY_HOST` was marked **Sensitive** in Vercel. Sensitive env vars are *write-only* — their values cannot be read back via `vercel pull`. Our GitHub Actions workflow builds the frontend on a runner (`vercel pull` + `vercel build`), so the Sensitive value was never retrieved, and Astro inlined `import.meta.env.PUBLIC_PARTY_HOST` as `""`. Dashboard "Redeploy" builds on Vercel's *own* infra (where Sensitive values are available at build time), which produced a working bundle — exactly why redeploying appeared to fix it, then a CI push re-broke it.

### The fix

Recreated the var as non-Sensitive (you can't toggle Sensitive off — delete + recreate), and made the workflow self-sufficient by passing `PUBLIC_PARTY_HOST` to the build step from a GitHub Actions Variable, so it no longer depends on `vercel pull` at all. Confirmed by re-fetching the live bundle: `const Rt="wtb-party.dewanggogte.partykit.dev"` is now inlined and the `throw` is gone.

### Key insight

Two. (1) **"Sensitive" on a build-time `PUBLIC_` var is a pure footgun** — it gives zero secrecy (Astro ships the value into client JS for every browser to read) while breaking any external CI that relies on `vercel pull`. Sensitive is for runtime server secrets only. (2) **A swallowed error doesn't just lose information — it lies.** The create handler's `catch` showed a generic "dev server not running" alert and discarded the real error, which actively pointed us at the wrong component. Log the real error and surface the actual cause; one `console.error(err)` would have made this a 30-second diagnosis instead of a multi-round hunt.

---

## 2026-06-01: Funnel analytics lost on navigation — `visibilitychange` alone isn't enough

### The problem

Multiplayer funnel events (`mp_landing`, `mp_create_click`, `mp_room_created`) fired on only *some* sessions, device-dependent.

### Why it happened

Events are queued and flushed on one of: a 5s timer, a 10-event batch, or `visibilitychange:hidden` (which beacons the queue). The funnel events that fire right before `window.location.href` navigation were enqueued but never explicitly flushed — and `visibilitychange:hidden` does **not** reliably fire on same-tab navigations (`location.href`) across browsers. So on a fast session (click Create within 5s, navigate into the room), the timer hadn't fired and the beacon trigger never ran → those events were silently dropped. Slow sessions survived via the 5s timer, which is why it looked intermittent.

### The fix

Added a `pagehide` listener alongside `visibilitychange`, both calling the same beacon-flush function. `pagehide` reliably fires on navigation. No duplicate-send risk: both handlers `queue.splice(0)`, so whichever fires first empties the queue and the other is a no-op.

### Key insight

For unload-time work (analytics beacons, last-moment state saves), `visibilitychange:hidden` catches tab-switch/backgrounding but **misses same-tab navigations**. The Page Lifecycle-correct pattern is to listen to *both* `visibilitychange` and `pagehide` — neither alone covers every way a page can go away.

---

## 2026-05-19: Daily challenge — designing the failure class out instead of fixing the job

### The problem

The daily challenge had shown "No challenge today" for ~19 days. The surface bug was "the content pipeline wasn't re-run," but that's a symptom: the architecture *had* a job — a manual/cron `generate-daily.mjs` step that produced N future days of one-shot, date-keyed manifest entries. Any job-shaped thing has a "didn't run / ran and failed silently" failure mode, and a 7-day buffer just delays the blank, it doesn't remove it.

### Why it happened

Root cause was structural, not operational. One-shot per-date content + a generation step you must remember to run = an outage is only ever one missed run away. Adding monitoring/cron would have been treating the symptom.

### The fix

Make day→bug a **pure deterministic function of the date over a reusable pool**, computed client-side: `schedule[today]` if present, else `pool[hashDate(today) % pool.length]`. There is no job to fail. A blank day is now impossible by construction as long as the pool is non-empty — the hash fallback holds even if the look-ahead schedule lapses for months. Crops are stored per-observation and reused, so manual review effort is decoupled from daily supply (review once, serve forever).

### Key insight

When a recurring outage traces to "the job didn't run," the highest-leverage fix is often to delete the job, not harden it. Also: before building data enrichment, trace the data to its render site — the spec called for backfilling `wikipedia_summary` from a curated store, but `renderReveal()` never displays that field, so the entire backfill was dead work and was cut. Verifying the consumer before building the producer saved a whole pipeline.

---

## 2026-05-18: Self-describing option names + the getBugs101Name 9-file landmine

**The problem:** In genus/taxonomic-scored sets (e.g. "Eye Candy"), option cards showed a bare species common name with the Latin genus as subtitle — e.g. `Quebec Emerald` / *Somatochlora*. The common name alone doesn't tell a player what kind of bug it is, and for distractors it's an arbitrary representative species of that genus.

**The fix:** A display-layer `withGroupNoun()` in `game-ui.js` appends the lay group noun from the existing `getBugs101Name()` (`Quebec Emerald` → `Quebec Emerald Dragonfly`), skipping when the name already contains that word (`Wheel Bug`, `Lady Beetle`).

**Why it got bigger:** Sweeping all 4,032 observations showed ~67 double-noun / wrong-noun artifacts (`Asian Lady Beetle Ladybug`, `Woodland Meadow Katydid Cricket`, `… Termite Cockroach`). Root cause: `getBugs101Name` returned a vernacular that didn't match iNaturalist's common name. Fixed by `Coccinellidae→Beetle`, splitting `Tettigoniidae→Katydid` out of the cricket families, and adding a `TERMITE_FAMILIES→Termite` branch in Blattodea.

**Key insight (the landmine):** `getBugs101Name` is **copy-pasted across 6 files**, of which 4 produce the answer label (`game-engine.js`, `review-server.mjs`, `generate-daily.mjs`, `fetch-daily-candidates.mjs`) and 2 are a deliberately coarser `getBugs101Category` for set bucketing (`fetch-data.mjs`, `rebuild-sets.mjs`). It's also coupled to 3 hardcoded allow-lists (`daily-ui.js` autocomplete, `review-server.mjs` ×2, `generate-daily.mjs`). Any category change has a **9-file blast radius**, and the two function variants are intentionally *not* equivalent. The coarse variant only affects `bugs_101` set membership, not the displayed answer, so it was deliberately left untouched. Changing only the client copy would silently desync daily-challenge categorization from the runtime.

---

## 2026-04-17: Full UI Revamp + Profile Page

### The UI Revamp (20 commits)

**Problem:** The game UI was functional but felt like a utility app. Players weren't sharing results or coming back — the experience lacked the "juice" that makes games feel alive.

**Approach chosen:** Direction A (Evolution) — keep the warm terracotta palette but elevate it with:
- **Fraunces/Inter typography** — serif display font adds personality to scores and headings
- **Duolingo-style tactile buttons** — 3px colored bottom shadow + `translateY(3px)` press-down on `:active`. Small detail, big feel difference.
- **Warm-tinted shadows** — `rgba(184,90,59,0.08)` instead of gray. Subtle but keeps everything on-palette.
- **Gray-not-red error states** — Borrowed from Wordle's UX insight: wrong answers use warm gray (`#c4b5a8`), not red. Red triggers "I failed" emotions; gray says "not this one."
- **View Transitions API** — native browser cross-fade between quiz rounds, feature-detected
- **canvas-confetti** — 80 particles with terracotta/gold colors on perfect 1000 score

**Key insight:** The single biggest visual impact came from the Fraunces serif font on score numbers and headings. Changing just the font family on `.summary-score` from sans-serif to a variable serif made the results screen go from "data display" to "achievement celebration."

### Problems Encountered

**1. POTD clickability required data threading**
The Play of the Day card needed to link to the iNaturalist observation, but `history.push()` in the game engine only stored `correct_taxon`, not the full observation object with its URL. Had to thread `correct_inat_url` through `game-engine.js` → `history` → `game-ui.js` to make the card clickable.

**2. Share buttons double-classed**
Daily reveal's share icon buttons had `btn btn-outline share-icon-btn` which caused conflicting styles. The `btn-outline` added padding/border-radius that overrode `share-icon-btn`'s 42x42 square design. Fix: just remove the `btn btn-outline` prefix.

**3. Mobile grid breakpoint stale after CSS grid migration**
The old `flex-direction: column` mobile override for play-cards did nothing after Task 4 changed it from flexbox to CSS grid. Had to replace with grid-appropriate `grid-template-columns: 1fr` rules.

### Profile Page

**Problem:** Badges existed (10 achievements tracked in localStorage) but had no UI to view them. Leaderboard collected name/country fresh every time. No way to tie game sessions together across visits.

**Solution:**
- Persistent `user_id` (UUID in localStorage) — auto-attached to every game event and leaderboard submission via a single change in `enqueue()`
- Profile page at `/profile` with avatar picker, name/country, stats, badges, species log
- Leaderboard popup pre-fills from profile data; edits sync back

**UX iteration on profile:**
- First version showed the avatar grid always expanded with name/country fields visible. Research (Mobbin, GameUIDB) showed the standard pattern is tap-to-expand: large avatar with pencil indicator, grid hidden behind a tap. This matches what Duolingo, chess apps, and trivia games do.
- First version hid unearned badge names behind "???" — but this meant players had no idea what to aim for. Changed to show all badge names and descriptions, with locked ones grayed out. The description IS the goal ("Score 800+ in classic mode"), so hiding it defeats the purpose of a collectible system.

**Apps Script note:** The Google Sheets webhook now receives a `user_id` field in every event. A `user_id` column needs to be manually added to the Feedback and Leaderboard sheets in the Apps Script editor.

---

## 2026-05-20: Set × mode refactor

**The problem:** `sets.json` mixed content sets (`bugs_101`, `all_bugs`, themed sets) with mode-as-set aliases (`bugs_101_time_trial`, `bugs_101_streak`, `time_trial`, `streak`). Every new set would have needed duplicated entries for each mode, and the homepage had to expose separate cards for modes instead of letting players choose a set first.

**Why it happened:** Mode was originally a property of the set so the homepage could link directly with one URL param. The shortcut didn't scale once all sets needed to support all modes.

**The fix:** Made `mode` a constructor argument on `SessionState`, read it from the path-based `/<set>/<mode>/play` route, and deleted all mode-as-set entries from `sets.json`. The old `/play` route redirects to the game homepage. The homepage became set-first: choose a content set, then choose classic, time trial, or streak.

**Key insight:** Data shape decisions made for one consumer can become constraints for every future consumer. Prefer orthogonal parameters even when one consumer doesn't yet need both.

---

## 2026-05-26: Multiplayer party mode on a static Astro site

**The problem:** Party rooms need arbitrary share URLs like `/party/ABCD`, but this site builds as static HTML. Astro cannot pre-render unknown dynamic routes without either `getStaticPaths()` for every code or switching the app to SSR.

**Why it happened:** The realtime state belongs in PartyKit, but the room page itself still has to be served by Astro/Vercel. The original `/party/[code]` plan assumed server routing that the current static deployment does not provide.

**The fix:** Keep a single static `/party` page and have the client read a room code from either `?code=ABCD` or the current path. Vercel rewrites `/party/:code` to `/party`, preserving pretty production share links without changing the whole app to SSR. Local Astro dev uses the query-string route.

**Key insight:** Adding realtime infrastructure does not automatically make the web app server-rendered. Static hosting constraints still shape URL design, even when live game state is handled elsewhere.

---

## 2026-05-26: Multiplayer rejoin identity split

**The problem:** Party state broadcast each player's stable `userId`, and reconnects trusted that ID alone. Anyone who saw the public state could reconnect as another player by sending their ID.

**Why it happened:** The first implementation used one identifier for two jobs: a private browser identity and a public in-room player ID. That made host checks and roster rendering convenient, but it turned the public roster into a bearer credential.

**The fix:** Split identity into a public per-room `playerId`, a private stable `userId`, and a private rotating `rejoinToken`. Public state only includes the player ID. Rejoins must present the current token, and successful rejoins rotate it.

**Key insight:** If an identifier is broadcast to untrusted clients, treat it as display data, not authentication. Resume flows need a separate secret, even for casual game lobbies.

---

## 2026-05-28: Coupling PartyKit and Vercel deploys

**The problem:** Production Vercel served the frontend that expected PartyKit to send an `identified` message with a public `playerId`, but PartyKit had not been redeployed after the identity split. The room creator was present and marked as host in server state, but the browser never learned its `playerId`, so the host saw the guest-only setup panel.

**Why it happened:** Vercel and PartyKit deploy independently. Protocol changes across that boundary can create skew even when each side works on its own.

**The fix:** Added one GitHub Actions production deploy workflow that tests, builds Vercel, deploys PartyKit, then deploys the prebuilt Vercel output from the same commit. Also added a shared `PARTY_PROTOCOL_VERSION` to fail visibly with `PROTOCOL_MISMATCH` if the frontend/backend protocol ever drifts again.

**Key insight:** Realtime backends and static frontends still share a protocol. If they deploy separately, version that protocol or couple the deploys, preferably both.

---

## 2026-06-03: "Is this code even reachable?" needs framework-aware grep

**The problem:** Asked how many times the Calendly interview popup had been shown, I grepped for its entry point (`maybeShowInterviewPrompt`) across `.js`/`.html`/`.mjs` and found it exported but never called — and confidently reported the popup was dead code, shown to nobody. It was wrong. The popup *was* wired up and showing.

**Why it happened:** This is an Astro site, and the homepage calls the function from a `<script>` block inside `src/pages/index.astro`. My grep excluded `.astro` files, so the one call site was invisible. The filter matched how I assumed modules get wired (JS importing JS) rather than how this framework actually wires them (component files own the entry-point scripts).

**The fix:** Re-ran the search including `.astro` and found `index.astro` running `if (!maybeShowInterviewPrompt()) maybeShowSupportPrompt();`. The real gap wasn't "never shown" — it was "never tracked server-side," since impressions only touched localStorage.

**Key insight:** A reachability claim is only as good as the file types you searched. Before concluding code is dead, grep must cover the framework's entry-point files — `.astro`, `.vue`, `.svelte`, `.mdx`, route manifests — not just the language the function is written in. "Not called in any `.js`" is not "not called."

---

## 2026-06-03: Wrong-answer learning cards — three-tier tell resolution collapsed to two

### The problem

After a wrong answer, players see a "Close one!" card with a discriminating tell: the quickest visual cue that separates the correct bug from the one they picked. The data gap: curated pairwise tells only exist for Bugs 101 category pairs (Beetle vs Bee, etc.), not for genus-level sets. A generic fallback was needed for the missing cases.

### The approach and why it changed

The first working version used two tiers: (1) curated `bugs101Tells[pairKey(picked, correct)]`; (2) `key_mark` from the trait store. A middle tier was added: `pickContrastDimension()` walks a priority list (`structure → wings → size → color`), finds the first dimension where the picked and correct taxon's traits differ, and renders a sentence: "Dragonfly has four wings held flat, while Damselfly holds wings together." This felt like the ideal fill-in — specific, comparative, generated from existing data.

Then it was cut (`37ca6c0`). The trait store's values are written for individual taxa, not for cross-taxon comparison. Two entries might both say "4 wings" using different phrasing, or one entry might describe a feature the other omits entirely. The auto-generated sentences were inconsistent enough that they either stated the obvious or produced comparisons that didn't actually discriminate. The `key_mark` field, written as a standalone diagnostic cue ("Antennae elbowed"), is shorter and more reliable.

### The fix

Collapsed to the original two tiers. `buildLearningCard` now: (1) curated pair tell → (2) `key_mark` fallback. `pickContrastDimension` and `contrastSentence` were removed entirely. The trait data structure is kept intact — it was authored as individual-taxon descriptors, and using it cross-taxon was the mistake.

### Key insight

Auto-generated comparative sentences require data that was authored *for comparison* — two entries that describe the same dimensions in the same vocabulary. Trait data authored per-taxon (each entry self-contained) will produce incoherent diffs when you subtract one from the other. Before building a cross-entity contrast layer, check whether the data was co-authored with that use in mind.

---

## 2026-06-20: Wildlife observations contaminated bug sets because the exclusion filter was a denylist, not an allowlist

### The problem

After adding birds, mammals, reptiles, amphibians, and fish to `observations.json`, the `all_bugs` set ballooned from ~4,800 to 8,285 entries and `bugs_101` from ~2,500 to 7,864. Wildlife taxa were appearing in "All Bugs" and "Bugs 101."

### Why it happened

`mainPool` (the source for all bug sets) filtered with `!isIcky(obs) && obs.taxon.order !== 'Isopoda'`. `isIcky()` was a **denylist** of orders/classes that are unpleasant to look at — cockroaches, ticks, centipedes, aphids. Wildlife taxa like `Aves` and `Mammalia` are not on that denylist, so they passed straight through. The filter was never designed to exclude non-arthropods; it was designed to exclude unpleasant arthropods. When the observation pool grew to include vertebrates, the assumption that "anything not icky is a bug" silently broke.

### The fix

Added `BUG_POOL_CLASSES = new Set(['Insecta', 'Arachnida', 'Chilopoda', 'Diplopoda', 'Malacostraca'])` as an explicit positive allowlist and applied it as the first filter in `mainPool`, `withCounts` (backyard_basics), and `featuredIndices` (eye_candy) in both `fetch-data.mjs` and `rebuild-sets.mjs`. After `npm run rebuild-sets`, class distribution in `all_bugs` was exactly `Insecta: 3918, Arachnida: 955` — no vertebrates.

### Key insight

Exclusion filters on a known-bad set become incorrect the moment new categories are added that aren't on the list. For "only include bugs," the correct primitive is an **inclusion filter on a known-good set**, not an exclusion filter on known-bad members. If you find yourself writing `!isUnwanted(x)`, ask whether the real constraint is better expressed as `isWanted(x)` — especially when the domain can expand.

---

## 2026-06-20: Vercel free plan's 5000-file upload limit hit after expanding to multi-kingdom datasets

### The problem

CI deploy failed mid-upload with `Error: Too many requests — more than 5000 (code: "api-upload-free")`. Build had grown from ~1000 pages (bugs only) to 3835 pages (six kingdoms × sets × modes × species pages), pushing the file count past Vercel's free-plan threshold.

### Why it happened

`vercel deploy --prebuilt --prod` uploads each file in `dist/` individually. Vercel's free plan caps this at 5000 files per deployment. With one HTML file per static page and a large `/species/` section, the build crossed the limit on first push of the wildlife expansion. The error is silent during the upload — it only appears at the cap, after ~50 MB has already uploaded, and the partial upload is discarded (Vercel deployments are atomic, so nothing goes live).

### The fix

One flag: `--archive=tgz`. This tarballs the entire `dist/` output and uploads it as a single file, bypassing the per-file count limit. Added to `deploy.yml`: `npx vercel deploy --prebuilt --prod --archive=tgz --token=...`

### Key insight

Vercel's 5000-file limit is a deployment-level constraint, not a storage limit — it applies per deploy, not in aggregate. If your Astro site has static paths that multiply (sets × modes × species), you can hit it faster than expected. `--archive=tgz` is the standard fix and should be added proactively when building large SSG sites on Vercel's free plan.

---

## 2026-06-03: Disjoint files are not enough to run subagents in parallel

**The problem:** Executing an implementation plan with parallel subagents, I wanted to run the last few tasks concurrently. The obvious safety check — "do these tasks edit different files?" — passed: each task touched a separate source file. But dispatching them as-is would have corrupted the workspace.

**Why it happened:** File-content disjointness ignores the *shared mutable state* every agent in one working tree contends for. Two concurrent `npm run build` runs both write the same `dist/` directory (interleaved/clobbered output). Two concurrent `git add` + `git commit` runs race on `.git/index` — `index.lock` contention, or one commit sweeping up the other's staged files. Disjoint *sources*, shared *build output and staging area*.

**The fix:** Evaluate three things before parallelizing, not one: (1) disjoint file sets, (2) no ordering dependency between tasks, and (3) isolated build/git state. For (3), either give each agent its own git worktree (separate `dist/` and index), or — simpler for a couple of tasks — have the parallel agents *edit only* (no build, no git) and let the controller serialize the single build, full test run, and per-task commits afterward. I used the edit-only + serial-integrate pattern here, then baked the rule into the subagent-driven-development skill.

**Key insight:** "Can these run in parallel?" is a question about shared *writable* state, not shared files. The git index and the build directory are global singletons in a working tree; any parallelism with more than one writer to them needs isolation (worktrees) or a single-threaded integrator.
