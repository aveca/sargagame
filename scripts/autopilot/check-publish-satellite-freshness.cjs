#!/usr/bin/env node
'use strict';

// Last-moment gate before a data commit. A recent updatedAt is not a new
// observation; only the actual ERDDAP observation timestamp satisfies the SLA.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const PAYLOAD_PATH = path.join(ROOT, 'public', 'api', 'copernicus', 'sargassum.json');
const MAX_AGE_MINUTES = 900;

function evaluatePayload(payload, now = Date.now()) {
  if (!payload || payload.source !== 'erddap-live') {
    return { ok: false, reason: 'source ERDDAP live non prouvée', ageMinutes: null, erddapTimestamp: null };
  }
  const erddapTimestamp = String(payload.erddapTimestamp ?? '');
  const observedAt = Date.parse(erddapTimestamp);
  if (!Number.isFinite(observedAt) || observedAt <= 0) {
    return { ok: false, reason: 'erddapTimestamp absent ou invalide', ageMinutes: null, erddapTimestamp };
  }
  if (!Number.isFinite(now) || now <= 0) {
    return { ok: false, reason: 'horloge de contrôle invalide', ageMinutes: null, erddapTimestamp };
  }
  const ageMinutes = (now - observedAt) / 60_000;
  if (ageMinutes < 0) {
    return { ok: false, reason: 'erddapTimestamp dans le futur', ageMinutes, erddapTimestamp };
  }
  if (ageMinutes > MAX_AGE_MINUTES) {
    return { ok: false, reason: `observation hors SLA (${ageMinutes.toFixed(6)} min > ${MAX_AGE_MINUTES} min)`, ageMinutes, erddapTimestamp };
  }
  return { ok: true, reason: 'observation dans le SLA', ageMinutes, erddapTimestamp };
}

function readPayload(file = PAYLOAD_PATH) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function main() {
  const result = evaluatePayload(readPayload());
  const age = Number.isFinite(result.ageMinutes) ? result.ageMinutes.toFixed(6) : '999999';
  const fresh = result.ok ? 'true' : 'false';
  const output = process.env.GITHUB_OUTPUT;
  if (output) {
    fs.appendFileSync(output, `fresh=${fresh}\nsatellite_age_minutes=${age}\nerddap_timestamp=${result.erddapTimestamp || ''}\n`);
  }
  const line = `PUBLISH_SATELLITE_FRESHNESS fresh=${fresh} ageMinutes=${age} limit=${MAX_AGE_MINUTES} reason=${result.reason}`;
  console.log(line);
  if (!result.ok) console.warn('Publication différée : aucun payload satellite ne doit être committé.');
}

if (require.main === module) main();

module.exports = { MAX_AGE_MINUTES, evaluatePayload, readPayload };
