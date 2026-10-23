import { test, expect, type Page } from "@playwright/test"

/**
 * E2E REEL du paywall (r�gression P0 2026-10-23).
 *
 * Défaut reproduit en production avant correction : au clic sur le CTA prévision
 * de la fiche plage (VER LOS 7 DIAS / VOIR LES 7 JOURS), l'app levait
 * `ReferenceError: hasAnnual is not defined` — openPremium() (Sargasses_PROD.jsx)
 * referencait un identifiant qui n existait que dans PremiumModal.jsx.
 * Consequence : le paywall ne s ouvrait PAS, sur les 6 domaines, sur le chemin
 * de conversion (l opportunité d'achat etait perdue a chaque clic).
 *
 * Ce test verifie l ouverture REELLE du paywall apres interaction utilisateur
 * (carte -> fiche -> CTA verrouille), son contenu rendu, le focus, la fermeture,
 * et l absence d erreur JS. Aucun paiement n est effectue.
 */

const BASE_URL = process.env.PREVIEW_URL || "http://localhost:4173"

/** Libelles du CTA prévision verrouille, par langue (FR/EN/ES). */
const LOCK_CTA = /VER LOS 7|VOIR LES 7|SEE THE 7|7 D[iÍ]AS|7 JOURS|7 DAYS/i

async function dismissCookieBanner(page: Page) {
  const btn = page
    .locator(".sg-cookie-banner button")
    .filter({ hasText: /Refuser|Decline|Rechazar/ })
    .first()
  if (await btn.count()) await btn.click().catch(() => {})
}

/**
 * Ouvre une fiche plage en cliquant un PIN de la carte.
 * Pourquoi pas un clic etiquette : les etiquettes ne sont revelees qu apres un
 * zoom (declutter), et `mouse.wheel` n est pas supporte en emulation mobile
 * WebKit. Le pin, lui, est peint des que la donnee est prete et son handler
 * ouvre la fiche directement (chemin tactile documente dans WorldMapView).
 * Retourne "pin", ou null si aucun pin trouv�.
 */
async function openFicheFromMap(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    // hit-zones des pins : r="22" (pin complet) ou r="8" (point en cluster)
    const hit = document.querySelector('svg g circle[r="22"], svg g circle[r="8"]')
    const g = hit ? hit.closest("g") : null
    if (!g) return null
    ;(g as SVGGElement).dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    return "pin"
  })
}
for (const vp of [
  { name: "mobile", width: 390, height: 844, mobile: true, ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1" },
  { name: "desktop", width: 1440, height: 900, mobile: false, ua: undefined },
]) {
  test(`paywall: ouverture reelle depuis la fiche plage (${vp.name})`, async ({ page }) => {
    const jsErrors: string[] = []
    page.on("pageerror", (e) => jsErrors.push(e.message))
    // Bruit connu et non lié au parcours : ressources analytics + JSON regionaux
    // absents (l app les gère : dégradation, pas de crash).
    page.on("console", (m) => {
      if (m.type() !== "error") return
      const t = m.text()
      if (/Failed to load resource|referral_claim|analytics_events|googletagmanager|google-analytics|\/api\//.test(t)) return
      jsErrors.push(t)
    })

    await page.setViewportSize({ width: vp.width, height: vp.height })
    await page.goto(BASE_URL + "/", { waitUntil: "load", timeout: 60000 })
    await page.waitForTimeout(4000)
    await dismissCookieBanner(page)
    await page.waitForTimeout(2500)

    // 1) clic sur un pin de la carte -> fiche
    const pin = await openFicheFromMap(page)
    expect(pin, "un pin de plage doit être cliquable").not.toBeNull()
    await page.waitForTimeout(3000)

    // 2) CTA prévision verrouille -> paywall
    const cta = page.locator("button").filter({ hasText: LOCK_CTA }).first()
    await expect(cta, "CTA prévision verrouille present dans la fiche").toBeVisible({ timeout: 15000 })
    await cta.click()

    // 3) le paywall s ouvre ET rend son contenu
    const panel = page.locator(".sg-modal-panel, [role=dialog]").first()
    await expect(panel, "le paywall doit s'ouvrir après le clic").toBeVisible({ timeout: 20000 })
    await page.waitForTimeout(2500)
    const body = ((await panel.textContent()) || "").replace(/\s+/g, " ")
    expect(body.length, "le paywall doit rendre du contenu réel").toBeGreaterThan(120)
    expect(panel).toHaveAttribute("aria-modal", "true")

    // 4) focus pi�g� dans le dialogue
    const focusIn = await page.evaluate(() => {
      const d = document.querySelector(".sg-modal-panel") || document.querySelector('[role="dialog"]')
      return !!d && d.contains(document.activeElement)
    })
    expect(focusIn, "le focus doit etre pi�g� dans le paywall").toBe(true)

    // 5) fermeture par le bouton de fermeture (aria-label i18n)
    const close = page.getByLabel(/Fermer|Close|Cerrar/i).first()
    await close.click()
    await page.waitForTimeout(1500)
    await expect(panel).toBeHidden()

    // 6) AUCUNE exception JS non gérée sur le parcours.
    //    C'est le garde-fou du défaut d'origine : `ReferenceError: hasAnnual`
    //    était une PAGEERROR. Les 404 HTTP de données régionales non publiées
    //    (ex. /api/copernicus/track-record.json sur tulum) et les beacons
    //    analytics sont des conditions gérées par l'app : elles ne sont PAS des
    //    régressions de ce parcours et sont vérifiées ailleurs.
    expect(jsErrors, "aucune exception JS non geree").toEqual([])
  })
}
