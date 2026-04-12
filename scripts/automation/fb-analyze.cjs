#!/usr/bin/env node
/**
 * fb-analyze.cjs — Turn raw fb-feed.json into actionable signals.
 *
 * Reads:  scripts/automation/data/fb-feed.json (from fb-scrape.cjs)
 *         public/data/beaches-list.json
 * Writes: scripts/automation/data/fb-signals.json (structured output)
 *
 * Three signal types emitted:
 *   1. content_gap — beaches mentioned in posts but NOT in our DB
 *      (add to beaches-list.json → create SEO page → capture traffic)
 *   2. community_signal — per-beach status reports aggregated from
 *      post text + comments (feeds community-reports system)
 *   3. seo_intent — real user questions we can answer with content pages
 *      (e.g. "comment c'est à Petite Terre" → FAQ schema + H2)
 *
 * Run: node scripts/automation/fb-analyze.cjs
 *
 * Why not merge with fb-scrape: scrape is interactive (needs user login,
 * can't CI), analyze is pure data transformation (runs anywhere, testable).
 */
const fs = require('fs')
const path = require('path')

const FEED_PATH = path.join(__dirname, 'data', 'fb-feed.json')
const BEACHES_PATH = path.join(__dirname, '..', '..', 'public', 'data', 'beaches-list.json')
const OUT_PATH = path.join(__dirname, 'data', 'fb-signals.json')

function loadJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')) }
  catch { return fallback }
}

function normalize(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Known beach name tokens → we try to match these in post text
function beachIndex(beaches) {
  const byToken = new Map()
  for (const b of beaches) {
    const nameTokens = normalize(b.name).split(' ').filter(t => t.length >= 4)
    const communeTokens = normalize(b.commune || '').split(' ').filter(t => t.length >= 4)
    for (const t of [...nameTokens, ...communeTokens]) {
      if (!byToken.has(t)) byToken.set(t, [])
      byToken.get(t).push(b)
    }
  }
  return byToken
}

// Extract beach mentions from text — returns candidate beaches + match strength
function findBeachMatches(text, index, island) {
  const tokens = normalize(text).split(' ')
  const scores = new Map()
  for (const t of tokens) {
    if (t.length < 4) continue
    const candidates = index.get(t) || []
    for (const b of candidates) {
      if (b.island !== island) continue
      scores.set(b.id, (scores.get(b.id) || 0) + 1)
    }
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id, score]) => ({ id, score }))
}

// Infer status from free text — same heuristics as fb-scrape but stronger
function inferStatus(text) {
  const l = normalize(text)
  const avoid = /(beaucoup|epais|couverte|recouverte|infeste|pourri|pue|puanteur|gratouille|marcher dessus|impossible)/.test(l)
  const clean = /(propre|nickel|aucune|pas de sargasse|zero sargasse|clean|vide|rien)/.test(l)
  const moderate = /(un peu|bande|petite|quelques|moyennement|modere)/.test(l)
  if (avoid) return 'avoid'
  if (clean) return 'clean'
  if (moderate) return 'moderate'
  return null
}

// Extract question-form sentences (SEO intent signals).
// Split on ? first so we keep the question mark with the question, then
// also match sentences containing question words (handles "Bonsoir, comment...").
function extractQuestions(text) {
  if (!text) return []
  // Keep the ? attached to the sentence that had it
  const parts = text.split(/([?!])/).reduce((acc, piece, i, arr) => {
    if (/^[?!]$/.test(piece)) return acc
    const punct = arr[i + 1] && /^[?!]$/.test(arr[i + 1]) ? arr[i + 1] : ''
    if (piece.trim()) acc.push((piece + punct).trim())
    return acc
  }, [])
  // Also split on . and \n for free-form paragraphs
  const sentences = parts.flatMap(p => p.split(/[.\n]/)).map(s => s.trim()).filter(s => s.length > 10)
  const qWord = /\b(comment|qui|quoi|ou|quand|pourquoi|est-ce|quelqu'?un|y a-t-il|est-ce que|quel|quelle|quels|quelles|d'infos|retour|avis)\b/i
  return sentences.filter(s => /\?$/.test(s) || qWord.test(normalize(s)))
}

function analyze() {
  const feed = loadJson(FEED_PATH, { posts: [] })
  const beaches = loadJson(BEACHES_PATH, [])
  const index = beachIndex(beaches)
  const beachById = new Map(beaches.map(b => [b.id, b]))

  const contentGaps = []          // beaches mentioned but not in DB
  const communitySignals = new Map() // beachId → {avoid, moderate, clean, total, samples}
  const seoIntents = []           // user questions we could answer

  for (const post of (feed.posts || [])) {
    // Combine post text + comments into one analysis blob
    const allText = [
      post.question || post.postText || '',
      ...(post.comments || []).map(c => c.text || '')
    ].join(' | ')

    // 1. Content gap detection
    // If post.beachId exists but is not in beaches-list.json → gap
    if (post.beachId && !beachById.has(post.beachId)) {
      contentGaps.push({
        suggestedId: post.beachId,
        name: post.beachMentioned || '?',
        island: post.island,
        sourcePost: post.sourceUrl,
        evidence: (post.question || post.postText || '').slice(0, 140),
      })
    }

    // 2. Community signal — accumulate by beach
    if (post.beachId && beachById.has(post.beachId)) {
      const status = post.inferredStatus || inferStatus(allText)
      if (status) {
        if (!communitySignals.has(post.beachId)) {
          communitySignals.set(post.beachId, { avoid: 0, moderate: 0, clean: 0, total: 0, samples: [] })
        }
        const bucket = communitySignals.get(post.beachId)
        bucket[status] = (bucket[status] || 0) + 1
        bucket.total++
        if (bucket.samples.length < 3) {
          bucket.samples.push({
            text: (post.question || post.postText || '').slice(0, 120),
            date: post.scrapedAt,
            source: 'facebook',
          })
        }
      }

      // Also mine comments for status signals
      for (const c of (post.comments || [])) {
        if (!c.signal) continue
        const mapped = c.signal === 'low' ? 'clean'
          : c.signal === 'low-to-moderate' ? 'moderate'
          : c.signal === 'moderate' ? 'moderate'
          : c.signal === 'high' ? 'avoid'
          : null
        if (!mapped) continue
        if (!communitySignals.has(post.beachId)) {
          communitySignals.set(post.beachId, { avoid: 0, moderate: 0, clean: 0, total: 0, samples: [] })
        }
        const bucket = communitySignals.get(post.beachId)
        bucket[mapped]++
        bucket.total++
      }
    }

    // 3. SEO intent — extract questions from post text
    const questions = extractQuestions(post.question || post.postText || '')
    for (const q of questions) {
      seoIntents.push({
        question: q,
        island: post.island,
        beachMentioned: post.beachMentioned || null,
        sourcePost: post.sourceUrl,
      })
    }
  }

  const output = {
    _generatedAt: new Date().toISOString(),
    _sourcePosts: (feed.posts || []).length,
    summary: {
      contentGapsFound: contentGaps.length,
      beachesWithCommunitySignal: communitySignals.size,
      seoIntentsExtracted: seoIntents.length,
    },
    contentGaps,
    communitySignals: Object.fromEntries(communitySignals),
    seoIntents,
  }

  if (!fs.existsSync(path.dirname(OUT_PATH))) fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true })
  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2), 'utf-8')

  console.log(`✓ Analyzed ${output._sourcePosts} FB posts`)
  console.log(`  Content gaps: ${output.summary.contentGapsFound}`)
  console.log(`  Community signals: ${output.summary.beachesWithCommunitySignal} beaches`)
  console.log(`  SEO intents: ${output.summary.seoIntentsExtracted}`)
  console.log(`  Output: ${OUT_PATH}`)

  if (contentGaps.length) {
    console.log('\nTop content gaps:')
    contentGaps.slice(0, 5).forEach(g => console.log(`  • ${g.name} (${g.island}) — ${g.evidence.slice(0, 80)}...`))
  }
}

try { analyze() }
catch (e) { console.error('fb-analyze error:', e.message); process.exit(1) }
