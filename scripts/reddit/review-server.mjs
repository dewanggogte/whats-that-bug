/**
 * Review UI server — serves the photo curation and post-editing interface.
 *
 * Starts a local HTTP server that serves review.html with injected data,
 * then waits for the user to submit their selections and edits via POST.
 *
 * Usage:
 *   const savedData = await startReviewServer(candidateData, subMeta, calendarSlots, onSave);
 */

import { createServer } from 'http';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REVIEW_HTML_PATH = join(__dirname, 'review.html');
const PORT = 3847;

/**
 * Starts the review HTTP server and opens the browser.
 *
 * @param {Object} candidateData - { subId: [observation, ...], ... }
 * @param {Object} subMeta      - { subId: { name, title, body }, ... }
 * @param {Array}  calendarSlots - [{ subId, contentType, scheduledAt }, ...]
 * @param {Function} onSave     - Called with the saved payload; return value is ignored
 * @returns {Promise<Object>}   Resolves with the saved data from the browser
 */
export function startReviewServer(candidateData, subMeta, calendarSlots, onSave) {
  return new Promise((resolve, reject) => {
    let html;
    try {
      html = readFileSync(REVIEW_HTML_PATH, 'utf-8');
    } catch (err) {
      reject(new Error(`Failed to read review.html: ${err.message}`));
      return;
    }

    // Inject data as a script block before the closing </head> tag
    const dataScript = [
      '<script>',
      `window.CANDIDATES = ${JSON.stringify(candidateData)};`,
      `window.SUB_META = ${JSON.stringify(subMeta)};`,
      `window.CALENDAR_SLOTS = ${JSON.stringify(calendarSlots)};`,
      '</script>',
    ].join('\n');

    const injectedHtml = html.replace('</head>', `${dataScript}\n</head>`);

    const server = createServer((req, res) => {
      // Serve the review page
      if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(injectedHtml);
        return;
      }

      // Handle save
      if (req.method === 'POST' && req.url === '/api/save') {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', async () => {
          try {
            const data = JSON.parse(body);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));

            // Call the onSave callback
            if (onSave) {
              try { await onSave(data); } catch (e) {
                console.error('onSave callback error:', e);
              }
            }

            // Close the server, then resolve the promise
            server.close(() => resolve(data));
          } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          }
        });
        return;
      }

      // 404 for everything else
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    });

    server.on('error', (err) => {
      reject(new Error(`Review server failed to start: ${err.message}`));
    });

    server.listen(PORT, () => {
      const url = `http://localhost:${PORT}`;
      console.log(`\n  Review UI ready: ${url}\n`);
      exec(`open ${url}`);
    });
  });
}
