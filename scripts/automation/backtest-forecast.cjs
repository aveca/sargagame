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
const { buildHonestForecast } = require('../lib/forecast.cjs')
const { classifyRegime } = require('../lib/confidence.cjs')

const ARCHIVE_PATH = path.join(__dirname, '../../public/api/copernicus/forecast-archive.json')
const HISTORY_PATH = path.join(__dirname, '../../public/api/copernicus/history.json')
const BANKS_PATH = path.join(__dirname, '../../public/api/copernicus/sargassum-banks.json')
const OUT_PATH = path.join(__dirname, 'data/backtest-results.json')
const REGIME_OUT_PATH = path.join(__dirname, 'data/backtest-regime.json')

function loadJSON(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { return fallback }
}

function isAlertStatus(s) { return s === 'moderate' || s === 'avoid' }

// Shift an ISO date (YYYY-MM-DD) by N days, UTC-safe. Used to anchor the rolling
// publication window. Off-by-one here would mis-state the public window, so it is
// guarded in --selftest.
function isoShift(iso, days) {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// The PUBLISHED reliability is computed over a rolling recent window, not the
// whole append-only archive. Why: the forecast-archive grows unbounded, so a
// past stretch of mistakes (e.g. the pre-2026-06-14 calm over-prediction) would
// otherwise dilute the public moat number FOREVER. Windowing makes the figure
// self-healing (old snapshots age out) and binds it to a recent period — exactly
// what regimeReliability.note already mandates. The on-disk archive is NEVER
// trimmed (audit trail stays intact); we only window at read/compute time.
const PUBLISH_WINDOW_DAYS = 30

// Beach geo metadata — mirrors BEACHES in scripts/fetch-sargassum-live.cjs (kept
// here so the re-forecast harness has no cross-module side effects). Only used by
// the --reforecast mode. If you add/move a beach there, mirror it here.
const BEACHES_META = [
  { id: 'grande-anse',    lat: 14.5028, lng: -61.0856, island: 'mq', coast: 'atlantic',  coastNormal: 200 },
  { id: 'anse-mitan',     lat: 14.5523, lng: -61.0552, island: 'mq', coast: 'sheltered', coastNormal: 270 },
  { id: 'anse-noire',     lat: 14.5277, lng: -61.0874, island: 'mq', coast: 'sheltered', coastNormal: 270 },
  { id: 'tartane',        lat: 14.7507, lng: -60.9257, island: 'mq', coast: 'atlantic',  coastNormal: 80 },
  { id: 'anse-madame',    lat: 14.6178, lng: -61.1036, island: 'mq', coast: 'sheltered', coastNormal: 270 },
  { id: 'diamant',        lat: 14.4758, lng: -61.0314, island: 'mq', coast: 'atlantic',  coastNormal: 210 },
  { id: 'pt-marin',       lat: 14.4511, lng: -60.8836, island: 'mq', coast: 'atlantic',  coastNormal: 160 },
  { id: 'sainte-anne',    lat: 14.4305, lng: -60.8850, island: 'mq', coast: 'atlantic',  coastNormal: 170 },
  { id: 'les-salines',    lat: 14.3959, lng: -60.8690, island: 'mq', coast: 'atlantic',  coastNormal: 180 },
  { id: 'vauclin',        lat: 14.5414, lng: -60.8292, island: 'mq', coast: 'atlantic',  coastNormal: 110 },
  { id: 'gp-grande-anse', lat: 16.1312, lng: -61.7682, island: 'gp', coast: 'sheltered', coastNormal: 270 },
  { id: 'gp-malendure',   lat: 16.1721, lng: -61.7767, island: 'gp', coast: 'sheltered', coastNormal: 270 },
  { id: 'gp-sainte-anne', lat: 16.2226, lng: -61.3828, island: 'gp', coast: 'atlantic',  coastNormal: 170 },
  { id: 'gp-pt-chateaux', lat: 16.2531, lng: -61.2307, island: 'gp', coast: 'atlantic',  coastNormal: 90 },
  { id: 'gp-gosier',      lat: 16.2048, lng: -61.4948, island: 'gp', coast: 'atlantic',  coastNormal: 180 },
  { id: 'gp-caravelle',   lat: 16.2181, lng: -61.3965, island: 'gp', coast: 'atlantic',  coastNormal: 170 },
  { id: 'gp-bas-du-fort', lat: 16.2140, lng: -61.5237, island: 'gp', coast: 'atlantic',  coastNormal: 200 },
  { id: 'gp-deshaies',    lat: 16.3054, lng: -61.7951, island: 'gp', coast: 'sheltered', coastNormal: 290 },
  { id: 'gp-moule',       lat: 16.4222, lng: -61.5337, island: 'gp', coast: 'atlantic',  coastNormal: 60 },
  { id: 'gp-vieux-fort',  lat: 16.2488, lng: -61.1428, island: 'gp', coast: 'atlantic',  coastNormal: 130 },
]

/**
 * Index history.json into { beachId: [{date, afai}] } sorted ascending, for
 * trailing-window regime classification.
 */
function indexObsByBeach(history) {
  const obs = {}
  for (const e of history) {
    for (const l of (e.levels || [])) {
      (obs[l.id] = obs[l.id] || []).push({ date: e.date, afai: l.afai })
    }
  }
  for (const id in obs) obs[id].sort((a, b) => a.date.localeCompare(b.date))
  return obs
}

/**
 * Classify a beach's regime AS OF a date — trailing 7-day mean of actual
 * observed AFAI (only info available when the forecast was issued). Mirrors the
 * runtime regime definition in confidence.classifyRegime.
 */
function regimeAsOf(obsByBeach, beachId, asOfDate) {
  const obs = (obsByBeach[beachId] || []).filter(o => o.date <= asOfDate).slice(-7)
  if (obs.length < 3) return 'unknown'
  const mean = obs.reduce((s, o) => s + o.afai, 0) / obs.length
  const day0 = obs[obs.length - 1].afai
  return classifyRegime(mean, day0)
}

/**
 * Tally a (regime × predicted-status) reliability + false-alarm table from a
 * flat list of prediction-observation pairs. This is the AUDIT-PROOF view: it
 * NEVER collapses regimes into one number.
 */
function regimeTable(pairs) {
  const cells = {}   // "regime|ALERT|clean" → { n, hit }
  const byRegime = {} // regime → { n, hit, falseAlarm, actClean }
  for (const p of pairs) {
    const predAlert = isAlertStatus(p.predicted.status)
    const actAlert = isAlertStatus(p.actual.status)
    const dir = predAlert ? 'ALERT' : 'clean'
    const key = `${p.regime}|${dir}`
    const c = cells[key] = cells[key] || { n: 0, hit: 0 }
    c.n++; if (p.statusHit) c.hit++
    const r = byRegime[p.regime] = byRegime[p.regime] || { n: 0, hit: 0, falseAlarm: 0, actClean: 0 }
    r.n++; if (p.statusHit) r.hit++
    if (!actAlert) { r.actClean++; if (predAlert) r.falseAlarm++ }
  }
  return { cells, byRegime }
}

function printRegimeTable(label, pairs) {
  const { cells, byRegime } = regimeTable(pairs)
  console.log(`\n--- Per-Regime (${label}) — honest split, never a masking global ---`)
  for (const [reg, d] of Object.entries(byRegime).sort()) {
    const hit = Math.round(d.hit / d.n * 100)
    const faRate = d.actClean ? Math.round(d.falseAlarm / d.actClean * 100) : 0
    console.log(`  ${reg.padEnd(11)} n=${String(d.n).padStart(4)} | hit=${hit}% | false-alarm rate (alert|actual-clean)=${faRate}% (${d.falseAlarm}/${d.actClean})`)
  }
  console.log('  reliability by (regime × predicted-direction):')
  for (const [key, c] of Object.entries(cells).sort()) {
    console.log(`    ${key.padEnd(18)} n=${String(c.n).padStart(4)} reliability=${Math.round(c.hit / c.n * 100)}%`)
  }
  return { cells, byRegime }
}

/**
 * Render-ready per-regime reliability block for the APP + SEO/methodology pages.
 * This is the HONEST replacement for a single global "X% justes": it states
 * reliability conditioned on each beach's own regime, split by predicted
 * direction (clean vs alert). Consumed by region-seo-pages.cjs / the app; shaped
 * so a page can render a one-liner without recomputing anything.
 *
 * @param {object} cells - from regimeTable: { "regime|ALERT"|"regime|clean": {n,hit} }
 * @param {object} byRegime - from regimeTable: { regime: {n,hit,falseAlarm,actClean} }
 * @param {string} method - 'archive' (real deployed forecasts) | 'reforecast' (current code, banks proxy)
 * @param {{from?: string, to?: string}} [window] - observation window the numbers cover (binds the public claim to its period)
 */
function buildRegimeReliabilitySummary(cells, byRegime, method, window) {
  const win = window && window.from && window.to ? `${window.from} → ${window.to}` : null
  const regimes = {}
  for (const [reg, d] of Object.entries(byRegime)) {
    const cleanCell = cells[`${reg}|clean`]
    const alertCell = cells[`${reg}|ALERT`]
    regimes[reg] = {
      samples: d.n,
      cleanReliabilityPct: cleanCell ? Math.round(cleanCell.hit / cleanCell.n * 100) : null,
      cleanSamples: cleanCell ? cleanCell.n : 0,
      alertReliabilityPct: alertCell ? Math.round(alertCell.hit / alertCell.n * 100) : null,
      alertSamples: alertCell ? alertCell.n : 0,
      falseAlarmRatePct: d.actClean ? Math.round(d.falseAlarm / d.actClean * 100) : null,
    }
  }
  // Headline keys off the calm regime (the dominant one in low season) and states
  // the defensible, sellable, TRUE claim: clean-water calls are highly reliable.
  // Framed PAST-TENSE with the sample size (auditable; not a forward guarantee) —
  // and always paired with the honest alert caveat so it never reads as a
  // one-sided marketing number.
  const calm = regimes.calm
  let headline = null
  if (calm && calm.cleanReliabilityPct != null && calm.cleanSamples >= 20) {
    const c = calm.cleanReliabilityPct
    const n = calm.cleanSamples
    const frWin = win ? ` (saison calme, ${win})` : ' en saison calme'
    const enWin = win ? ` (calm season, ${win})` : ' in calm season'
    const esWin = win ? ` (temporada tranquila, ${win})` : ' en temporada tranquila'
    headline = {
      fr: `${c}% de nos prévisions « mer propre »${frWin} se sont vérifiées (sur ${n}) ; les rares alertes restent signalées à faible confiance tant que la donnée ne les confirme pas.`,
      en: `${c}% of our "clean water" forecasts${enWin} proved correct (over ${n}); the rare alerts stay flagged low-confidence until the data confirms them.`,
      es: `El ${c}% de nuestros pronósticos de "agua limpia"${esWin} resultaron correctos (sobre ${n}); las raras alertas se marcan con baja confianza hasta que el dato las confirma.`,
    }
  }
  return {
    note: 'Reliability conditioned on each beach\'s OWN recent regime (calm/transition/high), split by predicted direction. Publish THIS, never a single global %, which blends regimes and hides that calm-season ALERTS are far less reliable than calm-season CLEAN calls. Always bind the figure to its window; for the freshest current-model number cite the reforecast output, not the archive blend.',
    method,
    window: win,
    regimes,
    headline,
  }
}

function main() {
  console.log('=== Forecast Backtest ===')

  const archive = loadJSON(ARCHIVE_PATH, { snapshots: [] })
  const historyData = loadJSON(HISTORY_PATH, { history: [] })

  if (!archive.snapshots.length) {
    console.log('No forecast archive yet. Will accumulate over pipeline runs.')
    return
  }

  // Apply the rolling publication window. Anchor it to the LATEST snapshot date
  // (not wall-clock now) so a momentarily stalled pipeline still produces a
  // coherent window rather than an empty one.
  const allSnaps = archive.snapshots
  const latestDate = allSnaps.reduce((m, s) => (s.date > m ? s.date : m), allSnaps[0].date)
  const windowCutoff = isoShift(latestDate, -(PUBLISH_WINDOW_DAYS - 1))
  const snapshots = allSnaps.filter(s => s.date >= windowCutoff)
  console.log(`Publication window: last ${PUBLISH_WINDOW_DAYS}d → ${windowCutoff}..${latestDate} (${snapshots.length}/${allSnaps.length} snapshots; archive kept whole on disk)`)

  // Index history by date for O(1) lookup
  const historyByDate = {}
  for (const entry of historyData.history) {
    historyByDate[entry.date] = {}
    for (const l of entry.levels) {
      historyByDate[entry.date][l.id] = { afai: l.afai, status: l.status }
    }
  }
  // Per-beach observation series for regime classification.
  const obsByBeach = indexObsByBeach(historyData.history)

  // For each forecast snapshot, compare predictions to actual observations
  const results = {
    byHorizon: {}, // day 1, 2, 3... → { statusHits, total, afaiErrors, confSum }
    byBeach: {},   // beach id → { hits, total, avgError }
    pairs: [],     // all individual prediction-observation pairs (for debugging)
  }

  for (const snap of snapshots) {
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
          regime: regimeAsOf(obsByBeach, beachId, snap.date),
          predicted: { afai: pred.afai, status: pred.status, confidence: conf },
          actual: { afai: actual.afai, status: actual.status },
          statusHit,
          afaiError: Math.round(afaiError * 1000) / 1000,
        })
      }
    }
  }

  // Lifetime audit figure — computed over the WHOLE archive (never windowed), so
  // the public record still discloses the full sample size and all-time accuracy.
  // The headline / per-regime numbers below use the rolling window; this is the
  // secondary "since we started measuring" line. Cheap second pass (count only).
  let lifePairs = 0, lifeHits = 0
  for (const snap of allSnaps) {
    if (!snap.forecasts) continue
    for (const [beachId, bf] of Object.entries(snap.forecasts)) {
      if (!bf.forecast) continue
      for (const pred of bf.forecast) {
        const horizon = pred.type === 'observation' ? 0 : (parseInt(pred.day) || daysBetween(snap.date, pred.date))
        if (horizon === 0) continue
        const actual = historyByDate[pred.date]?.[beachId]
        if (!actual) continue
        lifePairs++; if (pred.status === actual.status) lifeHits++
      }
    }
  }

  // Compute summary metrics. dateRange / archiveDays / totalPairs all describe the
  // PUBLISHED window (what the pages and badge claim), not the on-disk archive.
  const winDates = snapshots.map(s => s.date).sort()
  const summary = {
    totalPairs: results.pairs.length,
    windowDays: PUBLISH_WINDOW_DAYS,
    archiveDays: snapshots.length,
    historyDays: historyData.history.length,
    dateRange: {
      archiveFrom: winDates[0],
      archiveTo: winDates[winDates.length - 1],
    },
    lifetime: {
      totalPairs: lifePairs,
      statusHitRate: lifePairs ? Math.round(lifeHits / lifePairs * 100) : null,
      days: new Set(allSnaps.map(s => s.date)).size,
      from: allSnaps.map(s => s.date).sort()[0],
      to: latestDate,
    },
    byHorizon: {},
    byBeach: {},
  }

  console.log(`\nWindow: ${summary.archiveDays} days (lifetime archive: ${summary.lifetime.days} days) | History: ${historyData.history.length} days`)
  console.log(`Prediction-observation pairs: ${results.pairs.length} (lifetime: ${lifePairs})`)

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
  console.log('  ^ NB: this global number BLENDS regimes. See the per-regime split below — it is the audit-proof view.')

  // Per-regime split (the honest view — never report the global alone).
  const { byRegime, cells } = printRegimeTable('archive — deployed forecasts', results.pairs)
  summary.byRegime = byRegime
  summary.byRegimeDirection = cells
  // Render-ready block the app + SEO/methodology pages consume to publish honest
  // per-regime reliability instead of a masking global. 'archive' = the real,
  // fully-faithful deployed-forecast number (self-heals as fixed-code snapshots
  // roll through the 30-day archive).
  summary.regimeReliability = buildRegimeReliabilitySummary(cells, byRegime, 'archive', { from: summary.dateRange.archiveFrom, to: summary.dateRange.archiveTo })

  // Save results
  const output = { ...summary, computed: new Date().toISOString(), pairs: results.pairs.slice(-100) }
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true })
  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2))
  console.log(`\nResults saved to ${OUT_PATH}`)
}

/**
 * --reforecast: the CONTROLLED instrument. The forecast-archive holds frozen
 * OUTPUTS of whatever code shipped that day, so it can't measure a code change.
 * This re-runs the CURRENT buildHonestForecast over historical inputs:
 *   - day-0 input  = actual observed level on date D (history.json) — faithful
 *   - trailing arg = actual history up to and including D            — faithful
 *   - banks        = current sargassum-banks.json (proxy; no per-date archive
 *                    exists). Held constant across before/after, so the FA
 *                    delta is attributable to code, not to bank drift.
 *   - wind/community/marine = null (removes confounders; isolates the
 *                    persistence + arrival + trend chain we recalibrated).
 * Then compares forecast horizon h to the actual observation on D+h.
 */
function reforecastBacktest() {
  console.log('=== Forecast Backtest — RE-FORECAST mode (current code over historical inputs) ===')
  const history = loadJSON(HISTORY_PATH, { history: [] }).history.slice().sort((a, b) => a.date.localeCompare(b.date))
  const banks = (loadJSON(BANKS_PATH, { banks: [] }).banks) || []
  if (history.length < 6) { console.log('Not enough history to re-forecast.'); return }

  const byDate = {}
  for (const e of history) { byDate[e.date] = {}; for (const l of e.levels) byDate[e.date][l.id] = { afai: l.afai, status: l.status } }
  const obsByBeach = indexObsByBeach(history)
  const dates = history.map(e => e.date)

  const pairs = []
  for (let di = 0; di < dates.length; di++) {
    const D = dates[di]
    const trailing = history.filter(e => e.date <= D)
    if (trailing.length < 5) continue
    const levels = history[di].levels.map(l => ({ id: l.id, afai: l.afai, status: l.status, confidence: 80 }))
    const weekly = buildHonestForecast(levels, null, trailing, BEACHES_META, banks, null, null)
    for (const b of BEACHES_META) {
      const wf = weekly[b.id]; if (!wf) continue
      const regime = regimeAsOf(obsByBeach, b.id, D)
      for (let h = 1; h <= 6; h++) {
        const tgt = dates[di + h]; if (!tgt) break
        const actual = byDate[tgt]?.[b.id]; if (!actual) continue
        const pred = wf.forecast[h]; if (!pred) continue
        pairs.push({
          beach: b.id, regime, horizon: h,
          predicted: { afai: pred.afai, status: pred.status, confidence: pred.confidence },
          actual: { afai: actual.afai, status: actual.status },
          statusHit: pred.status === actual.status ? 1 : 0,
        })
      }
    }
  }

  const total = pairs.length
  const hits = pairs.filter(p => p.statusHit).length
  const falseAlarms = pairs.filter(p => isAlertStatus(p.predicted.status) && !isAlertStatus(p.actual.status)).length
  console.log(`\nRe-forecast pairs: ${total} | global hit=${(hits / total * 100).toFixed(1)}% | false alarms=${falseAlarms} (${(falseAlarms / total * 100).toFixed(1)}%)`)
  console.log('  ^ NB: global blends regimes — the per-regime split is the honest view:')
  const { byRegime, cells } = printRegimeTable('re-forecast — current code', pairs)

  // Residual false alarms by beach + their max confidence (proves they are
  // flagged low-confidence, not asserted as trustworthy).
  const faByBeach = {}; let maxFAconf = 0
  for (const p of pairs) {
    if (isAlertStatus(p.predicted.status) && !isAlertStatus(p.actual.status)) {
      faByBeach[p.beach] = (faByBeach[p.beach] || 0) + 1
      maxFAconf = Math.max(maxFAconf, p.predicted.confidence)
    }
  }
  console.log(`\nResidual false alarms by beach: ${JSON.stringify(faByBeach)}`)
  console.log(`Max confidence among residual false alarms: ${maxFAconf}% (capped low = honest)`)

  const out = {
    mode: 'reforecast',
    note: 'Current buildHonestForecast re-run over history.json inputs (banks = current field, held constant). Calm-season false-alarm calibration.',
    computed: new Date().toISOString(),
    totalPairs: total,
    global: { statusHitRate: Math.round(hits / total * 100), falseAlarms, falseAlarmRate: Math.round(falseAlarms / total * 1000) / 10 },
    byRegime, byRegimeDirection: cells,
    regimeReliability: buildRegimeReliabilitySummary(cells, byRegime, 'reforecast', { from: dates[0], to: dates[dates.length - 1] }),
    residualFalseAlarmsByBeach: faByBeach,
    maxConfidenceAmongFalseAlarms: maxFAconf,
  }
  fs.mkdirSync(path.dirname(REGIME_OUT_PATH), { recursive: true })
  fs.writeFileSync(REGIME_OUT_PATH, JSON.stringify(out, null, 2))
  console.log(`\nResults saved to ${REGIME_OUT_PATH}`)
}

function daysBetween(dateA, dateB) {
  const a = new Date(dateA)
  const b = new Date(dateB)
  return Math.round((b - a) / (1000 * 60 * 60 * 24))
}

/**
 * --selftest: codified regression guard for the calm recalibration. Asserts the
 * invariants the adversarial audit verified, on controlled synthetic inputs, so a
 * future change (or an accidental revert — this happened 3x during development)
 * that breaks them fails LOUDLY. Exits non-zero on any violation. No external
 * data; fully deterministic. Cheap to run in CI / before a build.
 */
function selfTest() {
  console.log('=== Forecast recalibration self-test (invariant guard) ===')
  const fails = []
  const ok = (name, cond) => { console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) fails.push(name) }

  const calmBeach = { id: 't', lat: 16.0, lng: -61.4, island: 'gp', coast: 'atlantic', coastNormal: 170 }
  const calmHist = []
  for (let k = 0; k < 7; k++) calmHist.push({ date: `2026-06-0${k + 1}`, levels: [{ id: 't', afai: 0.07, status: 'clean' }] })
  const fc = (level, banks) => buildHonestForecast([level], null, calmHist, [calmBeach], banks || null, null, null).t

  // 1. calm + clean: floor lifts far-horizon confidence, regime exposed, no banned 0.15 pin
  const wc = fc({ id: 't', afai: 0.08, status: 'clean', confidence: 85 })
  ok('calm+clean regime classified calm', wc.regime === 'calm')
  ok('calm+clean J+4 confidence floored (>=45, was collapsing to ~12)', wc.forecast[4].confidence >= 45)
  ok('clean beach NOT pinned to a 0.15 floor (banned cleanFloorFor)', wc.forecast.every(d => d.afai < 0.15))
  ok('per-regime confidence exposed for app/pages', !!wc.regimeConfidence && wc.forecast.every(d => d.regime))

  // 2. floor never exceeds the day-0 observation confidence (low-base case)
  const wlow = fc({ id: 't', afai: 0.08, status: 'clean', confidence: 42 })
  ok('calm+clean floor bounded by base conf (J+6 == min(40,42)=40)', wlow.forecast[6].confidence <= 42)

  // 3. calm + STRONG approaching bank: banner and forecast agree, alert capped <=30
  const strongBank = { id: 1, island: 'gp', mass: 0.25, centroid: [15.92, -61.38], drift: { predictions: { '24h': { centroid: [15.96, -61.38] } } } }
  const wa = fc({ id: 't', afai: 0.08, status: 'clean', confidence: 85 }, [strongBank])
  const alertDay = wa.forecast.slice(1).find(d => d.status === 'moderate' || d.status === 'avoid')
  ok('calm strong-arrival fires the imminent banner', wa.arrivalDetected === true)
  ok('banner implies the forecast actually reaches alert (coherent)', !!alertDay)
  ok('calm-season alert confidence capped <=30', !alertDay || alertDay.confidence <= 30)

  // 4. memory beach: floor suppressed (confidence stays pinned to the past observation)
  const wm = fc({ id: 't', afai: 0.08, status: 'clean', confidence: 40, beachMemory: true, source: 'memory' })
  ok('memory beach NOT floored (confidence stays <=40)', wm.forecast.slice(1).every(d => d.confidence <= 40))

  // 5. determinism
  const r1 = JSON.stringify(fc({ id: 't', afai: 0.08, status: 'clean', confidence: 85 }, [strongBank]))
  const r2 = JSON.stringify(fc({ id: 't', afai: 0.08, status: 'clean', confidence: 85 }, [strongBank]))
  ok('deterministic (identical inputs -> identical output)', r1 === r2)

  // 6. publication-window date math (UTC-safe, no off-by-one). A 30-day window
  // anchored to D includes exactly D-29..D; the cutoff must cross months cleanly.
  ok('isoShift simple (-29 from 18 Jun = 20 May)', isoShift('2026-06-18', -(PUBLISH_WINDOW_DAYS - 1)) === '2026-05-20')
  ok('isoShift month boundary (-1 from 1 Jun = 31 May)', isoShift('2026-06-01', -1) === '2026-05-31')
  ok('isoShift identity (0 days)', isoShift('2026-06-18', 0) === '2026-06-18')
  ok('window is inclusive of exactly WINDOW_DAYS dates', (() => {
    const D = '2026-06-18', cut = isoShift(D, -(PUBLISH_WINDOW_DAYS - 1))
    let n = 0; for (let i = 0; i < 60; i++) { const d = isoShift(D, -i); if (d >= cut) n++ }
    return n === PUBLISH_WINDOW_DAYS
  })())

  if (fails.length) { console.error(`\nSELF-TEST FAILED (${fails.length}): ${fails.join(' | ')}`); process.exit(1) }
  console.log('\nAll invariants hold. ✓')
}

if (process.argv.includes('--selftest')) {
  selfTest()
} else if (process.argv.includes('--reforecast')) {
  reforecastBacktest()
} else {
  main()
}
