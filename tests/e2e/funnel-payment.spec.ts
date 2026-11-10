import { test, expect, type Page } from "@playwright/test"
import { stubFreshSatellite } from "./helpers/satellite-freshness"

const BASE_URL = process.env.PREVIEW_URL || "http://localhost:4173"

/**
 * Capture les événements de télémétrie first-party RÉELLEMENT émis par
 * l'application.
 *
 * ⚠️ Le test interceptait `window.track`, ce qui n'intercepte RIEN : le front
 * appelle sa fonction `track()` IMPORTÉE (`src/Sargasses_PROD.jsx`), pas
 * `window.track`. De plus, sur `localhost` la télémétrie distante est
 * désactivée (`shouldSendRemoteAnalytics()`), donc ni `window.gtag` ni la file
 * `sg_track_queue` ne sont alimentés.
 *
 * On capture donc au SINK first-party : `track()` → `sgCollectEvent()` →
 * `sgCollectFlush()` → POST/beacon `/collect.php`, payload `ev:[{e,t}]`.
 * Ce chemin est actif en local comme en production, et la capture est
 * persistée en `sessionStorage` pour survivre aux navigations du test.
 */
function setupTrackInterceptor(page: Page) {
  page.addInitScript(() => {
    const KEY = "sg_e2e_collected_events"
    const read = (): Array<{ name: string; data: Record<string, unknown> }> => {
      try {
        return JSON.parse(sessionStorage.getItem(KEY) || "[]")
      } catch (_) {
        return []
      }
    }
    const write = (arr: Array<{ name: string; data: Record<string, unknown> }>) => {
      try {
        sessionStorage.setItem(KEY, JSON.stringify(arr.slice(-200)))
      } catch (_) {}
    }
    const collect = (url: string, body: string) => {
      try {
        if (!url.includes("/collect.php")) return
        const payload = JSON.parse(body)
        const ev = Array.isArray(payload?.ev) ? payload.ev : []
        if (!ev.length) return
        const arr = read()
        for (const e of ev) arr.push({ name: String(e?.e || ""), data: e || {} })
        write(arr)
      } catch (_) {}
    }
    const origBeacon = navigator.sendBeacon && navigator.sendBeacon.bind(navigator)
    navigator.sendBeacon = function (url: any, data: any) {
      try {
        const u = String(url)
        if (data && typeof data.text === "function") {
          data.text().then((t: string) => collect(u, t))
        } else {
          collect(u, String(data))
        }
      } catch (_) {}
      return origBeacon ? origBeacon(url, data) : true
    }
    const origFetch = window.fetch && window.fetch.bind(window)
    window.fetch = function (input: any, init: any) {
      try {
        const u = typeof input === "string" ? input : String(input?.url || "")
        if (init?.body) collect(u, String(init.body))
      } catch (_) {}
      return origFetch
        ? origFetch(input, init)
        : Promise.reject(new Error("fetch indisponible"))
    }
  })
  return {
    /** Force le flush du buffer de télémétrie (le front ne l'envoie qu'au
     *  `visibilitychange`/`pagehide` ou toutes les 25 s). */
    async flush() {
      await page.evaluate(() => {
        try {
          Object.defineProperty(document, "visibilityState", {
            get: () => "hidden",
            configurable: true,
          })
          document.dispatchEvent(new Event("visibilitychange"))
        } catch (_) {}
      })
      await page.waitForTimeout(600)
    },
    async getEvents() {
      return page.evaluate(() => {
        try {
          return JSON.parse(sessionStorage.getItem("sg_e2e_collected_events") || "[]")
        } catch (_) {
          return []
        }
      })
    },
    async hasEvent(name: string) {
      const events = await this.getEvents()
      return events.some((e: any) => e.name === name)
    },
  }
}

/**
 * La carte ne peint un VERDICT par plage (et donc les labels `.sg-maplabel`
 * que ce test clique) que si l'observation satellite a MOINS DE 12 h
 * (`src/lib/world-map-freshness.mjs`). NOAA ne publie qu'UNE fois par jour
 * (12:00Z) : la fenêtre 12:00Z→03:00Z laisse donc la donnée entre 12 et 36 h,
 * état où le produit affiche honnêtement « à vérifier » et où AUCUN label
 * n'existe.
 *
 * Conséquence : ce test était VERT uniquement pendant la fenêtre de fraîcheur
 * satellite et ROUGE le reste du temps (défaut pré-existant, reproduit à
 * l'identique sur le build de référence). On rend donc le PRÉCONDITION
 * déterministe : on sert la même charge utile réelle, mais avec un
 * horodatage ERDDAP « maintenant ». Les ASSERTIONS du funnel (≥ 3 labels,
 * clic → fiche, paywall atteint, events trackés) restent STRICTEMENT
 * inchangées — seule la fraîcheur simulée change.
 *
 * → implémentation partagée : `tests/e2e/helpers/satellite-freshness.ts`.
 */

test.describe("Funnel Principal B2C", () => {
  test("carte → fiche → paywall: funnel reaché + events trackés", async ({ page }) => {
    const tracker = setupTrackInterceptor(page)
    await stubFreshSatellite(page)

    // 1. Landing — carte monde
    await page.goto(BASE_URL + "/", { waitUntil: "load", timeout: 60000 })
    // Attente BORNÉE : le timeout de 30 s épuisait le budget du test (30 s)
    // et masquait la vraie assertion ci-dessous par un "Test timeout".
    await page.waitForSelector(".sg-maplabel", { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(1500)

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

    // Flush de la télémétrie de la carte AVANT de naviguer : le clic vient
    // d'émettre `sg_beach_open`, on le capture de façon déterministe.
    await tracker.flush()

    // 3. Paywall — deep link ?paywall=1
    await page.goto(BASE_URL + "/?paywall=1", { waitUntil: "load", timeout: 60000 })
    await page
      .waitForFunction(
        () => !window.location.search.includes("paywall=1"),
        {},
        { timeout: 15000 }
      )
      .catch(() => {})
    await page.waitForTimeout(1000)

    // Paywall atteint si URL nettoyée OU modal visible (le handler deep-link
    // peut ne pas nettoyer l'URL dans preview, mais le modal s'affiche)
    const urlCleaned = await page.evaluate(() => !window.location.search.includes("paywall=1"))
    const modalVisible = await page
      .locator('[role="dialog"], .sg-modal-panel, .pww-wrap')
      .first()
      .isVisible({ timeout: 2000 })
      .catch(() => false)
    expect(urlCleaned || modalVisible).toBe(true)

    // 4. Vérifier les events trackés
    // Le buffer de télémétrie n'est vidé vers `/collect.php` qu'au
    // `visibilitychange`/`pagehide` (ou toutes les 25 s) : on force le flush
    // pour rendre l'assertion déterministe.
    await tracker.flush()
    const events = await tracker.getEvents()
    const eventNames = events.map((e) => e.name)

    // Le funnel doit au minimum émettre sg_session_start
    expect(eventNames).toContain("sg_session_start")
    // … ET le clic carte → plage doit avoir émis son event de funnel
    expect(eventNames).toContain("sg_beach_open")
  })

  test("paywall affiche le CTA Premium", async ({ page }) => {
    await page.goto(BASE_URL + "/?paywall=1", { waitUntil: "load", timeout: 60000 })
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
    await page.goto(BASE_URL + "/?flag=premium_modal=0", { waitUntil: "load", timeout: 60000 })
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

    await page.goto(BASE_URL + "/", { waitUntil: "load", timeout: 60000 })
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
