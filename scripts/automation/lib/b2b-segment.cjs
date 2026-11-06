/**
 * b2b-segment — segmentation B2B déterministe (ZÉRO IA) pour personnaliser le cold outreach.
 *
 * À partir d'un contact {email,name,town,island,url} :
 *   - inferType()  → 'hotel' | 'collectivite' (heuristique email/nom/url)
 *   - dataHook()   → la VRAIE donnée récente de sa/ses plage(s), depuis nos JSON publics :
 *       hôtel        : { beach, avoidDays }  (jours « à éviter/modéré » la semaine passée)
 *       collectivité : { nbeaches, navoid }  (sur ses N plages, combien ont eu ≥1 jour à éviter)
 *     → null si la commune ne matche aucune plage suivie (l'appelant retombe sur le copy générique).
 *   - liveProof(region) → preuve de fiabilité uniquement si le registre est frais et mono-région.
 *
 * RÉGION-AWARE : MQ/GP via public/data/beaches-list.json + public/api/copernicus/history.json ;
 * régions USD (florida/puntacana/rivieramaya) via regions/<id>.json + public/api/copernicus/<id>/history.json.
 * Tout best-effort : fichier absent → null/0, jamais de crash.
 */
const fs = require('fs')
const path = require('path')
const ROOT = path.join(__dirname, '..', '..', '..')
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
const load = (p, fb) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8')) } catch { return fb } }

// island/alias → region id canonique.
function regionOf(island) {
  const i = norm(island)
  if (i === 'gp') return 'gp'
  if (i === 'fl' || i === 'florida') return 'florida'
  if (i === 'pc' || i === 'puntacana') return 'puntacana'
  if (i === 'rm' || i === 'rivieramaya') return 'rivieramaya'
  if (i === 'tu' || i === 'tulum') return 'tulum'
  return 'mq'
}

// SLA opérationnel de fraîcheur (P0.118 §9) : 900 min, JAMAIS abaissé.
// Au-delà, l'historique ne peut plus porter une affirmation (« la semaine
// dernière… ») : le hook de données est alors rendu à `null` (fail-closed).
const SLA_MINUTES = 900

// Fraîcheur de l'historique d'une région (même source que avoidDaysLastWeek).
function historyFreshness(regionId) {
  const region = regionOf(regionId)
  const p = (region === 'mq' || region === 'gp')
    ? 'public/api/copernicus/history.json'
    : `public/api/copernicus/${region}/history.json`
  const h = load(p, { history: [] })
  const snaps = h.history || []
  let newest = null
  for (const s of snaps) {
    const d = Date.parse(s && s.date)
    if (Number.isFinite(d) && (newest === null || d > newest)) newest = d
  }
  if (newest === null) return { fresh: false, ageMinutes: Infinity, newestISO: null, reason: 'no_history' }
  const ageMinutes = Math.round((Date.now() - newest) / 60000)
  return {
    fresh: ageMinutes <= SLA_MINUTES,
    ageMinutes,
    newestISO: new Date(newest).toISOString(),
    reason: ageMinutes <= SLA_MINUTES ? null : 'sla_exceeded',
  }
}

// Hôtel par défaut ; collectivité si le contact sent la mairie/office/agglo.
function inferType(c) {
  const hay = norm((c.email || '') + ' ' + (c.name || '') + ' ' + (c.url || ''))
  if (/mairie|villede|communaute|agglo|officedetourisme|collectivite|prefecture|departement|syndicat|ccas|municip|ayuntamiento|alcaldia|citycouncil|cityof|tourismoffice|tourismboard/.test(hay)) return 'collectivite'
  if (/^(mairie|ville|accueil|tourisme|ot|cc|ca)[@.-]/.test(String(c.email || '').toLowerCase())) return 'collectivite'
  return 'hotel'
}

// Plages d'une commune : MQ/GP depuis beaches-list, USD depuis regions/<id>.json (inline).
function beachesForCommune(town, island) {
  const region = regionOf(island)
  let arr
  if (region === 'mq' || region === 'gp') {
    const raw = load('public/data/beaches-list.json', [])
    const all = Array.isArray(raw) ? raw : (raw.beaches || [])
    arr = all.filter(b => b.island === region)
  } else {
    const reg = load(`regions/${region}.json`, {})
    arr = reg.beaches || []
  }
  const t = norm(town)
  if (!t) return []
  return arr.filter(b => norm(b.commune) === t)
}

// Jours « à éviter » (avoid/moderate) sur les 7 derniers snapshots de l'historique de la région.
function avoidDaysLastWeek(beachId, island) {
  const region = regionOf(island)
  const p = (region === 'mq' || region === 'gp')
    ? 'public/api/copernicus/history.json'
    : `public/api/copernicus/${region}/history.json`
  const h = load(p, { history: [] })
  const snaps = (h.history || []).slice(-7)
  let d = 0
  for (const snap of snaps) {
    const lv = (snap.levels || []).find(x => x.id === beachId)
    if (lv && (lv.status === 'avoid' || lv.status === 'moderate')) d++
  }
  return d
}

function dataHook(c, type) {
  // FAIL-CLOSED : sans historique frais (SLA 900 min), aucune affirmation de
  // donnée n'est produite (ni « jours à éviter », ni « plages propres »).
  const fresh = historyFreshness(c && c.island)
  if (!fresh.fresh) return null
  const beaches = beachesForCommune(c.town, c.island)
  if (!beaches.length) return null
  if (type === 'collectivite') {
    const navoid = beaches.filter(b => avoidDaysLastWeek(b.id, c.island) > 0).length
    return { nbeaches: beaches.length, navoid }
  }
  const main = beaches[0] // commune → plage principale (heuristique : 1re listée)
  return { beach: main.name, avoidDays: avoidDaysLastWeek(main.id, c.island) }
}

// Résout une preuve B2B uniquement si le registre est frais et strictement régional.
// Un agrégat MQ+GP ne devient jamais une preuve propre à MQ ou GP ; une région absente
// du registre ne reçoit aucun chiffre. Le caller doit afficher le périmètre et la fenêtre.
function resolveLiveProof(tr, regionId) {
  const region = norm(regionId)
  if (!tr || typeof tr !== 'object' || tr.freshness?.stale !== false || !region) return null

  const regions = Array.isArray(tr.regions)
    ? [...new Set(tr.regions.map(value => norm(value)).filter(Boolean))]
    : []
  if (regions.length !== 1 || regions[0] !== region) return null

  const calm = tr.byRegime && tr.byRegime.calm
  const rawPct = calm && calm.cleanReliabilityPct
  const rawN = calm && calm.cleanSamples
  if (rawPct == null || rawN == null) return null
  const pct = Number(rawPct)
  const n = Number(rawN)
  const w = tr.window || tr.lifetime || {}
  const from = typeof w.from === 'string' ? w.from : ''
  const to = typeof w.to === 'string' ? w.to : ''
  if (!Number.isFinite(pct) || pct < 0 || pct > 100 ||
      !Number.isFinite(n) || n <= 0 || !from || !to) return null

  return { pct, n, from, to, region }
}

function liveProof(regionId) {
  const tr = load('public/api/copernicus/track-record.json', null)
  return resolveLiveProof(tr, regionId)
}

module.exports = { inferType, beachesForCommune, avoidDaysLastWeek, dataHook, liveProof, resolveLiveProof, regionOf, historyFreshness, SLA_MINUTES }
