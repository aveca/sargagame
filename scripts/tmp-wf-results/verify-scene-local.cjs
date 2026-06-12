// Vérif scène vivante WebGL : le canvas anime (diff pixels entre 2 frames),
// reduced-motion la désactive, et capture pour contrôle visuel.
const { chromium } = require('playwright')
const fs = require('fs')
const wait = ms => new Promise(r => setTimeout(r, ms))
const SHOTS = __dirname + '/landing-shots'

;(async () => {
  const br = await chromium.launch({ args: ['--use-gl=angle'] })
  const out = {}

  // 1. Scène active : le rendu bouge tout seul
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 } })
  const pg = await ctx.newPage()
  await pg.route(/script\.google\.com/, r => r.abort())
  await pg.addInitScript(() => { try { sessionStorage.removeItem('sg_hero_seen') } catch (_) {} })
  await pg.goto('http://localhost:5220/', { waitUntil: 'domcontentloaded' })
  await pg.waitForSelector('[role=dialog]', { timeout: 15000 })
  await wait(3500)
  out.canvasPresent = await pg.evaluate(() => !!document.querySelector('[role=dialog] canvas'))
  const clip = { x: 40, y: 400, width: 310, height: 70 } // bande eau visible entre mi-écran et le bloc texte
  const f1 = await pg.screenshot({ clip })
  await wait(600)
  const f2 = await pg.screenshot({ clip })
  let diff = 0
  for (let i = 0; i < Math.min(f1.length, f2.length); i++) if (f1[i] !== f2[i]) diff++
  out.framesDiffer = diff
  // parallaxe : déplace le pointeur, la cible doit suivre
  await pg.mouse.move(40, 100); await wait(700)
  const f3 = await pg.screenshot({ clip })
  await pg.mouse.move(350, 800); await wait(700)
  const f4 = await pg.screenshot({ clip })
  let diffPar = 0
  for (let i = 0; i < Math.min(f3.length, f4.length); i++) if (f3[i] !== f4[i]) diffPar++
  out.parallaxDiff = diffPar
  await pg.screenshot({ path: SHOTS + '/scene-hero-live.png' })
  out.videoLoaded = await pg.evaluate(() => !!document.querySelector('[role=dialog] video'))
  await ctx.close()

  // 2. reduced-motion : pas de canvas, pas de vidéo
  const ctx2 = await br.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
  const pg2 = await ctx2.newPage()
  await pg2.route(/script\.google\.com/, r => r.abort())
  await pg2.addInitScript(() => { try { sessionStorage.removeItem('sg_hero_seen') } catch (_) {} })
  await pg2.goto('http://localhost:5220/', { waitUntil: 'domcontentloaded' })
  await pg2.waitForSelector('[role=dialog]', { timeout: 15000 })
  await wait(2500)
  out.reducedMotion = await pg2.evaluate(() => ({
    canvas: !!document.querySelector('[role=dialog] canvas'),
    video: !!document.querySelector('[role=dialog] video'),
  }))
  await ctx2.close()

  console.log(JSON.stringify(out, null, 1))
  await br.close()
})().catch(e => { console.error(e); process.exit(1) })
