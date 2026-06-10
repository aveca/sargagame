// Screenshot live de la carte (scène "satellite" du SargaClip) — vrai produit.
// Les tuiles CARTO échouent par vagues sur ce réseau (cf. ux-spec map-first-paint) :
// on prend jusqu'à 5 captures espacées, on analyse le PNG SAUVEGARDÉ (chargé en
// data-URL dans un canvas — jamais tainted) et on garde la plus propre.
// Usage : node shoot-map.cjs <domaine> <out.png>
const path = require('path')
const fs = require('fs')
const { chromium } = require(path.join(__dirname, '../../node_modules/playwright'))
const domain = process.argv[2], out = process.argv[3]
;(async () => {
  const b = await chromium.launch()
  const ctx = await b.newContext({ viewport: { width: 810, height: 1440 }, deviceScaleFactor: 1 })
  const pg = await ctx.newPage()
  await pg.goto(`https://${domain}/`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await pg.waitForTimeout(9000)
  for (const sel of ['button:has-text("Toutes les plages")', 'button:has-text("All beaches")', 'button:has-text("Todas las playas")']) {
    const btn = pg.locator(sel).first()
    if (await btn.isVisible().catch(() => false)) { await btn.click().catch(() => {}); break }
  }
  await pg.keyboard.press('Escape')
  const analyzer = await ctx.newPage()
  await analyzer.goto('about:blank')
  const darkRatioOf = async file => {
    const dataUrl = 'data:image/png;base64,' + fs.readFileSync(file).toString('base64')
    return analyzer.evaluate(src => new Promise(res => {
      const img = new Image()
      img.onload = () => {
        const S = 64
        const c = document.createElement('canvas'); c.width = S; c.height = Math.round(S * img.height / img.width)
        const x = c.getContext('2d'); x.drawImage(img, 0, 0, c.width, c.height)
        const d = x.getImageData(0, 0, c.width, c.height).data
        let dark = 0, n = 0
        for (let i = 0; i < d.length; i += 4) { n++; if (d[i] < 30 && d[i + 1] < 40 && d[i + 2] < 55) dark++ }
        res(dark / n)
      }
      img.onerror = () => res(1)
      img.src = src
    }), dataUrl)
  }
  let best = { ratio: 1, file: null }
  for (let i = 0; i < 5; i++) {
    await pg.waitForTimeout(i === 0 ? 6000 : 7000)
    const tmp = out + `.try${i}.png`
    await pg.screenshot({ path: tmp })
    const ratio = await darkRatioOf(tmp)
    console.log(`  capture ${i + 1}: ${(ratio * 100).toFixed(1)}% sombre`)
    if (ratio < best.ratio) best = { ratio, file: tmp }
    if (ratio < 0.02) break
  }
  if (best.file) fs.copyFileSync(best.file, out)
  for (let i = 0; i < 5; i++) { try { fs.unlinkSync(out + `.try${i}.png`) } catch (_) {} }
  await b.close()
  if (!best.file || best.ratio > 0.10) { console.error(`carte trop trouée (${(best.ratio * 100).toFixed(1)}%)`); process.exit(1) }
  console.log(`map shot OK (${(best.ratio * 100).toFixed(1)}% sombre)`)
  process.exit(0)
})().catch(e => { console.error(e.message); process.exit(1) })
