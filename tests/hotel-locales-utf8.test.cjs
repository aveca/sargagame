const fs = require('fs');
const path = require('path');
const assert = require('assert');

const pages = [
  { file: '../public/pro/en/hotels/index.html', locale: 'en', expected: ['Météo-France', 'Latest-observation badge', '7-day forecast'] },
  { file: '../public/pro/es/hotels/index.html', locale: 'es', expected: ['El Vigía', 'Pronóstico', 'huéspedes', 'MÁS DÉBILES'] },
];
const mojibake = /(?:[ÃÂ][\u0080-\u00ff]|Ã[^\s]|Â[^\s]|â(?:€|ˆ|–|—|™|œ|…|‡|†|‹|›|˜)|ðŸ)/u;
for (const page of pages) {
  const file = path.join(__dirname, page.file);
  const html = fs.readFileSync(file, 'utf8');
  assert.match(html, /<meta charset="utf-8"\/?\s*>/i, file + ': UTF-8 declaration missing');
  assert.doesNotMatch(html, mojibake, file + ': mojibake marker remains');
  for (const phrase of page.expected) assert.ok(html.includes(phrase), file + ': expected localized phrase missing: ' + phrase);
  assert.match(html, /<link rel="canonical" href="https:\/\/sargasses-martinique\.com\/pro\//, file + ': canonical missing');
  assert.match(html, new RegExp('hreflang="' + page.locale + '"'), file + ': locale alternate missing');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
  assert.ok(blocks.length > 0, file + ': JSON-LD missing');
  for (const block of blocks) JSON.parse(block[1]);
}
console.log('hotel EN/ES UTF-8 regression: PASS (mojibake absent, localized copy present, canonicals/hreflang and JSON-LD valid)');
