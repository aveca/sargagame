#!/usr/bin/env node
/**
 * daily-brief.cjs — Brief QUOTIDIEN « tes plages aujourd'hui » (MQ/GP, FR).
 *
 * Moteur d'HABITUDE : un email matinal court qui récapitule l'état RÉEL des plages
 * du jour (propres / modérées / alerte) depuis sargassum.json. Re-touche les
 * non-convertis avec de la VALEUR pure (pas de paywall dur — juste un lien carte).
 * C'est le pendant email du « check du matin » que fait l'app.
 *
 * SÉCURITÉ DÉLIVRABILITÉ (le domaine porte AUSSI welcome/drip/dunning — ne pas le griller) :
 *   - DRY-RUN par défaut ; --send pour envoyer (le fondateur bascule après une dry-run,
 *     même pattern que dunning-past-due.cjs).
 *   - 1 SEUL brief par email et par JOUR (dédup hash(email|YYYY-MM-DD) dans
 *     data/daily-brief-sent.json) → ré-exécuter le même jour ne renvoie rien.
 *   - Exclut les adresses bouncées + les leads B2B (drip-b2b).
 *   - Cap d'envois par run (protège le pool SMTP / la réputation).
 *
 * RGPD : subscribers re-fetchés en CI (jamais commités) ; état = hashes ; logs = hash8.
 * Env : SMTP_PASS (absent = dry-run forcé).
 * Usage : node scripts/automation/daily-brief.cjs           # DRY-RUN
 *         node scripts/automation/daily-brief.cjs --send     # envoie
 */
const fs = require('fs')
const path = require('path')
const { emailHash, logId } = require('./lib/email-hash.cjs')
const { sendEmail, brandHeader, mailReady } = require('./lib/email-send.cjs')

const DO_SEND = process.argv.includes('--send')
const SEND_CAP = Number((process.argv.find(a => a.startsWith('--cap=')) || '--cap=120').split('=')[1]) || 120

const DATA = path.join(__dirname, 'data')
const SUBSCRIBERS_PATH = path.join(DATA, 'subscribers.json')
const SENT_PATH = path.join(DATA, 'daily-brief-sent.json')
const BOUNCED_PATH = path.join(DATA, 'bounced-emails.json')
const SARG_PATH = path.join(__dirname, '../../public/api/copernicus/sargassum.json')
const BEACHES_PATH = path.join(__dirname, '../../public/data/beaches-list.json')
const WEBHOOK = 'https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec'
const B2B_SOURCES = new Set(['pro', 'b2b', 'hotel', 'widget', 'demo'])

// sargassum.json id → beaches-list.json id (copie de drip-email.cjs, source unique des noms).
const SARG_TO_BEACH = { 'grande-anse': 'mq014', 'anse-mitan': 'mq011', 'anse-noire': 'mq012', 'tartane': 'mq034', 'anse-madame': 'mq024', 'diamant': 'mq016', 'pt-marin': 'mq008', 'sainte-anne': 'mq004', 'les-salines': 'mq001', 'vauclin': 'mq044', 'gp-grande-anse': 'gp021', 'gp-malendure': 'gp031', 'gp-sainte-anne': 'gp010', 'gp-pt-chateaux': 'gp005', 'gp-gosier': 'gp012', 'gp-caravelle': 'gp009', 'gp-bas-du-fort': 'gp014', 'gp-deshaies': 'gp024', 'gp-moule': 'gp080', 'gp-vieux-fort': 'gp042' }
const REGION_META = {
  MQ: { name: 'Martinique', domain: 'sargasses-martinique.com', from: 'Sargasses Martinique <alerte@sargasses-martinique.com>' },
  GP: { name: 'Guadeloupe', domain: 'sargasses-guadeloupe.com', from: 'Sargasses Guadeloupe <alerte@sargasses-martinique.com>' },
}

const loadJSON = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { return fb } }
const saveJSON = (p, d) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(d, null, 2)) }
const hashedSet = arr => new Set((Array.isArray(arr) ? arr : []).map(e => String(e).includes('@') ? emailHash(e) : e))
const unsubUrl = (email, island) => `${WEBHOOK}?action=unsubscribe&email=${encodeURIComponent(email)}&island=${island}`
const today = () => new Date().toISOString().slice(0, 10)

/** Brief du jour par île depuis sargassum.json — compte RÉEL + top plages propres nommées. */
function buildBriefs() {
  const sarg = loadJSON(SARG_PATH, null)
  const beaches = loadJSON(BEACHES_PATH, [])
  const nameOf = id => {
    const bid = SARG_TO_BEACH[id]
    const b = bid && beaches.find(x => x.id === bid)
    return (b && b.name) || id.replace(/^gp-/, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  }
  if (!sarg || !Array.isArray(sarg.levels)) return null
  const out = {}
  for (const isl of ['MQ', 'GP']) {
    const pref = isl === 'GP'
    const lv = sarg.levels.filter(l => (String(l.id).startsWith('gp-') === pref))
    if (!lv.length) continue
    const clean = lv.filter(l => l.status === 'clean')
    const moderate = lv.filter(l => l.status === 'moderate')
    const avoid = lv.filter(l => l.status === 'avoid')
    out[isl] = {
      total: lv.length,
      cleanCount: clean.length,
      moderateCount: moderate.length,
      avoidCount: avoid.length,
      topClean: clean.slice(0, 6).map(l => nameOf(l.id)),
      avoidNames: avoid.map(l => nameOf(l.id)),
    }
  }
  return out
}

function buildEmail(island, brief, email) {
  const m = REGION_META[island]
  const dateFr = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Martinique' })
  const mapUrl = `https://${m.domain}/?utm_source=email&utm_medium=daily_brief&utm_campaign=habit`
  const subject = brief.avoidCount > 0
    ? `${m.name} — ${brief.cleanCount} plage${brief.cleanCount > 1 ? 's' : ''} propre${brief.cleanCount > 1 ? 's' : ''}, ${brief.avoidCount} à éviter aujourd'hui`
    : `${m.name} — ${brief.cleanCount} plage${brief.cleanCount > 1 ? 's' : ''} propre${brief.cleanCount > 1 ? 's' : ''} aujourd'hui`
  const preheader = brief.topClean.length ? `Aujourd'hui : ${brief.topClean.slice(0, 3).join(', ')}…` : 'Ton brief plages du jour.'
  const cleanList = brief.topClean.length
    ? `<div style="margin:14px 0">${brief.topClean.map(n => `<span style="display:inline-block;background:#EAF7F0;color:#0B5A43;font-size:13px;font-weight:700;padding:6px 12px;border-radius:999px;margin:3px 4px 3px 0">✓ ${n}</span>`).join('')}</div>`
    : ''
  const avoidLine = brief.avoidCount > 0
    ? `<div style="margin:12px 0 0;font-size:13px;color:#9A3412">⚠️ À éviter aujourd'hui : ${brief.avoidNames.join(', ')}.</div>`
    : `<div style="margin:12px 0 0;font-size:13px;color:#0B5A43">Aucune plage en alerte aujourd'hui.</div>`
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#FDFCF7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:480px;margin:0 auto;padding:18px">
  ${brandHeader('BRIEF DU JOUR', `Tes plages aujourd'hui`, `${m.name} · ${dateFr}`)}
  <div style="background:#fff;padding:22px 20px;border-radius:0 0 16px 16px">
    <div style="font-size:15px;color:#1a1a1a;line-height:1.5">
      <strong>${brief.cleanCount}</strong> plage${brief.cleanCount > 1 ? 's' : ''} propre${brief.cleanCount > 1 ? 's' : ''}${brief.moderateCount ? ` · <strong>${brief.moderateCount}</strong> modérée${brief.moderateCount > 1 ? 's' : ''}` : ''}${brief.avoidCount ? ` · <strong>${brief.avoidCount}</strong> en alerte` : ''} sur ${brief.total}.
    </div>
    ${cleanList}
    ${avoidLine}
    <div style="margin:22px 0 6px;text-align:center">
      <a href="${mapUrl}" style="display:inline-block;padding:14px 34px;background:linear-gradient(158deg,#FFE47A,#FFC72C,#E89400);color:#0D0D0D;text-decoration:none;border-radius:12px;font-size:15px;font-weight:700">Voir la carte →</a>
    </div>
    <div style="font-size:11px;color:#999;text-align:center;margin-top:8px">Données satellite, rafraîchies 4×/jour.</div>
  </div>
  <div style="text-align:center;padding:14px;font-size:10px;color:#999">
    ${m.name} · ${m.domain}<br><a href="${unsubUrl(email, island)}" style="color:#999">Se désinscrire</a>
  </div>
</div></body></html>`
  return { subject, html, preheader }
}

async function main() {
  console.log(`=== Daily Brief === mode=${DO_SEND ? 'SEND' : 'DRY-RUN'} | smtp=${mailReady() ? 'ok' : 'ABSENT'} | cap=${SEND_CAP}`)
  const briefs = buildBriefs()
  if (!briefs) { console.error('sargassum.json illisible / sans levels — abort.'); process.exit(1) }
  for (const [isl, b] of Object.entries(briefs)) {
    console.log(`  ${isl}: ${b.cleanCount} propre / ${b.moderateCount} modéré / ${b.avoidCount} alerte (sur ${b.total})`)
  }

  // --preview : rend l'email du jour (sans abonnés ni envoi) pour vérif visuelle.
  if (process.argv.includes('--preview')) {
    for (const isl of Object.keys(briefs)) {
      const e = buildEmail(isl, briefs[isl], 'preview@example.com')
      console.log(`\n── ${isl} ──\nSubject: ${e.subject}\nPreheader: ${e.preheader}\nHTML bytes: ${e.html.length} | clean chips: ${(e.html.match(/✓ /g) || []).length} | has CTA: ${e.html.includes('Voir la carte')} | has unsub: ${e.html.includes('action=unsubscribe')}`)
    }
    return
  }

  const subscribers = loadJSON(SUBSCRIBERS_PATH, [])
  const bouncedSet = hashedSet(loadJSON(BOUNCED_PATH, []))
  const sent = loadJSON(SENT_PATH, {}) // { 'YYYY-MM-DD': [hashes] }
  const day = today()
  const sentToday = new Set(Array.isArray(sent[day]) ? sent[day] : [])

  if (!subscribers.length) { console.log('Aucun abonné (subscribers.json absent localement = normal hors CI).'); return }

  const sendReady = DO_SEND && mailReady()
  if (DO_SEND && !mailReady()) { console.error('❌ --send mais SMTP_PASS absent.'); process.exit(1) }

  let ok = 0, wouldSend = 0, skipped = 0
  for (const sub of subscribers) {
    const email = sub.email
    if (!email) continue
    const island = (sub.island || 'MQ').toUpperCase()
    if (island !== 'MQ' && island !== 'GP') { skipped++; continue } // v1 = MQ/GP FR
    if (B2B_SOURCES.has(sub.source)) { skipped++; continue }
    const h = emailHash(email)
    if (bouncedSet.has(h) || sentToday.has(h)) { skipped++; continue }
    const brief = briefs[island]
    if (!brief) { skipped++; continue }

    if (!sendReady) { console.log(`  ~ ${logId(email)} [${island}] would send`); wouldSend++; continue }
    if (ok >= SEND_CAP) { console.log(`  (cap ${SEND_CAP} atteint — reste au prochain run)`); break }

    const { subject, html, preheader } = buildEmail(island, brief, email)
    try {
      const { error } = await sendEmail(null, { from: REGION_META[island].from, to: email, subject, html, preheader, unsubUrl: unsubUrl(email, island) })
      if (error) { console.log(`  ❌ ${logId(email)} : ${error.message}`); continue }
      console.log(`  ✅ ${logId(email)} (${island})`)
      ok++
      sentToday.add(h)
      sent[day] = [...sentToday]
      // Purge des jours > 7j pour borner le fichier d'état.
      for (const k of Object.keys(sent)) { if (k < day && (Date.parse(day) - Date.parse(k)) > 7 * 864e5) delete sent[k] }
      saveJSON(SENT_PATH, sent)
    } catch (e) { console.log(`  ❌ ${logId(email)} : ${e.message}`) }
  }
  if (sendReady) saveJSON(SENT_PATH, sent)
  console.log(DO_SEND ? `Done. ${ok} envoyés, ${skipped} ignorés.` : `DRY-RUN — ${wouldSend} à envoyer, ${skipped} ignorés. Relancer avec --send.`)
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
