// Smoke test PremiumModal sur le build local (dist/) — vérifie que le modal
// rend sans crash avec le nouveau code (timeline, cards dynamiques, cadrage/jour)
const { chromium } = require('playwright')
const http = require('http')
const fs = require('fs')
const path = require('path')
const DIST = path.resolve(__dirname, '../../dist')
const PORT = 4179
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' }
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0])
  if (p.endsWith('/')) p += 'index.html'
  let f = path.join(DIST, p)
  if (!fs.existsSync(f)) f = path.join(DIST, 'index.html')
  if (fs.statSync(f).isDirectory()) f = path.join(f, 'index.html')
  res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream')
  fs.createReadStream(f).pipe(res)
})
const sleep = ms => new Promise(r => setTimeout(r, ms))
;(async () => {
  await new Promise(r => srv.listen(PORT, r))
  const browser = await chromium.launch()
  const page = await browser.newContext({ viewport: { width: 390, height: 844 } }).then(c => c.newPage())
  const errors = []
  page.on('pageerror', e => errors.push(e.message.slice(0, 200)))
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => localStorage.setItem('sg_ab', JSON.stringify({ pw_prelude: 0 })))
  await sleep(9500)
  for (let i = 0; i < 2; i++) { await page.keyboard.press('Escape'); await sleep(300) }
  // Ouvre le paywall via l'onglet Premium du dock (même geste que tmp-test-onsite)
  let opened = false
  try {
    const prem = page.locator('button:has-text("Premium")').first()
    await prem.waitFor({ state: 'visible', timeout: 12000 })
    await prem.click()
    opened = true
  } catch (_) {
    const dump = await page.evaluate(() => ({
      buttons: [...document.querySelectorAll('button')].slice(0, 25).map(x => (x.textContent || '').trim().slice(0, 22)).filter(Boolean),
      bodyStart: document.body.innerText.slice(0, 300),
      root: !!document.querySelector('#root') && document.querySelector('#root').children.length,
    }))
    console.log('DEBUG:', JSON.stringify(dump))
  }
  await sleep(2500)
  const checks = await page.evaluate(() => {
    const txt = document.body.innerText
    return {
      modalVisible: /7 jours offerts|Activer ma reco/.test(txt),
      timeline: /Jour 5/.test(txt) && /Jour 7/.test(txt),
      reassurance2clics: /Annulation en 2 clics/.test(txt),
      perDay: /\/jour/.test(txt),
      proofLine: /plages (propres|suivies)/.test(txt),
      aproposLink: !!document.querySelector('a[href="/a-propos/"]'),
      old135: /135 plages surveillées/.test(txt),
      oldAnnule1clic: /[Aa]nnule en 1 clic/.test(txt),
      cardWeekend: /Samedi/.test(txt),
    }
  })
  await page.screenshot({ path: path.join(__dirname, 'paywall-smoke.png'), fullPage: false })
  console.log('opened:', opened, '| pageerrors:', errors.length ? errors : 'aucune')
  console.log(JSON.stringify(checks, null, 1))
  const ok = opened && !errors.length && checks.modalVisible && checks.timeline && checks.reassurance2clics && !checks.old135
  console.log(ok ? 'SMOKE OK' : 'SMOKE FAIL')
  await browser.close(); srv.close()
  process.exit(ok ? 0 : 1)
})().catch(e => { console.error('FAIL', e.message); process.exit(1) })
