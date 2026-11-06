#!/usr/bin/env node
'use strict';
/**
 * Repro DÉTERMINISTE du défaut de fraîcheur observé en production.
 *
 * Constat mesuré (sonde HTTP en lecture seule, 2026-11-04) sur l'API publique
 * Punta Cana — https://sargassumpuntacana.com/api/copernicus/sargassum.json :
 *
 *   source          = erddap-live
 *   erddapTimestamp = 2026-10-27T12:00:00Z   <- observation scientifique
 *   updatedAt       = 2026-10-28T17:29:55.323Z  <- publication
 *   dataAgeMinutes  = 1772                    <- figé à la publication
 *   stale           = false                   <- figé à la publication
 *   cache-control   = public, max-age=0, must-revalidate
 *
 * Les deux métadonnées de fraîcheur sont donc FIGÉES depuis la publication :
 * elles décrivent l'âge de l'observation AU MOMENT DE LA PUBLICATION, pas
 * l'âge au moment de la lecture. Un payload servi plusieurs jours plus tard
 * continue donc d'annoncer `stale: false` alors que l'observation a 8 jours :
 * le client voit un signal de fraîcheur rassurant qui ne correspond plus à la
 * donnée. C'est exactement le mismatch à reproduire.
 *
 * Ce test :
 *  1. reproduit le mismatch de façon déterministe (horloge figée) ;
 *  2. prouve que la route Worker recalcule dataAgeMinutes ET stale depuis
 *     erddapTimestamp, sans toucher à l'observation ni au reste du contrat ;
 *  3. verrouille les seuils : 36 h (marqueur public) et 900 min (SLA
 *     opérationnel) — aucun des deux ne doit être abaissé ni modifié ;
 *  4. refuse toute âge inventé (horodatage absent / invalide / futur).
 *
 * Aucune observation n'est inventée : l'horodatage utilisé est celui mesuré
 * en production. Les horloges synthétiques servent uniquement à explorer les
 * frontières de seuil.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const ROUTE = '/api/copernicus/sargassum.json';

// Instant de référence : aligné sur la sonde de production et sur le test de
// préservation régionale (même horloge → résultats reproductibles).
const FIXED_NOW = Date.parse('2026-11-04T12:00:00.000Z');

// Payload mesuré en production (Punta Cana). Seules les métadonnées de
// fraîcheur sont figées ; les champs scientifiques sont repris du dépôt.
const PRODUCTION_OBSERVATION = {
  source: 'erddap-live',
  updatedAt: '2026-10-28T17:29:55.323Z',
  erddapTimestamp: '2026-10-27T12:00:00Z',
  dataAgeMinutes: 1772,
  stale: false,
};

const PUBLIC_STALE_HOURS = 36;
const OPERATIONAL_SLA_MINUTES = 900;

const { satelliteFreshness, refreshSatellitePayload, operationalSatelliteFreshness } =
  require('../../scripts/lib/satellite-freshness.cjs');
const { getAllRegions } = require('../../regions/index.cjs');

function readRegionalAsset(regionId) {
  const sourcePath = (regionId === 'mq' || regionId === 'gp')
    ? path.join(ROOT, 'public', 'api', 'copernicus', 'sargassum.json')
    : path.join(ROOT, 'public', 'api', 'copernicus', regionId, 'sargassum.json');
  return JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
}

function scientificSnapshot(payload) {
  const copy = structuredClone(payload);
  delete copy.dataAgeMinutes;
  delete copy.stale;
  return copy;
}

async function fetchThroughWorker(worker, origin, payload, search = '') {
  const url = `${origin}${ROUTE}${search}`;
  const forwarded = [];
  const response = await worker.fetch(
    new Request(url, { headers: { Origin: origin } }),
    {
      ASSETS: {
        fetch: async (request) => {
          forwarded.push(request.url);
          return new Response(JSON.stringify(payload), {
            status: 200,
            headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=0, must-revalidate' },
          });
        },
      },
    },
  );
  return { response, forwarded, url };
}

async function run() {
  const { default: worker } = await import('../../workers/sargagame/index.js');
  const originalNow = Date.now;
  Date.now = () => FIXED_NOW;

  const checks = [];
  const check = (name, fn) => { checks.push(name); return fn(); };

  try {
    const trueAgeMinutes = Math.round((FIXED_NOW - Date.parse(PRODUCTION_OBSERVATION.erddapTimestamp)) / 60_000);

    // ── 1. REPRODUCTION du mismatch observé en production ────────────────
    await check('mismatch production reproduit de façon déterministe', () => {
      const served = { ...PRODUCTION_OBSERVATION };

      // Ce que l'API publique servait : des métadonnées figées à la publication.
      assert.equal(served.dataAgeMinutes, 1772, 'the served payload carries the frozen age');
      assert.equal(served.stale, false, 'the served payload still advertises a fresh observation');

      // Ce que l'observation autorise réellement à l'instant de la lecture.
      const truth = satelliteFreshness(served.erddapTimestamp, FIXED_NOW);
      assert.equal(truth.dataAgeMinutes, trueAgeMinutes, 'the true age differs from the frozen age');
      assert.ok(truth.dataAgeMinutes > served.dataAgeMinutes, 'the frozen age understates the real age');
      assert.equal(truth.stale, true, 'the true public marker must be stale beyond 36h');
      assert.notEqual(served.stale, truth.stale, 'REPRODUCED: served stale flag contradicts the observation');
    });

    // ── 2. CORRECTION par la route Worker ─────────────────────────────────
    await check('la route Worker recalcule dataAgeMinutes ET stale', async () => {
      const served = { ...PRODUCTION_OBSERVATION, levels: [{ id: 'mq016', status: 'clean', score: 67 }] };
      const origin = 'https://sargassumpuntacana.com';
      const { response, forwarded } = await fetchThroughWorker(worker, origin, served);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store',
        'the freshness route must not be cached with the stale asset');
      assert.deepEqual(forwarded, [`${origin}${ROUTE}`]);

      const body = await response.json();
      assert.equal(body.dataAgeMinutes, trueAgeMinutes, 'age must be recomputed from erddapTimestamp');
      assert.equal(body.stale, true, 'the public stale marker must be recomputed');
      assert.equal(body.erddapTimestamp, PRODUCTION_OBSERVATION.erddapTimestamp, 'observation timestamp is immutable');
      assert.equal(body.updatedAt, PRODUCTION_OBSERVATION.updatedAt, 'publication timestamp is immutable');
      assert.deepEqual(scientificSnapshot(body), scientificSnapshot(served), 'scientific fields are untouched');
    });

    // ── 3. L'âge vient de erddapTimestamp, jamais de la valeur stockée ────
    await check('dataAgeMinutes est dérivé de erddapTimestamp, pas de la valeur stockée', async () => {
      const served = {
        source: 'erddap-live',
        updatedAt: PRODUCTION_OBSERVATION.updatedAt,
        erddapTimestamp: new Date(FIXED_NOW - 5 * 60_000).toISOString(),
        dataAgeMinutes: 999999,
        stale: true,
      };
      const { response } = await fetchThroughWorker(worker, 'https://sargassummiami.com', served);
      const body = await response.json();
      assert.equal(body.dataAgeMinutes, 5, 'the stored age must be ignored');
      assert.equal(body.stale, false, 'the stored stale flag must be ignored');
    });

    // ── 4. Seuils : 36 h public + 900 min opérationnel (inchangés) ─────────
    await check('le seuil public de 36 h reste exact (et n\'est pas abaissé)', async () => {
      const justUnder = new Date(FIXED_NOW - (PUBLIC_STALE_HOURS * 60 - 1) * 60_000).toISOString();
      const exactly = new Date(FIXED_NOW - PUBLIC_STALE_HOURS * 60 * 60_000).toISOString();

      const under = await fetchThroughWorker(worker, 'https://sargazotulum.com', {
        source: 'erddap-live', erddapTimestamp: justUnder, updatedAt: PRODUCTION_OBSERVATION.updatedAt,
      });
      const underBody = await (await under.response).json();
      assert.equal(underBody.stale, false, 'just under 36h is not stale');
      assert.equal(underBody.dataAgeMinutes, PUBLIC_STALE_HOURS * 60 - 1);

      const exact = await fetchThroughWorker(worker, 'https://sargazotulum.com', {
        source: 'erddap-live', erddapTimestamp: exactly, updatedAt: PRODUCTION_OBSERVATION.updatedAt,
      });
      const exactBody = await (await exact.response).json();
      assert.equal(exactBody.stale, true, 'exactly 36h is stale (>= boundary)');
      assert.equal(exactBody.dataAgeMinutes, PUBLIC_STALE_HOURS * 60);
    });

    await check('le SLA opérationnel de 900 minutes reste inchangé', () => {
      assert.equal(OPERATIONAL_SLA_MINUTES, 900, 'the operational SLA must stay at 900 minutes');
      const atSla = operationalSatelliteFreshness({
        source: 'erddap-live',
        erddapTimestamp: new Date(FIXED_NOW - 900 * 60_000).toISOString(),
      }, FIXED_NOW);
      assert.equal(atSla.fresh, true, '900 minutes is still fresh');
      assert.equal(atSla.reason, 'within-operational-sla');
      const pastSla = operationalSatelliteFreshness({
        source: 'erddap-live',
        erddapTimestamp: new Date(FIXED_NOW - 901 * 60_000).toISOString(),
      }, FIXED_NOW);
      assert.equal(pastSla.fresh, false, '901 minutes is not fresh');
      assert.equal(pastSla.reason, 'observation-outside-operational-sla');
    });

    // ── 5. Jamais d'âge inventé ────────────────────────────────────────────
    for (const [label, erddapTimestamp] of [
      ['horodatage manquant', undefined],
      ['horodatage invalide', 'not-a-date'],
      ['horodatage futur', new Date(FIXED_NOW + 60_000).toISOString()],
    ]) {
      await check(`fail-closed : ${label} → âge inconnu, stale=true`, async () => {
        const served = { source: 'erddap-live', updatedAt: PRODUCTION_OBSERVATION.updatedAt };
        if (erddapTimestamp !== undefined) served.erddapTimestamp = erddapTimestamp;
        const { response } = await fetchThroughWorker(worker, 'https://sargasses-martinique.com', served);
        const body = await response.json();
        assert.equal(body.dataAgeMinutes, null, 'no age may be invented');
        assert.equal(body.stale, true, 'an unverifiable observation is stale');
      });
    }

    await check('fail-closed : source non erddap-live → âge inconnu, stale=true', async () => {
      const { response } = await fetchThroughWorker(worker, 'https://sargasses-guadeloupe.com', {
        source: 'fallback',
        erddapTimestamp: PRODUCTION_OBSERVATION.erddapTimestamp,
        updatedAt: PRODUCTION_OBSERVATION.updatedAt,
        dataAgeMinutes: 5,
        stale: false,
      });
      const body = await response.json();
      assert.equal(body.dataAgeMinutes, null);
      assert.equal(body.stale, true);
    });

    // ── 6. Cache-bust : métadonnées identiques ────────────────────────────
    await check('cache-bust et requête normale renvoient les mêmes métadonnées', async () => {
      const served = { ...PRODUCTION_OBSERVATION };
      const origin = 'https://sargassumpuntacana.com';
      const normal = await fetchThroughWorker(worker, origin, served, '');
      const busted = await fetchThroughWorker(worker, origin, served, '?sg_contract_cache_bust=1');
      const normalBody = await normal.response.json();
      const bustedBody = await busted.response.json();
      assert.deepEqual(bustedBody, normalBody);
    });

    // ── 7. Aucune région ne doit annoncer une observation périmée ────────
    await check('les régions live ne signalent jamais une observation périmée comme fraîche', async () => {
      const liveRegions = getAllRegions().filter((region) => region.live !== false);
      assert.ok(liveRegions.length > 0, 'at least one live region');
      for (const region of liveRegions) {
        const asset = readRegionalAsset(region.id);
        assert.equal(asset.source, 'erddap-live', `${region.id}: fixture must be a live payload`);
        // Observation mesurée en production (pas inventée) + publication du dépôt.
        const served = { ...asset, erddapTimestamp: PRODUCTION_OBSERVATION.erddapTimestamp };
        const origin = `https://${region.domain}`;
        const { response } = await fetchThroughWorker(worker, origin, served);
        const body = await response.json();
        assert.equal(body.stale, true, `${region.id}: an 8-day-old observation must not be advertised as fresh`);
        assert.equal(body.dataAgeMinutes, trueAgeMinutes, `${region.id}: age must match the observation`);
        assert.equal(body.erddapTimestamp, PRODUCTION_OBSERVATION.erddapTimestamp, `${region.id}: observation immutable`);
      }
    });

    // ── 8. Le contrat de fraîcheur reste mono-source ──────────────────────
    await check('refreshSatellitePayload ne touche que dataAgeMinutes et stale', () => {
      const payload = {
        source: 'erddap-live',
        updatedAt: PRODUCTION_OBSERVATION.updatedAt,
        erddapTimestamp: PRODUCTION_OBSERVATION.erddapTimestamp,
        dataAgeMinutes: 1772,
        stale: false,
        levels: [{ id: 'mq016', status: 'clean', score: 67 }],
      };
      const before = scientificSnapshot(payload);
      refreshSatellitePayload(payload, FIXED_NOW);
      assert.deepEqual(scientificSnapshot(payload), before);
      assert.equal(payload.dataAgeMinutes, trueAgeMinutes);
      assert.equal(payload.stale, true);
    });

    console.log(`WORKER_COPERNICUS_FRESHNESS_METADATA_RECALC PASS (${checks.length} checks, FIXED_NOW=${new Date(FIXED_NOW).toISOString()})`);
    for (const name of checks) console.log(`  ✓ ${name}`);
  } finally {
    Date.now = originalNow;
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
