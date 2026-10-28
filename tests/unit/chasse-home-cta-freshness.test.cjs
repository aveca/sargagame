#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..', '..');
let n = 0;
const t = (condition, label) => { n++; assert.ok(condition, label); console.log('OK  ' + label); };

(async () => {
  const { chasseMapCtaSummary } = await import('../../src/lib/format-freshness.mjs');

  t(chasseMapCtaSummary(3, 12, 11.9, 'fr') === "3/12 plages propres aujourd'hui · en direct",
    '<12 h: French count may be labeled today/live');
  t(chasseMapCtaSummary(3, 12, 11.9, 'en') === '3/12 clean beaches today · live',
    '<12 h: English count may be labeled today/live');
  t(chasseMapCtaSummary(3, 12, 11.9, 'es') === '3/12 playas limpias hoy · en directo',
    '<12 h: Spanish count may be labeled today/live');

  t(chasseMapCtaSummary(3, 12, 12, 'fr') === 'Dernière mesure satellite il y a 12 h · pas de statut en direct',
    'exactly 12 h: count is withheld and age is explicit');
  t(chasseMapCtaSummary(3, 12, 35.99, 'en') === 'Last satellite reading 35h ago · no live status',
    '12–36 h: English copy avoids a live claim and does not round over the stale threshold');
  t(chasseMapCtaSummary(3, 12, 36, 'fr') === 'Données satellite en retard · vérifie avant de choisir',
    '36 h: stale satellite copy replaces the count');
  t(chasseMapCtaSummary(3, 12, 40, 'es') === 'Datos satelitales atrasados · verifica antes de elegir',
    '>=36 h: Spanish copy explicitly warns of delayed data');
  t(chasseMapCtaSummary(3, 12, null, 'fr') === 'Horodatage satellite à vérifier · aucun statut en direct',
    'missing timestamp: no count or live claim');
  t(chasseMapCtaSummary(3, 12, NaN, 'en') === 'Satellite timestamp needs checking · no live status',
    'invalid timestamp: no count or live claim');
  t(chasseMapCtaSummary(3, 12, -1, 'es') === 'Hora satelital por verificar · sin estado en vivo',
    'future timestamp represented as negative age: no count or live claim');
  t(chasseMapCtaSummary(3, 12, 8, 'xx').startsWith('3/12'),
    'unknown locale falls back to French');

  const source = fs.readFileSync(path.join(ROOT, 'src', 'ChasseHome.jsx'), 'utf8');
  const start = source.indexOf('className="lc-gomap"');
  const end = source.indexOf('</button>', start);
  const cta = source.slice(start, end);
  t(start >= 0 && end > start, 'map CTA source section exists');
  t(cta.includes('chasseMapCtaSummary') && cta.includes('satelliteAgeHours(sargData)'),
    'map CTA summary is derived from the shared satellite timestamp helper');
  t(!cta.includes("plages propres aujourd'hui · en direct") && !cta.includes('clean beaches today · live'),
    'hardcoded live claims are removed from the component');

  console.log('\n' + n + '/' + n + ' assertions passed');
})().catch(err => { console.error(err); process.exit(1); });
