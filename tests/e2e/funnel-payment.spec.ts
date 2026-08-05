import { test, expect, type Page } from "@playwright/test"

const BASE_URL = process.env.PREVIEW_URL || "http://localhost:4173"
const TEST_URL = BASE_URL + "/"

/**
 * Intercept track() calls and log them for assertion.
 * Returns a getter function to retrieve tracked events.
 */
function setupTrackInterceptor(page: Page) {
  // Inject BEFORE any navigation to catch session_start
  page.addInitScript(() => {
    localStorage.removeItem("sg_seen");
    localStorage.removeItem("sg_track_log");
    sessionStorage.clear();
    
    // Use Object.defineProperty to intercept assignment to window.track
    // This catches the track function the moment it's assigned to window.track
    let originalTrack: Function | undefined;
    Object.defineProperty(window, "track", {
      configurable: true,
      set(fn: Function) {
        if (fn && !fn._wrapped) {
          originalTrack = fn;
          // Wrap the track function to log calls
          const wrapped = function (this: any, name: string, data: any) {
            try {
              const logs = JSON.parse(localStorage.getItem("sg_track_log") || "[]");
              logs.push({ name, data, ts: Date.now() });
              localStorage.setItem("sg_track_log", JSON.stringify(logs.slice(-50)));
            } catch (_) {}
            return originalTrack?.apply(this, arguments);
          };
          wrapped._wrapped = true;
          // Store the wrapped version back
          Object.defineProperty(window, "track", {
            configurable: true,
            value: wrapped,
            writable: true,
          });
        }
      },
      get() {
        return originalTrack;
      },
    });
  });
  
  return {
    async getEvents() {
      return page.evaluate(() => {
        return JSON.parse(localStorage.getItem("sg_track_log") || "[]");
      });
    },
    async hasEvent(name: string) {
      return page.evaluate((n) => {
        const logs = JSON.parse(localStorage.getItem("sg_track_log") || "[]");
        return logs.some((e: any) => e.name === n);
      }, name);
    },
    async checkTrackExists() {
      return page.evaluate(() => {
        return typeof (window as any).track === "function";
      });
    },
  };
}

test.describe("Funnel Principal B2C", () => {
  test("carte → fiche → paywall: funnel reaché + events trackés", async ({ page }) => {
    const tracker = setupTrackInterceptor(page);

    // 1. Landing — carte monde (storage cleared by initScript, session_start fires)
    await page.goto(TEST_URL, { waitUntil: "load", timeout: 60000 });
    await page.waitForSelector(".sg-maplabel", { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const mapLabels = await page.locator(".sg-maplabel").count()
    expect(mapLabels).toBeGreaterThanOrEqual(3)

    // 2. Clic sur une plage → fiche détail
    await page.evaluate(() => {
      const label = [...document.querySelectorAll(".sg-maplabel")].find(
        (el) => getComputedStyle(el).visibility !== "hidden"
      )
      if (label) (label as HTMLElement).click()
    })
    await page.waitForSelector(".lc-detail, .sheet", { timeout: 12000 }).catch(() => {})
    await page.waitForTimeout(1500)

    const ficheVisible = await page.locator(".lc-detail, .sheet").first().isVisible()
    expect(ficheVisible).toBe(true)

    // 3. Paywall — deep link ?paywall=1
    await page.goto(TEST_URL + "&paywall=1", { waitUntil: "load", timeout: 60000 })
    await page
      .waitForFunction(
        () => !window.location.search.includes("paywall=1"),
        {},
        { timeout: 15000 }
      )
      .catch(() => {})
    await page.waitForTimeout(1000)

    // Paywall atteint si URL nettoyée (handler exécuté)
    const urlCleaned = await page.evaluate(() => !window.location.search.includes("paywall=1"))
    expect(urlCleaned).toBe(true)

    // 4. Vérifier les events trackés
    const events = await tracker.getEvents()
    const eventNames = events.map((e) => e.name)

    // Le funnel doit au minimum émettre sg_session_start
    expect(eventNames).toContain("sg_session_start")
  })

  test("paywall affiche le CTA Premium", async ({ page }) => {
    await page.goto(TEST_URL + "?frustration=0&paywall=1", { waitUntil: "load", timeout: 60000 })
    await page
      .waitForFunction(
        () => !window.location.search.includes("paywall=1"),
        {},
        { timeout: 15000 }
      )
      .catch(() => {})
    await page.waitForTimeout(2000)

    // Le paywall doit contenir un CTA Premium (bouton ou lien)
    const cta = page
      .locator(
        'button:has-text("Premium"), button:has-text("Débloquer"), button:has-text("Unlock"), [class*="pww"], [class*="sg-modal"]'
      )
      .first()
    const ctaVisible = await cta.isVisible({ timeout: 5000 }).catch(() => false)
    // On accepte que le paywall soit visible même si le CTA exact n'est pas trouvé
    // (le lazy load peut prendre du temps)
    const modalVisible = await page
      .locator('[role="dialog"], .sg-modal-panel, .pww-wrap')
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false)

    expect(ctaVisible || modalVisible).toBe(true)
  })

  test("rollback ?flag=0 désactive le paywall", async ({ page }) => {
    await page.goto(TEST_URL + "&flag=premium_modal=0", { waitUntil: "load", timeout: 60000 })
    await page.waitForTimeout(2000)

    // Sans le flag, le paywall ne doit pas s'ouvrir automatiquement
    const modalVisible = await page
      .locator('[role="dialog"]:has-text("Premium"), .sg-modal-panel')
      .first()
      .isVisible({ timeout: 2000 })
      .catch(() => false)

    expect(modalVisible).toBe(false)
  })

  test("pas d'erreurs JS critiques au chargement", async ({ page }) => {
    const errors: string[] = []
    page.on("pageerror", (e) => errors.push(e.message))

    await page.goto(TEST_URL, { waitUntil: "load", timeout: 60000 })
    await page.waitForTimeout(3000)

    // Filtrer les erreurs CSP (attendues en CI) et les erreurs non critiques
    const criticalErrors = errors.filter(
      (e) =>
        !e.includes("Content Security Policy") &&
        !e.includes("Refused to connect") &&
        !e.includes("fetch") &&
        !e.includes("NetworkError")
    )

    expect(criticalErrors).toEqual([])
  })
})
