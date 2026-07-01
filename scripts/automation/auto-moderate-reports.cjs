#!/usr/bin/env node
/**
 * auto-moderate-reports — AUTO-modération des signalements terrain (beach_reports), ZÉRO action
 * fondateur. Remplace l'email 1-tap de notify-new-reports.cjs (conservé en fallback derrière le
 * kill-switch AUTO_MODERATE_REPORTS=0). Politique arrêtée par panel adverse (2026-07-01), bornée
 * au précédent DÉJÀ accepté du produit (consensus ≥3, ±1 cran, 48 h) et au moat honnêteté.
 *
 * Boucle (à chaque run, idempotente) :
 *   1. Poll beach_reports status='pending' (clé service_role).
 *   2. Regroupe par (beach_id|event). Un cluster est AUTO-APPROUVÉ (PATCH status='approved',
 *      filtré status=eq.pending = idempotent) si TOUT tient :
 *        • CONSENSUS : ≥3 empreintes submitter_hash DISTINCTES (NULL ne compte pas), 48 h.
 *        • PRÉSENCE : ≥2 de ces empreintes ont within_150m===true (GPS serveur « sur place »).
 *        • ANTI-BURST : l'écart entre la 1re et la dernière empreinte du consensus est ≥20 min
 *          (3 soumissions en <20 min = coordination/bot → reste pending, re-jugé plus tard).
 *        • BURST FREEZE : ≤3 empreintes NOUVELLES sur la plage dans la dernière heure.
 *        • CAP : au plus 8 empreintes comptées / plage / 48 h (surplus ignoré ; le cran reste
 *          plafonné à 1 par terrainDisplayStatus côté app).
 *        • COMPATIBLE SATELLITE (le garde moat) : on ne blanchit JAMAIS une alerte satellite
 *          fraîche confiante, ni ne peint une alerte contre un « clean » frais confiant. Voir
 *          satBlocks(). Un cluster incompatible reste pending (défaut sûr = silence).
 *   3. Avant d'approuver, NULLIFIE les notes toxiques (sanitize-note.cjs) — le sens beaching/
 *      cleanup ne dépend jamais de la note.
 *   4. Purge RGPD : supprime les lignes de plus de 30 j (aucune coordonnée GPS n'est stockée —
 *      within_150m est un booléen ; cf. Edge Function submit-report).
 *
 * Le verdict de couleur reste satellite-first : approuver un événement ne fait que déclencher
 * terrainDisplayStatus (±1 cran, 48 h, borné, calque « Terrain » nommé à côté du satellite) —
 * comportement DÉJÀ en prod, ici seulement automatisé. Rollback : AUTO_MODERATE_REPORTS=0 (ce
 * cron no-op → email fallback) ; ?ramassage=0 (coupe le calque) ; ?descente=0 (coupe la couleur).
 *
 * Env (secrets GitHub) : SUPABASE_SERVICE_KEY (obligatoire), SUPABASE_URL (optionnel),
 * AUTO_MODERATE_REPORTS ('0' → skip).
 * Usage : node scripts/automation/auto-moderate-reports.cjs
 */
const fs = require('fs')
const path = require('path')
const { sanitizeNote } = require('./lib/sanitize-note.cjs')

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rswdmjtdzrucqzzukfmd.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || ''
const ENABLED = process.env.AUTO_MODERATE_REPORTS !== '0'
const root = path.join(__dirname, '..', '..')

const CONSENSUS_MIN = 3
const PRESENCE_MIN = 2          // ≥2 within_150m parmi les empreintes du consensus
const RECENT_MS = 48 * 3600 * 1000
const BURST_SPREAD_MS = 20 * 60 * 1000   // écart mini 1re↔dernière empreinte
const FREEZE_WINDOW_MS = 60 * 60 * 1000  // fenêtre du burst-freeze
const FREEZE_MAX_NEW = 3                  // > ce nombre d'empreintes nouvelles/h → gel
const COUNT_CAP = 8                        // empreintes comptées max / plage / 48 h
const PURGE_MS = 30 * 24 * 3600 * 1000     // RGPD : purge > 30 j
const SAT_FRESH_MIN = 1440                 // < 24 h pour être « frais »
const SAT_SURE_CONF = 70                   // confiance ≥ 70 = lecture satellite directe fiable

function svcHeaders(extra) {
  return Object.assign({ apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY }, extra || {})
}

// Mapping plage → zone satellite : SEULE source = SARG_TO_BEACH (src/Sargasses_PROD.jsx L1195,
// 20 zones MQ/GP). On l'extrait par regex (objet JSON plat, une ligne) pour ne PAS le dupliquer.
// Les plages hors zones-repères sont INTERPOLÉES (confiance <55, jamais « satellite-sûr ») →
// non résolues ici = jamais bloquées sur la fraîcheur (le terrain a de la valeur là où le
// satellite est aveugle, verdict panel).
function loadBeachToSarg() {
  try {
    const src = fs.readFileSync(path.join(root, 'src', 'Sargasses_PROD.jsx'), 'utf8')
    const m = src.match(/SARG_TO_BEACH=(\{[^}]*\})/)
    const s2b = m ? JSON.parse(m[1]) : {}
    const b2s = {}
    for (const [sarg, beach] of Object.entries(s2b)) b2s[beach] = sarg
    return b2s
  } catch (_) { return {} }
}
function loadSarg() {
  try { return JSON.parse(fs.readFileSync(path.join(root, 'public', 'api', 'copernicus', 'sargassum.json'), 'utf8')) }
  catch (_) { return null }
}

// Résout la lecture satellite {status, confidence} d'un signalement, ou null si non résoluble.
function resolveSat(r, sarg, b2s, levelById) {
  if (!sarg || !levelById) return null
  // mq/gp → zone-repère via BEACH_TO_SARG ; autres régions → l'id de plage EST l'id sarg.
  const sargId = (r.island === 'mq' || r.island === 'gp') ? b2s[r.beach_id] : r.beach_id
  return sargId && levelById[sargId] ? levelById[sargId] : null
}
// Le garde moat : true = APPROUVER bougerait la couleur d'une façon interdite → on n'approuve pas.
function satBlocks(event, sat, sarg) {
  if (!sat) return false // satellite aveugle sur cette plage → mouvement autorisé (panel)
  const sure = sarg && !sarg.stale && (sarg.dataAgeMinutes == null || sarg.dataAgeMinutes < SAT_FRESH_MIN) && (sat.confidence >= SAT_SURE_CONF)
  if (!sure) return false
  // cleanup ne BLANCHIT jamais une alerte satellite fraîche confiante (fausse propreté = danger)
  if (event === 'cleanup' && (sat.status === 'moderate' || sat.status === 'avoid')) return true
  // beaching ne PEINT pas d'algue contre un « clean » frais confiant (reste calque hedgé)
  if (event === 'beaching' && sat.status === 'clean') return true
  return false
}

async function main() {
  if (!ENABLED) { console.log('[auto-moderate] AUTO_MODERATE_REPORTS=0 → skip (fallback email actif)'); return }
  if (!SERVICE_KEY) { console.log('[auto-moderate] SUPABASE_SERVICE_KEY manquant — skip'); return }

  // 1) Poll pending
  let rows
  try {
    const q = 'status=eq.pending&select=id,beach_id,beach_name,island,event,note,photo_url,within_150m,submitter_hash,created_at&order=created_at.asc&limit=500'
    const res = await fetch(`${SUPABASE_URL}/rest/v1/beach_reports?${q}`, { headers: svcHeaders(), signal: AbortSignal.timeout(20000) })
    if (res.status === 404) { console.log('[auto-moderate] table beach_reports absente — skip'); return }
    if (!res.ok) { console.warn(`[auto-moderate] lecture HTTP ${res.status}`); return }
    rows = await res.json()
  } catch (e) { console.warn('[auto-moderate] lecture échouée:', e.message); return }
  if (!Array.isArray(rows)) { console.warn('[auto-moderate] réponse inattendue'); return }

  const sarg = loadSarg()
  const b2s = loadBeachToSarg()
  const levelById = {}
  if (sarg && sarg.levels) for (const lv of Object.values(sarg.levels)) if (lv && lv.id) levelById[lv.id] = lv

  const now = Date.now()
  const ts = (r) => { try { return new Date(r.created_at).getTime() } catch (_) { return now } }
  const clusterKey = (r) => `${r.beach_id || r.beach_name}|${r.event}`

  // 2) Regroupe et évalue
  const clusters = {}
  for (const r of rows) {
    if (now - ts(r) > RECENT_MS) continue // hors fenêtre 48 h → ne compte pas
    ;(clusters[clusterKey(r)] = clusters[clusterKey(r)] || []).push(r)
  }

  const toApprove = []   // ids à passer approved
  const toNullify = []   // ids dont la note est nullifiée
  let approvedClusters = 0
  for (const [key, group] of Object.entries(clusters)) {
    // empreinte → 1re occurrence (dédup) ; NULL ne compte pas dans le consensus
    const byHash = new Map()
    for (const r of group) {
      if (!r.submitter_hash) continue
      const prev = byHash.get(r.submitter_hash)
      if (!prev || ts(r) < ts(prev)) byHash.set(r.submitter_hash, r)
    }
    let firsts = [...byHash.values()].sort((a, b) => ts(a) - ts(b))
    if (firsts.length > COUNT_CAP) firsts = firsts.slice(0, COUNT_CAP) // cap plage/48 h
    if (firsts.length < CONSENSUS_MIN) continue // pas de consensus
    const presence = firsts.filter((r) => r.within_150m === true).length
    if (presence < PRESENCE_MIN) continue // pas assez de « sur place »
    const spread = ts(firsts[firsts.length - 1]) - ts(firsts[0])
    if (spread < BURST_SPREAD_MS) continue // rafale = coordination → attend
    const newLastHour = firsts.filter((r) => now - ts(r) < FREEZE_WINDOW_MS).length
    if (newLastHour > FREEZE_MAX_NEW) continue // burst-freeze anti-brigading
    // garde moat : compatibilité satellite
    const event = group[0].event
    const sat = resolveSat(group[0], sarg, b2s, levelById)
    if (satBlocks(event, sat, sarg)) {
      console.log(`[auto-moderate] HELD (conflit satellite) ${key} — sat=${sat ? sat.status + '/' + sat.confidence : 'n/a'}`)
      continue
    }
    // ✅ cluster validé → approuver TOUTES ses lignes pending de la fenêtre
    approvedClusters++
    for (const r of group) {
      toApprove.push(r.id)
      if (r.note != null && sanitizeNote(r.note) === null) toNullify.push(r.id)
    }
    console.log(`[auto-moderate] APPROVE ${key} — ${firsts.length} empreintes, ${presence} sur place, sat=${sat ? sat.status + '/' + sat.confidence : 'aveugle'}`)
  }

  // 3a) Nullifier les notes toxiques AVANT de publier
  for (const id of toNullify) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/beach_reports?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH', headers: svcHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
        body: JSON.stringify({ note: null }),
      })
    } catch (e) { console.warn('[auto-moderate] nullify note échoué', id, e.message) }
  }

  // 3b) Approuver (filtre status=eq.pending = idempotent, ne retouche jamais une ligne tranchée)
  if (toApprove.length) {
    const filter = 'id=in.(' + toApprove.map((i) => `"${i}"`).join(',') + ')&status=eq.pending'
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/beach_reports?${filter}`, {
        method: 'PATCH', headers: svcHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
        body: JSON.stringify({ status: 'approved' }),
      })
      if (!res.ok) console.warn(`[auto-moderate] approbation HTTP ${res.status}`)
    } catch (e) { console.warn('[auto-moderate] approbation échouée:', e.message) }
  }
  console.log(`[auto-moderate] ${approvedClusters} cluster(s) approuvé(s), ${toApprove.length} ligne(s), ${toNullify.length} note(s) nullifiée(s)`)

  // 4) Purge RGPD : lignes > 30 j (aucune coordonnée GPS stockée — within_150m booléen seul)
  try {
    const cutoff = new Date(now - PURGE_MS).toISOString()
    const res = await fetch(`${SUPABASE_URL}/rest/v1/beach_reports?created_at=lt.${encodeURIComponent(cutoff)}`, {
      method: 'DELETE', headers: svcHeaders({ Prefer: 'return=minimal' }),
    })
    if (!res.ok && res.status !== 404) console.warn(`[auto-moderate] purge HTTP ${res.status}`)
  } catch (e) { console.warn('[auto-moderate] purge échouée:', e.message) }
}

// process.exit explicite (fetch keep-alive peut garder l'event loop vivant).
main().then(() => process.exit(0)).catch((e) => { console.error('[auto-moderate]', e && e.message); process.exit(0) })
