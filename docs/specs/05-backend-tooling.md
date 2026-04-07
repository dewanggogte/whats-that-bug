# Spec 5: Backend Tooling — Review Server & Unified Analytics

**PRD features merged:** #11 Review Server for General Pool (1C), #13 Unified Analytics Dashboard (5A)

**Files owned (only this spec touches these):**
- Modify: `scripts/review-server.mjs` — extend to support general pool batch review
- Create: `scripts/review-general.html` — review UI for non-daily observations
- Create: `public/data/reviewed-observations.json` — review state manifest
- Modify: `analytics/dump.py` — merge feedback analysis into unified dashboard
- Modify: `analytics/output/dashboard.html` — unified dashboard output

**Dependencies:** None. This spec is fully independent of all frontend specs. It touches no files in `src/`.

---

## Context

### Review Server
The existing `scripts/review-server.mjs` is a local HTTP server for reviewing daily challenge candidates. It serves a review UI (`scripts/review-daily.html`), handles image cropping via `sharp`, and supports approve/reject workflows for daily observations.

The general observation pool (2,621 observations in `public/data/observations.json`) has no review process. Bad images cause unfair gameplay. The PRD (1A) already produced a `scripts/flag-images.py` script that identifies the worst observations by miss rate. This spec extends the review server to support batch review of those flagged observations.

### Analytics
`analytics/dump.py` generates a dashboard from Google Sheets game event data. A separate `scripts/analyze-feedback.py` (in `older_analytics/`) processes player feedback. These need to be merged into one pipeline.

---

## Part 1: General Pool Review Server

### 1A. Review State Manifest

Create `public/data/reviewed-observations.json`:

```json
{
  "version": 1,
  "last_updated": "2026-04-07T00:00:00Z",
  "observations": {}
}
```

The `observations` object maps observation ID to review status:

```json
{
  "observations": {
    "12345": { "status": "approved", "reviewed_at": "2026-04-07T12:00:00Z" },
    "67890": { "status": "rejected", "reviewed_at": "2026-04-07T12:05:00Z", "reason": "blurry" },
    "11111": { "status": "flagged", "reviewed_at": "2026-04-07T12:10:00Z", "reason": "wrong species" }
  }
}
```

Valid statuses: `approved`, `rejected`, `flagged`
Valid reasons: `blurry`, `wrong_species`, `cant_see_bug`, `misleading`, `other`

### 1B. Extend review-server.mjs

Add new routes to the existing HTTP server. The server already handles daily review at `/`. Add general pool review at `/general`.

**New routes to add:**

```
GET  /general              → serves review-general.html
GET  /api/general/batch    → returns next batch of observations to review
POST /api/general/review   → saves review decision for an observation
GET  /api/general/stats    → returns review progress stats
```

**Route: GET /api/general/batch**

Query params:
- `size` (default: 20) — batch size
- `priority` (default: `flagged`) — `flagged` shows data-flagged observations first, `unreviewed` shows random unreviewed ones

Logic:
1. Load `observations.json` (all 2,621 observations)
2. Load `reviewed-observations.json` (review state)
3. Optionally load `scripts/output/flagged-observations.json` (output of flag-images.py, if it exists) for priority sorting
4. Filter to unreviewed observations
5. Sort: flagged observations first (by quality_score descending), then unreviewed
6. Return the first `size` observations with their data:

```json
{
  "observations": [
    {
      "id": 12345,
      "photo_url": "https://...",
      "taxon": { "species": "...", "common_name": "...", "order": "..." },
      "location": "...",
      "attribution": "...",
      "flag_data": { "miss_rate": 0.82, "quality_score": 0.71, "sample_size": 11 }
    }
  ],
  "remaining": 2521,
  "total_reviewed": 100
}
```

**Route: POST /api/general/review**

Request body:
```json
{
  "observation_id": 12345,
  "status": "rejected",
  "reason": "blurry"
}
```

Logic:
1. Load `reviewed-observations.json`
2. Add/update the entry for this observation
3. Update `last_updated` timestamp
4. Write back to disk
5. Return `{ ok: true, total_reviewed: N }`

**Route: GET /api/general/stats**

Returns:
```json
{
  "total_observations": 2621,
  "reviewed": 100,
  "approved": 72,
  "rejected": 18,
  "flagged": 10,
  "remaining": 2521
}
```

### 1C. Review UI (`scripts/review-general.html`)

A single-page HTML file served by the review server. Design:

**Layout:**
- Header: "General Pool Review" title + progress bar (reviewed/total) + stats
- Main area: Grid of observation cards (4 columns desktop, 2 mobile)
- Each card shows: photo, species name, location, flag data (if available)
- Quick action buttons per card: Approve (green), Reject (red), Flag (yellow)
- On reject/flag: show reason selector dropdown before confirming

**Behavior:**
- On page load, fetch `/api/general/batch?size=20`
- When a card is reviewed (approved/rejected/flagged), POST to `/api/general/review`, then gray out the card
- "Load next batch" button at the bottom
- Keyboard shortcuts: 1=approve, 2=reject, 3=flag (applies to the currently focused card)
- Show running stats in the header (auto-refresh on each review action)

**Styling:**
- Use the same color palette as the main game (warm terracotta)
- Dark background, card-based layout
- Photo aspect ratio: 16:9, object-fit: cover
- Reviewed cards fade to 40% opacity with a status badge overlay

**Template structure:**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WTB — General Pool Review</title>
  <style>
    /* Minimal styling — dark theme, card grid */
    :root {
      --bg: #1a1917;
      --surface: #222120;
      --text: #e0ddd8;
      --accent: #d4794e;
      --border: #2e2c28;
      --success: #5bc49a;
      --error: #e05d50;
      --warning: #d4794e;
    }
    body { background: var(--bg); color: var(--text); font-family: system-ui, sans-serif; margin: 0; padding: 16px; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
    .header h1 { font-size: 1.3rem; margin: 0; }
    .progress { font-size: 0.85rem; color: var(--accent); }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; transition: opacity 300ms; }
    .card.reviewed { opacity: 0.4; pointer-events: none; }
    .card img { width: 100%; aspect-ratio: 16/9; object-fit: cover; display: block; }
    .card-body { padding: 12px; }
    .card-species { font-weight: 600; font-size: 0.95rem; }
    .card-meta { font-size: 0.8rem; color: #9a9590; margin-top: 4px; }
    .card-flags { font-size: 0.75rem; color: var(--error); margin-top: 4px; }
    .card-actions { display: flex; gap: 8px; margin-top: 12px; }
    .card-actions button { flex: 1; padding: 8px; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 0.85rem; }
    .btn-approve { background: var(--success); color: #000; }
    .btn-reject { background: var(--error); color: #fff; }
    .btn-flag { background: var(--warning); color: #fff; }
    .reason-select { margin-top: 8px; width: 100%; padding: 6px; border-radius: 6px; background: var(--bg); color: var(--text); border: 1px solid var(--border); }
    .load-more { display: block; margin: 24px auto; padding: 12px 32px; background: var(--accent); color: #fff; border: none; border-radius: 8px; cursor: pointer; font-size: 1rem; }
    .status-badge { position: absolute; top: 8px; right: 8px; padding: 2px 8px; border-radius: 12px; font-size: 0.7rem; font-weight: 700; }
  </style>
</head>
<body>
  <div class="header">
    <h1>General Pool Review</h1>
    <span class="progress" id="progress">Loading...</span>
  </div>
  <div class="grid" id="grid"></div>
  <button class="load-more" id="load-more">Load Next Batch</button>

  <script>
    // Fetch batch, render cards, handle approve/reject/flag
    // See implementation details below
  </script>
</body>
</html>
```

**Key JS logic in the review UI:**

```javascript
async function loadBatch() {
  const res = await fetch('/api/general/batch?size=20');
  const data = await res.json();
  updateProgress(data);
  renderCards(data.observations);
}

function renderCards(observations) {
  const grid = document.getElementById('grid');
  for (const obs of observations) {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = obs.id;

    const flagInfo = obs.flag_data
      ? `<div class="card-flags">Miss rate: ${(obs.flag_data.miss_rate * 100).toFixed(0)}% · Score: ${obs.flag_data.quality_score.toFixed(2)} · n=${obs.flag_data.sample_size}</div>`
      : '';

    card.innerHTML = `
      <div style="position:relative;">
        <img src="${obs.photo_url}" alt="${obs.taxon.common_name}" loading="lazy">
      </div>
      <div class="card-body">
        <div class="card-species">${obs.taxon.common_name} (<em>${obs.taxon.species}</em>)</div>
        <div class="card-meta">${obs.location} · ${obs.taxon.order}</div>
        ${flagInfo}
        <div class="card-actions">
          <button class="btn-approve" onclick="review(${obs.id}, 'approved')">Approve</button>
          <button class="btn-reject" onclick="showReject(${obs.id})">Reject</button>
          <button class="btn-flag" onclick="showFlag(${obs.id})">Flag</button>
        </div>
        <div class="reason-container" id="reason-${obs.id}" style="display:none;">
          <select class="reason-select" id="reason-select-${obs.id}">
            <option value="blurry">Blurry / low quality</option>
            <option value="wrong_species">Wrong species label</option>
            <option value="cant_see_bug">Can't see the bug</option>
            <option value="misleading">Misleading image</option>
            <option value="other">Other</option>
          </select>
          <button style="margin-top:4px;width:100%;padding:6px;background:var(--border);color:var(--text);border:none;border-radius:6px;cursor:pointer;"
                  onclick="confirmReview(${obs.id})">Confirm</button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  }
}

let pendingStatus = {};

function showReject(id) {
  pendingStatus[id] = 'rejected';
  document.getElementById(`reason-${id}`).style.display = 'block';
}

function showFlag(id) {
  pendingStatus[id] = 'flagged';
  document.getElementById(`reason-${id}`).style.display = 'block';
}

async function confirmReview(id) {
  const status = pendingStatus[id];
  const reason = document.getElementById(`reason-select-${id}`).value;
  await review(id, status, reason);
}

async function review(id, status, reason) {
  const body = { observation_id: id, status };
  if (reason) body.reason = reason;

  await fetch('/api/general/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const card = document.querySelector(`.card[data-id="${id}"]`);
  if (card) card.classList.add('reviewed');

  // Update stats
  const statsRes = await fetch('/api/general/stats');
  const stats = await statsRes.json();
  updateProgress(stats);
}

function updateProgress(data) {
  const el = document.getElementById('progress');
  const reviewed = data.reviewed || data.total_reviewed || 0;
  const total = data.total_observations || data.remaining + reviewed;
  el.textContent = `${reviewed} / ${total} reviewed`;
}

document.getElementById('load-more').addEventListener('click', loadBatch);
loadBatch();
```

### 1D. Add npm script

In `package.json`, the existing `review-daily` script runs the review server. No new script needed — the general review is accessible at `/general` on the same server.

### 1E. Wire flagged observations data

The `scripts/flag-images.py` script (created in Phase 1) outputs flagged observations. Check where it writes output. If it writes to `scripts/output/flagged-observations.json`, the review server should read from there for priority sorting. If the file doesn't exist, fall back to showing unreviewed observations in random order.

---

## Part 2: Unified Analytics Dashboard

### 2A. Current State

- `analytics/dump.py` reads Google Sheets data and generates `analytics/output/dashboard.html`
- `older_analytics/` contains a separate `analyze-feedback.py` for player feedback
- The `.env` in `analytics/` has placeholders for Umami credentials (empty — PRD 5D)

### 2B. Merge Feedback Analysis into dump.py

Add a feedback analysis tab to the existing dashboard. The `dump.py` script already reads game events from Google Sheets. Extend it to:

1. **Extract feedback events** from the same data source:
   - `session_feedback` events (difficulty rating, interesting round, free text, play-again intent)
   - `round_reaction` events (too easy / just right / too hard per round)
   - `bad_photo` events (reported observations)

2. **Generate new dashboard tabs:**

**Tab: Player Feedback**
- Difficulty rating distribution (bar chart: 1-5 scale)
- "Would play again" breakdown (yes/maybe/no pie chart)
- Free text feedback grouped by keyword (difficulty, images, bugs, UI, sets)
- Top reported observations (bad_photo events, with photo URLs and report counts)

**Tab: Image Quality**
- Worst observations by miss rate (table: observation ID, species, miss rate, attempt count, bad photo reports)
- Confusion pairs (which species are most commonly confused with each other)
- Time anomalies (observations where avg answer time is >2x the median)

**Tab: Round-Level Analysis**
- Per-round difficulty reactions (stacked bar: too easy / just right / too hard)
- Drop-off by round number (what % of sessions end before round 10)
- Round-level accuracy by set

### 2C. Dashboard HTML Structure

The existing `dashboard.html` uses a tabbed layout. Add new tabs following the same pattern.

Each tab should render:
- A summary stat row at the top (key numbers)
- Charts using inline SVG or CSS bar charts (no external charting library — keep it self-contained)
- Sortable tables for detailed data

### 2D. Automated Insights Section

Add an "Insights" panel at the top of the dashboard that flags anomalies:

```python
def generate_insights(events):
    insights = []

    # Bad observation flagging
    for obs_id, data in observation_stats.items():
        if data['miss_rate'] > 0.8 and data['attempts'] >= 5:
            insights.append({
                'type': 'warning',
                'text': f"Observation #{obs_id} ({data['species']}) has {data['miss_rate']:.0%} miss rate across {data['attempts']} attempts — review needed"
            })

    # Difficulty spike detection
    for set_name, difficulty_data in per_set_difficulty.items():
        if difficulty_data['too_hard_pct'] > 0.3:
            insights.append({
                'type': 'info',
                'text': f"Set '{set_name}' has {difficulty_data['too_hard_pct']:.0%} 'too hard' ratings — consider adjusting difficulty"
            })

    # Mode trends
    # Compare this week's mode distribution to the previous week
    # Flag if any mode shifted >20% in popularity

    return insights
```

Render insights as colored cards at the top of the dashboard:
- Red cards for warnings (bad observations, high drop-off)
- Yellow cards for notable trends
- Green cards for positive signals (increased sharing, higher scores)

### 2E. Umami Integration Placeholder

The `.env` has empty Umami credentials. Add a stub in `dump.py` that:
1. Checks if Umami credentials are configured
2. If yes, fetches pageview/session data from the Umami API and adds a "Traffic" tab
3. If no, shows "Umami not configured — add credentials to analytics/.env" on the Traffic tab

This allows the dashboard to work without Umami while making it easy to enable later.

```python
def fetch_umami_data():
    """Fetch pageview and session data from Umami API."""
    umami_url = os.environ.get('UMAMI_URL', '')
    umami_token = os.environ.get('UMAMI_TOKEN', '')

    if not umami_url or not umami_token:
        return None  # Not configured

    # Umami API v2 endpoints
    # GET /api/websites/{websiteId}/stats — summary stats
    # GET /api/websites/{websiteId}/pageviews — pageview timeseries
    # GET /api/websites/{websiteId}/metrics — referrers, browsers, etc.

    try:
        headers = { 'Authorization': f'Bearer {umami_token}' }
        website_id = os.environ.get('UMAMI_WEBSITE_ID', '')

        stats = requests.get(f'{umami_url}/api/websites/{website_id}/stats', headers=headers).json()
        pageviews = requests.get(f'{umami_url}/api/websites/{website_id}/pageviews', headers=headers).json()
        metrics = requests.get(f'{umami_url}/api/websites/{website_id}/metrics', headers=headers).json()

        return { 'stats': stats, 'pageviews': pageviews, 'metrics': metrics }
    except Exception as e:
        print(f'Warning: Umami fetch failed: {e}')
        return None
```

---

## Testing

### Review Server

1. Start the review server: `npm run review-daily`
2. Navigate to `http://localhost:3333/general`
3. Verify the observation grid loads with photos, species names, and flag data
4. Click Approve on a few observations — verify they gray out and stats update
5. Click Reject on one — verify reason selector appears, confirm, verify it saves
6. Check `public/data/reviewed-observations.json` — verify entries are written
7. Reload the page — verified reviewed observations don't appear again in the batch

### Analytics Dashboard

1. Run `python analytics/dump.py` with a Google Sheets export
2. Open `analytics/output/dashboard.html`
3. Verify new tabs appear: Player Feedback, Image Quality, Round-Level Analysis
4. Check the Insights panel for flagged observations and trends
5. Verify the Umami tab shows "not configured" message (since credentials are empty)

---

## Risks

- **Review server concurrency:** The server reads/writes `reviewed-observations.json` synchronously. If two review actions happen within milliseconds, a write could be lost. Mitigation: the review tool is single-user (you reviewing locally), so this is a non-issue in practice. If needed later, add file locking.
- **Large observation photos:** Loading 20 observation photos at once may be slow on poor connections. Mitigation: use `loading="lazy"` on images, which the browser handles natively.
- **Analytics data format changes:** If the Google Sheets event schema changes, `dump.py` will break. Mitigation: add validation at the top of the script that checks for expected columns and prints a clear error if they're missing.
- **Dashboard file size:** With charts and tables for 2,621 observations, the dashboard HTML could grow large. Mitigation: paginate tables (show top 50, with "show all" toggle). Use CSS charts instead of SVG to keep file size down.
