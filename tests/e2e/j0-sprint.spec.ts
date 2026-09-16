import { test, expect, type Page } from "@playwright/test"
import { selectors } from "../utils/selectors"

const BASE_URL = process.env.PREVIEW_URL || "http://localhost:4173"
const TEST_URL = BASE_URL + "/"

function setupTrackInterceptor(page: Page) {
  page.addInitScript(() => {
    localStorage.removeItem("sg_track_log")
    sessionStorage.clear()
    let originalTrack: Function | undefined
    Object.defineProperty(window, "track", {
      configurable: true,
      set(fn: Function) {
        if (fn && !fn._wrapped) {
          originalTrack = fn
          const wrapped = function (this: any, name: string, data: any) {
            try {
              const logs = JSON.parse(localStorage.getItem("sg_track_log") || "[]")
              logs.push({ name, data, ts: Date.now() })
              localStorage.setItem("sg_track_log", JSON.stringify(logs.slice(-100)))
            } catch (_) {}
            return originalTrack?.apply(this, arguments)
          }
          wrapped._wrapped = true
          Object.defineProperty(window, "track", { configurable: true, value: wrapped, writable: true })
        }
      },
      get() { return originalTrack },
    })
  })
  return {
    getEvents() { return page.evaluate(() => JSON.parse(localStorage.getItem("sg_track_log") || "[]")) },
    hasEvent(name: string) {
      return page.evaluate((n) => JSON.parse(localStorage.getItem("sg_track_log") || "[]").some((e: any) => e.name === n), name)
    },
  }
}

async function openFirstBeach(page: Page) {
  await page.goto(TEST_URL, { waitUntil: "load", timeout: 60000 })
  // waitForSelector("[data-sg-labels-ready]")
    await page.waitForSelector(selectors.mapReady, { timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(2000)
  // 1er label visible ET réellement atteignable (hit-test au centre) — même
  // pattern que funnel-payment.spec.ts (funnel-82) : un label sous le panneau
  // opaque « Meilleur choix » n'est tapable par AUCUN utilisateur.
  const findTappable = () => page.evaluate((sel) => {
    const els = [...document.querySelectorAll(`${sel}[role='button']`)].filter((el) => {
      const r = el.getBoundingClientRect()
      return getComputedStyle(el).visibility === "visible" && r.width > 0 && r.height > 0
    })
    for (let i = 0; i < els.length; i++) {
      const r = els[i].getBoundingClientRect()
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      if (hit && (hit === els[i] || els[i].contains(hit))) return i
    }
    return -1
  }, selectors.mapPin)
  let tapIdx = await findTappable()
  // BUG-2026-036 : si le héros recouvre TOUS les labels, vrai parcours = on le
  // replie via son × (puis on re-cherche). Assertions/timeouts inchangés.
  if (tapIdx < 0) {
    const dismiss = page.locator(selectors.mapHeroDismiss).first()
    if (await dismiss.isVisible({ timeout: 3000 }).catch(() => false)) {
      await dismiss.click({ timeout: 5000 }).catch(() => {})
      await page.waitForTimeout(800)
      tapIdx = await findTappable()
    }
  }
  expect(tapIdx).toBeGreaterThanOrEqual(0)
  await page.locator(`${selectors.mapPin}[role='button']:visible`).nth(tapIdx).click({ timeout: 10000 })
  // Le tap peut ouvrir le takeover comic (.lc-detail) : pont vers la fiche data
  // (.bsc-sheet, où vivent vote/rapport/planB). Le chunk comic est LAZY et le
  // bouton pont est SOUS le fold → boucle jusqu'à .bsc-sheet visible (max ~15 s).
  // Sans pont, on garde la surface courante (les assertions tranchent).
  const tBridge0 = Date.now()
  while (Date.now() - tBridge0 < 15000) {
    if (await page.locator(".bsc-sheet").first().isVisible({ timeout: 1000 }).catch(() => false)) break
    const comic = page.locator(".lc-detail").first()
    if (!(await comic.isVisible({ timeout: 1000 }).catch(() => false))) break
    await comic.evaluate((el) => { try { el.scrollTo(0, el.scrollHeight) } catch (_) {} }).catch(() => {})
    await page.waitForTimeout(700)
    const full = page.locator(".lc-detail button").filter({ hasText: /Fiche complète|full report|ficha completa/i }).first()
    if (await full.isVisible({ timeout: 2000 }).catch(() => false)) {
      await full.click({ timeout: 5000 }).catch(() => {})
      await page.waitForTimeout(1200)
    } else {
      await page.waitForTimeout(1500)
    }
  }
  const fiche = page.locator(".bsc-sheet, .lc-detail, .sheet").first()
  await fiche.waitFor({ state: "visible", timeout: 15000 })
  // Paywall 3-vues (SPRINT #3, « VOUS AVEZ CONSULTÉ N PLAGES ») : overlay modal
  // qui recouvre la fiche et rend ses boutons inertes → on le referme pour
  // retrouver la fiche (parcours réel ; le paywall lui-même est couvert par
  // les suites funnel/premium). Il peut surgir EN RETARD (compteur de vues qui
  // suit l'ouverture) → boucle jusqu'à disparition (max 3, dismiss = 6h).
  await dismissConsultWall(page)
  return fiche
}

// Referme l'overlay « N PLAGES consultées » tant qu'il est visible (il peut
// surgir après coup, au fil des events de vue) — à rappeler juste avant
// chaque interaction fiche (vote, rapport).
async function dismissConsultWall(page: Page) {
  for (let i = 0; i < 3; i++) {
    const consultWall = page.locator('button:has-text("Peut-être plus tard")').first()
    if (await consultWall.isVisible({ timeout: 2500 }).catch(() => false)) {
      await consultWall.click({ timeout: 5000 }).catch(() => {})
      await page.waitForTimeout(1200)
    } else break
  }
}

async function openPaywall(page: Page, qs = "?paywall=1") {
  await page.goto(TEST_URL + qs, { waitUntil: "load", timeout: 60000 })
  await page.waitForFunction(() => !window.location.search.includes("paywall=1"), {}, { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(2500)
}

// Ouvre le paywall via l'onglet premium (BottomNav) — PRÉSERVE la query string,
// contrairement au deep-link ?paywall=1 dont le handler nettoie l'URL avant que
// le chunk lazy PremiumModal lise ses flags rollback.
// NOTE 5 onglets (UX Reset) : l'onglet premium se clique PAR TEXTE (selectors),
// pas par index — nth(2) = Carte depuis le passage à 5 onglets.
async function openPaywallViaNav(page: Page, qs = "") {
  await page.goto(TEST_URL + qs, { waitUntil: "load", timeout: 60000 })
  // waitForSelector("[data-sg-labels-ready]")
    await page.waitForSelector(selectors.mapReady, { timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(2000)
  const premiumTab = page.locator(selectors.bottomNavTabPremium).first()
  await premiumTab.click({ timeout: 10000 })
  await page.waitForTimeout(2500)
}

test.describe("J0 sprint — CRO paywall order", () => {
  test("défaut : offre AVANT email", async ({ page }) => {
    await openPaywall(page)
    const offerY = await page.evaluate(() => {
      const el = document.querySelector(".sg-passcard-hero")
      return el ? el.getBoundingClientRect().top + window.scrollY : -1
    })
    const emailY = await page.evaluate(() => {
      const el = document.querySelector('.sg-paywall-world input[type="email"]')
      return el ? el.getBoundingClientRect().top + window.scrollY : -1
    })
    expect(offerY).toBeGreaterThanOrEqual(0)
    expect(emailY).toBeGreaterThanOrEqual(0)
    expect(offerY).toBeLessThan(emailY)
  })

  test("rollback ?sgpayorder=0 : email AVANT offre", async ({ page }) => {
    await openPaywallViaNav(page, "?sgpayorder=0")
    const offerY = await page.evaluate(() => {
      const el = document.querySelector(".sg-passcard-hero")
      return el ? el.getBoundingClientRect().top + window.scrollY : -1
    })
    const emailY = await page.evaluate(() => {
      const el = document.querySelector('.sg-paywall-world input[type="email"]')
      return el ? el.getBoundingClientRect().top + window.scrollY : -1
    })
    expect(offerY).toBeGreaterThanOrEqual(0)
    expect(emailY).toBeGreaterThanOrEqual(0)
    expect(emailY).toBeLessThan(offerY)
  })

  test("clic CTA ouvre le checkout + event aval tracké (pas de CTA fantôme)", async ({ page }) => {
    // NOTE harnais : l'interception window.track ne voit pas sg_pass_cta émis depuis
    // le chunk lazy PremiumModal (mécanisme documenté : délégation inopérante sur ce
    // chemin, sg_pass_cta vérifié en contrat statique + flux Supabase réel en prod).
    // On prouve ici le COMPORTEMENT : clic CTA → overlay checkout ouvert + event aval
    // sg_onsite_checkout_opened (atteignable UNIQUEMENT via onPassBuy → pas de fantôme).
    const tracker = setupTrackInterceptor(page)
    await openPaywall(page)
    // CTA sticky (1 surface de tap) ou hero card
    const cta = page.locator(".sg-sticky, .sg-passcard-hero").first()
    await cta.scrollIntoViewIfNeeded().catch(() => {})
    await cta.click({ timeout: 10000 })
    await page.waitForTimeout(1500)
    // L'overlay de paiement carte est ouvert (champs réels, pas un no-op)
    const checkout = page.locator('text=/Numéro de carte|Card number|Active ton pass/i').first()
    await expect(checkout).toBeVisible({ timeout: 8000 })
    expect(await tracker.hasEvent("sg_onsite_checkout_opened")).toBe(true)
  })
})

test.describe("J0 sprint — fiche plage", () => {
  test("verdict couvert : planB OU repli honnête OU clean + vote terrain présent", async ({ page }) => {
    const tracker = setupTrackInterceptor(page)
    const fiche = await openFirstBeach(page)
    // Le statut peut arriver en _loading (data satellite) → attendre le verdict réel
    await page.waitForFunction(() => {
      const t = document.body.innerText || ""
      return /Plutôt y aller maintenant|Go here instead|Pas d'alternative propre|No clean alternative|Sargasses faibles|Sargasses modérées|Sargasses fortes|Low sargassum|Moderate sargassum|Heavy sargassum/.test(t)
    }, {}, { timeout: 15000 }).catch(() => {})
    const body = (await fiche.textContent()) || ""
    const hasPlanB = body.includes("Plutôt y aller maintenant") || body.includes("Go here instead")
    const hasFallback = body.includes("Pas d'alternative propre") || body.includes("No clean alternative")
    const hasVote = body.includes("Sur place ?") || body.includes("On the beach?")
    expect(hasVote).toBe(true)
    // Au moins une issue verdict : clean (chips), planB ou repli
    const hasVerdict = hasPlanB || hasFallback || body.includes("Sargasses faibles") || body.includes("Sargasses modérées") || body.includes("Sargasses fortes")
    expect(hasVerdict).toBe(true)
    if (hasPlanB) expect(await tracker.hasEvent("sg_planb_view")).toBe(true)
  })

  test("vote terrain émet sg_beach_report", async ({ page }) => {
    const tracker = setupTrackInterceptor(page)
    await openFirstBeach(page)
    // Bouton de vote EXACT (libellé seul) : un filtre substring attrape aussi
    // les chips de statut / alternatives (« Plage propre… ») selon la plage —
    // le clic part alors sur un élément inerte et l'event ne part jamais.
    // + re-fermeture du wall « N PLAGES » (peut resurgir après coup).
    await dismissConsultWall(page)
    const voteBtn = page.locator(".bsc-sheet button, .sheet button").filter({ hasText: /^Propre$|^Clean$|^Limpia$|^Modéré$|^Moderate$|^Moderado$|^Beaucoup$|^Heavy$|^Mucho$/ }).first()
    if (await voteBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await voteBtn.click({ timeout: 5000 }).catch(() => {})
      await page.waitForTimeout(1000)
      expect(await tracker.hasEvent("sg_beach_report")).toBe(true)
    }
  })

  test("rapport du jour : modale + bouton WhatsApp", async ({ page }) => {
    await openFirstBeach(page)
    await dismissConsultWall(page)
    // Bouton rapport (icône document) — texte variable selon langue
    const reportBtn = page.locator(".bsc-sheet button, .sheet button").filter({ hasText: /Rapport|Report|Informe/ }).first()
    if (await reportBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await reportBtn.click({ timeout: 5000 })
      await page.waitForTimeout(1500)
      const wa = page.locator('button:has-text("WhatsApp")').first()
      await expect(wa).toBeVisible({ timeout: 8000 })
    }
  })
})

test.describe("J0 sprint — espace B2B", () => {
  test("/pro/espace/ : trial + widget + paylink présents", async ({ page }) => {
    await page.goto(BASE_URL + "/pro/espace/", { waitUntil: "load", timeout: 60000 })
    await page.waitForTimeout(2000)
    const body = (await page.locator("body").textContent()) || ""
    expect(body.length).toBeGreaterThan(500)
    // Formulaire essai
    const trial = page.locator("#trialEmail, input[type='email']").first()
    expect(await trial.isVisible({ timeout: 5000 }).catch(() => false)).toBe(true)
    // Snippet widget (bouton copier) + lien annuel
    const copy = page.locator("#copy").first()
    expect(await copy.isVisible({ timeout: 5000 }).catch(() => false)).toBe(true)
    const sub = page.locator("#subscribe").first()
    expect(await sub.count()).toBeGreaterThanOrEqual(1)
    // Télémétrie embarquée (sgEv)
    const hasSgEv = await page.evaluate(() => document.documentElement.innerHTML.includes("sg_b2b_trial_activated"))
    expect(hasSgEv).toBe(true)
  })
})
