'use strict';

/**
 * satellite-freshness-sla.test.cjs
 *
 * Verrouille le SLA opérationnel de fraîcheur satellite : l'observation ERDDAP
 * est considérée fraîche pour les briefs clients tant que son `erddapTimestamp`
 * a moins de 900 minutes (15 h).
 *
 * Contrat appliqué (celui de `main`, qui a supersédé la version 15 h de cette
 * branche) :
 *   - `SAT_STALE_HOURS = 36`  → marqueur PUBLIC « stale » (affichage client) ;
 *   - `OPERATIONAL_SLA_MINUTES = 900` → SLA OPÉRATIONNEL (briefs, e-mails,
 *     landings hôtel, index legacy) : fail-closed au-delà ;
 *   - timestamp manquant / invalide / futur → fail-closed (`stale: true`).
 *
 * Interdictions respectées :
 *  - aucun timestamp n'est falsifié (on constate l'âge réel) ;
 *  - le SLA de 900 minutes n'est ni réduit ni contourné.
 */
const assert = require('node:assert/strict');
const {
  satelliteFreshness,
  operationalSatelliteFreshness,
  SAT_STALE_HOURS,
  OPERATIONAL_SLA_MINUTES,
} = require('../../scripts/lib/satellite-freshness.cjs');

const NOW = Date.now();
const MS_PER_MIN = 60_000;
const SLA_MIN = 900;

let assertions = 0;
function check(condition, message) {
  assertions++;
  assert.ok(condition, message);
}

// --- Le SLA opérationnel est bien de 900 minutes (15 h) --------------------
check(OPERATIONAL_SLA_MINUTES === SLA_MIN, `OPERATIONAL_SLA_MINUTES doit valoir ${SLA_MIN}, reçu ${OPERATIONAL_SLA_MINUTES}`);
check(SAT_STALE_HOURS === 36, `le marqueur public stale reste à 36 h, reçu ${SAT_STALE_HOURS}`);

// --- Seuil PUBLIC : 36 h, frontière inclusive ------------------------------
const publicBoundaryMs = SAT_STALE_HOURS * 60 * 60 * 1000;
check(
  satelliteFreshness(NOW - publicBoundaryMs, NOW).stale === true,
  'exactement 36 h est stale (frontière inclusive)'
);
check(
  satelliteFreshness(NOW - publicBoundaryMs + 1, NOW).stale === false,
  '1 ms avant la frontière 36 h n\'est pas stale'
);
check(
  satelliteFreshness(NOW - publicBoundaryMs - 1, NOW).stale === true,
  '1 ms après la frontière 36 h est stale'
);
check(
  satelliteFreshness(NOW - 720 * MS_PER_MIN, NOW).stale === false,
  'une observation de 12 h n\'est pas stale au sens public'
);

// --- Fail-closed sur timestamp inexistant / invalide / futur ----------------
for (const [label, ts] of [['manquant', null], ['invalide', 'not-a-date'], ['futur', new Date(NOW + 3600_000).toISOString()]]) {
  const res = satelliteFreshness(ts, NOW);
  check(res.dataAgeMinutes === null, `timestamp ${label} → âge inconnu`);
  check(res.stale === true, `timestamp ${label} → fail-closed (stale=true)`);
}

// --- SLA OPÉRATIONNEL : 900 min, fail-closed au-delà ------------------------
const live = (ageMinutes) => ({
  source: 'erddap-live',
  erddapTimestamp: new Date(NOW - ageMinutes * MS_PER_MIN).toISOString(),
  updatedAt: new Date(NOW).toISOString(),
});

check(operationalSatelliteFreshness(live(0), NOW).fresh === true, 'une observation fraîche passe le SLA');
check(operationalSatelliteFreshness(live(899), NOW).fresh === true, '899 min (< 900) reste frais');
check(operationalSatelliteFreshness(live(900), NOW).fresh === true, '900 min (= SLA) reste frais (frontière inclusive)');
check(operationalSatelliteFreshness(live(901), NOW).fresh === false, '901 min (> SLA) est hors SLA');
check(
  operationalSatelliteFreshness(live(901), NOW).reason === 'observation-outside-operational-sla',
  'le motif hors SLA est explicite'
);
check(operationalSatelliteFreshness(live(901), NOW).ageMinutes === 901, 'l\'âge opérationnel est recalculé depuis erddapTimestamp');

// --- Le SLA opérationnel ignore les métadonnées figées ----------------------
const lying = {
  source: 'erddap-live',
  erddapTimestamp: new Date(NOW - 2000 * MS_PER_MIN).toISOString(),
  updatedAt: new Date(NOW).toISOString(),
  dataAgeMinutes: 5,
  stale: false,
};
check(operationalSatelliteFreshness(lying, NOW).fresh === false, 'un dataAgeMinutes figé ne peut pas prouver la fraîcheur');
check(operationalSatelliteFreshness(lying, NOW).ageMinutes === 2000, 'l\'âge réel est recalculé, jamais repris du cache');

// --- Sources non live et horloge invalide : fail-closed --------------------
check(operationalSatelliteFreshness({ source: 'reference', erddapTimestamp: new Date(NOW).toISOString() }, NOW).fresh === false, 'une source non live n\'est jamais fraîche');
check(operationalSatelliteFreshness(live(10), Number.NaN).fresh === false, 'une horloge invalide fail-closed');
check(operationalSatelliteFreshness({ source: 'erddap-live', erddapTimestamp: null }, NOW).fresh === false, 'un timestamp manquant fail-closed');
check(operationalSatelliteFreshness({ source: 'erddap-live', erddapTimestamp: 'not-a-date' }, NOW).fresh === false, 'un timestamp invalide fail-closed');
// Observation POSTÉRIEURE à l'horloge de référence → fail-closed.
check(
  operationalSatelliteFreshness({ source: 'erddap-live', erddapTimestamp: new Date(NOW + 7200_000).toISOString() }, NOW).fresh === false,
  'une observation postérieure à now fail-closed'
);
// Une horloge en avance ne rend PAS une observation fraîche périmée : le contrat
// juge sur l'âge réel de l'observation (130 min < 900 min → frais).
check(
  operationalSatelliteFreshness(live(10), NOW + 7200_000).fresh === true,
  'une horloge en avance ne dégrade pas une observation réellement fraîche'
);

console.log(`SATELLITE_FRESHNESS_SLA_TESTS PASS (${assertions} assertions)`);
