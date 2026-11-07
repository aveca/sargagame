/**
 * tests/unit/analytics-domain-isolation.test.cjs
 * Mission 8/10 — déduplication des IDs analytics par domaine (#1084).
 *
 * Règle : deux domaines différents ne doivent pas partager le même ID
 * GA4, Clarity ou OneSignal. Les valeurs "TBD-*" marquent un domaine en
 * attente de provisionnement dédié (pas d'ID inventé, pas de partage).
 *
 * Lancement : node tests/unit/analytics-domain-isolation.test.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..', '..');
const DIR = path.join(ROOT, 'regions');

function loadRegions() {
  const out = {};
  for (const f of fs.readdirSync(DIR)) {
    if (!f.endsWith('.json') || f.startsWith('_')) continue;
    const cfg = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
    out[cfg.id] = cfg;
  }
  return out;
}

function isTBD(v) {
  return String(v || '').startsWith('TBD-');
}

const regions = loadRegions();
const ids = { ga4: {}, clarity: {}, onesignal: {} };
const violations = [];

for (const [id, cfg] of Object.entries(regions)) {
  for (const [key, bucket] of Object.entries(ids)) {
    const v = cfg[key === 'ga4' ? 'ga4Id' : key === 'clarity' ? 'clarityProjectId' : 'onesignalAppId'];
    if (!v || isTBD(v)) continue; // pas d'ID / en attente de provisionnement
    if (bucket[v] && bucket[v] !== id) {
      violations.push(`${key.toUpperCase()} ${v} partagé entre ${bucket[v]} et ${id}`);
    }
    bucket[v] = id;
  }
}

let n = 0;
console.log('ANALYTICS_DOMAIN_ISOLATION');
for (const [id, cfg] of Object.entries(regions)) {
  n++;
  console.log(`  ${id}: ga4=${cfg.ga4Id || '-'} clarity=${cfg.clarityProjectId || '-'} onesignal=${cfg.onesignalAppId || '-'}`);
}

if (violations.length) {
  console.error(`\nVIOLATIONS (${violations.length}):`);
  for (const v of violations) console.error(`  ✗ ${v}`);
  process.exitCode = 1;
} else {
  console.log('\n✓ Aucun ID analytics partagé entre deux domaines.');
  console.log(`  (${n} régions vérifiées, TBD = en attente de provisionnement dédié)`);
}

// Tulum et Riviera Maya ne doivent plus partager d'ID (défaut #1084)
const t = regions.tulum;
const rm = regions.rivieramaya;
assert.ok(!t.ga4Id || t.ga4Id !== rm.ga4Id, 'Tulum et Riviera Maya ne doivent pas partager le même ga4Id');
assert.ok(!t.clarityProjectId || t.clarityProjectId !== rm.clarityProjectId, 'Tulum et Riviera Maya ne doivent pas partager le même clarityProjectId');
assert.ok(!t.onesignalAppId || t.onesignalAppId !== rm.onesignalAppId, 'Tulum et Riviera Maya ne doivent pas partager le même onesignalAppId');
console.log('✓ Tulum/Riviera Maya isolation OK');

console.log('\nANALYTICS_DOMAIN_ISOLATION_TESTS PASS');
