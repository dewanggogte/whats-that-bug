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
 * Spawn confetti particles inside a container element.
 */
function spawnConfetti(container) {
  const colors = ['#e8a87c', '#d4a574', '#f0c27a', '#ff9a76', '#ffd700', '#98d8c8', '#f67280'];
  const count = 40;
  for (let i = 0; i < count; i++) {
    const particle = document.createElement('div');
    particle.className = 'lb-confetti';
    particle.style.setProperty('--x', `${(Math.random() - 0.5) * 300}px`);
    particle.style.setProperty('--r', `${Math.random() * 720 - 360}deg`);
    particle.style.left = `${50 + (Math.random() - 0.5) * 20}%`;
    particle.style.background = colors[Math.floor(Math.random() * colors.length)];
    particle.style.animationDelay = `${Math.random() * 0.3}s`;
    container.appendChild(particle);
  }
}

/**
 * Show celebration popup for a top-10 entry.
 * Returns a promise that resolves when the user submits/closes.
 */
export function showCelebrationPopup({ rank, score, streak, setKey, sessionId, board, questionsAnswered, correctCount }) {
  return new Promise((resolve) => {
    const isStreak = setKey.includes('streak');
    const value = isStreak ? streak : score;
    const scoreDisplay = isStreak
      ? `${streak} bug${streak !== 1 ? 's' : ''} identified in a row`
      : `${score} points scored`;

    // Rank-specific medal, warm headline, and rank badge
    let medal, headline;
    if (rank === 1) { medal = '🥇'; headline = "You're the world's best bug hunter!"; }
    else if (rank === 2) { medal = '🥈'; headline = 'You made the podium!'; }
    else if (rank === 3) { medal = '🥉'; headline = 'You made the podium!'; }
    else { medal = '🏆'; headline = 'You cracked the Top 10!'; }

    const rankBadge = `#${rank} on the leaderboard`;
    const shareText = generateLeaderboardShareText(rank, setKey, score, streak);

    // Show top 5 or top 3 depending on board size, with link to full leaderboard
    const previewBoard = board.slice(0, 5);
    const tableHTML = renderLeaderboardTable(previewBoard, isStreak, rank);
    const base = window.__BASE || '';
    const leaderboardLink = `${base}/leaderboard`;

    const overlay = document.createElement('div');
    overlay.className = 'lb-popup-overlay';
    overlay.innerHTML = `
      <div class="lb-popup lb-celebrate">
        <button class="lb-popup-close" aria-label="Close">&times;</button>

        <div class="lb-popup-header">
          <div class="lb-popup-medal">${medal}</div>
          <h2 class="lb-popup-heading">${headline}</h2>
          <div class="lb-popup-rank-badge">${rankBadge}</div>
          <div class="lb-popup-score">${scoreDisplay}</div>
        </div>

        <button class="btn btn-primary lb-share-primary" id="lb-share-primary">Share Your Rank</button>
        <div class="lb-share-secondary">
          <button class="btn btn-outline lb-share-icon" id="lb-wa" title="WhatsApp"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg></button>
          <button class="btn btn-outline lb-share-icon" id="lb-im" title="iMessage"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></button>
          <button class="btn btn-outline lb-share-icon" id="lb-tw" title="X"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg></button>
        </div>

        <div class="lb-claim-section">
          <p class="lb-claim-label">Claim your spot</p>
          <div class="lb-popup-form">
            <div class="lb-field">
              <input type="text" id="lb-name" class="lb-input" placeholder="Your name" maxlength="30">
              <span class="lb-field-hint">Optional — leave blank for 'Anonymous Bug Hunter'</span>
            </div>
            <div class="lb-field">
              <select id="lb-country" class="lb-select">
                ${renderCountryOptions()}
              </select>
              <span class="lb-field-hint">Optional — show your flag on the leaderboard</span>
            </div>
            <button class="btn btn-primary lb-submit-btn" id="lb-submit">Join the Leaderboard</button>
            <button class="lb-skip-btn" id="lb-skip">Skip — submit as Anonymous</button>
          </div>
        </div>

        <div class="lb-mini-board">
          ${tableHTML}
          <a href="${leaderboardLink}" class="lb-view-full">View full leaderboard</a>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Spawn confetti
    const popup = overlay.querySelector('.lb-popup');
    spawnConfetti(popup);

    // Share handlers
    overlay.querySelector('#lb-share-primary')?.addEventListener('click', async () => {
      const ok = await copyToClipboard(shareText);
      const btn = overlay.querySelector('#lb-share-primary');
      btn.textContent = ok ? 'Copied! Paste anywhere' : 'Copy failed';
      setTimeout(() => { btn.textContent = 'Share Your Rank'; }, 2500);
    });
    overlay.querySelector('#lb-wa')?.addEventListener('click', () => openWhatsApp(shareText));
    overlay.querySelector('#lb-im')?.addEventListener('click', () => openIMessage(shareText));
    overlay.querySelector('#lb-tw')?.addEventListener('click', () => openTweetIntent(shareText));

    // Submit handler — guarded against multiple calls
    let submitted = false;
    const submitEntry = async (skipName) => {
      if (submitted) return;
      submitted = true;

      const name = skipName ? '' : (overlay.querySelector('#lb-name')?.value.trim() || '');
      const country = skipName ? '' : (overlay.querySelector('#lb-country')?.value || '');

      const submitBtn = overlay.querySelector('#lb-submit');
      const skipBtn = overlay.querySelector('#lb-skip');
      submitBtn.textContent = 'Submitting...';
      submitBtn.disabled = true;
      skipBtn.style.display = 'none';

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

    overlay.querySelector('#lb-submit')?.addEventListener('click', () => submitEntry(false));
    overlay.querySelector('#lb-skip')?.addEventListener('click', () => submitEntry(true));

    // Close = submit as anonymous
    overlay.querySelector('.lb-popup-close')?.addEventListener('click', () => submitEntry(true));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) submitEntry(true);
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
    const scoreDisplay = isStreak
      ? `${streak} bug${streak !== 1 ? 's' : ''} identified in a row`
      : `${score} points scored`;
    const prevDisplay = isStreak ? `${previousBest} in a row` : `${previousBest} pts`;
    const previewBoard = board.slice(0, 5);
    const tableHTML = renderLeaderboardTable(previewBoard, isStreak);
    const base = window.__BASE || '';
    const leaderboardLink = `${base}/leaderboard`;

    const overlay = document.createElement('div');
    overlay.className = 'lb-popup-overlay';
    overlay.innerHTML = `
      <div class="lb-popup">
        <button class="lb-popup-close" aria-label="Close">&times;</button>
        <div class="lb-popup-header">
          <div class="lb-popup-medal" style="font-size:40px;">&#127942;</div>
          <h2 class="lb-popup-heading">New Personal Best!</h2>
          <div class="lb-popup-score">${scoreDisplay}</div>
          <p class="lb-popup-prev">Previous best: ${prevDisplay}</p>
        </div>

        <div class="lb-mini-board">
          ${tableHTML}
          <a href="${leaderboardLink}" class="lb-view-full">View full leaderboard</a>
        </div>
        <p style="text-align:center;color:var(--text-secondary);font-size:0.8rem;margin-top:8px;">Keep climbing — Top 10 gets on the board!</p>
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
