'use strict';

/**
 * mixed-scenario-freshness.test.cjs â€” RÃ‰GRESSION du scÃ©nario mixte exact qui a
 * fait Ã©chouer l'audit Agent 2 sur #895 (NO-GO, pill canonique .sg-live) :
 * updatedAt frais de 20 min masquant un satellite de ~62h + stale:false +
 * dataAgeMinutes:2048 (le motif rÃ©el de la production 2026-10-12).
 *
 * Assertions requises par la mission :
 *  1. Le prÃ©dicat partagÃ© (chat + pill canonique) ne dÃ©clare PAS frais.
 *  2. Aucune fraÃ®cheur dÃ©rivÃ©e de updatedAt : le prÃ©dicat sur updatedAt seul
 *     (ancienne rÃ¨gle .sg-live) doit Ãªtre fausse ici.
 *  3. Les surfaces #896 (serve-time) calculent l'Ã¢ge au rendu : ~62h, pas 2048.
 *  4. Une fixture rÃ©ellement fraÃ®che reste identifiÃ©e live.
 *  5. Bornes 12h, dates invalides/absentes/futures couvertes.
 */
const assert = require('node:assert/strict');

(async () => {
  const { isSatelliteFresh12h, satelliteAgeHours, isSatelliteStale36h } =
    await import('../../src/lib/format-freshness.mjs');

  const now = Date.parse('2026-10-12T19:10:00.000Z');
  // Scenario mixte EXACT : satellite ~62h (57-60h+), republication il y a 20 minutes.
  const MIXED = {
    updatedAt: '2026-10-12T18:50:00.000Z',
    erddapTimestamp: '2026-10-10T05:10:00.000Z',
    stale: false,
    dataAgeMinutes: 2048,
    source: 'erddap-live'
  };
  const MIXED_AGE_H = 62;
  let n = 0;
  const t = (cond, label) => { n++; assert.ok(cond, label); };
  const approx = (a, b) => Math.abs(a - b) < 0.05;

  // 1. Chat + pill canonique : PAS de fraÃ®cheur au scÃ©nario mixte.
  t(isSatelliteFresh12h(MIXED, now) === false, 'MIXED: prÃ©dicat partagÃ© => non frais (chat + .sg-live)');
  t(isSatelliteStale36h(MIXED, now) === true, 'MIXED: stale36 vrai (62h)');

  // 2. L'ancienne rÃ¨gle de la pill (updatedAt <12h) aurait menti : on le PROUVE
  //    pour verrouiller la rÃ©gression â€” updatedAt seul ne doit JAMAIS suffire.
  const ageOfUpdatedAt = (now - Date.parse(MIXED.updatedAt)) / 3_600_000;
  t(approx(ageOfUpdatedAt, 1 / 3), 'MIXED: updatedAt a 20 min â€” l ancienne rÃ¨gle aurait affichÃ© EN DIRECT');
  t(isSatelliteFresh12h({ updatedAt: MIXED.updatedAt }, now) === false, 'MIXED: updatedAt SEUL => non frais (rÃ¨gle morte)');

  // 3. Surfaces serve-time (#896) : Ã¢ge au rendu, pas les champs figÃ©s.
  const live = satelliteAgeHours(MIXED, now);
  t(live != null && approx(live, MIXED_AGE_H), 'MIXED: Ã¢ge rendu ~62h (pas dataAgeMinutes=2048 => 34h)');
  t(live !== 2048 / 60, 'MIXED: Ã¢ge rendu != lecture figÃ©e');

  // 4. Fixture rÃ©ellement fraÃ®che : identifiÃ©e live.
  const FRESH = { ...MIXED, erddapTimestamp: '2026-10-12T17:10:00.000Z', dataAgeMinutes: 120 };
  t(isSatelliteFresh12h(FRESH, now) === true, 'FRESH: prÃ©dicat => frais');
  t(isSatelliteStale36h(FRESH, now) === false, 'FRESH: pas stale36');
  t(approx(satelliteAgeHours(FRESH, now), 2), 'FRESH: Ã¢ge rendu ~2h');

  // 5. Bornes et cas limites (12h pile, absent, invalide, futur).
  t(isSatelliteFresh12h({ erddapTimestamp: '2026-10-12T07:10:01.000Z' }, now) === true, '11:59:59 => frais');
  t(isSatelliteFresh12h({ erddapTimestamp: '2026-10-12T06:59:59.000Z' }, now) === false, '12:00:01 => non frais');
  for (const [label, p] of [['absent', {}], ['updatedAt seul', { updatedAt: '2026-10-12T18:50:00.000Z' }], ['invalide', { erddapTimestamp: 'garbage' }], ['futur', { erddapTimestamp: '2026-10-12T21:00:00.000Z' }], ['null', null]]) {
    t(isSatelliteFresh12h(p, now) === false, label + ' => non frais');
    t(satelliteAgeHours(p, now) === null, label + ' => Ã¢ge null');
    t(isSatelliteStale36h(p, now) === false, label + ' => pas stale36');
  }

  console.log(`MIXED_SCENARIO_FRESHNESS_TESTS PASS (${n} assertions)`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
