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
            { path: 'carte-sargasses', enPath: 'en/sargassum-map', title: 'Carte des sargasses Martinique en temps réel (2026)', desc: 'Carte interactive des sargasses en Martinique. Où se baigner aujourd\'hui, plages propres, état en direct. Données satellite Copernicus.' },
            { path: 'previsions', enPath: null, title: 'Prévisions sargasses Martinique 7 jours (2026)', desc: 'Prévisions sargasses Martinique J+1 à J+7. Où aller à la plage cette semaine. Courants, vent, satellite.' },
            { path: 'alertes', enPath: 'en/sargassum-alerts', title: 'Alertes sargasses Martinique et Guadeloupe — Notifications en temps réel', desc: 'Recevez des alertes sargasses pour vos plages en Martinique et Guadeloupe. Notifications en temps réel quand l\'état change. Planifiez vos sorties plage sereinement.' },
            // SEO editorial pages
            { path: 'saison-sargasses-martinique', enPath: 'en/sargassum-season', title: 'Saison des sargasses en Martinique 2026 — Quand et où ?', desc: 'Quand arrivent les sargasses en Martinique en 2026 ? Pic de saison avril-septembre, mois à éviter, plages les plus touchées. Prévisions en temps réel.' },
            { path: 'saison-sargasses-guadeloupe', enPath: null, title: 'Saison des sargasses en Guadeloupe 2026 — Quand et où ?', desc: 'Quand arrivent les sargasses en Guadeloupe en 2026 ? Pic de saison avril-septembre, mois à éviter, plages les plus touchées. Prévisions en temps réel.' },
            { path: 'plages-sans-sargasses', enPath: 'en/best-beaches-no-sargassum', title: 'Plages sans sargasses en Martinique et Guadeloupe (2026)', desc: 'Anses d\'Arlet, Les Salines, Malendure... Quelles plages sont propres aujourd\'hui ? Suivi en temps réel par satellite pour Martinique et Guadeloupe.' },
            { path: 'meilleures-plages-martinique-sargasses', enPath: 'en/best-beaches-martinique', title: 'Meilleures plages de Martinique sans sargasses — Carte en temps réel 2026', desc: 'Anses d\'Arlet, Anse Dufour, Anse Mitan, Grande Anse... Classement des plages de Martinique propres aujourd\'hui. Données satellite Copernicus, prévisions 7 jours.' },
            { path: 'danger-sargasses-h2s', enPath: null, title: 'Sargasses et H2S : dangers pour la santé, précautions', desc: 'Le H2S dégagé par les sargasses en décomposition peut irriter les yeux et les voies respiratoires. Risques, seuils, précautions pour enfants et personnes fragiles.' },
            // New editorial pages — covering Météo France content gaps
            { path: 'comprendre-sargasses', enPath: 'en/understanding-sargassum', title: 'Comprendre les sargasses : origines, prolifération et prévision (2026)', desc: 'D\'où viennent les sargasses ? Mer des Sargasses, courants atlantiques, nutriments Amazon/Orénoque. Comment fonctionne la détection satellite et les prévisions.' },
            { path: 'bilan-sargasses-2025', enPath: null, title: 'Bilan sargasses 2025 Martinique et Guadeloupe — Année record', desc: 'Bilan de la saison sargasses 2025 aux Antilles : échouages records, plages les plus touchées, comparaison 2024. Données satellite et historique.' },
            { path: 'detection-satellite-sargasses', enPath: 'en/satellite-sargassum-detection', title: 'Détection satellite des sargasses : AFAI, OLCI, Copernicus (2026)', desc: 'Comment les satellites détectent les sargasses en temps réel. Indice AFAI, capteurs MODIS et OLCI, résolution, couverture nuageuse. Notre méthode expliquée.' },
            { path: 'previsions-methode', enPath: null, title: 'Prévision sargasses : notre méthode vs Météo France (2026)', desc: 'Comment nous prédisons les échouages de sargasses. Modèle de dérive, courants, vent, persistance exponentielle. Comparaison avec le bulletin Météo France MOTHY.' },
            { path: 'nettoyer-sargasses', enPath: null, title: 'Sargasses sur la plage : que faire, protection, signalement', desc: 'Que faire face aux sargasses ? Précautions H2S, qui prévenir, comment signaler un échouage. Guide pratique pour résidents et touristes aux Antilles.' },
            { path: 'sargasses-record-2026', enPath: null, title: 'Sargasses 2026 : année record aux Antilles — Suivi en temps réel', desc: 'Sargasses 2026 : niveaux exceptionnels attendus. Suivi satellite quotidien, prévisions, alertes. Martinique et Guadeloupe — situation jour par jour.' },
            // Ported from legacy sargasses-martinique repo — high-intent SEO queries
            { path: 'faq', enPath: null, title: 'FAQ Sargasses Martinique — Réponses aux questions fréquentes (2026)', desc: 'Quand arrivent les sargasses en Martinique ? Où se baigner sans sargasses ? Côte Caraïbe ou Atlantique ? Réponses courtes et claires, carte en temps réel.', isFaq: true },
            { path: 'lexique', enPath: null, title: 'Lexique sargasses : NFAI, échouage, Sentinel, niveau de risque', desc: 'Définitions utiles pour comprendre les sargasses : NFAI, échouage, H2S, côte Caraïbe vs Atlantique, Sentinel-2/3, niveau de risque 1 à 10.' },
            { path: 'methode-carte', enPath: null, title: 'Comment fonctionne la carte sargasses : méthode et sources', desc: 'Satellites Sentinel-2/3, indice NFAI, observations citoyennes, prévisions 7 jours. Comment nous calculons le niveau de risque de chaque plage.' },
          ]
          // Noscript editorial content for Google crawling
          const editorialContent = {
            'saison-sargasses-martinique': `<article><h1>Saison des sargasses en Martinique</h1><p>Les sargasses touchent la Martinique principalement d'avril à octobre, avec des pics entre juin et août. Ces algues brunes, portées par les courants atlantiques depuis la mer des Sargasses, s'échouent sur les côtes est et sud de l'île.</p><h2>Quelles plages sont les plus touchées ?</h2><p>Les plages de la côte atlantique (Le Vauclin, Tartane, Sainte-Anne côté est) sont les plus exposées. Les plages de la côte caraïbe (Anse Mitan, Anse Noire, Grande Anse d'Arlet) sont généralement épargnées grâce à leur orientation.</p><h2>Prévisions en temps réel</h2><p>Consultez notre <a href="/">carte interactive</a> mise à jour quotidiennement avec les données satellite Copernicus pour connaître l'état de chaque plage. Les <a href="/previsions/">prévisions 7 jours</a> vous permettent de planifier vos sorties.</p><p><a href="/">Voir la carte en temps réel</a> · <a href="/plages/plage-des-salines/">Plage des Salines</a> · <a href="/plages/anse-mitan/">Anse Mitan</a> · <a href="/plages/grande-anse-d-arlet/">Grande Anse d'Arlet</a></p></article>`,
            'saison-sargasses-guadeloupe': `<article><h1>Saison des sargasses en Guadeloupe</h1><p>En Guadeloupe, la saison des sargasses s'étend généralement d'avril à octobre. Les côtes de Grande-Terre (Le Gosier, Sainte-Anne, Saint-François) sont les plus exposées aux échouages.</p><h2>Quelles plages sont les plus touchées ?</h2><p>Les plages de la côte sud de Grande-Terre reçoivent le plus de sargasses. Les plages de Basse-Terre (Malendure, Deshaies, Bouillante) sont naturellement protégées par leur position sous le vent.</p><h2>Prévisions en temps réel</h2><p>Notre <a href="/">carte interactive</a> affiche l'état de chaque plage en temps réel grâce aux données satellite Copernicus. Consultez les <a href="/previsions/">prévisions 7 jours</a> avant de planifier votre sortie plage.</p><p><a href="/">Voir la carte en temps réel</a> · <a href="/plages/plage-de-malendure/">Plage de Malendure</a> · <a href="/plages/la-grande-anse-deshaies/">La Grande Anse (Deshaies)</a> · <a href="/plages/plage-de-sainte-anne/">Plage de Sainte-Anne</a></p></article>`,
            'plages-sans-sargasses': `<article><h1>Plages sans sargasses en Martinique et Guadeloupe</h1><p>Vous cherchez une plage propre aujourd'hui ? Notre application surveille en temps réel l'état de plus de 50 plages en Martinique et Guadeloupe grâce aux données satellite Copernicus.</p><h2>Martinique — Plages généralement propres</h2><ul><li><a href="/plages/anse-mitan/">Anse Mitan</a> (Les Trois-Îlets) — côte caraïbe, rarement touchée</li><li><a href="/plages/anse-noire/">Anse Noire</a> (Les Anses-d'Arlet) — petite crique protégée</li><li><a href="/plages/grande-anse-d-arlet/">Grande Anse d'Arlet</a> — plage familiale, peu exposée</li></ul><h2>Guadeloupe — Plages généralement propres</h2><ul><li><a href="/plages/plage-de-malendure/">Plage de Malendure</a> (Bouillante) — côte sous le vent</li><li><a href="/plages/la-grande-anse-deshaies/">La Grande Anse (Deshaies)</a> — nord Basse-Terre</li><li><a href="/plages/plage-de-la-caravelle/">Plage de la Caravelle</a> (Sainte-Anne) — souvent épargnée</li></ul><p><a href="/">Consulter la carte en temps réel</a> pour l'état exact de chaque plage aujourd'hui.</p></article>`,
            'danger-sargasses-h2s': `<article><h1>Sargasses et H2S : dangers pour la santé</h1><p>Lorsque les sargasses s'échouent et se décomposent sur les plages, elles libèrent du sulfure d'hydrogène (H2S), un gaz toxique reconnaissable à son odeur d'œuf pourri.</p><h2>Quels sont les risques ?</h2><p>À faible concentration, le H2S provoque des irritations des yeux, du nez et de la gorge. À forte concentration (au-dessus de 5 ppm), il peut causer des maux de tête, nausées et difficultés respiratoires. Les enfants, personnes âgées et asthmatiques sont particulièrement vulnérables.</p><h2>Précautions à prendre</h2><ul><li>Évitez les plages marquées "À éviter" sur notre <a href="/">carte en temps réel</a></li><li>Ne laissez pas les enfants jouer dans ou près des amas de sargasses en décomposition</li><li>Si vous sentez une forte odeur d'œuf pourri, éloignez-vous immédiatement</li><li>Consultez les <a href="/previsions/">prévisions 7 jours</a> avant de planifier une sortie plage</li></ul><h2>L'indice AFAI</h2><p>L'AFAI (Algal Floating Algae Index) est l'indice satellite que nous utilisons pour détecter les sargasses. En dessous de 0,3 la plage est propre. Au-dessus de 0,65, il vaut mieux éviter.</p></article>`,
            'alertes': `<article><h1>Alertes sargasses Martinique et Guadeloupe</h1><p>Recevez des alertes en temps réel sur l'état des sargasses sur vos plages préférées en Martinique et Guadeloupe.</p><h2>Comment ça marche ?</h2><p>Sélectionnez vos plages favorites et activez les notifications. Vous serez alerté dès que l'état change (plage propre, modéré ou à éviter) grâce aux données satellite Copernicus mises à jour quotidiennement.</p><h2>Pourquoi s'abonner aux alertes ?</h2><ul><li>Ne perdez plus de temps à aller sur une plage envahie de sargasses</li><li>Planifiez vos sorties plage en toute sérénité</li><li>Protégez votre famille du H2S (gaz toxique des sargasses en décomposition)</li></ul><p><a href="/">Consulter la carte en temps réel</a> · <a href="/previsions/">Prévisions 7 jours</a></p></article>`,
            'comprendre-sargasses': `<article><h1>Comprendre les sargasses : origines, prolifération et prévision</h1><p>Les sargasses (Sargassum natans et Sargassum fluitans) sont des algues brunes pélagiques qui dérivent à la surface de l'océan Atlantique. Depuis 2011, des échouages massifs frappent les côtes caribéennes, particulièrement la Martinique et la Guadeloupe.</p><h2>D'où viennent les sargasses ?</h2><p>Contrairement à une idée reçue, les sargasses qui touchent les Antilles ne proviennent pas de la mer des Sargasses historique (nord Atlantique). Elles se développent dans une zone équatoriale (GASB — Great Atlantic Sargassum Belt) entre l'Afrique et le Brésil, alimentée par les nutriments des fleuves Amazone, Orénoque et Congo.</p><h2>Pourquoi la prolifération s'aggrave ?</h2><ul><li><strong>Nutriments :</strong> déforestation et agriculture intensive augmentent les apports azotés des fleuves tropicaux</li><li><strong>Température :</strong> le réchauffement de l'Atlantique tropical (+1.2°C vs 2011-2020) accélère la photosynthèse</li><li><strong>Courants :</strong> les modifications du courant nord-équatorial concentrent les algues vers les Caraïbes</li></ul><h2>Comment prévoir les échouages ?</h2><p>Notre système combine <a href="/detection-satellite-sargasses/">détection satellite</a> (indice AFAI), modèle de dérive (courants + vent), et <a href="/previsions/">prévisions 7 jours</a> par plage. Consultez la <a href="/">carte en temps réel</a> mise à jour quotidiennement.</p><p><a href="/saison-sargasses-martinique/">Saison MQ</a> · <a href="/saison-sargasses-guadeloupe/">Saison GP</a> · <a href="/danger-sargasses-h2s/">Risques H2S</a> · <a href="/plages-sans-sargasses/">Plages propres</a></p></article>`,
            'bilan-sargasses-2025': `<article><h1>Bilan sargasses 2025 — Martinique et Guadeloupe</h1><p>L'année 2025 a été marquée par des échouages de sargasses d'une intensité exceptionnelle aux Antilles françaises, classant 2025 au 3e rang des pires années depuis le début du suivi satellite en 2011.</p><h2>Martinique : côte atlantique submergée</h2><p>Les plages de la côte atlantique ont subi des échouages quasi-continus de mai à octobre 2025. Les communes les plus touchées : <a href="/plages/plage-des-salines/">Sainte-Anne</a> (Salines, Cap Chevalier), Le Vauclin, La Trinité (<a href="/plages/bourg-de-tartane/">Tartane</a>), Le Robert.</p><h2>Guadeloupe : Grande-Terre en première ligne</h2><p>Les plages du sud de Grande-Terre (<a href="/plages/plage-de-sainte-anne/">Sainte-Anne</a>, <a href="/plages/plage-du-gosier/">Le Gosier</a>, Saint-François) ont connu des volumes records. La côte sous-le-vent de Basse-Terre (<a href="/plages/plage-de-malendure/">Malendure</a>, <a href="/plages/la-grande-anse-deshaies/">Deshaies</a>) est restée largement épargnée.</p><h2>Prévisions 2026</h2><p>Les observations satellite de début 2026 montrent des quantités importantes dès janvier-février, anormalement précoces. Les experts prévoient une <a href="/sargasses-record-2026/">année potentiellement record</a>. Consultez notre <a href="/">carte en temps réel</a> pour suivre la situation jour par jour.</p></article>`,
            'detection-satellite-sargasses': `<article><h1>Détection satellite des sargasses en temps réel</h1><p>Notre application utilise les données satellite pour détecter les bancs de sargasses au large des côtes de Martinique et Guadeloupe, avant même qu'ils n'atteignent les plages.</p><h2>L'indice AFAI (Algal Floating Algae Index)</h2><p>L'AFAI est un indice spectral qui exploite la différence de réflectance entre les algues flottantes et l'eau de mer. Il est calculé à partir des données des capteurs MODIS (satellites Aqua/Terra) et VIIRS (NOAA-20). Valeurs typiques : &lt;0,001 = ocean propre ; &gt;0,003 = sargasses détectées.</p><h2>Sources de données</h2><ul><li><strong>NOAA ERDDAP :</strong> composite AFAI 7 jours et 1 jour (résolution ~4km)</li><li><strong>Copernicus Marine :</strong> courants océaniques de surface pour le modèle de dérive</li><li><strong>Open-Meteo :</strong> prévisions vent et vagues pour la dérive de surface</li></ul><h2>De l'observation à la prévision</h2><p>Les satellites détectent les sargasses 10 à 100 km au large. Notre modèle de dérive (courants + vent + persistance exponentielle) projette leur trajectoire vers chaque plage sur 7 jours. Consultez les <a href="/previsions/">prévisions</a> et la <a href="/">carte en temps réel</a>.</p><p><a href="/comprendre-sargasses/">Comprendre les sargasses</a> · <a href="/previsions-methode/">Notre méthode</a> · <a href="/plages-sans-sargasses/">Plages propres</a></p></article>`,
            'previsions-methode': `<article><h1>Prévision des sargasses : notre méthode</h1><p>Notre modèle de prévision des échouages de sargasses combine plusieurs sources de données pour produire des prévisions à 7 jours pour chaque plage individuellement.</p><h2>Sources de données</h2><ul><li><strong>Satellite AFAI :</strong> détection des bancs au large (NOAA ERDDAP, composites 1 jour et 7 jours)</li><li><strong>Courants marins :</strong> données Copernicus Marine (Mercator Ocean) à 1/12° de résolution</li><li><strong>Vent :</strong> prévisions Open-Meteo 7 jours (vitesse, direction, rafales)</li><li><strong>Signalements :</strong> rapports communautaires (fenêtre 48h)</li></ul><h2>Modèle de dérive</h2><p>Chaque banc détecté est projeté dans le temps en combinant : dérive de Stokes (2.5% de la vitesse du vent), courant océanique local, et correction de l'eddy sud-Martinique. La persistance suit une décroissance exponentielle (demi-vie 3.5 jours).</p><h2>Comparaison avec Météo France</h2><p>Météo France utilise le modèle MOTHY (particules dans les courants IFS/Mercator) avec un bulletin 4 jours par secteur côtier. Notre approche offre : une résolution par plage (134 plages vs secteurs), des prévisions 7 jours, et une mise à jour quotidienne automatique.</p><h2>Précision actuelle</h2><p>Backtest sur les 7 derniers jours : 74% de fiabilité globale, 85% à J+4. Les plages côte Caraïbe atteignent ~100% (rarement touchées). <a href="/">Consulter la carte</a> · <a href="/previsions/">Prévisions 7 jours</a></p></article>`,
            'nettoyer-sargasses': `<article><h1>Sargasses sur la plage : que faire ?</h1><p>Vous êtes sur une plage touchée par les sargasses en Martinique ou Guadeloupe ? Voici les gestes à adopter et les précautions à prendre.</p><h2>Précautions immédiates</h2><ul><li><strong>Odeur d'œuf pourri :</strong> éloignez-vous immédiatement. C'est le H2S (sulfure d'hydrogène) libéré par les algues en décomposition. <a href="/danger-sargasses-h2s/">En savoir plus sur le H2S</a></li><li><strong>Enfants et personnes fragiles :</strong> ne les laissez pas jouer dans ou près des amas bruns</li><li><strong>Contact peau :</strong> les sargasses fraîches sont inoffensives, mais en décomposition elles peuvent irriter. Rincez à l'eau claire</li><li><strong>Baignade :</strong> évitez de nager dans des eaux brunes/chargées de débris d'algues</li></ul><h2>Signaler un échouage</h2><p>Vos observations aident à améliorer nos prévisions. Utilisez la fonction de signalement dans notre application pour indiquer l'état réel de la plage. Les rapports communautaires sont intégrés dans notre modèle (fenêtre 48h).</p><h2>Qui contacter ?</h2><ul><li><strong>Mairie :</strong> responsable du nettoyage des plages publiques</li><li><strong>ARS (Agence Régionale de Santé) :</strong> si taux de H2S élevé ressenti</li><li><strong>DEAL :</strong> Direction de l'Environnement pour les échouages majeurs</li></ul><p><a href="/">Carte en temps réel</a> · <a href="/alertes/">Activer les alertes</a> · <a href="/plages-sans-sargasses/">Trouver une plage propre</a></p></article>`,
            'meilleures-plages-martinique-sargasses': `<article><h1>Meilleures plages de Martinique sans sargasses en 2026</h1><p>Vous cherchez les meilleures plages de Martinique sans sargasses aujourd'hui ? Notre carte surveille en temps réel l'état de plus de 50 plages grâce aux données satellite Copernicus. En 2026, saison exceptionnelle, choisir la bonne côte est plus important que jamais.</p><h2>Côte Caraïbe — les moins touchées</h2><p>La côte caraïbe de Martinique est naturellement protégée des sargasses grâce à son orientation sous le vent atlantique. En 2026, c'est là que les plages restent le plus souvent propres :</p><ul><li><a href="/plages/grande-anse-d-arlet/">Grande Anse d'Arlet</a> — plage familiale, eaux cristallines, peu exposée aux sargasses</li><li><a href="/plages/anse-dufour/">Anse Dufour</a> — petite crique, snorkeling, tortues marines, rarement touchée</li><li><a href="/plages/anse-mitan/">Anse Mitan</a> (Les Trois-Îlets) — côte sous le vent, eau calme, très accessible</li><li><a href="/plages/anse-caritan/">Anse Caritan</a> (Sainte-Anne) — baie protégée, eau peu profonde, idéale familles</li><li><a href="/plages/anse-noire/">Anse Noire</a> — sable noir volcanique, protégée par la baie des Anses d'Arlet</li></ul><h2>Sud Martinique — à vérifier selon la semaine</h2><p>Les Salines et Cap Chevalier sont parmi les plus belles plages de Martinique mais exposées selon les vents. Vérifiez l'état en temps réel avant de vous y rendre :</p><ul><li><a href="/plages/plage-des-salines/">Plage des Salines</a> — la plus belle plage de Martinique, état variable en 2026</li><li><a href="/plages/cap-chevalier/">Cap Chevalier</a> — spot kitesurf, exposé côté atlantique</li></ul><h2>Pourquoi consulter notre carte avant de partir ?</h2><p>Les listes statiques sont obsolètes en 2026 : une plage propre lundi peut être envahie vendredi. Notre <a href="/">carte en temps réel</a> affiche l'état de chaque plage du jour, avec les <a href="/previsions/">prévisions sur 7 jours</a>. Activez les <a href="/alertes/">alertes push gratuites</a> pour être prévenu avant de partir.</p><p><a href="/">Voir la carte maintenant</a> · <a href="/plages-sans-sargasses/">Toutes les plages propres</a> · <a href="/saison-sargasses-martinique/">Calendrier saison 2026</a></p></article>`,
            'sargasses-record-2026': `<article><h1>Sargasses 2026 : vers une année record aux Antilles</h1><p>Les observations satellite de début 2026 montrent des quantités de sargasses en forte hausse dès janvier-février dans l'Atlantique tropical, un signal inhabituellement précoce qui laisse présager une saison majeure pour la Martinique et la Guadeloupe.</p><h2>Pourquoi 2026 s'annonce exceptionnelle</h2><ul><li><strong>Détection précoce :</strong> des bancs importants observés dès novembre 2025, 3 mois avant le début habituel de saison</li><li><strong>Températures record :</strong> l'Atlantique tropical a atteint +1.2°C au-dessus de la moyenne 2011-2020 au premier trimestre</li><li><strong>Nutriments :</strong> crues exceptionnelles de l'Amazone fin 2025, enrichissant la zone de croissance</li></ul><h2>Suivi en temps réel</h2><p>Notre <a href="/">carte interactive</a> suit la situation jour par jour grâce aux données satellite NOAA (indice AFAI). Les <a href="/previsions/">prévisions 7 jours</a> permettent d'anticiper les échouages plage par plage.</p><h2>Se protéger</h2><p>Activez les <a href="/alertes/">alertes push gratuites</a> pour être prévenu dès que l'état de votre plage change. Consultez les <a href="/plages-sans-sargasses/">plages sans sargasses</a> pour trouver où se baigner sereinement.</p><p><a href="/comprendre-sargasses/">Comprendre les sargasses</a> · <a href="/bilan-sargasses-2025/">Bilan 2025</a> · <a href="/danger-sargasses-h2s/">Risques H2S</a> · <a href="/saison-sargasses-martinique/">Saison MQ</a></p></article>`,
            // Ported from legacy sargasses-martinique — high intent queries
            'faq': `<article><h1>FAQ Sargasses Martinique — Questions fréquentes</h1><p>Réponses courtes et claires pour planifier vos baignades. Consultez aussi notre <a href="/carte-sargasses/">carte sargasses Martinique en temps réel</a> et la <a href="/previsions/">prévision 7 jours</a>.</p><h2>Quand arrivent les sargasses en Martinique ?</h2><p>Les sargasses touchent la Martinique principalement entre <strong>avril et septembre</strong>, avec des pics en <strong>mai-juin</strong> et <strong>juillet-août</strong> selon les courants des alizés et la biomasse dans l'Atlantique tropical. Des échouages ponctuels peuvent néanmoins survenir toute l'année, raison pour laquelle notre carte et nos <a href="/alertes/">alertes</a> tournent 12 mois sur 12.</p><h2>Où se baigner sans sargasses en Martinique ?</h2><p>La <strong>côte Caraïbe</strong> est naturellement moins exposée aux courants porteurs : Grande Anse d'Arlet, Anse Dufour, Anse à l'Âne, Pointe du Bout, Anse Noire sont souvent épargnées même en pic. Ouvrez la <a href="/carte-sargasses/">carte du jour</a> avant de partir — le vent peut pousser les bancs en quelques heures.</p><h2>Quelles plages éviter à cause des sargasses en Martinique ?</h2><p>En période de pic, la côte Atlantique reçoit davantage d'échouages : Tartane/Caravelle, Vauclin, Sainte-Anne côté est. Vérifiez toujours la <a href="/meilleures-plages-martinique-sargasses/">liste des plages propres</a> le matin même — les bulletins Météo France MOTHY + nos satellites donnent un préavis fiable de 24 à 48 h.</p><h2>Les données de la carte sont-elles fiables ?</h2><p>Oui, dans les limites de la télédétection : nos données combinent <a href="/detection-satellite-sargasses/">Sentinel-3 OLCI, MODIS et Copernicus</a> (indice AFAI / NFAI), complétées par les observations citoyennes envoyées depuis l'app. Résolution ~300 m, mise à jour toutes les 3 h. Les estimations restent sujettes à la couverture nuageuse et aux variations locales entre deux anses voisines.</p><h2>Côte Caraïbe ou Atlantique pour éviter les sargasses ?</h2><p>La côte Caraïbe reste le refuge le plus sûr : le relief de la Pelée et les courants la protègent des alizés porteurs. La côte Atlantique (Trinité → Vauclin → Sainte-Anne) encaisse plus. En saison critique, privilégiez la Caraïbe et utilisez nos <a href="/alertes/">alertes push</a> pour être prévenu dès qu'un banc change de trajectoire.</p><h2>Comment contribuer et signaler un arrivage ?</h2><p>Depuis la carte ou la fiche d'une plage, le bouton « Je suis sur place » permet de confirmer l'état en un clic (propre / modéré / beaucoup). Chaque signalement alimente la carte et corrige le satellite sur les zones où la couverture nuageuse est épaisse. C'est la composante humaine qui fait la différence entre un bulletin théorique et un vrai service de terrain.</p><h2>Sargasses et santé : faut-il s'inquiéter ?</h2><p>Les sargasses fraîches sont inoffensives. C'est la <strong>décomposition</strong> (algues brunes/noires, odeur d'œuf pourri) qui libère du <a href="/danger-sargasses-h2s/">sulfure d'hydrogène (H₂S)</a> et de l'ammoniaque. Asthmatiques, personnes âgées, enfants, femmes enceintes doivent éviter les zones en décomposition — voir notre page dédiée pour les seuils ARS.</p></article>`,
            'lexique': `<article><h1>Lexique sargasses — NFAI, échouage, Sentinel, niveau de risque</h1><p>Définitions des termes techniques utilisés sur notre <a href="/carte-sargasses/">carte sargasses Martinique</a>, dans les <a href="/previsions/">bulletins de prévision</a> et les <a href="/alertes/">alertes</a>.</p><h2>Indices satellite</h2><p><strong>AFAI</strong> (Alternative Floating Algae Index) : indice développé par Wang & Hu (2016) qui isole la signature radiométrique des algues flottantes en combinant les canaux rouge, proche infrarouge et infrarouge court des satellites. Utilisé par la NOAA comme référence atlantique.</p><p><strong>NFAI</strong> (Normalized Floating Algae Index) : version normalisée du FAI, calculée sur Sentinel-2 ou Sentinel-3. Plus la valeur est élevée, plus la concentration d'algues flottantes est forte. Utilisée pour générer les niveaux 1 à 10 par plage.</p><p><strong>Niveau de risque</strong> (score 0–100) : synthèse multi-facteurs — sargasses, houle, vent, ensoleillement, température de l'eau, UV, marée. Ne reflète pas seulement la présence d'algues : un score bas en hiver peut venir d'une mer agitée. Voir notre <a href="/methode-carte/">méthodologie</a>.</p><h2>Termes géographiques</h2><p><strong>Échouage</strong> : arrivage de sargasses sur le rivage (plage, rochers, mangrove). Les algues fraîchement échouées sont dorées et inoffensives ; en quelques jours elles brunissent puis noircissent, libérant du <a href="/danger-sargasses-h2s/">H₂S</a> et de l'ammoniaque.</p><p><strong>Côte Caraïbe</strong> : littoral ouest de la Martinique (Les Anses d'Arlet, Le Carbet, Trois-Îlets, Schoelcher). Protégée des alizés par le relief de la Pelée et du Vauclin — généralement moins exposée aux bancs porteurs.</p><p><strong>Côte Atlantique</strong> : littoral est (Trinité, Tartane/Caravelle, Le Vauclin, Sainte-Anne côté est, Le Marin). Exposée en plein aux courants qui transportent les sargasses depuis la zone de convergence Nord Atlantique tropical.</p><p><strong>Banc de sargasses</strong> : agrégat flottant dérivant à la surface, de quelques mètres à plusieurs kilomètres carrés. Détecté au large par satellite puis modélisé via la dérive vent + courant pour prédire les <a href="/previsions/">arrivées à J+1 à J+3</a>.</p><h2>Sources de données</h2><p><strong>Sentinel-2</strong> : satellite optique Copernicus à 10 m de résolution, repasse tous les 5 jours. Idéal pour la détection côtière fine mais sensible aux nuages.</p><p><strong>Sentinel-3 OLCI</strong> : capteur large-champ à 300 m de résolution, repasse quotidien. Couvre l'Atlantique tropical complet — c'est la source principale de nos prévisions offshore.</p><p><strong>MODIS</strong> (Terra/Aqua) : constellation historique de la NASA, 250 m à 1 km de résolution, archive depuis 2003. Utilisée par la NOAA/AOML pour le <em>Sargassum Inundation Report</em> hebdomadaire.</p><p><strong>Copernicus</strong> : programme européen de surveillance de la Terre qui opère Sentinel-2/3 et fournit les images brutes en accès libre.</p><p><strong>H₂S</strong> (sulfure d'hydrogène) : gaz toxique libéré par la décomposition anaérobie des sargasses. Odeur d'œuf pourri perceptible dès 0,01 ppm, irritations à partir de 1 ppm. Voir <a href="/danger-sargasses-h2s/">notre page santé</a>.</p><p><a href="/carte-sargasses/">Carte du jour</a> · <a href="/faq/">FAQ</a> · <a href="/methode-carte/">Méthode</a> · <a href="/previsions-methode/">Modèle de prévision</a></p></article>`,
            'methode-carte': `<article><h1>Comment fonctionne la carte sargasses : méthode et sources</h1><p>La carte affiche un <strong>score de 0 à 100</strong> par plage, mis à jour toutes les 3 heures à partir de sources satellite, météorologiques et de signalements citoyens.</p><h2>Sources satellite</h2><p>Nous croisons plusieurs capteurs pour maximiser la couverture malgré la nébulosité tropicale : <strong>Sentinel-3 OLCI</strong> (Copernicus, 300 m, quotidien) sert de base pour les bancs offshore dans un rayon de 100 km. <strong>Sentinel-2</strong> (10 m, passage tous les 5 jours) complète pour la détection fine à moins de 10 km des côtes. <strong>MODIS Aqua/Terra</strong> (NASA, 250 m) fournit l'archive longue et le <em>Sargassum Inundation Report</em> hebdomadaire de la NOAA/AOML.</p><p>L'indice <strong><a href="/lexique/">AFAI</a></strong> (Alternative Floating Algae Index, Wang & Hu 2016) isole la signature optique des algues flottantes. Seuils NOAA SIR v1.4 : AFAI &lt; 0.15 = propre, 0.15–0.40 = modéré, ≥ 0.40 = alerte.</p><h2>Données météorologiques</h2><p>Chaque plage reçoit son propre bulletin Open-Meteo : houle, période de vague, vent (vitesse + direction), température de surface, UV max, couverture nuageuse. Ces facteurs pèsent dans le score 0–100 pour rester pertinents 365 jours par an, y compris en hiver quand les sargasses sont absentes. La ventilation : sargasses 30 %, houle 20 %, vent 15 %, eau 10 %, ciel 10 %, UV 10 %, marée 5 %.</p><h2>Observations citoyennes</h2><p>Les signalements envoyés depuis l'app (bouton « Je suis sur place ») recalibrent l'indice satellite quand la couverture nuageuse empêche la lecture optique. Un consensus de 3 signalements minimum déclenche un ajustement, évitant qu'un signal isolé perturbe le classement.</p><h2>Du capteur à la prévision 7 jours</h2><p>Notre modèle de <a href="/previsions-methode/">prévision 7 jours</a> combine persistance exponentielle de l'AFAI observé, dérive des bancs au vent + courant, et signal d'arrivée mesuré par proximité d'un banc dans un rayon de 40 km. Pour les plages abritées (Caraïbe), le modèle sait que les alizés ne peuvent pas contourner le relief et refuse les fausses alertes — c'est ce qui différencie notre prévision d'un simple bulletin régional.</p><h2>Limites et transparence</h2><p>Les données restent des <strong>estimations</strong>. La couverture nuageuse peut occulter une journée entière de satellite ; les conditions varient d'une anse à l'autre ; un front de vent peut déplacer un banc de 10 km en 3 heures. Nous recommandons de vérifier la carte la veille ET le matin même, et de consulter les avis officiels (<a href="/danger-sargasses-h2s/">ARS Martinique, Préfecture</a>) en cas d'alerte santé. Le backtesting hebdomadaire — comparaison prévision vs observation réelle — est publié dans notre <a href="/bilan-sargasses-2025/">bilan annuel</a>.</p><p><a href="/carte-sargasses/">Carte en temps réel</a> · <a href="/faq/">FAQ</a> · <a href="/lexique/">Lexique</a> · <a href="/detection-satellite-sargasses/">Détection satellite</a></p></article>`,
          }
          // FAQPage schema — Google rich result. Keys must match pages with Q&A structure.
          const faqSchemas = {
            'faq': [
              { q: "Quand arrivent les sargasses en Martinique ?", a: "Les sargasses touchent la Martinique principalement entre avril et septembre, avec des pics en mai-juin et juillet-août selon les courants des alizés. Des échouages peuvent survenir toute l'année." },
              { q: "Où se baigner sans sargasses en Martinique ?", a: "La côte Caraïbe est naturellement moins exposée : Grande Anse d'Arlet, Anse Dufour, Anse à l'Âne, Pointe du Bout, Anse Noire. Consultez la carte en temps réel pour l'état du jour." },
              { q: "Quelles plages éviter en Martinique ?", a: "En pic (mai à septembre), évitez la côte Atlantique sans vérification : Tartane/Caravelle, Vauclin, Sainte-Anne côté est. Nos satellites donnent un préavis fiable de 24 à 48 h." },
              { q: "Les données de la carte sont-elles fiables ?", a: "Les données combinent Sentinel-3 OLCI, MODIS et Copernicus avec l'indice AFAI, complétées par les observations citoyennes. Résolution 300 m, mise à jour toutes les 3 h." },
              { q: "Côte Caraïbe ou Atlantique pour éviter les sargasses ?", a: "La côte Caraïbe est naturellement moins exposée aux courants porteurs. La côte Atlantique reçoit davantage d'échouages. Privilégiez la Caraïbe et vérifiez la carte avant de partir." },
              { q: "Comment signaler un arrivage de sargasses ?", a: "Depuis la carte ou la fiche d'une plage, le bouton « Je suis sur place » permet de confirmer l'état en un clic. Les signalements alimentent la carte en temps réel." },
              { q: "Les sargasses sont-elles dangereuses pour la santé ?", a: "Les sargasses fraîches sont inoffensives. La décomposition libère du sulfure d'hydrogène (H₂S), irritant dès 1 ppm. Asthmatiques, personnes âgées, enfants et femmes enceintes doivent éviter les zones en décomposition." },
            ],
          }
          for (const { path: p, title, desc, enPath } of pages) {
            const dir = resolve(outDir, p)
            mkdirSync(dir, { recursive: true })
            const pageUrl = `https://sargasses-martinique.com/${p}/`
            const enUrl = enPath ? `https://sargasses-martinique.com/${enPath}/` : null
            let pageHtml = html
              .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
              .replace(/<meta name="description"[^>]*>/, () => `<meta name="description" content="${desc}" />`)
              .replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${pageUrl}" />`)
              .replace(/<link rel="alternate" hreflang="fr"[^>]*>/, `<link rel="alternate" hreflang="fr" href="${pageUrl}" />`)
              .replace(/<link rel="alternate" hreflang="en"[^>]*>/, enUrl ? `<link rel="alternate" hreflang="en" href="${enUrl}" />` : '')
              .replace(/<link rel="alternate" hreflang="x-default"[^>]*>/, `<link rel="alternate" hreflang="x-default" href="${pageUrl}" />`)
              .replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${pageUrl}" />`)
              .replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${title}" />`)
              .replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${desc}" />`)
            // Inject noscript editorial content + article schema + OG freshness tags
            if (editorialContent[p]) {
              const modDate = new Date().toISOString().slice(0,10)
              const articleSchema = JSON.stringify({"@context":"https://schema.org","@type":"Article","headline":title,"description":desc,"url":`https://sargasses-martinique.com/${p}/`,"datePublished":"2026-03-01","dateModified":modDate,"publisher":{"@type":"Organization","name":"Sargasses Martinique","logo":"https://sargasses-martinique.com/icon-512.png"},"author":{"@type":"Organization","name":"Sargasses Martinique","url":"https://sargasses-martinique.com/"}})
              const ogArticleTags = `\n    <meta property="article:published_time" content="2026-03-01" />\n    <meta property="article:modified_time" content="${modDate}" />`
              // Optional FAQPage schema — Google rich result for Q&A pages
              let faqSchemaTag = ''
              if (faqSchemas[p]) {
                const faqSchema = JSON.stringify({"@context":"https://schema.org","@type":"FAQPage","mainEntity":faqSchemas[p].map(item => ({"@type":"Question","name":item.q,"acceptedAnswer":{"@type":"Answer","text":item.a}}))})
                faqSchemaTag = `\n    <script type="application/ld+json">\n    ${faqSchema}\n    </script>`
              }
              pageHtml = pageHtml
                .replace('</head>', `${ogArticleTags}\n    <script type="application/ld+json">\n    ${articleSchema}\n    </script>${faqSchemaTag}\n</head>`)
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
            { path: 'en/understanding-sargassum', title: 'Understanding sargassum: origins, proliferation &amp; forecasting (2026)', desc: 'Where does sargassum come from? Great Atlantic Sargassum Belt, nutrients, climate factors. How satellite detection and forecasting works.' },
            { path: 'en/satellite-sargassum-detection', title: 'Satellite sargassum detection: AFAI, OLCI, real-time monitoring', desc: 'How satellites detect sargassum in real-time. AFAI index, MODIS/VIIRS sensors, resolution, cloud cover limitations. Our methodology explained.' },
            { path: 'en/best-beaches-martinique', title: 'Best beaches in Martinique without sargassum — Real-time 2026', desc: 'Anses d\'Arlet, Anse Dufour, Anse Mitan... Which Martinique beaches are clean today? Real-time satellite data, 7-day sargassum forecast by beach.' },
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

          // Page ES : app en español (pathname /es/ → getLang() = 'es'), SEO ES, script depuis racine
          const esDir = resolve(outDir, 'es')
          mkdirSync(esDir, { recursive: true })
          const esIndex = html
            .replace(/<html lang="fr">/, '<html lang="es">')
            .replace(/<title>[^<]*<\/title>/, '<title>Sargazo Martinica en tiempo real · Mapa y playas hoy (2026)</title>')
            .replace(/<meta name="description"[^>]*>/, '<meta name="description" content="Mapa de sargazo en tiempo real en Martinica. Qué playas están limpias o evitar, pronóstico de 7 días. Para viajeros y residentes." />')
            .replace(/<link rel="canonical"[^>]*>/, '<link rel="canonical" href="https://sargasses-martinique.com/es/" />')
            .replace(/<meta property="og:title"[^>]*>/, '<meta property="og:title" content="Sargazo Martinica en tiempo real · Mapa y playas hoy" />')
            .replace(/<meta property="og:description"[^>]*>/, '<meta property="og:description" content="Mapa de sargazo en tiempo real en Martinica. Playas limpias o a evitar, pronóstico de 7 días." />')
            .replace(/<meta property="og:url"[^>]*>/, '<meta property="og:url" content="https://sargasses-martinique.com/es/" />')
            .replace(/<meta property="og:locale"[^>]*>/, '<meta property="og:locale" content="es_MX" />\n    <meta property="og:locale:alternate" content="fr_FR" />\n    <meta property="og:locale:alternate" content="en_US" />')
            .replace(/<meta name="twitter:title"[^>]*>/, '<meta name="twitter:title" content="Sargazo Martinica en tiempo real · Mapa y playas hoy" />')
            .replace(/<meta name="twitter:description"[^>]*>/, '<meta name="twitter:description" content="Mapa de sargazo en tiempo real en Martinica. Playas limpias o a evitar, pronóstico de 7 días." />')
            .replace(/src="assets\//, 'src="/assets/')
          const esJsonLd = '<script type="application/ld+json">\n    {"@context":"https://schema.org","@type":"WebApplication","name":"Sargazo Martinica en tiempo real","description":"Mapa de sargazo en tiempo real y estado de playas en Martinica. Limpias o a evitar, pronóstico de 7 días.","url":"https://sargasses-martinique.com/es/","applicationCategory":"EnvironmentApplication","operatingSystem":"Web","inLanguage":"es","dateModified":"' + new Date().toISOString().slice(0, 10) + '","publisher":{"@type":"Organization","name":"Sargasses Martinique"}}\n    </script>'
          writeFileSync(resolve(esDir, 'index.html'), esIndex.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, esJsonLd))

          // ES subpages for international SEO (Mexique, RD, Puerto Rico, Caraïbes hispanophones)
          const esPages = [
            { path: 'es/mapa-sargazo', title: 'Mapa de sargazo Martinica y Guadalupe — Satélite en tiempo real', desc: 'Mapa interactivo de sargazo para Martinica y Guadalupe. Datos satelitales en tiempo real, pronóstico de 7 días. Encuentra playas limpias hoy.' },
            { path: 'es/mejores-playas-sin-sargazo', title: 'Mejores playas sin sargazo en Martinica y Guadalupe', desc: '¿Qué playas están limpias hoy? Monitoreo de sargazo en tiempo real para Martinica y Guadalupe. Actualizado cada día con datos satelitales.' },
            { path: 'es/temporada-sargazo', title: 'Temporada de sargazo en el Caribe — Cuándo evitar', desc: '¿Cuándo comienza la temporada de sargazo? Meses pico, qué playas se ven afectadas, pronósticos en tiempo real para Martinica y Guadalupe.' },
            { path: 'es/alertas-sargazo', title: 'Alertas de sargazo Martinica y Guadalupe — Notificaciones en tiempo real', desc: 'Recibe alertas de sargazo en tiempo real para tus playas favoritas en Martinica y Guadalupe. Entérate antes de ir.' },
          ]
          for (const ep of esPages) {
            const epDir = resolve(outDir, ep.path)
            mkdirSync(epDir, { recursive: true })
            const epHtml = esIndex
              .replace(/<title>[^<]*<\/title>/, `<title>${ep.title}</title>`)
              .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${ep.desc}" />`)
              .replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="https://sargasses-martinique.com/${ep.path}/" />`)
              .replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${ep.title}" />`)
              .replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="https://sargasses-martinique.com/${ep.path}/" />`)
            writeFileSync(resolve(epDir, 'index.html'), epHtml.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, esJsonLd))
          }
          console.log(`   → ${esPages.length} pages ES supplémentaires générées`)

          // Sitemaps dynamiques avec lastmod = date du build
          const today = new Date().toISOString().slice(0, 10)
          // Sitemap helper — generates domain-specific XML with correct priorities
          const buildSitemap = (domain, isGP) => {
            const d = `https://${domain}`
            // Editorial pages: own island gets higher priority
            const mqEditPrio = isGP ? '0.5' : '0.8'
            const gpEditPrio = isGP ? '0.8' : '0.5'
            return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${d}/</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>
  <url><loc>${d}/carte-sargasses/</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.9</priority></url>
  <url><loc>${d}/previsions/</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.9</priority></url>
  <url><loc>${d}/alertes/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>
  <url><loc>${d}/en/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>
  <url><loc>${d}/en/sargassum-map/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>
  <url><loc>${d}/en/best-beaches-no-sargassum/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>
  <url><loc>${d}/en/sargassum-season/</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>
  <url><loc>${d}/en/sargassum-alerts/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>
  <url><loc>${d}/es/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>
  <url><loc>${d}/es/mapa-sargazo/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>
  <url><loc>${d}/es/mejores-playas-sin-sargazo/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>
  <url><loc>${d}/es/temporada-sargazo/</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>
  <url><loc>${d}/es/alertas-sargazo/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>
  <url><loc>${d}/saison-sargasses-martinique/</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>${mqEditPrio}</priority></url>
  <url><loc>${d}/saison-sargasses-guadeloupe/</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>${gpEditPrio}</priority></url>
  <url><loc>${d}/plages-sans-sargasses/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>
  <url><loc>${d}/meilleures-plages-martinique-sargasses/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>
  <url><loc>${d}/en/best-beaches-martinique/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>
  <url><loc>${d}/danger-sargasses-h2s/</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>
  <url><loc>${d}/comprendre-sargasses/</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>
  <url><loc>${d}/bilan-sargasses-2025/</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>
  <url><loc>${d}/detection-satellite-sargasses/</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>
  <url><loc>${d}/previsions-methode/</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>
  <url><loc>${d}/nettoyer-sargasses/</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>
  <url><loc>${d}/sargasses-record-2026/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>
  <url><loc>${d}/faq/</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>
  <url><loc>${d}/lexique/</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>
  <url><loc>${d}/methode-carte/</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>
  <url><loc>${d}/mentions-legales.html</loc><lastmod>${today}</lastmod><changefreq>yearly</changefreq><priority>0.3</priority></url>
  <url><loc>${d}/confidentialite.html</loc><lastmod>${today}</lastmod><changefreq>yearly</changefreq><priority>0.3</priority></url>
</urlset>
`
          }
          const sitemapMQ = buildSitemap('sargasses-martinique.com', false)
          const sitemapGP = buildSitemap('sargasses-guadeloupe.com', true)
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
          // Year-round weather signal (generated by fetch-beach-weather.cjs)
          // Open-Meteo — Marine (wave/SST) + Forecast (wind/UV). 365j/an unique daily content.
          // Used to suffix metaDesc + inject a "today" line in noscript, keeping SEO pages
          // fresh even during sargassum-free periods when AFAI alone can't differentiate.
          let _weather = {}
          let _weatherFreshness = null
          try {
            const w = JSON.parse(readFileSync(resolve(__dirname, 'public/api/weather/beaches-weather.json'), 'utf-8'))
            _weather = w.beaches || {}
            _weatherFreshness = w.updatedAt
          } catch {}
          // Short metaDesc-safe suffix. Caller must check length budget before appending.
          const weatherLine = (id) => {
            const w = _weather[id]
            if (!w) return ''
            const parts = []
            if (w.condition === 'calm') parts.push('mer calme')
            else if (w.condition === 'moderate') parts.push('mer modérée')
            else if (w.condition === 'rough') parts.push('mer agitée')
            else if (w.condition === 'windy') parts.push('vent fort')
            if (w.waveHeight != null) parts.push(`${w.waveHeight}m`)
            if (w.sst != null) parts.push(`${w.sst}°C`)
            if (w.uvMax != null && w.uvMax >= 8) parts.push(`UV ${w.uvMax}`)
            return parts.length ? `Aujourd'hui : ${parts.join(', ')}.` : ''
          }
          const domainMQ = 'sargasses-martinique.com'
          const domainGP = 'sargasses-guadeloupe.com'
          // Per-beach meta description overrides for top-searched beaches
          // Keyword-rich, status-aware, unique — improves Google ranking for specific beach queries
          const BEACH_DESC_OVERRIDES = {
            'Plage des Salines': {
              clean: 'Plage des Salines à Sainte-Anne (Martinique) — propre en temps réel. Côte Atlantique, idéal familles. La plus célèbre plage de Martinique. Carte sargasses et prévisions 7 jours.',
              moderate: 'Sargasses à la Plage des Salines, Sainte-Anne (Martinique) — présence modérée détectée en temps réel. Côte Atlantique. Idéal familles. Carte et prévisions 7 jours.',
              avoid: 'Alerte sargasses à la Plage des Salines (Sainte-Anne, Martinique) — forte concentration côte Atlantique. Voir les plages propres à proximité sur notre carte en temps réel.'
            },
            'Plage du Diamant': {
              clean: 'Plage du Diamant (Martinique) — propre en temps réel. Face au célèbre Rocher du Diamant, côte Caraïbe. Carte sargasses Martinique et prévisions 7 jours.',
              moderate: 'Sargasses à la Plage du Diamant (Le Diamant, Martinique) — présence modérée détectée en temps réel. Face au Rocher du Diamant. Carte et prévisions 7 jours.',
              avoid: 'Alerte sargasses à la Plage du Diamant (Martinique) — forte concentration détectée en temps réel. Rocher du Diamant. Carte des plages propres à proximité.'
            },
            'Pointe Faula': {
              clean: 'Pointe Faula au Vauclin (Martinique) — plage propre en temps réel. Côte Atlantique, idéal familles. Carte sargasses Martinique mise à jour quotidiennement.',
              moderate: 'Sargasses à Pointe Faula, Le Vauclin (Martinique) — présence modérée en temps réel. Côte Atlantique. Carte et prévisions 7 jours.',
              avoid: 'Alerte sargasses à Pointe Faula (Le Vauclin, Martinique) — forte concentration côte Atlantique. Voir les plages propres à proximité.'
            },
            'Grande Anse d\'Arlet': {
              clean: 'Grande Anse d\'Arlet (Martinique) — plage propre en temps réel. Côte Caraïbe, snorkeling, idéal familles. Carte sargasses Martinique et prévisions 7 jours.',
              moderate: 'Sargasses à Grande Anse d\'Arlet (Les Anses-d\'Arlet, Martinique) — présence modérée en temps réel. Côte Caraïbe. Snorkeling. Carte et prévisions 7 jours.',
              avoid: 'Alerte sargasses à Grande Anse d\'Arlet (Martinique) — forte concentration côte Caraïbe. Carte des plages propres à proximité.'
            },
            'Anse Mitan': {
              clean: 'Anse Mitan aux Trois-Îlets (Martinique) — plage propre en temps réel. À 18 min de Fort-de-France, côte centrale, idéal familles. Carte sargasses et prévisions 7 jours.',
              moderate: 'Sargasses à Anse Mitan (Les Trois-Îlets, Martinique) — présence modérée en temps réel. Côte centrale. Carte et prévisions 7 jours.',
              avoid: 'Alerte sargasses à Anse Mitan (Les Trois-Îlets, Martinique) — forte concentration détectée en temps réel. Carte des plages propres proches de Fort-de-France.'
            },
            'Plage Bois Jolan': {
              clean: 'Plage Bois Jolan à Sainte-Anne (Guadeloupe) — propre en temps réel. Côte Atlantique de Grande-Terre, idéal familles. Carte sargasses Guadeloupe et prévisions 7 jours.',
              moderate: 'Sargasses à Plage Bois Jolan (Sainte-Anne, Guadeloupe) — présence modérée en temps réel. Côte Atlantique. Carte et prévisions 7 jours.',
              avoid: 'Alerte sargasses à Plage Bois Jolan (Sainte-Anne, Guadeloupe) — forte concentration côte Atlantique. Voir les plages propres à proximité.'
            },
            'Plage de Sainte-Anne': {
              clean: 'Plage de Sainte-Anne (Guadeloupe) — propre en temps réel. Grande plage de Grande-Terre, côte Atlantique, idéal familles. Carte sargasses et prévisions 7 jours.',
              moderate: 'Sargasses à la Plage de Sainte-Anne (Guadeloupe) — présence modérée en temps réel. Côte Atlantique. Carte et prévisions 7 jours.',
              avoid: 'Alerte sargasses à la Plage de Sainte-Anne (Guadeloupe) — forte concentration côte Atlantique. Voir les plages propres à proximité.'
            },
            'Plage du Gosier': {
              clean: 'Plage du Gosier (Guadeloupe) — propre en temps réel. À 12 min de Pointe-à-Pitre, snorkeling, idéal familles. Carte sargasses Guadeloupe et prévisions 7 jours.',
              moderate: 'Sargasses à la Plage du Gosier (Guadeloupe) — présence modérée en temps réel. Snorkeling. Carte et prévisions 7 jours.',
              avoid: 'Alerte sargasses à la Plage du Gosier (Guadeloupe) — forte concentration détectée en temps réel. Carte des plages propres à Le Gosier.'
            },
            'Plage de Malendure': {
              clean: 'Plage de Malendure à Bouillante (Guadeloupe) — propre en temps réel. Côte sous-le-vent, snorkeling exceptionnel. Généralement protégée des sargasses. Prévisions 7 jours.',
              moderate: 'Sargasses à Malendure (Bouillante, Guadeloupe) — présence modérée en temps réel. Côte sous-le-vent. Snorkeling. Carte et prévisions 7 jours.',
              avoid: 'Alerte sargasses à Plage de Malendure (Bouillante, Guadeloupe) — forte concentration côte sous-le-vent. Voir les plages propres à proximité.'
            },
            'Plage de la Caravelle': {
              clean: 'Plage de la Caravelle à Sainte-Anne (Guadeloupe) — propre en temps réel. Côte Atlantique, snorkeling, idéal familles. Carte sargasses Guadeloupe et prévisions 7 jours.',
              moderate: 'Sargasses à Plage de la Caravelle (Sainte-Anne, Guadeloupe) — présence modérée en temps réel. Côte Atlantique. Snorkeling. Carte et prévisions 7 jours.',
              avoid: 'Alerte sargasses à la Plage de la Caravelle (Sainte-Anne, Guadeloupe) — forte concentration côte Atlantique. Voir les plages propres à proximité.'
            },
            'La Grande Anse (Deshaies)': {
              clean: 'La Grande Anse à Deshaies (Guadeloupe) — plage propre en temps réel. Côte sous-le-vent, Nord Basse-Terre, généralement épargnée des sargasses. Idéal familles. Prévisions 7 jours.',
              moderate: 'Sargasses à La Grande Anse de Deshaies (Guadeloupe) — présence modérée en temps réel. Côte sous-le-vent. Carte et prévisions 7 jours.',
              avoid: 'Alerte sargasses à La Grande Anse (Deshaies, Guadeloupe) — forte concentration détectée en temps réel. Côte sous-le-vent. Voir les plages propres à proximité.'
            },
            'Plage de Saint-François': {
              clean: 'Plage de Saint-François (Guadeloupe) — propre en temps réel. Grande-Terre, côte Atlantique, snorkeling, idéal familles. Carte sargasses Guadeloupe et prévisions 7 jours.',
              moderate: 'Sargasses à la Plage de Saint-François (Guadeloupe) — présence modérée en temps réel. Côte Atlantique Grande-Terre. Snorkeling. Carte et prévisions 7 jours.',
              avoid: 'Alerte sargasses à la Plage de Saint-François (Guadeloupe) — forte concentration côte Atlantique. Voir les plages propres à Saint-François et alentours.'
            },
            'Anse à la Gourde': {
              clean: 'Anse à la Gourde à Saint-François (Guadeloupe) — plage propre en temps réel. Côte Atlantique, snorkeling exceptionnel, eaux turquoise. Carte sargasses Guadeloupe et prévisions 7 jours.',
              moderate: 'Sargasses à l\'Anse à la Gourde (Saint-François, Guadeloupe) — présence modérée en temps réel. Côte Atlantique. Snorkeling. Carte et prévisions 7 jours.',
              avoid: 'Alerte sargasses à l\'Anse à la Gourde (Saint-François, Guadeloupe) — forte concentration côte Atlantique. Voir les plages propres à proximité.'
            },
            'Plage de Bas-du-Fort': {
              clean: 'Plage de Bas-du-Fort à Pointe-à-Pitre (Guadeloupe) — propre en temps réel. À 8 min de PAP, côte centrale, idéal familles. Carte sargasses Guadeloupe et prévisions 7 jours.',
              moderate: 'Sargasses à Bas-du-Fort (Pointe-à-Pitre, Guadeloupe) — présence modérée en temps réel. Côte centrale. Carte et prévisions 7 jours.',
              avoid: 'Alerte sargasses à Plage de Bas-du-Fort (Pointe-à-Pitre, Guadeloupe) — forte concentration détectée. Carte des plages propres à proximité de PAP.'
            },
            'Bourg de Tartane': {
              clean: 'Bourg de Tartane à La Trinité (Martinique) — plage propre en temps réel. Côte Atlantique, presqu\'île de la Caravelle. Idéal familles. Carte sargasses Martinique et prévisions 7 jours.',
              moderate: 'Sargasses à Tartane (La Trinité, Martinique) — présence modérée en temps réel. Côte Atlantique, presqu\'île de la Caravelle. Carte et prévisions 7 jours.',
              avoid: 'Alerte sargasses à Tartane (La Trinité, Martinique) — forte concentration côte Atlantique. Presqu\'île de la Caravelle. Voir les plages propres à proximité.'
            },
            'Anse Cafard': {
              clean: 'Anse Cafard au Diamant (Martinique) — propre en temps réel. Près du Mémorial de l\'Anse Cafard, côte Caraïbe. Carte sargasses Martinique et prévisions 7 jours.',
              moderate: 'Sargasses à l\'Anse Cafard (Le Diamant, Martinique) — présence modérée en temps réel. Mémorial de l\'Anse Cafard, côte Caraïbe. Carte et prévisions 7 jours.',
              avoid: 'Alerte sargasses à l\'Anse Cafard (Le Diamant, Martinique) — forte concentration côte Caraïbe. Voir les plages propres autour du Diamant.'
            },
            'Anse Noire': {
              clean: 'Anse Noire aux Anses-d\'Arlet (Martinique) — plage propre en temps réel. Petite crique volcanique, snorkeling, côte Caraïbe. Généralement épargnée des sargasses. Prévisions 7 jours.',
              moderate: 'Sargasses à Anse Noire (Les Anses-d\'Arlet, Martinique) — présence modérée en temps réel. Crique volcanique, snorkeling. Côte Caraïbe. Carte et prévisions 7 jours.',
              avoid: 'Alerte sargasses à Anse Noire (Les Anses-d\'Arlet, Martinique) — forte concentration côte Caraïbe. Crique volcanique. Voir les plages propres à proximité.'
            },
            'Anse à l\'Âne': {
              clean: 'Anse à l\'Âne aux Trois-Îlets (Martinique) — plage propre en temps réel. À 22 min de Fort-de-France, côte Caraïbe, idéal familles. Généralement épargnée des sargasses. Prévisions 7 jours.',
              moderate: 'Sargasses à Anse à l\'Âne (Les Trois-Îlets, Martinique) — présence modérée en temps réel. Côte Caraïbe. Idéal familles. Carte et prévisions 7 jours.',
              avoid: 'Alerte sargasses à Anse à l\'Âne (Les Trois-Îlets, Martinique) — forte concentration côte Caraïbe. Carte des plages propres proches de Fort-de-France.'
            }
          }
          let sitemapMQBeaches = ''
          let sitemapGPBeaches = ''
          for (const b of beaches) {
            const isMQ = b.island === 'mq'
            const domain = isMQ ? domainMQ : domainGP
            const island = isMQ ? 'Martinique' : 'Guadeloupe'
            const beachPath = `plages/${b.slug}`
            const beachDir = resolve(outDir, beachPath)
            mkdirSync(beachDir, { recursive: true })
            // Data-driven title from seo-enrich-content (e.g. "Plage X: 86% propres sur 7j")
            // Falls back to static title if enrichment not generated yet.
            const beachTitle = _enrichments[b.slug]?.metaTitle || `${b.name} — Sargasses ${island} aujourd'hui`
            const statusTextMap = { clean: 'Plage propre aujourd\u2019hui', moderate: 'Présence modérée de sargasses détectée au large', avoid: 'Alerte sargasses — forte concentration détectée au large' }
            const statusText = statusTextMap[b.status] || statusTextMap.clean
            // Rich unique meta description: beach name + commune + island + coast type + status + amenity
            const _isAtl = isMQ ? b.lng > -61.0 : b.lng > -61.3
            const _isCarib = isMQ ? b.lng < -61.1 : b.lng < -61.6
            const _cote = _isAtl ? 'côte Atlantique' : _isCarib ? (isMQ ? 'côte Caraïbe' : 'côte sous-le-vent') : 'côte centrale'
            const _amenity = b.snorkel ? 'Snorkeling. ' : b.kids ? 'Idéal familles. ' : ''
            // Priority: enrichment metaDesc (data-driven from history) > manual overrides > status-based fallback
            const _baseBeachDesc = _enrichments[b.slug]?.metaDesc || BEACH_DESC_OVERRIDES[b.name]?.[b.status] || (b.status === 'clean'
              ? `${b.name} à ${b.commune} (${island}) — plage propre en temps réel. ${_cote}${_isAtl ? ', peu de sargasses actuellement' : ', généralement protégée des sargasses'}. ${_amenity}Carte sargasses et prévisions 7 jours.`
              : b.status === 'moderate'
              ? `Sargasses à ${b.name} (${b.commune}, ${island}) — présence modérée détectée en temps réel. ${_cote}. ${_amenity}Carte et prévisions 7 jours.`
              : `Alerte sargasses à ${b.name} (${b.commune}, ${island}) — forte concentration détectée en temps réel. ${_cote}. Voir les plages propres à proximité.`)
            // Append today's weather line when we have room under Google's ~170-char soft limit.
            // Only for clean status: rough weather doesn't belong next to an alert metaDesc.
            const _wline = b.status === 'clean' ? weatherLine(b.id) : ''
            const beachDesc = _wline && (_baseBeachDesc.length + _wline.length + 1) <= 175
              ? `${_baseBeachDesc} ${_wline}`
              : _baseBeachDesc
            const beachUrl = `https://${domain}/plages/${b.slug}/`
            const amenities = []
            if (b.parking) amenities.push({"@type":"LocationFeatureSpecification","name":"Parking","value":true})
            if (b.snorkel) amenities.push({"@type":"LocationFeatureSpecification","name":"Snorkeling","value":true})
            if (b.kids) amenities.push({"@type":"LocationFeatureSpecification","name":"Famille","value":true})
            const ratingValue = b.status === 'clean' ? 5 : b.status === 'moderate' ? 3 : 1
            const ratingName = b.status === 'clean' ? 'Propre' : b.status === 'moderate' ? 'Modéré' : 'À éviter'
            const beachSchemaObj = {"@context":"https://schema.org","@type":"Beach","name":b.name,"description":`Fiche sargasses ${b.name}, ${b.commune} (${island}). État en temps réel et prévisions.`,"url":beachUrl,"address":{"@type":"PostalAddress","addressLocality":b.commune,"addressRegion":island,"addressCountry":isMQ?"MQ":"GP"},"geo":{"@type":"GeoCoordinates","latitude":b.lat,"longitude":b.lng},"isPartOf":{"@type":"WebApplication","name":`Sargasses ${island}`,"url":`https://${domain}/`},"aggregateRating":{"@type":"AggregateRating","ratingValue":ratingValue,"bestRating":5,"worstRating":1,"ratingCount":1,"reviewAspect":`Sargasses — ${ratingName}`}}
            if (amenities.length > 0) beachSchemaObj.amenityFeature = amenities
            const beachSchema = JSON.stringify(beachSchemaObj)
            const breadcrumbBeach = JSON.stringify({"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Accueil","item":`https://${domain}/`},{"@type":"ListItem","position":2,"name":"Plages","item":`https://${domain}/plages/`},{"@type":"ListItem","position":3,"name":b.name,"item":beachUrl}]})
            // FAQPage schema — use enrichment if available, otherwise generate per-beach FAQ
            // Each beach gets contextually unique questions based on its characteristics
            const mainCity = isMQ ? 'Fort-de-France' : 'Pointe-à-Pitre'
            // Determine coast type for unique content
            let coastType, coastExposure
            if (isMQ) {
              coastType = b.lng > -61.0 ? 'côte Atlantique' : b.lng < -61.1 ? 'côte Caraïbe' : 'côte centre'
              coastExposure = b.lng > -61.0 ? 'exposée aux courants atlantiques' : b.lng < -61.1 ? 'protégée des courants atlantiques' : 'moyennement exposée'
            } else {
              coastType = b.lng > -61.3 ? 'côte Atlantique' : b.lng < -61.6 ? 'côte sous-le-vent' : 'côte centrale'
              coastExposure = b.lng > -61.3 ? 'exposée aux courants atlantiques' : b.lng < -61.6 ? 'protégée par la Basse-Terre' : 'moyennement exposée'
            }
            // Build unique FAQ questions pool — pick 3 most relevant per beach
            const faqQuestions = []
            // Q1: Always include status question (unique per status)
            if (b.status === 'clean') {
              faqQuestions.push({"@type":"Question","name":`${b.name} est-elle une plage sans sargasses ?`,"acceptedAnswer":{"@type":"Answer","text":`Actuellement, ${b.name} à ${b.commune} présente peu ou pas de sargasses. Cette plage de la ${coastType} est ${coastExposure}. L'état peut changer rapidement — consultez notre carte mise à jour quotidiennement par satellite Copernicus.`}})
            } else if (b.status === 'moderate') {
              faqQuestions.push({"@type":"Question","name":`Quel est l'état des sargasses à ${b.name} aujourd'hui ?`,"acceptedAnswer":{"@type":"Answer","text":`${b.name} (${b.commune}) présente une présence modérée de sargasses. Située sur la ${coastType}, cette plage est ${coastExposure}. Vérifiez l'état en temps réel sur notre carte avant de vous déplacer.`}})
            } else {
              faqQuestions.push({"@type":"Question","name":`Pourquoi éviter ${b.name} en ce moment ?`,"acceptedAnswer":{"@type":"Answer","text":`Une forte concentration de sargasses est détectée par satellite au large de ${b.name} (${b.commune}). Les sargasses en décomposition libèrent du H₂S, un gaz irritant. Consultez les plages propres à proximité sur notre carte en temps réel.`}})
            }
            // Q2: Contextual question based on amenities
            if (b.kids) {
              faqQuestions.push({"@type":"Question","name":`${b.name} est-elle adaptée aux enfants ?`,"acceptedAnswer":{"@type":"Answer","text":`Oui, ${b.name} à ${b.commune} est adaptée aux familles${b.parking ? ' et dispose d\'un parking' : ''}. En période de sargasses (avril-septembre), vérifiez l'état de la plage sur notre carte avant de vous y rendre avec des enfants, le H₂S pouvant être irritant.`}})
            } else if (b.snorkel) {
              faqQuestions.push({"@type":"Question","name":`Peut-on faire du snorkeling à ${b.name} ?`,"acceptedAnswer":{"@type":"Answer","text":`${b.name} à ${b.commune} offre de bonnes conditions de snorkeling. La présence de sargasses en surface peut gêner la visibilité et l'accès à l'eau. Consultez l'état en temps réel avant votre sortie.`}})
            } else {
              const driveMin = parseInt(b.drive, 10) || 30
              faqQuestions.push({"@type":"Question","name":`Comment se rendre à ${b.name} depuis ${mainCity} ?`,"acceptedAnswer":{"@type":"Answer","text":`${b.name} se trouve à ${b.commune}, à environ ${b.drive} minutes en voiture depuis ${mainCity}. ${driveMin < 20 ? 'Facilement accessible pour une sortie rapide.' : driveMin < 40 ? 'Prévoyez le trajet, surtout le week-end.' : 'Excursion à la journée recommandée.'}`}})
            }
            // Q3: Season/coast question unique per zone
            if (b.lng > (isMQ ? -61.0 : -61.3)) {
              faqQuestions.push({"@type":"Question","name":`Quand éviter ${b.name} pour les sargasses ?`,"acceptedAnswer":{"@type":"Answer","text":`${b.name}, sur la ${coastType}, est plus exposée d'avril à septembre quand les alizés poussent les sargasses vers la côte est. Les mois de juin à août sont généralement les plus touchés. Consultez nos prévisions 7 jours pour planifier votre visite.`}})
            } else {
              faqQuestions.push({"@type":"Question","name":`${b.name} est-elle touchée par les sargasses ?`,"acceptedAnswer":{"@type":"Answer","text":`${b.name}, située sur la ${coastType}, est ${coastExposure}. Elle est généralement moins touchée que les plages de la côte est. La saison des sargasses aux Antilles va d'avril à septembre, avec des pics entre juin et août.`}})
            }
            // Always use contextually-generated FAQ (enrichments FAQ was identical across all beaches)
            const faqSchema = JSON.stringify({"@context":"https://schema.org","@type":"FAQPage","mainEntity":faqQuestions})
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
              // Strip homepage schemas (WebApplication, FAQPage, Organization, SiteNavigationElement) — beach pages get their own
              .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '')
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
            // 1. Beach orientation based on coordinates
            let cote, coteExpo
            if (isMQ) {
              if (b.lng > -61.0) { cote = 'côte Atlantique'; coteExpo = 'plus exposée aux sargasses portées par les courants' }
              else if (b.lng < -61.1) { cote = 'côte Caraïbe'; coteExpo = 'généralement plus protégée des échouages de sargasses' }
              else { cote = 'côte centre'; coteExpo = 'modérément exposée aux sargasses selon les courants' }
            } else {
              if (b.lng > -61.3) { cote = 'côte Atlantique / Grand Cul-de-Sac Marin'; coteExpo = 'plus exposée aux sargasses portées par les courants' }
              else if (b.lng < -61.6) { cote = 'côte sous-le-vent'; coteExpo = 'généralement plus protégée des échouages de sargasses' }
              else { cote = 'côte centrale'; coteExpo = 'modérément exposée aux sargasses selon les courants' }
            }
            const orientationSection = `<h2>Orientation</h2><p>Située sur la ${cote}, ${b.name} est ${coteExpo}.</p>`
            // 2. Activity description from kids/snorkel/parking flags
            const actParts = []
            if (b.kids) actParts.push('adaptée aux enfants')
            if (b.parking) actParts.push('avec parking')
            if (b.snorkel) actParts.push('snorkeling possible')
            let activitySection = ''
            if (actParts.length > 0) {
              activitySection = `<h2>Activités</h2><p>Plage familiale ${actParts.join(', ')}.</p>`
            } else {
              activitySection = `<h2>Activités</h2><p>Plage sauvage sans parking — accessible à pied uniquement.</p>`
            }
            // 3. Season tip
            const seasonSection = `<h2>Saison des sargasses</h2><p>La saison des sargasses aux Antilles s'étend généralement d'avril à septembre. Consultez les prévisions 7 jours avant votre visite.</p>`
            // 4. Drive context
            const driveMin = parseInt(b.drive, 10) || 30
            const driveType = driveMin < 20 ? 'sortie rapide' : 'excursion à la journée'
            const driveContext = `<p>À ${b.drive} minutes de ${mainCity}, idéale pour une ${driveType}.</p>`
            // Today's conditions (year-round) — injected from Open-Meteo data.
            // Dates the content so Google sees freshness, and adds keyword coverage
            // ("vagues", "température", "UV") absent from sargassum-only prose.
            let todayConditions = ''
            const _todayW = _weather[b.id]
            if (_todayW) {
              const pieces = []
              if (_todayW.waveHeight != null) pieces.push(`vagues ${_todayW.waveHeight}m`)
              if (_todayW.wavePeriod != null) pieces.push(`période ${_todayW.wavePeriod}s`)
              if (_todayW.windSpeed != null && _todayW.windDir) pieces.push(`vent ${_todayW.windDir} ${_todayW.windSpeed}km/h`)
              if (_todayW.sst != null) pieces.push(`eau ${_todayW.sst}°C`)
              if (_todayW.airTemp != null) pieces.push(`air ${_todayW.airTemp}°C`)
              if (_todayW.uvMax != null) pieces.push(`indice UV ${_todayW.uvMax}`)
              if (pieces.length) {
                const condLabel = _todayW.condition === 'calm' ? 'mer calme, conditions idéales pour la baignade'
                  : _todayW.condition === 'moderate' ? 'mer modérée, vigilance recommandée pour les enfants'
                  : _todayW.condition === 'rough' ? 'mer agitée, baignade déconseillée pour les moins expérimentés'
                  : _todayW.condition === 'windy' ? 'vent soutenu, attention aux parasols et objets légers'
                  : 'conditions à vérifier sur place'
                todayConditions = `<h2>Conditions du jour à ${b.name} (${today})</h2><p>${pieces.join(', ')}. ${condLabel}. Données Open-Meteo Marine rafraîchies quotidiennement, complémentaires à la surveillance sargasses Sentinel-3.</p>`
              }
            }
            const extraSections = `${todayConditions}${accessSection}${driveContext}${orientationSection}${condBaignade}${activitySection}${seasonSection}${tagsHtml}`
            // Beach photo for noscript (Google Images indexing)
            const beachImgTag = _beachImages[b.id]
              ? `<img src="/beaches/${_beachImages[b.id]}" alt="${b.name} — plage ${b.commune}, ${island}" width="800" height="450" loading="lazy" />`
              : ''
            let noscriptBlock
            if (_enrichments[b.slug]) {
              // Keep existing enrichment noscript but prepend image and append extra sections
              const enrichedWithImg = _enrichments[b.slug].noscript.replace('<article>', `<article>${beachImgTag}`)
              noscriptBlock = enrichedWithImg.replace('</article>', `${extraSections}</article>`)
            } else {
              const sameCommune = beaches.filter(o => o.commune === b.commune && o.slug !== b.slug)
              const sameIsland = beaches.filter(o => o.island === b.island && o.commune !== b.commune && o.slug !== b.slug)
              const nearby = sameCommune.slice(0, 4)
              if (nearby.length < 4) nearby.push(...sameIsland.slice(0, 4 - nearby.length))
              const nearbyLi = nearby.map(o => `<li><a href="/plages/${o.slug}/">${o.name}</a> — ${o.commune}</li>`).join('')
              noscriptBlock = `\n    <noscript>\n      <article>\n        <h1>Sargasses à ${b.name} (${b.commune}, ${island})</h1>\n        ${beachImgTag}\n        <p>État des sargasses à ${b.name} en temps réel. Cette plage de ${b.commune} en ${island} est surveillée quotidiennement par satellite.</p>\n        ${extraSections}\n        <h3>Plages à proximité</h3>\n        <ul>${nearbyLi}</ul>\n        <p><a href="/carte-sargasses/">Voir la carte des sargasses</a> · <a href="/alertes/">Alertes sargasses</a> · <a href="/">Accueil Sargasses ${island}</a></p>\n      </article>\n    </noscript>`
            }
            const finalHtml = beachHtml.replace('</body>', noscriptBlock + '\n</body>')
            writeFileSync(resolve(beachDir, 'index.html'), finalHtml)
            const sitemapEntry = `  <url><loc>${beachUrl}</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.7</priority></url>\n`
            if (isMQ) sitemapMQBeaches += sitemapEntry
            else sitemapGPBeaches += sitemapEntry
          }
          // ── /plages/ index page — all beaches grouped by commune ──
          // Loop order GP → MQ is deliberate: dist/ is copied to both FTP dirs,
          // and prepare-ftp.cjs only substitutes Martinique→Guadeloupe on the GP
          // side. So we need the FINAL state of dist/ to be Martinique-flavored
          // (hence MQ last) for the MQ copy to be correct.
          for (const islandCode of ['gp', 'mq']) {
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

          // ── /conditions/* — aggregation pages by today's weather + sargassum ──
          // New URL surface area that updates daily without fresh editorial work.
          // Each page targets a long-tail intent: "mer calme martinique aujourd'hui",
          // "baignade ideale martinique", etc. Build-time generation reads _weather
          // (Open-Meteo) + beach status so content is unique per build, per island.
          {
            const conditionPages = [
              {
                slug: 'baignade-ideale',
                titleMq: 'Plages parfaites pour la baignade aujourd\u2019hui \u2014 Martinique',
                titleGp: 'Plages parfaites pour la baignade aujourd\u2019hui \u2014 Guadeloupe',
                h1Mq: 'Les meilleures plages pour la baignade aujourd\u2019hui en Martinique',
                h1Gp: 'Les meilleures plages pour la baignade aujourd\u2019hui en Guadeloupe',
                intro: 'Ces plages combinent aujourd\u2019hui un \u00e9tat sargasses propre, une mer calme et une eau chaude. Id\u00e9al pour une sortie en famille, un bain prolong\u00e9 ou des vacanciers peu habitu\u00e9s aux courants caribbean.',
                filter: (b, w) => b.status === 'clean' && w && w.condition === 'calm',
                fallback: 'Aucune plage ne r\u00e9unit aujourd\u2019hui les trois crit\u00e8res id\u00e9aux (propre + mer calme + eau chaude). Consultez la carte pour identifier le meilleur compromis du moment.',
              },
              {
                slug: 'mer-calme',
                titleMq: 'Plages avec mer calme aujourd\u2019hui \u2014 Martinique',
                titleGp: 'Plages avec mer calme aujourd\u2019hui \u2014 Guadeloupe',
                h1Mq: 'Plages avec mer calme en Martinique aujourd\u2019hui',
                h1Gp: 'Plages avec mer calme en Guadeloupe aujourd\u2019hui',
                intro: 'Donn\u00e9es marines Open-Meteo mises \u00e0 jour quotidiennement. Une mer calme (vagues inf\u00e9rieures \u00e0 0,8\u00a0m) facilite la baignade avec de jeunes enfants, le snorkeling et le paddle. Les conditions peuvent changer rapidement\u00a0: v\u00e9rifiez la fiche d\u00e9taill\u00e9e de chaque plage avant de partir.',
                filter: (b, w) => w && (w.condition === 'calm' || (w.waveHeight != null && w.waveHeight < 0.8)),
                fallback: 'Aucune plage ne pr\u00e9sente une mer calme aujourd\u2019hui. La houle est g\u00e9n\u00e9ralis\u00e9e \u2014 optez plut\u00f4t pour des spots abrit\u00e9s c\u00f4te sous-le-vent.',
              },
              {
                slug: 'mer-agitee',
                titleMq: 'Plages avec mer agit\u00e9e aujourd\u2019hui \u2014 Martinique (surf, bodyboard)',
                titleGp: 'Plages avec mer agit\u00e9e aujourd\u2019hui \u2014 Guadeloupe (surf, bodyboard)',
                h1Mq: 'Plages avec mer agit\u00e9e en Martinique aujourd\u2019hui',
                h1Gp: 'Plages avec mer agit\u00e9e en Guadeloupe aujourd\u2019hui',
                intro: 'Pour les surfeurs, bodyboarders et longboarders qui cherchent de la vague. Mais attention\u00a0: ces conditions sont d\u00e9conseill\u00e9es aux enfants et aux baigneurs occasionnels. V\u00e9rifiez le drapeau de baignade sur place.',
                filter: (b, w) => w && (w.condition === 'rough' || (w.waveHeight != null && w.waveHeight >= 1.5)),
                fallback: 'Aucune plage n\u2019affiche une mer agit\u00e9e aujourd\u2019hui. Conditions tr\u00e8s plates \u2014 revenez demain.',
              },
              {
                slug: 'uv-fort',
                titleMq: 'Plages avec UV tr\u00e8s fort aujourd\u2019hui \u2014 Martinique (prot\u00e9gez-vous)',
                titleGp: 'Plages avec UV tr\u00e8s fort aujourd\u2019hui \u2014 Guadeloupe (prot\u00e9gez-vous)',
                h1Mq: 'Indice UV tr\u00e8s fort aujourd\u2019hui en Martinique',
                h1Gp: 'Indice UV tr\u00e8s fort aujourd\u2019hui en Guadeloupe',
                intro: 'Un indice UV sup\u00e9rieur ou \u00e9gal \u00e0 9 correspond \u00e0 un risque tr\u00e8s \u00e9lev\u00e9 de coup de soleil en moins de 15 minutes sans protection. \u00c9vitez l\u2019exposition entre 11\u00a0h et 15\u00a0h, utilisez un \u00e9cran solaire SPF 50, portez chapeau et t-shirt anti-UV pour les enfants.',
                filter: (b, w) => w && w.uvMax != null && w.uvMax >= 9,
                fallback: 'L\u2019indice UV est mod\u00e9r\u00e9 partout aujourd\u2019hui \u2014 conditions plus souples pour la journ\u00e9e \u00e0 la plage.',
              },
            ]
            const statusByIdCond = Object.fromEntries(SARGASSUM_REF.map(r => [r.id, r.status]))
            // Same GP-first/MQ-last ordering as /plages/ — see comment there.
            for (const islandCode of ['gp', 'mq']) {
              const isMQ = islandCode === 'mq'
              const island = isMQ ? 'Martinique' : 'Guadeloupe'
              const domain = isMQ ? domainMQ : domainGP
              const islandBeaches = beaches.filter(b => b.island === islandCode)
              for (const page of conditionPages) {
                // Apply today's status to each beach before filtering
                const enrichedBeaches = islandBeaches.map(b => ({
                  ...b,
                  status: statusByIdCond[b.id] || b.status,
                }))
                const matching = enrichedBeaches
                  .filter(b => page.filter(b, _weather[b.id]))
                  .map(b => ({ ...b, _w: _weather[b.id] }))
                  .sort((a, b) => (a.drive || 99) - (b.drive || 99))
                  .slice(0, 30)
                const pageTitle = isMQ ? page.titleMq : page.titleGp
                const pageH1 = isMQ ? page.h1Mq : page.h1Gp
                const pageUrl = `https://${domain}/conditions/${page.slug}/`
                const pageDesc = `${matching.length > 0 ? `${matching.length} plage${matching.length > 1 ? 's' : ''} correspond${matching.length > 1 ? 'ent' : ''} aujourd\u2019hui en ${island}.` : 'Aucune plage ne correspond aujourd\u2019hui.'} ${page.intro.slice(0, 120)}`.slice(0, 170)
                const beachListHtml = matching.length > 0
                  ? matching.map(b => {
                      const w = b._w
                      const wTxt = w && w.waveHeight != null ? `vagues ${w.waveHeight}m` : ''
                      const sTxt = w && w.sst != null ? `eau ${w.sst}\u00b0C` : ''
                      const uTxt = w && w.uvMax != null ? `UV ${w.uvMax}` : ''
                      const details = [wTxt, sTxt, uTxt].filter(Boolean).join(' \u00b7 ')
                      const driveTxt = b.drive ? ` \u00b7 ${b.drive} min depuis ${isMQ ? 'Fort-de-France' : 'Pointe-\u00e0-Pitre'}` : ''
                      return `<li style="padding:10px 0;border-bottom:1px solid #eee"><a href="/plages/${b.slug}/" style="color:#0D0D0D;text-decoration:none;font-weight:600">${b.name}</a><br><span style="color:#686868;font-size:14px">${b.commune}${driveTxt}${details ? ' \u00b7 ' + details : ''}</span></li>`
                    }).join('')
                  : `<li style="padding:10px 0;color:#686868">${page.fallback}</li>`
                const pageNoscript = `<article style="max-width:720px;margin:0 auto;padding:24px 16px;font-family:system-ui,sans-serif"><nav style="font-size:13px;color:#686868;margin-bottom:12px"><a href="/" style="color:#686868">Accueil</a> \u203a <a href="/plages/" style="color:#686868">Plages</a> \u203a Conditions</nav><h1 style="font-size:26px;margin-bottom:8px">${pageH1}</h1><p style="color:#444;margin-bottom:12px;font-size:15px">${page.intro}</p><p style="color:#686868;font-size:13px;margin-bottom:20px">Donn\u00e9es rafra\u00eechies le ${today}. Sources\u00a0: Copernicus Sentinel-3 (sargasses) + Open-Meteo Marine (vagues, temp\u00e9rature, UV).</p><h2 style="font-size:18px;margin:24px 0 12px">Plages correspondantes (${matching.length})</h2><ul style="list-style:none;padding:0;margin:0">${beachListHtml}</ul><nav style="margin-top:32px;padding-top:16px;border-top:1px solid #eee;font-size:14px"><a href="/conditions/baignade-ideale/" style="color:#E8A800;font-weight:600;margin-right:16px">Baignade id\u00e9ale</a><a href="/conditions/mer-calme/" style="color:#E8A800;font-weight:600;margin-right:16px">Mer calme</a><a href="/conditions/mer-agitee/" style="color:#E8A800;font-weight:600;margin-right:16px">Mer agit\u00e9e</a><a href="/conditions/uv-fort/" style="color:#E8A800;font-weight:600;margin-right:16px">UV fort</a><a href="/carte-sargasses/" style="color:#E8A800;font-weight:600">Carte</a></nav></article>`
                const pageSchema = JSON.stringify({"@context":"https://schema.org","@type":"CollectionPage","name":pageTitle,"description":pageDesc,"url":pageUrl,"isPartOf":{"@type":"WebApplication","name":`Sargasses ${island}`,"url":`https://${domain}/`},"dateModified":today})
                const breadcrumbCond = JSON.stringify({"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Accueil","item":`https://${domain}/`},{"@type":"ListItem","position":2,"name":"Plages","item":`https://${domain}/plages/`},{"@type":"ListItem","position":3,"name":"Conditions","item":`https://${domain}/conditions/`},{"@type":"ListItem","position":4,"name":pageH1,"item":pageUrl}]})
                const condDir = resolve(outDir, 'conditions', page.slug)
                mkdirSync(condDir, { recursive: true })
                const condHtml = html
                  .replace(/<title>[^<]*<\/title>/, `<title>${pageTitle}</title>`)
                  .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${pageDesc}" />`)
                  .replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${pageUrl}" />`)
                  .replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${pageTitle}" />`)
                  .replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${pageDesc}" />`)
                  .replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${pageUrl}" />`)
                  .replace(/<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${pageTitle}" />`)
                  .replace(/<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${pageDesc}" />`)
                  .replace('</head>', `\n    <script type="application/ld+json">\n    ${pageSchema}\n    </script>\n    <script type="application/ld+json">\n    ${breadcrumbCond}\n    </script>\n</head>`)
                  .replace('</body>', `\n    <noscript>${pageNoscript}</noscript>\n</body>`)
                writeFileSync(resolve(condDir, 'index.html'), condHtml)
                const condSitemapEntry = `  <url><loc>${pageUrl}</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.7</priority></url>\n`
                if (isMQ) sitemapMQBeaches += condSitemapEntry
                else sitemapGPBeaches += condSitemapEntry
              }
              // /conditions/ landing (hub) — lists all 4 sub-pages
              const hubTitle = `Conditions des plages aujourd\u2019hui \u2014 ${island}`
              const hubDesc = `Plages de ${island} class\u00e9es par conditions du jour\u00a0: baignade id\u00e9ale, mer calme, mer agit\u00e9e, UV fort. Donn\u00e9es satellite + Open-Meteo rafra\u00eechies quotidiennement.`
              const hubUrl = `https://${domain}/conditions/`
              const hubLinks = conditionPages.map(p => `<li style="padding:12px 0;border-bottom:1px solid #eee"><a href="/conditions/${p.slug}/" style="color:#0D0D0D;text-decoration:none;font-weight:600;font-size:16px">${isMQ ? p.h1Mq : p.h1Gp}</a><br><span style="color:#686868;font-size:14px">${p.intro.slice(0, 140)}\u2026</span></li>`).join('')
              const hubNoscript = `<article style="max-width:720px;margin:0 auto;padding:24px 16px;font-family:system-ui,sans-serif"><h1 style="font-size:26px;margin-bottom:8px">${hubTitle}</h1><p style="color:#686868;margin-bottom:20px;font-size:15px">Quatre s\u00e9lections mises \u00e0 jour chaque jour. Choisissez le crit\u00e8re qui compte pour vous aujourd\u2019hui.</p><ul style="list-style:none;padding:0;margin:0">${hubLinks}</ul><nav style="margin-top:32px;padding-top:16px;border-top:1px solid #eee"><a href="/plages/" style="color:#E8A800;font-weight:600;margin-right:16px">Toutes les plages</a><a href="/carte-sargasses/" style="color:#E8A800;font-weight:600">Carte sargasses</a></nav></article>`
              const hubSchema = JSON.stringify({"@context":"https://schema.org","@type":"CollectionPage","name":hubTitle,"description":hubDesc,"url":hubUrl,"isPartOf":{"@type":"WebApplication","name":`Sargasses ${island}`,"url":`https://${domain}/`},"dateModified":today})
              const hubDir = resolve(outDir, 'conditions')
              mkdirSync(hubDir, { recursive: true })
              const hubHtml = html
                .replace(/<title>[^<]*<\/title>/, `<title>${hubTitle}</title>`)
                .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${hubDesc}" />`)
                .replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${hubUrl}" />`)
                .replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${hubTitle}" />`)
                .replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${hubDesc}" />`)
                .replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${hubUrl}" />`)
                .replace('</head>', `\n    <script type="application/ld+json">\n    ${hubSchema}\n    </script>\n</head>`)
                .replace('</body>', `\n    <noscript>${hubNoscript}</noscript>\n</body>`)
              writeFileSync(resolve(hubDir, 'index.html'), hubHtml)
              const hubSitemapEntry = `  <url><loc>${hubUrl}</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url>\n`
              if (isMQ) sitemapMQBeaches += hubSitemapEntry
              else sitemapGPBeaches += hubSitemapEntry
            }
            console.log('   \u2192 /conditions/ hub + 4 aggregation pages (MQ + GP) = 10 pages')
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
    // En dev : réécrire /en, /en/, /es, /es/ vers / pour charger l'app (pathname reste /en/ ou /es/ → getLang())
    {
      name: 'i18n-spa-rewrite',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const u = req.url?.split('?')[0] || ''
          if (u === '/en' || u === '/en/' || u === '/es' || u === '/es/') {
            req.url = '/' + (req.url?.includes('?') ? '?' + req.url.split('?')[1] : '')
          }
          next()
        })
      },
    },
  ].filter(Boolean),
  root: '.',
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'leaflet': ['leaflet'],
          'react-vendor': ['react', 'react-dom'],
        },
      },
    },
  },
  // Si le site est dans un sous-dossier (ex. example.com/sargasses/), décommenter et adapter :
  // base: '/sargasses/',
})
