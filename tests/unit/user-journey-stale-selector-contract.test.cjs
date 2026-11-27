'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
const audit = fs.readFileSync(path.join(root, 'scripts/automation/user-journey-audit.cjs'), 'utf8')
const worldMap = fs.readFileSync(path.join(root, 'src/WorldMapView.jsx'), 'utf8')

// The public home renders WorldMapView, not the legacy ChasseHome stale banner.
// Keep the E2E selectors coupled to the real, shared component contract.
for (const selector of [
  'wm-stale-offer',
  'wm-stale-offer-cta',
  'wm-stale-offer-message',
  'wm-stale-offer-last-observation',
]) {
  const marker = 'data-testid="' + selector + '"'
  assert.ok(worldMap.includes(marker), 'WorldMapView exposes ' + selector)
  assert.ok(audit.includes(marker), 'journey audit checks ' + selector)
}

assert.ok(
  audit.includes('page.locator(\'[data-testid="wm-stale-offer-cta"]\').click'),
  'journey audit clicks the current WorldMapView offer CTA',
)
assert.doesNotMatch(
  audit,
  /chasse-home-(?:stale|offer-cta|last-observation)/,
  'journey audit must not use legacy ChasseHome selectors',
)

console.log('USER_JOURNEY_STALE_SELECTOR_CONTRACT=PASS')
