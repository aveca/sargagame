#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const source = fs.readFileSync(path.join(__dirname, '../src/Sargasses_PROD.jsx'), 'utf8')
const start = source.indexOf('{RECOMMEND_MODE && dataReady && (')
assert.notEqual(start, -1, 'recommendation route integration must exist')
const end = source.indexOf('\n        )}', start)
assert.notEqual(end, -1, 'recommendation route integration must be closed')
const integration = source.slice(start, end)

assert.doesNotMatch(
  integration,
  /\\bpickBeaches\\b/,
  'the App scope does not define pickBeaches; the route must not reference it'
)
assert.match(
  integration,
  /beaches=\\{\\(allBeaches \\|\\| \\[\\]\\)\\.filter\\(/,
  'the recommendation route must receive filtered beaches from the App state'
)

console.log('OK — recommendation route uses in-scope allBeaches and avoids undefined pickBeaches')
