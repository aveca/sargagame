'use strict';

/**
 * serve-time-freshness.test.cjs — la fraîcheur se calcule à l'instant du rendu
 * depuis erddapTimestamp, jamais depuis les instantanés pipeline figés
 * (`dataAgeMinutes`, `stale`) qui pourrissent en place (prod 2026-10-12 :
 * 2048 figé + stale:false à 54,8h réelles).
 */
const assert = require('node:assert/strict');

(async () => {
  const { satelliteAgeHours, isSatelliteStale36h, isSatelliteFresh12h } =
    await import('../../src/lib/format-freshness.mjs');
  const now = Date.parse('2026-10-12T18:46:17.584Z');
  const prod = {
    updatedAt: '2026-10-11T22:07:38.246Z',
    erddapTimestamp: '2026-10-10T12:00:00.000Z',
    stale: false,
    dataAgeMinutes: 2048
  };
  let n = 0;
  const t = (cond, label) => { n++; assert.ok(cond, label); };
  const approx = (a, b) => Math.abs(a - b) < 0.05;

  // 1. Payload prod : âge réel ~54,8h malgré dataAgeMinutes=2048 et stale=false.
  t(approx(satelliteAgeHours(prod, now), 54.77), 'prod => ~54,8h (pas 2048min)');
  t(isSatelliteStale36h(prod, now) === true, 'prod 54,8h => stale36 true (flag servi faux)');
  t(isSatelliteFresh12h(prod, now) === false, 'prod 54,8h => non frais 12h');

  // 2. Cas 2h : frais 12h, pas stale36, âge ~2h.
  const fresh = { erddapTimestamp: '2026-10-12T16:46:17.584Z', stale: false, dataAgeMinutes: 120 };
  t(approx(satelliteAgeHours(fresh, now), 2), '2h => âge 2');
  t(isSatelliteStale36h(fresh, now) === false, '2h => pas stale36');
  t(isSatelliteFresh12h(fresh, now) === true, '2h => frais 12h');

  // 3. Cas 13h : plus frais 12h (contrat), pas encore stale36.
  const mid = { erddapTimestamp: '2026-10-12T05:46:17.584Z', stale: false, dataAgeMinutes: 780 };
  t(approx(satelliteAgeHours(mid, now), 13), '13h => âge 13');
  t(isSatelliteFresh12h(mid, now) === false, '13h => non frais 12h (contrat)');
  t(isSatelliteStale36h(mid, now) === false, '13h => pas stale36');

  // 4. Cas 60h : stale36, même si le flag servi dit false.
  const old = { updatedAt: '2026-10-12T18:40:00.000Z', erddapTimestamp: '2026-10-10T06:46:17.584Z', stale: false, dataAgeMinutes: 3600 };
  t(approx(satelliteAgeHours(old, now), 60), '60h => âge 60');
  t(isSatelliteStale36h(old, now) === true, '60h => stale36 true');
  t(isSatelliteFresh12h(old, now) === false, '60h => non frais 12h');

  // 5. Bornes 36h : 35:59:59 => false, 36:00:01 => true.
  t(isSatelliteStale36h({ erddapTimestamp: '2026-10-11T06:46:18.584Z' }, now) === false, '35:59:59 => pas stale36');
  t(isSatelliteStale36h({ erddapTimestamp: '2026-10-11T06:46:16.584Z' }, now) === true, '36:00:01 => stale36');

  // 6. Absent/invalide/futur => âge null, stale36 false, 12h false.
  for (const [label, p] of [
    ['vide', {}], ['updatedAt seul', { updatedAt: '2026-10-12T18:40:00.000Z' }],
    ['invalide', { erddapTimestamp: 'nope' }], ['futur', { erddapTimestamp: '2026-10-12T19:46:17.584Z' }],
    ['null', null]
  ]) {
    t(satelliteAgeHours(p, now) === null, label + ' => âge null');
    t(isSatelliteStale36h(p, now) === false, label + ' => pas stale36');
    t(isSatelliteFresh12h(p, now) === false, label + ' => non frais 12h');
  }

  console.log(`SERVE_TIME_FRESHNESS_TESTS PASS (${n} assertions)`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
