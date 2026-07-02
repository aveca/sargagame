#!/usr/bin/env node
/**
 * revenue-watch.cjs — Veille revenu PROACTIVE (Stripe + Mollie → email fondateur).
 *
 * Diff les derniers blocs `stripe` ET `mollie` de daily-metrics.json vs les précédents
 * et alerte le fondateur sur tout mouvement :
 *   - Stripe (legacy run-off) : churn (active -1), nouvel abonné (+1), entrée en
 *     past_due, annulation programmée (= fenêtre winback ouverte).
 *   - Mollie (CAISSE ACTIVE) : nouvelle vente (count/payeur), remboursement,
 *     chargeback, paiement B2B (dont le 1er !).
 * Lecture seule des JSON déjà produits par daily-stats-check → ZÉRO appel API,
 * zéro fausse donnée. ⚠️ Le bloc mollie est une fenêtre 30 j GLISSANTE : une
 * baisse de count = des paiements qui sortent de la fenêtre, PAS du churn →
 * on n'alerte JAMAIS sur un delta négatif Mollie.
 *
 * Dédup par signature du snapshot (data/revenue-watch-seen.json) → 1 alerte/événement.
 * Dry-run par défaut. Clé : SMTP_PASS (process.env OU .env).
 *
 * Usage :
 *   node scripts/automation/revenue-watch.cjs          # dry-run
 *   node scripts/automation/revenue-watch.cjs --send   # envoie (si SMTP prêt)
 */
const fs = require('fs')
const path = require('path')
const { sendEmail, mailReady } = require('./lib/email-send.cjs')

// bridge .env → process.env (exécution locale)
;['SMTP_PASS', 'SMTP_USER', 'SMTP_HOST', 'SMTP_PORT'].forEach(k => {
  if (!process.env[k]) { try { const t = fs.readFileSync(path.join(__dirname, '../../.env'), 'utf8'); const m = t.match(new RegExp('^' + k + '=([^\\r\\n]+)', 'm')); if (m) process.env[k] = m[1].trim() } catch (_) {} }
})

const DO_SEND = process.argv.includes('--send')
const DATA = path.join(__dirname, 'data')
const METRICS = path.join(DATA, 'daily-metrics.json')
const SEEN = path.join(DATA, 'revenue-watch-seen.json')
const TO = 'yacovassaraf@gmail.com'
const FROM = 'Sargasses Revenu <alerte@sargasses-martinique.com>'
const load = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return fb } }
const round2 = n => Math.round(n * 100) / 100

const d = load(METRICS, [])
const deltas = []

// ── Diff Stripe (legacy run-off) ────────────────────────────────────────────────
const withStripe = d.filter(x => x && x.stripe && x.stripe.active != null)
let curS = null, prevS = null
if (withStripe.length >= 2) {
  curS = withStripe[withStripe.length - 1].stripe
  prevS = withStripe[withStripe.length - 2].stripe
  const eur = s => (s && s.mrr && s.mrr.eur != null) ? s.mrr.eur : null
  const dA = (curS.active || 0) - (prevS.active || 0)
  const dPD = (curS.pastDue || 0) - (prevS.pastDue || 0)
  const dCS = (curS.cancelScheduled || 0) - (prevS.cancelScheduled || 0)
  if (dA > 0) deltas.push(`🟢 +${dA} abonné(s) Stripe actif(s) (${prevS.active}→${curS.active})`)
  if (dA < 0) deltas.push(`🔴 ${dA} abonné(s) Stripe — churn (${prevS.active}→${curS.active})`)
  if (dPD > 0) deltas.push(`⚠️ +${dPD} en past_due (${prevS.pastDue}→${curS.pastDue}) — relance carte (dunning)`)
  if (dPD < 0) deltas.push(`✅ past_due résorbé (${prevS.pastDue}→${curS.pastDue})`)
  if (dCS > 0) deltas.push(`🟠 +${dCS} annulation(s) programmée(s) (${prevS.cancelScheduled}→${curS.cancelScheduled}) — fenêtre winback ouverte`)
  if (dCS < 0) deltas.push(`✅ annulation programmée retirée (${prevS.cancelScheduled}→${curS.cancelScheduled})`)
} else {
  console.log('revenue-watch: <2 snapshots Stripe, diff Stripe sauté.')
}

// ── Diff Mollie (caisse active) — fenêtre 30 j glissante, deltas POSITIFS only ──
const withMollie = d.filter(x => x && x.mollie && x.mollie.paid)
let curM = null
if (withMollie.length >= 2) {
  curM = withMollie[withMollie.length - 1].mollie
  const prevM = withMollie[withMollie.length - 2].mollie
  for (const cur of new Set([...Object.keys(curM.paid || {}), ...Object.keys(prevM.paid || {})])) {
    const c = (curM.paid || {})[cur] || { count: 0, total: 0 }
    const p = (prevM.paid || {})[cur] || { count: 0, total: 0 }
    const dc = c.count - p.count
    if (dc > 0) deltas.push(`💶 +${dc} vente(s) Mollie ${cur} (+${round2(c.total - p.total)} ${cur}) — ${c.count} paiements/30j`)
  }
  const newPayers = (curM.payers || []).filter(h => !(prevM.payers || []).includes(h))
  if (newPayers.length) deltas.push(`👤 ${newPayers.length} nouveau(x) payeur(s) Mollie (hash8 : ${newPayers.join(', ')})`)
  const dRef = ((curM.refunds || {}).count || 0) - ((prevM.refunds || {}).count || 0)
  if (dRef > 0) deltas.push(`🔴 +${dRef} remboursement(s) Mollie — vérifier le dashboard ; révoquer l'accès : node scripts/automation/revoke-pass.cjs <email>`)
  const dCb = ((curM.chargebacks || {}).count || 0) - ((prevM.chargebacks || {}).count || 0)
  if (dCb > 0) deltas.push(`🚨 +${dCb} chargeback(s) Mollie — litige carte, agir vite (dashboard Mollie)`)
  const dB2b = (curM.b2b || 0) - (prevM.b2b || 0)
  if (dB2b > 0) deltas.push((prevM.b2b || 0) === 0
    ? `🏨 1er paiement B2B Mollie ! (+${dB2b}) — onboarder : token Pro / espace pro`
    : `🏨 +${dB2b} paiement(s) B2B Mollie (${prevM.b2b}→${curM.b2b})`)
} else {
  console.log('revenue-watch: <2 snapshots Mollie, diff Mollie sauté (le bloc se remplit run après run).')
}

if (!curS && !curM) { console.log('revenue-watch: aucune paire de snapshots comparables.'); process.exit(0) }

const curDate = (d[d.length - 1] && d[d.length - 1].date) || ''
const eur = s => (s && s.mrr && s.mrr.eur != null) ? s.mrr.eur : null
const mSig = curM ? Object.entries(curM.paid || {}).map(([c, v]) => `${c}:${v.count}`).sort().join(',') +
  `|r${(curM.refunds || {}).count || 0}|cb${(curM.chargebacks || {}).count || 0}|b${curM.b2b || 0}|p${(curM.payers || []).length}` : 'noM'
const sig = `${curDate}|${curS ? `${curS.active}|${eur(curS)}|${curS.pastDue}|${curS.cancelScheduled}` : 'noS'}|${mSig}`
if (load(SEEN, {}).sig === sig) { console.log('revenue-watch: déjà alerté sur ce snapshot.'); process.exit(0) }
if (!deltas.length) { console.log('revenue-watch: delta neutre, aucune alerte.'); process.exit(0) }

const mrrLine = [
  curS ? `Stripe (legacy) : MRR €${eur(curS) ?? '?'} · ${curS.active} actifs · pastDue ${curS.pastDue} · annul. prog. ${curS.cancelScheduled}` : null,
  curM ? `Mollie 30j : ${Object.entries(curM.paid || {}).map(([c, v]) => `${v.count}× ${v.total} ${c}`).join(' · ') || '0 paiement'} · ${(curM.payers || []).length} payeur(s) · B2B ${curM.b2b || 0}` : null,
].filter(Boolean).join(' — ')
console.log('=== revenue-watch ===', DO_SEND ? 'SEND' : 'DRY-RUN')
deltas.forEach(x => console.log('  ' + x))
console.log('  ' + mrrLine)

if (!DO_SEND) { console.log('\nDRY-RUN — rien envoyé. --send pour envoyer.'); process.exit(0) }
if (!mailReady()) { console.error('SMTP_PASS absent — pas d\'envoi.'); process.exit(0) }
const html = `<div style="font-family:system-ui;max-width:520px;margin:0 auto;padding:20px">
  <h2 style="margin:0 0 12px;font-size:18px">Mouvement revenu (Stripe + Mollie)</h2>
  <ul style="font-size:14px;line-height:1.7;padding-left:18px;margin:0">${deltas.map(x => `<li>${x}</li>`).join('')}</ul>
  <p style="font-size:13px;color:#555;border-top:1px solid #eee;padding-top:10px;margin-top:14px">${mrrLine}</p>
  <p style="font-size:11px;color:#999;margin-top:6px">Auto-veille revenu · diff daily-metrics · ${curDate}</p></div>`
sendEmail({ from: FROM, to: TO, subject: `[Sargasses] Revenu : ${deltas[0].replace(/^\S+\s/, '')}`, html })
  .then(({ error }) => {
    if (error) { console.error('SMTP error:', error.message); return }
    fs.writeFileSync(SEEN, JSON.stringify({ sig, at: new Date().toISOString() }, null, 2))
    console.log(`Alerte envoyée à ${TO}`)
  })
  .catch(e => console.error('revenue-watch error:', e.message))
