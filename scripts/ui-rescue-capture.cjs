// UI/UX RESCUE — Phase A capture matrix (AUDIT ONLY, read-only).
// Sert dist/ via serveur statique embarqué (SPA fallback) + Playwright :
// viewports 390x844 / 768x1024 / 1440x900, états home/sheet/paywall/list/pro/statiques.
// Sortie : .ai/ui-audit/shots/<viewport>/<name>.png + manifest.json (DOM metrics).
const { chromium } = require('playwright')
const http = require('http')
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const DIST = path.join(ROOT, 'dist')
const OUT = path.join(ROOT, '.ai', 'ui-audit', 'shots')
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' }

function serve(dist, port) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      try {
        let p = decodeURIComponent(req.url.split('?')[0])
        if (p.endsWith('/')) p += 'index.html'
        let f = path.join(dist, p)
        if (!f.startsWith(dist)) { res.writeHead(403); res.end(); return }
        if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) {
          // SPA fallback, sauf assets avec extension (404 honnête)
          if (/\.[a-z0-9]+$/i.test(p) && !p.endsWith('.html')) { res.writeHead(404); res.end('nf'); return }
          f = path.join(dist, 'index.html')
        }
        const ext = path.extname(f).toLowerCase()
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
        fs.createReadStream(f).pipe(res)
      } catch (e) { res.writeHead(500); res.end('err') }
    })
    srv.listen(port, '127.0.0.1', () => resolve(srv))
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Évalue les métriques DOM testables d'un écran (boutons, headings, overflow, focus).
async function domMetrics(page) {
  return page.evaluate(() => {
    const lum = (rgb) => {
      const m = rgb.match(/[\d.]+/g)
      if (!m) return null
      let [r, g, b] = m.slice(0, 3).map(Number)
      if (rgb.includes('%')) { r = r * 2.55; g = g * 2.55; b = b * 2.55 }
      const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    const bgAt = (el) => {
      let n = el
      while (n && n !== document.documentElement) {
        const bg = getComputedStyle(n).backgroundColor
        const m = bg.match(/[\d.]+/g)
        if (m && Number(m[3] ?? 1) > 0.9 && !(Number(m[0]) === 0 && Number(m[1]) === 0 && Number(m[2]) === 0 && Number(m[3] ?? 1) === 0)) {
          if (!(Number(m[0]) === 0 && Number(m[1]) === 0 && Number(m[2]) === 0 && Number(m[3]) < 1)) return bg
        }
        n = n.parentElement
      }
      return 'rgb(255, 255, 255)'
    }
    const btns = [...document.querySelectorAll('button, a[role="button"], input[type="submit"], [role="button"]')]
      .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 })
      .slice(0, 60)
      .map((e) => {
        const r = e.getBoundingClientRect()
        const cs = getComputedStyle(e)
        const fg = cs.color
        let ratio = null
        try {
          const L1 = lum(fg), L2 = lum(bgAt(e))
          if (L1 != null && L2 != null) ratio = ((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05))
        } catch (_) {}
        const label = (e.innerText || e.getAttribute('aria-label') || e.value || e.tagName).trim().slice(0, 60)
        return { label, w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), fg, bg: cs.backgroundColor, ratio: ratio ? +ratio.toFixed(2) : null, visible: r.bottom > 0 && r.top < innerHeight, fontSize: cs.fontSize, fontWeight: cs.fontWeight }
      })
    const headings = [...document.querySelectorAll('h1,h2,h3')].slice(0, 12).map((h) => {
      const r = h.getBoundingClientRect()
      const cs = getComputedStyle(h)
      return { tag: h.tagName, text: h.innerText.trim().slice(0, 80), size: cs.fontSize, top: Math.round(r.top) }
    })
    const doc = document.documentElement
    return {
      buttons: btns,
      headings,
      scrollH: doc.scrollHeight, viewportH: innerHeight,
      overflowX: doc.scrollWidth > innerWidth + 1,
      docWidth: doc.scrollWidth, winWidth: innerWidth,
      h1count: document.querySelectorAll('h1').length,
      dialogs: [...document.querySelectorAll('[role="dialog"]')].length,
      bodyText: document.body.innerText.slice(0, 1500),
      errors: [...document.querySelectorAll('*')].filter((e) => /undefined|NaN/i.test(e.innerText || '')).length,
    }
  })
}

async function shot(page, outDir, name, fullPage = false) {
  const p = path.join(outDir, name + '.png')
  await page.screenshot({ path: p, fullPage })
  return p
}

async function newPage(browser, vp, qs = '') {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1 })
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('sg_cookie_consent', 'denied')
      localStorage.setItem('sg_visit_count', '3')
    } catch (_) {}
  })
  const page = await ctx.newPage()
  page._ctx = ctx
  return page
}

async function openSheet(page) {
  // Ouvre la fiche plage via le premier pin/label data-beach (WorldMapView).
  await page.waitForSelector('svg g[data-beach], [data-beach]', { timeout: 20000 }).catch(() => null)
  const hit = await page.evaluate(() => {
    const els = [...document.querySelectorAll('svg g[data-beach], [data-beach]')]
    for (const el of els) {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0 && r.top >= 0 && r.top < innerHeight) return true
    }
    return els.length > 0
  })
  if (!hit) return false
  await page.evaluate(() => {
    const els = [...document.querySelectorAll('svg g[data-beach], [data-beach]')]
    const vis = els.find((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.top >= 0 && r.top < innerHeight })
    ;(vis || els[0]).dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await sleep(1500)
  const opened = await page.evaluate(() => !!document.querySelector('.sheet, .lc-detail, [role="dialog"], .bsc-sheet, .beach-sheet'))
  return opened
}

async function captureViewport(browser, base, vp, outDir, manifest) {
  const rec = { viewport: vp.name, shots: [] }
  const take = async (page, name, opts = {}) => {
    const m = await domMetrics(page)
    await shot(page, outDir, vp.name + '-' + name, !!opts.full)
    if (opts.scrollTo) { await page.evaluate((y) => window.scrollTo(0, y), opts.scrollTo); await sleep(600); await shot(page, outDir, vp.name + '-' + name + '-scrolled'); await page.evaluate(() => window.scrollTo(0, 0)) }
    rec.shots.push({ id: vp.name + '-' + name, metrics: m })
    console.log('  shot:', vp.name + '-' + name, '| btns:', m.buttons.length, '| overflowX:', m.overflowX, '| h1:', m.h1count)
  }

  // 1. HOME / MAP initiale + scroll states
  let page = await newPage(browser, vp)
  await page.goto(base + '/?cookiebanner=0', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await sleep(5000)
  await take(page, 'home-initial')
  // mid + lower viewport si scrollable, sinon capture équivalente
  const sh = await page.evaluate(() => document.documentElement.scrollHeight)
  if (sh > vp.h + 100) {
    await page.evaluate((h) => window.scrollTo(0, h / 2), vp.h); await sleep(600)
    const m = await domMetrics(page); await shot(page, outDir, vp.name + '-home-mid'); rec.shots.push({ id: vp.name + '-home-mid', metrics: m })
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await sleep(600)
    const m2 = await domMetrics(page); await shot(page, outDir, vp.name + '-home-lower'); rec.shots.push({ id: vp.name + '-home-lower', metrics: m2 })
    console.log('  shot:', vp.name + '-home-mid/lower (scrollable, scrollH=' + sh + ')')
  } else {
    console.log('  note: home non-scrollable (scrollH=' + sh + ') — mid/lower N/A')
    rec.nonScrollable = ['home-mid', 'home-lower']
  }
  // 2. BEACH SHEET via pin
  const opened = await openSheet(page)
  console.log('  sheet opened via pin:', opened)
  if (opened) {
    await take(page, 'sheet-initial')
    const ssh = await page.evaluate(() => document.documentElement.scrollHeight)
    if (ssh > vp.h + 100) {
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await sleep(600)
      const m = await domMetrics(page); await shot(page, outDir, vp.name + '-sheet-lower'); rec.shots.push({ id: vp.name + '-sheet-lower', metrics: m })
    }
  } else { rec.sheetFailed = true }
  await page._ctx.close()

  // 3. PAYWALL via deep-link ?paywall=1
  page = await newPage(browser, vp)
  await page.goto(base + '/?paywall=1&cookiebanner=0', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await sleep(5000)
  const pwOpen = await page.evaluate(() => !!document.querySelector('[role="dialog"], .sg-modal-panel, .premium-modal, .paywall'))
  console.log('  paywall open:', pwOpen)
  await take(page, 'paywall-initial')
  const psh = await page.evaluate(() => document.documentElement.scrollHeight)
  if (psh > vp.h + 100) {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await sleep(600)
    const m = await domMetrics(page); await shot(page, outDir, vp.name + '-paywall-lower'); rec.shots.push({ id: vp.name + '-paywall-lower', metrics: m })
  }
  await page._ctx.close()

  // 4. B2B via ?pro=1
  page = await newPage(browser, vp)
  await page.goto(base + '/?pro=1&cookiebanner=0', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await sleep(5000)
  const b2bOpen = await page.evaluate(() => !!document.querySelector('[role="dialog"], .b2b-modal, .pro-modal'))
  console.log('  b2b open:', b2bOpen)
  await take(page, 'b2b-initial')
  await page._ctx.close()

  // 5. Pages statiques SEO (contenu réel servi avant SPA)
  for (const sp of ['plages/', 'previsions/', 'fiabilite/', 'beach/anse-mitan/']) {
    const p2 = await newPage(browser, vp)
    await p2.goto(base + '/' + sp, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await sleep(3500)
    await take(p2, 'static-' + sp.replace(/\//g, '-').replace(/-$/, ''))
    await p2._ctx.close()
  }
  manifest.push(rec)
}

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const srv = await serve(DIST, 4173)
  const base = 'http://127.0.0.1:4173'
  console.log('preview:', base, 'dist:', DIST)
  const browser = await chromium.launch()
  const manifest = []
  const VPS = [{ name: '390', w: 390, h: 844 }, { name: '768', w: 768, h: 1024 }, { name: '1440', w: 1440, h: 900 }]
  const only = process.argv.find((a) => a.startsWith('--vp='))
  const list = only ? VPS.filter((v) => v.name === only.slice(5)) : VPS
  for (const vp of list) {
    console.log('== viewport', vp.name, vp.w + 'x' + vp.h, '==')
    const outDir = path.join(OUT)
    await captureViewport(browser, base, vp, outDir, manifest)
  }
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ date: new Date().toISOString(), manifest }, null, 1))
  console.log('manifest:', path.join(OUT, 'manifest.json'))
  await browser.close()
  srv.close()
})().catch((e) => { console.error('FATAL', e); process.exit(1) })
