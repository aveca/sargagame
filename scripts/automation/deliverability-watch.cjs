#!/usr/bin/env node
/**
 * deliverability-watch.cjs — Veille délivrabilité PROACTIVE (email fondateur).
 *
 * Alerte le fondateur si un PIC de rebonds réels est observé, pour réagir AVANT
 * que la réputation d'envoi se dégrade — sans ouvrir Google Postmaster à la main.
 *
 * ⚠️ Signal : depuis la migration Resend→SMTP, le provider n'émet AUCUN event de
 * tracking (open/bounce), donc `?action=email_stats` renvoie des taux GELÉS (legacy
 * Resend) — on ne s'en sert QUE comme contexte indicatif, JAMAIS comme seuil. Le
 * seul signal LIVE en repo = la croissance de la liste de suppression
 * `data/bounced-emails.json`, désormais alimentée par de vrais bounces SMTP (DSN
 * parsés par support-inbox.cjs). Le taux/plaintes autoritatif vit dans Postmaster.
 *
 * Déclencheur = pic jour-à-jour ≥ SPIKE (défaut 8, override BOUNCE_SPIKE). Dédup par
 * signature (data/deliverability-watch-seen.json) → pas de spam ; ré-alerte si le
 * pic s'aggrave. Dry-run par défaut. Clé : SMTP_PASS (process.env OU .env).
 *
 * Usage :
 *   node scripts/automation/deliverability-watch.cjs          # dry-run
 *   node scripts/automation/deliverability-watch.cjs --send   # envoie (si SMTP prêt)
 */
const fs = require('fs')
const path = require('path')
const https = require('https')
const { sendEmail, mailReady, brandHeader } = require('./lib/email-send.cjs')

// bridge .env → process.env (exécution locale)
;['SMTP_PASS', 'SMTP_USER', 'SMTP_HOST', 'SMTP_PORT'].forEach(k => {
  if (!process.env[k]) { try { const t = fs.readFileSync(path.join(__dirname, '../../.env'), 'utf8'); const m = t.match(new RegExp('^' + k + '=([^\\r\\n]+)', 'm')); if (m) process.env[k] = m[1].trim() } catch (_) {} }
})

const DATA = path.join(__dirname, 'data')
const BOUNCED = path.join(DATA, 'bounced-emails.json')
const SEEN = path.join(DATA, 'deliverability-watch-seen.json')
const TO = process.env.FOUNDER_EMAIL || process.env.ALERT_TO || 'yacovassaraf@gmail.com'
const FROM = 'Sargasses Délivrabilité <alerte@sargasses-martinique.com>'
const POSTMASTER_URL = 'https://postmaster.google.com/'
const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec'
const SPIKE = parseInt(process.env.BOUNCE_SPIKE || '8', 10)

const load = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return fb } }

// ─── Logique pure (testable) ───────────────────────────────────────────────
// Nombre d'adresses supprimées (longueur du tableau de hashes).
function bouncedCount(list) { return Array.isArray(list) ? list.length : 0 }

// Évalue le pic. Premier run (lastCount null) → baseline = count actuel (growth 0),
// pour ne PAS alerter sur les suppressions préexistantes. sig porte le pic exact →
// même pic même jour = déjà alerté ; pic plus fort = nouvelle sig = ré-alerte.
function evaluate({ count, lastCount, date, spike = SPIKE }) {
  const base = (lastCount == null) ? count : lastCount
  const growth = count - base
  const triggered = growth >= spike
  const sig = triggered ? `${date}|spike:${growth}` : ''
  return { growth, triggered, sig, count }
}

// ─── Contexte legacy (indicatif, non déclencheur) ──────────────────────────
function fetchJSON(url) {
  return new Promise((resolve) => {
    const get = (u, redirects = 0) => {
      if (redirects > 5) return resolve(null)
      https.get(u, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) return get(res.headers.location, redirects + 1)
        let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)) } catch { resolve(null) } })
      }).on('error', () => resolve(null))
    }
    try { get(url) } catch { resolve(null) }
  })
}

async function main() {
  const DO_SEND = process.argv.includes('--send')
  const count = bouncedCount(load(BOUNCED, []))
  const seen = load(SEEN, {})
  const date = new Date().toISOString().slice(0, 10)
  const { growth, triggered, sig } = evaluate({ count, lastCount: seen.lastBouncedCount, date })

  console.log('=== deliverability-watch ===', DO_SEND ? 'SEND' : 'DRY-RUN')
  console.log(`  suppression : ${count} total · pic jour-à-jour : ${growth >= 0 ? '+' : ''}${growth} (seuil ${SPIKE})`)

  // Persiste TOUJOURS la baseline (en --send) pour la mesure jour-à-jour, même sans alerte.
  const persistBaseline = (extra = {}) => {
    if (DO_SEND) { try { fs.writeFileSync(SEEN, JSON.stringify({ ...seen, ...extra, lastBouncedCount: count, at: new Date().toISOString() }, null, 2)) } catch (e) { console.error('seen write:', e.message) } }
  }

  if (!triggered) { console.log('  RAS — aucun pic.'); persistBaseline({ sig: '' }); return }
  if (seen.sig === sig) { console.log('  déjà alerté sur ce pic.'); persistBaseline(); return }

  // Contexte legacy (indicatif) — best-effort, jamais bloquant.
  let ctx = ''
  try {
    const stats = await fetchJSON(`${WEBHOOK_URL}?action=email_stats`)
    if (stats && stats.counts) ctx = `Contexte (indicatif, legacy — SMTP sans tracking) : ${stats.counts.sent ?? '?'} envoyés, taux de rebond affiché ${stats.rates?.bounce ?? '?'} %.`
  } catch { /* ignore */ }

  console.log(`  ⚠️ PIC : +${growth} adresses en échec (total ${count})`)
  if (!DO_SEND) { console.log('\nDRY-RUN — rien envoyé. --send pour envoyer.'); return }
  if (!mailReady()) { console.error('SMTP_PASS absent — pas d\'envoi.'); return }

  const html = `${brandHeader('Délivrabilité', 'Pic de rebonds détecté', `+${growth} adresses en échec aujourd'hui`)}
  <div style="font-size:15px;line-height:1.6;color:#23323a">
    <p><strong>+${growth} adresse(s)</strong> viennent d'être ajoutées à la liste de suppression (total : ${count}). C'est au-dessus du seuil normal — un signal de réputation à vérifier.</p>
    <p style="font-size:14px;color:#444">C'est un <strong>indicateur</strong>, pas un verdict. La source autoritative du taux de spam / réputation, c'est <a href="${POSTMASTER_URL}">Google Postmaster Tools</a> :</p>
    <ul style="font-size:14px;line-height:1.7;color:#444">
      <li><strong>Si Postmaster est vert</strong> (spam rate bas, reputation High/Medium) → probablement une salve d'adresses mortes, rien de grave.</li>
      <li><strong>Si Postmaster vire au rouge</strong> → ralentir la prospection froide (baisser <code>CAP_NEW</code>) le temps que ça se calme.</li>
    </ul>
    ${ctx ? `<p style="font-size:12px;color:#888;border-top:1px solid #eee;padding-top:10px;margin-top:12px">${ctx}</p>` : ''}
    <p style="font-size:11px;color:#999;margin-top:6px">Auto-veille délivrabilité · croissance liste de suppression · ${date}</p>
  </div>`

  try {
    const { error } = await sendEmail({ from: FROM, to: TO, subject: `[Sargasses] Délivrabilité : +${growth} rebonds aujourd'hui`, html, preheader: `Pic de rebonds (+${growth}) — vérifier Google Postmaster Tools.` })
    if (error) { console.error('SMTP error:', error.message); return }
    persistBaseline({ sig })
    console.log(`  Alerte envoyée à ${TO}`)
  } catch (e) { console.error('deliverability-watch error:', e.message) }
}

if (require.main === module) main().catch(e => { console.error('deliverability-watch:', e.message); process.exit(0) })

module.exports = { evaluate, bouncedCount }
