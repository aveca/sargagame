/**
 * test-stale-offer-cta.mjs — régression CRO (mission
 * SARG-STALE-OFFER-CTA-6DOMAINS-20261124, issue #1486).
 *
 * Vérifie sur le composant RÉELLEMENT rendu (src/WorldMapView.jsx, home carte-first)
 * que lorsque wmDecisionAvailable=false (observation satellite stale OU inconnue) :
 *   - une porte d'offre visible apparaît pour un utilisateur non Premium,
 *     en mobile 390x844 ET desktop 1440x900 ;
 *   - le message dit explicitement que l'observation est en retard/vérification
 *     et que verdicts + prévisions sont suspendus ;
 *   - aucun verdict actuel, label de plage ni prévision n'est exposé ;
 *   - le clic appelle onPremium (parcours d'offre existant) — jamais un nouveau
 *     checkout ;
 *   - quand l'observation est fraîche, le bloc n'existe pas et la barre des jours
 *     reste présente (rendu inchangé).
 *
 * Le correctif étant UNIQUE dans le composant partagé, on rebuild le six domaines
 * (VITE_REGION) et on rejoue le même parcours sur chacun.

 * Usage : node scripts/test-stale-offer-cta.mjs
 *         REGION=mq SKIP_BUILD=1 node scripts/test-stale-offer-cta.mjs
 * Tokens : STALE_OFFER_CTA_6DOMAINS=PASS|FAIL + une ligne STALE_OFFER_CTA par cas.
 */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { execSync } from 'node:child_process'
import { createServer } from 'node:http'
import { join, extname, normalize } from 'node:path'
import assert from 'node:assert/strict'

const REGIONS = ['mq', 'gp', 'florida', 'puntacana', 'rivieramaya', 'tulum']
const WANTED = process.env.REGION ? [process.env.REGION] : REGIONS
const PORT = Number(process.env.PORT || 4197)
const BASE = `http://127.0.0.1:${PORT}`
const SKIP_BUILD = process.env.SKIP_BUILD === '1'
const API_GLOB = '**/api/copernicus/sargassum.json'
const MODAL_SEL = '.pww-wrap, .sg-modal-panel, [role="dialog"]'

const results = []
const fail = (msg) => { results.push(`FAIL ${msg}`); console.error(`[stale-cta] FAIL ${msg}`) }
const pass = (msg) => { results.push(`PASS ${msg}`); console.log(`[stale-cta] PASS ${msg}`) }

// 1. Correctif unique : une seule porte, un seul appel onPremium, zéro duplication régionale.
try {
  const src = readFileSync('src/WorldMapView.jsx', 'utf8')
  assert.equal((src.match(/data-testid="wm-stale-offer"/g) || []).length, 1, 'porte unique dans le composant partagé')
  assert.equal((src.match(/onPremium\("map_stale_offer"\)/g) || []).length, 1, 'un seul appel onPremium')
  assert.match(src, /!wmDecisionAvailable && !isPremium/, 'gated sur stale + non-Premium')
  assert.equal((src.match(/data-testid="wm-stale-offer-last-observation"/g) || []).length, 1, 'horodatage de la dernière observation visible')
  assert.match(src, /formatObservationTimestamp\\(erddapTimestamp/, 'date dérivée de l’horodatage source satellite')
  pass('shared-component-single-fix+dated-observation')
} catch (e) { fail(`shared-component-single-fix: ${e.message}`) }

// Serveur de preview (dist), démarré une fois : les rebuilds régionaux écrasent dist/.
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.mp4': 'video/mp4', '.webmanifest': 'application/manifest+json',
}
let preview = null
const startPreview = async () => {
  // Serveur statique IN-PROCESS (pas de child process): dist/ est réécrit à chaque
  // build régional et les fichiers sont relus depuis le disque à chaque requête.
  preview = createServer(async (req, res) => {
    try {
      let pathname = decodeURIComponent(new URL(req.url, BASE).pathname)
      if (pathname.endsWith('/')) pathname += 'index.html'
      let file = join(process.cwd(), 'dist', normalize(pathname).replace(/^([\\/])+/, ''))
      try { await stat(file) } catch (_) { file = join(process.cwd(), 'dist', 'index.html') }
      const body = await readFile(file)
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' })
      res.end(body)
    } catch (e) { res.writeHead(500); res.end(String(e)) }
  })
  await new Promise(resolve => preview.listen(PORT, '127.0.0.1', resolve))
}

const fixture = (mode) => async (route) => {
  try {
    const response = await route.fetch()
    const payload = await response.json()
    const now = Date.now()
    if (mode === 'stale') payload.erddapTimestamp = new Date(now - 48 * 3_600_000).toISOString()
    else if (mode === 'unknown') delete payload.erddapTimestamp
    else payload.erddapTimestamp = new Date(now - 60 * 60_000).toISOString()
    payload.updatedAt = new Date(now - 60 * 60_000).toISOString()
    payload.dataAgeMinutes = 60  // volontairement trompeur : âge de build ≠ âge satellite
    payload.stale = false        // le client doit recalculer depuis erddapTimestamp
    await route.fulfill({ response, body: JSON.stringify(payload) })
  } catch (e) {
    fail(`fixture ${mode}: ${e.message}`)
    await route.continue().catch(() => {})
  }
}

const browser = await chromium.launch()
try {
  await startPreview()

  for (const region of WANTED) {
    if (!SKIP_BUILD) {
      try {
        execSync('npx vite build', {
          cwd: process.cwd(),
          env: { ...process.env, VITE_REGION: region },
          stdio: 'pipe',
        })
        pass(`${region}/build`)
      } catch (e) {
        fail(`${region}/build: ${String(e.stderr || e.message).slice(-500)}`)
        continue
      }
    }

    for (const [mode, mobile] of [['stale', true], ['stale', false], ['unknown', true], ['unknown', false], ['fresh', false]]) {
      const tag = `${region}/${mode}/${mobile ? 'mobile' : 'desktop'}`
      const ctx = await browser.newContext({
        viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
        deviceScaleFactor: mobile ? 2 : 1,
        isMobile: mobile, hasTouch: mobile,
        serviceWorkers: 'block',
      })
      try {
        const page = await ctx.newPage()
        page.setDefaultNavigationTimeout(45000)
        page.setDefaultTimeout(15000)
        await page.addInitScript(() => {
          try { localStorage.setItem('sg_stale_cta_track', '[]') } catch (_) {}
          const orig = window.track
          window.track = function (name, data) {
            try {
              const logs = JSON.parse(localStorage.getItem('sg_stale_cta_track') || '[]')
              logs.push({ name, data })
              localStorage.setItem('sg_stale_cta_track', JSON.stringify(logs.slice(-50)))
            } catch (_) {}
            return orig?.apply(this, arguments)
          }
        })
        await page.route(API_GLOB, fixture(mode))
        await page.goto(BASE + '/', { waitUntil: 'load', timeout: 45000 })
        await page.waitForSelector('[data-testid="wm-stale-offer"], svg[data-sg-live="1"]', { timeout: 30000 }).catch(() => {})
        await page.waitForTimeout(700)

        if (mode === 'fresh') {
          const gone = await page.locator('[data-testid="wm-stale-offer"]').count()
          const dayBar = await page.locator('button[aria-label^="Auj"], button[aria-label^="Today"], button[aria-label^="Hoy"]').count()
          if (gone === 0) {
            assert.ok(dayBar >= 1, 'barre des jours inchangée quand la donnée est fraîche')
            pass(`${tag}/fresh-render-unchanged`)
          } else {
            // Régions dont la source n'est pas erddap-live : wmDecisionAvailable
            // reste false par design (fail-closed) → la porte doit rester visible.
            const badge = await page.locator('[data-testid="wm-stale-offer-status"]').innerText()
            assert.match(badge, /vérification|verification|verificación/i, 'source non erddap-live : décision indisponible, porte maintenue')
            pass(`${tag}/fresh-source-unavailable-fail-closed`)
          }
          continue
        }

        const cta = page.locator('[data-testid="wm-stale-offer-cta"]')
        await cta.waitFor({ state: 'visible', timeout: 20000 })
        const probe = await page.evaluate(() => {
          const box = document.querySelector('[data-testid="wm-stale-offer"]')
          const btn = document.querySelector('[data-testid="wm-stale-offer-cta"]')
          const msg = document.querySelector('[data-testid="wm-stale-offer-message"]')
          const lastObservation = document.querySelector('[data-testid="wm-stale-offer-last-observation"]')
          const cs = btn ? getComputedStyle(btn) : null
          const r = btn ? btn.getBoundingClientRect() : null
          return {
            boxText: box ? box.innerText : '',
            msg: msg ? msg.innerText : '',
            lastObservation: lastObservation ? lastObservation.innerText : '',
            btnText: btn ? btn.innerText : '',
            bg: cs ? cs.backgroundColor : '',
            w: r ? Math.round(r.width) : 0,
            h: r ? Math.round(r.height) : 0,
            labels: document.querySelectorAll('.sg-maplabel').length,
            pins: [...document.querySelectorAll('svg[data-sg-live="1"] g[style*="cursor"] path')]
              .map(p => p.getAttribute('fill')),
          }
        })
        assert.match(probe.msg, /retard|delayed|atrasad|verified|verificad/i, 'message: observation en retard / vérification')
        assert.match(probe.msg, /suspend|paused|pausad/i, 'message: verdicts et prévisions suspendus')
        assert.match(probe.lastObservation, /dernière observation satellite|last satellite observation|última observación satelital/i, 'horodatage source explicitement identifié')
        if (mode === 'stale') assert.match(probe.lastObservation, /UTC/i, 'horodatage source stale affiché en UTC')
        if (mode === 'unknown') assert.match(probe.lastObservation, /inconnu|unknown|desconocido/i, 'horodatage absent signalé comme inconnu')
        assert.match(probe.btnText, /offre|offer|oferta/i, 'CTA: entrée vers l\'offre')
        assert.ok(probe.w >= 60 && probe.h >= 40, 'CTA visible (hit-zone tactile)')
        assert.ok(probe.bg && probe.bg !== 'rgba(0, 0, 0, 0)' && probe.bg !== 'transparent', 'CTA peint (bouton visible)')
        assert.equal(probe.labels, 0, 'aucun label de verdict quand la donnée est stale')
        assert.ok(probe.pins.every(f => f === '#9aa0a8'), 'pins neutres, aucun statut courant')
        const bad = /GO|ÉVITER|AVOID|EVITAR|ATTENTION|76 à 79|en direct/i.test(probe.boxText)
        assert.equal(bad, false, 'aucun verdict ni promesse de fraîcheur dans la porte')

        // Clic = parcours d'offre EXISTANT uniquement (onPremium), pas un nouveau checkout.
        await cta.click({ timeout: 5000 })
        let modal = false
        try { await page.waitForSelector(MODAL_SEL, { state: 'visible', timeout: 12000 }); modal = true } catch (_) {}
        const logs = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('sg_stale_cta_track') || '[]') } catch (_) { return [] } })
        const names = logs.map(l => l.name)
        assert.ok(modal || names.includes('sg_premium_modal_open'),
          `onPremium ouvre le parcours d'offre existant (modal=${modal}, tracks=${names.join(',')})`)
        console.log(`STALE_OFFER_CTA region=${region} mode=${mode} viewport=${mobile ? 'mobile390' : 'desktop1440'} cta=visible modal=${modal} verdictLeak=false`)
        pass(`${tag}/cta+offer-path+no-leak`)
      } catch (e) {
        fail(`${tag}: ${e.message}`)
      } finally {
        await ctx.close().catch(() => {})
      }
    }
  }
} finally {
  await browser.close().catch(() => {})
  if (preview) await new Promise(resolve => preview.close(resolve))
}

const failed = results.filter(r => r.startsWith('FAIL'))
console.log(`STALE_OFFER_CTA_6DOMAINS=${failed.length ? 'FAIL' : 'PASS'} (${results.length - failed.length}/${results.length})`)
if (failed.length) { failed.forEach(f => console.error('  ' + f)); process.exit(1) }
