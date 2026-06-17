/**
 * Playwright smoke — /alertes/ A/B pw_alertes (variant + control).
 * Usage: npx http-server dist -p 8795 --silent & node scripts/test-alerts.cjs
 */
const { chromium } = require("playwright")

async function probe(url, label) {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  const errors = []
  page.on("pageerror", e => {
    console.error(`[PageError] ${label}:`, e.message)
    errors.push(e.message)
  })
  page.on("console", m => {
    if (m.type() === "error") {
      const txt = m.text()
      if (txt.includes("create-checkout.php") || txt.includes("google-analytics") || txt.includes("Method Not Allowed")) {
        return
      }
      console.error(`[ConsoleError] ${label}:`, txt)
      errors.push(txt)
    }
  })
  page.on("requestfailed", request => {
    const url = request.url()
    const errText = request.failure()?.errorText || "unknown"
    if (url.includes("create-checkout.php") || url.includes("google-analytics") || errText.includes("ERR_ABORTED")) {
      return
    }
    console.error(`[RequestFailed] ${label}: ${url} - ${errText}`)
    errors.push(`Request failed: ${url} - ${errText}`)
  })
  page.on("response", response => {
    const url = response.url()
    if (response.status() >= 400) {
      if (url.includes("create-checkout.php") || url.includes("google-analytics")) {
        return
      }
      console.error(`[ResponseError] ${label}: ${url} status=${response.status()}`)
      errors.push(`Response error: ${url} status=${response.status()}`)
    }
  })
  console.log(`Navigating to ${url}...`)
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 })
  await page.waitForTimeout(3000)

  const title = await page.title()
  console.log(`[Debug] ${label} page title: "${title}"`)

  // Verify that the AlertHub component exists by checking for the h1 text
  const hasAlertHub = await page.evaluate(() => {
    const headings = Array.from(document.querySelectorAll("h1"));
    return headings.some(h => {
      const txt = h.textContent || "";
      return txt.includes("surveille") || txt.includes("watch") || txt.includes("Vigilamos");
    });
  })

  if (!hasAlertHub) {
    const textSnippet = await page.evaluate(() => document.body.innerText.slice(0, 300))
    console.log(`[Debug] ${label} hasAlertHub is FALSE. Body snippet: "${textSnippet.replace(/\n/g, ' ')}"`)
  } else {
    console.log(`[Debug] ${label} hasAlertHub is TRUE.`)
  }

  await page.screenshot({ path: `scripts/ss-alerts-${label}.png`, fullPage: true })
  await browser.close()
  return { label, hasAlertHub, errors }
}

;(async () => {
  const variantMQ = await probe("http://127.0.0.1:8795/alertes/?pw_alertes=1", "mq-variant")
  const controlMQ = await probe("http://127.0.0.1:8795/alertes/?pw_alertes=0", "mq-control")
  const variantEN = await probe("http://127.0.0.1:8795/en/sargassum-alerts/?pw_alertes=1", "en-variant")
  const variantES = await probe("http://127.0.0.1:8795/es/alertas-sargazo/?pw_alertes=1", "es-variant")

  console.log(JSON.stringify({ variantMQ, controlMQ, variantEN, variantES }, null, 2))

  const allErrors = [
    ...variantMQ.errors,
    ...controlMQ.errors,
    ...variantEN.errors,
    ...variantES.errors
  ]

  const fail =
    allErrors.length ||
    !variantMQ.hasAlertHub ||
    controlMQ.hasAlertHub ||
    !variantEN.hasAlertHub ||
    !variantES.hasAlertHub

  if (fail) {
    console.error("FAIL: One or more assertions failed or console/page errors were captured.")
    process.exit(1)
  }
  console.log("PASS — all variants and controls rendered correctly with 0 errors!")
})()
