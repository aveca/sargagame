'use strict'

// Regression guard for issue #1143: the scheduled first-party UX snapshot must
// invoke the real script path and must not opt into the optional email digest.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..', '..')
const workflowPath = path.join(ROOT, '.github', 'workflows', 'daily-copernicus.yml')
const scriptPath = path.join(ROOT, 'scripts', 'ux-daily.cjs')
const workflow = fs.readFileSync(workflowPath, 'utf8')
const start = workflow.indexOf('- name: UX daily tracking (diff jour-à-jour first-party)')
assert.notEqual(start, -1, 'UX daily tracking step must exist')
const nextStep = workflow.indexOf('\n      - name:', start + 1)
const step = workflow.slice(start, nextStep === -1 ? workflow.length : nextStep)

assert.ok(fs.existsSync(scriptPath), 'the invoked first-party UX script must exist')
assert.match(step, /run: node scripts\/ux-daily\.cjs(?:\s|$)/m, 'workflow must invoke the real script path')
assert.doesNotMatch(step, /scripts\/automation\/ux-daily\.cjs/, 'obsolete path must not return')
assert.doesNotMatch(step, /run:.*--send/, 'scheduled tracking must not enable the optional email digest')

const script = fs.readFileSync(scriptPath, 'utf8')
assert.match(script, /const DO_SEND = process\.argv\.includes\('--send'\)/, 'email digest must remain explicitly opt-in')
assert.match(script, /if \(!DO_SEND\)/, 'without --send the script must exit before email setup')

console.log('DAILY_COPERNICUS_UX_DAILY_PATH PASS')
