#!/usr/bin/env node
'use strict';

// Fail-closed operational freshness gate for the actual satellite observation.
// The public "stale" marker remains a separate 36-hour display contract;
// deployment eligibility uses the strict 900-minute operational SLA.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const MAX_AGE_MINUTES = 900;

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

function main() {
  const regionId = process.env.VITE_REGION || process.env.REGION;
  const result = checkPreparedRegion(regionId);
  const prefix = `SATELLITE_PREDEPLOY region=${regionId || 'missing'} limit=${MAX_AGE_MINUTES}min`;
  if (!result.ok) {
    console.error(`FAIL ${prefix} reason=${result.reason}`);
    process.exitCode = 1;
    return;
  }
  console.log(`PASS ${prefix} age=${result.ageMinutes.toFixed(2)}min file=${result.file}`);
}
if (require.main === module) main();
module.exports = { MAX_AGE_MINUTES, evaluateObservation, checkPreparedRegion };
