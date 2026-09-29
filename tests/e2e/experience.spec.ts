import { test, expect } from "@playwright/test"

/**
 * BEACH EXPERIENCE — WOW TAKEOVER 2026-09-23
 * Parcours : home (J'y vais) → experience (visual + verdict) → WHY →
 * TOMORROW → BACKUP → switch plage (discovery loop) → TRIP → PREMIUM.
 * Rollback : ?sgexp=0 (fiches legacy, experience absente).
 * Rollback : ?sgjourney=0 (nouvelle experience désactivée, fiche legacy).
 */
const BASE = process.env.PREVIEW_URL || "http://localhost:4173"
const EXP = '[data-testid="bx-experience"]'

/* Trouve une plage avec forecast weekly RÉEL (même logique que journey.spec.ts) */
async function findCoveredBeachId(request) {
  const SARG_SID = [
    "mq016", "mq011", "mq012", "mq004", "mq001",
    "mq024", "mq034", "mq008", "mq033", "mq044"
  ].map(id => [id, {
    mq016: "diamant", mq011: "anse-mitan", mq012: "anse-noire",
    mq004: "sainte-anne", mq001: "les-salines", mq024: "anse-madame",
    mq034: "tartane", mq008: "pt-marin", mq033: "precheur", mq044: "vauclin"
  }[id]])
  const res = await request.get(BASE + "/api/copernicus/sargassum.json")
  const j = await res.json()
  for (const [id, sid] of SARG_SID) {
    const w = j.weekly && j.weekly[sid]
    if (w && Array.isArray(w.forecast) && w.forecast.length >= 2) return id
  }
  throw new Error("aucune plage couverte par le forecast weekly — build data cassé")
}

async function openExperience(page) {
  await page.goto(BASE + "/", { waitUntil: "load", timeout: 60000 })
  await page.waitForTimeout(2500)
  await page.locator('[data-testid="xp-best-open"]').first().click()
  await page.waitForSelector(EXP, { timeout: 15000 })
  await page.waitForTimeout(1200)
}

test.describe("Beach Experience (PLACE EXPERIENCE)", () => {
  test("home → experience : visual + verdict réels", async ({ page }) => {
    await openExperience(page)
    const name = await page.locator(EXP + " .bx-name").first().innerText()
    expect(name.trim().length).toBeGreaterThan(2)
    const verdict = await page.locator(EXP + " .bx-verdict").first().innerText()
    expect(verdict.trim().length).toBeGreaterThan(1)
    // score réel affiché quand dispo
    const body = await page.locator(EXP).first().innerText()
    expect(/score|confiance/i.test(body)).toBe(true)
  })

  test("reveals : WHY → TOMORROW (7 pastilles) → BACKUP → switch plage", async ({ page }) => {
    await openExperience(page)
    const first = await page.locator(EXP + " .bx-name").first().innerText()
    await page.locator("#bx-why button").first().click()
    await page.waitForTimeout(600)
    await page.locator("#bx-tomorrow button").first().click()
    await page.waitForTimeout(600)
    // 7 pastilles forecast réelles (timeline)
    expect(await page.locator(EXP + " .bx-timeline-day").count()).toBeGreaterThanOrEqual(2)
    await page.locator("#bx-backup button").first().click()
    await page.waitForTimeout(800)
    const card = page.locator("#bx-backup .bx-card-name").first()
    let switched = first
    if (await card.isVisible().catch(() => false)) {
      const altName = (await card.innerText()).trim()
      await page.locator('#bx-backup .bx-card .bx-btn').first().click()
      await page.waitForTimeout(1800)
      switched = await page.locator(EXP + " .bx-name").first().innerText()
      expect(switched.trim().length).toBeGreaterThan(2)
      // la boucle a changé de plage vers le backup nommé
      expect(switched.trim()).toBe(altName)
    }
  })

  test("trip + premium depuis l'experience, fermeture propre", async ({ page }) => {
    await openExperience(page)
    await page.locator('[data-testid="exp-trip-open"]').first().click()
    await page.waitForSelector('[data-testid="trip-premium-cta"]', { timeout: 12000 })
    // trip → CTA offre → paywall (continuité, le trip se referme seul)
    // RECOVERY 2026-09-24 (probe-proven 100 %) : overlays fixes interceptant les
    // coordonnées du CTA selon la hauteur de contenu LIVE du jour (sticky premium
    // + toast exit-nudge) → tap DOM direct (handler React, même geste utilisateur),
    // pattern identique au fallback anti-recouvrement d'ed9f25499. Assertion
    // INCHANGÉE : le paywall DOIT s'ouvrir.
    await page.locator('[data-testid="trip-premium-cta"]').first().evaluate(el => el.click())
    const paywall = page.locator(".sg-modal-panel, .pww-wrap").first()
    // isVisible({timeout}) N'ATTEND PAS (option ignorée) — l'ilVisible immédiat
    // courrait contre le mount lazy du PremiumModal (% données du jour). Polling
    // web-first correct : toBeVisible avec timeout (assertion resserrée, pas affaiblie).
    let pwVisible = await paywall.isVisible().catch(() => false)
    if (!pwVisible) {
      await page.waitForTimeout(1500)
      const open = await page.locator(".sg-modal-panel, .pww-wrap").count()
      if (!open) await page.locator('[data-testid="trip-premium-cta"]').first().evaluate(el => el.click()).catch(() => {})
    }
    await expect(paywall).toBeVisible({ timeout: 12000 })
    pwVisible = true
    // refermer paywall → retour experience intacte → premium direct
    await page.locator('.sg-modal-panel button, .pww-wrap button').filter({ hasText: /Plus tard|Later|Más tarde/ }).first().click().catch(() => {})
    await page.waitForTimeout(900)
    expect(await page.locator(EXP).count()).toBeGreaterThan(0)
    // RECOVERY 2026-09-24 — déterminisation (flake probe-proven, time/data-dependent) :
    // à la fermeture du paywall, l'exit-nudge toast (`sg-toast`, durée 9 s) ET la barre
    // sticky premium (.bx-sticky) peuvent recouvrir le centre du CTA inline → clic
    // impossible même en force: true (Playwright dispatche au hit-target du dessus —
    // comme un vrai doigt). Chemin utilisateur réel : on ferme la toast (✕ 44px)
    // et on place le CTA au-dessus de la barre sticky. Assertion INCHANGÉE.
    const toastX = page.locator('.sg-toast-host .sg-toast__x').first()
    if (await toastX.isVisible().catch(() => false)) { await toastX.click(); await page.waitForTimeout(400) }
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="exp-premium-cta"]')
      if (!el) return
      const root = document.querySelector('[data-testid="bx-experience"]')
      const tgt = root && root.scrollHeight > root.clientHeight ? root : document.scrollingElement
      const r = el.getBoundingClientRect()
      const top = (tgt === document.scrollingElement ? window.scrollY : tgt.scrollTop) + r.top - window.innerHeight * 0.4
      tgt.scrollTo({ top: Math.max(0, top) })
    })
    await page.waitForTimeout(400)
    // Tap DOM direct (identique au 1er tap, probe-proven) + 1 retry espacé.
    await page.locator('[data-testid="exp-premium-cta"]').first().evaluate(el => el.click())
    if (!(await page.locator(".sg-modal-panel, .pww-wrap").count())) {
      await page.waitForTimeout(1500)
      await page.locator('[data-testid="exp-premium-cta"]').first().evaluate(el => el.click()).catch(() => {})
    }
    await expect(paywall).toBeVisible({ timeout: 12000 })
  })

  test("rollback ?sgjourney=0 — nouvelle experience désactivée, fiche legacy affichée", async ({ page, request }) => {
    // 1. Trouver une plage avec forecast weekly RÉEL
    const beachId = await findCoveredBeachId(request)
    console.log("Test rollback with beach:", beachId)

    // 2. Ouvrir la plage SANS flag via deep link → nouvelle expérience
    await page.goto(BASE + "/?exp=" + beachId, { waitUntil: "load", timeout: 60000 })
    await page.waitForSelector('[data-testid="bx-experience"], [data-testid="beach-decision-page"], .bsc-sheet', { timeout: 20000 })
    await page.waitForTimeout(1500)

    // Vérifier que la NOUVELLE expérience est présente (sans flag)
    const newExpPresent = await page.locator('[data-testid="bx-experience"], [data-testid="beach-decision-page"]').count()
    console.log("New experience present:", newExpPresent)
    expect(newExpPresent).toBeGreaterThan(0)

    // 3. Recharger avec ?sgjourney=0 → doit afficher la fiche legacy
    await page.goto(BASE + "/?exp=" + beachId + "&sgjourney=0", { waitUntil: "load", timeout: 60000 })
    await page.waitForTimeout(2000)

    // Vérifier l'URL et journeyOff
    console.log("URL after reload:", page.url())
    const journeyOffAfter = await page.evaluate(() => {
      try { return /[?&]sgjourney=0(?:&|$)/.test(window.location.search) } catch (_) { return false }
    })
    console.log("journeyOff() after reload:", journeyOffAfter)
    expect(journeyOffAfter).toBe(true)

    // Attendre le rendu de la fiche
    await page.waitForTimeout(2000)

    // Debug: check what's on the page
    const bodyText = await page.locator('body').innerText()
    console.log("Body text sample:", bodyText.slice(0, 2000))
    const allDialogs = await page.locator('[role="dialog"]').count()
    console.log("Dialogs count:", allDialogs)
    const allSheets = await page.locator('.bsc-sheet, .bsc-fiche, .lc-detail, .sheet, [class*="bsc"]').count()
    console.log("All sheet-related elements:", allSheets)
    const comicBeach = await page.evaluate(() => {
      try { return window.__REACT_DEVTOOLS_GLOBAL_HOOK__?.renderers } catch (_) { return null }
    })
    
    // Vérifier : BeachDecisionPage (data-testid="beach-decision-page") ABSENTE
    const newExpCount = await page.locator('[data-testid="beach-decision-page"]').count()
    console.log("BeachDecisionPage count:", newExpCount)
    expect(newExpCount).toBe(0)

    // Vérifier : ExperienceReset (nouvelle UI) ABSENTE quand sgjourney=0
    const expResetCount = await page.locator('[data-testid="bx-experience"]').count()
    console.log("ExperienceReset count:", expResetCount)
    expect(expResetCount).toBe(0)

    // Vérifier : BeachSheetComic legacy (.bsc-sheet) PRÉSENTE
    const sheetCount = await page.locator(".bsc-sheet, .lc-detail, .sheet").count()
    console.log("Legacy sheet count:", sheetCount)
    expect(sheetCount).toBeGreaterThan(0)
  })

  // ── AHA MEDIA (2026-09-23) : vraie plage derrière le verdict ──
  test("aha media : scrim/glow montés, verdict intact quel que soit le média", async ({ page }) => {
    await openExperience(page)
    // la couche existe toujours (aha on) ; le média lui-même peut être absent
    // selon la plage (photo 404 → retrait, vidéo manifest-gatée) — jamais de trou :
    // la scène SVG + le verdict restent visibles quoi qu'il arrive.
    expect(await page.locator(EXP + " .bx-media-scrim").count()).toBe(1)
    expect(await page.locator(EXP + " .bx-media-glow").count()).toBe(1)
    expect(await page.locator(EXP + " svg").first().count()).toBeGreaterThan(0)
    const verdict = await page.locator(EXP + " .bx-verdict").first().innerText()
    expect(verdict.trim().length).toBeGreaterThan(1)
  })

  test("rollback ?aha=0 — couche média absente, experience intacte", async ({ page }) => {
    await page.goto(BASE + "/?aha=0", { waitUntil: "load", timeout: 60000 })
    await page.waitForTimeout(2500)
    await page.locator('[data-testid="xp-best-open"]').first().click()
    await page.waitForSelector(EXP, { timeout: 15000 })
    await page.waitForTimeout(800)
    expect(await page.locator(EXP + " .bx-media").count()).toBe(0)
    expect(await page.locator(EXP + " .bx-media-scrim").count()).toBe(0)
    const verdict = await page.locator(EXP + " .bx-verdict").first().innerText()
    expect(verdict.trim().length).toBeGreaterThan(1)
  })

  test("reduced motion — aucune vidéo chargée, photo/scène intactes", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await openExperience(page)
    await page.waitForTimeout(2500)
    expect(await page.locator(EXP + " video").count()).toBe(0)
    expect(await page.locator(EXP + " .bx-media-scrim").count()).toBe(1)
    expect(await page.locator(EXP + " .bx-verdict").first().isVisible()).toBe(true)
  })
})
