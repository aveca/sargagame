// tests/unit/gift-token.test.cjs — MP-2 (2026-10-11)
// Contrat du jeton cadeau signé HMAC (workers/sargagame/gift-token.js) :
//   1. sign + verify roundtrip OK
//   2. falsification (body/sig) → refusé bad_signature
//   3. expiré → refusé expired
//   4. mauvais secret → refusé
//   5. pass/days hors bornes → refusé
//   6. secret absent côté serveur → fail-closed (server_misconfigured)
// Lancement : node tests/unit/gift-token.test.cjs

const assert = require('assert')

let passed = 0
function check(name, cond) { assert.ok(cond, name); passed++; console.log('  ✓ ' + name) }

const SECRET = 'test-gift-secret-mp2-0123456789'
const OTHER = 'test-gift-secret-WRONG-987654321'

async function main() {
  console.log('GIFT TOKEN MP-2 — contrat HMAC sign/verify\n')
  const m = await import('../../workers/sargagame/gift-token.js')

  // 1. Roundtrip
  const t = await m.signGiftToken({ pass: 'p30' }, SECRET)
  const v = await m.verifyGiftToken(t, SECRET)
  check('sign+verify roundtrip OK', v.ok === true && v.payload.pass === 'p30' && v.payload.days === 30)
  check('jti présent (8-64 chars)', typeof v.payload.jti === 'string' && v.payload.jti.length >= 8)

  // 2. Falsification
  const tamperedBody = t.slice(0, -5) + (t.endsWith('a') ? 'b' : 'a') + 'xxxx'
  const v2 = await m.verifyGiftToken(tamperedBody, SECRET)
  check('corps falsifié → refusé', v2.ok === false && v2.reason === 'bad_signature')
  const t2 = await m.signGiftToken({ pass: 'p7' }, SECRET)
  const v3 = await m.verifyGiftToken(t2.split('.')[0] + '.AAAA', SECRET)
  check('signature falsifiée → refusé', v3.ok === false && v3.reason === 'bad_signature')

  // 3. Expiré
  const expired = await m.signGiftToken({ pass: 'p7', ttlHours: 0.0001 }, SECRET)
  await new Promise(r => setTimeout(r, 1200))
  const v4 = await m.verifyGiftToken(expired, SECRET)
  check('jeton expiré → refusé expired', v4.ok === false && v4.reason === 'expired')

  // 4. Mauvais secret
  const v5 = await m.verifyGiftToken(t, OTHER)
  check('mauvais secret → refusé bad_signature', v5.ok === false && v5.reason === 'bad_signature')

  // 5. Bornes
  const tooLong = await m.signGiftToken({ pass: 'p30', days: 99999 }, SECRET).catch(e => e)
  check('days hors bornes → rejet sign', tooLong instanceof Error)
  const fakePayload = Buffer.from(JSON.stringify({ v: 1, pass: 'p9999', days: 99999, exp: Math.floor(Date.now() / 1000) + 3600, jti: 'x'.repeat(16) })).toString('base64url')
  const fakeSig = 'A'.repeat(43)
  const v6 = await m.verifyGiftToken(fakePayload + '.' + fakeSig, SECRET)
  check('payload forgé sans signature valide → refusé', v6.ok === false)

  // 6. Fail-closed sans secret
  const v7 = await m.verifyGiftToken(t, '')
  check('secret absent → server_misconfigured (fail-closed)', v7.ok === false && v7.reason === 'server_misconfigured')
  const bad = await m.signGiftToken({ pass: 'p7' }, '').catch(e => e)
  check('sign sans secret → throw', bad instanceof Error)

  console.log(`\n✅ GIFT TOKEN — ${passed} checks ALL PASS`)
  process.exit(0)
}
main().catch(e => { console.error('FAIL', e); process.exit(1) })
