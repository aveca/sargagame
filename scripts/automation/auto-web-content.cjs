#!/usr/bin/env node
/**
 * auto-web-content.cjs — Scrape web + generate SEO articles via Claude API
 *
 * Pipeline:
 *   1. Scrape Google News RSS for "sargasses martinique/guadeloupe"
 *   2. Read current satellite AFAI data
 *   3. Call Claude (haiku) to generate a fresh SEO article
 *   4. Write standalone HTML article page to public/articles/
 *   5. Update articles index JSON
 *
 * Cron: 3x/semaine (Lun, Mer, Ven) via content-generation.yml
 * Cost: ~$0.01-0.03 par run (haiku, 800 tokens output)
 *
 * Usage:
 *   node scripts/automation/auto-web-content.cjs
 *   DRY_RUN=1 node scripts/automation/auto-web-content.cjs
 */
'use strict'

const { readFileSync, writeFileSync, existsSync, mkdirSync } = require('fs')
const { resolve } = require('path')
const { appendLog } = require('./lib/safety.cjs')

const DRY_RUN = process.env.DRY_RUN === '1'
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

const ROOT = resolve(__dirname, '..', '..')
const SARGASSUM_JSON = resolve(ROOT, 'public', 'api', 'copernicus', 'sargassum.json')
const ARTICLES_DIR = resolve(ROOT, 'public', 'articles')
const INDEX_PATH = resolve(ARTICLES_DIR, 'index.json')

const SITES = {
  mq: { domain: 'sargasses-martinique.com', island: 'Martinique', appUrl: 'https://sargasses-martinique.com/' },
  gp: { domain: 'sargasses-guadeloupe.com', island: 'Guadeloupe', appUrl: 'https://sargasses-guadeloupe.com/' },
}

// Article types — rotate by day of week
const ARTICLE_TYPES = [
  'point-hebdo',      // situation report cette semaine
  'guide-quand',      // quand partir sans sargasses ce mois-ci
  'alerte-saison',    // alerte saison 2026
  'plages-propres',   // quelles plages sont propres maintenant
  'comparatif',       // côte atlantique vs caraïbe
]

// ─── Helpers ──────────────────────────────────────────────────

function slugify(str) {
  return str.toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function frDate(d = new Date()) {
  const months = ['janvier','février','mars','avril','mai','juin',
                  'juillet','août','septembre','octobre','novembre','décembre']
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
}

function readJSON(p) {
  if (!existsSync(p)) return null
  try { return JSON.parse(readFileSync(p, 'utf-8')) } catch { return null }
}

function writeJSON(p, data) {
  mkdirSync(resolve(p, '..'), { recursive: true })
  writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8')
}

// ─── Step 1: Scrape Google News RSS ───────────────────────────

async function scrapeNews(query) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=fr&gl=FR&ceid=FR:fr`
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SargassesBot/1.0)' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return []
    const xml = await res.text()
    // Extract <title> and <pubDate> from RSS items (skip channel title)
    const items = []
    const itemRegex = /<item>([\s\S]*?)<\/item>/g
    let match
    while ((match = itemRegex.exec(xml)) !== null && items.length < 5) {
      const item = match[1]
      const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || item.match(/<title>(.*?)<\/title>/)
      const dateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/)
      if (titleMatch) {
        items.push({
          title: titleMatch[1].replace(/ - [^-]+$/, '').trim(), // strip source name
          date: dateMatch ? dateMatch[1] : '',
        })
      }
    }
    return items
  } catch (e) {
    console.warn(`  News scrape failed for "${query}": ${e.message}`)
    return []
  }
}

// ─── Step 2: Read current AFAI data ───────────────────────────

function readSargassumData() {
  const data = readJSON(SARGASSUM_JSON)
  if (!data || !data.beaches) return null

  const beaches = data.beaches
  const clean = beaches.filter(b => b.status === 'clean').length
  const moderate = beaches.filter(b => b.status === 'moderate').length
  const avoid = beaches.filter(b => b.status === 'avoid').length
  const total = beaches.length

  // Find cleanest and worst beaches
  const byAfai = [...beaches].sort((a, b) => a.afai - b.afai)
  const cleanest = byAfai.slice(0, 3).map(b => b.name).filter(Boolean)
  const worst = byAfai.slice(-3).reverse().map(b => b.name).filter(Boolean)

  return {
    updatedAt: data.updatedAt,
    total,
    clean,
    moderate,
    avoid,
    cleanPct: Math.round(clean / total * 100),
    cleanest,
    worst,
    season: getSeason(),
  }
}

function getSeason() {
  const m = new Date().getMonth() + 1 // 1-12
  if (m >= 6 && m <= 9) return 'pic'
  if (m >= 4 && m <= 5) return 'montée'
  if (m >= 10 && m <= 11) return 'fin'
  return 'basse'
}

// ─── Step 3: Generate article via Claude API ───────────────────

async function generateArticle(islandKey, articleType, news, sargData) {
  if (!ANTHROPIC_API_KEY) {
    console.warn('  ANTHROPIC_API_KEY not set — skipping AI generation')
    return null
  }

  const { island, domain, appUrl } = SITES[islandKey]
  const today = frDate()
  const year = new Date().getFullYear()
  const month = frDate().split(' ')[1] // "avril"
  const newsHeadlines = news.map(n => `- "${n.title}"`).join('\n') || '(aucune actualité récente trouvée)'

  const statsBlock = sargData
    ? `Données satellite du ${frDate(new Date(sargData.updatedAt))} :
- ${sargData.clean}/${sargData.total} plages propres (${sargData.cleanPct}%)
- ${sargData.moderate} modérées, ${sargData.avoid} à éviter
- Saison actuelle : ${sargData.season}
- Plages les plus propres : ${sargData.cleanest.join(', ')}
- Plages les plus touchées : ${sargData.worst.join(', ')}`
    : `(données satellite indisponibles — utiliser les tendances générales de saison)`

  const typeInstructions = {
    'point-hebdo': `Écris un article "Point sargasses ${island} — semaine du ${today}" : situation actuelle, évolution par rapport aux semaines précédentes, quelles zones sont touchées, conseil pratique pour la semaine.`,
    'guide-quand': `Écris un guide "Quand partir en ${island} sans sargasses — ${month} ${year}" : calendrier des mois favorables, explication du cycle saisonnier, recommandations pour ${month}, lien avec les données actuelles.`,
    'alerte-saison': `Écris un article d'alerte "Sargasses ${island} ${year} : ce qu'il faut savoir pour cet été" : pourquoi 2026 est une année exceptionnelle, quelles zones protéger, comment suivre l'évolution en temps réel.`,
    'plages-propres': `Écris un article "Plages sans sargasses en ${island} aujourd'hui ${today}" : liste des zones actuellement propres, explique pourquoi ces plages sont épargnées (géographie, courants), conseils pour vérifier avant de partir.`,
    'comparatif': `Écris un article "Côte caraïbe vs côte atlantique en ${island} : où fuir les sargasses ?" : comparaison des deux côtes, données AFAI, recommandations pratiques, carte mentale des zones.`,
  }

  const prompt = typeInstructions[articleType] || typeInstructions['point-hebdo']

  const systemPrompt = `Tu es un expert en sargasses dans les Caraïbes, rédacteur SEO pour sargasses-${islandKey === 'mq' ? 'martinique' : 'guadeloupe'}.com.
Tu écris des articles en français, informatifs, basés sur des données réelles satellite (indice AFAI).
Style : direct, utile, expert. Pas de bla-bla marketing. Phrases courtes.
Structure requise : H2 toutes les 150-200 mots, max 4 H2. Total : 450-600 mots.
Mots-clés à inclure naturellement : "en temps réel", "aujourd'hui", "${island}", "carte sargasses", "plage propre".
L'article doit apporter une vraie valeur : données chiffrées, conseils actionnables, comparaisons.
Format de sortie : JSON uniquement, avec les champs title, h1, meta_description, content_html, slug_suffix.
- title : 50-60 caractères, accrocheur, keyword-first
- h1 : différent du title, plus long, conversationnel
- meta_description : 140-155 caractères, inclut "aujourd'hui" et le nom de l'île
- content_html : HTML avec <h2>, <p>, <ul>/<li> (pas de <h1>, pas de balises externes)
- slug_suffix : 3-4 mots en français slugifiés (ex: "point-semaine-avril-2026")`

  const userPrompt = `${prompt}

Actualités récentes sur le sujet :
${newsHeadlines}

${statsBlock}

Date de publication : ${today}
Domaine : ${domain}

Réponds uniquement avec le JSON demandé, sans markdown ni code block.`

  try {
    const Anthropic = require('@anthropic-ai/sdk')
    const client = new Anthropic.default({ apiKey: ANTHROPIC_API_KEY })

    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      messages: [{ role: 'user', content: userPrompt }],
      system: systemPrompt,
    })

    const raw = msg.content[0].text.trim()
    // Strip markdown code blocks if present
    const jsonStr = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim()
    return JSON.parse(jsonStr)
  } catch (e) {
    console.error(`  Claude API error: ${e.message}`)
    return null
  }
}

// ─── Step 4: Generate HTML article page ───────────────────────

function generateHTML(article, islandKey, slug) {
  const { domain, island, appUrl } = SITES[islandKey]
  const today = frDate()
  const isoDate = new Date().toISOString().slice(0, 10)
  const canonicalUrl = `https://${domain}/articles/${slug}/`

  const schema = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.meta_description,
    datePublished: isoDate,
    dateModified: isoDate,
    author: { '@type': 'Organization', name: `Sargasses ${island}`, url: appUrl },
    publisher: { '@type': 'Organization', name: `Sargasses ${island}`, url: appUrl },
    url: canonicalUrl,
    inLanguage: 'fr',
    about: { '@type': 'Thing', name: 'Sargasses' },
  })

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${article.title}</title>
  <meta name="description" content="${article.meta_description}">
  <link rel="canonical" href="${canonicalUrl}">
  <meta property="og:title" content="${article.title}">
  <meta property="og:description" content="${article.meta_description}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="article:published_time" content="${isoDate}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700&family=Anton&display=swap" rel="stylesheet">
  <script type="application/ld+json">${schema}</script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0 }
    :root {
      --bg: #FDFCF7; --ink: #0D0D0D; --mid: #686868; --teal: #009E8E;
      --gold: #E8A800; --goldL: #FFC72C; --green: #22C55E;
    }
    body { font-family: 'Bricolage Grotesque', sans-serif; background: var(--bg); color: var(--ink); font-size: 17px; line-height: 1.65 }
    header { background: var(--ink); padding: 14px 24px; display: flex; align-items: center; gap: 12px }
    header a { color: #fff; text-decoration: none; font-family: Anton, sans-serif; font-size: 20px; letter-spacing: -.02em }
    header span { color: var(--gold); }
    nav-back { display: block }
    .back-link { color: rgba(255,255,255,.6); font-size: 13px; text-decoration: none; margin-left: auto }
    .back-link:hover { color: var(--goldL) }
    main { max-width: 760px; margin: 0 auto; padding: 40px 20px 80px }
    .meta { color: var(--mid); font-size: 13px; margin-bottom: 32px; display: flex; gap: 16px; align-items: center }
    .badge { background: var(--teal); color: #fff; border-radius: 100px; padding: 2px 10px; font-size: 12px; font-weight: 600 }
    h1 { font-family: Anton, sans-serif; font-size: clamp(26px, 5vw, 40px); line-height: 1.1; letter-spacing: -.02em; margin-bottom: 16px; text-transform: uppercase }
    .content h2 { font-family: Anton, sans-serif; font-size: 20px; letter-spacing: -.01em; text-transform: uppercase; margin: 36px 0 12px; color: var(--ink) }
    .content p { margin-bottom: 16px; color: var(--ink) }
    .content ul { margin: 0 0 16px 20px }
    .content li { margin-bottom: 6px }
    .content strong { font-weight: 700 }
    .cta-box { background: linear-gradient(145deg, #0D1E1C, #0A1714); border-radius: 18px; padding: 28px 24px; margin-top: 48px; text-align: center }
    .cta-box p { color: rgba(255,255,255,.75); font-size: 15px; margin-bottom: 20px }
    .cta-box h3 { color: #fff; font-family: Anton, sans-serif; font-size: 22px; letter-spacing: -.02em; text-transform: uppercase; margin-bottom: 8px }
    .cta-btn { display: inline-block; padding: 14px 32px; border-radius: 100px; font-weight: 700; font-size: 16px; text-decoration: none; color: var(--ink); background: linear-gradient(158deg, #FFE47A 0%, #FFC72C 40%, #E89400 100%); transition: transform .15s }
    .cta-btn:hover { transform: scale(1.03) }
    footer { text-align: center; padding: 24px; color: var(--mid); font-size: 13px; border-top: 1px solid rgba(0,0,0,.06) }
    footer a { color: var(--teal); text-decoration: none }
  </style>
</head>
<body>
  <header>
    <a href="${appUrl}">Sargasses <span>${island}</span></a>
    <a class="back-link" href="${appUrl}">← Voir la carte en temps réel</a>
  </header>
  <main>
    <div class="meta">
      <span class="badge">Sargasses ${island}</span>
      <time datetime="${isoDate}">Publié le ${today}</time>
    </div>
    <h1>${article.h1}</h1>
    <div class="content">
      ${article.content_html}
    </div>
    <div class="cta-box">
      <h3>Vérifiez votre plage avant de partir</h3>
      <p>Carte satellite mise à jour 4 fois par jour — 135 plages en ${island}</p>
      <a class="cta-btn" href="${appUrl}">Voir la carte en temps réel →</a>
    </div>
  </main>
  <footer>
    <p>Source : données satellite Copernicus Marine — <a href="${appUrl}">${domain}</a></p>
  </footer>
</body>
</html>`
}

// ─── Step 5: Update articles index ────────────────────────────

function updateIndex(slug, article, islandKey) {
  const existing = readJSON(INDEX_PATH) || { articles: [] }
  const existing_articles = existing.articles || []

  // Remove old entry with same slug if exists
  const filtered = existing_articles.filter(a => a.slug !== slug)

  filtered.unshift({
    slug,
    island: islandKey,
    title: article.title,
    meta: article.meta_description,
    date: new Date().toISOString().slice(0, 10),
    url: `https://${SITES[islandKey].domain}/articles/${slug}/`,
  })

  // Keep max 50 articles in index
  const trimmed = filtered.slice(0, 50)
  writeJSON(INDEX_PATH, { updatedAt: new Date().toISOString(), articles: trimmed })
}

// ─── Main ─────────────────────────────────────────────────────

async function main() {
  console.log(`=== Auto-Web-Content ${DRY_RUN ? '(DRY RUN)' : ''} ===`)
  console.log(`Timestamp: ${new Date().toISOString()}\n`)

  if (!ANTHROPIC_API_KEY && !DRY_RUN) {
    console.error('ANTHROPIC_API_KEY not set. Set it as a GitHub Actions secret.')
    process.exit(0) // Exit 0 to not break the pipeline
  }

  // Pick island and article type based on day of week
  const dayOfWeek = new Date().getDay() // 0=Sun, 1=Mon...
  const islandKeys = ['gp', 'mq', 'gp', 'mq', 'gp', 'mq', 'gp']
  const islandKey = islandKeys[dayOfWeek]
  const typeIdx = Math.floor(Date.now() / (1000 * 60 * 60 * 24 * 2)) % ARTICLE_TYPES.length
  const articleType = ARTICLE_TYPES[typeIdx]

  const { island } = SITES[islandKey]
  console.log(`Island: ${island} | Type: ${articleType}\n`)

  // Step 1: Scrape news
  console.log('--- Step 1: Scraping news ---')
  const news = await scrapeNews(`sargasses ${island} 2026`)
  console.log(`  Found ${news.length} headlines:`)
  news.forEach(n => console.log(`    • ${n.title}`))

  // Step 2: Read satellite data
  console.log('\n--- Step 2: Reading satellite data ---')
  const sargData = readSargassumData()
  if (sargData) {
    console.log(`  ${sargData.clean}/${sargData.total} plages propres (${sargData.cleanPct}%)`)
    console.log(`  Saison: ${sargData.season}`)
  } else {
    console.log('  No satellite data available')
  }

  // Step 3: Generate article
  console.log('\n--- Step 3: Generating article via Claude ---')
  if (DRY_RUN) {
    console.log('  [DRY RUN] Would call Claude API')
    appendLog({ script: 'auto-web-content', action: 'dry-run', island: islandKey, type: articleType })
    return
  }

  const article = await generateArticle(islandKey, articleType, news, sargData)
  if (!article) {
    console.error('  Article generation failed')
    appendLog({ script: 'auto-web-content', action: 'generation-failed', island: islandKey })
    process.exit(0)
  }

  console.log(`  Title: ${article.title}`)
  console.log(`  H1: ${article.h1}`)

  // Step 4: Build slug + write HTML
  console.log('\n--- Step 4: Writing HTML ---')
  const dateSlug = new Date().toISOString().slice(0, 10)
  const suffix = article.slug_suffix ? slugify(article.slug_suffix) : articleType
  const slug = `${suffix}-${islandKey}-${dateSlug}`

  const articleDir = resolve(ARTICLES_DIR, slug)
  mkdirSync(articleDir, { recursive: true })

  const html = generateHTML(article, islandKey, slug)
  const htmlPath = resolve(articleDir, 'index.html')
  writeFileSync(htmlPath, html, 'utf-8')
  console.log(`  Written: public/articles/${slug}/index.html`)

  // Step 5: Update index
  console.log('\n--- Step 5: Updating articles index ---')
  updateIndex(slug, article, islandKey)
  console.log(`  Index updated: public/articles/index.json`)

  appendLog({
    script: 'auto-web-content',
    action: 'article-published',
    island: islandKey,
    type: articleType,
    slug,
    title: article.title,
  })

  console.log(`\n=== Done: /articles/${slug}/ ===`)
}

main().catch(err => {
  console.error(`[auto-web-content] Fatal: ${err.message}`)
  process.exit(0) // Exit 0 — never break the pipeline
})
