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

const lowSeasonPage = content.extraPages.find(item => item.slug === 'cuando-hay-menos-sargazo-en-punta-cana');
assert.equal(lowSeasonPage.title, '¿Cuándo hay menos sargazo en Punta Cana? Meses clave',
  'low-season title matches the observed query intent');
assert.ok(lowSeasonPage.title.length <= 60, 'low-season title remains within 60 characters');
assert.equal(lowSeasonPage.desc, '¿Cuándo hay menos sargazo en Punta Cana? De noviembre a marzo suelen registrarse menos arribos. Consulta el calendario y la última observación publicada.',
  'low-season description answers the seasonal query without promising live data');
assert.ok(lowSeasonPage.desc.length <= 158, 'low-season description remains within 158 characters');
assert.match(lowSeasonPage.desc, /noviembre a marzo/i, 'description retains the seasonal window');
assert.match(lowSeasonPage.desc, /última observación publicada/i, 'description identifies the observation basis');
assert.doesNotMatch(lowSeasonPage.desc, /en vivo|tiempo real|4 veces al día/i,
  'description makes no unsupported live or cadence promise');
const copySurfaces = [
  ['pages', content.pages],
  ['extraPages', content.extraPages],
  ['resortPageTpl', content.resortPageTpl],
  ['press', content.press],
  ['beachFaq', content.beachFaq],
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
assert.ok(content.beachFaq, 'regional beach FAQ overrides the generic fallback');
assert.match(content.beachFaq.questions[0].a, /última observación satelital publicada/i, 'beach FAQ identifies the published observation');
assert.match(content.beachFaq.questions[1].a, /datos validados disponibles/i, 'beach forecast FAQ is conditional on validated data');


const seasonalAndClearanceCopy = collectStrings([
  content.pages.season,
  ...['sargazo-punta-cana-hoy', 'sargazo-bavaro-hoy', 'playas-sin-sargazo-en-punta-cana']
    .map(slug => content.extraPages.find(page => page.slug === slug))
]).join(' ');
assert.doesNotMatch(
  seasonalAndClearanceCopy,
  /fiablemente limpio|fiablemente limpia|ventana confiable|se mantienen limpias semanas enteras|olvídate del tema por completo|48\\s*(?:a|[-–])\\s*72\\s*(?:horas|h)|se recalcula con cada actualización satelital|actualizada?\\s*(?:cuatro|4) veces al día/i,
  'seasonal and clearance copy must not guarantee clean beaches, fixed clearance times, or fixed refresh cadence'
);
assert.match(content.pages.season.intro, /no garantizan playas limpias/i);
assert.match(
  content.extraPages.find(page => page.slug === 'sargazo-punta-cana-hoy').sections.find(section => /por qué hay sargazo/i.test(section.h2)).text,
  /no existe un plazo fijo/i
);

console.log('PUNTACANA_SPANISH_COPY_FRESHNESS PASS (routes, sitemap, cadence, live claims, observation handling)');
