#!/usr/bin/env node
/**
 * notify-new-reports — alerte email des NOUVEAUX signalements terrain à modérer (1-tap).
 *
 * Pendant de notify-new-photos.cjs, mais pour la table `beach_reports` (événements
 * échouement/ramassage, cf. docs/GROUND_TRUTH_TERRAIN.md). Poll Supabase pour les reports
 * `status=pending` & `notified=false` (clé service_role), envoie UN email au fondateur avec
 * chaque signalement + boutons ✅ Approuver / ❌ Rejeter (Edge Function `moderate`). Modèle
 * simple : Approuver applique le SENS du signalement au verdict affiché (beaching monte,
 * cleanup baisse, 1 cran, 48 h) ; Rejeter = ignoré. Marque ensuite ces lignes `notified=true`.
 * Non bloquant.
 *
 * Sans ce notifieur + modération, les signalements approuvés ne s'affichent jamais et
 * pourrissent en `pending` (RLS ne sert que `approved`) → il complète le fix #367.
 *
 * Env (secrets GitHub) :
 *   SUPABASE_SERVICE_KEY  — clé `sb_secret_…` (lecture des pending + update)
 *   MODERATE_TOKEN        — jeton partagé avec l'Edge Function (signe les liens)
 *   SMTP_PASS             — boîte alerte@ (déjà en place)
 *   SUPABASE_URL          — (optionnel) défaut = projet ci-dessous
 *
 * Usage : node scripts/automation/notify-new-reports.cjs
 */
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rswdmjtdzrucqzzukfmd.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || ''
const TOKEN = process.env.MODERATE_TOKEN || ''
const TO = 'yacovassaraf@gmail.com'
const FROM = 'Sargasses Terrain <alerte@sargasses-martinique.com>'

const fs = require('fs')
const path = require('path')
const { sendEmail, mailReady } = require('./lib/email-send.cjs')

function svcHeaders(extra) {
  return Object.assign({ apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY }, extra || {})
}
const esc = (s) => String(s == null ? '' : s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]))
const EVT = { beaching: '🌊 Algues arrivées', cleanup: '🧹 Ramassage' }

// Domaine de prod par région (island === region id, cf. regions/*.json + beachFilter.island).
// Sert à bâtir l'URL de la fiche plage pour la redirection post-approbation.
const DOMAINS = (() => {
  const map = {}
  try {
    const dir = path.join(__dirname, '..', '..', 'regions')
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json') || f.startsWith('_')) continue
      try { const r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); if (r.id && r.domain) map[r.id] = r.domain } catch (_) {}
    }
  } catch (_) {}
  return map
})()
const slugify = (n) => String(n || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
// URL fiche plage (schéma /plages/<slug>/, cf. prepare-ftp.cjs). null si non calculable.
function beachUrl(r) {
  const dom = DOMAINS[r.island]
  const slug = slugify(r.beach_name)
  return dom && slug ? `https://${dom}/plages/${slug}/` : null
}

async function main() {
  if (!SERVICE_KEY || !TOKEN) { console.log('[reports-notify] SUPABASE_SERVICE_KEY ou MODERATE_TOKEN manquant — skip'); return }
  if (!mailReady()) { console.log('[reports-notify] SMTP_PASS manquant — skip'); return }

  // 1) signalements en attente, pas encore notifiés
  let rows
  try {
    const q = 'status=eq.pending&notified=is.false&select=id,beach_id,beach_name,island,event,note,photo_url,within_150m,created_at&order=created_at.asc&limit=50'
    const res = await fetch(`${SUPABASE_URL}/rest/v1/beach_reports?${q}`, { headers: svcHeaders(), signal: AbortSignal.timeout(20000) })
    if (res.status === 404) { console.log('[reports-notify] table beach_reports absente (appliquer schema.sql) — skip'); return }
    if (!res.ok) { console.warn(`[reports-notify] lecture HTTP ${res.status}`); return }
    rows = await res.json()
  } catch (e) { console.warn('[reports-notify] lecture échouée:', e.message); return }
  if (!Array.isArray(rows) || !rows.length) { console.log('[reports-notify] aucun nouveau signalement'); return }

  // 2) email récap avec liens 1-tap. `back` = fiche plage → après approbation/rétrogradation,
  // le fondateur atterrit sur la fiche (pas sur la page technique de la fonction). Le rejet
  // reste sur une page de confirmation (rien à voir).
  const link = (id, action, back) => `${SUPABASE_URL}/functions/v1/moderate?id=${encodeURIComponent(id)}&action=${action}&table=beach_reports&token=${encodeURIComponent(TOKEN)}` +
    (back && action !== 'reject' ? `&back=${encodeURIComponent(back)}` : '')
  const btn = (href, bg, label) => `<a href="${href}" style="display:inline-block;background:${bg};color:#fff;font-weight:700;text-decoration:none;padding:12px 20px;border-radius:10px;margin:0 8px 8px 0">${label}</a>`
  const cards = rows.map((r) => {
    const back = beachUrl(r)
    const gps = r.within_150m === true ? ' · 📍 GPS sur place' : r.within_150m === false ? ' · 📍 hors zone' : ''
    // Modèle simple : Approuver applique le SENS du signalement au verdict affiché (beaching
    // monte, cleanup baisse, 1 cran, 48 h). Approuver un cleanup = tu vouches qu'il est réel
    // et large (pas un cadrage), idéalement hors alerte satellite fraîche. Rejeter = ignoré.
    const dirHint = r.event === 'cleanup'
      ? 'Approuver = baisse le verdict d\'1 cran (48 h) — à ne faire que si le ramassage est réel et large.'
      : r.event === 'beaching'
        ? 'Approuver = monte le verdict d\'1 cran (48 h).'
        : ''
    return `
    <div style="border:1px solid #e3e9ef;border-radius:14px;padding:14px;margin:0 0 16px">
      <div style="font-weight:700;color:#1d2b3a;margin-bottom:6px">${esc(r.beach_name || r.beach_id)} ${r.island ? '· ' + esc(r.island) : ''}</div>
      <div style="color:#1d2b3a;margin-bottom:8px">${EVT[r.event] || esc(r.event)}${gps}</div>
      ${r.note ? `<p style="color:#555;font-size:13px;margin:0 0 10px">« ${esc(r.note)} »</p>` : ''}
      ${r.photo_url ? `<img src="${esc(r.photo_url)}" alt="" style="width:100%;max-width:420px;border-radius:10px;display:block;margin-bottom:12px">` : ''}
      <div>${btn(link(r.id, 'approve', back), '#16a34a', '✅ Approuver')}${btn(link(r.id, 'reject'), '#dc2626', '❌ Rejeter')}</div>
      ${dirHint ? `<p style="font-size:11px;color:#999;margin:6px 0 0">${dirHint}</p>` : ''}
    </div>`
  }).join('')

  const n = rows.length
  const subject = `[Sargasses] ${n} signalement${n > 1 ? 's' : ''} terrain à valider`
  const html = `
    <div style="font-family:system-ui;max-width:480px;margin:0 auto;padding:20px">
      <h2 style="color:#1d2b3a;margin:0 0 6px">📍 ${n} signalement${n > 1 ? 's' : ''} terrain en attente</h2>
      <p style="color:#666;font-size:13px;margin:0 0 18px">Approuver = s'affiche sur la fiche plage. Modération = décision de <b>véracité</b>, pas de propreté.</p>
      ${cards}
      <p style="font-size:11px;color:#999;margin-top:18px">Alerte auto — signalements terrain Sargasses. Le verdict reste mesuré au satellite.</p>
    </div>`

  const { error } = await sendEmail({ from: FROM, to: TO, subject, html })
  if (error) { console.error('[reports-notify] SMTP:', error.message); return }
  console.log(`[reports-notify] email envoyé (${n} signalement(s))`)

  // 3) marquer notified=true (idempotent ; ne renotifie pas au prochain run)
  try {
    const ids = rows.map((r) => r.id)
    const filter = 'id=in.(' + ids.map((i) => `"${i}"`).join(',') + ')'
    const res = await fetch(`${SUPABASE_URL}/rest/v1/beach_reports?${filter}`, {
      method: 'PATCH', headers: svcHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify({ notified: true }),
    })
    if (!res.ok) console.warn(`[reports-notify] marquage notified HTTP ${res.status}`)
  } catch (e) { console.warn('[reports-notify] marquage échoué:', e.message) }
}

// process.exit explicite : le transport SMTP garde l'event loop vivant après l'envoi.
main().then(() => process.exit(0)).catch(() => process.exit(0))
