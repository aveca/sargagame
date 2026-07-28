#!/usr/bin/env node
/**
 * blast-mollie-offer.cjs — Envoie une offre directe à TOUS les leads (B2C + B2B)
 *
 * Objectif : convertir le maximum de leads en payants avec un lien de paiement
 * direct (Mollie payment link). Un seul email par lead, personnalisé par langue
 * et région, avec un CTA unique.
 *
 * Sources :
 *   - subscribers.json (246 leads B2C, fetché par le pipeline)
 *   - b2b-us-enriched.json (58 US hotels)
 *   - b2b-enriched.json (MQ/GP hotels)
 *
 * Idempotent : marqueur blast-mollie-offer-sent.json (committé) — chaque email
 * ne reçoit l'offre qu'UNE fois (quel que soit le nombre de runs).
 *
 * Cannibalisation guard : exclut les emails déjà payants (Mollie API) et les
 * bounced. Ne touche pas la cadence existante (drip, winback, reengage).
 *
 * Usage :
 *   node scripts/automation/blast-mollie-offer.cjs           # dry-run
 *   node scripts/automation/blast-mollie-offer.cjs --send    # envoie
 *   --only-b2c / --only-b2b                                  # filtre
 *   --cap=50                                                 # max 50 envois
 */
const fs = require('fs')
const path = require('path')
const { emailHash, logId } = require('./lib/email-hash.cjs')
const { sendEmail, mailReady, brandHeader, makeTrackingId } = require('./lib/email-send.cjs')

const SEND = process.argv.includes('--send')
const ONLY_B2C = process.argv.includes('--only-b2c')
const ONLY_B2B = process.argv.includes('--only-b2b')
const CAP = parseInt((process.argv.find(a => a.startsWith('--cap=')) || '').split('=')[1] || '500', 10)

const DATA_DIR = path.join(__dirname, 'data')
const SENT_PATH = path.join(DATA_DIR, 'blast-mollie-offer-sent.json')
const BOUNCED_PATH = path.join(DATA_DIR, 'bounced-emails.json')
const PASS_PATH = path.join(__dirname, '..', '..', 'public', 'api', 'mollie-passlinks.json')
const FROM_DOMAIN = 'alerte@sargasses-martinique.com'

// ── Chargement des leads ──
function loadJSON(p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return fb } }
function mailReadyCheck() { return !!mailReady() }

// ── Pricing par langue/région ──
function pricing(region) {
  const isEUR = region === 'mq' || region === 'gp'
  if (isEUR) return { symbol: '€', p7: '7,99', p30: '14,99', saison: '24,99', brief: '290', pro: '690' }
  return { symbol: '$', p7: '5.99', p30: '11.99', saison: '19.99', brief: '390', pro: '790' }
}

// ── Construction de l'email ──
function buildPassEmail(email, island, lang) {
  const p = pricing(island)
  const isB2B = lang === 'b2b'
  const domain = island === 'gp' ? 'sargasses-guadeloupe.com'
    : island === 'florida' ? 'sargassummiami.com'
    : island === 'puntacana' ? 'sargassumpuntacana.com'
    : island === 'rivieramaya' ? 'sargassumcancun.com'
    : 'sargasses-martinique.com'

  const brand = island === 'florida' ? 'Sargassum Miami'
    : island === 'puntacana' ? 'Sargassum Punta Cana'
    : island === 'rivieramaya' ? 'Sargazo Cancún'
    : island === 'gp' ? 'Sargasses Guadeloupe'
    : 'Sargasses Martinique'

  if (isB2B) {
    return {
      subject: brand + ' — Votre tableau de bord plages est prêt (essai 30j gratuit)',
      preheader: 'Widget marque-blanche, alertes par plage, placement app. Sans engagement.',
      html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F7F5EF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:480px;margin:0 auto;padding:20px">
  ${brandHeader('Sargasses Pro', brand, 'Votre établissement mérite une longueur d\'avance')}
  <div style="background:#fff;padding:24px 20px;border-radius:0 0 16px 16px">
    <p style="font-size:15px;line-height:1.6;color:#1a1a1a;margin:0 0 16px">
      <strong>Chaque matin, l'état réel de VOS plages.</strong> Pas de devinettes, pas de dire d'employé — une image satellite traitée, servie à vos clients.
    </p>
    <ul style="font-size:14px;line-height:1.7;color:#333;margin:0 0 18px;padding-left:18px">
      <li><strong>Widget à votre marque</strong> — zéro crédit visible, il regarde la mer, jamais vos clients</li>
      <li><strong>Alertes par plage</strong> — vent tourne ? Vous savez avant le 1er client</li>
      <li><strong>Placement app</strong> — vos plages en avant, les voyageurs viennent à vous</li>
    </ul>
    <div style="text-align:center;margin:18px 0">
      <a href="https://${domain}/pro/espace/" style="display:inline-block;padding:15px 36px;background:linear-gradient(158deg,#FFE47A,#FFC72C,#E89400);color:#0D0D0D;text-decoration:none;border-radius:12px;font-size:16px;font-weight:700">Démarrer l'essai gratuit 30 jours →</a>
    </div>
    <p style="font-size:12px;color:#999;text-align:center">Sans carte · Sans engagement · Résiliable à tout moment</p>
    <p style="font-size:13px;color:#666;line-height:1.5;margin-top:18px;padding-top:14px;border-top:1px solid #eee">
      <strong>Déjà convaincu ?</strong> Passez directement au Pro à <strong>${p.pro}${p.symbol}/an</strong> ou Brief à <strong>${p.brief}${p.symbol}/an</strong> — accès immédiat.
    </p>
  </div>
</div></body></html>`,
    }
  }

  // B2C
  const passLink = lang === 'en'
    ? `https://${domain}/?paywall=1&pass=p7&utm_source=email&utm_medium=blast_mollie`
    : `https://${domain}/?paywall=1&pass=p7&utm_source=email&utm_medium=blast_mollie`
  const cleanStatus = lang === 'en' ? 'Beach status' : 'État des plages'
  const title = lang === 'en' ? 'Your beach forecast is ready' : 'Votre prévision des plages est prête'
  const tagline = lang === 'en' ? 'See any beach in seconds — clean or not, before you go' : 'Voyez chaque plage en 5 secondes — propre ou non, avant d\'y aller'

  return {
    subject: title + ' — ' + brand,
    preheader: tagline,
    html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F7F5EF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:480px;margin:0 auto;padding:20px">
  ${brandHeader('Le Veilleur', brand, tagline)}
  <div style="background:#fff;padding:24px 20px;border-radius:0 0 16px 16px">
    <p style="font-size:15px;line-height:1.6;color:#1a1a1a;margin:0 0 16px">
      <strong>Vous étiez curieux de ${brand} ?</strong> Voici ce que vous avez manqué :
    </p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:18px">
      <tr><td style="padding:8px 0;vertical-align:top;width:30px;font-size:18px">🗺️</td>
        <td style="padding:8px 0"><strong>Carte live</strong> — chaque plage, son statut, mis à jour 4×/jour par satellite</td></tr>
      <tr><td style="padding:8px 0;vertical-align:top;font-size:18px">📅</td>
        <td style="padding:8px 0"><strong>Prévision 7 jours</strong> — planifiez vos journées autour des plages propres</td></tr>
      <tr><td style="padding:8px 0;vertical-align:top;font-size:18px">🔔</td>
        <td style="padding:8px 0"><strong>Alertes perso</strong> — on vous prévient si votre plage favorite change</td></tr>
    </table>
    <div style="background:#F7F5EF;border-radius:12px;padding:16px;margin-bottom:18px;text-align:center">
      <div style="font-size:13px;color:#666">À partir de</div>
      <div style="font-size:28px;font-weight:700;color:#0D0D0D">${p.p7}${p.symbol}</div>
      <div style="font-size:12px;color:#999">Pass 7 jours · Paiement unique · Sans abonnement</div>
    </div>
    <div style="text-align:center;margin:18px 0">
      <a href="${passLink}" style="display:inline-block;padding:15px 36px;background:linear-gradient(158deg,#FFE47A,#FFC72C,#E89400);color:#0D0D0D;text-decoration:none;border-radius:12px;font-size:17px;font-weight:700">Voir les plages →</a>
    </div>
    <p style="font-size:11px;color:#999;text-align:center">Paiement sécurisé par Mollie · Satisfait ou remboursé 30 jours</p>
  </div>
</div></body></html>`,
  }
}

// ── Charger les leads B2C depuis subscribers.json (même format que recover-abandoned-cart) ──
function loadB2CLeads() {
  const subPath = path.join(DATA_DIR, 'subscribers.json')
  if (!fs.existsSync(subPath)) { console.log('  subscribers.json introuvable — skip B2C'); return [] }
  const subs = loadJSON(subPath, [])
  const sources = new Set(['welcome', 'drip', 'onsite_checkout', 'pay_intent', 'sg_share', 'referral_landing', 'sg_alert', 'beach_alert', 'sargacatch', 'daily_verdict', 'signup', ''])
  return subs
    .filter(s => sources.has((s.source || '').toLowerCase()))  // pas de B2B dans subscribers.json
    .map(s => ({ email: (s.email || '').trim().toLowerCase(), island: ((s.island || 'mq')).toLowerCase(), source: s.source || 'unknown' }))
    .filter(s => s.email.includes('@'))
}

// ── Charger les leads B2B ──
function loadB2BLeads() {
  const enrichedPaths = [
    path.join(DATA_DIR, 'b2b-contacts-unified.json'),
    path.join(DATA_DIR, 'b2b-enriched.json'),
    path.join(DATA_DIR, 'b2b-us-enriched.json'),
  ]
  const contacts = []
  for (const p of enrichedPaths) {
    if (!fs.existsSync(p)) continue
    const data = loadJSON(p, null)
    if (!data) continue
    const list = data.contacts || data || []
    if (Array.isArray(list)) contacts.push(...list)
  }
  // Dédouble les emails (garde le 1er = le plus enrichi)
  const seen = new Set()
  return contacts
    .filter(c => c.email && c.email.includes('@'))
    .filter(c => { const h = emailHash(c.email); if (seen.has(h)) return false; seen.add(h); return true })
    .map(c => ({ email: c.email.trim().toLowerCase(), island: (c.island || c.region || 'mq').toLowerCase(), source: 'b2b', name: c.hotel || c.name || '', hook: c.hook || '' }))
}

async function main() {
  console.log('=== Blast Mollie Offer ===')
  console.log(`Mode: ${SEND ? 'SEND' : 'DRY-RUN'} | Cap: ${CAP}`)

  // 1. Charger les leads
  const b2cLeads = ONLY_B2B ? [] : loadB2CLeads()
  const b2bLeads = ONLY_B2C ? [] : loadB2BLeads()
  console.log(`Leads B2C: ${b2cLeads.length}, B2B: ${b2bLeads.length}`)

  // 2. Charger les exclus (déjà envoyé, bounced, déjà payant)
  const sent = loadJSON(SENT_PATH, {})
  const bouncedSet = new Set((loadJSON(BOUNCED_PATH, []) || []).map(e => typeof e === 'string' ? e : e.hash || ''))
  const paidSet = new Set()  // sera rempli si MOLLIE_API_KEY dispo

  // 3. Si MOLLIE_API_KEY, marquer les déjà payants
  const MOLLIE_KEY = process.env.MOLLIE_API_KEY
  if (MOLLIE_KEY && SEND) {
    console.log('  Vérification des payants Mollie...')
    try {
      let url = 'https://api.mollie.com/v2/payments?limit=250'
      let pages = 0
      while (url && pages < 5) {
        pages++
        const res = await fetch(url, { headers: { Authorization: 'Bearer ' + MOLLIE_KEY } })
        const j = await res.json()
        if (!res.ok) break
        for (const p of (j._embedded?.payments || [])) {
          if (p.status === 'paid' && p.metadata?.email) {
            paidSet.add(emailHash(p.metadata.email.trim().toLowerCase()))
          }
        }
        url = j._links?.next?.href ? j._links.next.href.replace('https://api.mollie.com/v2/', '') : null
      }
    } catch (e) { console.log(`  ⚠️ Erreur Mollie API (non bloquante): ${e.message}`) }
  }
  console.log(`  Déjà payants: ${paidSet.size}`)

  // 4. Filtrer les leads à blaster
  const candidates = []
  const seenEmail = new Set()
  for (const lead of [...b2cLeads, ...b2bLeads]) {
    const h = emailHash(lead.email)
    if (seenEmail.has(h)) continue  // dédup inter-sources
    seenEmail.add(h)
    if (sent[h]) { /* console.log(`  ⏭️ ${logId(lead.email)} déjà envoyé`); */ continue }
    if (bouncedSet.has(h)) { console.log(`  ⏭️ ${logId(lead.email)} bounced`); continue }
    if (paidSet.has(h)) { console.log(`  ⏭️ ${logId(lead.email)} déjà payant`); continue }
    candidates.push(lead)
  }

  // Cap
  const toSend = candidates.slice(0, CAP)
  console.log(`À envoyer: ${toSend.length}/${candidates.length} (cap ${CAP})`)

  if (!toSend.length) { console.log('Rien à envoyer.'); return }
  if (!SEND) {
    const b2b = toSend.filter(l => l.source === 'b2b').length
    console.log(`  B2C: ${toSend.length - b2b} · B2B: ${b2b}`)
    for (const l of toSend.slice(0, 10)) console.log(`  • ${logId(l.email)} | ${l.island} | ${l.source}`)
    console.log(`  ... et ${toSend.length - 10} de plus`)
    console.log("Passe --send pour envoyer")
    return
  }

  if (!mailReadyCheck()) { console.error('SMTP_PASS absent'); process.exit(1) }

  // 5. Envoyer
  let ok = 0, fail = 0
  for (const lead of toSend) {
    const lang = lead.source === 'b2b' ? 'b2b' : (['florida', 'puntacana'].includes(lead.island) ? 'en' : lead.island === 'rivieramaya' ? 'es' : 'fr')
    const email = buildPassEmail(lead.email, lead.island, lang)
    const from = `Le Veilleur <${FROM_DOMAIN}>`
    const tid = makeTrackingId('blast_mollie', lead.email)

    try {
      const { data, error } = await sendEmail({
        from, to: lead.email, subject: email.subject, html: email.html,
        preheader: email.preheader, trackingId: tid,
      })
      if (error) { console.log(`  ❌ ${logId(lead.email)} : ${error.message}`); fail++; continue }
      console.log(`  ✅ ${logId(lead.email)} (${lead.island}/${lead.source})`)
      ok++
      const h = emailHash(lead.email)
      sent[h] = { sentAt: new Date().toISOString(), island: lead.island, source: lead.source }
      // Flush incrémental
      fs.mkdirSync(path.dirname(SENT_PATH), { recursive: true })
      fs.writeFileSync(SENT_PATH, JSON.stringify(sent, null, 2))
    } catch (e) { console.log(`  ❌ ${logId(lead.email)} : ${e.message}`); fail++ }
  }

  fs.writeFileSync(SENT_PATH, JSON.stringify(sent, null, 2))
  console.log(`\nEnvoyés: ${ok}/${toSend.length} · Échecs: ${fail}`)
}

main().catch(e => { console.error('ERREUR:', e.message); process.exit(1) })
