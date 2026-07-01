/**
 * supabasePhotos — backend PHOTOS VISITEURS sur Supabase (100 % gérable au mobile).
 *
 * Pourquoi Supabase ici (et pas Apps Script) : le fondateur est 100 % mobile et
 * `clasp push` exige un ordinateur. Supabase se configure au dashboard web (mobile)
 * et l'app lui parle en HTTP direct → zéro CLI, zéro ordinateur. On garde le reste
 * de la stack (static-bake + Apps Script) inchangé : ceci est CHIRURGICAL, pas une
 * migration globale (qui n'apporterait aucun gain de perf — le JSON statique CDN est
 * déjà optimal en lecture).
 *
 * Pas de dépendance : on tape l'API REST + Storage de Supabase au `fetch` brut.
 * La clé anon est PUBLIQUE par design (la sécurité vient des policies RLS) → ok à
 * embarquer côté client.
 *
 * Setup (cf. docs/visitor-photos-runbook.md) :
 *   1. créer un projet Supabase (dashboard web, mobile),
 *   2. coller supabase/schema.sql (table `photos` + RLS + bucket `beach-photos`),
 *   3. renseigner SUPABASE_URL + SUPABASE_ANON_KEY ci-dessous (le fondateur me les
 *      donne, je commit → auto-deploy). Tant que vide → fonctionnalité OFF (no-op).
 */

// Valeurs PUBLIQUES (clé publishable conçue pour le client ; la sécurité = RLS).
export const SUPABASE_URL = "https://rswdmjtdzrucqzzukfmd.supabase.co"
export const SUPABASE_ANON_KEY = "sb_publishable_EnUyZjHbluk9Adumxhwcbw_nmDE8vMz"

const BUCKET = "beach-photos"

export function supabaseConfigured() {
  return !!(SUPABASE_URL && SUPABASE_ANON_KEY)
}

function headers(extra) {
  return Object.assign({
    apikey: SUPABASE_ANON_KEY,
    Authorization: "Bearer " + SUPABASE_ANON_KEY,
  }, extra || {})
}

/**
 * Upload d'une photo (data URL JPEG déjà redimensionnée + EXIF strippée).
 * → Storage bucket public `beach-photos`, puis ligne `photos` en status 'pending'.
 * Renvoie true si OK. Modération ensuite côté dashboard (status → 'approved').
 */
export async function uploadBeachPhoto(beach, level, dataUrl) {
  if (!supabaseConfigured()) return false
  const blob = await (await fetch(dataUrl)).blob()
  const objectName = `${beach.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`

  const up = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${objectName}`, {
    method: "POST",
    headers: headers({ "Content-Type": "image/jpeg", "x-upsert": "false" }),
    body: blob,
  })
  if (!up.ok) throw new Error("storage " + up.status)

  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${objectName}`
  const row = await fetch(`${SUPABASE_URL}/rest/v1/photos`, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json", Prefer: "return=minimal" }),
    body: JSON.stringify({
      beach_id: beach.id,
      beach_name: beach.name,
      island: beach.island || null,
      level: level || null,
      url: publicUrl,
      status: "pending",
    }),
  })
  if (!row.ok) throw new Error("insert " + row.status)
  return true
}

/**
 * Photos APPROUVÉES d'une plage (récent → ancien). RLS ne sert que status='approved'.
 * Renvoie [{url, ts, level}].
 */
export async function fetchApprovedPhotos(beachId, limit = 12) {
  if (!supabaseConfigured()) return []
  const q = `beach_id=eq.${encodeURIComponent(beachId)}&status=eq.approved` +
    `&select=url,level,created_at&order=created_at.desc&limit=${limit}`
  const res = await fetch(`${SUPABASE_URL}/rest/v1/photos?${q}`, { headers: headers() })
  if (!res.ok) return []
  const rows = await res.json()
  return (Array.isArray(rows) ? rows : []).map((r) => ({ url: r.url, ts: r.created_at, level: r.level || "" }))
}

// Identifiant device stable (anonyme, localStorage) — sert d'entrée à l'empreinte serveur
// `submitter_hash` (l'Edge Function y ajoute l'IP + un salt secret). Pas de PII : aléa opaque.
// Best-effort si localStorage est indisponible (mode privé strict).
function sgUid() {
  try {
    let u = localStorage.getItem("sg_uid")
    if (!u) { u = "u_" + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem("sg_uid", u) }
    return u
  } catch (_) { return "" }
}

/**
 * Signale un ÉVÉNEMENT terrain sur une plage — `beaching` (algues arrivées) ou
 * `cleanup` (ramassage effectué). Deux transitions que le satellite ne voit pas.
 * Passe par l'Edge Function `submit-report` (empreinte serveur submitter_hash + throttle
 * 12 h + within_150m ; cf. supabase/functions/submit-report). Fallback = insert REST direct
 * si la fonction est indisponible (résilience : ne jamais casser le signalement). Le row
 * reste `status='pending'` → modéré avant affichage, ne touche jamais la couleur du verdict.
 * Renvoie true si le signalement est passé.
 * @param {object} p - { beach, event:'beaching'|'cleanup', note?, photoUrl?, onSite? }
 */
export async function submitBeachReport({ beach, event, note, photoUrl, onSite } = {}) {
  if (!supabaseConfigured()) return false
  if (!beach || !beach.id) return false
  if (event !== "beaching" && event !== "cleanup") return false
  const trimmedNote = note ? String(note).trim().slice(0, 280) : null
  // 1) Chemin nominal : Edge Function (empreinte serveur + throttle).
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/submit-report`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        beach_id: beach.id,
        beach_name: beach.name || null,
        island: beach.island || null,
        event,
        note: trimmedNote,
        photo_url: photoUrl || null,
        uid: sgUid(),
        on_site: typeof onSite === "boolean" ? onSite : undefined,
      }),
    })
    if (res.ok) return true
    if (res.status >= 400 && res.status < 500) return false // refus légitime (payload) → pas de fallback
  } catch (_) { /* réseau/fonction KO → fallback ci-dessous */ }
  // 2) Fallback : insert REST direct (submitter_hash restera NULL, sans effet sur la modération).
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/beach_reports`, {
      method: "POST",
      headers: headers({ "Content-Type": "application/json", Prefer: "return=minimal" }),
      body: JSON.stringify({
        beach_id: beach.id,
        beach_name: beach.name || null,
        island: beach.island || null,
        event,
        note: trimmedNote,
        photo_url: photoUrl || null,
        status: "pending",
      }),
    })
    return res.ok
  } catch (_) { return false }
}

/**
 * Événements terrain APPROUVÉS d'une plage (récent → ancien). RLS ne sert que
 * status='approved'. Renvoie [{event, ts, note}].
 */
export async function fetchApprovedReports(beachId, limit = 20) {
  if (!supabaseConfigured()) return []
  const q = `beach_id=eq.${encodeURIComponent(beachId)}&status=eq.approved` +
    `&select=event,note,created_at&order=created_at.desc&limit=${limit}`
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/beach_reports?${q}`, { headers: headers() })
    if (!res.ok) return []
    const rows = await res.json()
    return (Array.isArray(rows) ? rows : []).map((r) => ({ event: r.event, ts: r.created_at, note: r.note || "" }))
  } catch (_) { return [] }
}

/**
 * Dépose une intention de séjour « planner » (hub premium La Vigie) → table
 * `planner_alerts` (RLS insert-only, la lecture reste privée côté service). Le cron
 * scripts/automation/planner-alerts.cjs enverra le rappel J-7. Fire-and-forget,
 * best-effort : toute erreur (table absente, réseau) est avalée → jamais bloquant,
 * jamais de promesse UI cassée (l'app ne promet le ping qu'une fois le cron actif).
 * `domain` = hostname réel → le rappel pointe la bonne région sans mapping serveur.
 * Renvoie true si l'insert a réussi.
 */
export async function savePlannerAlert({ email, region, beachId, beachName, tripDate, lang } = {}) {
  if (!supabaseConfigured()) return false
  if (!email || !tripDate) return false
  let domain = ""
  try { domain = (location.hostname || "").replace(/^www\./, "") } catch (_) {}
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/planner_alerts`, {
      method: "POST",
      headers: headers({ "Content-Type": "application/json", Prefer: "return=minimal" }),
      body: JSON.stringify({
        email: String(email).trim().slice(0, 200).toLowerCase(),
        domain: domain || null,
        region: region || null,
        beach_id: beachId || null,
        beach_name: beachName || null,
        trip_date: tripDate,       // 'YYYY-MM-DD'
        lang: lang || null,
        notified: false,
      }),
    })
    return res.ok
  } catch (_) { return false }
}
