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
// Backward-compatible export: the operational SLA stays 900 minutes.
const MAX_PUBLISHABLE_MINUTES = MAX_AGE_MINUTES;
// A newer legitimate observation can be deployed for 7 days when the site
// shows its date and says the satellite data is not current. Beyond 7 days,
// or older than the observation already published, it stays blocked.
const MAX_LABELED_STALE_MINUTES = 7 * 24 * 60;
const STALE_NOTICES = [
  'donnée satellite non actualisée',
  'satellite data not updated',
  'dato satelital no actualizado'
];

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
    const age = base.ageMinutes;
    const labeled = options.allowLabeledStale === true
      && Number.isFinite(age)
      && age > MAX_AGE_MINUTES
      && age <= MAX_LABELED_STALE_MINUTES
      && !isOlderThanPrevious;
    if (labeled) {
      return {
        ...base,
        publishable: true,
        withinOperationalSla: false,
        labeledStale: true,
        isNewerThanPrevious,
        reason: 'observation au-delà du SLA opérationnel, avec date et mention non actualisée'
      };
    }
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

function htmlShowsStaleObservation(html, erddapTimestamp) {
  const text = String(html || '');
  const day = String(erddapTimestamp || '').slice(0, 10);
  const hasNotice = STALE_NOTICES.some((notice) => text.toLowerCase().includes(notice));
  const hasDay = /^\d{4}-\d{2}-\d{2}$/.test(day) && text.includes(day);
  return { ok: hasNotice && hasDay, hasNotice, hasDay };
}

function preparedSiteShowsStaleObservation(ftpDir, erddapTimestamp) {
  const files = ['index.html', 'offres/index.html', 'pro/pricing/index.html', 'merci/index.html'];
  let html = '';
  for (const rel of files) {
    const file = path.resolve(String(ftpDir || ''), rel);
    if (fs.existsSync(file)) html += '\n' + fs.readFileSync(file, 'utf8');
  }
  return htmlShowsStaleObservation(html, erddapTimestamp);
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
    previousTimestamp: liveTs,
    allowLabeledStale: true
  });
  if (eligibility.labeledStale) {
    const notice = preparedSiteShowsStaleObservation(path.dirname(path.dirname(path.dirname(path.resolve(ROOT, result.file)))), payload.erddapTimestamp);
    if (!notice.ok) {
      console.error(`FAIL ${prefix} reason=étiquette de donnée non actualisée absente du site préparé`);
      process.exitCode = 1;
      return;
    }
  }
  if (!eligibility.publishable) {
    console.error(`FAIL ${prefix} reason=${eligibility.reason}`);
    process.exitCode = 1;
    return;
  }
  console.log(`PASS ${prefix} age=${eligibility.ageMinutes.toFixed(2)}min withinOperationalSla=${eligibility.withinOperationalSla === true} labeledStale=${eligibility.labeledStale === true} publishable=true liveRef=${liveTs || 'unavailable'} file=${result.file}`);
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
  MAX_LABELED_STALE_MINUTES,
  evaluateObservation,
  evaluatePublicationEligibility,
  evaluateFleetPublicationEligibility,
  htmlShowsStaleObservation,
  preparedSiteShowsStaleObservation,
  readLiveObservationTimestamp,
  checkPreparedRegion
};
