#!/usr/bin/env node
/**
 * weather-reengage.cjs — RÉ-ENGAGEMENT SUR SWING MÉTÉO : recontacte les leads
 * froids NON-acheteurs quand la météo sargasses de LEUR région bascule.
 *
 * Le déclencheur n'est PAS le calendrier (≠ cold-lead-reengage, cadence aveugle) :
 * c'est la DONNÉE. Quand le nombre de plages "propres" d'une région CHUTE d'un coup
 * (un épisode de sargasses arrive), c'est le MOMENT où le lead a besoin du Veilleur —
 * et le moment où l'email est value-first, pas opportuniste : « voici les criques qui
 * RESTENT propres ». On mène par le service (le cadeau : la liste des plages propres
 * du jour), jamais par la peur. Promesse de statut : « deviens celui qui sait où aller ».
 *
 * SOURCE DU SWING : public/api/copernicus/<region>/sargassum.json (champ `levels` =
 * [{id,status,...}]). cleanCount = nb de plages status==='clean'. Un ledger
 * weather-reengage-state.json garde par région le DERNIER cleanCount vu (baseline) +
 * la date du dernier envoi-swing. À chaque run :
 *   - si cleanCount a CHUTÉ depuis le baseline d'au moins le SEUIL (--drop= défaut :
 *     ≥6 plages OU ≥15% du total, le plus permissif des deux) → SWING → on envoie aux
 *     leads froids de la région ;
 *   - sinon → on met juste à jour le baseline (mémoire), ZÉRO envoi.
 * Le baseline est TOUJOURS réécrit au cleanCount courant en fin de run (on ne re-déclenche
 * pas tant que la donnée ne re-chute pas depuis ce nouveau plancher).
 *
 * DÉLIVRABILITÉ D'ABORD (boîte SMTP mutualisée, mêmes garde-fous que cold-lead-reengage) :
 *   - cadence min entre 2 emails-swing au MÊME lead (--cadence= défaut 21 j) ;
 *   - CAP À VIE (--max-touches= défaut 4) : passé ce cap on n'écrit plus à ce lead ;
 *   - plafond d'envois/run (--max= défaut 60) ;
 *   - fenêtre d'âge lead : pas de borne basse (un swing est opportun même pour un lead
 *     récent) mais borne HAUTE 365 j (--max-age=) anti spam-trap/réputation ;
 *   - exclut ACHETEURS (on vise les NON-acheteurs), bounced (bounced-emails.json),
 *     désabonnés (flag), B2B/hôtels, emails test ;
 *   - List-Unsubscribe one-click + lien désabo proéminent (via lib email-send) ;
 *   - EUR (MQ/GP) uniquement — copy FR, caisse Mollie EUR live. Les régions USD ont
 *     leur propre cadence/brand (EN/ES) : le code est structuré (LANG/REGION) pour les
 *     ajouter trivialement plus tard, on ne câble QUE FR ici.
 *
 * DRY-RUN par défaut (0 envoi). Le fondateur bascule --send quand copy/volumes lui
 * conviennent. Sans subscribers.json (récupéré au runtime/FTP) → no-op gracieux.
 *
 * Usage :
 *   node scripts/automation/weather-reengage.cjs                  # dry-run
 *   node scripts/automation/weather-reengage.cjs --send           # envoie
 *   node scripts/automation/weather-reengage.cjs --drop=6 --drop-pct=15
 *   node scripts/automation/weather-reengage.cjs --cadence=21 --max-touches=4 --max=60
 *   WEATHER_REENGAGE_FORCE_SWING=1 node scripts/automation/weather-reengage.cjs  # test
 */
const fs = require('fs')
const path = require('path')
const { emailHash, logId } = require('./lib/email-hash.cjs')
const { sendEmail, brandHeader, mailReady } = require('./lib/email-send.cjs')
const { pickArm, applyArm } = require('./lib/email-ab.cjs')
let AB_VARS = {}; try { AB_VARS = require('./data/email-ab-variants.json') } catch { AB_VARS = {} }

const args = process.argv.slice(2)
const numArg = (name, dflt) => { const a = args.find(x => x.startsWith(`--${name}=`)); const v = a ? parseFloat(a.split('=')[1]) : NaN; return Number.isFinite(v) ? v : dflt }
const SEND = args.includes('--send')
const DROP_ABS = numArg('drop', 6)         // chute absolue (nb de plages) qui déclenche un swing
const DROP_PCT = numArg('drop-pct', 15)    // OU chute relative (% du total) — le plus permissif gagne
const MAX_AGE = numArg('max-age', 365)     // jours : borne haute (réputation/spam-trap). Pas de borne basse.
const CADENCE = numArg('cadence', 21)      // jours minimum entre deux emails-swing au même lead
const MAX_TOUCHES = numArg('max-touches', 4) // emails-swing à vie par lead
const MAX = numArg('max', 60)              // plafond d'envois par run (boîte SMTP mutualisée)
const THROTTLE_MS = 500
const FORCE_SWING = /^(1|true|yes)$/i.test(process.env.WEATHER_REENGAGE_FORCE_SWING || '')

const DATA = path.join(__dirname, 'data')
const SUBSCRIBERS_PATH = path.join(DATA, 'subscribers.json')
const SENT_PATH = path.join(DATA, 'weather-reengage-sent.json')
const STATE_PATH = path.join(DATA, 'weather-reengage-state.json')
const BOUNCED_PATH = path.join(DATA, 'bounced-emails.json')
const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec'

// Carte région (EUR/FR câblé ; ajouter une entrée USD = trivial, copy via LANG ci-dessous).
// `data` = chemin du sargassum.json régional ; root MQ a un alias `sargassum.json` à la racine
// de copernicus/ mais on cible explicitement le dossier régional pour la clarté.
const REGION = {
  // MQ : on lit le mq/ régional (pur MQ). Le sargassum.json RACINE est un composite
  // MULTI-RÉGION (mélange MQ+GP, ids "gp-grande-anse") → l'utiliser fausserait le
  // comptage régional du swing. Les ids régionaux sont opaques ("mq051") : pas de nom
  // humain dispo ici → la copy retombe sur la ligne carte générique (cf. cleanBeaches).
  MQ: { lang: 'fr', from: 'Sargasses Martinique <alerte@sargasses-martinique.com>', domain: 'sargasses-martinique.com', brand: 'Sargasses Martinique', place: 'Martinique', data: ['mq/sargassum.json'] },
  GP: { lang: 'fr', from: 'Sargasses Guadeloupe <alerte@sargasses-martinique.com>', domain: 'sargasses-guadeloupe.com', brand: 'Sargasses Guadeloupe', place: 'Guadeloupe', data: ['gp/sargassum.json'] },
}
const ACTIVE_ISLANDS = Object.keys(REGION) // EUR/FR uniquement ici
const fallback = REGION.MQ
const islandOf = s => (s.island || s.region || 'MQ').toString().toUpperCase()
const isB2B = s => /b2b|pro|hotel|hôtel/i.test(s || '')
const isTestEmail = e => /^test@|(\+test@)|@(test|example)\./i.test(e || '')
const isUnsub = s => s.unsubscribed === true || s.unsubscribed === 1 || /^(1|true|yes|y|oui)$/i.test(String(s.unsubscribed || '').trim())
// Acheteur : un flag sur le lead (si le pipeline subscribers le pose). On vise les NON-acheteurs.
const isBuyer = s => s.paid === true || s.isBuyer === true || s.isPaid === true || /^(1|true|yes|paid|premium)$/i.test(String(s.paid || s.status || '').trim())

const loadJson = (p, dflt) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return dflt } }
const saveJson = (p, d) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(d, null, 2)) }
const subscribersList = () => { const d = loadJson(SUBSCRIBERS_PATH, null); if (!d) return null; return Array.isArray(d) ? d : (d.subscribers || Object.values(d || {})) }
const unsubUrl = (email, island) => `${WEBHOOK_URL}?action=unsubscribe&email=${encodeURIComponent(email)}&island=${island}`
const passUrl = domain => `https://${domain}/?paywall=1&utm_source=email&utm_medium=weather_reengage&utm_campaign=swing`
const mapUrl = domain => `https://${domain}/?utm_source=email&utm_medium=weather_reengage`
const reliabilityUrl = domain => `https://${domain}/fiabilite/`
const leadDate = s => { const raw = s.date || s.createdAt || s.created || s.ts; const t = raw ? new Date(raw).getTime() : NaN; return Number.isFinite(t) ? t : NaN }

// ─── Lecture de la météo régionale (le moat : 100 % data ERDDAP, jamais inventé) ───
const COPERNICUS_DIR = path.join(__dirname, '..', '..', 'public', 'api', 'copernicus')
function loadRegionData(island) {
  const reg = REGION[island] || fallback
  for (const rel of reg.data) {
    const d = loadJson(path.join(COPERNICUS_DIR, rel), null)
    if (d && Array.isArray(d.levels) && d.levels.length) return d
  }
  return null
}
// cleanCount = nb de plages propres ; total = nb de plages connues.
function weatherSnapshot(island) {
  const d = loadRegionData(island)
  if (!d) return null
  const levels = d.levels
  const cleanCount = levels.filter(l => l && l.status === 'clean').length
  return { cleanCount, total: levels.length, levels, updatedAt: d.updatedAt || null, stale: !!d.stale }
}
// Les "criques propres" du jour : plages status==='clean', triées par score décroissant
// (meilleure d'abord), jolifiées pour la copy. C'est le CADEAU value-first.
function cleanBeaches(levels, n = 6) {
  return levels
    .filter(l => l && l.status === 'clean' && isReadableId(l.id))
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, n)
    .map(l => prettyBeach(l.id))
}
// id opaque (ex "mq051", "gp001") = pas de nom humain dispo dans ce JSON → on n'invente
// pas un libellé moche, on retombe sur la ligne générique "la carte te montre, plage par
// plage" (le cadeau reste la carte, pas une liste laide).
function isReadableId(id) { return /[a-z]/i.test(String(id || '')) && !/^[a-z]{2,3}\d+$/i.test(String(id || '')) }
function prettyBeach(id) {
  return String(id || '').split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

// Swing = la donnée propre a chuté d'au moins DROP_ABS plages OU DROP_PCT % du total
// depuis le baseline. Le plus permissif des deux déclenche (un petit archipel chute peu
// en absolu mais beaucoup en %, un grand l'inverse). FORCE_SWING = override de test.
function isSwing(baseline, snap) {
  if (FORCE_SWING) return { swing: true, drop: baseline ? baseline.cleanCount - snap.cleanCount : 0, reason: 'forced(test)' }
  if (!baseline || !Number.isFinite(baseline.cleanCount)) return { swing: false, drop: 0, reason: 'baseline-init' }
  const drop = baseline.cleanCount - snap.cleanCount
  if (drop <= 0) return { swing: false, drop, reason: 'no-drop' }
  const pctThreshold = Math.ceil((DROP_PCT / 100) * (snap.total || 1))
  const swing = drop >= DROP_ABS || drop >= pctThreshold
  return { swing, drop, reason: swing ? `drop=${drop}≥min(${DROP_ABS},${pctThreshold})` : `drop=${drop}<min(${DROP_ABS},${pctThreshold})` }
}

// ─── Copy (FR). value-first, POSITIVE, ≤280 mots, 1 seul CTA self-serve, zéro call. ───
// Cadeau (criques propres) AVANT l'ask. Claims HEDGÉS — jamais un "100 %" nu.
function buildHtml(island, snap) {
  const reg = REGION[island] || fallback
  const cta = passUrl(reg.domain)
  const map = mapUrl(reg.domain)
  const fia = reliabilityUrl(reg.domain)
  const beaches = cleanBeaches(snap.levels, 6)
  const list = beaches.length
    ? `<ul style="margin:6px 0 14px;padding-left:20px">${beaches.map(b => `<li style="margin:3px 0">${b}</li>`).join('')}</ul>`
    : `<p style="color:#8a97a5">La carte te montre, plage par plage, celles qui restent propres aujourd'hui.</p>`
  return brandHeader(`Cette semaine en ${reg.place}`, reg.brand, 'Le vent tourne — voici où la mer reste propre.') +
    `<div style="background:#fff;padding:22px 20px;font-size:14px;line-height:1.55;color:#1a2b3c">
      <p>En ${reg.place} cette semaine, <b>le vent tourne</b> : un épisode de sargasses se met en place sur une partie du littoral. Bonne nouvelle — <b>toutes les plages ne sont pas concernées</b>.</p>
      <p>Voici, mesurées au satellite ce matin, des <b>criques qui restent propres</b> :</p>
      ${list}
      <p>Le Veilleur te donne <b>LA plage du jour, plage par plage</b>, avec la tendance 7 jours. La carte reste <b>gratuite</b> — deviens celui qui sait toujours où aller pendant que les autres tombent sur les algues.</p>
      <p>Si tu veux le matin sans mauvaise surprise : le <b>Pass</b> est un <b>paiement unique, sans abonnement</b> — 7 jours dès <b>7,99 €</b>, 14 jours <b>14,99 €</b>, 30 jours <b>24,99 €</b>.</p>
      <p style="text-align:center;margin:22px 0"><a href="${cta}" style="display:inline-block;background:linear-gradient(158deg,#FFE47A,#FFC72C,#E89400);color:#190c2c;font-weight:800;text-decoration:none;padding:14px 30px;border-radius:12px">Voir les plages propres</a></p>
      <p style="font-size:12px;color:#8a97a5">Mesuré au satellite, pas deviné. On publie nos erreurs : <a href="${fia}" style="color:#0E7C66">~76 % à 79 % de fiabilité selon la saison</a>. <a href="${map}" style="color:#0E7C66">Ou reste sur la carte gratuite</a>.</p>
    </div>`
}

async function main() {
  console.log(`=== Weather-reengage (swing météo) === mode=${SEND ? 'SEND' : 'DRY-RUN'} | seuil drop ≥${DROP_ABS} plages OU ≥${DROP_PCT}% | âge ≤${MAX_AGE}j | cadence ${CADENCE}j | cap ${MAX_TOUCHES} | smtp=${mailReady() ? 'ok' : 'ABSENT'}${FORCE_SWING ? ' | FORCE_SWING(test)' : ''}`)
  if (SEND && !mailReady()) { console.error('SMTP_PASS manquant — impossible d\'envoyer (--send).'); process.exit(1) }

  // 1) Détecter le swing par région (toujours, même sans subscribers — c'est la mémoire baseline)
  const state = loadJson(STATE_PATH, {})
  const swinging = {}   // island -> { snap, info }
  for (const island of ACTIVE_ISLANDS) {
    const snap = weatherSnapshot(island)
    if (!snap) { console.log(`[${island}] météo absente (sargassum.json introuvable) — skip.`); continue }
    const baseline = state[island] || null
    const info = isSwing(baseline, snap)
    const tag = info.swing ? 'SWING' : 'pas de swing'
    console.log(`[${island}] clean=${snap.cleanCount}/${snap.total} (baseline=${baseline ? baseline.cleanCount : 'n/a'}) → ${tag} (${info.reason})${snap.stale ? ' [data STALE]' : ''}`)
    if (info.swing) swinging[island] = { snap, info }
    // Baseline réécrit en fin de boucle (après usage) pour ne pas re-déclencher au prochain run.
  }

  // 2) Charger les leads. Absent → no-op (mais on persiste quand même le baseline mis à jour).
  const subs = subscribersList()
  if (!subs) {
    console.log('subscribers.json absent — no-op envoi (récupéré au runtime/FTP).')
    persistBaseline(state, swinging)
    console.log(`Done. ${Object.keys(swinging).length} région(s) en swing, 0 envoi (pas de leads).`)
    return
  }

  // 3) Pour chaque région en swing, sélectionner les leads froids éligibles et (dry-)envoyer.
  const bounced = new Set(loadJson(BOUNCED_PATH, []))
  const sent = loadJson(SENT_PATH, {})
  const now = Date.now()
  const DAY = 86400000

  let totalEligible = 0, totalDone = 0, totalFail = 0
  for (const island of Object.keys(swinging)) {
    const { snap } = swinging[island]
    const reg = REGION[island] || fallback

    const eligible = []
    let ageOut = 0, excluded = 0, capped = 0, tooSoon = 0
    for (const s of subs) {
      if (!s || !s.email) { continue }
      if (islandOf(s) !== island) { continue }            // cette région d'envoi uniquement
      const email = String(s.email).trim()
      if (!email.includes('@') || isTestEmail(email)) { excluded++; continue }
      if (isB2B(s.source) || isUnsub(s) || isBuyer(s)) { excluded++; continue }
      const h = emailHash(email)
      if (bounced.has(h)) { excluded++; continue }
      const dt = leadDate(s)
      // Pas de borne basse (swing opportun même pour un lead récent) ; sans date → on s'abstient.
      if (!Number.isFinite(dt)) { ageOut++; continue }
      const ageDays = (now - dt) / DAY
      if (ageDays > MAX_AGE) { ageOut++; continue }
      const rec = sent[h]
      if (rec && rec.count >= MAX_TOUCHES) { capped++; continue }
      if (rec && rec.last && (now - new Date(rec.last).getTime()) < CADENCE * DAY) { tooSoon++; continue }
      eligible.push({ email, island, h, source: s.source || '', touches: rec ? rec.count : 0 })
    }
    totalEligible += eligible.length
    console.log(`[${island}] éligibles: ${eligible.length} | hors-âge: ${ageOut} | exclus: ${excluded} | cap: ${capped} | cadence: ${tooSoon}`)

    for (const c of eligible) {
      if (totalDone >= MAX) { console.log(`Plafond ${MAX} atteint (toutes régions) — relance plus tard (idempotent).`); break }
      const abKey = 'em_weatherreengage_fr'
      const arm = pickArm(abKey, c.email)
      const base = { subject: `${reg.place} : le vent tourne — voici les plages qui restent propres`, preheader: 'Mesuré au satellite ce matin. La carte reste gratuite.' }
      const out = applyArm(arm, base, (AB_VARS[abKey] && AB_VARS[abKey].ship))

      if (!SEND) {
        console.log(`  ~ [dry] ${logId(c.email)} (${c.island}, touche ${c.touches + 1}/${MAX_TOUCHES}) · « ${out.subject} » [${arm}]`)
        totalDone++
        continue
      }
      try {
        const { error } = await sendEmail({
          from: reg.from, to: c.email, subject: out.subject, html: buildHtml(c.island, snap),
          preheader: out.preheader, unsubUrl: unsubUrl(c.email, c.island),
        })
        if (error) { console.log(`  x ${logId(c.email)}: ${error.message}`); totalFail++; continue }
        sent[c.h] = { last: new Date().toISOString(), count: c.touches + 1, island: c.island }
        saveJson(SENT_PATH, sent) // flush incrémental (anti re-spam si crash mid-run)
        totalDone++
        console.log(`  + ${logId(c.email)} (${c.island}) swing-relancé · touche ${c.touches + 1}/${MAX_TOUCHES}`)
        try {
          await fetch(WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ type: 'email_tracking', to: c.email, subject: out.subject, email_type: 'weather_reengage', island: c.island, ab_test: abKey, ab_arm: arm, status: 'sent', date: new Date().toISOString() }) })
        } catch {}
        await new Promise(res => setTimeout(res, THROTTLE_MS))
      } catch (e) { console.log(`  x ${logId(c.email)}: ${e.message}`); totalFail++ }
    }
    if (totalDone >= MAX) break
  }
  if (SEND) saveJson(SENT_PATH, sent)

  // 4) Persister le baseline AU CLEANCOUNT COURANT (toutes régions) — on ne re-déclenche
  //    pas tant que la donnée ne re-chute pas depuis ce nouveau plancher.
  persistBaseline(state, swinging)

  console.log(`Done. ${Object.keys(swinging).length} région(s) en swing · ${SEND ? totalDone + ' email(s) envoyé(s)' : totalDone + ' candidat(s) (dry-run)'}${totalFail ? ` · ${totalFail} échec(s)` : ''} (éligibles totaux ${totalEligible}).`)
}

// Réécrit le baseline de TOUTES les régions actives au snapshot courant + horodate
// le dernier swing si la région a déclenché ce run.
function persistBaseline(state, swinging = {}) {
  const nowIso = new Date().toISOString()
  for (const island of ACTIVE_ISLANDS) {
    const snap = weatherSnapshot(island)
    if (!snap) continue
    const prev = state[island] || {}
    state[island] = {
      cleanCount: snap.cleanCount,
      total: snap.total,
      updatedAt: snap.updatedAt,
      seenAt: nowIso,
      lastSwingAt: swinging[island] ? nowIso : (prev.lastSwingAt || null),
    }
  }
  saveJson(STATE_PATH, state)
}

if (require.main === module) main().catch(e => { console.error('ERREUR:', e.message); process.exit(1) })
module.exports = { buildHtml, leadDate, isSwing, weatherSnapshot, cleanBeaches, prettyBeach }
