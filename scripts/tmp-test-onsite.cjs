// Test instrumenté du paiement ON-SITE : trace chaque milestone du prewarm.
const { chromium } = require('playwright')
const ARG = process.argv[2] || '5193'
const BASE = ARG.startsWith('http') ? ARG : `http://localhost:${ARG}`
;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await ctx.addInitScript(() => {
    // abVariant stocke des INDICES : pw_prelude variants=["direct","prelude"] → 0 = direct
    localStorage.setItem('sg_ab', JSON.stringify({ pw_prelude: 0 }))
    const T0 = Date.now()
    const mark = (m) => console.log(`[T+${((Date.now() - T0) / 1000).toFixed(1)}s] ${m}`)
    window.__mark = mark
    // trace fetch create-checkout
    const of = window.fetch
    window.fetch = function (u, o) {
      const isCk = String(u).includes('create-checkout')
      const body = isCk && o && o.body ? String(o.body).slice(0, 60) : ''
      if (isCk) mark(`fetch → ${body}`)
      const t = Date.now()
      const p = of.apply(this, arguments)
      if (isCk) p.then(r => mark(`fetch ← ${r.status} (${Date.now() - t}ms) ${body}`), e => mark(`fetch ✗ ${e.message} ${body}`))
      return p
    }
    // trace stripe.js + window.Stripe
    const iv = setInterval(() => { if (window.Stripe) { mark('window.Stripe disponible'); clearInterval(iv) } }, 200)
    // trace iframes ajoutées (documentElement peut être null au moment de l'init script)
    const obs = () => {
      if (!document.documentElement) { setTimeout(obs, 50); return }
      new MutationObserver(ms => {
        for (const m of ms) for (const n of m.addedNodes) {
          if (n.tagName === 'IFRAME') mark(`iframe ajoutée: name=${(n.name || '').slice(0, 40)} src=${(n.src || '').slice(0, 60)}`)
        }
      }).observe(document.documentElement, { childList: true, subtree: true })
    }
    obs()
    window.addEventListener('unhandledrejection', e => mark(`UNHANDLED REJECTION: ${e.reason && e.reason.message}`))
  })
  const page = await ctx.newPage()
  page.on('console', m => { const t = m.text(); if (/^\[T\+|sg_onsite|sg_pay/.test(t)) console.log(t.slice(0, 200)) })
  page.on('pageerror', e => console.log('PAGEERROR:', e.message.slice(0, 200)))
  let fellBack = false
  page.on('framenavigated', f => { if (f === page.mainFrame() && /stripe\.com/.test(f.url())) fellBack = true })

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(9500)
  // Scénario paywall→CTA, rejouable : le SW v37 force-reload la page à son
  // activation (~10-25s après l'arrivée), ce qui ferme le modal (fixé en v38).
  let cta, attempt = 0
  while (true) {
    attempt++
    try {
      const prem = page.locator('button:has-text("Premium")').first()
      await prem.waitFor({ state: 'visible', timeout: 10000 })
      await prem.click()
      console.log(`--- paywall ouvert (tentative ${attempt}), lecture 14s ---`)
      await page.waitForTimeout(14000)
      // CTA payant FR/EN/ES
      cta = page.locator('button:has-text("Activer ma reco"), button:has-text("Start my daily pick"), button:has-text("Activar mi playa")').first()
      await cta.waitFor({ state: 'visible', timeout: 8000 })
      break
    } catch (e) {
      if (attempt >= 3) throw e
      console.log(`(reload SW détecté pendant la tentative ${attempt} — on rejoue le scénario)`)
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(4000)
    }
  }
  console.log('--- clic CTA ---')
  const t0 = Date.now()
  await cta.click()
  try {
    await page.waitForFunction(() => {
      const spin = [...document.querySelectorAll('div')].some(d => (d.style.animation || '').includes('sgSpin'))
      // L'overlay on-site doit être RÉELLEMENT visible (transform none, pas hors-écran)
      const heads = [...document.querySelectorAll('h3')].filter(h => /essai gratuit|free trial|prueba gratis/i.test(h.textContent))
      const overlayShown = heads.some(h => { const r = h.getBoundingClientRect(); return r.width > 0 && r.left >= 0 && r.left < innerWidth })
      const fr = [...document.querySelectorAll('iframe')].filter(f => /stripe/i.test(f.src || f.name || ''))
      return overlayShown && !spin && fr.some(f => f.offsetHeight > 80)
    }, { timeout: 45000 })
    console.log('FORMULAIRE ON-SITE interactif en', Date.now() - t0, 'ms après le clic')
  } catch { console.log('TIMEOUT 45s — formulaire jamais prêt.', fellBack ? '(FALLBACK déclenché)' : '') }
  // état final
  const state = await page.evaluate(() => ({
    iframes: [...document.querySelectorAll('iframe')].map(f => ({ n: (f.name || '').slice(0, 30), src: (f.src || '').slice(0, 50), h: f.offsetHeight })),
    url: location.href,
  }))
  console.log('état final:', JSON.stringify(state).slice(0, 500))
  const shot = `verify-onsite-${new URL(BASE).hostname.replace(/\W/g, '-')}.png`
  await page.screenshot({ path: shot })
  console.log('screenshot:', shot)
  await browser.close()
  process.exit(0)
})().catch(e => { console.error('FAIL', e.message); process.exit(1) })
