import sharp from 'sharp';

// Theme colors from global.css (dark mode)
const BG = '#1a1917';
const ACCENT = '#d4794e';
const TEXT = '#ffffff';
const TEXT_SECONDARY = '#a8a49c';

// --- OG Image (1200x630) ---
const ogSvg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="${BG}"/>
  <rect width="1200" height="6" fill="${ACCENT}"/>
  <text x="600" y="240" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-weight="bold" font-size="72" fill="${TEXT}">What's That Bug?</text>
  <text x="600" y="320" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="36" fill="${ACCENT}">Can you identify 1,000+ insects?</text>
  <text x="600" y="400" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="26" fill="${TEXT_SECONDARY}">A free GeoGuessr-style insect identification game</text>
  <text x="600" y="560" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="22" fill="${TEXT_SECONDARY}">dewanggogte.com/games/bugs</text>
</svg>`;

await sharp(Buffer.from(ogSvg)).png().toFile('public/og-default.png');
console.log('Created public/og-default.png (1200x630)');

// --- Favicon PNGs (192x192 and 512x512) ---
// Simple branded icon: dark background with accent-colored circle and "?" text
function faviconSvg(size) {
  const padding = Math.round(size * 0.1);
  const circleR = Math.round((size - padding * 2) / 2);
  const cx = size / 2;
  const cy = size / 2;
  const fontSize = Math.round(size * 0.5);
  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" rx="${Math.round(size * 0.15)}" fill="${BG}"/>
    <circle cx="${cx}" cy="${cy}" r="${circleR}" fill="${ACCENT}" opacity="0.15"/>
    <text x="${cx}" y="${cy + fontSize * 0.17}" text-anchor="middle" dominant-baseline="middle" font-family="system-ui, -apple-system, sans-serif" font-weight="bold" font-size="${fontSize}" fill="${ACCENT}">?</text>
  </svg>`;
}

await sharp(Buffer.from(faviconSvg(192))).png().toFile('public/icon-192.png');
console.log('Created public/icon-192.png (192x192)');

await sharp(Buffer.from(faviconSvg(512))).png().toFile('public/icon-512.png');
console.log('Created public/icon-512.png (512x512)');

console.log('Done!');
