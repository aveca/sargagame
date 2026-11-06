#!/usr/bin/env node
// Sync test : workers/sargagame/mcp-data.js == sources (regions/*.json,
// scripts/lib/sarg-to-beach.cjs), champs publics uniquement (aucun secret).
// Auto-executant : exit 0 = OK, exit 1 = echec. Sans dependances npm.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

let failures = 0;
function assert(cond, msg) {
  if (cond) { console.log('  OK ' + msg); } else { failures++; console.error('  FAIL ' + msg); }
}

const src = fs.readFileSync(path.join(ROOT, 'workers', 'sargagame', 'mcp-data.js'), 'utf8');
const table = (name) => {
  const m = src.match(new RegExp('export const ' + name + ' = (\\{[^;]*\\}|\\[[^;]*\\]);', 's'));
  if (!m) throw new Error('table introuvable: ' + name);
  return eval('(' + m[1] + ')');
};

console.log('1) Regions embarquees == regions/*.json (6 domaines prod)');
const regions = table('MCP_REGIONS');
assert(Array.isArray(regions) && regions.length === 6, '6 regions embarquees');
for (const id of ['mq', 'gp', 'florida', 'puntacana', 'rivieramaya', 'tulum']) {
  const live = JSON.parse(fs.readFileSync(path.join(ROOT, 'regions', id + '.json'), 'utf8'));
  const emb = regions.find((r) => r.id === id);
  assert(!!emb, id + ' presente');
  if (!emb) continue;
  for (const k of ['name', 'country', 'domain', 'primaryLang', 'currency']) {
    assert(emb[k] === live[k], id + '.' + k + ' == source');
  }
  assert(JSON.stringify(emb.secondaryLangs) === JSON.stringify(live.secondaryLangs || []), id + '.secondaryLangs == source');
  assert(emb.timezone === (live.timezone || null), id + '.timezone == source');
}

console.log('2) Plages nouvelles regions == regions/*.json');
const beaches = table('NEW_REGION_BEACHES');
for (const id of ['florida', 'puntacana', 'rivieramaya', 'tulum']) {
  const live = JSON.parse(fs.readFileSync(path.join(ROOT, 'regions', id + '.json'), 'utf8'));
  const emb = beaches[id] || [];
  assert(emb.length === (live.beaches || []).length, id + ' : ' + emb.length + ' plages == source');
  const liveIds = new Set((live.beaches || []).map((b) => b.id));
  assert(emb.every((b) => liveIds.has(b.id)), id + ' : ids == source');
  const byId = Object.fromEntries((live.beaches || []).map((b) => [b.id, b]));
  assert(emb.every((b) => b.name === byId[b.id].name), id + ' : noms == source');
}

console.log('3) SARG_TO_BEACH == scripts/lib/sarg-to-beach.cjs');
const { SARG_TO_BEACH: liveMap } = require(path.join(ROOT, 'scripts', 'lib', 'sarg-to-beach.cjs'));
const embMap = table('SARG_TO_BEACH');
assert(JSON.stringify(embMap) === JSON.stringify(liveMap), 'map identique (' + Object.keys(liveMap).length + ' entrees)');

console.log('4) Aucun champ sensible dans mcp-data.js');
for (const bad of ['stripeProducts', 'onesignal', 'ga4Id', 'clarityProjectId', 'paymentLinks', 'MOLLIE', 'SUPABASE', 'SECRET', 'TOKEN', '@', 'emails']) {
  assert(!src.includes(bad), 'absent : ' + bad);
}

console.log(failures ? '\n' + failures + ' echec(s)' : '\nOK — mcp-data.js synchro avec les sources');
process.exit(failures ? 1 : 0);
