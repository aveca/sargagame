/**
 * region-seo-pages.cjs — Générateur de pages SEO des NOUVELLES régions (EN/ES).
 * Appelé par le plugin seo-pages de vite.config.js (closeBundle) quand
 * IS_NEW_REGION. Ne touche à RIEN du chemin MQ/GP.
 *
 * Stratégie (audit SERP 2026-06-10) : personne sur ces marchés ne combine carte
 * live + donnée par plage + prévision 7j. Pages générées à CHAQUE build (4×/j en
 * CI) → fraîcheur réelle dans les titles/dates, l'arme que les concurrents
 * statiques ne peuvent pas suivre.
 *
 * Entrées :
 *   regions/seo-content/<id>.json  (copy EN/ES : faq, pages, beachBlurbs, resortPageTpl)
 *   regions/resorts/<id>.json      (long-tail hôtels → plage la plus proche)
 *   public/api/copernicus/<id>/sargassum.json (scores/statuts/forecast du jour)
 *   public/api/copernicus/forecast-accuracy.json (backtests réels → méthodologie)
 *   public/data/beaches-images.json (photos gplace)
 *
 * Sorties dans dist/ : <hub-pages>/, beaches|playas/<slug>/, resorts|hoteles/<slug>/,
 * sitemap.xml, patch homepage (FAQPage JSON-LD + réseau inter-sites en noscript).
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
const slugify = n => n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const STATUS_WORD = {
  en: { clean: 'Clean', moderate: 'Moderate', avoid: 'Avoid' },
  // Accord féminin avec "playa" (Limpia/Moderada) — aligné avec T.es.moderate de l'app.
  es: { clean: 'Limpia', moderate: 'Moderada', avoid: 'Evitar' },
}
const T = {
  en: {
    beachesDir: 'beaches', resortsDir: 'resorts',
    updated: d => `Updated ${d} from Copernicus satellite data — refreshed 4× per day.`,
    score: 'Beach Score', forecast7: '7-day forecast', status: 'Status today',
    viewMap: 'View the live map', allBeaches: 'All beaches', nearby: 'Nearby beaches',
    resortsAt: 'Resorts on this beach', beachOf: r => `The beach at ${r}`,
    network: 'Sargassum network', home: 'Live map',
    methodTitle: r => `Our Methodology & Forecast Accuracy — ${r} Sargassum Data`,
    methodH1: 'Methodology & measured forecast accuracy',
    methodDesc: r => `How the ${r} sargassum map works: Copernicus/NOAA AFAI satellite data 4×/day, per-beach sampling, and a 7-day forecast with published backtest accuracy.`,
    days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    daysFull: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    // Fallback FAQPage par plage pour les régions sans content.beachFaq —
    // mêmes tokens que le contrat de regions/seo-content/puntacana.json.
    beachFaq: {
      questions: [
        { q: 'Is there sargassum at {beach} today?', a: 'As of {today}, {beach} reads "{status}" on the latest satellite pass, with a Beach Score of {score}/100. The status is re-checked four times a day from Copernicus/NOAA AFAI imagery sampled directly offshore of this beach — open the live map for the exact update time and a confidence level.' },
        { q: 'When is the next sargassum arrival expected at {beach}?', a: '{nextArrival} The full 7-day outlook for {beach}: {forecastLine}. Days 1–3 are the most reliable; days 4–7 show the trend. The forecast is recalculated with every satellite refresh, four times a day.' },
      ],
      nextArrivalRisk: 'The next landing risk at {beach} is {day} ({date}), based on sargassum mats currently tracked offshore.',
      nextArrivalNone: 'No significant sargassum arrival is forecast at {beach} over the next 7 days.',
    },
  },
  es: {
    beachesDir: 'playas', resortsDir: 'hoteles',
    updated: d => `Actualizado el ${d} con datos satelitales Copernicus — 4 veces al día.`,
    score: 'Beach Score', forecast7: 'Pronóstico de 7 días', status: 'Estado hoy',
    viewMap: 'Ver el mapa en vivo', allBeaches: 'Todas las playas', nearby: 'Playas cercanas',
    resortsAt: 'Hoteles en esta playa', beachOf: r => `La playa de ${r}`,
    network: 'Red sargazo', home: 'Mapa en vivo',
    methodTitle: r => `Metodología y precisión del pronóstico — Datos de sargazo ${r}`,
    methodH1: 'Metodología y precisión medida del pronóstico',
    methodDesc: r => `Cómo funciona el mapa de sargazo de ${r}: datos satelitales AFAI Copernicus/NOAA 4 veces al día, muestreo por playa y pronóstico de 7 días con precisión publicada.`,
    days: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
    daysFull: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
    beachFaq: {
      questions: [
        { q: '¿Hay sargazo en {beach} hoy?', a: 'Hoy, {today}, {beach} está "{status}" según el último pase satelital, con un Beach Score de {score}/100. El estado se verifica cuatro veces al día con imágenes AFAI de Copernicus/NOAA muestreadas directamente frente a esta playa — abre el mapa en vivo para ver la hora exacta de actualización y el nivel de confianza.' },
        { q: '¿Cuándo se espera la próxima llegada de sargazo a {beach}?', a: '{nextArrival} El pronóstico completo de 7 días para {beach}: {forecastLine}. Los días 1–3 son los más fiables; los días 4–7 muestran la tendencia. El pronóstico se recalcula con cada actualización satelital, cuatro veces al día.' },
      ],
      nextArrivalRisk: 'El próximo riesgo de recale en {beach} es el {day} ({date}), según los bancos de sargazo detectados mar adentro.',
      nextArrivalNone: 'No se pronostica ninguna llegada significativa de sargazo a {beach} en los próximos 7 días.',
    },
  },
}

// Noms localisés par langue de site (ES : "Martinica · Guadalupe · … y …").
const NETWORK = [
  { name: { en: 'Martinique', es: 'Martinica' }, url: 'https://sargasses-martinique.com/' },
  { name: { en: 'Guadeloupe', es: 'Guadalupe' }, url: 'https://sargasses-guadeloupe.com/' },
  { name: { en: 'Punta Cana', es: 'Punta Cana' }, url: 'https://sargassumpuntacana.com/' },
  { name: { en: 'Cancún & Riviera Maya', es: 'Cancún y Riviera Maya' }, url: 'https://sargassumcancun.com/' },
  { name: { en: 'Miami & Florida', es: 'Miami y Florida' }, url: 'https://sargassummiami.com/' },
]

function loadJSON(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { return fallback }
}

function networkFooter(region, t) {
  const lang = region.primaryLang === 'es' ? 'es' : 'en'
  const links = NETWORK.filter(n => !n.url.includes(region.domain))
    .map(n => `<a href="${n.url}" rel="noopener">${esc(n.name[lang] || n.name.en)}</a>`).join(' · ')
  return `<p><strong>${t.network}:</strong> ${links}</p>`
}

/** Page shell : repart de l'index buildé, remplace head + noscript + JSON-LD. */
function pageShell(tpl, { title, desc, pathname, domain, lang, noscript, jsonLd }) {
  const canonical = `https://${domain}${pathname}`
  let html = tpl
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/(<meta name="description" content=)"[^"]*"/, `$1"${esc(desc)}"`)
    .replace(/(<link rel="canonical" href=)"[^"]*"/, `$1"${canonical}"`)
    .replace(/(<meta property="og:title" content=)"[^"]*"/, `$1"${esc(title)}"`)
    .replace(/(<meta property="og:description" content=)"[^"]*"/, `$1"${esc(desc)}"`)
    .replace(/(<meta property="og:url" content=)"[^"]*"/, `$1"${canonical}"`)
    .replace(/(<meta name="twitter:title" content=)"[^"]*"/, `$1"${esc(title)}"`)
    .replace(/(<meta name="twitter:description" content=)"[^"]*"/, `$1"${esc(desc)}"`)
    // hreflang de la home → self-canonical de la sous-page
    .replace(/<link rel="alternate" hreflang="[^"]*" href="[^"]*" \/>\s*/g, '')
    // JSON-LD de la home retirés, remplacés par ceux de la page
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '')
  // noscript racine → noscript de la page
  html = html.replace(/<noscript>\s*<h1>[\s\S]*?<\/noscript>/, '')
  const ld = (jsonLd || []).map(o => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join('\n')
  // Toute sous-page DOIT porter un hreflang self + x-default (sinon Google n'a
  // aucun signal de langue stable). Les pages home régionales ont déjà leur
  // cluster ; ici on rétablit au minimum self+x-default retirés au strip L113
  // (audit SEO multilang 13/06 : 55/56 sous-pages USD partaient sans hreflang).
  const selfAlt = `<link rel="alternate" hreflang="${lang}" href="${canonical}" />\n<link rel="alternate" hreflang="x-default" href="${canonical}" />`
  html = html.replace('</head>', `${selfAlt}\n${ld}\n</head>`)
  html = html.replace('<div id="root">', `<noscript>${noscript}</noscript>\n<div id="root">`)
  return html
}

function writePage(outDir, urlPath, html) {
  const dir = path.join(outDir, ...urlPath.split('/').filter(Boolean))
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf-8')
}

// Coupe au dernier espace ≤ max — jamais en plein mot ni avec un '&'/tiret
// pendouillant (audit 2026-06-10 : titles resorts coupés "…Live Beach St").
function smartTrim(s, max) {
  if (!s || s.length <= max) return s
  let cut = s.slice(0, max + 1)
  const sp = cut.lastIndexOf(' ')
  cut = sp > max * 0.55 ? cut.slice(0, sp) : cut.slice(0, max)
  // Parenthèse ouvrante orpheline après la coupe ("… (Juanillo") → on retire
  // tout le segment parenthésé incomplet AVANT le strip de ponctuation finale.
  cut = cut.replace(/\s*\([^)]*$/, '')
  return cut.replace(/[\s—–·,;:&-]+$/, '')
}

// Meta description : coupe propre + ellipse si dépassement.
function trimDesc(s, max = 160) {
  if (!s || s.length <= max) return s
  return smartTrim(s, max - 1) + '…'
}

function breadcrumb(domain, items) {
  return {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: `https://${domain}${it.path}` })),
  }
}

function fmtDate(lang, d = new Date()) {
  return d.toLocaleDateString(lang === 'es' ? 'es-MX' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

function forecastLine(weekly, beachId, lang) {
  const fc = weekly?.[beachId]?.forecast
  if (!fc) return ''
  const t = T[lang]
  return fc.slice(0, 7).map(f => {
    const d = new Date(f.date + 'T12:00:00Z')
    const day = t.days[d.getUTCDay()]
    return `${day}: ${(STATUS_WORD[lang][f.status] || f.status)}`
  }).join(' · ')
}

// ── B2B RESORT BRIEF — page HTML STANDALONE (sans React) par hôtel : l'outlook
// 7j de SA plage, propre et ENVOYABLE à un duty manager + capture d'intention
// (mailto). noindex (actif commercial, pas SEO). Le lead-magnet du pilote B2B
// (« briefs gratuits à 5-10 hôtels » → 1 contrat = 20-60× un abo consumer).
const _BRIEF_T = {
  en: { brief: 'Sargassum brief', beachOf: 'Beach', today: 'Today', week: '7-day outlook', clean: 'Clean', moderate: 'Moderate', avoid: 'Avoid',
    cleanDays: n => `${n} clean beach day${n === 1 ? '' : 's'} expected this week.`,
    guestClean: 'Good week for the beach — share it with your guests.',
    guestWatch: 'Mixed week — point guests to the clear days above.',
    guestAvoid: 'Sargassum expected — keep a backup activity ready for affected days.',
    cta: 'Hotel team? Get this brief in your inbox every morning',
    ctaSub: 'Free daily sargassum brief for your beach — reply and we set it up.',
    foot: 'Independent Copernicus / NOAA satellite data · refreshed 4× a day',
    cleaner: n => `↪ Cleaner right now: ${n}`, cleanerNote: 'A good backup to point your guests to today.' },
  es: { brief: 'Boletín de sargazo', beachOf: 'Playa', today: 'Hoy', week: 'Pronóstico 7 días', clean: 'Limpia', moderate: 'Moderada', avoid: 'Evitar',
    cleanDays: n => `${n} día${n === 1 ? '' : 's'} de playa limpia esta semana.`,
    guestClean: 'Buena semana de playa — compártelo con tus huéspedes.',
    guestWatch: 'Semana mixta — orienta a tus huéspedes a los días limpios.',
    guestAvoid: 'Se espera sargazo — ten una actividad alternativa lista.',
    cta: '¿Equipo del hotel? Recibe este boletín cada mañana',
    ctaSub: 'Boletín diario de sargazo gratis para tu playa — responde y lo activamos.',
    foot: 'Datos satelitales independientes Copernicus / NOAA · 4 veces al día',
    cleaner: n => `↪ Más limpia ahora: ${n}`, cleanerNote: 'Un buen plan B para tus huéspedes hoy.' },
}
function buildResortBrief(region, r, b, data, lang, today, domain, beaches) {
  const L = _BRIEF_T[lang] || _BRIEF_T.en
  const C = { clean: '#16A34A', moderate: '#D97706', avoid: '#DC2626' }
  const W = { clean: L.clean, moderate: L.moderate, avoid: L.avoid }
  const days = (((data.weekly || {})[b.id] || {}).forecast || []).slice(0, 7)
  const cleanDays = days.filter(d => d.status === 'clean').length
  const todayStatus = b.lv.status || (days[0] && days[0].status) || 'clean'
  const guest = todayStatus === 'avoid' ? L.guestAvoid : (cleanDays >= 5 ? L.guestClean : L.guestWatch)
  // Plage de repli PROPRE la plus proche — la vraie valeur duty-manager : rediriger
  // les clients quand la plage de l'hôtel n'est pas clean aujourd'hui.
  let altHtml = ''
  if (todayStatus !== 'clean' && Array.isArray(beaches) && b.lat != null) {
    const km = (la1, lo1, la2, lo2) => { const R = 6371, toR = x => x * Math.PI / 180, dLa = toR(la2 - la1), dLo = toR(lo2 - lo1), a = Math.sin(dLa / 2) ** 2 + Math.cos(toR(la1)) * Math.cos(toR(la2)) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(a)) }
    const alt = beaches.filter(x => x.id !== b.id && x.lv && x.lv.status === 'clean' && x.lat != null)
      .map(x => ({ x, d: km(b.lat, b.lng, x.lat, x.lng) })).sort((a, c) => a.d - c.d)[0]
    if (alt) altHtml = `<div class="tip" style="background:#E8F6EC;border-color:#9FD9B0">${L.cleaner(esc(alt.x.name))}${alt.d ? ' · ~' + Math.round(alt.d) + ' km' : ''}<br><span style="color:#3a6b4a">${esc(L.cleanerNote)}</span></div>`
  }
  const cells = days.map(d => {
    const dn = T[lang].days[new Date(d.date + 'T12:00:00Z').getUTCDay()]
    const col = C[d.status] || '#999'
    return `<div style="flex:1;min-width:48px;text-align:center"><div style="font-size:11px;color:#6b6b66;font-weight:600">${dn}</div><div style="width:22px;height:22px;border-radius:50%;background:${col};margin:6px auto 4px"></div><div style="font-size:10px;color:${col};font-weight:700">${W[d.status] || d.status}</div></div>`
  }).join('')
  const mailto = `mailto:${(region.emails && region.emails.support) || 'hotels@' + domain}?subject=${encodeURIComponent('Daily sargassum brief — ' + r.name)}&body=${encodeURIComponent('Hi, we run ' + r.name + ' and would like the free daily sargassum brief for ' + b.name + '.')}`
  const scoreTxt = b.lv.score != null ? ` · ${b.lv.score}/100` : ''
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,follow">
<title>${esc(r.name)} — ${L.brief}</title>
<meta property="og:title" content="${esc(r.name)} — ${esc(L.brief)}"><meta property="og:description" content="${esc(b.name)} · ${esc(W[todayStatus] || todayStatus)} · ${esc(L.foot)}"><meta property="og:image" content="https://${domain}/og-image.png"><meta property="og:type" content="website"><meta name="twitter:card" content="summary_large_image">
<style>*{box-sizing:border-box;margin:0}body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#F7F5EF;color:#15110d;line-height:1.5;padding:16px 0}.wrap{max-width:560px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,.08)}.hd{background:linear-gradient(135deg,#0B2230,#155A5A 45%,#C97E3A 85%,#F2B05E);color:#fff;padding:26px 22px}.hd .k{font-size:11px;letter-spacing:.12em;text-transform:uppercase;opacity:.85}.hd h1{font-size:24px;margin:6px 0 2px;line-height:1.15}.hd .b{font-size:13px;opacity:.92}.bd{padding:22px}.pill{display:inline-block;padding:6px 14px;border-radius:999px;color:#fff;font-weight:700;font-size:14px}.row{display:flex;gap:6px;margin:14px 0}.tip{background:#FAF3E2;border:1px solid #E6D8B0;border-radius:12px;padding:12px 14px;font-size:14px;margin:14px 0}.cta{display:block;background:linear-gradient(135deg,#0B2230,#155A5A);color:#fff;text-decoration:none;border-radius:14px;padding:16px 18px;margin:18px 0 6px}.cta b{font-size:15px}.cta span{display:block;font-size:12.5px;opacity:.85;margin-top:3px}.ft{font-size:11px;color:#8a857c;padding:14px 22px 20px}</style></head>
<body><div class="wrap">
<div class="hd"><div class="k">${esc(region.name)} · ${L.brief}</div><h1>${esc(r.name)}</h1><div class="b">${L.beachOf}: ${esc(b.name)}${r.area ? ' · ' + esc(r.area) : ''}</div></div>
<div class="bd">
<div><span class="pill" style="background:${C[todayStatus] || '#999'}">${L.today}: ${W[todayStatus] || todayStatus}${scoreTxt}</span></div>
<h2 style="font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:#6b6b66;margin:18px 0 0;font-weight:700">${L.week}</h2>
<div class="row">${cells}</div>
<div class="tip">${L.cleanDays(cleanDays)} ${guest}</div>${altHtml}
<a class="cta" href="${mailto}"><b>${L.cta}</b><span>${L.ctaSub}</span></a>
</div>
<div class="ft">${L.foot} · ${esc(today)} · ${esc(domain)}</div>
</div></body></html>`
}

// Annuaire B2B : page /resorts/ listant TOUS les hôtels d'une région + statut de
// leur plage + lien brief. Asset de prospection (« état sargasses de tous les
// hôtels de Bávaro ») ET hub SEO indexable (maille les pages resort).
function buildResortDirectory(region, resorts, beaches, data, lang, t, today, domain) {
  const L = _BRIEF_T[lang] || _BRIEF_T.en
  const C = { clean: '#16A34A', moderate: '#D97706', avoid: '#DC2626' }
  const W = { clean: L.clean, moderate: L.moderate, avoid: L.avoid }
  const D = {
    en: { h: 'resorts — sargassum status', sub: n => `Live beach status for ${n} resorts, refreshed 4× a day from satellite. Tap a resort for its daily brief.`, brief: 'Daily brief', cta: 'Hotel team? Get the daily brief for your property', map: 'Live map', title: r => `${r} Resorts — Sargassum Status Today (All Hotels)`, desc: r => `Live sargassum status for every resort in ${r}, beach by beach, updated 4× a day from satellite.` },
    es: { h: 'hoteles — estado del sargazo', sub: n => `Estado en vivo de ${n} hoteles, 4 veces al día por satélite. Toca un hotel para su boletín diario.`, brief: 'Boletín diario', cta: '¿Equipo del hotel? Recibe el boletín diario de tu propiedad', map: 'Mapa en vivo', title: r => `Hoteles de ${r} — Estado del Sargazo Hoy`, desc: r => `Estado del sargazo en vivo para cada hotel de ${r}, playa por playa, 4 veces al día.` },
  }[lang] || null
  const T2 = D || { h: 'resorts', sub: () => '', brief: 'brief', cta: '', map: 'map', title: r => r, desc: r => r }
  const byId = {}; for (const x of beaches) byId[x.id] = x
  const groups = {}; for (const r of resorts) { const a = r.area || region.name; (groups[a] = groups[a] || []).push(r) }
  const sections = Object.keys(groups).sort().map(area => {
    const items = groups[area].map(r => {
      const b = byId[r.beachId]; if (!b) return ''
      const st = (b.lv && b.lv.status) || 'clean'
      return `<li><span class="d" style="background:${C[st] || '#999'}"></span><span class="n"><b>${esc(r.name)}</b><br><small>${esc(b.name)} · ${W[st] || st}</small></span><a href="/${t.resortsDir}/${r.slug}/brief/">${esc(T2.brief)} →</a></li>`
    }).join('')
    return `<h2>${esc(area)}</h2><ul>${items}</ul>`
  }).join('')
  const mailto = `mailto:${(region.emails && region.emails.support) || 'hotels@' + domain}?subject=${encodeURIComponent('Daily sargassum briefs — ' + region.name)}`
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(T2.title(region.name))}</title><meta name="description" content="${esc(T2.desc(region.name))}"><link rel="canonical" href="https://${domain}/${t.resortsDir}/">
<meta property="og:title" content="${esc(T2.title(region.name))}"><meta property="og:description" content="${esc(T2.desc(region.name))}"><meta property="og:image" content="https://${domain}/og-image.png"><meta property="og:type" content="website"><meta name="twitter:card" content="summary_large_image">
<style>*{box-sizing:border-box;margin:0}body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#F7F5EF;color:#15110d;line-height:1.5;padding:16px 0}.wrap{max-width:620px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,.08)}.hd{background:linear-gradient(135deg,#0B2230,#155A5A 45%,#C97E3A 85%,#F2B05E);color:#fff;padding:24px 22px}.hd h1{font-size:22px;line-height:1.2}.hd p{font-size:13px;opacity:.92;margin-top:6px}.bd{padding:14px 22px}h2{font-size:13px;letter-spacing:.03em;text-transform:uppercase;color:#6b6b66;margin:18px 0 4px}ul{list-style:none}li{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid #eee}.d{width:14px;height:14px;border-radius:50%;flex:none}.n{flex:1}.n small{font-size:12px;color:#7a756c}li a{font-size:12.5px;color:#155A5A;font-weight:700;white-space:nowrap;text-decoration:none}.cta{display:block;background:linear-gradient(135deg,#0B2230,#155A5A);color:#fff;text-decoration:none;border-radius:14px;padding:15px 18px;margin:20px 0 4px;font-weight:700;font-size:14.5px}.ft{font-size:11px;color:#8a857c;padding:8px 22px 20px}.ft a{color:#155A5A}</style></head>
<body><div class="wrap">
<div class="hd"><h1>${esc(region.name)} ${esc(T2.h)}</h1><p>${esc(T2.sub(resorts.length))} · ${esc(today)}</p></div>
<div class="bd">${sections}
<a class="cta" href="${mailto}">${esc(T2.cta)} →</a></div>
<div class="ft">${esc(L.foot)} · <a href="https://${domain}/">${esc(T2.map)}</a> · ${esc(domain)}</div>
</div></body></html>`
}

function generateRegionSeoPages(region, distDir) {
  const lang = region.primaryLang === 'es' ? 'es' : 'en'
  const t = T[lang]
  const domain = region.domain
  const content = loadJSON(path.join(ROOT, 'regions', 'seo-content', `${region.id}.json`), null)
  if (!content) { console.warn(`   ⚠ seo-pages région: pas de regions/seo-content/${region.id}.json — pages non générées`); return }
  const resorts = loadJSON(path.join(ROOT, 'regions', 'resorts', `${region.id}.json`), [])
  const data = loadJSON(path.join(ROOT, 'public', 'api', 'copernicus', region.id, 'sargassum.json'), { levels: [], weekly: {} })
  // Précision réelle : backtest-results.json (régénéré CHAQUE JOUR par
  // backtest-forecast.cjs avant les builds) — PLUS l'ancien forecast-accuracy.json
  // qui était figé au 2026-04-10 (audit 2026-06-12 : les pages méthodologie
  // publiaient « 86 % » d'avril comme du présent). Adapté au format horizons
  // attendu plus bas ; fallback sur l'ancien fichier si le backtest manque.
  const _bt = loadJSON(path.join(ROOT, 'scripts', 'automation', 'data', 'backtest-results.json'), null)
  const accuracy = (_bt && _bt.byHorizon && _bt.byHorizon.day1) ? {
    computedAt: _bt.computed || null,
    horizons: {
      'J+1': { statusMatchPct: _bt.byHorizon.day1.statusHitRate, meanAbsErr: _bt.byHorizon.day1.afaiMAE },
      'J+3': _bt.byHorizon.day3 ? { statusMatchPct: _bt.byHorizon.day3.statusHitRate, meanAbsErr: _bt.byHorizon.day3.afaiMAE } : undefined,
    },
  } : loadJSON(path.join(ROOT, 'public', 'api', 'copernicus', 'forecast-accuracy.json'), null)
  const photos = loadJSON(path.join(ROOT, 'public', 'data', 'beaches-images.json'), {})
  const tpl = fs.readFileSync(path.join(distDir, 'index.html'), 'utf-8')
  const today = fmtDate(lang)
  // Date courte pour les titles (jamais coupée : on trimme le reste AVANT de l'appender)
  const dateShort = new Date().toLocaleDateString(lang === 'es' ? 'es-MX' : 'en-US', { month: 'short', day: 'numeric' })
  const isoToday = new Date().toISOString().slice(0, 10)
  const levelsById = Object.fromEntries((data.levels || []).map(l => [l.id, l]))
  const beaches = (region.beaches || []).map(b => ({ ...b, slug: slugify(b.name), lv: levelsById[b.id] || {} }))
  const byScore = [...beaches].sort((a, b2) => (b2.lv.score || 0) - (a.lv.score || 0))
  const urls = ['/']
  const sw = s => STATUS_WORD[lang][s] || s || '—'

  const beachLink = b => `<a href="/${t.beachesDir}/${b.slug}/">${esc(b.name)}</a>`
  const hubLinks = (except) => {
    const p = content.pages
    const items = [
      ['map', `/${p.map.slug}/`, p.map.h1], ['forecast', `/${p.forecast.slug}/`, p.forecast.h1],
      ['today', `/${p.today.slug}/`, p.today.h1], ['season', `/${p.season.slug}/`, p.season.h1],
    ]
    // Maillage des pages générées HORS seo-content (étaient orphelines = crawl-starved) :
    // best (transactionnel) + weekly (haute-intention) + méthodologie (E-E-A-T).
    if (region.routes && region.routes.best) items.push(['best', `/${region.routes.best}/`, lang === 'es' ? 'Mejores playas sin sargazo' : 'Best beaches without sargassum'])
    if (region.routes && region.routes.weekly) items.push(['weekly', `/${region.routes.weekly}/`, lang === 'es' ? 'Sargazo esta semana' : 'Sargassum this week'])
    items.push(['method', `/${lang === 'es' ? 'metodologia' : 'methodology'}/`, lang === 'es' ? 'Metodología y precisión' : 'Methodology & accuracy'])
    return `<p>${items.filter(([k]) => k !== except).map(([, href, label]) => `<a href="${href}">${esc(label)}</a>`).join(' · ')} · <a href="/">${t.home}</a></p>`
  }

  // ── 1. Pages hub (forecast, today, map, season) ──
  const hubs = []
  const p = content.pages

  // forecast — barres 7j par plage (texte) + méthode
  hubs.push({
    slug: p.forecast.slug, title: p.forecast.title, desc: p.forecast.desc,
    noscript: `<article><h1>${esc(p.forecast.h1)}</h1><p><em>${t.updated(today)}</em></p><p>${esc(p.forecast.intro)}</p>
<h2>${t.forecast7} — ${esc(region.name)}</h2>
<ul>${beaches.map(b => `<li><strong>${beachLink(b)}</strong> (${sw(b.lv.status)}, ${t.score} ${b.lv.score ?? '—'}/100) — ${forecastLine(data.weekly, b.id, lang)}</li>`).join('')}</ul>
<h2>${lang === 'es' ? 'Cómo funciona nuestro pronóstico' : 'How our forecast works'}</h2><p>${esc(p.forecast.method)}</p>
${hubLinks('forecast')}${networkFooter(region, t)}</article>`,
  })

  // today — liste ordonnée par score, format featured-snippet, datée.
  // Le titre de base est trimé AVANT l'append de la date courte → la date
  // n'est jamais coupée (l'ancien smartTrim(base+date) la tronquait).
  const todayBase = p.today.title.replace(/\s*[—-]\s*\d{4}.*$|$/, '')
  const todayTitle = `${smartTrim(todayBase, 70 - dateShort.length - 3)} (${dateShort})`
  hubs.push({
    slug: p.today.slug, title: todayTitle, desc: p.today.desc,
    noscript: `<article><h1>${esc(p.today.h1)} — ${today}</h1><p><em>${t.updated(today)}</em></p><p>${esc(p.today.intro)}</p>
<ol>${byScore.map(b => `<li><strong>${beachLink(b)}</strong> — ${sw(b.lv.status)}, ${t.score} ${b.lv.score ?? '—'}/100</li>`).join('')}</ol>
${hubLinks('today')}${networkFooter(region, t)}</article>`,
  })

  // map — landing carte live
  hubs.push({
    slug: p.map.slug, title: p.map.title, desc: p.map.desc,
    noscript: `<article><h1>${esc(p.map.h1)}</h1><p><em>${t.updated(today)}</em></p><p>${esc(p.map.intro)}</p>
<h2>${t.allBeaches}</h2><ul>${beaches.map(b => `<li>${beachLink(b)} — ${sw(b.lv.status)} (${b.lv.score ?? '—'}/100)</li>`).join('')}</ul>
${hubLinks('map')}${networkFooter(region, t)}</article>`,
  })

  // season — calendrier mois par mois
  hubs.push({
    slug: p.season.slug, title: p.season.title, desc: p.season.desc,
    noscript: `<article><h1>${esc(p.season.h1)}</h1><p>${t.updated(today)}</p>
${p.season.intro ? `<p>${esc(p.season.intro)}</p>` : ''}
${(p.season.months || []).map(m => `<h2>${esc(m.period)}</h2><p>${esc(m.text)}</p>`).join('')}
<h2>${lang === 'es' ? 'Consejos para reservar' : 'Booking tips'}</h2><p>${esc(p.season.tips || '')}</p>
${hubLinks('season')}${networkFooter(region, t)}</article>`,
  })

  // methodology — backtests réels (différenciateur : le #1 EN vend du Math.random)
  if (accuracy && accuracy.horizons) {
    const h1d = accuracy.horizons['J+1'] || {}
    const h3d = accuracy.horizons['J+3'] || {}
    const methodSlug = lang === 'es' ? 'metodologia' : 'methodology'
    const accLine = lang === 'es'
      ? `Precisión medida en nuestra red Caribe (backtests publicados): el estado a 1 día acierta el ${h1d.statusMatchPct ?? '—'}% de las veces (error medio AFAI ${h1d.meanAbsErr ?? '—'}), a 3 días el ${h3d.statusMatchPct ?? '—'}%. Nadie más en este mercado publica la precisión de su pronóstico.`
      : `Measured accuracy across our Caribbean network (published backtests): next-day status is correct ${h1d.statusMatchPct ?? '—'}% of the time (mean AFAI error ${h1d.meanAbsErr ?? '—'}), 3-day status ${h3d.statusMatchPct ?? '—'}%. Nobody else in this market publishes their forecast accuracy.`
    const body = lang === 'es'
      ? `<p>Muestreamos el índice AFAI (algas flotantes) de los satélites Copernicus/NOAA 4 veces al día, píxel por píxel frente a cada playa — no un promedio regional. Una corrección diaria ponderada y una memoria de playa (vida media de varios días) convierten la señal satelital en el estado que ves en el mapa. El pronóstico de 7 días combina persistencia, viento y detección de bancos en el mar.</p><p>Nuestros datos nunca se editan a mano, nunca se filtran por hoteles y nunca se borran. Fuentes: Copernicus Marine, NOAA ERDDAP (AFAI), Open-Meteo.</p>`
      : `<p>We sample the AFAI (floating algae) index from Copernicus/NOAA satellites 4 times a day, pixel by pixel in front of each beach — not a regional average. A weighted daily correction and a beach memory (multi-day half-life) turn the satellite signal into the status you see on the map. The 7-day forecast combines persistence, wind and offshore sargassum-bank detection.</p><p>Our data is never hand-edited, never filtered for resorts, never deleted. Sources: Copernicus Marine, NOAA ERDDAP (AFAI), Open-Meteo.</p>`
    hubs.push({
      slug: methodSlug, title: smartTrim(t.methodTitle(region.name), 65), desc: t.methodDesc(region.name),
      noscript: `<article><h1>${t.methodH1}</h1><p><em>${t.updated(today)}</em></p>${body}<p><strong>${accLine}</strong></p>${hubLinks(null)}${networkFooter(region, t)}</article>`,
    })
  }

  // semáforo (ES uniquement — vocabulaire local réel, requête quotidienne presse)
  if (lang === 'es') {
    const sem = { clean: '🟢 Verde — sin sargazo', moderate: '🟡 Amarillo — recale moderado', avoid: '🔴 Rojo — recale abundante' }
    hubs.push({
      slug: 'semaforo-del-sargazo',
      title: smartTrim(`Semáforo del Sargazo HOY (${today}) — ${region.name}`, 68),
      desc: `Semáforo del sargazo actualizado 4 veces al día con datos satelitales: estado playa por playa en ${region.name}, pronóstico de 7 días y alertas. Independiente: nunca borrado, nunca filtrado.`,
      noscript: `<article><h1>Semáforo del sargazo — ${today}</h1><p><em>${t.updated(today)}</em></p>
<p>El semáforo independiente del sargazo: datos satelitales, no reportes editados. Estado de cada playa ahora mismo:</p>
<ul>${byScore.map(b => `<li>${sem[b.lv.status] || '⚪'} — ${beachLink(b)} (${b.lv.score ?? '—'}/100)</li>`).join('')}</ul>
${hubLinks(null)}${networkFooter(region, t)}</article>`,
    })
  }

  // press — page presse/média rendue depuis content.press (tokens résolus
  // depuis la donnée réelle, jamais inventés). Slug ajouté au sitemap via
  // urls (weekly par défaut). NE PAS enregistrer 'press' dans regions/*.json
  // routes (prepare-ftp.cjs skip les valeurs de routes des autres régions au
  // deploy — un slug identique sur les 3 régions USD ferait sauter le dossier).
  if (content.press && content.press.slug) {
    const pr = content.press
    const cleanToday = (data.levels || []).filter(l => l.status === 'clean').length
    const accJ1 = accuracy?.horizons?.['J+1']?.statusMatchPct
    const accJ3 = accuracy?.horizons?.['J+3']?.statusMatchPct
    const tok = s => String(s ?? '')
      .replace(/\{beachCount\}/g, beaches.length)
      .replace(/\{cleanToday\}/g, cleanToday)
      .replace(/\{updatedDate\}/g, today)
      .replace(/\{accuracyJ1Pct\}/g, accJ1 ?? '—')
      .replace(/\{accuracyJ3Pct\}/g, accJ3 ?? '—')
      .replace(/\{contact\}/g, pr.contact || region.emails?.support || '')
      .replace(/\{citation\}/g, pr.citation || '')
    hubs.push({
      slug: pr.slug, title: smartTrim(pr.title, 70), desc: trimDesc(pr.desc),
      noscript: `<article><h1>${esc(pr.h1)}</h1><p><em>${t.updated(today)}</em></p><p>${esc(tok(pr.intro))}</p>
${(pr.sections || []).map(s => `<h2>${esc(s.h2)}</h2><p>${esc(tok(s.text))}</p>`).join('')}
${hubLinks(null)}${networkFooter(region, t)}</article>`,
    })
  }

  // "Best beaches" — page HAUTE-INTENTION "meilleures plages sans sargasses
  // aujourd'hui", data-driven (clean d'abord, puis score). La route existe
  // (region.routes.best) mais n'était pas générée. Pré-voyage + sur place.
  if (region.routes && region.routes.best && byScore.length) {
    const rank = s => s === 'clean' ? 0 : s === 'moderate' ? 1 : 2
    const ranked = [...byScore].sort((a, b2) => (rank(a.lv.status) - rank(b2.lv.status)) || ((b2.lv.score || 0) - (a.lv.score || 0)))
    const cleanN = ranked.filter(x => x.lv.status === 'clean').length
    const bestTitle = smartTrim(lang === 'es'
      ? `Mejores playas sin sargazo en ${region.name} HOY (${dateShort})`
      : `Best Beaches Without Sargassum in ${region.name} Today (${dateShort})`, 68)
    const bestDesc = trimDesc(lang === 'es'
      ? `Las ${cleanN} playas más limpias de ${region.name} ahora mismo, ordenadas por estado satelital (4 veces al día). Beach Score y pronóstico por playa.`
      : `The ${cleanN} cleanest beaches in ${region.name} right now, ranked by live satellite status (updated 4× a day). Beach Score and forecast per beach.`)
    const bestH1 = lang === 'es' ? `Mejores playas sin sargazo en ${region.name} — ${today}` : `Best beaches without sargassum in ${region.name} — ${today}`
    const bestIntro = lang === 'es'
      ? 'Estas son las playas más limpias en este momento según el satélite — empieza por arriba. El estado se actualiza 4 veces al día.'
      : 'These are the cleanest beaches right now per satellite — start at the top. Status updates 4× a day.'
    hubs.push({
      slug: region.routes.best, title: bestTitle, desc: bestDesc,
      noscript: `<article><h1>${esc(bestH1)}</h1><p><em>${t.updated(today)}</em></p><p>${esc(bestIntro)}</p>
<ol>${ranked.map(x => `<li><strong>${beachLink(x)}</strong> — ${sw(x.lv.status)}, ${t.score} ${x.lv.score ?? '—'}/100${x.commune ? ' · ' + esc(x.commune) : ''}</li>`).join('')}</ol>
${hubLinks(null)}${networkFooter(region, t)}</article>`,
    })
  }

  // "This week" — page HAUTE-INTENTION "sargassum [dest] this week". La route
  // region.routes.weekly était DÉCLARÉE dans les 3 configs USD mais JAMAIS générée
  // → 404 en GSC ("unknown to Google"). 1 fonction transforme le 404 en page.
  if (region.routes && region.routes.weekly && byScore.length) {
    const wk = data.weekly || {}
    const withClean = byScore.map(x => { const fc = ((wk[x.id] || {}).forecast || []).slice(0, 7); return { x, clean: fc.filter(f => f.status === 'clean').length } }).sort((a, c) => c.clean - a.clean)
    const wkTitle = smartTrim(lang === 'es' ? `Sargazo en ${region.name} esta semana — pronóstico 7 días` : `Sargassum in ${region.name} This Week — 7-Day Outlook`, 68)
    const wkDesc = trimDesc(lang === 'es'
      ? `Pronóstico de sargazo 7 días playa por playa para ${region.name}, actualizado 4 veces al día por satélite. Los mejores días de playa de la semana.`
      : `7-day sargassum forecast beach by beach for ${region.name}, updated 4× a day from satellite — the best beach days this week.`)
    const wkH1 = lang === 'es' ? `Sargazo en ${region.name} esta semana — ${today}` : `Sargassum in ${region.name} this week — ${today}`
    const wkIntro = lang === 'es'
      ? 'El pronóstico de 7 días playa por playa, según el satélite. Empieza por las playas con más días limpios esta semana.'
      : 'The 7-day outlook beach by beach, from satellite. Start with the beaches that have the most clean days this week.'
    hubs.push({
      slug: region.routes.weekly, title: wkTitle, desc: wkDesc,
      noscript: `<article><h1>${esc(wkH1)}</h1><p><em>${t.updated(today)}</em></p><p>${esc(wkIntro)}</p>
<ul>${withClean.map(({ x, clean }) => `<li><strong>${beachLink(x)}</strong> — ${clean}/7 ${lang === 'es' ? 'días limpios' : 'clean days'} · ${forecastLine(data.weekly, x.id, lang)}</li>`).join('')}</ul>
${hubLinks('weekly')}${networkFooter(region, t)}</article>`,
    })
  }

  for (const h of hubs) {
    const pathname = `/${h.slug}/`
    writePage(distDir, pathname, pageShell(tpl, {
      title: h.title, desc: h.desc, pathname, domain, lang,
      noscript: h.noscript,
      jsonLd: [breadcrumb(domain, [{ name: t.home, path: '/' }, { name: h.title, path: pathname }])],
    }))
    urls.push(pathname)
  }

  // ── 2. Pages plages ──
  const resortsByBeach = {}
  for (const r of resorts) (resortsByBeach[r.beachId] = resortsByBeach[r.beachId] || []).push(r)
  for (const b of beaches) {
    const pathname = `/${t.beachesDir}/${b.slug}/`
    const blurb = (content.beachBlurbs || {})[b.id] || ''
    const nearby = beaches.filter(x => x.id !== b.id)
      .map(x => ({ x, d: (x.lat - b.lat) ** 2 + (x.lng - b.lng) ** 2 }))
      .sort((a, b2) => a.d - b2.d).slice(0, 4).map(({ x }) => x)
    const beachResorts = resortsByBeach[b.id] || []
    const photo = photos[b.id] ? `<img src="/beaches/${photos[b.id]}" alt="${esc(b.name)}" width="800" height="450" loading="lazy" />` : ''
    // freshTitles (flag region.seo) : title daté statut+date courte, nom trimé
    // AVANT l'append (UNE seule date par page). Fallback : template historique.
    let title
    if (region.seo && region.seo.freshTitles && b.lv.status) {
      const suffix = lang === 'es' ? ` HOY: ${sw(b.lv.status)} — ${dateShort}` : ` Sargassum Today: ${sw(b.lv.status)} — ${dateShort}`
      const prefix = lang === 'es' ? 'Sargazo en ' : ''
      title = prefix + smartTrim(b.name, 70 - prefix.length - suffix.length) + suffix
    } else {
      title = smartTrim(lang === 'es'
        ? `Sargazo en ${b.name} HOY — Estado en vivo y pronóstico 7 días`
        : `${b.name} Sargassum Today — Live Status & 7-Day Forecast`, 68)
    }
    const desc = trimDesc(lang === 'es'
      ? `¿Hay sargazo en ${b.name} hoy? Estado actualizado 4 veces al día por satélite, Beach Score ${b.lv.score ?? ''}/100 y pronóstico de 7 días. ${(b.commune || '')}, ${region.name}.`
      : `Is there sargassum at ${b.name} today? Satellite status updated 4× daily, Beach Score ${b.lv.score ?? ''}/100 and a 7-day forecast. ${(b.commune || '')}, ${region.name}.`)
    // FAQPage par plage — templates de content.beachFaq (contrat tokens dans
    // regions/seo-content/<id>.json), fallback T[lang].beachFaq. Tokens résolus
    // depuis la donnée LIVE uniquement ; pas de FAQPage si donnée absente.
    const bf = content.beachFaq || t.beachFaq
    let beachFaqLd = null
    let beachFaqHtml = ''
    if (bf && Array.isArray(bf.questions) && b.lv.status && b.lv.score != null) {
      const fLine = forecastLine(data.weekly, b.id, lang)
      const fc = (data.weekly?.[b.id]?.forecast || []).slice(1, 8)
      const hit = fc.find(f => f.status && f.status !== 'clean')
      let nextArrival = String(bf.nextArrivalNone || '')
      if (hit && hit.date) {
        const d = new Date(hit.date + 'T12:00:00Z')
        nextArrival = String(bf.nextArrivalRisk || '')
          .replace(/\{day\}/g, t.daysFull[d.getUTCDay()])
          .replace(/\{date\}/g, fmtDate(lang, d))
      }
      const tokB = s => String(s ?? '')
        .replace(/\{beach\}/g, b.name).replace(/\{status\}/g, sw(b.lv.status))
        .replace(/\{score\}/g, b.lv.score).replace(/\{today\}/g, today)
        .replace(/\{forecastLine\}/g, fLine).replace(/\{nextArrival\}/g, nextArrival)
      const qa = bf.questions.map(q => ({ q: tokB(q.q), a: tokB(q.a) }))
      beachFaqLd = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: qa.map(x => ({ '@type': 'Question', name: x.q, acceptedAnswer: { '@type': 'Answer', text: x.a } })) }
      beachFaqHtml = `<section><h2>FAQ</h2>${qa.map(x => `<h3>${esc(x.q)}</h3><p>${esc(x.a)}</p>`).join('')}</section>`
    }
    const noscript = `<article><h1>${esc(title)}</h1><p><em>${t.updated(today)}</em></p>${photo}
<p><strong>${t.status}: ${sw(b.lv.status)}</strong> · ${t.score} ${b.lv.score ?? '—'}/100</p>
<p>${esc(blurb)}</p>
<h2>${t.forecast7}</h2><p>${forecastLine(data.weekly, b.id, lang)}</p>
${beachResorts.length ? `<h2>${t.resortsAt}</h2><ul>${beachResorts.map(r => `<li><a href="/${t.resortsDir}/${r.slug}/">${esc(r.name)}</a></li>`).join('')}</ul>` : ''}
<h2>${t.nearby}</h2><ul>${nearby.map(n => `<li>${beachLink(n)} — ${sw(n.lv.status)}</li>`).join('')}</ul>
${beachFaqHtml}
${hubLinks(null)}${networkFooter(region, t)}</article>`
    writePage(distDir, pathname, pageShell(tpl, {
      title, desc, pathname, domain, lang, noscript,
      jsonLd: [
        breadcrumb(domain, [{ name: t.home, path: '/' }, { name: b.name, path: pathname }]),
        { '@context': 'https://schema.org', '@type': 'Beach', name: b.name, address: { '@type': 'PostalAddress', addressLocality: b.commune || region.name, addressCountry: region.countryCode || '' }, geo: { '@type': 'GeoCoordinates', latitude: b.lat, longitude: b.lng }, url: `https://${domain}${pathname}`, ...(photos[b.id] ? { image: `https://${domain}/beaches/${photos[b.id]}` } : {}) },
        // dateModified réel du pipeline (flag region.seo) — PAS de datePublished
        // en plus (published+updated ensemble = -22% CTR documenté).
        ...(region.seo && region.seo.dateModifiedFromPipeline && data.updatedAt
          ? [{ '@context': 'https://schema.org', '@type': 'WebPage', url: `https://${domain}${pathname}`, dateModified: data.updatedAt }] : []),
        ...(beachFaqLd ? [beachFaqLd] : []),
      ],
    }))
    urls.push(pathname)
  }

  // ── 3. Pages resorts (long-tail "sargassum at <resort>") ──
  for (const r of resorts) {
    const b = beaches.find(x => x.id === r.beachId)
    if (!b) continue
    const pathname = `/${t.resortsDir}/${r.slug}/`
    // Noms d'hôtels longs : templates de repli de plus en plus courts plutôt
    // qu'une coupe en plein mot (SERP "…Live Beach St" sur 35 pages).
    let title = (content.resortPageTpl?.titlePattern || (lang === 'es' ? 'Sargazo en {resort} HOY — estado y pronóstico' : 'Sargassum at {resort} Today — Live Status & Forecast')).replace('{resort}', r.name)
    if (title.length > 70) title = lang === 'es' ? `Sargazo en ${r.name} HOY — pronóstico` : `Sargassum at ${r.name} Today — Forecast`
    if (title.length > 70) title = lang === 'es' ? `Sargazo en ${r.name} HOY` : `${r.name} Sargassum Today`
    if (title.length > 70) title = smartTrim(title, 70)
    const intro = (content.resortPageTpl?.introPattern || '').replace(/\{resort\}/g, r.name).replace(/\{beach\}/g, b.name)
    // Même garde anti double-parenthésage que le noscript : certains noms de
    // plages contiennent déjà des parenthèses ("Juanillo Beach (Cap Cana)").
    const beachNameDesc = b.name.includes('(') ? `— ${b.name} —` : `(${b.name})`
    const desc = trimDesc(lang === 'es'
      ? `¿Hay sargazo en ${r.name} hoy? La playa del hotel ${beachNameDesc} está "${sw(b.lv.status)}" según el satélite de hoy. Score ${b.lv.score ?? ''}/100, pronóstico 7 días y alertas.`
      : `Is there sargassum at ${r.name} today? The resort beach ${beachNameDesc} reads "${sw(b.lv.status)}" on today's satellite pass. Score ${b.lv.score ?? ''}/100, 7-day forecast & alerts.`)
    // Garde anti double-parenthésage : si la zone contient déjà '(', ne pas
    // re-wrapper ("Cap Cana (Juanillo)" → "— Cap Cana (Juanillo)").
    const areaTxt = r.area || b.commune || ''
    const areaHtml = areaTxt ? (areaTxt.includes('(') ? ` — ${esc(areaTxt)}` : ` (${esc(areaTxt)})`) : ''
    const noscript = `<article><h1>${esc(title)}</h1><p><em>${t.updated(today)}</em></p>
<p>${esc(intro)}</p>
<p><strong>${t.beachOf(r.name)} — ${beachLink(b)}</strong>: ${sw(b.lv.status)} · ${t.score} ${b.lv.score ?? '—'}/100${areaHtml}</p>
<h2>${t.forecast7}</h2><p>${forecastLine(data.weekly, b.id, lang)}</p>
${hubLinks(null)}${networkFooter(region, t)}</article>`
    writePage(distDir, pathname, pageShell(tpl, {
      title, desc, pathname, domain, lang, noscript,
      jsonLd: [breadcrumb(domain, [{ name: t.home, path: '/' }, { name: b.name, path: `/${t.beachesDir}/${b.slug}/` }, { name: r.name, path: pathname }])],
    }))
    urls.push(pathname)
    // B2B brief standalone (lead-magnet envoyable, noindex, HORS sitemap)
    try { writePage(distDir, `${pathname}brief/`, buildResortBrief(region, r, b, data, lang, today, domain, beaches)) } catch (e) { /* brief best-effort */ }
  }
  // Annuaire B2B + hub SEO : 1 page /resorts/ listant tous les hôtels (statut + brief).
  if (resorts.length) {
    try { writePage(distDir, `/${t.resortsDir}/`, buildResortDirectory(region, resorts, beaches, data, lang, t, today, domain)); urls.push(`/${t.resortsDir}/`) } catch (e) { /* directory best-effort */ }
  }

  // ── 4. Patch homepage : FAQPage JSON-LD + réseau inter-sites + title override ──
  let home = fs.readFileSync(path.join(distDir, 'index.html'), 'utf-8')
  if (region.seo && region.seo.homeTitle) {
    home = home
      .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(region.seo.homeTitle)}</title>`)
      .replace(/(<meta property="og:title" content=)"[^"]*"/, `$1"${esc(region.seo.homeTitle)}"`)
      .replace(/(<meta name="twitter:title" content=)"[^"]*"/, `$1"${esc(region.seo.homeTitle)}"`)
    if (region.seo.homeDesc) home = home
      .replace(/(<meta name="description" content=)"[^"]*"/, `$1"${esc(region.seo.homeDesc)}"`)
      .replace(/(<meta property="og:description" content=)"[^"]*"/, `$1"${esc(region.seo.homeDesc)}"`)
  }
  if (Array.isArray(content.faq) && content.faq.length) {
    const faqLd = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: content.faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }
    const faqScript = `<script type="application/ld+json">${JSON.stringify(faqLd)}</script>`
    // Un FAQPage existe déjà dans le head (transformIndexHtml) → on le REMPLACE
    // (2 FAQPage sur une page = schema invalide pour Google).
    const existingFaq = home.match(/<script type="application\/ld\+json">[^<]*"@type":\s*"FAQPage"[\s\S]*?<\/script>/)
    home = existingFaq ? home.replace(existingFaq[0], faqScript) : home.replace('</head>', `${faqScript}\n</head>`)
    // FAQ + liens hubs + réseau dans le noscript racine (avant sa fermeture)
    const faqHtml = `<section><h2>FAQ</h2>${content.faq.map(f => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join('')}</section>
<nav>${hubLinks(null)}${networkFooter(region, t)}</nav>`
    home = home.includes('</noscript>') ? home.replace('</noscript>', `${faqHtml}</noscript>`) : home.replace('<div id="root">', `<noscript>${faqHtml}</noscript><div id="root">`)
  }
  fs.writeFileSync(path.join(distDir, 'index.html'), home, 'utf-8')

  // ── 5. Sitemap complet ──
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => {
    // Fraîcheur réelle : les fiches plage + hubs high-intent ont un title+statut
    // qui change 4×/j → daily + priority (USD était weekly sans priority).
    const hot = [p.today.slug, p.forecast.slug, region.routes && region.routes.best, region.routes && region.routes.weekly, 'semaforo-del-sargazo', 'metodologia', 'methodology'].filter(Boolean)
    const isBeach = u.includes(`/${t.beachesDir}/`)
    const isHot = hot.some(s => u.includes(s))
    const daily = u === '/' || isHot || isBeach
    const pr = u === '/' ? '1.0' : (u.includes(p.today.slug) || u.includes(p.forecast.slug) || (region.routes && (u.includes(region.routes.best || '\0') || u.includes(region.routes.weekly || '\0')))) ? '0.9' : isBeach ? '0.7' : '0.5'
    return `  <url><loc>https://${domain}${u}</loc><lastmod>${isoToday}</lastmod><changefreq>${daily ? 'daily' : 'weekly'}</changefreq><priority>${pr}</priority></url>`
  }).join('\n')}
</urlset>
`
  fs.writeFileSync(path.join(distDir, 'sitemap.xml'), sitemap, 'utf-8')
  console.log(`   → ${urls.length - 1} pages SEO générées (${region.id}: ${hubs.length} hubs, ${beaches.length} plages, ${resorts.length} resorts) + sitemap + FAQ schema`)
}

module.exports = { generateRegionSeoPages }
