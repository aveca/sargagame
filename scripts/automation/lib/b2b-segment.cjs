/**
 * b2b-segment — segmentation B2B déterministe (ZÉRO IA) pour personnaliser le cold outreach.
 *
 * À partir d'un contact {email,name,town,island,url} :
 *   - inferType()  → 'hotel' | 'collectivite' (heuristique email/nom/url)
 *   - dataHook()   → la VRAIE donnée récente de sa/ses plage(s), depuis nos JSON publics :
 *       hôtel        : { beach, avoidDays }  (jours « à éviter/modéré » la semaine passée)
 *       collectivité : { nbeaches, navoid }  (sur ses N plages, combien ont eu ≥1 jour à éviter)
 *     → null si la commune ne matche aucune plage suivie (l'appelant retombe sur le copy générique).
 *   - liveProof()  → { pct, n, from, to } depuis track-record.json (méthode auditée, jamais figée).
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
  return 'mq'
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
  const beaches = beachesForCommune(c.town, c.island)
  if (!beaches.length) return null
  if (type === 'collectivite') {
    const navoid = beaches.filter(b => avoidDaysLastWeek(b.id, c.island) > 0).length
    return { nbeaches: beaches.length, navoid }
  }
  const main = beaches[0] // commune → plage principale (heuristique : 1re listée)
  return { beach: main.name, avoidDays: avoidDaysLastWeek(main.id, c.island) }
}

// Preuve LIVE de la MÉTHODE (même pipeline toutes régions) — jamais un chiffre figé.
function liveProof() {
  const tr = load('public/api/copernicus/track-record.json', null)
  if (!tr) return null
  const calm = tr.byRegime && tr.byRegime.calm
  const pct = calm && calm.cleanReliabilityPct != null ? calm.cleanReliabilityPct
    : (tr.overall && tr.overall.statusHitRatePct) || (tr.lifetime && tr.lifetime.statusHitRatePct)
  const n = (calm && calm.cleanSamples) || (tr.window && tr.window.sampleSize) || (tr.lifetime && tr.lifetime.sampleSize)
  const w = tr.window || tr.lifetime || {}
  if (pct == null) return null
  return { pct, n: n || null, from: w.from || null, to: w.to || null }
}

module.exports = { inferType, beachesForCommune, avoidDaysLastWeek, dataHook, liveProof, regionOf }
