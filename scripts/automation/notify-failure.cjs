#!/usr/bin/env node
/**
 * Notify on workflow failure — sends alert email via Resend.
 *
 * Environment:
 *   RESEND_API_KEY — Resend API key
 *   WORKFLOW_NAME  — name of the failed workflow
 *   RUN_URL        — GitHub Actions run URL
 *   FAILURE_STEP   — (optional) name of the step that failed
 *
 * Usage: node scripts/automation/notify-failure.cjs
 */
const https = require('https')
const fs = require('fs')
const path = require('path')

const API_KEY = process.env.RESEND_API_KEY
const WORKFLOW = process.env.WORKFLOW_NAME || 'Unknown workflow'
const RUN_URL = process.env.RUN_URL || ''
const STEP = process.env.FAILURE_STEP || ''

// ADR-B ops bus event: append pipeline_fail to repo file (drained by local cron).
// Writing here is best-effort; cloud runner cannot reach the local SQLite bus directly.
// The main job's commit step does NOT run when this job fires (separate job), so the
// event lives in the runner filesystem until Étape 5 adds a push step here.
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

const TO = 'aveca@aveca.fr'
const FROM = 'Sargasses Pipeline <alerts@sargasses-martinique.com>'

if (!API_KEY) {
  console.log('No RESEND_API_KEY — skipping failure notification')
  process.exit(0)
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

const body = JSON.stringify({ from: FROM, to: [TO], subject, html })

const req = https.request({
  hostname: 'api.resend.com',
  path: '/emails',
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  },
}, res => {
  let data = ''
  res.on('data', c => data += c)
  res.on('end', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log(`Alert sent to ${TO} — ${WORKFLOW} failure`)
    } else {
      console.error(`Resend error ${res.statusCode}: ${data}`)
    }
  })
})
req.on('error', e => console.error('Notify error:', e.message))
req.write(body)
req.end()
