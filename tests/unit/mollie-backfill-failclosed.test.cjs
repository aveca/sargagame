// Cycle 4 — revue P0 : backfill Mollie → Supabase fail-closed.
//
// Couvre :
//  P0-4  chaque lecture échouée BLOQUE la ligne et marque le contrôle
//         « indeterminate » ; une erreur API n'est jamais convertie en
//         « aucun remboursement » / « aucun grant ».
//         Mollie 401/404/429/500/réseau ; refunds 401/429/500 ; chargebacks
//         présents / absents / multiples / paginés / en erreur ; Supabase
//         grants 401/404/500/réseau.
//  P0-5  rapport sans PII : ni paymentId brut, ni email (même masqué ou
//         hashé), ni métadonnée Mollie brute, ni webhook URL, ni email dans un
//         aperçu de payload. Aucun fichier écrit dans le dépôt.
//  P0-6  `--apply` seul n'écrit jamais ; confirmation obligatoire ;
//         re-vérification immédiate avant chaque écriture ; résultat HTTP du
//         RPC vérifié ; jamais de prolongation d'un grant existant.
//  Scénarios  déjà délivré, remboursé, chargeback, email manquant,
//         p7 avant/après la coupure, rejeu du backfill.
'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'automation', 'backfill-mollie-grants.cjs');
const backfill = require(SCRIPT);

const CUTOFF = '2026-08-01T00:00:00Z';
const BEFORE_CUTOFF = '2026-07-15T10:00:00Z';

(async () => {
  let passed = 0;
  const failures = [];
  async function test(name, fn) {
    try {
      await fn();
      passed += 1;
      console.log('  OK  ' + name);
    } catch (e) {
      failures.push(name);
      console.error('  ERR ' + name + ' -> ' + (e && e.message ? e.message : e));
    }
  }

  // ── Mock d'API ───────────────────────────────────────────────────────────
  // state.responses décrit, par type de ressource, le comportement retourné.
  function makeState(overrides = {}) {
    return Object.assign({
      payment: null,
      paymentStatus: 200,
      paymentNetworkError: false,
      refunds: [],
      refundsStatus: 200,
      refundsNetworkError: false,
      refundsPages: null, // [{items, next}]
      chargebacks: [],
      chargebacksStatus: 200,
      chargebacksNetworkError: false,
      chargebacksPages: null,
      grants: [],
      grantsStatus: 200,
      grantsNetworkError: false,
      rpcStatus: 204,
      rpcCalls: [],
      urls: [],
    }, overrides);
  }

  function makeFetch(state) {
    return async (input, init = {}) => {
      const url = String(input);
      const method = (init && init.method) || 'GET';
      state.urls.push(url);

      if (url.includes('/rest/v1/rpc/sg_upsert_payment_grant')) {
        state.rpcCalls.push({ body: init && init.body ? JSON.parse(init.body) : null });
        if (state.rpcStatus === 204) return new Response(null, { status: 204 });
        return new Response(JSON.stringify({ code: 'rpc_failure' }), {
          status: state.rpcStatus, headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/rest/v1/payment_grants')) {
        if (state.grantsNetworkError) throw new Error('supabase network down');
        if (state.grantsStatus !== 200) {
          return new Response(JSON.stringify({ message: 'error' }), { status: state.grantsStatus });
        }
        return new Response(JSON.stringify(state.grants), {
          status: 200, headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/chargebacks')) {
        if (state.chargebacksNetworkError) throw new Error('mollie network down');
        if (state.chargebacksStatus !== 200) {
          return new Response(JSON.stringify({ detail: 'error' }), { status: state.chargebacksStatus });
        }
        if (state.chargebacksPages) {
          // Pagination : chaque page expose _links.next (absent = dernière).
          let page = 0;
          const match = url.match(/[?&]page=(\d+)/);
          if (match) page = Number(match[1]);
          const current = state.chargebacksPages[page] || { items: [] };
          const body = { count: state.chargebacksPages.reduce((s, p) => s + p.items.length, 0), _embedded: { chargebacks: current.items }, _links: {} };
          if (page + 1 < state.chargebacksPages.length) {
            body._links.next = { href: 'https://api.mollie.com/v2/payments/tr_x/chargebacks?page=' + (page + 1) };
          }
          return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        return new Response(JSON.stringify({ count: state.chargebacks.length, _embedded: { chargebacks: state.chargebacks } }), {
          status: 200, headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/refunds')) {
        if (state.refundsNetworkError) throw new Error('mollie network down');
        if (state.refundsStatus !== 200) {
          return new Response(JSON.stringify({ detail: 'error' }), { status: state.refundsStatus });
        }
        return new Response(JSON.stringify({ count: state.refunds.length, _embedded: { refunds: state.refunds } }), {
          status: 200, headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/v2/payments/')) {
        if (state.paymentNetworkError) throw new Error('mollie network down');
        if (state.paymentStatus !== 200) {
          return new Response(JSON.stringify({ detail: 'error' }), { status: state.paymentStatus });
        }
        return new Response(JSON.stringify(state.payment), {
          status: 200, headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error('Unexpected fetch URL: ' + url);
    };
  }

  const ENV = {
    MOLLIE_API_KEY: 'test_key',
    SUPABASE_URL: 'https://supabase.test',
    SUPABASE_SERVICE_KEY: 'test_service_key',
  };

  function legacyPayment(overrides = {}) {
    return {
      id: 'tr_legacy0001',
      status: 'paid',
      amount: { currency: 'EUR', value: '7.99' },
      metadata: { pass: 'p7', email: 'buyer@example.com', source: 'web', webhookUrl: 'https://sargasses-martinique.com/api/mollie-webhook.php' },
      createdAt: BEFORE_CUTOFF,
      ...overrides,
    };
  }

  function currentPayment(overrides = {}) {
    return {
      id: 'tr_current001',
      status: 'paid',
      amount: { currency: 'EUR', value: '14.99' },
      metadata: { pass: 'p30', email: 'buyer2@example.com', source: 'web' },
      createdAt: '2026-10-01T10:00:00Z',
      ...overrides,
    };
  }

  async function run(state, paymentIds = ['tr_legacy0001'], options = {}) {
    return backfill.runBackfill({
      paymentIds,
      fetchImpl: makeFetch(state),
      env: ENV,
      apply: options.apply === true,
      confirm: options.confirm,
    });
  }

  try {
    console.log('P0-4 — fail-closed sur erreurs API');

    for (const status of [401, 404, 429, 500]) {
      await test('Mollie payment ' + status + ' -> bloque + controle indeterminate', async () => {
        const state = makeState({ paymentStatus: status });
        const report = await run(state);
        assert.equal(report.rows.length, 1);
        assert.equal(report.rows[0].eligible, false);
        assert.equal(report.rows[0].checks.payment.state, 'indeterminate');
        assert.equal(report.rows[0].reason, 'indeterminate_payment_read');
        assert.equal(report.summary.eligible, 0);
        assert.equal(report.summary.indeterminate, 1);
      });
    }

    await test('Mollie payment reseau indisponible -> bloque + indeterminate', async () => {
      const state = makeState({ paymentNetworkError: true });
      const report = await run(state);
      assert.equal(report.rows[0].eligible, false);
      assert.equal(report.rows[0].checks.payment.state, 'indeterminate');
      assert.equal(report.rows[0].reason, 'indeterminate_payment_read');
    });

    for (const status of [401, 429, 500]) {
      await test('Mollie refunds ' + status + ' -> bloque (jamais « aucun remboursement »)', async () => {
        const state = makeState({ payment: legacyPayment(), refundsStatus: status });
        const report = await run(state);
        assert.equal(report.rows[0].eligible, false);
        assert.equal(report.rows[0].checks.refunds.state, 'indeterminate');
        assert.equal(report.rows[0].checks.refunds.count, null, 'un compte indefini ne doit pas etre lu comme zero');
        assert.equal(report.rows[0].reason, 'indeterminate_refunds_read');
      });
    }

    await test('Mollie refunds reseau indisponible -> bloque', async () => {
      const state = makeState({ payment: legacyPayment(), refundsNetworkError: true });
      const report = await run(state);
      assert.equal(report.rows[0].eligible, false);
      assert.equal(report.rows[0].checks.refunds.state, 'indeterminate');
      assert.equal(report.rows[0].reason, 'indeterminate_refunds_read');
    });

    await test('Mollie chargebacks en erreur -> bloque + indeterminate', async () => {
      const state = makeState({ payment: legacyPayment(), chargebacksStatus: 500 });
      const report = await run(state);
      assert.equal(report.rows[0].eligible, false);
      assert.equal(report.rows[0].checks.chargebacks.state, 'indeterminate');
      assert.equal(report.rows[0].checks.chargebacks.count, null);
      assert.equal(report.rows[0].reason, 'indeterminate_chargebacks_read');
    });

    await test('endpoint chargebacks dedie /v2/payments/{id}/chargebacks utilise', async () => {
      const state = makeState({ payment: legacyPayment() });
      await run(state);
      assert.ok(state.urls.some((u) => u === 'https://api.mollie.com/v2/payments/tr_legacy0001/chargebacks'),
        'endpoint chargebacks dedie attendu');
      assert.ok(state.urls.some((u) => u === 'https://api.mollie.com/v2/payments/tr_legacy0001/refunds'),
        'endpoint refunds par paiement attendu');
    });

    for (const status of [401, 404, 500]) {
      await test('Supabase grants ' + status + ' -> bloque (jamais « aucun grant »)', async () => {
        const state = makeState({ payment: legacyPayment(), grantsStatus: status });
        const report = await run(state);
        assert.equal(report.rows[0].eligible, false);
        assert.equal(report.rows[0].checks.grant.state, 'indeterminate');
        assert.equal(report.rows[0].checks.grant.exists, null, 'existence inconnue != absence de grant');
        assert.equal(report.rows[0].reason, 'indeterminate_grant_read');
      });
    }

    await test('Supabase grants reseau indisponible -> bloque', async () => {
      const state = makeState({ payment: legacyPayment(), grantsNetworkError: true });
      const report = await run(state);
      assert.equal(report.rows[0].eligible, false);
      assert.equal(report.rows[0].checks.grant.state, 'indeterminate');
      assert.equal(report.rows[0].reason, 'indeterminate_grant_read');
    });

    console.log('P0-4 — scenarios metier');

    await test('paiement deja delivre (grant existant) -> bloque, jamais de prolongation', async () => {
      const state = makeState({ payment: legacyPayment(), grants: [{ payment_id: 'tr_legacy0001' }] });
      const report = await run(state);
      assert.equal(report.rows[0].eligible, false);
      assert.equal(report.rows[0].reason, 'grant_already_exists');
      assert.equal(report.rows[0].checks.grant.exists, true);
    });

    await test('paiement rembourse -> bloque', async () => {
      const state = makeState({ payment: legacyPayment(), refunds: [{ id: 're_1', amount: { value: '7.99', currency: 'EUR' } }] });
      const report = await run(state);
      assert.equal(report.rows[0].eligible, false);
      assert.equal(report.rows[0].reason, 'refunded');
      assert.equal(report.rows[0].checks.refunds.count, 1);
    });

    await test('paiement avec chargeback -> bloque', async () => {
      const state = makeState({ payment: legacyPayment(), chargebacks: [{ id: 'chb_1' }] });
      const report = await run(state);
      assert.equal(report.rows[0].eligible, false);
      assert.equal(report.rows[0].reason, 'chargeback');
      assert.equal(report.rows[0].checks.chargebacks.count, 1);
    });

    await test('chargebacks multiples -> bloque', async () => {
      const state = makeState({ payment: legacyPayment(), chargebacks: [{ id: 'chb_1' }, { id: 'chb_2' }, { id: 'chb_3' }] });
      const report = await run(state);
      assert.equal(report.rows[0].eligible, false);
      assert.equal(report.rows[0].reason, 'chargeback');
      assert.equal(report.rows[0].checks.chargebacks.count, 3);
    });

    await test('chargebacks pagines -> toutes les pages parcourues, sinon bloque', async () => {
      const state = makeState({
        payment: legacyPayment(),
        chargebacksPages: [
          { items: [{ id: 'chb_1' }] },
          { items: [{ id: 'chb_2' }] },
        ],
      });
      const report = await run(state);
      assert.equal(report.rows[0].eligible, false);
      assert.equal(report.rows[0].reason, 'chargeback');
      assert.equal(report.rows[0].checks.chargebacks.pages, 2);
    });

    await test('email manquant -> bloque (jamais devine ni reconstruit)', async () => {
      const state = makeState({ payment: legacyPayment({ metadata: { pass: 'p7', source: 'web' } }) });
      const report = await run(state);
      assert.equal(report.rows[0].eligible, false);
      assert.equal(report.rows[0].reason, 'email_missing');
      assert.equal(report.rows[0].checks.email.present, false);
    });

    await test('p7 avant la coupure -> eligible', async () => {
      const state = makeState({ payment: legacyPayment() });
      const report = await run(state);
      assert.equal(report.rows[0].eligible, true);
      assert.equal(report.rows[0].pass, 'trip7');
      assert.equal(report.rows[0].reason, 'eligible');
    });

    await test('p7 exactement a la coupure -> bloque legacy_expired', async () => {
      const state = makeState({ payment: legacyPayment({ createdAt: CUTOFF }) });
      const report = await run(state);
      assert.equal(report.rows[0].eligible, false);
      assert.equal(report.rows[0].reason, 'legacy_expired');
    });

    await test('p7 apres la coupure -> bloque legacy_expired', async () => {
      const state = makeState({ payment: legacyPayment({ createdAt: '2026-08-15T10:00:00Z' }) });
      const report = await run(state);
      assert.equal(report.rows[0].eligible, false);
      assert.equal(report.rows[0].reason, 'legacy_expired');
    });

    await test('p7 sans createdAt -> bloque legacy_expired (non verifiable)', async () => {
      const state = makeState({ payment: legacyPayment() });
      delete state.payment.createdAt;
      const report = await run(state);
      assert.equal(report.rows[0].eligible, false);
      assert.equal(report.rows[0].reason, 'legacy_expired');
    });

    await test('montant incorrect -> bloque amount_mismatch', async () => {
      const state = makeState({ payment: legacyPayment({ amount: { currency: 'EUR', value: '4.99' } }) });
      const report = await run(state);
      assert.equal(report.rows[0].eligible, false);
      assert.equal(report.rows[0].reason, 'amount_mismatch');
    });

    await test('devise incorrecte -> bloque unsupported_currency', async () => {
      const state = makeState({ payment: legacyPayment({ amount: { currency: 'CHF', value: '7.99' } }) });
      const report = await run(state);
      assert.equal(report.rows[0].eligible, false);
      assert.equal(report.rows[0].reason, 'unsupported_currency');
    });

    await test('paiement non paye -> bloque payment_not_paid', async () => {
      const state = makeState({ payment: legacyPayment({ status: 'open' }) });
      const report = await run(state);
      assert.equal(report.rows[0].eligible, false);
      assert.equal(report.rows[0].reason, 'payment_not_paid');
    });

    await test('rejeu du backfill : le 2e passage voit le grant existant -> bloque', async () => {
      const state = makeState({ payment: legacyPayment() });
      const first = await run(state);
      assert.equal(first.rows[0].eligible, true);
      // Simulation du grant cree par le 1er passage.
      state.grants = [{ payment_id: 'tr_legacy0001' }];
      const second = await run(state);
      assert.equal(second.rows[0].eligible, false);
      assert.equal(second.rows[0].reason, 'grant_already_exists');
    });

    console.log('P0-5 — confidentialite du rapport');

    await test('le rapport ne contient ni paymentId, ni email, ni hash, ni metadata, ni webhookUrl', async () => {
      const state = makeState({ payment: legacyPayment() });
      const report = await run(state);
      const dump = JSON.stringify(report);
      assert.ok(!dump.includes('tr_legacy0001'), 'paymentId brut interdit');
      assert.ok(!dump.includes('buyer@example.com'), 'email interdit');
      assert.ok(!dump.includes('legacy@example.com'), 'email interdit');
      assert.ok(!dump.includes('/api/mollie-webhook.php'), 'webhook URL interdite');
      assert.ok(!dump.includes('sargasses-martinique.com'), 'webhook URL interdite');
      assert.ok(!dump.includes('"source":"web"'), 'metadata brute interdite');
      // Pas de hash d'email non plus.
      assert.ok(!/"emailHash"|"email_hash"|"emailDomain"/i.test(dump), 'hash/domaine d email interdit');
      // Pas d'aperçu de payload contenant l'email.
      assert.ok(!/grantPayloadPreview/i.test(dump), 'grantPayloadPreview interdit');
      // Le rapport contient bien un identifiant de ligne aléatoire.
      assert.ok(/row_[0-9a-f]{16}/.test(dump), 'identifiant de ligne aleatoire attendu');
      // Le pass canonique est autorisé.
      assert.ok(report.rows[0].pass === 'trip7');
    });

    await test('DRY RUN : aucune ecriture Supabase', async () => {
      const state = makeState({ payment: legacyPayment() });
      const report = await run(state);
      assert.equal(report.mode, 'dry-run');
      assert.equal(state.rpcCalls.length, 0, 'aucune RPC en dry run');
      assert.equal(report.rows[0].eligible, true, 'la ligne reste eligible mais rien n est ecrit');
    });

    await test('DRY RUN : aucun fichier ecrit dans le depot', async () => {
      const before = fs.readdirSync(path.join(REPO_ROOT, 'scripts', 'automation', 'data')).sort();
      const state = makeState({ payment: legacyPayment() });
      await run(state);
      const after = fs.readdirSync(path.join(REPO_ROOT, 'scripts', 'automation', 'data')).sort();
      assert.deepEqual(after, before, 'aucun fichier ne doit etre ecrit dans le depot');
    });

    await test('--report refuse un chemin relatif', () => {
      assert.throws(() => backfill.assertReportPathAllowed('rapport.json'), /ABSOLU/);
    });

    await test('--report refuse un chemin dans le depot', () => {
      assert.throws(() => backfill.assertReportPathAllowed(path.join(REPO_ROOT, 'scripts', 'automation', 'data', 'x.json')), /d[ée]p[oô]t/);
    });

    await test('--report accepte un chemin absolu hors depot', () => {
      const outside = path.join(os.tmpdir(), 'sg-backfill-report.json');
      assert.doesNotThrow(() => backfill.assertReportPathAllowed(outside));
    });

    console.log('P0-6 — mode APPLY');

    await test('--apply sans confirmation : aucune ecriture, rapport interrompu', async () => {
      const state = makeState({ payment: legacyPayment() });
      const report = await run(state, ['tr_legacy0001'], { apply: true });
      assert.equal(state.rpcCalls.length, 0, 'aucune RPC sans confirmation');
      assert.ok(report.aborted, 'le rapport doit signaler l interruption');
      assert.equal(report.aborted.reason, 'confirmation_required');
    });

    await test('--apply avec confirmation : re-verification immediate puis RPC, HTTP verifie', async () => {
      const state = makeState({ payment: legacyPayment() });
      const report = await run(state, ['tr_legacy0001'], { apply: true, confirm: backfill.CONFIRM_TOKEN });
      assert.equal(state.rpcCalls.length, 1, 'une seule ecriture RPC');
      assert.equal(state.rpcCalls[0].body.p_pass, 'trip7');
      assert.equal(state.rpcCalls[0].body.p_payment_id, 'tr_legacy0001');
      // Re-verification : les 4 lectures ont eu lieu AVANT l'ecriture.
      const rpcIndex = state.urls.findIndex((u) => u.includes('/rest/v1/rpc/sg_upsert_payment_grant'));
      const grantsIndex = state.urls.findIndex((u) => u.includes('/rest/v1/payment_grants'));
      assert.ok(grantsIndex >= 0 && grantsIndex < rpcIndex, 'le grant existant doit etre revérifie avant la RPC');
      const chargebacksIndex = state.urls.findIndex((u) => u.includes('/chargebacks'));
      assert.ok(chargebacksIndex >= 0 && chargebacksIndex < rpcIndex, 'les chargebacks doivent etre revérifies avant la RPC');
      assert.equal(report.rows[0].applied, true);
      assert.equal(report.summary.applied, 1);
    });

    await test('--apply : un grant cree entre le controle et l ecriture bloque l ecriture', async () => {
      const state = makeState({ payment: legacyPayment() });
      let grantReads = 0;
      const baseFetch = makeFetch(state);
      const fetchImpl = async (input, init = {}) => {
        const url = String(input);
        if (url.includes('/rest/v1/payment_grants')) {
          grantReads += 1;
          // Au 2e controle (juste avant l'ecriture), un grant est apparu.
          if (grantReads >= 2) {
            return new Response(JSON.stringify([{ payment_id: 'tr_legacy0001' }]), {
              status: 200, headers: { 'content-type': 'application/json' },
            });
          }
        }
        return baseFetch(input, init);
      };
      const report = await backfill.runBackfill({
        paymentIds: ['tr_legacy0001'],
        fetchImpl,
        env: ENV,
        apply: true,
        confirm: backfill.CONFIRM_TOKEN,
      });
      assert.equal(state.rpcCalls.length, 0, 'aucune ecriture si un grant existe deja');
      assert.equal(report.rows[0].applied, undefined);
      assert.equal(report.rows[0].reason, 'prewrite_grant_already_exists');
    });

    await test('--apply : RPC en erreur HTTP -> jamais rapporte comme un succes, execution interrompue', async () => {
      const state = makeState({ payment: legacyPayment(), rpcStatus: 500 });
      const report = await run(state, ['tr_legacy0001'], { apply: true, confirm: backfill.CONFIRM_TOKEN });
      assert.equal(report.rows[0].applied, false);
      assert.equal(report.summary.applied, 0);
      assert.equal(report.summary.failed, 1);
      assert.ok(report.aborted, 'l execution doit etre interrompue');
      assert.equal(report.aborted.reason, 'rpc_write_failed');
    });

    await test('--apply : le rapport reste sans PII (aucun email dans les cles de payload)', async () => {
      const state = makeState({ payment: legacyPayment() });
      const report = await run(state, ['tr_legacy0001'], { apply: true, confirm: backfill.CONFIRM_TOKEN });
      const dump = JSON.stringify(report);
      assert.ok(!dump.includes('tr_legacy0001'), 'paymentId brut interdit');
      assert.ok(!dump.includes('buyer@example.com'), 'email interdit');
      assert.ok(report.rows[0].grantPayloadKeys.includes('p_pass'), 'les noms de parametres sont autorises');
    });

    console.log('CLI — refus sans confirmation');

    await test('CLI : --apply sans confirmation -> exit 1, aucune ecriture', () => {
      const res = spawnSync(process.execPath, [SCRIPT, '--payment-ids', 'tr_legacy0001', '--apply'], {
        encoding: 'utf8',
        env: { PATH: process.env.PATH },
      });
      assert.equal(res.status, 1, 'code de sortie attendu 1');
      assert.ok(/confirm/i.test(res.stderr + res.stdout), 'message de confirmation attendu');
    });

    await test('CLI : --report dans le depot -> refus', () => {
      const res = spawnSync(process.execPath, [SCRIPT, '--payment-ids', 'tr_legacy0001', '--report', path.join(REPO_ROOT, 'rapport.json')], {
        encoding: 'utf8',
        env: { PATH: process.env.PATH },
      });
      assert.equal(res.status, 1);
      assert.ok(/d[ée]p[oô]t/i.test(res.stderr + res.stdout));
    });
  } finally {
    // rien à清理
  }

  if (failures.length) {
    console.error('\nFAIL: ' + failures.length + ' test(s) en echec');
    for (const f of failures) console.error('  - ' + f);
    process.exitCode = 1;
  } else {
    console.log('\nPASS: ' + passed + ' cas — backfill fail-closed, rapport sans PII, mode APPLY verrouille');
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
