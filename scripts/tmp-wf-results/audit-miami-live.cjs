// Audit live sargassummiami.com : hero au load, chrome map (épuré ?), clic pins, erreurs console.
const { chromium } = require('playwright')
const path = require('path')
const sleep = ms => new Promise(r => setTimeout(r, ms))
;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  const pg = await ctx.newPage()
  const errs = [], net404 = []
  pg.on('pageerror', e => errs.push(e.message.slice(0, 200)))
  pg.on('response', r => { if (r.status() >= 400) net404.push(r.status() + ' ' + r.url().slice(0, 110)) })

  await pg.goto('https://sargassummiami.com/', { waitUntil: 'domcontentloaded' })
  await sleep(2500)
  await pg.screenshot({ path: path.join(__dirname, 'miami-1-load-2.5s.png') })

  // Hero présent ? image chargée ?
  const hero = await pg.evaluate(() => {
    const imgs = [...document.querySelectorAll('img')].map(i => ({ src: (i.currentSrc || i.src || '').slice(-60), w: i.naturalWidth, vis: !!(i.offsetWidth && i.offsetHeight), cls: i.className.slice(0, 30) }))
    const txt = document.body.innerText.slice(0, 600)
    return { imgs: imgs.filter(i => i.vis), txt }
  })
  console.log('=== TEXTE 1er écran ===')
  console.log(hero.txt.replace(/\n+/g, ' | ').slice(0, 400))
  console.log('=== IMAGES visibles ===')
  hero.imgs.forEach(i => console.log('  ', JSON.stringify(i)))

  await sleep(4000)
  await pg.screenshot({ path: path.join(__dirname, 'miami-2-load-6.5s.png') })

  // Compter le chrome interactif visible (boutons/controles flottants)
  const chrome = await pg.evaluate(() => {
    const els = [...document.querySelectorAll('button, a[role=button], .leaflet-control a, input')]
    return els.filter(e => {
      const r = e.getBoundingClientRect()
      return r.width > 0 && r.height > 0 && r.top < 844 && r.bottom > 0
    }).map(e => (e.innerText || e.getAttribute('aria-label') || e.title || e.className || '?').replace(/\n/g, ' ').slice(0, 38))
  })
  console.log('=== CHROME interactif visible (' + chrome.length + ' éléments) ===')
  chrome.forEach(c => console.log('  •', c))

  // Cliquer un pin de plage (marqueur leaflet)
  const pins = await pg.locator('.leaflet-marker-icon').count()
  console.log('=== PINS leaflet:', pins, '===')
  if (pins > 0) {
    // pin le plus proche du centre
    const box = await pg.locator('.leaflet-marker-icon').nth(Math.floor(pins / 2)).boundingBox()
    if (box) {
      await pg.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
      await sleep(2000)
      await pg.screenshot({ path: path.join(__dirname, 'miami-3-after-pin-click.png') })
      const after = await pg.evaluate(() => document.body.innerText.slice(0, 500))
      console.log('=== APRÈS CLIC PIN ===')
      console.log(after.replace(/\n+/g, ' | ').slice(0, 350))
    }
  }
  console.log('=== pageerrors:', errs.length, '===')
  errs.slice(0, 5).forEach(e => console.log('  !', e))
  console.log('=== HTTP>=400:', net404.length, '===')
  net404.slice(0, 8).forEach(e => console.log('  !', e))
  await browser.close()
})().catch(e => { console.error('FAIL', e.message); process.exit(1) })
