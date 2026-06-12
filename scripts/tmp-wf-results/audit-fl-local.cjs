// Audit build FL local : hero photo curatée + clic sur CHAQUE pin → fiche ouverte (zéro clic mort).
// Sert dist/ avec le mapping prod : /api/copernicus/sargassum.json → florida/sargassum.json
const { chromium } = require('playwright')
const http = require('http')
const fs = require('fs')
const path = require('path')
const DIST = path.resolve(__dirname, '../../dist')
const PORT = 4191
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' }
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0])
  if (p === '/api/copernicus/sargassum.json') p = '/api/copernicus/florida/sargassum.json'
  if (p === '/api/copernicus/history.json') p = '/api/copernicus/florida/history.json'
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
  const pg = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }).then(c => c.newPage())
  const errs = []
  pg.on('pageerror', e => errs.push(e.message.slice(0, 160)))

  await pg.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' })
  await sleep(4000)
  // Hero : photo curatée (fl011/fl012/fl003 attendues, plus jamais fl007 mangrove)
  const heroImg = await pg.evaluate(() => {
    const im = [...document.querySelectorAll('img')].find(i => /beaches\//.test(i.currentSrc || i.src) && i.offsetWidth > 200)
    return im ? (im.currentSrc || im.src).split('/').pop() : null
  })
  check('hero photo ∈ {fl011,fl012,fl003,fl005,fl009} (curation)', /fl011|fl012|fl003|fl005|fl009/.test(heroImg || ''))
  console.log('     hero photo: ' + heroImg)
  // Boucle vidéo : élément présent, source /videos/hero/, lecture en cours
  await sleep(4500)
  const vid = await pg.evaluate(() => {
    const v = document.querySelector('video')
    return v ? { src: v.src.split('/').pop(), t: v.currentTime, paused: v.paused, op: getComputedStyle(v).opacity } : null
  })
  check('hero VIDÉO en lecture (drone loop)', !!vid && vid.t > 0.2 && !vid.paused && parseFloat(vid.op) > 0.8)
  console.log('     video: ' + JSON.stringify(vid))
  await pg.screenshot({ path: path.join(__dirname, 'fl-local-1-hero.png') })

  // Fermer le hero
  const dis = pg.locator('text=All beaches on the map').first()
  if (await dis.isVisible().catch(() => false)) { await dis.click(); await sleep(1500) }

  // Clic sur chaque pin → fiche ouverte. Protocole déterministe : 1 reload par pin
  // (état frais = vrai visiteur ; évite de se battre avec zoom/re-render entre clics).
  let ok = 0, ko = []
  for (let i = 0; i < 12; i++) {
    await pg.reload({ waitUntil: 'domcontentloaded' })
    await sleep(2800) // data + markers prêts (hero déjà vu en sessionStorage)
    const pins = await pg.locator('.leaflet-marker-icon').count()
    if (i >= pins) break
    const box = await pg.locator('.leaflet-marker-icon').nth(i).boundingBox().catch(() => null)
    if (!box || box.y < 0 || box.y > 844) { ko.push(i + ':hors-écran'); continue }
    await pg.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await sleep(2400) // zoom anim + moveend + open
    const opened = await pg.evaluate(() => /7-day|7 day|forecast|UV|wind/i.test(document.body.innerText))
    if (opened) {
      ok++
      if (ok === 1) await pg.screenshot({ path: path.join(__dirname, 'fl-local-2-sheet.png') })
    } else ko.push(String(i))
  }
  check('clics pins : 12/12 ouvrent une fiche', ok === 12)
  console.log('     ouverts: ' + ok + '/12' + (ko.length ? ' | morts: ' + ko.join(',') : ''))
  check('zéro pageerror', errs.length === 0)
  if (errs.length) console.log('     ' + errs.join(' | '))
  await browser.close(); srv.close()
  console.log(fails.length ? `\n${fails.length} échec(s)` : '\nAUDIT FL LOCAL OK')
  process.exit(fails.length ? 1 : 0)
})().catch(e => { console.error('FAIL', e.message); process.exit(1) })
