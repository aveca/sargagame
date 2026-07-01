#!/usr/bin/env node
/**
 * beached-calibrate.cjs — Auto-calage du half-life « échoué » (full auto + email).
 *
 * Le half-life de persistance échouée (BEACHED_HALF_LIFE_DAYS = 12, prior physique
 * NON-ajusté) ne peut être calé qu'avec de vraies données d'échouage. Ce script
 * tourne en CI (weekly-optimize) : dès que l'historique satellite montre des plages
 * chargées, il balaye des candidats de half-life, re-forecast SUR CES PAIRES SEULES,
 * choisit le meilleur (borné + lissé + gate min-échantillon), écrit la valeur dans
 * data/beached-calibration.json (relu par forecast.cjs : env > JSON > prior) et
 * alerte le fondateur par email à chaque changement. Réversible (SG_BEACHED_HALF_LIFE).
 *
 * ⚠️ Cible BIAISÉE (panel adverse) : l'historique est SATELLITE = l'eau, pas le sable.
 * Fitter la persistance du sable sur du satellite tire vers « trop rapide ». D'où :
 * borne basse à 8 j (on ne descend pas sous ça), lissage ±2 j/run, et disclosure
 * honnête dans l'email quand la donnée réclame plus rapide que la borne.
 *
 * Usage :
 *   node scripts/automation/beached-calibrate.cjs          # dry-run (n'écrit/mail rien)
 *   node scripts/automation/beached-calibrate.cjs --write   # écrit le JSON (pas d'email)
 *   node scripts/automation/beached-calibrate.cjs --send    # écrit + email si SMTP prêt
 */
const fs = require('fs')
const path = require('path')
const { buildHonestForecast } = require('../lib/forecast.cjs')
const {
  BEACHES_META, HISTORY_PATH, BANKS_PATH, loadJSON,
} = require('./backtest-forecast.cjs')
const { sendEmail, mailReady } = require('./lib/email-send.cjs')

// bridge .env → process.env (exécution locale)
;['SMTP_PASS', 'SMTP_USER', 'SMTP_HOST', 'SMTP_PORT'].forEach(k => {
  if (!process.env[k]) { try { const t = fs.readFileSync(path.join(__dirname, '../../.env'), 'utf8'); const m = t.match(new RegExp('^' + k + '=([^\\r\\n]+)', 'm')); if (m) process.env[k] = m[1].trim() } catch (_) {} }
})

const DO_SEND = process.argv.includes('--send')
const DO_WRITE = DO_SEND || process.argv.includes('--write')
const OUT = path.join(__dirname, 'data/beached-calibration.json')
const SEEN = path.join(__dirname, 'data/beached-calibration-seen.json')
const TO = 'yacovassaraf@gmail.com'
const FROM = 'Sargasses Modèle <alerte@sargasses-martinique.com>'

// Sweep candidates (days). Guardrails on the CHOSEN value:
const CANDIDATES = [5, 6, 8, 10, 12, 14, 16, 20, 24]
const PRIOR = 12          // provisional prior (matches BEACHED_HALF_LIFE_DAYS)
const CLAMP_LO = 8        // satellite = lower bound for sand → never auto-drop below this
const CLAMP_HI = 20
const MAX_STEP = 2        // smoothing: move at most ±2 days per run toward the target
const MIN_PAIRS = 40      // gate: too few loaded pairs → keep prior, no write/email
const MIN_EVENTS = 3      // gate: loaded pairs must span ≥3 distinct dates (not one blip)
const LOADED_AFAI = 0.20  // a beach counts as "loaded" (échoué) at/above this — mirrors the ratchet trigger

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

function main() {
  const history = (loadJSON(HISTORY_PATH, { history: [] }).history || []).slice().sort((a, b) => a.date.localeCompare(b.date))
  const banks = (loadJSON(BANKS_PATH, { banks: [] }).banks) || []
  const dates = history.map(e => e.date)
  const byDate = {}
  for (const e of history) { byDate[e.date] = {}; for (const l of (e.levels || [])) byDate[e.date][l.id] = { afai: l.afai, status: l.status } }

  // Identify the LOADED beach-date pairs once (independent of the candidate):
  // a beach observed ≥0.20 on date D, with an actual observation at D+h (h=1..6).
  // We keep {di, beachId, h} so every candidate scores the exact same pairs.
  const loadedPairs = []
  const eventDates = new Set()
  for (let di = 0; di < dates.length; di++) {
    const D = dates[di]
    if (history.filter(e => e.date <= D).length < 5) continue
    for (const b of BEACHES_META) {
      const obs0 = byDate[D]?.[b.id]
      if (!obs0 || !(obs0.afai >= LOADED_AFAI)) continue
      for (let h = 1; h <= 6; h++) {
        const tgt = dates[di + h]; if (!tgt) break
        const actual = byDate[tgt]?.[b.id]; if (!actual) continue
        loadedPairs.push({ di, D, beachId: b.id, h, actual })
        eventDates.add(D)
      }
    }
  }

  const gateOk = loadedPairs.length >= MIN_PAIRS && eventDates.size >= MIN_EVENTS
  const report = {
    computedAt: new Date().toISOString(),
    window: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null,
    loadedPairs: loadedPairs.length,
    events: eventDates.size,
    gate: { minPairs: MIN_PAIRS, minEvents: MIN_EVENTS, passed: gateOk },
  }

  if (!gateOk) {
    report.halfLifeDays = readCurrent()
    report.method = 'prior-held'
    report.note = `Pas assez de données d'échouage (${loadedPairs.length} paires / ${eventDates.size} dates < gate ${MIN_PAIRS}/${MIN_EVENTS}). Prior ${report.halfLifeDays}j conservé, aucune écriture.`
    console.log('=== beached-calibrate ===', DO_SEND ? 'SEND' : DO_WRITE ? 'WRITE' : 'DRY-RUN')
    console.log(' ', report.note)
    process.exit(0)
  }

  // Score every candidate on the SAME loaded pairs: AFAI MAE (continuous fit) + status hit.
  const sweep = CANDIDATES.map(days => {
    let mae = 0, hit = 0, n = 0
    const forecasts = {} // cache per date for this candidate
    for (const p of loadedPairs) {
      let wf = forecasts[p.D]
      if (!wf) {
        const trailing = history.filter(e => e.date <= p.D)
        const levels = history[p.di].levels.map(l => ({ id: l.id, afai: l.afai, status: l.status, confidence: 80 }))
        wf = forecasts[p.D] = buildHonestForecast(levels, null, trailing, BEACHES_META, banks, null, null, { beachedHalfLifeDays: days })
      }
      const pred = wf[p.beachId]?.forecast?.[p.h]; if (!pred) continue
      mae += Math.abs(pred.afai - p.actual.afai)
      if (pred.status === p.actual.status) hit++
      n++
    }
    return { days, mae: n ? mae / n : Infinity, hitRate: n ? Math.round(hit / n * 100) : 0, n }
  })

  const best = sweep.reduce((a, b) => (b.mae < a.mae ? b : a))
  const current = readCurrent()
  // Clamp to the honest band (satellite = lower bound), then smooth toward it.
  const target = clamp(best.days, CLAMP_LO, CLAMP_HI)
  const step = Math.sign(target - current) * Math.min(MAX_STEP, Math.abs(target - current))
  const chosen = Math.round(clamp(current + step, CLAMP_LO, CLAMP_HI))

  report.sweep = sweep.map(s => ({ days: s.days, mae: Math.round(s.mae * 1000) / 1000, hitRate: s.hitRate, n: s.n }))
  report.bestRawDays = best.days
  report.previousDays = current
  report.halfLifeDays = chosen
  report.method = 'satellite-lowerbound'
  report.dataWantsFaster = best.days < CLAMP_LO // satellite says clear faster than our floor
  report.note = `Calé sur ${loadedPairs.length} paires plage-chargée / ${eventDates.size} dates. Meilleur MAE @ ${best.days}j → borné [${CLAMP_LO},${CLAMP_HI}] + lissé ±${MAX_STEP}/run : ${current}j → ${chosen}j.`

  console.log('=== beached-calibrate ===', DO_SEND ? 'SEND' : DO_WRITE ? 'WRITE' : 'DRY-RUN')
  console.log('  loaded pairs:', loadedPairs.length, '| events:', eventDates.size)
  report.sweep.forEach(s => console.log(`    ${String(s.days).padStart(2)}j  MAE=${s.mae}  hit=${s.hitRate}%  (n=${s.n})`))
  console.log(`  best raw ${best.days}j → chosen ${chosen}j (was ${current}j)`)
  if (report.dataWantsFaster) console.log('  ⚠️  la donnée réclame plus rapide que la borne — envisager SG_BEACHED_HALF_LIFE plus bas ou SG_BEACHED_HOLD=0.')

  const changed = chosen !== current
  if (!DO_WRITE) { console.log('\nDRY-RUN — rien écrit. --write pour écrire, --send pour écrire + email.'); process.exit(0) }

  // Idempotence : n'écrit/mail que si la valeur bouge.
  if (!changed) { console.log('  Valeur inchangée — pas de réécriture ni d\'email.'); writeReport(report, false); process.exit(0) }
  writeReport(report, true)

  if (!DO_SEND) { console.log(`  JSON écrit (${current}j → ${chosen}j). --send pour notifier.`); process.exit(0) }
  if (!mailReady()) { console.error('  SMTP_PASS absent — JSON écrit, pas d\'email.'); process.exit(0) }

  const rows = report.sweep.map(s => `<tr><td style="padding:2px 8px">${s.days} j</td><td style="padding:2px 8px">${s.mae}</td><td style="padding:2px 8px">${s.hitRate}%</td></tr>`).join('')
  const html = `<div style="font-family:system-ui;max-width:560px;margin:0 auto;padding:20px">
    <h2 style="margin:0 0 4px;font-size:18px">Half-life échoué recalé : ${current} j → <b>${chosen} j</b></h2>
    <p style="font-size:12px;color:#777;margin:0 0 12px">Calé sur ${loadedPairs.length} paires plage-chargée / ${eventDates.size} dates · ${report.window?.from}→${report.window?.to}</p>
    <table style="font-size:13px;border-collapse:collapse;margin:0 0 12px"><thead><tr><th style="padding:2px 8px;text-align:left">Half-life</th><th style="padding:2px 8px;text-align:left">MAE AFAI</th><th style="padding:2px 8px;text-align:left">Statut</th></tr></thead><tbody>${rows}</tbody></table>
    <p style="font-size:13px;line-height:1.6;color:#444;margin:0 0 8px">Meilleur brut @ ${best.days} j → borné [${CLAMP_LO},${CLAMP_HI}] + lissé ±${MAX_STEP}/run.</p>
    ${report.dataWantsFaster ? '<p style="font-size:13px;line-height:1.6;color:#b45309;margin:0 0 8px">⚠️ La donnée satellite réclame un nettoyage plus rapide que la borne basse — si les plages sont ramassées quotidiennement, envisage <code>SG_BEACHED_HALF_LIFE</code> plus bas ou <code>SG_BEACHED_HOLD=0</code>.</p>' : ''}
    <p style="font-size:12px;color:#777;line-height:1.6;border-top:1px solid #eee;padding-top:10px;margin-top:12px">⚠️ Calé sur l'historique <b>satellite</b> (= l'eau, pas le sable) → borne basse. Réversible / pinnable : <code>SG_BEACHED_HALF_LIFE=${chosen}</code>. Auto-calage hebdo · beached-calibrate.cjs.</p></div>`
  sendEmail({ from: FROM, to: TO, subject: `[Sargasses] Modèle : half-life échoué ${current}j → ${chosen}j (${loadedPairs.length} obs)`, html })
    .then(({ error }) => {
      if (error) { console.error('  SMTP error:', error.message); return }
      fs.writeFileSync(SEEN, JSON.stringify({ chosen, at: report.computedAt }, null, 2))
      console.log(`  Email de recalage envoyé à ${TO}`)
    })
    .catch(e => console.error('  beached-calibrate email error:', e.message))
}

function readCurrent() {
  const j = loadJSON(OUT, null)
  const v = j && parseFloat(j.halfLifeDays)
  return (v && isFinite(v)) ? v : PRIOR
}
function writeReport(report, changed) {
  if (!DO_WRITE) return
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2))
  console.log(`  → ${OUT} ${changed ? '(mis à jour)' : '(refresh)'}`)
}

main()
