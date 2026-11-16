#!/usr/bin/env node
/**
 * create-checkout.mjs — Création du checkout Mollie 49,00 EUR « Diagnostic
 * Sargasses Express » + enregistrement de la commande en `pending_payment`.
 *
 * SÉCURITÉ (par défaut : RIEN n'est créé)
 *   - sans `--execute`            → simulation pure, aucun appel réseau
 *   - `--mode live`               → exige en plus `--confirm-live`
 *   - le mode déclaré doit        → correspondre au préfixe de la clé utilisée
 *     correspondre à la clé          (test_/live_) : impossible de « payer en
 *                                    test » avec une clé LIVE
 *   - en mode test                → l'adresse doit être une adresse de test
 *                                    (jamais l'adresse d'un client réel)
 *   - si l'enregistrement de la commande échoue → le paiement Mollie est
 *     ANNULÉ (pas d'encaissement sans commande livrable)
 *
 * METADADATA (indispensable à la livraison)
 *   offer_kind / product = diagnostic_express → le Worker reconnaît l'offre
 *   email, establishment, sector, island, client_name → la commande est
 *   rattachée au bon client et au bon secteur
 *   webhookUrl → /api/mollie-webhook.php (route live du Worker sg-payments)
 */

import { createSupabaseClient } from './lib/supabase.mjs';
import { resolveSector } from './lib/sectors.mjs';

const MOLLIE_API = 'https://api.mollie.com/v2';
const PRODUCT_AMOUNT = '49.00';
const PRODUCT_CURRENCY = 'EUR';
const PRODUCT_KEY = 'diagnostic_express';
const DEFAULT_WEBHOOK_URL = 'https://sargasses-martinique.com/api/mollie-webhook.php';
const DEFAULT_RETURN_URL = 'https://sargasses-martinique.com/?diagnostic_paid=1';
const TEST_EMAIL_ALLOWLIST = ['example.test', 'example.com', 'example.org', 'test.test', 'sargagame.test'];

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function maskEmail(email) {
  const s = String(email || '');
  if (!s.includes('@')) return '(invalide)';
  const [a, b] = s.split('@');
  return `${a.slice(0, 1)}***@${b}`;
}

function isTestEmail(email) {
  const domain = String(email || '').split('@')[1] || '';
  return TEST_EMAIL_ALLOWLIST.includes(domain.toLowerCase());
}

function readEnv(...names) {
  for (const n of names) {
    const v = process.env[n];
    if (v && String(v).trim()) return String(v).trim();
  }
  return '';
}

async function mollieRequest(method, endpoint, { apiKey, body }) {
  const res = await fetch(`${MOLLIE_API}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data, text };
}

export async function createDiagnosticCheckout({
  apiKey,
  profileId,
  supabase,
  email,
  establishment,
  sector,
  sectorLabel,
  clientName = '',
  island = 'Martinique',
  redirectUrl = DEFAULT_RETURN_URL,
  webhookUrl = DEFAULT_WEBHOOK_URL,
  mode = 'test',
  execute = false,
  force = false,
  fetchImpl = fetch,
} = {}) {
  const steps = [];
  const problems = [];

  const key = String(apiKey || '');
  if (!key) problems.push('mollie_key_missing');
  const keyMode = key.startsWith('live_') ? 'live' : key.startsWith('test_') ? 'test' : 'unknown';
  if (keyMode === 'unknown') problems.push('mollie_key_mode_unknown');
  if (keyMode !== 'unknown' && keyMode !== mode) {
    problems.push(`mode_mismatch:cle=${keyMode},demande=${mode}`);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || ''))) problems.push('invalid_email');
  if (!String(establishment || '').trim()) problems.push('missing_establishment');
  if (!String(sector || '').trim()) problems.push('missing_sector');
  if (mode === 'test' && !isTestEmail(email)) {
    problems.push('test_mode_requires_test_email');
  }
  if (mode === 'live' && isTestEmail(email)) {
    problems.push('live_mode_refuses_test_email');
  }

  if (problems.length) {
    return { ok: false, steps, problems, error: problems.join(',') };
  }

  const metadata = {
    offer_kind: PRODUCT_KEY,
    product: PRODUCT_KEY,
    email: String(email).trim(),
    establishment: String(establishment).trim(),
    sector: String(sector).trim(),
    sector_label: String(sectorLabel || sector).trim(),
    island: String(island || 'Martinique').trim(),
    client_name: String(clientName || '').trim(),
  };

  const payload = {
    amount: { value: PRODUCT_AMOUNT, currency: PRODUCT_CURRENCY },
    description: `Diagnostic Sargasses Express — ${metadata.establishment}`,
    redirectUrl: String(redirectUrl),
    webhookUrl: String(webhookUrl),
    metadata,
    locale: 'fr_FR',
    sequenceType: 'oneoff',
    ...(profileId ? { profileId: String(profileId) } : {}),
  };

  if (!execute) {
    steps.push({ step: 'dry_run', payload });
    return {
      ok: true,
      dryRun: true,
      steps,
      problems: [],
      payload,
      checkoutUrl: null,
      paymentId: null,
      error: null,
    };
  }

  // Garde-fou : un encaissement ne doit pas être orphelin d'une commande.
  if (supabase && supabase.configured && !force) {
    const existing = await supabase.select('diagnostic_orders', {
      filter: `&client_email=eq.${encodeURIComponent(metadata.email)}&status=in.(pending_payment,paid,processing,ready)`,
      columns: 'order_id,payment_id,status,establishment,created_at',
      limit: 5,
      order: 'created_at.desc',
    });
    if (existing.ok && (existing.rows || []).length) {
      steps.push({ step: 'aborted', reason: 'open_order_exists', rows: existing.rows });
      return {
        ok: false,
        steps,
        problems: ['open_order_exists'],
        error: 'open_order_exists',
      };
    }
  }

  steps.push({ step: 'create_payment' });
  const created = await mollieRequest('POST', '/payments', { apiKey: key, body: payload });
  if (!created.ok) {
    return {
      ok: false,
      steps,
      problems: ['mollie_create_failed'],
      error: `mollie_http_${created.status}:${created.text.slice(0, 160)}`,
    };
  }
  const payment = created.data || {};
  const paymentId = String(payment.id || '');
  const checkoutUrl = payment?._links?.checkout?.href || null;
  steps.push({ step: 'payment_created', paymentId, mode: payment.mode });

  if (!paymentId) {
    return { ok: false, steps, problems: ['mollie_missing_payment_id'], error: 'mollie_missing_payment_id' };
  }

  // Enregistrement de la commande AVANT toute livraison possible.
  if (!supabase || !supabase.configured) {
    // Pas de base → on annule le paiement (aucun encaissement sans commande).
    await mollieRequest('DELETE', `/payments/${encodeURIComponent(paymentId)}`, { apiKey: key });
    steps.push({ step: 'payment_cancelled', reason: 'supabase_not_configured' });
    return {
      ok: false,
      steps,
      problems: ['supabase_not_configured'],
      error: 'supabase_not_configured',
      paymentId,
    };
  }

  const orderRow = {
    payment_id: paymentId,
    product: PRODUCT_KEY,
    status: 'pending_payment',
    client_email: metadata.email,
    client_name: metadata.client_name || null,
    contact_name: metadata.client_name || null,
    establishment: metadata.establishment,
    sector: metadata.sector,
    island: metadata.island,
    amount: PRODUCT_AMOUNT,
    currency: PRODUCT_CURRENCY,
    mollie_mode: String(payment.mode || mode),
    mollie_checkout_url: checkoutUrl,
    metadata,
  };

  const inserted = await supabase.insert('diagnostic_orders', orderRow, {});
  if (!inserted.ok) {
    // Annulation du paiement : on ne laisse jamais un encaissement sans commande.
    const cancelled = await mollieRequest('DELETE', `/payments/${encodeURIComponent(paymentId)}`, { apiKey: key });
    steps.push({
      step: 'payment_cancelled',
      reason: 'order_write_failed',
      cancelled: cancelled.ok,
    });
    return {
      ok: false,
      steps,
      problems: ['order_write_failed'],
      error: `order_write_failed:${inserted.error}`,
      paymentId,
      checkoutUrl,
      cancelled: cancelled.ok,
    };
  }

  const row = (inserted.rows || [])[0] || {};
  steps.push({ step: 'order_created', order_id: row.order_id ?? null });

  return {
    ok: true,
    dryRun: false,
    steps,
    problems: [],
    paymentId,
    checkoutUrl,
    orderId: row.order_id ?? null,
    status: 'pending_payment',
    error: null,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = readEnv('SG_MOLLIE_KEY', 'MOLLIE_API_KEY');
  const profileId = readEnv('SG_MOLLIE_PROFILE_ID', 'MOLLIE_PROFILE_ID');
  const supabaseUrl = readEnv('SG_SUPABASE_URL', 'SUPABASE_URL');
  const supabaseKey = readEnv('SG_SUPABASE_SERVICE_KEY', 'SUPABASE_SERVICE_KEY');
  const supabase = createSupabaseClient({ url: supabaseUrl, key: supabaseKey });

  const mode = String(args.mode || 'test').toLowerCase();
  const execute = Boolean(args.execute);

  if (mode === 'live' && !args['confirm-live']) {
    console.error('REFUS  le mode LIVE exige --confirm-live (autorisation explicite du fondateur).');
    process.exit(2);
  }
  if (mode !== 'live' && mode !== 'test') {
    console.error(`REFUS  mode inconnu : ${mode}`);
    process.exit(2);
  }

  const email = String(args.email || '');
  const establishment = String(args.establishment || '');
  const sectorLabel = String(args.sector || '');

  const resolved = resolveSector(sectorLabel);
  const sector = resolved.ok ? resolved.sector.levelId : sectorLabel.toLowerCase().trim();

  const result = await createDiagnosticCheckout({
    apiKey,
    profileId,
    supabase,
    email,
    establishment,
    sector,
    sectorLabel,
    clientName: String(args['client-name'] || ''),
    island: String(args.island || 'Martinique'),
    redirectUrl: String(args['return-url'] || DEFAULT_RETURN_URL),
    webhookUrl: String(args['webhook-url'] || DEFAULT_WEBHOOK_URL),
    mode,
    execute,
    force: Boolean(args.force),
  });

  if (!result.ok) {
    console.error(`FAIL  ${result.error}`);
    if (result.problems?.length) console.error(`      ${result.problems.join(', ')}`);
    if (result.cancelled) {
      console.error('      Le paiement Mollie a été ANNULÉ (aucun encaissement sans commande).');
    }
    process.exit(3);
  }

  if (result.dryRun) {
    console.log('SIMULATION (aucun paiement créé, aucune commande écrite)');
    console.log(`  mode           : ${mode}`);
    console.log(`  client         : ${maskEmail(email)}`);
    console.log(`  etablissement   : ${establishment}`);
    console.log(`  secteur        : ${sectorLabel} → ${sector}`);
    console.log(`  montant        : ${PRODUCT_AMOUNT} ${PRODUCT_CURRENCY} (ponctuel, non récurrent)`);
    console.log(`  webhook        : ${result.payload.webhookUrl}`);
    console.log(`  retour client  : ${result.payload.redirectUrl}`);
    console.log(`  metadata       : ${JSON.stringify(result.payload.metadata)}`);
    console.log('');
    console.log('  Pour créer réellement : ajouter --execute' + (mode === 'live' ? ' --confirm-live' : ''));
    return;
  }

  console.log('OK    checkout créé');
  console.log(`  payment_id    : ${result.paymentId}`);
  console.log(`  commande      : order_id=${result.orderId ?? '?'} (statut ${result.status})`);
  console.log(`  lien client   : ${result.checkoutUrl}`);
  console.log('');
  console.log('  À FAIRE : transmettre le lien au client, puis vérifier la commande');
  console.log('  (statut pending_payment → paid) après paiement confirmé par Mollie.');
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  main().catch((e) => {
    console.error(`ERREUR ${String(e?.message || e).slice(0, 200)}`);
    process.exit(1);
  });
}
