#!/usr/bin/env node
/**
 * fb-auto-reply.cjs — Auto-post pre-drafted replies from fb-feed.json.
 *
 * Complements the existing chain:
 *   fb-scrape (scrape raw posts)
 *     → fb-analyze (extract signals + populate draftReply per post)
 *     → fb-to-reports (publish community signals to /api/community/fb-reports.json)
 *     → fb-auto-reply  ← THIS SCRIPT: actually posts the drafts via Playwright
 *
 * Why a separate script: scrape/analyze/publish are idempotent data transforms
 * safe to run headlessly in CI. Auto-reply touches FB write endpoints — risky,
 * rate-limited, needs an authenticated persistent browser context, and should
 * be opt-in (manual invocation from user's machine, not CI).
 *
 * What it does NOT do: compose reply text. Drafts must already exist in
 * fb-feed.json with draftReply.text populated. Keeps content decisions in
 * analyze where they can be versioned/reviewed before going live.
 *
 * Rate limits (ban-avoidance):
 *   - MAX_PER_RUN=3 — even if many drafts are pending
 *   - MAX_PER_DAY=5 — hard global cap across all runs today
 *   - 45-120s jitter between replies
 *   - Skip drafts older than MAX_AGE_H=72 (lose relevance fast on FB feeds)
 *   - Skip drafts already posted (replyStatus === 'posted')
 *   - --dry-run flag to preview without touching FB
 *
 * Usage:
 *   node scripts/automation/fb-auto-reply.cjs --dry-run   # preview
 *   node scripts/automation/fb-auto-reply.cjs             # live post (needs logged-in .fb-session)
 */
const fs = require('fs')
const path = require('path')

const FEED_PATH = path.join(__dirname, 'data', 'fb-feed.json')
const LOG_PATH = path.join(__dirname, 'data', 'fb-reply-log.jsonl')
const SESSION_DIR = path.join(__dirname, '..', '..', '.fb-session')

const MAX_PER_RUN = 3
const MAX_PER_DAY = 5
const MIN_DELAY_S = 45
const MAX_DELAY_S = 120
const MAX_AGE_H = 72

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
function jitter(minS, maxS) { return (minS + Math.random() * (maxS - minS)) * 1000 }

function loadFeed() {
  try { return JSON.parse(fs.readFileSync(FEED_PATH, 'utf-8')) }
  catch { return { posts: [] } }
}
function saveFeed(f) { fs.writeFileSync(FEED_PATH, JSON.stringify(f, null, 2), 'utf-8') }
function logReply(entry) {
  if (!fs.existsSync(path.dirname(LOG_PATH))) fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true })
  fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n')
}

function repliesSentToday() {
  if (!fs.existsSync(LOG_PATH)) return 0
  const cutoff = Date.now() - 24 * 3600 * 1000
  return fs.readFileSync(LOG_PATH, 'utf-8').split('\n').filter(Boolean)
    .map(l => { try { return JSON.parse(l) } catch { return null } })
    .filter(e => e && e.status === 'posted' && new Date(e.postedAt).getTime() > cutoff)
    .length
}

function eligibleDrafts(feed) {
  const now = Date.now()
  return (feed.posts || []).filter(p => {
    if (!p.draftReply?.text) return false
    if (p.replyStatus === 'posted') return false
    if (!p.sourceUrl) return false
    const scraped = new Date(p.scrapedAt || 0).getTime()
    if (!scraped || (now - scraped) > MAX_AGE_H * 3600 * 1000) return false
    return true
  })
}

async function postOneReply(page, post) {
  await page.goto(post.sourceUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await sleep(jitter(3, 5))

  // Scroll a bit so comment box lazy-loads
  await page.evaluate(() => window.scrollBy(0, 400))
  await sleep(jitter(1.5, 3))

  // Find comment box: FB uses contenteditable divs with role=textbox.
  // The top-level post comment box is usually the last one below the article.
  const box = await page.$('[role="article"] [contenteditable="true"][role="textbox"]').catch(() => null)
    || await page.$('[contenteditable="true"][role="textbox"]').catch(() => null)
  if (!box) throw new Error('Comment box not found (login expired, or post not public?)')

  await box.click()
  await sleep(jitter(0.8, 1.5))
  await page.keyboard.type(post.draftReply.text, { delay: 38 }) // human-like cadence
  await sleep(jitter(1, 2.5))
  await page.keyboard.press('Enter')
  await sleep(jitter(2.5, 4.5))
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run') || args.includes('--dry')

  const feed = loadFeed()
  const drafts = eligibleDrafts(feed)
  const dayCount = repliesSentToday()
  const remaining = Math.max(0, Math.min(MAX_PER_RUN, MAX_PER_DAY - dayCount))

  console.log(`FB auto-reply — ${drafts.length} eligible drafts, ${dayCount}/${MAX_PER_DAY} already posted today, will attempt ${Math.min(remaining, drafts.length)}`)

  if (remaining === 0) { console.log('Daily cap reached — bail.'); return }
  if (drafts.length === 0) { console.log('No drafts to post. Run fb-scrape + fb-analyze first.'); return }

  const toPost = drafts.slice(0, remaining)

  if (dryRun) {
    console.log('\n=== DRY RUN ===')
    for (const p of toPost) {
      console.log(`\n→ ${p.group} [${p.island}] · ${p.beachMentioned || p.beachId}`)
      console.log(`  ${p.sourceUrl}`)
      console.log(`  action: ${p.draftReply.action}`)
      console.log(`  reply: ${p.draftReply.text.slice(0, 200)}${p.draftReply.text.length > 200 ? '…' : ''}`)
    }
    return
  }

  let chromium
  try { ({ chromium } = require('playwright')) }
  catch { console.error('✗ playwright not installed. npm i -D playwright && npx playwright install chromium'); process.exit(1) }

  const ctx = await chromium.launchPersistentContext(SESSION_DIR, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    locale: 'fr-FR',
  })
  const page = ctx.pages()[0] || await ctx.newPage()

  // Sanity: not logged out. Poll up to 30s — fresh sessions can be slow to hydrate.
  await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded' })
  let loggedIn = false
  const loginDeadline = Date.now() + 30000
  while (!loggedIn && Date.now() < loginDeadline) {
    await sleep(2000)
    try {
      loggedIn = await page.evaluate(() => {
        if (document.querySelector('input[name="email"]')) return false
        if (document.querySelector('input[name="pass"]')) return false
        return !/login|checkpoint/i.test(location.pathname)
      })
    } catch {}
  }
  if (!loggedIn) {
    console.error('✗ Not logged in after 30s. URL:', page.url())
    console.error('  → Session may have expired. Run: node scripts/automation/fb-scrape.cjs')
    await ctx.close(); process.exit(1)
  }
  console.log('✓ Logged-in session detected, proceeding...')

  for (let i = 0; i < toPost.length; i++) {
    const p = toPost[i]
    const startedAt = new Date().toISOString()
    try {
      await postOneReply(page, p)
      p.replyStatus = 'posted'
      p.draftReply.status = 'posted'
      p.postedAt = new Date().toISOString()
      saveFeed(feed)
      logReply({ status: 'posted', postedAt: p.postedAt, sourceUrl: p.sourceUrl, beachId: p.beachId, action: p.draftReply.action, textPreview: p.draftReply.text.slice(0, 80) })
      console.log(`✓ [${i + 1}/${toPost.length}] ${p.beachMentioned || p.beachId} — posted`)
    } catch (e) {
      logReply({ status: 'error', startedAt, sourceUrl: p.sourceUrl, beachId: p.beachId, error: e.message })
      console.error(`✗ [${i + 1}/${toPost.length}] ${p.sourceUrl}: ${e.message}`)
    }
    if (i < toPost.length - 1) {
      const ms = jitter(MIN_DELAY_S, MAX_DELAY_S)
      console.log(`  waiting ${Math.round(ms / 1000)}s before next reply…`)
      await sleep(ms)
    }
  }

  await ctx.close()
  console.log('\n✓ Run complete')
}

main().catch(e => { console.error('fb-auto-reply error:', e.message); process.exit(1) })
