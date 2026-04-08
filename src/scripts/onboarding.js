/**
 * Onboarding — welcome modal for first-time visitors.
 * Uses localStorage flag to avoid repeating.
 */

const SEEN_WELCOME = 'wtb_seen_welcome';

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

function showWelcome() {
  createModal(`
    <h2 class="onboarding-title">What's That Bug?</h2>
    <p class="onboarding-text">See a bug. Guess its name. Learn something new.</p>
    <p class="onboarding-detail">2,600+ research-grade photos from iNaturalist.<br>No login. No tracking. Just bugs.</p>
    <button class="btn btn-primary onboarding-cta">Let's play</button>
  `, () => {
    markSeen(SEEN_WELCOME);
  });
}

/**
 * Run the onboarding sequence. Call from index.astro on page load.
 * Only shows the welcome modal if it hasn't been seen before.
 */
export function runOnboarding() {
  if (!hasSeen(SEEN_WELCOME)) {
    showWelcome();
  }
}
