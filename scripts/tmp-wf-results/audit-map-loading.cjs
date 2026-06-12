// Audit live ×5 domaines : « load indéfini à l'apparition de la map ».
// Mesure : temps hero→pins, requêtes échouées/pendantes, erreurs console, spinner persistant.
const { chromium } = require('playwright')
const path = require('path')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const DOMAINS = [
  'https://sargasses-martinique.com',
  'https://sargasses-guadeloupe.com',
  'https://sargassumpuntacana.com',
  'https://sargassummiami.com',
  'https://sargassumcancun.com',
]
;(async () => {
  const browser = await chromium.launch()
  for (const D of DOMAINS) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const pg = await ctx.newPage()
    const errs = [], failed = [], slow = []
    const pending = new Map()
    pg.on('pageerror', e => errs.push(e.message.slice(0, 120)))
    pg.on('request', r => pending.set(r.url(), Date.now()))
    pg.on('requestfinished', r => pending.delete(r.url()))
    pg.on('requestfailed', r => { pending.delete(r.url()); failed.push((r.failure()?.errorText || '?') + ' ' + r.url().slice(0, 100)) })
    pg.on('response', r => { if (r.status() >= 400) failed.push(r.status() + ' ' + r.url().slice(0, 100)) })
    const t0 = Date.now()
    try {
      await pg.goto(D + '/', { waitUntil: 'domcontentloaded', timeout: 30000 })
    } catch (e) { console.log(`\n=== ${D} === GOTO FAIL: ${e.message.slice(0, 100)}`); await ctx.close(); continue }
    await sleep(3500)
    // fermer le hero quel que soit la langue
    for (const sel of ['text=All beaches on the map', 'text=Toutes les plages', 'text=Todas las playas']) {
      const el = pg.locator(sel).first()
      if (await el.isVisible().catch(() => false)) { await el.click().catch(() => {}); break }
    }
    // attendre les pins jusqu'à 25s
    let pins = 0, tMap = null
    for (let i = 0; i < 50; i++) {
      pins = await pg.locator('.leaflet-marker-icon').count().catch(() => 0)
      if (pins > 0) { tMap = Date.now() - t0; break }
      await sleep(500)
    }
    // spinner / loading persistant ?
    const loadingTxt = await pg.evaluate(() => {
      const t = document.body.innerText
      const m = t.match(/chargement|loading|cargando/i)
      return m ? m[0] : null
    })
    const stillPending = [...pending.entries()].filter(([u, ts]) => Date.now() - ts > 8000).map(([u]) => u.slice(0, 110))
    console.log(`\n=== ${D} ===`)
    console.log(`pins: ${pins} | temps→carte: ${tMap ? (tMap / 1000).toFixed(1) + 's' : 'JAMAIS (25s+)'} | loadingTxt: ${loadingTxt || 'non'}`)
    if (failed.length) console.log('échecs réseau:', failed.slice(0, 6).join('\n  '))
    if (stillPending.length) console.log('PENDING >8s:', stillPending.slice(0, 6).join('\n  '))
    if (errs.length) console.log('pageerrors:', errs.slice(0, 3).join(' | '))
    await pg.screenshot({ path: path.join(__dirname, 'mapload-' + D.replace(/https:\/\/|\.com/g, '') + '.png') })
    await ctx.close()
  }
  await browser.close()
})().catch(e => { console.error('FAIL', e.message); process.exit(1) })
