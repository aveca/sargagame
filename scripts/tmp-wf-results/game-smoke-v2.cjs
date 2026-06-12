// Smoke /jeu/ v2 : pacing, défi du jour, combo pill, record+pulse, capture email (POST intercepté).
// Sert /jeu/ depuis public/ (changements locaux), le reste depuis dist/ (data réelle).
const { chromium } = require('playwright')
const http = require('http')
const fs = require('fs')
const path = require('path')
const DIST = path.resolve(__dirname, '../../dist')
const PUB = path.resolve(__dirname, '../../public')
const PORT = 4189
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' }
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0])
  if (p.endsWith('/')) p += 'index.html'
  const root = p.startsWith('/jeu/') ? PUB : DIST
  let f = path.join(root, p)
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
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `http://localhost:${PORT}` })
  const pg = await ctx.newPage()
  const errs = []
  pg.on('pageerror', e => errs.push(e.message.slice(0, 160)))
  pg.on('dialog', d => d.accept())
  // Intercepte le POST Apps Script : rien ne part en vrai, on capture le body
  let leadBody = null
  await pg.route('**script.google.com**', route => {
    if (route.request().method() === 'POST') leadBody = route.request().postData()
    route.fulfill({ status: 200, body: 'ok' })
  })

  // ── 1. Défi URL + i18n + photo ──
  await pg.goto(`http://localhost:${PORT}/jeu/?defi=120`, { waitUntil: 'domcontentloaded' })
  await sleep(3000)
  check('titre FR', /Sauve/i.test(await pg.locator('#startTitle').innerText()))
  check('défi ami (URL) affiché', /120/.test(await pg.locator('#defiTxt').innerText().catch(() => '')))
  check('wordmark avec numéro du jour', /#\d+/.test(await pg.locator('#wordmark').innerText()))
  check('photo live chargée', await pg.evaluate(() => { const i = document.getElementById('bg'); return i.complete && i.naturalWidth > 100 }))

  // ── 2. Sans défi : "Défi du jour #N" visible ──
  await pg.goto(`http://localhost:${PORT}/jeu/`, { waitUntil: 'domcontentloaded' })
  await sleep(1200)
  const dayTxt = await pg.locator('#defiTxt').innerText().catch(() => '')
  check('défi du jour affiché par défaut', /#\d+/.test(dayTxt))
  console.log('     defiTxt: ' + dayTxt)

  // ── 3. Pacing : spawns rapides dès le départ ──
  await pg.click('#btnStart')
  await sleep(2000)
  const sgCount = await pg.locator('.sg').count()
  check('pacing v2 : ≥2 sargasses à 2s (burst+0,70s)', sgCount >= 2)
  console.log('     sargasses à 2s: ' + sgCount)

  // ── 4. Auto-play : cliquer vite → combo pill + score ──
  let clicked = 0
  for (let i = 0; i < 14 && clicked < 8; i++) {
    clicked += await pg.evaluate(() => {
      let n = 0
      document.querySelectorAll('.sg:not(.pop)').forEach(el => { el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); n++ })
      return n
    })
    await sleep(450)
  }
  const comboShown = await pg.evaluate(() => document.getElementById('comboPill').style.display === 'block')
  check('combo pill visible pendant une série', comboShown)
  const liveScore = parseInt(await pg.locator('#score').innerText())
  check('score > 0 après clics', liveScore > 0)

  // ── 5. Fin de partie (on laisse perdre) → record + pulse + email ──
  await pg.waitForSelector('#endPanel', { state: 'visible', timeout: 60000 })
  const endMsg = await pg.locator('#endMsg').innerText()
  check('mention record perso (1re partie, score>0)', /record|best|récord/i.test(endMsg))
  check('bouton partage en pulse (jalon)', await pg.evaluate(() => document.getElementById('btnShare').classList.contains('pulse')))
  check('formulaire email visible', await pg.locator('#mailRow').isVisible())
  await pg.fill('#mailIn', 'smoke-test@example.com')
  await pg.click('#mailBtn')
  await sleep(800)
  check('confirmation email affichée', await pg.locator('#mailOk').isVisible())
  check('POST lead intercepté avec source sargacatch', !!leadBody && /sargacatch/.test(leadBody) && /smoke-test@example\.com/.test(leadBody))
  if (leadBody) console.log('     lead: ' + leadBody.slice(0, 140))
  check('sg_email persisté', await pg.evaluate(() => localStorage.getItem('sg_email') === 'smoke-test@example.com'))

  // ── 6. Partage : texte score-card Wordle-style ──
  await pg.click('#btnShare', { force: true }) // anim pulse infinie = "not stable" pour Playwright
  await sleep(600)
  const clip = await pg.evaluate(() => navigator.clipboard.readText().catch(() => ''))
  check('share card "SargaCatch #N … pts"', /SargaCatch #\d+ 🌊 \d+ pts/.test(clip) && /\?defi=\d+/.test(clip))
  console.log('     share: ' + clip.slice(0, 120))

  // ── 7. Replay → repart + email caché (déjà capturé) ──
  await pg.click('#btnReplay')
  await sleep(1500)
  check('replay : partie relancée', await pg.locator('#hud').isVisible())
  await pg.screenshot({ path: path.join(__dirname, 'game-v2-play.png') })
  check('zéro pageerror', errs.length === 0)
  if (errs.length) console.log('     ' + errs.join(' | '))

  await browser.close(); srv.close()
  console.log(fails.length ? `\n${fails.length} échec(s)` : '\nSMOKE JEU V2 OK')
  process.exit(fails.length ? 1 : 0)
})().catch(e => { console.error('FAIL', e.message); process.exit(1) })
