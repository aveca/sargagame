#!/usr/bin/env node
/**
 * revenue-watch.cjs — Veille revenu PROACTIVE (Stripe → email fondateur).
 *
 * Diff le dernier bloc `stripe` de daily-metrics.json vs le précédent et alerte le
 * fondateur sur tout mouvement : churn (active -1), nouvel abonné (+1), entrée en
 * past_due, annulation programmée (= fenêtre winback ouverte). Lecture seule des JSON
 * déjà produits par daily-stats-check → ZÉRO appel Stripe, zéro fausse donnée.
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

const d = load(METRICS, [])
const withStripe = d.filter(x => x && x.stripe && x.stripe.active != null)
if (withStripe.length < 2) { console.log('revenue-watch: <2 snapshots Stripe, rien à comparer.'); process.exit(0) }
const cur = withStripe[withStripe.length - 1].stripe
const prev = withStripe[withStripe.length - 2].stripe
const curDate = withStripe[withStripe.length - 1].date || ''
const eur = s => (s && s.mrr && s.mrr.eur != null) ? s.mrr.eur : null

const sig = `${curDate}|${cur.active}|${eur(cur)}|${cur.pastDue}|${cur.cancelScheduled}`
if (load(SEEN, {}).sig === sig) { console.log('revenue-watch: déjà alerté sur ce snapshot.'); process.exit(0) }

const dA = (cur.active || 0) - (prev.active || 0)
const dM = (eur(cur) || 0) - (eur(prev) || 0)
const dPD = (cur.pastDue || 0) - (prev.pastDue || 0)
const dCS = (cur.cancelScheduled || 0) - (prev.cancelScheduled || 0)
const deltas = []
if (dA > 0) deltas.push(`🟢 +${dA} abonné(s) actif(s) (${prev.active}→${cur.active})`)
if (dA < 0) deltas.push(`🔴 ${dA} abonné(s) — churn (${prev.active}→${cur.active})`)
if (dPD > 0) deltas.push(`⚠️ +${dPD} en past_due (${prev.pastDue}→${cur.pastDue}) — relance carte (dunning)`)
if (dPD < 0) deltas.push(`✅ past_due résorbé (${prev.pastDue}→${cur.pastDue})`)
if (dCS > 0) deltas.push(`🟠 +${dCS} annulation(s) programmée(s) (${prev.cancelScheduled}→${cur.cancelScheduled}) — fenêtre winback ouverte`)
if (dCS < 0) deltas.push(`✅ annulation programmée retirée (${prev.cancelScheduled}→${cur.cancelScheduled})`)
if (!deltas.length) { console.log('revenue-watch: delta neutre, aucune alerte.'); process.exit(0) }

const mrrLine = `MRR €${eur(cur) ?? '?'}${dM ? ` (${dM > 0 ? '+' : ''}${dM.toFixed(2)})` : ''} · ${cur.active} actifs · pastDue ${cur.pastDue} · annul. prog. ${cur.cancelScheduled}`
console.log('=== revenue-watch ===', DO_SEND ? 'SEND' : 'DRY-RUN')
deltas.forEach(x => console.log('  ' + x))
console.log('  ' + mrrLine)

if (!DO_SEND) { console.log('\nDRY-RUN — rien envoyé. --send pour envoyer.'); process.exit(0) }
if (!mailReady()) { console.error('SMTP_PASS absent — pas d\'envoi.'); process.exit(0) }
const html = `<div style="font-family:system-ui;max-width:520px;margin:0 auto;padding:20px">
  <h2 style="margin:0 0 12px;font-size:18px">Mouvement revenu Stripe</h2>
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
