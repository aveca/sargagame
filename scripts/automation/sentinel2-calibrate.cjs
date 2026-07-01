/**
 * sentinel2-calibrate.cjs — AUTO-CALIBRATION + AUTO-ACTIVATION Sentinel-2.
 *
 * Objectif (esprit « l'IA opère, zéro humain ») : le signal S2 se calibre ET
 * s'active TOUT SEUL le jour où il a prouvé qu'il colle au réel — sans édition de
 * workflow ni main humaine. Mais JAMAIS avant cette preuve (loi moat « 0 fabrication »).
 *
 * Mécanique :
 *   1. Apparie chaque observation S2 (sentinel2-history.json) au RÉALISÉ de la même
 *      plage (history.json = statut ERDDAP settled, on prend la date la plus proche
 *      dans une fenêtre ±5 j).
 *   2. Grid-search les seuils fai→statut qui MAXIMISENT l'accord S2↔réel.
 *   3. GATE STRICT : n'active (active:true) QUE si assez d'échantillons appariés
 *      (≥ MIN_PAIRS) ET accord ≥ MIN_AGREEMENT. Sinon active:false (+ raison).
 *   4. Écrit public/api/copernicus/sentinel2-calibration.json — le pipeline LIT ce
 *      fichier (fetch-sargassum-live : active ; fetch-sentinel2 : thresholds).
 *   5. Si ça vient de passer OFF→ON, email le fondateur (notification, pas un frein) :
 *      il garde un droit de veto via le kill-switch SG_SENTINEL2=0.
 *
 * HONNÊTETÉ : la métrique est l'ACCORD avec le satellite settled (ERDDAP 7D), pas une
 * preuve d'amélioration forecast (faute de vérité-terrain dense automatisable). C'est
 * un PLANCHER défendable — « le S2 near-shore suit la réalité mesurée » — publié tel
 * quel. Une calibration sur signalements citoyens serait un raffinement ultérieur.
 *
 * Non-bloquant, dry-run par défaut. --send pour l'email d'auto-activation.
 */
const fs = require('fs')
const path = require('path')

;['SMTP_PASS', 'SMTP_USER', 'SMTP_HOST', 'SMTP_PORT'].forEach(k => {
  if (!process.env[k]) { try { const t = fs.readFileSync(path.join(__dirname, '../../.env'), 'utf8'); const m = t.match(new RegExp('^' + k + '=([^\\r\\n]+)', 'm')); if (m) process.env[k] = m[1].trim() } catch (_) {} }
})

const DO_SEND = process.argv.includes('--send')
const COP = path.join(__dirname, '..', '..', 'public', 'api', 'copernicus')
const HIST_S2 = path.join(COP, 'sentinel2-history.json')
const HIST_REAL = path.join(COP, 'history.json')
const OUT = path.join(COP, 'sentinel2-calibration.json')
const TO = 'yacovassaraf@gmail.com'
const FROM = 'Sargasses Data <alerte@sargasses-martinique.com>'

// Gate d'activation (strict). Barres délibérément prudentes : on préfère rester OFF
// trop longtemps qu'activer un signal non prouvé.
const MIN_PAIRS = 20         // échantillons (plage×date) appariés minimum
const MIN_AGREEMENT = 0.72   // accord S2↔réel minimum pour activer
const MATCH_WINDOW_DAYS = 5  // fenêtre d'appariement obsDate ↔ date réalisée
const DEFAULT_TH = { clean: 0.005, mod: 0.015 } // seuils fai actuels (fallback)

const load = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return fb } }
const dayDiff = (a, b) => Math.abs((new Date(a + 'T12:00:00Z') - new Date(b + 'T12:00:00Z')) / 86400000)

// statut prédit par le S2 selon des seuils fai (mêmes classes que statusFromAfai).
function s2Status(fai, th) {
  if (fai <= th.clean) return 'clean'
  if (fai <= th.mod) return 'moderate'
  return 'avoid'
}

function buildPairs(s2Hist, realHist) {
  // index réalisé : { beachId: [{date, status}] }
  const real = {}
  for (const h of (realHist.history || [])) {
    if (!h || !h.date || !Array.isArray(h.levels)) continue
    for (const l of h.levels) {
      if (!l || !l.id || !l.status) continue
      ;(real[l.id] = real[l.id] || []).push({ date: h.date, status: l.status })
    }
  }
  const pairs = []
  for (const o of (s2Hist.observations || [])) {
    if (!o || !o.id || !o.obsDate || o.fai == null) continue
    const cand = real[o.id]
    if (!cand) continue
    // date réalisée la plus proche dans la fenêtre
    let best = null
    for (const r of cand) {
      const d = dayDiff(o.obsDate, r.date)
      if (d <= MATCH_WINDOW_DAYS && (!best || d < best.d)) best = { d, status: r.status }
    }
    if (best) pairs.push({ fai: o.fai, realized: best.status })
  }
  return pairs
}

// Grid-search les seuils qui maximisent l'accord.
function calibrate(pairs) {
  let bestTh = DEFAULT_TH, bestAgree = -1
  const cleanGrid = []
  for (let c = 0.001; c <= 0.010 + 1e-9; c += 0.001) cleanGrid.push(Math.round(c * 1000) / 1000)
  const modGrid = []
  for (let m = 0.006; m <= 0.030 + 1e-9; m += 0.002) modGrid.push(Math.round(m * 1000) / 1000)
  for (const clean of cleanGrid) {
    for (const mod of modGrid) {
      if (mod <= clean) continue
      const th = { clean, mod }
      let ok = 0
      for (const p of pairs) if (s2Status(p.fai, th) === p.realized) ok++
      const agree = pairs.length ? ok / pairs.length : 0
      if (agree > bestAgree) { bestAgree = agree; bestTh = th }
    }
  }
  return { thresholds: bestTh, agreement: Math.round(bestAgree * 1000) / 1000 }
}

function main() {
  const s2 = load(HIST_S2, null)
  const real = load(HIST_REAL, null)
  const prev = load(OUT, { active: false })

  let result
  if (!s2 || !Array.isArray(s2.observations) || !real) {
    result = { active: false, reason: 'no-data', n: 0, agreement: null, thresholds: DEFAULT_TH }
  } else {
    const pairs = buildPairs(s2, real)
    if (pairs.length < MIN_PAIRS) {
      result = { active: false, reason: `insufficient-pairs (${pairs.length}/${MIN_PAIRS})`, n: pairs.length, agreement: null, thresholds: DEFAULT_TH }
    } else {
      const { thresholds, agreement } = calibrate(pairs)
      const active = agreement >= MIN_AGREEMENT
      result = {
        active,
        reason: active ? 'validated' : `agreement-too-low (${agreement} < ${MIN_AGREEMENT})`,
        n: pairs.length,
        agreement,
        thresholds,
      }
    }
  }
  result.verifiedAt = new Date().toISOString()
  result.metric = 'accord statut S2 near-shore vs ERDDAP settled (history), fenêtre ±' + MATCH_WINDOW_DAYS + 'j'

  console.log('=== sentinel2-calibrate ===', DO_SEND ? 'SEND' : 'DRY-RUN')
  console.log(`  n=${result.n} agreement=${result.agreement} → active=${result.active} (${result.reason})`)
  console.log(`  thresholds: clean≤${result.thresholds.clean} mod≤${result.thresholds.mod}`)

  fs.mkdirSync(COP, { recursive: true })
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2), 'utf8')
  console.log('OK:', OUT)

  // Email UNIQUEMENT sur transition OFF→ON (auto-activation).
  const flipped = result.active && !prev.active
  if (flipped) notifyActivation(result)
}

function notifyActivation(r) {
  if (!DO_SEND) { console.log('  (OFF→ON détecté — email en dry-run, non envoyé)'); return }
  let sendEmail, mailReady, brandHeader
  try { ({ sendEmail, mailReady, brandHeader } = require('./lib/email-send.cjs')) } catch (_) { return }
  if (!mailReady || !mailReady()) { console.log('  SMTP absent — pas d\'email d\'activation.'); return }
  const html = `<div style="max-width:560px;margin:0 auto">
    ${brandHeader('Sentinel-2 · auto-activation', 'Le near-shore vient de s\'activer', 'Il a prouvé qu\'il colle au réel — la correction est désormais LIVE sur les plages calibrées.')}
    <div style="background:#FDFCF7;border-radius:0 0 16px 16px;padding:24px">
      <p style="font-size:14px;line-height:1.6;color:#222;margin:0 0 12px">Le calibrateur a mesuré un <b>accord de ${Math.round((r.agreement || 0) * 100)}%</b> entre le signal Sentinel-2 near-shore et le satellite settled, sur <b>${r.n} points</b> appariés — au-dessus du seuil d'activation. Le flag s'est allumé <b>tout seul</b>.</p>
      <p style="font-size:13px;color:#444;margin:0 0 12px">Seuils calibrés : clean ≤ ${r.thresholds.clean}, modéré ≤ ${r.thresholds.mod}. Métrique publiée sur /fiabilite/.</p>
      <p style="font-size:13px;color:#444;margin:0 0 12px"><b>Rien à faire.</b> Si tu veux couper : mets le secret <code>SG_SENTINEL2=0</code> (kill-switch) — sinon ça reste ON et continue de s'auto-calibrer.</p>
      <p style="font-size:11px;color:#999;border-top:1px solid #eee;padding-top:10px;margin-top:14px">Auto-calibration Sentinel-2 · ${r.verifiedAt.slice(0, 10)}</p>
    </div></div>`
  sendEmail({ from: FROM, to: TO, subject: '[Sargasses] 🛰️ Sentinel-2 s\'est auto-activé (' + Math.round((r.agreement || 0) * 100) + '% d\'accord)', html, preheader: 'Le near-shore a prouvé qu\'il colle au réel — correction LIVE.' })
    .then(({ error }) => console.log(error ? '  SMTP error: ' + error.message : '  email d\'auto-activation envoyé.'))
    .catch(e => console.log('  email (non-bloquant): ' + (e.message || e)))
}

// export pour tests + exécution directe
if (require.main === module) main()
module.exports = { buildPairs, calibrate, s2Status }
