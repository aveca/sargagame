#!/usr/bin/env node
'use strict'
/**
 * freshness-contract-check.cjs — régression BROWSER du CONTRAT DE DÉCISION de la
 * fiche plage (`lc-detail`), en DESKTOP et MOBILE, sur un build LOCAL.
 *
 * POURQUOI (défaut mesuré le 2026-11-07, gate `verify` du run 42227027205)
 * -------------------------------------------------------------------------
 * Les 12 défauts bloquants `stale-current-decision` (6 domaines × 2 viewports)
 * portaient TOUS sur la fiche plage : une observation satellite hors SLA
 * (> 900 min) y affichait encore un score, une prévision 7 jours et un verdict
 * courant. Le détecteur qui l'attrape (`scripts/automation/user-journey-audit.cjs`)
 * ne pouvait être exécuté que CONTRE LES DOMAINES PUBLICS : impossible de
 * vérifier un build candidat avant sa mise en production.
 *
 * Ce script ferme la boucle :
 *   1. il audite un ARTEFACT LOCAL (preview vite) ;
 *   2. il rejoue le contrat dans les DEUX sens (observation hors SLA =>
 *      fail-closed ; observation fraîche => verdict courant) ;
 *   3. il échoue (exit 1) si le contrat n'est pas tenu, en CI comme en local.
 *
 * Le contrat mesuré est celui de `scripts/automation/lib/detail-decision-ui.cjs`
 * (texte RENDU + visibilité réelle, classes legacy présentes dans tous les
 * builds) — exactement la mesure utilisée par l'audit parcours.
 *
 * Usage :
 *   node scripts/automation/freshness-contract-check.cjs [--base http://127.0.0.1:4173]
 *
 * Prérequis : un build servi (ex. `npx vite preview --port 4173`).
 */

const { chromium } = require('playwright')
const { measureDetailDecisionUi, checkFailClosedDecisionUi, checkCurrentDecisionUi } = require('./lib/detail-decision-ui.cjs')

const args = process.argv.slice(2)
const arg = (n) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : null }
const BASE = (arg('base') || process.env.SMOKE_BASE || 'http://127.0.0.1:4173').replace(/\/$/, '')

const VIEWPORTS = [
  { name: 'desktop-1280x800', width: 1280, height: 800, isMobile: false, hasTouch: false },
  { name: 'mobile-390x844', width: 390, height: 844, isMobile: true, hasTouch: true },
]

// Tous les payloads Copernicus servis (racine +|regionaux) : la région peut
// servir `/api/copernicus/<region>/sargassum.json` plutôt que la racine.
const PAYLOAD_RE = /\/api\/copernicus\/(?:[^/?]+\/)?sargassum\.json(?:\?.*)?$/

// SLA opérationnel produit : au-delà, AUCUNE décision courante (cf. mission
// P0 « Workers first, freshness » et src/observation-freshness.js).
const SLA_MINUTES = 900

const failures = []
const notes = []

async function runScenario(browser, viewport, state) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.isMobile,
    hasTouch: viewport.hasTouch,
    serviceWorkers: 'block',
  })
  const page = await context.newPage()
  page.setDefaultNavigationTimeout(60000)
  page.setDefaultTimeout(30000)
  const consoleErrors = []
  page.on('pageerror', e => consoleErrors.push('PAGEERROR ' + String(e.message || e).slice(0, 160)))

  // Fixture : on contrôle UNIQUEMENT l'horloge d'observation. Le payload réel
  // (niveaux, prévisions, saison) est conservé — on ne fabrique pas de donnée.
  let intercepted = 0
  await page.route(PAYLOAD_RE, async route => {
    const response = await route.fetch()
    const payload = await response.json()
    // Hors SLA : observation de 48 h. Le payload MENT (stale=false,
    // dataAgeMinutes=60) comme le fait la production figée : le client doit
    // recalculer depuis erddapTimestamp et suspendre la décision.
    const ageMinutes = state === 'stale' ? 48 * 60 : 30
    payload.source = 'erddap-live'
    payload.stale = false
    payload.erddapTimestamp = new Date(Date.now() - ageMinutes * 60_000).toISOString()
    payload.updatedAt = new Date().toISOString()
    payload.dataAgeMinutes = state === 'stale' ? 60 : ageMinutes
    intercepted++
    await route.fulfill({ response, json: payload })
  })

  const label = `${state}/${viewport.name}`
  try {
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
    // La carte-monde live doit monter (pins neutres cliquables même sans verdict).
    await page.waitForSelector('svg[data-sg-live="1"] g[style*="cursor"]', { timeout: 30000 }).catch(() => {})
    await page.waitForTimeout(1200)

    // Ouverture d'une fiche plage : clic sur un pin de la carte (chemin réel
    // carte → fiche, cf. ComicDetail.jsx qui route les pins vers ChasseDetail).
    await page.evaluate(() => {
      const pin = document.querySelector('svg[data-sg-live="1"] g[style*="cursor"]')
      if (pin) pin.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
    })
    const fiche = page.locator('.lc-detail').first()
    const opened = await fiche.waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch(() => false)
    if (!opened) {
      failures.push(`${label} : aucune fiche plage (.lc-detail) ouverte depuis la carte`)
      return
    }
    await page.waitForTimeout(800)

    const ui = await measureDetailDecisionUi(page)
    if (state === 'stale') {
      const contract = checkFailClosedDecisionUi(ui)
      if (!contract.ok) failures.push(`${label} : contrat fail-closed NON tenu — ${JSON.stringify(contract.violations)} ui=${JSON.stringify(ui)}`)
      else notes.push(`${label} : fail-closed OK (head=${JSON.stringify(ui.head)})`)
    } else {
      const contract = checkCurrentDecisionUi(ui)
      if (!contract.ok) failures.push(`${label} : contrat "décision courante" NON tenu — ${JSON.stringify(contract.violations)} ui=${JSON.stringify(ui)}`)
      else notes.push(`${label} : décision courante OK (score=${JSON.stringify(ui.scoreText)})`)
    }
    if (consoleErrors.length) failures.push(`${label} : erreurs JS ${JSON.stringify(consoleErrors.slice(0, 3))}`)
  } catch (error) {
    failures.push(`${label} : exception ${String(error && error.message || error).slice(0, 200)}`)
  } finally {
    await context.close().catch(() => {})
  }
  return intercepted
}

;(async () => {
  console.log('FRESHNESS_CONTRACT_CHECK base=' + BASE + ' sla=' + SLA_MINUTES + 'min')
  const browser = await chromium.launch({ headless: true })
  try {
    for (const viewport of VIEWPORTS) {
      for (const state of ['stale', 'fresh']) {
        const intercepted = await runScenario(browser, viewport, state)
        if (!intercepted) failures.push(`${state}/${viewport.name} : payload Copernicus jamais intercepté (le test n'a rien mesuré)`)
      }
    }
  } finally {
    await browser.close()
  }

  for (const n of notes) console.log('  OK   ' + n)
  if (failures.length) {
    console.error('\nFRESHNESS_CONTRACT_CHECK=FAIL (' + failures.length + ')')
    for (const f of failures) console.error('  - ' + f)
    process.exit(1)
  }
  console.log('\nFRESHNESS_CONTRACT_CHECK=PASS (desktop-1280x800 + mobile-390x844, stale/fresh, SLA ' + SLA_MINUTES + ' min)')
})().catch(error => { console.error('ERREUR freshness-contract-check :', error && error.message || error); process.exit(2) })
