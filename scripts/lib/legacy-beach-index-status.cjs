'use strict';

const { operationalSatelliteFreshness } = require('./satellite-freshness.cjs');

const VALID_STATUSES = new Set(['clean', 'moderate', 'avoid']);

function buildLegacyBeachIndexStatus(payload, sargToBeach = {}, now = Date.now()) {
  const freshness = operationalSatelliteFreshness(payload, now);
  const rawTimestamp = payload && payload.erddapTimestamp;
  const parsedTimestamp = typeof rawTimestamp === 'number'
    ? rawTimestamp
    : Date.parse(String(rawTimestamp ?? ''));
  const observationTimestamp = Number.isFinite(parsedTimestamp) && parsedTimestamp > 0 && parsedTimestamp <= now
    ? parsedTimestamp
    : null;

  if (!freshness.fresh) {
    return {
      available: false,
      reason: freshness.reason,
      ageMinutes: freshness.ageMinutes,
      observationTimestamp,
      validCount: 0,
      cleanCount: 0,
      statusByBeachId: {},
    };
  }

  const knownBeachIds = new Set(Object.values(sargToBeach));
  const statusByBeachId = {};
  for (const level of (Array.isArray(payload.levels) ? payload.levels : [])) {
    const id = String(level?.id ?? '').trim();
    const beachId = sargToBeach[id] || (knownBeachIds.has(id) ? id : null);
    const status = String(level?.status ?? '').toLowerCase();
    if (!beachId || !VALID_STATUSES.has(status)) continue;
    statusByBeachId[beachId] = status;
  }

  const statuses = Object.values(statusByBeachId);
  const validCount = statuses.length;
  return {
    available: validCount > 0,
    reason: validCount > 0 ? 'fresh-observation-with-valid-levels' : 'no-valid-beach-levels',
    ageMinutes: freshness.ageMinutes,
    observationTimestamp,
    validCount,
    cleanCount: statuses.filter(status => status === 'clean').length,
    statusByBeachId,
  };
}

module.exports = { buildLegacyBeachIndexStatus };
