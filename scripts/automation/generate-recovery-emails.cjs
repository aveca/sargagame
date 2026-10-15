#!/usr/bin/env node
/**
 * generate-recovery-emails.cjs  Génère des fichiers .eml prêts à envoyer
 * pour les paiements échoués (contournement SMTP_PASS manquant)
 * 
 * Usage :
 *   node scripts/automation/generate-recovery-emails.cjs
 *   # Génère recovery-emails/egoursaud.eml, jcroulier.eml, hamitchell62.eml
 */

const fs = require('fs')
const path = require('path')

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

function brandHeader(title, subtitle) {
  return `<div style="background:linear-gradient(135deg,#FFC72C,#FFB347);padding:20px 24px;border-radius:12px 12px 0 0;text-align:center">
    <img src="https://sargasses-martinique.com/veilleur-logo-120.png" alt="Le Veilleur" style="width:60px;height:60px;border-radius:50%;border:3px solid #fff">
    <h1 style="margin:12px 0 4px;font-size:22px;color:#0d1117;font-weight:700">${title}</h1>
    <p style="margin:0;font-size:14px;color:#0d1117;opacity:.85">${subtitle}</p>
  </div>`
}

function makeTrackingId(type, email) {
  const date = new Date().toISOString().split('T')[0]
  const hash = require('crypto').createHash('md5').update(email).digest('hex').slice(0, 8)
  return `${type}:${date}:${hash}`
}

function main() {
  console.log('=== Génération des emails de récupération ===')
  
  const outputDir = path.join(__dirname, '..', '..', 'recovery-emails')
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  for (const t of TARGETS) {
    const { email, island, lang, isReturning, attempts, currency, domain } = t
    const paywallUrl = `https://${domain}/?paywall=1&utm_source=email&utm_medium=payment_retry`
    const tid = makeTrackingId('payment_retry', email)

    const subject = lang === 'fr'
      ? (isReturning ? "Ton paiement n'est pas passé — on te réserve tes prévisions" : "Petit contretemps sur ton paiement")
      : "Your payment didn't go through — let's fix it"

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
          <a href="${paywallUrl}" style="display:inline-block;background:#FFC72C;color:#0d1117;font-size:16px;font-weight:700;padding:14px 32px;border-radius:40px;text-decoration:none;margin:6px 0 20px">Finaliser mon achat →</a>
          <p style="margin:18px 0 0;font-size:13px;color:#666">Une question ? Réponds simplement à cet email.</p>
          <p style="margin:18px 0 0;font-size:11px;color:#999">Tracking: ${tid}</p>
        </div>`
      : `<div style="padding:30px 24px;font-size:15px;line-height:1.6;color:#1a1a1a">
          <p style="margin:0 0 18px">Hi,</p>
          <p style="margin:0 0 18px">Your payment didn't go through — this sometimes happens with international transactions or bank security checks.</p>
          <p style="margin:0 0 18px">You can try a different card or use Apple Pay / Google Pay directly on our page:</p>
          <a href="${paywallUrl}" style="display:inline-block;background:#FFC72C;color:#0d1117;font-size:16px;font-weight:700;padding:14px 32px;border-radius:40px;text-decoration:none;margin:6px 0 20px">Complete my purchase →</a>
          <p style="margin:18px 0 0;font-size:13px;color:#666">Questions? Just reply to this email.</p>
          <p style="margin:18px 0 0;font-size:11px;color:#999">Tracking: ${tid}</p>
        </div>`

    const preheader = lang === 'fr'
      ? 'Clique pour finaliser ton accès en 30 secondes'
      : 'Click to complete your access in 30 seconds'

    const html = `${brandHeader('Le Veilleur', lang === 'fr' ? 'Ton accès est presque prêt' : 'Your access is almost ready')}${body}`

    // Générer le fichier .eml
    const filename = path.join(outputDir, `${email.replace('@', '_at_')}.eml`)
    const emlContent = `From: "Le Veilleur" <alerte@sargasses-martinique.com>
To: <${email}>
Subject: ${subject}
MIME-Version: 1.0
Content-Type: text/html; charset="UTF-8"
X-Tracking: ${tid}

${html}
`

    fs.writeFileSync(filename, emlContent)
    console.log(`✅ Généré: ${filename}`)
    console.log(`   À: ${email}`)
    console.log(`   Sujet: ${subject}`)
    console.log(`   Lien: ${paywallUrl}`)
    console.log()
  }

  console.log('✨ Tous les emails sont prêts dans recovery-emails/')
  console.log('   Pour envoyer: copier-coller le contenu dans votre client email')
}

main().catch(e => { console.error(e); process.exit(1) })
