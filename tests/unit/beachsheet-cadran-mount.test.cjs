'use strict';

/**
 * beachsheet-cadran-mount.test.cjs — QA reproductible du montage du VRAI
 * CadranVeilleur dans la fiche active (BeachSheetComic) :
 *  1. Le câblage existe : BeachSheetComic rend ForecastCred (le sélecteur A/B
 *     réel) alimenté par weeklyData réel + sargData — pas une imitation.
 *  2. Le sélecteur A/B réagit à ?cadran=1 (contrat ForecastCred).
 *  3. Le prédicat partagé gouverne le cadran : scénario mixte prod
 *     (erddap ~62h, updatedAt 20 min, stale:false, dataAgeMinutes:2048)
 *     => fraîcheur cadran = NON, sans jamais lire updatedAt.
 *  4. Observation <12h => fraîcheur cadran = OUI.
 * (Montage DOM complet prouvé par Playwright sur la preview exact-SHA ; ce
 *  test verrouille le câblage source statiquement + le comportement du prédicat.)
 */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'Sargasses_PROD.jsx'), 'utf8');
  const { isSatelliteFresh12h, satelliteAgeHours, isSatelliteStale36h } =
    await import('../../src/lib/format-freshness.mjs');
  let n = 0;
  const t = (cond, label) => { n++; assert.ok(cond, label); };

  // 1. BeachSheetComic rend le VRAI ForecastCred avec les vraies données.
  const bsc = src.slice(src.indexOf('function BeachSheetComic'));
  t(/function BeachSheetComic/.test(src), 'BeachSheetComic present');
  t(bsc.slice(0, 32000).includes('weeklyData&&<ForecastCred weeklyData={weeklyData} lang={lang} sargData={sargData}/>'),
    'BeachSheetComic rend le vrai ForecastCred (selecteur A/B), weeklyData reel + sargData');
  t(bsc.slice(0, 32000).includes("sargData?._enrichedWeekly?.[`_interp_${beach.id}`]"),
    'weeklyData = weekly reel -> interpole, jamais fabrique');
  // Pas de duplication : ForecastCred reste le SEUL point d entree Cadran (A/B inchange).
  const fcAll = [...src.matchAll(/<ForecastCred /g)].length;
  t(fcAll === 2, 'ForecastCred monte exactement 2 fois (ancienne BeachSheet + fiche active), pas de 3e copie');

  // 2. Le selecteur A/B garde ?cadran=1 => CadranVeilleur.
  t(/function ForecastCred\(\{weeklyData,lang,sargData\}\)\{/.test(src)
    && /\?<CadranVeilleur weeklyData=\{weeklyData\}/.test(src)
    && /cadran=1/.test(src), 'ForecastCred: ?cadran=1 => CadranVeilleur (A/B inchange)');

  // 3. CadranVeilleur n utilise QUE les predicats partages (aucune lecture updatedAt).
  // (ForecastCred est avant CadranVeilleur dans le fichier : slice par bornes reelles.)
  const cvStart = src.indexOf('function CadranVeilleur');
  const cvEnd = src.indexOf('function SciFooter') > cvStart ? src.indexOf('function SciFooter') : cvStart + 6000;
  const cv = src.slice(cvStart, cvEnd);
  t(cv.includes('satelliteAgeHours(sargData)') && cv.includes('isSatelliteStale36h(sargData)') && cv.includes('isSatelliteFresh12h(sargData)'),
    'CadranVeilleur: predicats partages uniquement');
  // Lectures REELLES interdites : sargData.updatedAt / .stale / .dataAgeMinutes
  // (la variable locale `updatedAt` est alimentée par erddapTimestamp seul).
  t(!/sargData\?\.updatedAt|sargData&&sargData\.updatedAt/.test(cv) && !/sargData\?\.dataAgeMinutes|\.dataAgeMinutes/.test(cv) && !/sargData&&sargData\.stale|sargData\?\.stale/.test(cv),
    'CadranVeilleur: aucune lecture updatedAt/dataAgeMinutes/stale fige de sargData');
  t(/const updatedAt=\(sargData&&sargData\.erddapTimestamp\)\|\|null/.test(cv),
    'CadranVeilleur: horodatage local = erddapTimestamp SEUL');

  // 4. Scenario mixte prod : cadran non frais ; <12h : frais.
  const now = Date.parse('2026-10-12T21:43:07.000Z');
  const MIXED = { updatedAt: '2026-10-12T21:23:07.000Z', erddapTimestamp: '2026-10-10T08:03:07.000Z', stale: false, dataAgeMinutes: 2048 };
  t(isSatelliteFresh12h(MIXED, now) === false, 'MIXED (62h/20min/2048): cadran non frais');
  t(isSatelliteStale36h(MIXED, now) === true && Math.round(satelliteAgeHours(MIXED, now)) === 62,
    'MIXED: stale36 + age rendu ~62h');
  const FRESH = { ...MIXED, erddapTimestamp: '2026-10-12T19:43:07.000Z', dataAgeMinutes: 120 };
  t(isSatelliteFresh12h(FRESH, now) === true && isSatelliteStale36h(FRESH, now) === false,
    'FRESH (<12h): cadran frais');

  console.log(`BEACHSHEET_CADRAN_MOUNT_TESTS PASS (${n} assertions)`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
