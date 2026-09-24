// PROD QA AHA — home → xp-best-open → experience (photo/vidéo/verdict réels). One-off.
import { chromium } from "playwright"
const URL = process.argv[2] || "https://sargasses-martinique.com/"
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage()
const errors = []
page.on("pageerror", e => errors.push(String(e).slice(0, 200)))
try {
  await page.addInitScript(() => { try { localStorage.setItem("sg_lead_dismissed", String(Date.now())) } catch (_) {} })
  await page.goto(URL, { waitUntil: "load", timeout: 60000 })
  await page.waitForTimeout(3000)
  await page.locator('button:has-text("Accepter"), button:has-text("Accept"), button:has-text("Aceptar")').first().click().catch(() => {})
  await page.waitForTimeout(500)
  await page.locator('[data-testid="xp-best-open"]').first().click()
  await page.waitForSelector('[data-testid="bx-experience"]', { timeout: 20000 })
  await page.waitForTimeout(4500) // fondus média
  const state = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="bx-experience"]')
    const img = root && root.querySelector(".bx-media-img")
    const vid = root && root.querySelector("video.bx-media")
    return {
      beach: (root && root.querySelector(".bx-name") || {}).textContent || null,
      verdict: ((root && root.querySelector(".bx-verdict") || {}).textContent || "").trim(),
      score: ((root && root.querySelector(".bx-score") || {}).textContent || "").trim(),
      photo: img ? { src: img.getAttribute("src"), visible: getComputedStyle(img).opacity !== "0", naturalW: img.naturalWidth } : null,
      video: vid ? { src: vid.getAttribute("src"), playing: !vid.paused } : null,
      scrim: !!(root && root.querySelector(".bx-media-scrim")),
      revealWhy: !!document.querySelector("#bx-why"),
      revealTomorrow: !!document.querySelector("#bx-tomorrow"),
      revealBackup: !!document.querySelector("#bx-backup"),
      premiumCta: !!document.querySelector('[data-testid="exp-premium-cta"]'),
    }
  })
  // WHY → TOMORROW → BACKUP reveals
  await page.locator("#bx-why button").first().click().catch(() => {})
  await page.locator("#bx-tomorrow button").first().click().catch(() => {})
  await page.waitForTimeout(800)
  state.tomorrowDays = await page.locator('[data-testid="bx-experience"] .bx-timeline-day, [data-testid="bx-experience"] .bx-dot').count()
  await page.screenshot({ path: ".ai/ui-audit/shots-aha/PROD-mq-exp.png" })
  // premium
  await page.locator('[data-testid="exp-premium-cta"]').first().click({ timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(1500)
  state.paywall = await page.locator(".sg-modal-panel, .pww-wrap").first().isVisible().catch(() => false)
  console.log(JSON.stringify({ url: URL, state, errors }, null, 1))
} finally { await browser.close() }
