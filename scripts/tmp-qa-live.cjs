/**
 * tmp-qa-live.cjs — QA live post-deploy de TOUT ce qui a shippé session 41.
 * Un run = verdict OK/FAIL par item, 5 domaines.
 */
const https = require('https')
const { chromium } = require('playwright')

const get = (url) => new Promise((res) => {
  https.get(url, { headers: { 'Accept-Encoding': 'identity' } }, r => {
    if ([301, 302, 308].includes(r.statusCode) && r.headers.location) return get(new URL(r.headers.location, url).href).then(res)
    let b = ''; r.on('data', c => b += c); r.on('end', () => res({ code: r.statusCode, body: b }))
  }).on('error', () => res({ code: 0, body: '' }))
})

let pass = 0, fail = 0
const check = (ok, label, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`) }

;(async () => {
  // 1. SW v59 partout
  for (const d of ['sargasses-martinique.com', 'sargasses-guadeloupe.com', 'sargassumpuntacana.com', 'sargassummiami.com', 'sargassumcancun.com']) {
    const { body } = await get(`https://${d}/sw.js`)
    const v = (body.match(/sargasses-v(\d+)/) || [])[1]
    check(Number(v) >= 59, `SW ${d}`, 'v' + v)
  }
  // 2. Hubs zones côtières (7)
  for (const [d, slug] of [
    ['sargasses-martinique.com', 'plages-sud-martinique'], ['sargasses-martinique.com', 'plages-cote-caraibe-martinique'], ['sargasses-martinique.com', 'plages-cote-atlantique-martinique'],
    ['sargasses-guadeloupe.com', 'plages-sud-grande-terre'], ['sargasses-guadeloupe.com', 'plages-nord-grande-terre'], ['sargasses-guadeloupe.com', 'plages-basse-terre-cote-caraibe'], ['sargasses-guadeloupe.com', 'plages-iles-guadeloupe'],
  ]) {
    const { code, body } = await get(`https://${d}/plages/${slug}/`)
    check(code === 200 && body.includes('Autres zones') && body.includes(d), `hub /plages/${slug}/`)
  }
  // 3. Lien remontant zone sur page plage + footer réseau
  {
    const { body } = await get('https://sargasses-martinique.com/plages/plage-des-salines/')
    check(body.includes('/plages/plages-sud-martinique/'), 'zoneLine salines → hub sud')
    check(body.includes('sargassumcancun.com'), 'footer réseau salines')
  }
  // 4. Cross-links mois (mois courant)
  {
    const { body } = await get('https://sargassummiami.com/sargassum-june-2026/')
    check(body.includes('sargazo-junio-2026'), 'cross-link miami→cancun (juin)')
    const { body: b2 } = await get('https://sargasses-martinique.com/sargasses-juin-2026/')
    check(b2.includes('sargassum-june-2026'), 'cross-link mq→en (juin)')
  }
  // 5. Couches sargasses Cancún (bundle contient le fix) + heatmap rend
  // 6. Héros DepthFlow servis
  for (const [d, id] of [['sargasses-martinique.com', 'mq014'], ['sargassumcancun.com', 'rm011'], ['sargassummiami.com', 'fl011']]) {
    const { code, body } = await get(`https://${d}/videos/hero/${id}.mp4`)
    // clip DepthFlow 12s ≈ 0.5-2MB ; zoompan 8s ≈ 300-900KB carré. Durée via taille minimale
    check(code === 200 && body.length > 500000, `héros DepthFlow ${id} (${d})`, Math.round(body.length / 1024) + 'KB')
  }
  // 7. Jeu : SVG + beacons + plus de video bg
  {
    const { body } = await get('https://sargasses-martinique.com/jeu/')
    check(body.includes('<svg id="bg"') && !body.includes('bgv'), 'jeu fond SVG sans vidéo')
    check(body.includes('sg_game_start'), 'jeu beacons KPI')
  }
  // 8. Tap hero → fiche + heatmap Cancún (Playwright)
  const browser = await chromium.launch()
  {
    const pg = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage()
    await pg.context().addInitScript(() => { try { localStorage.setItem('sg_onb', '1') } catch (e) {} })
    await pg.goto('https://sargasses-martinique.com/', { waitUntil: 'domcontentloaded' })
    await pg.waitForTimeout(8000)
    await pg.mouse.click(195, 300)
    let opened = true
    try { await pg.waitForSelector('.sheet h2', { timeout: 6000 }) } catch (e) { opened = false }
    check(opened, 'tap photo hero MQ → fiche')
    await pg.close()
  }
  {
    const pg = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage()
    await pg.context().addInitScript(() => { try { localStorage.setItem('sg_onb', '1') } catch (e) {} })
    await pg.goto('https://sargassumcancun.com/', { waitUntil: 'domcontentloaded' })
    try { await pg.click('text=/Todas las playas|Toda la isla/i', { timeout: 8000 }) } catch (e) {}
    await pg.waitForTimeout(9000)
    const st = await pg.evaluate(() => {
      const canvases = Array.from(document.querySelectorAll('.leaflet-pane canvas'))
      let colored = 0
      for (const cv of canvases) { try { const { data } = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height); for (let i = 0; i < data.length; i += 16) if (data[i + 3] > 10) colored++ } catch (e) {} }
      return { colored, paths: document.querySelectorAll('.leaflet-overlay-pane svg path').length }
    })
    check(st.colored > 500, 'heatmap sargasses Cancún LIVE', st.colored + 'px')
    await pg.close()
  }
  await browser.close()
  console.log(`\n=== QA LIVE : ${pass} OK / ${fail} FAIL ===`)
  process.exitCode = fail ? 1 : 0
})()
