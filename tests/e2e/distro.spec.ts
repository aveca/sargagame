import { test, expect } from "@playwright/test"

const BASE_URL = process.env.PREVIEW_URL || "http://localhost:4173"

test.describe("Distro P0 — /aujourdhui/", () => {
  test("page today : h1 intention + liens fiches + canonical self", async ({ page }) => {
    const resp = await page.goto(BASE_URL + "/aujourdhui/", { waitUntil: "domcontentloaded", timeout: 60000 })
    expect(resp && resp.status()).toBeLessThan(400)
    // Contenu SEO = noscript (inerte quand JS tourne) → assert sur le HTML brut servi.
    const html = await page.content()
    expect(html).toMatch(/aujourd'hui|today|hoy/i)
    const beachRefs = (html.match(/href="\/(plages|beach)\//g) || []).length
    expect(beachRefs).toBeGreaterThanOrEqual(3)
    expect(html).toContain("/aujourdhui/")
    expect(html).toContain("application/ld+json")
    // L'app boote aussi sur cette URL (fallback SPA) : pas d'écran blanc.
    await page.waitForTimeout(2500)
    const h1 = await page.locator("h1").first().textContent().catch(() => "")
    expect((h1 || "").length).toBeGreaterThan(0)
  })
})

test.describe("Distro P1 — presse & soutenir", () => {
  test("/presse/ : 3 angles + graphiques + méthodologie", async ({ page }) => {
    await page.goto(BASE_URL + "/presse/", { waitUntil: "load", timeout: 60000 })
    await page.waitForTimeout(1500)
    const body = (await page.locator("body").textContent()) || ""
    expect(body).toMatch(/erreurs|fiabilit/i)
    expect(body).toMatch(/Méthodologie|Methodology/i)
    const svg = await page.locator("svg").count()
    expect(svg).toBeGreaterThanOrEqual(1)
  })

  test("/soutenir/ : paliers sans reçu fiscal ni mélange premium", async ({ page }) => {
    await page.goto(BASE_URL + "/soutenir/", { waitUntil: "load", timeout: 60000 })
    await page.waitForTimeout(1500)
    const body = (await page.locator("body").textContent()) || ""
    expect(body).toMatch(/3 €|10 €|25 €|50 €/)
    expect(body).toMatch(/aucun reçu fiscal|pas.*déductible/i)
    expect(body).not.toMatch(/déduction fiscale.*garantie|reçu fiscal.*délivré/i)
  })
})

test.describe("Distro P1 — espace Concierge", () => {
  test("?offre=concierge présélectionne le 29 €", async ({ page }) => {
    await page.goto(BASE_URL + "/pro/espace/?offre=concierge", { waitUntil: "load", timeout: 60000 })
    await page.waitForTimeout(2500)
    const body = (await page.locator("body").textContent()) || ""
    expect(body).toMatch(/Concierge/)
    // Prix Concierge affiché (29) et toggle présent
    const toggle = page.locator("#tierConcierge").first()
    expect(await toggle.isVisible({ timeout: 5000 }).catch(() => false)).toBe(true)
    expect(body).toMatch(/29/)
  })

  test("défaut : Pro 79 € (rollback implicite sans param)", async ({ page }) => {
    await page.goto(BASE_URL + "/pro/espace/", { waitUntil: "load", timeout: 60000 })
    await page.waitForTimeout(2500)
    const body = (await page.locator("body").textContent()) || ""
    expect(body).toMatch(/79/)
  })
})
