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

for (const script of [
  'push-winback.cjs',
  'revenue-watch.cjs',
  'ux-watch.cjs',
  'deliverability-watch.cjs',
  'factory-heartbeat-watch.cjs',
  'ux-daily.cjs'
]) {
  const at = workflow.indexOf('node scripts/automation/' + script + ' --send')
  assert.ok(at >= 0, script + ' send path must remain available only behind manual approval')
  const before = workflow.slice(Math.max(0, at - 650), at)
  assert.match(before, /GITHUB_EVENT_NAME.*workflow_dispatch[\s\S]*authorize_outbound/, script + ' --send must be guarded by workflow_dispatch + authorize_outbound')
  const after = workflow.slice(at, at + 350)
  assert.match(after, /else[\s\S]*node scripts\/automation\//, script + ' must have a non-send scheduled path')
}

assert.match(workflow, /incident-apology\.cjs --dry-run/, 'incident apologies must be dry-run on schedule')
assert.match(workflow, /Clean bounced emails from Sheet \(approval-gated mutation\)[\s\S]{0,180}inputs\.authorize_data_cleanup == true/i, 'Apps Script cleanup must require data-cleanup approval')
assert.match(workflow, /purge-analytics\.cjs --dry/, 'scheduled analytics purge must be dry-run')
assert.match(workflow, /Purge analytics_events[\s\S]{0,240}authorize_data_cleanup/, 'real analytics purge must require data-cleanup approval')
assert.doesNotMatch(workflow, /public\/api\/(?:b2b-paylinks|mollie-passlinks)\.json/, 'payment-link files must not be auto-committed by the email-state job')

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
