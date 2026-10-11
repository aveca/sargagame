// tests/unit/gift-redeem-worker.test.cjs — MP-2 (2026-10-11)
// Contrat de la route RÉELLE POST /api/gift-redeem du Worker (workers/sargagame/index.js).
// Le handler est exécuté TEL QUEL (import du vrai module, pas de copie) ;
// seul le fetch réseau vers Supabase est stubbé à la frontière (env injecté) —
// le code de routing/vérif/consommation du Worker est le code de production.
//
// Lancement : node tests/unit/gift-redeem-worker.test.cjs
// Node 24+ : globalThis.Request/Response/fetch/crypto.subtle disponibles nativement.

const assert = require('assert')

let passed = 0
function check(name, cond) { assert.ok(cond, name); passed++; console.log('  ✓ ' + name) }

const SECRET = 'e2e-gift-secret-mp2-route-real-test-01'

// Petit stub Supabase stateful (table payment_grants, clé unique payment_id)
function makeSupabaseStub() {
  const rows = new Map()
  return {
    fetchImpl: async (url, init) => {
      if (String(url).includes('/rest/v1/payment_grants') && init.method === 'POST') {
        const body = JSON.parse(init.body)
        if (rows.has(body.payment_id)) {
          // ignore-duplicates → 201 avec tableau vide
          return new Response(JSON.stringify([]), { status: 201, headers: { 'Content-Type': 'application/json' } })
        }
        rows.set(body.payment_id, body)
        return new Response(JSON.stringify([body]), { status: 201, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response('not found', { status: 404 })
    },
    rows,
  }
}

async function main() {
  console.log('GIFT-REDEEM WORKER — route réelle /api/gift-redeem\n')
  const worker = (await import('../../workers/sargagame/index.js')).default
  const { signGiftToken } = await import('../../workers/sargagame/gift-token.js')

  const supabase = makeSupabaseStub()
  const realFetch = globalThis.fetch
  const env = {
    GIFT_LINK_SECRET: SECRET,
    SUPABASE_URL: 'http://stub.local',
    SUPABASE_SERVICE_KEY: 'stub-key',
  }
  globalThis.fetch = supabase.fetchImpl // intercepte UNIQUEMENT l'appel Supabase du worker

  const post = (body) => worker.fetch(new Request('https://sargasses-martinique.com/api/gift-redeem', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }), env)

  try {
    // 1. Token valide → granted
    const token = await signGiftToken({ pass: 'p30', days: 30, ttlHours: 24 }, SECRET)
    const r1 = await post({ token, email: 'test@mp2.dev' })
    const j1 = await r1.json()
    check('token valide → 200 granted=true, days=30', r1.status === 200 && j1.granted === true && j1.days === 30)
    check('consommation enregistrée côté serveur (gift_<jti>)', [...supabase.rows.keys()].some(k => k.startsWith('gift_')))

    // 2. Même token → 409 already_used (réutilisation bloquée)
    const r2 = await post({ token, email: 'test@mp2.dev' })
    check('réutilisation même token → 409 already_used', r2.status === 409 && (await r2.json()).error === 'gift_already_used')

    // 3. Token falsifié → 403
    const tokBad = token.slice(0, -4) + 'AAAA'
    const r3 = await post({ token: tokBad })
    check('token falsifié → 403 bad_signature', r3.status === 403 && (await r3.json()).error === 'gift_bad_signature')

    // 4. Token sans secret configuré → 503 (fail-closed)
    const envNoSecret = { SUPABASE_URL: 'http://stub.local', SUPABASE_SERVICE_KEY: 'stub-key' }
    const r4 = await worker.fetch(new Request('https://sargasses-martinique.com/api/gift-redeem', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
    }), envNoSecret)
    check('secret absent → 503 (jamais d\'octroi)', r4.status === 503)

    // 5. Token signé avec un AUTRE secret → 403
    const tokOther = await signGiftToken({ pass: 'p30' }, 'autre-secret-non-reconnu-123')
    const r5 = await post({ token: tokOther })
    check('token signé avec mauvais secret → 403', r5.status === 403)

    // 6. Méthode GET → 405
    const r6 = await worker.fetch(new Request('https://sargasses-martinique.com/api/gift-redeem?token=x', { method: 'GET' }), env)
    check('GET → 405 POST only', r6.status === 405)

    // 7. Expiration TTL : jeton valable passé
    const pastTok = await signGiftToken({ pass: 'p7', days: 7, ttlHours: 0.0001 }, SECRET)
    await new Promise(r => setTimeout(r, 1200))
    const r7 = await post({ token: pastTok })
    check('token expiré → 410 gift_expired', r7.status === 410)
  } finally {
    globalThis.fetch = realFetch
  }

  console.log(`\n✅ GIFT-REDEEM WORKER — ${passed} checks ALL PASS`)
  process.exit(0)
}
main().catch(e => { console.error('FAIL', e); process.exit(1) })
