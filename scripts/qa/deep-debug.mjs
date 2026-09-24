// Debug deep-link experience — usage: node scripts/qa/deep-debug.mjs <port> <path>
import { chromium } from "playwright"
import { spawn } from "child_process"
import http from "http"

const port = Number(process.argv[2] || 4605)
const deep = process.argv[3] || "/beach/fl002"
const preview = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--port", String(port), "--strictPort", "--host", "127.0.0.1"], { cwd: process.cwd(), stdio: "ignore" })
function get(u) { return new Promise((res, rej) => { const r = http.get(u, (resp) => { resp.resume(); res(resp.statusCode) }); r.on("error", rej); r.setTimeout(3000, () => r.destroy(new Error("to"))) }) }

try {
  let up = false
  for (let i = 0; i < 40; i++) { try { if ((await get(`http://127.0.0.1:${port}/`)) === 200) { up = true; break } } catch (_) {} await new Promise(r => setTimeout(r, 500)) }
  if (!up) throw new Error("preview down")
  const browser = await chromium.launch()
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage()
  page.on("pageerror", e => console.log("[pgerr]", String(e).slice(0, 300)))
  page.on("console", m => { if (m.type() === "error") console.log("[conerr]", m.text().slice(0, 300)) })
  const resp = await page.goto(`http://127.0.0.1:${port}${deep}`, { waitUntil: "load", timeout: 60000 })
  console.log("goto", resp && resp.status())
  await page.waitForTimeout(4000)
  for (let k = 0; k < 3; k++) {
    const st = await page.evaluate(() => ({
      url: location.pathname + location.search,
      exp: !!document.querySelector('[data-testid="bx-experience"]'),
      expH: (document.querySelector('[data-testid="bx-experience"]') || {}).offsetHeight || 0,
      sheets: document.querySelectorAll(".bsc-sheet,.lc-detail,.sheet").length,
      testids: [...new Set([...document.querySelectorAll("[data-testid]")].map(x => x.dataset.testid))].slice(0, 40),
    }))
    console.log(JSON.stringify(st))
    await page.waitForTimeout(2000)
  }
  await page.screenshot({ path: ".ai/ui-audit/shots-aha/deep-debug.png" })
  await browser.close()
} finally {
  try { spawn("taskkill", ["/PID", String(preview.pid), "/F", "/T"], { stdio: "ignore" }) } catch (_) {}
}
