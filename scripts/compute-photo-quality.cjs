// Score qualité 0-100 de chaque photo de plage (beaches-images.json) →
// public/data/beaches-images-quality.json. Utilisé par le Hero Verdict pour
// départager les plages propres à score proche : une photo sombre/grise
// (crépuscule, bateaux sous ciel couvert) rate le critère « Beau » du hero.
// Heuristique : luminosité moyenne (cible 45-70 %), saturation (turquoise>gris),
// résolution. ZERO MANUAL — relançable à chaque ajout de photos (CI hebdo ok).
// Usage : node scripts/compute-photo-quality.cjs
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const ROOT = path.resolve(__dirname, '..')
const MAP = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/beaches-images.json'), 'utf8'))
const OUT = path.join(ROOT, 'public/data/beaches-images-quality.json')

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.goto('about:blank')
  const result = {}
  for (const [id, file] of Object.entries(MAP)) {
    const p = path.join(ROOT, 'public/beaches', file)
    if (!fs.existsSync(p)) continue
    const dataUrl = 'data:image/jpeg;base64,' + fs.readFileSync(p).toString('base64')
    try {
      const m = await page.evaluate(src => new Promise(res => {
        const img = new Image()
        img.onload = () => {
          const S = 32
          const c = document.createElement('canvas'); c.width = S; c.height = S
          const ctx = c.getContext('2d')
          ctx.drawImage(img, 0, 0, S, S)
          const d = ctx.getImageData(0, 0, S, S).data
          let lum = 0, sat = 0
          for (let i = 0; i < d.length; i += 4) {
            const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255
            const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
            lum += (0.2126 * r + 0.7152 * g + 0.0722 * b)
            sat += mx === 0 ? 0 : (mx - mn) / mx
          }
          const n = d.length / 4
          res({ lum: lum / n, sat: sat / n, w: img.naturalWidth, h: img.naturalHeight })
        }
        img.onerror = () => res(null)
        img.src = src
      }), dataUrl)
      if (!m) continue
      // Luminosité : optimum 0.45-0.70 ; pénalité forte sous 0.35 (photos de nuit/crépuscule)
      const lumScore = m.lum < 0.35 ? (m.lum / 0.35) * 40
        : m.lum <= 0.70 ? 70 + ((m.lum - 0.35) / 0.35) * 30
        : 100 - ((m.lum - 0.70) / 0.30) * 35
      const satScore = Math.min(1, m.sat / 0.45) * 100
      const resScore = Math.min(1, Math.min(m.w, m.h * 1.6) / 800) * 100
      result[id] = Math.round(Math.max(0, Math.min(100, lumScore * 0.45 + satScore * 0.40 + resScore * 0.15)))
    } catch (e) { /* photo illisible → pas de score → jamais préférée */ }
  }
  await browser.close()
  // Curation manuelle : l'heuristique ne distingue pas "belle photo" de "belle
  // photo DE PLAGE" (mangrove fl007 scorait 60+). Overrides documentés, mergés ici
  // pour rester relançable sans perdre la curation.
  const ovPath = path.join(__dirname, 'data/photo-quality-overrides.json')
  if (fs.existsSync(ovPath)) {
    const ov = JSON.parse(fs.readFileSync(ovPath, 'utf8'))
    for (const [id, o] of Object.entries(ov)) {
      if (id.startsWith('_') || typeof (o && o.score) !== 'number') continue
      if (id in result) result[id] = o.score
    }
  }
  fs.writeFileSync(OUT, JSON.stringify(result))
  const vals = Object.values(result)
  console.log(`scored ${vals.length} photos | min ${Math.min(...vals)} max ${Math.max(...vals)} | moy ${Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)}`)
  const sorted = Object.entries(result).sort((a, b) => b[1] - a[1])
  console.log('top5:', sorted.slice(0, 5).map(([k, v]) => `${k}=${v}`).join(' '))
  console.log('flop5:', sorted.slice(-5).map(([k, v]) => `${k}=${v}`).join(' '))
})().catch(e => { console.error(e); process.exit(1) })
