# What's That Bug — MVP Design Spec

A GeoGuessr-style insect identification game. Players see a real bug photo and guess what it is from multiple-choice options. Taxonomic-distance scoring rewards close answers, and every round teaches something — even wrong answers.

## 1. Architecture

### Overview

```
BUILD TIME
  Astro build script
    → iNaturalist API
    → observations.json (static pool, ~5,000 entries)
    → taxonomy.json (ancestry index)
    → sets.json (set definitions → observation IDs)

RUNTIME (static site, no backend)
  Astro pages (static HTML)
    ├─ Landing / sets browser
    ├─ Game page (vanilla JS island)
    │    ├─ Reads from static JSON pool
    │    ├─ Generates rounds + distractors client-side
    │    ├─ Manages score/state in memory
    │    └─ Posts feedback + game events to Google Sheet
    └─ About page

EXTERNAL SERVICES
  ├─ Google Sheets (via Apps Script webhook)
  │    ├─ Feedback (per-round reactions, session forms, general)
  │    └─ Game events (rounds, scores, sessions)
  └─ GoatCounter (page analytics — visits, referrers, devices)

HOSTING
  Vercel or Netlify (static deployment)
```

### Key decisions

- **All game logic runs client-side.** No backend server. The static JSON pool is fetched once on page load.
- **Build-time data pipeline.** An Astro build script queries iNaturalist API, filters for high-quality CC-BY research-grade observations, and writes static JSON files. Rebuild manually to refresh the pool (weekly cron via GitHub Actions is a future enhancement).
- **No user accounts for MVP.** Session state lives in memory, best scores per set persist in localStorage. Full accounts are a future enhancement.
- **Client-side distractor generation.** The correct answer is technically discoverable by inspecting the JSON. Acceptable for MVP — this is not a competitive/prized game yet.

## 2. Game Round Flow

### Session structure

- 10 rounds per session
- Player selects a set before starting (or defaults to "All Bugs")
- Score accumulates across the session (max 1,000 points)
- After round 10: session summary with score, share card, and optional feedback form
- "Play Again" restarts with a fresh 10 rounds from the same set

### Single round flow

```
Player clicks "Play" or "Next Round"
  │
  ▼
LOAD ROUND
  1. Pick random observation from the active set's pool
  2. Generate 3 plausible distractors (see §4)
  3. Shuffle 4 options randomly
  4. Display: photo (hero), location, 4 choice cards
  │
  ▼
Player picks an option
  │
  ▼
SCORE & REVEAL
  1. Calculate taxonomic distance (see §3)
  2. Highlight correct answer (green border)
  3. Highlight player's pick (green/amber/red based on closeness)
  4. Show feedback card:
     - Encouragement copy ("Nailed it!" / "So close!" / "Not quite")
     - Species blurb: one-liner from iNaturalist's taxon wikipedia_summary field (fetched at build time). Falls back to just the taxonomy breadcrumb if no summary is available.
     - Taxonomy breadcrumb: "You said Fly → this is a Beetle — same phylum, different orders"
     - Points earned with animation
     - "Learn more" link → iNaturalist observation page
  5. Per-round quick reaction: Too Easy / Just Right / Too Hard
  6. Log game event to Google Sheet
  │
  ▼
Player clicks "Next" → next round (or session summary after round 10)
```

### Session summary screen

Displayed after round 10:

- Final score (e.g., "625 / 1000")
- Accuracy breakdown: "5 exact, 3 close, 2 misses"
- Best streak count
- Share card with emoji grid (see §7)
- End-of-session feedback form (optional, see §6)
- "Play Again" and "Change Set" buttons

### What the player sees during a round

- **Top bar**: Round counter ("Round 7 of 10"), running score, current set name
- **Hero area**: Bug photo on dark background, large. Photo attribution in small overlay at bottom-right.
- **Below photo**: "What's this bug?" + location text (e.g., "Found in Portland, Oregon")
- **Choices**: 2×2 grid of cards. Each shows common name (bold) + Latin name (smaller, italic). Cards have hover states and click feedback.

## 3. Scoring — Taxonomic Distance

Points are awarded based on how taxonomically close the player's guess is to the correct answer.

### Scoring table

| Match level | Points | Example |
|---|---|---|
| Exact species | 100 | Picked Cotinis mutabilis ✓ |
| Same genus | 75 | Picked Cotinis nitida (right genus, wrong species) |
| Same family | 50 | Picked Popillia japonica (right family, wrong genus) |
| Same order | 25 | Picked a click beetle (right order, wrong family) |
| Wrong order | 0 | Picked a fly (completely off) |

### Implementation

```
function score(picked, correct):
  if picked.species === correct.species → 100
  if picked.genus   === correct.genus   → 75
  if picked.family  === correct.family  → 50
  if picked.order   === correct.order   → 25
  else → 0
```

Both the correct answer and each distractor carry their full ancestry chain in the data, so scoring is simple string comparison up the tree.

### Session scoring

- 10 rounds × 100 max = 1,000 possible points per session
- Share card emoji mapping: 100 = 🟩, 75 or 50 = 🟨, 25 or 0 = 🟥

### Bugs 101 set exception

In the Bugs 101 set, answers are at the order/family level (e.g., "Beetle" not "Figeater Beetle"). Scoring is binary: correct = 100, wrong = 0. No partial credit tiers since the options are already at the broadest level.

### Future enhancement: Speed multiplier (not MVP)

Base score × time bonus: 1.5x if answered in <5s, 1.0x if <15s, 0.75x if <30s. Timer UI shows countdown. Adds tension without changing core taxonomy logic.

## 4. Distractor Algorithm

The wrong answers must be plausible — species that look similar or are commonly confused. This is what separates a smart quiz from a dumb one.

### Tiered selection strategy

Given a correct answer, generate 3 distractors:

```
Correct: Figeater Beetle (Cotinis mutabilis)
  Order: Coleoptera → Family: Scarabaeidae → Genus: Cotinis

TIER 1 — Same genus (hardest to distinguish)
  Pick 1 from same genus, different species
  e.g., Green June Beetle (Cotinis nitida)

TIER 2 — Same family (similar body plan)
  Pick 1 from same family, different genus
  e.g., Japanese Beetle (Popillia japonica)

TIER 3 — Same order (recognizably related)
  Pick 1 from same order, different family
  e.g., a longhorn beetle or click beetle
```

Every option on screen belongs to the same order. You cannot eliminate choices by recognizing the broad category — you have to know the details.

### Edge cases

- **Singleton genus** (only 1 species at that genus in pool): Skip tier 1, pick 2 from family.
- **Small family** (<3 other species in pool): Fill remaining slots from order.
- **Minimum viable pool**: During build time, drop any observation that cannot generate at least 3 distractors from within its order. This ensures every round works.

### Bugs 101 set distractors

Different logic: distractors are other orders/families, not species. Options might be "Beetle", "Moth", "Dragonfly", "Spider". All distractors are pulled from distinct orders present in the pool.

### Build-time preparation

The taxonomy index (`taxonomy.json`) maps each taxonomic level to observation IDs:

```json
{
  "order": {
    "Coleoptera": [123, 456, 789, ...],
    "Lepidoptera": [234, 567, ...]
  },
  "family": {
    "Scarabaeidae": [123, 456, ...],
    "Cerambycidae": [789, ...]
  },
  "genus": {
    "Cotinis": [123, 456],
    "Popillia": [234]
  }
}
```

At runtime, the distractor generator looks up the correct answer's ancestry, pulls candidate IDs from each tier, excludes the correct answer, picks one per tier, and shuffles all 4.

## 5. Challenge Sets

Themed collections of observations, like GeoGuessr's maps.

### MVP sets

| Set | Description | Filter logic | Scoring |
|---|---|---|---|
| **Bugs 101** | Identify the broad type (beetle, moth, spider, etc.) | 1 representative per major order/family | Binary: 100 or 0 |
| **All Bugs** | Random from entire pool | No filter, full species-level | Taxonomic distance |
| **Backyard Basics** | The 200 most commonly observed species | Sort by `observations_count`, take top 200 | Taxonomic distance |
| **Beetles** | The most species-rich insect order | Order = Coleoptera | Taxonomic distance |
| **Butterflies & Moths** | Visually striking, crowd-pleaser | Order = Lepidoptera | Taxonomic distance |
| **Spiders & Friends** | The "is this dangerous?" crowd | Class = Arachnida | Taxonomic distance |
| **Tiny Terrors** | Household bugs people worry about | Manual taxon ID list: bed bugs, carpet beetles, brown recluse, cockroaches, termites, house centipedes, silverfish, etc. | Taxonomic distance |

### Set data structure

```json
// sets.json
{
  "bugs_101": {
    "name": "Bugs 101",
    "description": "Can you tell a beetle from a butterfly? Start here.",
    "scoring": "binary",
    "observation_ids": [...]
  },
  "all_bugs": {
    "name": "All Bugs",
    "description": "Random bugs from around the world. Full species ID.",
    "scoring": "taxonomic",
    "observation_ids": [...]
  }
}
```

### Set selection UI

A grid of cards on the landing page. Each card shows:
- Set name
- A representative photo from the set
- Short description
- Number of species in the set
- Player's best score for that set (from localStorage)

### Future sets (not MVP)

- **Regional**: "Australian Bugs", "European Insects", "North American" — filtered by `place_id`
- **Difficulty-rated**: "Easy", "Medium", "Expert" — based on average correct-answer rate from game event data
- **Seasonal**: "Spring Pollinators", "Fall Invaders" — filtered by `observed_on` month
- **Community-created**: Users define custom sets by picking taxa

## 6. Feedback System

Three touchpoints at different friction levels, all posting to a single Google Sheet via Apps Script webhook.

### Touchpoint 1: Per-round quick reaction (lowest friction)

- Appears on the answer reveal card, below the fun fact
- Three buttons: `Too Easy` | `Just Right` | `Too Hard`
- Single tap, no modal, no interruption to flow
- Payload:

```json
{
  "type": "round_reaction",
  "session_id": "abc123",
  "round": 7,
  "observation_id": 12345678,
  "difficulty": "too_easy",
  "user_answer_taxon": "Cotinis nitida",
  "correct_answer_taxon": "Cotinis mutabilis",
  "score_earned": 75,
  "set": "beetles",
  "timestamp": "2026-04-01T14:30:00Z"
}
```

### Touchpoint 2: End-of-session form (after round 10)

- Appears on session summary screen, below the share card
- Optional — player can skip to "Play Again"
- Fields:
  - Overall difficulty: 1-5 scale slider
  - "Which round was most interesting?": dropdown of the 10 bugs they saw
  - "Anything feel off?": free text (placeholder: "Options too obvious? Names too technical? Bugs too obscure?")
  - "Would you play again?": Yes / Maybe / No
- Payload: `{type: "session_feedback", session_id, score, set, difficulty_rating, interesting_round, free_text, play_again, timestamp}`

### Touchpoint 3: Persistent feedback tab (always available)

- Small floating button, bottom-right corner: "Feedback"
- Opens a minimal slide-up form:
  - Category dropdown: Bug Report / Suggestion / Wrong ID / Other
  - Free text field
- Payload: `{type: "general_feedback", category, text, current_page, timestamp}`

### Google Sheet schema

Single sheet, flat structure:

| timestamp | type | session_id | set | round | observation_id | data_json |
|---|---|---|---|---|---|---|
| 2026-04-01T14:30:00Z | round_reaction | abc123 | beetles | 7 | 12345678 | {"difficulty":"too_easy",...} |

The `data_json` column holds type-specific fields as a JSON string. Keeps the schema simple while allowing different feedback types to carry different data.

### Google Apps Script webhook

A simple Apps Script attached to the Sheet that accepts POST requests and appends rows. The frontend posts to the script's published URL. No authentication needed for MVP — the URL is obscure enough.

## 7. Social Sharing

### Share card format

Displayed on session summary screen and copied to clipboard:

```
🪲 What's That Bug? — 625/1000

🟩🟩🟨🟩🟥🟩🟨🟩🟩🟨

7/10 correct · Streak: 4 · Set: Beetles
Play at whatsthatbug.app
```

Emoji mapping:
- 🟩 = Exact species match (100 pts)
- 🟨 = Close (75 or 50 pts — same genus or family)
- 🟥 = Miss (25 or 0 pts)

### Share buttons

- **"📋 Copy"**: Copies the text block to clipboard using `navigator.clipboard.writeText()`. Shows "Copied!" confirmation.
- **"𝕏 Post"**: Opens Twitter/X intent URL: `https://twitter.com/intent/tweet?text={encoded_share_text}`

Both buttons are prominent on the session summary screen.

### Why this works for virality

The emoji grid is visual and intriguing without spoiling answers. It's the same mechanic that made Wordle shareable — people see the grid and ask "what is this?" (fitting, given the game's theme). The game URL at the bottom drives click-through.

## 8. Analytics

### Layer 1: Page analytics (GoatCounter)

- Single `<script>` tag in the Astro layout
- Tracks: visits, unique visitors, referrers, device types, pages visited, countries
- Free tier, privacy-friendly, no cookies, no GDPR banner needed
- Dashboard at goatcounter.com or self-hosted later

### Layer 2: Game events (Google Sheet)

Logged alongside feedback via the same Apps Script webhook:

| Event | Payload |
|---|---|
| `session_start` | `{session_id, referrer, device, set, timestamp}` |
| `round_complete` | `{session_id, round, observation_id, user_answer, correct_answer, score, time_taken_ms, set}` |
| `session_end` | `{session_id, total_score, rounds_played, set, completed (bool), share_clicked (bool)}` |

This gives queryable gameplay data: which sets are popular, which observations stump people, where players drop off, whether people share their scores.

### What you can answer from this data

- "Are the beetle distractors too hard?" → Filter round_complete by set=beetles, check average scores
- "Do people finish sessions?" → Compare session_start vs session_end counts
- "Which observations are too easy?" → Filter rounds where score=100 AND difficulty_reaction="too_easy"
- "Is sharing working?" → Count session_end where share_clicked=true

## 9. Visual Design

### Color palette

**Light mode** (default):

| Token | Value | Usage |
|---|---|---|
| Background | `#fdfcfb` | Page background |
| Surface | `#f5f3f0` | Cards, panels |
| Text | `#2c2c2c` | Primary text |
| Text secondary | `#666` | Descriptions, metadata |
| Accent | `#b85a3b` | Round headers, close-answer highlights, interactive elements |
| Border | `#e8e6e3` | Card borders, dividers |
| Success | `#059669` | Correct answer highlight, exact-match feedback |
| Warning | `#b85a3b` | Close-answer feedback (same as accent) |
| Error | `#dc2626` | Miss feedback |

**Dark mode** (system preference or toggle):

| Token | Value | Usage |
|---|---|---|
| Background | `#1a1917` | Page background |
| Surface | `#222120` | Cards, panels |
| Text | `#e0ddd8` | Primary text |
| Text secondary | `#9a9590` | Descriptions, metadata |
| Accent | `#d4794e` | Round headers, close-answer highlights |
| Border | `#2e2c28` | Card borders, dividers |
| Success | `#5bc49a` | Correct answer highlight |
| Warning | `#d4794e` | Close-answer feedback (same as accent) |
| Error | `#e05d50` | Miss feedback |

### Design principles

- **Photo is the hero.** Large, dark background behind the image. Everything else is secondary.
- **Latin names: present, not dominant.** Shown in smaller italic text below common names. Credibility without gatekeeping.
- **Every answer teaches.** Even wrong answers get a fun fact and a taxonomy breadcrumb. "One family off!" feels like learning, not failure.
- **Warm, encouraging copy.** "Nailed it!", "So close!", "Not quite" — never just "Wrong" or "Incorrect."
- **Not fear-based.** No "DANGER!" framing. Bugs are fascinating, not scary.
- **Respects intelligence.** Plausible distractors, real photos, real science. Not dumbed down.

### Typography

- System font stack: `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
- Common names: bold, 15-18px
- Latin names: italic, 12px, secondary text color
- Encouragement copy: bold, 18px, colored by feedback type
- Fun facts: 13-14px, body text color

### Responsive behavior

- **Desktop (>768px)**: 2×2 choice grid, large photo, side-by-side feedback elements
- **Mobile (<768px)**: Stacked choices (1 column), photo scales to full width, feedback card full-width below

## 10. Data Pipeline (Build-Time)

### Build script steps

```
Step 1: FETCH OBSERVATIONS
  iNaturalist API queries:
    - Insecta (taxon_id=47158): ~4,500 observations
    - Arachnida (taxon_id=47119): ~500 observations
  Filters:
    - quality_grade=research
    - photo_license=cc-by
    - photos=true
    - per_page=200
    - Only species with num_identification_agreements >= 3
    - Only species with common_name present (skip unnamed taxa)
  Geographic diversity:
    - Fetch in batches per continent/region using place_id filter
    - Target distribution: ~40% North America, ~25% Europe, ~15% Asia, ~10% South America, ~10% Oceania/Africa
    - Ensures the pool isn't dominated by North American observations
  Rate limit: 1 request/sec, ~25 requests for 5,000 observations

Step 2: FETCH TAXONOMY + BLURBS
  For each unique taxon_id in the pool:
    GET /taxa/{id} → full ancestry chain + wikipedia_summary
  Build taxonomy index (order → family → genus → species → observation_ids)
  Extract wikipedia_summary for species blurbs (truncate to ~150 chars)
  Cache responses to avoid refetching on subsequent builds

Step 3: VALIDATE DISTRACTORS
  For each observation:
    Verify >= 3 other species exist in the pool at same family level
    Drop observations that can't generate good distractors
  Log dropped observations for review

Step 4: BUILD SETS
  bugs_101:          1 representative observation per major order/family
  all_bugs:          entire validated pool
  backyard_basics:   top 200 species by observations_count on iNaturalist
  beetles:           order === Coleoptera
  butterflies_moths: order === Lepidoptera
  spiders:           class === Arachnida
  tiny_terrors:      manual list of taxon IDs for household pest species

Step 5: WRITE OUTPUT
  → src/data/observations.json   (~5,000 entries, ~2-3MB)
  → src/data/taxonomy.json       (ancestry index)
  → src/data/sets.json           (set definitions with observation ID arrays)
```

### Observation record schema

```json
{
  "id": 12345678,
  "photo_url": "https://inaturalist-open-data.s3.amazonaws.com/photos/98765/medium.jpg",
  "attribution": "(c) Maria Chen, some rights reserved (CC BY)",
  "taxon": {
    "id": 507445,
    "species": "Cotinis mutabilis",
    "common_name": "Figeater Beetle",
    "genus": "Cotinis",
    "family": "Scarabaeidae",
    "order": "Coleoptera",
    "class": "Insecta",
    "ancestor_ids": [47158, 47208, 53849, 507445, 134169]
  },
  "location": "Portland, Oregon",
  "observed_on": "2024-06-15",
  "inat_url": "https://www.inaturalist.org/observations/12345678",
  "num_agreements": 5,
  "wikipedia_summary": "The figeater beetle is a green-colored beetle common in the western United States..."
}
```

### Rate limit handling

- iNaturalist allows ~60 requests/minute unauthenticated
- Build script sleeps 1 second between requests
- Taxonomy responses are cached in a local `.cache/` directory — subsequent builds only fetch new taxa
- If iNaturalist API is down during build, the existing committed data files serve as fallback

### Refresh cadence

- MVP: manual rebuild via `npm run fetch-data`
- Future: GitHub Actions cron job (weekly) that runs the fetch script, commits new data, and triggers a deploy

## 11. Tech Stack Summary

| Layer | Technology | Why |
|---|---|---|
| Static site framework | Astro | Already known, fast, islands architecture |
| Game interactivity | Vanilla JS | No framework overhead for simple state management |
| Styling | Vanilla CSS with custom properties | Light/dark mode via CSS variables, no Tailwind needed |
| Data source | iNaturalist API (build-time) | 5.4M CC-BY insect observations, free, no auth needed |
| Feedback storage | Google Sheets + Apps Script | Zero infrastructure, instantly queryable, shareable |
| Page analytics | GoatCounter | Privacy-friendly, free, one script tag |
| Hosting | Vercel or Netlify | Free tier, static site optimized, instant deploys |
| Version control | Git + GitHub | Standard |

## 12. Pages

| Route | Content | Interactive? |
|---|---|---|
| `/` | Landing page: game title, tagline, set selection grid, brief "how to play" | Minimal (set card clicks) |
| `/play?set=all_bugs` | Game page: the core game loop | Yes (vanilla JS island) |
| `/about` | What this is, how scoring works, credits, iNaturalist attribution | No |

## 13. Future Enhancements (Not MVP)

Noted during brainstorming for future iterations:

- **Daily challenge mode**: Everyone gets the same bug each day. One shot, share your score. Builds habit + virality.
- **Hierarchical narrowing answer mode**: Player picks order first, then family, then genus/species. Each correct level earns points. Teaches taxonomy naturally. Intended as a "learning/hard" mode alongside the multiple-choice easy mode.
- **Speed × accuracy scoring**: Base score × time bonus (1.5x if <5s, 1.0x if <15s, 0.75x if <30s).
- **Regional sets**: "Australian Bugs", "European Insects" — filtered by iNaturalist `place_id`.
- **Difficulty-rated sets**: Based on average correct-answer rate from game event data.
- **Seasonal sets**: "Spring Pollinators", "Fall Invaders" — filtered by `observed_on` month.
- **Community-created sets**: Users define sets by picking taxa.
- **User accounts**: Persistent scores, streaks, leaderboards.
- **Multiplayer duels**: Real-time head-to-head with same bug, who IDs faster/more accurately.
- **Weekly data refresh**: GitHub Actions cron job to rebuild observation pool.

## 14. Risks & Tradeoffs

| Risk | Severity | Mitigation |
|---|---|---|
| Static pool gets stale | Low | Manual rebuild for MVP; weekly cron later |
| Correct answer discoverable in client JSON | Low | Acceptable for non-competitive MVP |
| iNaturalist API down during build | Low | Committed data files serve as fallback |
| 2-3MB JSON on slow connections | Medium | Lazy-load per set if needed later |
| Google Apps Script webhook URL exposed | Low | URL is obscure; rate-limit abuse is unlikely at MVP scale |
| Some species have poor or missing common names | Medium | Build script filters out observations with null common_name |
| Photo quality varies | Medium | Filter for research-grade + high agreement count; prefer multi-photo observations |
| CC-BY license requires attribution | Low | Attribution baked into UI from day one (photo credit overlay) |
| GoatCounter free tier limits | Low | Generous for MVP traffic; self-host or upgrade if needed |
