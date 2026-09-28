import { test, expect } from "@playwright/test"

const BASE_URL = process.env.PREVIEW_URL || "http://localhost:4173"

test("debug track interception", async ({ page }) => {
  page.addInitScript(() => {
    try { localStorage.removeItem("sg_track_log") } catch (_) {}
    try { sessionStorage.clear() } catch (_) {}
    let originalTrack: Function | undefined
    Object.defineProperty(window, "track", {
      configurable: true,
      set(fn: Function) {
        try {
          const logs = JSON.parse(localStorage.getItem("sg_track_dbg") || "[]")
          logs.push({ ev: "setter-fired", t: Date.now() })
          localStorage.setItem("sg_track_dbg", JSON.stringify(logs))
        } catch (_) {}
        if (fn && !(fn as any)._wrapped) {
          originalTrack = fn
          const wrapped = function (this: any, name: string, data: any) {
            try {
              const logs = JSON.parse(localStorage.getItem("sg_track_log") || "[]")
              logs.push({ name, data })
              localStorage.setItem("sg_track_log", JSON.stringify(logs.slice(-60)))
            } catch (_) {}
            return originalTrack?.apply(this, arguments)
          };
          (wrapped as any)._wrapped = true
          Object.defineProperty(window, "track", {
            configurable: true,
            value: wrapped,
            writable: true,
          })
        }
      },
      get() {
        return originalTrack
      },
    })
  })
  await page.goto(BASE_URL + "/?frustration=0&offer=trip7&paywall=1", { waitUntil: "load", timeout: 60000 })
  await page.waitForFunction(() => !window.location.search.includes("paywall=1"), {}, { timeout: 15000 }).catch(() => {})
  await page.waitForSelector("button.sg-passcard-hero", { timeout: 15000 })
  await page.waitForTimeout(3000)
  const dbg = await page.evaluate(() => {
    let log: any[] = []
    let dbgLog: any[] = []
    try { log = JSON.parse(localStorage.getItem("sg_track_log") || "[]") } catch (_) {}
    try { dbgLog = JSON.parse(localStorage.getItem("sg_track_dbg") || "[]") } catch (_) {}
    return {
      typeofTrack: typeof (window as any).track,
      setterFired: dbgLog.length,
      totalEvents: log.length,
      names: log.map((e: any) => e.name),
      offerViews: log.filter((e: any) => e.name === "sg_pass_offer_view"),
    }
  })
  console.log(JSON.stringify(dbg, null, 2))
  expect(true).toBe(true)
})
