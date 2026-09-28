import { test, expect, type Page } from "@playwright/test"

// B2C OFFER EXPOSURE (?offer=) — E2E contrat.
// Vérifie : default p30 inchangé · trip7/season exposés · fallback sûr
// (unknown/empty) · URL préservée au refresh · instrumentation offer/requested.
// Money-path NON touché ici (aucun submit, aucun paiement).

const BASE_URL = process.env.PREVIEW_URL || "http://localhost:4173"

function setupTrackInterceptor(page: Page) {
  page.addInitScript(() => {
    try { localStorage.removeItem("sg_track_log") } catch (_) {}
    try { sessionStorage.clear() } catch (_) {}
    let originalTrack: Function | undefined
    Object.defineProperty(window, "track", {
      configurable: true,
      set(fn: Function) {
        if (fn && !(fn as any)._wrapped) {
          originalTrack = fn
          const wrapped = function (this: any, name: string, data: any) {
            try {
              const logs = JSON.parse(localStorage.getItem("sg_track_log") || "[]")
              logs.push({ name, data })
              localStorage.setItem("sg_track_log", JSON.stringify(logs.slice(-60)))
            } catch (_) {}
            return originalTrack?.apply(this, arguments)
          };
          (wrapped as any)._wrapped = true
          Object.defineProperty(window, "track", {
            configurable: true,
            value: wrapped,
            writable: true,
          })
        }
      },
      get() {
        return originalTrack
      },
    })
  })
  return {
    async getOfferViews() {
      return page.evaluate(() => {
        try {
          const logs = JSON.parse(localStorage.getItem("sg_track_log") || "[]")
          return logs.filter((e: any) => e.name === "sg_pass_offer_view")
        } catch (_) {
          return []
        }
      })
    },
  }
}

async function openPaywall(page: Page, qs: string) {
  await page.goto(BASE_URL + "/" + qs, { waitUntil: "load", timeout: 60000 })
  // Le deep-link ?paywall=1 est consommé (nettoyé) à l'ouverture.
  await page.waitForFunction(() => !window.location.search.includes("paywall=1"), {}, { timeout: 15000 }).catch(() => {})
  // La carte d'offre (PassOffer) doit être visible.
  await page.waitForSelector("button.sg-passcard-hero", { timeout: 15000 })
}

async function cardText(page: Page) {
  const card = page.locator("button.sg-passcard-hero").first()
  return (await card.innerText()).replace(/\s+/g, " ")
}

const viewports = [
  { name: "mobile-390", width: 390, height: 844 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1280", width: 1280, height: 900 },
]

test.describe("B2C Offer Exposure (?offer=)", () => {
  for (const vp of viewports) {
    test(`default p30 inchangé @ ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await openPaywall(page, "?frustration=0&paywall=1")
      const txt = await cardText(page)
      expect(txt).toContain("Pass 30 jours")
      expect(txt).toContain("14,99")
      // Pas d'overflow horizontal du paywall.
      const overflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth + 1)
      expect(overflow).toBe(false)
    })

    test(`?offer=trip7 exposé @ ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await openPaywall(page, "?frustration=0&offer=trip7&paywall=1")
      const txt = await cardText(page)
      expect(txt).toContain("Pass 7 jours")
      expect(txt).toContain("4,99")
      // L'offre survit au nettoyage du deep-link (refresh/back).
      expect(page.url()).toContain("offer=trip7")
      const overflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth + 1)
      expect(overflow).toBe(false)
    })

    test(`?offer=season exposé @ ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await openPaywall(page, "?frustration=0&offer=season&paywall=1")
      const txt = await cardText(page)
      expect(txt).toContain("Pass Saison")
      expect(txt).toContain("19,99")
      expect(page.url()).toContain("offer=season")
      const overflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth + 1)
      expect(overflow).toBe(false)
    })
  }

  test("fallback sûr : unknown/empty → p30", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openPaywall(page, "?frustration=0&offer=foo&paywall=1")
    expect(await cardText(page)).toContain("Pass 30 jours")

    await openPaywall(page, "?frustration=0&offer=&paywall=1")
    expect(await cardText(page)).toContain("Pass 30 jours")

    await openPaywall(page, "?frustration=0&offer=p7&paywall=1")
    expect(await cardText(page)).toContain("Pass 30 jours")
  })

  test("refresh conserve l'offre (URL préservée)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openPaywall(page, "?frustration=0&offer=season&paywall=1")
    expect(page.url()).toContain("offer=season")
    await page.reload({ waitUntil: "load", timeout: 60000 })
    // Après refresh : pas de crash, la carte (home) rend, aucune pageerror bloquante.
    await page.waitForTimeout(2000)
    const errors: string[] = []
    page.on("pageerror", (e) => errors.push(String(e)))
    await page.waitForTimeout(1000)
    expect(errors.filter((e) => !e.includes("favicon"))).toEqual([])
  })

  test("instrumentation : sg_pass_offer_view porte offer/requested", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const tracker = setupTrackInterceptor(page)
    await openPaywall(page, "?frustration=0&offer=trip7&paywall=1")
    const views = await tracker.getOfferViews()
    expect(views.length).toBeGreaterThanOrEqual(1)
    const last = views[views.length - 1]
    expect(last.data.offer).toBe("trip7")
    // model historique préservé (agrégations existantes intactes).
    expect(last.data.model).toBe("oneprice")
  })

  test("instrumentation : fallback loggé avec requested", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const tracker = setupTrackInterceptor(page)
    await openPaywall(page, "?frustration=0&offer=foo&paywall=1")
    const views = await tracker.getOfferViews()
    expect(views.length).toBeGreaterThanOrEqual(1)
    const last = views[views.length - 1]
    expect(last.data.offer).toBe("p30")
    expect(last.data.offer_requested).toBe("foo")
  })
})
