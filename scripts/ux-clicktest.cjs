#!/usr/bin/env node
// Click-test Playwright des 5 domaines live — outil local (non committé).
// Usage: node scripts/ux-clicktest.cjs [domain-filter]
const { chromium } = require('playwright')

const SITES = [
  { id: 'mq', url: 'https://sargasses-martinique.com', lang: 'fr' },
  { id: 'gp', url: 'https://sargasses-guadeloupe.com', lang: 'fr' },
  { id: 'puntacana', url: 'https://sargassumpuntacana.com', lang: 'en' },
  { id: 'florida', url: 'https://sargassummiami.com', lang: 'en' },
  { id: 'rivieramaya', url: 'https://sargassumcancun.com', lang: 'es' },
]

const BENIGN = [/googletagmanager/i, /clarity\.ms/i, /onesignal/i, /net::ERR_BLOCKED_BY_CLIENT/i, /favicon/i]

async function testSite(browser, site) {
  const out = { id: site.id, url: site.url, ok: [], issues: [], consoleErrors: [] }
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  page.on('console', m => {
    if (m.type() === 'error' && !BENIGN.some(r => r.test(m.text()))) out.consoleErrors.push(m.text().slice(0, 200))
  })
  page.on('pageerror', e => out.consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 200)))

  try {
    const t0 = Date.now()
    await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 45000 })
    out.ok.push(`load dom ${Date.now() - t0}ms`)

    // Carte + marqueurs
    try {
      await page.waitForSelector('.leaflet-marker-icon', { timeout: 30000 })
      const n = await page.locator('.leaflet-marker-icon').count()
      if (n === 0) out.issues.push('CRITICAL: 0 marqueur sur la carte')
      else out.ok.push(`${n} marqueurs carte`)

      // Clic sur un marqueur → un panneau/sheet doit apparaître
      const before = await page.evaluate(() => document.body.innerText.length)
      await page.locator('.leaflet-marker-icon').first().click({ force: true })
      await page.waitForTimeout(2500)
      const after = await page.evaluate(() => document.body.innerText.length)
      if (after > before + 30) out.ok.push(`clic marqueur → contenu +${after - before} chars (sheet ouverte)`)
      else {
        // peut être un cluster: re-clic après zoom
        await page.locator('.leaflet-marker-icon').first().click({ force: true })
        await page.waitForTimeout(2500)
        const after2 = await page.evaluate(() => document.body.innerText.length)
        if (after2 > before + 30) out.ok.push('clic marqueur (2e, cluster zoom) → sheet ouverte')
        else out.issues.push('HIGH: clic marqueur sans effet visible (x2)')
      }
    } catch (e) {
      out.issues.push('CRITICAL: carte/marqueurs jamais chargés — ' + String(e).slice(0, 120))
    }

    // Paywall: chercher un déclencheur premium (lock / premium / 7d)
    try {
      const trigger = page.locator('button, [role=button], a').filter({ hasText: /premium|7 ?j|7-day|7 day|pronóstico|prévisions|forecast|desbloque|unlock|débloqu/i }).first()
      if (await trigger.count()) {
        await trigger.click({ force: true, timeout: 5000 })
        await page.waitForTimeout(2000)
        const txt = await page.evaluate(() => document.body.innerText)
        const hasPaywall = /4,99|4\.99|9\.99|\$79|alert|prévenu|entérate|before your beach/i.test(txt)
        if (hasPaywall) out.ok.push('déclencheur premium → paywall visible')
        else out.ok.push('déclencheur premium cliqué (paywall non détecté — peut être autre UI)')
      }
    } catch (e) { /* non bloquant */ }

    await page.screenshot({ path: `clicktest-${site.id}.png` })
  } catch (e) {
    out.issues.push('CRITICAL: chargement échoué — ' + String(e).slice(0, 150))
  }
  if (out.consoleErrors.length) out.issues.push(`console errors x${out.consoleErrors.length}: ${out.consoleErrors.slice(0, 3).join(' | ')}`)
  await ctx.close()
  return out
}

;(async () => {
  const filter = process.argv[2]
  const browser = await chromium.launch({ headless: true })
  const results = []
  for (const s of SITES) {
    if (filter && !s.id.includes(filter)) continue
    process.stderr.write(`→ ${s.id}...\n`)
    results.push(await testSite(browser, s))
  }
  await browser.close()
  console.log(JSON.stringify(results, null, 2))
  const bad = results.filter(r => r.issues.length)
  process.exitCode = bad.some(r => r.issues.some(i => i.startsWith('CRITICAL'))) ? 1 : 0
})()
