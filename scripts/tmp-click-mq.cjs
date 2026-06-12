// Test exhaustif clic pastilles (live) v3 :
// - position fraîche au moment du clic
// - attend que la carte soit STABLE (pas d'animation) avant chaque clic
// - restaure la vue île (double toggle Caraïbe) quand la cible est hors-champ
const { chromium } = require('playwright')
const BASE = process.argv[2] || 'https://sargasses-martinique.com'
const sleep = ms => new Promise(r => setTimeout(r, ms))
;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  page.on('pageerror', e => console.log('PAGEERROR:', e.message.slice(0, 150)))
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await sleep(11000)
  for (let i = 0; i < 3; i++) { await page.keyboard.press('Escape'); await sleep(250) }

  const paneTransform = () => page.evaluate(() => document.querySelector('.leaflet-map-pane')?.style.transform || '')
  const waitStable = async () => {
    for (let i = 0; i < 12; i++) {
      const a = await paneTransform(); await sleep(320); const b = await paneTransform()
      if (a === b) return true
    }
    return false
  }
  const sheetTitle = () => page.evaluate(() => {
    const s = document.querySelector('.sheet'); if (!s) return null
    const h = s.querySelector('h1,h2,h3'); return (h ? h.textContent : s.textContent).trim().slice(0, 60)
  })
  const markerBox = (k) => page.evaluate((k) => {
    const list = document.querySelectorAll('.leaflet-marker-pane > *')
    const m = list[k]; if (!m) return null
    const r = m.getBoundingClientRect()
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2
    if (r.width < 4 || cx < 8 || cx > innerWidth - 8 || cy < 70 || cy > innerHeight - 120) return { off: true }
    const el = document.elementFromPoint(cx, cy)
    const covered = !(m === el || m.contains(el))
    let coveredBy = null
    if (covered && el) {
      const er = el.getBoundingClientRect()
      coveredBy = `${el.tagName}.${String(el.className).slice(0, 50)} rect=${Math.round(er.left)},${Math.round(er.top)},${Math.round(er.width)}x${Math.round(er.height)} text="${(el.textContent || '').trim().slice(0, 30)}"`
    }
    return { x: Math.round(cx), y: Math.round(cy), covered, coveredBy }
  }, k)
  const restoreView = async () => {
    // Le bouton « Toute l'île » (recenter) est le geste utilisateur réel
    const btn = page.locator('button[aria-label="Toute l\'île"], button[aria-label="Whole island"], button[aria-label="Toda la isla"]').first()
    if (await btn.isVisible().catch(() => false)) {
      await btn.click().catch(() => {})
      await sleep(1100)
    } else {
      await page.click('.sg-carib-btn').catch(() => {})
      await sleep(1300)
      await page.click('.sg-carib-btn').catch(() => {})
      await sleep(1500)
    }
    await waitStable()
  }

  const total = await page.evaluate(() => document.querySelectorAll('.leaflet-marker-pane > *').length)
  console.log(`marqueurs: ${total}`)
  const opened = new Set(), dead = []
  let zooms = 0, clicks = 0, routedOverlap = 0, restores = 0

  for (let k = 0; k < total; k++) {
    let box = await markerBox(k)
    if (box && box.off) { restores++; await restoreView(); box = await markerBox(k) }
    if (!box || box.off) { dead.push({ k, off: true }); console.log(`INATTEIGNABLE marqueur#${k} (hors-vue même après restore)`); continue }
    await waitStable()
    box = await markerBox(k) // position finale post-stabilisation
    if (!box || box.off) { dead.push({ k, off: true }); continue }
    const before = await paneTransform()
    try { await page.mouse.click(box.x, box.y) } catch { continue }
    clicks++
    await sleep(1000)
    let t = await sheetTitle()
    if (!t) {
      const after = await paneTransform()
      if (after !== before) {
        zooms++
        await waitStable()
        t = await sheetTitle()
        if (!t) {
          const box2 = await markerBox(k)
          if (box2 && !box2.off) { await page.mouse.click(box2.x, box2.y); await sleep(1100); t = await sheetTitle() }
        }
      } else {
        // aucun effet : 2e tentative immédiate au même point (vrai geste utilisateur)
        await page.mouse.click(box.x, box.y); await sleep(1100); t = await sheetTitle()
      }
    }
    if (t) {
      if (box.covered) routedOverlap++
      opened.add(`#${k} ${t}`)
      await page.keyboard.press('Escape'); await sleep(400)
    } else {
      dead.push({ k, ...box })
      await page.screenshot({ path: `dead-click-${dead.length}.png` }).catch(() => {})
      console.log(`CLIC MORT marqueur#${k} @ (${box.x},${box.y}) covered=${box.covered} par: ${box.coveredBy || '—'}`)
    }
  }

  console.log(`\n=== RAPPORT ${BASE} ===`)
  console.log(`marqueurs: ${total} | clics: ${clicks} | fiches ouvertes: ${opened.size} | zooms désambig: ${zooms} | chevauchées routées: ${routedOverlap} | restores vue: ${restores}`)
  console.log(`clics morts/inatteignables: ${dead.length}`, dead.length ? JSON.stringify(dead) : '✓')
  console.log(`détail: ${[...opened].join(' | ').slice(0, 2200)}`)
  await page.screenshot({ path: 'mq-pins-final.png' })
  await browser.close()
  process.exit(dead.filter(d => !d.off).length ? 1 : 0)
})().catch(e => { console.error('FAIL', e.message); process.exit(1) })
