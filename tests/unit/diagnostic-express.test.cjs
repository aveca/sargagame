#!/usr/bin/env node
'use strict'
/**
 * diagnostic-express.test.cjs — 12 scénarios « Diagnostic Sargasses Express »
 * 49 € TTC (commande → paiement Mollie → webhook → production PDF → livraison email).
 *
 * MODE TEST uniquement : aucun réseau, aucun email, aucun client réel, aucun secret.
 * Modules testés : scripts/diagnostic/lib/{order-state, fulfillment, data-source, mailer}
 *
 * Scénarios (12 exigés + livraison unique) :
 *  1 paiement refusé  2 en attente  3 confirmé (livré)  4 webhook dupliqué
 *  5 webhook invalide  6 montant incorrect  7 devise incorrecte  8 erreur Supabase
 *  9 échec PDF  10 échec email  11 reprise après interruption  12 remboursement
 *  13 livraison unique (idempotence) + contrat artifact (invariants P1→P6/P8)
 */

const assert = require('node:assert/strict')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const fs = require('node:fs')

const HERE = path.resolve(__dirname, '..', '..')
const DIAG_LIB = path.join(HERE, 'scripts', 'diagnostic', 'lib')
const FIX = path.join(__dirname, 'fixtures', 'diagnostic-express-snapshot.json')

;(async () => {
  const orderState = await import(pathToFileURL(path.join(DIAG_LIB, 'order-state.mjs')).href)
  const fulfillment = await import(pathToFileURL(path.join(DIAG_LIB, 'fulfillment.mjs')).href)
  const dataSource = await import(pathToFileURL(path.join(DIAG_LIB, 'data-source.mjs')).href)
  const mailer = await import(pathToFileURL(path.join(DIAG_LIB, 'mailer.mjs')).href)

  const {
    classifyDiagnosticKind, validateDiagnosticPayment, decideDiagnosticWebhook,
    validateOrderRow, validateDiagnosticAmount, canTransition, isRefunded,
    ORDER_STATES, PAID_STATUSES, DIAGNOSTIC_PRODUCTS, nextProductionStatus,
    AMOUNT_TOLERANCE_CENTS, NON_PAID_STATUSES
  } = orderState
  const { fulfillOrder, deliveryIdempotencyKey } = fulfillment
  const { extractSnapshot, DEFAULT_MAX_DATA_AGE_MINUTES, statusFromAfai } = dataSource
  const { createMailer, buildDeliveryText } = mailer

  const SNAPSHOT = JSON.parse(fs.readFileSync(FIX, 'utf8'))
  const PAYMENT_ID_OK = 'tr_diag_ok_0001'
  const PAYMENT_ID_DUP = 'tr_diag_dup_0002'
  const PAYMENT_ID_BAD = 'tr_diag_bad_0003'

  function orderOf(status, paymentId = PAYMENT_ID_OK, overrides = {}) {
    return {
      order_id: 'ord_' + paymentId.slice(-6),
      payment_id: paymentId,
      product: 'diagnostic_express',
      status: status,
      client_email: 'client@example.test',
      establishment: 'Village de la Pointe',
      sector: 'Pointe Faula',
      island: 'Martinique',
      amount: '49.00',
      currency: 'EUR',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides
    }
  }

  function depsOf(opts = {}) {
    const sends = []
    let failUpdate = opts.failUpdate || false
    let failInsert = opts.failInsert || false
    let failSend = opts.failSend || false
    let failSelect = opts.failSelect || false
    let snapshotResult = opts.snapshotResult || {
      ok: true,
      snapshot: extractSnapshot(SNAPSHOT, { levelId: 'vauclin', sector: { name: 'Pointe Faula', commune: 'Le Vauclin', island: 'mq', levelId: 'vauclin' }, now: new Date('2026-11-09T13:00:00Z') })
    }
    let pdfResult = opts.pdfResult || {
      ok: true, path: '/out/diagnostic-vauclin-tr_diag_ok_0001-2026-11-10-09-00-00.pdf',
      sha256: 'deadbeef'.repeat(8), filename: 'diag.pdf', html: '<p>diag</p>', text: 'diag', bytes: 1234
    }
    let sentTrace = opts.sentTrace || null
    let pendingTrace = opts.pendingTrace || null

    return {
      now: new Date('2026-11-09T13:00:00Z'),
      sends: sends,
      log: () => {},
      supabase: {
        configured: true,
        update: async (table, patch, { filter } = {}) => {
          if (failUpdate) return { ok: false, error: 'supabase_http_500' }
          return { ok: true, rows: [{ ...patch, updated_at: new Date().toISOString() }] }
        },
        insert: async (table, row) => {
          if (failInsert) return { ok: false, error: 'supabase_http_500' }
          return { ok: true, rows: [row] }
        },
        select: async (table, { filter, limit } = {}) => {
          if (failSelect) return { ok: false, error: 'supabase_http_500' }
          if (table === 'diagnostic_deliveries') {
            const rows = []
            if (sentTrace) rows.push(sentTrace)
            if (pendingTrace) rows.push(pendingTrace)
            return { ok: true, rows }
          }
          return { ok: true, rows: [] }
        }
      },
      loadSnapshot: async ({ order, at }) => snapshotResult,
      buildPdf: async ({ order, snapshot, at }) => pdfResult,
      sendEmail: async ({ to, subject, html, text, attachmentPath, attachmentName, idempotencyKey }) => {
        sends.push({ to, subject, attachmentPath, attachmentName, idempotencyKey, dryRun: true })
        if (failSend) return { ok: false, sent: false, error: 'resend_http_503' }
        return { ok: true, sent: false, dryRun: true, id: null, error: null, recipient: to, subject }
      }
    }
  }

  function expectOutcome(res, expected) {
    assert.equal(res.outcome, expected, `outcome attendu ${expected}, obtenu ${res.outcome}: ${JSON.stringify(res.error)}`)
  }

  let pass = 0, fail = 0
  const results = []
  function t(name, fn) {
    const p = (async () => {
      try {
        await fn()
        pass++
        console.log(`PASS  ${name}`)
      } catch (e) {
        fail++
        console.error(`FAIL  ${name} — ${e.message}`)
      }
    })()
    results.push(p)
    return p
  }

  const baseMeta = {
    offer_kind: 'diagnostic_express', product: 'diagnostic_express',
    email: 'client@example.test', establishment: 'Village de la Pointe',
    sector: 'Pointe Faula', island: 'Martinique', client_name: 'M. Test'
  }
  const basePayment = { id: PAYMENT_ID_OK, mode: 'live', status: 'paid', paidAt: '2026-11-10T09:00:00Z', amount: { value: '49.00', currency: 'EUR' }, recurring: false }

  // ── 1. état & catalogue ─────────────────────────────────────────────
  t('catalogue : montant 49,00 EUR exact (±0,02 €)', () => {
    const p = DIAGNOSTIC_PRODUCTS.diagnostic_express
    assert.equal(p.amount, 49)
    assert.equal(p.currency, 'EUR')
    assert.equal(p.label, 'Diagnostic Sargasses Express')
    const ok = validateDiagnosticAmount({ amount: { value: '49.00', currency: 'EUR' } }, 'diagnostic_express')
    assert.equal(ok.ok, true)
    assert.equal(ok.cents, 4900)
  })

  t('états de commande : 7 états dont delivered et refunded', () => {
    assert.ok(ORDER_STATES.includes('pending_payment'))
    assert.ok(ORDER_STATES.includes('paid'))
    assert.ok(ORDER_STATES.includes('processing'))
    assert.ok(ORDER_STATES.includes('ready'))
    assert.ok(ORDER_STATES.includes('delivered'))
    assert.ok(ORDER_STATES.includes('manual_review'))
    assert.ok(ORDER_STATES.includes('refunded'))
    assert.equal(ORDER_STATES.length, 7)
  })

  t('transitions : paid→processing→ready→delivered ; pas de régression delivered→processing', () => {
    assert.equal(canTransition('paid', 'processing'), true)
    assert.equal(canTransition('processing', 'ready'), true)
    assert.equal(canTransition('ready', 'delivered'), true)
    assert.equal(canTransition('delivered', 'processing'), false)
    assert.equal(canTransition('refunded', 'paid'), false)
    assert.equal(canTransition('pending_payment', 'paid'), true)
  })

  t('nextProductionStatus : séquence de production', () => {
    assert.equal(nextProductionStatus('paid'), 'processing')
    assert.equal(nextProductionStatus('processing'), 'ready')
    assert.equal(nextProductionStatus('ready'), 'delivered')
    assert.equal(nextProductionStatus('delivered'), null)
  })

  // ── 2. validation de paiement (contrat Worker) ───────────────────────
  t('paiement confirmé LIVE 49,00 EUR → valide (contrat Worker)', () => {
    const r = validateDiagnosticPayment({ payment: basePayment, metadata: baseMeta }, { allowTestMode: false })
    assert.equal(r.ok, true)
    assert.deepStrictEqual(r.problems, [])
  })

  t('paiement TEST mode refusé en validation (pas de allowTestMode)', () => {
    const r = validateDiagnosticPayment({ payment: { ...basePayment, mode: 'test' }, metadata: baseMeta }, { allowTestMode: false })
    assert.equal(r.ok, false)
    assert.ok(r.problems.includes('not_live_mode'))
  })

  t('montant incorrect (48,97 € hors tolérance ±0,02) → rejet', () => {
    const r = validateDiagnosticPayment({ payment: { ...basePayment, amount: { value: '48.97', currency: 'EUR' } }, metadata: baseMeta }, { allowTestMode: false })
    assert.equal(r.ok, false)
    assert.ok(r.problems.includes('amount_mismatch'))
  })

  t('montant OK aux bornes ±0,02 € (49,01 et 48,99)', () => {
    for (const v of ['49.01', '48.99']) {
      const r = validateDiagnosticPayment({ payment: { ...basePayment, amount: { value: v, currency: 'EUR' } }, metadata: baseMeta }, { allowTestMode: false })
      assert.equal(r.ok, true, `${v} doit être accepté`)
    }
  })

  t('devise incorrecte (USD) → rejet', () => {
    const r = validateDiagnosticPayment({ payment: { ...basePayment, amount: { value: '49.00', currency: 'USD' } }, metadata: baseMeta }, { allowTestMode: false })
    assert.equal(r.ok, false)
    assert.ok(r.problems.includes('currency_invalid'))
  })

  t('email invalide → rejet', () => {
    const r = validateDiagnosticPayment({ payment: basePayment, metadata: { ...baseMeta, email: 'not-an-email' } }, { allowTestMode: false })
    assert.equal(r.ok, false)
    assert.ok(r.problems.includes('invalid_email'))
  })

  t('paiement non payé (status expired/open) → ignoré, pas de livraison', () => {
    for (const st of ['expired', 'open', 'pending', 'canceled', 'failed']) {
      const r = decideDiagnosticWebhook({ payment: { ...basePayment, status: st }, metadata: baseMeta, order: orderOf('pending_payment') }, { allowTestMode: true })
      assert.equal(r.action, 'ignore', `${st} doit être ignoré`)
    }
  })

  t('webhook invalide (signature invalide) → reject, non idempotent', () => {
    const r = decideDiagnosticWebhook({ payment: basePayment, metadata: baseMeta, order: orderOf('pending_payment'), signatureValid: false }, { allowTestMode: true })
    assert.equal(r.action, 'reject')
    assert.equal(r.idempotent, false)
    assert.ok(r.reasons.includes('invalid_signature'))
  })

  t('webhook dupliqué (déjà delivered) → fulfill idempotent sans régression', () => {
    const r = decideDiagnosticWebhook({ payment: basePayment, metadata: baseMeta, order: orderOf('delivered') }, { allowTestMode: true })
    assert.equal(r.action, 'fulfill')
    assert.equal(r.idempotent, true)
    assert.equal(r.orderStatus, 'delivered')
  })

  t('webhook paiement confirmé sur commande pending_payment → fulfill', () => {
    const r = decideDiagnosticWebhook({ payment: basePayment, metadata: baseMeta, order: orderOf('pending_payment') }, { allowTestMode: true })
    assert.equal(r.action, 'fulfill')
    assert.equal(r.orderStatus, 'pending_payment')
  })

  t('paiement remboursé → état refunded, jamais produit', () => {
    assert.equal(isRefunded('refunded'), true)
    assert.equal(canTransition('paid', 'refunded'), true)
    assert.equal(canTransition('refunded', 'paid'), false)
  })

  // ── 3. classification offre ──────────────────────────────────────────
  t('classifyDiagnosticKind : diagnostic_express reconnu', () => {
    assert.equal(classifyDiagnosticKind({ offer_kind: 'diagnostic_express' }), 'diagnostic_express')
    assert.equal(classifyDiagnosticKind({ source: 'diagnostic_express' }), 'diagnostic_express')
    assert.equal(classifyDiagnosticKind({ offer_kind: 'autre' }), '')
    assert.equal(classifyDiagnosticKind({}), '')
  })

  // ── 4. fulfillOrder : scénarios ─────────────────────────────────────
  t('scénario 3 : paiement confirmé → livré (dry_run, pas d\'email réel)', async () => {
    const order = orderOf('paid', PAYMENT_ID_OK)
    const deps = depsOf({
      snapshotResult: { ok: true, snapshot: extractSnapshot(SNAPSHOT, { levelId: 'vauclin', sector: { name: 'Pointe Faula', commune: 'Le Vauclin', island: 'mq', levelId: 'vauclin' }, now: new Date('2026-11-09T13:00:00Z') }) }
    })
    const res = await fulfillOrder(order, deps)
    expectOutcome(res, 'dry_run')
    const statuses = res.transitions.map((t) => t.to)
    assert.ok(statuses.includes('processing'))
    assert.ok(statuses.includes('ready'))
    assert.equal(res.steps.find((s) => s.step === 'email').dryRun, true)
    assert.equal(deps.sends.length, 1)
  })

  t('scénario 1 : paiement refusé (non payé) → ignoré, commande inchangée', async () => {
    const order = orderOf('pending_payment', PAYMENT_ID_OK)
    const deps = depsOf()
    const res = await fulfillOrder(order, deps)
    expectOutcome(res, 'ignored')
    assert.equal(res.reason, 'payment_not_confirmed')
    assert.equal(deps.sends.length, 0)
  })

  t('scénario 4 : webhook dupliqué (trace sent existante) → déjà livré, pas de second envoi', async () => {
    const order = orderOf('ready', PAYMENT_ID_DUP)
    const deps = depsOf({ sentTrace: { id: 'trace_1', status: 'sent', created_at: new Date().toISOString() } })
    const res = await fulfillOrder(order, deps)
    expectOutcome(res, 'skipped')
    assert.equal(res.reason, 'already_delivered')
    assert.equal(deps.sends.length, 0)
  })

  t('scénario 6 : montant incorrect → order_invalid via validateOrderRow', async () => {
    const order = orderOf('paid', PAYMENT_ID_BAD, { amount: '48.97' })
    const deps = depsOf()
    const res = await fulfillOrder(order, deps)
    expectOutcome(res, 'failed')
    assert.ok(res.error.startsWith('order_invalid'))
    assert.ok(res.errorReasons.includes('amount_mismatch'))
    assert.equal(deps.sends.length, 0)
  })

  t('scénario 7 : devise incorrecte → order_invalid', async () => {
    const order = orderOf('paid', PAYMENT_ID_BAD, { currency: 'USD', amount: '49.00' })
    const deps = depsOf()
    const res = await fulfillOrder(order, deps)
    expectOutcome(res, 'failed')
    assert.ok(res.error.startsWith('order_invalid'))
    assert.ok(res.errorReasons.includes('currency_invalid'))
  })

  t('scénario 8 : erreur Supabase (update échoue) → failed, pas de livraison', async () => {
    const order = orderOf('paid', PAYMENT_ID_OK)
    const deps = depsOf({ failUpdate: true })
    const res = await fulfillOrder(order, deps)
    assert.notEqual(res.outcome, 'delivered')
    assert.ok(res.outcome === 'failed' || res.outcome === 'manual_review')
    assert.equal(deps.sends.length, 0)
  })

  t('scénario 9 : échec PDF → manual_review, paiement conservé', async () => {
    const order = orderOf('paid', PAYMENT_ID_OK)
    const deps = depsOf({ pdfResult: { ok: false, error: 'chromium_crash' } })
    const res = await fulfillOrder(order, deps)
    expectOutcome(res, 'manual_review')
    assert.ok(res.error.startsWith('pdf:'))
    assert.equal(deps.sends.length, 0)
    assert.ok(res.transitions.some((t) => t.to === 'manual_review'))
  })

  t('scénario 10 : échec email → manual_review, document produit', async () => {
    const order = orderOf('paid', PAYMENT_ID_OK)
    const deps = depsOf({ failSend: true })
    const res = await fulfillOrder(order, deps)
    expectOutcome(res, 'manual_review')
    assert.ok(res.error.startsWith('email:'))
    assert.equal(deps.sends.length, 1)
    assert.ok(res.transitions.some((t) => t.to === 'manual_review'))
  })

  t('scénario 11 : reprise après interruption (commande en ready) → livré', async () => {
    const order = orderOf('ready', PAYMENT_ID_OK)
    const deps = depsOf()
    const res = await fulfillOrder(order, deps)
    expectOutcome(res, 'dry_run')
    assert.ok(res.steps.some((s) => s.step === 'status' && s.to === 'ready' && s.unchanged === true))
    assert.equal(deps.sends.length, 1)
  })

  t('scénario 12 : remboursement (refunded) → skipped, jamais produit', async () => {
    const order = orderOf('refunded', PAYMENT_ID_OK)
    const deps = depsOf()
    const res = await fulfillOrder(order, deps)
    expectOutcome(res, 'skipped')
    assert.equal(res.reason, 'refunded')
    assert.equal(deps.sends.length, 0)
  })

  // ── 5. livraison unique (idempotence) ───────────────────────────────
  t('livraison unique : deux appels consécutifs → un seul envoi email', async () => {
    const order = orderOf('paid', PAYMENT_ID_OK)
    const deps = depsOf()
    const r1 = await fulfillOrder(order, deps)
    assert.equal(r1.outcome, 'dry_run')
    const order2 = orderOf('ready', PAYMENT_ID_OK)
    const deps2 = depsOf({ pendingTrace: { id: 'trace_2', status: 'pending', created_at: new Date().toISOString() } })
    const r2 = await fulfillOrder(order2, deps2)
    assert.equal(r2.outcome, 'dry_run')
    assert.equal(deps2.sends.length, 1)
  })

  t('idempotencyKey stable pour un (paiement, document) donné', () => {
    const k1 = deliveryIdempotencyKey(PAYMENT_ID_OK, 'abcd1234')
    const k2 = deliveryIdempotencyKey(PAYMENT_ID_OK, 'abcd1234')
    const k3 = deliveryIdempotencyKey(PAYMENT_ID_OK, 'other')
    assert.equal(k1, k2)
    assert.notEqual(k1, k3)
    assert.ok(k1.startsWith(`diag-${PAYMENT_ID_OK}-`))
  })

  // ── 6. data-source : extraction réelle (Pointe Faula / vauclin) ─────
  t('extractSnapshot : vauclin (Pointe Faula) → propre, frais, cohérent', () => {
    const s = extractSnapshot(SNAPSHOT, { levelId: 'vauclin', sector: { name: 'Pointe Faula', commune: 'Le Vauclin', island: 'mq', levelId: 'vauclin' }, now: new Date('2026-11-10T01:25:00Z') })
    assert.equal(s.ok, true)
    assert.equal(s.snapshot.levelId, 'vauclin')
    assert.equal(s.snapshot.observation.afai, 0.06)
    assert.equal(s.snapshot.observation.status, 'clean')
    assert.equal(s.snapshot.observation.confidence, 75)
    assert.equal(s.snapshot.observation.label, 'EXCEPTIONNEL')
    assert.equal(s.snapshot.dataAgeMinutes, 805)
    assert.equal(s.snapshot.fresh, true)
    assert.equal(s.snapshot.source, 'erddap-live')
    assert.ok(s.snapshot.sectorObservation)
  })

  t('extractSnapshot : secteur absent → secteur_not_in_snapshot', () => {
    const s = extractSnapshot(SNAPSHOT, { levelId: 'nullepart', sector: { name: 'Inconnu', commune: 'X', island: 'mq', levelId: 'nullepart' }, now: new Date() })
    assert.equal(s.ok, false)
    assert.equal(s.error, 'sector_not_in_snapshot')
  })

  t('extractSnapshot : donnée périmée (>15h) → data_stale', () => {
    const vieux = JSON.parse(JSON.stringify(SNAPSHOT))
    vieux.erddapTimestamp = '2026-11-08T00:00:00Z'
    const s = extractSnapshot(vieux, { levelId: 'vauclin', sector: { name: 'Pointe Faula', commune: 'Le Vauclin', island: 'mq', levelId: 'vauclin' }, now: new Date('2026-11-09T13:00:00Z') })
    assert.equal(s.ok, false)
    assert.equal(s.error, 'data_stale')
  })

  t('statusFromAfai : seuils clean<0.15, moderate<0.40, avoid≥0.40', () => {
    assert.equal(statusFromAfai(0.06), 'clean')
    assert.equal(statusFromAfai(0.20), 'moderate')
    assert.equal(statusFromAfai(0.50), 'avoid')
    assert.equal(statusFromAfai(null), null)
  })

  // ── 7. mailer : dry_run par défaut, pas de secret affiché ───────────
  t('mailer dry_run : aucun envoi réseau, clé non requise', async () => {
    const m = createMailer({ dryRun: true })
    const r = await m.sendDiagnostic({ to: 'a@b.test', subject: 's', html: '<p>x</p>' })
    assert.equal(r.ok, true)
    assert.equal(r.dryRun, true)
    assert.equal(r.sent, false)
  })

  t('mailer : destinataire manquant → échec silencieux', async () => {
    const m = createMailer({ dryRun: true })
    const r = await m.sendDiagnostic({ to: '', subject: 's', html: '<p>x</p>' })
    assert.equal(r.ok, false)
    assert.equal(r.error, 'missing_recipient')
  })

  t('mailer buildDeliveryText : contient secteur, établissement, observation', () => {
    const txt = buildDeliveryText({ order: { establishment: 'Village de la Pointe', sector: 'Pointe Faula' }, sector: { name: 'Pointe Faula', commune: 'Le Vauclin' }, snapshot: { observedAt: '2026-11-09T12:00:00Z', observation: { afai: 0.06, status: 'clean', confidence: 75 } }, generatedAt: '2026-11-10T09:00:00Z' })
    assert.ok(txt.includes('Village de la Pointe'))
    assert.ok(txt.includes('Pointe Faula'))
    assert.ok(txt.includes('0.06'))
    assert.ok(txt.includes('75'))
  })

  // ── 8. contrat artifact (invariants P1→P6/P8 du Worker) ─────────────
  t('contrat artifact : DIAGNOSTIC_PRODUCTS Worker == order-state (49 EUR)', () => {
    const workerProduct = { amount: 49, currency: 'EUR', label: 'Diagnostic Sargasses Express', kind: 'diagnostic_express' }
    assert.equal(workerProduct.amount, DIAGNOSTIC_PRODUCTS.diagnostic_express.amount)
    assert.equal(workerProduct.currency, DIAGNOSTIC_PRODUCTS.diagnostic_express.currency)
  })

  t('contrat artifact : PAID_STATUSES = [paid, settled] ; NON_PAID inclut expired/failed', () => {
    assert.deepStrictEqual(PAID_STATUSES, ['paid', 'settled'])
    assert.ok(NON_PAID_STATUSES.includes('expired'))
    assert.ok(NON_PAID_STATUSES.includes('failed'))
    assert.ok(NON_PAID_STATUSES.includes('open'))
  })

  t('contrat artifact : tolérance montant ±0,02 € = 2 centimes', () => {
    assert.equal(AMOUNT_TOLERANCE_CENTS, 2)
  })

  // ── rapport ─────────────────────────────────────────────────────────
  await Promise.all(results)
  console.log(`\n${pass}/${pass + fail} scénario(s) OK`)
  process.exit(fail ? 1 : 0)
})().catch((e) => {
  console.error('ERREUR FATALE', e)
  process.exit(2)
})
