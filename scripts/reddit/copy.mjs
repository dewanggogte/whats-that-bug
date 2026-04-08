/**
 * Title & body copy rotation for Reddit posts.
 * Generates varied, natural post text so consecutive posts never look identical.
 */

import { GAME_URL, SUBREDDITS } from './config.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Pick a random element from an array. */
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Format a list of names with Oxford comma style.
 * ["Alice"] → "Alice"
 * ["Alice", "Bob"] → "Alice and Bob"
 * ["Alice", "Bob", "Charlie"] → "Alice, Bob, and Charlie"
 */
function formatCredits(names) {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

/**
 * Extract photographer name from iNaturalist attribution string.
 * "(c) Alice Smith, some rights reserved (CC BY)" → "Alice Smith"
 */
function extractPhotographer(attribution) {
  if (!attribution) return 'Unknown';
  const match = attribution.match(/\(c\)\s*([^,]+)/i);
  return match ? match[1].trim() : 'Unknown';
}

// ---------------------------------------------------------------------------
// Title pools
// ---------------------------------------------------------------------------

const GALLERY_TITLE_POOLS = {
  default: [
    'A few of my favorite recent finds',
    'Some beauties spotted lately',
    'Look what showed up this week',
    'Nature never disappoints',
    'Check out these stunners',
    'Too good not to share',
  ],
  dramatic: [
    'These absolutely stopped me in my tracks',
    'The detail on these is unreal',
    'Some of the most stunning shots I\'ve come across',
    'Nature flexing hard with these',
  ],
  formal: [
    'Noteworthy specimens from recent observations',
    'A selection of well-documented sightings',
    'Curated observations worth examining',
  ],
  cute: [
    'Look at these little cuties!',
    'Could they be any more adorable?',
    'I can\'t handle how precious these are',
    'Tiny friends that made my day',
  ],
};

const TEXT_TITLE_POOLS = {
  casual: [
    'Made a free browser game to test your bug knowledge',
    'How well do you actually know your bugs?',
    'I built a game for bug nerds like us',
  ],
  builder: [
    'I built a free bug identification game',
    'Side project: browser-based insect ID game',
    'Sharing a project I\'ve been working on',
  ],
  concise: [
    'Free bug identification game',
    'Browser-based insect ID game',
  ],
};

const CHALLENGE_TITLE_POOL = [
  'Can you identify this? 🔍',
  'What species is this?',
  'Any guesses on this one? 🤔',
  'Think you can ID this?',
  'Name that bug!',
  'What are we looking at here?',
];

// ---------------------------------------------------------------------------
// Body templates
// ---------------------------------------------------------------------------

const GALLERY_BODY_TEMPLATES = {
  default: [
    (categoryLabel, creditString, gameSnippet) =>
      `Here are some incredible ${categoryLabel} I came across on iNaturalist. All photos are research-grade observations.\n\nPhotos by: ${creditString}${gameSnippet}`,
    (categoryLabel, creditString, gameSnippet) =>
      `Sharing a few amazing ${categoryLabel} from iNaturalist's research-grade observations. These really caught my eye.\n\nCredit: ${creditString}${gameSnippet}`,
    (categoryLabel, creditString, gameSnippet) =>
      `Some standout ${categoryLabel} from iNaturalist that I wanted to share with you all.\n\nPhotos by: ${creditString}${gameSnippet}`,
  ],
  dramatic: [
    (categoryLabel, creditString, gameSnippet) =>
      `These ${categoryLabel} genuinely stopped me in my tracks. Every detail is stunning — nature is showing off. All sourced from research-grade observations on iNaturalist.\n\nPhotos by: ${creditString}${gameSnippet}`,
  ],
  formal: [
    (categoryLabel, creditString, gameSnippet) =>
      `The following ${categoryLabel} are sourced from research-grade observations on iNaturalist, each verified by the community. These represent some particularly well-documented specimens.\n\nPhotography credits: ${creditString}${gameSnippet}`,
  ],
  cute: [
    (categoryLabel, creditString, gameSnippet) =>
      `I couldn't resist sharing these adorable ${categoryLabel}! Found them on iNaturalist and had to bring them here.\n\nPhotos by: ${creditString}${gameSnippet}`,
    (categoryLabel, creditString, gameSnippet) =>
      `These little ${categoryLabel} are too precious. All research-grade observations from iNaturalist.\n\nPhotos by: ${creditString}${gameSnippet}`,
  ],
};

const CHALLENGE_BODY_TEMPLATES = [
  (creditString, gameSnippet) =>
    `Think you know your insects? Take a closer look and drop your best guess in the comments! Answer reveal coming later.\n\nPhoto from iNaturalist. Credit: ${creditString}${gameSnippet}`,
  (creditString, gameSnippet) =>
    `Here's a challenge for you — can you figure out what this is? No cheating! I'll post the answer later.\n\nSourced from iNaturalist. Photo by: ${creditString}${gameSnippet}`,
];

// ---------------------------------------------------------------------------
// Text post draft templates (by tone)
// ---------------------------------------------------------------------------

const TEXT_DRAFTS = {
  casual: `I built a bug identification quiz game using real photos from iNaturalist. You get shown a photo and pick from 4 choices — there's a classic 10-round mode, a streak mode (game over on first wrong answer), and a daily challenge. It has 3,000+ species from around the world. Free, no login required. ${GAME_URL}\n\nWould love to hear what you think!`,

  builder: `I've been working on a side project — a species identification quiz game. It pulls research-grade photos from iNaturalist (CC licensed) and challenges you to identify insects, spiders, butterflies, etc.\n\nTech: Astro static site, vanilla JS game engine, Google Sheets for event logging, iNaturalist API for content.\n\nIt's live at ${GAME_URL} — has classic mode (10 rounds), streak mode, time trials, and a daily challenge. Around 3,000 species in the database.\n\nFeedback welcome!`,

  concise: `A free bug identification quiz using real photos from citizen scientists. 3,000+ species, multiple game modes. ${GAME_URL}`,
};

// ---------------------------------------------------------------------------
// Follow-up comment templates
// ---------------------------------------------------------------------------

const GALLERY_FOLLOWUP_TEMPLATES = [
  `If you enjoyed these, you might like this free game where you identify bugs from photos: ${GAME_URL}`,
  `Want to test how well you know your insects? I made a free browser game for exactly that: ${GAME_URL}`,
];

const CHALLENGE_FOLLOWUP_TEMPLATES = [
  `If you liked this challenge, there's a whole game built around it: ${GAME_URL}`,
];

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Generate a post title.
 * @param {'gallery'|'challenge'|'text'} contentType
 * @param {string} subId - subreddit key (e.g. 'spiders', 'NatureIsFuckingLit')
 * @param {object} subConfig - config entry from SUBREDDITS
 * @param {object} [challengeObs] - observation for challenge posts
 * @returns {string}
 */
export function generateTitle(contentType, subId, subConfig, challengeObs) {
  let title;

  if (contentType === 'challenge') {
    title = pick(CHALLENGE_TITLE_POOL);
  } else if (contentType === 'text') {
    const pool = TEXT_TITLE_POOLS[subConfig.tone] || TEXT_TITLE_POOLS.casual;
    title = pick(pool);
  } else {
    // gallery
    const pool = GALLERY_TITLE_POOLS[subConfig.tone] || GALLERY_TITLE_POOLS.default;
    title = pick(pool);
  }

  // Apply prefix/suffix if configured
  if (subConfig.titlePrefix) {
    title = subConfig.titlePrefix + title;
  }
  if (subConfig.titleSuffix) {
    title = title + subConfig.titleSuffix;
  }

  return title;
}

/**
 * Generate a text post draft body based on the subreddit's tone.
 *
 * @param {string} subId - Subreddit key (e.g. 'WebGames')
 * @param {object} subConfig - Config entry from SUBREDDITS
 * @returns {string}
 */
export function generateTextDraft(subId, subConfig) {
  const tone = subConfig.tone;
  return TEXT_DRAFTS[tone] ?? TEXT_DRAFTS.casual;
}

/**
 * Generate a post body.
 *
 * When `credits` is empty (e.g. during the generate stage before photos are
 * selected), inserts a `{credits}` placeholder that can be replaced later
 * via `populateCredits()`.
 *
 * @param {'gallery'|'challenge'|'text'} contentType
 * @param {object} subConfig
 * @param {object} options
 * @param {string[]} options.credits - photographer names
 * @param {boolean} options.includeGameLink
 * @param {object} [options.challengeObs]
 * @returns {string}
 */
export function generateBody(contentType, subConfig, options) {
  const { credits = [], includeGameLink = false } = options;

  if (contentType === 'text') {
    return generateTextDraft(options.subId ?? '', subConfig);
  }

  // When credits aren't available yet, use a placeholder token
  const creditString = credits.length > 0 ? formatCredits(credits) : '{credits}';

  const gameSnippet = includeGameLink
    ? `\n\nIf you want to test your ID skills, I made a free game: ${GAME_URL}`
    : '';

  if (contentType === 'challenge') {
    const template = pick(CHALLENGE_BODY_TEMPLATES);
    return template(creditString, gameSnippet);
  }

  // gallery
  const pool = GALLERY_BODY_TEMPLATES[subConfig.tone] || GALLERY_BODY_TEMPLATES.default;
  const template = pick(pool);
  return template(subConfig.categoryLabel, creditString, gameSnippet);
}

/**
 * Replace the `{credits}` placeholder in a body string with actual
 * formatted photographer names. Called during the prepare stage when
 * the selected photos (and their attributions) are known.
 *
 * @param {string} bodyText - Body text potentially containing `{credits}`
 * @param {string[]} credits - Photographer names
 * @returns {string}
 */
export function populateCredits(bodyText, credits) {
  const creditString = formatCredits(credits);
  return bodyText.replace(/\{credits\}/g, creditString);
}

/**
 * Generate a follow-up comment containing the game link.
 * Used when the link isn't in the body text.
 * @param {'gallery'|'challenge'} contentType
 * @param {object} subConfig
 * @returns {string}
 */
export function generateFollowupComment(contentType, subConfig) {
  if (contentType === 'challenge') {
    return pick(CHALLENGE_FOLLOWUP_TEMPLATES);
  }
  return pick(GALLERY_FOLLOWUP_TEMPLATES);
}

/**
 * Generate image captions for a list of observations.
 * @param {object[]} observations - each has { taxon: { common_name, species }, attribution }
 * @returns {string[]}
 */
export function generateCaptions(observations) {
  return observations.map((obs) => {
    const { common_name, species } = obs.taxon;
    const photographer = extractPhotographer(obs.attribution);
    return `${common_name} (${species}) — 📸 ${photographer} via iNaturalist`;
  });
}
