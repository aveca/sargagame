/**
 * Mollie Webhook Worker — Cloudflare Worker
 * Remplace mollie-webhook.php. Vérifie la signature HMAC, traite les events
 * payment/subscription, met à jour Supabase (B2B concierge + payment_grants).
 *
 * Secrets requis :
 *   MOLLIE_API_KEY        → wrangler secret put MOLLIE_API_KEY
 *   MOLLIE_WEBHOOK_SECRET → wrangler secret put MOLLIE_WEBHOOK_SECRET
 *   SUPABASE_SERVICE_KEY  → wrangler secret put SUPABASE_SERVICE_KEY
 */

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Mollie-Signature' };
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS } }); }
function err(msg, status = 400) { return json({ error: msg }, status); }

// ─── Supabase REST ──────────────────────────────────────────────────
async function sb(table, method, body = null, query = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}${query}`;
  const headers = { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' };
  if (['GET', 'POST', 'PATCH'].includes(method)) headers.Prefer = 'return=representation';
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 204) return [];
  const text = await res.text();
  if (!text) return [];
  const data = JSON.parse(text);
  if (res.status >= 400) throw new Error(`Supabase ${res.status}: ${text}`);
  return data;
}

async function sbLogEvent(type, prospectId = null, actor = 'system', metadata = {}) {
  try { await sb('b2b_events', 'POST', { prospect_id: prospectId, type, actor, metadata }); } catch (_) {}
}

// ─── Mollie API ─────────────────────────────────────────────────────
async function mollieGet(path) {
  const res = await fetch(`https://api.mollie.com/${path}`, {
    headers: { Authorization: `Bearer ${MOLLIE_API_KEY}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Mollie GET ${path}: ${res.status}`);
  return res.json();
}

// ─── HMAC-SHA256 verification ───────────────────────────────────────
async function verifySignature(body, signature, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const expected = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
  return expected === signature;
}

// ─── Main handler ───────────────────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    globalThis.SUPABASE_URL = env.SUPABASE_URL;
    globalThis.SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_KEY;
    globalThis.MOLLIE_API_KEY = env.MOLLIE_API_KEY;
    globalThis.MOLLIE_WEBHOOK_SECRET = env.MOLLIE_WEBHOOK_SECRET;

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    const url = new URL(request.url);
    // Route: /api/mollie-webhook.php or /api/mollie.php?action=webhook
    const isWebhook = url.pathname.includes('mollie-webhook') || (url.pathname.includes('mollie.php') && url.searchParams.get('action') === 'webhook');
    const isCheckout = url.pathname.includes('mollie.php') && request.method === 'POST';

    if (isWebhook) return handleWebhook(request);
    if (isCheckout) return handleCheckout(request);

    return err('Not found', 404);
  },
};

// ─── Webhook handler ────────────────────────────────────────────────
async function handleWebhook(request) {
  const raw = await request.text();
  const signature = request.headers.get('X-Mollie-Signature') || '';

  // Verify HMAC signature
  if (!MOLLIE_WEBHOOK_SECRET) return err('webhook_unavailable', 503);
  if (!await verifySignature(raw, signature, MOLLIE_WEBHOOK_SECRET)) {
    return err('invalid_signature', 403);
  }

  const data = JSON.parse(raw);
  const { id, type, event } = data;
  if (!id || !type) return err('id + type requis');

  try {
    if (type === 'payment') return await handlePaymentEvent(id, event);
    if (type === 'subscription') return await handleSubscriptionEvent(id, event);
    // customer, mandate → just acknowledge
    return json({ received: true, type });
  } catch (e) {
    return err('webhook_processing_error', 500);
  }
}

// ─── Payment events ─────────────────────────────────────────────────
async function handlePaymentEvent(id, event) {
  const payment = await mollieGet(`v2/payments/${id}`);
  const status = payment.status;
  const metadata = payment.metadata || {};

  if (event === 'payment.failed' || status === 'failed') {
    const pass = metadata.pass;
    if (pass && ['p30', 'trip7', 'season'].includes(pass)) {
      // Revoke B2C pass in Supabase
      try {
        await sb('payment_grants', 'PATCH', { status: 'revoked' },
          `?mollie_payment_id=eq.${id}&select=*`);
      } catch (_) {}
    }
    return json({ received: true, type: 'payment', status, event });
  }

  if (status === 'paid') {
    const source = metadata.source || 'unknown';
    const pass = metadata.pass;
    const email = metadata.email;

    // B2B annual → grant token
    if (source === 'b2b_annual') {
      await grantB2BToken(metadata, 'pro_monthly', id, 365);
    }
    // B2C pass → grant in Supabase
    if (pass && ['p30', 'trip7', 'season'].includes(pass)) {
      const days = pass === 'trip7' ? 7 : pass === 'p30' ? 30 : 210;
      await sb('payment_grants', 'POST', {
        mollie_payment_id: id, type: 'b2c_pass', plan: pass, email,
        expires_at: new Date(Date.now() + days * 86400000).toISOString(),
        granted_at: new Date().toISOString(),
      });
    }
  }

  return json({ received: true, type: 'payment', status });
}

// ─── Subscription events ────────────────────────────────────────────
async function handleSubscriptionEvent(id, event) {
  const sub = await mollieGet(`v2/subscriptions/${id}`);
  const status = sub.status;
  const metadata = sub.metadata || {};
  const planKey = metadata.plan || '';
  const customerId = sub.customerId || '';

  // Grant token on created/paid/updated
  if (['subscription.created', 'subscription.updated', 'subscription.paid'].includes(event)) {
    if (['pro_monthly', 'brief_monthly'].includes(planKey) && ['active', 'pending'].includes(status)) {
      await grantB2BToken(metadata, planKey, id);
    }
  }

  // B2B Concierge: first payment → mark confirmed
  if (['subscription.created', 'subscription.paid'].includes(event)) {
    if (metadata.concierge_id && metadata.prospect_id) {
      await sb('b2b_concierge', 'PATCH', { payment_confirmed: true, status: 'completed' },
        `?id=eq.${metadata.concierge_id}&select=*`);
      await sb('b2b_prospects', 'PATCH', { status: 'paid' },
        `?id=eq.${metadata.prospect_id}&select=*`);
      await sbLogEvent('PAYMENT_CONFIRMED', metadata.prospect_id, 'webhook', {
        subscription_id: id, plan: planKey, event,
      });
    }
  }

  // Revoke on cancellation/expiration
  if (['subscription.canceled', 'subscription.expired'].includes(event)) {
    try {
      await sb('payment_grants', 'PATCH', { status: 'revoked' },
        `?subscription_id=eq.${id}&type=eq.b2b_pro&select=*`);
    } catch (_) {}
  }

  return json({ received: true, type: 'subscription', status, event });
}

// ─── Grant B2B token ────────────────────────────────────────────────
async function grantB2BToken(metadata, planKey, subscriptionId, durationDays = 30) {
  // Check if already granted (idempotent)
  try {
    const existing = await sb('payment_grants', 'GET', null,
      `?subscription_id=eq.${subscriptionId}&type=eq.b2b_pro&status=eq.active&limit=1`);
    if (existing.length > 0) return; // already granted
  } catch (_) {}

  const expiresAt = new Date(Date.now() + durationDays * 86400000).toISOString();
  await sb('payment_grants', 'POST', {
    subscription_id: subscriptionId, type: 'b2b_pro', plan: planKey,
    customer_id: metadata.customer_id || '',
    expires_at: expiresAt, granted_at: new Date().toISOString(), status: 'active',
  });
}

// ─── Checkout handler (mollie.php replacement) ──────────────────────
async function handleCheckout(request) {
  const data = await request.json();
  const { action } = data;

  if (action === 'create_payment') {
    // One-off payment (B2C pass)
    const { pass, email, cents, cur, source, description, method } = data;
    if (!pass || !cents) return err('pass and cents required');

    const amount = { value: (cents / 100).toFixed(2), currency: (cur || 'EUR').toUpperCase() };

    const paymentRes = await fetch('https://api.mollie.com/v2/payments', {
      method: 'POST',
      headers: { Authorization: `Bearer ${MOLLIE_API_KEY}`, 'Content-Type': 'application/json', Accept: 'application/hal+json' },
      body: JSON.stringify({
        amount, description: description || `Sargasses Pass ${pass}`,
        method: method || null, metadata: { source: source || 'unknown', pass, email },
        webhookUrl: 'https://sargasses-martinique.com/api/mollie-webhook.php',
        redirectUrl: data.redirectUrl || 'https://sargasses-martinique.com/',
      }),
    });
    if (!paymentRes.ok) return err(`Mollie error: ${await paymentRes.text()}`, 500);
    const payment = await paymentRes.json();
    return json({ checkoutUrl: payment._links?.checkout?.href, paymentId: payment.id });
  }

  return err('Unknown action');
}
