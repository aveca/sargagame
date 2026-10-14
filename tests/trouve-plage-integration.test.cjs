#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const source = fs.readFileSync(path.join(__dirname, '../src/Sargasses_PROD.jsx'), 'utf8')
// Monté soit par le CTA « Trouve ta plage » de la carte (showRecommend), soit par le
// deep-link historique ?recommend=1 — les deux portes doivent coexister.
const start = source.indexOf('{(showRecommend||RECOMMEND_MODE) && dataReady && (')
assert.notEqual(start, -1, 'recommendation route integration must exist (CTA carte OU ?recommend=1)')
assert.equal(
  source.includes('setShowRecommend(true)'),
  true,
  'the map primary CTA must open the TrouvePlage journey in-app (setShowRecommend(true))'
)
const end = source.indexOf('\n        )}', start)
assert.notEqual(end, -1, 'recommendation route integration must be closed')
const integration = source.slice(start, end)

assert.equal(
  integration.includes('pickBeaches'),
  false,
  'the App scope does not define pickBeaches; the route must not reference it'
)
assert.equal(
  integration.includes('beaches={(allBeaches || []).filter('),
  true,
  'the recommendation route must receive filtered beaches from the App state'
)

console.log('OK — recommendation route uses in-scope allBeaches and avoids undefined pickBeaches')
