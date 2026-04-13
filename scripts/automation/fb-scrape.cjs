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
const BEACHES_PATH = path.join(__dirname, '..', '..', 'public', 'data', 'beaches-list.json')
const SESSION_DIR = path.join(__dirname, '..', '..', '.fb-session')

// Auto-derive beach keywords from the live beaches list so we never drift from
// the real DB. Keeps the "topic" guards (sargasse/algue) hand-curated.
function buildBeachKeywords() {
  const topicKeywords = [
    'sargasse', 'sargassum', 'algue', 'plage',
    'propre', 'alerte', 'échouage', 'echouage', 'banc', 'sargassière',
  ]
  try {
    const beaches = JSON.parse(fs.readFileSync(BEACHES_PATH, 'utf-8'))
    const seen = new Set(topicKeywords)
    for (const b of beaches) {
      // Split beach name on whitespace/punct, keep tokens >=4 chars (avoids "de"/"la")
      const tokens = String(b.name || '').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .split(/[\s\-'()/,]+/).filter(t => t.length >= 4)
      const commune = String(b.commune || '').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      if (commune.length >= 4) seen.add(commune)
      for (const t of tokens) seen.add(t)
    }
    return [...seen]
  } catch (e) {
    console.warn('⚠ beaches-list.json not loadable, using fallback keywords:', e.message)
    return topicKeywords
  }
}

const BEACH_KEYWORDS = buildBeachKeywords()

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

// Topic gate: post must mention sargassum explicitly (not just a beach name).
// Prevents noise from unrelated group posts ("panne voiture", "location",
// "météo humide") that happen to namedrop a commune/beach token.
const SARGASSUM_TOPIC = /(sargass|algu[ei]|échoua|echoua|pourri|puanteur|banc[s ]|sargassi[eè]re)/i

function matchesBeachKeywords(text) {
  const lower = (text || '').toLowerCase()
  if (!SARGASSUM_TOPIC.test(lower)) return false
  // And at least one beach-name or commune token
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
  // Scroll progressively to trigger lazy content + all comments (photos live
  // in comments too — that's where people actually post "here's what it looks
  // like today" shots, which is the highest-value sargassum content).
  for (let y = 0; y <= 2400; y += 600) {
    await page.evaluate(yy => window.scrollTo(0, yy), y)
    await page.waitForTimeout(500)
  }

  // Click all "Voir plus de commentaires" / "See more comments" buttons we can find
  for (let i = 0; i < 3; i++) {
    try {
      const more = await page.$('text=/Voir (plus de|tous les|d.autres) commentaires|See more comments|View (more|previous)/i')
      if (!more) break
      await more.click({ force: true }).catch(() => {})
      await page.waitForTimeout(900)
    } catch { break }
  }

  // Expand "Voir plus" (See more) on long posts so we capture full text
  try {
    const seeMore = await page.$$('text=/^Voir plus$|^See more$/i')
    for (const b of seeMore.slice(0, 5)) { await b.click({ force: true }).catch(() => {}) }
    await page.waitForTimeout(400)
  } catch {}

  return await page.evaluate(() => {
    const blocks = Array.from(document.querySelectorAll('div[dir="auto"], span[dir="auto"]'))
      .map(el => (el.innerText || '').trim())
      .filter(t => t.length > 20 && t.length < 1200)
    const seen = new Set()
    const unique = []
    for (const t of blocks) {
      if (!seen.has(t)) { seen.add(t); unique.push(t) }
    }

    // Scontent images — exclude profile pictures (they live in <a> with
    // /user/ or /profile/, or have very small aspect ratio). Keep photos with
    // meaningful dimensions (w>=400 catches typical FB beach shots).
    const imgs = Array.from(document.querySelectorAll('img'))
      .filter(i => {
        const src = i.src || ''
        if (!src.includes('scontent') && !src.includes('fbcdn')) return false
        if (i.naturalWidth < 400) return false
        // Skip profile/avatar images — they sit inside an <a href="/user/…">
        const parentA = i.closest('a[href*="/user/"], a[href*="/profile/"]')
        if (parentA && i.naturalWidth < 200) return false
        return true
      })
      .map(i => ({
        src: i.src,
        w: i.naturalWidth,
        h: i.naturalHeight,
        alt: i.alt || '',
      }))
      // Dedupe by src
      .filter((v, i, arr) => arr.findIndex(x => x.src === v.src) === i)
      .slice(0, 12)

    // Author — profile link *inside* the post article. Reject generic FB chrome
    // (the home link labelled "Facebook", skip-to-content, Menu, etc.)
    let author = null
    try {
      const FB_CHROME = /^(facebook|menu|accueil|home|marketplace|watch|gaming|notifications|accessibility)$/i
      const article = document.querySelector('[role="article"]') || document
      // Look for strong/span inside an anchor that points to a user profile
      const candidates = Array.from(article.querySelectorAll(
        'h2 strong span, h3 strong span, h4 strong span, strong > a, a[role="link"] > strong span, a[role="link"] span strong'
      )).map(el => (el.innerText || '').trim()).filter(Boolean)
      for (const c of candidates) {
        const clean = c.split('\n')[0].trim()
        if (clean && clean.length >= 3 && clean.length <= 80 && !FB_CHROME.test(clean)) {
          author = clean
          break
        }
      }
    } catch {}

    return { title: document.title, texts: unique, imgs, author }
  })
}

async function scrapeGroupFeed(page, group, limit = 12) {
  console.log(`→ Scraping ${group.name} (${group.privacy})...`)
  await page.goto(group.url, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(2500)

  // Scroll the feed a few times to trigger lazy-load of more posts
  // (FB only renders ~3-5 posts in initial DOM). 3 scrolls ≈ 12-18 posts.
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollBy(0, 1500))
    await page.waitForTimeout(1200)
  }

  // Collect recent post permalinks
  const postLinks = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href*="/permalink/"], a[href*="/posts/"]'))
      .map(a => a.href)
      .filter(h => /\/permalink\/\d+|\/posts\/\d+/.test(h))
    return [...new Set(links)].slice(0, 25)
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
        author: data.author || null,
        texts: data.texts.slice(0, 20),
        images: data.imgs.slice(0, 10),
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
    console.log('  keywords:', BEACH_KEYWORDS.length, 'tokens (auto-derived from beaches-list.json)')
    return
  }
  // --headless = run without UI using the persisted .fb-session cookies.
  // Only works if the user has logged in at least once interactively before.
  const HEADLESS = args.includes('--headless') || process.env.FB_HEADLESS === '1'

  let chromium
  try { ({ chromium } = require('playwright')) }
  catch {
    console.error('✗ playwright not installed. Run: npm i -D playwright && npx playwright install chromium')
    process.exit(1)
  }

  const ctx = await chromium.launchPersistentContext(SESSION_DIR, {
    headless: HEADLESS,
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
