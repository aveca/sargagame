/**
 * fulfillment.mjs — Orchestration de la production et de la livraison du
 * « Diagnostic Sargasses Express » (49,00 EUR TTC).
 *
 * PRINCIPE
 *   Module PUR côté logique : toutes les entrées/sorties externes sont
 *   injectées (Supabase, chargement de la donnée, génération du PDF, envoi
 *   email). Les tests couvrent donc les 12 scénarios sans réseau, sans email
 *   et sans client réel.
 *
 * GARANTIE CENTRALE
 *   Un paiement confirmé n'est JAMAIS perdu : la commande existe en base, et
 *   le moindre échec (donnée absente/périmée, PDF, email) laisse la commande en
 *   `manual_review` avec l'erreur tracée — donc reprenable, jamais livrée à
 *   moitié, jamais livrée deux fois.
 *
 * ORDRE DES ÉCRITURES (interruption-safe)
 *   1. processing   2. PDF  3. ready (+sha, chemin)
 *   4. trace livraison 'pending'  5. envoi email  6. trace 'sent'  7. delivered
 *   → un rejeu s'arrête sur la trace : jamais de second envoi après un 'sent'.
 */

import { validateOrderRow, canTransition, isRefunded } from './order-state.mjs';

export const DELIVERY_CHANNEL = 'email';
export const PENDING_TRACE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // fenêtre d'idempotence Resend

function nowIso(deps) {
  const d = deps?.now instanceof Date ? deps.now : new Date();
  return d.toISOString();
}

/** Clé d'idempotence d'envoi : stable pour un (paiement, document) donné. */
export function deliveryIdempotencyKey(paymentId, documentSha) {
  return `diag-${paymentId}-${String(documentSha || 'nodoc').slice(0, 16)}`;
}

async function updateOrder(deps, paymentId, patch) {
  const res = await deps.supabase.update('diagnostic_orders', patch, {
    filter: `?payment_id=eq.${encodeURIComponent(paymentId)}`,
  });
  if (!res || !res.ok) {
    return { ok: false, error: (res && res.error) || 'supabase_update_failed' };
  }
  return { ok: true, rows: res.rows || [] };
}

async function loadDeliveries(deps, paymentId) {
  const res = await deps.supabase.select('diagnostic_deliveries', {
    filter: `&payment_id=eq.${encodeURIComponent(paymentId)}&channel=eq.${DELIVERY_CHANNEL}&order=created_at.desc`,
    limit: 10,
  });
  if (!res || !res.ok) {
    return { ok: false, rows: [], error: (res && res.error) || 'supabase_read_failed' };
  }
  return { ok: true, rows: res.rows || [], error: null };
}

/**
 * Produit et livre le diagnostic d'une commande.
 * @param {object} order ligne `diagnostic_orders`
 * @param {object} deps  { now, supabase, loadSnapshot, buildPdf, sendEmail, log }
 */
export async function fulfillOrder(order, deps = {}) {
  const steps = [];
  const transitions = [];
  const log = typeof deps.log === 'function' ? deps.log : () => {};
  const at = nowIso(deps);

  const validation = validateOrderRow(order);
  if (!validation.ok) {
    return {
      outcome: 'failed',
      paymentId: String(order?.payment_id || ''),
      transitions,
      steps,
      delivery: null,
      error: `order_invalid:${validation.problems.join(',')}`,
      errorReasons: validation.problems,
    };
  }

  const paymentId = validation.paymentId;
  const currentStatus = String(order.status || '');

  // ── Garde-fous d'état ────────────────────────────────────────────────
  if (isRefunded(currentStatus)) {
    steps.push({ step: 'skip', reason: 'refunded' });
    return { outcome: 'skipped', paymentId, transitions, steps, delivery: null, error: null, reason: 'refunded' };
  }
  if (currentStatus === 'pending_payment') {
    steps.push({ step: 'skip', reason: 'payment_not_confirmed' });
    return {
      outcome: 'ignored',
      paymentId,
      transitions,
      steps,
      delivery: null,
      error: null,
      reason: 'payment_not_confirmed',
    };
  }

  // ── Idempotence de livraison : une trace 'sent' arrête tout ──────────
  const deliveries = await loadDeliveries(deps, paymentId);
  if (!deliveries.ok) {
    return {
      outcome: 'failed',
      paymentId,
      transitions,
      steps,
      delivery: null,
      error: `deliveries_read_failed:${deliveries.error}`,
    };
  }
  const sentTrace = deliveries.rows.find((r) => String(r.status || '') === 'sent');
  if (sentTrace) {
    steps.push({ step: 'skip', reason: 'already_delivered', trace_id: sentTrace.id ?? null });
    if (currentStatus !== 'delivered') {
      const upd = await updateOrder(deps, paymentId, {
        status: 'delivered',
        delivered_at: sentTrace.created_at || at,
        updated_at: at,
        error: null,
      });
      if (upd.ok) {
        transitions.push({ from: currentStatus, to: 'delivered', at });
        steps.push({ step: 'status', to: 'delivered' });
      }
    }
    return {
      outcome: 'skipped',
      paymentId,
      transitions,
      steps,
      delivery: { status: 'sent', already: true, id: sentTrace.id ?? null },
      error: null,
      reason: 'already_delivered',
    };
  }

  const pendingTrace = deliveries.rows.find((r) => String(r.status || '') === 'pending');
  let reusedPending = false;
  if (pendingTrace) {
    const createdAt = new Date(pendingTrace.created_at || 0).getTime();
    const age = Date.now() - (Number.isFinite(createdAt) ? createdAt : 0);
    if (age > PENDING_TRACE_MAX_AGE_MS) {
      // Envoi peut-être parti, hors fenêtre d'idempotence : on ne rejoue pas.
      const upd = await updateOrder(deps, paymentId, {
        status: 'manual_review',
        error: `delivery_ambiguous:${pendingTrace.id ?? 'unknown'}`,
        updated_at: at,
      });
      if (upd.ok) transitions.push({ from: currentStatus, to: 'manual_review', at });
      steps.push({ step: 'manual_review', reason: 'delivery_ambiguous' });
      return {
        outcome: 'manual_review',
        paymentId,
        transitions,
        steps,
        delivery: { status: 'pending', ambiguous: true, id: pendingTrace.id ?? null },
        error: 'delivery_ambiguous',
      };
    }
    reusedPending = true;
    steps.push({ step: 'reuse_pending_trace', id: pendingTrace.id ?? null });
  }

  // ── 1. Production ─────────────────────────────────────────────────────
  if (currentStatus !== 'processing' && currentStatus !== 'ready') {
    if (!canTransition(currentStatus, 'processing')) {
      return {
        outcome: 'failed',
        paymentId,
        transitions,
        steps,
        delivery: null,
        error: `transition_interdite:${currentStatus}->processing`,
      };
    }
    const upd = await updateOrder(deps, paymentId, { status: 'processing', updated_at: at, error: null });
    if (!upd.ok) {
      return {
        outcome: 'failed',
        paymentId,
        transitions,
        steps,
        delivery: null,
        error: `status_update_failed:${upd.error}`,
      };
    }
    transitions.push({ from: currentStatus, to: 'processing', at });
    steps.push({ step: 'status', to: 'processing' });
  }

  // ── 2. Donnée satellite ───────────────────────────────────────────────
  const snapshotResult = await deps.loadSnapshot({ order, at });
  if (!snapshotResult || !snapshotResult.ok) {
    const reason = (snapshotResult && snapshotResult.error) || 'snapshot_unavailable';
    const upd = await updateOrder(deps, paymentId, {
      status: 'manual_review',
      error: `data:${reason}`,
      updated_at: at,
    });
    if (upd.ok) transitions.push({ from: 'processing', to: 'manual_review', at });
    steps.push({ step: 'manual_review', reason: `data:${reason}` });
    return {
      outcome: 'manual_review',
      paymentId,
      transitions,
      steps,
      delivery: null,
      error: `data:${reason}`,
      snapshot: snapshotResult?.snapshot || null,
    };
  }
  const snapshot = snapshotResult.snapshot;
  steps.push({ step: 'snapshot', observedAt: snapshot.observedAt, ageMinutes: snapshot.dataAgeMinutes });

  // ── 3. Document PDF ───────────────────────────────────────────────────
  const pdf = await deps.buildPdf({ order, snapshot, at });
  if (!pdf || !pdf.ok) {
    const reason = (pdf && pdf.error) || 'pdf_failed';
    const upd = await updateOrder(deps, paymentId, {
      status: 'manual_review',
      error: `pdf:${reason}`,
      updated_at: at,
    });
    if (upd.ok) transitions.push({ from: 'processing', to: 'manual_review', at });
    steps.push({ step: 'manual_review', reason: `pdf:${reason}` });
    return {
      outcome: 'manual_review',
      paymentId,
      transitions,
      steps,
      delivery: null,
      error: `pdf:${reason}`,
      snapshot,
    };
  }
  steps.push({ step: 'pdf', path: pdf.path, sha256: pdf.sha256 });

  // ── 4. Document prêt ──────────────────────────────────────────────────
  if (currentStatus !== 'ready') {
    const upd = await updateOrder(deps, paymentId, {
      status: 'ready',
      ready_at: at,
      document_path: pdf.path,
      document_sha256: pdf.sha256,
      observation_ts: snapshot.observedAt || null,
      observation_source: snapshot.source || null,
      data_age_minutes: snapshot.dataAgeMinutes ?? null,
      updated_at: at,
      error: null,
    });
    if (!upd.ok) {
      return {
        outcome: 'failed',
        paymentId,
        transitions,
        steps,
        delivery: null,
        error: `status_update_failed:${upd.error}`,
        snapshot,
      };
    }
    transitions.push({ from: 'processing', to: 'ready', at });
    steps.push({ step: 'status', to: 'ready' });
  } else {
    const upd = await updateOrder(deps, paymentId, {
      document_path: pdf.path,
      document_sha256: pdf.sha256,
      observation_ts: snapshot.observedAt || null,
      observation_source: snapshot.source || null,
      data_age_minutes: snapshot.dataAgeMinutes ?? null,
      updated_at: at,
      error: null,
    });
    if (!upd.ok) {
      return {
        outcome: 'failed',
        paymentId,
        transitions,
        steps,
        delivery: null,
        error: `status_update_failed:${upd.error}`,
        snapshot,
      };
    }
    steps.push({ step: 'status', to: 'ready', unchanged: true });
  }

  // ── 5. Trace de livraison (pending) ───────────────────────────────────
  if (!reusedPending) {
    const trace = await deps.supabase.insert(
      'diagnostic_deliveries',
      {
        order_id: order.order_id ?? null,
        payment_id: paymentId,
        channel: DELIVERY_CHANNEL,
        recipient: order.client_email,
        subject: `Votre Diagnostic Sargasses Express — ${order.sector || ''}`.trim(),
        document_path: pdf.path,
        document_sha256: pdf.sha256,
        status: 'pending',
        metadata: { observation_ts: snapshot.observedAt || null, generated_at: at },
      },
      {},
    );
    if (!trace || !trace.ok) {
      const upd = await updateOrder(deps, paymentId, {
        status: 'manual_review',
        error: `trace_write_failed:${(trace && trace.error) || 'unknown'}`,
        updated_at: at,
      });
      if (upd.ok) transitions.push({ from: 'ready', to: 'manual_review', at });
      steps.push({ step: 'manual_review', reason: 'trace_write_failed' });
      return {
        outcome: 'manual_review',
        paymentId,
        transitions,
        steps,
        delivery: null,
        error: `trace_write_failed:${(trace && trace.error) || 'unknown'}`,
        snapshot,
      };
    }
    steps.push({ step: 'trace', status: 'pending' });
  }

  // ── 6. Envoi ──────────────────────────────────────────────────────────
  const idemKey = deliveryIdempotencyKey(paymentId, pdf.sha256);
  const mail = await deps.sendEmail({
    to: order.client_email,
    subject: `Votre Diagnostic Sargasses Express — ${order.sector || ''}`.trim(),
    html: pdf.html,
    text: pdf.text,
    attachmentPath: pdf.path,
    attachmentName: pdf.filename,
    idempotencyKey: idemKey,
  });

  if (!mail || !mail.ok) {
    const reason = (mail && mail.error) || 'email_failed';
    if (pendingTrace) {
      await deps.supabase.update(
        'diagnostic_deliveries',
        { status: 'failed', error: reason },
        { filter: `?id=eq.${pendingTrace.id}` },
      );
    } else {
      await deps.supabase.update(
        'diagnostic_deliveries',
        { status: 'failed', error: reason },
        { filter: `?payment_id=eq.${encodeURIComponent(paymentId)}&channel=eq.${DELIVERY_CHANNEL}&status=eq.pending` },
      );
    }
    const upd = await updateOrder(deps, paymentId, {
      status: 'manual_review',
      error: `email:${reason}`,
      updated_at: at,
    });
    if (upd.ok) transitions.push({ from: 'ready', to: 'manual_review', at });
    steps.push({ step: 'manual_review', reason: `email:${reason}` });
    return {
      outcome: 'manual_review',
      paymentId,
      transitions,
      steps,
      delivery: { status: 'failed', error: reason },
      error: `email:${reason}`,
      snapshot,
    };
  }

  if (mail.dryRun) {
    steps.push({ step: 'email', dryRun: true });
    return {
      outcome: 'dry_run',
      paymentId,
      transitions,
      steps,
      delivery: { status: 'pending', dryRun: true },
      error: null,
      snapshot,
      document: { path: pdf.path, sha256: pdf.sha256 },
    };
  }

  // ── 7. Livré ──────────────────────────────────────────────────────────
  const traceUpd = await deps.supabase.update(
    'diagnostic_deliveries',
    { status: 'sent', error: null, provider: mail.provider || 'resend' },
    { filter: `?payment_id=eq.${encodeURIComponent(paymentId)}&channel=eq.${DELIVERY_CHANNEL}&status=eq.pending` },
  );
  if (!traceUpd || !traceUpd.ok) {
    const upd = await updateOrder(deps, paymentId, {
      status: 'manual_review',
      error: `trace_update_failed:${(traceUpd && traceUpd.error) || 'unknown'}`,
      updated_at: at,
    });
    if (upd.ok) transitions.push({ from: 'ready', to: 'manual_review', at });
    steps.push({ step: 'manual_review', reason: 'trace_update_failed' });
    return {
      outcome: 'manual_review',
      paymentId,
      transitions,
      steps,
      delivery: { status: 'sent', traceError: true },
      error: `trace_update_failed:${(traceUpd && traceUpd.error) || 'unknown'}`,
      snapshot,
    };
  }

  const finalUpd = await updateOrder(deps, paymentId, {
    status: 'delivered',
    delivered_at: at,
    updated_at: at,
    error: null,
  });
  if (!finalUpd.ok) {
    return {
      outcome: 'failed',
      paymentId,
      transitions,
      steps,
      delivery: { status: 'sent' },
      error: `status_update_failed:${finalUpd.error}`,
      snapshot,
    };
  }
  transitions.push({ from: 'ready', to: 'delivered', at });
  steps.push({ step: 'status', to: 'delivered' });
  log(`[diagnostic] livré ${paymentId}`);

  return {
    outcome: 'delivered',
    paymentId,
    transitions,
    steps,
    delivery: { status: 'sent', id: mail.id || null },
    error: null,
    snapshot,
    document: { path: pdf.path, sha256: pdf.sha256 },
  };
}
