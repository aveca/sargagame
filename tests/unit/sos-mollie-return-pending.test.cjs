'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
const sos = fs.readFileSync(path.join(root, 'src/SOSPlage.jsx'), 'utf8')
const app = fs.readFileSync(path.join(root, 'src/Sargasses_PROD.jsx'), 'utf8')

assert.match(sos, /redirectUrl:\s*origin\s*\+\s*["']\/\?mollie_return=1["']/)
assert.doesNotMatch(sos, /sos_success=1/)
assert.match(sos, /paymentId,\s*email:\s*["']["'],\s*pass:\s*["']sos["'],\s*days:\s*1/)
assert.match(sos, /sessionStorage\.setItem\(["']sg_mollie_pending/)
assert.match(sos, /localStorage\.setItem\(["']sg_mollie_pending/)
assert.match(sos, /if\s*\(!stored\)/)
assert.match(app, /new URLSearchParams\(window\.location\.search\)\.get\(["']mollie_return["']\)!==["']1["']/)
assert.match(app, /sessionStorage\.getItem\(["']sg_mollie_pending["']/)
assert.match(app, /localStorage\.getItem\(["']sg_mollie_pending["']/)
assert.match(app, /action:["']payment_status["'],paymentId:ctx\.paymentId/)
assert.match(app, /if\(ctx\.pass\)\{localStorage\.setItem\(["']sg_premium_pass_end["']/)

console.log('SOS_MOLLIE_RETURN_PENDING_CONTRACT PASS')
