#!/usr/bin/env node
'use strict';

// Last-moment gate before a data commit. A recent updatedAt is not a new
// observation; only actual ERDDAP observation timestamps satisfy the SLA.
const fs = require('node:fs');
const path = require('node:path');
const { getAllRegions } = require('../../regions/index.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const PAYLOAD_PATH = path.join(ROOT, 'public', 'api', 'copernicus', 'sargassum.json');
const MAX_AGE_MINUTES = 900;

function evaluatePayload(payload, now = Date.now(), label = 'root') {
  if (!payload || payload.source !== 'erddap-live') {
    return { ok: false, reason: 'source ERDDAP live non prouvée', ageMinutes: null, erddapTimestamp: null, label };
  }
  const erddapTimestamp = String(payload.erddapTimestamp ?? '');
  const observedAt = Date.parse(erddapTimestamp);
  if (!Number.isFinite(observedAt) || observedAt <= 0) {
    return { ok: false, reason: 'erddapTimestamp absent ou invalide', ageMinutes: null, erddapTimestamp, label };
  }
  if (!Number.isFinite(now) || now <= 0) {
    return { ok: false, reason: 'horloge de contrôle invalide', ageMinutes: null, erddapTimestamp, label };
  }
  const ageMinutes = (now - observedAt) / 60_000;
  if (ageMinutes < 0) {
    return { ok: false, reason: 'erddapTimestamp dans le futur', ageMinutes, erddapTimestamp, label };
  }
  if (ageMinutes > MAX_AGE_MINUTES) {
    return { ok: false, reason: `observation hors SLA (${ageMinutes.toFixed(6)} min > ${MAX_AGE_MINUTES} min)`, ageMinutes, erddapTimestamp, label };
  }
  return { ok: true, reason: 'observation dans le SLA', ageMinutes, erddapTimestamp, label };
}

function evaluatePayloadSet(rootPayload, regionalPayloads, now = Date.now()) {
  const checks = [evaluatePayload(rootPayload, now, 'root')];
  const regions = Array.isArray(regionalPayloads) ? regionalPayloads : [];
  if (!regions.length) {
    checks.push({ ok: false, reason: 'payloads régionaux absents', ageMinutes: null, erddapTimestamp: null, label: 'regions' });
  } else {
    for (const region of regions) {
      checks.push(evaluatePayload(region?.payload ?? null, now, region?.id || 'region-inconnue'));
    }
  }
  const failed = checks.filter(check => !check.ok);
  const finiteAges = checks.map(check => check.ageMinutes).filter(Number.isFinite);
  return {
    ok: failed.length === 0,
    reason: failed.length ? failed.map(check => `${check.label}: ${check.reason}`).join('; ') : 'tous les payloads dans le SLA',
    ageMinutes: finiteAges.length ? Math.max(...finiteAges) : null,
    erddapTimestamp: rootPayload?.erddapTimestamp ?? null,
    failedRegions: failed.map(check => check.label),
    checks,
  };
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function readPayloadSet() {
  const regionalPayloads = getAllRegions().map(region => ({
    id: region.id,
    payload: readJson(path.join(ROOT, 'public', 'api', 'copernicus', region.id, 'sargassum.json')),
  }));
  return {
    root: readJson(PAYLOAD_PATH),
    regionalPayloads,
  };
}

function main() {
  const payloads = readPayloadSet();
  const result = evaluatePayloadSet(payloads.root, payloads.regionalPayloads);
  const age = Number.isFinite(result.ageMinutes) ? result.ageMinutes.toFixed(6) : '999999';
  const fresh = result.ok ? 'true' : 'false';
  const output = process.env.GITHUB_OUTPUT;
  if (output) {
    fs.appendFileSync(output, `fresh=${fresh}\nsatellite_age_minutes=${age}\nerddap_timestamp=${result.erddapTimestamp || ''}\nfailed_regions=${result.failedRegions.join(',')}\n`);
  }
  console.log(`PUBLISH_SATELLITE_FRESHNESS fresh=${fresh} maxAgeMinutes=${age} limit=${MAX_AGE_MINUTES} regions=${result.checks.length - 1} reason=${result.reason}`);
  if (!result.ok) console.warn('Publication différée : aucun payload satellite ne doit être committé.');
}

if (require.main === module) main();

module.exports = { MAX_AGE_MINUTES, evaluatePayload, evaluatePayloadSet, readPayloadSet };
