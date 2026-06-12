/* Jetable — audit UI/UX live sargassumpuntacana.com (mobile + desktop).
 * Screenshots + dumps texte dans scripts/tmp-audit-pc/. NE TOUCHE A RIEN D'AUTRE. */
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const OUT = path.join(__dirname, 'tmp-audit-pc')
fs.mkdirSync(OUT, { recursive: true })
const BASE = 'https://sargassumpuntacana.com'

const FR_RE = /\b(plage|plages|aujourd'hui|prévision|prévisions|gratuit|essai|abonn|connexion|signaler|météo|houle|baignade|propre|modéré|éviter|chargement|fermer|rechercher|alerte|découvrir|voir plus|jours|semaine|mois\b)\b/i

async function shot(page, file) {
  try { await page.screenshot({ path: file, animations: 'disabled', caret: 'hide', timeout: 15000 }) }
  catch (e) { console.error('shot fail', file, String(e).slice(0, 100)) }
}

async function dumpState(page, tag, results) {
  let txt = ''
  for (let i = 0; i < 3; i++) {
    try { txt = await page.evaluate(() => document.body.innerText); break }
    catch (e) { await page.waitForTimeout(1500) }
  }
  fs.writeFileSync(path.join(OUT, `text-${tag}.txt`), txt, 'utf-8')
  const frHits = txt.split('\n').filter(l => FR_RE.test(l)).slice(0, 30)
  results[tag] = { frHits, eur: /€|EUR/.test(txt), usd: /\$\s?\d/.test(txt) }
}

async function run(label, viewport, isMobile) {
  const browser = await chromium.launch({ headless: true, args: ['--disable-gpu', '--no-sandbox'] })
  const ctx = await browser.newContext({
    viewport, isMobile, hasTouch: isMobile, deviceScaleFactor: 1,
    userAgent: isMobile ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' : undefined,
    locale: 'en-US',
  })
  const page = await ctx.newPage()
  const consoleErrors = []
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)) })
  page.on('pageerror', e => consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 200)))

  const results = { label, consoleErrors }
  const t0 = Date.now()
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {})
  results.loadMs = Date.now() - t0
  await page.waitForTimeout(2500)
  await shot(page, path.join(OUT, `${label}-1-home.png`))
  await dumpState(page, `${label}-home`, results)

  // ── 2. Clic pastille plage → bottom sheet ──
  let sheetOpened = false
  const markers = await page.$$('.leaflet-marker-pane > *')
  results.markerCount = markers.length
  for (const m of markers.slice(0, 6)) {
    try {
      const box = await m.boundingBox()
      if (!box || box.y < 60) continue
      await m.click({ force: true, timeout: 3000 })
      await page.waitForTimeout(1800)
      const txt = await page.evaluate(() => document.body.innerText)
      if (/Beach Score|7-day|Tomorrow|forecast/i.test(txt) && txt.length > 400) { sheetOpened = true; break }
    } catch (e) { /* next */ }
  }
  results.sheetOpened = sheetOpened
  await shot(page, path.join(OUT, `${label}-2-sheet.png`))
  await dumpState(page, `${label}-sheet`, results)

  // ── 3. Lock forecast dans la sheet → paywall ──
  let paywallVia = null
  try {
    const lock = page.locator('text=/unlock|see 7-day|tomorrow/i').first()
    if (await lock.count()) { await lock.click({ timeout: 3000 }); paywallVia = 'sheet-lock' }
  } catch (e) {}
  if (!paywallVia) {
    // fallback : onglet Premium du dock
    try {
      await page.keyboard.press('Escape').catch(() => {})
      const prem = page.locator('text=Premium').last()
      await prem.click({ timeout: 5000 })
      paywallVia = 'dock'
    } catch (e) { paywallVia = 'FAILED: ' + String(e).slice(0, 120) }
  }
  await page.waitForTimeout(2000)
  results.paywallVia = paywallVia
  await shot(page, path.join(OUT, `${label}-3-paywall.png`))
  await dumpState(page, `${label}-paywall`, results)

  // ── 4. Vue liste (nav Beaches) ──
  try {
    await page.keyboard.press('Escape').catch(() => {})
    await page.locator('text=/^(Beaches|List)$/').first().click({ timeout: 5000 })
    await page.waitForTimeout(1500)
    await shot(page, path.join(OUT, `${label}-4-list.png`))
    await dumpState(page, `${label}-list`, results)
  } catch (e) { results.listView = 'FAILED: ' + String(e).slice(0, 120) }

  await browser.close()
  return results
}

async function homePass(label, viewport, isMobile) {
  const browser = await chromium.launch({ headless: true, args: ['--disable-gpu', '--no-sandbox'] })
  const ctx = await browser.newContext({ viewport, isMobile, hasTouch: isMobile, deviceScaleFactor: 1, locale: 'en-US' })
  const page = await ctx.newPage()
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForTimeout(9000)
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' })
  await page.waitForTimeout(500)
  await shot(page, path.join(OUT, `${label}-1-home.png`))
  try {
    await page.locator('text=Beaches').last().click({ timeout: 5000 })
    await page.waitForTimeout(2000)
    await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' })
    await shot(page, path.join(OUT, `${label}-4-list.png`))
    const txt = await page.evaluate(() => document.body.innerText)
    fs.writeFileSync(path.join(OUT, `text-${label}-list.txt`), txt, 'utf-8')
  } catch (e) { console.error('list fail', String(e).slice(0, 120)) }
  await browser.close()
}

;(async () => {
  await homePass('mobile', { width: 390, height: 844 }, true)
  await homePass('desktop', { width: 1440, height: 900 }, false)
  console.log('home pass done')
})().catch(e => { console.error(e); process.exit(1) })
