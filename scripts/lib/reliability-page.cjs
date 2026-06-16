/**
 * reliability-page.cjs — Page « Fiabilité » auto-générée au build (5 domaines).
 * Appelée par le plugin seo-pages de vite.config.js (closeBundle) :
 *   - MQ/GP  : dist/fiabilite/ (canonical MQ) + dist/_gp/fiabilite/ (overlay GP,
 *              même mécanique que les éditoriaux — prepare-ftp stampe _gp/ en dernier).
 *   - Régions: dist/reliability/ (EN) ou dist/fiabilidad/ (ES) + ajout au
 *              sitemap.xml régional écrit par region-seo-pages.cjs.
 *
 * RÈGLE D'OR : aucun chiffre inventé. Tout vient de :
 *   scripts/automation/data/backtest-results.json   (précision réelle prévision vs observé)
 *   public/api/copernicus[/<region>]/sargassum.json (updatedAt, points de mesure)
 * Donnée absente → la section saute, on n'écrit RIEN à la place.
 *
 * Design aligné sur public/about/index.html (encre #0A1714, or #FFC72C, cards #10231E).
 */
const fs = require('fs')
const { icon: brandIcon } = require('./brand-icons.cjs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')

const loadJSON = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { return fb } }
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Noms lisibles des points de mesure du pipeline (ids du backtest = ids pipeline,
// pas les ids beaches-list). Source : scrape-copernicus.cjs / fetch-sargassum-live.cjs.
const PIPELINE_BEACHES = {
  'grande-anse': { name: "Grande Anse d'Arlet", island: 'mq' },
  'anse-mitan': { name: 'Anse Mitan', island: 'mq' },
  'anse-noire': { name: 'Anse Noire', island: 'mq' },
  'tartane': { name: 'Tartane', island: 'mq' },
  'anse-madame': { name: 'Anse Madame', island: 'mq' },
  'diamant': { name: 'Le Diamant', island: 'mq' },
  'pt-marin': { name: 'Pointe du Marin', island: 'mq' },
  'sainte-anne': { name: 'Sainte-Anne', island: 'mq' },
  'les-salines': { name: 'Les Salines', island: 'mq' },
  'vauclin': { name: 'Le Vauclin', island: 'mq' },
  'gp-grande-anse': { name: 'Grande Anse', island: 'gp' },
  'gp-malendure': { name: 'Malendure', island: 'gp' },
  'gp-sainte-anne': { name: 'Sainte-Anne', island: 'gp' },
  'gp-pt-chateaux': { name: 'Pointe des Châteaux', island: 'gp' },
  'gp-gosier': { name: 'Le Gosier', island: 'gp' },
  'gp-caravelle': { name: 'La Caravelle', island: 'gp' },
  'gp-bas-du-fort': { name: 'Bas du Fort', island: 'gp' },
  'gp-deshaies': { name: 'Deshaies', island: 'gp' },
  'gp-moule': { name: 'Le Moule', island: 'gp' },
  'gp-vieux-fort': { name: 'Vieux-Fort', island: 'gp' },
}

const LOCALES = { fr: 'fr-FR', en: 'en-US', es: 'es-MX' }
const ISLAND_LABEL = {
  fr: { mq: 'Martinique', gp: 'Guadeloupe' },
  en: { mq: 'Martinique', gp: 'Guadeloupe' },
  es: { mq: 'Martinica', gp: 'Guadalupe' },
}

const fmtInt = (lang, n) => Number(n).toLocaleString(LOCALES[lang])
const fmtNum = (lang, n) => Number(n).toLocaleString(LOCALES[lang], { maximumFractionDigits: 3 })
// FR : espace fine insécable avant % ; EN/ES : collé (usage app existant)
const fmtPct = (lang, n) => lang === 'fr' ? `${n} %` : `${n}%`
const fmtDay = (lang, iso, withYear) => {
  const d = new Date(iso + (iso.length === 10 ? 'T12:00:00Z' : ''))
  if (isNaN(d)) return iso
  return d.toLocaleDateString(LOCALES[lang], { day: 'numeric', month: 'long', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' })
}
const fmtDateTimeUTC = (lang, iso) => {
  const d = new Date(iso)
  if (isNaN(d)) return iso
  return d.toLocaleString(LOCALES[lang], { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC'
}

const I18N = {
  fr: {
    back: 'Retour à la carte',
    h1a: 'Nos prévisions,', h1b: 'vérifiées',
    lead: "Aucune promesse, des mesures : chaque jour, la prévision de la veille est comparée à ce que le satellite observe réellement. Voici la méthode — et les chiffres, y compris ceux qu'on rate.",
    l1: 'La méthode', h2m: 'Comment naît une prévision',
    m1t: 'Satellite Copernicus / NOAA, 4 passages par jour',
    m1s: "L'indice AFAI (algues flottantes) est échantillonné au large de chaque plage, pixel par pixel — jamais une moyenne régionale.",
    m2t: 'Un modèle de dérive, pas une boule de cristal',
    m2s: 'Persistance des échouages (demi-vie 3,5 jours), vent et bancs détectés au large : la prévision 7 jours est recalculée à chaque passage satellite.',
    m3t: 'Un backtest automatique, tous les jours',
    m3s: "Chaque prévision est archivée puis confrontée à l'observation satellite du jour J. Le calcul est automatique — personne ne retouche les chiffres.",
    m4t: "Quand la donnée manque, on n'affiche rien",
    m4s: "Pas de chiffre inventé : si une mesure n'existe pas, la section disparaît plutôt que de deviner.",
    l2: 'La précision, mesurée', h2p: 'Ce que valent nos prévisions',
    pIntro: (from, to, pairs, beaches) => `Du ${from} au ${to}, ${pairs} prévisions ont été confrontées à l'observation satellite sur ${beaches} plages.`,
    statJ1: 'statut correct à J+1', statJ3: 'statut correct à J+3', statAll: 'toutes échéances confondues',
    hitDef: mae => `Une prévision est « réussie » quand le statut annoncé (propre, modéré, à éviter) correspond au statut observé par satellite le jour venu. Erreur moyenne sur l'indice AFAI : ${mae}.`,
    thH: 'Échéance', thHit: 'Réussite', thN: 'Comparaisons', thConf: 'Confiance affichée',
    horizon: i => `J+${i}`,
    confNote: 'Le modèle publie aussi sa propre confiance : élevée à J+1, faible à J+6. Quand elle est basse, lisez la prévision comme une tendance, pas une certitude.',
    missT: "Ce qu'on rate",
    missIntro: (good, total) => `${good} plages sur ${total} dépassent 90 % de réussite. Les plus difficiles à prévoir — publiées quand même :`,
    missWhy: "Les plages exposées dont l'état oscille autour d'un seuil (propre / modéré) restent les plus dures à prévoir.",
    l3: 'Fraîcheur', h2f: 'La donnée que vous regardez',
    fUpd: 'Dernière mesure satellite',
    agoLt1: "il y a moins d'1 h", agoTpl: 'il y a {h} h',
    fPoints: n => `${n} points de mesure suivis · donnée revalidée 4 fois par jour · cette page est régénérée à chaque mise à jour.`,
    cta: 'Voir la carte en direct →',
    fdata: 'Données : Copernicus Marine & NOAA ERDDAP · backtest recalculé automatiquement',
    caribNote: null,
  },
  en: {
    back: 'Back to the map',
    h1a: 'Our forecasts,', h1b: 'verified',
    lead: 'No promises — measurements. Every day, yesterday’s forecast is compared with what the satellite actually observed. Here is the method, and the numbers — including the ones we miss.',
    l1: 'The method', h2m: 'How a forecast is made',
    m1t: 'Copernicus / NOAA satellite, 4 passes a day',
    m1s: 'The AFAI floating-algae index is sampled offshore of every beach, pixel by pixel — never a regional average.',
    m2t: 'A drift model, not a crystal ball',
    m2s: 'Beaching persistence (3.5-day half-life), wind and offshore mats: the 7-day forecast is recomputed at every satellite pass.',
    m3t: 'An automatic backtest, every single day',
    m3s: 'Every forecast is archived, then checked against the satellite observation on the target day. Fully automatic — nobody edits the numbers.',
    m4t: 'When data is missing, we show nothing',
    m4s: 'No invented figures: if a measurement does not exist, the section disappears rather than guessing.',
    l2: 'Accuracy, measured', h2p: 'How good are our forecasts',
    pIntro: (from, to, pairs, beaches) => `From ${from} to ${to}, ${pairs} forecasts were checked against satellite observations across ${beaches} beaches.`,
    statJ1: 'correct status 1 day ahead', statJ3: 'correct status 3 days ahead', statAll: 'across all horizons',
    hitDef: mae => `A forecast counts as a “hit” when the predicted status (clean, moderate, avoid) matches the status the satellite observed on the target day. Mean absolute error on the AFAI index: ${mae}.`,
    thH: 'Horizon', thHit: 'Hit rate', thN: 'Checks', thConf: 'Displayed confidence',
    horizon: i => `Day +${i}`,
    confNote: 'The model also publishes its own confidence: high at day +1, low at day +6. When it is low, read the forecast as a trend, not a certainty.',
    missT: 'What we miss',
    missIntro: (good, total) => `${good} of ${total} beaches score above 90%. The hardest ones to predict — published anyway:`,
    missWhy: 'Exposed beaches whose state hovers around a threshold (clean / moderate) remain the hardest to predict.',
    l3: 'Freshness', h2f: 'The data you are looking at',
    fUpd: 'Latest satellite measurement',
    agoLt1: 'less than 1 h ago', agoTpl: '{h} h ago',
    fPoints: n => `${n} monitored sampling points · data re-checked 4 times a day · this page is regenerated with every update.`,
    cta: 'See the live map →',
    fdata: 'Data: Copernicus Marine & NOAA ERDDAP · backtest recomputed automatically',
    caribNote: region => `Accuracy is measured on our longest-running network — 20 Caribbean beaches (Martinique & Guadeloupe), where the verification archive is deepest. The exact same model (pipeline v3) powers the ${region} forecasts.`,
  },
  es: {
    back: 'Volver al mapa',
    h1a: 'Nuestros pronósticos,', h1b: 'verificados',
    lead: 'Sin promesas — mediciones. Cada día, el pronóstico de ayer se compara con lo que el satélite observó realmente. Este es el método, y las cifras — incluidas las que fallamos.',
    l1: 'El método', h2m: 'Cómo se hace un pronóstico',
    m1t: 'Satélite Copernicus / NOAA, 4 pasadas al día',
    m1s: 'El índice AFAI (algas flotantes) se muestrea frente a cada playa, píxel por píxel — nunca un promedio regional.',
    m2t: 'Un modelo de deriva, no una bola de cristal',
    m2s: 'Persistencia de los recales (vida media de 3,5 días), viento y bancos detectados mar adentro: el pronóstico de 7 días se recalcula en cada pasada satelital.',
    m3t: 'Un backtest automático, todos los días',
    m3s: 'Cada pronóstico se archiva y luego se compara con la observación satelital del día previsto. Todo automático — nadie retoca las cifras.',
    m4t: 'Cuando falta el dato, no mostramos nada',
    m4s: 'Ninguna cifra inventada: si una medición no existe, la sección desaparece antes que adivinar.',
    l2: 'La precisión, medida', h2p: 'Cuánto valen nuestros pronósticos',
    pIntro: (from, to, pairs, beaches) => `Del ${from} al ${to}, ${pairs} pronósticos se compararon con la observación satelital en ${beaches} playas.`,
    statJ1: 'estado correcto a 1 día', statJ3: 'estado correcto a 3 días', statAll: 'todos los horizontes',
    hitDef: mae => `Un pronóstico es un «acierto» cuando el estado anunciado (limpia, moderada, evitar) coincide con el estado observado por el satélite el día previsto. Error medio en el índice AFAI: ${mae}.`,
    thH: 'Horizonte', thHit: 'Acierto', thN: 'Comparaciones', thConf: 'Confianza mostrada',
    horizon: i => `Día +${i}`,
    confNote: 'El modelo también publica su propia confianza: alta a 1 día, baja a 6 días. Cuando es baja, lee el pronóstico como una tendencia, no una certeza.',
    missT: 'Lo que fallamos',
    missIntro: (good, total) => `${good} de ${total} playas superan el 90% de acierto. Las más difíciles de predecir — publicadas igualmente:`,
    missWhy: 'Las playas expuestas cuyo estado oscila alrededor de un umbral (limpia / moderada) siguen siendo las más difíciles de predecir.',
    l3: 'Frescura', h2f: 'El dato que estás viendo',
    fUpd: 'Última medición satelital',
    agoLt1: 'hace menos de 1 h', agoTpl: 'hace {h} h',
    fPoints: n => `${n} puntos de medición monitoreados · dato verificado 4 veces al día · esta página se regenera con cada actualización.`,
    cta: 'Ver el mapa en vivo →',
    fdata: 'Datos: Copernicus Marine & NOAA ERDDAP · backtest recalculado automáticamente',
    caribNote: region => `La precisión se mide en nuestra red más antigua — 20 playas del Caribe (Martinica y Guadalupe), donde el archivo de verificación es más profundo. El mismo modelo exacto (pipeline v3) genera los pronósticos de ${region}.`,
  },
}

/** Lit le backtest réel ; null si rien d'exploitable (→ la section saute). */
function readBacktest() {
  const bt = loadJSON(path.join(ROOT, 'scripts', 'automation', 'data', 'backtest-results.json'), null)
  if (!bt || !bt.byHorizon || !bt.overall || typeof bt.overall.statusHitRate !== 'number' || !(bt.totalPairs > 0)) return null
  return bt
}

function beachLabel(lang, id) {
  const b = PIPELINE_BEACHES[id]
  if (!b) return id
  return `${b.name} (${ISLAND_LABEL[lang][b.island] || b.island})`
}

/** Section précision — uniquement depuis backtest-results.json, gardée champ par champ. */
function precisionSection(lang, bt, regionName) {
  if (!bt) return ''
  const t = I18N[lang]
  const j1 = bt.byHorizon.day1 && bt.byHorizon.day1.pairs > 0 ? bt.byHorizon.day1 : null
  const j3 = bt.byHorizon.day3 && bt.byHorizon.day3.pairs > 0 ? bt.byHorizon.day3 : null

  // Intro : période couverte + volume (gardé : dateRange peut manquer)
  let intro = ''
  if (bt.dateRange && bt.dateRange.archiveFrom && bt.dateRange.archiveTo) {
    const beachCount = Object.keys(bt.byBeach || {}).length
    if (beachCount > 0) {
      intro = `<p>${esc(t.pIntro(fmtDay(lang, bt.dateRange.archiveFrom), fmtDay(lang, bt.dateRange.archiveTo, true), fmtInt(lang, bt.totalPairs), beachCount))}</p>`
    }
  }

  // Note réseau Caraïbe (régions USD uniquement — le backtest est mesuré sur MQ+GP)
  const carib = t.caribNote && regionName ? `<p class="note">${esc(t.caribNote(regionName))}</p>` : ''

  // Stats clés J+1 / J+3 / global
  const stats = []
  if (j1) stats.push(`<div class="stat"><div class="n">${fmtPct(lang, j1.statusHitRate)}</div><div class="l">${esc(t.statJ1)}</div></div>`)
  if (j3) stats.push(`<div class="stat"><div class="n">${fmtPct(lang, j3.statusHitRate)}</div><div class="l">${esc(t.statJ3)}</div></div>`)
  stats.push(`<div class="stat"><div class="n">${fmtPct(lang, bt.overall.statusHitRate)}</div><div class="l">${esc(t.statAll)}</div></div>`)

  // Définition du hit + MAE (gardé)
  const hitDef = typeof bt.overall.afaiMAE === 'number'
    ? `<p class="note">${esc(t.hitDef(fmtNum(lang, bt.overall.afaiMAE)))}</p>` : ''

  // Tableau par échéance (day1..dayN présents et non vides)
  const rows = []
  for (let i = 1; i <= 7; i++) {
    const h = bt.byHorizon[`day${i}`]
    if (!h || !(h.pairs > 0) || typeof h.statusHitRate !== 'number') continue
    const conf = typeof h.avgConfidence === 'number' ? fmtPct(lang, h.avgConfidence) : '—'
    rows.push(`<tr><td>${esc(t.horizon(i))}</td><td><strong>${fmtPct(lang, h.statusHitRate)}</strong></td><td class="mut">${fmtInt(lang, h.pairs)}</td><td class="mut">${conf}</td></tr>`)
  }
  const table = rows.length ? `<div class="tablecard"><table>
<thead><tr><th>${esc(t.thH)}</th><th>${esc(t.thHit)}</th><th>${esc(t.thN)}</th><th>${esc(t.thConf)}</th></tr></thead>
<tbody>${rows.join('')}</tbody></table></div>
<p class="note">${esc(t.confNote)}</p>` : ''

  // « Ce qu'on rate » — pires plages réelles, publiées telles quelles
  let miss = ''
  const perBeach = Object.entries(bt.byBeach || {}).filter(([, v]) => typeof v.statusHitRate === 'number' && v.pairs > 0)
  if (perBeach.length >= 3) {
    const sorted = [...perBeach].sort((a, b) => a[1].statusHitRate - b[1].statusHitRate)
    const worst = sorted.slice(0, 3)
    const good = perBeach.filter(([, v]) => v.statusHitRate >= 90).length
    miss = `<div class="miss"><b>${esc(t.missT)}</b>
<p class="note" style="margin-top:0">${esc(t.missIntro(good, perBeach.length))}</p>
<ul>${worst.map(([id, v]) => `<li><strong>${esc(beachLabel(lang, id))}</strong> — ${fmtPct(lang, v.statusHitRate)}</li>`).join('')}</ul>
<p class="note">${esc(t.missWhy)}</p></div>`
  }

  // Lead HONNÊTE par régime (regimeReliability.note : « publier ÇA, jamais le global % seul,
  // qui masque que les alertes en saison calme sont bien moins fiables que les mer-propre »).
  // Le même chiffre alimente le badge in-app (vite __RELIABILITY__) → fil de preuve cohérent.
  const rr = bt.regimeReliability
  const regimeLead = rr && rr.headline && rr.headline[lang]
    ? `<p style="background:var(--card);border:1px solid var(--line);border-left:3px solid var(--gold);border-radius:14px;padding:14px 16px;color:#fff;font-size:15px;font-weight:600;line-height:1.5;margin-bottom:6px">${esc(rr.headline[lang])}</p>`
    : ''

  return `<section>
    <div class="lbl">${esc(t.l2)}</div>
    <h2>${esc(t.h2p)}</h2>
    ${regimeLead}
    ${intro}${carib}
    <div class="stats">${stats.join('')}</div>
    ${hitDef}
    ${table}
    ${miss}
  </section>`
}

/** Section fraîcheur — updatedAt du build + refresh client depuis /api/copernicus/sargassum.json. */
function freshnessSection(lang, data, slug) {
  if (!data || !data.updatedAt) return ''
  const t = I18N[lang]
  const points = Array.isArray(data.levels) && data.levels.length ? `<span>${esc(t.fPoints(data.levels.length))}</span>` : ''
  return `<section>
    <div class="lbl">${esc(t.l3)}</div>
    <h2>${esc(t.h2f)}</h2>
    <div class="fresh"><span class="dot"></span><div>
      <b>${esc(t.fUpd)}</b>
      <span><span id="f-ts" data-iso="${esc(data.updatedAt)}">${esc(fmtDateTimeUTC(lang, data.updatedAt))}</span> · <span id="f-rel"></span></span><br/>
      ${points}
    </div></div>
    <a class="cta" href="/?utm_source=${esc(slug)}">${esc(t.cta)}</a>
  </section>`
}

function renderPage({ lang, domain, siteName, slug, title, desc, data, bt, regionName, alternates }) {
  const t = I18N[lang]
  const canonical = `https://${domain}/${slug}/`
  // hreflang : régions bilingues — chaque variante de langue (/reliability/ EN,
  // /fiabilidad/ ES) déclare ses sœurs + x-default = la langue primaire. MQ/GP :
  // alternates absent → '' (page FR /fiabilite/ inchangée).
  const altTags = Array.isArray(alternates) && alternates.length
    ? '\n' + alternates.map(a => `<link rel="alternate" hreflang="${a.lang}" href="${a.href}"/>`).join('\n') +
        `\n<link rel="alternate" hreflang="x-default" href="${(alternates.find(a => a.xDefault) || alternates[0]).href}"/>`
    : ''
  const updatedISO = data && data.updatedAt ? data.updatedAt : new Date().toISOString()
  const ldPage = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'WebPage', name: title, description: desc,
    url: canonical, inLanguage: lang, dateModified: updatedISO,
    isPartOf: { '@type': 'WebSite', name: siteName, url: `https://${domain}/` },
  })
  const ldCrumb = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: siteName, item: `https://${domain}/` },
      { '@type': 'ListItem', position: 2, name: title, item: canonical },
    ],
  })
  // Refresh client : re-rend l'horodatage local + relatif, puis re-fetch la donnée live.
  const js = `(function(){var ts=document.getElementById('f-ts'),rel=document.getElementById('f-rel');if(!ts)return;
var L=${JSON.stringify(LOCALES[lang])},LT1=${JSON.stringify(t.agoLt1)},TPL=${JSON.stringify(t.agoTpl)};
function show(iso){var d=new Date(iso);if(isNaN(d))return;
ts.textContent=d.toLocaleString(L,{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'});
var h=Math.floor((Date.now()-d.getTime())/36e5);
rel.textContent=h<1?LT1:TPL.replace('{h}',h)}
show(ts.getAttribute('data-iso'));
fetch('/api/copernicus/sargassum.json',{cache:'no-store'}).then(function(r){return r.ok?r.json():null}).then(function(d){if(d&&d.updatedAt){ts.setAttribute('data-iso',d.updatedAt);show(d.updatedAt)}}).catch(function(){})})();`

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}"/>
<link rel="canonical" href="${canonical}"/>${altTags}
<link rel="icon" href="/favicon.svg"/>
<meta property="og:title" content="${esc(title)}"/>
<meta property="og:description" content="${esc(desc)}"/>
<meta property="og:url" content="${canonical}"/>
<meta property="og:type" content="website"/>
<meta property="og:site_name" content="${esc(siteName)}"/>
<script type="application/ld+json">${ldPage}</script>
<script type="application/ld+json">${ldCrumb}</script>
<style>
  :root{--ink:#0A1714;--card:#10231E;--gold:#FFC72C;--teal:#3BA7A0;--mut:rgba(255,255,255,.62);--line:rgba(255,255,255,.09)}
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:var(--ink);color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.6}
  .page{max-width:560px;margin:0 auto;padding:0 22px calc(40px + env(safe-area-inset-bottom))}
  .tb{display:flex;align-items:center;justify-content:space-between;padding:calc(14px + env(safe-area-inset-top)) 0 14px}
  .tb a{color:#fff;text-decoration:none;font-size:13px;font-weight:600;opacity:.85}
  .wordmark{font-weight:800;font-size:11px;letter-spacing:.16em;opacity:.85}
  h1{font-size:clamp(30px,7vw,42px);line-height:1.02;text-transform:uppercase;letter-spacing:-.01em;margin:34px 0 12px;font-weight:900}
  h1 em{font-style:normal;color:var(--gold)}
  .lead{color:var(--mut);font-size:15px;max-width:440px}
  section{margin-top:46px;padding-top:34px;border-top:1px solid var(--line)}
  .lbl{font-size:10.5px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:var(--gold);margin-bottom:10px}
  h2{font-size:22px;text-transform:uppercase;letter-spacing:-.01em;margin-bottom:8px;font-weight:800}
  p{color:var(--mut);font-size:14px;margin-bottom:10px}
  .rows{display:flex;flex-direction:column;gap:12px;margin-top:16px}
  .row{display:flex;gap:12px;align-items:flex-start;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:14px 16px}
  .row b{color:#fff;font-size:14px;display:block;margin-bottom:2px}
  .row span{color:var(--mut);font-size:13px}
  .row .ic{font-size:19px;line-height:1.3}
  .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:16px}
  .stat{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px 10px;text-align:center}
  .stat .n{font-size:clamp(24px,6vw,32px);font-weight:900;color:var(--gold);line-height:1.05;white-space:nowrap}
  .stat .l{font-size:11px;color:var(--mut);margin-top:5px;line-height:1.35}
  .tablecard{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:4px 8px;margin-top:16px;overflow-x:auto}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--mut);font-weight:700;text-align:left;padding:9px 8px;border-bottom:1px solid var(--line)}
  td{padding:9px 8px;border-bottom:1px solid var(--line);color:#fff}
  td.mut{color:var(--mut)}
  tr:last-child td{border-bottom:none}
  .note{font-size:12.5px;color:var(--mut);margin-top:12px}
  .miss{background:var(--card);border:1px solid var(--line);border-left:3px solid var(--gold);border-radius:16px;padding:14px 16px;margin-top:16px}
  .miss b{display:block;font-size:13px;margin-bottom:6px}
  .miss ul{list-style:none;display:flex;flex-direction:column;gap:5px;margin:8px 0}
  .miss li{font-size:13px;color:var(--mut)}
  .miss li strong{color:#fff;font-weight:600}
  .fresh{display:flex;gap:12px;align-items:flex-start;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:14px 16px;margin-top:16px}
  .fresh b{color:#fff;font-size:14px;display:block;margin-bottom:2px}
  .fresh span{color:var(--mut);font-size:13px}
  .dot{width:9px;height:9px;border-radius:50%;background:#6AC15A;margin-top:7px;flex:none;box-shadow:0 0 0 4px rgba(106,193,90,.15)}
  .foot{margin-top:54px;padding-top:24px;border-top:1px solid var(--line);text-align:center;font-size:11px;color:rgba(255,255,255,.38)}
  .cta{display:inline-block;margin-top:18px;background:var(--gold);color:var(--ink);font-weight:800;font-size:14px;padding:13px 22px;border-radius:16px;text-decoration:none}
</style>
</head>
<body>
<div class="page">
  <div class="tb"><a href="/">←&nbsp;${esc(t.back)}</a><span class="wordmark">${esc(siteName.toUpperCase())}</span></div>

  <h1>${esc(t.h1a)} <em>${esc(t.h1b)}</em></h1>
  <p class="lead">${esc(t.lead)}</p>

  <section>
    <div class="lbl">${esc(t.l1)}</div>
    <h2>${esc(t.h2m)}</h2>
    <div class="rows">
      <div class="row"><span class="ic">${brandIcon('satellite',22,'#E8F2EF')}</span><div><b>${esc(t.m1t)}</b><span>${esc(t.m1s)}</span></div></div>
      <div class="row"><span class="ic">${brandIcon('wave',22,'#E8F2EF')}</span><div><b>${esc(t.m2t)}</b><span>${esc(t.m2s)}</span></div></div>
      <div class="row"><span class="ic">${brandIcon('ruler',22,'#E8F2EF')}</span><div><b>${esc(t.m3t)}</b><span>${esc(t.m3s)}</span></div></div>
      <div class="row"><span class="ic">∅</span><div><b>${esc(t.m4t)}</b><span>${esc(t.m4s)}</span></div></div>
    </div>
  </section>

  ${precisionSection(lang, bt, regionName)}

  ${freshnessSection(lang, data, slug)}

  <div class="foot">${esc(siteName.toUpperCase())} · ${esc(t.fdata)}</div>
</div>
<script>${js}</script>
</body>
</html>
`
}

function writePage(distDir, slug, html) {
  const dir = path.join(distDir, slug)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf-8')
}

/** Ajoute la page au sitemap.xml régional (écrit avant par region-seo-pages.cjs). */
function appendToRegionSitemap(distDir, domain, slug) {
  const p = path.join(distDir, 'sitemap.xml')
  let xml
  try { xml = fs.readFileSync(p, 'utf-8') } catch { return false }
  const loc = `https://${domain}/${slug}/`
  if (xml.includes(loc)) return true
  const today = new Date().toISOString().slice(0, 10)
  xml = xml.replace('</urlset>', `  <url><loc>${loc}</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq></url>\n</urlset>`)
  fs.writeFileSync(p, xml, 'utf-8')
  return true
}

/** Title + meta description par domaine (chiffres réels dans la desc si backtest dispo). */
function buildMeta(lang, bt, regionLabel) {
  const j1 = bt && bt.byHorizon.day1 && bt.byHorizon.day1.pairs > 0 ? bt.byHorizon.day1.statusHitRate : null
  const all = bt ? bt.overall.statusHitRate : null
  const pairs = bt ? fmtInt(lang, bt.totalPairs) : null
  const days = bt && bt.archiveDays ? bt.archiveDays : null
  if (lang === 'fr') {
    return {
      title: `Fiabilité des prévisions sargasses — précision mesurée | ${regionLabel}`,
      desc: j1 != null && all != null && pairs && days
        ? `Prévision vs observation satellite : ${j1} % de réussite à J+1, ${all} % global sur ${pairs} comparaisons (${days} jours). Méthode et chiffres réels, jamais retouchés.`
        : 'Comment nos prévisions sargasses sont calculées et vérifiées : satellite Copernicus/NOAA 4 passages par jour, modèle de dérive, backtest automatique quotidien.',
    }
  }
  if (lang === 'es') {
    return {
      title: `Precisión del pronóstico de sargazo, verificada — ${regionLabel}`,
      desc: j1 != null && all != null && pairs && days
        ? `Pronóstico vs observación satelital: ${j1}% de acierto a 1 día, ${all}% global en ${pairs} comparaciones (${days} días). Método y cifras reales, nunca retocadas.`
        : 'Cómo se calculan y verifican nuestros pronósticos de sargazo: satélite Copernicus/NOAA 4 veces al día, modelo de deriva, backtest automático diario.',
    }
  }
  return {
    title: `Sargassum Forecast Accuracy, Verified — ${regionLabel}`,
    desc: j1 != null && all != null && pairs && days
      ? `Forecast vs satellite observation: ${j1}% next-day hit rate, ${all}% overall across ${pairs} checks (${days} days). Full method, real numbers, never edited.`
      : 'How our sargassum forecasts are computed and verified: Copernicus/NOAA satellite 4 passes a day, drift model, automatic daily backtest.',
  }
}

/**
 * Entrée unique. region = null (ou mq/gp) → chemin MQ/GP historique ;
 * sinon build mono-région (florida / puntacana / rivieramaya).
 */
function generateReliabilityPages(region, distDir) {
  const bt = readBacktest()
  const isNewRegion = !!(region && region.id !== 'mq' && region.id !== 'gp')

  if (!isNewRegion) {
    const data = loadJSON(path.join(ROOT, 'public', 'api', 'copernicus', 'sargassum.json'), null)
    // MQ — canonical martinique
    const mqMeta = buildMeta('fr', bt, 'Martinique')
    writePage(distDir, 'fiabilite', renderPage({
      lang: 'fr', domain: 'sargasses-martinique.com', siteName: 'Sargasses Martinique',
      slug: 'fiabilite', title: mqMeta.title, desc: mqMeta.desc, data, bt,
    }))
    // GP — miroir dist/_gp/ (prepare-ftp l'overlay sur guadeloupe-ftp en dernier)
    const gpMeta = buildMeta('fr', bt, 'Guadeloupe')
    writePage(path.join(distDir, '_gp'), 'fiabilite', renderPage({
      lang: 'fr', domain: 'sargasses-guadeloupe.com', siteName: 'Sargasses Guadeloupe',
      slug: 'fiabilite', title: gpMeta.title, desc: gpMeta.desc, data, bt,
    }))
    console.log(`   → /fiabilite/ générée (MQ + miroir GP)${bt ? ` — backtest ${bt.overall.statusHitRate}% global, ${bt.totalPairs} paires` : ' — SANS section précision (backtest indisponible)'}`)
    return
  }

  // Régions bilingues : la page est générée dans CHAQUE langue déclarée (primaire
  // + secondaires), chacune à son slug (reliability=EN, fiabilidad=ES), les
  // variantes cross-liées par hreflang. Avant : seule la langue primaire était
  // émise — une région en-primary (puntacana) n'avait donc JAMAIS sa page ES
  // /fiabilidad/, et le SPA catch-all servait l'app shell à la place (constaté en
  // prod 2026-06-16 sur sargassumpuntacana.com/fiabilidad/ → HTTP 200 + id="root").
  const SLUG = { en: 'reliability', es: 'fiabilidad' }
  const norm = l => (l === 'es' ? 'es' : 'en')
  const primary = norm(region.primaryLang)
  const langs = [region.primaryLang, ...(region.secondaryLangs || [])]
    .map(norm).filter((l, i, a) => a.indexOf(l) === i) // dédupe, primaire d'abord
  const data = loadJSON(path.join(ROOT, 'public', 'api', 'copernicus', region.id, 'sargassum.json'), null)
  const alternates = langs.map(l => ({ lang: l, href: `https://${region.domain}/${SLUG[l]}/`, xDefault: l === primary }))
  const done = []
  for (const l of langs) {
    const slug = SLUG[l]
    const siteName = l === 'es' ? `Sargazo ${region.name}` : `Sargassum ${region.name}`
    const meta = buildMeta(l, bt, region.name)
    writePage(distDir, slug, renderPage({
      lang: l, domain: region.domain, siteName, slug, title: meta.title, desc: meta.desc,
      data, bt, regionName: region.name, alternates,
    }))
    const inSitemap = appendToRegionSitemap(distDir, region.domain, slug)
    done.push(`/${slug}/${inSitemap ? '' : ' (sitemap absent)'}`)
  }
  console.log(`   → ${done.join(' + ')} générée(s) (${region.id})${bt ? ` — backtest ${bt.overall.statusHitRate}% global, ${bt.totalPairs} paires` : ' — SANS section précision (backtest indisponible)'}`)
}

module.exports = { generateReliabilityPages }
