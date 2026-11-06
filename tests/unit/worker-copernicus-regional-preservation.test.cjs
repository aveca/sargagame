#!/usr/bin/env node
'use strict';

// The edge freshness route must preserve each region's prepared scientific
// payload byte-for-byte at the JSON-value level. Only dataAgeMinutes/stale may
// change. Exercise the normal URL and a cache-busting query for every live
// host (regions flagged live in regions/; the pinned list is asserted below).

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const ROUTE = '/api/copernicus/sargassum.json';
const FIXED_NOW = Date.parse('2026-11-04T12:00:00.000Z');
// Contrat de régions LIVE : la liste est PINÉE ici (une région ajoutée,
// retirée ou passée non-live doit faire échouer ce test et forcer une revue
// explicite). Le registre `regions/` contient aussi des régions configurées
// mais non déployées (`live: false`, ex. barbados : pas de DNS, pas dans la
// allowlist CORS du Worker) : elles sont exclues des requêtes live mais
// restent validées strictement (voir le bloc d'assertions).
const EXPECTED_DOMAINS = {
  florida: 'sargassummiami.com',
  gp: 'sargasses-guadeloupe.com',
  mq: 'sargasses-martinique.com',
  puntacana: 'sargassumpuntacana.com',
  rivieramaya: 'sargassumcancun.com',
  tulum: 'sargazotulum.com',
};
const EXPECTED_IDS = Object.keys(EXPECTED_DOMAINS).sort();
const EXPECTED_REGION_COUNT = EXPECTED_IDS.length;

const { getAllRegions, assertAllRegionsValid } = require('../../regions/index.cjs');
const { filterCopernicusForIsland } = require('../../scripts/lib/regional-copernicus.cjs');
const { refreshSatellitePayload } = require('../../scripts/lib/satellite-freshness.cjs');

function readPreparedPayload(region) {
  // MQ/GP are packaged from the shared root asset and filtered by prepare-ftp.
  // The four USD regions copy their own regional asset to the domain root.
  const sourcePath = (region.id === 'mq' || region.id === 'gp')
    ? path.join(ROOT, 'public', 'api', 'copernicus', 'sargassum.json')
    : path.join(ROOT, 'public', 'api', 'copernicus', region.id, 'sargassum.json');

  const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  assert.equal(source.source, 'erddap-live', `${region.id}: fixture must be a live ERDDAP payload`);
  assert.ok(source.erddapTimestamp, `${region.id}: observation timestamp is required`);

  if (region.id === 'mq' || region.id === 'gp') {
    return filterCopernicusForIsland(
      source,
      (region.beachFilter && region.beachFilter.island) || region.id
    ).json;
  }
  return source;
}

function withoutFreshness(payload) {
  const copy = structuredClone(payload);
  delete copy.dataAgeMinutes;
  delete copy.stale;
  return copy;
}

async function fetchThroughWorker(worker, region, payload, search) {
  const origin = `https://${region.domain}`;
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
            headers: {
              'content-type': 'application/json',
              'cache-control': 'public, max-age=3600',
            },
          });
        },
      },
    }
  );

  return { response, forwarded, url, origin };
}

async function run() {
  const { default: worker } = await import('../../workers/sargagame/index.js');
  const originalNow = Date.now;
  Date.now = () => FIXED_NOW;

  try {
    // Validation STRICTE de TOUS les fichiers de région (y compris les
    // régions non live : une config cassée doit casser la CI). Le nombre de
    // fichiers vient du dossier lui-même — on ne fige ni 6 ni 7 ici.
    const regionFiles = fs.readdirSync(path.join(ROOT, 'regions'))
      .filter((file) => file.endsWith('.json') && !file.startsWith('_'));
    assert.equal(
      assertAllRegionsValid(),
      regionFiles.length,
      `all ${regionFiles.length} region config files must validate strictly`,
    );

    // Surface RÉELLEMENT servie par le Worker : les régions live. Le registre
    // marque `live: false` pour une région configurée mais pas déployée
    // (barbados : pas de DNS, pas dans la allowlist CORS du Worker). Elle est
    // donc exclue des 12 requêtes live — mais reste validée ci-dessus.
    const allRegions = getAllRegions();
    const regions = allRegions.filter((region) => region.live !== false);
    assert.deepEqual(regions.map((region) => region.id), EXPECTED_IDS);
    assert.equal(regions.length, EXPECTED_REGION_COUNT, 'live region count must match the pinned contract');
    const nonLive = allRegions.filter((region) => region.live === false);
    for (const region of nonLive) {
      assert.ok(!EXPECTED_IDS.includes(region.id), `${region.id}: a non-live region must not be in the live contract`);
      const result = await fetchThroughWorker(worker, region, readPreparedPayload(region), '');
      assert.equal(
        result.response.headers.get('access-control-allow-origin'),
        null,
        `${region.id}: a non-live region must not be granted CORS by the Worker`,
      );
    }

    let requestsChecked = 0;
    for (const region of regions) {
      assert.equal(region.domain, EXPECTED_DOMAINS[region.id], `${region.id}: domain contract`);
      const asset = readPreparedPayload(region);
      const expected = structuredClone(asset);
      refreshSatellitePayload(expected, FIXED_NOW);

      const outputs = [];
      for (const search of ['', '?sg_contract_cache_bust=1']) {
        const result = await fetchThroughWorker(worker, region, asset, search);
        assert.equal(result.response.status, 200, `${region.id}: HTTP status for ${search || 'normal'}`);
        assert.equal(result.response.headers.get('cache-control'), 'no-store');
        assert.equal(result.response.headers.get('access-control-allow-origin'), result.origin);
        assert.deepEqual(result.forwarded, [result.url], `${region.id}: Worker must forward the exact asset URL`);

        const actual = await result.response.json();
        assert.deepEqual(actual, expected, `${region.id}: only freshness metadata may be recalculated`);
        assert.deepEqual(
          withoutFreshness(actual),
          withoutFreshness(asset),
          `${region.id}: all scientific fields, beach IDs, forecasts, scores and timestamps are preserved`
        );
        assert.equal(actual.updatedAt, asset.updatedAt, `${region.id}: publication timestamp is immutable`);
        assert.equal(actual.erddapTimestamp, asset.erddapTimestamp, `${region.id}: observation timestamp is immutable`);
        outputs.push(actual);
        requestsChecked++;
      }
      assert.deepEqual(outputs[1], outputs[0], `${region.id}: cache-bust and normal responses must match`);
    }

    console.log(`WORKER_COPERNICUS_REGIONAL_PRESERVATION PASS (${regions.length} regions, ${requestsChecked} requests)`);
  } finally {
    Date.now = originalNow;
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
