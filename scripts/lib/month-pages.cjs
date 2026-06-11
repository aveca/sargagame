/**
 * month-pages.cjs — Pages « mois » SEO auto-générées au build (5 domaines).
 * Capte les requêtes datées (« sargasses martinique juin 2026 »,
 * « sargassum cancun june 2026 ») avec un bilan mensuel 100 % calculé.
 *
 * Appelée par le plugin seo-pages de vite.config.js (closeBundle) :
 *   - MQ/GP  : dist/sargasses-<mois>-<annee>/ (canonical MQ) + miroir
 *              dist/_gp/... (overlay GP, prepare-ftp stampe _gp/ en dernier).
 *              Sitemaps sitemap-martinique.xml / sitemap-guadeloupe.xml patchés
 *              sur disque — l'appel doit donc venir APRÈS leur réécriture finale.
 *   - Régions: dist/sargassum-<month>-<year>/ (EN) ou dist/sargazo-<mes>-<anio>/
 *              (ES) + ajout au sitemap.xml régional (pattern reliability-page).
 *
 * RÈGLE D'OR : aucun chiffre inventé. Tout vient de :
 *   public/api/copernicus[/<region>]/history.json   (observations satellite/jour)
 *   public/api/copernicus[/<region>]/sargassum.json (état du jour, verdict live)
 * Un mois PASSÉ n'a sa page QUE s'il compte ≥ 15 jours de données réelles.
 * Le mois COURANT a une page « en cours » avec les jours déjà observés
 * + un verdict live re-fetché côté client (même mécanique que /fiabilite/).
 *
 * Design aligné sur reliability-page.cjs (encre #0A1714, or #FFC72C, cards #10231E).
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
const MIN_DAYS_PAST_MONTH = 15

const loadJSON = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { return fb } }
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Noms lisibles des points de mesure du pipeline historique MQ+GP (ids de
// history.json racine). Même table que reliability-page.cjs.
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
// Slugs mois sans accents (slug SEO stable, indépendant de toLocaleDateString)
const MONTH_SLUG = {
  fr: ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'],
  en: ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'],
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
}
const SLUG_PREFIX = { fr: 'sargasses', en: 'sargassum', es: 'sargazo' }

const fmtInt = (lang, n) => Number(n).toLocaleString(LOCALES[lang])
const fmtAfai = (lang, n) => Number(n).toLocaleString(LOCALES[lang], { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtPct = (lang, n) => lang === 'fr' ? `${n} %` : `${n}%`
const fmtDay = (lang, iso) => {
  const d = new Date(iso + (iso.length === 10 ? 'T12:00:00Z' : ''))
  if (isNaN(d)) return iso
  return d.toLocaleDateString(LOCALES[lang], { day: 'numeric', month: 'long', timeZone: 'UTC' })
}
const fmtDateTimeUTC = (lang, iso) => {
  const d = new Date(iso)
  if (isNaN(d)) return iso
  return d.toLocaleString(LOCALES[lang], { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC'
}
// « juin 2026 » / « June 2026 » / « junio 2026 » — affichage localisé
const monthLabel = (lang, ym) => {
  const d = new Date(ym + '-15T12:00:00Z')
  return d.toLocaleDateString(LOCALES[lang], { month: 'long', year: 'numeric', timeZone: 'UTC' })
}
const monthSlug = (lang, ym) => {
  const [y, m] = ym.split('-').map(Number)
  return `${SLUG_PREFIX[lang]}-${MONTH_SLUG[lang][m - 1]}-${y}`
}

const I18N = {
  fr: {
    back: 'Retour à la carte',
    h1: region => `Sargasses en ${region} —`,
    lead: (days, region, ml) => `Bilan satellite réel : ${days} jour${days > 1 ? 's' : ''} de mesures Copernicus / NOAA sur les plages de ${region} en ${ml}. Aucune estimation — uniquement ce que le satellite a observé.`,
    banner: 'Mois en cours — cette page se met à jour à chaque passage satellite.',
    liveT: 'Verdict en direct',
    liveCounts: (c, m, a, total) => `${c}/${total} plages propres · ${m} modérée${m > 1 ? 's' : ''} · ${a} à éviter`,
    l1: 'Le bilan', h2sum: 'Le mois en chiffres',
    sIntro: (from, to, days) => `Mesures satellite du ${from} au ${to} — ${days} jour${days > 1 ? 's' : ''} observé${days > 1 ? 's' : ''}.`,
    stDays: 'jours mesurés', stClean: 'jours réseau 100 % propre', stMod: 'jours avec ≥ 1 plage modérée', stAvoid: 'jours avec ≥ 1 plage à éviter',
    dayDef: 'Un jour est « 100 % propre » quand toutes les plages mesurées ce jour-là sont propres (indice AFAI < 0,15). Une seule plage modérée (0,15–0,40) ou à éviter (> 0,40) suffit à déclasser la journée.',
    bdLine: (pct, n) => `${pct} des ${n} mesures plage-jour du mois étaient propres.`,
    l2: 'Tendance', h2t: 'Par rapport au mois précédent',
    trend: (prevMl, curMl, prevAfai, curAfai, prevPct, curPct, verdict) =>
      `Indice AFAI moyen du réseau : ${prevAfai} en ${prevMl} → ${curAfai} en ${curMl} (${verdict}). Mesures propres : ${prevPct} → ${curPct}.`,
    vUp: 'en hausse', vDown: 'en baisse', vStable: 'stable',
    trendCurNote: 'Comparaison calculée sur les jours déjà observés du mois en cours.',
    l3: 'Plages', h2b: 'Les meilleures plages du mois',
    bIntro: 'Classement calculé sur les mesures réelles du mois : part de jours propres, puis indice AFAI moyen (plus bas = moins de sargasses).',
    bRow: (cd, d, afai) => `${cd}/${d} jours propres · AFAI moyen ${afai}`,
    l4: 'Et maintenant ?', h2n: 'La situation du jour, plage par plage',
    nLead: 'Le bilan mensuel dit ce qui s’est passé. La carte dit où aller aujourd’hui.',
    ctaMap: 'Voir la carte en direct →',
    ctaRel: 'Comment ces chiffres sont vérifiés →',
    otherMonths: 'Autres mois',
    fdata: 'Données : Copernicus Marine & NOAA ERDDAP · bilan recalculé à chaque mise à jour',
    title: (region, ml, current) => current
      ? `Sargasses ${region} ${ml} : état actuel et bilan satellite`
      : `Sargasses ${region} ${ml} : le bilan satellite complet`,
    desc: (region, ml, days, cleanDays, pct, best, current) =>
      `${current ? 'Mois en cours — ' : ''}${days} jour${days > 1 ? 's' : ''} mesuré${days > 1 ? 's' : ''} par satellite sur les plages de ${region} en ${ml} : ${cleanDays} jour${cleanDays > 1 ? 's' : ''} réseau 100 % propre, ${pct} de mesures propres${best ? `. Meilleure plage : ${best}` : ''}. Chiffres réels, jamais retouchés.`,
  },
  en: {
    back: 'Back to the map',
    h1: region => `Sargassum in ${region} —`,
    lead: (days, region, ml) => `A real satellite tally: ${days} day${days > 1 ? 's' : ''} of Copernicus / NOAA measurements across ${region} beaches in ${ml}. No estimates — only what the satellite actually observed.`,
    banner: 'Current month — this page updates with every satellite pass.',
    liveT: 'Live verdict',
    liveCounts: (c, m, a, total) => `${c}/${total} beaches clean · ${m} moderate · ${a} avoid`,
    l1: 'The tally', h2sum: 'The month in numbers',
    sIntro: (from, to, days) => `Satellite measurements from ${from} to ${to} — ${days} day${days > 1 ? 's' : ''} observed.`,
    stDays: 'days measured', stClean: 'days 100% clean network-wide', stMod: 'days with ≥ 1 moderate beach', stAvoid: 'days with ≥ 1 beach to avoid',
    dayDef: 'A day counts as “100% clean” when every beach measured that day is clean (AFAI index < 0.15). A single moderate (0.15–0.40) or avoid (> 0.40) beach downgrades the day.',
    bdLine: (pct, n) => `${pct} of the month’s ${n} beach-day measurements were clean.`,
    l2: 'Trend', h2t: 'Versus the previous month',
    trend: (prevMl, curMl, prevAfai, curAfai, prevPct, curPct, verdict) =>
      `Network mean AFAI index: ${prevAfai} in ${prevMl} → ${curAfai} in ${curMl} (${verdict}). Clean measurements: ${prevPct} → ${curPct}.`,
    vUp: 'rising', vDown: 'falling', vStable: 'stable',
    trendCurNote: 'Comparison computed on the days observed so far this month.',
    l3: 'Beaches', h2b: 'Best beaches of the month',
    bIntro: 'Ranking computed from the month’s real measurements: share of clean days, then mean AFAI index (lower = less sargassum).',
    bRow: (cd, d, afai) => `${cd}/${d} clean days · mean AFAI ${afai}`,
    l4: 'What now?', h2n: 'Today’s status, beach by beach',
    nLead: 'The monthly tally says what happened. The map says where to go today.',
    ctaMap: 'See the live map →',
    ctaRel: 'How these numbers are verified →',
    otherMonths: 'Other months',
    fdata: 'Data: Copernicus Marine & NOAA ERDDAP · tally recomputed with every update',
    title: (region, ml, current) => current
      ? `Sargassum in ${region} ${ml}: Live Status & Satellite Tally`
      : `Sargassum in ${region} ${ml}: The Full Satellite Tally`,
    desc: (region, ml, days, cleanDays, pct, best, current) =>
      `${current ? 'Current month — ' : ''}${days} day${days > 1 ? 's' : ''} of satellite measurements across ${region} beaches in ${ml}: ${cleanDays} day${cleanDays > 1 ? 's' : ''} 100% clean network-wide, ${pct} clean measurements${best ? `. Best beach: ${best}` : ''}. Real numbers, never edited.`,
  },
  es: {
    back: 'Volver al mapa',
    h1: region => `Sargazo en ${region} —`,
    lead: (days, region, ml) => `Balance satelital real: ${days} día${days > 1 ? 's' : ''} de mediciones Copernicus / NOAA en las playas de ${region} en ${ml}. Sin estimaciones — solo lo que el satélite observó.`,
    banner: 'Mes en curso — esta página se actualiza con cada pasada satelital.',
    liveT: 'Veredicto en vivo',
    liveCounts: (c, m, a, total) => `${c}/${total} playas limpias · ${m} moderada${m > 1 ? 's' : ''} · ${a} a evitar`,
    l1: 'El balance', h2sum: 'El mes en cifras',
    sIntro: (from, to, days) => `Mediciones satelitales del ${from} al ${to} — ${days} día${days > 1 ? 's' : ''} observado${days > 1 ? 's' : ''}.`,
    stDays: 'días medidos', stClean: 'días red 100% limpia', stMod: 'días con ≥ 1 playa moderada', stAvoid: 'días con ≥ 1 playa a evitar',
    dayDef: 'Un día cuenta como «100% limpio» cuando todas las playas medidas ese día están limpias (índice AFAI < 0,15). Una sola playa moderada (0,15–0,40) o a evitar (> 0,40) basta para descalificar el día.',
    bdLine: (pct, n) => `${pct} de las ${n} mediciones playa-día del mes fueron limpias.`,
    l2: 'Tendencia', h2t: 'Frente al mes anterior',
    trend: (prevMl, curMl, prevAfai, curAfai, prevPct, curPct, verdict) =>
      `Índice AFAI medio de la red: ${prevAfai} en ${prevMl} → ${curAfai} en ${curMl} (${verdict}). Mediciones limpias: ${prevPct} → ${curPct}.`,
    vUp: 'al alza', vDown: 'a la baja', vStable: 'estable',
    trendCurNote: 'Comparación calculada sobre los días ya observados del mes en curso.',
    l3: 'Playas', h2b: 'Las mejores playas del mes',
    bIntro: 'Ranking calculado con las mediciones reales del mes: proporción de días limpios, luego índice AFAI medio (más bajo = menos sargazo).',
    bRow: (cd, d, afai) => `${cd}/${d} días limpios · AFAI medio ${afai}`,
    l4: '¿Y ahora?', h2n: 'La situación de hoy, playa por playa',
    nLead: 'El balance mensual dice qué pasó. El mapa dice adónde ir hoy.',
    ctaMap: 'Ver el mapa en vivo →',
    ctaRel: 'Cómo se verifican estas cifras →',
    otherMonths: 'Otros meses',
    fdata: 'Datos: Copernicus Marine & NOAA ERDDAP · balance recalculado con cada actualización',
    title: (region, ml, current) => current
      ? `Sargazo en ${region} ${ml}: estado actual y balance satelital`
      : `Sargazo en ${region} ${ml}: el balance satelital completo`,
    desc: (region, ml, days, cleanDays, pct, best, current) =>
      `${current ? 'Mes en curso — ' : ''}${days} día${days > 1 ? 's' : ''} de mediciones satelitales en las playas de ${region} en ${ml}: ${cleanDays} día${cleanDays > 1 ? 's' : ''} red 100% limpia, ${pct} de mediciones limpias${best ? `. Mejor playa: ${best}` : ''}. Cifras reales, nunca retocadas.`,
  },
}

/* ─────────────────────────── Agrégation (chiffres réels) ─────────────────────────── */

/**
 * Agrège history.json par mois pour un sous-réseau (filterId garde les plages
 * de l'île/région). Retourne Map ym → stats, uniquement depuis la donnée brute.
 */
function computeMonthlyStats(history, filterId) {
  const byMonth = new Map()
  for (const entry of history) {
    if (!entry || typeof entry.date !== 'string' || !Array.isArray(entry.levels)) continue
    const levels = entry.levels.filter(l => l && l.id && typeof l.afai === 'number' && l.status && filterId(l.id))
    if (!levels.length) continue
    const ym = entry.date.slice(0, 7)
    if (!byMonth.has(ym)) {
      byMonth.set(ym, { days: 0, from: entry.date, to: entry.date, daysClean: 0, daysMod: 0, daysAvoid: 0, beachDays: 0, cleanBeachDays: 0, afaiSum: 0, byBeach: new Map() })
    }
    const s = byMonth.get(ym)
    s.days++
    if (entry.date < s.from) s.from = entry.date
    if (entry.date > s.to) s.to = entry.date
    let hasMod = false, hasAvoid = false
    for (const l of levels) {
      s.beachDays++
      s.afaiSum += l.afai
      if (l.status === 'clean') s.cleanBeachDays++
      else if (l.status === 'avoid') hasAvoid = true
      else hasMod = true
      if (!s.byBeach.has(l.id)) s.byBeach.set(l.id, { days: 0, cleanDays: 0, afaiSum: 0 })
      const b = s.byBeach.get(l.id)
      b.days++
      b.afaiSum += l.afai
      if (l.status === 'clean') b.cleanDays++
    }
    if (hasAvoid) s.daysAvoid++
    else if (hasMod) s.daysMod++
    else s.daysClean++
  }
  return byMonth
}

/** Top 3 plages du mois : part de jours propres desc, puis AFAI moyen asc. */
function bestBeaches(stats, labelOf) {
  const rows = [...stats.byBeach.entries()]
    .filter(([, b]) => b.days > 0)
    .map(([id, b]) => ({ id, name: labelOf(id), days: b.days, cleanDays: b.cleanDays, cleanShare: b.cleanDays / b.days, avgAfai: b.afaiSum / b.days }))
  rows.sort((a, b) => (b.cleanShare - a.cleanShare) || (a.avgAfai - b.avgAfai))
  return rows.slice(0, 3)
}

/* ─────────────────────────────── Rendu HTML ─────────────────────────────── */

function trendSection(lang, ym, stats, prevYm, prevStats, isCurrent) {
  if (!prevStats || prevStats.days < MIN_DAYS_PAST_MONTH || !stats.beachDays || !prevStats.beachDays) return ''
  const t = I18N[lang]
  const curAfai = stats.afaiSum / stats.beachDays
  const prevAfai = prevStats.afaiSum / prevStats.beachDays
  const curPct = Math.round(100 * stats.cleanBeachDays / stats.beachDays)
  const prevPct = Math.round(100 * prevStats.cleanBeachDays / prevStats.beachDays)
  const verdict = curAfai > prevAfai + 0.01 ? t.vUp : curAfai < prevAfai - 0.01 ? t.vDown : t.vStable
  return `<section>
    <div class="lbl">${esc(t.l2)}</div>
    <h2>${esc(t.h2t)}</h2>
    <p>${esc(t.trend(monthLabel(lang, prevYm), monthLabel(lang, ym), fmtAfai(lang, prevAfai), fmtAfai(lang, curAfai), fmtPct(lang, prevPct), fmtPct(lang, curPct), verdict))}</p>
    ${isCurrent ? `<p class="note">${esc(t.trendCurNote)}</p>` : ''}
  </section>`
}

function renderMonthPage({ lang, domain, siteName, slug, title, desc, ym, stats, prevYm, prevStats, isCurrent, labelOf, live, relSlug, otherMonths }) {
  const t = I18N[lang]
  const canonical = `https://${domain}/${slug}/`
  const ml = monthLabel(lang, ym)
  const updatedISO = live && live.updatedAt ? live.updatedAt : new Date().toISOString()
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

  // ── Bandeau mois en cours + verdict live (valeurs réelles bakées au build,
  //    re-fetch client de /api/copernicus/sargassum.json comme /fiabilite/) ──
  let banner = ''
  let js = ''
  if (isCurrent && live && Array.isArray(live.levels)) {
    const ls = live.levels.filter(l => l && l.id && l.status && labelOf.match(l.id))
    if (ls.length) {
      const c = ls.filter(l => l.status === 'clean').length
      const a = ls.filter(l => l.status === 'avoid').length
      const m = ls.length - c - a
      banner = `<div class="banner">${esc(t.banner)}</div>
  <div class="live"><span class="dot"></span><div>
    <b>${esc(t.liveT)}</b>
    <span id="lv-counts">${esc(t.liveCounts(c, m, a, ls.length))}</span><br/>
    <span class="livets"><span id="lv-ts" data-iso="${esc(live.updatedAt || '')}">${esc(live.updatedAt ? fmtDateTimeUTC(lang, live.updatedAt) : '')}</span> · <span id="lv-rel"></span></span>
  </div></div>`
      // liveCounts re-rendu côté client avec les mêmes libellés
      const tplCounts = t.liveCounts('{c}', '{m}', '{a}', '{n}')
      js = `(function(){var ts=document.getElementById('lv-ts'),rel=document.getElementById('lv-rel'),ct=document.getElementById('lv-counts');if(!ts)return;
var L=${JSON.stringify(LOCALES[lang])},TPL=${JSON.stringify(tplCounts)},RX=new RegExp(${JSON.stringify(labelOf.rxSource)});
function show(iso){var d=new Date(iso);if(isNaN(d))return;
ts.textContent=d.toLocaleString(L,{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'});
var h=Math.floor((Date.now()-d.getTime())/36e5);rel.textContent=h<1?'< 1 h':h+' h'}
show(ts.getAttribute('data-iso'));
fetch('/api/copernicus/sargassum.json',{cache:'no-store'}).then(function(r){return r.ok?r.json():null}).then(function(d){
if(!d||!Array.isArray(d.levels))return;
var ls=d.levels.filter(function(l){return l&&l.id&&l.status&&RX.test(l.id)});
if(ls.length&&ct){var c=0,a=0;ls.forEach(function(l){if(l.status==='clean')c++;else if(l.status==='avoid')a++});
ct.textContent=TPL.replace('{c}',c).replace('{m}',ls.length-c-a).replace('{a}',a).replace('{n}',ls.length)}
if(d.updatedAt){ts.setAttribute('data-iso',d.updatedAt);show(d.updatedAt)}}).catch(function(){})})();`
    }
  }

  // ── Bilan du mois — uniquement des comptes réels ──
  const cleanPct = stats.beachDays ? Math.round(100 * stats.cleanBeachDays / stats.beachDays) : null
  const statCards = [
    `<div class="stat"><div class="n">${fmtInt(lang, stats.days)}</div><div class="l">${esc(t.stDays)}</div></div>`,
    `<div class="stat"><div class="n">${fmtInt(lang, stats.daysClean)}</div><div class="l">${esc(t.stClean)}</div></div>`,
    `<div class="stat"><div class="n">${fmtInt(lang, stats.daysMod)}</div><div class="l">${esc(t.stMod)}</div></div>`,
  ]
  if (stats.daysAvoid > 0) statCards.push(`<div class="stat"><div class="n">${fmtInt(lang, stats.daysAvoid)}</div><div class="l">${esc(t.stAvoid)}</div></div>`)
  const summary = `<section>
    <div class="lbl">${esc(t.l1)}</div>
    <h2>${esc(t.h2sum)}</h2>
    <p>${esc(t.sIntro(fmtDay(lang, stats.from), fmtDay(lang, stats.to), stats.days))}</p>
    <div class="stats${statCards.length === 4 ? ' s4' : ''}">${statCards.join('')}</div>
    ${cleanPct != null ? `<p class="note">${esc(t.bdLine(fmtPct(lang, cleanPct), fmtInt(lang, stats.beachDays)))}</p>` : ''}
    <p class="note">${esc(t.dayDef)}</p>
  </section>`

  // ── Meilleures plages du mois (history réel) ──
  const best = bestBeaches(stats, labelOf.name)
  const beachSection = best.length >= 3 ? `<section>
    <div class="lbl">${esc(t.l3)}</div>
    <h2>${esc(t.h2b)}</h2>
    <p class="note" style="margin-top:0">${esc(t.bIntro)}</p>
    <div class="rows">${best.map((b, i) => `<div class="row"><span class="rank">${i + 1}</span><div><b>${esc(b.name)}</b><span>${esc(t.bRow(fmtInt(lang, b.cleanDays), fmtInt(lang, b.days), fmtAfai(lang, b.avgAfai)))}</span></div></div>`).join('')}</div>
  </section>` : ''

  // ── CTA carte + preuve fiabilité ──
  const others = (otherMonths || []).filter(o => o.slug !== slug)
  // Cross-links réseau : la MÊME page mois sur les autres destinations — utile
  // aux voyageurs qui comparent (« sargasses en juin : Cancún ou Punta Cana ? »),
  // unique sur le marché. UNIQUEMENT le mois courant (la page « en cours » existe
  // sur tous les domaines par construction ; les mois passés n'existent pas sur
  // les jeunes régions → zéro risque de 404).
  const SIBLINGS = [
    { domain: 'sargasses-martinique.com', lang: 'fr', label: { fr: 'Martinique', en: 'Martinique', es: 'Martinica' } },
    { domain: 'sargasses-guadeloupe.com', lang: 'fr', label: { fr: 'Guadeloupe', en: 'Guadeloupe', es: 'Guadalupe' } },
    { domain: 'sargassumcancun.com', lang: 'es', label: { fr: 'Cancún & Riviera Maya', en: 'Cancún & Riviera Maya', es: 'Cancún y Riviera Maya' } },
    { domain: 'sargassumpuntacana.com', lang: 'en', label: { fr: 'Punta Cana', en: 'Punta Cana', es: 'Punta Cana' } },
    { domain: 'sargassummiami.com', lang: 'en', label: { fr: 'Floride', en: 'Florida', es: 'Florida' } },
  ]
  const netIntro = lang === 'es' ? `Sargazo en ${monthLabel(lang, ym)} en otros destinos`
    : lang === 'en' ? `Sargassum in ${monthLabel(lang, ym)} elsewhere`
    : `Sargasses en ${monthLabel(lang, ym)} ailleurs`
  const networkSection = isCurrent ? `<p class="note">${esc(netIntro)} : ${SIBLINGS
    .filter(s => s.domain !== domain)
    .map(s => `<a class="rel" href="https://${s.domain}/${monthSlug(s.lang, ym)}/" rel="noopener">${esc(s.label[lang] || s.label.en)}</a>`)
    .join(' · ')}</p>` : ''
  const ctaSection = `<section>
    <div class="lbl">${esc(t.l4)}</div>
    <h2>${esc(t.h2n)}</h2>
    <p>${esc(t.nLead)}</p>
    <a class="cta" href="/?utm_source=${esc(slug)}">${esc(t.ctaMap)}</a>
    <p class="note"><a class="rel" href="/${esc(relSlug)}/">${esc(t.ctaRel)}</a></p>
    ${others.length ? `<p class="note">${esc(t.otherMonths)} : ${others.map(o => `<a class="rel" href="/${esc(o.slug)}/">${esc(o.label)}</a>`).join(' · ')}</p>` : ''}
    ${networkSection}
  </section>`

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}"/>
<link rel="canonical" href="${canonical}"/>
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
  .banner{margin-top:22px;display:inline-block;background:rgba(255,199,44,.12);border:1px solid rgba(255,199,44,.35);color:var(--gold);font-size:12px;font-weight:700;letter-spacing:.04em;border-radius:999px;padding:7px 14px}
  .live{display:flex;gap:12px;align-items:flex-start;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:14px 16px;margin-top:12px}
  .live b{color:#fff;font-size:14px;display:block;margin-bottom:2px}
  .live span{color:var(--mut);font-size:13px}
  .live .livets{font-size:12px}
  .dot{width:9px;height:9px;border-radius:50%;background:#6AC15A;margin-top:7px;flex:none;box-shadow:0 0 0 4px rgba(106,193,90,.15)}
  section{margin-top:46px;padding-top:34px;border-top:1px solid var(--line)}
  .lbl{font-size:10.5px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:var(--gold);margin-bottom:10px}
  h2{font-size:22px;text-transform:uppercase;letter-spacing:-.01em;margin-bottom:8px;font-weight:800}
  p{color:var(--mut);font-size:14px;margin-bottom:10px}
  .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:16px}
  .stats.s4{grid-template-columns:repeat(2,1fr)}
  .stat{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px 10px;text-align:center}
  .stat .n{font-size:clamp(24px,6vw,32px);font-weight:900;color:var(--gold);line-height:1.05;white-space:nowrap}
  .stat .l{font-size:11px;color:var(--mut);margin-top:5px;line-height:1.35}
  .note{font-size:12.5px;color:var(--mut);margin-top:12px}
  .rows{display:flex;flex-direction:column;gap:12px;margin-top:16px}
  .row{display:flex;gap:12px;align-items:flex-start;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:14px 16px}
  .row b{color:#fff;font-size:14px;display:block;margin-bottom:2px}
  .row span{color:var(--mut);font-size:13px}
  .row .rank{flex:none;width:26px;height:26px;border-radius:50%;background:rgba(255,199,44,.14);color:var(--gold);font-weight:800;font-size:13px;display:flex;align-items:center;justify-content:center;margin-top:2px}
  .cta{display:inline-block;margin-top:18px;background:var(--gold);color:var(--ink);font-weight:800;font-size:14px;padding:13px 22px;border-radius:16px;text-decoration:none}
  a.rel{color:var(--teal);text-decoration:none;font-weight:600}
  .foot{margin-top:54px;padding-top:24px;border-top:1px solid var(--line);text-align:center;font-size:11px;color:rgba(255,255,255,.38)}
</style>
</head>
<body>
<div class="page">
  <div class="tb"><a href="/">←&nbsp;${esc(t.back)}</a><span class="wordmark">${esc(siteName.toUpperCase())}</span></div>

  <h1>${esc(t.h1(labelOf.regionLabel))} <em>${esc(ml)}</em></h1>
  <p class="lead">${esc(t.lead(stats.days, labelOf.regionLabel, ml))}</p>

  ${banner}

  ${summary}

  ${trendSection(lang, ym, stats, prevYm, prevStats, isCurrent)}

  ${beachSection}

  ${ctaSection}

  <div class="foot">${esc(siteName.toUpperCase())} · 🛰 ${esc(t.fdata)}</div>
</div>
${js ? `<script>${js}</script>` : ''}
</body>
</html>
`
}

/* ────────────────────────────── Écriture / sitemaps ────────────────────────────── */

function writePage(distDir, slug, html) {
  const dir = path.join(distDir, slug)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf-8')
}

/** Patche un sitemap existant sur disque (replace </urlset>) — pattern reliability. */
function appendToSitemap(sitemapPath, domain, entries) {
  let xml
  try { xml = fs.readFileSync(sitemapPath, 'utf-8') } catch { return false }
  const today = new Date().toISOString().slice(0, 10)
  let added = ''
  for (const e of entries) {
    const loc = `https://${domain}/${e.slug}/`
    if (xml.includes(loc)) continue
    added += `  <url><loc>${loc}</loc><lastmod>${today}</lastmod><changefreq>${e.current ? 'daily' : 'monthly'}</changefreq></url>\n`
  }
  if (added) fs.writeFileSync(sitemapPath, xml.replace('</urlset>', added + '</urlset>'), 'utf-8')
  return true
}

/* ─────────────────────────────── Entrée unique ─────────────────────────────── */

/**
 * Génère les pages d'un réseau (une langue, un domaine, un history filtré).
 * Retourne la liste { slug, ym, current } réellement écrite.
 */
function generateForNetwork({ lang, domain, siteName, regionLabel, distDir, history, live, idFilterRx, beachName, relSlug }) {
  const rx = new RegExp(idFilterRx)
  const byMonth = computeMonthlyStats(history, id => rx.test(id))
  const currentYm = new Date().toISOString().slice(0, 7)

  // Mois éligibles : passés ≥ MIN_DAYS_PAST_MONTH, courant dès 1 jour réel.
  const months = [...byMonth.keys()].sort().filter(ym =>
    ym === currentYm ? byMonth.get(ym).days >= 1 : (ym < currentYm && byMonth.get(ym).days >= MIN_DAYS_PAST_MONTH))
  if (!months.length) return []

  const pages = months.map(ym => ({ ym, slug: monthSlug(lang, ym), label: monthLabel(lang, ym), current: ym === currentYm }))
  const labelOf = { name: beachName, match: id => rx.test(id), rxSource: idFilterRx, regionLabel }

  for (const p of pages) {
    const stats = byMonth.get(p.ym)
    // Mois précédent calendaire (pour la tendance — seulement si ≥ 15 jours réels)
    const d = new Date(p.ym + '-15T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 1)
    const prevYm = d.toISOString().slice(0, 7)
    const prevStats = byMonth.get(prevYm) || null
    const t = I18N[lang]
    const ml = monthLabel(lang, p.ym)
    const cleanPct = stats.beachDays ? Math.round(100 * stats.cleanBeachDays / stats.beachDays) : 0
    const best = bestBeaches(stats, beachName)
    const title = t.title(regionLabel, ml, p.current)
    const desc = t.desc(regionLabel, ml, stats.days, stats.daysClean, fmtPct(lang, cleanPct), best.length ? best[0].name : null, p.current)
    writePage(distDir, p.slug, renderMonthPage({
      lang, domain, siteName, slug: p.slug, title, desc,
      ym: p.ym, stats, prevYm, prevStats, isCurrent: p.current,
      labelOf, live, relSlug, otherMonths: pages,
    }))
  }
  return pages
}

/**
 * Entrée unique. region = null (ou mq/gp) → MQ canonical + miroir _gp/ depuis
 * history.json racine (réseau pipeline 20 plages, le plus profond) ; sinon
 * build mono-région depuis public/api/copernicus/<id>/history.json.
 */
function generateMonthPages(region, distDir) {
  const isNewRegion = !!(region && region.id !== 'mq' && region.id !== 'gp')

  if (!isNewRegion) {
    const hist = loadJSON(path.join(ROOT, 'public', 'api', 'copernicus', 'history.json'), null)
    const history = hist && Array.isArray(hist.history) ? hist.history : []
    if (!history.length) { console.log('   → pages mois : history.json vide, rien à générer'); return }
    const live = loadJSON(path.join(ROOT, 'public', 'api', 'copernicus', 'sargassum.json'), null)
    const beachName = id => (PIPELINE_BEACHES[id] && PIPELINE_BEACHES[id].name) || id

    // MQ — canonical (ids racine non préfixés gp)
    const mqPages = generateForNetwork({
      lang: 'fr', domain: 'sargasses-martinique.com', siteName: 'Sargasses Martinique',
      regionLabel: 'Martinique', distDir, history, live,
      idFilterRx: '^(?!gp)', beachName, relSlug: 'fiabilite',
    })
    appendToSitemap(path.join(distDir, 'sitemap-martinique.xml'), 'sargasses-martinique.com', mqPages)

    // GP — miroir dist/_gp/ (prepare-ftp l'overlay sur guadeloupe-ftp en dernier)
    const gpPages = generateForNetwork({
      lang: 'fr', domain: 'sargasses-guadeloupe.com', siteName: 'Sargasses Guadeloupe',
      regionLabel: 'Guadeloupe', distDir: path.join(distDir, '_gp'), history, live,
      idFilterRx: '^gp', beachName, relSlug: 'fiabilite',
    })
    appendToSitemap(path.join(distDir, 'sitemap-guadeloupe.xml'), 'sargasses-guadeloupe.com', gpPages)

    console.log(`   → pages mois MQ : ${mqPages.map(p => '/' + p.slug + '/').join(', ') || 'aucune'} | GP (_gp/) : ${gpPages.map(p => '/' + p.slug + '/').join(', ') || 'aucune'}`)
    return
  }

  const lang = region.primaryLang === 'es' ? 'es' : 'en'
  const hist = loadJSON(path.join(ROOT, 'public', 'api', 'copernicus', region.id, 'history.json'), null)
  const history = hist && Array.isArray(hist.history) ? hist.history : []
  if (!history.length) { console.log(`   → pages mois (${region.id}) : history vide, rien à générer`); return }
  const live = loadJSON(path.join(ROOT, 'public', 'api', 'copernicus', region.id, 'sargassum.json'), null)
  const names = new Map((region.beaches || []).map(b => [b.id, b.name]))
  const pages = generateForNetwork({
    lang, domain: region.domain,
    siteName: lang === 'es' ? `Sargazo ${region.name}` : `Sargassum ${region.name}`,
    regionLabel: region.name, distDir, history, live,
    idFilterRx: '', beachName: id => names.get(id) || id,
    relSlug: lang === 'es' ? 'fiabilidad' : 'reliability',
  })
  const inSitemap = appendToSitemap(path.join(distDir, 'sitemap.xml'), region.domain, pages)
  console.log(`   → pages mois (${region.id}) : ${pages.map(p => '/' + p.slug + '/').join(', ') || 'aucune'}${inSitemap ? ' + sitemap' : ' (sitemap absent)'}`)
}

module.exports = { generateMonthPages }
