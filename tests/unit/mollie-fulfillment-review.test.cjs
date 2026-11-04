// Cycle 4 — revue P0 du fulfillment Mollie (Worker régional `workers/sargagame`).
//
// Couvre :
//  P0-2  coupure historique p7 TRUE (2026-08-01T00:00:00Z), vérifiée côté
//         serveur dans le webhook ET dans payment_status ; refus si createdAt
//         est absente, invalide, égale ou postérieure à la coupure ; aucun RPC
//         sur ces rejets ; create_payment refuse toujours p7 ; prix publics
//         inchangés ; montants historiques EUR 7,99 / USD 5,99.
//  P0-3  aucun identifiant Mollie brut dans les logs : identifiant de
//         corrélation ALÉATOIRE par requête (capturé réellement via
//         console.error), ni email, ni métadonnée, ni secret.
//  Régression  erreurs Mollie (401/404/429/500/réseau), erreurs RPC
//         (401/404/500) → HTTP 503, rejeu webhook.
'use strict';

const assert = require('node:assert/strict');

const CUTOFF = '2026-08-01T00:00:00Z';
const BEFORE_CUTOFF = '2026-07-31T23:59:59Z';

(async () => {
  const { default: worker } = await import('../../workers/sargagame/index.js');

  const env = {
    MOLLIE_API_KEY: 'test_only_key',
    SUPABASE_URL: 'https://supabase.test',
    SUPABASE_SERVICE_KEY: 'test_only_service_key',
  };

  const state = {
    payments: {},
    mollieStatus: 200,
    mollieNetworkError: false,
    rpcStatus: 204,
    rpcCode: 'rpc_test_failure',
    rpcCalls: [],
    createCalls: [],
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const method = (init && init.method) || 'GET';

    if (url.startsWith('https://api.mollie.com/v2/payments/')) {
      if (state.mollieNetworkError) throw new Error('mollie network down');
      const id = decodeURIComponent(url.slice('https://api.mollie.com/v2/payments/'.length));
      if (state.mollieStatus !== 200) {
        return new Response(JSON.stringify({ status: state.mollieStatus, title: 'error', detail: 'error' }), {
          status: state.mollieStatus,
          headers: { 'content-type': 'application/json' },
        });
      }
      const payment = state.payments[id];
      if (!payment) {
        return new Response(JSON.stringify({ status: 404, title: 'Not found' }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify(payment), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    if (url === 'https://api.mollie.com/v2/payments' && method === 'POST') {
      state.createCalls.push(JSON.parse(init.body));
      return new Response(
        JSON.stringify({ id: 'tr_created123', _links: { checkout: { href: 'https://mollie.test/checkout/tr_created123' } } }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      );
    }

    if (url === env.SUPABASE_URL + '/rest/v1/rpc/sg_upsert_payment_grant') {
      state.rpcCalls.push({ url, body: JSON.parse(init.body) });
      if (state.rpcStatus === 204) return new Response(null, { status: 204 });
      return new Response(JSON.stringify({ code: state.rpcCode }), {
        status: state.rpcStatus,
        headers: { 'content-type': 'application/json' },
      });
    }

    throw new Error('Unexpected fetch URL: ' + url);
  };

  // ── Helpers ──────────────────────────────────────────────────────────────
  let passed = 0;
  const failures = [];
  async function test(name, fn) {
    state.mollieStatus = 200;
    state.mollieNetworkError = false;
    state.rpcStatus = 204;
    state.rpcCode = 'rpc_test_failure';
    state.rpcCalls = [];
    state.createCalls = [];
    try {
      await fn();
      passed += 1;
      console.log('  ✓ ' + name);
    } catch (e) {
      failures.push(name);
      console.error('  ✗ ' + name + ' → ' + (e && e.message ? e.message : e));
    }
  }

  function legacyPayment(id, overrides = {}) {
    return {
      id,
      status: 'paid',
      amount: { currency: 'EUR', value: '7.99' },
      metadata: { pass: 'p7', email: 'legacy@example.com', source: 'test' },
      createdAt: BEFORE_CUTOFF,
      ...overrides,
    };
  }

  function classicRequest(id = 'tr_legacy01', contentType = 'application/x-www-form-urlencoded') {
    return new Request('https://worker.test/api/mollie-webhook', {
      method: 'POST',
      headers: { 'content-type': contentType },
      body: 'id=' + encodeURIComponent(id),
    });
  }

  async function webhook(payment, request = classicRequest(payment ? payment.id : 'tr_legacy01')) {
    if (payment) state.payments[payment.id] = payment;
    const response = await worker.fetch(request, env);
    return { response, body: await response.json() };
  }

  async function paymentStatus(payment, payload = {}) {
    if (payment) state.payments[payment.id] = payment;
    const response = await worker.fetch(
      new Request('https://worker.test/api/mollie', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'payment_status', paymentId: payment.id, ...payload }),
      }),
      env,
    );
    return { response, body: await response.json() };
  }

  try {
    console.log('P0-2 — coupure historique p7 (webhook)');

    await test('p7 créé AVANT la coupure → grant canonique trip7 (7 jours)', async () => {
      const p = legacyPayment('tr_p7before');
      const r = await webhook(p);
      assert.equal(r.response.status, 200);
      assert.equal(r.body.granted, true);
      assert.equal(state.rpcCalls.length, 1);
      assert.equal(state.rpcCalls[0].body.p_pass, 'trip7');
      assert.equal(state.rpcCalls[0].body.p_payment_id, 'tr_p7before');
      // 7 jours depuis la délivrance effective (et non depuis la date de paiement).
      const expires = Date.parse(state.rpcCalls[0].body.p_expires_at);
      assert.ok(expires > Date.now() + 6 * 86400000 && expires <= Date.now() + 7 * 86400000 + 5000);
      // Le pass persisté est canonique : jamais `p7`.
      assert.equal(state.rpcCalls[0].body.p_metadata.pass, 'trip7');
    });

    await test('p7 créé EXACTEMENT à la coupure → legacy_expired, aucun RPC', async () => {
      const p = legacyPayment('tr_p7exact', { createdAt: CUTOFF });
      const r = await webhook(p);
      assert.equal(r.response.status, 200);
      assert.equal(r.body.granted, false);
      assert.equal(r.body.reason, 'legacy_expired');
      assert.equal(state.rpcCalls.length, 0);
    });

    await test('p7 créé APRÈS la coupure → legacy_expired, aucun RPC', async () => {
      const p = legacyPayment('tr_p7after', { createdAt: '2026-08-02T10:00:00Z' });
      const r = await webhook(p);
      assert.equal(r.body.granted, false);
      assert.equal(r.body.reason, 'legacy_expired');
      assert.equal(state.rpcCalls.length, 0);
    });

    await test('p7 SANS createdAt → legacy_expired (non vérifiable), aucun RPC', async () => {
      const p = legacyPayment('tr_p7nodate');
      delete p.createdAt;
      const r = await webhook(p);
      assert.equal(r.body.granted, false);
      assert.equal(r.body.reason, 'legacy_expired');
      assert.equal(state.rpcCalls.length, 0);
    });

    await test('p7 avec createdAt INVALIDE → legacy_expired, aucun RPC', async () => {
      const p = legacyPayment('tr_p7baddate', { createdAt: 'pas-une-date' });
      const r = await webhook(p);
      assert.equal(r.body.granted, false);
      assert.equal(r.body.reason, 'legacy_expired');
      assert.equal(state.rpcCalls.length, 0);
    });

    await test('p7 USD 5,99 avant coupure → grant trip7', async () => {
      const p = legacyPayment('tr_p7usd', {
        amount: { currency: 'USD', value: '5.99' },
        createdAt: '2026-07-20T14:00:00Z',
      });
      const r = await webhook(p);
      assert.equal(r.body.granted, true);
      assert.equal(state.rpcCalls[0].body.p_pass, 'trip7');
      assert.equal(state.rpcCalls[0].body.p_currency, 'USD');
    });

    await test('p7 au tarif COURANT (4,99) → amount_mismatch, aucun RPC', async () => {
      const p = legacyPayment('tr_p7wrongamount', { amount: { currency: 'EUR', value: '4.99' } });
      const r = await webhook(p);
      assert.equal(r.body.granted, false);
      assert.equal(r.body.reason, 'amount_mismatch');
      assert.equal(state.rpcCalls.length, 0);
    });

    console.log('P0-2 — coupure historique p7 (payment_status)');

    await test('payment_status : p7 avant la coupure → grant', async () => {
      const p = legacyPayment('tr_stbefore');
      const r = await paymentStatus(p, { email: 'legacy@example.com' });
      assert.equal(r.response.status, 200);
      assert.equal(r.body.paid, true);
      assert.equal(state.rpcCalls.length, 1);
      assert.equal(state.rpcCalls[0].body.p_pass, 'trip7');
    });

    await test('payment_status : p7 exactement à la coupure → 409 legacy_expired, aucun RPC', async () => {
      const p = legacyPayment('tr_stexact', { createdAt: CUTOFF });
      const r = await paymentStatus(p);
      assert.equal(r.response.status, 409);
      assert.equal(r.body.paid, false);
      assert.equal(r.body.reason, 'legacy_expired');
      assert.equal(state.rpcCalls.length, 0);
    });

    await test('payment_status : p7 après la coupure → 409 legacy_expired, aucun RPC', async () => {
      const p = legacyPayment('tr_stafter', { createdAt: '2026-09-01T10:00:00Z' });
      const r = await paymentStatus(p);
      assert.equal(r.response.status, 409);
      assert.equal(r.body.reason, 'legacy_expired');
      assert.equal(state.rpcCalls.length, 0);
    });

    await test('payment_status : p7 sans createdAt → 409 legacy_expired, aucun RPC', async () => {
      const p = legacyPayment('tr_stnodate');
      delete p.createdAt;
      const r = await paymentStatus(p);
      assert.equal(r.response.status, 409);
      assert.equal(r.body.reason, 'legacy_expired');
      assert.equal(state.rpcCalls.length, 0);
    });

    await test('payment_status : p7 avec createdAt INVALIDE → 409 legacy_expired, aucun RPC', async () => {
      const p = legacyPayment('tr_stbaddate', { createdAt: 'pas-une-date' });
      const r = await paymentStatus(p);
      assert.equal(r.response.status, 409);
      assert.equal(r.body.reason, 'legacy_expired');
      assert.equal(state.rpcCalls.length, 0);
    });

    await test('payment_status : p7 avec createdAt SANS fuseau → 409 legacy_expired (non vérifiable)', async () => {
      const p = legacyPayment('tr_stnotz', { createdAt: '2026-07-20T10:00:00' });
      const r = await paymentStatus(p);
      assert.equal(r.response.status, 409);
      assert.equal(r.body.reason, 'legacy_expired');
      assert.equal(state.rpcCalls.length, 0);
    });

    await test('payment_status : p7 avec offset UTC explicite antérieur à la coupure → grant', async () => {
      // 2026-08-01T00:00:00+02:00 = 2026-07-31T22:00:00Z → bien avant la coupure.
      const p = legacyPayment('tr_stoffset', { createdAt: '2026-08-01T00:00:00.000+02:00' });
      const r = await paymentStatus(p);
      assert.equal(r.response.status, 200);
      assert.equal(r.body.paid, true);
      assert.equal(state.rpcCalls.length, 1);
    });

    console.log('P0-2 — création et tarifs publics');

    await test('create_payment avec p7 → 400 (aucun nouveau paiement au tarif historique)', async () => {
      const response = await worker.fetch(
        new Request('https://worker.test/api/mollie', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'create_payment', pass: 'p7', cents: 799, cur: 'EUR', email: 'x@example.com' }),
        }),
        env,
      );
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error, 'Prix invalide');
      assert.equal(state.createCalls.length, 0);
    });

    await test('create_payment avec p7 au tarif courant → 400 également', async () => {
      const response = await worker.fetch(
        new Request('https://worker.test/api/mollie', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'create_payment', pass: 'p7', cents: 499, cur: 'EUR', email: 'x@example.com' }),
        }),
        env,
      );
      assert.equal(response.status, 400);
      assert.equal(state.createCalls.length, 0);
    });

    await test('prix publics inchangés : p30 EUR 14,99 / trip7 EUR 4,99 / season 19,99 / sos 1,00', async () => {
      const cases = [
        { pass: 'p30', cents: 1499, cur: 'EUR' },
        { pass: 'trip7', cents: 499, cur: 'EUR' },
        { pass: 'season', cents: 1999, cur: 'EUR' },
        { pass: 'sos', cents: 100, cur: 'EUR' },
      ];
      for (const c of cases) {
        state.createCalls = [];
        const response = await worker.fetch(
          new Request('https://worker.test/api/mollie', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'create_payment', pass: c.pass, cents: c.cents, cur: c.cur, email: 'x@example.com' }),
          }),
          env,
        );
        assert.equal(response.status, 200, c.pass + ' doit rester creatible');
        assert.equal(state.createCalls.length, 1);
        assert.equal(state.createCalls[0].amount.value, (c.cents / 100).toFixed(2));
        assert.equal(state.createCalls[0].metadata.pass, c.pass);
      }
    });

    console.log('Régression — erreurs Mollie et RPC');

    for (const status of [401, 404, 429, 500]) {
      await test('Mollie ' + status + ' → aucun grant, HTTP propagée', async () => {
        const p = legacyPayment('tr_mollie' + status);
        state.mollieStatus = status;
        const r = await webhook(p);
        assert.equal(r.body.granted, undefined);
        assert.equal(state.rpcCalls.length, 0);
        const expected = status === 404 ? 404 : 502;
        assert.equal(r.response.status, expected, 'statut inattendu pour ' + status);
      });
    }

    await test('Mollie réseau indisponible → 503, aucun grant', async () => {
      const p = legacyPayment('tr_mollienet');
      state.mollieNetworkError = true;
      const r = await webhook(p);
      assert.equal(r.response.status, 503);
      assert.equal(state.rpcCalls.length, 0);
    });

    for (const status of [401, 404, 500]) {
      await test('RPC Supabase ' + status + ' → HTTP 503, aucun succès annoncé', async () => {
        const p = legacyPayment('tr_rpc' + status);
        state.rpcStatus = status;
        const r = await webhook(p);
        assert.equal(r.response.status, 503);
        assert.equal(r.body.granted, undefined);
        assert.equal(state.rpcCalls.length, 1);
      });
    }

    await test('rejeu webhook : même payment_id envoyé à la RPC (idempotence DB par payment_id)', async () => {
      const p = legacyPayment('tr_replay');
      const first = await webhook(p);
      assert.equal(first.body.granted, true);
      const second = await webhook(p);
      assert.equal(second.body.granted, true);
      assert.equal(state.rpcCalls.length, 2);
      assert.equal(state.rpcCalls[0].body.p_payment_id, state.rpcCalls[1].body.p_payment_id);
    });

    console.log('P0-3 — logs sans identifiant de paiement');

    await test('console.error capturé : l\'identifiant Mollie source n\'apparaît dans AUCUN log', async () => {
      const secretId = 'tr_LEAKCANARY9f3a2b';
      const secretEmail = 'leak-canary@example.com';
      const p = {
        id: secretId,
        status: 'paid',
        amount: { currency: 'EUR', value: '7.99' },
        metadata: { pass: 'p7', email: secretEmail, source: 'test', extra: 'x' },
        createdAt: BEFORE_CUTOFF,
      };
      const captured = [];
      const originalError = console.error;
      console.error = (...args) => { captured.push(args); };
      try {
        await webhook(p);
      } finally {
        console.error = originalError;
      }
      const dump = captured.map((args) => args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')).join('\n');
      assert.ok(captured.length > 0, 'au moins un log doit être produit');
      assert.ok(!dump.includes(secretId), 'le paymentId brut ne doit jamais apparaître dans les logs');
      assert.ok(!dump.includes(secretEmail), 'l\'email ne doit jamais apparaître dans les logs');
      assert.ok(!dump.includes('LEAKCANARY'), 'aucune trace du paymentId ne doit subsister');
      // Un identifiant de corrélation aléatoire est présent.
      const cidMatch = dump.match(/req_[0-9a-f]{32}/);
      assert.ok(cidMatch, 'un identifiant de corrélation aléatoire doit être présent');
    });

    await test('le correlation id diffère d\'une requête à l\'autre et ne dérive pas du paymentId', async () => {
      const captured = [];
      const originalError = console.error;
      console.error = (...args) => { captured.push(args); };
      try {
        await webhook(legacyPayment('tr_sameid01'));
        await webhook(legacyPayment('tr_sameid01'));
      } finally {
        console.error = originalError;
      }
      const cids = captured
        .map((args) => args.map((a) => (a && typeof a === 'object' ? a.cid : '')).join(''))
        .filter(Boolean);
      assert.ok(cids.length >= 2, 'deux logs minimum doivent être capturés');
      assert.notEqual(cids[0], cids[1], 'le correlation id doit être aléatoire par requête');
      assert.ok(!cids[0].includes('sameid'), 'le correlation id ne doit dériver du paymentId');
    });

    await test('le log de refus ne contient ni paymentId ni email (whitelist de champs)', async () => {
      const p = legacyPayment('tr_p7after2', { createdAt: '2026-09-01T10:00:00Z' });
      const captured = [];
      const originalError = console.error;
      console.error = (...args) => { captured.push(args); };
      try {
        await webhook(p);
      } finally {
        console.error = originalError;
      }
      const dump = captured.map((args) => args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')).join('\n');
      assert.ok(dump.includes('legacy_expired'), 'la raison technique doit être journalisée');
      assert.ok(!dump.includes('tr_p7after2'), 'aucun paymentId dans les logs');
      assert.ok(!dump.includes('legacy@example.com'), 'aucun email dans les logs');
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  if (failures.length) {
    console.error('\nFAIL: ' + failures.length + ' test(s) en échec :');
    for (const f of failures) console.error('  - ' + f);
    process.exitCode = 1;
  } else {
    console.log('\nPASS: ' + passed + ' cas — coupure p7, logs sans identifiant, erreurs Mollie/RPC, idempotence');
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
