// Edge Function `moderate` — valide/rejette une photo OU un signalement terrain EN 1 TAP
// depuis l'email de modération.
//
// Les emails d'alerte (scripts/automation/notify-new-photos.cjs pour les photos,
// notify-new-reports.cjs pour les événements terrain) contiennent des liens :
//   {SUPABASE_URL}/functions/v1/moderate?id=<uuid>&action=approve|reject&token=<MODERATE_TOKEN>
//   ...&table=beach_reports        (défaut = photos, rétro-compatible)
//   ...&action=confirm_downgrade&table=beach_reports   (clé 2 : rétrograder le verdict)
//
// Un tap → cette fonction passe le `status` (approve/reject) OU pose la clé 2 de descente
// (confirm_downgrade, cf. docs/GROUND_TRUTH_TERRAIN.md — Étage 2). Protégé par un jeton
// partagé MODERATE_TOKEN. Utilise la clé service_role (auto-injectée) pour écrire malgré le RLS.
//
// DÉPLOIEMENT : via .github/workflows/deploy-edge-function.yml (workflow_dispatch, secret
// SUPABASE_ACCESS_TOKEN) — « Verify JWT » désactivé (config.toml), on protège par token.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// Tables modérables (allowlist stricte : aucune autre table n'est atteignable).
const TABLES = new Set(["photos", "beach_reports"])

function page(emoji: string, msg: string, code = 200): Response {
  return new Response(
    `<!doctype html><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<body style="font-family:system-ui;display:flex;min-height:88vh;align-items:center;justify-content:center;text-align:center;padding:24px">` +
    `<div><div style="font-size:48px">${emoji}</div>` +
    `<p style="font-size:18px;color:#1d2b3a;max-width:320px">${msg}</p></div></body>`,
    { status: code, headers: { "content-type": "text/html; charset=utf-8" } },
  )
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const id = url.searchParams.get("id")
  const action = url.searchParams.get("action")
  const token = url.searchParams.get("token")
  const table = url.searchParams.get("table") || "photos"

  const expected = Deno.env.get("MODERATE_TOKEN")
  if (!expected || token !== expected) return page("⛔", "Lien invalide ou expiré.", 403)
  if (!TABLES.has(table)) return page("⛔", "Cible invalide.", 400)
  // confirm_downgrade (clé 2 de descente) n'existe que pour les signalements terrain.
  const validAction = action === "approve" || action === "reject" ||
    (action === "confirm_downgrade" && table === "beach_reports")
  if (!id || !validAction) return page("⛔", "Requête invalide.", 400)

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  )

  // Clé 2 — « Rétrograder le verdict » (Étage 2, docs/GROUND_TRUTH_TERRAIN.md). N'agit que
  // sur un cleanup DÉJÀ approuvé (clé 1) : pose l'horodatage qui autorisera la lane descente
  // à bouger la couleur d'1 cran côté front (Phase 2). Ne touche jamais l'AFAI ni la date.
  if (action === "confirm_downgrade") {
    const { error } = await supabase.from("beach_reports")
      .update({ status: "approved", downgrade_confirmed_at: new Date().toISOString() })
      .eq("id", id).eq("event", "cleanup")
    if (error) return page("⚠️", "Erreur : " + error.message, 500)
    return page("⬇️", "Verdict rétrogradé — le calque « Terrain » s'appliquera (1 cran, 48 h, la mesure satellite reste affichée à côté).")
  }

  const status = action === "approve" ? "approved" : "rejected"
  const { error } = await supabase.from(table).update({ status }).eq("id", id)
  if (error) return page("⚠️", "Erreur : " + error.message, 500)

  const isPhoto = table === "photos"
  return action === "approve"
    ? page("✅", isPhoto
        ? "Photo approuvée — elle est maintenant en ligne sur la fiche plage."
        : "Signalement approuvé — il s'affiche désormais sur la fiche plage.")
    : page("❌", isPhoto
        ? "Photo rejetée — elle ne sera pas affichée."
        : "Signalement rejeté — il ne sera pas affiché.")
})
