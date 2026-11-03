'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { generateRegionSeoPages } = require('../scripts/lib/region-seo-pages.cjs');

const ROOT = path.resolve(__dirname, '..');
const region = JSON.parse(fs.readFileSync(path.join(ROOT, 'regions/rivieramaya.json'), 'utf8'));
const esContent = JSON.parse(fs.readFileSync(path.join(ROOT, 'regions/seo-content/rivieramaya.json'), 'utf8'));
const enContent = JSON.parse(fs.readFileSync(path.join(ROOT, 'regions/seo-content/rivieramaya.en.json'), 'utf8'));
const NOW = Date.parse('2026-11-03T17:05:54Z');
const beachCount = region.beaches.length;

const forecastRows = Array.from({ length: 7 }, (_, index) => ({
  date: new Date(Date.parse('2026-11-06T00:00:00Z') + index * 86400000).toISOString().slice(0, 10),
  status: index === 0 ? 'avoid' : 'clean',
}));

function fixture(timestamp) {
  return {
    source: 'erddap-live',
    erddapTimestamp: new Date(timestamp).toISOString(),
    updatedAt: new Date(NOW).toISOString(),
    // Deliberately inconsistent: these fields must not override erddapTimestamp.
    dataAgeMinutes: 5,
    stale: false,
    levels: region.beaches.map(beach => ({
      id: beach.id,
      status: 'clean',
      score: 987,
      afai: 0.01,
      confidence: 99,
    })),
    weekly: Object.fromEntries(region.beaches.map(beach => [beach.id, { forecast: forecastRows }])),
  };
}

function render(data) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sargagame-seo-freshness-'));
  fs.copyFileSync(path.join(ROOT, 'index.html'), path.join(dir, 'index.html'));
  try {
    generateRegionSeoPages(region, dir, { data, now: NOW, trackRecord: null });
    return dir;
  } catch (error) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw error;
  }
}

function readPage(dir, prefix, slug) {
  const relative = [prefix, slug].filter(Boolean).join('/');
  return fs.readFileSync(path.join(dir, ...relative.split('/'), 'index.html'), 'utf8');
}

function hasUnsupportedCadence(html) {
  return /(?:\b(?:4|four)\s*(?:×|x|times)\s*(?:a\s+day|daily|per\s+day|\/day)\b|\b(?:4|cuatro)\s*(?:×|x|veces)\s*(?:al|por|\/)\s*d[ií]a\b|\bcada pocas horas\b)/i.test(html);
}

const staleData = fixture(NOW - 24 * 60 * 60 * 1000);
const staleSnapshot = JSON.stringify(staleData);
const staleDir = render(staleData);

try {
  const staleEsMap = readPage(staleDir, '', esContent.pages.map.slug);
  const staleEsForecast = readPage(staleDir, '', esContent.pages.forecast.slug);
  const staleEsToday = readPage(staleDir, '', esContent.pages.today.slug);
  const staleEsSemaforo = readPage(staleDir, '', 'semaforo-del-sargazo');
  const staleEsBest = readPage(staleDir, '', region.routes.best);
  const staleEsWeekly = readPage(staleDir, '', region.routes.weekly);
  const staleEsPress = readPage(staleDir, '', esContent.press.slug);
  const staleEnMap = readPage(staleDir, 'en', enContent.pages.map.slug);
  const staleEnForecast = readPage(staleDir, 'en', enContent.pages.forecast.slug);
  const staleEnPress = readPage(staleDir, 'en', enContent.press.slug);

  for (const html of [staleEsMap, staleEsForecast, staleEsToday, staleEsSemaforo, staleEsBest, staleEsWeekly, staleEsPress, staleEnMap, staleEnForecast, staleEnPress]) {
    assert.ok(!html.includes('987/100'), 'stale page must not publish a Beach Score');
    assert.ok(!hasUnsupportedCadence(html), 'generated SEO copy must not promise a fixed satellite refresh cadence');
  }

  assert.match(staleEsMap, /observación retrasada|No disponible/i);
  assert.match(staleEsForecast, /observación retrasada|No disponible/i);
  assert.match(staleEsSemaforo, /observación retrasada|estado no disponible/i);
  assert.match(staleEsBest, /Clasificación actual no disponible/i);
  assert.match(staleEsWeekly, /pronóstico semanal no disponible/i);
  assert.match(staleEsPress, /recuento actual de playas limpias se suspende/i);
  assert.match(staleEnPress, /current clean-beach count is withheld/i);
  assert.ok(!staleEsForecast.includes('viernes: Evitar'), 'stale forecast rows must be withheld');
  assert.ok(!staleEnForecast.includes('Friday: Avoid'), 'stale forecast rows must be withheld');
  assert.ok(!staleEsWeekly.includes('6/7 días limpios'), 'stale weekly counts must be withheld');

  // Preserve canonical, hreflang and sitemap routes while changing only page content.
  assert.match(staleEsMap, /rel="canonical" href="https:\/\/sargassumcancun\.com\/mapa-sargazo\/"/);
  assert.match(staleEsMap, /hreflang="es"/);
  assert.match(staleEsMap, /hreflang="en"/);
  assert.match(staleEnMap, /rel="canonical" href="https:\/\/sargassumcancun\.com\/en\/seaweed-map\/"/);
  const sitemap = fs.readFileSync(path.join(staleDir, 'sitemap.xml'), 'utf8');
  assert.ok(sitemap.includes('https://sargassumcancun.com/mapa-sargazo/'));
  assert.ok(sitemap.includes('https://sargassumcancun.com/en/seaweed-map/'));

  assert.equal(JSON.stringify(staleData), staleSnapshot, 'generator must not mutate scientific input data');
} finally {
  fs.rmSync(staleDir, { recursive: true, force: true });
}

const freshData = fixture(NOW - 60 * 60 * 1000);
const freshDir = render(freshData);

try {
  const freshEsMap = readPage(freshDir, '', esContent.pages.map.slug);
  const freshEsForecast = readPage(freshDir, '', esContent.pages.forecast.slug);
  const freshEsSemaforo = readPage(freshDir, '', 'semaforo-del-sargazo');
  const freshEsBest = readPage(freshDir, '', region.routes.best);
  const freshEsWeekly = readPage(freshDir, '', region.routes.weekly);
  const freshEsPress = readPage(freshDir, '', esContent.press.slug);
  const freshEnMap = readPage(freshDir, 'en', enContent.pages.map.slug);
  const freshEnForecast = readPage(freshDir, 'en', enContent.pages.forecast.slug);

  for (const html of [freshEsMap, freshEsForecast, freshEsSemaforo, freshEsBest, freshEsWeekly, freshEsPress, freshEnMap, freshEnForecast]) {
    assert.ok(!hasUnsupportedCadence(html), 'fixed satellite refresh cadence must be sanitized in every generated language');
  }

  assert.ok(freshEsMap.includes('987/100'), 'fresh map must retain publishable scores');
  assert.ok(freshEsForecast.includes('987/100'), 'fresh forecast page must retain publishable scores');
  assert.ok(freshEsForecast.includes('viernes: Evitar'), 'fresh forecast page must retain forecast rows');
  assert.ok(freshEsSemaforo.includes('987/100'), 'fresh traffic-light page must retain publishable scores');
  assert.ok(freshEsBest.includes('987/100'), 'fresh best-beaches page must retain publishable scores');
  assert.ok(freshEsWeekly.includes('6/7 días limpios'), 'fresh weekly page must retain publishable forecast counts');
  assert.ok(freshEsPress.includes('En la última observación satelital publicada'));
  assert.ok(freshEsPress.includes('' + beachCount + ' de ' + beachCount + ' playas con estado publicable'));
  assert.ok(freshEnMap.includes('987/100'));
  assert.ok(freshEnForecast.includes('987/100'));
  assert.ok(freshEnForecast.includes('Friday: Avoid'));
} finally {
  fs.rmSync(freshDir, { recursive: true, force: true });
}

console.log('region-seo-hubs-freshness: OK');
