/**
 * Multiplayer nudge prompt.
 * Encourages returning solo players to invite friends.
 * Shown on the homepage and after a solo game ends.
 * Suppressed once the player has actually entered a party room.
 * Uses the same overlay pattern as support-prompt.js / interview-prompt.js.
 */

import { logPopupEvent } from './feedback.js';

const STATS_KEY = 'wtb_player_stats';
const SNOOZE_KEY = 'wtb_mp_nudge_snoozed';
const DONE_KEY = 'wtb_mp_nudge_done';
const IMPRESSIONS_KEY = 'wtb_mp_nudge_impressions';
const PLAYED_KEY = 'wtb_mp_played';

const MAX_IMPRESSIONS = 2;
const HOME_SNOOZE_DAYS = 30;
const POSTGAME_SNOOZE_DAYS = 7;
const HOME_MIN_SESSIONS = 3;
const HOME_MIN_PLAY_DAYS = 2;
const POSTGAME_MIN_SESSIONS = 2;

function getStats() {
  try { return JSON.parse(localStorage.getItem(STATS_KEY) || '{}'); }
  catch { return {}; }
}

function getImpressions() {
  try { return parseInt(localStorage.getItem(IMPRESSIONS_KEY) || '0', 10); }
  catch { return 0; }
}

function isDone() {
  try { return localStorage.getItem(DONE_KEY) === '1'; } catch { return false; }
}

function hasPlayedMp() {
  try { return localStorage.getItem(PLAYED_KEY) === '1'; } catch { return false; }
}

function getPlayDayCount(stats) {
  return Array.isArray(stats.play_dates) ? stats.play_dates.length : 0;
}

function notSnoozed(days) {
  try {
    const snoozed = localStorage.getItem(SNOOZE_KEY);
    if (!snoozed) return true;
    return Date.now() - parseInt(snoozed, 10) >= days * 86400000;
  } catch {
    return false;
  }
}

function sharedGuardsPass() {
  if (isDone()) return false;
  if (hasPlayedMp()) return false;
  if (getImpressions() >= MAX_IMPRESSIONS) return false;
  return true;
}

export function shouldShowHomepage() {
  try {
    if (!sharedGuardsPass()) return false;
    const stats = getStats();
    if ((stats.session_count || 0) < HOME_MIN_SESSIONS) return false;
    if (getPlayDayCount(stats) < HOME_MIN_PLAY_DAYS) return false;
    return notSnoozed(HOME_SNOOZE_DAYS);
  } catch {
    return false;
  }
}

export function shouldShowPostGame() {
  try {
    if (!sharedGuardsPass()) return false;
    const stats = getStats();
    if ((stats.session_count || 0) < POSTGAME_MIN_SESSIONS) return false;
    return notSnoozed(POSTGAME_SNOOZE_DAYS);
  } catch {
    return false;
  }
}

function recordImpression() {
  try { localStorage.setItem(IMPRESSIONS_KEY, String(getImpressions() + 1)); } catch {}
}

function snooze() {
  try { localStorage.setItem(SNOOZE_KEY, Date.now().toString()); } catch {}
}

function markDone() {
  try { localStorage.setItem(DONE_KEY, '1'); } catch {}
}

function createModal(surface) {
  const base = (typeof window !== 'undefined' && window.__BASE) || '';
  const overlay = document.createElement('div');
  overlay.className = 'onboarding-overlay';
  overlay.innerHTML = `
    <div class="onboarding-card support-card">
      <div class="support-hero"><span class="mp-nudge-emoji">🎉</span></div>
      <h2 class="onboarding-title">Bugs are better with friends</h2>
      <p class="onboarding-text">
        You've been playing solo for a while — why not race a friend?
        Create a private room, share a 4-letter code, and see who knows their bugs best.
      </p>
      <a href="${base}/party" class="btn btn-primary onboarding-cta mp-nudge-cta">Start a room</a>
      <button class="support-dismiss mp-nudge-dismiss">Maybe later</button>
    </div>`;

  document.body.appendChild(overlay);
  recordImpression();
  logPopupEvent('mp_nudge', 'impression', { surface });
  requestAnimationFrame(() => overlay.classList.add('visible'));

  let closed = false;
  const close = (action) => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    if (action === 'cta') { markDone(); } else { snooze(); }
    logPopupEvent('mp_nudge', action, { surface });
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 340);
  };

  const onKey = (e) => { if (e.key === 'Escape') close('snooze'); };

  overlay.addEventListener('click', (e) => { if (e.target === overlay) close('snooze'); });
  document.addEventListener('keydown', onKey);
  overlay.querySelector('.mp-nudge-dismiss')?.addEventListener('click', () => close('dismiss'));
  // CTA is an <a> that navigates to /party; mark done + log before navigation proceeds.
  overlay.querySelector('.mp-nudge-cta')?.addEventListener('click', () => close('cta'));
}

/**
 * Homepage nudge. Returns true when it claims the visit (so the popup chain stops).
 */
export function maybeShowMpNudge() {
  if (!shouldShowHomepage()) return false;
  setTimeout(() => createModal('homepage'), 800);
  return true;
}

/**
 * Post-game nudge. Shown after a solo session summary renders.
 */
export function maybeShowMpNudgePostGame() {
  if (!shouldShowPostGame()) return;
  setTimeout(() => createModal('post_game'), 800);
}
