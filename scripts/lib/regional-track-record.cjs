'use strict'

/**
 * Resolve the public validation record for a regional methodology page.
 *
 * The track record is an aggregate over its declared region scope. It must not
 * be presented as a per-beach or per-region metric, and stale records must not
 * be rendered as current accuracy claims.
 */
function resolvePublicAccuracy(record, regionId) {
  const region = String(regionId ?? '').trim().toLowerCase()
  const scopeRegions = Array.isArray(record?.regions)
    ? [...new Set(record.regions.map(value => String(value ?? '').trim().toLowerCase()).filter(Boolean))]
    : []
  const window = record?.window && typeof record.window === 'object'
    ? { from: record.window.from ?? null, to: record.window.to ?? null }
    : null
  const rawSampleSize = Number(record?.sampleSize)
  const sampleSize = Number.isFinite(rawSampleSize) && rawSampleSize > 0 ? rawSampleSize : null
  const scopeLabel = scopeRegions.length > 1
    ? scopeRegions.map(value => value.toUpperCase()).join(' + ')
    : scopeRegions.length === 1 ? scopeRegions[0].toUpperCase() : null
  const recordStale = record ? record.freshness?.stale !== false : true
  const unavailable = reason => ({
    available: false,
    reason,
    scopeRegions,
    scopeLabel,
    window,
    sampleSize,
    recordStale,
  })

  if (!record || typeof record !== 'object') return unavailable('missing-record')
  if (!region) return unavailable('invalid-region')
  if (!scopeRegions.includes(region)) return unavailable('region-not-covered')
  if (recordStale) return unavailable('stale')

  const horizons = Array.isArray(record.byHorizon) ? record.byHorizon : []
  const day1 = horizons.find(item => Number(item?.day) === 1)
  const day3 = horizons.find(item => Number(item?.day) === 3)
  const validRate = value => Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100
  const validPairs = value => Number.isFinite(Number(value)) && Number(value) > 0
  if (!sampleSize || !day1 || !day3 ||
      !validRate(day1.hitRatePct) || !validRate(day3.hitRatePct) ||
      !validPairs(day1.pairs) || !validPairs(day3.pairs) ||
      !window?.from || !window?.to) {
    return unavailable('incomplete-record')
  }

  const meanAbsErr = Number(record.overall?.afaiMAE)
  return {
    available: true,
    reason: null,
    scopeRegions,
    scopeLabel,
    window,
    sampleSize,
    recordStale: false,
    horizons: {
      'J+1': {
        statusMatchPct: Number(day1.hitRatePct),
        meanAbsErr: Number.isFinite(meanAbsErr) ? meanAbsErr : null,
        pairs: Number(day1.pairs),
      },
      'J+3': {
        statusMatchPct: Number(day3.hitRatePct),
        meanAbsErr: Number.isFinite(meanAbsErr) ? meanAbsErr : null,
        pairs: Number(day3.pairs),
      },
    },
  }
}

module.exports = { resolvePublicAccuracy }
