#!/usr/bin/env node
/**
 * generate-og-images.cjs — Per-region og:image PNGs (1200x630) for the new regions.
 * Same visual family as the MQ/GP og-image.png (blue gradient, brand row + LIVE pill,
 * big region name, tagline, status legend, credits) but in the region's language.
 * Output: public/og/og-image-<regionId>.png — prepare-ftp.cjs copies it over
 * og-image.png in each region's FTP dir so the og:image URL stays /og-image.png.
 *
 * Usage: node scripts/generate-og-images.cjs [--region=puntacana]
 */
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const { getAllRegions } = require('../regions/index.cjs')

const ONLY = (process.argv.find(a => a.startsWith('--region=')) || '').replace('--region=', '')
// Hors de public/ : ces variantes ne doivent PAS être copiées dans tous les
// builds — prepare-ftp.cjs copie la bonne en og-image.png par région.
const OUT_DIR = path.resolve(__dirname, '..', 'regions', 'og')

const T = {
  en: {
    brand: 'SARGASSUM', live: 'LIVE',
    tagline: 'Live beach map · Clean beaches · 7-day forecast',
    legend: [['#34D399', 'Clean'], ['#FBBF24', 'Moderate'], ['#F87171', 'Avoid']],
    credits: 'Copernicus Marine satellite data · Updated daily',
  },
  es: {
    brand: 'SARGAZO', live: 'EN VIVO',
    tagline: 'Mapa en vivo · Playas limpias · Pronóstico 7 días',
    legend: [['#34D399', 'Limpia'], ['#FBBF24', 'Moderado'], ['#F87171', 'Evitar']],
    credits: 'Datos satelitales Copernicus Marine · Actualizado a diario',
  },
}

function htmlFor(region) {
  const t = T[region.primaryLang] || T.en
  const accent = '#F5A623'
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:1200px;height:630px;font-family:'Segoe UI',Arial,sans-serif;
    background:linear-gradient(135deg,#0a6aa6 0%,#0a4d8c 55%,#06365f 100%);
    color:#fff;position:relative;overflow:hidden}
  .row{position:absolute;top:36px;left:48px;display:flex;align-items:center;gap:14px}
  .logo{width:44px;height:44px;border-radius:10px;background:#0D2B45;display:flex;align-items:center;justify-content:center;font-size:24px}
  .brand{font-size:30px;font-weight:800;letter-spacing:.5px}
  .pill{position:absolute;top:40px;left:50%;transform:translateX(-50%);
    background:${accent};border-radius:20px;padding:9px 22px;font-size:17px;font-weight:700;display:flex;align-items:center;gap:9px}
  .dot{width:11px;height:11px;border-radius:50%;background:#E03131;box-shadow:0 0 6px #E03131}
  .center{position:absolute;top:0;left:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 60px}
  h1{font-size:84px;font-weight:800;line-height:1.04}
  h1 .accent{color:${accent}}
  .tag{margin-top:26px;font-size:31px;color:rgba(255,255,255,.88);font-weight:400}
  .legend{position:absolute;bottom:34px;left:48px;display:flex;gap:26px;font-size:19px;align-items:center}
  .legend i{display:inline-block;width:13px;height:13px;border-radius:50%;margin-right:8px;vertical-align:-1px}
  .credits{position:absolute;bottom:36px;right:48px;font-size:15px;color:rgba(255,255,255,.55)}
  </style></head><body>
  <div class="row"><div class="logo">🌊</div><div class="brand">${t.brand}</div></div>
  <div class="pill"><span class="dot"></span>${t.live}</div>
  <div class="center">
    <h1>${region.name.includes(' ') ? region.name.replace(/ (?=[^ ]+$)/, ' <span class="accent">') + '</span>' : `<span class="accent">${region.name}</span>`}</h1>
    <div class="tag">${t.tagline}</div>
  </div>
  <div class="legend">${(t.legend).map(([c, l]) => `<span><i style="background:${c}"></i>${l}</span>`).join('')}</div>
  <div class="credits">${t.credits}</div>
  </body></html>`
}

;(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const regions = getAllRegions().filter(r => r.id !== 'mq' && r.id !== 'gp').filter(r => !ONLY || r.id === ONLY)
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
  for (const region of regions) {
    await page.setContent(htmlFor(region), { waitUntil: 'networkidle' })
    const out = path.join(OUT_DIR, `og-image-${region.id}.png`)
    await page.screenshot({ path: out })
    console.log(`✓ ${region.id} → ${path.relative(process.cwd(), out)} (${Math.round(fs.statSync(out).size / 1024)}KB)`)
  }
  await browser.close()
})()
