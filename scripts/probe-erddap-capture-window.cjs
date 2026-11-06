'use strict';

// Read-only ERDDAP capture-window probe.
// It samples the same Martinique sentinel bbox used by the production fetcher,
// reads the 7D and 1D observation timestamps, and NEVER writes forecast payloads.
const { getRegion } = require('../regions/index.cjs');

const SLA_MINUTES = 900;
const TIMEOUT_MS = 45000;
const DATASETS = [
  {
    id: 'AFAI_7D',
    url: 'https://cwcgom.aoml.noaa.gov/erddap/griddap/noaa_aoml_atlantic_oceanwatch_AFAI_7D.json',
  },
  {
    id: 'AFAI_1D',
    url: 'https://cwcgom.aoml.noaa.gov/erddap/griddap/noaa_aoml_atlantic_oceanwatch_AFAI_1D.json',
  },
];

function dataBboxFor(region) {
  if (!Array.isArray(region?.bbox) || region.bbox.length !== 4) {
    throw new Error('region bbox must be [lngMin, latMin, lngMax, latMax]');
  }
  const [lngMin, latMin, lngMax, latMax] = region.bbox;
  const round = (value) => Math.round(value * 100) / 100;
  return {
    latMin: round(latMin - 0.8),
    latMax: round(latMax + 0.8),
    lngMin: round(lngMin - 0.7),
    lngMax: round(lngMax + 1.2),
  };
}

function buildErddapUrl(datasetUrl, bbox) {
  return datasetUrl + '?AFAI[(last)][(' + bbox.latMin + '):(' + bbox.latMax + ')][(' + bbox.lngMin + '):(' + bbox.lngMax + ')]';
}

function parseErddapTable(payload) {
  const table = payload?.table;
  if (!table || !Array.isArray(table.columnNames) || !Array.isArray(table.rows)) {
    return { ok: false, reason: 'missing-table' };
  }

  const timeIndex = table.columnNames.indexOf('time');
  if (timeIndex < 0) return { ok: false, reason: 'missing-time-column' };

  for (const row of table.rows) {
    if (!Array.isArray(row)) continue;
    const raw = row[timeIndex];
    if (raw === null || raw === undefined || String(raw).trim() === '') continue;
    const timestampMs = Date.parse(String(raw));
    if (!Number.isFinite(timestampMs) || timestampMs <= 0) {
      return { ok: false, reason: 'invalid-time-value' };
    }
    return { ok: true, timestamp: String(raw), timestampMs };
  }

  return { ok: false, reason: 'missing-time-value' };
}

function evaluateObservation(timestamp, nowMs = Date.now()) {
  const timestampMs = typeof timestamp === 'number'
    ? timestamp
    : Date.parse(String(timestamp ?? ''));

  if (!Number.isFinite(timestampMs) || timestampMs <= 0) {
    return { ok: false, reason: 'invalid-or-missing-timestamp', ageMinutes: null, status: 'UNKNOWN' };
  }
  if (!Number.isFinite(nowMs) || nowMs <= 0 || timestampMs > nowMs) {
    return { ok: false, reason: 'invalid-clock-or-future-timestamp', ageMinutes: null, status: 'UNKNOWN' };
  }

  const ageMs = nowMs - timestampMs;
  const ageMinutes = Math.floor(ageMs / 60000);
  const withinSla = ageMs <= SLA_MINUTES * 60000;
  return {
    ok: true,
    ageMinutes,
    withinSla,
    status: withinSla ? 'WITHIN_SLA' : 'OUTSIDE_SLA',
  };
}

async function probeDataset(dataset, region, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const nowMs = options.nowMs ?? Date.now();
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  const bbox = dataBboxFor(region);
  const url = buildErddapUrl(dataset.url, bbox);

  if (typeof fetchImpl !== 'function') {
    return { ok: false, dataset: dataset.id, region: region.id, reason: 'fetch-unavailable' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response?.ok) {
      return {
        ok: false,
        dataset: dataset.id,
        region: region.id,
        reason: 'http-' + (response?.status ?? 'unknown'),
      };
    }

    const parsed = parseErddapTable(await response.json());
    if (!parsed.ok) {
      return { ok: false, dataset: dataset.id, region: region.id, reason: parsed.reason };
    }

    return {
      dataset: dataset.id,
      region: region.id,
      timestamp: parsed.timestamp,
      ...evaluateObservation(parsed.timestamp, nowMs),
    };
  } catch (error) {
    return {
      ok: false,
      dataset: dataset.id,
      region: region.id,
      reason: error?.name === 'AbortError' ? 'timeout' : 'request-failed: ' + (error?.message || 'unknown'),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const region = getRegion('mq');
  const checkedAt = new Date().toISOString();
  const results = await Promise.all(DATASETS.map((dataset) => probeDataset(dataset, region)));

  console.log('ERDDAP capture-window monitor | checkedAt=' + checkedAt + ' | sentinel=' + region.id + ' | SLA=' + SLA_MINUTES + 'm');
  console.log('Read-only: GET requests only; no payload writes, commits, FTP, Pages, Worker, or production dispatch.');
  for (const result of results) {
    if (!result.ok) {
      console.error(result.dataset + ': UNKNOWN (' + result.reason + ')');
      continue;
    }
    const line = result.dataset + ': ' + result.timestamp + ' | age=' + result.ageMinutes + 'm | ' + result.status;
    console.log(line);
    if (!result.withinSla) console.log('::warning title=' + result.dataset + ' outside SLA::' + line);
  }

  if (results.some((result) => !result.ok)) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error('ERDDAP probe failed: ' + (error?.message || error));
    process.exitCode = 1;
  });
}

module.exports = {
  SLA_MINUTES,
  DATASETS,
  dataBboxFor,
  buildErddapUrl,
  parseErddapTable,
  evaluateObservation,
  probeDataset,
};
