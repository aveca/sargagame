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

module.exports = { extractFirstErddapTimestamp, get1DGridFreshness }
