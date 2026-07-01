// Edge Function `submit-report` — point d'entrée des signalements terrain (beaching/cleanup).
//
// Pourquoi passer par une fonction plutôt que l'insert REST direct (cf. supabasePhotos.js) :
//   1. EMPREINTE SERVEUR `submitter_hash` = SHA-256(uid client + IP + salt secret). L'IP n'est
//      visible que côté serveur → un attaquant ne peut pas s'auto-attribuer N empreintes
//      « distinctes » depuis la même machine. Base de la dédup anti-flood + du tri de la file
//      de modération (cf. docs/GROUND_TRUTH_TERRAIN.md).
//   2. THROTTLE SERVEUR : 1 signalement / empreinte / plage / 12 h (le cooldown localStorage
//      du front est décoratif, pas une sécurité).
//   3. RGPD : la coordonnée GPS brute n'est JAMAIS reçue ici — le front calcule lui-même la
//      présence (`on_site` booléen, distance locale à la plage) et n'envoie que le booléen,
//      stocké en `within_150m`. Zéro coordonnée persistée. (Aide le fondateur à juger ; jamais
//      preuve seule — le vrai verrou reste sa validation manuelle de la photo.)
//
// La couleur du verdict n'est JAMAIS touchée ici : cette fonction ne fait qu'insérer un
// signalement `status='pending'`. Modération = notify-new-reports.cjs + Edge Function moderate.
//
// DÉPLOIEMENT : .github/workflows/deploy-edge-function.yml (workflow_dispatch, SUPABASE_ACCESS_TOKEN).
// verify_jwt=false (config.toml) : appel anonyme depuis l'app, protégé par empreinte + throttle.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } })

const EVENTS = new Set(["beaching", "cleanup"])
const THROTTLE_MS = 12 * 3600 * 1000

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("")
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "POST") return json({ error: "method" }, 405)

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: "bad json" }, 400) }

  const beach_id = typeof body.beach_id === "string" ? body.beach_id.slice(0, 120) : ""
  const event = typeof body.event === "string" ? body.event : ""
  const uid = typeof body.uid === "string" ? body.uid.slice(0, 80) : ""
  if (!beach_id || !EVENTS.has(event)) return json({ error: "invalid" }, 400)

  // Empreinte serveur : uid client + IP (en-tête, jamais fournie par le client) + salt secret.
  const ipRaw = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || ""
  const ip = ipRaw.split(",")[0].trim()
  const salt = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "" // secret serveur, jamais exposé
  const submitter_hash = await sha256Hex(`${uid}|${ip}|${salt}`)

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  )

  // Throttle : même empreinte + même plage dans les 12 h → on ne ré-insère pas (idempotent,
  // succès silencieux pour ne pas casser l'UX ; le front a déjà montré « Merci »).
  const since = new Date(Date.now() - THROTTLE_MS).toISOString()
  const { data: dup, error: qErr } = await supabase.from("beach_reports")
    .select("id").eq("beach_id", beach_id).eq("submitter_hash", submitter_hash)
    .gte("created_at", since).limit(1)
  if (qErr) return json({ error: "query" }, 500)
  if (dup && dup.length) return json({ ok: true, deduped: true })

  const within_150m = typeof body.on_site === "boolean" ? body.on_site : null
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 280) : null
  const photo_url = typeof body.photo_url === "string" ? body.photo_url.slice(0, 500) : null

  const { error } = await supabase.from("beach_reports").insert({
    beach_id,
    beach_name: typeof body.beach_name === "string" ? body.beach_name.slice(0, 200) : null,
    island: typeof body.island === "string" ? body.island.slice(0, 80) : null,
    event,
    note,
    photo_url,
    submitter_hash,
    within_150m,
    status: "pending",
  })
  if (error) return json({ error: "insert" }, 500)
  return json({ ok: true })
})
