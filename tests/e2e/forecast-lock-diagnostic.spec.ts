import { test } from '@playwright/test'

test.describe('Forecast Lock Click Diagnostic', () => {
  test('MQ mobile: forecast lock click fires sg_forecast_lock_click', async ({ page }) => {
    const events: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'log' && msg.text().includes('sg_forecast_lock_click')) {
        events.push(msg.text())
      }
    })

    await page.goto('https://sargasses-martinique.com/previsions/', { waitUntil: 'load', timeout: 60000 })
    await page.waitForTimeout(8000)

    // Check for forecast chart component
    const forecastChart = page.locator('[class*="ForecastChart"], [class*="forecast-chart"], svg[viewBox]')
    const chartCount = await forecastChart.count()
    console.log(`Forecast charts: ${chartCount}`)

    // Check for locked overlay elements (rendered by React)
    const lockedOverlay = page.locator('[style*="linear-gradient(90deg,transparent"]')
    const overlayCount = await lockedOverlay.count()
    console.log(`Locked overlays: ${overlayCount}`)

    // Check for any element with "Débloquer" text
    const debloquerText = page.locator('text=/Débloquer/i')
    const debloquerCount = await debloquerText.count()
    console.log(`Débloquer text elements: ${debloquerCount}`)

    // Check for any element with "locked" in style
    const lockedStyle = page.locator('[style*="locked"], [style*="Locked"]')
    const lockedStyleCount = await lockedStyle.count()
    console.log(`Locked style elements: ${lockedStyleCount}`)

    // Check for any element with "lock" in class or style
    const lockElements = page.locator('[class*="lock"], [style*="lock"]')
    const lockCount = await lockElements.count()
    console.log(`Lock elements: ${lockCount}`)

    // Check for any role="button" elements
    const roleButtons = page.locator('[role="button"]')
    const buttonCount = await roleButtons.count()
    console.log(`Role buttons: ${buttonCount}`)

    // Try to find the forecast chart and inspect its children
    const forecastChartDiv = page.locator('div:has(svg)')
    const chartDivCount = await forecastChartDiv.count()
    console.log(`Divs with SVG: ${chartDivCount}`)

    // If we find forecast chart divs, inspect their children
    if (chartDivCount > 0) {
      for (let i = 0; i < Math.min(chartDivCount, 3); i++) {
        const div = forecastChartDiv.nth(i)
        const children = await div.locator('*').count()
        const html = await div.innerHTML().catch(() => '')
        console.log(`Chart div ${i} children: ${children}, HTML length: ${html.length}`)
        if (html.includes('Débloquer') || html.includes('locked') || html.includes('lockedCount')) {
          console.log('  -> Contains lock-related content!')
        }
      }
    }

    await page.waitForTimeout(3000)
  })
})