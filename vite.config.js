import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { resolve } from 'path'
import { createRequire } from 'module'
import { conditionPages } from './src/lib/conditions-filters.js'
// Chargé en lazy via createRequire : un import statique fait bundler le module
// CJS dans la config ESM ("Dynamic require of fs is not supported").
const _require = createRequire(import.meta.url)

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

// Mapping between Copernicus levels/weekly IDs and beaches-list IDs
const SARG_TO_BEACH = {
  "grande-anse": "mq014",
  "anse-mitan": "mq011",
  "anse-noire": "mq012",
  "tartane": "mq034",
  "anse-madame": "mq024",
  "diamant": "mq016",
  "pt-marin": "mq008",
  "sainte-anne": "mq004",
  "les-salines": "mq001",
  "vauclin": "mq044",
  "gp-grande-anse": "gp021",
  "gp-malendure": "gp031",
  "gp-sainte-anne": "gp010",
  "gp-pt-chateaux": "gp005",
  "gp-gosier": "gp012",
  "gp-caravelle": "gp009",
  "gp-bas-du-fort": "gp014",
  "gp-deshaies": "gp024",
  "gp-moule": "gp080",
  "gp-vieux-fort": "gp042"
}
const BEACH_TO_SARG = Object.fromEntries(Object.entries(SARG_TO_BEACH).map(([k, v]) => [v, k]))


// Région active du build (env VITE_REGION), défaut 'mq' = comportement historique inchangé.
// Injectée dans le runtime via `define __REGION__` (inclut les plages inline des nouvelles régions).
let REGION = null
try {
  const _rid = process.env.VITE_REGION || process.env.REGION || 'mq'
  REGION = JSON.parse(readFileSync(resolve(__dirname, `regions/${_rid}.json`), 'utf-8'))
} catch (e) {
  console.warn('vite.config.js: région non chargée:', e.message)
}
// Nouvelle région (≠ mq/gp) → build dédié mono-région (SPA + meta), sans la génération SEO MQ/GP historique.
const IS_NEW_REGION = !!(REGION && REGION.id !== 'mq' && REGION.id !== 'gp')

// FIABILITÉ HONNÊTE — injectée au runtime via __RELIABILITY__ pour que le badge in-app
// consomme la MÊME source que /fiabilite/ (backtest-results.json) et ne sur-claime/dérive
// plus (était hardcodé "80%"). On publie le hit-rate PAR RÉGIME, jamais le global %
// (instruction explicite de regimeReliability.note : le global masque que les ALERTES en
// saison calme sont bien moins fiables que les « mer propre »). Fallback global si absent.
let RELIABILITY = null
try {
  const _bt = JSON.parse(readFileSync(resolve(__dirname, 'scripts/automation/data/backtest-results.json'), 'utf-8'))
  const _rr = _bt && _bt.regimeReliability
  const _reg = _rr && _rr.regimes && (_rr.regimes.high && _rr.regimes.high.samples > (_rr.regimes.calm ? _rr.regimes.calm.samples : 0) ? _rr.regimes.high : _rr.regimes.calm)
  const _regKey = _rr && _rr.regimes ? (_rr.regimes.high && _reg === _rr.regimes.high ? 'high' : 'calm') : null
  if (_reg && typeof _reg.cleanReliabilityPct === 'number' && _reg.cleanSamples > 0) {
    RELIABILITY = {
      regime: _regKey,
      cleanPct: _reg.cleanReliabilityPct,
      cleanN: _reg.cleanSamples,
      falseAlarmPct: _reg.falseAlarmRatePct,
      window: _rr.window || null,
      headline: _rr.headline || null,
    }
  } else if (_bt && _bt.overall && typeof _bt.overall.statusHitRate === 'number' && _bt.totalPairs > 0) {
    RELIABILITY = { global: Math.round(_bt.overall.statusHitRate), pairs: _bt.totalPairs }
  }
} catch (e) {
  console.warn('vite.config.js: backtest fiabilité non chargé:', e.message)
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
    // ── Meta région-aware de l'index.html (nouvelles régions EN/ES) ──
    // MQ/GP strictement inchangés (REGION null ou id mq/gp → html retourné tel quel).
    {
      name: 'region-index-html',
      transformIndexHtml(html) {
        if (!REGION || REGION.id === 'mq' || REGION.id === 'gp') return html
        const name = REGION.name, domain = REGION.domain, lang = REGION.primaryLang
        // ES first sur les marchés hispanophones : head/FAQ/noscript dans la langue primaire.
        const es = lang === 'es'
        const title = es
          ? `Sargazo en ${name} Hoy — Mapa de Playas en Vivo y Pronóstico 7 Días 2026`
          : `${name} Sargassum Today — Live Beach Map & 7-Day Forecast 2026`
        const desc = es
          ? `¿Qué playa de ${name} está sin sargazo hoy? Mapa en vivo playa por playa, Beach Score 0-100 y pronóstico de 7 días. Actualizado 4 veces al día con datos satelitales.`
          : `Which ${name} beach is sargassum-free today? Live per-beach seaweed map, Beach Score 0-100 and 7-day forecast. Updated 4× daily from satellite data.`
        const siteName = es ? `Sargazo ${name}` : `Sargassum ${name}`
        const today = new Date().toISOString().slice(0, 10)
        const beaches = REGION.beaches || []
        const communes = [...new Set(beaches.map(b => b.commune).filter(Boolean))]
        const beachNames = beaches.map(b => b.name)

        // ── 1) Head meta (titre/desc/og/locale/domain) ──
        html = html
          .replace(/<html lang="[^"]*"/, `<html lang="${lang}"`)
          .replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`)
          .replace(/(<meta name="description" content=)"[^"]*"/, `$1"${desc}"`)
          .replace(/(<meta property="og:title" content=)"[^"]*"/, `$1"${title}"`)
          .replace(/(<meta property="og:description" content=)"[^"]*"/, `$1"${desc}"`)
          .replace(/(<meta property="og:site_name" content=)"[^"]*"/, `$1"${siteName}"`)
          .replace(/(<meta property="og:locale" content=)"[^"]*"/, `$1"${lang === 'es' ? 'es_MX' : 'en_US'}"`)
          .replace(/(<meta property="og:image:alt" content=)"[^"]*"/, `$1"${es ? `Beach Score 0-100 para cada playa de ${name} — sargazo, oleaje, viento, sol` : `Beach Score 0-100 for every ${name} beach — sargassum, swell, wind, sun`}"`)
          .replace(/(<meta name="twitter:title" content=)"[^"]*"/, `$1"${title}"`)
          .replace(/(<meta name="twitter:description" content=)"[^"]*"/, `$1"${desc}"`)
          .replace(/(<meta name="geo.region" content=)"[^"]*"/, `$1"${REGION.countryCode || ''}"`)
          .replace(/(<meta name="geo.placename" content=)"[^"]*"/, `$1"${name}"`)
          .replace(/(<meta name="theme-color" content=)"[^"]*"/, `$1"${REGION.brand?.primary || '#0EA5E9'}"`)
          .replace(/<meta property="og:locale:alternate" content="[^"]*" \/>\s*/g, '')
          .replace(/https:\/\/sargasses-martinique\.com/g, `https://${domain}`)

        // ── 2) hreflang home : langue primaire à la racine + chaque langue secondaire
        //      RÉELLEMENT émise (fichier de contenu <id>.<lang>.json présent) sous
        //      /<lang>/, + x-default = primaire. Source unique = region-langs.cjs, le
        //      MÊME oracle que region-seo-pages (génération) et prepare-ftp (déploiement)
        //      → jamais de hreflang vers un /en/ inexistant. FL/PC (secondaryLangs:["es"]
        //      sans florida.es.json) → cluster identique à avant (en racine + x-default) ;
        //      Riviera Maya → es racine + en /en/ + x-default. ──
        const _RL = _require('./scripts/lib/region-langs.cjs')
        const _homeAlts = _RL.emittedLangs(REGION)
          .map(l => `<link rel="alternate" hreflang="${l}" href="https://${domain}${_RL.langPrefix(REGION, l)}/" />`)
          .join('\n    ')
        html = html.replace(
          /<link rel="alternate" hreflang="fr"[^>]*\/>\s*<link rel="alternate" hreflang="en"[^>]*\/>\s*<link rel="alternate" hreflang="es"[^>]*\/>\s*<link rel="alternate" hreflang="x-default"[^>]*\/>/,
          `${_homeAlts}\n    <link rel="alternate" hreflang="x-default" href="https://${domain}/" />`
        )

        // ── 2.5) REGION.sceneTheme : surcharge --sg-* (scène golden-hour) PAR MARCHÉ.
        //      Partiel : seules les vars retunées sont émises (ex. mer plus turquoise
        //      Caraïbe, sable plus pâle Floride) ; le reste retombe sur le défaut golden
        //      de index.html. Injecté APRÈS le :root de base → la cascade gagne. MQ/GP
        //      court-circuités plus haut (l.96) = aucun override sur les marchés FR.
        const sceneTheme = REGION.sceneTheme
        if (sceneTheme && typeof sceneTheme === 'object') {
          const VMAP = { sky0: '--sg-sky-0', sky1: '--sg-sky-1', sky2: '--sg-sky-2', sky3: '--sg-sky-3', seaTop: '--sg-sea-top', seaBot: '--sg-sea-bot', sand: '--sg-sand', rim: '--sg-rim', glit: '--sg-glit', sarg: '--sg-sarg', sargD: '--sg-sarg-d', sargL: '--sg-sarg-l', sargGlint: '--sg-sarg-glint', sargStrand: '--sg-sarg-strand', satBody: '--sg-sat-body', satTop: '--sg-sat-top', satLens: '--sg-sat-lens' }
          const okColor = v => typeof v === 'string' && /^(#[0-9a-fA-F]{3,8}|rgb|hsl)/.test(v.trim())
          const decls = Object.keys(VMAP).filter(k => okColor(sceneTheme[k])).map(k => `${VMAP[k]}:${sceneTheme[k].trim()}`).join(';')
          if (decls) html = html.replace('</head>', `  <style>:root{${decls};}</style>\n  </head>`)
        }

        // ── 3) Analytics : JAMAIS les IDs partagés MQ/GP sur une nouvelle région.
        //      Si la région a ses propres propriétés (ga4Id / clarityProjectId non-TBD),
        //      mêmes snippets avec ses IDs ; sinon blocs retirés (séparation stricte). ──
        const ga4Id = REGION.ga4Id && !String(REGION.ga4Id).startsWith('TBD') ? REGION.ga4Id : ''
        const clarityId = REGION.clarityProjectId && !String(REGION.clarityProjectId).startsWith('TBD') ? REGION.clarityProjectId : ''
        html = ga4Id
          ? html.replace(/G-V8JGMDZZ2Y/g, ga4Id)
          : html.replace(/<!-- Google Analytics 4 -->\s*<script async src="https:\/\/www\.googletagmanager\.com[^"]*"><\/script>\s*<script>[\s\S]*?<\/script>/, '<!-- GA4 : propriété dédiée à créer pour cette région (pas de tracking partagé MQ/GP) -->')
        html = clarityId
          ? html.replace(/w4o6w9aenv/g, clarityId)
          : html
              .replace(/<!-- Microsoft Clarity \+ bridge[\s\S]*?<\/script>/, '<!-- Clarity : projet dédié à créer pour cette région -->')
              .replace(/<link rel="preconnect" href="https:\/\/www\.clarity\.ms" \/>\s*/, '')

        // ── 4) OneSignal : appId de la région, sinon stub no-op (pas d'app partagée). ──
        const osId = REGION.onesignalAppId && !String(REGION.onesignalAppId).startsWith('TBD') ? REGION.onesignalAppId : ''
        if (osId) {
          html = html.replace(/window\.ONESIGNAL_APP_ID="[^"]*"/, `window.ONESIGNAL_APP_ID="${osId}"`)
        } else {
          html = html.replace(/<!-- OneSignal Push[\s\S]*?<\/script>/, '<script>window.ONESIGNAL_APP_ID="";window.loadOneSignal=function(){};</script>')
        }

        // ── 5) JSON-LD : remplace les 4 blocs MQ par 3 blocs région (pas de
        //      SiteNavigationElement : aucune sous-page générée pour l'instant). ──
        const ldWebApp = JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebApplication', name: `${siteName} · Daily Beach Status`, description: desc, url: `https://${domain}/`, applicationCategory: 'TravelApplication', operatingSystem: 'Web', inLanguage: [lang, ...(REGION.secondaryLangs || [])], dateModified: today, datePublished: today, publisher: { '@type': 'Organization', name: siteName, logo: `https://${domain}/icon-512.png` } })
        const ldFaq = JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: es ? [
          { '@type': 'Question', name: `¿Hay sargazo en ${name} ahora mismo?`, acceptedAnswer: { '@type': 'Answer', text: `Abre el mapa en vivo para ver el estado de hoy de cada playa de ${name}. Cada una de las ${beaches.length} playas monitoreadas recibe un Beach Score 0-100 que combina sargazo, oleaje, viento, temperatura del agua y sol — actualizado 4 veces al día con datos satelitales de la NOAA.` } },
          { '@type': 'Question', name: `¿Qué playas de ${name} están sin sargazo hoy?`, acceptedAnswer: { '@type': 'Answer', text: `Las condiciones cambian playa por playa: ${communes.join(', ')} no reciben lo mismo el mismo día. El mapa clasifica todas las playas a diario para elegir la más limpia — normalmente las protegidas por bahías o a sotavento.` } },
          { '@type': 'Question', name: `¿Cuándo es la temporada de sargazo en ${name}?`, acceptedAnswer: { '@type': 'Answer', text: 'La llegada de sargazo suele alcanzar su pico entre abril y septiembre, pero varía semana a semana con corrientes y viento. El monitoreo funciona todo el año con pronóstico de 7 días por playa.' } },
          { '@type': 'Question', name: '¿Cómo se miden los datos de sargazo?', acceptedAnswer: { '@type': 'Answer', text: 'La detección usa el índice satelital AFAI de la NOAA (Alternative Floating Algae Index) muestreado frente a cada playa, combinado con viento y corrientes en un pronóstico de 7 días por playa. Los datos se actualizan varias veces al día.' } },
        ] : [
          { '@type': 'Question', name: `Is there sargassum in ${name} right now?`, acceptedAnswer: { '@type': 'Answer', text: `Open the live map to see today's status for every ${name} beach. Each of the ${beaches.length} monitored beaches gets a Beach Score 0-100 combining sargassum, swell, wind, water temperature and sun — updated 4× daily from NOAA satellite data.` } },
          { '@type': 'Question', name: `Which ${name} beaches are sargassum-free today?`, acceptedAnswer: { '@type': 'Answer', text: `Conditions differ beach by beach: ${communes.join(', ')} are not hit equally on the same day. The map ranks all beaches daily so you can pick the cleanest one — typically the leeward and bay-protected spots.` } },
          { '@type': 'Question', name: `When is sargassum season in ${name}?`, acceptedAnswer: { '@type': 'Answer', text: 'Sargassum influx usually peaks between April and September, but landings vary week to week with currents and wind. Monitoring runs year-round with a 7-day forecast for every beach.' } },
          { '@type': 'Question', name: 'How is the sargassum data measured?', acceptedAnswer: { '@type': 'Answer', text: 'Detection uses the NOAA AFAI satellite index (Alternative Floating Algae Index) sampled offshore of each beach, blended with wind and current data into a per-beach 7-day forecast. Data refreshes several times a day.' } },
        ] })
        const ldOrg = JSON.stringify({ '@context': 'https://schema.org', '@type': 'Organization', name: siteName, url: `https://${domain}`, logo: `https://${domain}/icon-512.png`, description: es ? `Estado diario del sargazo y Beach Score 0-100 para las playas de ${name}` : `Daily sargassum status and Beach Score 0-100 for ${name} beaches`, areaServed: [name, REGION.country].filter(Boolean), knowsAbout: [es ? 'sargazo' : 'sargassum', es ? 'playas' : 'beaches', name, REGION.country].filter(Boolean) })
        html = html
          .replace(/\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '')
          .replace('<style>', `<script type="application/ld+json">\n    ${ldWebApp}\n    </script>\n    <script type="application/ld+json">\n    ${ldFaq}\n    </script>\n    <script type="application/ld+json">\n    ${ldOrg}\n    </script>\n  <style>`)

        // ── 6) noscript SEO : contenu région en langue primaire, SANS liens internes
        //      (aucune sous-page générée → zéro phantom href, cf. bug seo-link-graph). ──
        const byCommune = communes.map(c => `<h2>${c} — ${es ? 'playas monitoreadas a diario' : 'beaches monitored daily'}</h2>\n        <p>${beaches.filter(b => b.commune === c).map(b => b.name).join(', ')}.</p>`).join('\n        ')
        const noscriptRegion = es ? `<noscript>
        <h1>Sargazo en ${name} Hoy — estado en vivo de cada playa (2026)</h1>
        <p>¿Qué playa de ${name} está sin sargazo hoy? Estado diario de ${beaches.length} playas (${beachNames.slice(0, 6).join(', ')}…) con datos satelitales de la NOAA, Beach Score 0-100 y pronóstico de 7 días por playa.</p>
        ${byCommune}
        <h2>Temporada de sargazo en ${name} ${today.slice(0, 4)}</h2>
        <p>La llegada de sargazo suele alcanzar su pico de abril a septiembre, pero varía semana a semana con viento y corrientes. El mapa se actualiza 4 veces al día, todo el año, para elegir la playa correcta antes de salir.</p>
      </noscript>` : `<noscript>
        <h1>${name} Sargassum Today — live status for every beach (2026)</h1>
        <p>Which ${name} beach is sargassum-free today? Daily status for ${beaches.length} beaches (${beachNames.slice(0, 6).join(', ')}…) from NOAA satellite data, with a Beach Score 0-100 and a 7-day forecast per beach.</p>
        ${byCommune}
        <h2>Sargassum season in ${name} ${today.slice(0, 4)}</h2>
        <p>Sargassum arrivals usually peak from April to September, but vary week to week with wind and currents. The map is updated 4× daily, year-round, so you can pick the right beach before you go.</p>
      </noscript>`
        html = html.replace(/<noscript>\s*<h1>[\s\S]*?<\/noscript>/, noscriptRegion)

        return html
      },
    },
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
        // Publier /api/reliability.json
        try {
          const btPath = resolve(__dirname, 'scripts/automation/data/backtest-results.json')
          if (existsSync(btPath)) {
            const bt = JSON.parse(readFileSync(btPath, 'utf-8'))
            const relData = {
              overall: bt.overall,
              regimeReliability: bt.regimeReliability,
              totalPairs: bt.totalPairs,
              archiveDays: bt.archiveDays,
              dateRange: bt.dateRange
            }
            const apiDir = resolve(outDir, 'api')
            mkdirSync(apiDir, { recursive: true })
            writeFileSync(resolve(apiDir, 'reliability.json'), JSON.stringify(relData), 'utf-8')
            console.log('   → /api/reliability.json publiée')
          }
        } catch (e) {
          console.warn('   ⚠ /api/reliability.json failed:', e.message)
        }

        if (IS_NEW_REGION) {
          try {
            const { generateRegionSeoPages } = _require('./scripts/lib/region-seo-pages.cjs')
            generateRegionSeoPages(REGION, resolve(__dirname, 'dist'))
          } catch (e) { console.warn('   ⚠ seo-pages région:', e.message) }
          // Page fiabilité (/reliability/ EN, /fiabilidad/ ES) — méthode + précision
          // backtest réelle + fraîcheur. Ajoutée au sitemap.xml régional (d'où
          // l'appel APRÈS generateRegionSeoPages qui l'écrit).
          try {
            const { generateReliabilityPages } = _require('./scripts/lib/reliability-page.cjs')
            generateReliabilityPages(REGION, resolve(__dirname, 'dist'))
          } catch (e) { console.warn('   ⚠ page fiabilité région:', e.message) }
          // Pages mois (/sargassum-june-2026/ EN, /sargazo-junio-2026/ ES) —
          // bilan mensuel calculé depuis history.json régional réel (mois passés
          // ≥ 15 jours de données + mois courant « en cours »). Sitemap patché.
          try {
            const { generateMonthPages } = _require('./scripts/lib/month-pages.cjs')
            generateMonthPages(REGION, resolve(__dirname, 'dist'))
          } catch (e) { console.warn('   ⚠ pages mois région:', e.message) }
          // Page santé Q&A (/sargassum-health-risks/ EN, /sargazo-salud-riesgos/ ES) —
          // FAQ médicalement conservatrice (H2S, baignade, enfants, peau, animaux) +
          // FAQPage/Breadcrumb JSON-LD. Sitemap patché (d'où l'appel APRÈS region-seo-pages).
          try {
            const { generateHealthPages } = _require('./scripts/lib/health-page.cjs')
            generateHealthPages(REGION, resolve(__dirname, 'dist'))
          } catch (e) { console.warn('   ⚠ page santé région:', e.message) }
          return
        }
        const indexPath = resolve(outDir, 'index.html')
        try {
          // Patch dateModified to today's date in index.html
          let html = readFileSync(indexPath, 'utf-8')
          html = html.replace(/"dateModified":"[^"]*"/, `"dateModified":"${new Date().toISOString().slice(0,10)}"`)
          writeFileSync(indexPath, html)
          // Sub-page template: strip the root SEO noscript (the long block starting
          // with <h1>) because every sub-page (beach, editorial, /plages/, hub, EN, ES,
          // conditions) appends its own page-specific noscript. Leaving the root version
          // duplicates content AND, on the GP build, ships hardcoded MQ beach links that
          // 404 on guadeloupe — exactly the phantom-href bug surfaced by seo-link-graph.
          const htmlSubpage = html.replace(/<noscript>\s*<h1>[\s\S]*?<\/noscript>/, '')
          // Saveur GP pour les pages bâties sur le shell MQ (conditions, /plages/) :
          // ré-ancre les URL absolues + og:site_name/geo, et retire le FAQPage
          // homepage hérité (réponses spécifiques Martinique — le schema doit
          // matcher la page). Composites "Martinique et Guadeloupe" non concernés
          // (aucun dans les tags visés). Audit 2026-06-10 : og:site_name
          // "Sargasses Martinique" + SearchAction MQ fuyaient sur /conditions/* GP.
          const toGpMirror = (h) => h
            .replace(/https:\/\/sargasses-martinique\.com/g, 'https://sargasses-guadeloupe.com')
            // GA4 + Clarity GP (mêmes IDs que le patcher prepare-ftp — l'overlay
            // _gp/ est stampé APRÈS ce patcher et l'écraserait sinon)
            .replace(/G-V8JGMDZZ2Y/g, 'G-Q31VV3LLM9')
            .replace(/w4o6w9aenv/g, 'w4oect7ph3')
            .replace(/<meta property="og:site_name" content="[^"]*"\s*\/?>/, '<meta property="og:site_name" content="Sargasses Guadeloupe" />')
            .replace(/(<meta property="og:image:alt" content="[^"]*?)Martinique([^"]*?")/g, '$1Guadeloupe$2')
            .replace(/(<meta name="geo\.region" content=")MQ(")/, '$1GP$2')
            .replace(/(<meta name="geo\.placename" content=")Martinique(")/, '$1Guadeloupe$2')
            .replace(/"Sargasses Martinique"/g, '"Sargasses Guadeloupe"')
            .replace(/("name":"Plages )Martinique/g, '$1Guadeloupe')
            .replace(/"sameAs":\["https:\/\/sargasses-guadeloupe\.com"\]/g, '"sameAs":["https://sargasses-martinique.com"]')
            .replace(/<script type="application\/ld\+json">(?=[\s\S]{0,200}?"@type":"FAQPage")[\s\S]*?<\/script>\s*/, '')
          const scriptMatch = html.match(/src="([^"]+\.js)"/)
          const scriptSrc = scriptMatch ? (scriptMatch[1].startsWith('/') ? scriptMatch[1] : '/' + scriptMatch[1]) : '/assets/index.js'
          const pages = [
            { path: 'carte-sargasses', enPath: 'en/sargassum-map', esPath: 'es/mapa-sargazo', title: 'Carte des sargasses Martinique en temps réel (2026)', desc: 'Carte interactive des sargasses en Martinique. Où se baigner aujourd\'hui, plages propres, état en direct. Données satellite Copernicus.' },
            { path: 'previsions', enPath: null, title: 'Prévisions sargasses Martinique 7 jours (2026)', desc: 'Prévisions sargasses Martinique J+1 à J+7. Où aller à la plage cette semaine. Courants, vent, satellite.' },
            { path: 'alertes', enPath: 'en/sargassum-alerts', esPath: 'es/alertas-sargazo', title: 'Alertes sargasses Martinique et Guadeloupe — Notifications en temps réel', desc: 'Recevez des alertes sargasses pour vos plages en Martinique et Guadeloupe. Notifications en temps réel quand l\'état change. Planifiez vos sorties plage sereinement.' },
            // SEO editorial pages
            { path: 'saison-sargasses-martinique', enPath: 'en/sargassum-season', esPath: 'es/temporada-sargazo', title: 'Saison des sargasses en Martinique 2026 — Quand et où ?', desc: 'Quand arrivent les sargasses en Martinique en 2026 ? Pic de saison avril-septembre, mois à éviter, plages les plus touchées. Prévisions en temps réel.' },
            { path: 'saison-sargasses-guadeloupe', enPath: null, title: 'Saison des sargasses en Guadeloupe 2026 — Quand et où ?', desc: 'Quand arrivent les sargasses en Guadeloupe en 2026 ? Pic de saison avril-septembre, mois à éviter, plages les plus touchées. Prévisions en temps réel.' },
            { path: 'plages-sans-sargasses', enPath: 'en/best-beaches-no-sargassum', esPath: 'es/mejores-playas-sin-sargazo', title: 'Plages sans sargasses en Martinique et Guadeloupe (2026)', desc: 'Anses d\'Arlet, Les Salines, Malendure... Quelles plages sont propres aujourd\'hui ? Suivi en temps réel par satellite pour Martinique et Guadeloupe.' },
            { path: 'meilleures-plages-martinique-sargasses', enPath: 'en/best-beaches-martinique', title: 'Meilleures plages de Martinique sans sargasses — Carte en temps réel 2026', desc: 'Anses d\'Arlet, Anse Dufour, Anse Mitan, Grande Anse... Classement des plages de Martinique propres aujourd\'hui. Données satellite Copernicus, prévisions 7 jours.' },
            { path: 'meilleures-plages-guadeloupe-sargasses', enPath: 'en/best-beaches-guadeloupe', title: 'Meilleures plages de Guadeloupe sans sargasses — Carte en temps réel 2026', desc: 'Malendure, Grande Anse Deshaies, Plage du Souffleur, Plage de la Perle... Classement des plages de Guadeloupe propres aujourd\'hui. Données satellite Copernicus, prévisions 7 jours.' },
            { path: 'danger-sargasses-h2s', enPath: null, title: 'Sargasses et H2S : dangers pour la santé, précautions', desc: 'Le H2S dégagé par les sargasses en décomposition peut irriter les yeux et les voies respiratoires. Risques, seuils, précautions pour enfants et personnes fragiles.' },
            // New editorial pages — covering Météo France content gaps
            { path: 'comprendre-sargasses', enPath: 'en/understanding-sargassum', title: 'Comprendre les sargasses : origines, prolifération et prévision (2026)', desc: 'D\'où viennent les sargasses ? Mer des Sargasses, courants atlantiques, nutriments Amazon/Orénoque. Comment fonctionne la détection satellite et les prévisions.' },
            { path: 'bilan-sargasses-2025', enPath: null, title: 'Bilan sargasses 2025 Martinique et Guadeloupe — Année record', desc: 'Bilan de la saison sargasses 2025 aux Antilles : échouages records, plages les plus touchées, comparaison 2024. Données satellite et historique.' },
            { path: 'detection-satellite-sargasses', enPath: 'en/satellite-sargassum-detection', title: 'Détection satellite des sargasses : AFAI, OLCI, Copernicus (2026)', desc: 'Comment les satellites détectent les sargasses en temps réel. Indice AFAI, capteurs MODIS et OLCI, résolution, couverture nuageuse. Notre méthode expliquée.' },
            { path: 'previsions-methode', enPath: null, title: 'Prévision sargasses : notre méthode vs Météo France (2026)', desc: 'Comment nous prédisons les échouages de sargasses. Modèle de dérive, courants, vent, persistance exponentielle. Comparaison avec le bulletin Météo France MOTHY.' },
            { path: 'nettoyer-sargasses', enPath: null, title: 'Sargasses sur la plage : que faire, protection, signalement', desc: 'Que faire face aux sargasses ? Précautions H2S, qui prévenir, comment signaler un échouage. Guide pratique pour résidents et touristes aux Antilles.' },
            { path: 'sargasses-record-2026', enPath: null, title: 'Sargasses 2026 : année record confirmée aux Antilles — Suivi temps réel', desc: 'Sargasses 2026 : niveaux record confirmés, pic mai-août en cours. Suivi satellite quotidien, prévisions 7 jours, alertes. Martinique et Guadeloupe jour par jour.' },
            // Ported from legacy sargasses-martinique repo — high-intent SEO queries
            { path: 'faq', enPath: null, title: 'FAQ Sargasses Martinique — Réponses aux questions fréquentes (2026)', desc: 'Quand arrivent les sargasses en Martinique ? Où se baigner sans sargasses ? Côte Caraïbe ou Atlantique ? Réponses courtes et claires, carte en temps réel.', isFaq: true },
            { path: 'lexique', enPath: null, title: 'Lexique sargasses : NFAI, échouage, Sentinel, niveau de risque', desc: 'Définitions utiles pour comprendre les sargasses : NFAI, échouage, H2S, côte Caraïbe vs Atlantique, Sentinel-2/3, niveau de risque 1 à 10.' },
            { path: 'methode-carte', enPath: null, title: 'Comment fonctionne la carte sargasses : méthode et sources', desc: 'Satellites Sentinel-2/3, indice NFAI, observations citoyennes, prévisions 7 jours. Comment nous calculons le niveau de risque de chaque plage.' },
            // "cette semaine" — intent hebdomadaire haute-fréquence (concurrents : rci.fm, meteofrance.gp)
            { path: 'sargasses-martinique-cette-semaine', enPath: null, title: 'Sargasses Martinique cette semaine — Plages touchées et propres aujourd\'hui', desc: 'Quelles plages de Martinique sont touchées par les sargasses cette semaine ? Carte en temps réel, prévisions 7 jours par plage, côte Caraïbe vs Atlantique. Mise à jour quotidienne.' },
            { path: 'sargasses-guadeloupe-cette-semaine', enPath: null, title: 'Sargasses Guadeloupe cette semaine — Plages touchées et propres aujourd\'hui', desc: 'Quelles plages de Guadeloupe sont touchées par les sargasses cette semaine ? Grande-Terre, Basse-Terre, Marie-Galante. Carte en temps réel, prévisions 7 jours, mise à jour quotidienne.' },
            // MÉTÉO — modèle mental n°1 découvert dans la data (cluster GSC "meteo sargasse*" >110 clics/sem en hausse, requêtes "carte" en baisse). On consulte comme la météo, chaque matin.
            { path: 'meteo-sargasses-martinique', enPath: null, title: 'Météo des sargasses Martinique — état du jour et prévision 7 jours', desc: 'La météo des sargasses en Martinique, mise à jour chaque jour : plages propres ou à éviter aujourd\'hui, prévision 7 jours par plage, côte Caraïbe vs Atlantique. Données satellite Copernicus.', isFaq: true },
            { path: 'meteo-sargasses-guadeloupe', enPath: null, title: 'Météo des sargasses Guadeloupe — état du jour et prévision 7 jours', desc: 'La météo des sargasses en Guadeloupe, mise à jour chaque jour : plages propres ou à éviter aujourd\'hui, prévision 7 jours par plage, Grande-Terre, Basse-Terre, Marie-Galante. Données satellite.', isFaq: true },
            // Phase 2 SEO — intention "aujourd'hui" + "près de moi" (haute fréquence, non couvertes)
            { path: 'sargasses-aujourdhui', enPath: 'en/sargassum-today', esPath: 'es/sargazo-hoy', title: 'Sargasses aujourd\'hui en Martinique et Guadeloupe — État des plages en direct', desc: 'L\'état des sargasses aujourd\'hui sur toutes les plages de Martinique et Guadeloupe. Carte satellite en temps réel, mise à jour quotidienne. Plages propres, à éviter, prévision demain.' },
            { path: 'sargasses-pres-de-moi', enPath: 'en/sargassum-near-me', esPath: 'es/sargazo-cerca-de-mi', title: 'Sargasses près de moi — Plages propres autour de ma position', desc: 'Trouvez les plages sans sargasses les plus proches de vous en Martinique ou Guadeloupe. Géolocalisation automatique, carte en temps réel, prévision 7 jours.' },
            // Cluster Bulletin — capte "bulletin sargasses martinique/guadeloupe" (intention quotidienne dédiée)
            { path: 'bulletin-sargasses-martinique', enPath: null, title: 'Bulletin sargasses Martinique du jour — état des plages aujourd\'hui', desc: 'Le bulletin sargasses de la Martinique : état du jour de plus de 50 plages (propre, modéré, à éviter), prévision 7 jours, mis à jour plusieurs fois par jour par satellite. Côte Caraïbe vs Atlantique.' },
            { path: 'bulletin-sargasses-guadeloupe', enPath: null, title: 'Bulletin sargasses Guadeloupe du jour — état des plages aujourd\'hui', desc: 'Le bulletin sargasses de la Guadeloupe : état du jour de plus de 80 plages de l\'archipel (Grande-Terre, Basse-Terre, Marie-Galante), prévision 7 jours, mis à jour plusieurs fois par jour par satellite.' },
            // Cluster Communes (Martinique) — hub-and-spoke vers les fiches plage
            { path: 'sargasses-le-diamant', enPath: null, title: 'Sargasses au Diamant (Martinique) — quelles plages aujourd\'hui ?', desc: 'Y a-t-il des sargasses au Diamant ? État du jour de la Plage du Diamant et de l\'Anse Cafard, au pied du Rocher. Carte en temps réel, prévision 7 jours, meilleures alternatives Caraïbe.' },
            { path: 'sargasses-sainte-luce', enPath: null, title: 'Sargasses à Sainte-Luce (Martinique) — état des plages aujourd\'hui', desc: 'Y a-t-il des sargasses à Sainte-Luce ? État du jour d\'Anse Gros Raisins, Plage de Sainte-Luce, Anse Corps de Garde et Anse Mabouya. Carte en temps réel, prévision 7 jours.' },
            { path: 'sargasses-sainte-anne-martinique', enPath: null, title: 'Sargasses à Sainte-Anne (Martinique) — Les Salines et plages du jour', desc: 'Y a-t-il des sargasses à Sainte-Anne en Martinique ? État du jour des Salines, Anse Caritan, Anse Trabaud, Anse Michel. Carte en temps réel, prévision 7 jours, alternatives propres.' },
            { path: 'sargasses-les-trois-ilets', enPath: null, title: 'Sargasses aux Trois-Îlets (Martinique) — Anse Mitan, Pointe du Bout', desc: 'Y a-t-il des sargasses aux Trois-Îlets ? Sur la côte Caraïbe abritée, Anse Mitan, Pointe du Bout et Anse à l\'Âne sont parmi les mieux protégées. État du jour, carte en temps réel.' },
            // Cluster Santé — link-bait citable, intention santé/H2S (i18n EN voyageurs)
            { path: 'sargasses-sante-symptomes', enPath: 'en/sargassum-health', title: 'Sargasses et santé : symptômes, qui est à risque, que faire', desc: 'Les sargasses sont-elles dangereuses ? Symptômes du H₂S et de l\'ammoniac, publics à risque (femmes enceintes, enfants, asthmatiques), précautions concrètes. Guide santé Antilles.' },
            // Cluster Que faire / Plan B — net-new, conversion (renvoie aux plages propres), i18n EN voyageurs
            { path: 'que-faire-sargasses-martinique', enPath: 'en/what-to-do-sargassum-martinique', title: 'Plage couverte de sargasses ? Que faire en Martinique (plan B)', desc: 'Que faire quand la plage est pleine de sargasses en Martinique ? Plages Caraïbe garanties, rivières et cascades, randonnée, sorties bateau. Le plan B pour sauver votre journée.' },
            { path: 'que-faire-sargasses-guadeloupe', enPath: 'en/what-to-do-sargassum-guadeloupe', title: 'Plage couverte de sargasses ? Que faire en Guadeloupe (plan B)', desc: 'Que faire quand la plage est pleine de sargasses en Guadeloupe ? Côte sous-le-vent de Basse-Terre, chutes et bassins, randonnée à la Soufrière, sorties îlets. Le plan B anti-sargasses.' },
          ]
          // Noscript editorial content for Google crawling
          const editorialContent = {
            'bulletin-sargasses-martinique': `<article><h1>Bulletin sargasses Martinique du jour — état des plages aujourd'hui</h1><p>Vous cherchez le <strong>bulletin sargasses de la Martinique</strong> ? Cette page rassemble, en un coup d'œil, l'état du jour de toutes les plages de l'île : propres, modérées ou à éviter. Contrairement à un bulletin papier figé, notre suivi est <a href="/">recalculé plusieurs fois par jour</a> à partir des données satellite Copernicus et des signalements sur place. Pour le détail plage par plage et la prévision, ouvrez la <a href="/carte-sargasses/">carte en temps réel</a>.</p><h2>Ce que contient le bulletin sargasses</h2><ul><li><strong>État du jour par plage</strong> — un niveau de risque clair (propre / modéré / à éviter) pour plus de 50 plages de Martinique.</li><li><strong>Prévision 7 jours</strong> — l'évolution attendue par plage, utile pour <a href="/previsions/">planifier la semaine</a>.</li><li><strong>Côte Caraïbe vs Atlantique</strong> — les deux façades n'évoluent pas de la même manière selon le vent et les courants.</li><li><strong>Fraîcheur affichée</strong> — la date et l'heure de la dernière mise à jour sont indiquées, pour ne jamais lire une donnée périmée.</li></ul><h2>Comment ce bulletin est construit</h2><p>Trois sources se complètent. D'abord les <a href="/detection-satellite-sargasses/">satellites Sentinel-3 et MODIS</a> qui mesurent l'indice AFAI (présence d'algues en mer). Ensuite un modèle de dérive qui anticipe l'arrivée des bancs côtiers selon les alizés et les courants. Enfin les <strong>signalements citoyens</strong> : depuis une fiche plage, le bouton « Je suis sur place » confirme l'état réel en un clic. Notre <a href="/methode-carte/">méthode complète est publique</a>, ainsi que notre <a href="/fiabilite/">taux de fiabilité par saison</a>.</p><h2>Bulletin côte par côte</h2><p>La <strong>côte Caraïbe</strong> (Les Anses d'Arlet, Les Trois-Îlets, Schœlcher, Le Carbet) est la plus souvent propre, protégée des alizés porteurs de sargasses. La <strong>côte Atlantique</strong> (Tartane, Le Vauclin, Sainte-Anne côté est) reçoit directement les arrivages. En saison de pic (mai à septembre), consultez le bulletin la veille au soir <em>et</em> le matin même : un front de vent peut déplacer un banc en quelques heures.</p><h2>Recevoir le bulletin automatiquement</h2><p>Plutôt que de vérifier à la main, <a href="/alertes/">activez les alertes gratuites</a> sur vos plages favorites : vous recevez l'état du jour avant de partir, sans rien consulter. C'est le bulletin sargasses qui vient à vous.</p><p><a href="/carte-sargasses/">Carte en temps réel</a> · <a href="/meteo-sargasses-martinique/">Météo des sargasses MQ</a> · <a href="/sargasses-martinique-cette-semaine/">Cette semaine</a> · <a href="/previsions/">Prévisions 7 jours</a> · <a href="/meilleures-plages-martinique-sargasses/">Meilleures plages</a></p></article>`,
            'bulletin-sargasses-guadeloupe': `<article><h1>Bulletin sargasses Guadeloupe du jour — état des plages aujourd'hui</h1><p>Vous cherchez le <strong>bulletin sargasses de la Guadeloupe</strong> ? Cette page réunit l'état du jour des plages de l'archipel — Grande-Terre, Basse-Terre, Marie-Galante, Les Saintes, La Désirade — en un coup d'œil : propres, modérées ou à éviter. Notre suivi est <a href="/">recalculé plusieurs fois par jour</a> à partir des données satellite Copernicus et des signalements sur place. Pour le détail plage par plage, ouvrez la <a href="/carte-sargasses/">carte en temps réel</a>.</p><h2>Ce que contient le bulletin sargasses</h2><ul><li><strong>État du jour par plage</strong> — un niveau clair (propre / modéré / à éviter) pour plus de 80 plages de l'archipel.</li><li><strong>Prévision 7 jours</strong> — l'évolution attendue par plage, pour <a href="/previsions/">planifier la semaine</a> et les traversées vers les dépendances.</li><li><strong>Profil par île</strong> — Grande-Terre, Basse-Terre et Marie-Galante n'évoluent pas de la même façon.</li><li><strong>Fraîcheur affichée</strong> — date et heure de dernière mise à jour visibles, jamais de donnée périmée.</li></ul><h2>Comment ce bulletin est construit</h2><p>Trois sources se complètent : les <a href="/detection-satellite-sargasses/">satellites Sentinel-3 et MODIS</a> (indice AFAI), un modèle de dérive qui anticipe les arrivages selon alizés et courants, et les <strong>signalements citoyens</strong> (« Je suis sur place » sur chaque fiche plage). Notre <a href="/methode-carte/">méthode est publique</a> et notre <a href="/fiabilite/">fiabilité par saison</a> aussi.</p><h2>Bulletin par île</h2><p>La <strong>côte sous-le-vent de Basse-Terre</strong> (Malendure, Deshaies, Bouillante) est le refuge le plus fiable, protégée par la Soufrière. Le <strong>sud et l'est de Grande-Terre</strong> (Gosier, Sainte-Anne, Saint-François, Le Moule) encaissent les flux atlantiques. <strong>Marie-Galante</strong> (Capesterre) est parmi les zones les plus exposées. En pic (mai à septembre), vérifiez le bulletin la veille <em>et</em> le matin, surtout avant un ferry.</p><h2>Recevoir le bulletin automatiquement</h2><p><a href="/alertes/">Activez les alertes gratuites</a> sur vos plages favorites : l'état du jour vous parvient avant de partir, sans vérification manuelle.</p><p><a href="/carte-sargasses/">Carte en temps réel</a> · <a href="/meteo-sargasses-guadeloupe/">Météo des sargasses GP</a> · <a href="/sargasses-guadeloupe-cette-semaine/">Cette semaine</a> · <a href="/previsions/">Prévisions 7 jours</a> · <a href="/meilleures-plages-guadeloupe-sargasses/">Meilleures plages</a></p></article>`,
            'sargasses-le-diamant': `<article><h1>Sargasses au Diamant (Martinique) — quelles plages aujourd'hui ?</h1><p>Y a-t-il des <strong>sargasses au Diamant</strong> en ce moment ? Au pied du célèbre Rocher du Diamant, la commune occupe le sud de la Martinique, une position exposée aux houles atlantiques qui contournent la pointe sud de l'île. Résultat : Le Diamant connaît des épisodes d'échouage plus fréquents que les anses abritées de la côte Caraïbe. Vérifiez toujours l'<a href="/carte-sargasses/">état du jour sur la carte</a> avant de partir — il change d'une semaine à l'autre.</p><h2>Les plages du Diamant</h2><ul><li><a href="/plages/plage-du-diamant/">Plage du Diamant</a> — la grande plage de sable face au Rocher, environ 3 km. Magnifique mais ouverte plein sud : exposée aux arrivages en saison, baignade parfois agitée (courants).</li><li><a href="/plages/anse-cafard/">Anse Cafard</a> — à l'ouest du bourg, près du Mémorial de l'Anse Caffard. Plus discrète, état variable selon le vent.</li></ul><h2>Quand les sargasses touchent-elles Le Diamant ?</h2><p>Comme partout en Martinique, la <a href="/saison-sargasses-martinique/">saison s'étend d'avril à octobre</a>, avec un pic de mai à août. Le Diamant étant orienté sud-atlantique, il est généralement parmi les premières communes de la côte sud touchées quand les bancs arrivent. Hors saison (novembre à mars), la plage est le plus souvent propre.</p><h2>Où aller si Le Diamant est couvert ?</h2><p>La meilleure alternative est toute proche : remontez vers <a href="/plages/grande-anse-d-arlet/">Grande Anse d'Arlet</a> (≈ 20 min), refuge historique sur la côte Caraïbe, ou ses voisines <a href="/plages/anse-dufour/">Anse Dufour</a> et <a href="/plages/anse-noire/">Anse Noire</a>, criques abritées idéales pour le snorkeling. Consultez la liste des <a href="/meilleures-plages-martinique-sargasses/">plages les plus propres du jour</a>.</p><h2>Être prévenu pour Le Diamant</h2><p><a href="/alertes/">Activez une alerte gratuite</a> sur la Plage du Diamant : vous saurez la veille si elle est dégagée, sans avoir à vérifier. Pratique pour décider entre le Diamant et les Anses d'Arlet au dernier moment.</p><p><a href="/carte-sargasses/">Carte en temps réel</a> · <a href="/previsions/">Prévisions 7 jours</a> · <a href="/meteo-sargasses-martinique/">Météo sargasses MQ</a> · <a href="/sargasses-sainte-luce/">Sargasses à Sainte-Luce</a></p></article>`,
            'sargasses-sainte-luce': `<article><h1>Sargasses à Sainte-Luce (Martinique) — état des plages aujourd'hui</h1><p>Y a-t-il des <strong>sargasses à Sainte-Luce</strong> ? Station balnéaire du sud-caraïbe de la Martinique, Sainte-Luce est plutôt mieux protégée que la côte atlantique, mais reste exposée aux épisodes de pic quand les bancs contournent la pointe sud. Ses plages familiales et son lagon en font une destination prisée : vérifiez l'<a href="/carte-sargasses/">état du jour</a> avant de poser votre serviette.</p><h2>Les plages de Sainte-Luce</h2><ul><li><a href="/plages/anse-gros-raisins/">Anse Gros Raisins</a> — sable clair, eau calme, idéale en famille et pour le snorkeling.</li><li><a href="/plages/plage-de-sainte-luce/">Plage de Sainte-Luce</a> (bourg) — accessible, animée, proche des commerces.</li><li><a href="/plages/anse-corps-de-garde/">Anse Corps de Garde</a> — l'une des plus belles du secteur, lagon turquoise, snorkeling.</li><li><a href="/plages/anse-mabouya/">Anse Mabouya</a> — crique familiale abritée, ombragée.</li></ul><h2>Quand les sargasses arrivent-elles à Sainte-Luce ?</h2><p>La <a href="/saison-sargasses-martinique/">saison court d'avril à octobre</a>, pic de mai à août. Sur la côte sud-caraïbe, les arrivages sont plus intermittents qu'à l'est : une plage peut être propre alors qu'une autre, à quelques kilomètres, reçoit un banc. D'où l'intérêt de comparer les quatre plages de la commune sur la <a href="/carte-sargasses/">carte</a>.</p><h2>Où aller si Sainte-Luce est touchée ?</h2><p>Cap à l'ouest vers la côte Caraïbe garantie : <a href="/plages/grande-anse-d-arlet/">Grande Anse d'Arlet</a>, <a href="/plages/anse-dufour/">Anse Dufour</a> et <a href="/plages/anse-noire/">Anse Noire</a>. Ou consultez les <a href="/meilleures-plages-martinique-sargasses/">meilleures plages propres du jour</a>.</p><h2>Être prévenu pour Sainte-Luce</h2><p><a href="/alertes/">Activez une alerte gratuite</a> sur votre plage favorite de Sainte-Luce et recevez l'état du jour avant de partir.</p><p><a href="/carte-sargasses/">Carte en temps réel</a> · <a href="/previsions/">Prévisions 7 jours</a> · <a href="/sargasses-le-diamant/">Sargasses au Diamant</a> · <a href="/sargasses-sainte-anne-martinique/">Sargasses à Sainte-Anne</a></p></article>`,
            'sargasses-sainte-anne-martinique': `<article><h1>Sargasses à Sainte-Anne (Martinique) — Les Salines et plages du jour</h1><p>Y a-t-il des <strong>sargasses à Sainte-Anne</strong> en Martinique ? Pointe sud de l'île, Sainte-Anne abrite la plus célèbre plage des Antilles — <a href="/plages/plage-des-salines/">Les Salines</a> — mais aussi des plages exposées plein est. Son profil est contrasté : superbe côté ouest et baie, plus aléatoire côté atlantique. Vérifiez l'<a href="/carte-sargasses/">état du jour plage par plage</a> avant de venir. <em>(Sainte-Anne existe aussi en Guadeloupe — cette page concerne la Martinique.)</em></p><h2>Les plages de Sainte-Anne (Martinique)</h2><ul><li><a href="/plages/plage-des-salines/">Plage des Salines</a> — la carte postale de l'île, cocotiers et sable blond. Belle mais exposée selon le vent : état très variable en saison.</li><li><a href="/plages/anse-caritan/">Anse Caritan</a> et <a href="/plages/anse-meunier/">Anse Meunier</a> — secteur sud, familial, souvent plus calme.</li><li><a href="/plages/plage-du-bourg-sainte-anne/">Plage du Bourg</a> — au cœur du village, accessible.</li><li><a href="/plages/anse-trabaud/">Anse Trabaud</a>, <a href="/plages/anse-michel/">Anse Michel</a> — côté est/atlantique, sauvages, plus exposées aux arrivages.</li></ul><h2>Quand les sargasses touchent-elles Sainte-Anne ?</h2><p>La <a href="/saison-sargasses-martinique/">saison s'étend d'avril à octobre</a>, pic de mai à août. Les plages atlantiques (Trabaud, Michel) reçoivent les premiers et plus gros arrivages ; Les Salines et le secteur ouest sont plus protégés mais pas garantis. Comparez les plages de la commune sur la <a href="/carte-sargasses/">carte en temps réel</a>.</p><h2>Où aller si Sainte-Anne est couverte ?</h2><p>Direction la côte Caraïbe : <a href="/plages/grande-anse-d-arlet/">Grande Anse d'Arlet</a>, <a href="/plages/anse-dufour/">Anse Dufour</a>, <a href="/plages/anse-noire/">Anse Noire</a>, ou les <a href="/meilleures-plages-martinique-sargasses/">plages les plus propres du jour</a>.</p><h2>Être prévenu pour Sainte-Anne</h2><p><a href="/alertes/">Activez une alerte gratuite</a> sur Les Salines ou une autre plage de Sainte-Anne : l'état du jour vous parvient avant de partir.</p><p><a href="/carte-sargasses/">Carte en temps réel</a> · <a href="/previsions/">Prévisions 7 jours</a> · <a href="/sargasses-sainte-luce/">Sargasses à Sainte-Luce</a> · <a href="/sargasses-le-diamant/">Sargasses au Diamant</a></p></article>`,
            'sargasses-les-trois-ilets': `<article><h1>Sargasses aux Trois-Îlets (Martinique) — Anse Mitan, Pointe du Bout</h1><p>Y a-t-il des <strong>sargasses aux Trois-Îlets</strong> ? Cœur touristique de la Martinique, face à la baie de Fort-de-France, la commune des Trois-Îlets est sur la <strong>côte Caraïbe</strong> : c'est l'un des secteurs les <em>mieux</em> protégés des sargasses de toute l'île, abrité des alizés par le relief. Les épisodes y sont rares et brefs, mais en année exceptionnelle ils peuvent survenir — d'où l'intérêt de jeter un œil à la <a href="/carte-sargasses/">carte du jour</a>.</p><h2>Les plages des Trois-Îlets</h2><ul><li><a href="/plages/anse-mitan/">Anse Mitan</a> — plage animée, eau calme, restaurants et navette bateau vers Fort-de-France.</li><li><a href="/plages/pointe-du-bout/">Pointe du Bout</a> — marina, hôtels, plage abritée, très familiale.</li><li><a href="/plages/anse-a-l-ane/">Anse à l'Âne</a> — sable clair face à la baie, ambiance détendue, accessible en navette.</li></ul><h2>Pourquoi les Trois-Îlets sont-ils si protégés ?</h2><p>La baie de Fort-de-France et l'orientation nord-ouest de la commune la mettent à l'abri du flux atlantique porteur de sargasses. C'est la même logique qui protège <a href="/plages/grande-anse-d-arlet/">les Anses d'Arlet</a> voisines. En pleine <a href="/saison-sargasses-martinique/">saison de pic</a>, quand la côte est est saturée, les Trois-Îlets restent presque toujours praticables — un refuge fiable.</p><h2>Et si un épisode rare survenait ?</h2><p>Dans les années record, des bancs peuvent contourner la pointe sud et atteindre temporairement la côte Caraïbe. Dans ce cas, consultez les <a href="/meilleures-plages-martinique-sargasses/">plages les plus propres du jour</a> et la <a href="/previsions/">prévision 7 jours</a> pour ajuster.</p><h2>Être prévenu pour les Trois-Îlets</h2><p><a href="/alertes/">Activez une alerte gratuite</a> sur Anse Mitan ou Anse à l'Âne — utile surtout en pic de saison.</p><p><a href="/carte-sargasses/">Carte en temps réel</a> · <a href="/previsions/">Prévisions 7 jours</a> · <a href="/meilleures-plages-martinique-sargasses/">Meilleures plages MQ</a> · <a href="/sargasses-le-diamant/">Sargasses au Diamant</a></p></article>`,
            'sargasses-sante-symptomes': `<article><h1>Sargasses et santé : symptômes, qui est à risque, que faire</h1><p>Les sargasses sont-elles dangereuses pour la santé ? <strong>Fraîches et en mer, non.</strong> Le risque apparaît lorsqu'elles <strong>s'accumulent et se décomposent</strong> sur la plage : elles dégagent alors deux gaz, le sulfure d'hydrogène (H₂S, odeur d'œuf pourri) et l'ammoniac (NH₃). Aux Antilles, en Martinique et Guadeloupe, c'est cette décomposition — pas l'algue elle-même — qui justifie les précautions. Pour les seuils techniques, voir notre page <a href="/danger-sargasses-h2s/">dangers du H₂S</a>.</p><h2>Quels symptômes ?</h2><p>À faible concentration, l'exposition au H₂S et à l'ammoniac peut provoquer&nbsp;:</p><ul><li>Irritation des yeux (picotements, larmoiement) et de la gorge</li><li>Maux de tête, nausées, vertiges</li><li>Gêne respiratoire, toux — surtout chez les personnes sensibles</li><li>Mauvais goût métallique, odeur d'œuf pourri tenace</li></ul><p>Ces symptômes sont généralement <strong>réversibles</strong> : ils régressent en s'éloignant de la zone et en respirant un air propre. L'odeur peut aussi noircir les bijoux en argent et les appareils électroniques — signe qu'il vaut mieux ne pas s'attarder.</p><h2>Qui doit être particulièrement prudent ?</h2><ul><li><strong>Femmes enceintes</strong> — par précaution, éviter les zones d'échouage en décomposition.</li><li><strong>Nourrissons et jeunes enfants</strong> — plus sensibles, plus près du sol où le gaz stagne.</li><li><strong>Personnes asthmatiques ou avec une maladie respiratoire/cardiaque</strong>.</li><li><strong>Personnes âgées</strong>.</li></ul><p>Ces publics devraient éviter de séjourner près d'amas en décomposition, surtout par vent faible où le gaz se concentre.</p><h2>Que faire concrètement ?</h2><ol><li><strong>Choisir une plage propre.</strong> Le moyen le plus simple d'éviter tout risque : vérifier l'<a href="/carte-sargasses/">état du jour</a> et viser les <a href="/plages-sans-sargasses/">plages sans sargasses</a>.</li><li><strong>S'éloigner si ça sent l'œuf pourri.</strong> L'odeur est le signal d'alerte — ne pas rester sous le vent d'un amas.</li><li><strong>Ne pas laisser les enfants jouer dans les algues échouées.</strong></li><li><strong>Anticiper.</strong> <a href="/alertes/">Les alertes gratuites</a> préviennent quand votre plage change d'état.</li></ol><p>En cas de symptômes persistants (gêne respiratoire qui ne passe pas), consultez un professionnel de santé. Les autorités (ARS, préfectures) publient des seuils d'évacuation pour les riverains les plus exposés.</p><p><a href="/danger-sargasses-h2s/">Dangers du H₂S en détail</a> · <a href="/nettoyer-sargasses/">Que faire face à un échouage</a> · <a href="/carte-sargasses/">Carte en temps réel</a> · <a href="/alertes/">Alertes gratuites</a></p></article>`,
            'que-faire-sargasses-martinique': `<article><h1>Plage couverte de sargasses ? Que faire en Martinique (plan B)</h1><p>Votre plage est pleine de <strong>sargasses</strong> et vous ne savez pas <strong>que faire en Martinique</strong> ? Bonne nouvelle : même en plein pic, une partie de l'île reste praticable, et il existe quantité d'alternatives à la baignade. Premier réflexe — vérifiez l'<a href="/carte-sargasses/">état du jour sur la carte</a> : une plage propre se trouve souvent à 20-30 minutes de route.</p><h2>1. Filer vers une plage Caraïbe garantie</h2><p>La côte Caraïbe est protégée des alizés porteurs de sargasses. Quand la côte atlantique sature, ces plages restent presque toujours propres&nbsp;:</p><ul><li><a href="/plages/grande-anse-d-arlet/">Grande Anse d'Arlet</a>, <a href="/plages/anse-dufour/">Anse Dufour</a>, <a href="/plages/anse-noire/">Anse Noire</a> — snorkeling, tortues, criques abritées.</li><li><a href="/plages/anse-mitan/">Anse Mitan</a> et <a href="/plages/anse-a-l-ane/">Anse à l'Âne</a> (Trois-Îlets) — familiales, accessibles en navette.</li></ul><p>La liste actualisée&nbsp;: <a href="/meilleures-plages-martinique-sargasses/">meilleures plages sans sargasses du jour</a>.</p><h2>2. Activités sans plage</h2><ul><li><strong>Rivières et cascades</strong> — Gorges de la Falaise, cascade de Didier, saut du Gendarme : baignade en eau douce, à l'abri des sargasses.</li><li><strong>Randonnée</strong> — la Montagne Pelée, la presqu'île de la Caravelle, la trace des Caps.</li><li><strong>Jardins et patrimoine</strong> — Jardin de Balata, distilleries (Clément, Depaz, La Mauny), Habitation Clément.</li><li><strong>Fonds blancs & sorties bateau</strong> — au départ du François ou du Robert, les vasques turquoise au large échappent aux échouages côtiers.</li></ul><h2>3. Adapter, pas annuler</h2><p>Les sargasses bougent vite. Une plage couverte aujourd'hui peut être dégagée dans deux jours&nbsp;: consultez la <a href="/previsions/">prévision 7 jours</a> et <a href="/alertes/">activez les alertes gratuites</a> pour saisir la bonne fenêtre. Évitez simplement de pique-niquer sous le vent d'un amas en décomposition (voir <a href="/sargasses-sante-symptomes/">sargasses et santé</a>).</p><p><a href="/carte-sargasses/">Carte en temps réel</a> · <a href="/meilleures-plages-martinique-sargasses/">Plages propres du jour</a> · <a href="/previsions/">Prévisions 7 jours</a> · <a href="/saison-sargasses-martinique/">Saison des sargasses</a></p></article>`,
            'que-faire-sargasses-guadeloupe': `<article><h1>Plage couverte de sargasses ? Que faire en Guadeloupe (plan B)</h1><p>Votre plage est envahie par les <strong>sargasses</strong> et vous cherchez <strong>que faire en Guadeloupe</strong> ? Même en pic de saison, une bonne partie de l'archipel reste praticable, et les alternatives à la baignade ne manquent pas. Premier réflexe — vérifiez l'<a href="/carte-sargasses/">état du jour sur la carte</a> : une plage propre se trouve souvent à moins de 30 minutes.</p><h2>1. Filer vers la côte sous-le-vent (Basse-Terre)</h2><p>La façade ouest de Basse-Terre est protégée par la Soufrière des alizés porteurs de sargasses. C'est le refuge le plus fiable de l'archipel&nbsp;:</p><ul><li><a href="/plages/plage-de-malendure/">Plage de Malendure</a> (Bouillante) — départ de la réserve Cousteau, snorkeling et plongée.</li><li><a href="/plages/la-grande-anse-deshaies/">La Grande Anse (Deshaies)</a> — la plus longue de Basse-Terre, presque toujours épargnée.</li><li><a href="/plages/plage-de-la-perle/">Plage de la Perle</a> (Deshaies) — baie en fer à cheval abritée.</li></ul><p>La liste actualisée&nbsp;: <a href="/meilleures-plages-guadeloupe-sargasses/">meilleures plages sans sargasses du jour</a>.</p><h2>2. Activités sans plage</h2><ul><li><strong>Chutes et bassins</strong> — Chutes du Carbet, bassin Paradise, saut de la Lézarde : baignade en eau douce.</li><li><strong>Randonnée</strong> — la Soufrière, le parc national, la Pointe des Châteaux, les traces de Basse-Terre.</li><li><strong>Patrimoine & saveurs</strong> — Mémorial ACTe, distilleries (Damoiseau, Bologne), plantations.</li><li><strong>Îlets & sorties bateau</strong> — le Grand Cul-de-Sac Marin, l'îlet du Gosier, les Saintes : les eaux du large échappent aux échouages côtiers.</li></ul><h2>3. Adapter, pas annuler</h2><p>Les sargasses se déplacent vite : une plage couverte aujourd'hui peut être dégagée en deux jours. Consultez la <a href="/previsions/">prévision 7 jours</a> et <a href="/alertes/">activez les alertes gratuites</a> pour saisir la bonne fenêtre. Évitez de vous installer sous le vent d'un amas en décomposition (voir <a href="/sargasses-sante-symptomes/">sargasses et santé</a>).</p><p><a href="/carte-sargasses/">Carte en temps réel</a> · <a href="/meilleures-plages-guadeloupe-sargasses/">Plages propres du jour</a> · <a href="/previsions/">Prévisions 7 jours</a> · <a href="/saison-sargasses-guadeloupe/">Saison des sargasses</a></p></article>`,
            'en/sargassum-health': `<article><h1>Is sargassum dangerous? Health effects, who's at risk, what to do</h1><p>Is sargassum dangerous to your health? <strong>Fresh and at sea, no.</strong> The risk appears when it <strong>piles up and rots</strong> on the beach, releasing two gases: hydrogen sulfide (H₂S, a rotten-egg smell) and ammonia (NH₃). In the Caribbean — Martinique, Guadeloupe and beyond — it is this decomposition, not the seaweed itself, that calls for caution.</p><h2>What are the symptoms?</h2><p>At low concentrations, exposure to H₂S and ammonia can cause:</p><ul><li>Eye irritation (stinging, watering) and sore throat</li><li>Headaches, nausea, dizziness</li><li>Breathing discomfort, coughing — especially in sensitive people</li><li>A metallic taste and a persistent rotten-egg smell</li></ul><p>These symptoms are usually <strong>reversible</strong>: they fade once you move away and breathe clean air. The gas can also tarnish silver jewellery and electronics — a sign it's best not to linger.</p><h2>Who should be extra careful?</h2><ul><li><strong>Pregnant women</strong> — as a precaution, avoid rotting strandings.</li><li><strong>Infants and young children</strong> — more sensitive, and closer to the ground where gas settles.</li><li><strong>People with asthma, or a respiratory or heart condition.</strong></li><li><strong>Elderly people.</strong></li></ul><h2>What to do</h2><ol><li><strong>Pick a clean beach.</strong> The simplest way to avoid any risk: check today's conditions on the <a href="/en/sargassum-map/">real-time map</a> and head for a clean beach.</li><li><strong>Move away if it smells of rotten eggs.</strong> The smell is the warning signal — don't stay downwind of a pile.</li><li><strong>Keep children out of stranded seaweed.</strong></li><li><strong>Plan ahead.</strong> <a href="/en/sargassum-alerts/">Free alerts</a> tell you when your beach changes status.</li></ol><p>If symptoms persist (breathing trouble that won't ease), see a health professional. Local authorities publish evacuation thresholds for the most exposed residents.</p><p><a href="/en/sargassum-map/">Real-time map</a> · <a href="/en/sargassum-alerts/">Free alerts</a> · <a href="/en/understanding-sargassum/">Understanding sargassum</a></p></article>`,
            'en/what-to-do-sargassum-martinique': `<article><h1>Beach covered in sargassum? What to do in Martinique (plan B)</h1><p>Your beach is buried in <strong>sargassum</strong> and you're wondering <strong>what to do in Martinique</strong>? Good news: even at peak season, much of the island stays usable, and there's plenty to do beyond the beach. First reflex — check today's conditions on the <a href="/en/sargassum-map/">real-time map</a>: a clean beach is often just 20–30 minutes away.</p><h2>1. Head for a sheltered Caribbean-coast beach</h2><p>The Caribbean (leeward) coast is shielded from the trade winds that carry sargassum. When the Atlantic coast is saturated, these beaches stay almost always clean — Grande Anse d'Arlet, Anse Dufour, Anse Noire (snorkeling, turtles, sheltered coves), or Anse Mitan and Anse à l'Âne near Les Trois-Îlets (family-friendly, reachable by shuttle boat). See the live list of <a href="/en/best-beaches-martinique/">clean beaches today</a>.</p><h2>2. Things to do away from the beach</h2><ul><li><strong>Rivers and waterfalls</strong> — Gorges de la Falaise, Didier waterfall, Saut du Gendarme: freshwater swimming, sargassum-free.</li><li><strong>Hiking</strong> — Mount Pelée, the Caravelle peninsula, the Trace des Caps coastal path.</li><li><strong>Gardens and heritage</strong> — Balata Garden, rum distilleries (Clément, Depaz, La Mauny).</li><li><strong>White-sand shallows &amp; boat trips</strong> — from Le François or Le Robert, the turquoise offshore pools escape coastal strandings.</li></ul><h2>3. Adapt, don't cancel</h2><p>Sargassum moves fast. A beach covered today can be clear in two days: check the 7-day outlook and turn on <a href="/en/sargassum-alerts/">free alerts</a> to catch the right window. Just avoid picnicking downwind of a rotting pile.</p><p><a href="/en/sargassum-map/">Real-time map</a> · <a href="/en/best-beaches-martinique/">Clean beaches today</a> · <a href="/en/sargassum-alerts/">Free alerts</a></p></article>`,
            'en/what-to-do-sargassum-guadeloupe': `<article><h1>Beach covered in sargassum? What to do in Guadeloupe (plan B)</h1><p>Your beach is overrun with <strong>sargassum</strong> and you're wondering <strong>what to do in Guadeloupe</strong>? Even at peak season, much of the archipelago stays usable, and alternatives to swimming abound. First reflex — check today's conditions on the <a href="/en/sargassum-map/">real-time map</a>: a clean beach is often under 30 minutes away.</p><h2>1. Head for the leeward coast (Basse-Terre)</h2><p>The west coast of Basse-Terre is shielded by La Soufrière from the trade winds that carry sargassum — the most reliable refuge in the archipelago: Plage de Malendure (Bouillante, gateway to the Cousteau reserve), La Grande Anse in Deshaies (the longest beach on Basse-Terre, almost always spared), and Plage de la Perle (a sheltered horseshoe bay). See the live list of <a href="/en/best-beaches-guadeloupe/">clean beaches today</a>.</p><h2>2. Things to do away from the beach</h2><ul><li><strong>Waterfalls and pools</strong> — Carbet Falls, Paradise pool, Saut de la Lézarde: freshwater swimming.</li><li><strong>Hiking</strong> — La Soufrière volcano, the national park, Pointe des Châteaux.</li><li><strong>Heritage &amp; flavours</strong> — Mémorial ACTe, rum distilleries (Damoiseau, Bologne).</li><li><strong>Islets &amp; boat trips</strong> — the Grand Cul-de-Sac Marin, Îlet du Gosier, Les Saintes: offshore waters escape coastal strandings.</li></ul><h2>3. Adapt, don't cancel</h2><p>Sargassum moves fast: a beach covered today can be clear in two days. Check the 7-day outlook and turn on <a href="/en/sargassum-alerts/">free alerts</a> to catch the right window. Just avoid settling downwind of a rotting pile.</p><p><a href="/en/sargassum-map/">Real-time map</a> · <a href="/en/best-beaches-guadeloupe/">Clean beaches today</a> · <a href="/en/sargassum-alerts/">Free alerts</a></p></article>`,
            'saison-sargasses-martinique': `<article><h1>Saison des sargasses en Martinique 2026 — Calendrier mois par mois</h1><p>Quand partir en Martinique pour éviter les sargasses ? La saison s'étend d'avril à octobre, avec un pic entre mai et août. En 2026, les scientifiques prévoient une <a href="/sargasses-record-2026/">année record</a> : des bancs ont été détectés dès novembre 2025, et les côtes Caraïbe — normalement épargnées — ont été touchées en avril. Consulter la <a href="/">carte en temps réel</a> avant tout déplacement est plus utile que jamais.</p><h2>Calendrier mois par mois — risque sargasses Martinique</h2><ul><li><strong>Novembre – Février :</strong> risque faible à nul. Meilleure période de l'année. Côte Atlantique propre la plupart du temps, côte Caraïbe quasi garantie.</li><li><strong>Mars :</strong> début de saison possible. Premiers bancs détectés au large. Vérifiez la carte la veille.</li><li><strong>Avril :</strong> risque modéré. En 2026, la côte Caraïbe a été touchée dès la mi-avril — exceptionnellement précoce. Privilégiez les <a href="/alertes/">alertes push</a> pour être prévenu.</li><li><strong>Mai – Juin :</strong> premier pic. Les bancs atlantiques arrivent en masse sur la côte est. Plages les plus exposées : Tartane, Le Vauclin, Sainte-Anne côté est. Côte Caraïbe reste le refuge.</li><li><strong>Juillet – Août :</strong> pic maximal. Volumes les plus importants de l'année. Concentrez-vous sur les <a href="/meilleures-plages-martinique-sargasses/">plages Caraïbe</a> : Grande Anse d'Arlet, Anse Dufour, Anse Mitan, Anse Noire.</li><li><strong>Septembre – Octobre :</strong> déclin progressif. Les vents changent de direction, les bancs dérivent vers le nord. État très variable d'une semaine à l'autre — la <a href="/previsions/">prévision 7 jours</a> est décisive pour planifier.</li></ul><h2>Côte Caraïbe vs Atlantique — quelle différence ?</h2><p>La côte Caraïbe (Les Anses d'Arlet, Trois-Îlets, Schoelcher, Le Carbet) est protégée des alizés qui portent les sargasses par le relief de la Pelée. En dehors de 2026, elle était quasi-garantie en saison. La côte Atlantique (Trinité, Tartane, Le Vauclin, Sainte-Anne est) encaisse directement le flux d'arrivée.</p><p>En 2026, même la côte Caraïbe a subi des échouages ponctuels : les bancs ont contourné la pointe sud de l'île et atteint le Diamant, Anse Noire et Grande Anse d'Arlet temporairement. <strong>Vérifiez toujours la carte avant de partir, même pour les plages Caraïbe.</strong></p><h2>Plages les plus touchées en saison</h2><ul><li><a href="/plages/bourg-de-tartane/">Tartane / Presqu'île de la Caravelle</a> — plein est, exposition maximale</li><li><a href="/plages/plage-des-salines/">Les Salines</a> (Sainte-Anne) — belle mais exposée selon vent, état très variable</li><li>Le Vauclin, Le Robert, La Trinité — côte atlantique, échouages quasi-continus en pic</li></ul><h2>Plages les plus épargnées</h2><ul><li><a href="/plages/grande-anse-d-arlet/">Grande Anse d'Arlet</a> — refuge historique, rarement touchée</li><li><a href="/plages/anse-dufour/">Anse Dufour</a> — crique abritée, snorkeling</li><li><a href="/plages/anse-mitan/">Anse Mitan</a> (Trois-Îlets) — accessible, eau calme</li><li><a href="/plages/anse-noire/">Anse Noire</a> — sable noir volcanique, souvent propre</li></ul><h2>Quand partir pour être sûr à 90% ?</h2><p>Si vous avez le choix, planifiez entre <strong>novembre et mars</strong>. La haute saison touristique (juillet-août) coïncide malheureusement avec le pic de sargasses : <strong>activez les <a href="/alertes/">alertes push gratuites</a> une semaine avant de partir</strong> pour adapter votre itinéraire plage en fonction des <a href="/previsions/">prévisions 7 jours</a>.</p><p><a href="/">Carte en temps réel</a> · <a href="/meilleures-plages-martinique-sargasses/">Meilleures plages MQ 2026</a> · <a href="/sargasses-record-2026/">Saison record 2026</a> · <a href="/danger-sargasses-h2s/">Risques H2S</a></p></article>`,
            'saison-sargasses-guadeloupe': `<article><h1>Saison des sargasses en Guadeloupe 2026 — Calendrier mois par mois</h1><p>Quand partir en Guadeloupe pour éviter les sargasses ? La saison officielle s'étend d'avril à octobre, avec un pic entre mai et août. En 2026, les experts prévoient une <a href="/sargasses-record-2026/">année à haut risque</a> selon Météo-France Guadeloupe : des échouages ont débuté dès mars sur Grande-Terre et les côtes est de Basse-Terre. Consultez notre <a href="/">carte en temps réel</a> avant chaque sortie plage.</p><h2>Calendrier mois par mois — risque sargasses Guadeloupe</h2><ul><li><strong>Novembre – Février :</strong> risque faible à nul. Meilleure fenêtre de l'année. Côte sous-le-vent de Basse-Terre quasi garantie, Grande-Terre propre la plupart des semaines.</li><li><strong>Mars :</strong> début de saison précoce en 2026. Premiers arrivages détectés sur le sud-est de Grande-Terre et Marie-Galante. Consultez la carte avant tout déplacement.</li><li><strong>Avril :</strong> risque modéré, accentuation des échouages. Capesterre de Marie-Galante et sud Grande-Terre (Saint-François) en première ligne.</li><li><strong>Mai – Juin :</strong> premier pic. Gosier, Sainte-Anne, Saint-François reçoivent des bancs réguliers. Privilégiez les plages de Basse-Terre ouest ou nord Grande-Terre.</li><li><strong>Juillet – Août :</strong> pic maximal. Volumes records sur la côte est de Grande-Terre. La côte sous-le-vent de Basse-Terre reste le refuge le plus fiable de l'archipel.</li><li><strong>Septembre – Octobre :</strong> déclin progressif mais état très variable. Les <a href="/previsions/">prévisions 7 jours</a> sont indispensables pour s'adapter semaine par semaine.</li></ul><h2>Côte sous-le-vent vs Grande-Terre — quelle différence ?</h2><p>La façade ouest de Basse-Terre (Malendure, Deshaies, Bouillante, Trois-Rivières) est protégée par le relief de la Soufrière des alizés porteurs de sargasses. C'est le refuge le plus fiable de l'archipel. À l'opposé, le sud et l'est de Grande-Terre (Gosier, Sainte-Anne, Saint-François, Le Moule) sont exposés en plein aux flux atlantiques.</p><p>Les dépendances — Marie-Galante, Les Saintes, La Désirade — ont des profils variés : Capesterre de Marie-Galante est parmi les zones les plus touchées ; Terre-de-Haut (Les Saintes) reste souvent propre grâce à son relief. <strong>Consultez toujours la carte par île avant de prendre le ferry.</strong></p><h2>Plages les plus touchées en saison</h2><ul><li><a href="/plages/plage-du-gosier/">Plage du Gosier</a> — accessible mais souvent impactée côté est</li><li><a href="/plages/plage-de-sainte-anne/">Plage de Sainte-Anne</a> (Bourg) — état variable, surveiller avant de partir</li><li>Saint-François, Le Moule — côte atlantique Grande-Terre, exposition directe</li><li>Capesterre de Marie-Galante — pleine exposition atlantique</li></ul><h2>Plages les plus épargnées</h2><ul><li><a href="/plages/plage-de-malendure/">Plage de Malendure</a> (Bouillante) — côte sous-le-vent, départ réserve Cousteau</li><li><a href="/plages/la-grande-anse-deshaies/">La Grande Anse (Deshaies)</a> — la plus longue de Basse-Terre, quasi épargnée</li><li><a href="/plages/plage-du-souffleur/">Plage du Souffleur</a> (Port-Louis) — nord Grande-Terre, moins exposée</li><li><a href="/plages/plage-de-la-perle/">Plage de la Perle</a> (Deshaies) — baie en fer à cheval protégée</li></ul><h2>Quand partir pour être sûr à 90% ?</h2><p>Si vous avez le choix, planifiez entre <strong>novembre et mars</strong>. En juillet-août (haute saison), activez les <a href="/alertes/">alertes push gratuites</a> une semaine avant pour adapter votre programme plage selon les <a href="/previsions/">prévisions 7 jours par plage</a>. En 2026 notamment, même les plages historiquement épargnées peuvent connaître des épisodes temporaires.</p><p><a href="/">Carte en temps réel</a> · <a href="/meilleures-plages-guadeloupe-sargasses/">Meilleures plages GP 2026</a> · <a href="/sargasses-record-2026/">Saison record 2026</a> · <a href="/danger-sargasses-h2s/">Risques H2S</a></p></article>`,
            'plages-sans-sargasses': (() => {
              // Dynamic noscript — reads sargassum.json at build time (spec clean-list.md étape 5)
              try {
                const _sj = JSON.parse(readFileSync(resolve(__dirname, 'public/api/copernicus/sargassum.json'), 'utf-8'))
                const _lvById = Object.fromEntries((_sj.levels || []).map(l => [l.id, l]))
                const _buildDate = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
                const _cleanByIsland = { mq: [], gp: [] }
                for (const b of ALL_BEACHES) {
                  const _slug = slugify(b.name)
                  const sargId = BEACH_TO_SARG[b.id] || _slug
                  const lv = _lvById[sargId] || _lvById[b.id]
                  if (lv && lv.status === 'clean') {
                    _cleanByIsland[b.island === 'gp' ? 'gp' : 'mq'].push({
                      name: b.name, commune: b.commune, slug: _slug,
                      score: typeof lv.score === 'number' ? lv.score : null
                    })
                  }
                }
                // Sort by score desc within each island
                for (const k of ['mq', 'gp']) _cleanByIsland[k].sort((a, b) => (b.score || 0) - (a.score || 0))
                const _li = (list) => list.map(b =>
                  `<li><a href="/plages/${b.slug}/">${b.name}</a> — ${b.commune}` +
                  ` · propre` + (b.score != null ? ` · score ${b.score}/100` : '') + `</li>`
                ).join('')
                const mqList = _cleanByIsland.mq.length ? `<h2>Martinique — Plages propres aujourd'hui</h2><ul>${_li(_cleanByIsland.mq)}</ul>` : ''
                const gpList = _cleanByIsland.gp.length ? `<h2>Guadeloupe — Plages propres aujourd'hui</h2><ul>${_li(_cleanByIsland.gp)}</ul>` : ''
                const totalClean = _cleanByIsland.mq.length + _cleanByIsland.gp.length
                return `<article><h1>Plages sans sargasses en Martinique et Guadeloupe</h1>` +
                  `<p><strong>État du ${_buildDate}.</strong> Notre satellite surveille en temps réel l'état de plus de 130 plages en Martinique et Guadeloupe grâce aux données Copernicus (ESA). ` +
                  `Aujourd'hui, <strong>${totalClean} plage${totalClean > 1 ? 's' : ''} propre${totalClean > 1 ? 's' : ''}</strong> détectée${totalClean > 1 ? 's' : ''} par satellite.</p>` +
                  mqList + gpList +
                  `<p><strong>Vérifiez la <a href="/carte-sargasses/">carte en temps réel</a> avant de partir</strong> — l'état peut changer en quelques heures selon le vent. ` +
                  `Consultez aussi les <a href="/previsions/">prévisions 7 jours par plage</a> et activez les <a href="/alertes/">alertes push gratuites</a>.</p></article>`
              } catch (_e) {
                // Fallback si sargassum.json absent au build — liste statique minimale
                return `<article><h1>Plages sans sargasses en Martinique et Guadeloupe</h1><p>Vous cherchez une plage propre aujourd'hui ? Notre application surveille en temps réel l'état de plus de 130 plages en Martinique et Guadeloupe grâce aux données satellite Copernicus.</p><p><a href="/carte-sargasses/">Consulter la carte en temps réel</a> · <a href="/previsions/">Prévisions 7 jours</a> · <a href="/alertes/">Alertes push</a>.</p></article>`
              }
            })(),
            'danger-sargasses-h2s': `<article><h1>Sargasses et H2S : dangers pour la santé</h1><p>Lorsque les sargasses s'échouent et se décomposent sur les plages, elles libèrent du sulfure d'hydrogène (H2S), un gaz toxique reconnaissable à son odeur d'œuf pourri.</p><h2>Quels sont les risques ?</h2><p>À faible concentration, le H2S provoque des irritations des yeux, du nez et de la gorge. À forte concentration (au-dessus de 5 ppm), il peut causer des maux de tête, nausées et difficultés respiratoires. Les enfants, personnes âgées et asthmatiques sont particulièrement vulnérables.</p><h2>Précautions à prendre</h2><ul><li>Évitez les plages marquées "À éviter" sur notre <a href="/">carte en temps réel</a></li><li>Ne laissez pas les enfants jouer dans ou près des amas de sargasses en décomposition</li><li>Si vous sentez une forte odeur d'œuf pourri, éloignez-vous immédiatement</li><li>Consultez les <a href="/previsions/">prévisions 7 jours</a> avant de planifier une sortie plage</li></ul><h2>L'indice AFAI</h2><p>L'AFAI (Algal Floating Algae Index) est l'indice satellite que nous utilisons pour détecter les sargasses. En dessous de 0,3 la plage est propre. Au-dessus de 0,65, il vaut mieux éviter.</p></article>`,
            'alertes': `<article><h1>Alertes sargasses Martinique et Guadeloupe — Le Veilleur</h1><p><strong>Le Veilleur surveille tes plages et te prévient dès que l'état change.</strong> Sargasses en approche, plage qui se libère, risque H2S — toujours un coup d'avance, sans avoir à vérifier toi-même.</p><h2>Comment ça marche ?</h2><p>Notre satellite analyse les plages de Martinique et Guadeloupe chaque jour grâce aux données Copernicus (ESA). Dès qu'un changement est détecté, Le Veilleur t'envoie une alerte la veille — avant que tu n'aies à rafraîchir la carte le matin de ta baignade.</p><h2>Pourquoi activer les alertes ?</h2><ul><li>Alerte la veille d'un changement (sargasses en approche ou plage qui se libère)</li><li>Brief matinal chaque jour : tes plages favorites, leur état, la reco du jour</li><li>Prévision 7 jours débloquée pour planifier tes vacances et week-ends sans surprise</li><li>Alerte H2S : Le Veilleur t'avertit aussi des risques santé (gaz toxique dégagé par les algues en décomposition)</li></ul><h2>Activer Le Veilleur</h2><p><a href="/?paywall=1&utm_source=alertes_noscript">Activer Le Veilleur — 7 jours gratuits →</a></p><p><a href="/">Carte en temps réel</a> · <a href="/previsions/">Prévisions 7 jours</a> · <a href="/a-propos/">Comment ça marche</a> · <a href="/fiabilite/">Notre fiabilité</a></p></article>`,
            'comprendre-sargasses': `<article><h1>Comprendre les sargasses : origines, prolifération et prévision</h1><p>Les sargasses (Sargassum natans et Sargassum fluitans) sont des algues brunes pélagiques qui dérivent à la surface de l'océan Atlantique. Depuis 2011, des échouages massifs frappent les côtes caribéennes, particulièrement la Martinique et la Guadeloupe.</p><h2>D'où viennent les sargasses ?</h2><p>Contrairement à une idée reçue, les sargasses qui touchent les Antilles ne proviennent pas de la mer des Sargasses historique (nord Atlantique). Elles se développent dans une zone équatoriale (GASB — Great Atlantic Sargassum Belt) entre l'Afrique et le Brésil, alimentée par les nutriments des fleuves Amazone, Orénoque et Congo.</p><h2>Pourquoi la prolifération s'aggrave ?</h2><ul><li><strong>Nutriments :</strong> déforestation et agriculture intensive augmentent les apports azotés des fleuves tropicaux</li><li><strong>Température :</strong> le réchauffement de l'Atlantique tropical (+1.2°C vs 2011-2020) accélère la photosynthèse</li><li><strong>Courants :</strong> les modifications du courant nord-équatorial concentrent les algues vers les Caraïbes</li></ul><h2>Comment prévoir les échouages ?</h2><p>Notre système combine <a href="/detection-satellite-sargasses/">détection satellite</a> (indice AFAI), modèle de dérive (courants + vent), et <a href="/previsions/">prévisions 7 jours</a> par plage. Consultez la <a href="/">carte en temps réel</a> mise à jour quotidiennement.</p><p><a href="/saison-sargasses-martinique/">Saison MQ</a> · <a href="/saison-sargasses-guadeloupe/">Saison GP</a> · <a href="/danger-sargasses-h2s/">Risques H2S</a> · <a href="/plages-sans-sargasses/">Plages propres</a></p></article>`,
            'bilan-sargasses-2025': `<article><h1>Bilan sargasses 2025 — Martinique et Guadeloupe</h1><p>L'année 2025 a été marquée par des échouages de sargasses d'une intensité exceptionnelle aux Antilles françaises, classant 2025 au 3e rang des pires années depuis le début du suivi satellite en 2011.</p><h2>Martinique : côte atlantique submergée</h2><p>Les plages de la côte atlantique ont subi des échouages quasi-continus de mai à octobre 2025. Les communes les plus touchées : <a href="/plages/plage-des-salines/">Sainte-Anne</a> (Salines, Cap Chevalier), Le Vauclin, La Trinité (<a href="/plages/bourg-de-tartane/">Tartane</a>), Le Robert.</p><h2>Guadeloupe : Grande-Terre en première ligne</h2><p>Les plages du sud de Grande-Terre (<a href="/plages/plage-de-sainte-anne/">Sainte-Anne</a>, <a href="/plages/plage-du-gosier/">Le Gosier</a>, Saint-François) ont connu des volumes records. La côte sous-le-vent de Basse-Terre (<a href="/plages/plage-de-malendure/">Malendure</a>, <a href="/plages/la-grande-anse-deshaies/">Deshaies</a>) est restée largement épargnée.</p><h2>Prévisions 2026</h2><p>Les observations satellite de début 2026 montrent des quantités importantes dès janvier-février, anormalement précoces. Les experts prévoient une <a href="/sargasses-record-2026/">année potentiellement record</a>. Consultez notre <a href="/">carte en temps réel</a> pour suivre la situation jour par jour.</p></article>`,
            'detection-satellite-sargasses': `<article><h1>Détection satellite des sargasses en temps réel</h1><p>Notre application utilise les données satellite pour détecter les bancs de sargasses au large des côtes de Martinique et Guadeloupe, avant même qu'ils n'atteignent les plages.</p><h2>L'indice AFAI (Algal Floating Algae Index)</h2><p>L'AFAI est un indice spectral qui exploite la différence de réflectance entre les algues flottantes et l'eau de mer. Il est calculé à partir des données des capteurs MODIS (satellites Aqua/Terra) et VIIRS (NOAA-20). Valeurs typiques : &lt;0,001 = ocean propre ; &gt;0,003 = sargasses détectées.</p><h2>Sources de données</h2><ul><li><strong>NOAA ERDDAP :</strong> composite AFAI 7 jours et 1 jour (résolution ~4km)</li><li><strong>Copernicus Marine :</strong> courants océaniques de surface pour le modèle de dérive</li><li><strong>Open-Meteo :</strong> prévisions vent et vagues pour la dérive de surface</li></ul><h2>De l'observation à la prévision</h2><p>Les satellites détectent les sargasses 10 à 100 km au large. Notre modèle de dérive (courants + vent + persistance exponentielle) projette leur trajectoire vers chaque plage sur 7 jours. Consultez les <a href="/previsions/">prévisions</a> et la <a href="/">carte en temps réel</a>.</p><p><a href="/comprendre-sargasses/">Comprendre les sargasses</a> · <a href="/previsions-methode/">Notre méthode</a> · <a href="/plages-sans-sargasses/">Plages propres</a></p></article>`,
            'previsions-methode': `<article><h1>Prévision des sargasses : notre méthode</h1><p>Notre modèle de prévision des échouages de sargasses combine plusieurs sources de données pour produire des prévisions à 7 jours pour chaque plage individuellement.</p><h2>Sources de données</h2><ul><li><strong>Satellite AFAI :</strong> détection des bancs au large (NOAA ERDDAP, composites 1 jour et 7 jours)</li><li><strong>Courants marins :</strong> données Copernicus Marine (Mercator Ocean) à 1/12° de résolution</li><li><strong>Vent :</strong> prévisions Open-Meteo 7 jours (vitesse, direction, rafales)</li><li><strong>Signalements :</strong> rapports communautaires (fenêtre 48h)</li></ul><h2>Modèle de dérive</h2><p>Chaque banc détecté est projeté dans le temps en combinant : dérive de Stokes (2.5% de la vitesse du vent), courant océanique local, et correction de l'eddy sud-Martinique. La persistance suit une décroissance exponentielle (demi-vie 3.5 jours).</p><h2>Comparaison avec Météo France</h2><p>Météo France utilise le modèle MOTHY (particules dans les courants IFS/Mercator) avec un bulletin 4 jours par secteur côtier. Notre approche offre : une résolution par plage (136 plages vs secteurs), des prévisions 7 jours, et une mise à jour quotidienne automatique.</p><h2>Précision actuelle</h2><p>Backtest sur les 7 derniers jours : 74% de fiabilité globale, 85% à J+4. Les plages côte Caraïbe atteignent ~100% (rarement touchées). <a href="/">Consulter la carte</a> · <a href="/previsions/">Prévisions 7 jours</a></p></article>`,
            'nettoyer-sargasses': `<article><h1>Sargasses sur la plage : que faire ?</h1><p>Vous êtes sur une plage touchée par les sargasses en Martinique ou Guadeloupe ? Voici les gestes à adopter et les précautions à prendre.</p><h2>Précautions immédiates</h2><ul><li><strong>Odeur d'œuf pourri :</strong> éloignez-vous immédiatement. C'est le H2S (sulfure d'hydrogène) libéré par les algues en décomposition. <a href="/danger-sargasses-h2s/">En savoir plus sur le H2S</a></li><li><strong>Enfants et personnes fragiles :</strong> ne les laissez pas jouer dans ou près des amas bruns</li><li><strong>Contact peau :</strong> les sargasses fraîches sont inoffensives, mais en décomposition elles peuvent irriter. Rincez à l'eau claire</li><li><strong>Baignade :</strong> évitez de nager dans des eaux brunes/chargées de débris d'algues</li></ul><h2>Signaler un échouage</h2><p>Vos observations aident à améliorer nos prévisions. Utilisez la fonction de signalement dans notre application pour indiquer l'état réel de la plage. Les rapports communautaires sont intégrés dans notre modèle (fenêtre 48h).</p><h2>Qui contacter ?</h2><ul><li><strong>Mairie :</strong> responsable du nettoyage des plages publiques</li><li><strong>ARS (Agence Régionale de Santé) :</strong> si taux de H2S élevé ressenti</li><li><strong>DEAL :</strong> Direction de l'Environnement pour les échouages majeurs</li></ul><p><a href="/">Carte en temps réel</a> · <a href="/alertes/">Activer les alertes</a> · <a href="/plages-sans-sargasses/">Trouver une plage propre</a></p></article>`,
            'meilleures-plages-guadeloupe-sargasses': `<article><h1>Meilleures plages de Guadeloupe sans sargasses en 2026</h1><p>Vous cherchez les meilleures plages de Guadeloupe sans sargasses aujourd'hui ? Notre carte surveille en temps réel l'état de plus de 80 plages de l'archipel grâce aux données satellite Copernicus. En 2026, saison annoncée à haut risque par Météo-France Guadeloupe, choisir le bon littoral devient décisif.</p><h2>Côte sous-le-vent (Basse-Terre ouest) — les moins touchées</h2><p>Le relief de la Soufrière protège toute la façade ouest de Basse-Terre des alizés porteurs. C'est le refuge le plus fiable de l'archipel :</p><ul><li><a href="/plages/plage-de-malendure/">Plage de Malendure</a> (Bouillante) — départ réserve Cousteau, très rarement touchée</li><li><a href="/plages/la-grande-anse-deshaies/">La Grande Anse (Deshaies)</a> — la plus longue de Basse-Terre, quasi épargnée</li><li><a href="/plages/plage-de-deshaies/">Plage de Deshaies</a> — bourg de pêcheurs, baie protégée</li><li><a href="/plages/plage-de-grande-anse/">Plage de Grande Anse</a> (Trois-Rivières) — sable noir volcanique, peu exposée</li></ul><h2>Nord Grande-Terre — refuge saisonnier</h2><p>Le nord de Grande-Terre (Port-Louis, Anse-Bertrand) reçoit moins d'arrivages que le sud car les bancs portés par les alizés passent au large :</p><ul><li><a href="/plages/plage-du-souffleur/">Plage du Souffleur</a> — eaux turquoise, couchers de soleil spectaculaires, peu touchée</li><li><a href="/plages/plage-de-la-perle/">Plage de la Perle</a> (Deshaies) — baie en fer à cheval, très surveillée</li><li><a href="/plages/l-autre-bord/">L'Autre Bord</a> (Le Moule) — spot surf, état variable selon la houle</li></ul><h2>Sud Grande-Terre — à vérifier avant de partir</h2><p>Gosier, Sainte-Anne, Saint-François sont les plages les plus touristiques mais aussi les plus exposées aux échouages en 2026. Vérifiez l'état du jour :</p><ul><li><a href="/plages/plage-de-sainte-anne/">Plage de Sainte-Anne</a> (Bourg) — lagon protégé par la barrière, état variable</li><li><a href="/plages/plage-du-gosier/">Plage du Gosier</a> — accessible, souvent impactée côté est</li><li><a href="/plages/plage-de-la-caravelle/">Plage de la Caravelle</a> (Sainte-Anne) — hôtelière, suivi rapproché</li></ul><h2>Les Saintes, Marie-Galante, La Désirade</h2><p>Les dépendances reçoivent des échouages plus fréquents que Basse-Terre ouest en 2026 — position plein est dans le courant atlantique. Consultez la carte pour chaque traversée.</p><h2>Pourquoi consulter notre carte avant de partir ?</h2><p>Les listes statiques (Jumbocar, blogs voyage) donnent les plages historiquement épargnées mais 2026 change la donne : une plage propre lundi peut être envahie vendredi selon les vents. Notre <a href="/">carte en temps réel</a> affiche l'état de chaque plage du jour, avec les <a href="/previsions/">prévisions 7 jours</a> calculées par plage. Activez les <a href="/alertes/">alertes push gratuites</a> pour être prévenu avant de partir.</p><p><a href="/">Voir la carte maintenant</a> · <a href="/plages-sans-sargasses/">Toutes les plages propres MQ+GP</a> · <a href="/saison-sargasses-guadeloupe/">Calendrier saison GP 2026</a></p></article>`,
            'meilleures-plages-martinique-sargasses': `<article><h1>Meilleures plages de Martinique sans sargasses en 2026</h1><p>Vous cherchez les meilleures plages de Martinique sans sargasses aujourd'hui ? Notre carte surveille en temps réel l'état de plus de 50 plages grâce aux données satellite Copernicus. En 2026, saison exceptionnelle, choisir la bonne côte est plus important que jamais.</p><h2>Côte Caraïbe — les moins touchées</h2><p>La côte caraïbe de Martinique est naturellement protégée des sargasses grâce à son orientation sous le vent atlantique. En 2026, c'est là que les plages restent le plus souvent propres :</p><ul><li><a href="/plages/grande-anse-d-arlet/">Grande Anse d'Arlet</a> — plage familiale, eaux cristallines, peu exposée aux sargasses</li><li><a href="/plages/anse-dufour/">Anse Dufour</a> — petite crique, snorkeling, tortues marines, rarement touchée</li><li><a href="/plages/anse-mitan/">Anse Mitan</a> (Les Trois-Îlets) — côte sous le vent, eau calme, très accessible</li><li><a href="/plages/anse-caritan/">Anse Caritan</a> (Sainte-Anne) — baie protégée, eau peu profonde, idéale familles</li><li><a href="/plages/anse-noire/">Anse Noire</a> — sable noir volcanique, protégée par la baie des Anses d'Arlet</li></ul><h2>Sud Martinique — à vérifier selon la semaine</h2><p>Les Salines et Cap Chevalier sont parmi les plus belles plages de Martinique mais exposées selon les vents. Vérifiez l'état en temps réel avant de vous y rendre :</p><ul><li><a href="/plages/plage-des-salines/">Plage des Salines</a> — la plus belle plage de Martinique, état variable en 2026</li><li><a href="/plages/cap-chevalier/">Cap Chevalier</a> — spot kitesurf, exposé côté atlantique</li></ul><h2>Pourquoi consulter notre carte avant de partir ?</h2><p>Les listes statiques sont obsolètes en 2026 : une plage propre lundi peut être envahie vendredi. Notre <a href="/">carte en temps réel</a> affiche l'état de chaque plage du jour, avec les <a href="/previsions/">prévisions sur 7 jours</a>. Activez les <a href="/alertes/">alertes push gratuites</a> pour être prévenu avant de partir.</p><p><a href="/">Voir la carte maintenant</a> · <a href="/plages-sans-sargasses/">Toutes les plages propres</a> · <a href="/saison-sargasses-martinique/">Calendrier saison 2026</a></p></article>`,
            'sargasses-record-2026': `<article><h1>Sargasses 2026 : une année record confirmée aux Antilles</h1><p>Ce qui n'était qu'une prévision en début d'année est désormais confirmé par les données satellite : 2026 s'impose comme l'une des pires années de sargasses jamais mesurées dans l'Atlantique. Les laboratoires de télédétection (Université de Floride du Sud, NOAA) ont relevé des niveaux record en mai, et juin marque l'entrée dans le pic de saison pour la Martinique et la Guadeloupe.</p><h2>Situation en juin 2026</h2><p>Les analyses de l'Atlantique tropical montrent une biomasse de sargasses dépassant 75% des valeurs historiques — seuil d'une « année majeure ». Mai 2026 a battu des records mensuels dans la plupart des régions surveillées, et les volumes continuent d'augmenter en juin, avec des échouages attendus en hausse sur tout l'arc caribéen. Le <strong>pic se situe entre fin mai et août</strong>, les arrivages les plus lourds tombant typiquement en juin-juillet. Aucune amélioration n'est anticipée avant l'automne : les arrivées sont continues et régulières sur les façades exposées.</p><h2>Pourquoi 2026 est exceptionnelle</h2><ul><li><strong>Détection précoce :</strong> des bancs importants observés dès novembre 2025, 3 mois avant le début habituel de saison — premier signal d'une biomasse anormale.</li><li><strong>Niveaux record janvier→mai :</strong> chaque mois du premier semestre a établi ou frôlé des records historiques dans l'Atlantique central et la mer des Caraïbes.</li><li><strong>Températures élevées :</strong> l'Atlantique tropical a dépassé la moyenne 2011-2020 au premier trimestre, accélérant la croissance algale.</li><li><strong>Nutriments :</strong> crues exceptionnelles de l'Amazone fin 2025, enrichissant la zone de croissance équatoriale (GASB).</li></ul><h2>Ce que ça change pour vos plages</h2><p>En année record, même les côtes habituellement épargnées peuvent connaître des épisodes ponctuels : en 2026 la côte Caraïbe de Martinique (Diamant, Anse Noire, Grande Anse) et la côte sous-le-vent de Basse-Terre ont déjà subi des échouages temporaires. La règle ne change pas mais devient vitale : <strong>vérifier la carte du jour avant chaque sortie</strong>, car la situation évolue en quelques heures selon le vent.</p><h2>Suivi en temps réel</h2><p>Notre <a href="/">carte interactive</a> suit la situation jour par jour grâce aux données satellite NOAA (indice AFAI). Les <a href="/previsions/">prévisions 7 jours</a> anticipent les échouages plage par plage. Voir aussi <a href="/saison-sargasses-martinique/">le calendrier mois par mois Martinique</a> et <a href="/saison-sargasses-guadeloupe/">Guadeloupe</a>.</p><h2>Se protéger en pic de saison</h2><p>Activez les <a href="/alertes/">alertes push gratuites</a> pour être prévenu dès que l'état de votre plage change. Consultez les <a href="/plages-sans-sargasses/">plages sans sargasses</a> du jour, et notre page <a href="/danger-sargasses-h2s/">risques H2S</a> : en pic de saison, les amas en décomposition libèrent davantage de sulfure d'hydrogène.</p><p><a href="/comprendre-sargasses/">Comprendre les sargasses</a> · <a href="/bilan-sargasses-2025/">Bilan 2025</a> · <a href="/danger-sargasses-h2s/">Risques H2S</a> · <a href="/saison-sargasses-martinique/">Saison MQ</a></p></article>`,
            // Ported from legacy sargasses-martinique — high intent queries
            'faq': `<article><h1>FAQ Sargasses Martinique — Questions fréquentes</h1><p>Réponses courtes et claires pour planifier vos baignades. Consultez aussi notre <a href="/carte-sargasses/">carte sargasses Martinique en temps réel</a> et la <a href="/previsions/">prévision 7 jours</a>.</p><h2>Quand arrivent les sargasses en Martinique ?</h2><p>Les sargasses touchent la Martinique principalement entre <strong>avril et septembre</strong>, avec des pics en <strong>mai-juin</strong> et <strong>juillet-août</strong> selon les courants des alizés et la biomasse dans l'Atlantique tropical. Des échouages ponctuels peuvent néanmoins survenir toute l'année, raison pour laquelle notre carte et nos <a href="/alertes/">alertes</a> tournent 12 mois sur 12.</p><h2>Où se baigner sans sargasses en Martinique ?</h2><p>La <strong>côte Caraïbe</strong> est naturellement moins exposée aux courants porteurs : Grande Anse d'Arlet, Anse Dufour, Anse à l'Âne, Pointe du Bout, Anse Noire sont souvent épargnées même en pic. Ouvrez la <a href="/carte-sargasses/">carte du jour</a> avant de partir — le vent peut pousser les bancs en quelques heures.</p><h2>Quelles plages éviter à cause des sargasses en Martinique ?</h2><p>En période de pic, la côte Atlantique reçoit davantage d'échouages : Tartane/Caravelle, Vauclin, Sainte-Anne côté est. Vérifiez toujours la <a href="/meilleures-plages-martinique-sargasses/">liste des plages propres</a> le matin même — les bulletins Météo France MOTHY + nos satellites donnent un préavis fiable de 24 à 48 h.</p><h2>Les données de la carte sont-elles fiables ?</h2><p>Oui, dans les limites de la télédétection : nos données combinent <a href="/detection-satellite-sargasses/">Sentinel-3 OLCI, MODIS et Copernicus</a> (indice AFAI / NFAI), complétées par les observations citoyennes envoyées depuis l'app. Résolution ~300 m, mise à jour toutes les 3 h. Les estimations restent sujettes à la couverture nuageuse et aux variations locales entre deux anses voisines.</p><h2>Côte Caraïbe ou Atlantique pour éviter les sargasses ?</h2><p>La côte Caraïbe reste le refuge le plus sûr : le relief de la Pelée et les courants la protègent des alizés porteurs. La côte Atlantique (Trinité → Vauclin → Sainte-Anne) encaisse plus. En saison critique, privilégiez la Caraïbe et utilisez nos <a href="/alertes/">alertes push</a> pour être prévenu dès qu'un banc change de trajectoire.</p><h2>Comment contribuer et signaler un arrivage ?</h2><p>Depuis la carte ou la fiche d'une plage, le bouton « Je suis sur place » permet de confirmer l'état en un clic (propre / modéré / beaucoup). Chaque signalement alimente la carte et corrige le satellite sur les zones où la couverture nuageuse est épaisse. C'est la composante humaine qui fait la différence entre un bulletin théorique et un vrai service de terrain.</p><h2>Sargasses et santé : faut-il s'inquiéter ?</h2><p>Les sargasses fraîches sont inoffensives. C'est la <strong>décomposition</strong> (algues brunes/noires, odeur d'œuf pourri) qui libère du <a href="/danger-sargasses-h2s/">sulfure d'hydrogène (H₂S)</a> et de l'ammoniaque. Asthmatiques, personnes âgées, enfants, femmes enceintes doivent éviter les zones en décomposition — voir notre page dédiée pour les seuils ARS.</p></article>`,
            'lexique': `<article><h1>Lexique sargasses — NFAI, échouage, Sentinel, niveau de risque</h1><p>Définitions des termes techniques utilisés sur notre <a href="/carte-sargasses/">carte sargasses Martinique</a>, dans les <a href="/previsions/">bulletins de prévision</a> et les <a href="/alertes/">alertes</a>.</p><h2>Indices satellite</h2><p><strong>AFAI</strong> (Alternative Floating Algae Index) : indice développé par Wang & Hu (2016) qui isole la signature radiométrique des algues flottantes en combinant les canaux rouge, proche infrarouge et infrarouge court des satellites. Utilisé par la NOAA comme référence atlantique.</p><p><strong>NFAI</strong> (Normalized Floating Algae Index) : version normalisée du FAI, calculée sur Sentinel-2 ou Sentinel-3. Plus la valeur est élevée, plus la concentration d'algues flottantes est forte. Utilisée pour générer les niveaux 1 à 10 par plage.</p><p><strong>Niveau de risque</strong> (score 0–100) : synthèse multi-facteurs — sargasses, houle, vent, ensoleillement, température de l'eau, UV, marée. Ne reflète pas seulement la présence d'algues : un score bas en hiver peut venir d'une mer agitée. Voir notre <a href="/methode-carte/">méthodologie</a>.</p><h2>Termes géographiques</h2><p><strong>Échouage</strong> : arrivage de sargasses sur le rivage (plage, rochers, mangrove). Les algues fraîchement échouées sont dorées et inoffensives ; en quelques jours elles brunissent puis noircissent, libérant du <a href="/danger-sargasses-h2s/">H₂S</a> et de l'ammoniaque.</p><p><strong>Côte Caraïbe</strong> : littoral ouest de la Martinique (Les Anses d'Arlet, Le Carbet, Trois-Îlets, Schoelcher). Protégée des alizés par le relief de la Pelée et du Vauclin — généralement moins exposée aux bancs porteurs.</p><p><strong>Côte Atlantique</strong> : littoral est (Trinité, Tartane/Caravelle, Le Vauclin, Sainte-Anne côté est, Le Marin). Exposée en plein aux courants qui transportent les sargasses depuis la zone de convergence Nord Atlantique tropical.</p><p><strong>Banc de sargasses</strong> : agrégat flottant dérivant à la surface, de quelques mètres à plusieurs kilomètres carrés. Détecté au large par satellite puis modélisé via la dérive vent + courant pour prédire les <a href="/previsions/">arrivées à J+1 à J+3</a>.</p><h2>Sources de données</h2><p><strong>Sentinel-2</strong> : satellite optique Copernicus à 10 m de résolution, repasse tous les 5 jours. Idéal pour la détection côtière fine mais sensible aux nuages.</p><p><strong>Sentinel-3 OLCI</strong> : capteur large-champ à 300 m de résolution, repasse quotidien. Couvre l'Atlantique tropical complet — c'est la source principale de nos prévisions offshore.</p><p><strong>MODIS</strong> (Terra/Aqua) : constellation historique de la NASA, 250 m à 1 km de résolution, archive depuis 2003. Utilisée par la NOAA/AOML pour le <em>Sargassum Inundation Report</em> hebdomadaire.</p><p><strong>Copernicus</strong> : programme européen de surveillance de la Terre qui opère Sentinel-2/3 et fournit les images brutes en accès libre.</p><p><strong>H₂S</strong> (sulfure d'hydrogène) : gaz toxique libéré par la décomposition anaérobie des sargasses. Odeur d'œuf pourri perceptible dès 0,01 ppm, irritations à partir de 1 ppm. Voir <a href="/danger-sargasses-h2s/">notre page santé</a>.</p><p><a href="/carte-sargasses/">Carte du jour</a> · <a href="/faq/">FAQ</a> · <a href="/methode-carte/">Méthode</a> · <a href="/previsions-methode/">Modèle de prévision</a></p></article>`,
            'methode-carte': `<article><h1>Comment fonctionne la carte sargasses : méthode et sources</h1><p>La carte affiche un <strong>score de 0 à 100</strong> par plage, mis à jour toutes les 3 heures à partir de sources satellite, météorologiques et de signalements citoyens.</p><h2>Sources satellite</h2><p>Nous croisons plusieurs capteurs pour maximiser la couverture malgré la nébulosité tropicale : <strong>Sentinel-3 OLCI</strong> (Copernicus, 300 m, quotidien) sert de base pour les bancs offshore dans un rayon de 100 km. <strong>Sentinel-2</strong> (10 m, passage tous les 5 jours) complète pour la détection fine à moins de 10 km des côtes. <strong>MODIS Aqua/Terra</strong> (NASA, 250 m) fournit l'archive longue et le <em>Sargassum Inundation Report</em> hebdomadaire de la NOAA/AOML.</p><p>L'indice <strong><a href="/lexique/">AFAI</a></strong> (Alternative Floating Algae Index, Wang & Hu 2016) isole la signature optique des algues flottantes. Seuils NOAA SIR v1.4 : AFAI &lt; 0.15 = propre, 0.15–0.40 = modéré, ≥ 0.40 = alerte.</p><h2>Données météorologiques</h2><p>Chaque plage reçoit son propre bulletin Open-Meteo : houle, période de vague, vent (vitesse + direction), température de surface, UV max, couverture nuageuse. Ces facteurs pèsent dans le score 0–100 pour rester pertinents 365 jours par an, y compris en hiver quand les sargasses sont absentes. La ventilation : sargasses 30 %, houle 20 %, vent 15 %, eau 10 %, ciel 10 %, UV 10 %, marée 5 %.</p><h2>Observations citoyennes</h2><p>Les signalements envoyés depuis l'app (bouton « Je suis sur place ») recalibrent l'indice satellite quand la couverture nuageuse empêche la lecture optique. Un consensus de 3 signalements minimum déclenche un ajustement, évitant qu'un signal isolé perturbe le classement.</p><h2>Du capteur à la prévision 7 jours</h2><p>Notre modèle de <a href="/previsions-methode/">prévision 7 jours</a> combine persistance exponentielle de l'AFAI observé, dérive des bancs au vent + courant, et signal d'arrivée mesuré par proximité d'un banc dans un rayon de 40 km. Pour les plages abritées (Caraïbe), le modèle sait que les alizés ne peuvent pas contourner le relief et refuse les fausses alertes — c'est ce qui différencie notre prévision d'un simple bulletin régional.</p><h2>Limites et transparence</h2><p>Les données restent des <strong>estimations</strong>. La couverture nuageuse peut occulter une journée entière de satellite ; les conditions varient d'une anse à l'autre ; un front de vent peut déplacer un banc de 10 km en 3 heures. Nous recommandons de vérifier la carte la veille ET le matin même, et de consulter les avis officiels (<a href="/danger-sargasses-h2s/">ARS Martinique, Préfecture</a>) en cas d'alerte santé. Le backtesting hebdomadaire — comparaison prévision vs observation réelle — est publié dans notre <a href="/bilan-sargasses-2025/">bilan annuel</a>.</p><p><a href="/carte-sargasses/">Carte en temps réel</a> · <a href="/faq/">FAQ</a> · <a href="/lexique/">Lexique</a> · <a href="/detection-satellite-sargasses/">Détection satellite</a></p></article>`,
            'sargasses-martinique-cette-semaine': `<article><h1>Sargasses Martinique cette semaine — où se baigner aujourd'hui</h1><p>Vous voulez savoir quelles plages de Martinique sont touchées par les sargasses cette semaine ? L'état change parfois en quelques heures selon le vent et les courants : une liste figée d'article de blog n'est plus à jour le lendemain. Notre <a href="/">carte en temps réel</a> affiche l'état du jour de plus de 50 plages, et nos <a href="/previsions/">prévisions 7 jours par plage</a> anticipent les arrivages des prochains jours.</p><h2>Comment lire la situation de la semaine</h2><p>Les bancs de sargasses dérivent depuis l'Atlantique tropical, poussés par les alizés d'est. En pratique, cela structure la semaine en deux fronts opposés :</p><ul><li><strong>Côte Atlantique (est) :</strong> Tartane/Caravelle, Le Vauclin, Le Robert, Sainte-Anne côté est — exposée en plein. C'est là que les arrivages de la semaine se concentrent en saison.</li><li><strong>Côte Caraïbe (ouest) :</strong> Anses d'Arlet, Trois-Îlets, Le Carbet, Schoelcher — protégée par le relief de la Pelée. Reste le refuge le plus fiable semaine après semaine.</li></ul><h2>Plages généralement propres cette semaine</h2><p>Sauf épisode exceptionnel, ces plages restent baignables même quand l'est est touché :</p><ul><li><a href="/plages/grande-anse-d-arlet/">Grande Anse d'Arlet</a> — refuge historique côte sous le vent</li><li><a href="/plages/anse-dufour/">Anse Dufour</a> et <a href="/plages/anse-noire/">Anse Noire</a> — criques abritées, snorkeling</li><li><a href="/plages/anse-mitan/">Anse Mitan</a> (Trois-Îlets) — accessible en navette depuis Fort-de-France</li></ul><h2>Plages à vérifier avant de partir</h2><p>Les Salines, Cap Chevalier et toute la façade atlantique peuvent passer de propres à envahies d'une semaine à l'autre. <strong>Ouvrez la <a href="/carte-sargasses/">carte du jour</a> le matin même</strong> — un front de vent déplace un banc de 10 km en quelques heures.</p><h2>Être prévenu sans vérifier chaque jour</h2><p>Plutôt que consulter manuellement, activez les <a href="/alertes/">alertes push gratuites</a> sur vos plages favorites : vous êtes notifié dès que l'état change. Voir aussi le <a href="/saison-sargasses-martinique/">calendrier de la saison 2026</a> pour planifier plus loin, et le <a href="/meilleures-plages-martinique-sargasses/">classement des meilleures plages sans sargasses</a>.</p><p><a href="/">Carte en temps réel</a> · <a href="/previsions/">Prévisions 7 jours</a> · <a href="/sargasses-guadeloupe-cette-semaine/">Guadeloupe cette semaine</a></p></article>`,
            'sargasses-guadeloupe-cette-semaine': `<article><h1>Sargasses Guadeloupe cette semaine — où se baigner aujourd'hui</h1><p>Quelles plages de Guadeloupe sont touchées par les sargasses cette semaine ? L'archipel a des profils très contrastés selon les îles et les façades : ce qui est vrai à Saint-François ne l'est pas à Deshaies. Notre <a href="/">carte en temps réel</a> suit l'état du jour de plus de 80 plages, avec des <a href="/previsions/">prévisions 7 jours par plage</a> pour anticiper les arrivages.</p><h2>Comment lire la situation de la semaine</h2><p>Les sargasses arrivent par l'est, portées par les alizés. Cela répartit le risque hebdomadaire ainsi :</p><ul><li><strong>Sud et est de Grande-Terre :</strong> Gosier, Sainte-Anne, Saint-François, Le Moule — les plus touristiques mais aussi les plus exposées aux arrivages de la semaine.</li><li><strong>Côte sous-le-vent (Basse-Terre ouest) :</strong> Malendure, Deshaies, Bouillante — protégée par le relief de la Soufrière. Le refuge le plus fiable de l'archipel.</li><li><strong>Dépendances :</strong> Marie-Galante (Capesterre surtout) et La Désirade, plein est, sont souvent en première ligne ; Terre-de-Haut (Les Saintes) reste plus souvent épargnée.</li></ul><h2>Plages généralement propres cette semaine</h2><ul><li><a href="/plages/plage-de-malendure/">Plage de Malendure</a> (Bouillante) — départ réserve Cousteau, très rarement touchée</li><li><a href="/plages/la-grande-anse-deshaies/">La Grande Anse (Deshaies)</a> — la plus longue de Basse-Terre, quasi épargnée</li><li><a href="/plages/plage-du-souffleur/">Plage du Souffleur</a> (Port-Louis) — nord Grande-Terre, moins exposée</li><li><a href="/plages/plage-de-la-perle/">Plage de la Perle</a> (Deshaies) — baie en fer à cheval protégée</li></ul><h2>Plages à vérifier avant de partir</h2><p>Toute la côte sud-est de Grande-Terre peut basculer d'une semaine à l'autre. Avant de prendre la route ou le ferry, <strong>consultez la <a href="/carte-sargasses/">carte du jour par île</a></strong> — les conditions varient fortement d'une traversée à l'autre.</p><h2>Être prévenu sans vérifier chaque jour</h2><p>Activez les <a href="/alertes/">alertes push gratuites</a> sur vos plages favorites pour être notifié dès que l'état change. Voir aussi le <a href="/saison-sargasses-guadeloupe/">calendrier de la saison 2026</a> et le <a href="/meilleures-plages-guadeloupe-sargasses/">classement des meilleures plages sans sargasses</a>.</p><p><a href="/">Carte en temps réel</a> · <a href="/previsions/">Prévisions 7 jours</a> · <a href="/sargasses-martinique-cette-semaine/">Martinique cette semaine</a></p></article>`,
            'meteo-sargasses-martinique': `<article><h1>Météo des sargasses Martinique — l'état du jour, plage par plage</h1><p>Comme la météo du matin, mais pour les sargasses : avant de charger la voiture, vérifiez en un coup d'œil si votre plage est <strong>propre, modérée ou à éviter aujourd'hui</strong>. Notre <a href="/">carte en temps réel</a> lit l'océan par satellite (indice AFAI, Copernicus/NOAA) et recoupe les signalements sur place, puis calcule un état du jour pour plus de 50 plages de Martinique — actualisé plusieurs fois par jour.</p><h2>Comment lire la météo des sargasses</h2><ul><li><strong>🟢 Vert — propre :</strong> peu ou pas de sargasses détectées. Feu vert pour la baignade.</li><li><strong>🟠 Orange — modéré :</strong> présence détectée au large ou échouage partiel. Vérifiez sur place, privilégiez le matin.</li><li><strong>🔴 Rouge — à éviter :</strong> échouage important. Risque d'odeur (H₂S) en décomposition — voir nos <a href="/danger-sargasses-h2s/">précautions santé</a>.</li></ul><h2>La prévision 7 jours</h2><p>Au-delà d'aujourd'hui, notre modèle anticipe l'arrivée des bancs sur <strong>7 jours, plage par plage</strong> (dérive vent + courant, persistance, signalements). C'est le réflexe qui fait gagner une journée de vacances : consulter la <a href="/previsions/">prévision</a> la veille d'une sortie.</p><h2>Côte Caraïbe vs Atlantique</h2><p>La <strong>côte Caraïbe</strong> (Anses d'Arlet, Trois-Îlets, Le Carbet) est protégée des alizés par le relief — c'est le refuge le plus fiable. La <strong>côte Atlantique</strong> (Tartane, Le Vauclin, Sainte-Anne est) encaisse les arrivages en premier. Voir les <a href="/meilleures-plages-martinique-sargasses/">plages les plus sûres</a> et le <a href="/saison-sargasses-martinique/">calendrier de la saison 2026</a>.</p><h2>Être prévenu chaque matin</h2><p>Plutôt que de vérifier à la main, activez les <a href="/alertes/">alertes gratuites</a> sur votre plage : vous recevez l'état du jour avant de partir. <a href="/">Voir la météo des sargasses maintenant →</a></p><p><a href="/">Carte en temps réel</a> · <a href="/previsions/">Prévisions 7 jours</a> · <a href="/meteo-sargasses-guadeloupe/">Météo Guadeloupe</a></p></article>`,
            'meteo-sargasses-guadeloupe': `<article><h1>Météo des sargasses Guadeloupe — l'état du jour, plage par plage</h1><p>Comme la météo du matin, mais pour les sargasses : avant de partir à la plage, vérifiez si elle est <strong>propre, modérée ou à éviter aujourd'hui</strong>. Notre <a href="/">carte en temps réel</a> surveille par satellite (indice AFAI, Copernicus/NOAA) plus de 80 plages de l'archipel — Grande-Terre, Basse-Terre, Marie-Galante, Les Saintes, La Désirade — actualisé plusieurs fois par jour.</p><h2>Comment lire la météo des sargasses</h2><ul><li><strong>🟢 Vert — propre :</strong> peu ou pas de sargasses. Feu vert baignade.</li><li><strong>🟠 Orange — modéré :</strong> présence au large ou échouage partiel. Vérifiez sur place, privilégiez le matin.</li><li><strong>🔴 Rouge — à éviter :</strong> échouage important, risque d'odeur (H₂S). Voir nos <a href="/danger-sargasses-h2s/">précautions santé</a>.</li></ul><h2>La prévision 7 jours par île</h2><p>Notre modèle anticipe les arrivages sur <strong>7 jours, plage par plage</strong>. Les profils sont contrastés : ce qui est vrai à Saint-François ne l'est pas à Deshaies. Consultez la <a href="/previsions/">prévision</a> avant chaque traversée.</p><h2>Côte sous-le-vent vs Grande-Terre</h2><p>La <strong>côte sous-le-vent</strong> de Basse-Terre (Malendure, Deshaies, Bouillante) est protégée par la Soufrière — le refuge le plus fiable. Le <strong>sud et l'est de Grande-Terre</strong> (Gosier, Sainte-Anne, Saint-François) sont les plus exposés. Voir les <a href="/meilleures-plages-guadeloupe-sargasses/">plages les plus sûres</a> et le <a href="/saison-sargasses-guadeloupe/">calendrier 2026</a>.</p><h2>Être prévenu chaque matin</h2><p>Activez les <a href="/alertes/">alertes gratuites</a> sur votre plage favorite pour recevoir l'état du jour avant de partir. <a href="/">Voir la météo des sargasses maintenant →</a></p><p><a href="/">Carte en temps réel</a> · <a href="/previsions/">Prévisions 7 jours</a> · <a href="/meteo-sargasses-martinique/">Météo Martinique</a></p></article>`,
            'sargasses-aujourdhui': `<article><h1>Sargasses aujourd'hui en Martinique et Guadeloupe</h1><p>L'état des sargasses <strong>aujourd'hui</strong> sur toutes les plages de Martinique et Guadeloupe, mis à jour chaque matin grâce aux données satellite Copernicus (AFAI). Plages propres, modérées, à éviter — en un coup d'œil avant de partir.</p><h2>Comment fonctionne la mise à jour quotidienne ?</h2><p>Nos satellites analysent l'Atlantique tropical chaque jour. L'algorithme AFAI détecte les bancs de sargasses flottants à moins de 48h de vos côtes. Si un banc approche d'une plage, l'état passe à « modéré » puis « à éviter » avec <strong>24 à 48h d'avance</strong>.</p><h2>Martinique — Plages à surveiller aujourd'hui</h2><p>Les plages les plus soumises aux changements quotidiens : <a href="/plages/plage-des-salines/">Les Salines</a> (Sainte-Anne), <a href="/plages/bourg-de-tartane/">Tartane</a>, <a href="/plages/anse-du-vauclin/">Le Vauclin</a>. Les plus stables : <a href="/plages/grande-anse-d-arlet/">Grande Anse d'Arlet</a>, <a href="/plages/anse-dufour/">Anse Dufour</a>.</p><h2>Guadeloupe — Plages à surveiller aujourd'hui</h2><p>En changement fréquent : <a href="/plages/plage-de-sainte-anne/">Sainte-Anne</a>, <a href="/plages/plage-du-gosier/">Le Gosier</a>, Saint-François. Stables : <a href="/plages/plage-de-malendure/">Malendure</a>, <a href="/plages/la-grande-anse-deshaies/">Grande Anse Deshaies</a>.</p><h2>Être prévenu avant de partir</h2><p>Plutôt que de vérifier chaque matin, activez <a href="/alertes/">Le Veilleur</a> : il surveille tes plages et t'envoie un brief chaque matin avec l'état du jour et la prévision 7 jours.</p><p><a href="/">Carte en temps réel</a> · <a href="/previsions/">Prévisions 7 jours</a> · <a href="/alertes/">Alertes gratuites</a> · <a href="/plages-sans-sargasses/">Plages propres</a></p></article>`,
            'sargasses-pres-de-moi': `<article><h1>Sargasses près de moi — Plages propres autour de ma position</h1><p>Trouvez la <strong>plage sans sargasses la plus proche de vous</strong> en Martinique ou Guadeloupe. Notre application détecte automatiquement votre position et trie les plages par distance, en affichant d'abord les plus propres.</p><h2>Comment ça marche ?</h2><p>Autorisez la géolocalisation dans l'application pour voir les plages propres dans un rayon de 50 km, classées par distance et état. En cas de refus, la <a href="/">carte en temps réel</a> vous permet de naviguer manuellement.</p><h2>Martinique — Plages typiquement propres en toute saison</h2><ul><li><a href="/plages/grande-anse-d-arlet/">Grande Anse d'Arlet</a> — côte Caraïbe, refuge historique</li><li><a href="/plages/anse-dufour/">Anse Dufour</a> — crique abritée au nord d'Arlet</li><li><a href="/plages/anse-mitan/">Anse Mitan</a> (Trois-Îlets) — accessible en ferry depuis Fort-de-France</li><li><a href="/plages/anse-noire/">Anse Noire</a> — sable noir volcanique, souvent propre</li></ul><h2>Guadeloupe — Plages typiquement propres en toute saison</h2><ul><li><a href="/plages/plage-de-malendure/">Malendure</a> (Bouillante) — côte sous-le-vent, départ réserve Cousteau</li><li><a href="/plages/la-grande-anse-deshaies/">Grande Anse Deshaies</a> — plus longue plage de Basse-Terre</li><li><a href="/plages/plage-du-souffleur/">Souffleur</a> (Port-Louis) — nord Grande-Terre, moins exposée</li></ul><h2>Recevoir une alerte quand une plage proche change</h2><p>Activez <a href="/alertes/">Le Veilleur</a> : il surveille tes plages favorites et t'envoie une alerte la veille d'un changement d'état. Plus besoin de vérifier chaque matin.</p><p><a href="/">Carte en temps réel</a> · <a href="/plages-sans-sargasses/">Toutes les plages propres</a> · <a href="/alertes/">Alertes push</a></p></article>`,
            'previsions': `<article><h1>Prévisions sargasses Martinique et Guadeloupe — 7 jours par plage</h1><p>Où aller à la plage <strong>cette semaine</strong> sans risquer les sargasses ? Nos prévisions sur 7 jours sont calculées plage par plage, en croisant les données satellite Copernicus, les modèles de courant MOTHY et les vents en altitude.</p><h2>Comment fonctionnent les prévisions 7 jours ?</h2><p>Chaque matin, l'algorithme analyse les bancs de sargasses détectés au large (indice AFAI, satellites Sentinel-2/3) et projette leur dérive selon les courants de surface et les vents. La prévision intègre aussi la <strong>persistance exponentielle</strong> : un banc présent depuis 3 jours a plus de chances de rester qu'un banc apparu hier. La demi-vie est estimée à 3,5 jours pour les échouages côtiers.</p><h2>Que signifient les niveaux ?</h2><ul><li><strong>Propre (vert) :</strong> probabilité &gt;70% que la plage soit propre J+1 à J+3. Confiance élevée.</li><li><strong>Modéré (orange) :</strong> présence possible ou arrivage imminent. Vérifiez la veille.</li><li><strong>À éviter (rouge) :</strong> échouage probable ou persistant. Voir nos <a href="/alertes/">alertes push</a> pour être prévenu à l'avance.</li></ul><h2>Quelle plage choisir cette semaine ?</h2><p>En Martinique, les plages Caraïbe (Grande Anse d'Arlet, Anse Dufour, Anse Mitan) sont historiquement les plus stables. En Guadeloupe, la côte sous-le-vent de Basse-Terre (Malendure, Deshaies) est le refuge le plus fiable. Consultez les <a href="/meilleures-plages-martinique-sargasses/">meilleures plages de Martinique</a> et les <a href="/meilleures-plages-guadeloupe-sargasses/">meilleures plages de Guadeloupe</a>.</p><h2>Fiabilité des prévisions</h2><p>Notre taux de réussite mesuré est de <strong>76% à 79% selon la saison</strong> sur un horizon 24h — voir <a href="/fiabilite/">notre page fiabilité</a>. À J+5-J+7, la précision baisse à ~55-60% : activez les <a href="/alertes/">alertes</a> pour être prévenu dès que la situation évolue.</p><p><a href="/">Carte en temps réel</a> · <a href="/plages-sans-sargasses/">Plages propres</a> · <a href="/alertes/">Alertes push</a> · <a href="/previsions-methode/">Notre méthode</a></p></article>`,
            'carte-sargasses': `<article><h1>Carte des sargasses Martinique et Guadeloupe — Temps réel 2026</h1><p>Carte interactive de l'état des sargasses sur toutes les plages de <strong>Martinique et Guadeloupe</strong>, mise à jour quotidiennement grâce aux données satellite Copernicus (ESA) et NOAA. Chaque plage est colorée selon son niveau actuel.</p><h2>Comment lire la carte ?</h2><ul><li><strong>Point vert :</strong> plage propre, peu ou pas de sargasses détectées.</li><li><strong>Point orange :</strong> présence modérée ou arrivage en cours. Vérifiez sur place le matin.</li><li><strong>Point rouge :</strong> échouage significatif. Risque d'odeur H₂S. Voir <a href="/danger-sargasses-h2s/">précautions santé</a>.</li></ul><h2>D'où viennent les données ?</h2><p>La carte combine : (1) l'indice AFAI (Algal Floating Algae Index) calculé depuis les satellites Sentinel-2/3 (résolution 300m, passage toutes les ~2 jours) ; (2) les observations citoyennes ; (3) le modèle de dérive <a href="/previsions-methode/">MOTHY</a> pour les <a href="/previsions/">prévisions 7 jours</a>.</p><h2>53 plages de Martinique surveillées</h2><p>De Saint-Pierre à Sainte-Anne, toutes les plages de Martinique sont référencées. Voir les <a href="/meilleures-plages-martinique-sargasses/">meilleures plages MQ</a> et la <a href="/saison-sargasses-martinique/">saison 2026</a>.</p><h2>83 plages de Guadeloupe surveillées</h2><p>Grande-Terre, Basse-Terre, Marie-Galante, Les Saintes, La Désirade — l'archipel entier est couvert. Voir les <a href="/meilleures-plages-guadeloupe-sargasses/">meilleures plages GP</a> et la <a href="/saison-sargasses-guadeloupe/">saison 2026</a>.</p><h2>Recevoir les alertes sans consulter la carte chaque matin</h2><p>Activez <a href="/alertes/">Le Veilleur</a> : il surveille vos plages et envoie un brief quotidien + alerte la veille de tout changement d'état.</p><p><a href="/">Accueil</a> · <a href="/previsions/">Prévisions 7 jours</a> · <a href="/plages-sans-sargasses/">Plages sans sargasses</a> · <a href="/alertes/">Alertes</a> · <a href="/fiabilite/">Fiabilité</a></p></article>`,
          }
          // FAQPage schema — Google rich result. Keys must match pages with Q&A structure.
          const faqSchemas = {
            'bulletin-sargasses-martinique': [
              { q: "Où trouver le bulletin sargasses de la Martinique ?", a: "Sur cette page et sur la carte en temps réel : l'état du jour (propre, modéré, à éviter) de plus de 50 plages, recalculé plusieurs fois par jour à partir des données satellite Copernicus et des signalements sur place." },
              { q: "À quelle fréquence le bulletin est-il mis à jour ?", a: "Plusieurs fois par jour. La date et l'heure de dernière mise à jour sont affichées. En saison de pic, vérifiez la veille au soir puis le matin même : un front de vent peut déplacer un banc en quelques heures." },
              { q: "Comment recevoir le bulletin sargasses automatiquement ?", a: "Activez les alertes gratuites sur vos plages favorites : vous recevez l'état du jour avant de partir, sans avoir à consulter la carte." },
            ],
            'bulletin-sargasses-guadeloupe': [
              { q: "Où trouver le bulletin sargasses de la Guadeloupe ?", a: "Sur cette page et sur la carte en temps réel : l'état du jour de plus de 80 plages de l'archipel (Grande-Terre, Basse-Terre, Marie-Galante), recalculé plusieurs fois par jour par satellite et signalements." },
              { q: "À quelle fréquence le bulletin est-il mis à jour ?", a: "Plusieurs fois par jour, avec date et heure affichées. Vérifiez la veille puis le matin même, surtout avant une traversée vers les dépendances : les conditions varient fortement selon le vent." },
              { q: "Comment être prévenu automatiquement ?", a: "Activez les alertes gratuites sur vos plages favorites pour recevoir l'état du jour avant de partir." },
            ],
            'sargasses-le-diamant': [
              { q: "Y a-t-il des sargasses au Diamant en ce moment ?", a: "Cela dépend du jour. Le Diamant, orienté sud-atlantique au pied du Rocher, est plus exposé que les anses caraïbe. Consultez l'état du jour de la Plage du Diamant et de l'Anse Cafard sur la carte en temps réel avant de partir." },
              { q: "Quelle plage propre près du Diamant si c'est couvert ?", a: "La meilleure alternative est Grande Anse d'Arlet (environ 20 min), sur la côte Caraïbe, ainsi qu'Anse Dufour et Anse Noire, criques abritées rarement touchées." },
              { q: "Quand Le Diamant est-il touché par les sargasses ?", a: "Surtout d'avril à octobre, avec un pic de mai à août. Hors saison (novembre à mars), la plage est le plus souvent propre." },
            ],
            'sargasses-sainte-luce': [
              { q: "Y a-t-il des sargasses à Sainte-Luce aujourd'hui ?", a: "Cela dépend de la plage et du jour. Sainte-Luce, sur la côte sud-caraïbe, est plutôt mieux protégée que la côte atlantique. Comparez Anse Gros Raisins, Plage de Sainte-Luce, Anse Corps de Garde et Anse Mabouya sur la carte en temps réel." },
              { q: "Quelle plage de Sainte-Luce est la plus belle ?", a: "Anse Corps de Garde et Anse Gros Raisins sont réputées pour leur lagon et le snorkeling. Vérifiez toujours l'état du jour avant de vous y rendre." },
              { q: "Où aller si Sainte-Luce est touchée ?", a: "Cap à l'ouest vers la côte Caraïbe : Grande Anse d'Arlet, Anse Dufour, Anse Noire, ou la liste des plages les plus propres du jour." },
            ],
            'sargasses-sainte-anne-martinique': [
              { q: "Y a-t-il des sargasses à Sainte-Anne (Martinique) ?", a: "Cela dépend de la plage : Les Salines et le secteur ouest sont plus protégés, tandis qu'Anse Trabaud et Anse Michel, côté atlantique, sont plus exposées. Consultez l'état du jour plage par plage sur la carte." },
              { q: "Les Salines ont-elles des sargasses ?", a: "Les Salines sont belles mais exposées selon le vent : leur état est très variable en saison. Vérifiez la carte le matin même avant de venir." },
              { q: "Sainte-Anne en Martinique ou en Guadeloupe ?", a: "Il existe une commune de Sainte-Anne sur chaque île. Cette page concerne Sainte-Anne en Martinique (Les Salines, Anse Caritan, Anse Trabaud)." },
            ],
            'sargasses-les-trois-ilets': [
              { q: "Y a-t-il des sargasses aux Trois-Îlets ?", a: "Rarement. Les Trois-Îlets sont sur la côte Caraïbe, abrités des alizés par le relief : c'est l'un des secteurs les mieux protégés de Martinique. Anse Mitan, Pointe du Bout et Anse à l'Âne restent praticables même en pic. Vérifiez tout de même la carte du jour." },
              { q: "Anse Mitan a-t-elle des sargasses ?", a: "Très rarement : Anse Mitan, dans la baie de Fort-de-France, est protégée du flux atlantique. Des épisodes brefs restent possibles en année exceptionnelle." },
              { q: "Pourquoi les Trois-Îlets sont-ils épargnés ?", a: "Leur orientation nord-ouest et la baie de Fort-de-France les mettent à l'abri des alizés qui portent les sargasses, comme les Anses d'Arlet voisines." },
            ],
            'sargasses-sante-symptomes': [
              { q: "Les sargasses sont-elles dangereuses pour la santé ?", a: "Fraîches et en mer, non. Le risque vient de leur décomposition sur la plage, qui dégage du sulfure d'hydrogène (H₂S, odeur d'œuf pourri) et de l'ammoniac. À forte concentration ces gaz irritent yeux et voies respiratoires." },
              { q: "Quels sont les symptômes d'une exposition aux sargasses ?", a: "Irritation des yeux et de la gorge, maux de tête, nausées, gêne respiratoire. Ces symptômes sont généralement réversibles : ils régressent en s'éloignant de la zone et en respirant un air propre." },
              { q: "Les sargasses sont-elles dangereuses pour les femmes enceintes et les enfants ?", a: "Par précaution, les femmes enceintes, nourrissons, jeunes enfants, personnes asthmatiques, cardiaques et âgées devraient éviter de séjourner près d'amas en décomposition, surtout par vent faible où le gaz se concentre." },
            ],
            'que-faire-sargasses-martinique': [
              { q: "Que faire quand la plage est pleine de sargasses en Martinique ?", a: "Filez vers une plage de la côte Caraïbe (Grande Anse d'Arlet, Anse Dufour, Anse Noire, Anse Mitan), presque toujours propre. Sinon, rivières et cascades, randonnée, distilleries, jardins ou sortie en bateau vers les fonds blancs." },
              { q: "Quelles plages sont sans sargasses en Martinique aujourd'hui ?", a: "La côte Caraïbe est la plus fiable. Consultez la liste des meilleures plages sans sargasses du jour, recalculée à partir des données satellite." },
              { q: "Faut-il annuler sa journée plage à cause des sargasses ?", a: "Pas forcément : les bancs bougent vite, une plage couverte peut être dégagée en deux jours. Consultez la prévision 7 jours et activez les alertes pour saisir la bonne fenêtre." },
            ],
            'que-faire-sargasses-guadeloupe': [
              { q: "Que faire quand la plage est pleine de sargasses en Guadeloupe ?", a: "Filez vers la côte sous-le-vent de Basse-Terre (Malendure, Grande Anse de Deshaies, Plage de la Perle), le refuge le plus fiable. Sinon, chutes et bassins, randonnée à la Soufrière, patrimoine, ou sortie bateau vers les îlets et les Saintes." },
              { q: "Quelles plages sont sans sargasses en Guadeloupe aujourd'hui ?", a: "La côte sous-le-vent de Basse-Terre est la plus souvent propre. Consultez la liste des meilleures plages sans sargasses du jour, mise à jour par satellite." },
              { q: "Faut-il annuler sa journée plage à cause des sargasses ?", a: "Pas forcément : les bancs se déplacent vite, une plage couverte peut être dégagée en deux jours. Consultez la prévision 7 jours et activez les alertes gratuites." },
            ],
            'en/sargassum-health': [
              { q: "Is sargassum dangerous to your health?", a: "Fresh and at sea, no. The risk comes from decomposition on the beach, which releases hydrogen sulfide (H₂S, a rotten-egg smell) and ammonia. At high concentrations these gases irritate the eyes and airways." },
              { q: "What are the symptoms of sargassum exposure?", a: "Eye and throat irritation, headaches, nausea, breathing discomfort. Symptoms are usually reversible and fade once you move away and breathe clean air." },
              { q: "Is sargassum dangerous for pregnant women and children?", a: "As a precaution, pregnant women, infants, young children, asthmatics, people with heart conditions and the elderly should avoid staying near rotting strandings, especially in light wind when the gas concentrates." },
            ],
            'en/what-to-do-sargassum-martinique': [
              { q: "What can you do when the beach is full of sargassum in Martinique?", a: "Head for a Caribbean-coast beach (Grande Anse d'Arlet, Anse Dufour, Anse Noire, Anse Mitan), almost always clean. Otherwise: rivers and waterfalls, hiking, rum distilleries, or a boat trip to the offshore shallows." },
              { q: "Which beaches are sargassum-free in Martinique today?", a: "The Caribbean (leeward) coast is the most reliable. Check the live list of clean beaches, recalculated from satellite data." },
              { q: "Should you cancel a beach day because of sargassum?", a: "Not necessarily: the rafts move fast and a covered beach can be clear within two days. Check the 7-day outlook and turn on free alerts to catch the right window." },
            ],
            'en/what-to-do-sargassum-guadeloupe': [
              { q: "What can you do when the beach is full of sargassum in Guadeloupe?", a: "Head for the leeward coast of Basse-Terre (Malendure, Grande Anse de Deshaies, Plage de la Perle), the most reliable refuge. Otherwise: waterfalls and pools, hiking up La Soufrière, heritage sites, or a boat trip to the islets and Les Saintes." },
              { q: "Which beaches are sargassum-free in Guadeloupe today?", a: "The leeward coast of Basse-Terre is most often clean. Check the live list of clean beaches, updated from satellite data." },
              { q: "Should you cancel a beach day because of sargassum?", a: "Not necessarily: the rafts move fast and a covered beach can be clear within two days. Check the 7-day outlook and turn on free alerts." },
            ],
            'faq': [
              { q: "Quand arrivent les sargasses en Martinique ?", a: "Les sargasses touchent la Martinique principalement entre avril et septembre, avec des pics en mai-juin et juillet-août selon les courants des alizés. Des échouages peuvent survenir toute l'année." },
              { q: "Où se baigner sans sargasses en Martinique ?", a: "La côte Caraïbe est naturellement moins exposée : Grande Anse d'Arlet, Anse Dufour, Anse à l'Âne, Pointe du Bout, Anse Noire. Consultez la carte en temps réel pour l'état du jour." },
              { q: "Quelles plages éviter en Martinique ?", a: "En pic (mai à septembre), évitez la côte Atlantique sans vérification : Tartane/Caravelle, Vauclin, Sainte-Anne côté est. Nos satellites donnent un préavis fiable de 24 à 48 h." },
              { q: "Les données de la carte sont-elles fiables ?", a: "Les données combinent Sentinel-3 OLCI, MODIS et Copernicus avec l'indice AFAI, complétées par les observations citoyennes. Résolution 300 m, mise à jour toutes les 3 h." },
              { q: "Côte Caraïbe ou Atlantique pour éviter les sargasses ?", a: "La côte Caraïbe est naturellement moins exposée aux courants porteurs. La côte Atlantique reçoit davantage d'échouages. Privilégiez la Caraïbe et vérifiez la carte avant de partir." },
              { q: "Comment signaler un arrivage de sargasses ?", a: "Depuis la carte ou la fiche d'une plage, le bouton « Je suis sur place » permet de confirmer l'état en un clic. Les signalements alimentent la carte en temps réel." },
              { q: "Les sargasses sont-elles dangereuses pour la santé ?", a: "Les sargasses fraîches sont inoffensives. La décomposition libère du sulfure d'hydrogène (H₂S), irritant dès 1 ppm. Asthmatiques, personnes âgées, enfants et femmes enceintes doivent éviter les zones en décomposition." },
            ],
            'meteo-sargasses-martinique': [
              { q: "Y a-t-il des sargasses en Martinique en ce moment ?", a: "Cela dépend de la plage et du jour. Notre carte en temps réel affiche l'état du jour (propre, modéré, à éviter) de plus de 50 plages de Martinique, recalculé plusieurs fois par jour à partir des données satellite et des signalements sur place." },
              { q: "À quelle heure la météo des sargasses est-elle mise à jour ?", a: "Les données satellite sont actualisées plusieurs fois par jour. Le meilleur réflexe est de vérifier la veille au soir puis le matin même : un front de vent peut déplacer un banc en quelques heures." },
              { q: "Quelle plage est sans sargasses aujourd'hui en Martinique ?", a: "La côte Caraïbe (Grande Anse d'Arlet, Anse Dufour, Anse Mitan, Anse Noire) est la plus souvent propre car protégée des alizés. Vérifiez l'état exact du jour sur la carte avant de partir." },
              { q: "Comment être prévenu quand ma plage change ?", a: "Activez les alertes gratuites sur votre plage favorite : vous recevez l'état du jour avant de partir, sans avoir à vérifier manuellement." },
            ],
            'meteo-sargasses-guadeloupe': [
              { q: "Y a-t-il des sargasses en Guadeloupe en ce moment ?", a: "Cela dépend de la plage et de l'île. Notre carte en temps réel affiche l'état du jour de plus de 80 plages de l'archipel (Grande-Terre, Basse-Terre, Marie-Galante), recalculé plusieurs fois par jour par satellite et signalements." },
              { q: "À quelle heure la météo des sargasses est-elle mise à jour ?", a: "Plusieurs fois par jour. Vérifiez la veille puis le matin même : les conditions varient fortement d'une traversée à l'autre selon le vent." },
              { q: "Quelle plage est sans sargasses aujourd'hui en Guadeloupe ?", a: "La côte sous-le-vent de Basse-Terre (Malendure, Deshaies, Bouillante) est la plus souvent propre, protégée par la Soufrière. Vérifiez l'état du jour sur la carte avant de partir." },
              { q: "Comment être prévenu quand ma plage change ?", a: "Activez les alertes gratuites sur votre plage favorite pour recevoir l'état du jour avant de partir, sans vérification manuelle." },
            ],
          }
          // Per-island slug allowlists — used to rewrite cross-island beach
          // refs in editorials. A /plages/{slug}/ link to a slug that lives
          // on the partner island becomes an absolute https://partner/ URL
          // (good for SEO, fixes phantoms). A slug missing from both islands
          // is dead — strip the <a> wrapper, keep the text.
          const mqSlugs = new Set(ALL_BEACHES.filter(b => b.island === 'mq').map(b => slugify(b.name)))
          const gpSlugs = new Set(ALL_BEACHES.filter(b => b.island === 'gp').map(b => slugify(b.name)))
          const rewriteCrossIsland = (html, isMQ) => {
            const ownSlugs = isMQ ? mqSlugs : gpSlugs
            const otherSlugs = isMQ ? gpSlugs : mqSlugs
            const otherDomain = isMQ ? 'sargasses-guadeloupe.com' : 'sargasses-martinique.com'
            return html.replace(/<a([^>]*)href="\/plages\/([a-z0-9-]+)\/?"([^>]*)>([^<]*)<\/a>/gi, (m, pre, slug, post, text) => {
              if (ownSlugs.has(slug)) return m
              if (otherSlugs.has(slug)) {
                return `<a${pre}href="https://${otherDomain}/plages/${slug}/"${post}>${text}</a>`
              }
              return text
            })
          }
          for (const { path: p, title, desc, enPath, esPath } of pages) {
            const dir = resolve(outDir, p)
            mkdirSync(dir, { recursive: true })
            const pageUrl = `https://sargasses-martinique.com/${p}/`
            const enUrl = enPath ? `https://sargasses-martinique.com/${enPath}/` : null
            const esUrl = esPath ? `https://sargasses-martinique.com/${esPath}/` : null
            let pageHtml = htmlSubpage
              .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
              .replace(/<meta name="description"[^>]*>/, () => `<meta name="description" content="${desc}" />`)
              .replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${pageUrl}" />`)
              .replace(/<link rel="alternate" hreflang="fr"[^>]*>/, `<link rel="alternate" hreflang="fr" href="${pageUrl}" />`)
              .replace(/<link rel="alternate" hreflang="en"[^>]*>/, enUrl ? `<link rel="alternate" hreflang="en" href="${enUrl}" />` : '')
              // es : pointe vers l'équivalent ES s'il existe (esPath), sinon AUCUN tag es
              // (pas de fallback homepage — le tag hérité du template pointait /es/).
              .replace(/<link rel="alternate" hreflang="es"[^>]*>/, esUrl ? `<link rel="alternate" hreflang="es" href="${esUrl}" />` : '')
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
            // MQ variant: rewrite GP-only beach refs to absolute partner URLs
            const mqPageHtml = rewriteCrossIsland(pageHtml, true)
            writeFileSync(resolve(dir, 'index.html'), mqPageHtml)
            
            const MQ_ONLY = new Set(['saison-sargasses-martinique', 'sargasses-martinique-cette-semaine', 'meteo-sargasses-martinique', 'meilleures-plages-martinique-sargasses', 'en/best-beaches-martinique', 'bulletin-sargasses-martinique', 'sargasses-le-diamant', 'sargasses-sainte-luce', 'sargasses-sainte-anne-martinique', 'sargasses-les-trois-ilets', 'que-faire-sargasses-martinique', 'en/what-to-do-sargassum-martinique'])
            const GP_ONLY = new Set(['saison-sargasses-guadeloupe', 'sargasses-guadeloupe-cette-semaine', 'meteo-sargasses-guadeloupe', 'meilleures-plages-guadeloupe-sargasses', 'en/best-beaches-guadeloupe', 'bulletin-sargasses-guadeloupe', 'que-faire-sargasses-guadeloupe', 'en/what-to-do-sargassum-guadeloupe'])
            
            // Skip mirroring to GP if this is an MQ-only page
            if (MQ_ONLY.has(p) || (enPath && MQ_ONLY.has(enPath))) continue

            // GP variant: same body, swap canonical/og/hreflang/JSON-LD URLs
            // to sargasses-guadeloupe.com, then rewrite MQ-only beach refs to
            // absolute partner URLs. Mirror to dist/_gp/{p}/ — prepare-ftp
            // overlays this onto guadeloupe-ftp/ post-copy.
            const gpPageUrl = `https://sargasses-guadeloupe.com/${p}/`
            const gpEnUrl = enPath ? `https://sargasses-guadeloupe.com/${enPath}/` : null
            const gpEsUrl = esPath ? `https://sargasses-guadeloupe.com/${esPath}/` : null
            let gpPageHtml = pageHtml
              .replace(/https:\/\/sargasses-martinique\.com/g, 'https://sargasses-guadeloupe.com')
            // hreflang/canonical re-anchor (idempotent — replace already swapped them above)
            gpPageHtml = gpPageHtml
              .replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${gpPageUrl}" />`)
              .replace(/<link rel="alternate" hreflang="fr"[^>]*>/, `<link rel="alternate" hreflang="fr" href="${gpPageUrl}" />`)
              .replace(/<link rel="alternate" hreflang="en"[^>]*>/, gpEnUrl ? `<link rel="alternate" hreflang="en" href="${gpEnUrl}" />` : '')
              .replace(/<link rel="alternate" hreflang="es"[^>]*>/, gpEsUrl ? `<link rel="alternate" hreflang="es" href="${gpEsUrl}" />` : '')
              .replace(/<link rel="alternate" hreflang="x-default"[^>]*>/, `<link rel="alternate" hreflang="x-default" href="${gpPageUrl}" />`)
              .replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${gpPageUrl}" />`)
            gpPageHtml = rewriteCrossIsland(gpPageHtml, false)
            // Swap "Martinique" → "Guadeloupe" in visible text (title, meta,
            // og, twitter, H1). Protects composites like "Martinique et
            // Guadeloupe" first. Without this, GP SEO landing pages (previsions,
            // carte-sargasses) kept MQ titles and cannibalized GSC queries.
            gpPageHtml = gpPageHtml
              .replace(/Martinique et Guadeloupe/g, '\u0000MQ_ET_GP\u0000')
              .replace(/Martinique &amp; Guadeloupe/g, '\u0000MQ_AMPE_GP\u0000')
              .replace(/Martinique & Guadeloupe/g, '\u0000MQ_AMP_GP\u0000')
              .replace(/Martinique and Guadeloupe/g, '\u0000MQ_AND_GP\u0000')
              .replace(/(<title>[^<]*?)Martinique([^<]*?<\/title>)/g, '$1Guadeloupe$2')
              .replace(/(<meta name="description" content="[^"]*?)Martinique([^"]*?")/g, '$1Guadeloupe$2')
              .replace(/(<meta property="og:title" content="[^"]*?)Martinique([^"]*?")/g, '$1Guadeloupe$2')
              .replace(/(<meta property="og:description" content="[^"]*?)Martinique([^"]*?")/g, '$1Guadeloupe$2')
              .replace(/(<meta property="og:image:alt" content="[^"]*?)Martinique([^"]*?")/g, '$1Guadeloupe$2')
              .replace(/(<meta name="twitter:title" content="[^"]*?)Martinique([^"]*?")/g, '$1Guadeloupe$2')
              .replace(/(<meta name="twitter:description" content="[^"]*?)Martinique([^"]*?")/g, '$1Guadeloupe$2')
              .replace(/(<h1[^>]*>[^<]*?)Martinique([^<]*?<\/h1>)/g, '$1Guadeloupe$2')
              .replace(/\u0000MQ_ET_GP\u0000/g, 'Martinique et Guadeloupe')
              .replace(/\u0000MQ_AMPE_GP\u0000/g, 'Martinique &amp; Guadeloupe')
              .replace(/\u0000MQ_AMP_GP\u0000/g, 'Martinique & Guadeloupe')
              .replace(/\u0000MQ_AND_GP\u0000/g, 'Martinique and Guadeloupe')
            const gpMirrorEditorialDir = resolve(outDir, '_gp', p)
            mkdirSync(gpMirrorEditorialDir, { recursive: true })
            writeFileSync(resolve(gpMirrorEditorialDir, 'index.html'), gpPageHtml)
          }
          // Page EN : app en anglais (pathname /en/ → getLang() = 'en'), SEO EN, script depuis racine
          const enDir = resolve(outDir, 'en')
          mkdirSync(enDir, { recursive: true })
          const enIndex = htmlSubpage
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

          // Mappings inverses fr↔en↔es — source unique : pages[].enPath/esPath.
          // Servent à reconstruire le cluster hreflang complet (self-reference +
          // réciprocité) des sous-pages EN/ES, qui héritaient sinon du cluster
          // homepage (canonical corrigé mais hreflang homepage → return tags cassés).
          const frPathByEn = Object.fromEntries(pages.filter(pg => pg.enPath).map(pg => [pg.enPath, pg.path]))
          const frPathByEs = Object.fromEntries(pages.filter(pg => pg.esPath).map(pg => [pg.esPath, pg.path]))
          const enPathByFr = Object.fromEntries(pages.filter(pg => pg.enPath).map(pg => [pg.path, pg.enPath]))
          const esPathByFr = Object.fromEntries(pages.filter(pg => pg.esPath).map(pg => [pg.path, pg.esPath]))
          // Cluster hreflang d'une sous-page EN/ES : fr → équivalent FR (= x-default),
          // en/es → leurs équivalents s'ils existent (dont self), sinon pas de tag.
          const setAltCluster = (h, { fr, en, es }) => h
            .replace(/<link rel="alternate" hreflang="fr"[^>]*>/, fr ? `<link rel="alternate" hreflang="fr" href="${fr}" />` : '')
            .replace(/<link rel="alternate" hreflang="en"[^>]*>/, en ? `<link rel="alternate" hreflang="en" href="${en}" />` : '')
            .replace(/<link rel="alternate" hreflang="es"[^>]*>/, es ? `<link rel="alternate" hreflang="es" href="${es}" />` : '')
            .replace(/<link rel="alternate" hreflang="x-default"[^>]*>/, fr ? `<link rel="alternate" hreflang="x-default" href="${fr}" />` : '')

          // EN subpages for international SEO
          const enPages = [
            { path: 'en/sargassum-map', title: 'Sargassum Map Martinique &amp; Guadeloupe — Real-time satellite', desc: 'Interactive sargassum map for Martinique and Guadeloupe. Real-time satellite data, 7-day forecast. Find clean beaches today.' },
            { path: 'en/best-beaches-no-sargassum', title: 'Best beaches without sargassum in Martinique &amp; Guadeloupe', desc: 'Which beaches are clean today? Real-time sargassum monitoring for Martinique and Guadeloupe. Updated daily with satellite data.' },
            { path: 'en/sargassum-season', title: 'Sargassum season in the Caribbean — When to avoid', desc: 'When does sargassum season start? Peak months, which beaches are affected, real-time forecasts for Martinique and Guadeloupe.' },
            { path: 'en/sargassum-alerts', title: 'Sargassum alerts Martinique &amp; Guadeloupe — Real-time notifications', desc: 'Get real-time sargassum alerts for your favorite beaches in Martinique and Guadeloupe. Know before you go.' },
            { path: 'en/understanding-sargassum', title: 'Understanding sargassum: origins, proliferation &amp; forecasting (2026)', desc: 'Where does sargassum come from? Great Atlantic Sargassum Belt, nutrients, climate factors. How satellite detection and forecasting works.' },
            { path: 'en/satellite-sargassum-detection', title: 'Satellite sargassum detection: AFAI, OLCI, real-time monitoring', desc: 'How satellites detect sargassum in real-time. AFAI index, MODIS/VIIRS sensors, resolution, cloud cover limitations. Our methodology explained.' },
            { path: 'en/best-beaches-martinique', title: 'Best beaches in Martinique without sargassum — Real-time 2026', desc: 'Anses d\'Arlet, Anse Dufour, Anse Mitan... Which Martinique beaches are clean today? Real-time satellite data, 7-day sargassum forecast by beach.' },
            { path: 'en/best-beaches-guadeloupe', title: 'Best beaches in Guadeloupe without sargassum — Real-time 2026', desc: 'Malendure, Grande Anse Deshaies, Souffleur, Perle... Which Guadeloupe beaches are clean today? Real-time satellite data, 7-day sargassum forecast by beach.' },
            { path: 'en/sargassum-health', title: 'Is sargassum dangerous? Health effects, who\'s at risk, what to do', desc: 'Is sargassum dangerous? Symptoms of H₂S and ammonia from rotting seaweed, who is most at risk (pregnant women, children, asthmatics) and practical precautions. Caribbean health guide.' },
            { path: 'en/what-to-do-sargassum-martinique', title: 'Beach covered in sargassum? What to do in Martinique (plan B)', desc: 'What to do when the beach is full of sargassum in Martinique: sheltered Caribbean-coast beaches, rivers and waterfalls, hiking, boat trips. The plan B to save your day.' },
            { path: 'en/what-to-do-sargassum-guadeloupe', title: 'Beach covered in sargassum? What to do in Guadeloupe (plan B)', desc: 'What to do when the beach is full of sargassum in Guadeloupe: the leeward coast of Basse-Terre, waterfalls and pools, hiking La Soufrière, islet boat trips. The anti-sargassum plan B.' },
          ]
          for (const ep of enPages) {
            const epDir = resolve(outDir, ep.path)
            mkdirSync(epDir, { recursive: true })
            const epFr = frPathByEn[ep.path]
            const epEs = epFr ? esPathByFr[epFr] : null
            let epHtml = enIndex
              .replace(/<title>[^<]*<\/title>/, `<title>${ep.title}</title>`)
              .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${ep.desc}" />`)
              .replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="https://sargasses-martinique.com/${ep.path}/" />`)
              .replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${ep.title}" />`)
              .replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="https://sargasses-martinique.com/${ep.path}/" />`)
            epHtml = setAltCluster(epHtml, {
              fr: epFr ? `https://sargasses-martinique.com/${epFr}/` : null,
              en: `https://sargasses-martinique.com/${ep.path}/`,
              es: epEs ? `https://sargasses-martinique.com/${epEs}/` : null,
            })
            let epOut = epHtml.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, enJsonLd)
            // Inject noscript editorial content + Article schema (+ optional FAQ) for
            // EN pages that have a body — same crawlable-content treatment as FR editorials.
            if (editorialContent[ep.path]) {
              const modDate = new Date().toISOString().slice(0,10)
              const articleSchema = JSON.stringify({"@context":"https://schema.org","@type":"Article","headline":ep.title,"description":ep.desc,"url":`https://sargasses-martinique.com/${ep.path}/`,"datePublished":"2026-03-01","dateModified":modDate,"inLanguage":"en","publisher":{"@type":"Organization","name":"Sargasses Martinique","logo":"https://sargasses-martinique.com/icon-512.png"},"author":{"@type":"Organization","name":"Sargasses Martinique","url":"https://sargasses-martinique.com/"}})
              const ogArticleTags = `\n    <meta property="article:published_time" content="2026-03-01" />\n    <meta property="article:modified_time" content="${modDate}" />`
              let faqSchemaTag = ''
              if (faqSchemas[ep.path]) {
                const faqSchema = JSON.stringify({"@context":"https://schema.org","@type":"FAQPage","mainEntity":faqSchemas[ep.path].map(item => ({"@type":"Question","name":item.q,"acceptedAnswer":{"@type":"Answer","text":item.a}}))})
                faqSchemaTag = `\n    <script type="application/ld+json">\n    ${faqSchema}\n    </script>`
              }
              epOut = epOut
                .replace('</head>', `${ogArticleTags}\n    <script type="application/ld+json">\n    ${articleSchema}\n    </script>${faqSchemaTag}\n</head>`)
                .replace('</body>', `\n    <noscript>${editorialContent[ep.path]}</noscript>\n</body>`)
            }
            writeFileSync(resolve(epDir, 'index.html'), epOut)
          }
          console.log(`   → ${enPages.length} pages EN supplémentaires générées`)

          // Page ES : app en español (pathname /es/ → getLang() = 'es'), SEO ES, script depuis racine
          const esDir = resolve(outDir, 'es')
          mkdirSync(esDir, { recursive: true })
          const esIndex = htmlSubpage
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
            const epFr = frPathByEs[ep.path]
            const epEn = epFr ? enPathByFr[epFr] : null
            let epHtml = esIndex
              .replace(/<title>[^<]*<\/title>/, `<title>${ep.title}</title>`)
              .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${ep.desc}" />`)
              .replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="https://sargasses-martinique.com/${ep.path}/" />`)
              .replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${ep.title}" />`)
              .replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="https://sargasses-martinique.com/${ep.path}/" />`)
            epHtml = setAltCluster(epHtml, {
              fr: epFr ? `https://sargasses-martinique.com/${epFr}/` : null,
              en: epEn ? `https://sargasses-martinique.com/${epEn}/` : null,
              es: `https://sargasses-martinique.com/${ep.path}/`,
            })
            writeFileSync(resolve(epDir, 'index.html'), epHtml.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, esJsonLd))
          }
          console.log(`   → ${esPages.length} pages ES supplémentaires générées`)

          // ── Page Fiabilité /fiabilite/ — méthode + précision backtest réelle +
          //    fraîcheur. dist/fiabilite/ (canonical MQ) + dist/_gp/fiabilite/
          //    (miroir GP, overlay prepare-ftp comme les éditoriaux). ──
          try {
            const { generateReliabilityPages } = _require('./scripts/lib/reliability-page.cjs')
            generateReliabilityPages(null, outDir)
          } catch (e) { console.warn('   ⚠ page fiabilité:', e.message) }

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
  <url><loc>${d}/fiabilite/</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.7</priority></url>
${isGP ? '' : `  <url><loc>${d}/pro/</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>
  <url><loc>${d}/pro/hotels/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>
  <url><loc>${d}/pro/widget-sargasses-hotel/</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>
  <url><loc>${d}/pro/collectivites/</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>
  <url><loc>${d}/pro/cout-sargasses-hotel/</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>
  <url><loc>${d}/pro/preparer-saison-sargasses/</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>
  <url><loc>${d}/pro/barrieres-vs-prevision/</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>
  <url><loc>${d}/pro/plan-sargasses-collectivite/</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>
  <url><loc>${d}/pro/en/hotels/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>`}
${isGP ? '' : `  <url><loc>${d}/a-propos/</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>
  <url><loc>${d}/recherche/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>
  <url><loc>${d}/research/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>
  <url><loc>${d}/investigacion/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>
`}  <url><loc>${d}/en/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>
  <url><loc>${d}/en/sargassum-map/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>
  <url><loc>${d}/en/best-beaches-no-sargassum/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>
  <url><loc>${d}/en/sargassum-season/</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>
  <url><loc>${d}/en/sargassum-alerts/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>
  <url><loc>${d}/en/satellite-sargassum-detection/</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>
  <url><loc>${d}/en/understanding-sargassum/</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>
  <url><loc>${d}/es/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>
  <url><loc>${d}/es/mapa-sargazo/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>
  <url><loc>${d}/es/mejores-playas-sin-sargazo/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>
  <url><loc>${d}/es/temporada-sargazo/</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>
  <url><loc>${d}/es/alertas-sargazo/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>
${isGP ? '' : `  <url><loc>${d}/saison-sargasses-martinique/</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>${mqEditPrio}</priority></url>`}
${isGP ? `  <url><loc>${d}/saison-sargasses-guadeloupe/</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>${gpEditPrio}</priority></url>` : ''}
  <url><loc>${d}/plages-sans-sargasses/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>
${isGP ? '' : `  <url><loc>${d}/meilleures-plages-martinique-sargasses/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>
  <url><loc>${d}/en/best-beaches-martinique/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>`}
${isGP ? `  <url><loc>${d}/meilleures-plages-guadeloupe-sargasses/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>
  <url><loc>${d}/en/best-beaches-guadeloupe/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>` : ''}
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
${isGP ? '' : `  <url><loc>${d}/sargasses-martinique-cette-semaine/</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>${mqEditPrio}</priority></url>`}
${isGP ? `  <url><loc>${d}/sargasses-guadeloupe-cette-semaine/</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>${gpEditPrio}</priority></url>` : ''}
${isGP ? '' : `  <url><loc>${d}/meteo-sargasses-martinique/</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.9</priority></url>`}
${isGP ? `  <url><loc>${d}/meteo-sargasses-guadeloupe/</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.9</priority></url>` : ''}
${isGP ? '' : `  <url><loc>${d}/bulletin-sargasses-martinique/</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.9</priority></url>
  <url><loc>${d}/sargasses-le-diamant/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>
  <url><loc>${d}/sargasses-sainte-luce/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>
  <url><loc>${d}/sargasses-sainte-anne-martinique/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>
  <url><loc>${d}/sargasses-les-trois-ilets/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>
  <url><loc>${d}/que-faire-sargasses-martinique/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>
  <url><loc>${d}/en/what-to-do-sargassum-martinique/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>`}
${isGP ? `  <url><loc>${d}/bulletin-sargasses-guadeloupe/</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.9</priority></url>
  <url><loc>${d}/que-faire-sargasses-guadeloupe/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>
  <url><loc>${d}/en/what-to-do-sargassum-guadeloupe/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>` : ''}
  <url><loc>${d}/sargasses-sante-symptomes/</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>
  <url><loc>${d}/en/sargassum-health/</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>
  <url><loc>${d}/widget/</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.5</priority></url>
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
            afai: b.afai ?? 0.2,
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
          
          // SEO meta overrides (generated by seo-optimize-meta.cjs)
          let _metaOverrides = { titles: {}, descriptions: {} }
          try { _metaOverrides = JSON.parse(readFileSync(resolve(__dirname, 'scripts/automation/data/meta-overrides.json'), 'utf-8')) } catch {}
          // ── HERO SVG golden-hour (flagship mega-loop UX) — rend les pages SEO
          // BELLES SANS JS. scripts/lib/scene-svg.cjs porte la géométrie VERBATIM
          // de BeachScene+Veilleur. SSR pur, déterministe (seed=beach.id, phase
          // figée). Lit le live sargassum.json pour le score réel + l'heure LIVE ;
          // forecast déterministe via buildWeeklyBatch (clé = beach.id, 136/136).
          let _heroLib = null
          try { _heroLib = _require('./scripts/lib/scene-svg.cjs') } catch (e) { console.warn('   → hero scene-svg non chargé:', e.message) }
          // Fiche-dive A/B assets (extracted from design/proto-plage-plongee.html)
          // If not yet extracted (node scripts/build-fiche-dive.cjs), _ficheDive stays null → control only.
          let _ficheDive = null
          try { _ficheDive = _require('./scripts/lib/fiche-dive-assets.cjs') } catch (e) { /* not extracted yet, control-only */ }
          let _widgetRenderer = null
          try { _widgetRenderer = _require('./scripts/lib/widget-embed.cjs') } catch (e) { console.warn('   ⚠ widget-embed non chargé:', e.message) }
          // Backtest reader for fiche-dive reliability data
          const readBacktestFD = () => { try { return JSON.parse(readFileSync(resolve(__dirname, 'scripts/automation/data/backtest-results.json'), 'utf-8')) } catch { return null } }
          let _heroLive = { updatedAt: null, levelsBySlug: {}, weeklyBySlug: {}, scoresBySarg: {} }
          try {
            const _lj = JSON.parse(readFileSync(resolve(__dirname, 'public/api/copernicus/sargassum.json'), 'utf-8'))
            _heroLive.updatedAt = _lj.updatedAt || null
            // Le live est clé par slug-id legacy (ex. "diamant") ≠ beaches-list id
            // ("mq016"). On ré-indexe par slug(name)/id pour matcher le score réel
            // quand il existe ; sinon on dégrade proprement (mood depuis status).
            for (const l of (_lj.levels || [])) { _heroLive.levelsBySlug[l.id] = l }
            for (const [k, v] of Object.entries(_lj.weekly || {})) { _heroLive.weeklyBySlug[k] = v }
            // scores RÉELS (score + breakdown 7 facteurs + forces) keyés par sargId —
            // la source des barres de facteurs de la plongée (heroLv n'a PAS le breakdown).
            for (const [k, v] of Object.entries(_lj.scores || {})) { _heroLive.scoresBySarg[k] = v }
          } catch (e) { /* live absent → fallback déterministe, jamais bloquant */ }
          // Forecast déterministe pour les 136 plages (clé = beaches-list id).
          let _heroWeekly = {}
          try { _heroWeekly = buildWeeklyBatch(SARGASSUM_REF) } catch (e) { _heroWeekly = {} }
          const _statusWordFR = { clean: 'Propre', moderate: 'Modéré', avoid: 'À éviter' }
          // Ligne forecast 7j lisible (jour: statut) pour la bande verdict.
          const heroForecastLine = (b) => {
            const sargId = BEACH_TO_SARG[b.id] || slugify(b.name)
            const wk = _heroWeekly[b.id] || _heroLive.weeklyBySlug[sargId] || _heroLive.weeklyBySlug[b.id]
            const fc = wk && wk.forecast
            if (!fc || !fc.length) return ''
            return fc.slice(0, 7).map(f => `${f.day} ${_statusWordFR[f.status] || f.status}`).join(' · ')
          }
          // lv live (score/afai/status réels) si la plage est couverte par le live.
          const heroLv = (b) => {
            const sargId = BEACH_TO_SARG[b.id] || slugify(b.name)
            const lvLive = _heroLive.levelsBySlug[sargId] || _heroLive.levelsBySlug[b.id]
            return {
              status: (lvLive && lvLive.status) || b.status || 'clean',
              score: lvLive && typeof lvLive.score === 'number' ? lvLive.score : undefined,
              afai: lvLive && typeof lvLive.afai === 'number' ? lvLive.afai : (typeof b.afai === 'number' ? b.afai : 0.2),
            }
          }
          // Score RÉEL complet (score + breakdown 7 facteurs + forces) depuis la map
          // scores de sargassum.json, ou null si la plage n'est pas couverte (~20/136).
          // C'est la SEULE source honnête du beat « 7 facteurs » de la plongée.
          const heroScore = (b) => {
            const sargId = BEACH_TO_SARG[b.id] || slugify(b.name)
            const s = _heroLive.scoresBySarg[sargId]
            if (!s || typeof s.score !== 'number') return null
            return { score: s.score, label: s.label || '', breakdown: s.breakdown || {}, strengths: s.strengths || [], weaknesses: s.weaknesses || [] }
          }
          const heroCssOnce = _heroLib ? _heroLib.buildHeroCss() : ''
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
            },
            'Anse Dufour': {
              clean: 'Anse Dufour aux Anses-d\'Arlet (Martinique) — plage propre en temps réel. Côte Caraïbe, snorkeling avec les tortues. Généralement protégée des sargasses. Carte et prévisions 7 jours.',
              moderate: 'Sargasses à Anse Dufour (Les Anses-d\'Arlet, Martinique) — présence modérée en temps réel. Côte Caraïbe. Tortues, snorkeling. Carte et prévisions 7 jours.',
              avoid: 'Alerte sargasses à Anse Dufour (Les Anses-d\'Arlet, Martinique) — forte concentration côte Caraïbe. Voir les plages propres à proximité.'
            },
            'Petite Anse d\'Arlet': {
              clean: 'Petite Anse d\'Arlet (Martinique) — plage propre en temps réel. Célèbre église face à la mer, côte Caraïbe, snorkeling, idéal familles. Généralement protégée des sargasses. Prévisions 7 jours.',
              moderate: 'Sargasses à Petite Anse d\'Arlet (Les Anses-d\'Arlet, Martinique) — présence modérée en temps réel. Côte Caraïbe. Église iconique, snorkeling. Carte et prévisions 7 jours.',
              avoid: 'Alerte sargasses à Petite Anse d\'Arlet (Les Anses-d\'Arlet, Martinique) — forte concentration côte Caraïbe. Voir les plages propres à proximité.'
            },
            'Plage de la Perle': {
              clean: 'Plage de la Perle à Deshaies (Guadeloupe) — plage propre en temps réel. Côte sous-le-vent, nord Basse-Terre, décor de "Meurtres au Paradis". Généralement protégée des sargasses. Prévisions 7 jours.',
              moderate: 'Sargasses à la Plage de la Perle (Deshaies, Guadeloupe) — présence modérée en temps réel. Côte sous-le-vent, nord Basse-Terre. Carte et prévisions 7 jours.',
              avoid: 'Alerte sargasses à la Plage de la Perle (Deshaies, Guadeloupe) — forte concentration côte sous-le-vent. Voir les plages propres à proximité.'
            },
            'Pointe des Châteaux': {
              clean: 'Pointe des Châteaux à Saint-François (Guadeloupe) — site propre en temps réel. Extrémité est de Grande-Terre, falaises emblématiques face à La Désirade. Carte sargasses Guadeloupe et prévisions 7 jours.',
              moderate: 'Sargasses à Pointe des Châteaux (Saint-François, Guadeloupe) — présence modérée détectée en temps réel. Pointe est de Grande-Terre, côte Atlantique. Carte et prévisions 7 jours.',
              avoid: 'Alerte sargasses à Pointe des Châteaux (Saint-François, Guadeloupe) — forte concentration côte Atlantique. Voir les plages propres à proximité sur la carte en temps réel.'
            },
            'Plage des Raisins Clairs': {
              clean: 'Plage des Raisins Clairs à Saint-François (Guadeloupe) — propre en temps réel. Grande plage de sable blanc côte Atlantique, idéal familles. Carte sargasses Guadeloupe et prévisions 7 jours.',
              moderate: 'Sargasses à Plage des Raisins Clairs (Saint-François, Guadeloupe) — présence modérée en temps réel. Côte Atlantique de Grande-Terre. Carte et prévisions 7 jours.',
              avoid: 'Alerte sargasses à Plage des Raisins Clairs (Saint-François, Guadeloupe) — forte concentration côte Atlantique. Voir les plages propres à proximité de Saint-François.'
            },
            'Anse Trabaud': {
              clean: 'Anse Trabaud à Sainte-Anne (Martinique) — plage propre en temps réel. Plage sauvage de l\'extrême sud, côte Atlantique, accès par sentier. Carte sargasses Martinique et prévisions 7 jours.',
              moderate: 'Sargasses à Anse Trabaud (Sainte-Anne, Martinique) — présence modérée détectée en temps réel. Plage sauvage côte Atlantique. Carte et prévisions 7 jours.',
              avoid: 'Alerte sargasses à Anse Trabaud (Sainte-Anne, Martinique) — forte concentration côte Atlantique. Plage sauvage souvent touchée. Voir les plages propres à proximité.'
            },
            'Anse des Galets': {
              clean: 'Anse des Galets au Prêcheur (Martinique) — plage propre en temps réel. Côte Caraïbe, sable volcanique près de Saint-Pierre, idéal familles. Généralement épargnée des sargasses. Carte et prévisions 7 jours.',
              moderate: 'Sargasses à l\'Anse des Galets (Le Prêcheur, Martinique) — présence modérée détectée en temps réel. Côte Caraïbe, nord-ouest de l\'île. Carte et prévisions 7 jours.',
              avoid: 'Alerte sargasses à l\'Anse des Galets (Le Prêcheur, Martinique) — forte concentration côte Caraïbe. Voir les plages propres à proximité de Saint-Pierre sur la carte en temps réel.'
            },
            'Anse du Figuier (Saintes)': {
              clean: 'Anse du Figuier à Terre-de-Haut (Les Saintes, Guadeloupe) — plage propre en temps réel. Crique abritée de l\'archipel des Saintes, côte sous-le-vent, idéal familles. Généralement épargnée des sargasses. Prévisions 7 jours.',
              moderate: 'Sargasses à l\'Anse du Figuier (Les Saintes, Guadeloupe) — présence modérée détectée en temps réel. Archipel des Saintes, côte sous-le-vent. Carte et prévisions 7 jours.',
              avoid: 'Alerte sargasses à l\'Anse du Figuier (Terre-de-Haut, Les Saintes, Guadeloupe) — forte concentration détectée en temps réel. Voir les criques propres des Saintes à proximité.'
            },
            'Anse Rodrigue': {
              clean: 'Anse Rodrigue à Terre-de-Haut (Les Saintes, Guadeloupe) — plage propre en temps réel. Crique sauvage abritée de l\'archipel des Saintes, eaux calmes, idéal familles. Généralement épargnée des sargasses. Prévisions 7 jours.',
              moderate: 'Sargasses à l\'Anse Rodrigue (Les Saintes, Guadeloupe) — présence modérée détectée en temps réel. Crique de l\'archipel des Saintes. Carte et prévisions 7 jours.',
              avoid: 'Alerte sargasses à l\'Anse Rodrigue (Terre-de-Haut, Les Saintes, Guadeloupe) — forte concentration détectée en temps réel. Voir les criques propres des Saintes à proximité.'
            },
            'Grande Anse du Carbet': {
              clean: 'Grande Anse du Carbet (Martinique) — plage propre en temps réel. Longue plage de sable de la côte Caraïbe, snorkeling, idéal familles. Généralement protégée des sargasses. Prévisions 7 jours.',
              moderate: 'Sargasses à Grande Anse du Carbet (Le Carbet, Martinique) — présence modérée détectée en temps réel. Côte Caraïbe, snorkeling. Carte et prévisions 7 jours.',
              avoid: 'Alerte sargasses à Grande Anse du Carbet (Le Carbet, Martinique) — forte concentration détectée côte Caraïbe. Voir les plages propres à proximité de Saint-Pierre.'
            },
            'Anse Couleuvre': {
              clean: 'Anse Couleuvre au Prêcheur (Martinique) — plage propre en temps réel. Plage sauvage de sable noir, extrême nord-ouest, côte Caraïbe. Généralement épargnée des sargasses. Prévisions 7 jours.',
              moderate: 'Sargasses à l\'Anse Couleuvre (Le Prêcheur, Martinique) — présence modérée détectée en temps réel. Plage de sable noir, côte Caraïbe. Carte et prévisions 7 jours.',
              avoid: 'Alerte sargasses à l\'Anse Couleuvre (Le Prêcheur, Martinique) — forte concentration côte Caraïbe. Voir les plages propres à proximité de Saint-Pierre.'
            },
            'Plage de Pompierre': {
              clean: 'Plage de Pompierre à Terre-de-Haut (Les Saintes, Guadeloupe) — propre en temps réel. Baie en croissant de l\'archipel des Saintes, snorkeling, idéal familles. Carte sargasses et prévisions 7 jours.',
              moderate: 'Sargasses à la Plage de Pompierre (Les Saintes, Guadeloupe) — présence modérée détectée en temps réel. Archipel des Saintes, snorkeling. Carte et prévisions 7 jours.',
              avoid: 'Alerte sargasses à la Plage de Pompierre (Terre-de-Haut, Les Saintes, Guadeloupe) — forte concentration détectée en temps réel. Voir les criques propres des Saintes à proximité.'
            },
            'Plage de Deshaies': {
              clean: 'Plage de Deshaies (Guadeloupe) — propre en temps réel. Bourg de pêcheurs du nord Basse-Terre, côte sous-le-vent, décor de "Meurtres au Paradis". Généralement protégée des sargasses. Snorkeling. Prévisions 7 jours.',
              moderate: 'Sargasses à la Plage de Deshaies (Guadeloupe) — présence modérée détectée en temps réel. Côte sous-le-vent, nord Basse-Terre. Carte et prévisions 7 jours.',
              avoid: 'Alerte sargasses à la Plage de Deshaies (Guadeloupe) — forte concentration détectée en temps réel. Côte sous-le-vent. Voir les plages propres à proximité.'
            },
            'Plage de Grande Anse': {
              clean: 'Plage de Grande Anse à Trois-Rivières (Guadeloupe) — propre en temps réel. Grande plage de sable doré du sud de Basse-Terre, snorkeling, idéal familles. Carte sargasses Guadeloupe et prévisions 7 jours.',
              moderate: 'Sargasses à la Plage de Grande Anse (Trois-Rivières, Guadeloupe) — présence modérée détectée en temps réel. Côte sud de Basse-Terre. Snorkeling. Carte et prévisions 7 jours.',
              avoid: 'Alerte sargasses à la Plage de Grande Anse (Trois-Rivières, Guadeloupe) — forte concentration détectée au large du sud de Basse-Terre. Voir les plages propres à proximité sur la carte en temps réel.'
            },
            'Pointe du Bout': {
              clean: 'Pointe du Bout aux Trois-Îlets (Martinique) — plage propre en temps réel. Station balnéaire et marina face à Fort-de-France, côte centrale, idéal familles. Généralement protégée des sargasses. Prévisions 7 jours.',
              moderate: 'Sargasses à Pointe du Bout (Les Trois-Îlets, Martinique) — présence modérée détectée en temps réel. Côte centrale, baie de Fort-de-France. Carte et prévisions 7 jours.',
              avoid: 'Alerte sargasses à Pointe du Bout (Les Trois-Îlets, Martinique) — forte concentration détectée en temps réel. Carte des plages propres proches de Fort-de-France.'
            },
            'Plage de Sainte-Luce': {
              clean: 'Plage de Sainte-Luce (Martinique) — propre en temps réel. Grande plage de la côte sud, succession d\'anses, eaux calmes, idéal familles. Carte sargasses Martinique et prévisions 7 jours.',
              moderate: 'Sargasses à la Plage de Sainte-Luce (Martinique) — présence modérée détectée en temps réel. Côte sud, station balnéaire. Carte et prévisions 7 jours.',
              avoid: 'Alerte sargasses à la Plage de Sainte-Luce (Martinique) — forte concentration détectée en temps réel. Côte sud. Voir les plages propres à proximité sur la carte en temps réel.'
            },
            'Plage du Marin': {
              clean: 'Plage du Marin (Martinique) — propre en temps réel. Baie abritée du Cul-de-sac du Marin, marina, eaux calmes, idéal familles. Carte sargasses Martinique et prévisions 7 jours.',
              moderate: 'Sargasses à la Plage du Marin (Le Marin, Martinique) — présence modérée détectée en temps réel. Baie du Marin, sud de l\'île. Carte et prévisions 7 jours.',
              avoid: 'Alerte sargasses à la Plage du Marin (Le Marin, Martinique) — forte concentration détectée en temps réel. Baie du Marin. Voir les plages propres à proximité.'
            },
            'La Datcha': {
              clean: 'Plage de la Datcha au Gosier (Guadeloupe) — propre en temps réel. Plage du bourg du Gosier, côte sud de Grande-Terre, eaux calmes, idéal familles. Carte sargasses Guadeloupe et prévisions 7 jours.',
              moderate: 'Sargasses à la Datcha (Le Gosier, Guadeloupe) — présence modérée détectée en temps réel. Bourg du Gosier, côte sud Grande-Terre. Carte et prévisions 7 jours.',
              avoid: 'Alerte sargasses à la Plage de la Datcha (Le Gosier, Guadeloupe) — forte concentration détectée en temps réel. Carte des plages propres à proximité de Pointe-à-Pitre.'
            },
            'Anse Michel': {
              clean: 'Anse Michel à Sainte-Anne (Martinique) — plage propre en temps réel. Cap Chevalier, spot de kitesurf et snorkeling, côte Atlantique. Carte sargasses Martinique et prévisions 7 jours.',
              moderate: 'Sargasses à Anse Michel (Sainte-Anne, Martinique) — présence modérée détectée en temps réel. Cap Chevalier, côte Atlantique. Kitesurf, snorkeling. Carte et prévisions 7 jours.',
              avoid: 'Alerte sargasses à Anse Michel (Cap Chevalier, Sainte-Anne, Martinique) — forte concentration côte Atlantique. Voir les plages propres à proximité sur la carte en temps réel.'
            },
            'Anse Céron': {
              clean: 'Anse Céron au Prêcheur (Martinique) — plage propre en temps réel. Sable noir volcanique face au rocher de la Perle, côte Caraïbe nord-ouest, idéal familles. Généralement épargnée des sargasses. Prévisions 7 jours.',
              moderate: 'Sargasses à l\'Anse Céron (Le Prêcheur, Martinique) — présence modérée détectée en temps réel. Plage de sable noir, côte Caraïbe nord-ouest. Carte et prévisions 7 jours.',
              avoid: 'Alerte sargasses à l\'Anse Céron (Le Prêcheur, Martinique) — forte concentration côte Caraïbe. Voir les plages propres à proximité de Saint-Pierre sur la carte en temps réel.'
            },
            'Anse Tarare': {
              clean: 'Anse Tarare à Saint-François (Guadeloupe) — plage propre en temps réel. Crique près de la Pointe des Châteaux, snorkeling, côte Atlantique de Grande-Terre. Carte sargasses Guadeloupe et prévisions 7 jours.',
              moderate: 'Sargasses à l\'Anse Tarare (Saint-François, Guadeloupe) — présence modérée détectée en temps réel. Près de la Pointe des Châteaux, côte Atlantique. Snorkeling. Carte et prévisions 7 jours.',
              avoid: 'Alerte sargasses à l\'Anse Tarare (Saint-François, Guadeloupe) — forte concentration côte Atlantique. Voir les plages propres à proximité de Saint-François sur la carte en temps réel.'
            },
            'Plage de Saint-Pierre': {
              clean: 'Plage de Saint-Pierre (Martinique) — propre en temps réel. Sable noir au pied de la ville historique, côte Caraïbe, snorkeling sur les épaves de la baie. Généralement protégée des sargasses. Carte et prévisions 7 jours.',
              moderate: 'Sargasses à la Plage de Saint-Pierre (Martinique) — présence modérée détectée en temps réel. Côte Caraïbe, sable noir, ville historique au pied de la Montagne Pelée. Carte et prévisions 7 jours.',
              avoid: 'Alerte sargasses à la Plage de Saint-Pierre (Martinique) — forte concentration détectée côte Caraïbe. Voir les plages propres du nord-ouest à proximité sur la carte en temps réel.'
            },
            'Anse Caritan': {
              clean: 'Anse Caritan à Sainte-Anne (Martinique) — plage propre en temps réel. Côte Atlantique du sud de l\'île, eaux calmes et snorkeling, idéal familles. Carte sargasses Martinique et prévisions 7 jours.',
              moderate: 'Sargasses à l\'Anse Caritan (Sainte-Anne, Martinique) — présence modérée détectée en temps réel. Côte Atlantique. Snorkeling, idéal familles. Carte et prévisions 7 jours.',
              avoid: 'Alerte sargasses à l\'Anse Caritan (Sainte-Anne, Martinique) — forte concentration côte Atlantique. Voir les plages propres à proximité des Salines sur la carte en temps réel.'
            },
            'Petite Plage Malendure': {
              clean: 'Petite Plage Malendure à Bouillante (Guadeloupe) — propre en temps réel. Côte sous-le-vent, départ snorkeling vers la réserve Cousteau et les îlets Pigeon. Généralement protégée des sargasses. Prévisions 7 jours.',
              moderate: 'Sargasses à la Petite Plage Malendure (Bouillante, Guadeloupe) — présence modérée détectée en temps réel. Côte sous-le-vent, réserve Cousteau. Snorkeling. Carte et prévisions 7 jours.',
              avoid: 'Alerte sargasses à la Petite Plage Malendure (Bouillante, Guadeloupe) — forte concentration détectée côte sous-le-vent. Voir les plages propres à proximité sur la carte en temps réel.'
            },
            'Anse Meunier': {
              clean: 'Anse Meunier à Sainte-Anne (Martinique) — plage propre en temps réel. Voisine sauvage des Salines, côte sud Atlantique, plus calme et ombragée. Idéal familles. Carte sargasses et prévisions 7 jours.',
              moderate: 'Sargasses à Anse Meunier (Sainte-Anne, Martinique) — présence modérée détectée en temps réel. Voisine des Salines, côte sud Atlantique. Snorkeling. Carte et prévisions 7 jours.',
              avoid: 'Alerte sargasses à Anse Meunier (Sainte-Anne, Martinique) — forte concentration côte sud Atlantique. Voir les plages propres à proximité des Salines sur la carte en temps réel.'
            },
            'Anse Figuier': {
              clean: 'Anse Figuier à Rivière-Pilote (Martinique) — plage propre en temps réel. Crique du sud face à la mer des Caraïbes, généralement épargnée des sargasses, eaux calmes, écomusée. Idéal familles. Prévisions 7 jours.',
              moderate: 'Sargasses à Anse Figuier (Rivière-Pilote, Martinique) — présence modérée détectée en temps réel. Crique abritée du sud, eaux calmes. Snorkeling. Carte et prévisions 7 jours.',
              avoid: 'Alerte sargasses à Anse Figuier (Rivière-Pilote, Martinique) — forte concentration détectée au large du sud. Voir les plages propres à proximité de Sainte-Luce sur la carte en temps réel.'
            },
            'Petit-Havre (Gosier)': {
              clean: 'Petit-Havre au Gosier (Guadeloupe) — plage propre en temps réel. Crique abritée de la côte sud de Grande-Terre, eaux calmes, idéal familles. Carte sargasses Guadeloupe et prévisions 7 jours.',
              moderate: 'Sargasses à Petit-Havre (Le Gosier, Guadeloupe) — présence modérée détectée en temps réel. Crique de la côte sud de Grande-Terre. Idéal familles. Carte et prévisions 7 jours.',
              avoid: 'Alerte sargasses à Petit-Havre (Le Gosier, Guadeloupe) — forte concentration détectée en temps réel. Voir les plages propres à proximité du Gosier sur la carte en temps réel.'
            }
          }
          let sitemapMQBeaches = ''
          let sitemapGPBeaches = ''
          // Editorial articles: each article lives in one island's sitemap only
          // (the island it canonicalizes to). Cross-island mirrors are kept on
          // disk for redirect fallbacks but must not be advertised to Google.
          try {
            const articlesIndexPath = resolve(outDir, 'articles', 'index.json')
            if (existsSync(articlesIndexPath)) {
              const articlesIndex = JSON.parse(readFileSync(articlesIndexPath, 'utf-8'))
              for (const art of articlesIndex.articles || []) {
                const entry = `  <url><loc>https://${art.island === 'mq' ? domainMQ : domainGP}/articles/${art.slug}/</loc><lastmod>${art.date || today}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>\n`
                if (art.island === 'mq') sitemapMQBeaches += entry
                else sitemapGPBeaches += entry
              }
              console.log(`   → ${(articlesIndex.articles||[]).length} articles éditoriaux ajoutés aux sitemaps`)
            }
          } catch (e) {
            console.warn('   → articles index skipped:', e.message)
          }
          // ── Zones côtières — vérité géographique par COMMUNE (jamais par lng brut).
          // Sert (a) au lien remontant plage→zone, (b) aux hubs /plages/<zone>/.
          // Garde-fou feedback_beach_geography : le Sud n'est PAS abrité — les gros
          // épisodes contournent l'île par le sud ; seul l'ouest (Caraïbe) l'est.
          // Zones côtières — table partagée avec prepare-ftp.cjs (whitelist plages/).
          // SOURCE UNIQUE : scripts/lib/coast-zones.cjs — ne JAMAIS redéfinir ici.
          const { COAST_ZONES } = _require('./scripts/lib/coast-zones.cjs')
          const zoneOf = b => (COAST_ZONES[b.island] || []).find(z => z.communes.includes(b.commune)) || null
          {
            // Couverture : chaque plage doit avoir une zone (sinon le maillage fuit)
            const orphans = beaches.filter(b => !zoneOf(b))
            if (orphans.length) console.warn(`   ⚠ ${orphans.length} plage(s) sans zone côtière:`, orphans.slice(0, 5).map(b => b.commune).join(', '))
          }
          // Plages que le widget embeddable SAIT rendre (table ALIAS de
          // public/widget/embed/index.html + options du builder public/widget/index.html).
          // Sert au touchpoint inbound B2B « widget gratuit » : on ne le pose QUE sur
          // ces plages (honnêteté — pas de widget proposé pour une plage non couverte).
          const WIDGET_BEACHES = new Set([
            // Martinique
            'plage-des-salines', 'plage-du-diamant', 'pointe-faula', 'grande-anse-d-arlet',
            'anse-mitan', 'anse-noire', 'anse-madame', 'bourg-de-tartane', 'plage-du-marin',
            'plage-du-bourg-sainte-anne',
            // Guadeloupe
            'plage-de-grande-anse', 'plage-de-malendure', 'plage-de-sainte-anne',
            'pointe-des-chateaux', 'plage-du-gosier', 'plage-de-la-caravelle',
            'plage-de-bas-du-fort', 'plage-de-deshaies', 'plage-du-moule', 'plage-du-vieux-fort'
          ])
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
            const beachHtml = htmlSubpage
              .replace(/<title>[^<]*<\/title>/, `<title>${beachTitle}</title>`)
              .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${beachDesc}" />`)
              .replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${beachUrl}" />`)
              // Fix hreflang: point to actual page URL, not homepage. Pas de
              // variante EN/ES par plage → on retire les tags en/es hérités du
              // template (qui pointaient /en/ et /es/ homepage = cluster cassé).
              .replace(/<link rel="alternate" hreflang="fr"[^>]*>/, `<link rel="alternate" hreflang="fr" href="${beachUrl}" />`)
              .replace(/<link rel="alternate" hreflang="en"[^>]*>/, '')
              .replace(/<link rel="alternate" hreflang="es"[^>]*>/, '')
              .replace(/<link rel="alternate" hreflang="x-default"[^>]*>/, `<link rel="alternate" hreflang="x-default" href="${beachUrl}" />`)
              .replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${beachTitle}" />`)
              .replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${beachDesc}" />`)
              .replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${beachUrl}" />`)
              .replace(/<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${beachTitle}" />`)
              .replace(/<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${beachDesc}" />`)
              .replace(/<meta property="og:image" [^>]*>/, `<meta property="og:image" content="https://${domain}/images/og/${b.slug}.png" />`)
              .replace(/<meta name="twitter:image" [^>]*>/, `<meta name="twitter:image" content="https://${domain}/images/og/${b.slug}.png" />`)
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
            // Footer réseau USD : MQ/GP (domaines forts, pos 3-8) irriguent les
            // jeunes domaines — jusqu'ici seule la homepage linkait le réseau,
            // asymétrique avec les pages USD qui linkent MQ/GP partout (2026-06-11).
            // Aucun mot « Martinique » ici : le text-swap GP ne doit pas le toucher.
            const networkLine = `<p>Même méthode satellite sur nos autres destinations : <a href="https://sargassumcancun.com/" rel="noopener">sargazo à Cancún</a> · <a href="https://sargassumpuntacana.com/" rel="noopener">sargassum Punta Cana</a> · <a href="https://sargassummiami.com/" rel="noopener">sargassum Floride</a>.</p>`
            // Lien remontant plage → hub de zone (maillage hiérarchique : la page
            // plage déclare sa zone, le hub liste ses plages — GSC indexation).
            const _zone = zoneOf(b)
            const zoneLine = _zone ? `<p>Toutes les plages de ${_zone.shortName} : <a href="/plages/${_zone.slug}/">${_zone.name}</a>.</p>` : ''
            // Touchpoint inbound B2B discret (1 ligne, noscript SEO uniquement → zéro
            // impact conversion conso) : capte l'hôtellerie qui nous lit sur la requête
            // de SA plage. Posé SEULEMENT sur les plages que le widget rend (WIDGET_BEACHES),
            // lien relatif (reste sur MQ/GP), préremplit le builder via ?beach=<slug>.
            // Pas le mot « Martinique » (le text-swap GP ne doit pas le toucher, cf. networkLine).
            const proLine = WIDGET_BEACHES.has(b.slug)
              ? `<p>Vous gérez un hôtel, une location ou un restaurant près de ${b.name} ? Affichez l'état de cette plage en direct sur votre site avec notre <a href="/widget/?beach=${b.slug}">widget sargasses gratuit</a>.</p>`
              : ''
            let noscriptBlock
            if (_enrichments[b.slug]) {
              // Keep existing enrichment noscript but prepend image and append extra sections
              const enrichedWithImg = _enrichments[b.slug].noscript.replace('<article>', `<article>${beachImgTag}`)
              noscriptBlock = enrichedWithImg.replace('</article>', `${extraSections}${zoneLine}${networkLine}${proLine}</article>`)
            } else {
              const sameCommune = beaches.filter(o => o.commune === b.commune && o.slug !== b.slug)
              const sameIsland = beaches.filter(o => o.island === b.island && o.commune !== b.commune && o.slug !== b.slug)
              const nearby = sameCommune.slice(0, 4)
              if (nearby.length < 4) nearby.push(...sameIsland.slice(0, 4 - nearby.length))
              const nearbyLi = nearby.map(o => `<li><a href="/plages/${o.slug}/">${o.name}</a> — ${o.commune}</li>`).join('')
              noscriptBlock = `\n    <noscript>\n      <article>\n        <h1>Sargasses à ${b.name} (${b.commune}, ${island})</h1>\n        ${beachImgTag}\n        <p>État des sargasses à ${b.name} en temps réel. Cette plage de ${b.commune} en ${island} est surveillée quotidiennement par satellite.</p>\n        ${extraSections}\n        <h3>Plages à proximité</h3>\n        <ul>${nearbyLi}</ul>\n        <p><a href="/carte-sargasses/">Voir la carte des sargasses</a> · <a href="/alertes/">Alertes sargasses</a> · <a href="/">Accueil Sargasses ${island}</a></p>\n        ${zoneLine}${networkLine}${proLine}\n      </article>\n    </noscript>`
            }
            // ── HERO golden-hour : préfixe le noscript (page JS-off) par une scène
            // SVG inline + bande verdict, AVANT l'<article>. Additif, jamais bloquant :
            // si la lib manque, on garde le noscript historique intact.
            let noscriptHero = noscriptBlock
            if (_heroLib) {
              try {
                const _lv = heroLv(b)
                const _heroSvg = _heroLib.buildHeroSvg(b, _lv, { updatedAt: _heroLive.updatedAt }, {})
                const _fline = heroForecastLine(b)
                const _statusFR = _statusWordFR[_lv.status] || _lv.status
                const _scoreTxt = typeof _lv.score === 'number' ? ` · <span class="sg-stat">${_lv.score}/100</span>` : ''
                const _liveHHMM = _heroLive.updatedAt ? (() => { try { const d = new Date(_heroLive.updatedAt); return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0') } catch (_) { return '' } })() : ''
                const _liveTxt = _liveHHMM ? `<div class="sg-live">LIVE · satellite ${_liveHHMM} UTC</div>` : ''
                const _verdict = `<div class="sg-verdict"><h1>${b.name}</h1>`
                  + `<div class="sg-stat">Sargasses aujourd'hui : ${_statusFR}${_scoreTxt}</div>`
                  + (_fline ? `<p class="sg-line">Prévision 7 j — ${_fline}</p>` : '')
                  + _liveTxt
                  + `</div>`
                // hero BORNÉ + verdict, .sg-hero refermé tout de suite ; l'<article>
                // (contenu d'origine du noscript) devient un FRÈRE dans .sg-page,
                // refermé juste avant </noscript> → la scène ne s'étire plus.
                const _heroOpen = `${heroCssOnce}<div class="sg-page"><div class="sg-hero">${_heroSvg}${_verdict}</div>`
                noscriptHero = noscriptBlock
                  .replace(/<noscript>/, `<noscript>${_heroOpen}`)
                  .replace(/<\/noscript>/, `</div></noscript>`)
              } catch (e) { noscriptHero = noscriptBlock /* fallback : noscript nu, jamais cassé */ }
            }
            // ── FICHE-DIVE A/B variant (50/50, localStorage ab_fiche_dive) ──
            // Load assets once outside this loop (placed just before beaches loop)
            // The variant injects __SG_BEACH__ real data + the scroll-plongée engine.
            // Control = noscriptHero (existing). Both coexist in the page; JS picks.
            let ficheDiveHtml = beachHtml.replace('</body>', noscriptHero + '\n</body>')
            if (typeof _ficheDive !== 'undefined' && _ficheDive) {
              try {
                // Real data for window.__SG_BEACH__
                const _fd_lv = heroLv(b)
                const _fd_liveStatus = (_fd_lv && _fd_lv.status) || b.status || 'clean'
                // Score RÉEL (score + breakdown 7 facteurs + forces) depuis la map scores,
                // pas heroLv (qui n'a que le score sans breakdown). null si non couvert.
                const _fd_score = heroScore(b)
                // Éligibilité plongée : seulement les plages avec score+facteurs réels
                // (~20/136). Ailleurs → contrôle (jamais de plongée avec données vides/MOCK).
                const _fd_eligible = !!_fd_score
                // Resolve the weekly entry, then NORMALIZE to a forecast array.
                // _heroWeekly[b.id] is the wrapper {forecast:[…], drift,…} (see
                // heroForecastLine l.957) — the old chain fed that object straight
                // through, so the engine's DATA.forecast[0].afai threw on ~133/136
                // beaches (frozen + blank journal). Unwrap .forecast → array | null.
                const _fd_wk = (_heroLive.weeklyBySlug && _heroLive.weeklyBySlug[slugify(b.name)])
                  || (_heroLive.weeklyBySlug && _heroLive.weeklyBySlug[b.id])
                  || _heroWeekly[b.id]
                  || null
                const _fd_forecast = Array.isArray(_fd_wk) ? _fd_wk
                  : (_fd_wk && Array.isArray(_fd_wk.forecast) ? _fd_wk.forecast : null)
                // Nearby = "plan B à côté" : MÊME ÎLE (jamais cross-island), plages
                // PROPRES d'abord, puis proximité (même zone > même commune > reste de
                // l'île), puis score. L'ancien tri score-first sortait le top-3 GLOBAL
                // = les 3 mêmes plages GP pour TOUTES les plages (MQ comprises) →
                // « des plages propres tout près · à quelques minutes » était mensonger.
                // distance réelle depuis la plage courante (haversine, km) — sert au tri
                // « le plus près » ET au temps de trajet honnête (~40 km/h).
                const _havKm = (la1, lo1, la2, lo2) => {
                  if (![la1, lo1, la2, lo2].every(n => typeof n === 'number')) return null
                  const R = 6371, toR = x => x * Math.PI / 180
                  const dLa = toR(la2 - la1), dLo = toR(lo2 - lo1)
                  const A = Math.sin(dLa / 2) ** 2 + Math.cos(toR(la1)) * Math.cos(toR(la2)) * Math.sin(dLo / 2) ** 2
                  return 2 * R * Math.asin(Math.sqrt(A))
                }
                const _fd_isClean = o => (((heroLv(o)||{}).status) || o.status) === 'clean'
                const _fd_km = o => { const k = _havKm(b.lat, b.lng, o.lat, o.lng); return k == null ? 1e9 : k }
                const _fd_nearby_all = beaches
                  .filter(o => o.id !== b.id && o.island === b.island)
                  .sort((a, z) => {
                    if (_fd_isClean(a) !== _fd_isClean(z)) return _fd_isClean(a) ? -1 : 1 // propres d'abord
                    return _fd_km(a) - _fd_km(z) // puis le plus PRÈS (distance réelle)
                  })
                const _fd_nearby = _fd_nearby_all.slice(0, 3).map(o => {
                  const km = _havKm(b.lat, b.lng, o.lat, o.lng)
                  return {
                    id: o.id, name: o.name, commune: o.commune,
                    slug: o.slug || slugify(o.name), // nav réelle vers /plages/<slug>/ (onOpenBeach)
                    status: (heroLv(o)||{}).status || o.status,
                    score: (heroLv(o)||{}).score ?? null,
                    drive: km != null ? Math.max(5, Math.round(km / 40 * 60)) : o.drive,
                    lat: o.lat, lng: o.lng
                  }
                })
                // Reliability (calm/high regime per backtest)
                const _fd_rr = typeof readBacktestFD !== 'undefined' ? readBacktestFD() : null
                // overall.statusHitRate = LE chiffre honnête à afficher (tous régimes, ~77%).
                // calm.cleanReliabilityPct=100% est vrai mais TROMPEUR en titre (n'inclut
                // pas les alertes 0%-fiables / 23% fausses) — le backtest dit lui-même de ne
                // jamais publier un % unique sans le régime. On montre l'overall + lien fiabilité.
                const _fd_rel = _fd_rr ? {
                  overall: _fd_rr.overall?.statusHitRate ?? null,
                  calm: _fd_rr.regimeReliability?.regimes?.calm?.cleanReliabilityPct ?? null,
                  peak: _fd_rr.regimeReliability?.regimes?.high?.cleanReliabilityPct ?? null,
                  sample: _fd_rr.totalPairs || 0
                } : { overall: 77, calm: 79, peak: 76, sample: 0 }
                // Freshness: honest (null if >12h)
                const _fd_updatedAt = (() => {
                  if (!_heroLive.updatedAt) return null
                  const ageMin = (Date.now() - new Date(_heroLive.updatedAt).getTime()) / 60000
                  return ageMin > 720 ? null : _heroLive.updatedAt
                })()
                const sgBeachData = JSON.stringify({
                  beach: { id: b.id, island: b.island, name: b.name, commune: b.commune,
                           lat: b.lat, lng: b.lng, drive: b.drive, status: _fd_liveStatus },
                  score: _fd_score,
                  forecast: _fd_forecast,
                  nearby: _fd_nearby,
                  reliability: _fd_rel,
                  updatedAt: _fd_updatedAt
                })
                // Build the A/B shell:
                // - control-only div = existing noscriptHero (HTML, js-off visible)
                // - variant div = fiche-dive markup (hidden by default, shown by A/B script)
                // - window.__sgTrack = real track fn called by the engine
                // - window.__SG_BEACH__ = real data
                // - A/B picker script (50/50 localStorage, URL override ?fichedive=1/0, prefers-reduced-motion → always control)
                const ficheDiveInject = [
                  noscriptHero,
                  `<div id="sg-fiche-dive" hidden>`,
                  `<style id="sg-fiche-dive-css">`,
                  `/* scope fiche-dive CSS under wrapper to avoid collision with SPA */`,
                  // Wrapper = full-screen scroll host: the SEO shell locks html/body
                  // (overflow:hidden), so the dive owns its own native scroll here.
                  // overflow-y:auto + the scoped proto CSS (span vh-heights + sticky
                  // .viewport) is what lets the scroll-driven camera advance.
                  `#sg-fiche-dive{all:initial;forced-color-adjust:none;position:fixed;inset:0;z-index:1200;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;background:#02060A;color:#EAF7F4;font-family:'Bricolage Grotesque',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}`,
                  // all:initial + position:fixed blockifies display:inline→block, which
                  // DEFEATS the UA [hidden]{display:none} — so the control arm would still
                  // render the dive. Force hidden to win (higher specificity + !important).
                  `#sg-fiche-dive[hidden]{display:none!important}`,
                  `#sg-fiche-dive *{box-sizing:border-box}`,
                  `</style>`,
                  // Scoped proto CSS (selectors prefixed under #sg-fiche-dive,
                  // keyframes namespaced) — generated by build-fiche-dive.cjs.
                  `<style id="sg-fiche-dive-proto-css">`,
                  _ficheDive.FICHE_DIVE_CSS_SCOPED,
                  `</style>`,
                  _ficheDive.FICHE_DIVE_MARKUP,
                  `</div>`,
                  `<script>`,
                  `window.__SG_BEACH__=${sgBeachData};`,
                  `window.__sgTrack=function(ev,params){`,
                  `  try{var mid="${isMQ ? 'G-V8JGMDZZ2Y' : 'G-Q31VV3LLM9'}",sec="${isMQ ? 'eFHMRr4tQ-2B-JYidixOSA' : 'eWAv3vACT6uVzcrAi7JgYQ'}";`,
                  `  var cid=document.cookie.match(/_ga=GA\\d+\\.\\d+\\.(\\d+\\.\\d+)/);cid=cid?cid[1]:"a."+Date.now();`,
                  `  if(navigator.sendBeacon)navigator.sendBeacon("https://www.google-analytics.com/mp/collect?measurement_id="+mid+"&api_secret="+sec,JSON.stringify({client_id:cid,events:[{name:ev,params:params||{}}]}));`,
                  `  }catch(e){}`,
                  `};`,
                  `(function(){`,
                  `  var RM=matchMedia&&matchMedia('(prefers-reduced-motion:reduce)').matches;`,
                  // RE-LANCÉ GATÉ 2026-06-18 puis PROMU 2026-06-19 (GO fondateur) : variante
                  // `dive` gagnante +84% @95% (n=416/469, 28j). 100% dive sur les éligibles
                  // (parité avec l'in-app `pw_beach_dive`). La plongée n'est servie QUE sur les
                  // plages avec score+breakdown réels (SGFD_ELIGIBLE, ~20/136) — ailleurs
                  // contrôle (jamais de données vides/fabriquées). Réversible : restaurer le
                  // bloc 50/50 localStorage (var k='ab_fiche_dive'…) à la place du `return true`.
                  `  var SGFD_ELIGIBLE=${_fd_eligible ? 'true' : 'false'};`,
                  `  function pick(){`,
                  `    try{var q=location.search;`,
                  `    if(/[?&]fichedive=1/.test(q))return true;`,
                  `    if(/[?&]fichedive=0/.test(q))return false;`,
                  `    if(RM)return false;`,
                  `    if(!SGFD_ELIGIBLE)return false;`,
                  `    return true;`,
                  `    }catch(e){return false;}`,
                  `  }`,
                  `  var active=pick();`,
                  `  if(active){var d=document.getElementById('sg-fiche-dive');if(d)d.hidden=false;}`,
                  `  try{window.__sgTrack('sg_fiche_view',{variant:active?'dive':'control',beach:'${b.id}',island:'${b.island}'});}catch(e){}`,
                  `})();`,
                  `</script>`,
                  `<script>`,
                  `(function(){var active=!document.getElementById('sg-fiche-dive')||!document.getElementById('sg-fiche-dive').hidden;if(!active)return;`,
                  _ficheDive.FICHE_DIVE_ENGINE,
                  `})();`,
                  `</script>`
                ].join('\n')
                ficheDiveHtml = beachHtml.replace('</body>', ficheDiveInject + '\n</body>')
              } catch (fdErr) {
                // Fallback to control if fiche-dive injection throws
                console.warn(`   ⚠ fiche-dive injection failed for ${b.slug}:`, fdErr.message)
                ficheDiveHtml = beachHtml.replace('</body>', noscriptHero + '\n</body>')
              }
            }
            const finalHtml = ficheDiveHtml
            writeFileSync(resolve(beachDir, 'index.html'), finalHtml)

            // ── WIDGET B2B GENERATION ──
            if (_widgetRenderer) {
              try {
                const _w_lv = heroLv(b)
                const _w_status = _w_lv.status || 'clean'
                const _w_score = typeof _w_lv.score === 'number' ? _w_lv.score : null
                const _w_updatedAt = _heroLive.updatedAt || new Date().toISOString()
                const widgetHtmlFR = _widgetRenderer.renderWidget(b, _w_status, _w_score, _w_updatedAt, 'fr', b.island)
                const widgetDir = resolve(outDir, 'widget', 'embed', b.slug)
                mkdirSync(widgetDir, { recursive: true })
                writeFileSync(resolve(widgetDir, 'index.html'), widgetHtmlFR)
                
                // Legacy alias routing if this beach has one
                const sargId = BEACH_TO_SARG[b.id]
                if (sargId && sargId !== b.slug) {
                  const legacyDir = resolve(outDir, 'widget', 'embed', sargId)
                  mkdirSync(legacyDir, { recursive: true })
                  writeFileSync(resolve(legacyDir, 'index.html'), widgetHtmlFR)
                }
              } catch (we) {
                console.warn(`   ⚠ widget failed for ${b.slug}:`, we.message)
              }
            }

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
              if (st === 'moderate') return '<span style="display:inline-block;padding:1px 8px;border-radius:8px;background:#fef3c7;color:#b87a00;font-size:12px;font-weight:600">Modéré</span>'
              return '<span style="display:inline-block;padding:1px 8px;border-radius:8px;background:#fee2e2;color:#e8522a;font-size:12px;font-weight:600">À éviter</span>'
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
            const plagesHtml = htmlSubpage
              .replace(/<title>[^<]*<\/title>/, `<title>${plagesTitle}</title>`)
              .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${plagesDesc}" />`)
              .replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${plagesUrl}" />`)
              // hreflang : pas de variante EN/ES du hub → fr + x-default self, tags en/es retirés
              .replace(/<link rel="alternate" hreflang="fr"[^>]*>/, `<link rel="alternate" hreflang="fr" href="${plagesUrl}" />`)
              .replace(/<link rel="alternate" hreflang="en"[^>]*>/, '')
              .replace(/<link rel="alternate" hreflang="es"[^>]*>/, '')
              .replace(/<link rel="alternate" hreflang="x-default"[^>]*>/, `<link rel="alternate" hreflang="x-default" href="${plagesUrl}" />`)
              .replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${plagesTitle}" />`)
              .replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${plagesDesc}" />`)
              .replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${plagesUrl}" />`)
              .replace(/<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${plagesTitle}" />`)
              .replace(/<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${plagesDesc}" />`)
              .replace('</head>', `\n    <script type="application/ld+json">\n    ${plagesSchema}\n    </script>\n    <script type="application/ld+json">\n    ${breadcrumbPlages}\n    </script>\n</head>`)
              .replace('</body>', `\n    <noscript>${plagesNoscript}</noscript>\n</body>`)
            writeFileSync(resolve(plagesDir, 'index.html'), plagesHtml)
            // Stash the GP-flavored version in the _gp/ mirror so prepare-ftp.cjs
            // can stamp it onto guadeloupe-ftp/ after the MQ iteration overwrites
            // dist/plages/index.html on its second pass.
            if (!isMQ) {
              const gpMirrorDir = resolve(outDir, '_gp', 'plages')
              mkdirSync(gpMirrorDir, { recursive: true })
              writeFileSync(resolve(gpMirrorDir, 'index.html'), toGpMirror(plagesHtml))
            }
            // Add to sitemap
            const plagesSitemapEntry = `  <url><loc>${plagesUrl}</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url>\n`
            if (isMQ) sitemapMQBeaches += plagesSitemapEntry
            else sitemapGPBeaches += plagesSitemapEntry

            // ── Hubs zones côtières /plages/<zone>/ — couche home → zone → plages ──
            // Liste les plages de la zone avec statut LIVE + géographie d'exposition
            // (intro factuelle), liens croisés vers les autres zones. Le lien
            // remontant est posé sur chaque page plage (zoneLine).
            for (const z of (COAST_ZONES[islandCode] || [])) {
              const zBeaches = islandBeaches.filter(b => z.communes.includes(b.commune))
              if (!zBeaches.length) continue
              const zClean = zBeaches.filter(b => (statusById[b.id] || 'clean') === 'clean').length
              const zList = zBeaches
                .slice().sort((a, b2) => a.commune === b2.commune ? a.name.localeCompare(b2.name) : a.commune.localeCompare(b2.commune))
                .map(b => `<li style="padding:6px 0"><a href="/plages/${b.slug}/" style="color:#0D0D0D;text-decoration:none;font-weight:500">${b.name}</a> — ${b.commune} ${statusBadge(statusById[b.id] || 'clean')}</li>`).join('')
              const others = (COAST_ZONES[islandCode] || []).filter(o => o.slug !== z.slug)
                .map(o => `<a href="/plages/${o.slug}/" style="color:#E8A800;font-weight:600;margin-right:14px">${o.name}</a>`).join('')
              const zTitle = `Plages ${z.titleName || z.name} — sargasses en temps réel`
              const zDesc = `${zBeaches.length} plages surveillées par satellite ${islandCode === 'mq' ? 'en Martinique' : 'en Guadeloupe'} (${z.name}) : ${zClean} propre${zClean > 1 ? 's' : ''} aujourd'hui. État en temps réel et prévisions 7 jours.`
              const zUrl = `https://${domain}/plages/${z.slug}/`
              const zNoscript = `<article style="max-width:700px;margin:0 auto;padding:24px 16px;font-family:system-ui,sans-serif"><h1 style="font-size:26px;margin-bottom:8px">Plages — ${z.name}</h1><p style="color:#686868;margin-bottom:12px">${zBeaches.length} plages surveillées · ${zClean} propre${zClean > 1 ? 's' : ''} aujourd'hui (satellite Copernicus, ${today})</p><p style="color:#333;line-height:1.6;margin-bottom:20px">${z.intro}</p><ul style="list-style:none;padding:0">${zList}</ul><nav style="margin-top:32px;padding-top:16px;border-top:1px solid #eee"><div style="margin-bottom:10px;font-size:13px;color:#999">Autres zones :</div>${others}<div style="margin-top:14px"><a href="/plages/" style="color:#E8A800;font-weight:600;margin-right:14px">Toutes les plages</a><a href="/carte-sargasses/" style="color:#E8A800;font-weight:600">Carte en temps réel</a></div></nav></article>`
              const zSchema = JSON.stringify({ "@context": "https://schema.org", "@type": "CollectionPage", "name": zTitle, "description": zDesc, "url": zUrl, "isPartOf": { "@type": "WebApplication", "name": `Sargasses ${island}`, "url": `https://${domain}/` }, "dateModified": today })
              const zBreadcrumb = JSON.stringify({ "@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [{ "@type": "ListItem", "position": 1, "name": "Accueil", "item": `https://${domain}/` }, { "@type": "ListItem", "position": 2, "name": "Plages", "item": plagesUrl }, { "@type": "ListItem", "position": 3, "name": z.name, "item": zUrl }] })
              const zHtml = htmlSubpage
                .replace(/<title>[^<]*<\/title>/, `<title>${zTitle}</title>`)
                .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${zDesc}" />`)
                .replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${zUrl}" />`)
                // hreflang : pas de variante EN/ES des hubs zones → fr + x-default self
                .replace(/<link rel="alternate" hreflang="fr"[^>]*>/, `<link rel="alternate" hreflang="fr" href="${zUrl}" />`)
                .replace(/<link rel="alternate" hreflang="en"[^>]*>/, '')
                .replace(/<link rel="alternate" hreflang="es"[^>]*>/, '')
                .replace(/<link rel="alternate" hreflang="x-default"[^>]*>/, `<link rel="alternate" hreflang="x-default" href="${zUrl}" />`)
                .replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${zTitle}" />`)
                .replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${zDesc}" />`)
                .replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${zUrl}" />`)
                .replace(/<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${zTitle}" />`)
                .replace(/<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${zDesc}" />`)
                .replace('</head>', `\n    <script type="application/ld+json">\n    ${zSchema}\n    </script>\n    <script type="application/ld+json">\n    ${zBreadcrumb}\n    </script>\n</head>`)
                .replace('</body>', `\n    <noscript>${zNoscript}</noscript>\n</body>`)
              const zDir = resolve(outDir, 'plages', z.slug)
              mkdirSync(zDir, { recursive: true })
              writeFileSync(resolve(zDir, 'index.html'), zHtml)
              if (!isMQ) {
                const gpZDir = resolve(outDir, '_gp', 'plages', z.slug)
                mkdirSync(gpZDir, { recursive: true })
                writeFileSync(resolve(gpZDir, 'index.html'), toGpMirror(zHtml))
              }
              const zEntry = `  <url><loc>${zUrl}</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.75</priority></url>\n`
              if (isMQ) sitemapMQBeaches += zEntry
              else sitemapGPBeaches += zEntry
            }
            console.log(`   → ${(COAST_ZONES[islandCode] || []).length} hubs zones côtières ${islandCode.toUpperCase()}`)
          }
          console.log('   \u2192 /plages/ index page g\u00e9n\u00e9r\u00e9e (MQ + GP)')

          // ── /conditions/* — aggregation pages by today's weather + sargassum ──
          // New URL surface area that updates daily without fresh editorial work.
          // Each page targets a long-tail intent: "mer calme martinique aujourd'hui",
          // "baignade ideale martinique", etc. Build-time generation reads _weather
          // (Open-Meteo) + beach status so content is unique per build, per island.
          {
            const statusByIdCond = Object.fromEntries(SARGASSUM_REF.map(r => [r.id, r.status]))
            const weatherAgeMs = _weatherFreshness ? (Date.now() - new Date(_weatherFreshness).getTime()) : Infinity
            const isWeatherStale = weatherAgeMs > 12 * 60 * 60 * 1000
            const weatherFreshnessLabel = isWeatherStale || !_weatherFreshness
              ? 'Vérification des conditions météo en cours'
              : `Données rafraîchies il y a ${Math.round(weatherAgeMs / 3600000)}h`

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
                const matching = isWeatherStale ? [] : enrichedBeaches
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
                const pageNoscript = `<article style="max-width:720px;margin:0 auto;padding:24px 16px;font-family:system-ui,sans-serif"><nav style="font-size:13px;color:#686868;margin-bottom:12px"><a href="/" style="color:#686868">Accueil</a> \u203a <a href="/plages/" style="color:#686868">Plages</a> \u203a Conditions</nav><h1 style="font-size:26px;margin-bottom:8px">${pageH1}</h1><p style="color:#444;margin-bottom:12px;font-size:15px">${page.intro}</p><p style="color:#686868;font-size:13px;margin-bottom:20px">${weatherFreshnessLabel}. Sources\u00a0: Copernicus Sentinel-3 (sargasses) + Open-Meteo Marine (vagues, temp\u00e9rature, UV).</p><h2 style="font-size:18px;margin:24px 0 12px">Plages correspondantes (${matching.length})</h2><ul style="list-style:none;padding:0;margin:0">${beachListHtml}</ul><nav style="margin-top:32px;padding-top:16px;border-top:1px solid #eee;font-size:14px"><a href="/conditions/baignade-ideale/" style="color:#E8A800;font-weight:600;margin-right:16px">Baignade id\u00e9ale</a><a href="/conditions/mer-calme/" style="color:#E8A800;font-weight:600;margin-right:16px">Mer calme</a><a href="/conditions/mer-agitee/" style="color:#E8A800;font-weight:600;margin-right:16px">Mer agit\u00e9e</a><a href="/conditions/uv-fort/" style="color:#E8A800;font-weight:600;margin-right:16px">UV fort</a><a href="/carte-sargasses/" style="color:#E8A800;font-weight:600">Carte</a></nav></article>`
                const pageSchema = JSON.stringify({"@context":"https://schema.org","@type":"CollectionPage","name":pageTitle,"description":pageDesc,"url":pageUrl,"isPartOf":{"@type":"WebApplication","name":`Sargasses ${island}`,"url":`https://${domain}/`},"dateModified":today})
                const breadcrumbCond = JSON.stringify({"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Accueil","item":`https://${domain}/`},{"@type":"ListItem","position":2,"name":"Plages","item":`https://${domain}/plages/`},{"@type":"ListItem","position":3,"name":"Conditions","item":`https://${domain}/conditions/`},{"@type":"ListItem","position":4,"name":pageH1,"item":pageUrl}]})
                const condDir = resolve(outDir, 'conditions', page.slug)
                mkdirSync(condDir, { recursive: true })
                const condHtml = htmlSubpage
                  .replace(/<title>[^<]*<\/title>/, `<title>${pageTitle}</title>`)
                  .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${pageDesc}" />`)
                  .replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${pageUrl}" />`)
                  // hreflang : pas de variante EN/ES des pages conditions → fr + x-default self
                  .replace(/<link rel="alternate" hreflang="fr"[^>]*>/, `<link rel="alternate" hreflang="fr" href="${pageUrl}" />`)
                  .replace(/<link rel="alternate" hreflang="en"[^>]*>/, '')
                  .replace(/<link rel="alternate" hreflang="es"[^>]*>/, '')
                  .replace(/<link rel="alternate" hreflang="x-default"[^>]*>/, `<link rel="alternate" hreflang="x-default" href="${pageUrl}" />`)
                  .replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${pageTitle}" />`)
                  .replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${pageDesc}" />`)
                  .replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${pageUrl}" />`)
                  .replace(/<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${pageTitle}" />`)
                  .replace(/<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${pageDesc}" />`)
                  .replace('</head>', `\n    <script id="sg-conditions-data" type="application/json">${JSON.stringify({ slug: page.slug, beaches: matching.map(b => ({ id: b.id, name: b.name, commune: b.commune, slug: b.slug, lat: b.lat, lng: b.lng, drive: b.drive, kids: b.kids, snorkel: b.snorkel, status: b.status })) })}</script>\n    <script type="application/ld+json">\n    ${pageSchema}\n    </script>\n    <script type="application/ld+json">\n    ${breadcrumbCond}\n    </script>\n</head>`)
                  .replace('</body>', `\n    <noscript>${pageNoscript}</noscript>\n</body>`)
                writeFileSync(resolve(condDir, 'index.html'), condHtml)
                if (!isMQ) {
                  const gpMirrorDir = resolve(outDir, '_gp', 'conditions', page.slug)
                  mkdirSync(gpMirrorDir, { recursive: true })
                  writeFileSync(resolve(gpMirrorDir, 'index.html'), toGpMirror(condHtml))
                }
                const condSitemapEntry = `  <url><loc>${pageUrl}</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.7</priority></url>\n`
                if (isMQ) sitemapMQBeaches += condSitemapEntry
                else sitemapGPBeaches += condSitemapEntry
              }
              // /conditions/ landing (hub) — lists all sub-pages
              const hubTitle = `Conditions des plages aujourd\u2019hui \u2014 ${island}`
              const hubDesc = `Plages de ${island} class\u00e9es par conditions du jour\u00a0: baignade id\u00e9ale, mer calme, mer agit\u00e9e, UV fort, plages enfants, snorkeling. Donn\u00e9es satellite + Open-Meteo rafra\u00eechies quotidiennement.`
              const hubUrl = `https://${domain}/conditions/`
              const hubLinks = conditionPages.map(p => `<li style="padding:12px 0;border-bottom:1px solid #eee"><a href="/conditions/${p.slug}/" style="color:#0D0D0D;text-decoration:none;font-weight:600;font-size:16px">${isMQ ? p.h1Mq : p.h1Gp}</a><br><span style="color:#686868;font-size:14px">${p.intro.slice(0, 140)}\u2026</span></li>`).join('')
              const hubNoscript = `<article style="max-width:720px;margin:0 auto;padding:24px 16px;font-family:system-ui,sans-serif"><h1 style="font-size:26px;margin-bottom:8px">${hubTitle}</h1><p style="color:#686868;margin-bottom:20px;font-size:15px">S\u00e9lections de plages mises \u00e0 jour chaque jour selon la météo et les sargasses. Choisissez le crit\u00e8re qui compte pour vous aujourd\u2019hui.</p><ul style="list-style:none;padding:0;margin:0">${hubLinks}</ul><nav style="margin-top:32px;padding-top:16px;border-top:1px solid #eee"><a href="/plages/" style="color:#E8A800;font-weight:600;margin-right:16px">Toutes les plages</a><a href="/carte-sargasses/" style="color:#E8A800;font-weight:600">Carte sargasses</a></nav></article>`
              const hubSchema = JSON.stringify({"@context":"https://schema.org","@type":"CollectionPage","name":hubTitle,"description":hubDesc,"url":hubUrl,"isPartOf":{"@type":"WebApplication","name":`Sargasses ${island}`,"url":`https://${domain}/`},"dateModified":today})
              const hubDir = resolve(outDir, 'conditions')
              mkdirSync(hubDir, { recursive: true })
              const hubHtml = htmlSubpage
                .replace(/<title>[^<]*<\/title>/, `<title>${hubTitle}</title>`)
                .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${hubDesc}" />`)
                .replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${hubUrl}" />`)
                // hreflang : pas de variante EN/ES du hub conditions → fr + x-default self
                .replace(/<link rel="alternate" hreflang="fr"[^>]*>/, `<link rel="alternate" hreflang="fr" href="${hubUrl}" />`)
                .replace(/<link rel="alternate" hreflang="en"[^>]*>/, '')
                .replace(/<link rel="alternate" hreflang="es"[^>]*>/, '')
                .replace(/<link rel="alternate" hreflang="x-default"[^>]*>/, `<link rel="alternate" hreflang="x-default" href="${hubUrl}" />`)
                .replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${hubTitle}" />`)
                .replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${hubDesc}" />`)
                .replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${hubUrl}" />`)
                .replace('</head>', `\n    <script id="sg-conditions-data" type="application/json">${JSON.stringify({ slug: 'hub', pages: conditionPages.map(p => p.slug) })}</script>\n    <script type="application/ld+json">\n    ${hubSchema}\n    </script>\n</head>`)
                .replace('</body>', `\n    <noscript>${hubNoscript}</noscript>\n</body>`)
              writeFileSync(resolve(hubDir, 'index.html'), hubHtml)
              if (!isMQ) {
                const gpMirrorDir = resolve(outDir, '_gp', 'conditions')
                mkdirSync(gpMirrorDir, { recursive: true })
                writeFileSync(resolve(gpMirrorDir, 'index.html'), toGpMirror(hubHtml))
              }
              const hubSitemapEntry = `  <url><loc>${hubUrl}</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url>\n`
              if (isMQ) sitemapMQBeaches += hubSitemapEntry
              else sitemapGPBeaches += hubSitemapEntry
            }
            console.log('   \u2192 /conditions/ hub + 6 aggregation pages (MQ + GP) = 14 pages')
          }

          // Réécrire les sitemaps avec les plages
          const sitemapMQFull = sitemapMQ.replace('</urlset>', sitemapMQBeaches + '</urlset>')
          const sitemapGPFull = sitemapGP.replace('</urlset>', sitemapGPBeaches + '</urlset>')
          writeFileSync(resolve(outDir, 'sitemap-martinique.xml'), sitemapMQFull)
          writeFileSync(resolve(outDir, 'sitemap-guadeloupe.xml'), sitemapGPFull)
          console.log(`   → ${beaches.length} pages plages générées (${beaches.filter(b=>b.island==='mq').length} MQ + ${beaches.filter(b=>b.island==='gp').length} GP)`)
          console.log('   → Sitemaps enrichis avec URLs plages')

          // ── WIDGET B2B REGIONALIZATION & TRANSLATION ──
          try {
            const wPath = resolve(outDir, 'widget', 'index.html')
            if (existsSync(wPath)) {
              const baseHtml = readFileSync(wPath, 'utf-8')
              const enHtml = baseHtml
                .replace(/<html lang="fr">/, '<html lang="en">')
                .replace(/Widget Sargasses B2B \u2014 Martinique et Guadeloupe/, 'B2B Sargassum Widget \u2014 Martinique & Guadeloupe')
                .replace(/Intégrez gratuitement la météo des sargasses sur le site de votre hôtel ou base nautique/, 'Embed the sargassum weather map on your hotel or watersports website for free')
                .replace(/Obtenir le code/, 'Get the code')
                .replace(/Copiez-collez ce code/, 'Copy and paste this code')
                .replace(/<link rel="canonical" href="[^"]*">/, '<link rel="canonical" href="https://sargasses-martinique.com/en/widget/" />')
              
              const esHtml = baseHtml
                .replace(/<html lang="fr">/, '<html lang="es">')
                .replace(/Widget Sargasses B2B \u2014 Martinique et Guadeloupe/, 'Widget Sargazo B2B \u2014 Martinica y Guadalupe')
                .replace(/Intégrez gratuitement la météo des sargasses sur le site de votre hôtel ou base nautique/, 'Integra gratis el mapa de sargazo en el sitio web de tu hotel o centro náutico')
                .replace(/Obtenir le code/, 'Obtener el código')
                .replace(/Copiez-collez ce code/, 'Copia y pega este código')
                .replace(/<link rel="canonical" href="[^"]*">/, '<link rel="canonical" href="https://sargasses-martinique.com/es/widget/" />')

              const wDirEn = resolve(outDir, 'en', 'widget')
              const wDirEs = resolve(outDir, 'es', 'widget')
              mkdirSync(wDirEn, { recursive: true })
              mkdirSync(wDirEs, { recursive: true })
              writeFileSync(resolve(wDirEn, 'index.html'), enHtml)
              writeFileSync(resolve(wDirEs, 'index.html'), esHtml)

              // Regionalize for GP
              const gpMirrorDir = resolve(outDir, '_gp', 'widget')
              mkdirSync(gpMirrorDir, { recursive: true })
              const gpW = toGpMirror(baseHtml)
                .replace(/<link rel="canonical" href="[^"]*">/, '<link rel="canonical" href="https://sargasses-guadeloupe.com/widget/" />')
              writeFileSync(resolve(gpMirrorDir, 'index.html'), gpW)
            }
          } catch (e) { console.warn('   ⚠ widget landing regionalization:', e.message) }

          // ── Pages mois /sargasses-juin-2026/ etc. — bilan mensuel calculé
          //    depuis history.json réel (MQ canonical + miroir _gp/, mois passés
          //    ≥ 15 jours + mois courant « en cours »). Appelé APRÈS la réécriture
          //    finale des sitemaps : le générateur les patche sur disque. ──
          try {
            const { generateMonthPages } = _require('./scripts/lib/month-pages.cjs')
            generateMonthPages(null, outDir)
          } catch (e) { console.warn('   ⚠ pages mois:', e.message) }
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
  define: {
    // Config région injectée au build (id/domain/lang/currency/center/bbox/emails/beaches…).
    // No-op pour MQ/GP tant que le runtime ne lit pas __REGION__ (consommé en phase runtime).
    __REGION__: JSON.stringify(REGION),
    // Fiabilité honnête par régime (cf. bloc RELIABILITY plus haut) — badge in-app.
    __RELIABILITY__: JSON.stringify(RELIABILITY),
  },
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
