/**
 * Playwright smoke — /plages-sans-sargasses/ A/B clean_list (variant + control).
 * Usage: npx http-server dist -p 8795 --silent & node scripts/test-clean-list.cjs
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
      console.error(`[ConsoleError] ${label}:`, m.text())
      errors.push(m.text())
    }
  })
  console.log(`Navigating to ${url}...`)
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 })
  await page.waitForTimeout(3000)

  const title = await page.title()
  console.log(`[Debug] ${label} page title: "${title}"`)

  // Verify that the custom elements or layouts exist.
  // The CleanList component mounts inside the shadow root of its host div.
  const hasCleanList = await page.evaluate(() => {
    const dlg = document.querySelector('div[role="dialog"]');
    if (!dlg) return false;
    if (dlg.shadowRoot) {
      const rail = dlg.shadowRoot.getElementById("clRail");
      return !!rail;
    }
    return false;
  })

  if (!hasCleanList) {
    const textSnippet = await page.evaluate(() => document.body.innerText.slice(0, 300))
    console.log(`[Debug] ${label} hasCleanList is FALSE. Body snippet: "${textSnippet.replace(/\n/g, ' ')}"`)
  }

  await page.screenshot({ path: `scripts/ss-clean-list-${label}.png`, fullPage: true })
  await browser.close()
  return { label, hasCleanList, errors }
}

;(async () => {
  const variantMQ = await probe("http://127.0.0.1:8795/plages-sans-sargasses/?clean_list=1", "mq-variant")
  const controlMQ = await probe("http://127.0.0.1:8795/plages-sans-sargasses/?clean_list=0", "mq-control")
  const variantEN = await probe("http://127.0.0.1:8795/en/best-beaches-no-sargassum/?clean_list=1", "en-variant")
  const variantES = await probe("http://127.0.0.1:8795/es/mejores-playas-sin-sargazo/?clean_list=1", "es-variant")

  console.log(JSON.stringify({ variantMQ, controlMQ, variantEN, variantES }, null, 2))

  const allErrors = [
    ...variantMQ.errors,
    ...controlMQ.errors,
    ...variantEN.errors,
    ...variantES.errors
  ]

  const fail =
    allErrors.length ||
    !variantMQ.hasCleanList ||
    controlMQ.hasCleanList ||
    !variantEN.hasCleanList ||
    !variantES.hasCleanList

  if (fail) {
    console.error("FAIL: One or more assertions failed or console/page errors were captured.")
    process.exit(1)
  }
  console.log("PASS — all variants and controls rendered correctly with 0 errors!")
})()
