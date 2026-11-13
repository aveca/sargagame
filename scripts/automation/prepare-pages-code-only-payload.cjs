#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { getRegion } = require('../../regions/index.cjs');
const { refreshSatellitePayload, satelliteFreshness } = require('../lib/satellite-freshness.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const METADATA_FIELDS = new Set(['dataAgeMinutes', 'stale']);

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}

function dataSignature(payload) {
  const copy = { ...payload };
  for (const key of METADATA_FIELDS) delete copy[key];
  return JSON.stringify(canonical(copy));
}

/**
 * Build a code-only payload from the exact currently served production payload.
 * Only dataAgeMinutes/stale may change. Observation values, forecasts, source,
 * erddapTimestamp and updatedAt are copied byte-for-byte at the JSON value level.
 */
function preparePayload(livePayload, now = Date.now()) {
  if (!livePayload || typeof livePayload !== 'object' || Array.isArray(livePayload)) {
    throw new Error('live payload must be a JSON object');
  }
  const payload = structuredClone(livePayload);
  if (payload.source === 'erddap-live') {
    refreshSatellitePayload(payload, now);
  } else {
    // Unknown/fallback sources can never be presented as current.
    payload.dataAgeMinutes = null;
    payload.stale = true;
  }
  if (dataSignature(payload) !== dataSignature(livePayload)) {
    throw new Error('code-only payload changed a non-metadata field');
  }
  return payload;
}

async function main() {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--region');
  const regionId = idx >= 0 ? args[idx + 1] : process.env.VITE_REGION || process.env.REGION;
  if (!regionId) throw new Error('Usage: node scripts/automation/prepare-pages-code-only-payload.cjs --region <id>');

  const region = getRegion(regionId);
  if (!region.domain || !region.ftpDir) throw new Error('region domain/ftpDir missing: ' + regionId);

  const url = 'https://' + region.domain + '/api/copernicus/sargassum.json';
  const response = await fetch(url, {
    headers: { accept: 'application/json', 'cache-control': 'no-cache', pragma: 'no-cache', 'user-agent': 'Sargagame-Pages-Code-Only-Release/1.0' },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error('live payload fetch failed for ' + regionId + ': HTTP ' + response.status);
  const livePayload = await response.json();
  const payload = preparePayload(livePayload);

  const output = path.join(ROOT, region.ftpDir, 'api', 'copernicus', 'sargassum.json');
  if (!fs.existsSync(path.dirname(output))) {
    throw new Error('prepared regional API directory missing: ' + path.dirname(output));
  }
  fs.writeFileSync(output, JSON.stringify(payload), 'utf8');

  const written = JSON.parse(fs.readFileSync(output, 'utf8'));
  if (dataSignature(written) !== dataSignature(livePayload)) {
    throw new Error('prepared payload differs from current production data for ' + regionId);
  }
  if (written.source === 'erddap-live') {
    const expected = satelliteFreshness(written.erddapTimestamp);
    if (written.dataAgeMinutes !== expected.dataAgeMinutes) throw new Error('dataAgeMinutes not recomputed for ' + regionId);
    if (written.stale !== expected.stale) throw new Error('stale marker not recomputed for ' + regionId);
  } else if (written.stale !== true || written.dataAgeMinutes !== null) {
    throw new Error('non-live source must be marked stale/unknown for ' + regionId);
  }

  console.log(JSON.stringify({
    region: regionId,
    domain: region.domain,
    source: written.source || 'unknown',
    erddapTimestamp: written.erddapTimestamp || null,
    dataAgeMinutes: written.dataAgeMinutes,
    stale: written.stale,
    nonMetadataFieldsPreserved: true,
    output: path.relative(ROOT, output),
  }));
}

if (require.main === module) {
  main().catch(error => {
    console.error('PAGES_CODE_ONLY_PAYLOAD_FAIL: ' + error.message);
    process.exitCode = 1;
  });
}

module.exports = { METADATA_FIELDS, dataSignature, preparePayload };
