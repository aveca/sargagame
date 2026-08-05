#!/usr/bin/env node
/**
 * recover-failed-payments.cjs — Relance ciblée des paiements Mollie échoués
 *
 * Cible les vrais utilisateurs qui ont tenté un paiement pass et échoué (carte
 * refusée, 3DS timeout). Envoie un email personnalisé pointing vers le pas de
 * vente, dans la langue de leur région.
 *
 * Usage :
 *   node scripts/automation/recover-failed-payments.cjs            # DRY-RUN
 *   node scripts/automation/recover-failed-payments.cjs --send     # envoie
 */
const { sendEmail, brandHeader, mailReady, makeTrackingId } = require('./lib/email-send.cjs')
const { logId } = require('./lib/email-hash.cjs')

const args = process.argv.slice(2)
const SEND = args.includes('--send')

const TARGETS = [
  {
    email: 'egoursaud@wanadoo.fr',
    island: 'mq',
    currency: 'eur',
    domain: 'sargasses-martinique.com',
    lang: 'fr',
    attempts: 2,
  },
  {
    email: 'jcroulier@gmail.com',
    island: 'mq',
    currency: 'eur',
    domain: 'sargasses-martinique.com',
    lang: 'fr',
    isReturning: true,
  },
  {
    email: 'hamitchell62@gmail.com',
    island: 'puntacana',
    currency: 'usd',
    domain: 'sargassumpuntacana.com',
    lang: 'en',
  },
]

async function main() {
  console.log(`=== Recover Failed Payments ===  [${SEND ? 'ENVOI' : 'DRY-RUN'}]`)

  if (SEND && !mailReady()) {
    console.error('SMTP_PASS manquant — impossible.')
    process.exit(1)
  }

  const domain = (t) => t.domain
  const paywallUrl = (t) => `https://${domain(t)}/?paywall=1&utm_source=email&utm_medium=payment_retry`

  for (const t of TARGETS) {
    const { email, island, lang, isReturning, attempts, currency } = t
    const id = logId(email)
    const tid = makeTrackingId('payment_retry', email)

    const subject = lang === 'fr'
      ? (isReturning ? 'Ton paiement n\'est pas passé — on te réserve tes prévisions' : 'Petit contretemps sur ton paiement')
      : 'Your payment didn\'t go through — let\'s fix it'

    const body = lang === 'fr'
      ? `<div style="padding:30px 24px;font-size:15px;line-height:1.6;color:#1a1a1a">
          <p style="margin:0 0 18px">Bonjour,</p>
          ${attempts >= 2
            ? `<p style="margin:0 0 18px">On a vu que ta carte n'a pas passé à deux reprises. Pas d'inquiétude — c'est souvent un refus temporaire de la banque.</p>
               <p style="margin:0 0 18px">Tu peux réessayer avec une autre carte, ou utiliser Apple Pay / Google Pay directement depuis notre page :</p>`
            : isReturning
              ? `<p style="margin:0 0 18px">Ton précédent achat chez nous a bien fonctionné, mais le dernier paiement n'a pas abouti. On a conservé tes plages favorites — il ne manque plus que ça.</p>
                 <p style="margin:0 0 18px">Clique ici pour finaliser :</p>`
              : `<p style="margin:0 0 18px">On a détecté une interruption lors de ta commande. Pas de souci — ça arrive.</p>
                 <p style="margin:0 0 18px">Tu peux reprendre là où tu en étais :</p>`
          }
          <a href="${paywallUrl(t)}" style="display:inline-block;background:#FFC72C;color:#0d1117;font-size:16px;font-weight:700;padding:14px 32px;border-radius:40px;text-decoration:none;margin:6px 0 20px">Finaliser mon achat →</a>
          <p style="margin:18px 0 0;font-size:13px;color:#666">Une question ? Réponds simplement à cet email.</p>
        </div>`
      : `<div style="padding:30px 24px;font-size:15px;line-height:1.6;color:#1a1a1a">
          <p style="margin:0 0 18px">Hi,</p>
          <p style="margin:0 0 18px">Your payment didn't go through — this sometimes happens with international transactions or bank security checks.</p>
          <p style="margin:0 0 18px">You can try a different card or use Apple Pay / Google Pay directly on our page :</p>
          <a href="${paywallUrl(t)}" style="display:inline-block;background:#FFC72C;color:#0d1117;font-size:16px;font-weight:700;padding:14px 32px;border-radius:40px;text-decoration:none;margin:6px 0 20px">Complete my purchase →</a>
          <p style="margin:18px 0 0;font-size:13px;color:#666">Questions ? Just reply to this email.</p>
        </div>`

    const preheader = lang === 'fr'
      ? 'Clique pour finaliser ton accès en 30 secondes'
      : 'Click to complete your access in 30 seconds'

    const html = `${brandHeader('Le Veilleur', lang === 'fr' ? 'Ton accès est presque prêt' : 'Your access is almost ready')}${body}`

    console.log(`\n── ${email} [${island}/${currency}] ${attempts ? attempts+' tentatives' : ''} ──`)
    console.log(`  Sujet : ${subject}`)
    console.log(`  Tracking: ${tid}`)

    if (SEND) {
      const r = await sendEmail({
        from: 'Le Veilleur <alerte@sargasses-martinique.com>',
        to: email,
        subject,
        html,
        preheader,
        trackingId: tid,
      })
      if (r.error) {
        console.log(`  ✗ ÉCHEC : ${r.error.message}`)
      } else {
        console.log(`  ✓ ENVOYÉ (${r.data.id})`)
      }
    }
  }

  console.log(`\nTerminé. ${SEND ? '3 emails envoyés.' : 'Dry-run — passe --send pour envoyer.'}`)
}

main().catch(e => { console.error(e); process.exit(1) })
