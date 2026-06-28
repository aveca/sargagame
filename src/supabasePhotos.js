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
