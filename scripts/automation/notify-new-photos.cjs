#!/usr/bin/env node
/**
 * notify-new-photos — alerte email des NOUVELLES photos visiteurs à modérer (1-tap).
 *
 * Poll Supabase pour les photos `status=pending` & `notified=false` (clé service_role,
 * car le RLS cache les pending à la clé publique), envoie UN email au fondateur avec
 * chaque photo + boutons ✅ Approuver / ❌ Rejeter qui pointent vers l'Edge Function
 * `moderate` (validation EN 1 TAP, sans ouvrir l'app), puis marque ces lignes
 * `notified=true` (zéro état local à committer). Non bloquant.
 *
 * Env (secrets GitHub) :
 *   SUPABASE_SERVICE_KEY  — clé `sb_secret_…` (lecture des pending + update)
 *   MODERATE_TOKEN        — jeton partagé avec l'Edge Function (signe les liens)
 *   SMTP_PASS             — boîte alerte@ (déjà en place)
 *   SUPABASE_URL          — (optionnel) défaut = projet ci-dessous
 *
 * Cf. docs/visitor-photos-runbook.md. Usage : node scripts/automation/notify-new-photos.cjs
 */
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rswdmjtdzrucqzzukfmd.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || ''
const TOKEN = process.env.MODERATE_TOKEN || ''
const TO = 'aveca@aveca.fr'
const FROM = 'Sargasses Photos <alerte@sargasses-martinique.com>'

const { sendEmail, mailReady } = require('./lib/email-send.cjs')

function svcHeaders(extra) {
  return Object.assign({ apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY }, extra || {})
}
const esc = (s) => String(s == null ? '' : s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]))
const LVL = { clean: '✅ Propre', moderate: '⚠️ Modéré', avoid: '🚫 Beaucoup' }

async function main() {
  if (!SERVICE_KEY || !TOKEN) { console.log('[photos-notify] SUPABASE_SERVICE_KEY ou MODERATE_TOKEN manquant — skip'); return }
  if (!mailReady()) { console.log('[photos-notify] SMTP_PASS manquant — skip'); return }

  // 1) photos en attente, pas encore notifiées
  let rows
  try {
    const q = 'status=eq.pending&notified=is.false&select=id,beach_id,beach_name,island,level,url,created_at&order=created_at.asc&limit=50'
    const res = await fetch(`${SUPABASE_URL}/rest/v1/photos?${q}`, { headers: svcHeaders(), signal: AbortSignal.timeout(20000) })
    if (!res.ok) { console.warn(`[photos-notify] lecture HTTP ${res.status}`); return }
    rows = await res.json()
  } catch (e) { console.warn('[photos-notify] lecture échouée:', e.message); return }
  if (!Array.isArray(rows) || !rows.length) { console.log('[photos-notify] aucune nouvelle photo'); return }

  // 2) email récap avec liens 1-tap
  const link = (id, action) => `${SUPABASE_URL}/functions/v1/moderate?id=${encodeURIComponent(id)}&action=${action}&token=${encodeURIComponent(TOKEN)}`
  const cards = rows.map((r) => `
    <div style="border:1px solid #e3e9ef;border-radius:14px;padding:14px;margin:0 0 16px">
      <div style="font-weight:700;color:#1d2b3a;margin-bottom:8px">${esc(r.beach_name || r.beach_id)} ${r.island ? '· ' + esc(r.island) : ''} ${r.level && LVL[r.level] ? '· ' + LVL[r.level] : ''}</div>
      <img src="${esc(r.url)}" alt="" style="width:100%;max-width:420px;border-radius:10px;display:block;margin-bottom:12px">
      <div>
        <a href="${link(r.id, 'approve')}" style="display:inline-block;background:#16a34a;color:#fff;font-weight:700;text-decoration:none;padding:12px 20px;border-radius:10px;margin-right:8px">✅ Approuver</a>
        <a href="${link(r.id, 'reject')}" style="display:inline-block;background:#dc2626;color:#fff;font-weight:700;text-decoration:none;padding:12px 20px;border-radius:10px">❌ Rejeter</a>
      </div>
    </div>`).join('')

  const n = rows.length
  const subject = `[Sargasses] ${n} nouvelle${n > 1 ? 's' : ''} photo${n > 1 ? 's' : ''} à valider`
  const html = `
    <div style="font-family:system-ui;max-width:480px;margin:0 auto;padding:20px">
      <h2 style="color:#1d2b3a;margin:0 0 6px">📸 ${n} photo${n > 1 ? 's' : ''} visiteur${n > 1 ? 's' : ''} en attente</h2>
      <p style="color:#666;font-size:13px;margin:0 0 18px">Tape Approuver ou Rejeter — c'est appliqué tout de suite, sans ouvrir l'app.</p>
      ${cards}
      <p style="font-size:11px;color:#999;margin-top:18px">Alerte auto — photos visiteurs Sargasses.</p>
    </div>`

  const { error } = await sendEmail({ from: FROM, to: TO, subject, html })
  if (error) { console.error('[photos-notify] SMTP:', error.message); return }
  console.log(`[photos-notify] email envoyé (${n} photo(s))`)

  // 3) marquer notified=true (idempotent ; ne renotifie pas au prochain run)
  try {
    const ids = rows.map((r) => r.id)
    const filter = 'id=in.(' + ids.map((i) => `"${i}"`).join(',') + ')'
    const res = await fetch(`${SUPABASE_URL}/rest/v1/photos?${filter}`, {
      method: 'PATCH', headers: svcHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify({ notified: true }),
    })
    if (!res.ok) console.warn(`[photos-notify] marquage notified HTTP ${res.status}`)
  } catch (e) { console.warn('[photos-notify] marquage échoué:', e.message) }
}

main()
