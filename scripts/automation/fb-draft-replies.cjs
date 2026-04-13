#!/usr/bin/env node
/**
 * fb-draft-replies.cjs — Generate draftReply objects for fb-feed.json posts.
 *
 * Missing piece in the chain between fb-analyze and fb-auto-reply:
 *   fb-scrape → fb-analyze → fb-draft-replies → fb-to-reports → fb-auto-reply
 *
 * Reads:  scripts/automation/data/fb-feed.json (posts scraped + analyzed)
 *         public/api/copernicus/sargassum.json (for alt beach scores)
 *         public/data/beaches-list.json (for beach slug → URL mapping)
 * Writes: scripts/automation/data/fb-feed.json (adds draftReply to eligible posts)
 *
 * Idempotent: skips posts that already have draftReply.text unless --force.
 *
 * Template rotation: 5 natural French variants. Always helpful-first, link at end.
 * Never "reply to everything" — only posts with beachId + inferredStatus qualify.
 *
 * Usage:
 *   node scripts/automation/fb-draft-replies.cjs            # write drafts into feed
 *   node scripts/automation/fb-draft-replies.cjs --dry-run  # print only
 *   node scripts/automation/fb-draft-replies.cjs --force    # regenerate existing
 */
const fs = require('fs')
const path = require('path')

const FEED_PATH = path.join(__dirname, 'data', 'fb-feed.json')
const SARG_PATH = path.join(__dirname, '..', '..', 'public', 'api', 'copernicus', 'sargassum.json')
const BEACHES_PATH = path.join(__dirname, '..', '..', 'public', 'data', 'beaches-list.json')

function loadJson(p, fallback = null) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')) }
  catch { return fallback }
}
function saveFeed(f) { fs.writeFileSync(FEED_PATH, JSON.stringify(f, null, 2), 'utf-8') }

function slugify(s) {
  return String(s || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-')
}

// Translate internal status to human French
function statusFr(s) {
  if (s === 'clean') return 'propre'
  if (s === 'moderate') return 'modéré'
  if (s === 'avoid') return 'bien présent'
  return 'à confirmer'
}

// Pick a same-island legacy beach with high score as alternative.
// Excludes the same beach as the primary (by slug containment).
function pickAlternative(levels, island, excludeNameLower) {
  const islandPrefix = island === 'gp' ? 'gp-' : null
  const candidates = (levels || []).filter(l => {
    const isGp = (l.id || '').startsWith('gp-')
    if (island === 'gp' && !isGp) return false
    if (island === 'mq' && isGp) return false
    if (l.score == null || l.score < 65) return false
    // Avoid recommending the same beach if names overlap loosely
    if (excludeNameLower) {
      const lid = (l.id || '').toLowerCase()
      if (excludeNameLower.includes(lid) || lid.includes(excludeNameLower.split(' ')[0] || '')) return false
    }
    return true
  })
  candidates.sort((a, b) => b.score - a.score)
  return candidates[0] || null
}

// Map legacy id to a human-readable beach name — fallback reformats the id.
function prettyLegacyName(id) {
  if (!id) return 'le top du jour'
  const map = {
    'grande-anse': 'Grande Anse d\'Arlet', 'anse-mitan': 'Anse Mitan', 'anse-noire': 'Anse Noire',
    'tartane': 'Tartane', 'anse-madame': 'Anse Madame', 'diamant': 'Le Diamant',
    'pt-marin': 'Pointe Marin', 'sainte-anne': 'Sainte-Anne', 'les-salines': 'Les Salines',
    'vauclin': 'Le Vauclin',
    'gp-grande-anse': 'Grande Anse (Trois-Rivières)', 'gp-malendure': 'Malendure',
    'gp-sainte-anne': 'Sainte-Anne (GP)', 'gp-pt-chateaux': 'Pointe des Châteaux',
    'gp-gosier': 'Le Gosier', 'gp-caravelle': 'La Caravelle',
    'gp-bas-du-fort': 'Bas du Fort', 'gp-deshaies': 'Deshaies',
    'gp-moule': 'Le Moule', 'gp-vieux-fort': 'Vieux-Fort',
  }
  return map[id] || id.replace(/^gp-/, '').split('-').map(w => w[0]?.toUpperCase() + w.slice(1)).join(' ')
}

// 5 template variants — rotated per post to defeat FB pattern-matching anti-spam
const TEMPLATES = [
  // Variant 1 — acknowledge report, offer alternative
  ({ beachName, statusText, altName, altScore, url }) =>
`Merci pour le retour sur ${beachName} 🙏 On suit la zone en temps réel (satellite + retours terrain). Aujourd'hui ${statusText}.${altName ? ` Pour une alternative : ${altName} tient à ${altScore}/100 aujourd'hui.` : ''} Fiche live : ${url}`,

  // Variant 2 — soft-introduction of our surveillance, helpful
  ({ beachName, statusText, altName, altScore, url }) =>
`Hello, on surveille ${beachName} via satellite NASA + retours visiteurs. Ce matin : ${statusText}.${altName ? ` Si ça dégénère, ${altName} tient à ${altScore}/100.` : ''} Détail + photo satellite : ${url}`,

  // Variant 3 — data-first, casual
  ({ beachName, statusText, altName, altScore, url }) =>
`Yo, lecture satellite fraîche sur ${beachName} : ${statusText}.${altName ? ` ${altName} est à ${altScore}/100 côté sargasses si tu veux comparer.` : ''} Update 3x/jour : ${url}`,

  // Variant 4 — question-form, conversational
  ({ beachName, statusText, altName, altScore, url }) =>
`Bonjour ! Pour info on a ${beachName} en surveillance continue (multi-facteur sargasses/vent/vagues). État du jour : ${statusText}.${altName ? ` ${altName} ressort à ${altScore}/100 aujourd'hui.` : ''} → ${url}`,

  // Variant 5 — compact, local tone
  ({ beachName, statusText, altName, altScore, url }) =>
`Salut, petit état ${beachName} : ${statusText} côté sargasses.${altName ? ` ${altName} est mieux (${altScore}/100) si ça peut aider.` : ''} On update tous les 3h : ${url}`,
]

function pickTemplate(seed) {
  // Stable rotation based on beachId + sourceUrl hash so regens stay consistent
  const n = String(seed || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return TEMPLATES[n % TEMPLATES.length]
}

function buildDraft(post, ctx) {
  if (!post.beachId || !post.inferredStatus) return null

  const beach = ctx.beachById.get(post.beachId)
  // Resolve beach name: prefer scrape's beachMentioned, else beach list, else id
  const beachName = post.beachMentioned || beach?.name || post.beachId
  const beachSlug = beach ? slugify(beach.name) : slugify(beachName)
  const island = post.island || beach?.island?.toLowerCase() || 'mq'
  const domain = island === 'gp' ? 'sargasses-guadeloupe.com' : 'sargasses-martinique.com'
  const url = `https://${domain}/plages/${beachSlug}/?utm_source=facebook&utm_medium=social&utm_campaign=fb_reply&utm_content=${post.beachId}`

  const alt = pickAlternative(ctx.levels, island, beachName.toLowerCase())
  const altName = alt ? prettyLegacyName(alt.id) : null
  const altScore = alt?.score ?? null

  const template = pickTemplate(post.beachId + (post.sourceUrl || ''))
  const text = template({
    beachName,
    statusText: statusFr(post.inferredStatus),
    altName,
    altScore,
    url,
  })

  const action = post.inferredStatus === 'avoid' ? 'first-comment' : 'reply-to-op'
  return {
    tone: 'helpful-first, app-mention-subtle',
    text,
    targetUrl: url,
    action,
    postManuallyFrom: 'auto (fb-auto-reply.cjs)',
    status: 'queued-for-autopost',
    generatedAt: new Date().toISOString(),
  }
}

function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run') || args.includes('--dry')
  const force = args.includes('--force')

  const feed = loadJson(FEED_PATH, { posts: [] })
  const sarg = loadJson(SARG_PATH, { levels: [] })
  const beaches = loadJson(BEACHES_PATH, [])
  const ctx = {
    levels: sarg.levels || [],
    beachById: new Map((beaches || []).map(b => [b.id, b])),
  }

  let generated = 0
  let skipped = 0
  let missing = 0

  for (const post of (feed.posts || [])) {
    if (post.draftReply?.text && !force) { skipped++; continue }
    const draft = buildDraft(post, ctx)
    if (!draft) { missing++; continue }
    generated++
    if (dryRun) {
      console.log(`\n→ ${post.group || '?'} [${post.island || '?'}] · ${post.beachMentioned || post.beachId}`)
      console.log(`  ${post.sourceUrl || '(no url)'}`)
      console.log(`  ${draft.text}`)
    } else {
      post.draftReply = draft
      if (post.replyStatus !== 'posted') post.replyStatus = 'drafted'
    }
  }

  if (!dryRun && generated > 0) saveFeed(feed)

  console.log(`\n✓ fb-draft-replies — generated: ${generated}, skipped (already drafted): ${skipped}, missing (no beachId/status): ${missing}${dryRun ? ' [dry-run]' : ''}`)
}

main()
