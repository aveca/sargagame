#!/usr/bin/env node
/**
 * auto-moderate-photos — pré-filtre NSFW AUTOMATIQUE des photos visiteurs, GRATUIT (modèle
 * open-source nsfwjs / TensorFlow.js, auto-hébergé, ZÉRO clé API, ZÉRO crédit IA).
 *
 * Tourne AVANT notify-new-photos.cjs dans notify-photos.yml. Pour chaque photo `pending` :
 *   - EXPLICITE (Porn+Hentai à haute confiance)  → status='rejected' (jamais affichée, ZÉRO email).
 *   - PROPRE (Neutral/Drawing, sans signal sexuel) → status='approved' (affichée, ZÉRO email).
 *   - ZONE GRISE (Sexy / confiance moyenne, ex. maillot de bain) → reste 'pending' → l'email 1-tap
 *     de notify-new-photos.cjs prend le relais (décision humaine). On NE rejette JAMAIS un « Sexy »
 *     seul : une vraie photo de plage avec baigneurs ne doit pas être supprimée à tort.
 *
 * Dégradation SÛRE : si le modèle ne charge pas, une image ne se décode pas, ou le classifieur
 * échoue → la photo reste 'pending' (donc emailée = flux manuel actuel). Jamais d'auto-approbation
 * à l'aveugle sur erreur. Le moat photo (« held-par-défaut-si-douteux ») est respecté.
 *
 * Deps installées à la volée dans le workflow (npm install --no-save nsfwjs @tensorflow/tfjs
 * jpeg-js pngjs) — PAS dans package.json, pour ne pas alourdir les autres workflows.
 *
 * Env : SUPABASE_SERVICE_KEY (obligatoire), SUPABASE_URL (optionnel), AUTO_MODERATE_PHOTOS ('0' → skip).
 * Usage : node scripts/automation/auto-moderate-photos.cjs
 */
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rswdmjtdzrucqzzukfmd.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || ''
const ENABLED = process.env.AUTO_MODERATE_PHOTOS !== '0'
const MAX_PER_RUN = 25

// Seuils (nsfwjs : Drawing, Hentai, Neutral, Porn, Sexy). Conservateurs :
//  - on ne REJETTE que l'explicite net (Porn+Hentai) — jamais un « Sexy » seul (faux positif plage) ;
//  - on n'APPROUVE que le clairement propre ; tout le reste → zone grise humaine.
const REJECT_NSFW = 0.70   // Porn+Hentai ≥ 0.70 → rejet auto
const APPROVE_SAFE = 0.70  // Neutral+Drawing ≥ 0.70 …
const APPROVE_NSFW_MAX = 0.15 // … ET Porn+Hentai < 0.15 …
const APPROVE_SEXY_MAX = 0.40 // … ET Sexy < 0.40 → approbation auto

function svcHeaders(extra) {
  return Object.assign({ apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY }, extra || {})
}

// Décision pure (testable) à partir des scores nsfwjs normalisés {neutral,drawing,sexy,porn,hentai}.
function decide(s) {
  const nsfw = (s.porn || 0) + (s.hentai || 0)
  const safe = (s.neutral || 0) + (s.drawing || 0)
  if (nsfw >= REJECT_NSFW) return 'rejected'
  if (safe >= APPROVE_SAFE && nsfw < APPROVE_NSFW_MAX && (s.sexy || 0) < APPROVE_SEXY_MAX) return 'approved'
  return 'gray' // reste pending → email humain
}

// Décode un buffer image (JPEG ou PNG) en tensor3d int32 [h,w,3] (RGB). null si non décodable.
function toTensor(tf, buf) {
  const b = new Uint8Array(buf)
  let px // {data:RGBA, width, height}
  try {
    if (b[0] === 0x89 && b[1] === 0x50) { // PNG
      const { PNG } = require('pngjs')
      const p = PNG.sync.read(Buffer.from(b))
      px = { data: p.data, width: p.width, height: p.height }
    } else { // JPEG (défaut)
      const jpeg = require('jpeg-js')
      px = jpeg.decode(b, { useTArray: true, maxMemoryUsageInMB: 512 })
    }
  } catch (_) { return null }
  if (!px || !px.width || !px.height) return null
  const n = px.width * px.height
  const rgb = new Uint8Array(n * 3)
  for (let i = 0; i < n; i++) { rgb[i * 3] = px.data[i * 4]; rgb[i * 3 + 1] = px.data[i * 4 + 1]; rgb[i * 3 + 2] = px.data[i * 4 + 2] }
  try { return tf.tensor3d(rgb, [px.height, px.width, 3], 'int32') } catch (_) { return null }
}

async function main() {
  if (!ENABLED) { console.log('[photos-nsfw] AUTO_MODERATE_PHOTOS=0 → skip'); return }
  if (!SERVICE_KEY) { console.log('[photos-nsfw] SUPABASE_SERVICE_KEY manquant — skip'); return }

  let tf, nsfw, model
  try {
    tf = require('@tensorflow/tfjs') // backend CPU pur (pas de binaire natif → robuste toute version Node)
    nsfw = require('nsfwjs')
    await tf.ready()
    model = await nsfw.load() // modèle MobileNetV2 hébergé nsfwjs (statique, gratuit, sans clé)
  } catch (e) {
    console.warn('[photos-nsfw] modèle indisponible → skip (photos restent pending, emailées):', e && e.message)
    return
  }

  // Poll photos jamais encore traitées/escaladées.
  let rows
  try {
    const q = `status=eq.pending&notified=is.false&select=id,beach_id,url,created_at&order=created_at.asc&limit=${MAX_PER_RUN}`
    const res = await fetch(`${SUPABASE_URL}/rest/v1/photos?${q}`, { headers: svcHeaders(), signal: AbortSignal.timeout(20000) })
    if (res.status === 404) { console.log('[photos-nsfw] table photos absente — skip'); return }
    if (!res.ok) { console.warn(`[photos-nsfw] lecture HTTP ${res.status}`); return }
    rows = await res.json()
  } catch (e) { console.warn('[photos-nsfw] lecture échouée:', e.message); return }
  if (!Array.isArray(rows) || !rows.length) { console.log('[photos-nsfw] aucune photo à filtrer'); return }

  let approved = 0, rejected = 0, gray = 0, errored = 0
  for (const r of rows) {
    let verdict = 'gray'
    try {
      const imgRes = await fetch(r.url, { signal: AbortSignal.timeout(20000) })
      if (!imgRes.ok) { errored++; continue } // téléchargement KO → reste pending (emailée)
      const buf = await imgRes.arrayBuffer()
      const t = toTensor(tf, buf)
      if (!t) { errored++; continue } // non décodable → reste pending (emailée)
      let preds
      try { preds = await model.classify(t) } finally { t.dispose() }
      const s = {}
      for (const p of preds) s[String(p.className).toLowerCase()] = p.probability
      verdict = decide(s)
      console.log(`[photos-nsfw] ${r.id} → ${verdict} (porn=${(s.porn || 0).toFixed(2)} hentai=${(s.hentai || 0).toFixed(2)} sexy=${(s.sexy || 0).toFixed(2)} neutral=${(s.neutral || 0).toFixed(2)})`)
    } catch (e) { console.warn('[photos-nsfw] classification échouée', r.id, e.message); errored++; continue }

    if (verdict === 'gray') { gray++; continue } // laisse pending → email humain
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/photos?id=eq.${encodeURIComponent(r.id)}&status=eq.pending`, {
        method: 'PATCH', headers: svcHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
        body: JSON.stringify({ status: verdict }),
      })
      if (!res.ok) { console.warn(`[photos-nsfw] PATCH ${verdict} HTTP ${res.status}`); errored++; continue }
      if (verdict === 'approved') approved++; else rejected++
    } catch (e) { console.warn('[photos-nsfw] PATCH échoué', r.id, e.message); errored++ }
  }
  console.log(`[photos-nsfw] ${approved} approuvée(s), ${rejected} rejetée(s), ${gray} zone-grise (→ email), ${errored} erreur(s)`)
}

module.exports = { decide } // pour tests unitaires

if (require.main === module) {
  main().then(() => process.exit(0)).catch((e) => { console.error('[photos-nsfw]', e && e.message); process.exit(0) })
}
