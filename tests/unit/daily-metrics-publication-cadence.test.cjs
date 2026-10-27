#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
const daily = fs.readFileSync(path.join(root, '.github/workflows/daily-copernicus.yml'), 'utf8')
const weekly = fs.readFileSync(path.join(root, '.github/workflows/weekly-optimize.yml'), 'utf8')

// Preserve all four refresh times while publishing the canonical snapshot only on the final UTC run.
const schedule = (daily.match(/^  schedule:\n([\s\S]*?)(?=^  workflow_dispatch:)/m) || [])[1] || ''
for (const cron of ["0 0 * * *", "0 6 * * *", "0 12 * * *", "0 18 * * *"]) {
  assert.ok(schedule.includes(`- cron: '${cron}'`), `daily Copernicus schedule must retain ${cron}`)
}
assert.doesNotMatch(schedule, /0 0,6,12,18 \* \* \*/)
console.log('OK 1: four daily refresh schedules preserved as distinct cron entries')

// The daily commit step can stage the snapshot only for the 18:00 UTC schedule, with a same-day duplicate guard.
assert.match(daily, /PUBLISH_DAILY_METRICS:\s*\$\{\{\s*github\.event_name == 'schedule' && github\.event\.schedule == '0 18 \* \* \*'\s*\}\}/)
assert.match(daily, /LAST_METRICS_COMMIT="\$\(git log -1 --format=%cI -- scripts\/automation\/data\/daily-metrics\.json/)
assert.match(daily, /LAST_METRICS_DAY="\$\(date -u -d "\$LAST_METRICS_COMMIT"/)
assert.match(daily, /if \[ "\$LAST_METRICS_DAY" != "\$TODAY_UTC" \] && \[ -f scripts\/automation\/data\/daily-metrics\.json \]; then[\s\S]*?git add scripts\/automation\/data\/daily-metrics\.json[\s\S]*?fi/)
console.log('OK 2: daily snapshot is staged only at 18:00 UTC and no more than once per UTC date')

// Weekly stats jobs may still calculate data, but they must not publish a competing snapshot.
assert.doesNotMatch(weekly, /git add[^\n]*scripts\/automation\/data\/daily-metrics\.json/)
assert.match(weekly, /git add -A\n\s*# The canonical daily-metrics snapshot is published by daily-copernicus\.yml at 18:00 UTC only\.\n\s*git reset -q -- scripts\/automation\/data\/daily-metrics\.json \|\| true/)
for (const name of ['[Wednesday] Commit data quality snapshot', '[Saturday] Commit weekend data', '[Sunday] Commit Sunday data']) {
  assert.ok(weekly.includes(name), `weekly workflow must retain the ${name} job`)
}
console.log('OK 3: weekly commits cannot publish duplicate daily-metrics snapshots')
