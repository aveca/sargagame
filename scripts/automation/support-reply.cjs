#!/usr/bin/env node
/**
 * support-reply.cjs — réponse client 1:1 (support), envoyée depuis la boîte
 * alerte@ via SMTP (lib email-send). Conçu pour tourner en GitHub Actions
 * (workflow support-reply.yml) où SMTP_PASS est dispo — ce que le conteneur
 * web n'a pas (secrets GH + port 465 filtré ici).
 *
 * HOLD par défaut : sans SEND=1, le script imprime l'email (dry-run) et n'envoie
 * RIEN. C'est la règle du repo (SMTP dry-run par défaut). On passe SEND=1 au
 * dispatch quand on veut réellement envoyer.
 *
 * Entrées (env) :
 *   TO       destinataire (email client)            [obligatoire pour envoyer]
 *   NAME     prénom/nom du client (personnalisation) [optionnel]
 *   KIND     'jc_access' | 'julien_ux' | 'access_generic'  [obligatoire]
 *   REGION   'guadeloupe' | 'martinique' (domaine du lien) [défaut guadeloupe]
 *   SEND     '1' pour envoyer pour de vrai (sinon dry-run)
 */
const path = require('path')
const { sendEmail, brandHeader } = require(path.join(__dirname, 'lib', 'email-send.cjs'))

const TO = (process.env.TO || '').trim()
const NAME = (process.env.NAME || '').trim()
const KIND = (process.env.KIND || '').trim()
const REGION = (process.env.REGION || 'guadeloupe').trim().toLowerCase()
const SEND = process.env.SEND === '1'

const DOMAIN = REGION === 'martinique' ? 'sargasses-martinique.com' : 'sargasses-guadeloupe.com'
const SITE = `https://${DOMAIN}`
const hi = NAME ? `Bonjour ${NAME},` : 'Bonjour,'

// Bloc « Restaurer mon accès » réutilisé (accès Pass récupérable par email après
// le correctif de récupération cross-device).
function restoreSteps() {
  return `
  <div style="text-align:center;margin:18px 0">
    <a href="${SITE}/?restore=1" style="display:inline-block;background:#0E7C66;color:#fff;font-weight:800;
       font-size:15px;text-decoration:none;padding:13px 22px;border-radius:10px">Retrouver mon accès en un clic →</a>
    <div style="font-size:12px;color:#8a97a5;margin-top:8px">Entrez l'e-mail de paiement (celui-ci) quand on vous le demande.</div>
  </div>
  <p style="font-size:13px;color:#5a6b73;margin:10px 0 0">Ou manuellement : ouvrez
    <a href="${SITE}" style="color:#0E7C66;font-weight:700">${DOMAIN}</a> → une plage → le cadenas →
    <strong>« Déjà payé ? Restaurer mon accès »</strong> → votre e-mail de paiement.</p>`
}

function tmpl() {
  if (KIND === 'jc_access' || KIND === 'access_generic') {
    const kicker = 'Votre accès, rétabli'
    const title = 'Toutes mes excuses — voici comment récupérer votre Pass'
    const html = `${brandHeader(kicker, title, 'On regarde la mer pour vous.')}
    <div style="font-size:15px;line-height:1.7;color:#23323a">
      <p>${hi}</p>
      <p>Toutes mes excuses pour la gêne. Vous aviez raison de nous écrire : nous avons identifié le problème.</p>
      <p>Après notre passage à un nouveau système de paiement, l'accès de certains Pass ne se retrouvait pas
         automatiquement quand on ouvrait l'app sur un autre téléphone ou navigateur que celui du paiement.
         <strong>C'est corrigé.</strong> Votre Pass est bien valide — vous n'avez rien à repayer.</p>
      <p><strong>Pour récupérer votre accès maintenant :</strong></p>
      ${restoreSteps()}
      <p>Conseil : restez ensuite sur le même téléphone + navigateur, et ajoutez l'app à l'écran d'accueil
         pour ne plus avoir à recommencer.</p>
      <p>Si jamais l'accès ne revient toujours pas, répondez simplement à ce message (en gardant l'e-mail de
         paiement) : je règle ça personnellement, et si besoin je vous rembourse — vous ne paierez jamais pour
         un service auquel vous n'accédez pas.</p>
      <p>Encore désolé, et merci de votre patience.<br>Le Veilleur — Sargasses ${REGION === 'martinique' ? 'Martinique' : 'Guadeloupe'}</p>
    </div>`
    return { subject: 'Votre accès Sargasses — c’est corrigé, voici comment récupérer votre Pass', html, preheader: 'Toutes mes excuses : l’accès est rétabli, rien à repayer.' }
  }
  if (KIND === 'julien_ux') {
    const kicker = 'Merci pour votre retour'
    const title = 'Vous avez raison — on le rend plus visible'
    const html = `${brandHeader(kicker, title, 'On regarde la mer pour vous.')}
    <div style="font-size:15px;line-height:1.7;color:#23323a">
      <p>${hi}</p>
      <p>Merci beaucoup, c'est un retour très utile — et vous avez raison : le lien <strong>« voir la fiche
         complète »</strong> (qui ouvre la prévision détaillée 7 jours, la confiance et l'historique) était
         trop discret face au bloc du jour. On le rend nettement plus visible dans la prochaine mise à jour.</p>
      <p>En attendant, pour la prévision 7 jours d'une plage : ouvrez sa fiche puis touchez « voir la fiche
         complète » — tout le détail jour par jour est là.</p>
      <p>Merci d'avoir pris le temps, ça aide vraiment à améliorer l'app.<br>
         Bonne journée,<br>Le Veilleur — Sargasses ${REGION === 'martinique' ? 'Martinique' : 'Guadeloupe'}</p>
    </div>`
    return { subject: 'Merci pour votre retour — la fiche complète, bientôt plus visible', html, preheader: 'Vous avez raison, on le rend plus visible.' }
  }
  throw new Error(`KIND inconnu: "${KIND}" (attendu: jc_access | julien_ux | access_generic)`)
}

async function main() {
  if (!KIND) { console.error('KIND manquant'); process.exit(1) }
  const { subject, html, preheader } = tmpl()
  console.log(`[support-reply] KIND=${KIND} REGION=${REGION} TO=${TO || '(vide)'} SEND=${SEND ? '1' : '0 (dry-run)'}`)
  console.log(`[support-reply] SUBJECT: ${subject}`)
  if (!SEND) {
    console.log('[support-reply] DRY-RUN — aucun envoi. (Passer SEND=1 pour envoyer.)')
    console.log('--- HTML (extrait) ---')
    console.log(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 600))
    return
  }
  if (!TO || !TO.includes('@')) { console.error('TO invalide pour un envoi réel'); process.exit(1) }
  const info = await sendEmail({
    to: TO,
    subject,
    html,
    preheader,
    replyTo: 'alerte@sargasses-martinique.com',
  })
  console.log('[support-reply] ENVOYÉ ✓', info && info.messageId ? info.messageId : '')
}

main().catch((e) => { console.error('[support-reply] ERREUR', e && e.message); process.exit(1) })
