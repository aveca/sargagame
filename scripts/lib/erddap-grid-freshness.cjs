'use strict'

const { satelliteFreshness } = require('./satellite-freshness.cjs')

/**
 * Return the first non-empty ERDDAP time value from a tabular response.
 * Keep the raw value so the freshness validator can fail closed on invalid dates.
 */
function extractFirstErddapTimestamp(rows, timeIndex) {
  if (!Array.isArray(rows) || !Number.isInteger(timeIndex) || timeIndex < 0) return null
  for (const row of rows) {
    if (Array.isArray(row) && row[timeIndex] !== null && row[timeIndex] !== undefined && row[timeIndex] !== '') {
      return row[timeIndex]
    }
  }
  return null
}

/**
 * Validate a 7D ERDDAP timestamp and calculate its real age.
 * Missing, invalid, future, or invalid-clock values are UNKNOWN; callers must
 * not invent a 24-hour age or score a grid without a verifiable observation time.
 * A valid but old timestamp is returned with its actual age; the independent
 * 900-minute release gate decides whether that candidate may be published.
 */
function getErddapGridAge(erddapTimestamp, now = Date.now()) {
  if (erddapTimestamp === null || erddapTimestamp === undefined || String(erddapTimestamp).trim() === '') {
    return { ok: false, reason: 'missing-timestamp', dataAgeHours: null }
  }
  const timestamp = typeof erddapTimestamp === 'number'
    ? erddapTimestamp
    : Date.parse(String(erddapTimestamp))
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return { ok: false, reason: 'invalid-timestamp', dataAgeHours: null }
  }
  if (!Number.isFinite(now) || now <= 0) {
    return { ok: false, reason: 'invalid-clock', dataAgeHours: null }
  }
  if (timestamp > now) {
    return { ok: false, reason: 'future-timestamp', dataAgeHours: null }
  }
  return {
    ok: true,
    reason: 'valid',
    dataAgeHours: (now - timestamp) / (1000 * 60 * 60),
  }
}

/**
 * The 1D correction is usable only when the grid has points and its source
 * timestamp passes the shared public freshness validator (36h boundary).
 */
function get1DGridFreshness(grid1D, now = Date.now()) {
  if (!grid1D || !Array.isArray(grid1D.points) || grid1D.points.length === 0) {
    return { fresh: false, reason: 'missing-grid', dataAgeMinutes: null }
  }
  if (grid1D.erddapTimestamp === null || grid1D.erddapTimestamp === undefined || grid1D.erddapTimestamp === '') {
    return { fresh: false, reason: 'missing-timestamp', dataAgeMinutes: null }
  }

  const freshness = satelliteFreshness(grid1D.erddapTimestamp, now)
  if (freshness.stale || freshness.dataAgeMinutes === null) {
    return {
      fresh: false,
      reason: freshness.dataAgeMinutes === null ? 'invalid-or-future-timestamp' : 'stale',
      dataAgeMinutes: freshness.dataAgeMinutes,
    }
  }
  return { fresh: true, reason: 'fresh', dataAgeMinutes: freshness.dataAgeMinutes }
}

module.exports = { extractFirstErddapTimestamp, getErddapGridAge, get1DGridFreshness }
