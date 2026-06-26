#!/usr/bin/env node
/**
 * referral-report.cjs — REPORTING de la boucle PARRAINAGE (decision-support).
 *
 * La boucle referral est live côté app (un premium partage un lien `?ref=CODE`, le
 * filleul atterrit, puis convertit). Les 3 signaux — share / landing / convert —
 * vivent dans analytics_events mais n'étaient agrégés NULLE PART : impossible de
 * décider des récompenses parrain (founder-only Mollie) sans savoir qui amène qui.
 *
 * Ce script interroge l'endpoint Apps Script `?action=referral` (ajouté à Code.js),
 * imprime le funnel + le top des parrains, et sauvegarde data/referral-report.json
 * (versionné → l'évolution est traçable dans git). READ-ONLY, zéro envoi.
 *
 * ⚠️ L'action GAS `referral` doit être déployée : `cd scripts/appscript && clasp push`
 * (action fondateur, comme `sg_pass_cta`). Tant qu'elle ne l'est pas, l'endpoint
 * renvoie « unknown action » → ce script le détecte et le signale sans planter.
 *
 * Usage :
 *   node scripts/automation/referral-report.cjs            # fenêtre 90j
 *   node scripts/automation/referral-report.cjs --days=28
 */
const fs = require('fs')
const path = require('path')

const HOOK = 'https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec'
const OUT_PATH = path.join(__dirname, 'data', 'referral-report.json')
const args = process.argv.slice(2)
const daysArg = args.find(a => a.startsWith('--days='))
const DAYS = daysArg ? Math.min(365, Math.max(1, parseInt(daysArg.split('=')[1], 10) || 90)) : 90

async function main() {
  const url = `${HOOK}?action=referral&days=${DAYS}`
  console.log(`=== Referral report === fenêtre ${DAYS}j`)
  let data
  try {
    const res = await fetch(url, { redirect: 'follow' })
    data = await res.json()
  } catch (e) {
    console.error('Fetch échec:', e.message)
    process.exitCode = 1
    return
  }

  // L'action GAS n'est pas encore déployée (clasp push en attente) → no-op gracieux.
  if (!data || data.window_days == null) {
    const hint = (data && data.error) ? data.error : 'réponse inattendue'
    console.log(`Action GAS "referral" indisponible (${hint}).`)
    console.log('→ Déploie-la : cd scripts/appscript && clasp push (action fondateur).')
    return
  }

  const r = data
  console.log(`shares (partages parrain) : ${r.shares}`)
  console.log(`landings (filleuls arrivés): ${r.landings}`)
  console.log(`converts (filleuls payants): ${r.converts}`)
  console.log(`taux share→landing  : ${r.rates.share_to_landing}%`)
  console.log(`taux landing→convert: ${r.rates.landing_to_convert}%`)
  if (Array.isArray(r.top) && r.top.length) {
    console.log('\nTop parrains (code · landings · converts) :')
    for (const t of r.top.slice(0, 10)) {
      console.log(`  ${t.code}  ·  ${t.landings} landing(s)  ·  ${t.converts} convert(s)`)
    }
  } else {
    console.log('\nAucun code parrain actif sur la fenêtre.')
  }

  const out = { generatedAt: new Date().toISOString(), ...r }
  try {
    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true })
    fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + '\n')
    console.log(`\nSauvegardé → ${path.relative(process.cwd(), OUT_PATH)}`)
  } catch (e) {
    console.error('Sauvegarde échec:', e.message)
  }
}

if (require.main === module) main().catch(e => { console.error('ERREUR:', e.message); process.exit(1) })
module.exports = { main }
