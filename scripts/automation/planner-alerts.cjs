#!/usr/bin/env node
/**
 * planner-alerts — rappel J-7 self-serve pour les intentions « planner » du hub
 * premium « La Vigie » (WeekHub).
 *
 * Un premium qui planifie un séjour choisit une date future dans le hub → l'app
 * insère {email, domain, region, trip_date} dans Supabase (table `planner_alerts`,
 * clé anon, RLS insert-only, cf. supabase/schema.sql + src/supabasePhotos.js).
 * Ce cron, une fois par jour :
 *   1. (best-effort) s'assure que la table existe (API Management, idempotent) si
 *      SUPABASE_ACCESS_TOKEN est présent — sinon fallback = coller schema.sql ;
 *   2. lit les intentions non notifiées dont la date entre dans la fenêtre fiable
 *      (J-7 → J0) via la clé service_role (le RLS cache ces lignes à l'anon) ;
 *   3. envoie UN rappel « ton verdict jour par jour est ouvert » (transactionnel,
 *      opt-in EXPLICITE — pas du cold outreach) au domaine d'origine ;
 *   4. marque notified=true dans Supabase (zéro état committé, idempotent). Les
 *      dates déjà passées sont marquées notified sans email (nettoyage silencieux).
 *
 * Honnêteté (moat) : l'email n'affirme AUCUN verdict — il invite à venir LIRE la
 * donnée réelle mesurée au satellite. Zéro prévision fabriquée, claim ~76 % hedgé.
 *
 * Env (secrets GitHub) :
 *   SUPABASE_SERVICE_KEY   — lecture/update (obligatoire)
 *   SUPABASE_ACCESS_TOKEN  — (optionnel) crée la table au 1er run (Management API)
 *   SMTP_PASS              — boîte alerte@ (obligatoire pour --send)
 *   SUPABASE_URL           — (optionnel) défaut = projet ci-dessous
 *
 * DRY-RUN par défaut (0 envoi). Le fondateur bascule --send quand la table est
 * peuplée et la copy relue (même trajectoire que weather-reengage).
 *   node scripts/automation/planner-alerts.cjs            # dry-run
 *   node scripts/automation/planner-alerts.cjs --send     # envoie
 */
'use strict'

const { sendEmail, mailReady, brandHeader } = require('./lib/email-send.cjs')

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rswdmjtdzrucqzzukfmd.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || ''
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || ''
const PROJECT_REF = 'rswdmjtdzrucqzzukfmd'

const args = process.argv.slice(2)
const SEND = args.includes('--send')
const HORIZON_DAYS = 7 // la fenêtre fiable s'ouvre à J-7 (décision produit « La Vigie »)

const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec'
const unsubUrl = (email, region) => `${WEBHOOK_URL}?action=unsubscribe&email=${encodeURIComponent(email)}&island=${encodeURIComponent(region || '')}`
const logId = (e) => String(e || '').replace(/(.).*(@.*)/, '$1***$2')

function svcHeaders(extra) {
  return Object.assign({ apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY }, extra || {})
}
const esc = (s) => String(s == null ? '' : s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]))
const t = (lang, fr, en, es) => (lang === 'en' ? en : lang === 'es' ? es : fr)

// YYYY-MM-DD en UTC (les trip_date sont des dates nues).
function isoDay(d) { return new Date(d).toISOString().slice(0, 10) }
function daysBetween(fromISO, toISO) {
  const a = Date.parse(fromISO + 'T00:00:00Z'), b = Date.parse(toISO + 'T00:00:00Z')
  return Math.round((b - a) / 864e5)
}

// 1) Best-effort : crée la table si absente (idempotent). Non bloquant.
async function ensureTable() {
  if (!ACCESS_TOKEN) return
  const sql = `
    create table if not exists public.planner_alerts (
      id uuid primary key default gen_random_uuid(),
      created_at timestamptz not null default now(),
      email text not null, domain text, region text,
      beach_id text, beach_name text, trip_date date not null,
      lang text, notified boolean not null default false );
    create index if not exists planner_alerts_due_idx on public.planner_alerts (trip_date, notified);
    alter table public.planner_alerts enable row level security;
    drop policy if exists "anon insert planner" on public.planner_alerts;
    create policy "anon insert planner" on public.planner_alerts for insert to anon with check (notified = false);`
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + ACCESS_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql }),
      signal: AbortSignal.timeout(20000),
    })
    console.log(res.ok ? '[planner] table ensured (Management API)' : `[planner] ensure HTTP ${res.status} (fallback = coller schema.sql)`)
  } catch (e) { console.warn('[planner] ensure échouée (non bloquant):', e.message) }
}

function buildEmail(row, daysLeft) {
  const lang = row.lang === 'en' || row.lang === 'es' ? row.lang : 'fr'
  const domain = (row.domain && /^[a-z0-9.-]+$/i.test(row.domain)) ? row.domain : 'sargasses-martinique.com'
  const relPath = lang === 'en' ? 'reliability' : lang === 'es' ? 'fiabilidad' : 'fiabilite'
  const dayDate = new Date(row.trip_date + 'T12:00:00Z').toLocaleDateString(
    lang === 'en' ? 'en-GB' : lang === 'es' ? 'es-ES' : 'fr-FR', { day: 'numeric', month: 'long' })
  const link = `https://${domain}/?utm_source=email&utm_medium=planner_j7&utm_campaign=sargasses`
  const relLink = `https://${domain}/${relPath}/`

  const kicker = t(lang, 'Le Veilleur', 'The Watcher', 'El Vigía')
  const title = t(lang, 'Ton séjour approche', 'Your trip is coming up', 'Tu viaje se acerca')
  const sub = t(lang,
    `Ta date (${dayDate}) entre dans notre fenêtre fiable.`,
    `Your date (${dayDate}) is now in our reliable window.`,
    `Tu fecha (${dayDate}) entra en nuestra ventana fiable.`)
  const p1 = t(lang,
    `Tu m'avais laissé ta date. On y est presque — le verdict jour par jour, plage par plage, est ouvert : viens voir où poser ta serviette.`,
    `You left me your date. We're almost there — the day-by-day, beach-by-beach verdict is open: come see where to lay your towel.`,
    `Me dejaste tu fecha. Ya casi estamos — el veredicto día a día, playa por playa, está abierto: ven a ver dónde poner tu toalla.`)
  const cta = t(lang, 'Voir mon verdict jour par jour', 'See my day-by-day verdict', 'Ver mi veredicto día a día')
  const proof = t(lang,
    `Mesuré au satellite, pas deviné. On publie même nos erreurs : ~76 % de verdicts justes tous régimes confondus (jusqu'à 79 % en saison calme), dates et comparaisons à l'appui.`,
    `Measured by satellite, not guessed. We even publish our misses: ~76% of verdicts right across all conditions (up to 79% in calm season), with dates and comparisons.`,
    `Medido por satélite, no adivinado. Publicamos hasta nuestros errores: ~76 % de veredictos acertados en todas las condiciones (hasta 79 % en temporada tranquila), con fechas y comparaciones.`)
  const proofCta = t(lang, 'Voir notre fiabilité', 'See our reliability', 'Ver nuestra fiabilidad')
  const sign = t(lang, 'On regarde la mer pour toi.', 'We watch the sea for you.', 'Miramos el mar por ti.')
  const unsubWord = t(lang, 'Ne plus recevoir ces rappels', 'Stop these reminders', 'Dejar de recibir estos avisos')

  const subject = t(lang,
    `Ton séjour approche — ton verdict jour par jour est ouvert 🌊`,
    `Your trip is coming up — your day-by-day verdict is open 🌊`,
    `Tu viaje se acerca — tu veredicto día a día está abierto 🌊`)
  const preheader = sub

  const html = `
    <div style="max-width:480px;margin:0 auto;background:#FDFCF7">
      ${brandHeader(kicker, esc(title), esc(sub))}
      <div style="padding:24px 22px 8px;color:#1d2b3a;font-size:15px;line-height:1.55">
        <p style="margin:0 0 18px">${esc(p1)}</p>
        <div style="text-align:center;margin:22px 0">
          <a href="${link}" style="display:inline-block;background:#FFC72C;color:#12100a;font-weight:800;text-decoration:none;padding:14px 26px;border-radius:12px;font-size:15px">${esc(cta)}</a>
        </div>
        <p style="margin:20px 0 0;padding:14px 16px;background:#fff;border:1px solid #eee4d0;border-radius:12px;font-size:13px;color:#555;line-height:1.5">
          ${esc(proof)}<br>
          <a href="${relLink}" style="color:#b8860b;font-weight:700;text-decoration:none">${esc(proofCta)} →</a>
        </p>
        <p style="margin:22px 0 6px;font-size:14px;color:#1d2b3a">${esc(sign)}</p>
      </div>
      <p style="text-align:center;font-size:11px;color:#aaa;margin:8px 0 20px">
        <a href="${unsubUrl(row.email, row.region)}" style="color:#aaa">${esc(unsubWord)}</a>
      </p>
    </div>`

  const from = `Le Veilleur <alerte@sargasses-martinique.com>`
  return { subject, html, preheader, from }
}

async function markNotified(ids) {
  if (!ids.length) return
  const inList = ids.map((i) => `"${i}"`).join(',')
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/planner_alerts?id=in.(${inList})`, {
      method: 'PATCH',
      headers: svcHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify({ notified: true }),
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) console.warn(`[planner] markNotified HTTP ${res.status}`)
  } catch (e) { console.warn('[planner] markNotified échouée:', e.message) }
}

async function main() {
  console.log(`=== planner-alerts (rappel J-7 séjour) === mode=${SEND ? 'SEND' : 'DRY-RUN'} | horizon J-${HORIZON_DAYS} | smtp=${mailReady() ? 'ok' : 'ABSENT'}`)
  if (!SERVICE_KEY) { console.log('[planner] SUPABASE_SERVICE_KEY manquant — skip'); return }
  if (SEND && !mailReady()) { console.error('SMTP_PASS manquant — impossible d\'envoyer (--send).'); process.exit(1) }

  await ensureTable()

  const today = isoDay(Date.now())
  const horizonMax = isoDay(Date.now() + HORIZON_DAYS * 864e5)

  // Intentions non notifiées avec une date ≤ J+horizon (inclut les dates passées → nettoyage).
  let rows
  try {
    const q = `notified=is.false&trip_date=lte.${horizonMax}&select=id,email,domain,region,beach_name,trip_date,lang&order=trip_date.asc&limit=500`
    const res = await fetch(`${SUPABASE_URL}/rest/v1/planner_alerts?${q}`, { headers: svcHeaders(), signal: AbortSignal.timeout(20000) })
    if (res.status === 404) { console.log('[planner] table planner_alerts absente (coller schema.sql ou poser SUPABASE_ACCESS_TOKEN) — skip'); return }
    if (!res.ok) { console.warn(`[planner] lecture HTTP ${res.status}`); return }
    rows = await res.json()
  } catch (e) { console.warn('[planner] lecture échouée:', e.message); return }
  if (!Array.isArray(rows) || !rows.length) { console.log('[planner] aucune intention en fenêtre.'); return }

  // Sépare : dates passées (marque notified, pas d'email) vs éligibles J-7→J0.
  const stale = [], due = []
  for (const r of rows) {
    if (!r.email || !r.trip_date) { stale.push(r.id); continue }
    const dLeft = daysBetween(today, r.trip_date)
    if (dLeft < 0) stale.push(r.id)          // séjour passé → nettoyage silencieux
    else due.push({ r, dLeft })              // 0 ≤ dLeft ≤ HORIZON → rappel
  }

  // Dedup par email : un seul rappel par adresse (le séjour le plus proche).
  const byEmail = new Map()
  for (const x of due) {
    const k = x.r.email.toLowerCase()
    if (!byEmail.has(k) || x.dLeft < byEmail.get(k).dLeft) byEmail.set(k, x)
  }
  const picks = [...byEmail.values()]

  console.log(`[planner] ${rows.length} ligne(s) · ${picks.length} rappel(s) éligible(s) · ${stale.length} passée(s) à nettoyer.`)

  let sent = 0, fail = 0
  const notifiedIds = [...stale]
  // Toutes les lignes du même email éligible → notified (dédup persistante).
  const emailToIds = new Map()
  for (const x of due) {
    const k = x.r.email.toLowerCase()
    if (!emailToIds.has(k)) emailToIds.set(k, [])
    emailToIds.get(k).push(x.r.id)
  }

  for (const { r, dLeft } of picks) {
    const { subject, html, preheader, from } = buildEmail(r, dLeft)
    if (!SEND) {
      console.log(`  ~ [dry] ${logId(r.email)} (${r.region || '?'}, J-${dLeft}) « ${subject} »`)
      continue
    }
    const { error } = await sendEmail({ from, to: r.email, subject, html, preheader, unsubUrl: unsubUrl(r.email, r.region) })
    if (error) { console.error(`  ✗ ${logId(r.email)}: ${error.message}`); fail++; continue }
    console.log(`  ✓ ${logId(r.email)} (J-${dLeft})`)
    sent++
    for (const id of emailToIds.get(r.email.toLowerCase()) || []) notifiedIds.push(id)
  }

  // En SEND : marque tout (envoyés + passés). En DRY : marque seulement les passés
  // (nettoyage), jamais les éligibles (on ne les a pas encore prévenus).
  await markNotified(SEND ? notifiedIds : stale)

  console.log(`Done. ${SEND ? sent + ' rappel(s) envoyé(s)' : picks.length + ' candidat(s) (dry-run)'}${fail ? ` · ${fail} échec(s)` : ''} · ${stale.length} passée(s) nettoyée(s).`)
}

main().catch((e) => { console.error('[planner] fatal:', e.message); process.exit(0) })
