#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/daily-copernicus.yml'), 'utf8');
const script = path.join(root, 'scripts', 'ux-daily.cjs');

assert.ok(fs.existsSync(script), 'the UX daily script must exist at scripts/ux-daily.cjs');
assert.ok(workflow.includes('run: node scripts/ux-daily.cjs --send'), 'scheduled workflow must call the actual UX daily script path');
assert.ok(!workflow.includes('node scripts/automation/ux-daily.cjs'), 'workflow must not reference the nonexistent automation subpath');
assert.ok(workflow.includes('email-automation:'), 'email automation job must remain explicit');
assert.ok(workflow.includes("if: github.event_name == 'schedule'"), 'email automation must remain schedule-gated');

console.log('EMAIL_AUTOMATION_UX_DAILY_PATH_CONTRACT PASS');
