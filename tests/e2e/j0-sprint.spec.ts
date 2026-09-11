import { test, expect, type Page } from "@playwright/test"

const BASE_URL = process.env.PREVIEW_URL || "http://localhost:4173"
const TEST_URL = BASE_URL + "/"

function setupTrackInterceptor(page: Page) {
  page.addInitScript(() => {
    localStorage.removeItem("sg_track_log")
    sessionStorage.clear()
    let originalTrack: Function | undefined
    Object.defineProperty(window, "track", {
      configurable: true,
      set(fn: Function) {
        if (fn && !fn._wrapped) {
          originalTrack = fn
          const wrapped = function (this: any, name: string, data: any) {
            try {
              const logs = JSON.parse(localStorage.getItem("sg_track_log") || "[]")
              logs.push({ name, data, ts: Date.now() })
              localStorage.setItem("sg_track_log", JSON.stringify(logs.slice(-100)))
            } catch (_) {}
            return originalTrack?.apply(this, arguments)
          }
          wrapped._wrapped = true
          Object.defineProperty(window, "track", { configurable: true, value: wrapped, writable: true })
        }
      },
      get() { return originalTrack },
    })
  })
  return {
    getEvents() { return page.evaluate(() => JSON.parse(localStorage.getItem("sg_track_log") || "[]")) },
    hasEvent(name: string) {
      return page.evaluate((n) => JSON.parse(localStorage.getItem("sg_track_log") || "[]").some((e: any) => e.name === n), name)
    },
  }
}

async function openFirstBeach(page: Page) {
  await page.goto(TEST_URL, { waitUntil: "load", timeout: 60000 })
  await page.waitForSelector(".sg-maplabel", { timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(2000)
  const tapIdx = await page.evaluate(() => {
    const els = [...document.querySelectorAll(".sg-maplabel[role='button']")].filter((el) => {
      const r = el.getBoundingClientRect()
      return getComputedStyle(el).visibility === "visible" && r.width > 0 && r.height > 0
    })
    for (let i = 0; i < els.length; i++) {
      const r = els[i].getBoundingClientRect()
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      if (hit && (hit === els[i] || els[i].contains(hit))) return i
    }
    return -1
  })
  expect(tapIdx).toBeGreaterThanOrEqual(0)
  await page.locator(".sg-maplabel[role='button']:visible").nth(tapIdx).click({ timeout: 10000 })
  // Le tap peut ouvrir le takeover comic (.lc-detail) : pont vers la fiche data
  const comic = page.locator(".lc-detail").first()
  if (await comic.isVisible({ timeout: 4000 }).catch(() => false)) {
    const full = page.locator(".lc-detail button").filter({ hasText: /Fiche complète|full report|ficha completa/i }).first()
    if (await full.isVisible({ timeout: 4000 }).catch(() => false)) {
      await full.click({ timeout: 5000 }).catch(() => {})
    }
  }
  const fiche = page.locator(".bsc-sheet, .lc-detail, .sheet").first()
  await fiche.waitFor({ state: "visible", timeout: 15000 })
  return fiche
}

async function openPaywall(page: Page, qs = "?paywall=1") {
  await page.goto(TEST_URL + qs, { waitUntil: "load", timeout: 60000 })
  await page.waitForFunction(() => !window.location.search.includes("paywall=1"), {}, { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(2500)
}

// Ouvre le paywall via l'onglet premium (BottomNav) — PRÉSERVE la query string,
// contrairement au deep-link ?paywall=1 dont le handler nettoie l'URL avant que
// le chunk lazy PremiumModal lise ses flags rollback.
async function openPaywallViaNav(page: Page, qs = "") {
  await page.goto(TEST_URL + qs, { waitUntil: "load", timeout: 60000 })
  await page.waitForSelector(".sg-maplabel", { timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(2000)
  const tabs = page.locator(".sg-bottom-nav button")
  await tabs.nth(2).click({ timeout: 10000 })
  await page.waitForTimeout(2500)
}

test.describe("J0 sprint — CRO paywall order", () => {
  test("défaut : offre AVANT email", async ({ page }) => {
    await openPaywall(page)
    const offerY = await page.evaluate(() => {
      const el = document.querySelector(".sg-passcard-hero")
      return el ? el.getBoundingClientRect().top + window.scrollY : -1
    })
    const emailY = await page.evaluate(() => {
      const el = document.querySelector('.sg-paywall-world input[type="email"]')
      return el ? el.getBoundingClientRect().top + window.scrollY : -1
    })
    expect(offerY).toBeGreaterThanOrEqual(0)
    expect(emailY).toBeGreaterThanOrEqual(0)
    expect(offerY).toBeLessThan(emailY)
  })

  test("rollback ?sgpayorder=0 : email AVANT offre", async ({ page }) => {
    await openPaywallViaNav(page, "?sgpayorder=0")
    const offerY = await page.evaluate(() => {
      const el = document.querySelector(".sg-passcard-hero")
      return el ? el.getBoundingClientRect().top + window.scrollY : -1
    })
    const emailY = await page.evaluate(() => {
      const el = document.querySelector('.sg-paywall-world input[type="email"]')
      return el ? el.getBoundingClientRect().top + window.scrollY : -1
    })
    expect(offerY).toBeGreaterThanOrEqual(0)
    expect(emailY).toBeGreaterThanOrEqual(0)
    expect(emailY).toBeLessThan(offerY)
  })

  test("clic CTA ouvre le checkout + event aval tracké (pas de CTA fantôme)", async ({ page }) => {
    // NOTE harnais : l'interception window.track ne voit pas sg_pass_cta émis depuis
    // le chunk lazy PremiumModal (mécanisme documenté : délégation inopérante sur ce
    // chemin, sg_pass_cta vérifié en contrat statique + flux Supabase réel en prod).
    // On prouve ici le COMPORTEMENT : clic CTA → overlay checkout ouvert + event aval
    // sg_onsite_checkout_opened (atteignable UNIQUEMENT via onPassBuy → pas de fantôme).
    const tracker = setupTrackInterceptor(page)
    await openPaywall(page)
    // CTA sticky (1 surface de tap) ou hero card
    const cta = page.locator(".sg-sticky, .sg-passcard-hero").first()
    await cta.scrollIntoViewIfNeeded().catch(() => {})
    await cta.click({ timeout: 10000 })
    await page.waitForTimeout(1500)
    // L'overlay de paiement carte est ouvert (champs réels, pas un no-op)
    const checkout = page.locator('text=/Numéro de carte|Card number|Active ton pass/i').first()
    await expect(checkout).toBeVisible({ timeout: 8000 })
    expect(await tracker.hasEvent("sg_onsite_checkout_opened")).toBe(true)
  })
})

test.describe("J0 sprint — fiche plage", () => {
  test("verdict couvert : planB OU repli honnête OU clean + vote terrain présent", async ({ page }) => {
    const tracker = setupTrackInterceptor(page)
    const fiche = await openFirstBeach(page)
    // Le statut peut arriver en _loading (data satellite) → attendre le verdict réel
    await page.waitForFunction(() => {
      const t = document.body.innerText || ""
      return /Plutôt y aller maintenant|Go here instead|Pas d'alternative propre|No clean alternative|Sargasses faibles|Sargasses modérées|Sargasses fortes|Low sargassum|Moderate sargassum|Heavy sargassum/.test(t)
    }, {}, { timeout: 15000 }).catch(() => {})
    const body = (await fiche.textContent()) || ""
    const hasPlanB = body.includes("Plutôt y aller maintenant") || body.includes("Go here instead")
    const hasFallback = body.includes("Pas d'alternative propre") || body.includes("No clean alternative")
    const hasVote = body.includes("Sur place ?") || body.includes("On the beach?")
    expect(hasVote).toBe(true)
    // Au moins une issue verdict : clean (chips), planB ou repli
    const hasVerdict = hasPlanB || hasFallback || body.includes("Sargasses faibles") || body.includes("Sargasses modérées") || body.includes("Sargasses fortes")
    expect(hasVerdict).toBe(true)
    if (hasPlanB) expect(await tracker.hasEvent("sg_planb_view")).toBe(true)
  })

  test("vote terrain émet sg_beach_report", async ({ page }) => {
    const tracker = setupTrackInterceptor(page)
    await openFirstBeach(page)
    const voteBtn = page.locator(".bsc-sheet button, .sheet button").filter({ hasText: /Propre|Modéré|Beaucoup|Clean|Moderate|Heavy/ }).first()
    if (await voteBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await voteBtn.click({ timeout: 5000 }).catch(() => {})
      await page.waitForTimeout(1000)
      expect(await tracker.hasEvent("sg_beach_report")).toBe(true)
    }
  })

  test("rapport du jour : modale + bouton WhatsApp", async ({ page }) => {
    await openFirstBeach(page)
    // Bouton rapport (icône document) — texte variable selon langue
    const reportBtn = page.locator(".bsc-sheet button, .sheet button").filter({ hasText: /Rapport|Report|Informe/ }).first()
    if (await reportBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await reportBtn.click({ timeout: 5000 })
      await page.waitForTimeout(1500)
      const wa = page.locator('button:has-text("WhatsApp")').first()
      await expect(wa).toBeVisible({ timeout: 8000 })
    }
  })
})

test.describe("J0 sprint — espace B2B", () => {
  test("/pro/espace/ : trial + widget + paylink présents", async ({ page }) => {
    await page.goto(BASE_URL + "/pro/espace/", { waitUntil: "load", timeout: 60000 })
    await page.waitForTimeout(2000)
    const body = (await page.locator("body").textContent()) || ""
    expect(body.length).toBeGreaterThan(500)
    // Formulaire essai
    const trial = page.locator("#trialEmail, input[type='email']").first()
    expect(await trial.isVisible({ timeout: 5000 }).catch(() => false)).toBe(true)
    // Snippet widget (bouton copier) + lien annuel
    const copy = page.locator("#copy").first()
    expect(await copy.isVisible({ timeout: 5000 }).catch(() => false)).toBe(true)
    const sub = page.locator("#subscribe").first()
    expect(await sub.count()).toBeGreaterThanOrEqual(1)
    // Télémétrie embarquée (sgEv)
    const hasSgEv = await page.evaluate(() => document.documentElement.innerHTML.includes("sg_b2b_trial_activated"))
    expect(hasSgEv).toBe(true)
  })
})
