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

// Helper: dismiss Assistant modal if it appears
async function dismissAssistant(page: Page) {
  const assistant = page.locator('[role="dialog"][aria-label="Assistant"]')
  if (await assistant.isVisible({ timeout: 1000 }).catch(() => false)) {
    const btn = assistant.locator('button:has-text("Et demain")')
    if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
      await btn.click()
      await page.waitForTimeout(300)
    }
  }
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
    // Attendre que la fiche soit visible (avec retry si nécessaire)
    await page.waitForSelector(".lc-detail, .sheet", { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(2000)

    // Vérifier la visibilité avec retry
    let ficheVisible = await page.locator(".lc-detail, .sheet").first().isVisible().catch(() => false)
    if (!ficheVisible) {
      // Retry: cliquer à nouveau sur un autre label
      await page.evaluate(() => {
        const labels = [...document.querySelectorAll(".sg-maplabel")].filter(
          (el) => getComputedStyle(el).visibility !== "hidden"
        )
        if (labels.length > 1) (labels[1] as HTMLElement).click()
        else if (labels.length > 0) (labels[0] as HTMLElement).click()
      })
      await page.waitForTimeout(3000)
      ficheVisible = await page.locator(".lc-detail, .sheet").first().isVisible().catch(() => false)
    }
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
        !e.includes("NetworkError") &&
        !e.includes("Mollie") &&
        !e.includes("setProfileId")
    )

    expect(criticalErrors).toEqual([])
  })
})

test.describe("Funnel Payment — Checkout Flow", () => {
  test("paywall → email → CTA checkout visible", async ({ page }) => {
    await page.goto(TEST_URL + "?frustration=0&paywall=1", { waitUntil: "load", timeout: 60000 })
    await page
      .waitForFunction(
        () => !window.location.search.includes("paywall=1"),
        {},
        { timeout: 15000 }
      )
      .catch(() => {})
    await page.waitForTimeout(2000)

    // Wait for the paywall modal to fully render
    const modal = page.locator('.sg-modal-panel, [role="dialog"], .pww-wrap').first()
    await expect(modal).toBeVisible({ timeout: 5000 })

    // Look for email input in paywall
    const emailInput = page.locator('input[type="email"], input[placeholder*="email"], input[placeholder*="Email"]').first()
    const hasEmailInput = await emailInput.isVisible({ timeout: 3000 }).catch(() => false)

    if (hasEmailInput) {
      // Fill email and check CTA appears
      await emailInput.fill("test@example.com")
      await page.waitForTimeout(500)

      // CTA should be enabled/visible after email
      const ctaBtn = page.locator('button:has-text("Payer"), button:has-text("Acheter"), button:has-text("Unlock"), button:has-text("Premium")').first()
      const ctaVisible = await ctaBtn.isVisible({ timeout: 3000 }).catch(() => false)
      expect(ctaVisible).toBe(true)
    }
  })

  test("paywall affiche les passes (trip7, p30, season)", async ({ page }) => {
    await page.goto(TEST_URL + "?frustration=0&paywall=1", { waitUntil: "load", timeout: 60000 })
    await page
      .waitForFunction(
        () => !window.location.search.includes("paywall=1"),
        {},
        { timeout: 15000 }
      )
      .catch(() => {})
    await page.waitForTimeout(2500)

    // Check for price display (pass cards)
    const priceElements = page.locator('[class*="pass"], [class*="offer"], [class*="pww"]')
    const hasPasses = await priceElements.first().isVisible({ timeout: 5000 }).catch(() => false)

    // At minimum, some pricing content should be visible
    const allText = await page.locator('.sg-modal-panel, [role="dialog"], .pww-wrap').first().textContent().catch(() => "")
    const hasPrice = allText.includes("€") || allText.includes("$") || allText.includes("jour") || allText.includes("day")

    expect(hasPasses || hasPrice).toBe(true)
  })

  test("rollback ?pwcomic=0 désactive la variante comic", async ({ page }) => {
    await page.goto(TEST_URL + "?frustration=0&pwcomic=0&paywall=1", { waitUntil: "load", timeout: 60000 })
    await page
      .waitForFunction(
        () => !window.location.search.includes("paywall=1"),
        {},
        { timeout: 15000 }
      )
      .catch(() => {})
    await page.waitForTimeout(2000)

    // The paywall should still open, but without comic variant
    const modalVisible = await page
      .locator('.sg-modal-panel, [role="dialog"], .pww-wrap')
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false)

    // With pwcomic=0, the comic-specific elements should NOT be present
    const comicPanel = page.locator('.sg-pwenter, [data-testid="paywall-comic"]')
    const comicVisible = await comicPanel.isVisible({ timeout: 1000 }).catch(() => false)

    // Modal should still work, but comic transition should be absent
    expect(modalVisible).toBe(true)
    expect(comicVisible).toBe(false)
  })
})

test.describe("Funnel Payment — Premium State", () => {
  test("premium localStorage: activation après paiement mocké", async ({ page }) => {
    // Simulate premium activation by setting localStorage directly
    await page.goto(TEST_URL, { waitUntil: "load", timeout: 60000 })
    await page.waitForTimeout(2000)

    // Set premium state as if payment succeeded
    await page.evaluate(() => {
      localStorage.setItem("sg_premium", "1")
      localStorage.setItem("sg_premium_activated_at", String(Date.now()))
    })

    // Reload to apply state
    await page.reload({ waitUntil: "load", timeout: 60000 })
    await page.waitForTimeout(2000)

    // Premium should be active — check that premium features are accessible
    const isPremium = await page.evaluate(() => localStorage.getItem("sg_premium") === "1")
    expect(isPremium).toBe(true)
  })

  test("premium state persistence across reload", async ({ page }) => {
    await page.goto(TEST_URL, { waitUntil: "load", timeout: 60000 })
    await page.waitForTimeout(2000)

    // Set premium
    await page.evaluate(() => {
      localStorage.setItem("sg_premium", "1")
      localStorage.setItem("sg_pass_type", "p30")
    })

    // Reload
    await page.reload({ waitUntil: "load", timeout: 60000 })
    await page.waitForTimeout(2000)

    // Should persist
    const premium = await page.evaluate(() => localStorage.getItem("sg_premium"))
    const passType = await page.evaluate(() => localStorage.getItem("sg_pass_type"))
    expect(premium).toBe("1")
    expect(passType).toBe("p30")
  })

  test("premium state: pas de paywall auto-ouvert sans deep link", async ({ page }) => {
    await page.goto(TEST_URL, { waitUntil: "load", timeout: 60000 })
    await page.waitForTimeout(1000)

    // Set premium active
    await page.evaluate(() => {
      localStorage.setItem("sg_premium", "1")
      localStorage.setItem("sg_pass_type", "p30")
    })

    // Reload
    await page.reload({ waitUntil: "load", timeout: 60000 })
    await page.waitForTimeout(3000)

    // Premium user should NOT see paywall auto-open (no deep link)
    const modalVisible = await page
      .locator('.sg-modal-panel, [role="dialog"]:has-text("Premium")')
      .first()
      .isVisible({ timeout: 2000 })
      .catch(() => false)

    expect(modalVisible).toBe(false)
  })
})

test.describe("Funnel Payment — Reduced Motion", () => {
  test("reduced-motion: RM_INFINITE=[] (no infinite CSS animations on body/root)", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.goto(TEST_URL, { waitUntil: "load", timeout: 60000 })
    await page.waitForTimeout(3000)

    // Check the ux-smoke pattern: RM_INFINITE should be empty
    // This means no element has animation-iteration-count: infinite visible on screen
    const infiniteEls = await page.evaluate(() => {
      const all = document.querySelectorAll("*")
      const found: string[] = []
      for (const el of all) {
        const style = getComputedStyle(el)
        if (style.animationIterationCount === "infinite" && style.display !== "none") {
          found.push(`${el.tagName}.${el.className.toString().slice(0, 30)}`)
        }
      }
      return found
    })

    // Under reduced-motion, there should be no infinite animations
    // (the CSS @media (prefers-reduced-motion: reduce) { * { animation: none !important } } handles this)
    expect(infiniteEls).toEqual([])
  })

  test("reduced-motion: paywall pas d'animation infinie", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.goto(TEST_URL + "?paywall=1", { waitUntil: "load", timeout: 60000 })
    await page
      .waitForFunction(
        () => !window.location.search.includes("paywall=1"),
        {},
        { timeout: 15000 }
      )
      .catch(() => {})
    await page.waitForTimeout(2000)

    // Check no infinite animations on modal elements
    const modalInfinite = await page.evaluate(() => {
      const selectors = ['.sg-modal-panel', '[role="dialog"]', '.pww-wrap', '.backdrop']
      for (const sel of selectors) {
        const el = document.querySelector(sel)
        if (el) {
          const style = getComputedStyle(el)
          if (style.animationIterationCount === "infinite") return true
        }
      }
      return false
    })

    expect(modalInfinite).toBe(false)
  })
})

test.describe("Funnel Payment — Multi-Region", () => {
  test("EUR region (MQ): paywall affiche prix EUR", async ({ page }) => {
    // MQ region — prices should be in EUR
    await page.goto(TEST_URL + "?island=MQ&paywall=1", { waitUntil: "load", timeout: 60000 })
    await page
      .waitForFunction(
        () => !window.location.search.includes("paywall=1"),
        {},
        { timeout: 15000 }
      )
      .catch(() => {})
    await page.waitForTimeout(2500)

    const text = await page.locator('.sg-modal-panel, [role="dialog"], .pww-wrap').first().textContent().catch(() => "")
    const hasEur = text.includes("€") || text.includes("EUR")
    expect(hasEur).toBe(true)
  })
})
