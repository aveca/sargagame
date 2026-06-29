#!/usr/bin/env node
/**
 * ux-watch.cjs — Veille UX PROACTIVE (ux-report.json → email fondateur).
 *
 * Jumeau de revenue-watch.cjs côté UX. Lit le rapport déjà produit par l'audit
 * (scripts/automation/data/ux-report.json, généré par weekly-ux-report) et alerte le
 * fondateur sur les problèmes CRITIQUES (rage-clicks, dead-clicks, etc.) — qui sinon
 * dorment dans un JSON. Ferme la boucle track → détecte → AGIT : la friction sur les
 * pages payantes (ex. 295 rage-clicks sur la home) remonte enfin par email.
 *
 * Lecture seule du JSON déjà committé → ZÉRO appel externe. Dédup par signature
 * (data/ux-watch-seen.json) : 1 alerte par nouveau rapport / nouvelle aggravation.
 * Dry-run par défaut. Clé : SMTP_PASS (process.env OU .env).
 *
 * Usage :
 *   node scripts/automation/ux-watch.cjs          # dry-run
 *   node scripts/automation/ux-watch.cjs --send   # envoie (si SMTP prêt)
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
const REPORT = path.join(DATA, 'ux-report.json')
const SEEN = path.join(DATA, 'ux-watch-seen.json')
const TO = 'yacovassaraf@gmail.com'
const FROM = 'Sargasses UX <alerte@sargasses-martinique.com>'
const load = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return fb } }

const rep = load(REPORT, null)
if (!rep || !rep.sites) { console.log('ux-watch: pas de ux-report.json exploitable.'); process.exit(0) }

// Aplatit les problèmes CRITIQUES de tous les sites. Tolère site=[] ou site={issues:[]}.
const sev = it => (it.severity || it.level || '').toLowerCase()
const crit = []
for (const [site, val] of Object.entries(rep.sites)) {
  const issues = Array.isArray(val) ? val : (val.issues || val.findings || [])
  for (const it of issues) if (sev(it) === 'critical') {
    crit.push({ site, type: it.type || '?', page: it.page || it.url || '/', metric: (it.metric || it.title || it.msg || '').toString() })
  }
}
if (!crit.length) { console.log('ux-watch: 0 problème critique.'); process.exit(0) }

// Tri par site puis page (déterministe) ; signature = rapport + liste des criticals.
crit.sort((a, b) => (a.site + a.page + a.type).localeCompare(b.site + b.page + b.type))
const sig = `${rep.generatedAt || '?'}|${crit.length}|${crit.map(c => `${c.site}:${c.page}:${c.type}`).join(',')}`
if (load(SEEN, {}).sig === sig) { console.log('ux-watch: déjà alerté sur ce rapport.'); process.exit(0) }

const sum = rep.summary || {}
const lines = crit.map(c => `${c.site.toUpperCase()} · ${c.page} — ${c.type} (${c.metric})`)
console.log('=== ux-watch ===', DO_SEND ? 'SEND' : 'DRY-RUN')
console.log(`  ${crit.length} critiques | total ${sum.totalIssues ?? '?'} (warn ${sum.warnings ?? '?'})`)
lines.forEach(x => console.log('  ' + x))

if (!DO_SEND) { console.log('\nDRY-RUN — rien envoyé. --send pour envoyer.'); process.exit(0) }
if (!mailReady()) { console.error('SMTP_PASS absent — pas d\'envoi.'); process.exit(0) }

const html = `<div style="font-family:system-ui;max-width:560px;margin:0 auto;padding:20px">
  <h2 style="margin:0 0 4px;font-size:18px">${crit.length} problème(s) UX critique(s)</h2>
  <p style="font-size:12px;color:#777;margin:0 0 12px">Total ${sum.totalIssues ?? '?'} · critiques ${sum.critical ?? crit.length} · warnings ${sum.warnings ?? '?'} · rapport ${rep.generatedAt || ''}</p>
  <ul style="font-size:14px;line-height:1.7;padding-left:18px;margin:0">${crit.map(c => `<li><b>${c.site.toUpperCase()}</b> <code>${c.page}</code> — ${c.type}<br><span style="color:#666;font-size:12px">${c.metric}</span></li>`).join('')}</ul>
  <p style="font-size:11px;color:#999;border-top:1px solid #eee;padding-top:10px;margin-top:14px">Auto-veille UX · ux-report.json (audit hebdo) · dédup par rapport</p></div>`
sendEmail({ from: FROM, to: TO, subject: `[Sargasses] UX : ${crit.length} critique(s) — ${crit[0].page}`, html })
  .then(({ error }) => {
    if (error) { console.error('SMTP error:', error.message); return }
    fs.writeFileSync(SEEN, JSON.stringify({ sig, at: new Date().toISOString() }, null, 2))
    console.log(`Alerte UX envoyée à ${TO}`)
  })
  .catch(e => console.error('ux-watch error:', e.message))
