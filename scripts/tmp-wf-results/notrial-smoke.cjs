// Smoke NO_TRIAL : sur le build courant (dist/), ouvre le paywall et vérifie
// la copy attendue. Usage: node notrial-smoke.cjs usd|eur
const { chromium } = require('playwright')
const http = require('http')
const fs = require('fs')
const path = require('path')
const MODE = process.argv[2] || 'usd'
const DIST = path.resolve(__dirname, '../../dist')
const PORT = 4187
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' }
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0])
  if (p.endsWith('/')) p += 'index.html'
  let f = path.join(DIST, p)
  try {
    if (!fs.existsSync(f)) f = path.join(DIST, 'index.html')
    if (fs.statSync(f).isDirectory()) f = path.join(f, 'index.html')
    res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream')
    fs.createReadStream(f).pipe(res)
  } catch (e) { res.statusCode = 500; res.end() }
})
const sleep = ms => new Promise(r => setTimeout(r, ms))
const fails = []
const check = (n, ok) => { console.log((ok ? 'OK  ' : 'FAIL') + ' ' + n); if (!ok) fails.push(n) }
;(async () => {
  await new Promise((r, j) => { srv.on('error', j); srv.listen(PORT, r) })
  const browser = await chromium.launch()
  const pg = await browser.newContext({ viewport: { width: 390, height: 844 } }).then(c => c.newPage())
  const errs = []
  pg.on('pageerror', e => errs.push(e.message.slice(0, 140)))
  await pg.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' })
  await pg.evaluate(() => localStorage.setItem('sg_ab', JSON.stringify({ pw_prelude: 0 })))
  await sleep(8000)
  for (let i = 0; i < 2; i++) { await pg.keyboard.press('Escape'); await sleep(300) }
  const prem = pg.locator('button:has-text("Premium")').first()
  await prem.waitFor({ state: 'visible', timeout: 12000 })
  await prem.click()
  await sleep(2200)
  const txt = await pg.evaluate(() => document.body.innerText)
  if (MODE === 'usd') {
    check('CTA "start now/empezar" présent', /start now|empezar ya/i.test(txt))
    check('"billed today/se cobra hoy" présent', /billed today|se cobra hoy/i.test(txt))
    check('AUCUN "7 days free/7 días gratis" visible', !/7 days free|7 días gratis/i.test(txt))
    check('timeline essai (Day 5) ABSENTE', !/Day 5|Día 5/.test(txt))
    check('réassurance sans "Reminder before billed"', !/Reminder before/i.test(txt))
  } else {
    check('CTA "7 jours offerts" présent (EUR intact)', /7 jours offerts/.test(txt))
    check('timeline essai (Jour 5) PRÉSENTE', /Jour 5/.test(txt))
    check('réassurance "Rappel avant facturation" présente', /Rappel avant facturation/.test(txt))
    check('aucun "facturé aujourd\'hui"', !/facturé aujourd'hui/.test(txt))
  }
  await pg.screenshot({ path: path.join(__dirname, `notrial-${MODE}-paywall.png`) })
  check('zéro pageerror', errs.length === 0)
  if (errs.length) console.log('     ' + errs.join(' | '))
  await browser.close(); srv.close()
  console.log(fails.length ? `\n${fails.length} échec(s)` : `\nSMOKE ${MODE.toUpperCase()} OK`)
  process.exit(fails.length ? 1 : 0)
})().catch(e => { console.error('FAIL', e.message); process.exit(1) })
