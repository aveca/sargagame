import { test, expect, type Page } from "@playwright/test"

const BASE_URL = "https://sargasses-martinique.com"

async function captureNetwork(page: Page) {
  const requests: Array<{ url: string; method: string; postData?: string; status?: number; response?: any }> = []
  page.on('request', request => {
    if (request.url().includes('/api/mollie')) {
      requests.push({ 
        url: request.url(), 
        method: request.method(),
        postData: request.postData() 
      })
    }
  })
  page.on('response', async response => {
    if (response.url().includes('/api/mollie')) {
      const req = requests.find(r => r.url === response.url())
      if (req) {
        req.status = response.status()
        try { req.response = await response.json() } catch {}
      }
    }
  })
  page.on('console', msg => {
    console.log(`[BROWSER CONSOLE] ${msg.type()}: ${msg.text()}`)
  })
  page.on('pageerror', e => {
    console.log(`[BROWSER ERROR] ${e.message}`)
  })
  return requests
}

test.describe("SOS Plage Checkout — Browser Diagnostics", () => {
  test("PHASE 1: Full browser flow ?sos=1 → beach select → CTA → checkout", async ({ page }) => {
    const networkCalls = await captureNetwork(page)
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })

    // 1. HTTP 200
    const response = await page.goto(BASE_URL + "/?sos=1", { waitUntil: "load", timeout: 60000 })
    expect(response?.status()).toBe(200)
    console.log("✅ HTTP 200")

    // 2. App loaded - wait for React root
    await page.waitForSelector('#root', { timeout: 15000 })
    console.log("✅ React root mounted")

    // 3. Check if SOS mode is active - look for SOSPlage component
    // The component should render a beach selector
    await page.waitForTimeout(3000) // Let lazy chunk load

// 3. Check if SOS mode is active - look for SOSPlage component
    // The component should render a beach selector
    await page.waitForTimeout(3000) // Let lazy chunk load

    // Check if SOSPlage component is rendered
    const sosRoot = page.locator('[data-sos-plage="true"]').first()
    const sosRootVisible = await sosRoot.isVisible({ timeout: 10000 }).catch(() => false)
    console.log("🔍 SOSPlage root visible:", sosRootVisible)

    // Check showSOS state by looking at localStorage or any global flag
    const sosState = await page.evaluate(() => {
      // Check if showSOS is set in any global state
      return {
        urlSearch: window.location.search,
        sosInUrl: new URLSearchParams(window.location.search).get('sos'),
        localStorageShowSOS: localStorage.getItem('showSOS'),
        sessionStorageShowSOS: sessionStorage.getItem('showSOS')
      }
    })
    console.log("🔍 SOS state:", JSON.stringify(sosState))

    // 4. Beach selector visible
    const beachSelect = page.locator('select').first()
    await expect(beachSelect).toBeVisible({ timeout: 15000 })
    console.log("✅ Beach selector visible")

    // 5. Select "Plage des Salines" (mq001)
    await beachSelect.selectOption('mq001')
    console.log("✅ Selected Plage des Salines")

    await page.waitForTimeout(1000)

    // 6. Find CTA button with exact text - use ID selector
    const cta = page.locator('#sos-plage-cta').first()
    await expect(cta).toBeVisible({ timeout: 10000 })
    console.log("✅ CTA 'Voir mon rapport — 1 €' visible")

    // 7. CTA clickable
    await expect(cta).toBeEnabled()
    console.log("✅ CTA enabled")

    // 8. Click CTA and capture network - use force click to bypass intercepting elements
    await cta.click({ force: true })
    console.log("✅ CTA clicked")

    // 9-11. Wait for network response
    await page.waitForTimeout(3000)

    // Also check for any fetch to /api/mollie (worker endpoint)
    const allMollieCalls = networkCalls.filter(c => c.url.includes('/api/mollie') && !c.url.includes('mollie.com'))
    console.log("📡 All /api/mollie* calls:", allMollieCalls.length)
    for (const call of allMollieCalls) {
      console.log(`  ${call.method} ${call.url}`)
      if (call.postData) {
        console.log(`  Request body: ${call.postData}`)
      }
      if (call.response) {
        console.log(`  Response:`, JSON.stringify(call.response, null, 2))
      }
    }

    // Check if handleBuy was called by evaluating in browser
    const handleBuyCalled = await page.evaluate(() => {
      return window.__sosHandleBuyCalled || false
    })
    console.log("🔍 handleBuy called:", handleBuyCalled)

    // Debug: Check if the button has onClick handler
    const buttonInfo = await page.evaluate(() => {
      const btn = document.getElementById('sos-plage-cta')
      if (!btn) return { found: false }
      const allKeys = Object.keys(btn)
      const reactKeys = allKeys.filter(k => k.startsWith('__react') || k.startsWith('__reactFiber') || k.startsWith('__reactInternal'))
      return {
        found: true,
        onclick: btn.onclick ? 'present' : 'missing',
        hasReactProps: reactKeys.length > 0,
        reactKeys: reactKeys,
        allKeysCount: allKeys.length,
        tagName: btn.tagName,
        disabled: btn.disabled,
        style: btn.style.cssText
      }
    })
    console.log("🔍 Button info:", JSON.stringify(buttonInfo, null, 2))

    // Try clicking via JS evaluation to trigger React handler
    if (!handleBuyCalled) {
      console.log("🔧 Attempting JS click to trigger React handler...")
      await page.evaluate(() => {
        const btn = document.getElementById('sos-plage-cta')
        if (btn && btn.onclick) {
          btn.onclick({ type: 'click', target: btn, currentTarget: btn, preventDefault: () => {}, stopPropagation: () => {} })
        } else if (btn) {
          btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
        }
      })
      await page.waitForTimeout(2000)
      
      // Check again
      const handleBuyCalled2 = await page.evaluate(() => {
        return window.__sosHandleBuyCalled || false
      })
      console.log("🔍 handleBuy called after JS click:", handleBuyCalled2)
    }

    // 12. Check if redirected to Mollie
    const currentUrl = page.url()
    console.log("📍 Current URL after click:", currentUrl)
    
    const isMollie = currentUrl.includes('mollie.com')
    console.log("🔗 Redirected to Mollie:", isMollie)

    // 13. Summary
    console.log("\n=== PHASE 1 SUMMARY ===")
    console.log("Errors:", errors.length > 0 ? errors : "None")
    console.log("Mollie API calls:", allMollieCalls.length)
    console.log("Redirected to Mollie:", isMollie)
    console.log("Final URL:", currentUrl)
  })

  test("PHASE 1b: Direct API test - POST /api/mollie", async ({ page }) => {
    const response = await page.request.post(`${BASE_URL}/api/mollie`, {
      data: {
        action: "create_payment",
        pass: "sos",
        cents: 100,
        cur: "eur",
        source: "sos_plage",
        lang: "fr",
        metadata: {
          beach: "mq001",
          beachName: "Plage des Salines"
        }
      }
    })
    
    console.log("Status:", response.status())
    const body = await response.json()
    console.log("Response:", JSON.stringify(body, null, 2))
    
    expect(response.ok()).toBeTruthy()
    expect(body.checkoutUrl).toBeTruthy()
    expect(body.paymentId).toBeTruthy()
  })
})