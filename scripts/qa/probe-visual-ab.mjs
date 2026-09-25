/* probe-visual-ab.mjs — AB visual : prod (avant) vs local preview (après).
   Capture 4 surfaces x viewports 390/768/1440. Lecture seule. */
import { chromium } from 'playwright'
import fs from 'fs'

const PROD = 'https://sargasses-martinique.com'
const LOCAL = process.env.PREVIEW_URL || 'http://localhost:4173'
const OUT = process.env.TEMP + '\\sg-ab'
fs.mkdirSync(OUT, { recursive: true })

const SCENARIOS = [
  { tag: 'home', path: '/' },
  { tag: 'today', path: '/aujourdhui/' },
  { tag: 'beach', path: '/' },   // besoin d'un click beach au runtime pour local
  { tag: 'premium', path: '/?paywall=1' },
]
const VIEWPORTS = [390, 768, 1440]

const b = await chromium.launch()
for (const mode of ['before', 'after']) {
  const base = mode === 'before' ? PROD : LOCAL
  for (const sc of SCENARIOS) {
    for (const w of VIEWPORTS) {
      const name = `${sc.tag}-${w}px-${mode}.png`
      try {
        const p = await (await b.newContext({ viewport: { width: w, height: w === 390 ? 844 : w === 768 ? 1024 : 900 }, isMobile: w < 768, hasTouch: w < 768 })).newPage()
        await p.goto(base + sc.path, { waitUntil: 'load', timeout: 60000 })
        if (sc.tag === 'premium') { await p.waitForSelector('.sg-modal-panel, .pww-wrap', { timeout: 20000 }).catch(() => {}) }
        else if (sc.tag === 'beach') {
          await p.waitForSelector('[data-testid="xp-home"]', { timeout: 20000 }).catch(() => {})
          // cliquer la meilleure plage (preview) car prod géoloc differe ; sinon rien
          const btn = await p.locator('[data-testid="xp-best-open"]').first()
          if (await btn.count()) await btn.evaluate(el => el.click()).catch(() => {})
          await p.waitForSelector('[data-testid="bx-experience"]', { timeout: 15000 }).catch(() => {})
        } else if (sc.tag === 'home') {
          await p.waitForSelector('[data-testid="xp-home"]', { timeout: 20000 }).catch(() => {})
        } else if (sc.tag === 'today') {
          await p.waitForTimeout(500)
        }
        await p.waitForTimeout(1400)
        await p.screenshot({ path: `${OUT}\\${name}` })
        console.log('OK', name)
        await p.context().close()
      } catch (e) { console.log('FAIL', name, e.message.slice(0, 120)) }
    }
  }
}
await b.close()
