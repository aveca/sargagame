// UI/UX RESCUE — Phase A2 : list view, scroll interne sheet/paywall, cookie banner,
// keyboard/focus, reduced-motion. AUDIT ONLY.
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
          if (/\.[a-z0-9]+$/i.test(p) && !p.endsWith('.html')) { res.writeHead(404); res.end('nf'); return }
          f = path.join(dist, 'index.html')
        }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' })
        fs.createReadStream(f).pipe(res)
      } catch (e) { res.writeHead(500); res.end('err') }
    })
    srv.listen(port, '127.0.0.1', () => resolve(srv))
  })
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const audit = {}

async function main() {
  const srv = await serve(DIST, 4174)
  const base = 'http://127.0.0.1:4174'
  const browser = await chromium.launch()

  // 1. LIST VIEW (onglet Plages) 390
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
    await ctx.addInitScript(() => { try { localStorage.setItem('sg_cookie_consent', 'denied') } catch (_) {} })
    const page = await ctx.newPage()
    await page.goto(base + '/?cookiebanner=0', { waitUntil: 'domcontentloaded' })
    await sleep(5000)
    const tabs = await page.evaluate(() => [...document.querySelectorAll('.sg-bottom-nav button')].map((b) => b.innerText.trim()))
    audit.listTabs = tabs
    const plages = page.locator('.sg-bottom-nav button', { hasText: 'Plages' })
    if (await plages.count()) { await plages.first().click(); await sleep(2000) }
    audit.listView = await page.evaluate(() => ({
      h1: document.querySelector('h1')?.innerText.slice(0, 80) || null,
      items: [...document.querySelectorAll('[data-beach]')].length,
      bodyStart: document.body.innerText.slice(0, 600),
    }))
    await page.screenshot({ path: path.join(OUT, '390-list-view.png') })
    // scroll interne si liste scrollable dans un conteneur
    await page.evaluate(() => {
      const els = [...document.querySelectorAll('*')].filter((e) => e.scrollHeight > e.clientHeight + 100)
      const dlg = els.find((e) => e.getAttribute('role') === 'dialog' || /sheet|list|modal/i.test(e.className))
      if (dlg) dlg.scrollTop = dlg.scrollHeight
      else window.scrollTo(0, document.documentElement.scrollHeight)
    })
    await sleep(600)
    await page.screenshot({ path: path.join(OUT, '390-list-view-lower.png') })
    await ctx.close()
  }

  // 2. SHEET scroll interne (contenu sous le fold : forecast, feedback, alternatives)
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
    await ctx.addInitScript(() => { try { localStorage.setItem('sg_cookie_consent', 'denied') } catch (_) {} })
    const page = await ctx.newPage()
    await page.goto(base + '/?cookiebanner=0', { waitUntil: 'domcontentloaded' })
    await sleep(5000)
    await page.evaluate(() => {
      const els = [...document.querySelectorAll('svg g[data-beach], [data-beach]')]
      const vis = els.find((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.top >= 0 && r.top < innerHeight })
      ;(vis || els[0]).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await sleep(1500)
    // scroller interne du sheet vers le bas par étapes
    const scroller = await page.evaluate(() => {
      const els = [...document.querySelectorAll('*')].filter((e) => e.scrollHeight > e.clientHeight + 100 && e.clientHeight <= innerHeight + 1)
      const cand = els.map((e) => ({ cls: e.className?.toString?.().slice(0, 80) || e.tagName, sh: e.scrollHeight, ch: e.clientHeight }))
      return cand.slice(0, 10)
    })
    audit.sheetScrollers = scroller
    await page.evaluate(() => {
      const els = [...document.querySelectorAll('*')].filter((e) => e.scrollHeight > e.clientHeight + 100 && e.clientHeight <= innerHeight + 1)
      const dlg = els.find((e) => e.getAttribute('role') === 'dialog') || els[els.length - 1]
      if (dlg) dlg.scrollTop = dlg.scrollHeight * 0.5
    })
    await sleep(600)
    await page.screenshot({ path: path.join(OUT, '390-sheet-mid.png') })
    await page.evaluate(() => {
      const els = [...document.querySelectorAll('*')].filter((e) => e.scrollHeight > e.clientHeight + 100 && e.clientHeight <= innerHeight + 1)
      const dlg = els.find((e) => e.getAttribute('role') === 'dialog') || els[els.length - 1]
      if (dlg) dlg.scrollTop = dlg.scrollHeight
    })
    await sleep(600)
    await page.screenshot({ path: path.join(OUT, '390-sheet-lower.png') })
    await ctx.close()
  }

  // 3. PAYWALL scroll interne (bas du modal : guarantee, FAQ, Plus tard)
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
    await ctx.addInitScript(() => { try { localStorage.setItem('sg_cookie_consent', 'denied') } catch (_) {} })
    const page = await ctx.newPage()
    await page.goto(base + '/?paywall=1&cookiebanner=0', { waitUntil: 'domcontentloaded' })
    await sleep(5000)
    await page.evaluate(() => {
      const els = [...document.querySelectorAll('*')].filter((e) => e.scrollHeight > e.clientHeight + 100 && e.clientHeight <= innerHeight + 1)
      const dlg = els.find((e) => e.getAttribute('role') === 'dialog') || els[els.length - 1]
      if (dlg) dlg.scrollTop = dlg.scrollHeight
    })
    await sleep(600)
    await page.screenshot({ path: path.join(OUT, '390-paywall-lower.png') })
    audit.paywallBottomText = await page.evaluate(() => document.body.innerText.slice(-900))
    await ctx.close()
  }

  // 4. COOKIE BANNER frais (sans consent seedé)
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await ctx.newPage()
    await page.goto(base + '/', { waitUntil: 'domcontentloaded' })
    await sleep(5000)
    audit.cookieBanner = await page.evaluate(() => {
      const b = document.querySelector('.sg-cookie-banner')
      if (!b) return { present: false }
      const r = b.getBoundingClientRect()
      const btns = [...b.querySelectorAll('button')].map((x) => ({ label: x.innerText.trim(), w: Math.round(x.getBoundingClientRect().width), h: Math.round(x.getBoundingClientRect().height) }))
      return { present: true, bottom: Math.round(r.bottom), top: Math.round(r.top), text: b.innerText.slice(0, 200), buttons: btns }
    })
    await page.screenshot({ path: path.join(OUT, '390-cookie-banner.png') })
    await ctx.close()
  }

  // 5. KEYBOARD / FOCUS : ordre de tab + focus visible sur home + paywall
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
    await ctx.addInitScript(() => { try { localStorage.setItem('sg_cookie_consent', 'denied') } catch (_) {} })
    const page = await ctx.newPage()
    await page.goto(base + '/?paywall=1&cookiebanner=0', { waitUntil: 'domcontentloaded' })
    await sleep(5000)
    // Ferme le paywall pour tester le fond, puis focus le premier élément
    const focusAudit = await page.evaluate(() => {
      const f = [...document.querySelectorAll('button, a[href], input, select, [tabindex]')].filter((e) => {
        const r = e.getBoundingClientRect()
        return r.width > 0 && r.height > 0 && e.tabIndex >= 0 && !e.disabled
      })
      const noName = f.filter((e) => !(e.innerText?.trim() || e.getAttribute('aria-label') || e.value || e.title)).length
      const negTab = [...document.querySelectorAll('[tabindex]')].filter((e) => e.tabIndex < -1).length
      // focus visible : outline du premier bouton après focus()
      const b = f[0]
      let outline = null
      if (b) { b.focus(); outline = getComputedStyle(b).outlineStyle + ' ' + getComputedStyle(b).outlineWidth + ' ' + getComputedStyle(b).boxShadow.slice(0, 60) }
      return { focusables: f.length, noAccessibleName: noName, negTabindex: negTab, firstFocusOutline: outline, activeIsBody: document.activeElement === document.body }
    })
    audit.focus = focusAudit
    // Escape ferme-t-il le paywall ?
    await page.keyboard.press('Escape')
    await sleep(800)
    audit.escapeClosesPaywall = await page.evaluate(() => !document.querySelector('[role="dialog"]'))
    await ctx.close()
  }

  // 6. REDUCED MOTION : animations infinies encore actives ?
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
    await ctx.addInitScript(() => { try { localStorage.setItem('sg_cookie_consent', 'denied') } catch (_) {} })
    const page = await ctx.newPage()
    await page.goto(base + '/?cookiebanner=0', { waitUntil: 'domcontentloaded' })
    await sleep(4000)
    audit.reducedMotion = await page.evaluate(() => {
      const anims = document.getAnimations ? document.getAnimations() : []
      const infinite = anims.filter((a) => {
        try { const t = a.effect?.getTiming?.(); return t && t.iterations === Infinity } catch (_) { return false }
      }).length
      return { totalAnimations: anims.length, infiniteRemaining: infinite }
    })
    await ctx.close()
  }

  fs.writeFileSync(path.join(OUT, 'audit2.json'), JSON.stringify(audit, null, 1))
  console.log(JSON.stringify(audit, null, 1).slice(0, 4000))
  await browser.close()
  srv.close()
}

main().catch((e) => { console.error('FATAL', e); process.exit(1) })
