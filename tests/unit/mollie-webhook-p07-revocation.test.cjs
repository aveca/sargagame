#!/usr/bin/env node
'use strict'
/**
 * mollie-webhook-p07-revocation.test.cjs — P0.7 : idempotence + revocation des
 * webhooks remboursement / chargeback sur `workers/sg-payments/index.js`.
 *
 * DEFAUT CORRIGE (P0.7) :
 *   Le webhook Classique remboursement/chargeback REUTILISAIT `paymentId` comme
 *   cle d'idempotence. Apres un `payment.paid` honore, le `payment.refunded`
 *   (meme paymentId) etait considere comme doublon et retourne tot : la
 *   revocation (expiration du grant B2C + suppression KV du pass) ne s'executait
 *   jamais. De plus, les webhooks d'entite Next-gen `refund` / `chargeback`
 *   n'etaient pas geres (tombaient sur `unsupported_resource`).
 *
 * CORRECTION :
 *   - Namespace d'idempotence separe : `mollie_<pid>` (attribution/paid) vs
 *     `mollie_rev_<pid>` (revocation) => paye -> rembourse n'est plus un faux
 *     doublon.
 *   - Remboursement/chargeback Classique : etat autoritaire relu chez Mollie
 *     (amountRefunded / amountChargedBack) avant revocation.
 *   - Remboursement/chargeback Next-gen (ressource `refund`/`chargeback`) :
 *     snapshot verifie chez Mollie avant revocation.
 *   - Revocation verifiee (read -> PATCH expires_at -> verifie ligne expiree ->
 *     supprime KV pass -> pose marqueur `mollie_rev_<pid>`). Toute panne
 *     Supabase/KV leve une erreur => HTTP 500 (rejeu Mollie), jamais 200 en cas
 *     d'echec.
 *
 * Aucun paiement reel n'est utilise : toutes les fixtures sont explicites.
 */

const assert = require('node:assert/strict')
const path = require('path')
const { pathToFileURL } = require('node:url')
const {
  WEBHOOK_SECRET,
  createEnv,
  installFetch,
  jsonResponse,
  mkWebhookRequest,
  runWebhook,
  paidPayment
} = require(path.join(__dirname, 'mollie-worker-harness.cjs'))

const WORKER_PATH = path.join(__dirname, '..', '..', 'workers', 'sg-payments', 'index.js')

const t = (cond, label) => { assert.ok(cond, label); console.log('OK  ' + label) }

let WORKER
async function getWorker() {
  if (!WORKER) {
    WORKER = (await import(pathToFileURL(WORKER_PATH).href)).default
  }
  return WORKER
}

/**
 * Backend simule : Mollie (paiement, remboursements, chargebacks) + Supabase
 * (payment_grants en lecture/ecriture/PATCH). Aucun reseau reel.
 */
function buildBackend(state = {}) {
  const grants = state.grants || []
  const patchFails = state.patchFails === true
  const readFails = state.readFails === true
  const mollieFails = state.mollieFails === true
  // Supabase REST utilise le préfixe "eq." (ex: payment_id=eq.tr_xxx).
  const eq = (v) => String(v || '').replace(/^eq\./, '')

  const backend = installFetch(({ url, method, body }) => {
    const u = new URL(url)

    // --- Mollie : paiement (etat autoritaire pour le Classique) ---
    if (u.hostname === 'api.mollie.com' && u.pathname === `/v2/payments/${state.paymentId}` && !u.pathname.includes('/refunds/') && !u.pathname.includes('/chargebacks/')) {
      if (mollieFails) return jsonResponse({ title: 'boom' }, 500)
      return jsonResponse(state.payment || paidPayment())
    }

    // --- Mollie : remboursement d'un paiement (snapshot Next-gen) ---
    const mRefund = u.pathname.match(/^\/v2\/payments\/([^\/]+)\/refunds\/([^\/]+)$/)
    if (u.hostname === 'api.mollie.com' && mRefund) {
      if (mollieFails) return jsonResponse({ title: 'boom' }, 500)
      return jsonResponse(state.refund || { id: 're_x', status: 'refunded', paymentId: state.paymentId, amount: { value: '14.99', currency: 'EUR' } })
    }

    // --- Mollie : chargeback d'un paiement (snapshot Next-gen) ---
    const mChb = u.pathname.match(/^\/v2\/payments\/([^\/]+)\/chargebacks\/([^\/]+)$/)
    if (u.hostname === 'api.mollie.com' && mChb) {
      if (mollieFails) return jsonResponse({ title: 'boom' }, 500)
      return jsonResponse(state.chargeback || { id: 'chb_x', reversedAt: null, paymentId: state.paymentId, amount: { value: '14.99', currency: 'EUR' } })
    }

    // --- Supabase : payment_grants ---
    if (u.hostname === 'supabase.test' && u.pathname === '/rest/v1/payment_grants') {
      if (readFails && method === 'GET') return jsonResponse({ message: 'read exploded' }, 500)
      if (method === 'GET') {
        const q = u.searchParams
        const pid = eq(q.get('payment_id'))
        const type = eq(q.get('type'))
        const rows = grants.filter((g) => (!pid || g.payment_id === pid) && (!type || g.type === type))
        return jsonResponse(rows)
      }
      if (method === 'PATCH') {
        if (patchFails) return jsonResponse({ message: 'patch exploded' }, 500)
        const patch = JSON.parse(body || '{}')
        const q = u.searchParams
        const pid = eq(q.get('payment_id'))
        const type = eq(q.get('type'))
        for (const g of grants) {
          if ((!pid || g.payment_id === pid) && (!type || g.type === type)) {
            g.expires_at = patch.expires_at
          }
        }
        return jsonResponse([], 200)
      }
      return jsonResponse([], 200)
    }

    return jsonResponse({ error: 'unmocked' }, 404)
  })
  return { backend, calls: backend.calls, grants }
}

function classicWebhook(id, event) {
  const body = `id=${encodeURIComponent(id)}&event=${encodeURIComponent(event)}`
  return mkWebhookRequest({ body, contentType: 'application/x-www-form-urlencoded' })
}

function nextgenWebhook(resource, type, entityId, paymentId) {
  const body = JSON.stringify({ resource, id: `event_${resource}_001`, type, entityId, paymentId })
  return mkWebhookRequest({ body, contentType: 'application/json' })
}

async function main() {
  const worker = await getWorker()
  const nowIso = new Date().toISOString()

  // =========================================================================
  // 1. CLASSIQUE : paye -> rembourse sur le MEME paymentId n'est pas un doublon
  //    et la revocation s'effectue (regression du defect P0.7).
  // =========================================================================
  {
    const pid = 'tr_classic_refund'
    const state = { paymentId: pid, payment: paidPayment({ id: pid, status: 'paid', amount: { value: '14.99', currency: 'EUR' }, amountRefunded: { value: '14.99', currency: 'EUR' } }) }
    const grants = [{
      payment_id: pid, type: 'b2c_pass', pass: 'p30', email: 'v@example.com',
      currency: 'EUR', expires_at: new Date(Date.now() + 7 * 86400000).toISOString(), granted_at: nowIso
    }]
    const { backend } = buildBackend({ ...state, grants })
    // Simule un paiement deja honore : marqueur attribution + grant existant.
    const { env, kv } = createEnv({ kvInitial: { [`mollie_${pid}`]: '1' } })

    const res = await runWebhook(worker, classicWebhook(pid, 'payment.refunded'), env)
    backend.restore()
    t(res.status === 200, '1 : payment.refunded classe (meme paymentId que le paye) => 200, pas de doublon')
    t(res.json && res.json.revoked === true, '1 : remboursement classe => revoked true')
    t(res.json && res.json.granted === false, '1 : pas de nouveau grant')
    t(grants.some((g) => g.payment_id === pid && g.type === 'b2c_pass' && g.expires_at && new Date(g.expires_at) <= Date.now() + 1000), '1 : grant B2C expire (PATCH verifie)')
    t(!kv.has(`mol_b2c_pass_${pid}`), '1 : cle KV du pass supprimee')
    t(kv.has(`mollie_rev_${pid}`), '1 : marqueur revocation pose (namespace separe de mollie_<pid>)')
    t(kv.has(`mollie_${pid}`), '1 : marqueur attribution conserve (audit)')
  }

  // =========================================================================
  // 2. CLASSIQUE : paye -> chargeback sur le meme paymentId => revocation.
  // =========================================================================
  {
    const pid = 'tr_classic_chargeback'
    const state = { paymentId: pid, payment: paidPayment({ id: pid, status: 'paid', amount: { value: '14.99', currency: 'EUR' }, amountChargedBack: { value: '14.99', currency: 'EUR' } }) }
    const grants = [{
      payment_id: pid, type: 'b2c_pass', pass: 'p30', email: 'v@example.com',
      currency: 'EUR', expires_at: new Date(Date.now() + 7 * 86400000).toISOString(), granted_at: nowIso
    }]
    const { backend } = buildBackend({ ...state, grants })
    const { env, kv } = createEnv({ kvInitial: { [`mollie_${pid}`]: '1' } })

    const res = await runWebhook(worker, classicWebhook(pid, 'chargeback.received'), env)
    backend.restore()
    t(res.status === 200, '2 : chargeback.received classe (meme paymentId que le paye) => 200, pas de doublon')
    t(res.json && res.json.revoked === true, '2 : chargeback classe => revoked true')
    t(grants.some((g) => g.payment_id === pid && g.type === 'b2c_pass' && g.expires_at), '2 : grant B2C expire')
    t(!kv.has(`mol_b2c_pass_${pid}`), '2 : cle KV du pass supprimee')
    t(kv.has(`mollie_rev_${pid}`), '2 : marqueur revocation pose')
  }

  // =========================================================================
  // 3. NEXT-GEN : remboursement (ressource refund) => verification puis revocation.
  // =========================================================================
  {
    const pid = 'tr_ng_refund'
    const state = { paymentId: pid, refund: { id: 're_ng', status: 'refunded', paymentId: pid, amount: { value: '14.99', currency: 'EUR' } } }
    const grants = [{
      payment_id: pid, type: 'b2c_pass', pass: 'p30', email: 'v@example.com',
      currency: 'EUR', expires_at: new Date(Date.now() + 7 * 86400000).toISOString(), granted_at: nowIso
    }]
    const { backend, grants: g } = buildBackend({ ...state, grants })
    const { env, kv } = createEnv()

    const res = await runWebhook(worker, nextgenWebhook('refund', 'refund.refunded', 're_ng', pid), env)
    backend.restore()
    t(res.status === 200, '3 : refund.refunded next-gen => 200')
    t(res.json && res.json.revoked === true, '3 : remboursement next-gen => revoked true')
    t(res.json && res.json.paymentId === pid, '3 : paymentId remonte depuis l entite verifiee')
    t(g.some((gr) => gr.payment_id === pid && gr.type === 'b2c_pass' && gr.expires_at), '3 : grant B2C expire')
    t(kv.has(`mollie_rev_${pid}`), '3 : marqueur revocation pose')
  }

  // =========================================================================
  // 4. NEXT-GEN : chargeback recu => verification puis revocation.
  // =========================================================================
  {
    const pid = 'tr_ng_chargeback'
    const state = { paymentId: pid, chargeback: { id: 'chb_ng', reversedAt: null, paymentId: pid, amount: { value: '14.99', currency: 'EUR' } } }
    const grants = [{
      payment_id: pid, type: 'b2c_pass', pass: 'p30', email: 'v@example.com',
      currency: 'EUR', expires_at: new Date(Date.now() + 7 * 86400000).toISOString(), granted_at: nowIso
    }]
    const { backend, grants: g } = buildBackend({ ...state, grants })
    const { env, kv } = createEnv()

    const res = await runWebhook(worker, nextgenWebhook('chargeback', 'chargeback.received', 'chb_ng', pid), env)
    backend.restore()
    t(res.status === 200, '4 : chargeback.received next-gen => 200')
    t(res.json && res.json.revoked === true, '4 : chargeback next-gen => revoked true')
    t(g.some((gr) => gr.payment_id === pid && gr.type === 'b2c_pass' && gr.expires_at), '4 : grant B2C expire')
    t(kv.has(`mollie_rev_${pid}`), '4 : marqueur revocation pose')
  }

  // =========================================================================
  // 5. Chargeback RENVERSE => pas de revocation, marque pour arreter le rejeu.
  // =========================================================================
  {
    const pid = 'tr_ng_chb_reversed'
    const state = { paymentId: pid, chargeback: { id: 'chb_rev', reversedAt: '2026-11-06T10:00:00Z', paymentId: pid } }
    const { backend } = buildBackend(state)
    const { env, kv } = createEnv()

    const res = await runWebhook(worker, nextgenWebhook('chargeback', 'chargeback.reversed', 'chb_rev', pid), env)
    backend.restore()
    t(res.status === 200, '5 : chargeback.reversed => 200')
    t(res.json && res.json.revoked === false, '5 : chargeback renverse => pas de revocation')
    t(res.json && res.json.processed === true, '5 : marque comme traite (pas de rejet infini)')
    t(kv.has(`mollie_rev_${pid}`), '5 : marqueur pose pour eviter le rejeu')
  }

  // =========================================================================
  // 6. Remboursement pas encore effectif (status != refunded) => pas de revocation.
  // =========================================================================
  {
    const pid = 'tr_ng_refund_pending'
    const state = { paymentId: pid, refund: { id: 're_pend', status: 'pending', paymentId: pid } }
    const { backend } = buildBackend(state)
    const { env, kv } = createEnv()

    const res = await runWebhook(worker, nextgenWebhook('refund', 'refund.refunded', 're_pend', pid), env)
    backend.restore()
    t(res.status === 200, '6 : refund non effectif => 200')
    t(res.json && res.json.revoked === false, '6 : remboursement pending => pas de revocation')
    t(res.json && res.json.processed === false, '6 : remboursement pending => pas encore traite (rejouable)')
    t(!kv.has(`mollie_rev_${pid}`), '6 : aucun marqueur revocation (rejouable quand effectif)')
  }

  // =========================================================================
  // 7. Idempotence de revocation : rejeton d'un remboursement deja traite => doublon.
  // =========================================================================
  {
    const pid = 'tr_idem_rev'
    const state = { paymentId: pid, refund: { id: 're_idem', status: 'refunded', paymentId: pid } }
    const { backend } = buildBackend(state)
    const { env, kv } = createEnv()

    // Pose le marqueur de revocation directement (simule un traite precedent).
    await kv.namespace.put(`mollie_rev_${pid}`, '1', { expirationTtl: 86400 })

    const res = await runWebhook(worker, nextgenWebhook('refund', 'refund.refunded', 're_idem', pid), env)
    backend.restore()
    t(res.status === 200, '7 : revocation rejouee => 200')
    t(res.json && res.json.duplicate === true, '7 : revocation rejouee => doublon (pas de double revocation)')
  }

  // =========================================================================
  // 8. Panne Supabase durant la revocation => HTTP 500 (rejeuable), jamais 200.
  // =========================================================================
  {
    const pid = 'tr_supa_fail'
    const state = {
      paymentId: pid,
      patchFails: true,
      payment: paidPayment({ id: pid, status: 'paid', amount: { value: '14.99', currency: 'EUR' }, amountRefunded: { value: '14.99', currency: 'EUR' } })
    }
    const { backend } = buildBackend(state)
    const { env } = createEnv()

    const res = await runWebhook(worker, classicWebhook(pid, 'payment.refunded'), env)
    backend.restore()
    t(res.status === 500, '8 : panne Supabase revocation => 500 (jamais 200 sur echec)')
    t(res.json && res.json.error === 'webhook_processing_error', '8 : erreur de traitement signalee')
  }

  console.log('PASS: P0.7 revocation remboursement/chargeback (classique + next-gen, idempotence, panne 500)')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
