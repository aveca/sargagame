import { test, expect } from "@playwright/test"

const BASE_URL = process.env.PREVIEW_URL || "http://localhost:4173"

test("debug queue + delegation", async ({ page }) => {
  await page.goto(BASE_URL + "/?frustration=0&offer=trip7&paywall=1", { waitUntil: "load", timeout: 60000 })
  await page.waitForFunction(() => !window.location.search.includes("paywall=1"), {}, { timeout: 15000 }).catch(() => {})
  await page.waitForSelector("button.sg-passcard-hero", { timeout: 15000 })
  await page.waitForTimeout(3000)
  const probe = await page.evaluate(() => {
    const out: any = {}
    try {
      const keys: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && /track|sg_|queue/i.test(k)) keys.push(k)
      }
      out.lsKeys = keys
      for (const k of keys) {
        try {
          const v = JSON.parse(localStorage.getItem(k) || "null")
          out[k] = Array.isArray(v) ? v.map((e: any) => e.e || e.name || JSON.stringify(e).slice(0, 60)) : String(v).slice(0, 200)
        } catch (_) {
          out[k] = (localStorage.getItem(k) || "").slice(0, 200)
        }
      }
      const fn: any = (window as any).track
      out.windowTrackType = typeof fn
      out.windowTrackSrc = String(fn).slice(0, 120)
    } catch (e) {
      out.err = String(e)
    }
    return out
  })
  console.log(JSON.stringify(probe, null, 2))
  expect(true).toBe(true)
})
