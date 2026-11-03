#!/usr/bin/env node
/**
 * notify-failure.cjs — Notify on workflow failure: sends alert email via SMTP
 * (boite alerte@).
 *
 * Environment:
 *   SMTP_PASS      - mot de passe de la boite alerte@ (secret)
 *   WORKFLOW_NAME  - name of the failed workflow
 *   RUN_URL        - GitHub Actions run URL
 *   FAILURE_STEP   - (optional) name of the step that failed
 *
 * Usage: node scripts/automation/notify-failure.cjs
 *
 * Mission P0.23 / issue #1157 : ce script envoyait un email des son import,
 * avec pour seule condition la presence de SMTP_PASS — donc sur CHAQUE run en
 * echec, y compris les crons. Il passe desormais par le contrat central :
 * DRY-RUN par defaut, et une alerte reelle exige un dispatch manuel + jeton
 * d'approbation + Environment GitHub protege verifie. L'evenement ops local
 * (ops-events.jsonl) reste ecrit dans tous les cas : il n'est PAS sortant.
 */
const fs = require('fs')
const path = require('path')

const WORKFLOW = process.env.WORKFLOW_NAME || 'Unknown workflow'
const RUN_URL = process.env.RUN_URL || ''
const STEP = process.env.FAILURE_STEP || ''

// ADR-B ops bus event: append pipeline_fail to repo file (drained by local cron).
// Writing here is best-effort; cloud runner cannot reach the local SQLite bus directly.
// The main job's commit step does NOT run when this job fires (separate job), so the
// event lives in the runner filesystem until step 5 adds a push step here.
//
// Mission P0.23 / #1157 : l'append était à la portée du MODULE, donc un simple
// `require()` de ce fichier écrivait dans le repo. Il est désormais déclenché
// uniquement par main() : importer le module n'a AUCUN effet de bord.
function appendOpsEvent() {
  try {
    const dir = path.join('scripts', 'automation', 'data')
    fs.mkdirSync(dir, { recursive: true })
    const event = {
      ts: Date.now(),
      source: 'sargagame/daily_copernicus',
      kind: 'pipeline_fail',
      ok: 0,
      payload: {
        workflow: WORKFLOW,
        run_url: RUN_URL,
        step: STEP || null,
        run_id: process.env.GITHUB_RUN_ID || null,
      },
    }
    fs.appendFileSync(path.join(dir, 'ops-events.jsonl'), JSON.stringify(event) + '\n')
    console.log('ops-events.jsonl appended (pipeline_fail)')
  } catch (e) {
    console.error('ops event write failed:', e.message)
  }
}

const TO = 'yacovassaraf@gmail.com'
const FROM = 'Sargasses Pipeline <alerte@sargasses-martinique.com>'

const { sendEmail, mailReady } = require('./lib/email-send.cjs')
const { authorizeActionAsync, describeDecision } = require('./lib/safety.cjs')

async function main() {
  // Evenement ops local d'abord : il n'est pas sortant, il est conserve dans tous
  // les cas (y compris quand l'email part en simulation).
  appendOpsEvent()

  if (!mailReady()) {
    console.log('No SMTP_PASS - skipping failure notification')
    return
  }

  // Mission P0.23 / #1157 : etre execute pour signaler un echec EST la demande
  // d'envoi ; l'autorisation reste a prouver (dispatch manuel + Environment
  // protege). Un cron en echec n'envoie donc plus rien par defaut.
  const decision = await authorizeActionAsync('email_send', { requested: true })
  console.log(describeDecision(decision))
  if (!decision.execute) {
    console.log('Contrat central : SIMULATION, aucune alerte email envoyee (evenement ops local conserve).')
    return
  }

  const now = new Date()
  const time = now.toLocaleString('fr-FR', { timeZone: 'America/Martinique', dateStyle: 'short', timeStyle: 'short' })

  const subject = `[Sargasses] ${WORKFLOW} failed`
  const html = `
<div style="font-family:system-ui;max-width:500px;margin:0 auto;padding:20px">
  <h2 style="color:#dc2626;margin:0 0 12px">Pipeline failure</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    <tr><td style="padding:6px 0;color:#666">Workflow</td><td style="padding:6px 0;font-weight:600">${WORKFLOW}</td></tr>
    <tr><td style="padding:6px 0;color:#666">Time (MQ)</td><td style="padding:6px 0">${time}</td></tr>
    ${STEP ? `<tr><td style="padding:6px 0;color:#666">Step</td><td style="padding:6px 0">${STEP}</td></tr>` : ''}
  </table>
  ${RUN_URL ? `<p style="margin:16px 0 0"><a href="${RUN_URL}" style="color:#2563eb">View run logs</a></p>` : ''}
  <p style="margin:16px 0 0;font-size:12px;color:#999">Auto-alert from sargasses pipeline</p>
</div>`

  try {
    const { error } = await sendEmail({ from: FROM, to: TO, subject, html })
    if (error) console.error(`SMTP error: ${error.message}`)
    else console.log(`Alert sent to ${TO} - ${WORKFLOW} failure`)
  } catch (e) {
    console.error('Notify error:', e.message)
  }
}

// Point d'entree explicite : importer ce module n'envoie jamais d'email.
if (require.main === module) {
  main().catch((e) => { console.error('Notify error:', e && e.message ? e.message : e); process.exitCode = 1 })
}

module.exports = { main }
