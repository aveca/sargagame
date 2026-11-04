'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const file = path.join(__dirname, '..', '..', 'regions', 'seo-content', 'puntacana.es.json');
const content = JSON.parse(fs.readFileSync(file, 'utf8'));

function collectStrings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach(item => collectStrings(item, out));
  else if (value && typeof value === 'object') Object.values(value).forEach(item => collectStrings(item, out));
  return out;
}

const unsupported = /(?:4\s*[×x]\s*(?:al\s*d[ií]a)?|4\s*veces\s*(?:al|por)\s*d[ií]a|cuatro\s*veces\s*al\s*d[ií]a|actualizad[oa]s?\s*(?:a\s+diario|daily)|en\s*vivo|tiempo\s*real)/i;
const expectedPageSlugs = {
  forecast: 'pronostico-sargazo',
  today: 'playas-sin-sargazo-hoy',
  map: 'mapa-sargazo',
  seaweed: 'algas-punta-cana',
  season: 'temporada-sargazo-punta-cana',
};
for (const [key, slug] of Object.entries(expectedPageSlugs)) {
  assert.ok(content.pages[key], 'page ' + key + ' remains present');
  assert.equal(content.pages[key].slug, slug, 'page ' + key + ' route remains unchanged');
}
const expectedExtra = [
  ['sargazo-punta-cana-hoy', true],
  ['sargazo-bavaro-hoy', true],
  ['playas-sin-sargazo-en-punta-cana', true],
  ['es-peligroso-el-sargazo-en-punta-cana', false],
  ['como-saber-si-hay-sargazo-en-punta-cana', false],
  ['cuando-hay-menos-sargazo-en-punta-cana', false],
];
for (const [slug, daily] of expectedExtra) {
  const page = content.extraPages.find(item => item.slug === slug);
  assert.ok(page, 'extra page ' + slug + ' remains present');
  assert.equal(page.lang, 'es', slug + ' remains Spanish');
  assert.equal(page.priority, '0.7', slug + ' SEO priority remains unchanged');
  assert.equal(page.daily, daily, slug + ' sitemap cadence remains unchanged');
}
const copySurfaces = [
  ['pages', content.pages],
  ['extraPages', content.extraPages],
  ['resortPageTpl', content.resortPageTpl],
  ['press', content.press],
];
for (const [label, surface] of copySurfaces) {
  const copy = collectStrings(surface).join(' ');
  assert.doesNotMatch(copy, unsupported, label + ' contains no unsupported live or fixed-cadence claim');
}
for (const key of ['today', 'map', 'seaweed']) {
  const copy = collectStrings(content.pages[key]).join(' ');
  assert.match(copy, /retrasad|suspend|no hay confirmación|no se presenta/i, key + ' explains stale-data handling');
}
for (const slug of ['sargazo-punta-cana-hoy', 'sargazo-bavaro-hoy', 'playas-sin-sargazo-en-punta-cana']) {
  const page = content.extraPages.find(item => item.slug === slug);
  const copy = collectStrings(page).join(' ');
  assert.match(copy, /retrasad|suspend|no hay confirmación|no se presenta/i, slug + ' explains stale-data handling');
}
assert.match(content.pages.forecast.desc, /última observación|observación satelital/i, 'forecast identifies its observation basis');
assert.match(content.resortPageTpl.introPattern, /última observación/i, 'resort pages identify the observation basis');
assert.match(content.press.citation, /fecha y confianza/i, 'press citations retain observation context');

console.log('PUNTACANA_SPANISH_COPY_FRESHNESS PASS (routes, sitemap, cadence, live claims, observation handling)');
