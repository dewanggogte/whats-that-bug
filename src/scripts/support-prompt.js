/**
 * Support / Ko-fi prompt.
 * Shows a modal after the player has completed 3+ sessions.
 * - "Maybe later" snoozes for 7 days.
 * - Clicking Ko-fi link snoozes for 30 days and marks as donor.
 * - Returning donors see a shorter thank-you variant.
 * Uses the same overlay pattern as onboarding.js.
 */

const SNOOZE_KEY = 'wtb_support_snoozed';
const DONOR_KEY = 'wtb_support_donor';
const SNOOZE_DAYS = 7;
const DONOR_SNOOZE_DAYS = 30;
const SUPPORT_URL = 'https://ko-fi.com/whatsthatbug';

const COFFEE_ICON_SM = `
  <svg class="support-btn-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M5 12h10v7c0 1.7-1.3 3-3 3H8c-1.7 0-3-1.3-3-3v-7z" fill="currentColor" opacity="0.3"/>
    <path d="M5 12h10v7c0 1.7-1.3 3-3 3H8c-1.7 0-3-1.3-3-3v-7z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M15 14h1.5a2.5 2.5 0 0 1 0 5H15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M8 8c0-1.5 1-2.5 0-4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.6"/>
    <path d="M10.5 7c0-1.5 1-2.5 0-4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.8"/>
    <path d="M13 8c0-1.5 1-2.5 0-4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.6"/>
  </svg>`;

const COFFEE_ICON_LG = `
  <svg class="support-coffee-icon" viewBox="0 0 64 64" width="56" height="56" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 28h32v20c0 4.4-3.6 8-8 8H20c-4.4 0-8-3.6-8-8V28z" fill="var(--accent)" opacity="0.15"/>
    <path d="M12 28h32v20c0 4.4-3.6 8-8 8H20c-4.4 0-8-3.6-8-8V28z" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M44 34h4a6 6 0 0 1 0 12h-4" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M22 18c0-3 2-5 0-8" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" opacity="0.5"/>
    <path d="M28 16c0-3 2-5 0-8" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" opacity="0.7"/>
    <path d="M34 18c0-3 2-5 0-8" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" opacity="0.5"/>
    <circle cx="28" cy="40" r="3" fill="var(--accent)" opacity="0.25"/>
  </svg>`;

function isDonor() {
  try { return localStorage.getItem(DONOR_KEY) === '1'; } catch { return false; }
}

function shouldShow() {
  try {
    const snoozed = localStorage.getItem(SNOOZE_KEY);
    if (!snoozed) return true;
    const days = isDonor() ? DONOR_SNOOZE_DAYS : SNOOZE_DAYS;
    const elapsed = Date.now() - parseInt(snoozed, 10);
    return elapsed >= days * 86400000;
  } catch { return false; }
}

function snooze() {
  try { localStorage.setItem(SNOOZE_KEY, Date.now().toString()); } catch {}
}

function markDonor() {
  try {
    localStorage.setItem(DONOR_KEY, '1');
    localStorage.setItem(SNOOZE_KEY, Date.now().toString());
  } catch {}
}

function getSessionCount() {
  try {
    const stats = JSON.parse(localStorage.getItem('wtb_player_stats') || '{}');
    return stats.session_count || 0;
  } catch {
    return 0;
  }
}

function createModal(content) {
  const overlay = document.createElement('div');
  overlay.className = 'onboarding-overlay';
  overlay.innerHTML = `<div class="onboarding-card support-card">${content}</div>`;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('visible'));

  const dismiss = () => {
    snooze();
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 340);
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) dismiss();
  });

  const onKey = (e) => {
    if (e.key === 'Escape') {
      document.removeEventListener('keydown', onKey);
      dismiss();
    }
  };
  document.addEventListener('keydown', onKey);

  overlay.querySelector('.support-cta')?.addEventListener('click', () => markDonor());
  overlay.querySelector('.support-dismiss')?.addEventListener('click', dismiss);
}

function showFirstTimePrompt() {
  createModal(`
    <div class="support-hero">${COFFEE_ICON_LG}</div>
    <h2 class="onboarding-title">Help keep the bugs alive!</h2>
    <p class="onboarding-text">
      I built this game this year and it's been played <strong>over 2,000 times</strong>!
      It brings me so much joy that people play every day — I want to keep making it better.
    </p>
    <p class="onboarding-detail">
      This site is ad-free and always will be. Your support helps me keep it that way.
    </p>
    <a href="${SUPPORT_URL}" target="_blank" rel="noopener noreferrer"
       class="btn btn-primary onboarding-cta support-cta">
      ${COFFEE_ICON_SM}
      Buy me a coffee
    </a>
    <button class="support-dismiss">Maybe later</button>
  `);
}

function showReturningDonorPrompt() {
  createModal(`
    <div class="support-hero">${COFFEE_ICON_LG}</div>
    <h2 class="onboarding-title">Thanks for your support!</h2>
    <p class="onboarding-text">
      People like you help keep this game available for everyone.
      Would you consider making another contribution?
    </p>
    <a href="${SUPPORT_URL}" target="_blank" rel="noopener noreferrer"
       class="btn btn-primary onboarding-cta support-cta">
      ${COFFEE_ICON_SM}
      Buy me another coffee
    </a>
    <button class="support-dismiss">Not right now</button>
  `);
}

/**
 * Show the support prompt if eligible.
 * Call from index.astro after onboarding is done.
 */
export function maybeShowSupportPrompt() {
  if (!shouldShow()) return;
  if (getSessionCount() < 3) return;

  // Small delay so it doesn't collide with onboarding
  setTimeout(() => {
    isDonor() ? showReturningDonorPrompt() : showFirstTimePrompt();
  }, 800);
}
