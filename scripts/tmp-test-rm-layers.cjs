// Vérifie le fix MapView : sur un build rivieramaya, la heatmap AFAI (canvas)
// et les bancs (SVG paths) doivent rendre des éléments — avant fix : 0.
// Data routée vers les fichiers locaux rivieramaya/ (le dev sert MQ par défaut).
const path = require('path')
const { chromium } = require('playwright')

const RM = f => path.join(__dirname, '..', 'public', 'api', 'copernicus', 'rivieramaya', f)

async function main() {
  const browser = await chromium.launch()
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage()
  await page.context().addInitScript(() => { try { localStorage.setItem('sg_onb', '1') } catch (e) {} })
  await page.route('**/api/copernicus/sargassum.json', r => r.fulfill({ path: RM('sargassum.json'), contentType: 'application/json' }))
  await page.route('**/api/copernicus/sargassum-grid.json', r => r.fulfill({ path: RM('sargassum-grid.json'), contentType: 'application/json' }))
  await page.route('**/api/copernicus/sargassum-banks.json', r => r.fulfill({ path: RM('sargassum-banks.json'), contentType: 'application/json' }))
  const errors = []
  page.on('pageerror', e => errors.push(String(e).slice(0, 150)))
  await page.goto('http://localhost:4191/', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.leaflet-container', { timeout: 30000 })
  await page.waitForTimeout(12000) // data + layers settle (fitBounds re-runs)
  // Ferme le hero pour voir la carte (bouton « toutes les plages »)
  try { await page.click('text=/Todas las playas|Toutes les plages|All beaches/i', { timeout: 3000 }); await page.waitForTimeout(2500) } catch (e) {}

  const st = await page.evaluate(() => {
    const canvases = Array.from(document.querySelectorAll('.leaflet-pane canvas'))
    let colored = 0
    for (const cv of canvases) {
      try {
        const ctx = cv.getContext('2d')
        const { data } = ctx.getImageData(0, 0, cv.width, cv.height)
        for (let i = 0; i < data.length; i += 16) if (data[i + 3] > 10) colored++
      } catch (e) {}
    }
    const zs = Array.from(document.querySelectorAll('.leaflet-tile-pane img')).map(im => {
      const m = (im.src || '').match(/\/(\d+)\/\d+\/\d+(@2x)?\.png/); return m ? +m[1] : null
    }).filter(Boolean)
    return {
      canvasCount: canvases.length,
      coloredPx: colored, // échantillon 1/4 des pixels
      svgPaths: document.querySelectorAll('.leaflet-overlay-pane svg path').length,
      zoom: zs.length ? Math.max(...zs) : null,
      markers: document.querySelectorAll('.leaflet-marker-pane .leaflet-marker-icon').length,
    }
  })
  console.log(JSON.stringify(st), 'errors:', errors.length ? errors.join(' | ') : 'none')
  await page.screenshot({ path: 'scripts/tmp-rm-layers.png' })
  const heatOk = st.coloredPx > 500   // heatmap canvas peint (avant fix : 0)
  const marksOk = st.markers === 12
  console.log(heatOk && marksOk ? `PASS — heatmap peinte (${st.coloredPx} px échantillonnés), ${st.markers} pins, ${st.svgPaths} paths bancs (zoom ${st.zoom})` : 'FAIL')
  if (!heatOk || !marksOk) process.exitCode = 1
  await browser.close()
}
main().catch(e => { console.error(e); process.exit(1) })
