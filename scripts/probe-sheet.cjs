// Probe: which sheet renders + console errors on pin click.
const { chromium } = require('playwright')
const http = require('http')
const fs = require('fs')
const path = require('path')
const DIST = path.resolve('dist')
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
;(async () => {
  const srv = http.createServer((req, res) => {
    try {
      let p = decodeURIComponent(req.url.split('?')[0])
      if (p.endsWith('/')) p += 'index.html'
      let f = path.join(DIST, p)
      if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, 'index.html')
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' })
      fs.createReadStream(f).pipe(res)
    } catch (e) { res.writeHead(500); res.end() }
  })
  await new Promise((r) => srv.listen(4179, '127.0.0.1', r))
  const browser = await chromium.launch()
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage()
  const errs = []
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)) })
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + String(e).slice(0, 400)))
  await page.goto('http://127.0.0.1:4179/?cookiebanner=0', { waitUntil: 'domcontentloaded', timeout: 30000 })
  try { await page.evaluate(() => localStorage.setItem('sg_cookie_consent', 'denied')) } catch (_) {}
  await sleep(6000)
  await page.waitForSelector('.sg-maplabel, svg g[data-beach], [data-beach]', { timeout: 20000 }).catch(() => null)
  const survey = await page.evaluate(() => ({
    maplabels: document.querySelectorAll('.sg-maplabel').length,
    databeach: document.querySelectorAll('svg g[data-beach], [data-beach]').length,
    archipel: !!document.querySelector('.archipel, [class*="archipel"]'),
    worldmap: !!document.querySelector('.wm-root, [class*="worldmap"], svg.world'),
    svgCount: document.querySelectorAll('svg').length,
    view: (document.querySelector('[data-view]') || {}).textContent,
    url: location.href,
  }))
  console.log('SURVEY:', JSON.stringify(survey))
  await page.evaluate(() => {
    const lbl = [...document.querySelectorAll('.sg-maplabel')].find((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.top >= 0 && r.top < innerHeight })
    if (lbl) { lbl.dispatchEvent(new MouseEvent('click', { bubbles: true })); return }
    const els = [...document.querySelectorAll('svg g[data-beach], [data-beach]')]
    const vis = els.find((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.top >= 0 && r.top < innerHeight })
    ;(vis || els[0]).dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await sleep(2500)
  const info = await page.evaluate(() => ({
    bsc: !!document.querySelector('.bsc-sheet, .bsc-fiche'),
    legacy: [...document.querySelectorAll('[role="dialog"]')].map((d) => d.className).join('|'),
    h1: [...document.querySelectorAll('h1')].map((h) => h.innerText.slice(0, 40)),
    errBound: document.body.innerText.slice(0, 200),
  }))
  console.log('SHEET:', JSON.stringify(info, null, 1))
  console.log('ERRORS:', JSON.stringify(errs.slice(0, 10), null, 1))
  await browser.close()
  srv.close()
})().catch((e) => { console.error('FATAL', e); process.exit(1) })
