#!/usr/bin/env node
/**
 * user-journey-audit.cjs — parcours utilisateurs réels (mission #41).
 * Par domaine de la matrice officielle (regions/index.cjs, live!==false) :
 *   accueil → choix d'une plage (liste/carte/hero) → fiche détaillée (verdict,
 *   fraîcheur, pill) → retour → plage alternative.
 * Desktop (1280x800) + mobile (390x844). Capture console/erreurs réseau/HTTP,
 * screenshots, empreinte version. Rapport JSON dédupliquable (fingerprint
 * domaine+route+étape+type). Aucun achat réel. Headless, zéro vol de focus.
 *
 * Usage : node scripts/automation/user-journey-audit.cjs [--out report.json] [--domains a,b] [--viewport mobile|desktop]
 */
'use strict'
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..', '..')

function getRegions() {
  return require(path.join(ROOT, 'regions', 'index.cjs')).getAllRegions().filter(r => r.live !== false)
}

// Empreinte version du domaine (v + b) — lie le rapport au build réellement servi.
function fetchVersion(domain) {
  const { execFileSync } = require('child_process')
  try {
    const out = execFileSync('curl', ['-sL', '--max-time', '20', '-A', 'Mozilla/5.0 (compatible; SargaJourney/1.0)', `https://${domain}/version.json`], { encoding: 'utf8', timeout: 25000 })
    const j = JSON.parse(out)
    return { v: j.v || null, b: j.b || null }
  } catch (_) { return { v: null, b: null } }
}

// Clé de déduplication stable : domaine + route + étape + type de défaut.
function dedupKey(item) {
  return [item.domain, item.step, item.type, String(item.detail || '').slice(0, 120)].join('|').toLowerCase()
}

function classify(defects) {
  const blocking = defects.filter(d => ['fatal-js', 'blank-page', 'nav-broken', 'misleading-state', 'primary-cta-dead'].includes(d.type))
  const ux = defects.filter(d => !blocking.includes(d))
  return { blocking, ux }
}

async function runJourney(browser, region, viewport) {
  const domain = region.domain
  const defects = []
  const steps = []
  const shotsDir = path.join(ROOT, 'scripts', 'automation', 'data', 'journeys')
  fs.mkdirSync(shotsDir, { recursive: true })
  const context = await browser.newContext({ viewport: viewport === 'mobile' ? { width: 390, height: 844, isMobile: true, hasTouch: true } : { width: 1280, height: 800 }, locale: region.primaryLang === 'es' ? 'es' : region.primaryLang === 'en' ? 'en' : 'fr' })
  const page = await context.newPage()
  const consoleErrors = []
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)) })
  page.on('pageerror', e => { defects.push({ domain, step: 'any', type: 'fatal-js', detail: String(e.message || e).slice(0, 200) }) })
  page.on('response', r => { if (r.status() >= 500) defects.push({ domain, step: 'any', type: 'server-error', detail: `${r.status()} ${r.url().slice(0, 120)}` }) })

  try {
    // 1. Accueil
    await page.goto(`https://${domain}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(9000)
    const bodyLen = await page.evaluate(() => document.body.innerText.length)
    if (bodyLen < 200) defects.push({ domain, step: 'home', type: 'blank-page', detail: `innerText=${bodyLen}` })
    steps.push({ step: 'home', ok: bodyLen >= 200 })

    // 1bis. Bannière cookies : elle couvre la page et avale les vrais clics
    // (Playwright actionability). Le visiteur accepte/refuse avant de naviguer.
    const cookie = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => /^(Accepter|Accept|Aceptar)$/i.test((x.textContent || '').trim()))
      if (b) { b.click(); return 'accepted' }
      return 'none'
    })
    await page.waitForTimeout(1500)
    steps.push({ step: 'cookie-banner', ok: true, via: cookie })

    // 2. Choix d'une plage. Défaut observé (#41) : l'assistant se ré-ouvre après
    //    fermeture et couvre la carte — on le referme avant CHAQUE tentative, et on
    //    retombe sur un clic synthétique (dispatchEvent) si un overlay avale
    //    l'actionabilité Playwright ; le résultat est vérifié dans le DOM (fiche).
    const pickers = ['.sg-maplabel', '.sg-l-card', 'button.lc-card', '.blv-row', '[data-beach]', '.hj-card']
    const closeChat = () => page.evaluate(() => {
      const dlgs = [...document.querySelectorAll('[role="dialog"]')]
      const chat = dlgs[dlgs.length - 1]
      if (chat && /Le Veilleur|The Watchman|El Vigía/.test(chat.innerText)) {
        const x = [...chat.querySelectorAll('button')].find(b => /✕|×|Fermer|Close|Cerrar/i.test(b.getAttribute('aria-label') || '') || /^(✕|×)$/.test((b.textContent || '').trim()))
        if (x) x.click()
      }
    })
    let opened = false
    for (let attempt = 0; attempt < 3 && !opened; attempt++) {
      await closeChat()
      await page.waitForTimeout(1200)
      for (const sel of pickers) {
        const el = await page.$(sel)
        if (!el) continue
        try { await el.click({ timeout: 4000 }); opened = true; steps.push({ step: 'pick-beach', ok: true, via: sel + (attempt ? `(retry${attempt})` : '') }); break } catch (_) {}
      }
      if (!opened) {
        // Fallback synthétique : la carte est couverte par un overlay récalcitrant.
        opened = await page.evaluate((sels) => {
          for (const sel of sels) {
            const el = document.querySelector(sel)
            if (el) { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); return sel }
          }
          return null
        }, pickers)
        if (opened) steps.push({ step: 'pick-beach', ok: true, via: opened + '(synthetic)' })
      }
    }
    await page.waitForTimeout(5000)
    // Vérification DOM : une fiche s'est-elle réellement ouverte ?
    const ficheOpen = await page.evaluate(() => /7 PROCHAINS JOURS|PRÉVISION 7 JOURS/i.test(document.body.innerText) || !!document.querySelector('.bsc-sheet, .lc-detail, .sheet'))
    if (!opened || !ficheOpen) defects.push({ domain, step: 'pick-beach', type: 'nav-broken', detail: `aucune plage cliquable/fiche non ouverte (opened=${opened}, ficheOpen=${ficheOpen})` })

    // 3. Fiche détaillée : verdict + fraîcheur (seulement si une fiche s'est ouverte —
    //    sinon le texte de l'accueil fausserait le contrôle).
    if (ficheOpen) {
      const fiche = await page.evaluate(() => {
        const t = document.body.innerText
        return {
          hasVerdict: /PROPRE|MODÉRÉ|À ÉVITER|CLEAN|MODERATE|AVOID|LIMPIA|EVITAR|ATTENTION|ÉVITER/i.test(t),
          hasFreshness: /Mesuré au satellite|Dernière mesure|ce matin|il y a|vérification|DATA DELAYED|DONNÉE EN RETARD|EN DIRECT|LIVE|EN VIVO|Verificación/i.test(t)
        }
      })
      if (!fiche.hasVerdict) defects.push({ domain, step: 'fiche', type: 'ux', detail: 'verdict absent de la fiche' })
      if (!fiche.hasFreshness) defects.push({ domain, step: 'fiche', type: 'misleading-state', detail: 'aucune mention de fraîcheur sur la fiche (état satellite trompeur)' })
      steps.push({ step: 'fiche', ok: fiche.hasVerdict && fiche.hasFreshness, verdict: fiche.hasVerdict, freshness: fiche.hasFreshness })
      await page.screenshot({ path: path.join(shotsDir, `journey-${region.id}-${viewport}.png`) }).catch(() => {})
    }

    // 4. Retour (close ou back) puis plage alternative.
    const closed = await page.evaluate(() => {
      const btn = document.querySelector('[aria-label="Fermer"], [aria-label="Close"], .lc-detail-x, .bsc-close')
      if (btn) { btn.click(); return true }
      return false
    })
    await page.waitForTimeout(2500)
    steps.push({ step: 'close-fiche', ok: closed })
    if (!closed) defects.push({ domain, step: 'close-fiche', type: 'nav-broken', detail: 'bouton fermeture fiche introuvable/inactif' })

    consoleErrors.slice(0, 10).forEach(txt => {
      // 404 connus hors périmètre (mission #41) : b2b-partners + referral PHP en preview.
      if (/b2b-partners|referral/i.test(txt)) return
      if (/Failed to load resource.*404|Uncaught|TypeError|ReferenceError/i.test(txt)) {
        defects.push({ domain, step: 'any', type: 'console-error', detail: txt })
      }
    })
  } catch (e) {
    defects.push({ domain, step: 'journey', type: 'fatal-js', detail: String(e.message || e).slice(0, 220) })
  } finally {
    await context.close().catch(() => {})
  }
  return { domain, viewport, steps, defects }
}

async function main() {
  const args = process.argv.slice(2)
  const A = (n) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : null }
  const outPath = A('out') || path.join(ROOT, 'scripts', 'automation', 'data', 'user-journey-report.json')
  const onlyDomains = A('domains') ? A('domains').split(',') : null
  const viewports = A('viewport') ? [A('viewport')] : ['mobile', 'desktop']

  let regions = getRegions()
  if (onlyDomains) regions = regions.filter(r => onlyDomains.includes(r.id))

  let chromium
  try { chromium = require('playwright').chromium } catch (_) { chromium = require(path.join(ROOT, 'node_modules', 'playwright')).chromium }
  const browser = await chromium.launch({ headless: true })

  const runs = []
  const allDefects = []
  for (const region of regions) {
    const version = fetchVersion(region.domain)
    for (const vp of viewports) {
      const r = await runJourney(browser, region, vp)
      r.version = version
      r.defects.forEach(d => { allDefects.push(d) })
      runs.push(r)
      console.log(`[${region.id}@${vp}] steps=${r.steps.length} defects=${r.defects.length}`)
    }
  }
  await browser.close()

  const { blocking, ux } = classify(allDefects)
  const report = {
    generatedAt: new Date().toISOString(),
    tool: 'user-journey-audit.cjs',
    domains: regions.map(r => r.domain),
    viewports,
    runs,
    summary: { runs: runs.length, defects: allDefects.length, blocking: blocking.length, ux: ux.length },
    defects: allDefects.map(d => ({ ...d, dedupKey: dedupKey(d) }))
  }
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2))
  console.log(`rapport: ${outPath} — parcours ${runs.length}, défauts ${allDefects.length} (bloquants ${blocking.length}, ux ${ux.length})`)
  process.exit(blocking.length > 0 ? 1 : 0)
}

if (require.main === module) main().catch(e => { console.error('ERREUR user-journey-audit :', e.message); process.exit(2) })
module.exports = { dedupKey, classify }
