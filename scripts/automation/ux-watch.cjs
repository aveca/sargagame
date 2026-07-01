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

// Aplatit les problèmes de tous les sites. Tolère site=[] ou site={issues:[]}.
// DEUX seaux : ACTIONNABLE (coupable nommé, toute sévérité + vrais criticals cwv/bounce)
// vs HOTSPOT (dead/rage-click de PAGE sans élément — GA4 ne donne pas le sélecteur →
// « ? » non-corrigeable). On mène par la liste corrigeable, on résume les hotspots :
// fini le mur de 47 « ? » criticals qui fait ignorer l'alerte.
const sev = it => (it.severity || it.level || '').toLowerCase()
const isHotspot = it => it.locatable === false && (it.type === 'dead-click' || it.type === 'rage-click')
const isNamed = it => it.locatable === true || it.type === 'dead-click-el' || (!!it.target && it.target !== '')

const actionable = []
const hotspots = []
for (const [site, val] of Object.entries(rep.sites)) {
  const issues = Array.isArray(val) ? val : (val.issues || val.findings || [])
  for (const it of issues) {
    const row = { site, type: it.type || '?', page: it.page || it.url || '/', metric: (it.metric || it.title || it.msg || '').toString(), severity: sev(it), count: it.count || 0 }
    if (isHotspot(it)) { hotspots.push(row); continue }
    if (isNamed(it) || sev(it) === 'critical') actionable.push(row)
  }
}
if (!actionable.length && !hotspots.length) { console.log('ux-watch: 0 problème à remonter.'); process.exit(0) }

// Tri déterministe. Actionnables : criticals d'abord, puis count desc. Hotspots : count desc.
const _rank = s => (s === 'critical' ? 0 : 1)
actionable.sort((a, b) => _rank(a.severity) - _rank(b.severity) || b.count - a.count || (a.site + a.page + a.type).localeCompare(b.site + b.page + b.type))
hotspots.sort((a, b) => b.count - a.count || (a.site + a.page).localeCompare(b.site + b.page))

// Signature = rapport + les deux listes → une semaine stable ne réalerte pas.
const sig = `${rep.generatedAt || '?'}|A:${actionable.map(c => `${c.site}:${c.page}:${c.type}`).join(',')}|H:${hotspots.map(c => `${c.site}:${c.page}`).join(',')}`
if (load(SEEN, {}).sig === sig) { console.log('ux-watch: déjà alerté sur ce rapport.'); process.exit(0) }

const sum = rep.summary || {}
const hotList = hotspots.slice(0, 8).map(c => `${c.site.toUpperCase()} ${c.page}${c.count ? ` (${c.count})` : ''}`).join(' · ')
console.log('=== ux-watch ===', DO_SEND ? 'SEND' : 'DRY-RUN')
console.log(`  ${actionable.length} à corriger | ${hotspots.length} hotspot(s) coupable inconnu | total ${sum.totalIssues ?? '?'}`)
actionable.forEach(c => console.log(`  [FIX] ${c.site.toUpperCase()} · ${c.page} — ${c.type} (${c.metric})`))
if (hotspots.length) console.log(`  [hotspots] ${hotList}${hotspots.length > 8 ? ` … +${hotspots.length - 8}` : ''}`)

if (!DO_SEND) { console.log('\nDRY-RUN — rien envoyé. --send pour envoyer.'); process.exit(0) }
if (!mailReady()) { console.error('SMTP_PASS absent — pas d\'envoi.'); process.exit(0) }

const actHtml = actionable.length
  ? `<ul style="font-size:14px;line-height:1.7;padding-left:18px;margin:0 0 4px">${actionable.map(c => `<li><b>${c.site.toUpperCase()}</b> <code>${c.page}</code> — ${c.type}${c.severity === 'critical' ? ' <span style="color:#c00">●</span>' : ''}<br><span style="color:#666;font-size:12px">${c.metric}</span></li>`).join('')}</ul>`
  : `<p style="font-size:13px;color:#666;margin:0 0 4px">Aucun coupable nommé cette semaine (heatmap first-party sans donnée ≥8, ou clé stats absente).</p>`
const hotHtml = hotspots.length
  ? `<p style="font-size:12px;color:#777;margin:14px 0 2px"><b>${hotspots.length} page(s) chaude(s), coupable inconnu</b> (GA4 ne nomme pas l'élément) :</p>
     <p style="font-size:12px;color:#999;margin:0">${hotList}${hotspots.length > 8 ? ` … +${hotspots.length - 8}` : ''}</p>`
  : ''
const html = `<div style="font-family:system-ui;max-width:560px;margin:0 auto;padding:20px">
  <h2 style="margin:0 0 4px;font-size:18px">${actionable.length} problème(s) UX à corriger</h2>
  <p style="font-size:12px;color:#777;margin:0 0 12px">Nommés/actionnables ${actionable.length} · hotspots page ${hotspots.length} · total ${sum.totalIssues ?? '?'} · rapport ${rep.generatedAt || ''}</p>
  ${actHtml}
  ${hotHtml}
  <p style="font-size:11px;color:#999;border-top:1px solid #eee;padding-top:10px;margin-top:14px">Auto-veille UX · ux-report.json (audit hebdo) · dédup par rapport</p></div>`
const subjectTail = actionable[0] ? actionable[0].page : (hotspots[0] ? hotspots[0].page : '/')
sendEmail({ from: FROM, to: TO, subject: `[Sargasses] UX : ${actionable.length} à corriger${hotspots.length ? ` (+${hotspots.length} hotspots)` : ''} — ${subjectTail}`, html })
  .then(({ error }) => {
    if (error) { console.error('SMTP error:', error.message); return }
    fs.writeFileSync(SEEN, JSON.stringify({ sig, at: new Date().toISOString() }, null, 2))
    console.log(`Alerte UX envoyée à ${TO}`)
  })
  .catch(e => console.error('ux-watch error:', e.message))
