'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { generateRegionSeoPages } = require('../scripts/lib/region-seo-pages.cjs');
const RL = require('../scripts/lib/region-langs.cjs');

const ROOT = path.resolve(__dirname, '..');
const REGION_IDS = ['florida', 'puntacana', 'rivieramaya', 'tulum'];
const NOW = Date.parse('2026-11-03T17:05:54Z');
const FORECAST_ROWS = Array.from({ length: 7 }, (_, index) => ({
  date: new Date(Date.parse('2026-11-06T00:00:00Z') + index * 86400000).toISOString().slice(0, 10),
  status: index === 0 ? 'avoid' : 'clean',
}));

function loadRegion(id) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'regions', id + '.json'), 'utf8'));
}

function loadContent(region, lang) {
  return JSON.parse(fs.readFileSync(RL.seoContentPath(region.id, lang, lang === RL.normLang(region.primaryLang)), 'utf8'));
}

function fixture(region, timestamp, overrides = {}) {
  return {
    source: 'erddap-live',
    erddapTimestamp: new Date(timestamp).toISOString(),
    updatedAt: new Date(NOW).toISOString(),
    // Deliberately inconsistent: the observation timestamp is the only clock.
    dataAgeMinutes: 5,
    stale: false,
    levels: region.beaches.map(beach => ({
      id: beach.id,
      status: 'clean',
      score: 987,
      afai: 0.01,
      confidence: 99,
    })),
    weekly: Object.fromEntries(region.beaches.map(beach => [beach.id, { forecast: FORECAST_ROWS }])),
    ...overrides,
  };
}

function render(region, data) {
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

function listHtmlFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listHtmlFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

function hasUnsupportedCadence(html) {
  return /(?:\b(?:4|four)\s*(?:×|x|times)\s*(?:a\s+day|daily|per\s+day|\/day)\b|\b(?:4|cuatro)\s*(?:×|x|veces)\s*(?:al|por|\/)\s*d[ií]a\b|\bcada pocas horas\b)/i.test(html);
}

function routePrefix(region, lang) {
  return RL.langPrefix(region, lang).replace(/^\/|\/$/g, '');
}

function assertStaleRegion(region) {
  const staleData = fixture(region, NOW - 24 * 60 * 60 * 1000);
  const staleSnapshot = JSON.stringify(staleData);
  const dir = render(region, staleData);
  try {
    const allHtml = listHtmlFiles(dir).map(file => fs.readFileSync(file, 'utf8'));
    assert.ok(allHtml.length > 0, region.id + ': generator should emit HTML pages');
    for (const html of allHtml) {
      assert.ok(!html.includes('987/100'), region.id + ': stale pages must not publish Beach Scores');
      assert.ok(!html.includes('Friday: Avoid'), region.id + ': stale pages must not publish forecast rows');
      assert.ok(!html.includes('viernes: Evitar'), region.id + ': stale pages must not publish forecast rows');
      assert.ok(!html.includes('6/7 clean days'), region.id + ': stale pages must not publish weekly counts');
      assert.ok(!html.includes('6/7 días limpios'), region.id + ': stale pages must not publish weekly counts');
      assert.ok(!hasUnsupportedCadence(html), region.id + ': generated SEO copy must not promise fixed satellite refresh cadence');
    }

    for (const lang of RL.emittedLangs(region)) {
      const content = loadContent(region, lang);
      const prefix = routePrefix(region, lang);
      const map = readPage(dir, prefix, content.pages.map.slug);
      const forecast = readPage(dir, prefix, content.pages.forecast.slug);
      assert.match(map, /Unavailable|No disponible|observación retrasada|observation delayed/i, region.id + '/' + lang + ': map must explain that current decisions are withheld');
      assert.match(forecast, /Unavailable|No disponible|observación retrasada|observation delayed/i, region.id + '/' + lang + ': forecast must explain that current decisions are withheld');
      assert.ok(!map.includes('987/100'));
      assert.ok(!forecast.includes('987/100'));

      if (content.press && content.press.slug && region.id === 'rivieramaya') {
        const press = readPage(dir, prefix, content.press.slug);
        if (lang === 'es') assert.match(press, /recuento actual de playas limpias se suspende/i);
        else assert.match(press, /current clean-beach count is withheld/i);
      }
    }

    if (region.id === 'rivieramaya') {
      const esMap = readPage(dir, '', 'mapa-sargazo');
      const enMap = readPage(dir, 'en', 'seaweed-map');
      assert.match(esMap, /rel="canonical" href="https:\/\/sargassumcancun\.com\/mapa-sargazo\/"/);
      assert.match(esMap, /hreflang="es"/);
      assert.match(esMap, /hreflang="en"/);
      assert.match(enMap, /rel="canonical" href="https:\/\/sargassumcancun\.com\/en\/seaweed-map\/"/);
      const sitemap = fs.readFileSync(path.join(dir, 'sitemap.xml'), 'utf8');
      assert.ok(sitemap.includes('https://sargassumcancun.com/mapa-sargazo/'));
      assert.ok(sitemap.includes('https://sargassumcancun.com/en/seaweed-map/'));
    }

    assert.equal(JSON.stringify(staleData), staleSnapshot, region.id + ': generator must not mutate scientific input data');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

for (const id of REGION_IDS) assertStaleRegion(loadRegion(id));

const riviera = loadRegion('rivieramaya');
const freshData = fixture(riviera, NOW - 60 * 60 * 1000, { dataAgeMinutes: 999999 });
const freshDir = render(riviera, freshData);

try {
  const freshEsMap = readPage(freshDir, '', 'mapa-sargazo');
  const freshEsForecast = readPage(freshDir, '', 'pronostico-sargazo');
  const freshEsSemaforo = readPage(freshDir, '', 'semaforo-del-sargazo');
  const freshEsBest = readPage(freshDir, '', riviera.routes.best);
  const freshEsWeekly = readPage(freshDir, '', riviera.routes.weekly);
  const freshEsPress = readPage(freshDir, '', 'press');
  const freshEnMap = readPage(freshDir, 'en', 'seaweed-map');
  const freshEnForecast = readPage(freshDir, 'en', 'sargassum-forecast');

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
  assert.ok(freshEsPress.includes(riviera.beaches.length + ' de ' + riviera.beaches.length + ' playas con estado publicable'));
  assert.ok(freshEnMap.includes('987/100'));
  assert.ok(freshEnForecast.includes('987/100'));
  assert.ok(freshEnForecast.includes('Friday: Avoid'));
} finally {
  fs.rmSync(freshDir, { recursive: true, force: true });
}

const unknownData = fixture(riviera, NOW - 60 * 60 * 1000, { source: 'manual' });
const unknownDir = render(riviera, unknownData);
try {
  const unknownMap = readPage(unknownDir, '', 'mapa-sargazo');
  assert.ok(!unknownMap.includes('987/100'), 'unknown source must fail closed even with a recent timestamp');
  assert.match(unknownMap, /observación no verificable|estado no disponible/i);
} finally {
  fs.rmSync(unknownDir, { recursive: true, force: true });
}

console.log('region-seo-hubs-freshness: OK');
