'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'Sargasses_PROD.jsx'), 'utf8');
  const { isSatelliteFresh12h } = await import('../../src/lib/format-freshness.mjs');
  const start = src.indexOf('function HeroVerdict(');
  const end = src.indexOf('\nfunction ', start + 1);
  assert.ok(start >= 0 && end > start, 'HeroVerdict component is present');
  const hero = src.slice(start, end);

  const now = Date.parse('2026-10-25T15:43:21.000Z');
  const staleProductionShape = {
    updatedAt: '2026-10-24T20:57:54.299Z',
    erddapTimestamp: '2026-10-23T12:00:00.000Z',
    dataAgeMinutes: 1978,
    stale: false
  };
  assert.equal(isSatelliteFresh12h(staleProductionShape, now), false,
    'a >12h satellite observation is not fresh even if stale=false and dataAgeMinutes is frozen');

  const fresh = {
    ...staleProductionShape,
    erddapTimestamp: new Date(now - 3 * 60 * 60 * 1000).toISOString()
  };
  assert.equal(isSatelliteFresh12h(fresh, now), true, 'a <12h satellite observation remains fresh');

  assert.ok(hero.includes('const verdictTxt=!updFresh'), 'stale primary verdict becomes neutral');
  assert.ok(hero.includes('updFresh&&beach.score!=null'), 'stale primary score is hidden');
  assert.ok(hero.includes('const statusShort=b=>!updFresh'), 'stale beach cards use a verification label');
  assert.ok(hero.includes('updFresh&&b.score!=null'), 'stale beach-card scores are hidden');
  assert.ok(hero.includes('&&updFresh&&liveCounts.total>0'), 'stale live counts are hidden');
  assert.ok(hero.includes('&&updFresh&&(()=>{'), 'stale next-clean recommendation is hidden');
  assert.ok(hero.includes('OBSERVATION SATELLITE À VÉRIFIER'), 'stale state has a localized satellite-verification label');
  assert.ok(hero.includes('Les observations satellite ne sont pas assez récentes'), 'stale section explains why current statuses are not shown');
  assert.ok(hero.includes('updFresh?"Ouvrir la carte live":"Ouvrir la carte"'), 'map CTA stops claiming live data when stale');
  assert.ok(hero.includes('updFresh&&upd?') && !hero.includes('{upd?(updFresh?'), 'stale section does not append a live timestamp');

  console.log('HERO_STALE_VERDICT_TEST PASS (12 assertions)');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
