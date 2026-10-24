const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const pages = [
  { path: 'public/recherche/index.html', canonical: 'https://sargasses-martinique.com/recherche/', horizon: 'J+', stale: /périmé|incomplet|indisponible/i },
  { path: 'public/research/index.html', canonical: 'https://sargasses-martinique.com/research/', horizon: 'D+', stale: /stale|incomplete|unavailable/i },
  { path: 'public/investigacion/index.html', canonical: 'https://sargasses-martinique.com/investigacion/', horizon: 'D+', stale: /obsoleto|incompleto|no está disponible/i }
];

class FakeElement {
  constructor(id) {
    this.id = id;
    this.textContent = '';
    this.className = '';
    this.style = {};
    this.children = [];
  }
  get firstChild() { return this.children[0] || null; }
  appendChild(child) { this.children.push(child); return child; }
  removeChild(child) {
    const i = this.children.indexOf(child);
    if (i >= 0) this.children.splice(i, 1);
    return child;
  }
}

function getInlineScript(html) {
  const start = html.lastIndexOf('<script>');
  assert.notEqual(start, -1, 'final inline script must exist');
  const end = html.indexOf('</script>', start);
  assert.ok(end > start, 'final inline script must close');
  return html.slice(start + '<script>'.length, end);
}

function makeDocument(html) {
  const elements = Object.create(null);
  for (const match of html.matchAll(/\bid="([^"]+)"/g)) {
    if (!elements[match[1]]) elements[match[1]] = new FakeElement(match[1]);
  }

  for (const id of Object.keys(elements)) {
    if (id === 'research-dataset-schema') continue;
    const match = html.match(new RegExp('<[^>]*\\bid="' + id + '"[^>]*>([^<]*)'));
    if (match) elements[id].textContent = match[1];
  }

  const schemaMatch = html.match(/<script id="research-dataset-schema" type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(schemaMatch, 'Dataset JSON-LD must have a stable id');
  elements['research-dataset-schema'].textContent = schemaMatch[1];

  const freshnessMatch = html.match(/<div id="r-freshness" class="([^"]*)"/);
  assert.ok(freshnessMatch, 'freshness status container must exist');
  elements['r-freshness'].className = freshnessMatch[1];

  return {
    getElementById(id) { return elements[id] || null; },
    createElement() { return new FakeElement(''); }
  };
}

async function runPage(html, responseMode, payload) {
  const document = makeDocument(html);
  const fetch = () => {
    if (responseMode === 'network-error') return Promise.reject(new Error('network failure'));
    if (responseMode === 'http-error') return Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve(payload) });
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(payload) });
  };
  vm.runInNewContext(getInlineScript(html), {
    document, fetch, Date, Number, Object, Array, String, Math, JSON, isFinite,
    console: { warn() {}, error() {} }
  });
  await new Promise(resolve => setImmediate(resolve));
  return document;
}

function freshRecord(overrides = {}) {
  return {
    generatedAt: new Date().toISOString(),
    freshness: { stale: false },
    window: { from: '2026-10-23', to: '2026-10-24' },
    sampleSize: 12,
    overall: { statusHitRatePct: 0, afaiMAE: 0.123 },
    byRegime: { calm: { cleanSamples: 10, cleanReliabilityPct: 90, falseAlarmRatePct: 0 } },
    byHorizon: [{ day: 1, hitRatePct: 0, pairs: 12 }],
    ...overrides
  };
}

function assertFiguresHidden(document, page, reason) {
  for (const id of ['r-window', 'r-sample', 'r-clean-pct', 'r-clean-n', 'r-overall', 'r-mae', 'r-pairs', 'r-fa']) {
    assert.equal(document.getElementById(id).textContent, '—', page.path + ': ' + id + ' must be hidden (' + reason + ')');
  }
  assert.equal(document.getElementById('r-hz').children.length, 0, page.path + ': horizon rows must be empty (' + reason + ')');
  assert.equal(document.getElementById('r-freshness').className, 'freshness stale', page.path + ': stale status styling');
  assert.match(document.getElementById('r-status').textContent, page.stale, page.path + ': localized stale message');
  const schema = JSON.parse(document.getElementById('research-dataset-schema').textContent);
  assert.equal(schema.temporalCoverage, undefined, page.path + ': stale Dataset must not claim a date range');
}

(async () => {
  for (const page of pages) {
    const html = fs.readFileSync(path.join(ROOT, page.path), 'utf8');
    assert.doesNotMatch(html, /(?:[ÃÂ][^\s<]|â(?:[€”™œ–—]|[\u0080-\u00bf])|ðŸ|ï¸)/, page.path + ': no UTF-8 mojibake in page copy or metadata');

    // Initial HTML and structured data must not expose the old figures.
    assert.ok(html.includes('href="' + page.canonical + '"'), page.path + ': canonical preserved');
    assert.ok(html.includes('hreflang="fr"') && html.includes('hreflang="en"') && html.includes('hreflang="es"'), page.path + ': hreflang links preserved');
    assert.doesNotMatch(html, /3(?:[ ,.])?420|3(?:[ ,.])?180|0\.047|0\.044|17 (?:juin|jun|junio) 2026/i, page.path + ': old hard-coded metrics removed');
    assert.match(html, /id="r-clean-pct">—<\/div>/, page.path + ': clean accuracy starts hidden');
    assert.match(html, /id="r-overall">—<\/div>/, page.path + ': overall accuracy starts hidden');
    assert.match(html, /id="r-fa">—<\/b>/, page.path + ': false-alarm rate starts hidden');
    assert.match(html, /<tbody id="r-hz"><\/tbody>/, page.path + ': stale horizon rows removed');
    const staticSchema = JSON.parse(html.match(/<script id="research-dataset-schema" type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    assert.equal(staticSchema.temporalCoverage, undefined, page.path + ': static Dataset has no stale temporalCoverage');

    // Old timestamp with stale=false must still be rejected by the age guard.
    const oldButNotFlagged = freshRecord({
      generatedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      overall: { statusHitRatePct: 96, afaiMAE: 0.018 }
    });
    assertFiguresHidden(await runPage(html, 'ok', oldButNotFlagged), page, 'old timestamp');

    // Explicit stale flag must win even when generatedAt is recent.
    assertFiguresHidden(await runPage(html, 'ok', freshRecord({ freshness: { stale: true } })), page, 'stale flag');

    // HTTP and network failures must not fall back to old static figures.
    assertFiguresHidden(await runPage(html, 'http-error', freshRecord()), page, 'HTTP error');
    assertFiguresHidden(await runPage(html, 'network-error', freshRecord()), page, 'network error');

    // A fresh, valid record must render even legitimate zero values as 0%, not as missing.
    const live = await runPage(html, 'ok', freshRecord());
    assert.equal(live.getElementById('r-overall').textContent, '0%', page.path + ': valid zero overall rate preserved');
    assert.equal(live.getElementById('r-fa').textContent, '0%', page.path + ': valid zero false-alarm rate preserved');
    assert.equal(live.getElementById('r-clean-pct').textContent, '90%', page.path + ': clean-water rate rendered');
    assert.equal(live.getElementById('r-clean-n').textContent, '10', page.path + ': clean-water sample rendered');
    assert.equal(live.getElementById('r-pairs').textContent, '12', page.path + ': sample size rendered');
    assert.equal(live.getElementById('r-hz').children.length, 1, page.path + ': live horizon row rendered');
    assert.equal(live.getElementById('r-hz').children[0].children[0].textContent, page.horizon + '1', page.path + ': localized horizon label');
    assert.equal(live.getElementById('r-hz').children[0].children[1].textContent, '0%', page.path + ': zero horizon rate preserved');
    assert.equal(live.getElementById('r-freshness').className, 'freshness', page.path + ': fresh status styling');
    const liveSchema = JSON.parse(live.getElementById('research-dataset-schema').textContent);
    assert.equal(liveSchema.temporalCoverage, '2026-10-23/2026-10-24', page.path + ': Dataset coverage follows the validated record');
  }
  console.log('research-pages-freshness: all locale, stale, HTTP/network-failure and valid-zero cases passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
