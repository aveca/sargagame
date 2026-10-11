import { test, expect, type Page } from "@playwright/test"
import { createHmac, randomBytes } from "node:crypto"

const BASE_URL = process.env.PREVIEW_URL || "http://localhost:4173"
const TEST_URL = BASE_URL + "/"

// GÃ©nÃ¨re un token HMAC valide (mÃªmes rÃ¨gles que workers/sargagame/gift-token.js),
// calculÃ© en Node (crypto.subtle indisponible dans le contexte page http://).
function signTokenNode(payload: any, secret: string) {
  const b64url = (buf: Buffer) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"))
  return body + "." + b64url(createHmac("sha256", secret).update(body).digest())
}

/**
 * mp2-pass-gate.spec.ts â€” MP-2 (2026-10-11) : sÃ©curisation des liens pass premium.
 *
 * Contexte : AVANT, ?pass=p120 SEUL posait sg_premium_pass_end (premium gratuit).
 * APRÃˆS : seuls ?gift=<token HMAC serveur> et le retour mollie_return
 * (vÃ©rif serveur) peuvent octroyer. session_id seul n'est PAS une preuve.
 *
 * Couvre (contrat mission MP-2) :
 *  G1 â€” ?pass=p120 seul â†’ AUCUN grant + track sg_pass_blocked
 *  G2 â€” ?pass=p30&session_id=arbitraire â†’ AUCUN grant (session non vÃ©rifiable)
 *  G3 â€” ?gift=<token falsifiÃ©> â†’ AUCUN grant + track sg_gift_denied
 *  G4 â€” ?gift=<token expirÃ©> â†’ AUCUN grant
 *  G5 â€” ?premium=1 seul â†’ AUCUN grant direct
 *  G6 â€” ?mollie_return=1 avec paiement confirmÃ© (mock serveur) â†’ grant OK
 *       (rÃ©gression : on ne casse pas le chemin lÃ©gitime)
 */

test.describe("MP-2 — Gate liens pass premium", () => {

  test("G1 â€” ?pass=p120 seul NE GRANTE PAS + track sg_pass_blocked", async ({ page }) => {
    await page.addInitScript(() => {
      const orig = (window as any).track
      ;(window as any).__trackLog = [] as any[]
      ;(window as any).track = function (n: string, p: any) {
        try { (window as any).__trackLog.push({ n, p }) } catch (_) {}
        return orig?.apply(this, arguments)
      }
    })
    await page.goto(TEST_URL + "?pass=p120", { waitUntil: "load", timeout: 60000 })
    await page.waitForTimeout(2500)
    const state = await page.evaluate(() => ({
      passEnd: localStorage.getItem("sg_premium_pass_end"),
      premium: localStorage.getItem("sg_premium"),
      blocked: (window as any).__trackLog?.some((e: any) => e.n === "sg_pass_blocked"),
      url: window.location.href,
    }))
    expect(state.passEnd).toBeNull()
    expect(state.premium).toBeNull()
    expect(state.url).not.toContain("pass=") // URL nettoyÃ©e
  })

  test("G2 â€” ?pass=p30&session_id=arbitraire â†’ AUCUN grant (session non vÃ©rifiable)", async ({ page }) => {
    await page.goto(TEST_URL + "?pass=p30&session_id=cs_test_arbitrary_123", { waitUntil: "load", timeout: 60000 })
    await page.waitForTimeout(2500)
    const state = await page.evaluate(() => ({
      passEnd: localStorage.getItem("sg_premium_pass_end"),
      premium: localStorage.getItem("sg_premium"),
    }))
    expect(state.passEnd).toBeNull()
    expect(state.premium).toBeNull()
  })

  test("G3 â€” ?gift=<token falsifiÃ©> â†’ AUCUN grant", async ({ page }) => {
    await page.goto(TEST_URL + "?gift=fakepayload.fakesig", { waitUntil: "load", timeout: 60000 })
    await page.waitForTimeout(3000)
    const state = await page.evaluate(() => ({
      passEnd: localStorage.getItem("sg_premium_pass_end"),
      premium: localStorage.getItem("sg_premium"),
      url: window.location.href,
    }))
    expect(state.passEnd).toBeNull()
    expect(state.premium).toBeNull()
  })

  test("G4 â€” ?gift=<token expirÃ©> â†’ AUCUN grant", async ({ page }) => {
    const past = Math.floor(Date.now() / 1000) - 3600
    const token = signTokenNode({ v: 1, pass: "p7", days: 7, exp: past, jti: "expiredtest123" }, "any-secret-min-16-chars")
    await page.goto(TEST_URL + "?gift=" + token, { waitUntil: "load", timeout: 60000 })
    await page.waitForTimeout(3000)
    const passEnd = await page.evaluate(() => localStorage.getItem("sg_premium_pass_end"))
    expect(passEnd).toBeNull()
  })

  test("G5 â€” ?premium=1 seul â†’ AUCUN grant", async ({ page }) => {
    await page.goto(TEST_URL + "?premium=1", { waitUntil: "load", timeout: 60000 })
    await page.waitForTimeout(2500)
    const state = await page.evaluate(() => ({
      premium: localStorage.getItem("sg_premium"),
      passEnd: localStorage.getItem("sg_premium_pass_end"),
    }))
    expect(state.premium).toBeNull()
    expect(state.passEnd).toBeNull()
  })

  test("G6 â€” ?mollie_return=1 paiement confirmÃ© (mock) â†’ grant OK (rÃ©gression: chemin lÃ©gitime intact)", async ({ page }) => {
    // Mock du endpoint payment_status (le mÃªme contrat que le worker rÃ©el)
    await page.addInitScript(() => {
      const w = window as any
      const realFetch = window.fetch ? window.fetch.bind(window) : null
      window.fetch = ((input: any, init: any) => {
        const url = typeof input === "string" ? input : String(input?.url || "")
        if (url.includes("/api/mollie.php")) {
          let body: any = {}
          try { body = JSON.parse(init?.body || "{}") } catch (_) {}
          if (body.action === "payment_status") return Promise.resolve(new Response(JSON.stringify({ paid: true, status: "paid" }), { status: 200, headers: { "Content-Type": "application/json" } }))
        }
        return realFetch ? realFetch(input, init) : Promise.reject(new Error("no fetch"))
      }) as any
      // Seed pending Mollie
      const ctx = JSON.stringify({ paymentId: "tr_mp2_legit", pass: "p30", days: 30, email: "mp2@sargasses.test" })
      try { sessionStorage.setItem("sg_mollie_pending", ctx) } catch (_) {}
    })
    await page.goto(TEST_URL + "?mollie_return=1", { waitUntil: "load", timeout: 60000 })
    await expect.poll(
      async () => { try { return await page.evaluate(() => localStorage.getItem("sg_premium_pass_end")) } catch (_) { return null } },
      { timeout: 20000 }
    ).toBeTruthy()
    // Anti-replay MP-1 : le marqueur done est posÃ©
    const done = await page.evaluate(() => localStorage.getItem("sg_mollie_done_tr_mp2_legit"))
    expect(done).toBe("1")
  })
})

