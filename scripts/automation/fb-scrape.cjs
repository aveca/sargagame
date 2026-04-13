#!/usr/bin/env node
/**
 * fb-scrape.cjs — Daily FB group scraper (manual run, not CI).
 *
 * Extracts sargassum-related posts from target FB groups to:
 *   1. Detect beach content gaps (beaches asked about but not in our DB)
 *   2. Build community report signals (real visitor testimony)
 *   3. Generate SEO content ideas from real user questions
 *   4. Queue draft replies for manual posting (stay under FB bot radar)
 *
 * Usage:
 *   # First time (installs playwright + chromium)
 *   npm i -D playwright
 *   npx playwright install chromium
 *
 *   # Daily run — user logs in once, session persists in .fb-session/
 *   node scripts/automation/fb-scrape.cjs
 *
 *   # Dry run (no scrape, just show target groups)
 *   node scripts/automation/fb-scrape.cjs --dry
 *
 * Output: scripts/automation/data/fb-feed.json (appended, not overwritten)
 *
 * Legal note: we scrape content to identify signals/gaps, not to republish
 * verbatim. Photos are catalogued but not hosted. Reply drafts remain in
 * queue for manual human posting — no automation touches FB write endpoints.
 */
const fs = require('fs')
const path = require('path')

const FEED_PATH = path.join(__dirname, 'data', 'fb-feed.json')
const SESSION_DIR = path.join(__dirname, '..', '..', '.fb-session')

// Beach keywords — posts must mention at least one to be saved
const BEACH_KEYWORDS = [
  'sargasse', 'sargassum', 'algue', 'plage',
  // MQ beaches + landmarks
  'salines', 'anse', 'tartane', 'caravelle', 'diamant', 'carbet', 'prêcheur',
  'couleuvre', 'céron', 'trabaud', 'cap chevalier', 'schoelcher', 'pointe lynch',
  'pointe fort', 'trinité', 'sainte-anne', 'sainte anne', 'vauclin',
  // GP beaches + landmarks
  'grande anse', 'malendure', 'bois jolan', 'saint-françois', 'saint francois',
  'sainte-anne', 'petite terre', 'désirade', 'desirade', 'saintes',
  'terre-de-haut', 'terre de haut', 'bouillante', 'deshaies',
  // generic state words
  'propre', 'alerte', 'échouage', 'echouage', 'banc', 'sargassière',
]

const TARGET_GROUPS = [
  { url: 'https://www.facebook.com/groups/169026757271139/', name: 'SOS Sargasses Martinique', island: 'mq', privacy: 'public' },
  { url: 'https://www.facebook.com/groups/1264655221572269/', name: 'Destination Guadeloupe', island: 'gp', privacy: 'private' },
]

function loadFeed() {
  try { return JSON.parse(fs.readFileSync(FEED_PATH, 'utf-8')) }
  catch { return { _comment: 'Scraped FB group posts.', _lastRun: null, posts: [], targetGroups: TARGET_GROUPS } }
}

function saveFeed(feed) {
  if (!fs.existsSync(path.dirname(FEED_PATH))) fs.mkdirSync(path.dirname(FEED_PATH), { recursive: true })
  fs.writeFileSync(FEED_PATH, JSON.stringify(feed, null, 2), 'utf-8')
}

function matchesBeachKeywords(text) {
  const lower = (text || '').toLowerCase()
  return BEACH_KEYWORDS.some(k => lower.includes(k))
}

function inferStatus(text) {
  const lower = (text || '').toLowerCase()
  if (/(beaucoup|épais|épaisses|couverte|recouverte|infesté|pourri|pue|puanteur|gratouille)/.test(lower)) return 'avoid'
  if (/(propre|nickel|aucune|pas de sargasse|zéro sargasse|clean|vide)/.test(lower)) return 'clean'
  if (/(un peu|bande|petite|quelques|moyennement|modéré)/.test(lower)) return 'moderate'
  return null
}

async function extractPost(page) {
  // Scroll once to trigger lazy content
  await page.evaluate(() => window.scrollTo(0, 400))
  await page.waitForTimeout(800)

  // Try clicking "Voir plus de commentaires" if present
  try {
    const more = await page.$('text=/Voir (plus de|tous les) commentaires/i')
    if (more) { await more.click(); await page.waitForTimeout(1000) }
  } catch {}

  return await page.evaluate(() => {
    const blocks = Array.from(document.querySelectorAll('div[dir="auto"], span[dir="auto"]'))
      .map(el => (el.innerText || '').trim())
      .filter(t => t.length > 20 && t.length < 800)
    const seen = new Set()
    const unique = []
    for (const t of blocks) {
      if (!seen.has(t)) { seen.add(t); unique.push(t) }
    }
    const imgs = Array.from(document.querySelectorAll('img'))
      .filter(i => (i.src || '').includes('scontent') && i.naturalWidth >= 300)
      .map(i => ({ src: i.src, w: i.naturalWidth, h: i.naturalHeight }))
      .slice(0, 8)
    return { title: document.title, texts: unique, imgs }
  })
}

async function scrapeGroupFeed(page, group, limit = 8) {
  console.log(`→ Scraping ${group.name} (${group.privacy})...`)
  await page.goto(group.url, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(2500)

  // Try to collect recent post permalinks
  const postLinks = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href*="/permalink/"], a[href*="/posts/"]'))
      .map(a => a.href)
      .filter(h => /\/permalink\/\d+|\/posts\/\d+/.test(h))
    return [...new Set(links)].slice(0, 12)
  })

  console.log(`  Found ${postLinks.length} post links`)
  const results = []
  for (const url of postLinks.slice(0, limit)) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await page.waitForTimeout(1800)
      const data = await extractPost(page)
      const joined = data.texts.join(' | ')
      if (!matchesBeachKeywords(joined)) continue
      results.push({
        scrapedAt: new Date().toISOString(),
        sourceUrl: url,
        group: group.name,
        groupPrivacy: group.privacy,
        island: group.island,
        title: data.title,
        texts: data.texts.slice(0, 15),
        images: data.imgs.slice(0, 5),
        inferredStatus: inferStatus(joined),
        replyStatus: 'pending',
      })
    } catch (e) {
      console.log(`  Skip ${url.slice(0, 80)}: ${e.message}`)
    }
  }
  return results
}

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--dry')) {
    console.log('DRY RUN — target groups:')
    TARGET_GROUPS.forEach(g => console.log(' •', g.name, '['+g.island+']', g.privacy))
    return
  }

  let chromium
  try { ({ chromium } = require('playwright')) }
  catch {
    console.error('✗ playwright not installed. Run: npm i -D playwright && npx playwright install chromium')
    process.exit(1)
  }

  const ctx = await chromium.launchPersistentContext(SESSION_DIR, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    locale: 'fr-FR',
  })
  const page = ctx.pages()[0] || await ctx.newPage()

  // Check login state — poll for up to 5 minutes so the flow works from background
  await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  let loggedIn = await page.evaluate(() => !document.querySelector('input[name="email"]'))
  if (!loggedIn) {
    console.log('⚠ Not logged in. Complete login in the open Chromium window (up to 5 min)...')
    const deadline = Date.now() + 5 * 60 * 1000
    while (!loggedIn && Date.now() < deadline) {
      await page.waitForTimeout(5000)
      try {
        loggedIn = await page.evaluate(() => !document.querySelector('input[name="email"]'))
        if (loggedIn) console.log('✓ Login detected, proceeding...')
      } catch {}
    }
    if (!loggedIn) { console.error('✗ Login timeout. Rerun when ready.'); await ctx.close(); process.exit(1) }
  }

  const feed = loadFeed()
  const canonicalUrl = u => String(u || '').split('?')[0].replace(/\/$/, '')
  const existing = new Set((feed.posts || []).map(p => canonicalUrl(p.sourceUrl)))
  const newPosts = []
  for (const group of TARGET_GROUPS) {
    try {
      const found = await scrapeGroupFeed(page, group, 8)
      for (const p of found) {
        p.sourceUrl = canonicalUrl(p.sourceUrl)
        if (!existing.has(p.sourceUrl)) { existing.add(p.sourceUrl); newPosts.push(p) }
      }
    } catch (e) {
      console.error(`Group ${group.name} failed:`, e.message)
    }
  }

  // De-dupe existing feed entries that still have tracking params
  const seenCanonical = new Set()
  const deduped = []
  for (const p of (feed.posts || [])) {
    const c = canonicalUrl(p.sourceUrl)
    if (seenCanonical.has(c)) continue
    seenCanonical.add(c)
    p.sourceUrl = c
    deduped.push(p)
  }
  feed.posts = [...deduped, ...newPosts].slice(-200) // keep last 200
  feed._lastRun = new Date().toISOString()
  saveFeed(feed)

  console.log(`\n✓ Added ${newPosts.length} new posts. Total: ${feed.posts.length}`)
  console.log(`  Output: ${FEED_PATH}`)
  console.log(`  Next: review drafted replies in fb-feed.json, post manually from your FB account.`)

  await ctx.close()
}

main().catch(e => {
  console.error('fb-scrape error:', e.message)
  process.exit(1)
})
