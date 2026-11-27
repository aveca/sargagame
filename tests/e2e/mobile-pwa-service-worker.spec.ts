import { test, expect } from "@playwright/test"
import { stubFreshSatellite } from "./helpers/satellite-freshness"

const BASE_URL = process.env.PREVIEW_URL || "http://localhost:4173"

// Chromium au niveau du fichier : `browserName` ne peut pas etre defini dans un
// describe. Le projet `mobile-chromium` du depot est en realite WebKit (device
// iPhone 12), et le WebKit embarque par Playwright ne supporte pas les service
// workers - ces tests ont besoin d'un vrai moteur SW.
test.use({ browserName: "chromium" })

test.describe("coquille service worker Sargasses (SARG-MOBILE-PWA-EXPERIENCE-20261126)", () => {
  test("service worker enregistre et actif", async ({ page }) => {
    await page.goto(BASE_URL + "/", { waitUntil: "load", timeout: 60000 })
    // Premier chargement : le worker passe par installing -> activating.
    // On attend l'etat final "activated" plutot qu'un instantane.
    await page.waitForFunction(
      async () => {
        const reg = await navigator.serviceWorker.ready
        return !!reg.active && reg.active.state === "activated"
      },
      null,
      { timeout: 30000 }
    )
    const state = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready
      return reg.active ? reg.active.state : "inactif"
    })
    expect(state).toBe("activated")
  })

  test("hors-ligne : la coquille PWA boote et garde la fraicheur datee", async ({ page, context }) => {
    await stubFreshSatellite(page)
    await page.goto(BASE_URL + "/", { waitUntil: "load", timeout: 60000 })
    await page.waitForTimeout(3000) // laisse le SW remplir son cache
    await context.setOffline(true)
    await page.reload({ waitUntil: "load", timeout: 60000 })
    await page.waitForTimeout(2500)
    const booted = await page.evaluate(() => document.querySelectorAll("#root > *").length)
    expect(
      booted,
      "coquille hors-ligne : #root doit monter l'app, pas la page d'erreur reseau"
    ).toBeGreaterThan(0)
    const copy = await page.evaluate(() => document.body.innerText)
    expect(copy).toMatch(/observation satellite|v[eé]rification|fra[iî]cheur/i)
    await context.setOffline(false)
  })
})