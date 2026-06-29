// Edge Function `moderate` — valide/rejette une photo visiteur EN 1 TAP depuis l'email.
//
// Les emails d'alerte (scripts/automation/notify-new-photos.cjs) contiennent des liens :
//   {SUPABASE_URL}/functions/v1/moderate?id=<uuid>&action=approve|reject&token=<MODERATE_TOKEN>
// Un tap → cette fonction passe le `status` de la photo → la galerie l'affiche (approve)
// ou la masque (reject). Protégé par un jeton partagé MODERATE_TOKEN (sinon n'importe qui
// pourrait modérer). Utilise la clé service_role (auto-injectée) pour écrire malgré le RLS.
//
// DÉPLOIEMENT (dashboard Supabase, mobile, cf. docs/visitor-photos-runbook.md) :
//   - Edge Functions → Create function `moderate` → coller ce code → Deploy.
//   - ⚠️ Désactiver « Verify JWT » (le lien email n'a pas de JWT ; on protège par token).
//   - Secret de fonction : MODERATE_TOKEN = une chaîne aléatoire (la même qu'en secret GitHub).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

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

  const expected = Deno.env.get("MODERATE_TOKEN")
  if (!expected || token !== expected) return page("⛔", "Lien invalide ou expiré.", 403)
  if (!id || (action !== "approve" && action !== "reject")) return page("⛔", "Requête invalide.", 400)

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  )
  const status = action === "approve" ? "approved" : "rejected"
  const { error } = await supabase.from("photos").update({ status }).eq("id", id)
  if (error) return page("⚠️", "Erreur : " + error.message, 500)

  return action === "approve"
    ? page("✅", "Photo approuvée — elle est maintenant en ligne sur la fiche plage.")
    : page("❌", "Photo rejetée — elle ne sera pas affichée.")
})
