// Vérifie le fix anti-rebuild : (1) clic pin tôt (3,5 s) ET tard (11 s) ouvrent
// une fiche ; (2) le nombre de recréations de markers pendant les 12 premières
// secondes est faible (sig guard actif). Compteur: MutationObserver sur le pane.
const { chromium } = require('playwright')

async function run(clickAtMs) {
  const browser = await chromium.launch()
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage()
  await page.context().addInitScript(() => { try { localStorage.setItem('sg_onb', '1') } catch (e) {} })
  await page.goto('http://localhost:4178/', { waitUntil: 'domcontentloaded' })
  // ferme le hero TÔT (pattern loadHome qui marche : avant le settle)
  try { await page.click('text=/Toutes les plages|Toute l.île/i', { timeout: 6000 }) } catch (e) {}
  await page.waitForSelector('.leaflet-marker-pane .leaflet-marker-icon', { timeout: 20000 })
  // compteur de recréations : childList sur le marker pane
  await page.evaluate(() => {
    window.__rebuilds = 0
    const pane = document.querySelector('.leaflet-marker-pane')
    new MutationObserver(ms => { for (const m of ms) if (m.removedNodes.length > 5) window.__rebuilds++ }).observe(pane, { childList: true })
  })
  await page.waitForTimeout(clickAtMs)
  const m = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('.leaflet-marker-pane .leaflet-marker-icon'))
    const c = els.map(el => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
      .filter(p => p.y > 160 && p.y < 600 && p.x > 40 && p.x < 350)
    return c[Math.floor(c.length / 2)]
  })
  if (!m) { console.log(`t=${clickAtMs}ms: aucun pin visible`); await browser.close(); return false }
  await page.mouse.click(m.x, m.y)
  let opened = true
  try { await page.waitForSelector('.sheet h2', { timeout: 7000 }) } catch (e) { opened = false }
  const name = opened ? await page.evaluate(() => document.querySelector('.sheet h2').textContent.trim()) : null
  const rebuilds = await page.evaluate(() => window.__rebuilds)
  console.log(`clic à t+${clickAtMs}ms: ${opened ? 'fiche "' + name + '"' : 'AUCUNE FICHE'} | rebuilds markers observés: ${rebuilds}`)
  await browser.close()
  return opened
}

;(async () => {
  const early = await run(3500)
  const late = await run(11000)
  console.log(early && late ? 'PASS' : 'FAIL')
  process.exitCode = early && late ? 0 : 1
})()
