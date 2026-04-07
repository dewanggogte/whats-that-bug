/**
 * Onboarding — sequential modal flow for first-time visitors.
 * Shows welcome + scoring explanation on first visit only.
 * Uses localStorage flags to avoid repeating.
 */

const SEEN_WELCOME = 'wtb_seen_welcome';
const SEEN_SCORING = 'wtb_seen_scoring';

function hasSeen(key) {
  try { return localStorage.getItem(key) === '1'; } catch { return true; }
}

function markSeen(key) {
  try { localStorage.setItem(key, '1'); } catch {}
}

function createModal(content, onDismiss) {
  const overlay = document.createElement('div');
  overlay.className = 'onboarding-overlay';
  overlay.innerHTML = `
    <div class="onboarding-card">
      ${content}
    </div>
  `;

  document.body.appendChild(overlay);

  // Animate in
  requestAnimationFrame(() => overlay.classList.add('visible'));

  const dismiss = () => {
    overlay.classList.remove('visible');
    setTimeout(() => {
      overlay.remove();
      if (onDismiss) onDismiss();
    }, 340);
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) dismiss();
  });

  // Escape key
  const onKey = (e) => {
    if (e.key === 'Escape') {
      document.removeEventListener('keydown', onKey);
      dismiss();
    }
  };
  document.addEventListener('keydown', onKey);

  // CTA button
  overlay.querySelector('.onboarding-cta')?.addEventListener('click', dismiss);

  return dismiss;
}

function showWelcome(onDone) {
  createModal(`
    <h2 class="onboarding-title">What's That Bug?</h2>
    <p class="onboarding-text">See a bug. Guess its name. Learn something new.</p>
    <p class="onboarding-detail">2,600+ research-grade photos from iNaturalist.<br>No login. No tracking. Just bugs.</p>
    <button class="btn btn-primary onboarding-cta">Let's play</button>
  `, () => {
    markSeen(SEEN_WELCOME);
    if (onDone) setTimeout(onDone, 360);
  });
}

function showScoring(onDone) {
  createModal(`
    <h2 class="onboarding-title">How scoring works</h2>
    <div class="onboarding-scoring">
      <div class="onboarding-score-row"><span>Exact species</span><span class="onboarding-pts">100 pts</span></div>
      <div class="onboarding-score-row"><span>Same genus</span><span class="onboarding-pts">75 pts</span></div>
      <div class="onboarding-score-row"><span>Same family</span><span class="onboarding-pts">50 pts</span></div>
      <div class="onboarding-score-row"><span>Same order</span><span class="onboarding-pts">25 pts</span></div>
    </div>
    <p class="onboarding-detail">New here? Start with Bugs 101 — it's easier.</p>
    <button class="btn btn-primary onboarding-cta">Got it</button>
  `, () => {
    markSeen(SEEN_SCORING);
    if (onDone) onDone();
  });
}

/**
 * Run the onboarding sequence. Call from index.astro on page load.
 * Only shows modals that haven't been seen before.
 */
export function runOnboarding() {
  if (!hasSeen(SEEN_WELCOME)) {
    showWelcome(() => {
      if (!hasSeen(SEEN_SCORING)) {
        showScoring();
      }
    });
  } else if (!hasSeen(SEEN_SCORING)) {
    showScoring();
  }
}
