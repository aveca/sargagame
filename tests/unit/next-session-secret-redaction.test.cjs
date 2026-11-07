'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
const note = fs.readFileSync(path.join(root, 'NEXT_SESSION.md'), 'utf8')

const liveKeyPattern = /\blive_[A-Za-z0-9]{20,}\b/i;
assert.match('live_' + 'A'.repeat(24), liveKeyPattern, 'detector recognizes a synthetic LIVE key');
assert.doesNotMatch(note, liveKeyPattern, 'NEXT_SESSION.md must never contain a literal LIVE Mollie credential')
assert.match(note, /Mollie credential exposure/, 'the security warning must remain documented')

console.log('NEXT_SESSION LIVE credential redaction PASS')
