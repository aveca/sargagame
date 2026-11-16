/**
 * order-state.mjs — Source de vérité PURE du parcours « Diagnostic Sargasses Express ».
 *
 * PRINCIPE
 *   Ce module ne fait AUCUN appel réseau, ne lit AUCUN fichier, ne lit AUCUNE
 *   variable d'environnement. Il est donc testable à l'identique en TEST et en
 *   LIVE, et il encode les mêmes règles que le Worker `sg-payments`
 *   (workers/sg-payments/index.js → validatePaymentForFulfillment /
 *   validateDiagnosticAmount / fulfillDiagnosticOrder).
 *
 * ETATS DE COMMANDE (migration 009)
 *   pending_payment  checkout créé, paiement NON confirmé par Mollie
 *   paid             paiement confirmé (autorité Mollie), commande à produire
 *   processing       production du document en cours
 *   ready            document généré, prêt à être envoyé
 *   delivered        document envoyé au client (trace diagnostic_deliveries)
 *   manual_review    blocage (donnée absente/périmée, PDF, email) → reprise
 *   refunded         remboursement constaté (webhook payment.refunded)
 *
 * RÈGLE D'OR
 *   Un paiement confirmé n'est JAMAIS perdu : il reste dans la table des
 *   commandes et passe en `manual_review` au premier échec de production.
 */

export const DIAGNOSTIC_PRODUCTS = Object.freeze({
  diagnostic_express: Object.freeze({
    key: 'diagnostic_express',
    amount: 49,
    currency: 'EUR',
    label: 'Diagnostic Sargasses Express',
  }),
});

export const ORDER_STATES = Object.freeze([
  'pending_payment',
  'paid',
  'processing',
  'ready',
  'delivered',
  'manual_review',
  'refunded',
]);

/** Transitions autorisées. Une transition vers l'état courant est un no-op idempotent. */
export const ALLOWED_TRANSITIONS = Object.freeze({
  pending_payment: Object.freeze(['paid', 'manual_review', 'refunded']),
  paid: Object.freeze(['processing', 'manual_review', 'refunded']),
  processing: Object.freeze(['ready', 'manual_review', 'refunded']),
  ready: Object.freeze(['delivered', 'manual_review', 'refunded']),
  delivered: Object.freeze(['refunded']),
  manual_review: Object.freeze([
    'paid',
    'processing',
    'ready',
    'delivered',
    'manual_review',
    'refunded',
  ]),
  refunded: Object.freeze([]),
});

/** Tolérance de montant en centimes (convention repo : ±0,02 €). */
export const AMOUNT_TOLERANCE_CENTS = 2;

/** Statuts Mollie qui autorisent la livraison d'un paiement one-off. */
export const PAID_STATUSES = Object.freeze(['paid', 'settled']);

/** Statuts Mollie qui NE déclenchent AUCUNE livraison. */
export const NON_PAID_STATUSES = Object.freeze([
  'open',
  'pending',
  'authorized',
  'canceled',
  'expired',
  'failed',
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isKnownState(status) {
  return ORDER_STATES.includes(String(status || ''));
}

/** Une commande « à produire » est paid / processing / ready / manual_review. */
export function isProductionCandidate(status) {
  return ['paid', 'processing', 'ready', 'manual_review'].includes(String(status || ''));
}

/**
 * Transition autorisée ?
 * - état inconnu => refusé
 * - même état => autorisé (no-op idempotent, on ne régresse jamais)
 */
export function canTransition(from, to) {
  const a = String(from || '');
  const b = String(to || '');
  if (!isKnownState(a) || !isKnownState(b)) return false;
  if (a === b) return true;
  return ALLOWED_TRANSITIONS[a].includes(b);
}

/** Transition autorisée ? Sinon lève une erreur explicite (jamais silencieuse). */
export function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    const err = new Error(`transition_interdite:${from}->${to}`);
    err.code = 'transition_interdite';
    err.from = from;
    err.to = to;
    throw err;
  }
  return true;
}

/** Une commande déjà livrée ne peut pas être relivrée (reprise = lecture seule). */
export function isAlreadyDelivered(status) {
  return String(status || '') === 'delivered';
}

/** Une commande remboursée n'est jamais produite ni relivrée. */
export function isRefunded(status) {
  return String(status || '') === 'refunded';
}

/** Détermine le type d'offre à partir des metadata Mollie. */
export function classifyDiagnosticKind(metadata) {
  const meta = metadata || {};
  const kind = String(meta.offer_kind || '');
  if (kind === 'diagnostic_express') return 'diagnostic_express';
  const source = String(meta.source || '');
  if (source === 'diagnostic_express') return 'diagnostic_express';
  return '';
}

/**
 * Montant exact du catalogue, en centimes.
 * Comparaison NUMÉRIQUE (PostgREST renvoie un numeric, pas une chaîne).
 */
export function validateDiagnosticAmount(payment, productKey = 'diagnostic_express') {
  const product = DIAGNOSTIC_PRODUCTS[productKey];
  if (!product) return { ok: false, reason: 'unknown_product' };
  const currency = String(payment?.amount?.currency || '').toUpperCase();
  const cents = Math.round(Number.parseFloat(payment?.amount?.value) * 100);
  if (!Number.isFinite(cents) || cents <= 0) return { ok: false, reason: 'amount_invalid' };
  if (currency !== product.currency) return { ok: false, reason: 'currency_invalid' };
  const base = Math.round(product.amount * 100);
  if (Math.abs(cents - base) > AMOUNT_TOLERANCE_CENTS) return { ok: false, reason: 'amount_mismatch' };
  return { ok: true, currency, cents };
}

/**
 * Validation complète d'un paiement destiné au diagnostic Express.
 * Miroir exact de `validatePaymentForFulfillment` (cas `diagnostic_express`)
 * dans le Worker, plus une option `allowTestMode` réservée aux tests.
 */
export function validateDiagnosticPayment({ payment, metadata } = {}, options = {}) {
  const allowTestMode = options.allowTestMode === true;
  const problems = [];
  const mode = String(payment?.mode || '');
  const status = String(payment?.status || '');
  const meta = metadata || {};
  const email = String(meta.email || '').trim();
  const currency = String(payment?.amount?.currency || '').toUpperCase();

  if (!payment || !payment.id) problems.push('missing_payment');
  if (!allowTestMode && mode !== 'live') problems.push('not_live_mode');
  if (!PAID_STATUSES.includes(status)) problems.push('not_paid');
  if (!payment?.paidAt) problems.push('missing_paid_at');

  const productKey = String(meta.product || 'diagnostic_express');
  const product = DIAGNOSTIC_PRODUCTS[productKey];
  if (!product) {
    problems.push('unknown_product');
  } else {
    const amount = validateDiagnosticAmount(payment, productKey);
    if (!amount.ok) problems.push(amount.reason);
  }
  if (!EMAIL_RE.test(email)) problems.push('invalid_email');
  if (!String(meta.sector || '').trim()) problems.push('missing_sector');
  if (!String(meta.establishment || '').trim()) problems.push('missing_establishment');
  if (payment?.recurring) problems.push('not_one_off');

  return {
    ok: problems.length === 0,
    problems,
    mode,
    status,
    email,
    currency,
    productKey,
  };
}

/**
 * Décision de fulfillment à partir d'une notification de paiement.
 *   fulfill  → la commande doit être produite/livrée (idempotente)
 *   ignore   → aucun effet (paiement non payé, ou autre offre)
 *   reject   → anomalie de sécurité (montant, devise, signature, mode test…)
 */
export function decideDiagnosticWebhook({ payment, metadata, order, signatureValid } = {}, options = {}) {
  const allowTestMode = options.allowTestMode === true;
  const reasons = [];

  if (signatureValid === false) {
    return { action: 'reject', kind: 'diagnostic_express', reasons: ['invalid_signature'], idempotent: false };
  }
  if (!payment || !payment.id) {
    return { action: 'reject', kind: 'diagnostic_express', reasons: ['missing_payment'], idempotent: false };
  }

  const kind = classifyDiagnosticKind(metadata);
  if (kind !== 'diagnostic_express') {
    return { action: 'ignore', kind: kind || 'other', reasons: ['not_diagnostic_offer'], idempotent: false };
  }

  const status = String(payment.status || '');
  if (!PAID_STATUSES.includes(status)) {
    return {
      action: 'ignore',
      kind,
      reasons: [`payment_not_paid:${status || 'unknown'}`],
      idempotent: false,
    };
  }

  const check = validateDiagnosticPayment({ payment, metadata }, { allowTestMode });
  if (!check.ok) {
    return { action: 'reject', kind, reasons: check.problems, idempotent: false };
  }

  const current = String(order?.status || '');
  const idempotent = current && current !== 'pending_payment';
  return {
    action: 'fulfill',
    kind,
    reasons: [],
    idempotent,
    orderStatus: current || null,
    // Un rejeu ne doit jamais faire régresser l'état (paid → paid, delivered → delivered).
    noRegression: !current || current === 'pending_payment' || isKnownState(current),
  };
}

/**
 * Validation d'une ligne de commande Supabase (côté script de fulfillment).
 * Refuse toute commande qui ne correspond pas au catalogue 49,00 EUR.
 */
export function validateOrderRow(order) {
  const problems = [];
  const row = order || {};
  const paymentId = String(row.payment_id || '').trim();
  const email = String(row.client_email || '').trim();
  const currency = String(row.currency || '').toUpperCase();
  const amount = Number(row.amount);

  if (!paymentId) problems.push('missing_payment_id');
  if (!EMAIL_RE.test(email)) problems.push('invalid_email');
  if (!String(row.establishment || '').trim()) problems.push('missing_establishment');
  if (!String(row.sector || '').trim()) problems.push('missing_sector');
  if (!Number.isFinite(amount)) problems.push('amount_invalid');
  else if (Math.abs(Math.round(amount * 100) - 4900) > AMOUNT_TOLERANCE_CENTS) problems.push('amount_mismatch');
  if (currency !== 'EUR') problems.push('currency_invalid');
  if (!isKnownState(row.status)) problems.push('unknown_status');

  return { ok: problems.length === 0, problems, paymentId, email, amount, currency };
}

/** Prochaine étape de production attendue depuis un état donné. */
export function nextProductionStatus(status) {
  switch (String(status || '')) {
    case 'paid':
      return 'processing';
    case 'processing':
      return 'ready';
    case 'ready':
      return 'delivered';
    case 'manual_review':
      return 'processing';
    default:
      return null;
  }
}
