#!/usr/bin/env node
/**
 * email-reactivation.cjs — One-shot « Ta région cette semaine » (P0 réactivation).
 *
 * Réactive les 597 contacts dormants avec le verdict du jour (mêmes données que
 * /aujourdhui/), SANS réinventer le pipeline : réutilise email-weekend.cjs
 * (builders HTML FR/EN/ES, ranking, préheaders) et les mêmes garde-fous :
 *   - audience = subscribers.json (fetch-subscribers, gitignored, déjà filtré
 *     désabonnés + bounces + dédupliqué) ; exclusion sources B2B
 *   - lien de désabonnement + List-Unsubscribe one-click par email
 *   - état dédié reactivation-sent.json (anti re-spam, indépendant du weekend)
 *   - throttle 25 envois / 1,5 s (hôte mutualisé), cap 600
 *
 * SÉCURITÉ D'ENVOI : DRY-RUN par défaut (affiche audience + sujets, n'envoie
 * rien). Envoi réel UNIQUEMENT avec --send (validation humaine préalable :
 * consentement = opt-in existant, délivrabilité vérifiée, pas de doublon avec
 * le bulletin du vendredi via reactivation-sent.json).
 *
 * Usage :
 *   node scripts/automation/email-reactivation.cjs            # dry-run (audit)
 *   node scripts/automation/email-reactivation.cjs --send     # envoi réel
 *   node scripts/automation/email-reactivation.cjs --send --region=mq
 */
const fs = require('fs')
const path = require('path')
const nodemailer = require('nodemailer')
const { injectPreheader, applyBrand, htmlToText } = require('./lib/email-send.cjs')
const { emailHash, logId } = require('./lib/email-hash.cjs')
const W = require('./email-weekend.cjs')

const ROOT = path.resolve(__dirname, '..', '..')
function envVal(name) {
  if (process.env[name]) return process.env[name].trim()
  try {
    const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8')
    const m = t.match(new RegExp('^' + name + '=([^\\r\\n]+)', 'm'))
    return m ? m[1].trim() : null
  } catch { return null }
}
const SMTP_HOST = envVal('SMTP_HOST'), SMTP_PORT = +envVal('SMTP_PORT') || 465
const SMTP_USER = envVal('SMTP_USER'), SMTP_PASS = envVal('SMTP_PASS')
const B2B_SOURCES = new Set(['b2b_hotel_request', 'b2b_collectivite_request'])
const SUBSCRIBERS_PATH = path.join(__dirname, 'data', 'subscribers.json')
const SENT_PATH = path.join(__dirname, 'data', 'reactivation-sent.json')
const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec'
const unsubUrl = island => `${WEBHOOK_URL}?action=unsubscribe&email={{EMAIL}}&island=${island.toUpperCase()}`
const sleep = ms => new Promise(r => setTimeout(r, ms))
const CAP = 600

const SEND = process.argv.includes('--send')
const ONLY = (process.argv.find(a => a.startsWith('--region=')) || '').slice(9) || null

function loadJSON(p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { return fb } }

async function main() {
  console.log(`=== Réactivation « ta région cette semaine » ${SEND ? '(ENVOI RÉEL)' : '(DRY-RUN — aucun envoi)'} ===`)
  const subscribers = loadJSON(SUBSCRIBERS_PATH, [])
  if (!subscribers.length) { console.error('subscribers.json vide/absent — lance fetch-subscribers.cjs avant.'); process.exitCode = 1; return }
  const sentState = loadJSON(SENT_PATH, {})
  const alreadySent = new Set(Object.keys(sentState))
  // Audience par île/région (mêmes règles que le bulletin : opt-in, non-B2B).
  const sargData = loadJSON(path.join(ROOT, 'public/api/copernicus/sargassum.json'), null)
  const beaches = loadJSON(path.join(ROOT, 'public/data/beaches-list.json'), [])
  if (!sargData) { console.error('No sargassum.json'); process.exitCode = 1; return }
  const { getAllRegions } = require('../../regions/index.cjs')
  const allRegions = getAllRegions()
  const regions = [{ id: 'mq', name: 'Martinique', lang: 'fr', domain: 'sargasses-martinique.com' },
    { id: 'gp', name: 'Guadeloupe', lang: 'fr', domain: 'sargasses-guadeloupe.com' },
    ...allRegions.filter(r => r.id !== 'mq' && r.id !== 'gp' && r.id !== 'barbados').map(r => ({ id: r.id, name: r.name, lang: r.primaryLang === 'es' ? 'es' : 'en', domain: r.domain, full: r }))]
  let transporter = null
  if (SEND) {
    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) { console.error('SMTP incomplet — envoi impossible.'); process.exitCode = 1; return }
    transporter = nodemailer.createTransport({ host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_PORT === 465, auth: { user: SMTP_USER, pass: SMTP_PASS }, pool: true, maxConnections: 3, maxMessages: 50 })
  }
  const today = new Date().toISOString().slice(0, 10)
  for (const region of regions) {
    if (ONLY && region.id !== ONLY) continue
    const isCore = region.id === 'mq' || region.id === 'gp'
    let topBeaches, stats, subject, html, preheader
    if (isCore) {
      const islandBeaches = beaches.filter(b => b.island === region.id)
      // Jointure niveaux → plages (même table SARG que le bulletin).
      const S2B = { 'grande-anse': 'mq014', 'anse-mitan': 'mq011', 'anse-noire': 'mq012', tartane: 'mq034', 'anse-madame': 'mq024', diamant: 'mq016', 'pt-marin': 'mq008', 'sainte-anne': 'mq004', 'les-salines': 'mq001', vauclin: 'mq044', precheur: 'mq033', 'gp-grande-anse': 'gp021', 'gp-malendure': 'gp031', 'gp-sainte-anne': 'gp010', 'gp-pt-chateaux': 'gp005', 'gp-gosier': 'gp012', 'gp-caravelle': 'gp009', 'gp-bas-du-fort': 'gp014', 'gp-deshaies': 'gp024', 'gp-moule': 'gp080', 'gp-vieux-fort': 'gp042' }
      const beachMap = {}
      for (const b of islandBeaches) beachMap[b.id] = { ...b }
      for (const level of (sargData.levels || [])) {
        const bid = S2B[level.id]
        if (bid && beachMap[bid]) { beachMap[bid].status = level.status; if (typeof level.score === 'number') { beachMap[bid].unifiedScore = level.score; beachMap[bid].unifiedLabel = level.label; beachMap[bid].unifiedColor = level.color; beachMap[bid].unifiedReason = level.reason } }
      }
      const list = Object.values(beachMap)
      stats = { clean: list.filter(b => b.status === 'clean').length, moderate: list.filter(b => b.status === 'moderate').length, avoid: list.filter(b => b.status === 'avoid').length }
      const scored = list.filter(b => typeof b.unifiedScore === 'number' && b.unifiedScore >= 40 && b.status !== 'avoid').sort((a, b) => b.unifiedScore - a.unifiedScore)
      topBeaches = (scored.length >= 3 ? scored : list.filter(b => b.status === 'clean' || b.status === 'moderate')).slice(0, 5)
      subject = `Ta région cette semaine : ${stats.clean} plages propres en ${region.name}${topBeaches[0] ? `, ${topBeaches[0].name} en tête` : ''}`
      preheader = `Où se baigner en ${region.name} cette semaine — verdict satellite du jour, plage par plage.`
      html = applyBrand(injectPreheader(W.buildEmailHTML(region.id, topBeaches, stats, region.domain), preheader))
    } else {
      const rb = W.prepareRegionBeaches(region.full || { id: region.id, beaches: [] }, new Date().toISOString().slice(0, 10))
      const rTop = W.rankBeaches(rb).slice(0, 5)
      if (!rTop.length) { console.log(`${region.name}: aucune plage à classer, skip`); continue }
      topBeaches = rTop
      stats = W.computeStats(rb)
      // Recadrage « cette semaine » (le builder week-end dit « weekend »).
      subject = W.buildRegionSubject({ id: region.id, name: region.name }, region.lang, rTop, stats)
        .replace(/^This weekend in/, 'This week in').replace(/^Este fin de semana en/, 'Esta semana en')
      const rPre = region.lang === 'es' ? 'Dónde bañarse esta semana — veredicto satelital del día.' : 'Where to swim this week — today\u2019s satellite verdict.'
      html = applyBrand(injectPreheader(W.buildEmailHTMLRegion({ id: region.id, name: region.name }, region.lang, rTop, stats), rPre))
    }
    const from = `${region.lang === 'es' ? 'Sargazo' : region.lang === 'en' ? 'Sargassum' : 'Sargasses'} ${region.name} <alerte@sargasses-martinique.com>`
    const text = htmlToText(html)
    const recipients = subscribers.filter(s => s.email && s.email.includes('@') && (s.island || 'MQ').toUpperCase() === region.id.toUpperCase() && !B2B_SOURCES.has(s.source))
    const fresh = recipients.filter(s => !alreadySent.has(emailHash(s.email)))
    console.log(`\n${region.name}: ${stats.clean} propres / ${stats.moderate} modérées / ${stats.avoid} alertes | audience ${recipients.length} (fraîche ${fresh.length}) | sujet: ${subject}`)
    console.log(`Top: ${topBeaches.map(b => b.name).join(', ')}`)
    if (!SEND) continue
    if (fresh.length > CAP) { console.log(`  cap ${CAP} — le reste au prochain run`); fresh.length = CAP }
    let sent = 0, failed = 0
    for (const sub of fresh) {
      const h = emailHash(sub.email)
      const enc = encodeURIComponent(sub.email)
      const personalHtml = html.replace(/\{\{EMAIL\}\}/g, enc)
      const personalText = text.replace(/\{\{EMAIL\}\}/g, enc)
      const unsub = unsubUrl(region.id).replace('{{EMAIL}}', enc)
      try {
        await transporter.sendMail({ from, to: sub.email, subject, html: personalHtml, text: personalText, headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } })
        sent++
        sentState[h] = today
        if (sent % 10 === 0) fs.writeFileSync(SENT_PATH, JSON.stringify(sentState))
        if (sent % 25 === 0) await sleep(1500)
      } catch (e) { failed++; console.log(`  ❌ ${logId(sub.email)}: ${e.message}`) }
    }
    fs.writeFileSync(SENT_PATH, JSON.stringify(sentState))
    console.log(`  envoyé ${sent}/${fresh.length} (échecs ${failed})`)
  }
  if (transporter) transporter.close()
  console.log(SEND ? '\nDone (envoi réel).' : '\nDone (dry-run — relance avec --send pour envoyer).')
}
if (require.main === module) main().catch(e => { console.error(e); process.exitCode = 1 })
module.exports = { main }
