#!/usr/bin/env node
/**
 * recover-b2b-anoli.cjs — Relance conversion Anoli Lodges
 *
 * Anoli Lodges a installé le widget (pro), reçu le drip B2B complet
 * (b0→b13, dernier envoi 2026-07-11). N'a pas converti.
 * Cette relance est PERSONNALISÉE : référence leur widget existant,
 * propose le white-label Pro (retirer le backlink "Conditions par Sargasses").
 *
 * Usage :
 *   node scripts/automation/recover-b2b-anoli.cjs               # DRY-RUN
 *   SMTP_PASS=... node scripts/automation/recover-b2b-anoli.cjs --send
 */
const { sendEmail, brandHeader, mailReady, makeTrackingId } = require('./lib/email-send.cjs')

const args = process.argv.slice(2)
const SEND = args.includes('--send')

const TARGET = {
  email: 'admin@anoli-lodges.com',
  name: 'Anoli Lodges',
  domain: 'sargasses-martinique.com',
  lang: 'fr',
}

async function main() {
  console.log(`=== Relance Anoli Lodges ===  [${SEND ? 'ENVOI' : 'DRY-RUN'}]`)

  if (SEND && !mailReady()) {
    console.error('SMTP_PASS manquant.')
    process.exit(1)
  }

  const { email, name, domain, lang } = TARGET
  const tid = makeTrackingId('b2b_anoli_conversion', email)

  const subject = `Votre widget Le Veilleur est installé — et si on lui enlevait ses "Conditions" ?`

  const body = `<div style="padding:30px 24px;font-size:15px;line-height:1.6;color:#1a1a1a">
    <p style="margin:0 0 18px">Bonjour,</p>
    <p style="margin:0 0 18px">Vous utilisez notre widget Le Veilleur sur votre site depuis quelques semaines — merci pour la confiance.</p>
    <p style="margin:0 0 18px">Vous avez peut-être remarqué le petit lien <em>"Conditions par Sargasses"</em> en bas du widget. C'est notre signature. <strong>En passant à l'offre Pro, ce lien disparaît : le widget devient 100% blanc, aux couleurs de votre hôtel.</strong></p>
    <p style="margin:0 0 18px">Concrètement, ça veut dire :</p>
    <ul style="margin:0 0 18px;padding-left:20px">
      <li style="margin-bottom:6px">Votre logo, vos couleurs</li>
      <li style="margin-bottom:6px">Aucune mention Sargasses, aucune publicité</li>
      <li style="margin-bottom:6px">Données exclusives : vous voyez les prévisions avant tout le monde</li>
    </ul>
    <p style="margin:0 0 18px">C'est 79€/mois. On ne vous demandera pas de signer un engagement longue durée.</p>
    <a href="https://${domain}/pro/espace/?b=anoli" style="display:inline-block;background:#FFC72C;color:#0d1117;font-size:16px;font-weight:700;padding:14px 32px;border-radius:40px;text-decoration:none;margin:6px 0 20px">Découvrir l'offre Pro →</a>
    <p style="margin:18px 0 0;font-size:13px;color:#666">Une question ? Répondez simplement à cet email — on est réactifs.</p>
  </div>`

  const html = `${brandHeader('Offre personnalisée', name, 'Votre widget mérite votre marque')}${body}`

  console.log(`\nÀ : ${email}`)
  console.log(`Sujet : ${subject}`)
  console.log(`Tracking: ${tid}`)

  if (SEND) {
    const r = await sendEmail({
      from: 'Le Veilleur <alerte@sargasses-martinique.com>',
      to: email,
      subject,
      html,
      preheader: 'Retirez le lien "Conditions" et personnalisez votre widget',
      trackingId: tid,
    })
    if (r.error) {
      console.log(`✗ ÉCHEC : ${r.error.message}`)
    } else {
      console.log(`✓ ENVOYÉ (${r.data.id})`)
    }
  }

  console.log(`\n${SEND ? 'Fait.' : 'Dry-run — passe --send pour envoyer.'}`)
}

main().catch(e => { console.error(e); process.exit(1) })
