// Preuve MQ inchangé après le fix MapView : heatmap (lat<15.5) + bancs mq
// rendent toujours. Données par défaut du repo (MQ), aucun stub.
const { chromium } = require('playwright')

async function main() {
  const browser = await chromium.launch()
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage()
  await page.context().addInitScript(() => { try { localStorage.setItem('sg_onb', '1') } catch (e) {} })
  const errors = []
  page.on('pageerror', e => errors.push(String(e).slice(0, 150)))
  await page.goto('http://localhost:4174/', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.leaflet-container', { timeout: 30000 })
  await page.waitForTimeout(12000)
  try { await page.click('text=/Toutes les plages|Toute l.île/i', { timeout: 3000 }); await page.waitForTimeout(2500) } catch (e) {}

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
    return {
      coloredPx: colored,
      svgPaths: document.querySelectorAll('.leaflet-overlay-pane svg path').length,
      markers: document.querySelectorAll('.leaflet-marker-pane .leaflet-marker-icon').length,
    }
  })
  console.log(JSON.stringify(st), 'errors:', errors.length ? errors.join(' | ') : 'none')
  await page.screenshot({ path: 'scripts/tmp-mq-layers.png' })
  const ok = st.coloredPx > 500 && st.markers > 10 && errors.length === 0
  console.log(ok ? `PASS — MQ : heatmap ${st.coloredPx} px, ${st.markers} pins, ${st.svgPaths} paths bancs` : 'FAIL')
  if (!ok) process.exitCode = 1
  await browser.close()
}
main().catch(e => { console.error(e); process.exit(1) })
