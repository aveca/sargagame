/**
 * Playwright smoke — /previsions/ A/B prev_az (variant + control).
 * Usage: npx vite preview --port 8790 --strictPort & node scripts/test-previsions-landing.cjs
 */
const { chromium } = require("playwright")

async function probe(url, label) {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  const errors = []
  page.on("pageerror", e => errors.push(e.message))
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()) })
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 })
  await page.waitForTimeout(1500)
  const hasLanding = await page.evaluate(() => {
    const h1 = document.body.innerText || ""
    return /Prévisions 7 jours|7-day forecast|Pronóstico 7 días/i.test(h1)
  })
  const hasChart = await page.locator(".fc-bar, .gbtn").count()
  await page.screenshot({ path: `scripts/ss-previsions-${label}.png`, fullPage: true })
  await browser.close()
  return { label, hasLanding, hasChart, errors }
}

;(async () => {
  const base = "http://127.0.0.1:8790/previsions/"
  const variant = await probe(base + "?prev_az=1", "variant")
  const control = await probe(base + "?prev_az=0", "control")
  console.log(JSON.stringify({ variant, control }, null, 2))
  const fail =
    variant.errors.length ||
    control.errors.length ||
    !variant.hasLanding ||
    variant.hasChart < 1 ||
    control.hasLanding
  if (fail) {
    console.error("FAIL")
    process.exit(1)
  }
  console.log("PASS — variant shows landing+chart, control shows map only")
})()
