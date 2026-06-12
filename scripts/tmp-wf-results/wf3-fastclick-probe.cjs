// wf3-fastclick-probe.cjs — Mesure le pire cas : visiteur qui clique le CTA
// paiement IMMÉDIATEMENT après l'ouverture du paywall (sans lecture = sans
// laisser le prewarm Stripe finir). Lecture seule, analytics bloquées.
const { chromium } = require('playwright')
const path = require('path')
const BLOCK = /script\.google\.com|google-analytics\.com|analytics\.google\.com|googletagmanager\.com|clarity\.ms|doubleclick\.net|facebook\.(net|com)\/tr/
const sleep = ms => new Promise(r => setTimeout(r, ms))
;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'en-US' })
  await ctx.route('**/*', route => BLOCK.test(route.request().url()) ? route.abort() : route.continue())
  await ctx.addInitScript(() => { localStorage.setItem('sg_ab', JSON.stringify({ pw_prelude: 0 })) })
  const page = await ctx.newPage()
  await page.goto('https://sargassummiami.com/', { waitUntil: 'domcontentloaded' })
  await sleep(3500)
  await page.locator('button:has-text("map"), [role=button]:has-text("map")').first().click()
  await sleep(3000)
  const pins = await page.locator('.leaflet-marker-icon').count()
  const box = await page.locator('.leaflet-marker-icon').nth(Math.floor(pins / 2)).boundingBox()
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await sleep(2000)
  const lockBtn = page.locator('button:has-text("Unlock")').first()
  await lockBtn.scrollIntoViewIfNeeded()
  await lockBtn.click()
  const tModal = Date.now()
  // CTA cliqué dès qu'il est actionnable — AUCUN dwell de lecture
  const cta = page.locator('button:has-text("daily pick")').first()
  await cta.click()
  const tCta = Date.now()
  console.log(`CTA cliqué ${tCta - tModal}ms après l'ouverture du paywall (zéro lecture)`)
  let tReady = null
  for (let i = 0; i < 240; i++) {
    const st = await page.evaluate(() => {
      const em = [...document.querySelectorAll('input[type=email]')].pop()
      if (!em) return 'no'
      let root = em
      while (root.parentElement && root.parentElement !== document.body) root = root.parentElement
      const r = root.getBoundingClientRect()
      const shown = r.left >= -10 && r.width > 100
      const spin = [...root.querySelectorAll('div')].some(d => ((d.style.animation || '') + (getComputedStyle(d).animationName || '')).includes('sgSpin'))
      const fr = [...root.querySelectorAll('iframe')].some(f => /stripe/i.test((f.src || '') + (f.name || '')) && f.offsetHeight > 80)
      return shown && fr && !spin ? 'ready' : 'loading'
    }).catch(() => 'err')
    if (st === 'ready') { tReady = Date.now(); break }
    await sleep(200)
  }
  console.log(tReady ? `Formulaire interactif ${tReady - tCta}ms après le clic CTA` : 'TIMEOUT 48s — formulaire jamais prêt')
  await page.screenshot({ path: path.join(__dirname, 'wf3-checkout-shots', 'wf3-fastclick-payment.png') })
  await browser.close()
})().catch(e => { console.error('FAIL', e.message); process.exit(1) })
