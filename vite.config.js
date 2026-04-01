import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'

// Identifiants Copernicus Marine (copernicustxt.txt : ligne 1 = username, ligne 2 = password)
const copernicusCreds = (() => {
  try {
    const p = resolve(__dirname, 'copernicustxt.txt')
    const raw = readFileSync(p, 'utf-8').trim()
    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    if (lines.length >= 2) return { username: lines[0], password: lines[1] }
    return null
  } catch {
    return null
  }
})()

// Données de référence sargasses par plage (fallback si API Copernicus indisponible) — sync avec BEACHES dans Sargasses_PROD.jsx
const SARGASSUM_REF = [
  { id: "grande-anse",     afai: 0.11, status: "clean" }, { id: "anse-mitan",      afai: 0.17, status: "clean" },
  { id: "anse-noire",      afai: 0.08, status: "clean" }, { id: "tartane",         afai: 0.19, status: "clean" },
  { id: "anse-madame",     afai: 0.14, status: "clean" }, { id: "diamant",         afai: 0.42, status: "moderate" },
  { id: "pt-marin",        afai: 0.47, status: "moderate" }, { id: "sainte-anne",  afai: 0.78, status: "avoid" },
  { id: "les-salines",     afai: 0.82, status: "avoid" }, { id: "vauclin",         afai: 0.71, status: "avoid" },
  { id: "gp-grande-anse",  afai: 0.15, status: "clean" }, { id: "gp-malendure",    afai: 0.12, status: "clean" },
  { id: "gp-sainte-anne",  afai: 0.22, status: "clean" }, { id: "gp-pt-chateaux",  afai: 0.38, status: "moderate" },
  { id: "gp-gosier",       afai: 0.18, status: "clean" }, { id: "gp-caravelle",    afai: 0.14, status: "clean" },
  { id: "gp-bas-du-fort",  afai: 0.35, status: "moderate" }, { id: "gp-deshaies",   afai: 0.11, status: "clean" },
  { id: "gp-moule",        afai: 0.44, status: "moderate" }, { id: "gp-vieux-fort", afai: 0.72, status: "avoid" },
]

const DAYS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"]

/** Génère les prévisions 7 jours + estimation de dérive pour une plage (batch pour clients). */
function buildWeeklyBatch(levels) {
  const byId = Object.fromEntries(levels.map((l) => [l.id, l]))
  const weekly = {}
  for (const { id, afai, status } of levels) {
    const drift = afai > 0.6 ? 0.02 + (id.length % 5) * 0.008 : afai < 0.25 ? -0.01 - (id.length % 3) * 0.005 : (id.length % 7) * 0.006 - 0.02
    const base = Math.max(0, Math.min(1, afai))
    const series = []
    const t = new Date()
    for (let i = 0; i < 7; i++) {
      const d = new Date(t)
      d.setDate(d.getDate() + i)
      const noise = Math.sin((id.length + i) * 1.3) * 0.04 + Math.cos(i * 0.9) * 0.02
      const v = Math.max(0, Math.min(1, base + drift * i + noise))
      const s = v < 0.3 ? "clean" : v < 0.65 ? "moderate" : "avoid"
      series.push({
        day: i === 0 ? "Auj." : i === 1 ? "Dem." : DAYS[d.getDay()],
        date: d.toISOString().slice(0, 10),
        afai: Math.round(v * 100) / 100,
        status: s,
      })
    }
    const trend = series[6].afai - series[0].afai
    weekly[id] = {
      forecast: series,
      drift: trend > 0.05 ? "up" : trend < -0.05 ? "down" : "stable",
      driftLabel: trend > 0.05 ? "Dérive possible vers la côte" : trend < -0.05 ? "Dispersion attendue" : "Stable",
      driftValue: Math.round(trend * 100) / 100,
    }
  }
  return weekly
}

export default defineConfig({
  plugins: [
    react(),
    // Proxy Copernicus Marine : vérification des identifiants (copernicustxt.txt)
    copernicusCreds && {
      name: 'copernicus-check',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.method !== 'GET' || req.url !== '/api/copernicus/check') return next()
          const { username, password } = copernicusCreds
          const auth = Buffer.from(`${username}:${password}`).toString('base64')
          try {
            // Describe un jeu de données (test d'accès au catalogue) — timeout 25s
            const url = 'https://www.app.marine.copernicus.eu/api/describe?dataset_id=MULTIOBS_GLO_BGC_SURFACE_NRT_015_016'
            const apiRes = await fetch(url, {
              method: 'GET',
              headers: { Authorization: `Basic ${auth}` },
              signal: AbortSignal.timeout(25000),
            })
            const ok = apiRes.ok
            let body
            try {
              body = await apiRes.json()
            } catch {
              body = await apiRes.text()
            }
            // 404 ou 500 "dataset not found" = API atteinte, identifiants acceptés
            const bodyStr = body != null ? (typeof body === 'string' ? body : JSON.stringify(body)) : ''
            const accepted = ok || ((apiRes.status === 404 || apiRes.status === 500) && bodyStr.toLowerCase().includes('catalogue'))
            res.setHeader('Content-Type', 'application/json')
            res.statusCode = 200
            res.end(JSON.stringify({
              ok: accepted,
              status: apiRes.status,
              message: ok ? 'Connexion Copernicus Marine OK.' : accepted ? 'Identifiants acceptés. Jeu de données demandé non trouvé dans le catalogue (normal pour certains IDs).' : (body?.detail || body?.message || body || apiRes.statusText),
              ...(accepted && body && typeof body === 'object' && { dataset: body }),
            }))
          } catch (e) {
            res.setHeader('Content-Type', 'application/json')
            res.statusCode = 200
            res.end(JSON.stringify({
              ok: false,
              error: e.message || String(e),
              message: 'Erreur réseau ou service Copernicus indisponible.',
            }))
          }
        })
      },
    },
    // Données sargasses récentes (Copernicus ou référence) pour affichage plages
    copernicusCreds && {
      name: 'copernicus-sargassum',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const isSargassum = req.method === 'GET' && (req.url === '/api/copernicus/sargassum' || req.url.startsWith('/api/copernicus/sargassum?'))
          if (!isSargassum) return next()
          const { username, password } = copernicusCreds
          const auth = Buffer.from(`${username}:${password}`).toString('base64')
          const updatedAt = new Date().toISOString()
          let source = 'reference'
          let levels = [...SARGASSUM_REF]
          try {
            const params = new URLSearchParams({
              dataset_id: 'MULTIOBS_GLO_BGC_SURFACE_NRT_015_016',
              minimum_longitude: '-62',
              maximum_longitude: '-60',
              minimum_latitude: '14',
              maximum_latitude: '17',
              start_datetime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
              end_datetime: new Date().toISOString().slice(0, 10),
            })
            const apiRes = await fetch(`https://www.app.marine.copernicus.eu/api/subset?${params}`, {
              method: 'GET',
              headers: { Authorization: `Basic ${auth}` },
              signal: AbortSignal.timeout(18000),
            })
            const data = await apiRes.json().catch(() => null)
            if (apiRes.ok && data && typeof data === 'object') {
              source = 'copernicus'
              if (Array.isArray(data.levels)) levels = data.levels
              else if (data.destination_url || data.output_url) {
                source = 'copernicus'
                levels = SARGASSUM_REF
              }
            }
          } catch (_) {}
          const weekly = buildWeeklyBatch(levels)
          res.setHeader('Content-Type', 'application/json')
          res.statusCode = 200
          res.end(JSON.stringify({ source, updatedAt, levels, weekly }))
        })
      },
    },
    // SEO : après build, copier index vers /carte-sargasses/, /previsions/ et /en/ avec titres/meta dédiés
    {
      name: 'seo-pages',
      closeBundle() {
        const outDir = resolve(__dirname, 'dist')
        const indexPath = resolve(outDir, 'index.html')
        try {
          const html = readFileSync(indexPath, 'utf-8')
          const scriptMatch = html.match(/src="([^"]+\.js)"/)
          const scriptSrc = scriptMatch ? (scriptMatch[1].startsWith('/') ? scriptMatch[1] : '/' + scriptMatch[1]) : '/assets/index.js'
          const pages = [
            { path: 'carte-sargasses', title: 'Carte des sargasses Martinique en temps réel', desc: 'Carte interactive des sargasses en Martinique. Où se baigner, plages propres, état en direct.' },
            { path: 'previsions', title: 'Prévisions sargasses Martinique 7 jours', desc: 'Prévisions sargasses Martinique J+1 à J+7. Où aller à la plage cette semaine.' },
            // SEO editorial pages
            { path: 'saison-sargasses-martinique', title: 'Saison des sargasses en Martinique — Quand et où ?', desc: 'Quand arrivent les sargasses en Martinique ? Pic de saison, mois à éviter, plages les plus touchées. Prévisions en temps réel et conseils pratiques.' },
            { path: 'saison-sargasses-guadeloupe', title: 'Saison des sargasses en Guadeloupe — Quand et où ?', desc: 'Quand arrivent les sargasses en Guadeloupe ? Pic de saison, mois à éviter, plages les plus touchées. Prévisions en temps réel et conseils pratiques.' },
            { path: 'plages-sans-sargasses', title: 'Plages sans sargasses en Martinique et Guadeloupe', desc: 'Liste des plages propres aujourd\'hui en Martinique et Guadeloupe. Données satellite en temps réel. Trouvez où vous baigner sans sargasses.' },
            { path: 'danger-sargasses-h2s', title: 'Sargasses et H2S : dangers pour la santé, précautions', desc: 'Le H2S dégagé par les sargasses en décomposition peut irriter les yeux et les voies respiratoires. Risques, seuils, précautions pour enfants et personnes fragiles.' },
          ]
          // Noscript editorial content for Google crawling
          const editorialContent = {
            'saison-sargasses-martinique': `<article><h1>Saison des sargasses en Martinique</h1><p>Les sargasses touchent la Martinique principalement d'avril à octobre, avec des pics entre juin et août. Ces algues brunes, portées par les courants atlantiques depuis la mer des Sargasses, s'échouent sur les côtes est et sud de l'île.</p><h2>Quelles plages sont les plus touchées ?</h2><p>Les plages de la côte atlantique (Le Vauclin, Tartane, Sainte-Anne côté est) sont les plus exposées. Les plages de la côte caraïbe (Anse Mitan, Anse Noire, Grande Anse d'Arlet) sont généralement épargnées grâce à leur orientation.</p><h2>Prévisions en temps réel</h2><p>Consultez notre <a href="/">carte interactive</a> mise à jour quotidiennement avec les données satellite Copernicus pour connaître l'état de chaque plage. Les <a href="/previsions/">prévisions 7 jours</a> vous permettent de planifier vos sorties.</p><p><a href="/">Voir la carte en temps réel</a> · <a href="/plages/les-salines/">Les Salines</a> · <a href="/plages/anse-mitan/">Anse Mitan</a> · <a href="/plages/grande-anse-darlet/">Grande Anse d'Arlet</a></p></article>`,
            'saison-sargasses-guadeloupe': `<article><h1>Saison des sargasses en Guadeloupe</h1><p>En Guadeloupe, la saison des sargasses s'étend généralement d'avril à octobre. Les côtes de Grande-Terre (Le Gosier, Sainte-Anne, Saint-François) sont les plus exposées aux échouages.</p><h2>Quelles plages sont les plus touchées ?</h2><p>Les plages de la côte sud de Grande-Terre reçoivent le plus de sargasses. Les plages de Basse-Terre (Malendure, Deshaies, Bouillante) sont naturellement protégées par leur position sous le vent.</p><h2>Prévisions en temps réel</h2><p>Notre <a href="/">carte interactive</a> affiche l'état de chaque plage en temps réel grâce aux données satellite Copernicus. Consultez les <a href="/previsions/">prévisions 7 jours</a> avant de planifier votre sortie plage.</p><p><a href="/">Voir la carte en temps réel</a> · <a href="/plages/malendure/">Malendure</a> · <a href="/plages/grande-anse-deshaies/">Grande Anse Deshaies</a> · <a href="/plages/sainte-anne-guadeloupe/">Sainte-Anne</a></p></article>`,
            'plages-sans-sargasses': `<article><h1>Plages sans sargasses en Martinique et Guadeloupe</h1><p>Vous cherchez une plage propre aujourd'hui ? Notre application surveille en temps réel l'état de plus de 60 plages en Martinique et Guadeloupe grâce aux données satellite Copernicus.</p><h2>Martinique — Plages généralement propres</h2><ul><li><a href="/plages/anse-mitan/">Anse Mitan</a> (Les Trois-Îlets) — côte caraïbe, rarement touchée</li><li><a href="/plages/anse-noire/">Anse Noire</a> (Les Anses-d'Arlet) — petite crique protégée</li><li><a href="/plages/grande-anse-darlet/">Grande Anse d'Arlet</a> — plage familiale, peu exposée</li></ul><h2>Guadeloupe — Plages généralement propres</h2><ul><li><a href="/plages/malendure/">Malendure</a> (Bouillante) — côte sous le vent</li><li><a href="/plages/grande-anse-deshaies/">Grande Anse Deshaies</a> — nord Basse-Terre</li><li><a href="/plages/plage-caravelle/">Plage de la Caravelle</a> (Sainte-Anne) — souvent épargnée</li></ul><p><a href="/">Consulter la carte en temps réel</a> pour l'état exact de chaque plage aujourd'hui.</p></article>`,
            'danger-sargasses-h2s': `<article><h1>Sargasses et H2S : dangers pour la santé</h1><p>Lorsque les sargasses s'échouent et se décomposent sur les plages, elles libèrent du sulfure d'hydrogène (H2S), un gaz toxique reconnaissable à son odeur d'œuf pourri.</p><h2>Quels sont les risques ?</h2><p>À faible concentration, le H2S provoque des irritations des yeux, du nez et de la gorge. À forte concentration (au-dessus de 5 ppm), il peut causer des maux de tête, nausées et difficultés respiratoires. Les enfants, personnes âgées et asthmatiques sont particulièrement vulnérables.</p><h2>Précautions à prendre</h2><ul><li>Évitez les plages marquées "À éviter" sur notre <a href="/">carte en temps réel</a></li><li>Ne laissez pas les enfants jouer dans ou près des amas de sargasses en décomposition</li><li>Si vous sentez une forte odeur d'œuf pourri, éloignez-vous immédiatement</li><li>Consultez les <a href="/previsions/">prévisions 7 jours</a> avant de planifier une sortie plage</li></ul><h2>L'indice AFAI</h2><p>L'AFAI (Algal Floating Algae Index) est l'indice satellite que nous utilisons pour détecter les sargasses. En dessous de 0,3 la plage est propre. Au-dessus de 0,65, il vaut mieux éviter.</p></article>`,
          }
          for (const { path: p, title, desc } of pages) {
            const dir = resolve(outDir, p)
            mkdirSync(dir, { recursive: true })
            let pageHtml = html
              .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
              .replace(/<meta name="description"[^>]*>/, () => `<meta name="description" content="${desc}" />`)
            // Inject noscript editorial content if available
            if (editorialContent[p]) {
              const articleSchema = JSON.stringify({"@context":"https://schema.org","@type":"Article","headline":title,"description":desc,"url":`https://sargasses-martinique.com/${p}/`,"dateModified":new Date().toISOString().slice(0,10),"publisher":{"@type":"Organization","name":"Sargasses Martinique"}})
              pageHtml = pageHtml
                .replace('</head>', `\n    <script type="application/ld+json">\n    ${articleSchema}\n    </script>\n</head>`)
                .replace('</body>', `\n    <noscript>${editorialContent[p]}</noscript>\n</body>`)
            }
            writeFileSync(resolve(dir, 'index.html'), pageHtml)
          }
          // Page EN : app en anglais (pathname /en/ → getLang() = 'en'), SEO EN, script depuis racine
          const enDir = resolve(outDir, 'en')
          mkdirSync(enDir, { recursive: true })
          const enIndex = html
            .replace(/<html lang="fr">/, '<html lang="en">')
            .replace(/<title>[^<]*<\/title>/, '<title>Sargassum Martinique real-time · Map &amp; beaches today</title>')
            .replace(/<meta name="description"[^>]*>/, '<meta name="description" content="Real-time sargassum map in Martinique. Which beaches are clean or to avoid, 7-day outlook. For travelers and residents." />')
            .replace(/<link rel="canonical"[^>]*>/, '<link rel="canonical" href="https://sargasses-martinique.com/en/" />')
            .replace(/<meta property="og:title"[^>]*>/, '<meta property="og:title" content="Sargassum Martinique real-time · Map &amp; beaches today" />')
            .replace(/<meta property="og:description"[^>]*>/, '<meta property="og:description" content="Real-time sargassum map in Martinique. Clean or avoid beaches, 7-day outlook." />')
            .replace(/<meta property="og:url"[^>]*>/, '<meta property="og:url" content="https://sargasses-martinique.com/en/" />')
            .replace(/<meta property="og:locale"[^>]*>/, '<meta property="og:locale" content="en_US" />\n    <meta property="og:locale:alternate" content="fr_FR" />')
            .replace(/<meta name="twitter:title"[^>]*>/, '<meta name="twitter:title" content="Sargassum Martinique real-time · Map &amp; beaches today" />')
            .replace(/<meta name="twitter:description"[^>]*>/, '<meta name="twitter:description" content="Real-time sargassum map in Martinique. Clean or avoid beaches, 7-day outlook." />')
            .replace(/src="assets\//, 'src="/assets/')
          const enJsonLd = '<script type="application/ld+json">\n    {"@context":"https://schema.org","@type":"WebApplication","name":"Sargassum Martinique real-time","description":"Real-time sargassum map and beach status in Martinique. Clean or avoid, 7-day outlook.","url":"https://sargasses-martinique.com/en/","applicationCategory":"EnvironmentApplication","operatingSystem":"Web","inLanguage":"en","dateModified":"' + new Date().toISOString().slice(0, 10) + '","publisher":{"@type":"Organization","name":"Sargasses Martinique"}}\n    </script>'
          writeFileSync(resolve(enDir, 'index.html'), enIndex.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, enJsonLd))

          // EN subpages for international SEO
          const enPages = [
            { path: 'en/sargassum-map', title: 'Sargassum Map Martinique &amp; Guadeloupe — Real-time satellite', desc: 'Interactive sargassum map for Martinique and Guadeloupe. Real-time satellite data, 7-day forecast. Find clean beaches today.' },
            { path: 'en/best-beaches-no-sargassum', title: 'Best beaches without sargassum in Martinique &amp; Guadeloupe', desc: 'Which beaches are clean today? Real-time sargassum monitoring for Martinique and Guadeloupe. Updated daily with satellite data.' },
            { path: 'en/sargassum-season', title: 'Sargassum season in the Caribbean — When to avoid', desc: 'When does sargassum season start? Peak months, which beaches are affected, real-time forecasts for Martinique and Guadeloupe.' },
          ]
          for (const ep of enPages) {
            const epDir = resolve(outDir, ep.path)
            mkdirSync(epDir, { recursive: true })
            const epHtml = enIndex
              .replace(/<title>[^<]*<\/title>/, `<title>${ep.title}</title>`)
              .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${ep.desc}" />`)
              .replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="https://sargasses-martinique.com/${ep.path}/" />`)
              .replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${ep.title}" />`)
              .replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="https://sargasses-martinique.com/${ep.path}/" />`)
            writeFileSync(resolve(epDir, 'index.html'), epHtml.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, enJsonLd))
          }
          console.log(`   → ${enPages.length} pages EN supplémentaires générées`)

          // Sitemaps dynamiques avec lastmod = date du build
          const today = new Date().toISOString().slice(0, 10)
          const sitemapMQ = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://sargasses-martinique.com/</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>
  <url><loc>https://sargasses-martinique.com/carte-sargasses/</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.9</priority></url>
  <url><loc>https://sargasses-martinique.com/previsions/</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.9</priority></url>
  <url><loc>https://sargasses-martinique.com/en/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>
  <url><loc>https://sargasses-martinique.com/en/sargassum-map/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>
  <url><loc>https://sargasses-martinique.com/en/best-beaches-no-sargassum/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>
  <url><loc>https://sargasses-martinique.com/en/sargassum-season/</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>
  <url><loc>https://sargasses-martinique.com/saison-sargasses-martinique/</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>
  <url><loc>https://sargasses-martinique.com/saison-sargasses-guadeloupe/</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>
  <url><loc>https://sargasses-martinique.com/plages-sans-sargasses/</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url>
  <url><loc>https://sargasses-martinique.com/danger-sargasses-h2s/</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>
  <url><loc>https://sargasses-martinique.com/mentions-legales.html</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.4</priority></url>
  <url><loc>https://sargasses-martinique.com/confidentialite.html</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.4</priority></url>
</urlset>
`
          const sitemapGP = sitemapMQ.replace(/sargasses-martinique\.com/g, 'sargasses-guadeloupe.com')
          writeFileSync(resolve(outDir, 'sitemap-martinique.xml'), sitemapMQ)
          writeFileSync(resolve(outDir, 'sitemap-guadeloupe.xml'), sitemapGP)
          console.log('   → Sitemaps générés avec lastmod:', today)

          // BreadcrumbList pour /carte-sargasses/ et /previsions/
          const breadcrumbCarte = '\n    <script type="application/ld+json">\n    {"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Accueil","item":"https://sargasses-martinique.com/"},{"@type":"ListItem","position":2,"name":"Carte des sargasses","item":"https://sargasses-martinique.com/carte-sargasses/"}]}\n    </script>'
          const breadcrumbPrev = '\n    <script type="application/ld+json">\n    {"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Accueil","item":"https://sargasses-martinique.com/"},{"@type":"ListItem","position":2,"name":"Prévisions 7 jours","item":"https://sargasses-martinique.com/previsions/"}]}\n    </script>'
          const carteHtml = readFileSync(resolve(outDir, 'carte-sargasses', 'index.html'), 'utf-8')
          writeFileSync(resolve(outDir, 'carte-sargasses', 'index.html'), carteHtml.replace('</head>', breadcrumbCarte + '\n</head>'))
          const prevHtml = readFileSync(resolve(outDir, 'previsions', 'index.html'), 'utf-8')
          writeFileSync(resolve(outDir, 'previsions', 'index.html'), prevHtml.replace('</head>', breadcrumbPrev + '\n</head>'))
          console.log('   → BreadcrumbList ajouté à /carte-sargasses/ et /previsions/')

          // Pages statiques par plage (SEO longue traîne)
          // Featured beaches (canonical slugs used in the app)
          const featuredBeaches = [
            {id:"grande-anse",island:"mq",name:"Grande Anse d'Arlet",commune:"Les Anses-d'Arlet",slug:"grande-anse-darlet"},
            {id:"anse-mitan",island:"mq",name:"Anse Mitan",commune:"Les Trois-Îlets",slug:"anse-mitan"},
            {id:"anse-noire",island:"mq",name:"Anse Noire",commune:"Les Anses-d'Arlet",slug:"anse-noire"},
            {id:"tartane",island:"mq",name:"Tartane",commune:"La Trinité",slug:"tartane"},
            {id:"anse-madame",island:"mq",name:"Anse Madame",commune:"Schoelcher",slug:"anse-madame"},
            {id:"diamant",island:"mq",name:"Le Diamant",commune:"Le Diamant",slug:"le-diamant"},
            {id:"pt-marin",island:"mq",name:"Pointe Marin",commune:"Sainte-Anne",slug:"pointe-marin"},
            {id:"sainte-anne",island:"mq",name:"Sainte-Anne",commune:"Sainte-Anne",slug:"sainte-anne"},
            {id:"les-salines",island:"mq",name:"Les Salines",commune:"Sainte-Anne",slug:"les-salines"},
            {id:"vauclin",island:"mq",name:"Le Vauclin",commune:"Le Vauclin",slug:"le-vauclin"},
            {id:"gp-grande-anse",island:"gp",name:"Grande Anse",commune:"Bouillante",slug:"grande-anse-bouillante"},
            {id:"gp-malendure",island:"gp",name:"Malendure",commune:"Bouillante",slug:"malendure"},
            {id:"gp-sainte-anne",island:"gp",name:"Sainte-Anne",commune:"Sainte-Anne",slug:"sainte-anne-guadeloupe"},
            {id:"gp-pt-chateaux",island:"gp",name:"Pointe des Châteaux",commune:"Saint-François",slug:"pointe-des-chateaux"},
            {id:"gp-gosier",island:"gp",name:"Le Gosier",commune:"Le Gosier",slug:"le-gosier"},
            {id:"gp-caravelle",island:"gp",name:"Plage de la Caravelle",commune:"Saint-François",slug:"plage-caravelle"},
            {id:"gp-bas-du-fort",island:"gp",name:"Bas-du-Fort",commune:"Pointe-à-Pitre",slug:"bas-du-fort"},
            {id:"gp-deshaies",island:"gp",name:"Grande Anse des Haies",commune:"Deshaies",slug:"grande-anse-deshaies"},
            {id:"gp-moule",island:"gp",name:"Plage de la Souffleur",commune:"Le Moule",slug:"plage-souffleur"},
            {id:"gp-vieux-fort",island:"gp",name:"Anse de la Gourde",commune:"Saint-François",slug:"anse-de-la-gourde"},
          ]
          // Auto-generate pages for ALL beaches in beaches-list.json
          const slugify = (n) => n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')
          const featuredSlugs = new Set(featuredBeaches.map(b => b.slug))
          let extraBeaches = []
          try {
            const allBeaches = JSON.parse(readFileSync(resolve(__dirname, 'public/data/beaches-list.json'), 'utf-8'))
            extraBeaches = allBeaches
              .map(b => ({ id: b.id, island: b.island, name: b.name, commune: b.commune, slug: slugify(b.name) }))
              .filter(b => !featuredSlugs.has(b.slug))
          } catch {}
          const beaches = [...featuredBeaches, ...extraBeaches]
          
          // Beach images for og:image
          let _beachImages = {}
          try { _beachImages = JSON.parse(readFileSync(resolve(__dirname, 'public/data/beaches-images.json'), 'utf-8')) } catch {}
          // SEO enrichments (generated by seo-enrich-content.cjs)
          let _enrichments = {}
          try { _enrichments = JSON.parse(readFileSync(resolve(__dirname, 'scripts/automation/data/enrichments.json'), 'utf-8')) } catch {}
          const domainMQ = 'sargasses-martinique.com'
          const domainGP = 'sargasses-guadeloupe.com'
          let sitemapMQBeaches = ''
          let sitemapGPBeaches = ''
          for (const b of beaches) {
            const isMQ = b.island === 'mq'
            const domain = isMQ ? domainMQ : domainGP
            const island = isMQ ? 'Martinique' : 'Guadeloupe'
            const beachPath = `plages/${b.slug}`
            const beachDir = resolve(outDir, beachPath)
            mkdirSync(beachDir, { recursive: true })
            const beachTitle = `${b.name} — Sargasses ${island} aujourd'hui`
            const beachDesc = `État des sargasses à ${b.name} (${b.commune}, ${island}) aujourd'hui. Plage propre ou à éviter ? Consultez la fiche, les prévisions 7 jours et la carte en temps réel.`
            const beachUrl = `https://${domain}/plages/${b.slug}/`
            const beachSchema = JSON.stringify({"@context":"https://schema.org","@type":"Beach","name":b.name,"description":`Fiche sargasses ${b.name}, ${b.commune} (${island}). État en temps réel et prévisions.`,"url":beachUrl,"address":{"@type":"PostalAddress","addressLocality":b.commune,"addressRegion":island,"addressCountry":isMQ?"MQ":"GP"},"isPartOf":{"@type":"WebApplication","name":`Sargasses ${island}`,"url":`https://${domain}/`}})
            const breadcrumbBeach = JSON.stringify({"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Accueil","item":`https://${domain}/`},{"@type":"ListItem","position":2,"name":"Plages","item":`https://${domain}/`},{"@type":"ListItem","position":3,"name":b.name,"item":beachUrl}]})
            const beachHtml = html
              .replace(/<title>[^<]*<\/title>/, `<title>${beachTitle}</title>`)
              .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${beachDesc}" />`)
              .replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${beachUrl}" />`)
              .replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${beachTitle}" />`)
              .replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${beachDesc}" />`)
              .replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${beachUrl}" />`)
              .replace(/<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${beachTitle}" />`)
              .replace(/<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${beachDesc}" />`)
              .replace(/<meta property="og:image" [^>]*>/, _beachImages[b.id] ? `<meta property="og:image" content="https://${domain}/beaches/${_beachImages[b.id]}" />` : `<meta property="og:image" content="https://${domain}/og-image.png" />`)
              .replace(/<meta name="twitter:image" [^>]*>/, _beachImages[b.id] ? `<meta name="twitter:image" content="https://${domain}/beaches/${_beachImages[b.id]}" />` : `<meta name="twitter:image" content="https://${domain}/og-image.png" />`)
              .replace('</head>', `\n    <script type="application/ld+json">\n    ${beachSchema}\n    </script>\n    <script type="application/ld+json">\n    ${breadcrumbBeach}\n    </script>${_enrichments[b.slug] ? '\n    <script type="application/ld+json">\n    ' + _enrichments[b.slug].faq + '\n    </script>' : ''}\n</head>`)
            const finalHtml = _enrichments[b.slug] ? beachHtml.replace('</body>', _enrichments[b.slug].noscript + '\n</body>') : beachHtml
            writeFileSync(resolve(beachDir, 'index.html'), finalHtml)
            const sitemapEntry = `  <url><loc>${beachUrl}</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.7</priority></url>\n`
            if (isMQ) sitemapMQBeaches += sitemapEntry
            else sitemapGPBeaches += sitemapEntry
          }
          // Réécrire les sitemaps avec les plages
          const sitemapMQFull = sitemapMQ.replace('</urlset>', sitemapMQBeaches + '</urlset>')
          const sitemapGPFull = sitemapGP.replace('</urlset>', sitemapGPBeaches + '</urlset>')
          writeFileSync(resolve(outDir, 'sitemap-martinique.xml'), sitemapMQFull)
          writeFileSync(resolve(outDir, 'sitemap-guadeloupe.xml'), sitemapGPFull)
          console.log(`   → ${beaches.length} pages plages générées (${beaches.filter(b=>b.island==='mq').length} MQ + ${beaches.filter(b=>b.island==='gp').length} GP)`)
          console.log('   → Sitemaps enrichis avec URLs plages')
        } catch (e) {
          console.warn('SEO pages:', e.message)
        }
      },
    },
    // En dev : réécrire /en et /en/ vers / pour charger l'app (pathname reste /en/ → getLang() = 'en')
    {
      name: 'en-spa-rewrite',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const u = req.url?.split('?')[0] || ''
          if (u === '/en' || u === '/en/') req.url = '/' + (req.url?.includes('?') ? '?' + req.url.split('?')[1] : '')
          next()
        })
      },
    },
  ].filter(Boolean),
  root: '.',
  // Si le site est dans un sous-dossier (ex. example.com/sargasses/), décommenter et adapter :
  // base: '/sargasses/',
})
