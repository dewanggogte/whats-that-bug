/**
 * Support / Ko-fi prompt.
 * Shows a one-time modal after the player has completed 3+ sessions.
 * Uses the same overlay pattern as onboarding.js.
 */

const SEEN_KEY = 'wtb_seen_support';
const SUPPORT_URL = 'https://ko-fi.com/whatsthatbug';

function hasSeen() {
  try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return true; }
}

function markSeen() {
  try { localStorage.setItem(SEEN_KEY, '1'); } catch {}
}

function getSessionCount() {
  try {
    const stats = JSON.parse(localStorage.getItem('wtb_player_stats') || '{}');
    return stats.session_count || 0;
  } catch {
    return 0;
  }
}

function createSupportModal() {
  const overlay = document.createElement('div');
  overlay.className = 'onboarding-overlay';
  overlay.innerHTML = `
    <div class="onboarding-card support-card">
      <div class="support-hero">
        <svg class="support-coffee-icon" viewBox="0 0 64 64" width="56" height="56" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 28h32v20c0 4.4-3.6 8-8 8H20c-4.4 0-8-3.6-8-8V28z" fill="var(--accent)" opacity="0.15"/>
          <path d="M12 28h32v20c0 4.4-3.6 8-8 8H20c-4.4 0-8-3.6-8-8V28z" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M44 34h4a6 6 0 0 1 0 12h-4" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M22 18c0-3 2-5 0-8" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" opacity="0.5"/>
          <path d="M28 16c0-3 2-5 0-8" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" opacity="0.7"/>
          <path d="M34 18c0-3 2-5 0-8" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" opacity="0.5"/>
          <circle cx="28" cy="40" r="3" fill="var(--accent)" opacity="0.25"/>
        </svg>
      </div>
      <h2 class="onboarding-title">Help keep the bugs alive!</h2>
      <p class="onboarding-text">
        I built this game this year and it has been played <strong>over 2,000 times</strong> since!
        It brings me a lot of joy that people play this every day, and I want to keep making it better.
      </p>
      <p class="onboarding-detail">
        Help me maintain and keep this site ad-free, your contributions directly help me continue to work on this.
      </p>
      <p class="support-new-badge">
        <strong>NEW:</strong> All donations over $10 unlock an exclusive badge and future perks!
        You'll receive a code via email 1–3 days after donating.
      </p>
      <a href="${SUPPORT_URL}" target="_blank" rel="noopener noreferrer"
         class="btn btn-primary onboarding-cta support-cta">
        <svg class="support-btn-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M5 12h10v7c0 1.7-1.3 3-3 3H8c-1.7 0-3-1.3-3-3v-7z" fill="currentColor" opacity="0.3"/>
          <path d="M5 12h10v7c0 1.7-1.3 3-3 3H8c-1.7 0-3-1.3-3-3v-7z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M15 14h1.5a2.5 2.5 0 0 1 0 5H15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M8 8c0-1.5 1-2.5 0-4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.6"/>
          <path d="M10.5 7c0-1.5 1-2.5 0-4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.8"/>
          <path d="M13 8c0-1.5 1-2.5 0-4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.6"/>
        </svg>
        Buy me a coffee
      </a>
      <button class="support-dismiss">Maybe later</button>
    </div>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('visible'));

  const dismiss = () => {
    markSeen();
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

  overlay.querySelector('.support-cta')?.addEventListener('click', () => markSeen());
  overlay.querySelector('.support-dismiss')?.addEventListener('click', dismiss);
}

/**
 * Show the support prompt if eligible.
 * Call from index.astro after onboarding is done.
 */
export function maybeShowSupportPrompt() {
  if (hasSeen()) return;
  if (getSessionCount() < 3) return;

  // Small delay so it doesn't collide with onboarding
  setTimeout(createSupportModal, 800);
}
