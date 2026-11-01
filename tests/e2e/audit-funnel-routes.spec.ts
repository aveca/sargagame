import { test, expect, type Page } from "@playwright/test"

const BASE_URL = "http://localhost:4173"

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { name: "desktop", width: 1440, height: 900, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
]

const FUNNEL_ROUTES = [
  "/",
  "/carte-sargasses/",
  "/previsions/",
  "/alertes/",
  "/fiabilite/",
  "/reliability/",
  "/pass/",
  "/premium/",
  "/cgv/",
  "/mentions-legales/",
  "/confidentialite/",
  "/remboursement/",
]

function isNoise(msg: string): boolean {
  const noise = [
    "google-analytics", "googletagmanager", "referral_claim",
    "analytics_events", "/api/copernicus/sargassum.json",
    "/api/weather/beaches-weather.json", "net::ERR_FAILED",
    "net::ERR_ABORTED", "Content Security Policy",
    "Refused to connect", "violates the following",
  ]
  return noise.some((n) => msg.includes(n))
}

test.describe("Funnel route audit", () => {
  for (const vp of VIEWPORTS) {
    for (const route of FUNNEL_ROUTES) {
      test(`audit ${route} (${vp.name})`, async ({ page, browserName }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height })

        const jsErrors: string[] = []
        page.on("pageerror", (e) => jsErrors.push("PAGEERROR: " + e.message))
        page.on("console", (m) => {
          if (m.type() === "error") {
            const txt = m.text()
            if (!isNoise(txt)) jsErrors.push("CONSOLE: " + txt)
          }
        })

        const res = await page.goto(BASE_URL + route, {
          waitUntil: "domcontentloaded",
          timeout: 45000,
        })
        await page.waitForTimeout(2000)

        const structure = await page.evaluate(() => ({
          h1Count: document.querySelectorAll("h1").length,
          hasCanonical: !!document.querySelector('link[rel="canonical"]'),
          hasViewport: !!document.querySelector('meta[name="viewport"]'),
          title: document.title || null,
          lang: document.documentElement.lang || null,
        }))

        const horizontalScroll = await page.evaluate(() => {
          const vw = window.innerWidth
          const bw = Math.max(
            document.body.scrollWidth,
            document.documentElement.scrollWidth,
          )
          return bw > vw + 10
        })

        const clickableCount = await page.evaluate(() => {
          return document.querySelectorAll(
            "button, a, [role=\"button\"], [role=\"link\"]",
          ).length
        })

        const missingAlt = await page.evaluate(() => {
          const missing: string[] = []
          document.querySelectorAll("img").forEach((img) => {
            if (!img.getAttribute("alt") && !img.getAttribute("aria-label")) {
              missing.push((img.src || "").slice(0, 100))
            }
          })
          return missing
        })

        let severity = "P3"
        let category = "ok"
        if (!res || res.status() >= 500) {
          severity = "P0"; category = "server-error"
        } else if (res.status() === 404) {
          severity = "P1"; category = "not-found"
        } else if (jsErrors.length > 0) {
          severity = "P1"; category = "technical-error"
        } else if (
          structure.h1Count === 0 &&
          route !== "/" &&
          !route.startsWith("/plages/") &&
          !route.startsWith("/beaches/") &&
          !route.startsWith("/playas/")
        ) {
          severity = "P2"; category = "missing-h1"
        } else if (horizontalScroll) {
          severity = "P2"; category = "responsive"
        }

        console.log(
          `${vp.name.padEnd(8)} ${route.padEnd(30)} -> ${res?.status()} H1=${structure.h1Count} HS=${horizontalScroll} Clickable=${clickableCount} MissingAlt=${missingAlt.length} JSErr=${jsErrors.length} -> ${severity} (${category})`,
        )

        // Assertions de non-régression P0/P1
        expect(res?.status()).toBeLessThan(500)
        expect(res?.status()).not.toBe(404)
        expect(jsErrors.length).toBe(0)
      })
    }
  }
})
