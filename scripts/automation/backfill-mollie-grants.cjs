#!/usr/bin/env node
'use strict';
/**
 * backfill-mollie-grants.cjs — Backfill fail-closed des droits B2C Mollie → Supabase
 * ============================================================================
 *
 * OBJECTIF
 *   Délivrer les droits manquants pour des paiements Mollie DÉJÀ payé, sans
 *   jamais créer de faux droit, sans double délivrance et sans exposer de
 *   donnée transactionnelle.
 *
 * GARDE-FOUS (fail-closed)
 *   Toute lecture qui échoue BLOQUE la ligne et marque le contrôle comme
 *   « indeterminate ». Une erreur API n'est JAMAIS convertie en « aucun
 *   remboursement » ou « aucun grant ».
 *
 *   Contrôles obligatoires, par paiement :
 *     1. GET Mollie payment              → HTTP 200 exigé
 *     2. statut du paiement              → `paid` exigé
 *     3. pass / montant / devise / date  → validation stricte
 *     4. GET Mollie refunds               → HTTP 200 exigé (pagination)
 *     5. GET Mollie chargebacks          → HTTP 200 exigé (endpoint dédié
 *                                          /v2/payments/{id}/chargebacks)
 *     6. GET Supabase payment_grants     → HTTP 200 exigé
 *     7. un grant existant               → blocage (jamais de prolongation)
 *
 * CONFIDENTIALITÉ DU RAPPORT
 *   Le rapport ne contient NI paymentId brut, NI email (même masqué ou
 *   hashé), NI métadonnée Mollie brute, NI webhook URL, NI email dans un
 *   aperçu de payload. Il contient uniquement : identifiant de ligne
 *   aléatoire, position, pass canonique, montants, état des contrôles et
 *   raison technique.
 *
 * MODES
 *   DRY RUN (défaut) : aucune écriture Supabase, AUCUN fichier écrit dans le
 *   dépôt. Un rapport détaillé ne peut être écrit que vers un chemin ABSOLU
 *   situé HORS du dépôt (--report).
 *
 *   APPLY : `--apply` seul ne fait RIEN. La confirmation explicite
 *   `--confirm-backfill=YES-I-HAVE-APPROVED` est obligatoire. Avant chaque
 *   RPC d'écriture, les quatre lectures (payment / refunds / chargebacks /
 *   grant existant) sont refaites immédiatement. Le résultat HTTP du RPC est
 *   vérifié ; un échec interrompt le traitement (jamais de silence).
 *
 *   L'idempotence reste assurée par la base : contrainte unique `payment_id`
 *   + ON CONFLICT DO NOTHING sur `public.sg_upsert_payment_grant`.
 *
 * Usage
 *   node scripts/automation/backfill-mollie-grants.cjs --payment-ids-file C:\privé\ids.txt
 *   node scripts/automation/backfill-mollie-grants.cjs --payment-ids-file C:\privé\ids.txt \
 *        --report C:\privé\backfill-report.json
 *   node scripts/automation/backfill-mollie-grants.cjs --payment-ids-file C:\privé\ids.txt \
 *        --apply --confirm-backfill=YES-I-HAVE-APPROVED
 *
 * Secrets (jamais committés, jamais logués) :
 *   MOLLIE_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

const fs = require('fs');
const path = require('path');

const MOLLIE_BASE = 'https://api.mollie.com/v2';
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// Codes et montants — alignés sur workers/sargagame/index.js.
const DAYS_TABLE = Object.freeze({ p30: 30, trip7: 7, season: 210, sos: 1 });
const LEGACY_PASS_ALIASES = Object.freeze({ p7: 'trip7' });
const LEGACY_PRICES = Object.freeze({ trip7: { EUR: [7.99], USD: [5.99] } });
const PASS_PRICES = Object.freeze({
  p30: { EUR: 14.99, USD: 11.99 },
  trip7: { EUR: 4.99, USD: null },
  season: { EUR: 19.99, USD: null },
  sos: { EUR: 1.00, USD: null },
});
// Date de coupure UNIQUE pour l'ancien pass p7.
const LEGACY_CUTOFF_DATE = '2026-08-01T00:00:00Z';

const CONFIRM_TOKEN = 'YES-I-HAVE-APPROVED';
const PAGE_CAP = 50;

// ─────────────────────────────────────────────────────────────────────────────
// Lecture HTTP — ne lève jamais, retourne toujours un état explicite
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @returns {{ok:boolean,status:number,body:any,networkError:boolean}}
 */
async function readJson(fetchImpl, url, headers) {
  try {
    const res = await fetchImpl(url, { headers });
    let body = null;
    try { body = await res.json(); } catch { body = null; }
    return { ok: res.ok, status: res.status, body, networkError: false };
  } catch {
    return { ok: false, status: 0, body: null, networkError: true };
  }
}

/**
 * POST JSON — utilisé uniquement pour la RPC d'écriture. Ne lève jamais :
 * le résultat HTTP est renvoyé tel quel pour être vérifié par l'appelant.
 */
async function postJson(fetchImpl, url, headers, body) {
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    let parsed = null;
    try { parsed = await res.json(); } catch { parsed = null; }
    return { ok: res.ok, status: res.status, body: parsed, networkError: false };
  } catch {
    return { ok: false, status: 0, body: null, networkError: true };
  }
}

function extractItems(body, expectedKey) {
  const embedded = (body && body._embedded) || {};
  if (Array.isArray(embedded[expectedKey])) return embedded[expectedKey];
  for (const k of Object.keys(embedded)) {
    if (Array.isArray(embedded[k])) return embedded[k];
  }
  return [];
}

/**
 * GET d'une collection paginée. Toute erreur réseau / HTTP rend le contrôle
 * « indeterminate » : le compte d'éléments retourné n'est alors PAS exploitable
 * (null) et la ligne est bloquée.
 */
async function readList(fetchImpl, key, pathSuffix, expectedKey) {
  let url = MOLLIE_BASE + pathSuffix;
  const items = [];
  let pages = 0;
  let reportedCount = null;
  while (url) {
    const res = await readJson(fetchImpl, url, { Authorization: 'Bearer ' + key });
    if (res.networkError) {
      return { state: 'indeterminate', status: 0, reason: 'network_unreachable', count: null, pages };
    }
    if (!res.ok) {
      // Une erreur HTTP laisse le contrôle INDÉTERMINÉ : on ne sait pas
      // s'il existe des remboursements. Jamais « aucun remboursement ».
      return { state: 'indeterminate', status: res.status, reason: 'http_error_' + res.status, count: null, pages };
    }
    if (!res.body || typeof res.body !== 'object') {
      return { state: 'indeterminate', status: res.status, reason: 'invalid_json', count: null, pages };
    }
    if (pages === 0 && Number.isInteger(res.body.count)) reportedCount = res.body.count;
    items.push(...extractItems(res.body, expectedKey));
    pages += 1;
    const next = res.body._links && res.body._links.next ? res.body._links.next.href : null;
    if (next && !String(next).startsWith(MOLLIE_BASE)) {
      // Pagination qui pointerait hors de l'API Mollie : contrôle incomplet.
      return { state: 'indeterminate', status: res.status, reason: 'pagination_invalid_url', count: null, pages };
    }
    url = next || null;
    if (pages >= PAGE_CAP) {
      return { state: 'indeterminate', status: res.status, reason: 'pagination_cap_reached', count: null, pages };
    }
  }
  if (reportedCount !== null && reportedCount > items.length) {
    // Le serveur annonce plus d'éléments que ce qu'on a pu lire : incomplet.
    return { state: 'indeterminate', status: 200, reason: 'incomplete_pagination', count: null, pages };
  }
  return { state: 'ok', status: 200, reason: null, count: items.length, pages };
}

/** GET Mollie payment : HTTP 200 obligatoire. */
async function readPayment(fetchImpl, key, paymentId) {
  const url = MOLLIE_BASE + '/payments/' + encodeURIComponent(paymentId);
  const res = await readJson(fetchImpl, url, { Authorization: 'Bearer ' + key });
  if (res.networkError) {
    return { state: 'indeterminate', status: 0, reason: 'network_unreachable', payment: null };
  }
  if (!res.ok) {
    // Erreur HTTP => contrôle INDÉTERMINÉ (l'existence du paiement n'est pas
    // établie). Jamais de conversion en « paiement absent ».
    return { state: 'indeterminate', status: res.status, reason: 'mollie_payment_http_error_' + res.status, payment: null };
  }
  if (!res.body || typeof res.body !== 'object' || typeof res.body.status !== 'string') {
    return { state: 'indeterminate', status: res.status, reason: 'mollie_payment_invalid_json', payment: null };
  }
  return { state: 'ok', status: res.status, reason: null, payment: res.body };
}

/** GET Supabase payment_grants filtré sur payment_id : HTTP 200 obligatoire. */
async function readExistingGrant(fetchImpl, sbUrl, sbKey, paymentId) {
  const url = sbUrl.replace(/\/+$/, '') +
    '/rest/v1/payment_grants?select=payment_id&payment_id=eq.' +
    encodeURIComponent(paymentId) + '&limit=1';
  const res = await readJson(fetchImpl, url, {
    apikey: sbKey,
    Authorization: 'Bearer ' + sbKey,
    Accept: 'application/json',
  });
  if (res.networkError) {
    return { state: 'indeterminate', status: 0, reason: 'network_unreachable', exists: null };
  }
  if (!res.ok) {
    // Erreur HTTP => contrôle INDÉTERMINÉ : l'existence d'un grant n'est pas
    // établie. Jamais de conversion en « aucun grant ».
    return { state: 'indeterminate', status: res.status, reason: 'supabase_grants_http_error_' + res.status, exists: null };
  }
  if (!Array.isArray(res.body)) {
    return { state: 'indeterminate', status: res.status, reason: 'supabase_grants_invalid_json', exists: null };
  }
  return { state: 'ok', status: res.status, reason: null, exists: res.body.length > 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation métier (miroir du Worker régional)
// ─────────────────────────────────────────────────────────────────────────────

// Le fuseau est EXIGÉ : sans fuseau explicite, la date serait interprétée en
// heure locale et le contrôle de la coupure deviendrait non déterministe.
const ISO_WITH_TIMEZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

function parseCreatedAt(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (typeof value !== 'string') return NaN;
  const s = value.trim();
  if (!ISO_WITH_TIMEZONE.test(s)) return NaN;
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? ms : NaN;
}

/**
 * Valide pass / montant / devise / date de création.
 * @returns {{ok:boolean,reason:string|null,pass:string|null,currency:string|null,
 *            amount:number|null,isLegacy:boolean,email:string}}
 */
function validatePayment(payment) {
  const out = { ok: false, reason: null, pass: null, currency: null, amount: null, isLegacy: false, email: '' };
  const md = (payment && payment.metadata) || {};
  out.email = String(md.email || '').trim();

  if (!payment || payment.status !== 'paid') {
    out.reason = 'payment_not_paid';
    return out;
  }

  const rawPass = String(md.pass || '');
  const isLegacy = Object.prototype.hasOwnProperty.call(LEGACY_PASS_ALIASES, rawPass);
  const pass = isLegacy ? LEGACY_PASS_ALIASES[rawPass] : rawPass;
  out.isLegacy = isLegacy;

  if (!DAYS_TABLE[pass] || !PASS_PRICES[pass]) {
    out.reason = 'unknown_pass';
    return out;
  }
  out.pass = pass;

  const currency = String((payment.amount && payment.amount.currency) || '').toUpperCase();
  const value = Number(payment.amount && payment.amount.value);
  const cents = Math.round(value * 100);
  if (!Number.isFinite(value) || !Number.isInteger(cents) || cents <= 0) {
    out.reason = 'invalid_amount';
    return out;
  }
  if (!currency) {
    out.reason = 'unsupported_currency';
    return out;
  }
  out.currency = currency;
  out.amount = Math.round(value * 100) / 100;

  if (isLegacy) {
    // Fenêtre historique : date de création vérifiable et strictement
    // antérieure à la coupure. Absente / invalide / tardive => refus.
    const created = parseCreatedAt(payment.createdAt);
    if (!Number.isFinite(created)) {
      out.reason = 'legacy_expired';
      return out;
    }
    if (created >= Date.parse(LEGACY_CUTOFF_DATE)) {
      out.reason = 'legacy_expired';
      return out;
    }
    const legacy = LEGACY_PRICES[pass] || {};
    if (!Object.prototype.hasOwnProperty.call(legacy, currency)) {
      out.reason = 'unsupported_currency';
      return out;
    }
    const acceptable = legacy[currency].map((n) => Math.round(n * 100));
    if (!acceptable.some((n) => Math.abs(cents - n) <= 2)) {
      out.reason = 'amount_mismatch';
      return out;
    }
    out.ok = true;
    return out;
  }

  if (!Object.prototype.hasOwnProperty.call(PASS_PRICES[pass], currency)) {
    out.reason = 'unsupported_currency';
    return out;
  }
  const expected = PASS_PRICES[pass][currency];
  if (expected === null) {
    const upper = currency === 'USD' && pass !== 'trip7' ? 5750 : 5000;
    if (cents <= 50 || cents >= upper) {
      out.reason = 'amount_out_of_range';
      return out;
    }
  } else {
    const acceptable = [Math.round(expected * 100)];
    if (currency === 'USD' && pass !== 'trip7') acceptable.push(Math.round(acceptable[0] * 1.15));
    if (!acceptable.some((n) => Math.abs(cents - n) <= 2)) {
      out.reason = 'amount_mismatch';
      return out;
    }
  }
  out.ok = true;
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rapport sans PII
// ─────────────────────────────────────────────────────────────────────────────

function randomRowId() {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return 'row_' + hex;
}

function publicRow(index, validation, checks, eligible, reason) {
  return {
    row: randomRowId(),
    index,
    pass: validation.pass,
    amount: validation.amount === null ? null : { value: validation.amount, currency: validation.currency },
    checks,
    eligible,
    reason,
  };
}

const publicCheck = (state, extra) => ({ state, ...(extra || {}) });

// ─────────────────────────────────────────────────────────────────────────────
// Cœur fail-closed
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Exécute l'ensemble des contrôles pour UN paiement.
 * Ne lève jamais sur une erreur API : renvoie un état structuré.
 */
async function assessPayment(ctx, paymentId) {
  const { fetchImpl, mollieKey, sbUrl, sbKey } = ctx;

  const paymentRead = await readPayment(fetchImpl, mollieKey, paymentId);
  if (paymentRead.state !== 'ok') {
    // Toute lecture de paiement non aboutie laisse le contrôle INDÉTERMINÉ :
    // l'existence et l'état du paiement ne sont pas établis.
    const validation = { pass: null, currency: null, amount: null, email: '' };
    const checks = {
      payment: publicCheck(paymentRead.state, { status: paymentRead.status, reason: paymentRead.reason }),
      status: publicCheck('indeterminate', { reason: 'payment_unavailable' }),
      identity: publicCheck('indeterminate', { reason: 'payment_unavailable' }),
      refunds: publicCheck('indeterminate', { reason: 'not_evaluated' }),
      chargebacks: publicCheck('indeterminate', { reason: 'not_evaluated' }),
      grant: publicCheck('indeterminate', { reason: 'not_evaluated' }),
      email: publicCheck('indeterminate', { present: null }),
    };
    return {
      validation,
      checks,
      eligible: false,
      reason: 'indeterminate_payment_read',
    };
  }

  const payment = paymentRead.payment;
  const validation = validatePayment(payment);
  const isPaid = payment.status === 'paid';

  // Remboursements et chargebacks : lectures obligatoires, pagination comprise.
  const refundsRead = await readList(fetchImpl, mollieKey, '/payments/' + encodeURIComponent(paymentId) + '/refunds', 'refunds');
  const chargebacksRead = await readList(fetchImpl, mollieKey, '/payments/' + encodeURIComponent(paymentId) + '/chargebacks', 'chargebacks');
  const grantRead = await readExistingGrant(fetchImpl, sbUrl, sbKey, paymentId);

  const emailPresent = validation.pass === 'sos' ? true : validation.email.length > 0;

  const checks = {
    payment: publicCheck(paymentRead.state, { status: paymentRead.status }),
    status: publicCheck(isPaid ? 'ok' : 'failed', { reason: isPaid ? null : 'payment_not_paid' }),
    identity: publicCheck(!isPaid ? 'indeterminate' : (validation.ok ? 'ok' : 'failed'), {
      reason: !isPaid ? 'not_evaluated' : validation.reason,
    }),
    refunds: publicCheck(refundsRead.state, { status: refundsRead.status, count: refundsRead.count, reason: refundsRead.reason }),
    chargebacks: publicCheck(chargebacksRead.state, { status: chargebacksRead.status, count: chargebacksRead.count, pages: chargebacksRead.pages, reason: chargebacksRead.reason }),
    grant: publicCheck(grantRead.state, { status: grantRead.status, exists: grantRead.exists, reason: grantRead.reason }),
    email: publicCheck(emailPresent ? 'ok' : 'failed', { present: emailPresent }),
  };

  // ── Décision fail-closed ────────────────────────────────────────────────
  // 1. Toute lecture en échec / indéterminée bloque.
  const readStates = ['payment', 'refunds', 'chargebacks', 'grant'];
  for (const key of readStates) {
    if (checks[key].state !== 'ok') {
      return { validation, checks, eligible: false, reason: 'indeterminate_' + key + '_read' };
    }
  }
  // 2. Statut payé exigé.
  if (validation.reason === 'payment_not_paid') {
    return { validation, checks, eligible: false, reason: 'payment_not_paid' };
  }
  // 3. Validation stricte pass / montant / devise / date.
  if (!validation.ok) {
    return { validation, checks, eligible: false, reason: validation.reason };
  }
  // 4. Aucun remboursement, aucun chargeback.
  if (checks.refunds.count > 0) {
    return { validation, checks, eligible: false, reason: 'refunded' };
  }
  if (checks.chargebacks.count > 0) {
    return { validation, checks, eligible: false, reason: 'chargeback' };
  }
  // 5. Grant existant => blocage (jamais de prolongation).
  if (checks.grant.exists === true) {
    return { validation, checks, eligible: false, reason: 'grant_already_exists' };
  }
  // 6. Email obligatoire (sauf sos). Jamais deviné ni reconstruit.
  if (!emailPresent) {
    return { validation, checks, eligible: false, reason: 'email_missing' };
  }

  return { validation, checks, eligible: true, reason: 'eligible' };
}

/**
 * Re-vérification immédiate avant écriture. Refait les quatre lectures.
 */
async function preWriteRecheck(ctx, paymentId) {
  const { fetchImpl, mollieKey, sbUrl, sbKey } = ctx;
  const paymentRead = await readPayment(fetchImpl, mollieKey, paymentId);
  if (paymentRead.state !== 'ok') {
    return { ok: false, reason: 'prewrite_payment_read_failed', payment: null, validation: null };
  }
  const payment = paymentRead.payment;
  const validation = validatePayment(payment);
  if (!validation.ok) {
    return { ok: false, reason: 'prewrite_' + (validation.reason || 'invalid'), payment, validation };
  }
  const refundsRead = await readList(fetchImpl, mollieKey, '/payments/' + encodeURIComponent(paymentId) + '/refunds', 'refunds');
  if (refundsRead.state !== 'ok') {
    return { ok: false, reason: 'prewrite_refunds_read_failed', payment, validation };
  }
  if (refundsRead.count > 0) {
    return { ok: false, reason: 'prewrite_refunded', payment, validation };
  }
  const chargebacksRead = await readList(fetchImpl, mollieKey, '/payments/' + encodeURIComponent(paymentId) + '/chargebacks', 'chargebacks');
  if (chargebacksRead.state !== 'ok') {
    return { ok: false, reason: 'prewrite_chargebacks_read_failed', payment, validation };
  }
  if (chargebacksRead.count > 0) {
    return { ok: false, reason: 'prewrite_chargeback', payment, validation };
  }
  const grantRead = await readExistingGrant(fetchImpl, sbUrl, sbKey, paymentId);
  if (grantRead.state !== 'ok') {
    return { ok: false, reason: 'prewrite_grant_read_failed', payment, validation };
  }
  if (grantRead.exists === true) {
    return { ok: false, reason: 'prewrite_grant_already_exists', payment, validation };
  }
  return { ok: true, reason: null, payment, validation };
}

/**
 * Écrit le grant via la RPC `sg_upsert_payment_grant`.
 * Le résultat HTTP est vérifié : un échec n'est JAMAIS rapporté comme un succès.
 */
async function writeGrant(ctx, paymentId, validation, payment) {
  const { fetchImpl, sbUrl, sbKey } = ctx;
  const md = (payment && payment.metadata) || {};
  const days = DAYS_TABLE[validation.pass];
  const body = {
    p_payment_id: String(paymentId),
    p_pass: validation.pass,
    p_email: validation.email,
    p_currency: validation.currency,
    p_expires_at: new Date(Date.now() + days * 86400000).toISOString(),
    p_granted_at: new Date().toISOString(),
    p_metadata: Object.assign({}, md, { pass: validation.pass }),
  };
  const res = await postJson(fetchImpl, sbUrl.replace(/\/+$/, '') + '/rest/v1/rpc/sg_upsert_payment_grant', {
    apikey: sbKey,
    Authorization: 'Bearer ' + sbKey,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  }, body);
  if (res.networkError) {
    return { ok: false, status: 0, reason: 'rpc_network_unreachable', payloadKeys: Object.keys(body) };
  }
  if (!res.ok) {
    let code = '';
    if (res.body && typeof res.body === 'object') code = String(res.body.code || '');
    return {
      ok: false,
      status: res.status,
      reason: 'rpc_http_' + res.status + (code ? '_' + code : ''),
      payloadKeys: Object.keys(body),
    };
  }
  return { ok: true, status: res.status, reason: null, payloadKeys: Object.keys(body) };
}

/**
 * Point d'entrée programmatique (testable).
 *
 * @param {object} options
 * @param {string[]} options.paymentIds       identifiants Mollie à traiter
 * @param {Function} options.fetchImpl        fetch injecté (tests)
 * @param {object} options.env                {MOLLIE_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY}
 * @param {boolean} [options.apply]           true => mode écriture (défaut false)
 * @param {string} [options.confirm]          jeton de confirmation
 * @returns {Promise<object>} rapport (sans PII)
 */
async function runBackfill(options) {
  const paymentIds = (options.paymentIds || []).filter((x) => typeof x === 'string' && x.length > 0);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const env = options.env || {};
  const apply = options.apply === true;
  const confirmed = options.confirm === CONFIRM_TOKEN;

  const report = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    mode: apply ? 'apply' : 'dry-run',
    applyRequested: apply,
    applyConfirmed: confirmed,
    confidentiality: {
      rawPaymentIds: false,
      emails: false,
      emailHashes: false,
      rawMetadata: false,
      webhookUrls: false,
    },
    summary: { rows: 0, eligible: 0, blocked: 0, indeterminate: 0, applied: 0, failed: 0 },
    rows: [],
    aborted: null,
  };

  if (apply && !confirmed) {
    // `--apply` seul n'écrit RIEN.
    report.aborted = { reason: 'confirmation_required' };
    return report;
  }

  const ctx = {
    fetchImpl,
    mollieKey: String(env.MOLLIE_API_KEY || ''),
    sbUrl: String(env.SUPABASE_URL || ''),
    sbKey: String(env.SUPABASE_SERVICE_KEY || ''),
  };

  for (let i = 0; i < paymentIds.length; i += 1) {
    const paymentId = paymentIds[i];
    const assessment = await assessPayment(ctx, paymentId);
    const row = publicRow(i + 1, assessment.validation, assessment.checks, assessment.eligible, assessment.reason);
    report.rows.push(row);
    report.summary.rows += 1;
    if (assessment.eligible) {
      report.summary.eligible += 1;
    } else {
      report.summary.blocked += 1;
      if (String(assessment.reason).startsWith('indeterminate_')) report.summary.indeterminate += 1;
    }
  }

  if (!apply) return report;

  // ── Mode APPLY ───────────────────────────────────────────────────────────
  // Re-vérification immédiate avant chaque écriture + vérification du HTTP RPC.
  for (const row of report.rows) {
    if (!row.eligible) continue;
    const paymentId = paymentIds[row.index - 1];
    const recheck = await preWriteRecheck(ctx, paymentId);
    if (!recheck.ok) {
      row.eligible = false;
      row.reason = recheck.reason;
      report.summary.eligible -= 1;
      report.summary.blocked += 1;
      if (String(recheck.reason).startsWith('prewrite_') && /read_failed$/.test(recheck.reason)) {
        report.summary.indeterminate += 1;
      }
      continue;
    }
    const write = await writeGrant(ctx, paymentId, recheck.validation, recheck.payment);
    row.grantPayloadKeys = write.payloadKeys; // NOMS de paramètres uniquement
    if (!write.ok) {
      row.applied = false;
      row.reason = write.reason;
      report.summary.failed += 1;
      // Échec du RPC : on interrompt (jamais de silence, jamais de poursuite
      // silencieuse sur une base potentiellement inconsistante).
      report.aborted = { reason: 'rpc_write_failed', status: write.status, row: row.row };
      return report;
    }
    row.applied = true;
    report.summary.applied += 1;
  }

  return report;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { paymentIds: [], paymentIdsFile: null, reportPath: null, apply: false, confirm: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a.startsWith('--confirm-backfill=')) args.confirm = a.slice('--confirm-backfill='.length);
    else if (a === '--payment-ids-file') { args.paymentIdsFile = argv[++i] || null; }
    else if (a === '--payment-ids') { args.paymentIds = String(argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean); }
    else if (a === '--report') { args.reportPath = argv[++i] || null; }
  }
  return args;
}

/**
 * Extrait des identifiants depuis un fichier : texte (un ID par ligne) ou JSON
 * (tableau de chaînes, ou rapport de rapprochement `{reconciled:[{paymentId}]}`).
 */
function extractPaymentIdsFromFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.map((x) => (typeof x === 'string' ? x : (x && x.paymentId) || '')).filter(Boolean);
    }
    if (parsed && Array.isArray(parsed.reconciled)) {
      return parsed.reconciled
        .filter((e) => e && e.status === 'paid' && !e.grant)
        .map((e) => String(e.paymentId || ''))
        .filter(Boolean);
    }
    return [];
  }
  return trimmed.split(/[\r\n,]+/).map((s) => s.trim()).filter(Boolean);
}

/** Le rapport ne peut être écrit que vers un chemin ABSOLU hors du dépôt. */
function assertReportPathAllowed(reportPath) {
  if (!reportPath) return;
  if (!path.isAbsolute(reportPath)) {
    throw new Error('--report exige un chemin ABSOLU (le dépôt ne doit jamais recevoir de rapport).');
  }
  const resolved = path.resolve(reportPath);
  const root = path.resolve(REPO_ROOT);
  if (resolved === root || resolved.startsWith(root + path.sep)) {
    throw new Error('--report refuse un chemin dans le dépôt : le rapport ne doit jamais être écrit dans le dépôt.');
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Garde 1 : `--apply` sans confirmation → refus, aucune écriture.
  if (args.apply && args.confirm !== CONFIRM_TOKEN) {
    console.error('[backfill] refus : --apply exige --confirm-backfill=' + CONFIRM_TOKEN + '. Aucune écriture.');
    process.exit(1);
  }

  // Garde 2 : rapport hors dépôt.
  try {
    assertReportPathAllowed(args.reportPath);
  } catch (e) {
    console.error('[backfill] refus : ' + e.message);
    process.exit(1);
  }

  // Garde 3 : liste des paiements.
  let paymentIds = args.paymentIds.slice();
  if (!paymentIds.length && args.paymentIdsFile) {
    try {
      paymentIds = extractPaymentIdsFromFile(args.paymentIdsFile);
    } catch (e) {
      console.error('[backfill] refus : impossible de lire la liste des paiements (' + e.message + ').');
      process.exit(1);
    }
  }
  if (!paymentIds.length) {
    console.error('[backfill] refus : aucune liste de paiements (--payment-ids-file ou --payment-ids).');
    process.exit(1);
  }

  // Garde 4 : secrets.
  const env = {
    MOLLIE_API_KEY: process.env.MOLLIE_API_KEY || '',
    SUPABASE_URL: process.env.SUPABASE_URL || '',
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY || '',
  };
  if (!env.MOLLIE_API_KEY || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
    console.error('[backfill] refus : MOLLIE_API_KEY / SUPABASE_URL / SUPABASE_SERVICE_KEY absents. Aucune écriture.');
    process.exit(1);
  }

  const report = await runBackfill({ paymentIds, env, apply: args.apply, confirm: args.confirm });

  // Sortie console : résumé agrégé + lignes compactes. Aucun identifiant de
  // paiement, aucun email, aucune métadonnée.
  console.log('[backfill] mode=' + report.mode + ' paiements=' + report.summary.rows +
    ' éligibles=' + report.summary.eligible + ' bloqués=' + report.summary.blocked +
    ' indéterminés=' + report.summary.indeterminate +
    (args.apply ? ' écrits=' + report.summary.applied + ' échecs=' + report.summary.failed : ''));
  for (const row of report.rows) {
    console.log('  ' + row.row + ' #' + row.index + ' pass=' + (row.pass || '-') +
      ' état=' + (row.eligible ? 'éligible' : 'bloqué') + ' motif=' + row.reason);
  }
  if (report.aborted) {
    console.error('[backfill] interrompu : ' + report.aborted.reason);
    process.exitCode = 1;
  }

  // Écriture du rapport : uniquement si demandé, et uniquement hors dépôt.
  if (args.reportPath) {
    fs.writeFileSync(path.resolve(args.reportPath), JSON.stringify(report, null, 2), { mode: 0o600 });
    console.log('[backfill] rapport écrit → ' + path.resolve(args.reportPath));
  } else {
    console.log('[backfill] dry-run : aucun fichier écrit (utilisez --report <chemin ABSOLU hors dépôt> pour un rapport détaillé).');
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error('[backfill] ERREUR : ' + (e && e.message ? e.message : 'erreur inconnue'));
    process.exit(1);
  });
}

module.exports = {
  runBackfill,
  assessPayment,
  validatePayment,
  extractPaymentIdsFromFile,
  assertReportPathAllowed,
  CONFIRM_TOKEN,
  LEGACY_CUTOFF_DATE,
  PASS_PRICES,
  LEGACY_PRICES,
  DAYS_TABLE,
};
