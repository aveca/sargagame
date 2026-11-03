#!/usr/bin/env node
/**
 * smtp-selftest.cjs — Diagnostic d'envoi SMTP (boîte alerte@).
 *
 * Envoie UN email de test au destinataire (TEST_TO, défaut = le fondateur) via la
 * couche partagée lib/email-send.cjs, puis imprime le résultat. Sert à vérifier
 * que `SMTP_PASS` est posé et que l'auth + la délivrabilité fonctionnent, sans
 * écrire d'état ni toucher un destinataire réel d'utilisateur.
 *
 * Sorties possibles :
 *   - "SMTP_PASS absent"      → secret non posé (mailReady=false)
 *   - "Échec envoi SMTP: …"   → secret présent mais auth/host KO
 *   - "Envoyé … message-id …" → bout-en-bout OK (vérifier la réception en boîte)
 *
 * Env: SMTP_PASS (requis). TEST_TO (optionnel, défaut alerte@sargasses-martinique.com).
 *
 * GOUVERNANCE SORTANTE (mission P0.23 / #1157) : un dispatch manuel NE suffit PAS à
 * autoriser un envoi réel. Le contrat central exige en plus le jeton d'un Environment
 * protégé, vérifié en lecture seule via l'API GitHub. Sans ça : simulation (rien
 * n'est envoyé), et le signal est explicite — jamais un faux « Envoyé ».
 * Usage: node scripts/automation/smtp-selftest.cjs
 */
const { sendEmail, mailReady, normalizeFrom } = require('./lib/email-send.cjs')
const { authorizeActionAsync, describeDecision } = require('./lib/safety.cjs')

const TO = (process.env.TEST_TO || '').trim() || 'alerte@sargasses-martinique.com'
const FROM = 'Sargasses (test SMTP) <alerte@sargasses-martinique.com>'

async function main() {
  console.log('=== SMTP self-test ===')
  console.log('mailReady:', mailReady())
  if (!mailReady()) {
    console.error('❌ SMTP_PASS absent — secret non posé. Rien envoyé.')
    process.exit(1)
  }
  // Autorisation immediatement avant l'effet externe (contrat central).
  // L'invocation manuelle EST la demande (`requested`) : l'approbation, elle, doit être prouvée.
  const decision = await authorizeActionAsync('email_send', { requested: true })
  console.log(describeDecision(decision))
  if (!decision.execute) {
    console.log(`⏸️  SIMULATION (${decision.mode}) — aucun email envoyé. ${decision.reason}`)
    return
  }
  const stamp = new Date().toISOString()
  const { data, error } = await sendEmail({
    from: FROM,
    to: TO,
    subject: `[test SMTP] alerte@ — ${stamp}`,
    html: `<p>Test d'envoi via la boîte <strong>alerte@sargasses-martinique.com</strong> (SMTP nodemailer).</p>`
      + `<p>Horodatage : ${stamp}</p>`
      + `<p>Si tu reçois ceci, la migration Resend→SMTP fonctionne de bout en bout.</p>`,
  })
  if (error) {
    console.error('❌ Échec envoi SMTP:', error.message)
    process.exit(1)
  }
  console.log(`✅ Envoyé à ${TO} · message-id: ${data && data.id}`)
  console.log('From normalisé:', normalizeFrom(FROM))
}
// Garde d'exécution (mission P0.23 / #1157) : un `require()` n'a aucun effet
// réseau ; seule une exécution directe lance main().
if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1) })
}
