/* probe-rail-prod.mjs — preuve geste → requête tracking (2026-09-25J, §14).
   PROD ONLY (pas CI) : drag SeaRail → intercepte le POST Supabase
   analytics_events → vérifie event + flag synthetic (jamais de trafic réel).
   La ROW Supabase elle-même se vérifie côté daily-stats (clé service,
   absente d'ici) — ce probe prouve l'émission + le plumbing allowlist.
   Usage : PROBE_PROD=1 node scripts/qa/probe-rail-prod.mjs */
import { chromium } from 'playwright'

if (process.env.PROBE_PROD !== '1') { console.log('SKIP (PROBE_PROD!=1)'); process.exit(0) }

const BASE = process.env.PROBE_BASE || process.env.PREVIEW_URL || 'https://sargasses-martinique.com'
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const p = await ctx.newPage()
const hits = []
p.on('request', (r) => {
  try {
    const u = r.url()
    if (/supabase\.co/.test(u)) hits.push({ url: u.slice(0, 110), post: (r.postData() || '').slice(0, 400) })
  } catch (_) {}
})
await p.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 })
await p.waitForSelector('[data-testid="xp-home"]', { timeout: 25000 }).catch(() => {})
// Consent analytics requis (track gate sg_cookie_consent === 'accepted').
let consentClicked = false
for (const name of [/Accepter/i, /Tout accepter/i, /Accept/i]) {
  const btn = p.getByRole('button', { name }).first()
  if (await btn.count().catch(() => 0)) { await btn.click().catch(() => {}); consentClicked = true; break }
}
await p.waitForTimeout(1500)
const consent = await p.evaluate(() => { try { return localStorage.getItem('sg_cookie_consent') } catch (_) { return 'ERR' } }).catch(() => 'ERR')
console.log('CONSENT_CLICKED=' + consentClicked + ' STORED=' + consent)
// Geste : drag horizontal sur le rail (centre → focus change → event).
const rail = p.locator('[data-testid="wow-rail"]').first()
const railCount = await rail.count().catch(() => 0)
console.log('RAIL_PRESENT=' + railCount)
if (await rail.count()) {
  await rail.evaluate(el => el.scrollIntoView({ block: 'center' })).catch(() => {})
  await p.waitForTimeout(500)
  // Geste 1 : clavier → (chip suivante = nouveau focus = event).
  await rail.focus().catch(() => {})
  await p.keyboard.press('ArrowRight').catch(() => {})
  await p.waitForTimeout(1200)
  // Geste 2 : molette verticale → scroll horizontal du rail.
  await rail.hover().catch(() => {})
  await p.mouse.wheel(0, 400).catch(() => {})
  await p.waitForTimeout(1500)
  const after = await rail.evaluate(el => el.scrollLeft).catch(() => -1)
  console.log('RAIL_SCROLL_AFTER_KEYS=' + after)
}
await p.waitForTimeout(4000)
const railHits = hits.filter(h => /home_rail/.test(h.post))
console.log('SUPABASE_POSTS=' + hits.length)
console.log('RAIL_HITS=' + railHits.length)
if (railHits.length) console.log('SAMPLE=' + railHits[0].post.slice(0, 220))
console.log('SYNTHETIC=' + (railHits.some(h => /synthetic/.test(h.post)) ? 'yes' : 'no'))
await b.close()
if (!railHits.length) { console.log('RESULT=NO_RAIL_REQUEST (voir consent/allowlist)'); process.exit(2) }
console.log('RESULT=RAIL_TRACKING_OK')
