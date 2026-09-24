#!/usr/bin/env node
// scripts/qa/aha-shots.mjs — QA visuel AHA (2026-09-23) : screenshot de l'experience
// réelle (home → xp-best-open → BeachExperience) + état média, par région/viewport.
// Usage : node scripts/qa/aha-shots.mjs <port> <tag> [--desktop] [--rollbacks]
import { chromium } from "playwright"
import fs from "fs"

const port = process.argv[2], tag = process.argv[3] || "shot"
const desktop = process.argv.includes("--desktop")
const out = ".ai/ui-audit/shots-aha"
fs.mkdirSync(out, { recursive: true })

const browser = await chromium.launch()
const ctx = await browser.newContext(desktop
  ? { viewport: { width: 1440, height: 900 } }
  : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
const errors = []
page.on("pageerror", e => errors.push(String(e).slice(0, 200)))

await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load", timeout: 60000 })
await page.waitForTimeout(2500)
await page.locator('[data-testid="xp-best-open"]').first().click()
await page.waitForSelector('[data-testid="bx-experience"]', { timeout: 20000 })
await page.waitForTimeout(3500) // laisse les fondus média jouer

const state = await page.evaluate(() => {
  const root = document.querySelector('[data-testid="bx-experience"]')
  const img = root && root.querySelector(".bx-media-img")
  const vid = root && root.querySelector("video.bx-media")
  return {
    verdict: (root && root.querySelector(".bx-verdict") || {}).textContent || null,
    beach: (root && root.querySelector(".bx-name") || {}).textContent || null,
    photo: img ? { src: img.getAttribute("src"), visible: getComputedStyle(img).opacity !== "0", w: img.naturalWidth } : null,
    video: vid ? { src: vid.getAttribute("src"), playing: !vid.paused } : null,
    scrim: !!(root && root.querySelector(".bx-media-scrim")),
    errorsBox: window.innerWidth,
  }
})
await page.screenshot({ path: `${out}/${tag}.png`, fullPage: false })
// 2e shot : reveals WHY+TOMORROW ouverts (visuel « information qui se déplie »)
try {
  await page.locator("#bx-why button").first().click()
  await page.locator("#bx-tomorrow button").first().click()
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${out}/${tag}--reveals.png`, fullPage: false })
} catch (_) {}
console.log(JSON.stringify({ tag, state, errors }, null, 1))
await browser.close()
