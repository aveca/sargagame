const { chromium } = require('playwright')

async function run() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  try {
    console.log('--- Testing /fiabilite/ ---')
    await page.goto('http://127.0.0.1:8790/fiabilite/?rel_v2=1', { waitUntil: 'domcontentloaded' })
    const isV2 = await page.evaluate(() => document.documentElement.className.includes('rel-v2'))
    if (!isV2) throw new Error('/fiabilite/ rel_v2 class not found')
    console.log('✓ /fiabilite/ v2 active')

    console.log('--- Testing /a-propos/ ---')
    await page.goto('http://127.0.0.1:8790/a-propos/?az=1', { waitUntil: 'domcontentloaded' })
    const isAZ = await page.evaluate(() => document.documentElement.className.includes('az-on'))
    if (!isAZ) throw new Error('/a-propos/ az-on class not found')
    console.log('✓ /a-propos/ v2 active')

    console.log('--- Testing /conditions/mer-calme/ ---')
    await page.goto('http://127.0.0.1:8790/conditions/mer-calme/', { waitUntil: 'networkidle' })
    const hasConditionsData = await page.evaluate(() => !!document.getElementById('sg-conditions-data'))
    if (!hasConditionsData) throw new Error('/conditions/mer-calme/ missing sg-conditions-data JSON')
    console.log('✓ /conditions/mer-calme/ has JSON data')

    console.log('--- Testing /widget/embed/plage-du-diamant/ ---')
    await page.goto('http://127.0.0.1:8790/widget/embed/plage-du-diamant/', { waitUntil: 'domcontentloaded' })
    const hasWidgetBody = await page.evaluate(() => !!document.querySelector('.info'))
    if (!hasWidgetBody) throw new Error('/widget/embed/plage-du-diamant/ missing .info container')
    console.log('✓ Widget loaded successfully')

    console.log('--- Testing /plages/plage-du-diamant/ ---')
    await page.goto('http://127.0.0.1:8790/plages/plage-du-diamant/?fichedive=1', { waitUntil: 'domcontentloaded' })
    const hasFicheDive = await page.evaluate(() => !document.getElementById('sg-fiche-dive').hidden)
    if (!hasFicheDive) throw new Error('/plages/plage-du-diamant/ dive-on class not found')
    console.log('✓ Fiche plage dive mode active')

    console.log('✅ All Phase C, D Playwright tests passed.')

  } catch (err) {
    console.error('❌ Test failed:', err.message)
    process.exit(1)
  } finally {
    await browser.close()
  }
}

run()
