#!/usr/bin/env node
/**
 * factory-heartbeat-watch.cjs — Veille « usine locale silencieuse » (email fondateur).
 *
 * L'usine locale (scripts/local-factory/factory.cjs, Couche C) ne tourne que si le PC
 * est allumé — le Planificateur Windows est la surface la moins observable du stack
 * (une MAJ Windows peut désenregistrer la tâche en silence). Ce script lit le dernier
 * `factory_heartbeat` posté dans analytics_events (Supabase, écrit par factory.cjs à la
 * clé anon PUBLIQUE — même sécurité que le front) et alerte si aucun signal depuis plus
 * de HEARTBEAT_MAX_H (défaut 48h).
 *
 * Non-money-critical (cf. CLAUDE.md) : Stripe/Mollie/le pipeline tournent tous en cloud,
 * PC éteint inclus — ce garde-fou évite juste de laisser l'usine morte sans le savoir.
 * Dédup par signature jour (data/factory-heartbeat-watch-seen.json) → 1 alerte/jour tant
 * que silencieuse. 1er run = baseline de grâce (pas d'alerte le jour de l'installation).
 * Dry-run par défaut. Clés : SUPABASE_SERVICE_KEY (lecture), SMTP_PASS (envoi).
 *
 * Usage :
 *   node scripts/automation/factory-heartbeat-watch.cjs          # dry-run
 *   node scripts/automation/factory-heartbeat-watch.cjs --send   # envoie (si SMTP prêt)
 */
const fs = require('fs')
const path = require('path')
const { sendEmail, mailReady, brandHeader } = require('./lib/email-send.cjs')

// bridge .env → process.env (exécution locale)
;['SMTP_PASS', 'SMTP_USER', 'SMTP_HOST', 'SMTP_PORT'].forEach(k => {
  if (!process.env[k]) { try { const t = fs.readFileSync(path.join(__dirname, '../../.env'), 'utf8'); const m = t.match(new RegExp('^' + k + '=([^\\r\\n]+)', 'm')); if (m) process.env[k] = m[1].trim() } catch (_) {} }
})

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rswdmjtdzrucqzzukfmd.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || ''
const DATA = path.join(__dirname, 'data')
const SEEN = path.join(DATA, 'factory-heartbeat-watch-seen.json')
const TO = process.env.FOUNDER_EMAIL || process.env.ALERT_TO || 'yacovassaraf@gmail.com'
const FROM = 'Sargasses Usine locale <alerte@sargasses-martinique.com>'
const THRESHOLD_H = parseInt(process.env.HEARTBEAT_MAX_H || '48', 10)

const load = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return fb } }
function svcHeaders(extra) { return Object.assign({ apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY }, extra || {}) }

// ─── Logique pure (testable) ────────────────────────────────────────────────
// lastIso=null → jamais vu de heartbeat. firstCheckIso = 1ère fois qu'on a regardé
// (grâce d'installation, pour ne pas alerter le jour même où l'usine vient d'être
// enregistrée et n'a pas encore tourné une fois). sig porte le jour → 1 alerte/jour.
function evaluate({ lastIso, nowIso, firstCheckIso, threshold = THRESHOLD_H }) {
  const now = Date.parse(nowIso)
  const today = nowIso.slice(0, 10)
  if (!lastIso) {
    const base = firstCheckIso || nowIso
    const graceH = (now - Date.parse(base)) / 3.6e6
    const triggered = graceH >= threshold
    return { triggered, ageH: null, neverSeen: true, sig: triggered ? `never|${today}` : '', firstCheckIso: base }
  }
  const ageH = (now - Date.parse(lastIso)) / 3.6e6
  const triggered = ageH >= threshold
  return { triggered, ageH, neverSeen: false, sig: triggered ? `stale|${today}` : '', firstCheckIso: firstCheckIso || nowIso }
}

async function fetchLastHeartbeat() {
  if (!SERVICE_KEY) return { ok: false, lastIso: null }
  try {
    const q = 'select=ts&event=eq.factory_heartbeat&order=ts.desc&limit=1'
    const res = await fetch(`${SUPABASE_URL}/rest/v1/analytics_events?${q}`, { headers: svcHeaders(), signal: AbortSignal.timeout(20000) })
    if (!res.ok) { console.error(`[factory-heartbeat-watch] HTTP ${res.status}`); return { ok: false, lastIso: null } }
    const rows = await res.json().catch(() => [])
    return { ok: true, lastIso: (rows[0] && rows[0].ts) || null }
  } catch (e) { console.error('[factory-heartbeat-watch] fetch error:', e.message); return { ok: false, lastIso: null } }
}

async function main() {
  const DO_SEND = process.argv.includes('--send')
  const now = new Date().toISOString()
  const seen = load(SEEN, {})
  const { ok, lastIso } = await fetchLastHeartbeat()
  if (!ok) { console.log('factory-heartbeat-watch: lecture Supabase indisponible (clé absente ou erreur réseau), run sauté.'); return }

  const { triggered, ageH, neverSeen, sig, firstCheckIso } = evaluate({ lastIso, nowIso: now, firstCheckIso: seen.firstCheckIso, threshold: THRESHOLD_H })
  console.log('=== factory-heartbeat-watch ===', DO_SEND ? 'SEND' : 'DRY-RUN')
  console.log(`  dernier signal : ${lastIso || 'jamais'} · âge : ${ageH != null ? ageH.toFixed(1) + 'h' : 'n/a'} (seuil ${THRESHOLD_H}h)`)

  const persist = (extra = {}) => { if (DO_SEND) { try { fs.writeFileSync(SEEN, JSON.stringify({ ...seen, firstCheckIso, ...extra, at: now }, null, 2)) } catch (e) { console.error('seen write:', e.message) } } }

  if (!triggered) { console.log('  RAS — usine vivante.'); persist({ sig: '' }); return }
  if (seen.sig === sig) { console.log('  déjà alerté pour ce silence.'); persist(); return }

  console.log(`  ⚠️ SILENCE : ${neverSeen ? 'aucun heartbeat jamais reçu' : `${ageH.toFixed(1)}h sans signal`}`)
  if (!DO_SEND) { console.log('\nDRY-RUN — rien envoyé. --send pour envoyer.'); return }
  if (!mailReady()) { console.error('SMTP_PASS absent — pas d\'envoi.'); return }

  const html = `${brandHeader('Usine locale', "Silence de l'usine locale", neverSeen ? 'Aucun signal reçu depuis l\'installation' : `${Math.round(ageH)}h sans nouvelles`)}
  <div style="font-size:15px;line-height:1.6;color:#23323a">
    <p>${neverSeen
      ? "L'usine locale (Planificateur Windows « SargaFactory ») n'a <strong>jamais envoyé de signal</strong> depuis son installation."
      : `L'usine locale n'a <strong>plus donné signe de vie depuis ${Math.round(ageH)}h</strong> (dernier signal : ${lastIso}).`}</p>
    <p style="font-size:14px;color:#444">Non-critique pour le revenu (Stripe/Mollie/le pipeline tournent tous en cloud, PC éteint inclus) — ça veut juste dire que le Brief vidéo + la publication FB ne se produisent plus depuis cette machine.</p>
    <p style="font-size:14px;color:#444">À vérifier au retour devant le PC : le Planificateur de tâches Windows (tâche <code>SargaFactory</code>, une MAJ Windows peut la désenregistrer) et <code>scripts/local-factory/LAST_RUN.md</code>.</p>
    <p style="font-size:11px;color:#999;margin-top:6px">Auto-veille usine locale · dernier heartbeat analytics_events · ${now.slice(0, 10)}</p>
  </div>`

  try {
    const { error } = await sendEmail({ from: FROM, to: TO, subject: `[Sargasses] Usine locale silencieuse${neverSeen ? '' : ` (${Math.round(ageH)}h)`}`, html, preheader: 'Le Planificateur Windows local ne donne plus signe de vie.' })
    if (error) { console.error('SMTP error:', error.message); return }
    persist({ sig })
    console.log(`  Alerte envoyée à ${TO}`)
  } catch (e) { console.error('factory-heartbeat-watch error:', e.message) }
}

if (require.main === module) main().catch(e => { console.error('factory-heartbeat-watch:', e.message); process.exit(0) })

module.exports = { evaluate }
