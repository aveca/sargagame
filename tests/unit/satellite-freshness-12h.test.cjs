'use strict';

/**
 * satellite-freshness-12h.test.cjs — régression du défaut prod 2026-10-12 :
 * payload réel servi (updatedAt récent 22:07Z, erddap vieux de 54,8h,
 * stale:false, dataAgeMinutes:2048) => PAS frais, jamais « LIVE ».
 * Seul erddapTimestamp prouve la fraîcheur ; updatedAt seul ne prouve rien.
 */
const assert = require('node:assert/strict');

(async () => {
  const { isSatelliteFresh12h } = await import('../../src/lib/format-freshness.mjs');
  const now = Date.parse('2026-10-12T18:46:17.584Z');
  let n = 0;
  const t = (cond, label) => { n++; assert.ok(cond, label); };

  // 1. Défaut prod exact : updatedAt récent + erddap 54,8h + stale:false => false.
  t(isSatelliteFresh12h({
    updatedAt: '2026-10-11T22:07:38.246Z',
    erddapTimestamp: '2026-10-10T12:00:00.000Z',
    stale: false,
    dataAgeMinutes: 2048
  }, now) === false, 'payload prod 54,8h => non frais (jamais LIVE)');

  // 2. Le piège : updatedAt TOUT frais mais erddap vieux => false (updatedAt seul ne prouve rien).
  t(isSatelliteFresh12h({
    updatedAt: '2026-10-12T18:40:00.000Z',
    erddapTimestamp: '2026-10-10T12:00:00.000Z',
    stale: false
  }, now) === false, 'updatedAt frais + erddap vieux => non frais');

  // 3. Cas sain : erddap de 2h => true.
  t(isSatelliteFresh12h({ updatedAt: '2026-10-11T22:07:38.246Z', erddapTimestamp: '2026-10-12T16:46:17.584Z' }, now) === true, 'erddap 2h => frais');

  // 4. Bornes 12h : 11:59:59 => true, 12:00:01 => false.
  t(isSatelliteFresh12h({ erddapTimestamp: '2026-10-12T06:46:18.584Z' }, now) === true, '11:59:59 => frais');
  t(isSatelliteFresh12h({ erddapTimestamp: '2026-10-12T06:46:16.584Z' }, now) === false, '12:00:01 => non frais');

  // 5. Absent/invalide/futur => false (« Vérification en cours »).
  t(isSatelliteFresh12h({}, now) === false, 'sans horodatage => non frais');
  t(isSatelliteFresh12h({ updatedAt: '2026-10-12T18:40:00.000Z' }, now) === false, 'erddap absent (updatedAt seul) => non frais');
  t(isSatelliteFresh12h({ erddapTimestamp: 'not-a-date' }, now) === false, 'erddap invalide => non frais');
  t(isSatelliteFresh12h({ erddapTimestamp: '2026-10-12T19:46:17.584Z' }, now) === false, 'erddap futur => non frais');
  t(isSatelliteFresh12h(null, now) === false, 'payload null => non frais');

  console.log(`SATELLITE_FRESHNESS_12H_TESTS PASS (${n} assertions)`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
