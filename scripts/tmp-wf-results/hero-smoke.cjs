// Smoke test Hero Verdict sur le build dist/ — affichage, CTA→fiche, dismiss→carte,
// 1×/session, jamais sur deep-link. Screenshots mobile+desktop.
const { chromium } = require('playwright')
const http = require('http')
const fs = require('fs')
const path = require('path')
const DIST = path.resolve(__dirname, '../../dist')
const PORT = 4181
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
const check = (name, ok) => { console.log((ok ? 'OK  ' : 'FAIL') + ' ' + name); if (!ok) fails.push(name) }
;(async () => {
  await new Promise((r, j) => { srv.on('error', j); srv.listen(PORT, r) })
  const browser = await chromium.launch()

  // ── 1+2+3 : mobile, hero → CTA → fiche, puis re-visite même session ──
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const pg = await ctx.newPage()
  const errs = []
  pg.on('pageerror', e => errs.push(e.message.slice(0, 150)))
  await pg.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' })
  const cta = pg.locator('button:has-text("Voir cette plage")')
  let heroShown = true
  try { await cta.waitFor({ state: 'visible', timeout: 12000 }) } catch (_) { heroShown = false }
  check('hero affiché (mobile)', heroShown)
  let beachName = ''
  if (heroShown) {
    beachName = (await pg.locator('[role=dialog] h1').first().textContent() || '').trim()
    console.log('     plage hero: ' + beachName)
    check('verdict présent', /AUJOURD'HUI|TODAY|HOY/i.test(await pg.locator('[role=dialog]').innerText()))
    const img = await pg.locator('[role=dialog] img').first().evaluate(i => i.complete && i.naturalWidth > 100).catch(() => false)
    check('photo chargée', img)
    await pg.screenshot({ path: path.join(__dirname, 'hero-live-mobile.png') })
    await cta.click()
    await sleep(1500)
    const sheetTxt = await pg.evaluate(() => { const s = document.querySelector('.sheet'); return s ? s.innerText.slice(0, 400) : '' })
    check('CTA → fiche de la même plage', beachName && sheetTxt.toUpperCase().includes(beachName.toUpperCase().slice(0, 8)))
    await pg.screenshot({ path: path.join(__dirname, 'hero-live-sheet.png') })
    await pg.keyboard.press('Escape'); await sleep(500)
    await pg.reload({ waitUntil: 'domcontentloaded' }); await sleep(6000)
    check('pas de re-show même session', !(await cta.isVisible().catch(() => false)))
  }
  check('zéro pageerror', errs.length === 0)
  if (errs.length) console.log('     errors: ' + errs.join(' | '))

  // ── 4 : deep-link → jamais de hero ──
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const pg2 = await ctx2.newPage()
  await pg2.goto(`http://localhost:${PORT}/plages/grande-anse/`, { waitUntil: 'domcontentloaded' })
  await sleep(7000)
  check('deep-link sans hero', !(await pg2.locator('button:has-text("Voir cette plage")').isVisible().catch(() => false)))

  // ── 5 : desktop ──
  const ctx3 = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const pg3 = await ctx3.newPage()
  await pg3.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' })
  const cta3 = pg3.locator('button:has-text("Voir cette plage")')
  let desk = true
  try { await cta3.waitFor({ state: 'visible', timeout: 12000 }) } catch (_) { desk = false }
  check('hero affiché (desktop)', desk)
  if (desk) await pg3.screenshot({ path: path.join(__dirname, 'hero-live-desktop.png') })

  await browser.close(); srv.close()
  console.log(fails.length ? `\n${fails.length} échec(s)` : '\nSMOKE HERO OK')
  process.exit(fails.length ? 1 : 0)
})().catch(e => { console.error('FAIL', e.message); process.exit(1) })
