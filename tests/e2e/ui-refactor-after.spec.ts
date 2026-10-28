import { test, expect } from "@playwright/test"

test.setTimeout(90000)

const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablette", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
]

test.describe("UI Refactoring — Captures APRÈS (avec améliorations)", () => {
  for (const vp of viewports) {
    test(`${vp.name} (${vp.width}×${vp.height}) — page d'accueil`, async ({ page }) => {
      const jsErrors: string[] = []
      const failedRequests: string[] = []

      page.on("pageerror", (e) => jsErrors.push(e.message))
      page.on("console", (m) => {
        if (m.type() === "error") jsErrors.push(`[console:${m.type()}] ${m.text()}`)
      })
      page.on("requestfailed", (req) => failedRequests.push(req.url))

      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.goto("/", { waitUntil: "domcontentloaded", timeout: 30000 })

      // Attendre que la carte lazy-loaded se monte (max 8s)
      await page.waitForTimeout(3000)
      await page.waitForFunction(() => {
        const svg = document.querySelector("svg")
        return svg != null && svg.children.length > 0
      }, { timeout: 8000 }).catch(() => console.log(`[${vp.name}] SVG non trouvé après 8s`))

      // Capture d'écran pleine page APRÈS
      await page.screenshot({
        path: `tests/e2e/screenshots/after-${vp.name}-home.png`,
        fullPage: true,
      })

      // Capture aussi de la zone "au-dessus de la ligne de flottaison"
      await page.screenshot({
        path: `tests/e2e/screenshots/after-${vp.name}-home-above-fold.png`,
        fullPage: false,
      })

      // Infos de diagnostic
      const title = await page.title().catch(() => "N/A")
      const url = page.url()

      // Vérifier la présence de la carte SVG
      const svgMap = page.locator("svg").first()
      const hasSvg = await svgMap.isVisible().catch(() => false)

      // Vérifier le CTA "Trouve ta plage"
      const cta = page.locator(
        ".sg-mapfind, [data-testid='cta-trouve-ta-plage'], button:has-text('Trouve ta plage'), a:has-text('Trouve ta plage')"
      ).first()
      const ctaVisible = await cta.isVisible().catch(() => false)
      const ctaBox = await cta.boundingBox().catch(() => null)

      // Vérifier le chat
      const chat = page.locator('[role="dialog"][aria-label*="Assistant"]').first()
      const chatBox = await chat.boundingBox().catch(() => null)

      // Vérifier le bouton SOS
      const sosBtn = page.locator(
        ".sg-soscta, button:has-text('SOS'), [data-testid='sos-button']"
      ).first()
      const sosVisible = await sosBtn.isVisible().catch(() => false)

      // Vérifier les FAB
      const fabCount = await page.locator(".sg-fab").count().catch(() => 0)

      // Vérifier la bannière cookies
      const cookieBanner = page.locator(
        "[role='dialog'][aria-label*='cookie'], .sg-cookie, [data-testid='cookie-banner']"
      ).first()
      const cookieVisible = await cookieBanner.isVisible().catch(() => false)

      // Vérifier les éléments focusables
      const focusable = page.locator("button, a, input, [role='button'], [tabindex]")
      const focusableCount = await focusable.count().catch(() => 0)

      // Vérifier l'écran de chargement (ne devrait pas être visible une fois monté)
      const loadingScreen = page.locator(".sg-map-loading")
      const loadingVisible = await loadingScreen.isVisible().catch(() => false)

      console.log(`\n=== [${vp.name}] APRÈS — ${vp.width}×${vp.height} ===`)
      console.log(`URL: ${url}`)
      console.log(`Title: ${title}`)
      console.log(`SVG carte visible: ${hasSvg}`)
      console.log(`Écran de chargement visible: ${loadingVisible}`)
      console.log(`CTA "Trouve ta plage" visible: ${ctaVisible} (box: ${JSON.stringify(ctaBox)})`)
      console.log(`Chat visible: ${!!chatBox && chatBox.width > 0 && chatBox.height > 0} (box: ${JSON.stringify(chatBox)})`)
      console.log(`Bouton SOS visible: ${sosVisible}`)
      console.log(`FAB count: ${fabCount}`)
      console.log(`Bannière cookies visible: ${cookieVisible}`)
      console.log(`Éléments focusables: ${focusableCount}`)
      console.log(`Erreurs JS: ${jsErrors.length}`)
      if (jsErrors.length > 0) console.log(`  Détails JS: ${jsErrors.slice(0, 5).join(" | ")}`)
      console.log(`Requêtes échouées: ${failedRequests.length}`)
      if (failedRequests.length > 0) console.log(`  Détails: ${failedRequests.slice(0, 5).join(" | ")}`)

      // Assertions fonctionnelles — la capture ne doit pas masquer un échec de rendu.
      await expect(page.locator("#root"), "React root should be mounted").toBeVisible()
      expect(title, "document title should be available").not.toBe("N/A")
      expect(focusableCount, "page should expose keyboard-focusable controls").toBeGreaterThan(0)
      expect(hasSvg, "an SVG map/visual should be visible after lazy loading").toBe(true)
      if (vp.name === "mobile") {
        expect(ctaVisible, "primary beach-finder CTA should be visible on mobile").toBe(true)
        expect(ctaBox?.height ?? 0, "mobile primary CTA should be at least 48px tall").toBeGreaterThanOrEqual(48)
      }
    })
  }
})
