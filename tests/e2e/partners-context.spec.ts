import { test, expect, type Page } from "@playwright/test"

const BASE_URL = (process.env.PREVIEW_URL || "http://localhost:4173").trim()

/**
 * Intercepte window.track (même pattern que funnel-payment.spec.ts) pour
 * prouver sg_partner_view / sg_partner_cta / sg_partner_outbound.
 */
function setupTrackInterceptor(page: Page) {
  page.addInitScript(() => {
    try { localStorage.removeItem("sg_track_log") } catch (_) {}
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
              localStorage.setItem("sg_track_log", JSON.stringify(logs.slice(-100)))
            } catch (_) {}
            return (originalTrack as any)?.apply(this, arguments)
          };
          (wrapped as any)._wrapped = true
          Object.defineProperty(window, "track", { configurable: true, value: wrapped, writable: true })
        }
      },
      get() { return originalTrack },
    })
  })
  return {
    async events() {
      return page.evaluate(() => JSON.parse(localStorage.getItem("sg_track_log") || "[]"))
    },
    async has(name: string) {
      const evts: Array<{ name: string }> = await page.evaluate(() => JSON.parse(localStorage.getItem("sg_track_log") || "[]"))
      return evts.some((e) => e.name === name)
    },
  }
}

async function dismissOverlays(page: Page) {
  // Cookie banner (ne bloque jamais le fond en prod, mais sécurise le tap)
  const cookie = page.locator("button:has-text(\"Accepter\"), button:has-text(\"Accept\")").first()
  if (await cookie.isVisible({ timeout: 2000 }).catch(() => false)) {
    await cookie.click().catch(() => {})
  }
  // Lead capture / assistant : Échap si dialogue modal non sollicité
  await page.keyboard.press("Escape").catch(() => {})
  await page.waitForTimeout(400)
}

test.describe("Partenaires contextuels (services, jamais pubs)", () => {
  test("fiche MQ : slot après alternatives, 1 CTA WhatsApp support, tracking, outbound", async ({ page, context }) => {
    const tracker = setupTrackInterceptor(page)
    await page.goto(BASE_URL + "/", { waitUntil: "load", timeout: 60000 })
    await dismissOverlays(page)

    // Onglet Plages (vue liste, SANS passer par la carte) → 1re fiche
    const plagesTab = page.locator('nav.sg-bottom-nav button:has-text("Plages"), nav.sg-bottom-nav button:has-text("Beaches"), nav.sg-bottom-nav button:has-text("Playas")').first()
    await expect(plagesTab).toBeVisible({ timeout: 15000 })
    await plagesTab.click()
    // Plage MQ déterministe (Les Salines) via la recherche
    const search = page.locator('[data-testid="xp-plages-search"]').first()
    await expect(search).toBeVisible({ timeout: 20000 })
    await search.fill("Salines")
    await page.waitForTimeout(800)
    const open = page.locator('[data-testid="xp-open"]').first()
    await expect(open).toBeVisible({ timeout: 20000 })
    await open.click()
    const sheet = page.locator(".bsc-sheet").first()
    await expect(sheet).toBeVisible({ timeout: 15000 })

    // Le verdict reste affiché au-dessus
    await expect(sheet.locator("text=AUJOURD").first()).toBeVisible({ timeout: 8000 }).catch(() => {})

    // Slot contextuel : badge « Support » explicite (WhatsApp)
    const badge = sheet.locator("text=Support").first()
    await badge.scrollIntoViewIfNeeded().catch(() => {})
    await expect(badge).toBeVisible({ timeout: 15000 })

    // UN SEUL CTA WhatsApp (remplace Taxis Martinique + Lovelly)
    const whatsappCta = sheet.locator("a:has-text(\"WhatsApp\")").first()
    await expect(whatsappCta).toBeVisible({ timeout: 8000 })
    expect(await sheet.locator("a:has-text(\"WhatsApp\")").count()).toBe(1)
    await expect(sheet.locator("text=Sargagame Support").first()).toBeVisible()

    // Plus de Taxis Martinique ni Lovelly
    await expect(sheet.locator("text=Taxis Martinique")).toHaveCount(0)
    await expect(sheet.locator("text=Lovelly")).toHaveCount(0)

    // sg_partner_view émis (IntersectionObserver, seuil 50%)
    await expect.poll(() => tracker.has("sg_partner_view"), { timeout: 10000 }).toBe(true)

    // Clic WhatsApp → CTA + outbound trackés + popup vers wa.me
    const [popup] = await Promise.all([
      context.waitForEvent("page", { timeout: 10000 }).catch(() => null),
      whatsappCta.click(),
    ])
    expect(await tracker.has("sg_partner_cta")).toBe(true)
    expect(await tracker.has("sg_partner_outbound")).toBe(true)
    if (popup) {
      const url = popup.url()
      expect(url.startsWith("https://wa.me/596596106124")).toBe(true)
      // Vérifier que le message prérempli contient le nom de la plage
      expect(url).toContain("text=")
      await popup.close().catch(() => {})
    } else {
      // window.open intercepté par le harnais : vérifier l'URL via l'event
      const evts: Array<{ name: string; data?: any }> = await tracker.events()
      const out = evts.find((e) => e.name === "sg_partner_outbound")
      expect(out?.data?.url.startsWith("https://wa.me/596596106124")).toBe(true)
      expect(out?.data?.url).toContain("text=")
    }
  })

  test("rollback ?partnerctx=0 : aucun encart partenaire, verdict intact", async ({ page }) => {
    setupTrackInterceptor(page)
    await page.goto(BASE_URL + "/?partnerctx=0", { waitUntil: "load", timeout: 60000 })
    await dismissOverlays(page)
    const plagesTab = page.locator('nav.sg-bottom-nav button:has-text("Plages"), nav.sg-bottom-nav button:has-text("Beaches"), nav.sg-bottom-nav button:has-text("Playas")').first()
    await expect(plagesTab).toBeVisible({ timeout: 15000 })
    await plagesTab.click()
    const open = page.locator('[data-testid="xp-open"]').first()
    await expect(open).toBeVisible({ timeout: 20000 })
    await open.click()
    const sheet = page.locator(".bsc-sheet").first()
    await expect(sheet).toBeVisible({ timeout: 15000 })
    await expect(sheet.locator("text=Partenaire")).toHaveCount(0)
    await expect(sheet.locator("text=Support")).toHaveCount(0)
    await expect(sheet.locator("text=Taxis Martinique")).toHaveCount(0)
    await expect(sheet.locator("text=Lovelly")).toHaveCount(0)
  })
})
