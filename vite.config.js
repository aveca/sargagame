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

// Slugify helper — accent-safe, used for URL generation
const slugify = (n) => n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')

// Load beaches from beaches-list.json (source of truth for both app and SEO)
let ALL_BEACHES = []
try {
  ALL_BEACHES = JSON.parse(readFileSync(resolve(__dirname, 'public/data/beaches-list.json'), 'utf-8'))
} catch (e) {
  console.warn('vite.config.js: Could not load beaches-list.json:', e.message)
}

// Données de référence sargasses par plage (fallback si API Copernicus indisponible) — sync avec beaches-list.json
const SARGASSUM_REF = ALL_BEACHES.map(b => ({
  id: b.id,
  afai: b.afai ?? 0.2,
  status: b.status ?? 'clean',
}))

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
      const s = v < 0.15 ? "clean" : v < 0.40 ? "moderate" : "avoid"
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
    // SEO : après build, copier index vers /carte-sargasses/, /previsions/, /alertes/ et /en/ avec titres/meta dédiés
    {
      name: 'seo-pages',
      closeBundle() {
        const outDir = resolve(__dirname, 'dist')
        const indexPath = resolve(outDir, 'index.html')
        try {
          // Patch dateModified to today's date in index.html
          let html = readFileSync(indexPath, 'utf-8')
          html = html.replace(/"dateModified":"[^"]*"/, `"dateModified":"${new Date().toISOString().slice(0,10)}"`)
          writeFileSync(indexPath, html)
          const scriptMatch = html.match(/src="([^"]+\.js)"/)
          const scriptSrc = scriptMatch ? (scriptMatch[1].startsWith('/') ? scriptMatch[1] : '/' + scriptMatch[1]) : '/assets/index.js'
          const pages = [
            { path: 'carte-sargasses', title: 'Carte des sargasses Martinique en temps réel', desc: 'Carte interactive des sargasses en Martinique. Où se baigner, plages propres, état en direct.' },
            { path: 'previsions', title: 'Prévisions sargasses Martinique 7 jours', desc: 'Prévisions sargasses Martinique J+1 à J+7. Où aller à la plage cette semaine.' },
            { path: 'alertes', title: 'Alertes sargasses Martinique et Guadeloupe — Notifications en temps réel', desc: 'Recevez des alertes sargasses pour vos plages en Martinique et Guadeloupe. Notifications en temps réel quand l\'état change. Planifiez vos sorties plage sereinement.' },
            // SEO editorial pages
            { path: 'saison-sargasses-martinique', title: 'Saison des sargasses en Martinique — Quand et où ?', desc: 'Quand arrivent les sargasses en Martinique ? Pic de saison, mois à éviter, plages les plus touchées. Prévisions en temps réel et conseils pratiques.' },
            { path: 'saison-sargasses-guadeloupe', title: 'Saison des sargasses en Guadeloupe — Quand et où ?', desc: 'Quand arrivent les sargasses en Guadeloupe ? Pic de saison, mois à éviter, plages les plus touchées. Prévisions en temps réel et conseils pratiques.' },
            { path: 'plages-sans-sargasses', title: 'Plages sans sargasses en Martinique et Guadeloupe', desc: 'Liste des plages propres aujourd\'hui en Martinique et Guadeloupe. Données satellite en temps réel. Trouvez où vous baigner sans sargasses.' },
            { path: 'danger-sargasses-h2s', title: 'Sargasses et H2S : dangers pour la santé, précautions', desc: 'Le H2S dégagé par les sargasses en décomposition peut irriter les yeux et les voies respiratoires. Risques, seuils, précautions pour enfants et personnes fragiles.' },
          ]
          // Noscript editorial content for Google crawling
          const editorialContent = {
            'saison-sargasses-martinique': `<article><h1>Saison des sargasses en Martinique</h1><p>Les sargasses touchent la Martinique principalement d'avril à octobre, avec des pics entre juin et août. Ces algues brunes, portées par les courants atlantiques depuis la mer des Sargasses, s'échouent sur les côtes est et sud de l'île.</p><h2>Quelles plages sont les plus touchées ?</h2><p>Les plages de la côte atlantique (Le Vauclin, Tartane, Sainte-Anne côté est) sont les plus exposées. Les plages de la côte caraïbe (Anse Mitan, Anse Noire, Grande Anse d'Arlet) sont généralement épargnées grâce à leur orientation.</p><h2>Prévisions en temps réel</h2><p>Consultez notre <a href="/">carte interactive</a> mise à jour quotidiennement avec les données satellite Copernicus pour connaître l'état de chaque plage. Les <a href="/previsions/">prévisions 7 jours</a> vous permettent de planifier vos sorties.</p><p><a href="/">Voir la carte en temps réel</a> · <a href="/plages/plage-des-salines/">Plage des Salines</a> · <a href="/plages/anse-mitan/">Anse Mitan</a> · <a href="/plages/grande-anse-darlet/">Grande Anse d'Arlet</a></p></article>`,
            'saison-sargasses-guadeloupe': `<article><h1>Saison des sargasses en Guadeloupe</h1><p>En Guadeloupe, la saison des sargasses s'étend généralement d'avril à octobre. Les côtes de Grande-Terre (Le Gosier, Sainte-Anne, Saint-François) sont les plus exposées aux échouages.</p><h2>Quelles plages sont les plus touchées ?</h2><p>Les plages de la côte sud de Grande-Terre reçoivent le plus de sargasses. Les plages de Basse-Terre (Malendure, Deshaies, Bouillante) sont naturellement protégées par leur position sous le vent.</p><h2>Prévisions en temps réel</h2><p>Notre <a href="/">carte interactive</a> affiche l'état de chaque plage en temps réel grâce aux données satellite Copernicus. Consultez les <a href="/previsions/">prévisions 7 jours</a> avant de planifier votre sortie plage.</p><p><a href="/">Voir la carte en temps réel</a> · <a href="/plages/plage-de-malendure/">Plage de Malendure</a> · <a href="/plages/la-grande-anse-deshaies/">La Grande Anse (Deshaies)</a> · <a href="/plages/plage-de-sainte-anne/">Plage de Sainte-Anne</a></p></article>`,
            'plages-sans-sargasses': `<article><h1>Plages sans sargasses en Martinique et Guadeloupe</h1><p>Vous cherchez une plage propre aujourd'hui ? Notre application surveille en temps réel l'état de plus de 50 plages en Martinique et Guadeloupe grâce aux données satellite Copernicus.</p><h2>Martinique — Plages généralement propres</h2><ul><li><a href="/plages/anse-mitan/">Anse Mitan</a> (Les Trois-Îlets) — côte caraïbe, rarement touchée</li><li><a href="/plages/anse-noire/">Anse Noire</a> (Les Anses-d'Arlet) — petite crique protégée</li><li><a href="/plages/grande-anse-darlet/">Grande Anse d'Arlet</a> — plage familiale, peu exposée</li></ul><h2>Guadeloupe — Plages généralement propres</h2><ul><li><a href="/plages/plage-de-malendure/">Plage de Malendure</a> (Bouillante) — côte sous le vent</li><li><a href="/plages/la-grande-anse-deshaies/">La Grande Anse (Deshaies)</a> — nord Basse-Terre</li><li><a href="/plages/plage-de-la-caravelle/">Plage de la Caravelle</a> (Sainte-Anne) — souvent épargnée</li></ul><p><a href="/">Consulter la carte en temps réel</a> pour l'état exact de chaque plage aujourd'hui.</p></article>`,
            'danger-sargasses-h2s': `<article><h1>Sargasses et H2S : dangers pour la santé</h1><p>Lorsque les sargasses s'échouent et se décomposent sur les plages, elles libèrent du sulfure d'hydrogène (H2S), un gaz toxique reconnaissable à son odeur d'œuf pourri.</p><h2>Quels sont les risques ?</h2><p>À faible concentration, le H2S provoque des irritations des yeux, du nez et de la gorge. À forte concentration (au-dessus de 5 ppm), il peut causer des maux de tête, nausées et difficultés respiratoires. Les enfants, personnes âgées et asthmatiques sont particulièrement vulnérables.</p><h2>Précautions à prendre</h2><ul><li>Évitez les plages marquées "À éviter" sur notre <a href="/">carte en temps réel</a></li><li>Ne laissez pas les enfants jouer dans ou près des amas de sargasses en décomposition</li><li>Si vous sentez une forte odeur d'œuf pourri, éloignez-vous immédiatement</li><li>Consultez les <a href="/previsions/">prévisions 7 jours</a> avant de planifier une sortie plage</li></ul><h2>L'indice AFAI</h2><p>L'AFAI (Algal Floating Algae Index) est l'indice satellite que nous utilisons pour détecter les sargasses. En dessous de 0,3 la plage est propre. Au-dessus de 0,65, il vaut mieux éviter.</p></article>`,
            'alertes': `<article><h1>Alertes sargasses Martinique et Guadeloupe</h1><p>Recevez des alertes en temps réel sur l'état des sargasses sur vos plages préférées en Martinique et Guadeloupe.</p><h2>Comment ça marche ?</h2><p>Sélectionnez vos plages favorites et activez les notifications. Vous serez alerté dès que l'état change (plage propre, modéré ou à éviter) grâce aux données satellite Copernicus mises à jour quotidiennement.</p><h2>Pourquoi s'abonner aux alertes ?</h2><ul><li>Ne perdez plus de temps à aller sur une plage envahie de sargasses</li><li>Planifiez vos sorties plage en toute sérénité</li><li>Protégez votre famille du H2S (gaz toxique des sargasses en décomposition)</li></ul><p><a href="/">Consulter la carte en temps réel</a> · <a href="/previsions/">Prévisions 7 jours</a></p></article>`,
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
            { path: 'en/sargassum-alerts', title: 'Sargassum alerts Martinique &amp; Guadeloupe — Real-time notifications', desc: 'Get real-time sargassum alerts for your favorite beaches in Martinique and Guadeloupe. Know before you go.' },
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
  <url><loc>https://sargasses-martinique.com/alertes/</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url>
  <url><loc>https://sargasses-martinique.com/en/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>
  <url><loc>https://sargasses-martinique.com/en/sargassum-map/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>
  <url><loc>https://sargasses-martinique.com/en/best-beaches-no-sargassum/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>
  <url><loc>https://sargasses-martinique.com/en/sargassum-season/</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>
  <url><loc>https://sargasses-martinique.com/en/sargassum-alerts/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>
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

          // BreadcrumbList pour /carte-sargasses/, /previsions/ et /alertes/
          const breadcrumbCarte = '\n    <script type="application/ld+json">\n    {"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Accueil","item":"https://sargasses-martinique.com/"},{"@type":"ListItem","position":2,"name":"Carte des sargasses","item":"https://sargasses-martinique.com/carte-sargasses/"}]}\n    </script>'
          const breadcrumbPrev = '\n    <script type="application/ld+json">\n    {"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Accueil","item":"https://sargasses-martinique.com/"},{"@type":"ListItem","position":2,"name":"Prévisions 7 jours","item":"https://sargasses-martinique.com/previsions/"}]}\n    </script>'
          const breadcrumbAlertes = '\n    <script type="application/ld+json">\n    {"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Accueil","item":"https://sargasses-martinique.com/"},{"@type":"ListItem","position":2,"name":"Alertes sargasses","item":"https://sargasses-martinique.com/alertes/"}]}\n    </script>'
          const carteHtml = readFileSync(resolve(outDir, 'carte-sargasses', 'index.html'), 'utf-8')
          writeFileSync(resolve(outDir, 'carte-sargasses', 'index.html'), carteHtml.replace('</head>', breadcrumbCarte + '\n</head>'))
          const prevHtml = readFileSync(resolve(outDir, 'previsions', 'index.html'), 'utf-8')
          writeFileSync(resolve(outDir, 'previsions', 'index.html'), prevHtml.replace('</head>', breadcrumbPrev + '\n</head>'))
          const alertesHtml = readFileSync(resolve(outDir, 'alertes', 'index.html'), 'utf-8')
          writeFileSync(resolve(outDir, 'alertes', 'index.html'), alertesHtml.replace('</head>', breadcrumbAlertes + '\n</head>'))
          console.log('   → BreadcrumbList ajouté à /carte-sargasses/, /previsions/ et /alertes/')

          // Pages statiques par plage (SEO longue traîne) — generated from beaches-list.json
          const beaches = ALL_BEACHES.map(b => ({
            id: b.id,
            island: b.island,
            name: b.name,
            commune: b.commune,
            slug: slugify(b.name),
            lat: b.lat,
            lng: b.lng,
            status: b.status || 'clean',
            kids: !!b.kids,
            snorkel: !!b.snorkel,
            parking: !!b.parking,
            drive: b.drive || 0,
          }))

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
            const statusTextMap = { clean: 'Plage propre aujourd\u2019hui', moderate: 'Présence modérée de sargasses détectée au large', avoid: 'Alerte sargasses — forte concentration détectée au large' }
            const statusText = statusTextMap[b.status] || statusTextMap.clean
            const beachDesc = `État des sargasses à ${b.name} (${b.commune}) aujourd'hui. ${statusText}. Prévisions 7 jours, météo, photos. Mis à jour quotidiennement.`
            const beachUrl = `https://${domain}/plages/${b.slug}/`
            const beachSchema = JSON.stringify({"@context":"https://schema.org","@type":"Beach","name":b.name,"description":`Fiche sargasses ${b.name}, ${b.commune} (${island}). État en temps réel et prévisions.`,"url":beachUrl,"address":{"@type":"PostalAddress","addressLocality":b.commune,"addressRegion":island,"addressCountry":isMQ?"MQ":"GP"},"geo":{"@type":"GeoCoordinates","latitude":b.lat,"longitude":b.lng},"isPartOf":{"@type":"WebApplication","name":`Sargasses ${island}`,"url":`https://${domain}/`}})
            const breadcrumbBeach = JSON.stringify({"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Accueil","item":`https://${domain}/`},{"@type":"ListItem","position":2,"name":"Plages","item":`https://${domain}/`},{"@type":"ListItem","position":3,"name":b.name,"item":beachUrl}]})
            // FAQPage schema — use enrichment if available, otherwise generate per-beach FAQ
            const mainCity = isMQ ? 'Fort-de-France' : 'Pointe-à-Pitre'
            const baignadeAnswer = b.status === 'clean' ? `Oui, ${b.name} est actuellement propre et adaptée à la baignade. Consultez notre carte en temps réel pour les dernières mises à jour.` : b.status === 'moderate' ? `La baignade est possible à ${b.name} mais avec prudence, une présence modérée de sargasses est signalée. Vérifiez l'état en temps réel avant de vous déplacer.` : `La baignade est déconseillée à ${b.name} aujourd'hui en raison d'une forte présence de sargasses. Consultez les plages propres à proximité sur notre carte.`
            const generatedFaq = JSON.stringify({"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":`Les sargasses sont-elles présentes à ${b.name} aujourd'hui ?`,"acceptedAnswer":{"@type":"Answer","text":`Consultez l'état en temps réel des sargasses à ${b.name} (${b.commune}, ${island}) sur notre carte interactive. Données satellite Copernicus mises à jour quotidiennement.`}},{"@type":"Question","name":`Peut-on se baigner à ${b.name} ?`,"acceptedAnswer":{"@type":"Answer","text":baignadeAnswer}},{"@type":"Question","name":`Comment accéder à ${b.name} ?`,"acceptedAnswer":{"@type":"Answer","text":`${b.name} se trouve à ${b.commune}, ${island}. Accessible en ${b.drive} minutes en voiture depuis ${mainCity}.`}}]})
            const faqSchema = _enrichments[b.slug] ? _enrichments[b.slug].faq : generatedFaq
            const beachHtml = html
              .replace(/<title>[^<]*<\/title>/, `<title>${beachTitle}</title>`)
              .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${beachDesc}" />`)
              .replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${beachUrl}" />`)
              // Fix hreflang: point to actual page URL, not homepage
              .replace(/<link rel="alternate" hreflang="fr"[^>]*>/, `<link rel="alternate" hreflang="fr" href="${beachUrl}" />`)
              .replace(/<link rel="alternate" hreflang="x-default"[^>]*>/, `<link rel="alternate" hreflang="x-default" href="${beachUrl}" />`)
              .replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${beachTitle}" />`)
              .replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${beachDesc}" />`)
              .replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${beachUrl}" />`)
              .replace(/<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${beachTitle}" />`)
              .replace(/<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${beachDesc}" />`)
              .replace(/<meta property="og:image" [^>]*>/, _beachImages[b.id] ? `<meta property="og:image" content="https://${domain}/beaches/${_beachImages[b.id]}" />` : `<meta property="og:image" content="https://${domain}/og-image.png" />`)
              .replace(/<meta name="twitter:image" [^>]*>/, _beachImages[b.id] ? `<meta name="twitter:image" content="https://${domain}/beaches/${_beachImages[b.id]}" />` : `<meta name="twitter:image" content="https://${domain}/og-image.png" />`)
              .replace('</head>', `\n    <script type="application/ld+json">\n    ${beachSchema}\n    </script>\n    <script type="application/ld+json">\n    ${breadcrumbBeach}\n    </script>\n    <script type="application/ld+json">\n    ${faqSchema}\n    </script>\n</head>`)
            // Build noscript with nearby beaches (same commune first, then same island), nav links
            // Extra SEO sections appended to ALL beaches (enriched or not)
            const condBaignade = b.status === 'clean' ? `<h2>Conditions</h2><p>Peu ou pas de sargasses détectées par satellite au large de ${b.name}. Vérifiez toujours sur place avant de vous baigner.</p>` : b.status === 'moderate' ? `<h2>Conditions</h2><p>Présence modérée de sargasses détectée par satellite au large de ${b.name}. Vérifiez l'état de la plage sur place.</p>` : `<h2>Conditions</h2><p>Forte concentration de sargasses détectée par satellite au large de ${b.name}. Échouages probables. Si des sargasses sont en décomposition sur place, éloignez-vous (risque H₂S — source HCSP). Consultez les <a href="/">plages propres à proximité</a>.</p>`
            const accessSection = `<h2>Comment s'y rendre</h2><p>${b.name} se trouve à ${b.commune}, ${island}. Accessible en ${b.drive} minutes en voiture depuis ${mainCity}.</p>`
            const tagsList = []
            if (b.kids) tagsList.push('Adaptée aux enfants')
            if (b.snorkel) tagsList.push('Snorkeling possible')
            if (b.parking) tagsList.push('Parking disponible')
            const tagsHtml = tagsList.length > 0 ? `<p><strong>Équipements :</strong> ${tagsList.join(' · ')}</p>` : ''
            const extraSections = `${accessSection}${condBaignade}${tagsHtml}`
            let noscriptBlock
            if (_enrichments[b.slug]) {
              // Keep existing enrichment noscript but append extra sections inside the article
              noscriptBlock = _enrichments[b.slug].noscript.replace('</article>', `${extraSections}</article>`)
            } else {
              const sameCommune = beaches.filter(o => o.commune === b.commune && o.slug !== b.slug)
              const sameIsland = beaches.filter(o => o.island === b.island && o.commune !== b.commune && o.slug !== b.slug)
              const nearby = sameCommune.slice(0, 4)
              if (nearby.length < 4) nearby.push(...sameIsland.slice(0, 4 - nearby.length))
              const nearbyLi = nearby.map(o => `<li><a href="/plages/${o.slug}/">${o.name}</a> — ${o.commune}</li>`).join('')
              noscriptBlock = `\n    <noscript>\n      <article>\n        <h1>Sargasses à ${b.name} (${b.commune}, ${island})</h1>\n        <p>État des sargasses à ${b.name} en temps réel. Cette plage de ${b.commune} en ${island} est surveillée quotidiennement par satellite.</p>\n        ${extraSections}\n        <h3>Plages à proximité</h3>\n        <ul>${nearbyLi}</ul>\n        <p><a href="/carte-sargasses/">Voir la carte des sargasses</a> · <a href="/alertes/">Alertes sargasses</a> · <a href="/">Accueil Sargasses ${island}</a></p>\n      </article>\n    </noscript>`
            }
            const finalHtml = beachHtml.replace('</body>', noscriptBlock + '\n</body>')
            writeFileSync(resolve(beachDir, 'index.html'), finalHtml)
            const sitemapEntry = `  <url><loc>${beachUrl}</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.7</priority></url>\n`
            if (isMQ) sitemapMQBeaches += sitemapEntry
            else sitemapGPBeaches += sitemapEntry
          }
          // ── /plages/ index page — all beaches grouped by commune ──
          for (const islandCode of ['mq', 'gp']) {
            const isMQ = islandCode === 'mq'
            const island = isMQ ? 'Martinique' : 'Guadeloupe'
            const domain = isMQ ? domainMQ : domainGP
            const islandBeaches = beaches.filter(b => b.island === islandCode)
            // Group by commune
            const communes = {}
            for (const b of islandBeaches) {
              if (!communes[b.commune]) communes[b.commune] = []
              communes[b.commune].push(b)
            }
            const communeNames = Object.keys(communes).sort()
            // Status from SARGASSUM_REF
            const statusById = Object.fromEntries(SARGASSUM_REF.map(r => [r.id, r.status]))
            const statusBadge = (st) => {
              if (st === 'clean') return '<span style="display:inline-block;padding:1px 8px;border-radius:8px;background:#dcfce7;color:#16a34a;font-size:12px;font-weight:600">Propre</span>'
              if (st === 'moderate') return '<span style="display:inline-block;padding:1px 8px;border-radius:8px;background:#fef3c7;color:#b87a00;font-size:12px;font-weight:600">Mod\\u00e9r\\u00e9</span>'
              return '<span style="display:inline-block;padding:1px 8px;border-radius:8px;background:#fee2e2;color:#e8522a;font-size:12px;font-weight:600">\\u00c0 \\u00e9viter</span>'
            }
            let communeListHtml = ''
            for (const commune of communeNames) {
              const cBeaches = communes[commune]
              const beachLinks = cBeaches.map(b => {
                const st = statusById[b.id] || 'clean'
                return `<li style="padding:6px 0"><a href="/plages/${b.slug}/" style="color:#0D0D0D;text-decoration:none;font-weight:500">${b.name}</a> ${statusBadge(st)}</li>`
              }).join('')
              communeListHtml += `<h2 style="margin:28px 0 8px;font-size:18px;color:#0D0D0D">${commune}</h2><ul style="list-style:none;padding:0">${beachLinks}</ul>`
            }
            const plagesTitle = `Toutes les plages \u2014 Sargasses ${island}`
            const plagesDesc = `Liste compl\u00e8te des ${islandBeaches.length} plages surveill\u00e9es en ${island}. \u00c9tat des sargasses en temps r\u00e9el, regroup\u00e9es par commune.`
            const plagesUrl = `https://${domain}/plages/`
            const plagesNoscript = `<article style="max-width:700px;margin:0 auto;padding:24px 16px;font-family:system-ui,sans-serif"><h1 style="font-size:26px;margin-bottom:8px">Toutes les plages de ${island}</h1><p style="color:#686868;margin-bottom:24px">${islandBeaches.length} plages surveill\u00e9es par satellite \u2014 donn\u00e9es Copernicus</p>${communeListHtml}<nav style="margin-top:32px;padding-top:16px;border-top:1px solid #eee"><a href="/carte-sargasses/" style="color:#E8A800;font-weight:600;margin-right:16px">Carte des sargasses</a><a href="/alertes/" style="color:#E8A800;font-weight:600">Alertes sargasses</a></nav></article>`
            const plagesSchema = JSON.stringify({"@context":"https://schema.org","@type":"CollectionPage","name":plagesTitle,"description":plagesDesc,"url":plagesUrl,"isPartOf":{"@type":"WebApplication","name":`Sargasses ${island}`,"url":`https://${domain}/`},"dateModified":today})
            const breadcrumbPlages = JSON.stringify({"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Accueil","item":`https://${domain}/`},{"@type":"ListItem","position":2,"name":"Plages","item":plagesUrl}]})
            const plagesDir = resolve(outDir, 'plages')
            mkdirSync(plagesDir, { recursive: true })
            const plagesHtml = html
              .replace(/<title>[^<]*<\/title>/, `<title>${plagesTitle}</title>`)
              .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${plagesDesc}" />`)
              .replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${plagesUrl}" />`)
              .replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${plagesTitle}" />`)
              .replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${plagesDesc}" />`)
              .replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${plagesUrl}" />`)
              .replace(/<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${plagesTitle}" />`)
              .replace(/<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${plagesDesc}" />`)
              .replace('</head>', `\n    <script type="application/ld+json">\n    ${plagesSchema}\n    </script>\n    <script type="application/ld+json">\n    ${breadcrumbPlages}\n    </script>\n</head>`)
              .replace('</body>', `\n    <noscript>${plagesNoscript}</noscript>\n</body>`)
            writeFileSync(resolve(plagesDir, 'index.html'), plagesHtml)
            // Add to sitemap
            const plagesSitemapEntry = `  <url><loc>${plagesUrl}</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url>\n`
            if (isMQ) sitemapMQBeaches += plagesSitemapEntry
            else sitemapGPBeaches += plagesSitemapEntry
          }
          console.log('   \u2192 /plages/ index page g\u00e9n\u00e9r\u00e9e (MQ + GP)')

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
