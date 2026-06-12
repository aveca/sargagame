// Smoke /jeu/ (prod) + toast AFK : page multilingue, data live, défi URL, toast après idle.
const { chromium } = require('playwright')
const http = require('http')
const fs = require('fs')
const path = require('path')
const DIST = path.resolve(__dirname, '../../dist')
const PORT = 4183
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

  // ── /jeu/ : chargement, photo live, défi URL, partie complète courte ──
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const pg = await ctx.newPage()
  const errs = []
  pg.on('pageerror', e => errs.push(e.message.slice(0, 140)))
  await pg.goto(`http://localhost:${PORT}/jeu/?defi=120`, { waitUntil: 'domcontentloaded' })
  await sleep(3500)
  check('titre FR (domaine localhost→fr)', /Sauve/i.test(await pg.locator('#startTitle').innerText()))
  check('défi URL affiché', /120/.test(await pg.locator('#defiTxt').innerText().catch(() => '')))
  const bgOk = await pg.evaluate(() => { const i = document.getElementById('bg'); return i.complete && i.naturalWidth > 100 })
  check('photo live chargée (data réelle)', bgOk)
  await pg.screenshot({ path: path.join(__dirname, 'game-prod-start.png') })
  await pg.click('#btnStart')
  await sleep(3000)
  const sgCount = await pg.locator('.sg').count()
  check('sargasses spawnent', sgCount > 0)
  // fin de partie : attendre la défaite (~25-40s sans jouer)
  await pg.waitForSelector('#endPanel', { state: 'visible', timeout: 55000 })
  const verdict = await pg.locator('#endVerdict').innerText()
  check('verdict réel en fin de partie', verdict.length > 10)
  console.log('     verdict: ' + verdict)
  await pg.screenshot({ path: path.join(__dirname, 'game-prod-end.png') })
  check('zéro pageerror /jeu/', errs.length === 0)
  if (errs.length) console.log('     ' + errs.join(' | '))

  // ── Toast AFK dans l'app : idle 46s sur la home, hero fermé ──
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const pg2 = await ctx2.newPage()
  const errs2 = []
  pg2.on('pageerror', e => errs2.push(e.message.slice(0, 140)))
  await pg2.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' })
  // ferme le hero (geste = reset du timer idle, ok) puis ne touche plus à rien
  try {
    const ghost = pg2.locator('button:has-text("Toutes les plages")')
    await ghost.waitFor({ state: 'visible', timeout: 12000 })
    await ghost.click()
  } catch (_) {}
  await sleep(47000)
  const toast = await pg2.locator('a[href^="/jeu/"]').isVisible().catch(() => false)
  check('toast AFK après 45s idle', toast)
  if (toast) await pg2.screenshot({ path: path.join(__dirname, 'toast-idle.png') })
  check('zéro pageerror app', errs2.length === 0)
  if (errs2.length) console.log('     ' + errs2.join(' | '))

  await browser.close(); srv.close()
  console.log(fails.length ? `\n${fails.length} échec(s)` : '\nSMOKE JEU OK')
  process.exit(fails.length ? 1 : 0)
})().catch(e => { console.error('FAIL', e.message); process.exit(1) })
