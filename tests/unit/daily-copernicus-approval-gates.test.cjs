const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')

const root = path.join(__dirname, '..', '..')
const workflow = fs.readFileSync(path.join(root, '.github/workflows/daily-copernicus.yml'), 'utf8')

assert.match(workflow, /authorize_outbound:[\s\S]{0,220}default: false/, 'outbound approval must default to false')
assert.match(workflow, /authorize_data_cleanup:[\s\S]{0,240}default: false/, 'destructive cleanup approval must default to false')
assert.match(workflow, /email-automation:[\s\S]{0,260}inputs\.authorize_outbound == true \|\| inputs\.authorize_data_cleanup == true/, 'manual email job must require an explicit approval input')

for (const scriptPath of [
  'scripts/automation/push-winback.cjs',
  'scripts/automation/revenue-watch.cjs',
  'scripts/automation/ux-watch.cjs',
  'scripts/automation/deliverability-watch.cjs',
  'scripts/automation/factory-heartbeat-watch.cjs',
  'scripts/ux-daily.cjs'
]) {
  const at = workflow.indexOf('node ' + scriptPath + ' --send')
  assert.ok(at >= 0, scriptPath + ' send path must remain available only behind manual approval')
  const before = workflow.slice(Math.max(0, at - 650), at)
  assert.ok(before.includes('workflow_dispatch') && before.includes('authorize_outbound'), scriptPath + ' --send must be guarded by workflow_dispatch + authorize_outbound')
  const after = workflow.slice(at, at + 350)
  assert.ok(after.includes('else') && after.includes('node scripts/'), scriptPath + ' must have a non-send scheduled path')
}

assert.match(workflow, /incident-apology\.cjs --dry-run/, 'incident apologies must be dry-run on schedule')
const healthStep = workflow.slice(workflow.indexOf('Health check (uptime monitoring'), workflow.indexOf('Aggregate observed climatology'))
assert.match(healthStep, /health-check\.cjs --dry-run/, 'scheduled health-check alerts must be dry-run')
assert.match(healthStep, /authorize_outbound[\s\S]*health-check\.cjs --send/, 'health-check email requires explicit manual outbound approval')
const health = fs.readFileSync(path.join(root, 'scripts/automation/health-check.cjs'), 'utf8')
assert.match(health, /const SEND_ALERTS = process\.argv\.includes\('--send'\)/, 'health-check must require --send')
assert.ok(health.indexOf('if (!SEND_ALERTS)') < health.indexOf('await sendAlertMail('), 'health-check dry-run must exit before SMTP')
const failureStep = workflow.slice(workflow.indexOf('Send failure alert email'), workflow.indexOf('RETRY ON FAILURE'))
assert.match(failureStep, /notify-failure\.cjs --dry-run/, 'scheduled failure notifications must be dry-run')
assert.match(failureStep, /workflow_dispatch/, 'failure email send path must be manual-dispatch only')
assert.match(failureStep, /authorize_outbound/, 'failure email send path must require outbound approval')
assert.match(failureStep, /notify-failure\.cjs --send/, 'failure email must use explicit --send after approval')
assert.match(workflow, /Clean bounced emails from Sheet \(approval-gated mutation\)[\s\S]{0,180}inputs\.authorize_data_cleanup == true/i, 'Apps Script cleanup must require data-cleanup approval')
assert.match(workflow, /purge-analytics\.cjs --dry/, 'scheduled analytics purge must be dry-run')
assert.match(workflow, /Purge analytics_events[\s\S]{0,240}authorize_data_cleanup/, 'real analytics purge must require data-cleanup approval')
assert.doesNotMatch(workflow, /public\/api\/(?:b2b-paylinks|mollie-passlinks)\.json/, 'payment-link files must not be auto-committed by the email-state job')

assert.ok(fs.existsSync(path.join(root, 'scripts/ux-daily.cjs')), 'the tracked UX daily script must exist at scripts/ux-daily.cjs')
const uxStep = workflow.slice(workflow.indexOf('UX daily tracking'), workflow.indexOf('Publish daily metrics snapshot'))
assert.ok(uxStep.includes("hashFiles('scripts/ux-daily.cjs')"), 'workflow must guard the actual tracked UX daily script path')
assert.ok(uxStep.includes("SMTP_PASS: ${{ github.event_name == 'workflow_dispatch' && inputs.authorize_outbound == true && secrets.SMTP_PASS || '' }}"), 'scheduled UX tracking must not receive SMTP credentials')

const notify = fs.readFileSync(path.join(root, 'scripts/automation/notify-failure.cjs'), 'utf8')
assert.match(notify, /const DRY_RUN = process\.argv\.includes\('--dry-run'\)/)
assert.ok(notify.indexOf('if (DRY_RUN)') < notify.indexOf('sendEmail({'), 'notify-failure dry-run must exit before SMTP send')

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sargagame-notify-dry-run-'))
try {
  const script = path.join(root, 'scripts/automation/notify-failure.cjs')
  const result = spawnSync(process.execPath, [script, '--dry-run'], {
    cwd: tmp,
    encoding: 'utf8',
    env: {
      ...process.env,
      SMTP_PASS: 'test-only-not-a-real-secret',
      SMTP_USER: 'dry-run@example.invalid',
      SMTP_HOST: 'localhost',
      SMTP_PORT: '465',
      WORKFLOW_NAME: 'dry-run-test',
      RUN_URL: 'https://example.invalid/run'
    }
  })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.match(result.stdout, /DRY RUN: failure notification suppressed/)
  assert.doesNotMatch(result.stdout, /Alert sent to/)
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
}

console.log('Outbound approval gates and notify-failure dry-run: PASS')
