// Audit live Miami round 2 : fermer le hero, puis tester le clic sur CHAQUE pin + inventaire chrome map.
const { chromium } = require('playwright')
const path = require('path')
const sleep = ms => new Promise(r => setTimeout(r, ms))
;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  const pg = await ctx.newPage()
  const errs = []
  pg.on('pageerror', e => errs.push(e.message.slice(0, 200)))

  await pg.goto('https://sargassummiami.com/', { waitUntil: 'domcontentloaded' })
  await sleep(3500)
  // SW + bundle version
  const ver = await pg.evaluate(async () => {
    const keys = await caches.keys().catch(() => [])
    const js = [...document.querySelectorAll('script[src*="index-"]')].map(s => s.src.slice(-22))
    return { caches: keys, js }
  })
  console.log('SW caches:', JSON.stringify(ver.caches), '| bundle:', ver.js.join(','))

  // Fermer le hero
  const dis = pg.locator('text=All beaches on the map').first()
  if (await dis.isVisible().catch(() => false)) { await dis.click(); await sleep(1500) }
  await pg.screenshot({ path: path.join(__dirname, 'miami-4-map-screen.png') })

  // Chrome visible sur l'écran map
  const chrome = await pg.evaluate(() => {
    const els = [...document.querySelectorAll('button, a, input, .leaflet-control a')]
    return els.filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top < 844 && r.bottom > 0 })
      .map(e => (e.innerText || e.getAttribute('aria-label') || e.title || '?').replace(/\n/g, ' ').slice(0, 30))
  })
  console.log('=== écran MAP : ' + chrome.length + ' éléments interactifs visibles ===')
  console.log(chrome.join(' | '))

  // Clic sur chaque pin → un sheet/panneau s'ouvre ?
  const pins = await pg.locator('.leaflet-marker-icon').count()
  console.log('=== pins:', pins, '===')
  let ok = 0, ko = []
  for (let i = 0; i < pins; i++) {
    const before = await pg.evaluate(() => document.body.innerText.length)
    const box = await pg.locator('.leaflet-marker-icon').nth(i).boundingBox().catch(() => null)
    if (!box) { ko.push(i + ':no-box'); continue }
    await pg.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await sleep(1300)
    // un sheet ouvert contient "7-day" ou "forecast" ou "weather" ou un bouton close
    const opened = await pg.evaluate(() => {
      const t = document.body.innerText
      return /7.day|forecast|UV|wind|swim/i.test(t) && t.length
    })
    const after = await pg.evaluate(() => document.body.innerText.length)
    if (opened && after !== before) { ok++; if (i === 0) await pg.screenshot({ path: path.join(__dirname, 'miami-5-sheet-open.png') }) }
    else ko.push(i + ':rien(' + before + '→' + after + ')')
    // fermer le sheet éventuel
    await pg.keyboard.press('Escape'); await sleep(400)
    const close = pg.locator('button:has-text("✕"), button:has-text("×"), [aria-label*=lose]').first()
    if (await close.isVisible().catch(() => false)) { await close.click(); await sleep(400) }
  }
  console.log('clics pins OK:', ok + '/' + pins, '| échecs:', ko.join(', ') || 'aucun')
  console.log('pageerrors:', errs.length ? errs.join(' || ') : '0')
  await browser.close()
})().catch(e => { console.error('FAIL', e.message); process.exit(1) })
