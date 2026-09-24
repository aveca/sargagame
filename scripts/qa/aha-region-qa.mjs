#!/usr/bin/env node
// scripts/qa/aha-region-qa.mjs — QA visuel AHA self-contained : lance un preview
// vite (dist courant), shoote l'experience (mobile + desktop), tue le preview.
// Usage : node scripts/qa/aha-region-qa.mjs <tag>   (build d'abord : VITE_REGION=<r> npm run build)
import { spawn } from "child_process"
import { chromium } from "playwright"
import fs from "fs"
import http from "http"

const tag = process.argv[2] || "mq"
const port = 4300 + Math.floor(Math.random() * 500)
const out = ".ai/ui-audit/shots-aha"
fs.mkdirSync(out, { recursive: true })

const preview = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--port", String(port), "--strictPort", "--host", "127.0.0.1"], {
  cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"],
})
let previewLog = ""
preview.stdout.on("data", d => { previewLog += d })
preview.stderr.on("data", d => { previewLog += d })
preview.on("exit", c => { previewLog += `\n[exit ${c}]` })

function get(url, timeout = 3000) {
  return new Promise((res, rej) => {
    const r = http.get(url, (resp) => { resp.resume(); res(resp.statusCode) })
    r.on("error", rej); r.setTimeout(timeout, () => r.destroy(new Error("timeout")))
  })
}
async function waitUp() {
  for (let i = 0; i < 40; i++) {
    try { if ((await get(`http://127.0.0.1:${port}/`)) === 200) return true } catch (_) {}
    await new Promise(r => setTimeout(r, 500))
  }
  throw new Error("preview ne démarre pas\n" + previewLog)
}

async function shot(desktop, deepPath = null) {
  const browser = await chromium.launch()
  const ctx = await browser.newContext(desktop
    ? { viewport: { width: 1440, height: 900 } }
    : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  // QA = visiteur qui a déjà plié le sticker email (sg_lead_dismissed, 7 j) —
  // sinon il recouvre le bas de l'experience (z1250) pendant les shots.
  await page.addInitScript(() => { try { localStorage.setItem("sg_lead_dismissed", String(Date.now())) } catch (_) {} })
  const errors = []
  page.on("pageerror", e => errors.push(String(e).slice(0, 160)))
  await page.goto(`http://127.0.0.1:${port}${deepPath || "/"}`, { waitUntil: "load", timeout: 60000 })
  await page.waitForTimeout(2500)
  // Cookie banner (recouvre les CTA bas) : accepter pour dégager le parcours QA.
  await page.locator('button:has-text("Accept"), button:has-text("Accepter"), button:has-text("Aceptar")').first().click().catch(() => {})
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${out}/${tag}${desktop ? "-desktop" : ""}-home.png` })
  if (!deepPath) {
    // Entrée experience : CTA « meilleure plage » si la région a un top pick du jour,
    // sinon liste complète → première fiche (même parcours utilisateur, zéro hack DOM).
    const best = page.locator('[data-testid="xp-best-open"]').first()
    if (await best.isVisible({ timeout: 5000 }).catch(() => false)) {
      await best.click()
    } else {
      await page.locator('[data-testid="xp-all"], [data-testid="xp-best-more"]').first().click()
      try {
        await page.waitForSelector('[data-testid="xp-beach-card"]', { timeout: 15000 })
      } catch (e) {
        const ids = await page.locator('[data-testid]').evaluateAll(els => els.map(x => x.getAttribute('data-testid')))
        await page.screenshot({ path: `${out}/${tag}-debug.png` })
        throw new Error('liste plages introuvable ; testids=' + [...new Set(ids)].join(','))
      }
      await page.locator('[data-testid="xp-beach-card"] [data-testid="xp-open"], [data-beach] [data-testid="xp-open"]').first().click()
    }
  }
  await page.waitForSelector('[data-testid="bx-experience"]', { timeout: 20000 })
  await page.waitForTimeout(600)
  await page.waitForTimeout(3500)
  const state = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="bx-experience"]')
    const img = root && root.querySelector(".bx-media-img")
    const vid = root && root.querySelector("video.bx-media")
    return {
      beach: (root && root.querySelector(".bx-name") || {}).textContent || null,
      verdict: ((root && root.querySelector(".bx-verdict") || {}).textContent || "").trim(),
      photo: img ? { src: img.getAttribute("src"), visible: getComputedStyle(img).opacity !== "0" } : null,
      video: vid ? { src: vid.getAttribute("src"), playing: !vid.paused } : null,
      pageerrors: window.__pe || 0,
    }
  })
  await page.screenshot({ path: `${out}/${tag}${desktop ? "-desktop" : ""}-exp.png` })
  state.errors = errors
  await browser.close()
  return state
}

try {
  await waitUp()
  const deepPath = process.argv[3] || null
  const mobile = await shot(false, deepPath)
  const desktopShot = tag.startsWith("mq") ? await shot(true, deepPath) : null
  console.log(JSON.stringify({ tag, mobile, desktop: desktopShot }, null, 1))
} finally {
  try { preview.kill() } catch (_) {}
  try { spawn("taskkill", ["/PID", String(preview.pid), "/F", "/T"], { stdio: "ignore" }) } catch (_) {}
}
