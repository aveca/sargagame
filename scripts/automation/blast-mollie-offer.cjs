#!/usr/bin/env node
/**
 * blast-mollie-offer.cjs — Envoie une offre à TOUS les leads avec paiement direct
 *
 * POUR CHAQUE lead : crée un paiement Mollie individuel avec metadata.email →
 * checkout URL directe dans l'email. 1 clic → Mollie → payer → redirect avec
 * ?premium_email= → premium auto-restauré (pattern existant).
 *
 * Sources :
 *   - subscribers.json (246 leads B2C)
 *   - b2b-contacts-unified.json / b2b-enriched.json / b2b-us-enriched.json (B2B)
 *
 * Idempotent : marqueur blast-mollie-offer-sent.json. Exclut déjà-payants + bounced.
 *
 * Usage :
 *   node scripts/automation/blast-mollie-offer.cjs           # dry-run
 *   node scripts/automation/blast-mollie-offer.cjs --send    # envoie
 *   --only-b2c / --only-b2b                                  # filtre
 *   --cap=50                                                 # max 50 envois
 *   --no-create-payments                                     # saute la création paiements (fallback paywall)
 */
const fs = require('fs')
const path = require('path')
const { emailHash, logId } = require('./lib/email-hash.cjs')
const { sendEmail, mailReady, brandHeader, makeTrackingId } = require('./lib/email-send.cjs')

const SEND = process.argv.includes('--send')
const ONLY_B2C = process.argv.includes('--only-b2c')
const ONLY_B2B = process.argv.includes('--only-b2b')
const CAP = parseInt((process.argv.find(a => a.startsWith('--cap=')) || '').split('=')[1] || '500', 10)
const NO_CREATE_PAYMENTS = process.argv.includes('--no-create-payments')

const DATA_DIR = path.join(__dirname, 'data')
const SENT_PATH = path.join(DATA_DIR, 'blast-mollie-offer-sent.json')
const BOUNCED_PATH = path.join(DATA_DIR, 'bounced-emails.json')
const FROM_DOMAIN = 'alerte@sargasses-martinique.com'
const WEBHOOK_URL = 'https://sargasses-martinique.com/api/mollie-webhook.php'
const CONCURRENCY = 5

function loadJSON(p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return fb } }

function pricing(region) {
  const isEUR = region === 'mq' || region === 'gp'
  if (isEUR) return { symbol: '€', p7: '7.99', p30: '14.99', saison: '24.99' }
  return { symbol: '$', p7: '5.99', p30: '11.99', saison: '19.99' }
}

function regionConfig(island) {
  const map = {
    gp: { domain: 'sargasses-guadeloupe.com', brand: 'Sargasses Guadeloupe' },
    florida: { domain: 'sargassummiami.com', brand: 'Sargassum Miami' },
    puntacana: { domain: 'sargassumpuntacana.com', brand: 'Sargassum Punta Cana' },
    rivieramaya: { domain: 'sargassumcancun.com', brand: 'Sargazo Cancún' },
  }
  return map[island] || { domain: 'sargasses-martinique.com', brand: 'Sargasses Martinique' }
}

function langFor(island, source) {
  if (source === 'b2b') return 'b2b'
  if (island === 'rivieramaya') return 'es'
  if (['florida', 'puntacana'].includes(island)) return 'en'
  return 'fr'
}

// ── Création paiement Mollie individuel ──
async function createBlastPayment(key, email, island, passKey) {
  const p = pricing(island)
  const amount = p[passKey] || p.p7
  const currency = island === 'mq' || island === 'gp' ? 'EUR' : 'USD'
  const rc = regionConfig(island)
  const desc = `Pass ${passKey} — ${rc.brand}`
  const redirectUrl = `https://${rc.domain}/?premium_email=${encodeURIComponent(email)}`

  const res = await fetch('https://api.mollie.com/v2/payments', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: { currency, value: amount },
      description: desc,
      redirectUrl,
      webhookUrl: WEBHOOK_URL,
      metadata: { email, pass: passKey, source: 'blast_mollie', island },
    }),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((j && j.detail) || `HTTP ${res.status}`)
  const checkoutUrl = j._links && j._links.checkout && j._links.checkout.href
  if (!checkoutUrl) throw new Error('no checkout href')
  return { id: j.id, checkoutUrl, amount, currency }
}

// ── Construction email ──
function buildB2CEmail(lead, checkoutUrl) {
  const rc = regionConfig(lead.island)
  const p = pricing(lead.island)
  const lang = langFor(lead.island, lead.source)
  const brand = rc.brand

  const title = lang === 'en' ? 'Your beach forecast — one click away'
    : lang === 'es' ? 'Tu pronóstico de playas — a un clic'
    : 'Votre prévision des plages — à un clic'

  const ctaText = lang === 'en' ? 'Activate my pass →'
    : lang === 'es' ? 'Activar mi pase →'
    : 'Activer mon pass →'

  return {
    subject: title + ' — ' + brand,
    preheader: 'Cliquez, payez, voyez les plages. 1 clic, pas d\'abonnement.',
    html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F7F5EF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:480px;margin:0 auto;padding:20px">
  ${brandHeader('Le Veilleur', brand, 'Ouvrez les plages en 1 clic')}
  <div style="background:#fff;padding:24px 20px;border-radius:0 0 16px 16px">
    <p style="font-size:15px;line-height:1.6;color:#1a1a1a;margin:0 0 16px">
      <strong>Les sargasses sont de retour en ce mois de juillet.</strong> Ne découvrez pas l'état de la plage une fois arrivé — sachez avant, depuis votre téléphone.
    </p>
    <div style="background:#F7F5EF;border-radius:12px;padding:16px;margin-bottom:18px;text-align:center">
      <div style="font-size:13px;color:#666">Offre exclusive · Pass 7 jours</div>
      <div style="font-size:32px;font-weight:700;color:#0D0D0D">${p.p7}${p.symbol}</div>
      <div style="font-size:12px;color:#999">Paiement unique · Sans abonnement · Satisfait ou remboursé 30j</div>
    </div>
    <div style="text-align:center;margin:18px 0">
      <a href="${checkoutUrl}" style="display:inline-block;padding:16px 40px;background:linear-gradient(158deg,#FFE47A,#FFC72C,#E89400);color:#0D0D0D;text-decoration:none;border-radius:12px;font-size:18px;font-weight:700">${ctaText}</a>
    </div>
    <p style="font-size:12px;color:#999;text-align:center;margin-top:14px">Paiement sécurisé par Mollie · CB, Apple Pay, Google Pay</p>
    <table style="width:100%;border-collapse:collapse;margin-top:16px;padding-top:14px;border-top:1px solid #eee">
      <tr><td style="padding:6px 0;vertical-align:top;font-size:14px">🗺️</td><td style="padding:6px 0;font-size:14px;color:#333">Carte satellite 4×/jour</td></tr>
      <tr><td style="padding:6px 0;vertical-align:top;font-size:14px">📅</td><td style="padding:6px 0;font-size:14px;color:#333">Prévision 7 jours</td></tr>
      <tr><td style="padding:6px 0;vertical-align:top;font-size:14px">🔔</td><td style="padding:6px 0;font-size:14px;color:#333">Alerte si votre plage change</td></tr>
    </table>
  </div>
</div></body></html>`,
  }
}

function buildB2BEmail(lead) {
  const rc = regionConfig(lead.island)
  const p = pricing(lead.island)
  const domain = rc.domain

  return {
    subject: `${rc.brand} — Votre tableau de bord plages est prêt (essai 30j gratuit)`,
    preheader: 'Widget marque-blanche, alertes par plage. Sans engagement.',
    html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F7F5EF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:480px;margin:0 auto;padding:20px">
  ${brandHeader('Sargasses Pro', rc.brand, 'Votre établissement mérite une longueur d\'avance')}
  <div style="background:#fff;padding:24px 20px;border-radius:0 0 16px 16px">
    <p style="font-size:15px;line-height:1.6;color:#1a1a1a;margin:0 0 16px">
      <strong>Chaque matin, l'état réel de VOS plages.</strong> Pas de devinettes — une image satellite traitée, servie à vos clients.
    </p>
    <ul style="font-size:14px;line-height:1.7;color:#333;margin:0 0 18px;padding-left:18px">
      <li><strong>Widget à votre marque</strong> — zéro crédit visible</li>
      <li><strong>Alertes par plage</strong> — vent tourne ? Vous savez avant</li>
      <li><strong>Placement app</strong> — vos plages en avant, les voyageurs viennent à vous</li>
    </ul>
    <div style="text-align:center;margin:18px 0">
      <a href="https://${domain}/pro/espace/" style="display:inline-block;padding:15px 36px;background:linear-gradient(158deg,#FFE47A,#FFC72C,#E89400);color:#0D0D0D;text-decoration:none;border-radius:12px;font-size:16px;font-weight:700">Démarrer l'essai gratuit 30 jours →</a>
    </div>
    <p style="font-size:12px;color:#999;text-align:center">Sans carte · Sans engagement · Résiliable à tout moment</p>
    <p style="font-size:13px;color:#666;line-height:1.5;margin-top:18px;padding-top:14px;border-top:1px solid #eee">
      <strong>Déjà convaincu ?</strong> Passez directement au Pro à <strong>${p.pro || '690'}${p.symbol}/an</strong> — accès immédiat.
    </p>
  </div>
</div></body></html>`,
  }
}

// ── Chargement des leads ──
function loadB2CLeads() {
  const subPath = path.join(DATA_DIR, 'subscribers.json')
  if (!fs.existsSync(subPath)) { console.log('  subscribers.json introuvable — skip B2C'); return [] }
  const subs = loadJSON(subPath, [])
  const sources = new Set(['welcome', 'drip', 'onsite_checkout', 'pay_intent', 'sg_share', 'referral_landing', 'sg_alert', 'beach_alert', 'sargacatch', 'daily_verdict', 'signup', ''])
  return subs
    .filter(s => sources.has((s.source || '').toLowerCase()))
    .map(s => ({ email: (s.email || '').trim().toLowerCase(), island: ((s.island || 'mq')).toLowerCase(), source: s.source || 'unknown' }))
    .filter(s => s.email.includes('@'))
}

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
  const seen = new Set()
  return contacts
    .filter(c => c.email && c.email.includes('@'))
    .filter(c => { const h = emailHash(c.email); if (seen.has(h)) return false; seen.add(h); return true })
    .map(c => ({ email: c.email.trim().toLowerCase(), island: (c.island || c.region || 'mq').toLowerCase(), source: 'b2b', name: c.hotel || c.name || '', hook: c.hook || '' }))
}

// ── Pool de concurrence ──
async function asyncPool(concurrency, items, fn) {
  const results = []
  const queue = items.map((item, i) => ({ item, i }))
  const running = []
  while (queue.length || running.length) {
    while (running.length < concurrency && queue.length) {
      const { item, i } = queue.shift()
      const p = fn(item, i).then(r => { results[i] = r }).catch(e => { results[i] = { error: e.message || String(e) } })
      running.push(p)
      p.finally(() => running.splice(running.indexOf(p), 1))
    }
    await Promise.race(running)
  }
  return results
}

async function main() {
  console.log('=== Blast Mollie Offer (DIRECT PAYMENT) ===')
  console.log(`Mode: ${SEND ? 'SEND' : 'DRY-RUN'} | Cap: ${CAP}`)

  const MOLLIE_KEY = process.env.MOLLIE_API_KEY
  const canCreatePayments = MOLLIE_KEY && SEND && !NO_CREATE_PAYMENTS

  const b2cLeads = ONLY_B2B ? [] : loadB2CLeads()
  const b2bLeads = ONLY_B2C ? [] : loadB2BLeads()
  console.log(`Leads B2C: ${b2cLeads.length}, B2B: ${b2bLeads.length}`)

  const sent = loadJSON(SENT_PATH, {})
  const bouncedSet = new Set((loadJSON(BOUNCED_PATH, []) || []).map(e => typeof e === 'string' ? e : e.hash || ''))
  const paidSet = new Set()

  // Fetch paid customers from Mollie
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
    } catch (e) { console.log(`  Warning Mollie API: ${e.message}`) }
  }
  console.log(`  Déjà payants: ${paidSet.size}`)

  // Filter candidates
  const candidates = []
  const seenEmail = new Set()
  for (const lead of [...b2cLeads, ...b2bLeads]) {
    const h = emailHash(lead.email)
    if (seenEmail.has(h)) continue
    seenEmail.add(h)
    if (sent[h]) continue
    if (bouncedSet.has(h)) { console.log(`  Bounced: ${logId(lead.email)}`); continue }
    if (paidSet.has(h)) { console.log(`  Paid: ${logId(lead.email)}`); continue }
    candidates.push(lead)
  }

  const toSend = candidates.slice(0, CAP)
  console.log(`À envoyer: ${toSend.length}/${candidates.length} (cap ${CAP})`)

  if (!toSend.length) { console.log('Rien à envoyer.'); return }

  const b2bCount = toSend.filter(l => l.source === 'b2b').length
  const b2cCount = toSend.length - b2bCount

  if (!SEND) {
    console.log(`  B2C: ${b2cCount} · B2B: ${b2bCount}`)
    for (const l of toSend.slice(0, 10)) console.log(`  • ${logId(l.email)} | ${l.island} | ${l.source}`)
    if (toSend.length > 10) console.log(`  ... et ${toSend.length - 10} de plus`)
    if (canCreatePayments) console.log('  Créerait des paiements Mollie individuels pour chaque B2C')
    console.log("Passe --send pour envoyer")
    return
  }

  if (!mailReadyCheck()) { console.error('SMTP_PASS absent'); process.exit(1) }

  // Create Mollie payments for B2C leads
  let payments = {}  // emailHash -> checkoutUrl
  const b2cToPay = toSend.filter(l => l.source !== 'b2b')
  if (canCreatePayments && b2cToPay.length > 0) {
    console.log(`\nCréation de ${b2cToPay.length} paiements Mollie (concurrence ${CONCURRENCY})...`)
    const results = await asyncPool(CONCURRENCY, b2cToPay, async (lead) => {
      const h = emailHash(lead.email)
      try {
        const pay = await createBlastPayment(MOLLIE_KEY, lead.email, lead.island, 'p7')
        return { hash: h, checkoutUrl: pay.checkoutUrl, payId: pay.id }
      } catch (e) {
        console.log(`  Paiement ÉCHOUÉ ${logId(lead.email)}: ${e.message}`)
        return { hash: h, checkoutUrl: null, payId: null, error: e.message }
      }
    })
    for (const r of results) {
      if (r && r.checkoutUrl) payments[r.hash] = r.checkoutUrl
    }
    console.log(`  Paiements créés: ${Object.keys(payments).length}/${b2cToPay.length}`)
  } else if (SEND && !MOLLIE_KEY && b2cToPay.length > 0) {
    console.log('  MOLLIE_API_KEY absent — fallback vers lien paywall')
  }

  // Send emails
  console.log('\nEnvoi des emails...')
  let ok = 0, fail = 0
  for (const lead of toSend) {
    const h = emailHash(lead.email)
    const lang = langFor(lead.island, lead.source)
    const checkoutUrl = lead.source !== 'b2b'
      ? (payments[h] || `https://${regionConfig(lead.island).domain}/?paywall=1&pass=p7&utm_source=blast_mollie`)
      : null

    try {
      const email = lead.source === 'b2b'
        ? buildB2BEmail(lead, checkoutUrl)
        : buildB2CEmail(lead, checkoutUrl)
      const from = `Le Veilleur <${FROM_DOMAIN}>`
      const tid = makeTrackingId('blast_mollie', lead.email)

      const { data, error } = await sendEmail({
        from, to: lead.email, subject: email.subject, html: email.html,
        preheader: email.preheader, trackingId: tid,
      })
      if (error) { console.log(`  Email FAIL ${logId(lead.email)}: ${error.message}`); fail++; continue }
      console.log(`  ${lead.source === 'b2b' ? 'B2B' : 'B2C'} ${logId(lead.email)} (${lead.island})`)
      ok++
      sent[h] = { sentAt: new Date().toISOString(), island: lead.island, source: lead.source, hasCheckout: !!checkoutUrl }
      fs.mkdirSync(path.dirname(SENT_PATH), { recursive: true })
      fs.writeFileSync(SENT_PATH, JSON.stringify(sent, null, 2))
    } catch (e) { console.log(`  SEND FAIL ${logId(lead.email)}: ${e.message}`); fail++ }
  }

  fs.writeFileSync(SENT_PATH, JSON.stringify(sent, null, 2))
  console.log(`\nRésultat: ${ok} envoyés, ${fail} échecs`)
  if (Object.keys(payments).length > 0) {
    console.log(`Paiements Mollie créés: ${Object.keys(payments).length}`)
  }
}

main().catch(e => { console.error('ERREUR:', e.message); process.exit(1) })
