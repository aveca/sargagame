/**
 * PAYUX #2 — État redirection Mollie (3DS) rendu.
 * Avec réponse checkoutUrl, le bouton se verrouille et affiche « Redirection… »
 * au lieu de retomber sur « Payer 14,99 € » cliquable. Mollie + API stubés
 * in-page (pattern money-path-regression) ; checkoutUrl = hash-only (#sgstub)
 * → aucune navigation réelle, état observable durablement.
 */
import { test, expect, type Page } from '@playwright/test'

const BASE_URL = process.env.PREVIEW_URL || 'http://localhost:4173'

// Stub Mollie Components + API (pattern money-path-regression.spec.ts)
async function stubMollie(page: Page, opts: { checkoutUrl?: string } = {}) {
  await page.addInitScript((o) => {
    const w = window as any
    w.__mollieBodies = []
    w.Mollie = function stubbedMollie() {
      return {
        createComponent: () => ({ mount: () => {}, unmount: () => {}, addEventListener: () => {} }),
        createToken: async () => ({ token: 'tok_e2e_visa' }),
      }
    }
    const realFetch = window.fetch ? window.fetch.bind(window) : null
    const jsonResp = (obj: any, status = 200) =>
      Promise.resolve(new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } }))
    window.fetch = ((input: any, init: any) => {
      const url = typeof input === 'string' ? input : String(input && input.url || '')
      if (url.indexOf('/api/mollie.php') === -1) {
        return realFetch ? realFetch(input, init) : Promise.reject(new Error('no fetch'))
      }
      let body: any = {}
      try { body = JSON.parse((init && init.body) || '{}') } catch (_) {}
      w.__mollieBodies.push(body)
      if (body.action === 'create_payment') {
        // checkoutUrl par défaut hash-only (#sgstub, même doc → pas de reload) ;
        // option data: = navigation top-frame bloquée par Chrome → page intacte.
        return jsonResp({ paymentId: 'tr_e2e_redir', checkoutUrl: o.checkoutUrl || (location.origin + '/#sgstub') })
      }
      if (body.action === 'payment_status') return jsonResp({ paid: true, status: 'paid' })
      return jsonResp({})
    }) as any
  }, opts)
}

async function dismissCookie(page: Page) {
  try {
    const banner = page.locator('.sg-cookie-banner').first()
    if (await banner.isVisible({ timeout: 1500 }).catch(() => false)) {
      const btn = banner.locator('button:has-text("Refuser"), button:has-text("Decline"), button:has-text("Rechazar")').first()
      if (await btn.isVisible({ timeout: 800 }).catch(() => false)) await btn.click({ force: true, timeout: 3000 }).catch(() => {})
    }
  } catch (_) {}
}

// Ouvre le paywall via deep-link puis l'overlay checkout via le hero PassOffer
async function openCheckoutDeepLink(page: Page) {
  await page.goto(BASE_URL + '/?frustration=0&paywall=1', { waitUntil: 'load', timeout: 60000 })
  await dismissCookie(page)
  const panel = page.locator('.sg-modal-panel[role="dialog"]').first()
  await expect(panel).toBeVisible({ timeout: 30000 })
  await page.waitForTimeout(1200) // fin d'animation sheet + mounts Mollie (stub)
  const hero = page.locator('.sg-modal-panel button.sg-passcard-hero').first()
  await hero.scrollIntoViewIfNeeded({ timeout: 8000 }).catch(() => {})
  await hero.click({ timeout: 10000, force: true })
  await page.waitForTimeout(1000)
}

async function fillEmailAndConsent(page: Page) {
  // Email de l'overlay checkout (le dernier visible = overlay, devant le paywall)
  const inputs = page.locator('input[type="email"]:visible')
  await inputs.last().fill('qa-check@sargasses-martinique.com')
  const consent = page.locator('input[type="checkbox"]:visible').first()
  await expect(consent).toBeVisible({ timeout: 10000 })
  await consent.check({ force: true })
}

test('redirection 3DS : bouton verrouillé + libellé « Redirection… » (0 double-tap)', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e: any) => errors.push(String(e)))
  await stubMollie(page)
  await openCheckoutDeepLink(page)
  await fillEmailAndConsent(page)
  const payer = page.locator('button:has-text("Payer")').first()
  await expect(payer).toBeVisible({ timeout: 10000 })
  await payer.click({ timeout: 10000, force: true })
  // APRÈS réponse checkoutUrl : bouton verrouillé + état explicite (stable : #hash → pas de reload)
  const redirectBtn = page.locator('button:has-text("Redirection vers ta banque")').first()
  await expect(redirectBtn).toBeVisible({ timeout: 10000 })
  await expect(redirectBtn).toBeDisabled()
  await expect(redirectBtn).toHaveAttribute('aria-disabled', 'true')
  // le serveur a bien reçu create_payment (montant/chemin inchangés, via le stub)
  const bodies: any[] = await page.evaluate(() => (window as any).__mollieBodies || [])
  expect(bodies.filter((b) => b.action === 'create_payment').length).toBe(1)
  expect(errors.length).toBe(0)
})

test('rollback ?sgpayredirect=0 : comportement historique (« Activation… » générique au redirect)', async ({ page }) => {
  // data: top-frame = navigation bloquée par Chrome → page conservée,
  // on observe le DOM dans l'état « redirection demandée » sans reload.
  await stubMollie(page, { checkoutUrl: 'data:text/html,blocked' })
  // OUverture via l'onglet Pass (URL conservée — pas de replaceState du deep-link)
  await page.goto(BASE_URL + '/?sgpayredirect=0', { waitUntil: 'load', timeout: 60000 })
  await dismissCookie(page)
  await page.waitForTimeout(2500)
  const tab = page.locator('nav.sg-bottom-nav button:has-text("Pass")').first()
  if (await tab.count()) await tab.click({ timeout: 15000, force: true })
  else await page.locator('nav.sg-bottom-nav button:has-text("Premium")').first().click({ timeout: 15000, force: true })
  await page.waitForSelector('.sg-modal-panel', { timeout: 15000 })
  await page.waitForTimeout(1200)
  const hero = page.locator('.sg-modal-panel button.sg-passcard-hero').first()
  await hero.scrollIntoViewIfNeeded({ timeout: 8000 }).catch(() => {})
  await hero.click({ timeout: 10000, force: true })
  await page.waitForTimeout(1000)
  await fillEmailAndConsent(page)
  const payer = page.locator('button:has-text("Payer")').first()
  await expect(payer).toBeVisible({ timeout: 10000 })
  await payer.click({ timeout: 10000, force: true })
  await page.waitForTimeout(1500) // create_payment répondu + setTimeout(50ms) navigation (bloquée)
  // Rollback : PAS de libellé « Redirection… » — bouton figé « Activation… » disabled (historique strict)
  await expect(page.locator('button:has-text("Redirection vers ta banque")')).toHaveCount(0)
  const legacy = page.locator('button:has-text("Activation…")').first()
  await expect(legacy).toBeVisible({ timeout: 8000 })
  await expect(legacy).toBeDisabled()
  // …et le serveur a bien été appelé une seule fois (chemin intact)
  const bodies: any[] = await page.evaluate(() => (window as any).__mollieBodies || [])
  expect(bodies.filter((b) => b.action === 'create_payment').length).toBe(1)
})
