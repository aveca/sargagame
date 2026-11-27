'use strict'

;(function (root, factory) {
  var api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  if (root) root.SargagameB2BFreshness = api
})(typeof window !== 'undefined' ? window : globalThis, function () {
  var OBSERVATION_STALE_AFTER_MS = 36 * 60 * 60 * 1000
  var TRACK_RECORD_MAX_AGE_MS = 36 * 60 * 60 * 1000

  function parseTimestamp(value) {
    if (typeof value === 'number') return value
    if (typeof value !== 'string' || !value.trim()) return NaN
    return Date.parse(value)
  }

  function getObservationFreshness(data, locale, now) {
    locale = locale === 'fr' || locale === 'es' ? locale : 'en'
    now = Number.isFinite(now) ? now : Date.now()
    var observedAt = parseTimestamp(data && data.erddapTimestamp)
    if (!data || data.source !== 'erddap-live' || !Number.isFinite(observedAt) || observedAt <= 0 || observedAt > now) {
      return { status: 'unknown', timestamp: null, ageMs: null, label: locale === 'fr' ? 'Fraîcheur satellite inconnue' : (locale === 'es' ? 'Frescura satelital desconocida' : 'Satellite freshness unknown') }
    }
    var ageMs = now - observedAt
    var ageHours = Math.max(1, Math.round(ageMs / 3600000))
    var stale = data.stale === true || ageMs >= OBSERVATION_STALE_AFTER_MS
    var label = locale === 'fr'
      ? (stale ? 'Observation satellite ancienne' : 'Observation satellite') + ' · il y a ' + ageHours + ' h'
      : (locale === 'es'
        ? (stale ? 'Observación satelital antigua' : 'Observación satelital') + ' · hace ' + ageHours + ' h'
        : (stale ? 'Satellite observation is old' : 'Satellite observation') + ' · ' + ageHours + ' h ago')
    return { status: stale ? 'stale' : 'fresh', timestamp: observedAt, ageMs: ageMs, label: label }
  }

  function getTrackRecordState(record, regionId, now) {
    var region = String(regionId || '').trim().toLowerCase()
    now = Number.isFinite(now) ? now : Date.now()
    var regions = Array.isArray(record && record.regions)
      ? Array.from(new Set(record.regions.map(function (value) { return String(value || '').trim().toLowerCase() }).filter(Boolean)))
      : []
    var generatedAt = parseTimestamp(record && record.generatedAt)
    var window = record && record.window && typeof record.window === 'object' ? record.window : null
    var rawSampleSize = Number(record && record.sampleSize)
    var sampleSize = Number.isFinite(rawSampleSize) && rawSampleSize > 0 ? rawSampleSize : null
    var scopeLabel = regions.map(function (value) { return value.toUpperCase() }).join(' + ')
    var reason = null
    if (!record || typeof record !== 'object') reason = 'missing-record'
    else if (!region || !regions.includes(region)) reason = 'region-not-covered'
    else if (!record.freshness || record.freshness.stale !== false) reason = 'stale-record'
    else if (!Number.isFinite(generatedAt) || generatedAt <= 0 || generatedAt > now) reason = 'invalid-generated-at'
    else if (now - generatedAt > TRACK_RECORD_MAX_AGE_MS) reason = 'expired-record'
    else if (!window || !window.from || !window.to || !sampleSize) reason = 'incomplete-record'
    return {
      available: reason === null,
      reason: reason,
      scopeRegions: regions,
      scopeLabel: scopeLabel || null,
      generatedAt: Number.isFinite(generatedAt) ? generatedAt : null,
      windowLabel: window && window.from && window.to ? String(window.from) + ' → ' + String(window.to) : null,
      sampleSize: sampleSize
    }
  }

  return {
    OBSERVATION_STALE_AFTER_MS: OBSERVATION_STALE_AFTER_MS,
    TRACK_RECORD_MAX_AGE_MS: TRACK_RECORD_MAX_AGE_MS,
    getObservationFreshness: getObservationFreshness,
    getTrackRecordState: getTrackRecordState
  }
})
