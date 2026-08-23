import { chromium, devices } from 'playwright'
const BASE = process.env.PREVIEW_URL || 'http://localhost:4173'
const b = await chromium.launch()
const ctx = await b.newContext({ ...devices['iPhone 12'], serviceWorkers: 'block' })
const p = await ctx.newPage()
await p.goto(BASE + '/previsions/?prev_az=1', { waitUntil: 'domcontentloaded', timeout: 60000 })
await p.waitForTimeout(9000)
console.log(JSON.stringify(await p.evaluate(() => ({
  fc: document.querySelectorAll('.fc-bar').length,
  h1: [...document.querySelectorAll('h1')].map(h => h.textContent.slice(0, 40)),
  roleBtn: [...document.querySelectorAll('div[role="button"][tabindex="0"]')].map(e => (e.getAttribute('aria-label') || e.textContent).slice(0, 40)).slice(0, 6),
  cookie: !!document.querySelector('.sg-cookie-banner'),
  heroTexts: document.body.innerText.slice(0, 300),
})), null, 1))
await b.close()
