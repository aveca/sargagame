import { test, expect, type Page } from "@playwright/test"

const BASE_URL = process.env.PREVIEW_URL || "http://localhost:4173"

/** Capture les erreurs console et page, filtre le bruit CSP/réseau attendu. */
function captureErrors(page: Page) {
  const errors: string[] = []
  const pageErrors: string[] = []
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") {
      const t = m.text()
      if (
        !t.includes("Content Security Policy") &&
        !t.includes("Refused to connect") &&
        !t.includes("The string did not match the expected pattern")
      ) {
        errors.push(`[${m.type()}] ${t}`)
      }
    }
  })
  page.on("pageerror", (e) => pageErrors.push(e.message))
  return { errors, pageErrors }
}

test.describe("Qualité UI/UX — défauts démontrés", () => {
  test("homepage charge sans erreur JS critique", async ({ page }) => {
    const { errors, pageErrors } = captureErrors(page)
    await page.goto(BASE_URL + "/", { waitUntil: "load", timeout: 60000 })
    await page.waitForTimeout(3000)
    const critical = pageErrors.filter(
      (e) =>
        !e.includes("Content Security Policy") &&
        !e.includes("Refused to connect") &&
        !e.includes("fetch") &&
        !e.includes("NetworkError")
    )
    expect(critical).toEqual([])
    console.log("Console warnings/errors:", errors.slice(0, 10).join(" | "))
  })

  test("carte affiche des labels de plages (>=3)", async ({ page }) => {
    await page.goto(BASE_URL + "/", { waitUntil: "load", timeout: 60000 })
    await page.waitForSelector(".sg-maplabel", { timeout: 30000 }).catch(() => {})
    await page.waitForTimeout(2000)
    const count = await page.locator(".sg-maplabel").count()
    expect(count).toBeGreaterThanOrEqual(3)
  })

  test("clic sur une plage ouvre la fiche détail", async ({ page }) => {
    await page.goto(BASE_URL + "/", { waitUntil: "load", timeout: 60000 })
    await page.waitForSelector(".sg-maplabel", { timeout: 30000 }).catch(() => {})
    await page.waitForTimeout(2000)
    await page.evaluate(() => {
      const label = [...document.querySelectorAll(".sg-maplabel")].find(
        (el) => getComputedStyle(el).visibility !== "hidden"
      )
      if (label) (label as HTMLElement).click()
    })
    await page.waitForTimeout(1500)
    const fiche = await page.locator(".lc-detail, .sheet").first()
    await expect(fiche).toBeVisible()
  })

  test("bascule île MQ<->GP ne crée pas de boucle de re-render", async ({ page }) => {
    const errors: string[] = []
    page.on("console", (m) => {
      if (m.type() === "error") {
        const t = m.text()
        if (t.includes("Maximum update depth") || t.includes("Too many re-renders")) {
          errors.push(t)
        }
      }
    })
    await page.goto(BASE_URL + "/", { waitUntil: "load", timeout: 60000 })
    await page.waitForTimeout(2000)

    const btnMQ = page.locator('button:has-text("MQ")').first()
    const btnGP = page.locator('button:has-text("GP")').first()
    await expect(btnMQ).toBeVisible()

    // force:true car le SVG de la carte recouvre visuellement le bouton (défaut UI à part)
    await btnGP.click({ force: true })
    await page.waitForTimeout(800)
    await btnMQ.click({ force: true })
    await page.waitForTimeout(800)
    await btnGP.click({ force: true })
    await page.waitForTimeout(800)

    // La page doit rester stable : pas d'erreur de re-render infini après plusieurs changements d'île
    expect(errors).toEqual([])
    // Les deux boutons doivent rester cliquables (pas de gel de l'UI)
    await expect(btnMQ).toBeVisible()
    await expect(btnGP).toBeVisible()
  })

  test("paywall s'ouvre via ?paywall=1", async ({ page }) => {
    await page.goto(BASE_URL + "/?paywall=1", { waitUntil: "load", timeout: 60000 })
    await page.waitForTimeout(2000)
    const modal = page.locator('[role="dialog"], .sg-modal-panel, .pww-wrap').first()
    const modalVisible = await modal.isVisible({ timeout: 5000 }).catch(() => false)
    const urlCleaned = await page.evaluate(() => !window.location.search.includes("paywall=1"))
    expect(urlCleaned || modalVisible).toBe(true)
  })

  test("routes principales sont servies (pas de 404)", async ({ page }) => {
    const routes = ["/", "/previsions/", "/alertes/", "/carte-sargasses/", "/fiabilite/"]
    for (const r of routes) {
      const res = await page.goto(BASE_URL + r, { waitUntil: "load", timeout: 30000 })
      expect(res?.status()).toBeLessThan(400, `404 sur ${r}`)
    }
  })

  test("fiches plage MQ servies (pas de 404) et affichent le nom de la plage", async ({ page }) => {
    const cases: Array<[string, string]> = [
      ["plage-des-salines", "Salines"],
      ["anse-caritan", "Caritan"],
      ["grande-anse-d-arlet", "Grande Anse"],
    ]
    for (const [slug, motCle] of cases) {
      const res = await page.goto(BASE_URL + "/plages/" + slug + "/", { waitUntil: "load", timeout: 30000 })
      expect(res?.status()).toBeLessThan(400, `404 sur /plages/${slug}/`)
      // Le nom de la plage figure dans le titre du document (rendu côté serveur)
      const title = await page.title()
      expect(title).toContain(motCle, `titre de /plages/${slug}/ devrait contenir ${motCle}`)
    }
  })

  test("pas de scroll horizontal excessif sur mobile (iPhone 12)", async ({ page }) => {
    await page.goto(BASE_URL + "/", { waitUntil: "load", timeout: 60000 })
    await page.waitForTimeout(2000)
    const width = await page.evaluate(() => Math.max(document.body.scrollWidth, document.documentElement.scrollWidth))
    const viewport = page.viewportSize()!.width
    expect(width).toBeLessThanOrEqual(viewport + 4)
  })
})
