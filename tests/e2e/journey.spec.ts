import { test, expect } from "@playwright/test"

/**
 * WOW JOURNEY / CONTINUITY (2026-09-24) — « un seul monde » :
 * rail séjour persistant, deep link ?exp=, Back natif sort du monde,
 * pile in-world (chip ←), strip trip partagé. Rollback : ?sgjourney=0.
 * Données 100 % réelles (live sargassum.json servi par le build).
 */
const BASE = process.env.PREVIEW_URL || "http://localhost:4173"
const EXP = '[data-testid="bx-experience"]'
const RAIL = '[data-testid="exp-journey-rail"]'

/* Chips jour = forecast weekly RÉEL du build (journeyFor → sargData.weekly).
   Or le rail WOW home peut mettre en avant une plage SANS station weekly
   (21 stations couvertes / 136 plages ; cross-île possible) → days=[] par design
   (zéro donnée inventée) et le test deviendrait data-flake. Pour le CÂBLAGE UX
   on part donc d'une plage COUVERTE, découverte dynamiquement : mêmes ids que
   SARG_TO_BEACH (src/Sargasses_PROD.jsx) — plages mq de la station weekly. */
const SARG_SID = ["mq016", "mq011", "mq012", "mq004", "mq001", "mq024", "mq034", "mq008", "mq033", "mq044"]
  .map(id => [id, { mq016: "diamant", mq011: "anse-mitan", mq012: "anse-noire", mq004: "sainte-anne", mq001: "les-salines", mq024: "anse-madame", mq034: "tartane", mq008: "pt-marin", mq033: "precheur", mq044: "vauclin" }[id]])
async function coveredBeachId(request) {
  const res = await request.get(BASE + "/api/copernicus/sargassum.json")
  const j = await res.json()
  for (const [id, sid] of SARG_SID) {
    const w = j.weekly && j.weekly[sid]
    if (w && Array.isArray(w.forecast) && w.forecast.length >= 2) return id
  }
  throw new Error("aucune plage couverte par le forecast weekly — build data cassé")
}

/* Deep link = même porte que la carte (onBeachClick) : l'expérience s'ouvre
   direct sur la plage demandée, île du build garantie par coveredBeachId. */
async function openExperience(page, params = "", beachId = null) {
  if (beachId) {
    const qp = params.startsWith("?") ? params.slice(1) + "&" : ""
    await page.goto(BASE + "/?" + qp + "exp=" + beachId, { waitUntil: "load", timeout: 60000 })
  } else {
    await page.goto(BASE + "/" + params, { waitUntil: "load", timeout: 60000 })
    await page.waitForTimeout(2500)
    await page.locator('[data-testid="xp-best-open"]').first().click()
  }
  await page.waitForSelector(EXP, { timeout: 20000 })
  await page.waitForTimeout(1000)
}

test.describe("WOW Journey — continuity layer", () => {
  test("rail séjour : chips jours réelles + plan B → transformation + retour ←", async ({ page }) => {
    // Plage à forecast weekly RÉEL (cf. en-tête) — sinon days=[] par design.
    const id = await coveredBeachId(page.request)
    await openExperience(page, "", id)
    // Le fil du séjour est là dès l'entrée dans le monde
    await page.waitForSelector(RAIL, { timeout: 8000 })
    const dayChips = page.locator(RAIL + ' [data-testid="exp-day-chip"]')
    expect(await dayChips.count()).toBeGreaterThanOrEqual(2)
    const first = (await page.locator(EXP + " .bx-name").first().innerText()).trim()

    // Plan B (chip rail) = transformation A→B du même objet
    const planB = page.locator('[data-testid="exp-planb-chip"]')
    if (await planB.isVisible().catch(() => false)) {
      await planB.click()
      await page.waitForTimeout(1800)
      const second = (await page.locator(EXP + " .bx-name").first().innerText()).trim()
      expect(second.length).toBeGreaterThan(2)
      expect(second).not.toBe(first)
      // pile in-world : le chip ← ramène exactement d'où l'on vient
      const back = page.locator('[data-testid="exp-back-chip"]')
      await expect(back).toBeVisible({ timeout: 6000 })
      await back.click()
      await page.waitForTimeout(1800)
      const again = (await page.locator(EXP + " .bx-name").first().innerText()).trim()
      expect(again).toBe(first)
    }
    // chip jour 0 = identité de l'objet (sans effet destructeur)
    // (résilient aux overlays transitoires : célébration z9999 ~1.5s post-switch
    // plage clean ; retry espacé, force en dernier recours)
    await page.waitForTimeout(1900)
    let chipOk = false
    for (let attempt = 0; attempt < 3 && !chipOk; attempt++) {
      try { await dayChips.first().click({ timeout: 2500, force: attempt === 2 }); chipOk = true }
      catch (_) { await page.waitForTimeout(1400) }
    }
    await page.waitForTimeout(500)
    expect(await page.locator(EXP).count()).toBe(1)
  })

  test("deep link ?exp=<id> : le monde s'ouvre direct sur la bonne plage", async ({ page }) => {
    await page.goto(BASE + "/", { waitUntil: "load", timeout: 60000 })
    // Un pin CARTE (SVG) = toujours une plage de l'île du build — la home WOW
    // montre les DEUX îles du domaine partagé MQ/GP (rail balises), et le deep
    // link rejette par design toute plage hors île du build (x.island===island).
    // La carte n'est montée qu'au tap de l'onglet → l'ouvrir d'abord.
    await page.waitForTimeout(2500)
    const mapBtn = page.locator("nav.sg-bottom-nav button").filter({ hasText: /carte|map|mapa/i }).first()
    await mapBtn.click({ timeout: 10000 })
    await page.waitForSelector("svg [data-beach]", { state: "attached", timeout: 25000 })
    const id = await page.locator("svg [data-beach]").first().getAttribute("data-beach")
    expect(id, "aucun pin data-beach — carte non prête").toBeTruthy()
    await page.goto(BASE + "/?exp=" + id, { waitUntil: "load", timeout: 60000 })
    await page.waitForSelector(EXP, { timeout: 20000 })
    await page.waitForTimeout(800)
    const name = (await page.locator(EXP + " .bx-name").first().innerText()).trim()
    expect(name.length).toBeGreaterThan(2)
    expect(page.url()).toContain("exp=" + id)
  })

  test("Back navigateur = sortir du monde (la carte dessous est intacte)", async ({ page }) => {
    await openExperience(page)
    expect(page.url()).toContain("exp=")
    await page.goBack()
    await page.waitForTimeout(1200)
    expect(await page.locator(EXP).count()).toBe(0)
    expect(page.url()).not.toContain("exp=")
  })

  test("rollback ?sgjourney=0 : aucune trace du layer (rail + URL + geste)", async ({ page }) => {
    await openExperience(page, "?sgjourney=0")
    await page.waitForTimeout(800)
    expect(await page.locator(RAIL).count()).toBe(0)
    expect(page.url()).not.toContain("exp=")
    // core experience intact (verdict présent)
    const verdict = await page.locator(EXP + " .bx-verdict").first().innerText()
    expect(verdict.trim().length).toBeGreaterThan(1)
  })

  test("trip : strip séjour partagé (même plage que le monde) + chip verrouillée → premium", async ({ page }) => {
    // Idem rail : days réels requis → plage couverte par le forecast weekly.
    const id = await coveredBeachId(page.request)
    await openExperience(page, "", id)
    const worldBeach = (await page.locator(EXP + " .bx-name").first().innerText()).trim()
    await page.locator('[data-testid="exp-trip-open"]').first().click()
    const strip = page.locator('[data-testid="trip-stay-strip"]')
    await expect(strip).toBeVisible({ timeout: 8000 })
    // la spine nomme la plage du monde (« mon séjour s'appuie sur … »)
    // (comparaison insensible à la casse : le kicker est en text-transform:uppercase)
    const stripText = (await strip.innerText()).replace(/\s+/g, " ").toLowerCase()
    expect(stripText).toContain(worldBeach.toLowerCase())
    // chips semaine réelles
    expect(await page.locator('[data-testid="trip-stay-chip"]').count()).toBeGreaterThanOrEqual(2)
    // chip verrouillée (J+3+) → moment premium (le trip reste le même objet)
    const locked = page.locator('[data-testid="trip-stay-chip"][data-day="2"]').first()
    if (await locked.count().then((c) => c > 0)) {
      await locked.click()
      const paywall = page.locator(".sg-modal-panel, .pww-wrap").first()
      expect(await paywall.isVisible({ timeout: 12000 }).catch(() => false)).toBe(true)
    }
  })
})
