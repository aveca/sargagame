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
 * Env: SMTP_PASS (requis). TEST_TO (optionnel, défaut yacovassaraf@gmail.com).
 * Usage: node scripts/automation/smtp-selftest.cjs
 */
const { sendEmail, mailReady, normalizeFrom } = require('./lib/email-send.cjs')

const TO = (process.env.TEST_TO || '').trim() || 'yacovassaraf@gmail.com'
const FROM = 'Sargasses (test SMTP) <alerte@sargasses-martinique.com>'

async function main() {
  console.log('=== SMTP self-test ===')
  console.log('mailReady:', mailReady())
  if (!mailReady()) {
    console.error('❌ SMTP_PASS absent — secret non posé. Rien envoyé.')
    process.exit(1)
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
main().catch(e => { console.error(e); process.exit(1) })
