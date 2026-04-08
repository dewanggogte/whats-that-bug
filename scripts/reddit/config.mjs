/**
 * Central configuration for the Reddit content pipeline.
 * Imported by every other module in scripts/reddit/.
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Path constants
// ---------------------------------------------------------------------------

export const ROOT = join(__dirname, '..', '..');
export const CACHE_DIR = join(ROOT, '.cache');
export const POSTS_DIR = join(__dirname, '..', 'reddit-posts');
export const OBS_FILE = join(ROOT, 'public', 'data', 'observations.json');
export const INAT_API = 'https://api.inaturalist.org/v1';
export const GAME_URL = 'https://dewanggogte.com/games/bugs/';

// ---------------------------------------------------------------------------
// Content types
// ---------------------------------------------------------------------------

export const CONTENT_TYPES = {
  gallery:   { label: 'Photo Gallery',   format: 'gallery',    imageCount: '4-6' },
  challenge: { label: 'Challenge Photo', format: 'image+text', imageCount: '1' },
  text:      { label: 'Text Post',       format: 'text',       imageCount: '0' },
};

// ---------------------------------------------------------------------------
// Subreddit registry
// ---------------------------------------------------------------------------

export const SUBREDDITS = {
  // ── Bug / nature subreddits ─────────────────────────────────────────────
  NatureIsFuckingLit: {
    name: 'r/NatureIsFuckingLit',
    subs: '~11.9M',
    tone: 'dramatic',
    categoryLabel: 'insects',
    contentTypes: ['gallery'],
    titlePrefix: '🔥 ',
    titleSuffix: ' 🔥',
    taxa: [
      { name: 'Insects (mixed)', taxon_id: 47158, per_page: 20 },
      { name: 'Arachnids (mixed)', taxon_id: 47119, per_page: 20 },
    ],
    postWindow: { hour: 7, minute: 0 },
    minDaysBetween: 21,
  },

  spiders: {
    name: 'r/spiders',
    subs: '~299K',
    tone: 'default',
    categoryLabel: 'spiders',
    contentTypes: ['gallery', 'challenge'],
    taxa: [{ name: 'Spiders', taxon_id: 47118, per_page: 40 }],
    postWindow: { hour: 8, minute: 0 },
    minDaysBetween: 14,
  },

  entomology: {
    name: 'r/entomology',
    subs: '~208K',
    tone: 'formal',
    categoryLabel: 'insects',
    contentTypes: ['gallery', 'challenge', 'text'],
    taxa: [
      { name: 'Insects (mixed)', taxon_id: 47158, per_page: 20 },
      { name: 'Arachnids (mixed)', taxon_id: 47119, per_page: 20 },
    ],
    postWindow: { hour: 8, minute: 30 },
    minDaysBetween: 14,
  },

  insects: {
    name: 'r/insects',
    subs: '~194K',
    tone: 'default',
    categoryLabel: 'insects',
    contentTypes: ['gallery', 'challenge'],
    taxa: [{ name: 'Insects (mixed)', taxon_id: 47158, per_page: 40 }],
    postWindow: { hour: 7, minute: 30 },
    minDaysBetween: 14,
  },

  awwnverts: {
    name: 'r/awwnverts',
    subs: '~136K',
    tone: 'cute',
    categoryLabel: 'bugs',
    contentTypes: ['gallery', 'challenge'],
    taxa: [
      { name: 'Insects (mixed)', taxon_id: 47158, per_page: 20 },
      { name: 'Arachnids (mixed)', taxon_id: 47119, per_page: 20 },
    ],
    postWindow: { hour: 9, minute: 0 },
    minDaysBetween: 14,
  },

  bees: {
    name: 'r/bees',
    subs: '~58K',
    tone: 'default',
    categoryLabel: 'bees',
    contentTypes: ['gallery', 'challenge'],
    taxa: [{ name: 'Bees', taxon_id: 630955, per_page: 40 }],
    postWindow: { hour: 8, minute: 0 },
    minDaysBetween: 14,
  },

  moths: {
    name: 'r/moths',
    subs: '~54K',
    tone: 'default',
    categoryLabel: 'moths',
    contentTypes: ['gallery', 'challenge'],
    taxa: [{ name: 'Moths', taxon_id: 47157, per_page: 40, excludeSubtaxon: 47224 }],
    postWindow: { hour: 8, minute: 30 },
    minDaysBetween: 14,
  },

  ants: {
    name: 'r/ants',
    subs: '~28K',
    tone: 'default',
    categoryLabel: 'ants',
    contentTypes: ['gallery'],
    taxa: [{ name: 'Ants', taxon_id: 47336, per_page: 40 }],
    postWindow: { hour: 9, minute: 0 },
    minDaysBetween: 21,
  },

  butterflies: {
    name: 'r/butterflies',
    subs: '~22K',
    tone: 'default',
    categoryLabel: 'butterflies',
    contentTypes: ['gallery', 'challenge'],
    taxa: [{ name: 'Butterflies', taxon_id: 47224, per_page: 40 }],
    postWindow: { hour: 9, minute: 0 },
    minDaysBetween: 14,
  },

  // ── Non-bug subreddits (text posts only, no taxa) ──────────────────────
  WebGames: {
    name: 'r/WebGames',
    subs: '~430K',
    tone: 'casual',
    categoryLabel: 'game',
    contentTypes: ['text'],
    taxa: [],
    postWindow: { hour: 10, minute: 0 },
    minDaysBetween: 45,
  },

  SideProject: {
    name: 'r/SideProject',
    subs: '~190K',
    tone: 'builder',
    categoryLabel: 'project',
    contentTypes: ['text'],
    taxa: [],
    postWindow: { hour: 9, minute: 0 },
    minDaysBetween: 45,
  },

  IndieGaming: {
    name: 'r/IndieGaming',
    subs: '~340K',
    tone: 'casual',
    categoryLabel: 'game',
    contentTypes: ['text'],
    taxa: [],
    postWindow: { hour: 10, minute: 0 },
    minDaysBetween: 60,
  },

  InternetIsBeautiful: {
    name: 'r/InternetIsBeautiful',
    subs: '~17.5M',
    tone: 'concise',
    categoryLabel: 'web',
    contentTypes: ['text'],
    taxa: [],
    postWindow: { hour: 7, minute: 0 },
    minDaysBetween: 90,
  },
};

// ---------------------------------------------------------------------------
// Weekly cadence
// ---------------------------------------------------------------------------

export const WEEKLY_CADENCE = 4; // target posts per week
