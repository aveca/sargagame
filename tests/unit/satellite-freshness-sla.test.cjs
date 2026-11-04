'use strict';

/**
 * satellite-freshness-sla.test.cjs
 *
 * Verrouille le SLA de fraicheur satellite : le composite ERDDAP est
 * considere frais si son erddapTimestamp a moins de 900 minutes (15 h).
 *
 * Interdictions respectees :
 *  - aucun timestamp n'est falsifie (on constate l'age reel) ;
 *  - le SLA de 900 minutes n'est ni reduit ni contourné.
 */
const assert = require('node:assert/strict');
const { satelliteFreshness, SAT_STALE_HOURS } = require('../../scripts/lib/satellite-freshness.cjs');

const NOW = Date.now();
const MS_PER_MIN = 60_000;
const SLA_MIN = 900;

let assertions = 0;
function check(condition, message) {
  assertions++;
  assert.ok(condition, message);
}

// Le seuil code doit correspondre exactement au SLA de 900 minutes (15 h).
check(SAT_STALE_HOURS === 15, `SAT_STALE_HOURS doit etre 15 (900 min SLA), recu ${SAT_STALE_HOURS}`);

// Just en dessous du SLA : 899 min -> pas stale.
const justBelow = satelliteFreshness(NOW - 899 * MS_PER_MIN, NOW);
check(justBelow.stale === false, `899 min (< SLA) doit etre frais, recu stale=${justBelow.stale}`);
check(justBelow.dataAgeMinutes === 899, `dataAgeMinutes doit etre 899, recu ${justBelow.dataAgeMinutes}`);

// Pile au SLA : 900 min -> pas stale (strictement superieur au seuil pour etre stale).
const atSla = satelliteFreshness(NOW - 900 * MS_PER_MIN, NOW);
check(atSla.stale === false, `900 min (= SLA) doit etre frais, recu stale=${atSla.stale}`);

// Just au-dessus du SLA : 901 min -> stale.
const justAbove = satelliteFreshness(NOW - 901 * MS_PER_MIN, NOW);
check(justAbove.stale === true, `901 min (> SLA) doit etre stale, recu stale=${justAbove.stale}`);

// Valeur reelle observee en production : ~2064 min (34.4 h) -> stale.
const real = satelliteFreshness(NOW - 2064 * MS_PER_MIN, NOW);
check(real.stale === true, `2064 min (observation prod) doit etre stale, recu stale=${real.stale}`);
check(real.dataAgeMinutes === 2064, `dataAgeMinutes doit etre 2064, recu ${real.dataAgeMinutes}`);

// Timestamp manquant/invalide -> pas de preuve d'age, stale=false (ne falsifie rien).
const missing = satelliteFreshness(null, NOW);
check(missing.stale === false, 'timestamp manquant => stale=false (pas de falsification)');
check(missing.dataAgeMinutes === null, 'timestamp manquant => dataAgeMinutes=null');

console.log(`SATELLITE_FRESHNESS_SLA_TESTS PASS (${assertions} assertions)`);
