/**
 * commune-seo-pages.cjs — Générateur de pages SEO communes FR (Martinique + Guadeloupe).
 *
 * Capte la longue-traîne "sargasses <commune>" (intention vérification locale) pour
 * les communes littorales qui n'ont PAS encore de page dédiée. Chaque page est un
 * HUB data-backed : elle liste les VRAIES plages de la commune (depuis la config
 * BEACHES) avec lien vers leur fiche /plages/<slug>/ (où l'état live est affiché),
 * + maillage vers carte/prévisions/saison/meilleures-plages/alertes. Pas de
 * statut inventé : la page renvoie à la donnée live, elle ne la fabrique pas.
 *
 * Pattern identique aux pages communes écrites à la main (Diamant, Sainte-Luce…),
 * mais généré → couvre les ~33 communes restantes sans dette de code.
 *
 * Sortie consommée par vite.config.js (plugin generate-seo-pages) :
 *   communeSeoList()      → entrées {path, enPath:null, title, desc} pour `pages`
 *   communeNoscripts()    → { path: noscriptHTML } fusionné dans editorialContent
 *   communeDates()        → { path: 'YYYY-MM-DD' } fusionné dans PUBLISHED_BY_SLUG
 *   communeSlugsByIsland()→ { mq:[...], gp:[...] } pour les listes MQ_ONLY/GP_ONLY
 *
 * Déterministe (sauf communeDates qui prend la date du build, comme les pages
 * existantes). Aucune dépendance hors fs/path + la config BEACHES.
 */
'use strict'

// slugify IDENTIQUE à vite.config.js (pour les liens /plages/<slug>/ — ne PAS
// diverger sinon les liens cassent). N'gère PAS la ligature œ exprès.
const slugify = (n) => String(n || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
// Slug de COMMUNE : gère œ/æ (Schœlcher→schoelcher) pour dédupliquer les variantes
// d'encodage et éviter un slug cassé "sch-lcher". Usage page-slug + groupement.
const communeSlug = (n) => slugify(String(n || '').toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae'))
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Communes déjà dotées d'une page dédiée écrite à la main (à NE PAS regénérer).
const COVERED = new Set([
  'le-diamant', 'sainte-luce', 'sainte-anne', 'les-trois-ilets', // MQ
  'deshaies', 'le-gosier', 'saint-francois', 'bouillante', // GP
])

const ISLAND = {
  mq: { label: 'Martinique', saison: 'saison-sargasses-martinique', best: 'meilleures-plages-martinique-sargasses' },
  gp: { label: 'Guadeloupe', saison: 'saison-sargasses-guadeloupe', best: 'meilleures-plages-guadeloupe-sargasses' },
}

function loadBeaches() {
  try { return require('../automation/lib/config.cjs').BEACHES || [] } catch { return [] }
}

// Regroupe les plages par commune (slug), fusionne les variantes d'accent
// (Schœlcher/Schoelcher → même slug), exclut les communes déjà couvertes.
function getUncoveredCommunes(beaches) {
  const list = beaches && beaches.length ? beaches : loadBeaches()
  const byCommune = {}
  for (const b of list) {
    const island = b.island === 'gp' ? 'gp' : 'mq'
    const name = (b.commune || '').trim()
    if (!name) continue
    const cs = communeSlug(name)
    if (!cs || COVERED.has(cs)) continue
    const key = `${island}:${cs}`
    if (!byCommune[key]) byCommune[key] = { slug: `sargasses-${cs}`, communeSlug: cs, name, island, beaches: [] }
    byCommune[key].beaches.push({ name: b.name, slug: slugify(b.name) })
  }
  // Dédup des plages par slug à l'intérieur d'une commune.
  return Object.values(byCommune).map(c => {
    const seen = new Set()
    c.beaches = c.beaches.filter(x => x.slug && !seen.has(x.slug) && seen.add(x.slug))
    return c
  }).filter(c => c.beaches.length > 0)
}

// Préposition correcte : "à X", "au X", "aux X" selon l'article du nom.
function prepFor(name) {
  if (/^les\s/i.test(name)) return 'aux ' + name.replace(/^les\s/i, '')
  if (/^le\s/i.test(name)) return 'au ' + name.replace(/^le\s/i, '')
  if (/^la\s/i.test(name)) return 'à la ' + name.replace(/^la\s/i, '')
  return 'à ' + name
}

function titleFor(c) {
  // <= ~60-66 chars pour le <title>.
  return `Sargasses ${prepFor(c.name)} (${ISLAND[c.island].label}) — état du jour`
}

function descFor(c) {
  const first = c.beaches.slice(0, 3).map(b => b.name).join(', ')
  return `Y a-t-il des sargasses ${prepFor(c.name)} aujourd'hui ? État du jour des plages (${first}) en ${ISLAND[c.island].label}. Carte en temps réel, prévision 7 jours par plage, données satellite.`.slice(0, 158)
}

function noscriptFor(c, siblings) {
  const isl = ISLAND[c.island]
  const beachLis = c.beaches.map(b => `<li><a href="/plages/${b.slug}/">${esc(b.name)}</a></li>`).join('')
  return `<article><h1>Sargasses ${esc(prepFor(c.name))} (${isl.label}) — état des plages aujourd'hui</h1>` +
    `<p>Y a-t-il des <strong>sargasses ${esc(prepFor(c.name))}</strong> aujourd'hui ? L'état des sargasses change d'une plage à l'autre et d'un jour à l'autre&nbsp;: une plage de la commune peut être propre quand une autre, à quelques kilomètres, reçoit un banc. Vérifiez l'<a href="/carte-sargasses/">état du jour plage par plage sur la carte</a> avant de poser votre serviette — mesuré par satellite, pas deviné, plusieurs fois par jour.</p>` +
    `<h2>Les plages ${esc(prepFor(c.name))}</h2><ul>${beachLis}</ul>` +
    `<p>Touchez une plage pour voir son <strong>état du jour</strong> (propre, modéré, à éviter), son Beach Score et sa prévision 7 jours.</p>` +
    `<h2>Quand les sargasses touchent-elles ${esc(c.name)} ?</h2>` +
    `<p>La <a href="/${isl.saison}/">saison des sargasses</a> court d'avril à octobre, avec un pic de mai à août. En dehors de cette fenêtre, les échouages sont plus rares mais possibles. Le plus fiable reste de comparer les plages de la commune sur la <a href="/carte-sargasses/">carte en temps réel</a> et de consulter la <a href="/previsions/">prévision 7 jours</a>.</p>` +
    `<h2>Où aller si ${esc(c.name)} est touchée ?</h2>` +
    `<p>Consultez les <a href="/${isl.best}/">plages les plus propres du jour</a> en ${isl.label} pour trouver une alternative à proximité, ou la <a href="/previsions/">prévision 7 jours</a> pour décaler votre sortie au bon moment.</p>` +
    `<h2>Être prévenu ${esc(prepFor(c.name))}</h2>` +
    `<p><a href="/alertes/">Activez une alerte gratuite</a> sur une plage de la commune&nbsp;: Le Veilleur surveille la mer pendant que vous dormez et vous envoie l'état du jour avant de partir.</p>` +
    (siblings && siblings.length
      ? `<h2>Sargasses dans les communes voisines</h2><p>${siblings.map(s => `<a href="/${s.slug}/">${esc(s.name)}</a>`).join(' · ')}</p>`
      : '') +
    `<p><a href="/carte-sargasses/">Carte en temps réel</a> · <a href="/previsions/">Prévisions 7 jours</a> · <a href="/${isl.saison}/">Saison des sargasses</a> · <a href="/${isl.best}/">Meilleures plages du jour</a></p>` +
    `</article>`
}

function communeSeoList(beaches) {
  return getUncoveredCommunes(beaches).map(c => ({ path: c.slug, enPath: null, title: titleFor(c), desc: descFor(c), isFaq: false }))
}

function communeNoscripts(beaches) {
  const all = getUncoveredCommunes(beaches)
  const byIsland = { mq: all.filter(c => c.island === 'mq'), gp: all.filter(c => c.island === 'gp') }
  const out = {}
  for (const c of all) {
    // 3 communes sœurs (même île, rotation déterministe) → cluster maillé,
    // aucune page orpheline une fois Google entré par le sitemap.
    const sibs = byIsland[c.island]
    const i = sibs.indexOf(c)
    const siblings = [1, 2, 3].map(k => sibs[(i + k) % sibs.length]).filter(s => s && s.slug !== c.slug)
    out[c.slug] = noscriptFor(c, siblings)
  }
  return out
}

function communeDates(beaches, date) {
  const d = date || '2026-06-28'
  const out = {}
  for (const c of getUncoveredCommunes(beaches)) out[c.slug] = d
  return out
}

function communeSlugsByIsland(beaches) {
  const out = { mq: [], gp: [] }
  for (const c of getUncoveredCommunes(beaches)) out[c.island].push(c.slug)
  return out
}

module.exports = {
  slugify, getUncoveredCommunes, communeSeoList, communeNoscripts, communeDates, communeSlugsByIsland,
}
