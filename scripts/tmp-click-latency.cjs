/**
 * tmp-click-latency.cjs — chrono du ressenti clic→fiche sur le live.
 * 3 profils : pin isolé, pin en cluster (zoom désambig), dot démoté.
 * + hero→carte. La latence EST l'expérience (« ralentit l'UX »).
 */
const { chromium } = require("playwright");
const URL_ = process.argv[2] || "https://sargasses-martinique.com";

async function fresh(ctx) {
  const page = await ctx.newPage();
  await page.goto(URL_, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(9000)
  const t0 = Date.now()
  try { await page.click("text=/Toutes les plages|Toute l.île/i", { timeout: 4000 }) } catch (e) {}
  await page.waitForSelector(".leaflet-marker-pane .leaflet-marker-icon", { timeout: 20000 })
  const heroToMap = Date.now() - t0
  await page.waitForTimeout(3000) // settle fitBounds/re-renders
  return { page, heroToMap }
}

async function markers(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll(".leaflet-marker-pane .leaflet-marker-icon")).map(el => {
    const r = el.getBoundingClientRect()
    const isDot = !el.querySelector(".sg-pin")
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, isDot }
  }).filter(m => m.y > 150 && m.y < 640 && m.x > 30 && m.x < 360))
}

function classify(ms) {
  // density: neighbors within 18px → ambiguous
  return ms.map((m, i) => {
    let n = 0
    for (let j = 0; j < ms.length; j++) if (j !== i) {
      const dx = ms[j].x - m.x, dy = ms[j].y - m.y
      if (dx * dx + dy * dy <= 18 * 18) n++
    }
    return { ...m, ambig: n >= 1 }
  })
}

async function timeClick(page, m) {
  const t0 = Date.now()
  await page.mouse.click(m.x, m.y)
  try {
    await page.waitForSelector(".sheet h2", { timeout: 9000 })
    return Date.now() - t0
  } catch (e) { return -1 }
}

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  await ctx.addInitScript(() => { try { localStorage.setItem("sg_onb", "1") } catch (e) {} })

  const results = { isolated: [], ambig: [], dot: [] }
  let heroMs = null
  for (let round = 0; round < 6; round++) {
    const { page, heroToMap } = await fresh(ctx)
    if (heroMs == null) heroMs = heroToMap
    const ms = classify(await markers(page))
    const pick =
      round < 2 ? ms.find(m => !m.ambig && !m.isDot) :
      round < 4 ? ms.find(m => m.ambig && !m.isDot) :
                  ms.find(m => m.isDot)
    const bucket = round < 2 ? "isolated" : round < 4 ? "ambig" : "dot"
    if (!pick) { console.log(round, bucket, "aucune cible"); await page.close(); continue }
    const t = await timeClick(page, pick)
    results[bucket].push(t)
    console.log(`${bucket.padEnd(9)} clic→fiche: ${t < 0 ? "JAMAIS (9s+)" : t + " ms"} ${pick.isDot ? "(dot)" : ""}`)
    await page.close()
  }
  console.log("\nhero→carte interactive:", heroMs, "ms")
  console.log(JSON.stringify(results))
  await browser.close()
})()
