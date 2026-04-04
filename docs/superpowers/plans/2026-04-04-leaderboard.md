# Leaderboard System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global top-10 leaderboard for the 4 competitive modes with celebration popups, personal best notifications, and a dedicated leaderboard page.

**Architecture:** Google Apps Script serves as both write (existing webhook) and read (new GET endpoint) backend. A new "Leaderboard" tab in the Google Sheet stores entries. Client fetches leaderboard at session end to determine if a celebration/personal-best popup should appear. New `/leaderboard` page shows all 4 boards.

**Tech Stack:** Astro 4, vanilla JS (ES modules), Google Apps Script, CSS custom properties

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/scripts/countries.js` | Create | ~200 countries with flag emoji + name, sorted alphabetically |
| `src/scripts/leaderboard.js` | Create | Fetch leaderboard (GET), submit entry (POST), top-10 check logic |
| `src/scripts/leaderboard-ui.js` | Create | Celebration popup, personal best popup, leaderboard table HTML |
| `src/scripts/share.js` | Modify | Add `generateLeaderboardShareText(rank, setKey, score, streak)` |
| `src/scripts/game-ui.js` | Modify | Integrate leaderboard check at session end for TT/Streaks |
| `src/pages/leaderboard.astro` | Create | Leaderboard page with tabbed sections |
| `src/layouts/Base.astro` | Modify | Add "Leaderboard" link to header nav |
| `src/styles/global.css` | Modify | Leaderboard table, popups, tabs, spinner styles |
| Google Apps Script | Modify | Add GET leaderboard + POST leaderboard_entry handlers |

---

### Task 1: Create countries.js — country list with flag emojis

**Files:**
- Create: `src/scripts/countries.js`

- [ ] **Step 1: Create the countries module**

Create `src/scripts/countries.js` with the full list of ~200 countries. Each entry is `{ code, flag, name }`. The flag is the emoji flag sequence (two regional indicator symbols). Export as a sorted array and a helper to render `<option>` elements.

```javascript
/**
 * Country list with flag emojis for the leaderboard country selector.
 */

export const COUNTRIES = [
  { code: 'AF', flag: '🇦🇫', name: 'Afghanistan' },
  { code: 'AL', flag: '🇦🇱', name: 'Albania' },
  { code: 'DZ', flag: '🇩🇿', name: 'Algeria' },
  { code: 'AD', flag: '🇦🇩', name: 'Andorra' },
  { code: 'AO', flag: '🇦🇴', name: 'Angola' },
  { code: 'AG', flag: '🇦🇬', name: 'Antigua and Barbuda' },
  { code: 'AR', flag: '🇦🇷', name: 'Argentina' },
  { code: 'AM', flag: '🇦🇲', name: 'Armenia' },
  { code: 'AU', flag: '🇦🇺', name: 'Australia' },
  { code: 'AT', flag: '🇦🇹', name: 'Austria' },
  { code: 'AZ', flag: '🇦🇿', name: 'Azerbaijan' },
  { code: 'BS', flag: '🇧🇸', name: 'Bahamas' },
  { code: 'BH', flag: '🇧🇭', name: 'Bahrain' },
  { code: 'BD', flag: '🇧🇩', name: 'Bangladesh' },
  { code: 'BB', flag: '🇧🇧', name: 'Barbados' },
  { code: 'BY', flag: '🇧🇾', name: 'Belarus' },
  { code: 'BE', flag: '🇧🇪', name: 'Belgium' },
  { code: 'BZ', flag: '🇧🇿', name: 'Belize' },
  { code: 'BJ', flag: '🇧🇯', name: 'Benin' },
  { code: 'BT', flag: '🇧🇹', name: 'Bhutan' },
  { code: 'BO', flag: '🇧🇴', name: 'Bolivia' },
  { code: 'BA', flag: '🇧🇦', name: 'Bosnia and Herzegovina' },
  { code: 'BW', flag: '🇧🇼', name: 'Botswana' },
  { code: 'BR', flag: '🇧🇷', name: 'Brazil' },
  { code: 'BN', flag: '🇧🇳', name: 'Brunei' },
  { code: 'BG', flag: '🇧🇬', name: 'Bulgaria' },
  { code: 'BF', flag: '🇧🇫', name: 'Burkina Faso' },
  { code: 'BI', flag: '🇧🇮', name: 'Burundi' },
  { code: 'CV', flag: '🇨🇻', name: 'Cabo Verde' },
  { code: 'KH', flag: '🇰🇭', name: 'Cambodia' },
  { code: 'CM', flag: '🇨🇲', name: 'Cameroon' },
  { code: 'CA', flag: '🇨🇦', name: 'Canada' },
  { code: 'CF', flag: '🇨🇫', name: 'Central African Republic' },
  { code: 'TD', flag: '🇹🇩', name: 'Chad' },
  { code: 'CL', flag: '🇨🇱', name: 'Chile' },
  { code: 'CN', flag: '🇨🇳', name: 'China' },
  { code: 'CO', flag: '🇨🇴', name: 'Colombia' },
  { code: 'KM', flag: '🇰🇲', name: 'Comoros' },
  { code: 'CG', flag: '🇨🇬', name: 'Congo' },
  { code: 'CD', flag: '🇨🇩', name: 'Congo (DRC)' },
  { code: 'CR', flag: '🇨🇷', name: 'Costa Rica' },
  { code: 'HR', flag: '🇭🇷', name: 'Croatia' },
  { code: 'CU', flag: '🇨🇺', name: 'Cuba' },
  { code: 'CY', flag: '🇨🇾', name: 'Cyprus' },
  { code: 'CZ', flag: '🇨🇿', name: 'Czechia' },
  { code: 'DK', flag: '🇩🇰', name: 'Denmark' },
  { code: 'DJ', flag: '🇩🇯', name: 'Djibouti' },
  { code: 'DM', flag: '🇩🇲', name: 'Dominica' },
  { code: 'DO', flag: '🇩🇴', name: 'Dominican Republic' },
  { code: 'EC', flag: '🇪🇨', name: 'Ecuador' },
  { code: 'EG', flag: '🇪🇬', name: 'Egypt' },
  { code: 'SV', flag: '🇸🇻', name: 'El Salvador' },
  { code: 'GQ', flag: '🇬🇶', name: 'Equatorial Guinea' },
  { code: 'ER', flag: '🇪🇷', name: 'Eritrea' },
  { code: 'EE', flag: '🇪🇪', name: 'Estonia' },
  { code: 'SZ', flag: '🇸🇿', name: 'Eswatini' },
  { code: 'ET', flag: '🇪🇹', name: 'Ethiopia' },
  { code: 'FJ', flag: '🇫🇯', name: 'Fiji' },
  { code: 'FI', flag: '🇫🇮', name: 'Finland' },
  { code: 'FR', flag: '🇫🇷', name: 'France' },
  { code: 'GA', flag: '🇬🇦', name: 'Gabon' },
  { code: 'GM', flag: '🇬🇲', name: 'Gambia' },
  { code: 'GE', flag: '🇬🇪', name: 'Georgia' },
  { code: 'DE', flag: '🇩🇪', name: 'Germany' },
  { code: 'GH', flag: '🇬🇭', name: 'Ghana' },
  { code: 'GR', flag: '🇬🇷', name: 'Greece' },
  { code: 'GD', flag: '🇬🇩', name: 'Grenada' },
  { code: 'GT', flag: '🇬🇹', name: 'Guatemala' },
  { code: 'GN', flag: '🇬🇳', name: 'Guinea' },
  { code: 'GW', flag: '🇬🇼', name: 'Guinea-Bissau' },
  { code: 'GY', flag: '🇬🇾', name: 'Guyana' },
  { code: 'HT', flag: '🇭🇹', name: 'Haiti' },
  { code: 'HN', flag: '🇭🇳', name: 'Honduras' },
  { code: 'HU', flag: '🇭🇺', name: 'Hungary' },
  { code: 'IS', flag: '🇮🇸', name: 'Iceland' },
  { code: 'IN', flag: '🇮🇳', name: 'India' },
  { code: 'ID', flag: '🇮🇩', name: 'Indonesia' },
  { code: 'IR', flag: '🇮🇷', name: 'Iran' },
  { code: 'IQ', flag: '🇮🇶', name: 'Iraq' },
  { code: 'IE', flag: '🇮🇪', name: 'Ireland' },
  { code: 'IL', flag: '🇮🇱', name: 'Israel' },
  { code: 'IT', flag: '🇮🇹', name: 'Italy' },
  { code: 'CI', flag: '🇨🇮', name: 'Ivory Coast' },
  { code: 'JM', flag: '🇯🇲', name: 'Jamaica' },
  { code: 'JP', flag: '🇯🇵', name: 'Japan' },
  { code: 'JO', flag: '🇯🇴', name: 'Jordan' },
  { code: 'KZ', flag: '🇰🇿', name: 'Kazakhstan' },
  { code: 'KE', flag: '🇰🇪', name: 'Kenya' },
  { code: 'KI', flag: '🇰🇮', name: 'Kiribati' },
  { code: 'KW', flag: '🇰🇼', name: 'Kuwait' },
  { code: 'KG', flag: '🇰🇬', name: 'Kyrgyzstan' },
  { code: 'LA', flag: '🇱🇦', name: 'Laos' },
  { code: 'LV', flag: '🇱🇻', name: 'Latvia' },
  { code: 'LB', flag: '🇱🇧', name: 'Lebanon' },
  { code: 'LS', flag: '🇱🇸', name: 'Lesotho' },
  { code: 'LR', flag: '🇱🇷', name: 'Liberia' },
  { code: 'LY', flag: '🇱🇾', name: 'Libya' },
  { code: 'LI', flag: '🇱🇮', name: 'Liechtenstein' },
  { code: 'LT', flag: '🇱🇹', name: 'Lithuania' },
  { code: 'LU', flag: '🇱🇺', name: 'Luxembourg' },
  { code: 'MG', flag: '🇲🇬', name: 'Madagascar' },
  { code: 'MW', flag: '🇲🇼', name: 'Malawi' },
  { code: 'MY', flag: '🇲🇾', name: 'Malaysia' },
  { code: 'MV', flag: '🇲🇻', name: 'Maldives' },
  { code: 'ML', flag: '🇲🇱', name: 'Mali' },
  { code: 'MT', flag: '🇲🇹', name: 'Malta' },
  { code: 'MH', flag: '🇲🇭', name: 'Marshall Islands' },
  { code: 'MR', flag: '🇲🇷', name: 'Mauritania' },
  { code: 'MU', flag: '🇲🇺', name: 'Mauritius' },
  { code: 'MX', flag: '🇲🇽', name: 'Mexico' },
  { code: 'FM', flag: '🇫🇲', name: 'Micronesia' },
  { code: 'MD', flag: '🇲🇩', name: 'Moldova' },
  { code: 'MC', flag: '🇲🇨', name: 'Monaco' },
  { code: 'MN', flag: '🇲🇳', name: 'Mongolia' },
  { code: 'ME', flag: '🇲🇪', name: 'Montenegro' },
  { code: 'MA', flag: '🇲🇦', name: 'Morocco' },
  { code: 'MZ', flag: '🇲🇿', name: 'Mozambique' },
  { code: 'MM', flag: '🇲🇲', name: 'Myanmar' },
  { code: 'NA', flag: '🇳🇦', name: 'Namibia' },
  { code: 'NR', flag: '🇳🇷', name: 'Nauru' },
  { code: 'NP', flag: '🇳🇵', name: 'Nepal' },
  { code: 'NL', flag: '🇳🇱', name: 'Netherlands' },
  { code: 'NZ', flag: '🇳🇿', name: 'New Zealand' },
  { code: 'NI', flag: '🇳🇮', name: 'Nicaragua' },
  { code: 'NE', flag: '🇳🇪', name: 'Niger' },
  { code: 'NG', flag: '🇳🇬', name: 'Nigeria' },
  { code: 'KP', flag: '🇰🇵', name: 'North Korea' },
  { code: 'MK', flag: '🇲🇰', name: 'North Macedonia' },
  { code: 'NO', flag: '🇳🇴', name: 'Norway' },
  { code: 'OM', flag: '🇴🇲', name: 'Oman' },
  { code: 'PK', flag: '🇵🇰', name: 'Pakistan' },
  { code: 'PW', flag: '🇵🇼', name: 'Palau' },
  { code: 'PS', flag: '🇵🇸', name: 'Palestine' },
  { code: 'PA', flag: '🇵🇦', name: 'Panama' },
  { code: 'PG', flag: '🇵🇬', name: 'Papua New Guinea' },
  { code: 'PY', flag: '🇵🇾', name: 'Paraguay' },
  { code: 'PE', flag: '🇵🇪', name: 'Peru' },
  { code: 'PH', flag: '🇵🇭', name: 'Philippines' },
  { code: 'PL', flag: '🇵🇱', name: 'Poland' },
  { code: 'PT', flag: '🇵🇹', name: 'Portugal' },
  { code: 'QA', flag: '🇶🇦', name: 'Qatar' },
  { code: 'RO', flag: '🇷🇴', name: 'Romania' },
  { code: 'RU', flag: '🇷🇺', name: 'Russia' },
  { code: 'RW', flag: '🇷🇼', name: 'Rwanda' },
  { code: 'KN', flag: '🇰🇳', name: 'Saint Kitts and Nevis' },
  { code: 'LC', flag: '🇱🇨', name: 'Saint Lucia' },
  { code: 'VC', flag: '🇻🇨', name: 'Saint Vincent and the Grenadines' },
  { code: 'WS', flag: '🇼🇸', name: 'Samoa' },
  { code: 'SM', flag: '🇸🇲', name: 'San Marino' },
  { code: 'ST', flag: '🇸🇹', name: 'Sao Tome and Principe' },
  { code: 'SA', flag: '🇸🇦', name: 'Saudi Arabia' },
  { code: 'SN', flag: '🇸🇳', name: 'Senegal' },
  { code: 'RS', flag: '🇷🇸', name: 'Serbia' },
  { code: 'SC', flag: '🇸🇨', name: 'Seychelles' },
  { code: 'SL', flag: '🇸🇱', name: 'Sierra Leone' },
  { code: 'SG', flag: '🇸🇬', name: 'Singapore' },
  { code: 'SK', flag: '🇸🇰', name: 'Slovakia' },
  { code: 'SI', flag: '🇸🇮', name: 'Slovenia' },
  { code: 'SB', flag: '🇸🇧', name: 'Solomon Islands' },
  { code: 'SO', flag: '🇸🇴', name: 'Somalia' },
  { code: 'ZA', flag: '🇿🇦', name: 'South Africa' },
  { code: 'KR', flag: '🇰🇷', name: 'South Korea' },
  { code: 'SS', flag: '🇸🇸', name: 'South Sudan' },
  { code: 'ES', flag: '🇪🇸', name: 'Spain' },
  { code: 'LK', flag: '🇱🇰', name: 'Sri Lanka' },
  { code: 'SD', flag: '🇸🇩', name: 'Sudan' },
  { code: 'SR', flag: '🇸🇷', name: 'Suriname' },
  { code: 'SE', flag: '🇸🇪', name: 'Sweden' },
  { code: 'CH', flag: '🇨🇭', name: 'Switzerland' },
  { code: 'SY', flag: '🇸🇾', name: 'Syria' },
  { code: 'TW', flag: '🇹🇼', name: 'Taiwan' },
  { code: 'TJ', flag: '🇹🇯', name: 'Tajikistan' },
  { code: 'TZ', flag: '🇹🇿', name: 'Tanzania' },
  { code: 'TH', flag: '🇹🇭', name: 'Thailand' },
  { code: 'TL', flag: '🇹🇱', name: 'Timor-Leste' },
  { code: 'TG', flag: '🇹🇬', name: 'Togo' },
  { code: 'TO', flag: '🇹🇴', name: 'Tonga' },
  { code: 'TT', flag: '🇹🇹', name: 'Trinidad and Tobago' },
  { code: 'TN', flag: '🇹🇳', name: 'Tunisia' },
  { code: 'TR', flag: '🇹🇷', name: 'Turkey' },
  { code: 'TM', flag: '🇹🇲', name: 'Turkmenistan' },
  { code: 'TV', flag: '🇹🇻', name: 'Tuvalu' },
  { code: 'UG', flag: '🇺🇬', name: 'Uganda' },
  { code: 'UA', flag: '🇺🇦', name: 'Ukraine' },
  { code: 'AE', flag: '🇦🇪', name: 'United Arab Emirates' },
  { code: 'GB', flag: '🇬🇧', name: 'United Kingdom' },
  { code: 'US', flag: '🇺🇸', name: 'United States' },
  { code: 'UY', flag: '🇺🇾', name: 'Uruguay' },
  { code: 'UZ', flag: '🇺🇿', name: 'Uzbekistan' },
  { code: 'VU', flag: '🇻🇺', name: 'Vanuatu' },
  { code: 'VA', flag: '🇻🇦', name: 'Vatican City' },
  { code: 'VE', flag: '🇻🇪', name: 'Venezuela' },
  { code: 'VN', flag: '🇻🇳', name: 'Vietnam' },
  { code: 'YE', flag: '🇾🇪', name: 'Yemen' },
  { code: 'ZM', flag: '🇿🇲', name: 'Zambia' },
  { code: 'ZW', flag: '🇿🇼', name: 'Zimbabwe' },
];

export function renderCountryOptions() {
  return '<option value="">Select country (optional)</option>' +
    COUNTRIES.map(c => `<option value="${c.code}">${c.flag} ${c.name}</option>`).join('');
}

export function getFlagForCode(code) {
  if (!code) return '';
  const country = COUNTRIES.find(c => c.code === code);
  return country ? country.flag : '';
}
```

- [ ] **Step 2: Commit**

```bash
git add src/scripts/countries.js
git commit -m "feat: add countries module with flag emojis for leaderboard"
```

---

### Task 2: Create leaderboard.js — API client and top-10 logic

**Files:**
- Create: `src/scripts/leaderboard.js`

- [ ] **Step 1: Create the leaderboard API module**

Create `src/scripts/leaderboard.js`. This module handles all communication with the Apps Script backend and the top-10 check logic.

```javascript
/**
 * Leaderboard API client — fetch/submit leaderboard data via Google Apps Script.
 */

const WEBHOOK_URL = import.meta.env.PUBLIC_GOOGLE_SHEET_WEBHOOK_URL || '';

const LEADERBOARD_SETS = ['bugs_101_time_trial', 'bugs_101_streak', 'time_trial', 'streak'];

export function isLeaderboardEligible(setKey) {
  return LEADERBOARD_SETS.includes(setKey);
}

/**
 * Fetch all leaderboards from Apps Script.
 * Returns: { bugs_101_time_trial: Entry[], bugs_101_streak: Entry[], time_trial: Entry[], streak: Entry[] }
 * Each Entry: { rank, name, country, score, streak, questions, correct, timestamp }
 */
export async function fetchLeaderboards() {
  if (!WEBHOOK_URL) return null;
  const url = `${WEBHOOK_URL}?action=leaderboard`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Leaderboard fetch failed: ${res.status}`);
  return res.json();
}

/**
 * Submit a leaderboard entry and get back the updated top 10 for that board.
 */
export async function submitLeaderboardEntry(entry) {
  if (!WEBHOOK_URL) return null;
  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action: 'leaderboard_entry', ...entry }),
  });
  if (!res.ok) throw new Error(`Leaderboard submit failed: ${res.status}`);
  return res.json();
}

/**
 * Check if a score qualifies for the top 10.
 * Returns { qualifies: boolean, rank: number } where rank is 1-10 or 0 if not qualifying.
 */
export function checkTop10(board, score, isStreak) {
  if (!board || board.length === 0) return { qualifies: true, rank: 1 };

  const value = isStreak ? score : score; // both use numeric comparison
  const boardValues = board.map(e => isStreak ? (e.streak || 0) : (e.score || 0));

  // Find where this score would rank
  let rank = 1;
  for (const v of boardValues) {
    if (value > v) break;
    rank++;
  }

  if (rank <= 10) return { qualifies: true, rank };
  return { qualifies: false, rank };
}

/**
 * Check if this is a personal best for the given set key.
 * Compares against localStorage. Updates localStorage if it is.
 * Returns { isPersonalBest: boolean, previousBest: number }
 */
export function checkPersonalBest(setKey, score, isStreak) {
  const storageKey = `best_${setKey}`;
  const previousBest = parseInt(localStorage.getItem(storageKey) || '0', 10);
  const value = isStreak ? score : score;

  if (value > previousBest) {
    localStorage.setItem(storageKey, value.toString());
    return { isPersonalBest: true, previousBest };
  }
  return { isPersonalBest: false, previousBest };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/scripts/leaderboard.js
git commit -m "feat: add leaderboard API client with top-10 check logic"
```

---

### Task 3: Add rank-specific share text to share.js

**Files:**
- Modify: `src/scripts/share.js`

- [ ] **Step 1: Add `generateLeaderboardShareText` function**

Add this function to `src/scripts/share.js` after the existing share functions (before `copyToClipboard`):

```javascript
/**
 * Generate share text for a leaderboard entry.
 * rank: 1-10, setKey: e.g. 'bugs_101_time_trial', score: number, streak: number (for streak modes)
 */
export function generateLeaderboardShareText(rank, setKey, score, streak) {
  const isStreak = setKey.includes('streak');
  const isBugs101 = setKey.startsWith('bugs_101');

  const modeLabel = isStreak ? 'Streaks' : 'Time Trial';
  const modeIcon = isStreak ? '🎯' : '⏱️';
  const setLabel = isBugs101 ? `Bugs 101 ${modeLabel}` : `All Bugs ${modeLabel}`;
  const scoreText = isStreak ? `${streak} in a row` : `${score} pts`;

  // Medal emoji
  let medal;
  if (rank === 1) medal = '🥇';
  else if (rank === 2) medal = '🥈';
  else if (rank === 3) medal = '🥉';
  else medal = '🏆';

  // Record line
  let recordLine;
  if (rank === 1) recordLine = '⚡ WORLD RECORD ⚡';
  else if (rank <= 3) recordLine = '👑 NEW RECORD 👑';
  else recordLine = '🚨 NEW RECORD 🚨';

  // Heading
  let heading;
  if (rank === 1) heading = `⚡${medal}🪲 I'm the #1 Bug Identifier in the WORLD!`;
  else heading = `${medal}🪲 I'm ranked #${rank} in the WORLD on What's That Bug!`;

  // CTA
  const cta = rank === 1 ? 'Come dethrone me' : 'Think you can beat me?';

  const modeParam = isStreak ? 'streak' : 'time_trial';

  return [
    heading,
    '',
    `${modeIcon} ${setLabel} — ${scoreText}`,
    '',
    recordLine,
    '',
    cta,
    `https://dewanggogte.com/games/bugs/?ref=share&mode=${modeParam}`,
  ].join('\n');
}
```

- [ ] **Step 2: Commit**

```bash
git add src/scripts/share.js
git commit -m "feat: add rank-specific leaderboard share text generator"
```

---

### Task 4: Create leaderboard-ui.js — popups and table rendering

**Files:**
- Create: `src/scripts/leaderboard-ui.js`

- [ ] **Step 1: Create the leaderboard UI module**

Create `src/scripts/leaderboard-ui.js`. This handles rendering the celebration popup, personal best popup, and leaderboard table HTML.

```javascript
/**
 * Leaderboard UI — celebration popup, personal best popup, leaderboard table rendering.
 */

import { renderCountryOptions, getFlagForCode } from './countries.js';
import { submitLeaderboardEntry } from './leaderboard.js';
import { generateLeaderboardShareText, copyToClipboard, openWhatsApp, openIMessage, openTweetIntent } from './share.js';

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Render a leaderboard table HTML.
 * board: array of { rank, name, country, score, streak }
 * highlightRank: optional rank to highlight (1-10)
 * isStreak: if true, show streak column instead of score
 */
export function renderLeaderboardTable(board, isStreak, highlightRank) {
  if (!board || board.length === 0) {
    return '<p style="text-align:center;color:var(--text-secondary);font-size:0.85rem;padding:16px 0;">No entries yet. Be the first!</p>';
  }

  const rows = board.map((entry, i) => {
    const rank = i + 1;
    const isHighlighted = rank === highlightRank;
    let rankDisplay;
    if (rank === 1) rankDisplay = '🥇';
    else if (rank === 2) rankDisplay = '🥈';
    else if (rank === 3) rankDisplay = '🥉';
    else rankDisplay = `#${rank}`;

    const flag = getFlagForCode(entry.country);
    const name = escapeHTML(entry.name || 'Anonymous Bug Hunter');
    const value = isStreak ? (entry.streak || 0) : (entry.score || 0);
    const valueLabel = isStreak ? `${value} streak` : `${value} pts`;

    const highlightClass = isHighlighted ? ' lb-row-highlight' : '';
    const medalClass = rank <= 3 ? ` lb-row-top${rank}` : '';

    return `
      <div class="lb-row${medalClass}${highlightClass}">
        <span class="lb-rank">${rankDisplay}</span>
        <span class="lb-flag">${flag}</span>
        <span class="lb-name">${name}</span>
        <span class="lb-value">${valueLabel}</span>
      </div>
    `;
  }).join('');

  return `<div class="lb-table">${rows}</div>`;
}

/**
 * Show loading spinner overlay.
 * Returns a function to dismiss it.
 */
export function showLoadingSpinner(message) {
  const overlay = document.createElement('div');
  overlay.className = 'lb-loading-overlay';
  overlay.innerHTML = `
    <div class="lb-loading-card">
      <div class="lb-spinner"></div>
      <p>${escapeHTML(message)}</p>
    </div>
  `;
  document.body.appendChild(overlay);
  return () => overlay.remove();
}

/**
 * Show celebration popup for a top-10 entry.
 * Returns a promise that resolves when the user submits/closes.
 */
export function showCelebrationPopup({ rank, score, streak, setKey, sessionId, board, questionsAnswered, correctCount }) {
  return new Promise((resolve) => {
    const isStreak = setKey.includes('streak');
    const scoreDisplay = isStreak ? `${streak} in a row` : `${score} pts`;

    // Medal and heading
    let medal, heading;
    if (rank === 1) { medal = '🥇'; heading = "⚡ You're #1!"; }
    else if (rank === 2) { medal = '🥈'; heading = "You're #2!"; }
    else if (rank === 3) { medal = '🥉'; heading = "You're #3!"; }
    else { medal = '🏆'; heading = `You're #${rank}!`; }

    const shareText = generateLeaderboardShareText(rank, setKey, score, streak);
    const tableHTML = renderLeaderboardTable(board, isStreak, rank);

    const overlay = document.createElement('div');
    overlay.className = 'lb-popup-overlay';
    overlay.innerHTML = `
      <div class="lb-popup">
        <button class="lb-popup-close" aria-label="Close">&times;</button>
        <div class="lb-popup-header">
          <div class="lb-popup-medal">${medal}</div>
          <h2 class="lb-popup-heading">${heading}</h2>
          <div class="lb-popup-score">${scoreDisplay}</div>
        </div>

        <div class="lb-popup-form">
          <input type="text" id="lb-name" class="lb-input" placeholder="Anonymous Bug Hunter" maxlength="30">
          <select id="lb-country" class="lb-select">
            ${renderCountryOptions()}
          </select>
          <button class="btn btn-primary lb-submit-btn" id="lb-submit">Submit to Leaderboard</button>
        </div>

        ${tableHTML}

        <div class="share-buttons" style="margin-top:16px;">
          <button class="btn btn-outline share-icon-btn" id="lb-wa" title="WhatsApp"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg></button>
          <button class="btn btn-outline share-icon-btn" id="lb-im" title="iMessage"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></button>
          <button class="btn btn-outline share-icon-btn" id="lb-tw" title="X"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg></button>
          <button class="btn btn-outline" id="lb-copy">Copy</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Share handlers
    overlay.querySelector('#lb-wa')?.addEventListener('click', () => openWhatsApp(shareText));
    overlay.querySelector('#lb-im')?.addEventListener('click', () => openIMessage(shareText));
    overlay.querySelector('#lb-tw')?.addEventListener('click', () => openTweetIntent(shareText));
    overlay.querySelector('#lb-copy')?.addEventListener('click', async () => {
      const ok = await copyToClipboard(shareText);
      const btn = overlay.querySelector('#lb-copy');
      btn.textContent = ok ? 'Copied!' : 'Failed';
      setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
    });

    // Submit handler
    const submitEntry = async () => {
      const name = overlay.querySelector('#lb-name')?.value.trim() || '';
      const country = overlay.querySelector('#lb-country')?.value || '';

      const submitBtn = overlay.querySelector('#lb-submit');
      submitBtn.textContent = 'Submitting...';
      submitBtn.disabled = true;

      try {
        await submitLeaderboardEntry({
          session_id: sessionId,
          set_key: setKey,
          score,
          streak: streak || 0,
          name: name || 'Anonymous Bug Hunter',
          country,
          questions_answered: questionsAnswered || 0,
          correct_count: correctCount || 0,
        });
      } catch (err) {
        console.warn('Leaderboard submit failed:', err);
      }

      overlay.remove();
      resolve();
    };

    overlay.querySelector('#lb-submit')?.addEventListener('click', submitEntry);

    // Close = submit as anonymous
    overlay.querySelector('.lb-popup-close')?.addEventListener('click', submitEntry);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) submitEntry();
    });
  });
}

/**
 * Show personal best popup (not top 10).
 * Returns a promise that resolves when the user closes it.
 */
export function showPersonalBestPopup({ score, streak, previousBest, setKey, board }) {
  return new Promise((resolve) => {
    const isStreak = setKey.includes('streak');
    const scoreDisplay = isStreak ? `${streak} in a row` : `${score} pts`;
    const prevDisplay = isStreak ? `${previousBest} in a row` : `${previousBest} pts`;
    const tableHTML = renderLeaderboardTable(board, isStreak);

    const overlay = document.createElement('div');
    overlay.className = 'lb-popup-overlay';
    overlay.innerHTML = `
      <div class="lb-popup">
        <button class="lb-popup-close" aria-label="Close">&times;</button>
        <div class="lb-popup-header">
          <h2 class="lb-popup-heading">New Personal Best!</h2>
          <div class="lb-popup-score">${scoreDisplay}</div>
          <p class="lb-popup-prev">Previous: ${prevDisplay}</p>
        </div>

        <h3 style="font-size:0.9rem;margin:16px 0 8px;color:var(--text-secondary);">Top 10</h3>
        ${tableHTML}
        <p style="text-align:center;color:var(--text-secondary);font-size:0.8rem;margin-top:8px;">Keep climbing!</p>
      </div>
    `;

    document.body.appendChild(overlay);

    const dismiss = () => {
      overlay.remove();
      resolve();
    };

    overlay.querySelector('.lb-popup-close')?.addEventListener('click', dismiss);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) dismiss();
    });
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/scripts/leaderboard-ui.js
git commit -m "feat: add leaderboard UI with celebration and personal best popups"
```

---

### Task 5: Add leaderboard CSS

**Files:**
- Modify: `src/styles/global.css`

- [ ] **Step 1: Append leaderboard styles to global.css**

Add these styles at the end of `src/styles/global.css`:

```css
/* =============================================
   Leaderboard Table
   ============================================= */
.lb-table {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 12px;
}

.lb-row {
  display: grid;
  grid-template-columns: 36px 28px 1fr auto;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg);
  border-radius: 8px;
  font-size: 0.85rem;
}

.lb-row-top1 { background: rgba(234, 179, 8, 0.1); }
.lb-row-top2 { background: rgba(192, 192, 192, 0.1); }
.lb-row-top3 { background: rgba(205, 127, 50, 0.1); }

.lb-row-highlight {
  border: 2px solid var(--accent);
  animation: lbPulse 1.5s ease-in-out infinite alternate;
}

@keyframes lbPulse {
  from { box-shadow: 0 0 0 0 rgba(184, 90, 59, 0.3); }
  to { box-shadow: 0 0 0 6px rgba(184, 90, 59, 0); }
}

.lb-rank {
  font-weight: 700;
  text-align: center;
  font-size: 0.9rem;
}

.lb-flag {
  font-size: 1.1rem;
  text-align: center;
}

.lb-name {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lb-value {
  font-weight: 700;
  color: var(--accent);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

/* =============================================
   Leaderboard Popup Overlay
   ============================================= */
.lb-popup-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
  animation: fadeIn 0.2s ease;
  overflow-y: auto;
  padding: 24px 16px;
}

.lb-popup {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 24px;
  max-width: 420px;
  width: 100%;
  position: relative;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.lb-popup-close {
  position: absolute;
  top: 12px;
  right: 12px;
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 24px;
  cursor: pointer;
  padding: 4px 8px;
  line-height: 1;
  z-index: 1;
}

.lb-popup-close:hover { color: var(--text); }

.lb-popup-header {
  text-align: center;
  margin-bottom: 16px;
}

.lb-popup-medal {
  font-size: 48px;
  line-height: 1;
  margin-bottom: 8px;
}

.lb-popup-heading {
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 4px;
}

.lb-popup-score {
  font-size: 1.8rem;
  font-weight: 700;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}

.lb-popup-prev {
  font-size: 0.85rem;
  color: var(--text-secondary);
  margin-top: 4px;
}

/* =============================================
   Leaderboard Form (name + country)
   ============================================= */
.lb-popup-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.lb-input, .lb-select {
  width: 100%;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 0.9rem;
  color: var(--text);
  font-family: inherit;
}

.lb-input:focus, .lb-select:focus {
  outline: none;
  border-color: var(--accent);
}

.lb-submit-btn {
  width: 100%;
  margin-top: 4px;
}

/* =============================================
   Leaderboard Loading Spinner
   ============================================= */
.lb-loading-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
}

.lb-loading-card {
  background: var(--surface);
  border-radius: 16px;
  padding: 32px 40px;
  text-align: center;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.lb-loading-card p {
  margin-top: 12px;
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.lb-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: lbSpin 0.7s linear infinite;
  margin: 0 auto;
}

@keyframes lbSpin {
  to { transform: rotate(360deg); }
}

/* =============================================
   Leaderboard Page Tabs
   ============================================= */
.lb-tabs {
  display: flex;
  gap: 0;
  margin-bottom: 12px;
  border-bottom: 2px solid var(--border);
}

.lb-tab {
  padding: 8px 16px;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  border: none;
  background: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  transition: color 0.15s ease, border-color 0.15s ease;
}

.lb-tab:hover {
  color: var(--text);
}

.lb-tab.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}

.lb-tab-content {
  display: none;
}

.lb-tab-content.active {
  display: block;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/styles/global.css
git commit -m "feat: add leaderboard CSS — table, popups, spinner, tabs"
```

---

### Task 6: Integrate leaderboard into game-ui.js session end

**Files:**
- Modify: `src/scripts/game-ui.js`

- [ ] **Step 1: Add leaderboard import at the top of game-ui.js**

Add this import after the existing imports (after line 8):

```javascript
import { isLeaderboardEligible, fetchLeaderboards, checkTop10, checkPersonalBest } from './leaderboard.js';
import { showLoadingSpinner, showCelebrationPopup, showPersonalBestPopup } from './leaderboard-ui.js';
```

- [ ] **Step 2: Add `handleLeaderboardCheck` function**

Add this function before the `renderClassicSummary` function (around line 642):

```javascript
// ===== LEADERBOARD CHECK =====

async function handleLeaderboardCheck(score, streak, renderResultsFn) {
  const isStreak = currentSetKey.includes('streak');
  const value = isStreak ? streak : score;

  if (!isLeaderboardEligible(currentSetKey) || value <= 0) {
    renderResultsFn();
    return;
  }

  // Show loading spinner
  const dismissSpinner = showLoadingSpinner('Checking leaderboard...');

  try {
    const allBoards = await fetchLeaderboards();
    const board = allBoards?.[currentSetKey] || [];

    dismissSpinner();

    const { qualifies, rank } = checkTop10(board, value, isStreak);
    const { isPersonalBest, previousBest } = checkPersonalBest(currentSetKey, value, isStreak);

    if (qualifies) {
      // Top 10 — show celebration popup, then results
      await showCelebrationPopup({
        rank,
        score,
        streak,
        setKey: currentSetKey,
        sessionId: session.sessionId,
        board,
        questionsAnswered: session.questionsAnswered,
        correctCount: session.correctCount,
      });
      renderResultsFn();
    } else if (isPersonalBest) {
      // Personal best but not top 10
      await showPersonalBestPopup({
        score,
        streak,
        previousBest,
        setKey: currentSetKey,
        board,
      });
      renderResultsFn();
    } else {
      renderResultsFn();
    }
  } catch (err) {
    console.warn('Leaderboard check failed:', err);
    dismissSpinner();
    renderResultsFn();
  }
}
```

- [ ] **Step 3: Modify `renderTimeTrialSummary` to go through leaderboard check**

Find the `renderTimeTrialSummary` function. Wrap the existing rendering in the leaderboard check. Replace the function with:

Find the line `function renderTimeTrialSummary() {` and the function body. The key change: instead of rendering immediately, call `handleLeaderboardCheck` first.

At the start of the function, after clearing the timer and computing `correctCount`/`totalQ`, add:

```javascript
  // Leaderboard check before showing results
  handleLeaderboardCheck(session.totalScore, 0, () => {
    // ... existing rendering code goes here
  });
```

The simplest way: extract the current rendering into a nested function and pass it as the callback. The `renderTimeTrialSummary` function becomes:

Replace from `container.innerHTML =` to the end of the function with a call to `handleLeaderboardCheck`. The rendering code becomes the callback.

Specifically, change the function so that after computing all the variables (storageKey, prevBest, isNewBest, emojiGrid, accuracy, brackets, avgPts, pps, newBestHTML), it calls:

```javascript
  handleLeaderboardCheck(session.totalScore, 0, () => {
    container.innerHTML = `...`; // existing innerHTML
    attachShareHandlers(shareText);
    attachPlayAgainHandlers();
  });
```

- [ ] **Step 4: Modify `renderStreakGameOver` similarly**

After computing `streakCount`, `shareText`, `storageKey`, `prevBest`, `isNewBest`, etc., wrap the rendering:

```javascript
  handleLeaderboardCheck(0, streakCount, () => {
    container.innerHTML = `...`; // existing innerHTML
    attachShareHandlers(shareText);
    attachPlayAgainHandlers();
  });
```

For streak mode, pass `streak = streakCount` and `score = 0`.

- [ ] **Step 5: Verify build**

Run: `npx astro build`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add src/scripts/game-ui.js
git commit -m "feat: integrate leaderboard check at session end for time trial and streaks"
```

---

### Task 7: Create the leaderboard page

**Files:**
- Create: `src/pages/leaderboard.astro`
- Modify: `src/layouts/Base.astro`

- [ ] **Step 1: Add Leaderboard link to header**

In `src/layouts/Base.astro`, find the `<nav class="site-nav">` block (around line 51) and add a Leaderboard link before the theme toggle:

```html
      <nav class="site-nav">
        <a href="/leaderboard">Leaderboard</a>
        <button id="theme-toggle" aria-label="Toggle dark/light mode">🌙</button>
      </nav>
```

- [ ] **Step 2: Update base path rewriting**

In `src/layouts/Base.astro`, update the base path detection (around line 33) to include the leaderboard route:

```javascript
      var base = path.replace(/\/(play|leaderboard)$/, '');
```

- [ ] **Step 3: Create the leaderboard page**

Create `src/pages/leaderboard.astro`:

```astro
---
import Base from '../layouts/Base.astro';
---
<Base title="Leaderboard — What's That Bug?">
  <div class="container" style="max-width:640px;">
    <div style="text-align:center;padding:24px 0 8px;">
      <h1>Leaderboard</h1>
      <p class="subtitle">Top 10 bug identifiers in the world</p>
    </div>

    <div class="mode-group">
      <h2 class="mode-group-title">🔰 Bugs 101</h2>
      <div class="lb-tabs" data-group="bugs101">
        <button class="lb-tab active" data-board="bugs_101_time_trial">Time Trial</button>
        <button class="lb-tab" data-board="bugs_101_streak">Streaks</button>
      </div>
      <div class="lb-tab-content active" id="board-bugs_101_time_trial">
        <div class="lb-page-spinner"><div class="lb-spinner"></div></div>
      </div>
      <div class="lb-tab-content" id="board-bugs_101_streak">
        <div class="lb-page-spinner"><div class="lb-spinner"></div></div>
      </div>
    </div>

    <div class="mode-group" style="margin-top:20px;">
      <h2 class="mode-group-title">🌍 All Bugs</h2>
      <div class="lb-tabs" data-group="allbugs">
        <button class="lb-tab active" data-board="time_trial">Time Trial</button>
        <button class="lb-tab" data-board="streak">Streaks</button>
      </div>
      <div class="lb-tab-content active" id="board-time_trial">
        <div class="lb-page-spinner"><div class="lb-spinner"></div></div>
      </div>
      <div class="lb-tab-content" id="board-streak">
        <div class="lb-page-spinner"><div class="lb-spinner"></div></div>
      </div>
    </div>
  </div>

  <script>
    import { fetchLeaderboards } from '../scripts/leaderboard.js';
    import { renderLeaderboardTable } from '../scripts/leaderboard-ui.js';

    // Tab switching
    document.querySelectorAll('.lb-tabs').forEach(tabGroup => {
      tabGroup.querySelectorAll('.lb-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          // Deactivate all tabs in this group
          tabGroup.querySelectorAll('.lb-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');

          // Show the corresponding content
          const boardKey = tab.dataset.board;
          const parent = tabGroup.closest('.mode-group');
          parent.querySelectorAll('.lb-tab-content').forEach(c => c.classList.remove('active'));
          parent.querySelector(`#board-${boardKey}`)?.classList.add('active');
        });
      });
    });

    // Fetch and render leaderboards
    async function loadLeaderboards() {
      try {
        const boards = await fetchLeaderboards();
        if (!boards) throw new Error('No data');

        const boardKeys = ['bugs_101_time_trial', 'bugs_101_streak', 'time_trial', 'streak'];
        for (const key of boardKeys) {
          const isStreak = key.includes('streak');
          const container = document.getElementById(`board-${key}`);
          if (container) {
            container.innerHTML = renderLeaderboardTable(boards[key] || [], isStreak);
          }
        }
      } catch (err) {
        document.querySelectorAll('.lb-tab-content').forEach(el => {
          el.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:16px 0;">Couldn\'t load leaderboard. Try again later.</p>';
        });
      }
    }

    loadLeaderboards();
  </script>
</Base>
```

- [ ] **Step 4: Add page spinner style**

Add to `src/styles/global.css`:

```css
.lb-page-spinner {
  display: flex;
  justify-content: center;
  padding: 32px 0;
}
```

- [ ] **Step 5: Verify build**

Run: `npx astro build`
Expected: Build succeeds with 3 pages (index, play, leaderboard)

- [ ] **Step 6: Commit**

```bash
git add src/pages/leaderboard.astro src/layouts/Base.astro src/styles/global.css
git commit -m "feat: add leaderboard page with tabbed sections and header link"
```

---

### Task 8: Update Google Apps Script with leaderboard endpoints

**Files:**
- Google Apps Script (external — in the Google Sheets script editor)

- [ ] **Step 1: Document the Apps Script changes needed**

The user needs to update their Google Apps Script web app to handle two new actions. Add these to the existing `doGet` and `doPost` functions:

**In doGet(e):**

```javascript
function doGet(e) {
  var action = e.parameter.action;

  if (action === 'leaderboard') {
    return getLeaderboards();
  }

  return ContentService.createTextOutput('OK');
}

function getLeaderboards() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Leaderboard');
  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({}))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var rows = data.slice(1);

  // Group by set_key
  var boards = {};
  var setKeys = ['bugs_101_time_trial', 'bugs_101_streak', 'time_trial', 'streak'];

  for (var i = 0; i < setKeys.length; i++) {
    var key = setKeys[i];
    var isStreak = key.indexOf('streak') >= 0;
    var entries = [];

    for (var j = 0; j < rows.length; j++) {
      var row = rows[j];
      if (row[2] === key) { // set_key column
        entries.push({
          name: row[5] || 'Anonymous Bug Hunter',
          country: row[6] || '',
          score: Number(row[3]) || 0,
          streak: Number(row[4]) || 0,
          questions: Number(row[7]) || 0,
          correct: Number(row[8]) || 0,
          timestamp: row[0],
        });
      }
    }

    // Sort: streak boards by streak desc, time trial by score desc
    if (isStreak) {
      entries.sort(function(a, b) { return b.streak - a.streak; });
    } else {
      entries.sort(function(a, b) { return b.score - a.score; });
    }

    // Top 10
    boards[key] = entries.slice(0, 10).map(function(e, idx) {
      e.rank = idx + 1;
      return e;
    });
  }

  return ContentService.createTextOutput(JSON.stringify(boards))
    .setMimeType(ContentService.MimeType.JSON);
}
```

**In doPost(e):**

Add a check for the `leaderboard_entry` action in the existing doPost handler:

```javascript
function doPost(e) {
  var data = JSON.parse(e.postData.contents);

  if (data.action === 'leaderboard_entry') {
    return handleLeaderboardEntry(data);
  }

  // ... existing feedback logging code ...
}

function handleLeaderboardEntry(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Leaderboard');
  if (!sheet) {
    sheet = ss.insertSheet('Leaderboard');
    sheet.appendRow(['timestamp', 'session_id', 'set_key', 'score', 'streak', 'name', 'country', 'questions_answered', 'correct_count']);
  }

  sheet.appendRow([
    new Date().toISOString(),
    data.session_id || '',
    data.set_key || '',
    Number(data.score) || 0,
    Number(data.streak) || 0,
    data.name || 'Anonymous Bug Hunter',
    data.country || '',
    Number(data.questions_answered) || 0,
    Number(data.correct_count) || 0,
  ]);

  // Return updated top 10 for this board
  return getLeaderboards();
}
```

**Important:** After updating the script, the user must:
1. Save the script
2. Deploy as web app → New deployment (or update existing)
3. Set access to "Anyone" so the client can call it

- [ ] **Step 2: Create the "Leaderboard" sheet tab manually**

In the Google Sheet, create a new tab called "Leaderboard" with headers:
`timestamp | session_id | set_key | score | streak | name | country | questions_answered | correct_count`

- [ ] **Step 3: Seed the leaderboard with existing top scores**

The user should manually add a few seed rows to the Leaderboard tab based on the existing feedback data analysis (from the brainstorming phase). Example rows:

| timestamp | session_id | set_key | score | streak | name | country | questions_answered | correct_count |
|---|---|---|---|---|---|---|---|---|
| 2026-04-01T00:00:00Z | seed-1 | bugs_101_time_trial | 1650 | 0 | Anonymous Bug Hunter | | 18 | 17 |
| 2026-04-01T00:00:00Z | seed-2 | bugs_101_streak | 0 | 12 | Anonymous Bug Hunter | | 12 | 12 |

(Use real top scores from the feedback CSV analysis)

- [ ] **Step 4: Commit documentation**

Create a file documenting the Apps Script setup:

```bash
git add docs/
git commit -m "docs: add Apps Script leaderboard endpoint setup instructions"
```

---

### Task 9: Run full test suite and production build

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Run production build**

Run: `npx astro build`
Expected: Build succeeds with 3 pages

- [ ] **Step 3: Fix any issues and commit**

```bash
git add -A
git commit -m "chore: final leaderboard integration fixes"
```
