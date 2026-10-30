const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const pages = [
  {
    path: 'public/pro/hotels/index.html',
    canonical: 'https://sargasses-martinique.com/pro/hotels/',
    unknown: 'À VÉRIFIER',
    stale: 'Observation satellite ancienne'
  },
  {
    path: 'public/pro/en/hotels/index.html',
    canonical: 'https://sargasses-martinique.com/pro/en/hotels/',
    unknown: 'CHECK REQUIRED',
    stale: 'Satellite observation is old'
  },
  {
    path: 'public/pro/es/hotels/index.html',
    canonical: 'https://sargasses-martinique.com/pro/es/hotels/',
    unknown: 'POR VERIFICAR',
    stale: 'Observación satelital antigua'
  }
];

for (const item of pages) {
  const html = fs.readFileSync(path.join(ROOT, item.path), 'utf8');
  assert.ok(html.includes(item.canonical), item.path + ': canonical must remain unchanged');
  assert.match(html, /hreflang="fr"/, item.path + ': FR alternate must remain');
  assert.match(html, /hreflang="en"/, item.path + ': EN alternate must remain');
  assert.match(html, /hreflang="es"/, item.path + ': ES alternate must remain');
  assert.match(html, /id="freshpill"/, item.path + ': freshness pill must have a state target');
  assert.equal((html.match(/var STATUS_COLOR=/g) || []).length, 1, item.path + ': exactly one localized status color map must exist');
  assert.match(html, /is-stale \.pulse/, item.path + ': stale state must not keep the green pulse');
  assert.match(html, /is-unknown \.pulse/, item.path + ': unknown state must not keep the green pulse');
  assert.match(html, /erddapTimestamp/, item.path + ': source observation timestamp must be used');
  assert.match(html, /PUBLIC_STALE_AFTER_MS = 36 \* 60 \* 60 \* 1000/, item.path + ': public 36-hour threshold must be explicit');
  assert.match(html, /data\.stale===true \|\| ageMs>PUBLIC_STALE_AFTER_MS/, item.path + ': stale flag and source age must both be respected');
  assert.match(html, /freshEnough=freshness\.status==='fresh'/, item.path + ': only fresh source data may show a verdict');
  assert.match(html, /score\.textContent=freshEnough&&pick\.score!=null/, item.path + ': stale scores must be hidden');
  assert.ok(html.includes(item.unknown), item.path + ': localized review state must exist');
  assert.ok(html.includes(item.stale), item.path + ': localized stale observation label must exist');
  assert.match(html, /id="d-verdict"/, item.path + ': demo verdict must remain');
  assert.match(html, /id="d-score"/, item.path + ': demo score must remain');
  assert.match(html, /id="b2b-form"/, item.path + ': B2B lead form must remain');
  assert.match(html, /id="magnet-form"/, item.path + ': email brief form must remain');
  assert.doesNotMatch(html, /relTime\(d\.updatedAt\)/, item.path + ': republication timestamp must not drive freshness');
  const handlerStart = html.indexOf('// --- Per-beach observation');
  assert.notEqual(handlerStart, -1, item.path + ': freshness handler must exist');
  const handler = html.slice(handlerStart, handlerStart + 3500);
  assert.doesNotMatch(handler, /d\.updatedAt/, item.path + ': source freshness handler must not read updatedAt');
  assert.doesNotMatch(handler, /dataAgeMinutes/, item.path + ': display age must be recomputed from erddapTimestamp');
}

console.log('PASS: FR/EN/ES hotel pages use erddapTimestamp, mask stale verdicts and scores, preserve canonical, hreflang and lead forms.');
