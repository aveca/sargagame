// PHASE B SPRINT 1 — capture + assertions (ne touche PAS aux shots Phase A).
// Sert un dist/ via serveur statique embarqué + Playwright :
// viewports 390x844 / 768x1024 / 1440x900, états home/sheet/paywall.
// Sortie : .ai/ui-audit/shots-phaseB/<region>/<viewport>-<name>.png + asserts.json
// Usage : node scripts-phaseB-capture.cjs <distDir> <region> <outDir>
const { chromium } = require('playwright')
const http = require('http')
const fs = require('fs')
const path = require('path')

const [, , DISTARG, REGION, OUTARG] = process.argv
const DIST = path.resolve(DISTARG || 'dist')
const OUT = path.resolve(OUTARG || path.join('.ai', 'ui-audit', 'shots-phaseB', REGION || 'mq'))
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' }

function serve(dist, port) {
  return new Promise((resolve, reject) => {
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
    srv.on('error', reject)
    srv.listen(port, '127.0.0.1', () => resolve(srv))
  })
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const EMOJI_RE = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/u

async function domAsserts(page) {
  return page.evaluate((EMOJI_SRC) => {
    const EMOJI = new RegExp(EMOJI_SRC, 'u')
    const out = { emojis: [], blurs: [], comicNeue: 0, antonLC: 0, legend: false, goldPrimary: 0, reportBtns: [], focusable: 0, unfocusable: 0 }
    const els = [...document.querySelectorAll('body *')].slice(0, 4000)
    for (const el of els) {
      const t = (el.innerText || '')
      if (t && EMOJI.test(t)) {
        const m = t.match(new RegExp(EMOJI_SRC, 'ug'))
        out.emojis.push({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 40), chars: [...new Set(m)].join(' '), text: t.slice(0, 60) })
        if (out.emojis.length > 25) break
      }
    }
    for (const el of els) {
      const f = getComputedStyle(el).filter || ''
      if (/blur\(/.test(f)) {
        const r = el.getBoundingClientRect()
        if (r.width > 4 && r.height > 4) out.blurs.push({ tag: el.tagName, filter: f, text: (el.innerText || '').slice(0, 40) })
        if (out.blurs.length > 15) break
      }
    }
    for (const el of els) {
      const ff = getComputedStyle(el).fontFamily || ''
      if (/Comic Neue/i.test(ff)) out.comicNeue++
      if (/AntonLC/.test(ff)) out.antonLC++
    }
    out.legend = /Calme|Calm|Calma/.test(document.body.innerText || '') && /Surveiller|Watch|Vigilar/.test(document.body.innerText || '')
    out.goldPrimary = [...document.querySelectorAll('button,a')].filter((e) => {
      const cs = getComputedStyle(e); const r = e.getBoundingClientRect()
      return r.width > 0 && /255,\s*199,\s*44/.test(cs.backgroundImage + '|' + cs.backgroundColor)
    }).length
    out.reportBtns = [...document.querySelectorAll('button')].filter((e) => /signal|report|propre|modéré|beaucoup/i.test(e.innerText || '')).map((e) => { const r = e.getBoundingClientRect(); return { label: (e.innerText || '').slice(0, 24), w: Math.round(r.width), h: Math.round(r.height) } })
    return out
  }, EMOJI_RE.source)
}

async function newPage(browser, vp) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1 })
  await ctx.addInitScript(() => { try { localStorage.setItem('sg_cookie_consent', 'denied'); localStorage.setItem('sg_visit_count', '3') } catch (_) {} })
  return ctx.newPage()
}

async function openSheet(page) {
  // Le pin/label ouvre la carte jeu (ChasseDetail .lc-detail) ; "Fiche complète" → BeachSheetComic (.bsc-sheet).
  await page.waitForSelector('.sg-maplabel, svg g[data-beach], [data-beach]', { timeout: 20000 }).catch(() => null)
  const hit = await page.evaluate(() => {
    const lbls = [...document.querySelectorAll('.sg-maplabel')]
    const vis = lbls.find((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.top >= 0 && r.top < innerHeight })
    if (vis) { vis.dispatchEvent(new MouseEvent('click', { bubbles: true })); return 'label' }
    const els = [...document.querySelectorAll('svg g[data-beach], [data-beach]')]
    if (!els.length) return null
    const v2 = els.find((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.top >= 0 && r.top < innerHeight })
    ;(v2 || els[0]).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return 'pin'
  })
  if (!hit) return { game: false, full: false }
  await sleep(1800)
  const game = await page.evaluate(() => !!document.querySelector('.lc-detail'))
  const go = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.lc-detail-go, button')]
    const goBtn = btns.find((b) => /fiche compl|full sheet|ficha completa/i.test(b.innerText || ''))
    if (goBtn) { goBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true }
    return false
  })
  if (go) await sleep(2000)
  const full = await page.evaluate(() => !!document.querySelector('.bsc-sheet, .bsc-fiche'))
  return { game, full }
}

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const PORT = 4174 + Math.floor(Math.random() * 500)
  const srv = await serve(DIST, PORT)
  const base = `http://127.0.0.1:${PORT}`
  const browser = await chromium.launch()
  const VPS = [{ name: '390x844', w: 390, h: 844 }, { name: '768x1024', w: 768, h: 1024 }, { name: '1440x900', w: 1440, h: 900 }]
  const report = { region: REGION, date: new Date().toISOString(), viewports: {} }
  for (const vp of VPS) {
    console.log(`== ${REGION} ${vp.name} ==`)
    const rec = {}
    let page = await newPage(browser, vp)
    await page.goto(base + '/?cookiebanner=0', { waitUntil: 'domcontentloaded', timeout: 30000 })
    await sleep(6000)
    await page.screenshot({ path: path.join(OUT, `${vp.name}-home.png`) })
    rec.home = await domAsserts(page)
    console.log('  home emojis:', rec.home.emojis.length, '| blurs:', rec.home.blurs.length, '| comicNeue:', rec.home.comicNeue, '| antonLC:', rec.home.antonLC)
    const opened = await openSheet(page)
    console.log('  game card:', opened.game, '| full sheet:', opened.full)
    if (opened.game) {
      await page.screenshot({ path: path.join(OUT, `${vp.name}-gamecard.png`) })
      rec.gamecard = await domAsserts(page)
    }
    if (opened.full) {
      await page.screenshot({ path: path.join(OUT, `${vp.name}-sheet.png`) })
      rec.sheet = await domAsserts(page)
      console.log('  sheet emojis:', JSON.stringify(rec.sheet.emojis.slice(0, 12)))
      console.log('  sheet blurs:', JSON.stringify(rec.sheet.blurs.slice(0, 10)))
      console.log('  sheet legend:', rec.sheet.legend, '| goldPrimary:', rec.sheet.goldPrimary, '| reportBtns:', JSON.stringify(rec.sheet.reportBtns))
      // scroll to bottom of sheet for CTA + report visibility
      const dlg = await page.$('.bsc-sheet, [role="dialog"]')
      if (dlg) { await dlg.evaluate((e) => e.scrollTo(0, e.scrollHeight)); await sleep(800) }
      await page.screenshot({ path: path.join(OUT, `${vp.name}-sheet-bottom.png`) })
    } else { rec.sheetFailed = true; console.log('  sheet FAILED — game:', opened.game, 'full:', opened.full) }
    await page.close()
    page = await newPage(browser, vp)
    await page.goto(base + '/?paywall=1&cookiebanner=0', { waitUntil: 'domcontentloaded', timeout: 30000 })
    await sleep(5000)
    await page.screenshot({ path: path.join(OUT, `${vp.name}-paywall.png`) })
    rec.paywall = await domAsserts(page)
    console.log('  paywall emojis:', rec.paywall.emojis.length, '| blurs:', rec.paywall.blurs.length)
    await page.close()
    report.viewports[vp.name] = rec
  }
  fs.writeFileSync(path.join(OUT, 'asserts.json'), JSON.stringify(report, null, 1))
  await browser.close()
  srv.close()
  console.log('OUT:', OUT)
})().catch((e) => { console.error('FATAL', e); process.exit(1) })
