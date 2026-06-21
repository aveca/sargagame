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

// Translate internal status to human French. 'clean' is intentionally hedged
// ("rien de marquant au satellite") rather than a flat "propre": several tracked
// beaches read clean at modest scores (53-61), and the satellite sees offshore
// rafts, not weed already on the sand — never sell a clean read as a guarantee.
function statusFr(s) {
  if (s === 'clean') return 'rien de marquant au satellite'
  if (s === 'moderate') return 'modéré'
  // worst tiers — kept monotonic (no tier reads milder than a lesser one)
  if (s === 'high' || s === 'avoid' || s === 'alert') return 'bien présent'
  return 'à confirmer'
}

// Accepted EXACT normalized names per TRACKED beach (the 20 in sargassum.json),
// island-scoped. A draft may assert a satellite condition ONLY when the post's
// beach name normalizes to one of these EXACT strings — equality, NOT substring.
// This is deliberate: substring/keyword matching leaked badly (kw 'marin' matched
// "Le Marin"/"marina"; 'arlet' matched "Petite Anse d'Arlet"; 'gosier' matched
// "Gosierville"; commune tokens mis-attributed distinct beaches). The safe default
// is "no exact match → untracked → honest template". Add real synonyms here as
// needed; err toward leaving a beach OUT (honest) rather than risk a false read.
const TRACKED_NAMES = {
  'grande-anse': { island: 'mq', names: ['grande anse d arlet', 'grande anse darlet', 'grande anse des arlets'] },
  'anse-mitan': { island: 'mq', names: ['anse mitan', 'anse a mitan'] },
  'anse-noire': { island: 'mq', names: ['anse noire'] },
  'tartane': { island: 'mq', names: ['tartane', 'plage de tartane'] },
  'anse-madame': { island: 'mq', names: ['anse madame'] },
  'diamant': { island: 'mq', names: ['diamant', 'le diamant', 'plage du diamant'] },
  'pt-marin': { island: 'mq', names: ['pointe marin', 'pte marin', 'plage de pointe marin'] },
  'sainte-anne': { island: 'mq', names: ['sainte anne', 'plage de sainte anne'] },
  'les-salines': { island: 'mq', names: ['les salines', 'salines', 'plage des salines'] },
  'vauclin': { island: 'mq', names: ['vauclin', 'le vauclin', 'plage du vauclin'] },
  'gp-grande-anse': { island: 'gp', names: ['grande anse trois rivieres', 'grande anse de trois rivieres'] },
  'gp-malendure': { island: 'gp', names: ['malendure', 'plage de malendure'] },
  'gp-sainte-anne': { island: 'gp', names: ['sainte anne', 'plage de sainte anne'] },
  'gp-pt-chateaux': { island: 'gp', names: ['pointe des chateaux', 'pointe chateaux'] },
  'gp-gosier': { island: 'gp', names: ['gosier', 'le gosier', 'plage du gosier'] },
  'gp-caravelle': { island: 'gp', names: ['caravelle', 'la caravelle', 'plage de la caravelle'] },
  'gp-bas-du-fort': { island: 'gp', names: ['bas du fort', 'plage de bas du fort'] },
  'gp-deshaies': { island: 'gp', names: ['deshaies', 'grande anse deshaies', 'plage de deshaies'] },
  'gp-moule': { island: 'gp', names: ['moule', 'le moule', 'plage du moule'] },
  'gp-vieux-fort': { island: 'gp', names: ['vieux fort', 'plage de vieux fort'] },
}

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

// Resolve a post's beach to a REAL satellite reading, or null if untracked.
// ctx.reading: Map legacyId → { status, score }. Island-scoped EXACT-name match.
// Returns null (→ honest template) unless we genuinely track the beach.
function resolveReading(beachName, island, ctx) {
  const n = norm(beachName)
  if (!n) return null
  for (const [legacyId, meta] of Object.entries(TRACKED_NAMES)) {
    if (meta.island !== island) continue
    if (meta.names.includes(n)) {
      const lv = ctx.reading.get(legacyId)
      if (lv) return { legacyId, status: lv.status, score: lv.score, name: prettyLegacyName(legacyId) }
    }
  }
  return null
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

// TRACKED templates — used ONLY when the beach has a real satellite reading
// in sargassum.json (resolveReading != null). 5 variants rotated per post to
// defeat FB pattern-matching anti-spam. statusText/score come from OUR data.
const TEMPLATES_TRACKED = [
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

// HONEST templates — used when the beach is NOT in our satellite data (the
// common case: small/sheltered/islet spots = satellite blind-spot). NEVER assert
// a condition we can't see. Acknowledge the limit, defer to on-the-ground report,
// offer a real (data-backed) alternative when available, link the live bulletin.
const TEMPLATES_HONEST = [
  ({ beachName, altName, altScore, url }) =>
`Hello ! Franchement, ${beachName} ne fait pas partie des plages qu'on suit au satellite au jour le jour (on en suit une vingtaine) — donc pour CE coin précis, l'avis des gens sur place vaut plus que notre lecture.${altName ? ` Côté plages qu'on suit, ${altName} ressort à ${altScore}/100 aujourd'hui.` : ''} Le bulletin jour par jour 👉 ${url}`,

  ({ beachName, altName, altScore, url }) =>
`Salut ! On joue franc-jeu : pas de lecture satellite à jour pile sur ${beachName} (elle n'est pas dans la vingtaine de plages qu'on suit). Le mieux = une photo récente de quelqu'un sur place.${altName ? ` Pour comparer, ${altName} est à ${altScore}/100 côté sargasses.` : ''} Les plages suivies : ${url}`,

  ({ beachName, altName, altScore, url }) =>
`Coucou, pour ${beachName} je préfère être honnête : on ne la suit pas au satellite, donc ton ressenti sur place prime.${altName ? ` Si tu veux un plan B suivi de près : ${altName} (${altScore}/100).` : ''} On met à jour les plages suivies 3x/j : ${url}`,

  ({ beachName, altName, altScore, url }) =>
`Hello ! ${beachName} n'est pas dans nos plages suivies au satellite — donc pas de chiffre inventé de notre part.${altName ? ` En revanche ${altName} tient à ${altScore}/100 aujourd'hui si ça aide.` : ''} Le tracker + bulletin : ${url}`,

  ({ beachName, altName, altScore, url }) =>
`Bonjour ! On reste réglo : on ne suit pas ${beachName} au satellite, l'info des gens sur place est la meilleure source ici.${altName ? ` Pour une plage qu'on suit et qui tient : ${altName} (${altScore}/100).` : ''} Tout est ici : ${url}`,
]

// ARRIVAL templates — tracked beach where OUR satellite reads clean but the post
// reports an arrival/échouage. Satellite sees offshore rafts, NOT weed already on
// the sand → defer to the ground report, NEVER contradict it with "propre".
// Aligns with doctrine: own our arrival-detection weak spot (cf. /fiabilite).
const TEMPLATES_ARRIVAL = [
  ({ beachName, altName, altScore, url }) =>
`Merci pour le signalement sur ${beachName} 🙏 Franc-jeu : notre satellite voit les bancs au large, pas le sargasse déjà échoué sur le sable — donc ton retour terrain prime ici.${altName ? ` Si tu cherches une plage qui tient aujourd'hui : ${altName} (${altScore}/100).` : ''} Suivi jour par jour 👉 ${url}`,

  ({ beachName, altName, altScore, url }) =>
`Aïe, merci pour l'info sur ${beachName}. On l'assume : sur l'échoué fraîchement arrivé le satellite est en retard, c'est le terrain qui a raison.${altName ? ` Pour se rabattre aujourd'hui : ${altName} (${altScore}/100) côté plages qu'on suit.` : ''} Bulletin live : ${url}`,

  ({ beachName, altName, altScore, url }) =>
`Bien noté pour ${beachName} 🙏 Notre point faible assumé = détecter l'arrivage au ras du sable (le satellite voit le large). Ton signalement vaut de l'or.${altName ? ` Plan B qui tient : ${altName} (${altScore}/100).` : ''} Tout est ici : ${url}`,
]

function pickTemplate(arr, seed) {
  // Stable rotation based on beachId + sourceUrl hash so regens stay consistent
  const n = String(seed || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return arr[n % arr.length]
}

function buildDraft(post, ctx) {
  if (!post.beachId || !post.inferredStatus) return null

  const beach = ctx.beachById.get(post.beachId)
  // Resolve beach name: prefer scrape's beachMentioned, else beach list, else id
  const beachName = post.beachMentioned || beach?.name || post.beachId
  const island = (post.island || beach?.island || (String(post.beachId).startsWith('gp') ? 'gp' : 'mq')).toLowerCase()
  const domain = island === 'gp' ? 'sargasses-guadeloupe.com' : 'sargasses-martinique.com'
  const utm = `utm_source=facebook&utm_medium=social&utm_campaign=fb_reply&utm_content=${post.beachId}`
  // Always link the region root: it is always live, and the /plages/<slug>/ deep
  // links built from the name don't match the SEO slugs (they 404). The reply text
  // already names the beach + status; the homepage IS the live tracker.
  const url = `https://${domain}/?${utm}`

  // THE GATE: a satellite condition may only be asserted for a beach we genuinely
  // track in sargassum.json. resolveReading returns null otherwise → honest path.
  const reading = resolveReading(beachName, island, ctx)
  // Any ground report HEAVIER than our satellite's clean read (arrival/échouage,
  // or even "moderate") must defer to the terrain — never contradict with a clean
  // assertion (satellite sees offshore rafts, not weed already on the sand).
  const opSeesMore = ['avoid', 'alert', 'moderate'].includes(post.inferredStatus)

  // Alternative must be a DIFFERENT beach than the one in question.
  const alt = pickAlternative(ctx.levels, island, beachName.toLowerCase())
  const altName = alt && (!reading || alt.id !== reading.legacyId) ? prettyLegacyName(alt.id) : null
  const altScore = altName ? alt.score : null

  let text, action, gate
  if (reading && !(opSeesMore && reading.status === 'clean')) {
    // TRACKED — assert OUR satellite status (true, we genuinely track this beach)
    text = pickTemplate(TEMPLATES_TRACKED, post.beachId + (post.sourceUrl || ''))(
      { beachName, statusText: statusFr(reading.status), altName, altScore, url })
    action = (reading.status === 'avoid' || reading.status === 'alert') ? 'first-comment' : 'reply-to-op'
    gate = 'tracked'
  } else if (reading && opSeesMore) {
    // TRACKED but the report is heavier than our clean read → defer, don't contradict
    text = pickTemplate(TEMPLATES_ARRIVAL, post.beachId + (post.sourceUrl || ''))(
      { beachName, altName, altScore, url })
    action = 'reply-to-op'
    gate = 'tracked-arrival-honest'
  } else {
    // UNTRACKED — never fabricate a condition; honest "not in our tracked set" template
    text = pickTemplate(TEMPLATES_HONEST, (post.beachId || beachName) + (post.sourceUrl || ''))(
      { beachName, altName, altScore, url })
    action = 'reply-to-op'
    gate = 'untracked-honest'
  }

  return {
    tone: 'helpful-first, honesty-gated',
    text,
    targetUrl: url,
    action,
    honestyGate: gate,
    verified: { trackedBeach: !!reading, reading: reading ? { legacyId: reading.legacyId, status: reading.status, score: reading.score } : null },
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
    // legacyId → real satellite reading; sole source for asserting a condition
    reading: new Map((sarg.levels || []).map(l => [l.id, { status: l.status, score: l.score }])),
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

if (require.main === module) main()

module.exports = { buildDraft, resolveReading, statusFr, TRACKED_NAMES }
