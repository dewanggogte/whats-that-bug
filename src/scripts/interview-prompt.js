/**
 * Player interview prompt.
 * Shows a Calendly invite to repeat players across multiple play days.
 */

const STATS_KEY = 'wtb_player_stats';
const SNOOZE_KEY = 'wtb_interview_snoozed';
const DONE_KEY = 'wtb_interview_done';
const IMPRESSIONS_KEY = 'wtb_interview_impressions';
const SNOOZE_DAYS = 30;
const MAX_IMPRESSIONS = 2;
const MIN_SESSIONS = 5;
const MIN_PLAY_DAYS = 3;
const CALENDLY_URL = 'https://calendly.com/dewanggogte/what-s-that-bug';
const EMAIL_URL = 'mailto:hello@dewanggogte.com';

const CHAT_ICON = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M5 5.5A3.5 3.5 0 0 1 8.5 2h7A3.5 3.5 0 0 1 19 5.5v5A3.5 3.5 0 0 1 15.5 14H10l-5 4V5.5z"/>
    <path d="M9 7h6"/>
    <path d="M9 10h4"/>
    <path d="M17 17h1.5A2.5 2.5 0 0 0 21 14.5V9"/>
  </svg>`;

function getPlayerStats() {
  try { return JSON.parse(localStorage.getItem(STATS_KEY) || '{}'); }
  catch { return {}; }
}

function getImpressions() {
  try { return parseInt(localStorage.getItem(IMPRESSIONS_KEY) || '0', 10); }
  catch { return 0; }
}

function getPlayDayCount(stats) {
  return Array.isArray(stats.play_dates) ? stats.play_dates.length : 0;
}

function shouldShow() {
  try {
    if (localStorage.getItem(DONE_KEY) === '1') return false;
    if (getImpressions() >= MAX_IMPRESSIONS) return false;

    const stats = getPlayerStats();
    if ((stats.session_count || 0) < MIN_SESSIONS) return false;
    if (getPlayDayCount(stats) < MIN_PLAY_DAYS) return false;

    const snoozed = localStorage.getItem(SNOOZE_KEY);
    if (!snoozed) return true;

    const elapsed = Date.now() - parseInt(snoozed, 10);
    return elapsed >= SNOOZE_DAYS * 86400000;
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

function createModal() {
  const overlay = document.createElement('div');
  overlay.className = 'onboarding-overlay interview-overlay';
  overlay.innerHTML = `
    <div class="onboarding-card interview-card">
      <button class="interview-close" aria-label="Close">&times;</button>
      <div class="interview-desktop">
        <div class="interview-heading">
          <span class="interview-chat-icon">${CHAT_ICON}</span>
          <h2 class="onboarding-title">Help decide what's next for bugs</h2>
        </div>
        <p class="interview-copy">
          Hey! I'm inviting some players to have a short chat with me to improve this game.
          Would you be interested in a 15-min online conversation? I want to know:
        </p>
        <ul class="interview-questions">
          <li>What keeps you coming back?</li>
          <li>What parts are confusing or frustrating?</li>
          <li>How do you usually save or reopen the game?</li>
          <li>What would make it worth sharing?</li>
        </ul>
        <div class="interview-actions">
          <a href="${CALENDLY_URL}" target="_blank" rel="noopener noreferrer" class="btn btn-primary interview-primary">Schedule chat</a>
          <a href="${EMAIL_URL}" class="btn btn-outline interview-secondary">Email instead</a>
          <button class="interview-dismiss">No thanks</button>
        </div>
      </div>
      <div class="interview-mobile">
        <div class="interview-heading">
          <span class="interview-chat-icon">${CHAT_ICON}</span>
          <h2 class="onboarding-title">Help improve the bug game?</h2>
        </div>
        <p class="interview-mobile-copy">
          You have played a few times. Want to do a quick 15-min chat about what keeps you coming back and what should change?
        </p>
        <div class="interview-points" aria-label="Conversation topics">
          <span>Why you return</span>
          <span>What's confusing</span>
          <span>How you reopen it</span>
          <span>What you'd share</span>
        </div>
        <div class="interview-actions">
          <a href="${CALENDLY_URL}" target="_blank" rel="noopener noreferrer" class="btn btn-primary interview-primary">Schedule chat</a>
          <button class="interview-dismiss">No thanks</button>
        </div>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  recordImpression();
  requestAnimationFrame(() => overlay.classList.add('visible'));

  let closed = false;
  const close = (done) => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    done ? markDone() : snooze();
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 340);
  };

  const onKey = (e) => {
    if (e.key === 'Escape') close(false);
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close(false);
  });
  document.addEventListener('keydown', onKey);
  overlay.querySelector('.interview-close')?.addEventListener('click', () => close(false));
  overlay.querySelectorAll('.interview-primary, .interview-secondary').forEach(link => {
    link.addEventListener('click', () => close(true));
  });
  overlay.querySelectorAll('.interview-dismiss').forEach(button => {
    button.addEventListener('click', () => close(true));
  });
}

/**
 * Show the interview prompt if eligible.
 * Returns true when the prompt has claimed this visit so other prompts can wait.
 */
export function maybeShowInterviewPrompt() {
  if (!shouldShow()) return false;

  setTimeout(createModal, 800);
  return true;
}
