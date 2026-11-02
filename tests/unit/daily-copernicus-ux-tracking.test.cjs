'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const yaml = require('js-yaml')

const ROOT = path.resolve(__dirname, '../..')
const workflowPath = path.join(ROOT, '.github', 'workflows', 'daily-copernicus.yml')
const scriptPath = path.join(ROOT, 'scripts', 'ux-daily.cjs')

assert.equal(fs.existsSync(scriptPath), true, 'the tracked UX daily script must exist at its canonical path')

const workflow = yaml.load(fs.readFileSync(workflowPath, 'utf8'))
const job = workflow.jobs && workflow.jobs['email-automation']
assert.ok(job && Array.isArray(job.steps), 'daily-copernicus must expose the email-automation job')

const step = job.steps.find((item) =>
  typeof item.name === 'string' && item.name.startsWith('UX daily tracking')
)
assert.ok(step, 'the scheduled UX daily tracking step must exist')
assert.equal(step.if, "github.event_name == 'schedule'", 'tracking remains schedule-only')
assert.equal(step.run, 'node scripts/ux-daily.cjs', 'tracking must invoke the existing script without --send')
assert.equal(Object.prototype.hasOwnProperty.call(step.env || {}, 'SMTP_PASS'), false,
  'scheduled UX tracking must not receive SMTP credentials')
assert.equal(String(step.run).includes('--send'), false, 'scheduled tracking must never request an email send')

console.log('DAILY_COPERNICUS_UX_TRACKING_CONTRACT PASS')
