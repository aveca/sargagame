/**
 * today-pages.cjs — Pages « aujourd'hui » SEO auto-générées au build (P0 acquisition).
 *
 * Capte l'intention la plus chaude (« sargasses martinique aujourd'hui »,
 * « sargazo en miami hoy », « sargassum punta cana today ») avec une page
 * 100 % data-driven régénérée à chaque build quotidien :
 *   - meilleur choix du jour + top favorables + à surveiller + défavorables
 *   - alternative « où aller plutôt » (haversine même région, jamais cross-région)
 *   - date + heure de mise à jour satellite, fraîcheur honnête (bandeau si stale)
 *   - sources (Copernicus ERDDAP), méthodologie, lien /fiabilite/, CTA carte/fiches
 *
 * URL stable par domaine (jamais de page par date — l'URL accumule l'autorité,
 * le contenu tourne chaque jour, lastmod du jour) :
 *   - MQ : /aujourdhui/ (canonical sargasses-martinique.com) + miroir _gp/aujourdhui/
 *          (canonical sargasses-guadeloupe.com) — pattern month-pages.
 *   - Régions EN : /today/ · ES : /hoy/ (+ sitemap.xml régional, pattern reliability).
 *
 * RÈGLE D'OR : aucun chiffre inventé. Tout vient de :
 *   public/api/copernicus/sargassum.json (MQ+GP) ou
 *   public/api/copernicus/<id>/sargassum.json (régions).
 * Sans niveaux live → page NON générée (jamais de page vide/mensongère).
 * Météo, vent, odeur, fréquentation, qualité de l'eau : JAMAIS affichés
 * (non mesurés par le pipeline).
 *
 * Appelée par le plugin seo-pages de vite.config.js (closeBundle) :
 *   - core MQ/GP : APRÈS month-pages (sitemaps -martinique/-guadeloupe écrits).
 *   - régions : APRÈS generateRegionSeoPages (sitemap.xml régional écrit).
 * Les prunes sitemap (dead/foreign domains) tournent après et conservent les
 * URLs own-domain → placement sûr.
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
const { SARG_TO_BEACH } = require('./sarg-to-beach.cjs')
const { slugify } = require('./slug-resolver.cjs')

const loadJSON = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { return fb } }
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// beach.id (beaches-list) → sarg id (levels). Inverse de SARG_TO_BEACH.
const BEACH_TO_SARG = {}
for (const [sarg, bid] of Object.entries(SARG_TO_BEACH)) BEACH_TO_SARG[bid] = sarg

function haversineKm(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some(v => typeof v !== 'number' || isNaN(v))) return Infinity
  const R = 6371, dLa = (lat2 - lat1) * Math.PI / 180, dLo = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLo / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

const LOCALES = { fr: 'fr-FR', en: 'en-US', es: 'es-MX' }
const fmtLongDate = (lang, d = new Date()) => d.toLocaleDateString(LOCALES[lang], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const fmtTimeUTC = iso => { try { const d = new Date(iso); return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0') } catch { return '' } }

const I18N = {
  fr: {
    h1: r => `Sargasses en ${r} aujourd'hui`,
    lead: (n, r, date) => `${n} plages surveillées par satellite en ${r} — état du jour ${date}. Où se baigner aujourd'hui, plage par plage, mesuré au satellite Copernicus (ERDDAP), pas deviné.`,
    best: 'Meilleur choix du jour',
    top: 'Plages favorables aujourd\u2019hui',
    watch: 'À surveiller',
    bad: 'Plages défavorables aujourd\u2019hui',
    alt: (name, km) => `Où aller plutôt : ${name} (${km})`,
    noAlt: 'Pas d\u2019alternative propre à proximité aujourd\u2019hui — le verdict reste gratuit demain matin.',
    fresh: ts => `Satellite : mise à jour ${ts} UTC`,
    stale: 'Données d\u2019hier — le satellite n\u2019a pas encore livré le passage du jour. Les statuts ci-dessous restent ceux de la dernière mesure réelle.',
    method: 'Méthodologie',
    methodTxt: 'Chaque plage est notée 0–100 à partir de l\u2019indice AFAI mesuré au large (Copernicus Sentinel-3 / MODIS). Propre : AFAI < 0,15. Modéré : 0,15–0,40. À éviter : > 0,40. L\u2019état peut basculer avec le vent : vérifiez toujours sur place.',
    sources: 'Sources : satellite Copernicus (ERDDAP) via pipeline Sargagame.',
    proof: 'Voir nos erreurs publiées',
    nav: 'Carte en temps réel · Prévisions 7 jours · Toutes les plages',
    statusWord: { clean: 'Propre', moderate: 'Modéré', avoid: 'À éviter' },
    km: km => km < 1 ? `${Math.round(km * 1000)} m` : `~${Math.round(km)} km`,
    score: s => `score ${s}/100`,
  },
  en: {
    h1: r => `Sargassum in ${r} today`,
    lead: (n, r, date) => `${n} satellite-monitored beaches in ${r} — status for ${date}. Where to swim today, beach by beach, measured by Copernicus satellite (ERDDAP), not guessed.`,
    best: 'Top pick today',
    top: 'Favorable beaches today',
    watch: 'Worth watching',
    bad: 'Unfavorable beaches today',
    alt: (name, km) => `Go here instead: ${name} (${km})`,
    noAlt: 'No clean alternative nearby today — the free verdict is back tomorrow morning.',
    fresh: ts => `Satellite: updated ${ts} UTC`,
    stale: 'Yesterday\u2019s data — today\u2019s satellite pass hasn\u2019t landed yet. Statuses below are the last real measurement.',
    method: 'Methodology',
    methodTxt: 'Each beach is scored 0–100 from the offshore AFAI index (Copernicus Sentinel-3 / MODIS). Clean: AFAI < 0.15. Moderate: 0.15–0.40. Avoid: > 0.40. Conditions can flip with the wind: always check on site.',
    sources: 'Sources: Copernicus satellite (ERDDAP) via the Sargagame pipeline.',
    proof: 'See our published error rate',
    nav: 'Live map · 7-day forecast · All beaches',
    statusWord: { clean: 'Clean', moderate: 'Moderate', avoid: 'Avoid' },
    km: km => km < 1 ? `${Math.round(km * 1000)} m` : `~${Math.round(km)} km`,
    score: s => `score ${s}/100`,
  },
  es: {
    h1: r => `Sargazo en ${r} hoy`,
    lead: (n, r, date) => `${n} playas vigiladas por satélite en ${r} — estado de ${date}. Dónde bañarse hoy, playa por playa, medido por el satélite Copernicus (ERDDAP).`,
    best: 'La mejor opción de hoy',
    top: 'Playas favorables hoy',
    watch: 'Para vigilar',
    bad: 'Playas desfavorables hoy',
    alt: (name, km) => `Mejor ve aquí: ${name} (${km})`,
    noAlt: 'Sin alternativa limpia cerca hoy — el veredicto gratuito vuelve mañana.',
    fresh: ts => `Satélite: actualizado ${ts} UTC`,
    stale: 'Datos de ayer — el pase satelital de hoy aún no llega. Los estados son la última medición real.',
    method: 'Metodología',
    methodTxt: 'Cada playa se puntúa 0–100 desde el índice AFAI medido mar adentro (Copernicus Sentinel-3 / MODIS). Limpia: AFAI < 0,15. Moderada: 0,15–0,40. Evitar: > 0,40. El estado puede cambiar con el viento: verifica siempre en el lugar.',
    sources: 'Fuentes: satélite Copernicus (ERDDAP) vía el pipeline Sargagame.',
    proof: 'Ver nuestra tasa de error publicada',
    nav: 'Mapa en vivo · Pronóstico 7 días · Todas las playas',
    statusWord: { clean: 'Limpia', moderate: 'Moderada', avoid: 'Evitar' },
    km: km => km < 1 ? `${Math.round(km * 1000)} m` : `~${Math.round(km)} km`,
    score: s => `puntaje ${s}/100`,
  },
}

const STATUS_COLOR = { clean: '#16A34A', moderate: '#D97706', avoid: '#DC2622' }

function writePage(distDir, slug, html) {
  const dir = path.join(distDir, slug)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf-8')
}

/** Patche un sitemap existant sur disque (replace </urlset>) — pattern month-pages. */
function appendToSitemap(sitemapPath, domain, slug) {
  let xml
  try { xml = fs.readFileSync(sitemapPath, 'utf-8') } catch { return false }
  const today = new Date().toISOString().slice(0, 10)
  const loc = `https://${domain}/${slug}/`
  if (xml.includes(loc)) {
    // Lastmod du jour (fraîcheur) même si l'URL existe déjà.
    const upd = xml.replace(new RegExp(`(<loc>${loc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}<\\/loc><lastmod>)[^<]*`), `$1${today}`)
    if (upd !== xml) fs.writeFileSync(sitemapPath, upd, 'utf-8')
    return true
  }
  const added = `  <url><loc>${loc}</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.9</priority></url>\n`
  if (!xml.includes('</urlset>')) return false
  fs.writeFileSync(sitemapPath, xml.replace('</urlset>', added + '</urlset>'), 'utf-8')
  return true
}

/**
 * Construit le modèle de page depuis des niveaux live + plages.
 * Retourne null si aucune donnée live (la page n'est pas générée).
 */
function buildModel({ lang, regionLabel, beaches, levelsById, beachUrlOf, updatedAt, relSlug }) {
  const t = I18N[lang]
  const live = []
  for (const b of beaches) {
    if (!b || b.id == null) continue
    const lv = levelsById[b.id] || {}
    if (!lv.status || !['clean', 'moderate', 'avoid'].includes(lv.status)) continue
    live.push({ beach: b, status: lv.status, score: typeof lv.score === 'number' ? lv.score : null, url: beachUrlOf(b) })
  }
  if (!live.length) return null
  const byScore = [...live].sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
  const clean = byScore.filter(x => x.status === 'clean')
  const moderate = live.filter(x => x.status === 'moderate')
  const avoid = live.filter(x => x.status === 'avoid')
  const best = clean[0] || null
  // Alternative : plus proche propre même région (haversine sur coords réelles).
  const altFor = (x) => {
    let bestAlt = null, bd = Infinity
    for (const c of clean) {
      if (c.beach.id === x.beach.id) continue
      const km = haversineKm(x.beach.lat, x.beach.lng, c.beach.lat, c.beach.lng)
      if (km < bd) { bd = km; bestAlt = c }
    }
    return bestAlt && isFinite(bd) && bd <= 60 ? { ...bestAlt, km: t.km(bd) } : null
  }
  const ageH = updatedAt ? (Date.now() - new Date(updatedAt).getTime()) / 3.6e6 : Infinity
  return { t, live, clean, moderate, avoid, best, altFor, stale: !(ageH >= 0 && ageH < 36), updatedAt, regionLabel, relSlug }
}

function renderTodayPage({ lang, domain, siteName, slug, title, desc, model }) {
  const { t, live, clean, moderate, avoid, best, altFor, stale, updatedAt, regionLabel, relSlug } = model
  const today = new Date().toISOString().slice(0, 10)
  const dateLong = fmtLongDate(lang)
  const li = x => {
    const dot = `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${STATUS_COLOR[x.status]};flex:none"></span>`
    const sc = x.score != null ? ` · ${t.score(x.score)}` : ''
    return `<li style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid #eee">${dot}<span><a href="${x.url}" style="color:#0D0D0D;font-weight:600">${esc(x.beach.name)}</a> — ${t.statusWord[x.status]}${sc}</span></li>`
  }
  const avoidLi = x => {
    const alt = altFor(x)
    const altLine = alt
      ? `<br><span style="color:#0D0D0D">→ <a href="${alt.url}" style="color:#0D0D0D;font-weight:600">${esc(t.alt(alt.beach.name, alt.km))}</a></span>`
      : `<br><span style="color:#686868">${t.noAlt}</span>`
    const dot = `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${STATUS_COLOR.avoid};flex:none"></span>`
    return `<li style="padding:9px 0;border-bottom:1px solid #eee"><span style="display:flex;align-items:center;gap:10px">${dot}<span><a href="${x.url}" style="color:#0D0D0D;font-weight:600">${esc(x.beach.name)}</a> — ${t.statusWord.avoid}</span></span>${altLine}</li>`
  }
  const bestCard = best ? `<section style="margin:1.2em 0;padding:14px 16px;border-radius:12px;background:#f0fdf4;border:2px solid #16A34A"><div style="font:800 11px/1 system-ui;letter-spacing:.08em;color:#16A34A;margin-bottom:6px">${t.best.toUpperCase()}</div><div style="font-size:20px;font-weight:800"><a href="${best.url}" style="color:#0D0D0D">${esc(best.beach.name)}</a></div><div style="color:#333;margin-top:4px">${t.statusWord.clean}${best.score != null ? ` · ${t.score(best.score)}` : ''}</div></section>` : ''
  const staleBanner = stale ? `<p style="background:#fef3c7;border:1px solid #D97706;border-radius:10px;padding:10px 14px;color:#92400e">${t.stale}</p>` : `<p style="color:#686868;font-size:13px">${t.fresh(fmtTimeUTC(updatedAt))} · ${dateLong}</p>`
  const canonical = `https://${domain}/${slug}/`
  const tplPath = path.join(ROOT, 'dist', 'index.html')
  let html = fs.existsSync(tplPath) ? fs.readFileSync(tplPath, 'utf-8') : fs.readFileSync(path.join(ROOT, 'index.html'), 'utf-8')
  const noscript = `<article style="max-width:700px;margin:0 auto;padding:24px 16px;font-family:system-ui,sans-serif"><nav style="font-size:13px;color:#686868;margin-bottom:12px"><a href="/" style="color:#686868">Accueil</a></nav><h1 style="font-size:26px;margin-bottom:8px">${esc(t.h1(regionLabel))}</h1><p style="color:#444;margin-bottom:12px">${esc(t.lead(live.length, regionLabel, dateLong))}</p>${staleBanner}${bestCard}<h2 style="font-size:18px;margin:22px 0 8px">${t.top} (${clean.length})</h2>${clean.length ? `<ul style="list-style:none;padding:0;margin:0">${clean.slice(0, 8).map(li).join('')}</ul>` : ''}${moderate.length ? `<h2 style="font-size:18px;margin:22px 0 8px">${t.watch} (${moderate.length})</h2><ul style="list-style:none;padding:0;margin:0">${moderate.map(li).join('')}</ul>` : ''}${avoid.length ? `<h2 style="font-size:18px;margin:22px 0 8px">${t.bad} (${avoid.length})</h2><ul style="list-style:none;padding:0;margin:0">${avoid.map(avoidLi).join('')}</ul>` : ''}<h2 style="font-size:18px;margin:22px 0 8px">${t.method}</h2><p style="color:#444">${t.methodTxt}</p><p style="color:#686868;font-size:13px">${t.sources} <a href="/${relSlug}/">${t.proof}</a></p><nav style="margin-top:28px;padding-top:16px;border-top:1px solid #eee"><a href="/" style="color:#E8A800;font-weight:600;margin-right:16px">Carte</a><a href="/previsions/" style="color:#E8A800;font-weight:600;margin-right:16px">Prévisions</a><a href="/alertes/" style="color:#E8A800;font-weight:600">Alertes</a></nav></article>`
  const jsonLd = [
    { '@context': 'https://schema.org', '@type': 'WebPage', name: title, description: desc, url: canonical, dateModified: today, inLanguage: lang, isPartOf: { '@type': 'WebApplication', name: siteName, url: `https://${domain}/` } },
    {
      '@context': 'https://schema.org', '@type': 'ItemList', name: title, url: canonical,
      itemListElement: [...clean.slice(0, 8), ...moderate, ...avoid].slice(0, 15).map((x, i) => ({ '@type': 'ListItem', position: i + 1, name: `${x.beach.name} — ${t.statusWord[x.status]}`, url: `https://${domain}${x.url}` })),
    },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Accueil', item: `https://${domain}/` }, { '@type': 'ListItem', position: 2, name: t.h1(regionLabel), item: canonical }] },
  ]
  html = html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/(<meta name="description" content=)"[^"]*"/, `$1"${esc(desc)}"`)
    .replace(/(<link rel="canonical" href=)"[^"]*"/, `$1"${canonical}"`)
    .replace(/(<meta property="og:title" content=)"[^"]*"/, `$1"${esc(title)}"`)
    .replace(/(<meta property="og:description" content=)"[^"]*"/, `$1"${esc(desc)}"`)
    .replace(/(<meta property="og:url" content=)"[^"]*"/, `$1"${canonical}"`)
    .replace(/(<meta name="twitter:title" content=)"[^"]*"/, `$1"${esc(title)}"`)
    .replace(/(<meta name="twitter:description" content=)"[^"]*"/, `$1"${esc(desc)}"`)
    .replace(/<link rel="alternate" hreflang="[^"]*" href="[^"]*" \/>\s*/g, '')
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '')
  html = html.replace(/<noscript>\s*<h1>[\s\S]*?<\/noscript>/, '')
  const altBlock = `<link rel="alternate" hreflang="${lang}" href="${canonical}" />\n<link rel="alternate" hreflang="x-default" href="${canonical}" />`
  const ld = jsonLd.map(o => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join('\n')
  html = html.replace('</head>', `${altBlock}\n${ld}\n</head>`)
  html = html.replace('<div id="root">', `<noscript>${noscript}</noscript>\n<div id="root">`)
  return html
}

/**
 * Entrée unique. region null/mq/gp → MQ canonical + miroir _gp/ (pattern
 * month-pages) ; sinon build mono-région (slug /today/ EN, /hoy/ ES).
 */
function generateTodayPages(region, distDir) {
  const isNewRegion = !!(region && region.id !== 'mq' && region.id !== 'gp')
  if (!isNewRegion) {
    const allBeaches = loadJSON(path.join(ROOT, 'public', 'data', 'beaches-list.json'), [])
    const live = loadJSON(path.join(ROOT, 'public', 'api', 'copernicus', 'sargassum.json'), null)
    const levels = (live && live.levels) || []
    if (!levels.length) { console.log('   → pages aujourd\u2019hui : sargassum.json vide, rien à générer'); return }
    const levelsBySarg = Object.fromEntries(levels.map(l => [l.id, l]))
    const updatedAt = live.updatedAt || null
    const made = []
    for (const island of ['mq', 'gp']) {
      const isMQ = island === 'mq'
      const domain = isMQ ? 'sargasses-martinique.com' : 'sargasses-guadeloupe.com'
      const regionLabel = isMQ ? 'Martinique' : 'Guadeloupe'
      const beaches = allBeaches.filter(b => b.island === island)
      const levelsById = {}
      for (const b of beaches) {
        const sargId = BEACH_TO_SARG[b.id]
        if (sargId && levelsBySarg[sargId]) levelsById[b.id] = levelsBySarg[sargId]
      }
      const model = buildModel({
        lang: 'fr', regionLabel, beaches, levelsById,
        beachUrlOf: b => `/plages/${b.slug}/`, updatedAt, relSlug: 'fiabilite',
      })
      if (!model) { console.log(`   → aujourd\u2019hui ${island} : aucune donnée live, page ignorée`); continue }
      const n = model.clean.length
      const title = `Sargasses ${regionLabel} aujourd\u2019hui — ${n} plage${n > 1 ? 's' : ''} propre${n > 1 ? 's' : ''}, où se baigner ?`
      const desc = `Où se baigner en ${regionLabel} aujourd\u2019hui (${fmtLongDate('fr')}) ? ${n} plages propres par satellite Copernicus, alternatives à proximité, prévision 7 jours. Mesuré, pas deviné.`
      const html = renderTodayPage({ lang: 'fr', domain, siteName: `Sargasses ${regionLabel}`, slug: 'aujourdhui', title, desc, model })
      const outDir = isMQ ? distDir : path.join(distDir, '_gp')
      writePage(outDir, 'aujourdhui', html)
      const sm = appendToSitemap(path.join(distDir, isMQ ? 'sitemap-martinique.xml' : 'sitemap-guadeloupe.xml'), domain, 'aujourdhui')
      made.push(`/${isMQ ? '' : '_gp/'}aujourdhui/ (${island}${sm ? ' +sitemap' : ''})`)
    }
    console.log(`   → pages aujourd\u2019hui MQ/GP : ${made.join(' · ') || 'aucune'}`)
    return
  }
  const lang = region.primaryLang === 'es' ? 'es' : 'en'
  // Anti-doublon : les régions qui ont déjà une page « today » native data-driven
  // (seo-content today.slug, ex. beaches-without-sargassum-today) n'en reçoivent
  // pas une seconde (cannibalisation). Seules les régions SANS page today native
  // (ex. tulum) reçoivent /today/ (EN) ou /hoy/ (ES).
  const RL = require('./region-langs.cjs')
  let nativeToday = false
  try {
    for (const l of RL.emittedLangs(region)) {
      const c = loadJSON(RL.seoContentPath(region.id, l, l === RL.normLang(region.primaryLang)), null)
      if (c && c.pages && c.pages.today && c.pages.today.slug) { nativeToday = true; break }
    }
  } catch {}
  if (nativeToday) { console.log(`   → aujourd\u2019hui (${region.id}) : page today native existante, rien à ajouter (anti-doublon)`); return { skipped: 'native-today' } }
  const slug = lang === 'es' ? 'hoy' : 'today'
  const data = loadJSON(path.join(ROOT, 'public', 'api', 'copernicus', region.id, 'sargassum.json'), { levels: [] })
  const levels = data.levels || []
  if (!levels.length) { console.log(`   → aujourd\u2019hui (${region.id}) : sargassum vide, rien à générer`); return }
  const levelsById = Object.fromEntries(levels.map(l => [l.id, l]))
  const beaches = (region.beaches || []).filter(b => b.island === region.id)
  const model = buildModel({
    lang, regionLabel: region.name, beaches, levelsById,
    beachUrlOf: b => `/beach/${b.slug || slugify(b.name)}/`,
    updatedAt: data.updatedAt || null,
    relSlug: lang === 'es' ? 'fiabilidad' : 'reliability',
  })
  if (!model) { console.log(`   → aujourd\u2019hui (${region.id}) : aucune donnée live, page ignorée`); return }
  const n = model.clean.length
  const title = lang === 'es'
    ? `Sargazo en ${region.name} hoy — ${n} playas limpias, ¿dónde bañarse?`
    : `Sargassum in ${region.name} today — ${n} clean beaches, where to swim?`
  const desc = lang === 'es'
    ? `¿Dónde bañarse en ${region.name} hoy (${fmtLongDate('es')})? ${n} playas limpias por satélite Copernicus, alternativas cercanas, pronóstico 7 días.`
    : `Where to swim in ${region.name} today (${fmtLongDate('en')})? ${n} clean beaches by Copernicus satellite, nearby alternatives, 7-day forecast.`
  const html = renderTodayPage({
    lang, domain: region.domain,
    siteName: lang === 'es' ? `Sargazo ${region.name}` : `Sargassum ${region.name}`,
    slug, title, desc, model,
  })
  writePage(distDir, slug, html)
  const sm = appendToSitemap(path.join(distDir, 'sitemap.xml'), region.domain, slug)
  console.log(`   → page ${lang === 'es' ? 'hoy' : 'today'} (${region.id}) : /${slug}/ (${n} propres${sm ? ' +sitemap' : ''})`)
}

/**
 * Slug de la page « today » d'une région : natif seo-content si présent,
 * sinon le slug généré ici (/aujourdhui/ core, /today/ EN, /hoy/ ES).
 * Utilisé par verdict-du-jour.cjs pour lier la bonne URL (jamais de 404).
 */
function todaySlugFor(region) {
  if (!region || region.id === 'mq' || region.id === 'gp') return { slug: 'aujourdhui', lang: 'fr' }
  try {
    const RL = require('./region-langs.cjs')
    for (const l of RL.emittedLangs(region)) {
      const c = loadJSON(RL.seoContentPath(region.id, l, l === RL.normLang(region.primaryLang)), null)
      if (c && c.pages && c.pages.today && c.pages.today.slug) {
        const prefix = RL.langPrefix(region, l)
        return { slug: (prefix ? prefix.slice(1) + '/' : '') + c.pages.today.slug, lang: l }
      }
    }
  } catch {}
  const lang = region.primaryLang === 'es' ? 'es' : 'en'
  return { slug: lang === 'es' ? 'hoy' : 'today', lang }
}

module.exports = { generateTodayPages, todaySlugFor }
