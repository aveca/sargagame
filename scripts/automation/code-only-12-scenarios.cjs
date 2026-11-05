#!/usr/bin/env node
'use strict'
/**
 * fail-closed-12-scenarios.cjs — preuve navigateur des 12 scénarios de la
 * « code-only release » fail-closed (mission P0.118 §9).
 *
 *   6 DOMAINES × 2 VIEWPORTS (desktop 1280×800, mobile 390×844) = 12 scénarios.
 *
 * Chaque scénario :
 *   1. sert le PACKAGE RÉGIONAL réellement produit (dossier FTP de la région) ;
 *   2. ouvre la home, accepte/refuse le bandeau cookies ;
 *   3. ouvre une fiche plage (liste / carte / hero) ;
 *   4. MESURE l'état décisionnel avec la même fonction que l'audit parcours
 *      (scripts/automation/lib/detail-decision-ui.cjs) : texte RENDU + visibilité ;
 *   5. capture le screenshot ;
 *   6. vérifie le CONTRAT fail-closed : aucun score courant, aucun verdict
 *      courant, aucune prévision courante, message de vérification localisé.
 *
 * L'observation est volontairement ancienne (c'est l'état réel de production :
 * 2026-10-27T12:00:00Z). Aucun test n'invente d'observation fraîche.
 */

const fs = require('fs')
const path = require('path')
const http = require('http')
const { chromium } = require('playwright')

const ROOT = path.resolve(__dirname, '..')
const { measureDetailDecisionUi, isFailClosedDecisionUi } = require(path.join(ROOT, 'scripts', 'automation', 'lib', 'detail-decision-ui.cjs'))
const { getAllRegions } = require(path.join(ROOT, 'regions', 'index.cjs'))

const SHOTS = process.env.SG_SHOTS_DIR || path.join(ROOT, 'scripts', 'automation', 'data', 'journeys')
const PORT = Number(process.env.SG_SCENARIO_PORT || 4180)

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.map': 'application/json; charset=utf-8',
}

// ── Serveur statique minimal (un dossier = un domaine) ─────────────────────
function serveDir(dir) {
  const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0])
    if (urlPath.endsWith('/')) urlPath += 'index.html'
    let file = path.join(dir, urlPath)
    if (!file.startsWith(dir)) { res.writeHead(403); res.end(); return }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      const fallback = path.join(dir, 'index.html')
      if (fs.existsSync(fallback)) { file = fallback } else { res.writeHead(404); res.end('not found'); return }
    }
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream'
    res.writeHead(200, { 'content-type': type })
    fs.createReadStream(file).pipe(res)
  })
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)))
}

// ── Ouverture d'une fiche plage (mêmes sélecteurs que l'audit parcours) ───
async function openBeachDetail(page) {
  const pickers = ['.sg-maplabel', '.sg-l-card', 'button.lc-card', '.blv-row', '[data-beach]', '.hj-card']
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const sel of pickers) {
      const el = await page.$(sel)
      if (!el) continue
      try { await el.click({ timeout: 4000 }); return sel } catch (_) {}
    }
    await page.evaluate((sels) => {
      for (const sel of sels) {
        const el = document.querySelector(sel)
        if (el) { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); return }
      }
    }, pickers)
    await page.waitForTimeout(2500)
  }
  return null
}

async function runScenario(browser, region, viewport, baseUrl) {
  const viewportSize = viewport === 'mobile'
    ? { width: 390, height: 844, isMobile: true, hasTouch: true }
    : { width: 1280, height: 800 }
  const context = await browser.newContext({
    viewport: { width: viewportSize.width, height: viewportSize.height },
    isMobile: viewportSize.isMobile || false,
    hasTouch: viewportSize.hasTouch || false,
    locale: region.primaryLang === 'es' ? 'es' : region.primaryLang === 'en' ? 'en' : 'fr'
  })
  const page = await context.newPage()
  const consoleErrors = []
  const failedRequests = []
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160)) })
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + String(e.message || e).slice(0, 160)))
  page.on('requestfailed', (req) => {
    const reason = req.failure()?.errorText || 'request failed'
    if (/ERR_ABORTED|NS_BINDING_ABORTED|ERR_CANCELED/i.test(reason)) return
    failedRequests.push(reason + ' ' + req.url().slice(0, 160))
  })

  const result = {
    region: region.id, domain: region.domain, viewport, baseUrl,
    ficheOpen: false, picker: null, decisionUi: null, observation: null,
    failClosed: false, consoleErrors, failedRequests, screenshot: null
  }

  try {
    await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(4000)

    // Bandeau cookies : accepter/refuser avant de naviguer.
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => /^(Accepter|Accept|Aceptar|Refuser|Decline)$/i.test((x.textContent || '').trim()))
      if (b) b.click()
    })
    await page.waitForTimeout(1200)

    // Observation servie par le package régional (source de vérité).
    result.observation = await page.evaluate(async () => {
      const r = await fetch('/api/copernicus/sargassum.json', { cache: 'no-store' })
      if (!r.ok) return { ok: false, reason: 'HTTP ' + r.status }
      const p = await r.json()
      const ts = Date.parse(p.erddapTimestamp || '')
      return {
        ok: true, source: p.source, erddapTimestamp: p.erddapTimestamp,
        ageMinutes: Number.isFinite(ts) ? Math.round((Date.now() - ts) / 60000) : null,
        stale: p.stale, levels: Array.isArray(p.levels) ? p.levels.length : null
      }
    })

    result.picker = await openBeachDetail(page)
    await page.waitForTimeout(2500)

    result.ficheOpen = await page.evaluate(() =>
      !!document.querySelector('.lc-detail, .bsc-sheet, .sheet') ||
      /7 PROCHAINS JOURS|PRÉVISION SUSPENDUE|NEXT 7 DAYS|FORECAST PAUSED|PRONÓSTICO EN PAUSA/i.test(document.body.innerText))

    if (result.ficheOpen) {
      result.decisionUi = await measureDetailDecisionUi(page)
      result.failClosed = isFailClosedDecisionUi(result.decisionUi)
    }

    fs.mkdirSync(SHOTS, { recursive: true })
    const shot = path.join(SHOTS, `code-only-${region.id}-${viewport}.png`)
    await page.screenshot({ path: shot }).catch(() => {})
    result.screenshot = shot
  } catch (error) {
    result.error = String(error?.message || error).slice(0, 200)
  } finally {
    await context.close().catch(() => {})
  }
  return result
}

async function main() {
  const only = process.env.SG_ONLY_REGIONS ? process.env.SG_ONLY_REGIONS.split(',') : null
  const regions = getAllRegions().filter(r => r.live !== false && (!only || only.includes(r.id)))
  const viewports = ['desktop', 'mobile']
  const browser = await chromium.launch({ headless: true })
  const results = []
  let server = null

  try {
    for (const region of regions) {
      const dir = path.join(ROOT, region.ftpDir)
      if (!fs.existsSync(dir)) {
        console.error(`[${region.id}] PACKAGE ABSENT : ${dir} — lancer prepare-ftp pour cette région`)
        results.push({ region: region.id, viewport: 'all', error: 'package absent' })
        continue
      }
      if (server) { await new Promise(r => server.close(r)); server = null }
      server = await serveDir(dir)
      const baseUrl = `http://127.0.0.1:${PORT}`
      for (const viewport of viewports) {
        const r = await runScenario(browser, region, viewport, baseUrl)
        results.push(r)
        const ui = r.decisionUi || {}
        console.log(
          `[${r.region}@${r.viewport}] fiche=${r.ficheOpen} failClosed=${r.failClosed} ` +
          `score=${ui.hasCurrentScore} paused=${ui.scorePaused} forecast=${ui.hasForecast} ` +
          `fcPaused=${ui.forecastPaused} head="${(ui.head || '').slice(0, 28)}" ` +
          `age=${r.observation && r.observation.ageMinutes}min err=${r.consoleErrors.length}/${r.failedRequests.length}`
        )
      }
    }
  } finally {
    if (server) await new Promise(r => server.close(r))
    await browser.close().catch(() => {})
  }

  const out = path.join(ROOT, 'scripts', 'automation', 'data', 'code-only-12-scenarios.json')
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2), 'utf8')

  const scenarios = results.filter(r => r.viewport !== 'all')
  const passed = scenarios.filter(r => r.failClosed).length
  const errors = scenarios.filter(r => (r.consoleErrors && r.consoleErrors.length) || (r.failedRequests && r.failedRequests.length)).length
  console.log('')
  console.log(`SCENARIOS=${scenarios.length} FAIL_CLOSED=${passed} CONSOLE_OR_NET_ERRORS=${errors}`)
  console.log(`REPORT=${out}`)
  if (passed !== scenarios.length) process.exitCode = 1
}

main().catch((error) => { console.error(error); process.exit(1) })
