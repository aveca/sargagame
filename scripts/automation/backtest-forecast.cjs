#!/usr/bin/env node
/**
 * Backtest Forecast — compare past predictions to actual observations
 *
 * Uses:
 *   - forecast-archive.json: saved daily forecast snapshots
 *   - history.json: actual satellite observations per day
 *
 * Computes per forecast horizon (day 1, 2, 3, etc.):
 *   - Status hit rate: did we predict the right status (clean/moderate/avoid)?
 *   - AFAI MAE: mean absolute error in AFAI prediction
 *   - Confidence calibration: are confidence scores meaningful?
 *
 * Outputs results to data/backtest-results.json
 *
 * Usage: node scripts/automation/backtest-forecast.cjs
 */
const fs = require('fs')
const path = require('path')

const ARCHIVE_PATH = path.join(__dirname, '../../public/api/copernicus/forecast-archive.json')
const HISTORY_PATH = path.join(__dirname, '../../public/api/copernicus/history.json')
const OUT_PATH = path.join(__dirname, 'data/backtest-results.json')

function loadJSON(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { return fallback }
}

function main() {
  console.log('=== Forecast Backtest ===')

  const archive = loadJSON(ARCHIVE_PATH, { snapshots: [] })
  const historyData = loadJSON(HISTORY_PATH, { history: [] })

  if (!archive.snapshots.length) {
    console.log('No forecast archive yet. Will accumulate over pipeline runs.')
    return
  }

  // Index history by date for O(1) lookup
  const historyByDate = {}
  for (const entry of historyData.history) {
    historyByDate[entry.date] = {}
    for (const l of entry.levels) {
      historyByDate[entry.date][l.id] = { afai: l.afai, status: l.status }
    }
  }

  // For each forecast snapshot, compare predictions to actual observations
  const results = {
    byHorizon: {}, // day 1, 2, 3... → { statusHits, total, afaiErrors, confSum }
    byBeach: {},   // beach id → { hits, total, avgError }
    pairs: [],     // all individual prediction-observation pairs (for debugging)
  }

  for (const snap of archive.snapshots) {
    const forecasts = snap.forecasts
    if (!forecasts) continue

    for (const [beachId, beachForecast] of Object.entries(forecasts)) {
      if (!beachForecast.forecast) continue

      for (const pred of beachForecast.forecast) {
        const horizon = pred.type === 'observation' ? 0 : parseInt(pred.day) || daysBetween(snap.date, pred.date)
        if (horizon === 0) continue // day 0 is observation, not a prediction

        // Find actual observation for the predicted date
        const actual = historyByDate[pred.date]?.[beachId]
        if (!actual) continue // no observation available yet

        const statusHit = pred.status === actual.status ? 1 : 0
        const afaiError = Math.abs(pred.afai - actual.afai)
        const conf = pred.confidence || 0

        // Aggregate by horizon
        const hKey = `day${horizon}`
        if (!results.byHorizon[hKey]) {
          results.byHorizon[hKey] = { hits: 0, total: 0, afaiErrors: [], confSum: 0 }
        }
        results.byHorizon[hKey].hits += statusHit
        results.byHorizon[hKey].total++
        results.byHorizon[hKey].afaiErrors.push(afaiError)
        results.byHorizon[hKey].confSum += conf

        // Aggregate by beach
        if (!results.byBeach[beachId]) {
          results.byBeach[beachId] = { hits: 0, total: 0, afaiErrors: [] }
        }
        results.byBeach[beachId].hits += statusHit
        results.byBeach[beachId].total++
        results.byBeach[beachId].afaiErrors.push(afaiError)

        results.pairs.push({
          snapshotDate: snap.date,
          targetDate: pred.date,
          beach: beachId,
          horizon,
          predicted: { afai: pred.afai, status: pred.status, confidence: conf },
          actual: { afai: actual.afai, status: actual.status },
          statusHit,
          afaiError: Math.round(afaiError * 1000) / 1000,
        })
      }
    }
  }

  // Compute summary metrics
  const summary = {
    totalPairs: results.pairs.length,
    archiveDays: archive.snapshots.length,
    historyDays: historyData.history.length,
    dateRange: {
      archiveFrom: archive.snapshots[0]?.date,
      archiveTo: archive.snapshots[archive.snapshots.length - 1]?.date,
    },
    byHorizon: {},
    byBeach: {},
  }

  console.log(`\nArchive: ${archive.snapshots.length} days | History: ${historyData.history.length} days`)
  console.log(`Prediction-observation pairs: ${results.pairs.length}`)

  if (results.pairs.length === 0) {
    console.log('\nNo overlapping forecast/observation pairs yet.')
    console.log('Need at least 2 days of archive + corresponding history observations.')
    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true })
    fs.writeFileSync(OUT_PATH, JSON.stringify({ ...summary, computed: new Date().toISOString() }, null, 2))
    return
  }

  console.log('\n--- By Horizon ---')
  for (const [hKey, data] of Object.entries(results.byHorizon).sort()) {
    const hitRate = Math.round(data.hits / data.total * 100)
    const mae = data.afaiErrors.reduce((a, b) => a + b, 0) / data.afaiErrors.length
    const avgConf = Math.round(data.confSum / data.total)

    summary.byHorizon[hKey] = {
      statusHitRate: hitRate,
      afaiMAE: Math.round(mae * 1000) / 1000,
      avgConfidence: avgConf,
      pairs: data.total,
    }

    const bar = hitRate >= 80 ? '+' : hitRate >= 60 ? '~' : '-'
    console.log(`  ${hKey}: ${hitRate}% status hit (${data.hits}/${data.total}) | MAE=${mae.toFixed(3)} | avgConf=${avgConf}% ${bar}`)
  }

  console.log('\n--- By Beach (top 5 worst) ---')
  for (const [beach, data] of Object.entries(results.byBeach)) {
    const hitRate = Math.round(data.hits / data.total * 100)
    const mae = data.afaiErrors.reduce((a, b) => a + b, 0) / data.afaiErrors.length
    summary.byBeach[beach] = {
      statusHitRate: hitRate,
      afaiMAE: Math.round(mae * 1000) / 1000,
      pairs: data.total,
    }
  }

  const worstBeaches = Object.entries(summary.byBeach)
    .sort((a, b) => a[1].statusHitRate - b[1].statusHitRate)
    .slice(0, 5)
  for (const [beach, data] of worstBeaches) {
    console.log(`  ${beach}: ${data.statusHitRate}% hit | MAE=${data.afaiMAE} (${data.pairs} pairs)`)
  }

  // Overall metrics
  const allHits = results.pairs.filter(p => p.statusHit).length
  const allMAE = results.pairs.reduce((s, p) => s + p.afaiError, 0) / results.pairs.length
  summary.overall = {
    statusHitRate: Math.round(allHits / results.pairs.length * 100),
    afaiMAE: Math.round(allMAE * 1000) / 1000,
  }

  console.log(`\nOverall: ${summary.overall.statusHitRate}% status accuracy | MAE=${summary.overall.afaiMAE}`)

  // Save results
  const output = { ...summary, computed: new Date().toISOString(), pairs: results.pairs.slice(-100) }
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true })
  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2))
  console.log(`\nResults saved to ${OUT_PATH}`)
}

function daysBetween(dateA, dateB) {
  const a = new Date(dateA)
  const b = new Date(dateB)
  return Math.round((b - a) / (1000 * 60 * 60 * 24))
}

main()
