#!/usr/bin/env node
'use strict';

// Fail-closed operational freshness gate for the actual satellite observation.
// The public "stale" marker remains a separate 36-hour display contract;
// deployment eligibility uses the strict 900-minute operational SLA.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const MAX_AGE_MINUTES = 900;
const PUBLIC_STALE_MINUTES = 2160;
// Backward-compatible export: publication has no grace window beyond the 900-minute SLA.
const MAX_PUBLISHABLE_MINUTES = MAX_AGE_MINUTES;

function evaluateObservation(erddapTimestamp, now = Date.now()) {
  const observedAt = Date.parse(String(erddapTimestamp ?? ''));
  if (!Number.isFinite(observedAt) || observedAt <= 0) {
    return { ok: false, reason: 'erddapTimestamp absent ou invalide', ageMinutes: null };
  }
  if (!Number.isFinite(now) || now <= 0) {
    return { ok: false, reason: 'horloge de contrôle invalide', ageMinutes: null };
  }
  const ageMinutes = (now - observedAt) / 60000;
  if (ageMinutes < 0) {
    return { ok: false, reason: 'erddapTimestamp est dans le futur', ageMinutes };
  }
  if (ageMinutes > MAX_AGE_MINUTES) {
    return { ok: false, reason: `observation hors SLA (${ageMinutes.toFixed(2)} min > ${MAX_AGE_MINUTES} min)`, ageMinutes };
  }
  return { ok: true, reason: 'observation dans le SLA', ageMinutes };
}

// Publication is allowed only inside the strict operational 900-minute SLA.
// A newer observation does not become publishable merely because it improves
// on an older live/repository reference.
function evaluatePublicationEligibility(erddapTimestamp, options = {}) {
  const now = options.now ?? Date.now();
  const previousTimestamp = options.previousTimestamp ?? null;
  const base = evaluateObservation(erddapTimestamp, now);
  const observedAt = Date.parse(String(erddapTimestamp ?? ''));
  const prevAt = previousTimestamp == null || previousTimestamp === ''
    ? NaN
    : Date.parse(String(previousTimestamp));
  const isNewerThanPrevious = Number.isFinite(prevAt) && Number.isFinite(observedAt)
    ? observedAt > prevAt
    : null;
  const isOlderThanPrevious = Number.isFinite(prevAt) && Number.isFinite(observedAt)
    ? observedAt < prevAt
    : false;

  if (!Number.isFinite(observedAt) || observedAt <= 0) {
    return { ...base, publishable: false, withinOperationalSla: false, isNewerThanPrevious };
  }
  if (!Number.isFinite(now) || now <= 0) {
    return { ...base, publishable: false, withinOperationalSla: false, isNewerThanPrevious };
  }
  if (!base.ok) {
    return { ...base, publishable: false, withinOperationalSla: false, isNewerThanPrevious };
  }
  if (isOlderThanPrevious) {
    return {
      ...base,
      publishable: false,
      withinOperationalSla: true,
      isNewerThanPrevious: false,
      reason: `observation plus ancienne que la référence (${erddapTimestamp} < ${previousTimestamp})`
    };
  }
  return {
    ...base,
    publishable: true,
    withinOperationalSla: true,
    isNewerThanPrevious,
    publicStale: base.ageMinutes >= PUBLIC_STALE_MINUTES,
    reason: base.reason
  };
}

// A production release is atomic across the six configured regions: one missing,
// invalid, stale, or otherwise ineligible region blocks the entire fleet.
function evaluateFleetPublicationEligibility(regionResults, expectedCount = 6) {
  const results = Array.isArray(regionResults) ? regionResults : [];
  const blocked = results.filter(result => !result || result.publishable !== true);
  return {
    publishable: results.length === expectedCount && blocked.length === 0,
    checked: results.length,
    expected: expectedCount,
    blockedRegions: blocked.map(result => result && result.regionId ? result.regionId : 'unknown')
  };
}

function readLiveObservationTimestamp(domain, fetchImpl = globalThis.fetch) {
  if (!domain || typeof fetchImpl !== 'function') return Promise.resolve(null);
  const url = `https://${domain}/api/copernicus/sargassum.json`;
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), 5000) : null;
  return fetchImpl(url, ctrl ? { signal: ctrl.signal, headers: { 'user-agent': 'sargagame-predeploy-freshness' } } : {})
    .then(async (res) => {
      if (!res || !res.ok) return null;
      const data = await res.json();
      return typeof data.erddapTimestamp === 'string' ? data.erddapTimestamp : null;
    })
    .catch(() => null)
    .finally(() => { if (timer) clearTimeout(timer); });
}

function checkPreparedRegion(regionId, now = Date.now()) {
  if (!regionId) return { ok: false, reason: 'identifiant de région absent', ageMinutes: null };
  let region;
  try {
    region = require('../../regions/index.cjs').getRegion(regionId);
  } catch (error) {
    return { ok: false, reason: `région invalide: ${error.message}`, ageMinutes: null };
  }
  const file = path.resolve(ROOT, region.ftpDir, 'api', 'copernicus', 'sargassum.json');
  if (!fs.existsSync(file)) return { ok: false, reason: `payload préparé absent: ${path.relative(ROOT, file)}`, ageMinutes: null };
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return { ok: false, reason: `payload préparé JSON invalide: ${error.message}`, ageMinutes: null };
  }
  if (!payload || payload.source !== 'erddap-live') return { ok: false, reason: 'source satellite non prouvée comme erddap-live', ageMinutes: null };
  return { ...evaluateObservation(payload.erddapTimestamp, now), regionId, file: path.relative(ROOT, file) };
}

async function main() {
  const regionId = process.env.VITE_REGION || process.env.REGION;
  const result = checkPreparedRegion(regionId);
  const prefix = `SATELLITE_PREDEPLOY region=${regionId || 'missing'} limit=${MAX_AGE_MINUTES}min`;
  if (!result.file) {
    console.error(`FAIL ${prefix} reason=${result.reason}`);
    process.exitCode = 1;
    return;
  }
  let payload = null;
  try {
    payload = JSON.parse(fs.readFileSync(path.resolve(ROOT, result.file), 'utf8'));
  } catch (error) {
    console.error(`FAIL ${prefix} reason=payload illisible: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  let liveTs = null;
  try {
    const region = require('../../regions/index.cjs').getRegion(regionId);
    liveTs = await readLiveObservationTimestamp(region && region.domain);
  } catch {}
  const eligibility = evaluatePublicationEligibility(payload && payload.erddapTimestamp, {
    previousTimestamp: liveTs
  });
  if (!eligibility.publishable) {
    console.error(`FAIL ${prefix} reason=${eligibility.reason}`);
    process.exitCode = 1;
    return;
  }
  if (!eligibility.withinOperationalSla) {
    console.warn(`WARN ${prefix} operational SLA exceeded but deploy allowed (better than live or within 7-day publish window): ${eligibility.reason || result.reason}`);
  }
  console.log(`PASS ${prefix} age=${eligibility.ageMinutes.toFixed(2)}min publishable=true liveRef=${liveTs || 'unavailable'} file=${result.file}`);
}
if (require.main === module) {
  Promise.resolve(main()).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
module.exports = {
  MAX_AGE_MINUTES,
  PUBLIC_STALE_MINUTES,
  MAX_PUBLISHABLE_MINUTES,
  evaluateObservation,
  evaluatePublicationEligibility,
  evaluateFleetPublicationEligibility,
  readLiveObservationTimestamp,
  checkPreparedRegion
};
