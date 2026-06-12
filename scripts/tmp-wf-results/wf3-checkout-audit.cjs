// wf3-checkout-audit.cjs — Audit UX du checkout USD live (sargassummiami.com)
// tel qu'un visiteur le vit. LECTURE SEULE : on atteint le formulaire de
// paiement mais on ne saisit RIEN et on ne soumet RIEN.
// Analytics bloquées (script.google.com, GA, GTM, Clarity) — zéro pollution KPI.
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const SHOTS = path.join(__dirname, 'wf3-checkout-shots')
fs.mkdirSync(SHOTS, { recursive: true })
const BASE = 'https://sargassummiami.com'
const BLOCK = /script\.google\.com|google-analytics\.com|analytics\.google\.com|googletagmanager\.com|clarity\.ms|doubleclick\.net|facebook\.(net|com)\/tr/
const sleep = ms => new Promise(r => setTimeout(r, ms))
const results = {}

async function dumpClickables(page) {
  return page.evaluate(() => {
    const vis = el => {
      const r = el.getBoundingClientRect(); const s = getComputedStyle(el)
      return r.width > 4 && r.height > 4 && r.bottom > 0 && r.top < innerHeight && r.left < innerWidth && r.right > 0 && s.visibility !== 'hidden' && s.display !== 'none'
    }
    return [...document.querySelectorAll('button, a, [role=button]')].filter(vis)
      .map(e => (e.innerText || e.getAttribute('aria-label') || e.title || '').trim().replace(/\s+/g, ' ').slice(0, 90)).filter(Boolean)
  })
}

// Racine du modal = ancêtre direct sous <body> du bouton dont le texte matche le pattern.
async function dumpRootText(page, btnPattern) {
  return page.evaluate((pat) => {
    const re = new RegExp(pat, 'i')
    const el = [...document.querySelectorAll('button')].find(b => re.test(b.innerText || ''))
    if (!el) return null
    let root = el
    while (root.parentElement && root.parentElement !== document.body) root = root.parentElement
    const r = root.getBoundingClientRect()
    return { text: root.innerText.slice(0, 5000), rect: { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) } }
  }, btnPattern)
}

async function payOverlayState(page) {
  return page.evaluate(() => {
    const em = [...document.querySelectorAll('input[type=email]')].pop()
    if (!em) return { state: 'no-email-input' }
    let root = em
    while (root.parentElement && root.parentElement !== document.body) root = root.parentElement
    const rect = root.getBoundingClientRect()
    const shown = rect.left >= -10 && rect.width > 100
    const spin = [...root.querySelectorAll('div')].some(d => ((d.style.animation || '') + (getComputedStyle(d).animationName || '')).includes('sgSpin'))
    const frs = [...root.querySelectorAll('iframe')].map(f => ({ name: (f.name || '').slice(0, 36), src: (f.src || '').replace(/^https?:\/\//, '').slice(0, 90), h: f.offsetHeight, w: f.offsetWidth }))
    const payFrameUp = frs.some(f => /stripe/i.test(f.src + f.name) && f.h > 80)
    return { state: shown && payFrameUp && !spin ? 'ready' : 'loading', shown, spin, frs, text: shown ? root.innerText.slice(0, 3000) : '' }
  })
}

// Lit les champs DANS les iframes Stripe (lecture seule, aucune saisie).
async function dumpStripeFrames(page) {
  const out = []
  for (const fr of page.frames()) {
    const u = fr.url()
    if (!/stripe\.com|stripe\.network/.test(u)) continue
    const kind = /express-checkout/.test(u) ? 'express-checkout' : /payment/.test(u) ? 'payment-element' : 'other'
    try {
      const fields = await fr.evaluate(() => {
        const vis = el => { const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2 }
        const inputs = [...document.querySelectorAll('input,select')].filter(vis).map(i => ({
          tag: i.tagName.toLowerCase(), name: i.name || i.id || '', placeholder: i.placeholder || '',
          label: i.getAttribute('aria-label') || '', autocomplete: i.getAttribute('autocomplete') || ''
        }))
        const tabs = [...document.querySelectorAll('[role=tab],button')].filter(vis).map(b => (b.innerText || b.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 60)).filter(Boolean)
        const labels = [...document.querySelectorAll('label,legend')].filter(vis).map(l => l.innerText.trim().replace(/\s+/g, ' ').slice(0, 60)).filter(Boolean)
        return { inputs, tabs, labels, bodyText: document.body.innerText.replace(/\s+/g, ' ').slice(0, 600) }
      })
      out.push({ kind, url: u.replace(/^https?:\/\//, '').slice(0, 80), ...fields })
    } catch (e) { out.push({ kind, url: u.slice(0, 80), error: e.message.slice(0, 80) }) }
  }
  return out
}

async function run(name, viewport, { prelude = false } = {}) {
  console.log(`\n${'='.repeat(70)}\n=== RUN ${name} (${viewport.width}x${viewport.height})${prelude ? ' — variante PRELUDE' : ' — variante DIRECT'} ===\n${'='.repeat(70)}`)
  const R = results[name] = { viewport, variant: prelude ? 'prelude' : 'direct', clicks: [], timings: {}, notes: [] }
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, locale: 'en-US' })
  // ── Blocage analytics (KPI funnel intouché) ──
  let blocked = 0
  await ctx.route('**/*', route => {
    if (BLOCK.test(route.request().url())) { blocked++; return route.abort() }
    return route.continue()
  })
  // Variante A/B déterministe (pw_prelude : 0=direct, 1=prelude)
  await ctx.addInitScript((p) => { localStorage.setItem('sg_ab', JSON.stringify({ pw_prelude: p ? 1 : 0 })) }, prelude)
  const page = await ctx.newPage()
  const netLog = []
  page.on('request', rq => { const u = rq.url(); if (/create-checkout\.php|js\.stripe\.com\/|api\.stripe\.com/.test(u)) netLog.push({ t: Date.now(), u: u.replace(/^https?:\/\//, '').slice(0, 90) }) })
  let stripeNav = false
  page.on('framenavigated', f => { if (f === page.mainFrame() && /stripe\.com/.test(f.url())) stripeNav = true })
  const shot = async (file) => { await page.screenshot({ path: path.join(SHOTS, `wf3-${name}-${file}.png`) }); console.log(`  [shot] wf3-${name}-${file}.png`) }

  // ── 1. LANDING ──
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await sleep(4000)
  const perf = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0]
    return n ? { ttfb: Math.round(n.responseStart), dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd) } : null
  })
  R.timings.landing = perf
  console.log('LANDING perf:', JSON.stringify(perf))
  await shot('01-landing')
  const landingText = await page.evaluate(() => document.body.innerText.slice(0, 900))
  R.landingText = landingText
  console.log('LANDING text:', landingText.replace(/\n+/g, ' | ').slice(0, 500))
  const landingBtns = await dumpClickables(page)
  R.landingButtons = landingBtns
  console.log('LANDING clickables:', JSON.stringify(landingBtns))

  // ── 2. OUVRIR LA CARTE ──
  // Hero Verdict : bouton carte (onShowMap). Candidats par libellé.
  let mapBtn = page.locator('button:has-text("map"), [role=button]:has-text("map")').first()
  let mapEntryLabel = null
  try {
    await mapBtn.waitFor({ state: 'visible', timeout: 4000 })
    mapEntryLabel = (await mapBtn.innerText()).trim().replace(/\s+/g, ' ')
  } catch {
    mapBtn = page.locator('button:has-text("beaches"), button:has-text("Explore")').first()
    try { await mapBtn.waitFor({ state: 'visible', timeout: 3000 }); mapEntryLabel = (await mapBtn.innerText()).trim() } catch { mapBtn = null }
  }
  if (mapBtn) {
    await mapBtn.click()
    R.clicks.push({ n: 'landing→map', label: mapEntryLabel })
    console.log(`CLICK landing→map: "${mapEntryLabel}"`)
  } else { R.notes.push('Aucun bouton carte trouvé sur le hero — la carte était peut-être déjà visible.') }
  await sleep(4000)
  await shot('02-map')
  const mapChrome = await dumpClickables(page)
  R.mapChrome = mapChrome
  console.log('MAP clickables:', JSON.stringify(mapChrome))

  // ── 3. CLIC PIN PLAGE (début du compteur carte→paiement) ──
  let mapClicks = 0
  const pins = await page.locator('.leaflet-marker-icon').count()
  console.log('PINS leaflet:', pins)
  let sheetOpened = false
  const pinOrder = [Math.floor(pins / 2), 0, pins - 1, Math.floor(pins / 3)]
  for (const idx of pinOrder) {
    if (idx < 0 || idx >= pins) continue
    const box = await page.locator('.leaflet-marker-icon').nth(idx).boundingBox().catch(() => null)
    if (!box) continue
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    mapClicks++
    await sleep(2200)
    sheetOpened = await page.evaluate(() => {
      const t = document.body.innerText
      return /Forecast|Prévisions|7-day|day forecast|Score/i.test(t) && [...document.querySelectorAll('button')].some(b => /premium|unlock/i.test(b.innerText || ''))
    })
    if (sheetOpened) { R.clicks.push({ n: `map→beach-sheet (pin #${idx})`, label: 'pin' }); break }
    mapClicks-- // clic raté (cluster/zoom) : noté mais pas compté
    R.notes.push(`Clic pin #${idx} sans ouverture de fiche (cluster/zoom ?)`)
  }
  if (!sheetOpened) {
    R.notes.push('Pins KO — fallback liste')
    const listTab = page.locator('button:has-text("Beaches"), button:has-text("List")').first()
    await listTab.click().catch(() => {})
    mapClicks++
    await sleep(1500)
    const first = page.locator('[class*=beach], li, [role=listitem]').first()
    await first.click().catch(() => {})
    mapClicks++
    await sleep(2000)
  }
  await shot('03-beach-sheet')
  const sheetText = await page.evaluate(() => document.body.innerText.slice(0, 1600))
  R.sheetText = sheetText
  console.log('SHEET text:', sheetText.replace(/\n+/g, ' | ').slice(0, 700))
  const sheetBtns = await dumpClickables(page)
  console.log('SHEET clickables:', JSON.stringify(sheetBtns))

  // ── 4. DÉCLENCHEUR PAYWALL depuis la fiche ──
  // Trigger réel dans la fiche : bouton "🔒 Unlock forecast" sur le forecast
  // (jours verrouillés), sinon teaser "Next days:", sinon dock ⭐ Premium.
  let trigger = null
  const lockBtn = page.locator('button:has-text("Unlock")').first()
  if (await lockBtn.isVisible().catch(() => false) || await lockBtn.count() > 0) {
    await lockBtn.scrollIntoViewIfNeeded().catch(() => {})
    await sleep(600)
    await shot('03b-sheet-forecast-lock')
    if (await lockBtn.isVisible().catch(() => false)) {
      trigger = { sel: 'unlock-forecast', label: (await lockBtn.innerText().catch(() => '')).trim().replace(/\s+/g, ' ').slice(0, 90) }
      await lockBtn.click({ timeout: 8000 }).catch(() => { trigger = null })
      if (trigger) mapClicks++
    }
  }
  if (!trigger) {
    const teaser = page.locator('div:has-text("Next days:")').last()
    if (await teaser.isVisible().catch(() => false)) {
      trigger = { sel: 'forecast-teaser-strip', label: (await teaser.innerText().catch(() => '')).trim().replace(/\s+/g, ' ').slice(0, 90) }
      await teaser.click({ timeout: 8000 }).catch(() => { trigger = null })
      if (trigger) mapClicks++
    }
  }
  if (!trigger) {
    // dernier recours : fermer la fiche puis dock ⭐ Premium (+1 clic réel)
    await page.locator('button:has-text("✕")').first().click().catch(() => {})
    mapClicks++
    R.notes.push('Pas de trigger in-sheet cliquable — fermeture fiche + dock Premium (+1 clic)')
    await sleep(800)
    const dock = page.locator('button:has-text("Premium")').last()
    if (await dock.isVisible().catch(() => false)) {
      trigger = { sel: 'dock-premium', label: (await dock.innerText().catch(() => '')).trim().replace(/\s+/g, ' ').slice(0, 90) }
      await dock.click()
      mapClicks++
    }
  }
  if (!trigger) { R.notes.push('Aucun déclencheur Premium trouvé — abandon'); await browser.close(); return }
  R.clicks.push({ n: 'sheet→paywall', label: trigger.label })
  console.log(`CLICK sheet→paywall: "${trigger.label}" (${trigger.sel})`)
  const tModalOpen = Date.now()
  await sleep(2500)
  await shot('04-paywall-top')

  // ── 5. AUDIT DU MODAL ──
  const ctaSel = 'button:has-text("Get my daily pick"), button:has-text("daily pick")'
  const modal = await dumpRootText(page, 'daily pick')
  if (modal) {
    R.paywallText = modal.text
    console.log('--- PAYWALL MODAL (texte intégral, ordre DOM) ---')
    console.log(modal.text.split('\n').filter(Boolean).map((l, i) => `  ${String(i + 1).padStart(2)}. ${l}`).join('\n'))
  } else { R.notes.push('CTA "daily pick" introuvable dans le modal !') }
  // Prix visible SANS scroll ?
  const priceVis = await page.evaluate(() => {
    const els = [...document.querySelectorAll('div,span,button,h2,b')].filter(e => /\$\s?\d/.test(e.textContent || '') && e.children.length === 0)
    return els.map(e => { const r = e.getBoundingClientRect(); return { txt: e.textContent.trim().slice(0, 60), inViewport: r.top >= 0 && r.bottom <= innerHeight && r.width > 0 } })
  })
  R.priceVisibleOnOpen = priceVis
  console.log('PRICE elements (in viewport on open):', JSON.stringify(priceVis))
  // Scroll du contenu du modal pour la 2e capture
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /daily pick/i.test(x.innerText || ''))
    if (!b) return
    let root = b
    while (root.parentElement && root.parentElement !== document.body) root = root.parentElement
    const scrollable = [root, ...root.querySelectorAll('div')].find(d => d.scrollHeight > d.clientHeight + 40)
    if (scrollable) scrollable.scrollTop = scrollable.scrollHeight
  })
  await sleep(800)
  await shot('05-paywall-scrolled')
  // Dwell lecture réaliste (laisse le prewarm Stripe travailler comme chez un vrai user)
  await sleep(7000)

  // ── 6. CLIC CTA PAIEMENT ──
  const cta = page.locator(ctaSel).first()
  const ctaLabel = (await cta.innerText().catch(() => '?')).trim().replace(/\s+/g, ' ')
  console.log(`CLICK paywall CTA: "${ctaLabel}"`)
  const tCta = Date.now()
  await cta.click()
  mapClicks++
  R.clicks.push({ n: 'paywall→payment', label: ctaLabel })

  // ── 6bis. PRELUDE (si variante) ──
  if (prelude) {
    await sleep(1200)
    await shot('06-prelude')
    const prel = await dumpRootText(page, 'Continue to Stripe')
    if (prel) {
      R.preludeText = prel.text
      console.log('--- PRELUDE (texte intégral) ---')
      console.log(prel.text.split('\n').filter(Boolean).map((l, i) => `  ${String(i + 1).padStart(2)}. ${l}`).join('\n'))
      const cont = page.locator('button:has-text("Continue to Stripe")').first()
      console.log('CLICK prelude→payment: "Continue to Stripe"')
      await cont.click()
      mapClicks++
      R.clicks.push({ n: 'prelude→payment', label: 'Continue to Stripe →' })
    } else R.notes.push('Variante prelude forcée mais interstitiel non affiché')
  }
  const tPayClick = Date.now()

  // ── 7. ATTENTE FORMULAIRE DE PAIEMENT (lecture seule) ──
  let payState = null, tReady = null, firstShotDone = false
  for (let i = 0; i < 180; i++) {
    payState = await payOverlayState(page).catch(e => ({ state: 'err', err: e.message }))
    if (!firstShotDone && Date.now() - tPayClick > 1100) { await shot('07-payment-loading'); firstShotDone = true }
    if (payState.state === 'ready') { tReady = Date.now(); break }
    if (stripeNav) { R.notes.push('FALLBACK : navigation pleine page vers stripe.com'); tReady = Date.now(); break }
    await sleep(250)
  }
  R.timings.modalOpenToCtaMs = tCta - tModalOpen
  R.timings.ctaToPaymentReadyMs = tReady ? tReady - tPayClick : null
  R.timings.paymentReadyOnsite = !!tReady && !stripeNav
  R.stripeNavFallback = stripeNav
  console.log(`PAYMENT form ready: ${tReady ? (tReady - tPayClick) + 'ms après le clic' : 'JAMAIS (45s timeout)'}${stripeNav ? ' — via REDIRECT stripe.com' : ' — ON-SITE'}`)
  await sleep(1200)
  await shot('08-payment-ready')

  // ── 8. LECTURE DE LA PAGE DE PAIEMENT ──
  if (stripeNav) {
    R.paymentPageText = await page.evaluate(() => document.body.innerText.slice(0, 4000)).catch(() => '')
    console.log('--- STRIPE PAGE (texte) ---')
    console.log((R.paymentPageText || '').replace(/\n+/g, ' | ').slice(0, 1500))
  } else {
    const ov = await payOverlayState(page)
    R.paymentOverlay = { text: ov.text, iframes: ov.frs }
    console.log('--- PAYMENT OVERLAY (texte intégral, ordre DOM) ---')
    console.log((ov.text || '').split('\n').filter(Boolean).map((l, i) => `  ${String(i + 1).padStart(2)}. ${l}`).join('\n'))
    console.log('IFRAMES:', JSON.stringify(ov.frs))
    const stripeFrames = await dumpStripeFrames(page)
    R.stripeFrames = stripeFrames
    console.log('--- CHAMPS STRIPE (lecture seule) ---')
    console.log(JSON.stringify(stripeFrames, null, 1).slice(0, 3500))
    // Réassurance / annulation visibles dans le viewport au moment carte ?
    const visCheck = await page.evaluate(() => {
      const hits = []
      for (const e of document.querySelectorAll('div,span,button,h3')) {
        const t = (e.textContent || '').trim()
        if (e.children.length > 0) continue
        if (/cancel|billed today|no commitment|money-back|secured|stripe/i.test(t) && t.length < 120) {
          const r = e.getBoundingClientRect()
          if (r.width > 0) hits.push({ txt: t.slice(0, 100), inViewport: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 })
        }
      }
      return hits
    })
    R.paymentReassurance = visCheck
    console.log('REASSURANCE au moment carte:', JSON.stringify(visCheck))
    const payBtnVis = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => /^Pay \$|activate now/i.test((x.innerText || '').trim()))
      if (!b) return null
      const r = b.getBoundingClientRect()
      return { label: b.innerText.trim().replace(/\s+/g, ' '), inViewport: r.top >= 0 && r.bottom <= innerHeight }
    })
    R.payButton = payBtnVis
    console.log('PAY button:', JSON.stringify(payBtnVis))
    await page.evaluate(() => {
      const em = [...document.querySelectorAll('input[type=email]')].pop()
      if (!em) return
      let root = em
      while (root.parentElement && root.parentElement !== document.body) root = root.parentElement
      root.scrollTop = root.scrollHeight
    })
    await sleep(600)
    await shot('09-payment-bottom')
  }

  // prewarm timeline (réseau stripe vs ouverture modal)
  R.networkTimeline = netLog.map(e => ({ tFromModalOpenMs: e.t - tModalOpen, u: e.u }))
  console.log('NETWORK (t depuis ouverture paywall):', JSON.stringify(R.networkTimeline.slice(0, 12), null, 1))
  R.clicksMapToPayment = mapClicks
  R.blockedRequests = blocked
  console.log(`CLICS carte→formulaire: ${mapClicks} | requêtes analytics bloquées: ${blocked}`)
  await browser.close()
}

;(async () => {
  await run('mobile', { width: 390, height: 844 })
  await run('desktop', { width: 1280, height: 800 })
  await run('mobile-prelude', { width: 390, height: 844 }, { prelude: true })
  fs.writeFileSync(path.join(SHOTS, 'wf3-results.json'), JSON.stringify(results, null, 2))
  console.log('\n=== DONE — résultats: wf3-checkout-shots/wf3-results.json ===')
})().catch(e => { console.error('FAIL', e.stack || e.message); process.exit(1) })
