/**
 * B2B + Mollie API Worker — Cloudflare Worker
 * Remplace les 7 endpoints PHP B2B + mollie-webhook.php + mollie.php.
 * Parle directement à Supabase REST + Mollie API — zéro PHP, zéro Render.
 *
 * Secrets: SUPABASE_SERVICE_KEY, MOLLIE_API_KEY, MOLLIE_WEBHOOK_SECRET
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', ...CORS };

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}
function err(msg, status = 400) { return json({ error: msg }, status); }

// ─── Supabase REST helper ───────────────────────────────────────────
async function sb(table, method, body = null, query = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}${query}`;
  const headers = {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };
  if (['GET', 'POST', 'PATCH'].includes(method)) headers.Prefer = 'return=representation';

  const opts = { method, headers, body: body ? JSON.stringify(body) : undefined };
  const res = await fetch(url, opts);
  if (res.status === 204) return [];
  const text = await res.text();
  if (!text) return [];
  const data = JSON.parse(text);
  if (res.status >= 400) throw new Error(`Supabase ${res.status}: ${text}`);
  return data;
}

async function logEvent(type, prospectId = null, actor = 'system', metadata = {}) {
  try { await sb('b2b_events', 'POST', { prospect_id: prospectId, type, actor, metadata }); } catch (_) {}
}

// ─── Route table ────────────────────────────────────────────────────
const ROUTES = {
  'b2b-prospects': handleProspects,
  'b2b-contacts': handleContacts,
  'b2b-scores': handleScores,
  'b2b-concierge': handleConcierge,
  'b2b-forecast-delivery': handleForecast,
  'b2b-events': handleEvents,
  'b2b-create-checkout': handleCheckout,
};

export default {
  async fetch(request, env, ctx) {
    globalThis.SUPABASE_URL = env.SUPABASE_URL;
    globalThis.SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_KEY;
    globalThis.MOLLIE_API_KEY = env.MOLLIE_API_KEY;
    globalThis.MOLLIE_WEBHOOK_SECRET = env.MOLLIE_WEBHOOK_SECRET;

    const url = new URL(request.url);
    const method = request.method;

    if (method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    const path = url.pathname;

    // ── Mollie routes ──────────────────────────────────────────────
    if (path.includes('mollie-webhook')) return handleMollieWebhook(request);
    if (path.includes('mollie.php') && method === 'POST') return handleMollieCheckout(request);

    // ── B2B routes ─────────────────────────────────────────────────
    const match = path.match(/\/api\/(b2b-[\w-]+?)(?:\.php)?$/);
    if (!match) return err('Not found', 404);

    const route = match[1];
    const handler = ROUTES[route];
    if (!handler) return err('Unknown endpoint', 404);

    try {
      const params = Object.fromEntries(url.searchParams);
      let body = null;
      if (['POST', 'PATCH'].includes(method)) {
        const raw = await request.text();
        if (raw) body = JSON.parse(raw);
      }
      return await handler(method, params, body);
    } catch (e) {
      return err(e.message, 500);
    }
  },
};

// ─── b2b-prospects ──────────────────────────────────────────────────
async function handleProspects(method, params, body) {
  switch (method) {
    case 'POST': {
      if (!body?.name) return err('name is required');
      const rows = await sb('b2b_prospects', 'POST', {
        name: body.name, beach: body.beach, island: body.island,
        phone: body.phone, email: body.email, grade: body.grade || 'A',
      });
      const p = rows[0];
      await logEvent('PROSPECT_CREATED', p.id, 'system', { name: p.name, beach: p.beach, island: p.island });
      return json(p);
    }
    case 'GET': {
      if (params.id) {
        const rows = await sb('b2b_prospects', 'GET', null, `?id=eq.${params.id}&select=*`);
        return rows[0] ? json(rows[0]) : err('Not found', 404);
      }
      let q = '?select=*&order=created_at.desc';
      if (params.status) q += `&status=eq.${params.status}`;
      return json(await sb('b2b_prospects', 'GET', null, q));
    }
    case 'PATCH': {
      if (!params.id) return err('id is required');
      const rows = await sb('b2b_prospects', 'PATCH', body, `?id=eq.${params.id}&select=*`);
      return rows[0] ? json(rows[0]) : err('Not found', 404);
    }
    default: return err('Method not allowed', 405);
  }
}

// ─── b2b-contacts ───────────────────────────────────────────────────
async function handleContacts(method, params, body) {
  switch (method) {
    case 'POST': {
      if (!body?.prospect_id) return err('prospect_id is required');
      const rows = await sb('b2b_contacts', 'POST', {
        prospect_id: body.prospect_id, channel: body.channel || 'chat',
        summary: body.summary, raw_transcript: body.raw_transcript,
      });
      await logEvent('CONTACTED', body.prospect_id, body.actor || 'system', {
        channel: body.channel || 'chat', summary: body.summary,
      });
      return json(rows[0]);
    }
    case 'GET': {
      if (!params.prospect_id) return err('prospect_id is required');
      return json(await sb('b2b_contacts', 'GET', null,
        `?prospect_id=eq.${params.prospect_id}&select=*&order=created_at.desc`));
    }
    default: return err('Method not allowed', 405);
  }
}

// ─── b2b-scores ─────────────────────────────────────────────────────
async function handleScores(method, params, body) {
  switch (method) {
    case 'POST': {
      if (!body?.prospect_id) return err('prospect_id is required');
      const p = +body.problem_score || 0, f = +body.frequency_score || 0;
      const c = +body.cost_score || 0, w = +body.willingness_score || 0;
      const rows = await sb('b2b_scores', 'POST', {
        prospect_id: body.prospect_id, problem_score: p, frequency_score: f,
        cost_score: c, willingness_score: w, total_score: p + f + c + w,
      });
      await logEvent('SCORE_SET', body.prospect_id, 'founder', { total: p + f + c + w, p, f, c, w });
      return json(rows[0]);
    }
    case 'GET': {
      if (!params.prospect_id) return err('prospect_id is required');
      const rows = await sb('b2b_scores', 'GET', null,
        `?prospect_id=eq.${params.prospect_id}&select=*&order=computed_at.desc&limit=1`);
      return json(rows[0] || null);
    }
    default: return err('Method not allowed', 405);
  }
}

// ─── b2b-concierge ──────────────────────────────────────────────────
async function handleConcierge(method, params, body) {
  switch (method) {
    case 'POST': {
      if (!body?.prospect_id) return err('prospect_id is required');
      const existing = await sb('b2b_concierge', 'GET', null,
        `?prospect_id=eq.${body.prospect_id}&status=eq.active&select=*&limit=1`);
      if (existing[0]) return json({ error: 'Active concierge already exists', concierge: existing[0] }, 409);
      const today = new Date().toISOString().slice(0, 10);
      const end = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
      const rows = await sb('b2b_concierge', 'POST', {
        prospect_id: body.prospect_id, start_date: today, end_date: end,
        status: 'active', current_day: 0,
      });
      const c = rows[0];
      await logEvent('CONCIERGE_ACCEPTED', body.prospect_id, 'founder', { start_date: today, end_date: end });
      await sb('b2b_prospects', 'PATCH', { status: 'concierge' }, `?id=eq.${body.prospect_id}&select=*`);
      return json(c);
    }
    case 'PATCH': {
      if (!params.id) return err('id is required');
      const action = body?.action;
      if (action === 'advance_day') {
        const day = +body.day || 0;
        const rows = await sb('b2b_concierge', 'PATCH', { current_day: day }, `?id=eq.${params.id}&select=*`);
        if (rows[0]) await logEvent(`DAY_${day}_SENT`, rows[0].prospect_id, 'system', { day });
        return json(rows[0]);
      }
      if (action === 'payment_requested') {
        const rows = await sb('b2b_concierge', 'PATCH', { payment_requested: true }, `?id=eq.${params.id}&select=*`);
        if (rows[0]) await logEvent('PAYMENT_REQUESTED', rows[0].prospect_id, 'founder');
        return json(rows[0]);
      }
      if (action === 'payment_confirmed') {
        const rows = await sb('b2b_concierge', 'PATCH', { payment_confirmed: true, status: 'completed' }, `?id=eq.${params.id}&select=*`);
        if (rows[0]) {
          await logEvent('PAYMENT_CONFIRMED', rows[0].prospect_id, 'webhook');
          await sb('b2b_prospects', 'PATCH', { status: 'paid' }, `?id=eq.${rows[0].prospect_id}&select=*`);
        }
        return json(rows[0]);
      }
      return err('Unknown action');
    }
    case 'GET': {
      if (!params.prospect_id) return err('prospect_id is required');
      const rows = await sb('b2b_concierge', 'GET', null,
        `?prospect_id=eq.${params.prospect_id}&status=eq.active&select=*&limit=1`);
      return json(rows[0] || null);
    }
    default: return err('Method not allowed', 405);
  }
}

// ─── b2b-forecast-delivery ──────────────────────────────────────────
async function handleForecast(method, params, body) {
  switch (method) {
    case 'POST': {
      if (!body?.concierge_id || !body?.prospect_id) return err('concierge_id and prospect_id are required');
      const rows = await sb('b2b_forecast_deliveries', 'POST', {
        concierge_id: body.concierge_id, prospect_id: body.prospect_id,
        beach: body.beach, forecast_date: body.forecast_date || new Date().toISOString().slice(0, 10),
        day_number: +body.day_number || 1, risk_level: body.risk_level,
        confidence: +body.confidence || 0, explanation: body.explanation,
        recommended_action: body.recommended_action, channel: body.channel || 'email',
        status: 'draft',
      });
      const d = rows[0];
      await logEvent('FORECAST_PREPARED', body.prospect_id, 'system', {
        day: d.day_number, delivery_id: d.id, risk_level: d.risk_level,
      });
      return json(d);
    }
    case 'PATCH': {
      if (!params.id) return err('id is required');
      if ((body?.action || 'sent') === 'sent') {
        const now = new Date().toISOString();
        const rows = await sb('b2b_forecast_deliveries', 'PATCH',
          { status: 'sent', sent_at: now }, `?id=eq.${params.id}&select=*`);
        if (rows[0]) await logEvent(`DAY_${rows[0].day_number}_SENT`, rows[0].prospect_id, 'system', {
          day: rows[0].day_number, delivery_id: params.id,
        });
        return json(rows[0]);
      }
      return err('Unknown action');
    }
    case 'GET': {
      if (!params.concierge_id) return err('concierge_id is required');
      return json(await sb('b2b_forecast_deliveries', 'GET', null,
        `?concierge_id=eq.${params.concierge_id}&select=*&order=day_number.asc`));
    }
    default: return err('Method not allowed', 405);
  }
}

// ─── b2b-events ─────────────────────────────────────────────────────
async function handleEvents(method, params, _body) {
  if (method !== 'GET') return err('GET only', 405);
  if (!params.prospect_id) return err('prospect_id is required');
  return json(await sb('b2b_events', 'GET', null,
    `?prospect_id=eq.${params.prospect_id}&select=*&order=created_at.asc`));
}

// ─── b2b-create-checkout (Mollie API direct) ────────────────────────
async function handleCheckout(method, _params, body) {
  if (method !== 'POST') return err('POST only', 405);
  if (!body?.prospect_id || !body?.concierge_id || !body?.email) {
    return err('prospect_id, concierge_id, and email are required');
  }

  const mollieKey = MOLLIE_API_KEY;
  if (!mollieKey) return err('Mollie API key not configured', 500);

  // 1. Find or create Mollie customer
  let customerId = null;
  const searchRes = await fetch(`https://api.mollie.com/v2/customers?limit=250`, {
    headers: { Authorization: `Bearer ${mollieKey}`, Accept: 'application/hal+json' },
  });
  if (searchRes.ok) {
    const customers = await searchRes.json();
    const found = customers._embedded?.customers?.find(c => c.email === body.email);
    if (found) customerId = found.id;
  }
  if (!customerId) {
    const createRes = await fetch('https://api.mollie.com/v2/customers', {
      method: 'POST',
      headers: { Authorization: `Bearer ${mollieKey}`, 'Content-Type': 'application/json', Accept: 'application/hal+json' },
      body: JSON.stringify({ email: body.email, name: body.name || '', metadata: { source: 'b2b_concierge_checkout' } }),
    });
    if (!createRes.ok) return err('Failed to create Mollie customer', 500);
    const c = await createRes.json();
    customerId = c.id;
  }

  // 2. Create subscription (brief_monthly = 29€/mois)
  const webhookUrl = 'https://sargasses-martinique.com/api/mollie-webhook.php';
  const subRes = await fetch(`https://api.mollie.com/v2/customers/${customerId}/subscriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${mollieKey}`, 'Content-Type': 'application/json', Accept: 'application/hal+json' },
    body: JSON.stringify({
      amount: { value: '29.00', currency: 'EUR' },
      description: 'Concierge B2B — Brief Plage Mensuel',
      webhookUrl,
      interval: '1 month',
      metadata: { source: 'b2b_concierge', prospect_id: body.prospect_id, concierge_id: body.concierge_id, plan: 'brief_monthly' },
    }),
  });
  if (!subRes.ok) {
    const e = await subRes.text();
    return err(`Mollie subscription failed: ${e}`, 500);
  }
  const sub = await subRes.json();
  const checkoutUrl = sub._links?.checkout?.href || null;

  // 3. Record payment in Supabase
  const payment = await sb('b2b_payments', 'POST', {
    prospect_id: body.prospect_id, concierge_id: body.concierge_id,
    amount: 29.00, status: 'pending', mollie_payment_id: sub.id,
  });

  await logEvent('CHECKOUT_CREATED', body.prospect_id, 'system', {
    subscription_id: sub.id, customer_id: customerId, checkout_url: checkoutUrl,
  });

  return json({ checkoutUrl, customerId, subscriptionId: sub.id, payment_id: payment[0]?.id });
}

// ═══════════════════════════════════════════════════════════════════════
// MOLLIE WEBHOOK — replaces mollie-webhook.php
// ═══════════════════════════════════════════════════════════════════════

async function handleMollieWebhook(request) {
  const raw = await request.text();
  const signature = request.headers.get('X-Mollie-Signature') || '';

  if (!MOLLIE_WEBHOOK_SECRET) return err('webhook_unavailable', 503);

  // HMAC-SHA256 verification
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(MOLLIE_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw));
  const expected = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
  if (expected !== signature) return err('invalid_signature', 403);

  const data = JSON.parse(raw);
  const { id, type, event } = data;
  if (!id || !type) return err('id + type requis');

  try {
    if (type === 'payment') return await molliePaymentEvent(id, event);
    if (type === 'subscription') return await mollieSubscriptionEvent(id, event);
    return json({ received: true, type });
  } catch (e) {
    return err('webhook_processing_error', 500);
  }
}

async function molliePaymentEvent(id, event) {
  const payment = await mollieGet(`v2/payments/${id}`);
  const status = payment.status;
  const metadata = payment.metadata || {};

  if (event === 'payment.failed' || status === 'failed') {
    const pass = metadata.pass;
    if (pass && ['p30', 'trip7', 'season'].includes(pass)) {
      try { await sb('payment_grants', 'PATCH', { status: 'revoked' }, `?mollie_payment_id=eq.${id}&select=*`); } catch (_) {}
    }
    return json({ received: true, type: 'payment', status, event });
  }

  if (status === 'paid') {
    const source = metadata.source || 'unknown';
    const pass = metadata.pass;

    if (source === 'b2b_annual') {
      await grantB2BToken(metadata, 'pro_monthly', id, 365);
    }
    if (pass && ['p30', 'trip7', 'season'].includes(pass)) {
      const days = pass === 'trip7' ? 7 : pass === 'p30' ? 30 : 210;
      await sb('payment_grants', 'POST', {
        mollie_payment_id: id, type: 'b2c_pass', plan: pass, email: metadata.email,
        expires_at: new Date(Date.now() + days * 86400000).toISOString(),
        granted_at: new Date().toISOString(),
      });
    }
  }

  return json({ received: true, type: 'payment', status });
}

async function mollieSubscriptionEvent(id, event) {
  const sub = await mollieGet(`v2/subscriptions/${id}`);
  const status = sub.status;
  const metadata = sub.metadata || {};
  const planKey = metadata.plan || '';

  if (['subscription.created', 'subscription.updated', 'subscription.paid'].includes(event)) {
    if (['pro_monthly', 'brief_monthly'].includes(planKey) && ['active', 'pending'].includes(status)) {
      await grantB2BToken(metadata, planKey, id);
    }
  }

  if (['subscription.created', 'subscription.paid'].includes(event)) {
    if (metadata.concierge_id && metadata.prospect_id) {
      await sb('b2b_concierge', 'PATCH', { payment_confirmed: true, status: 'completed' }, `?id=eq.${metadata.concierge_id}&select=*`);
      await sb('b2b_prospects', 'PATCH', { status: 'paid' }, `?id=eq.${metadata.prospect_id}&select=*`);
      await logEvent('PAYMENT_CONFIRMED', metadata.prospect_id, 'webhook', { subscription_id: id, plan: planKey, event });
    }
  }

  if (['subscription.canceled', 'subscription.expired'].includes(event)) {
    try { await sb('payment_grants', 'PATCH', { status: 'revoked' }, `?subscription_id=eq.${id}&type=eq.b2b_pro&select=*`); } catch (_) {}
  }

  return json({ received: true, type: 'subscription', status, event });
}

async function grantB2BToken(metadata, planKey, subscriptionId, durationDays = 30) {
  try {
    const existing = await sb('payment_grants', 'GET', null, `?subscription_id=eq.${subscriptionId}&type=eq.b2b_pro&status=eq.active&limit=1`);
    if (existing.length > 0) return;
  } catch (_) {}
  await sb('payment_grants', 'POST', {
    subscription_id: subscriptionId, type: 'b2b_pro', plan: planKey,
    customer_id: metadata.customer_id || '',
    expires_at: new Date(Date.now() + durationDays * 86400000).toISOString(),
    granted_at: new Date().toISOString(), status: 'active',
  });
}

// ═══════════════════════════════════════════════════════════════════════
// MOLLIE CHECKOUT — replaces mollie.php (create_payment action only)
// ═══════════════════════════════════════════════════════════════════════

async function handleMollieCheckout(request) {
  const data = await request.json();
  const { action } = data;

  if (action === 'create_payment') {
    const { pass, email, cents, cur, source, description, method: payMethod, redirectUrl } = data;
    if (!pass || !cents) return err('pass and cents required');

    const res = await fetch('https://api.mollie.com/v2/payments', {
      method: 'POST',
      headers: { Authorization: `Bearer ${MOLLIE_API_KEY}`, 'Content-Type': 'application/json', Accept: 'application/hal+json' },
      body: JSON.stringify({
        amount: { value: (cents / 100).toFixed(2), currency: (cur || 'EUR').toUpperCase() },
        description: description || `Sargasses Pass ${pass}`,
        method: payMethod || null,
        metadata: { source: source || 'unknown', pass, email },
        webhookUrl: 'https://sargasses-martinique.com/api/mollie-webhook.php',
        redirectUrl: redirectUrl || 'https://sargasses-martinique.com/',
      }),
    });
    if (!res.ok) return err(`Mollie error: ${await res.text()}`, 500);
    const payment = await res.json();
    return json({ checkoutUrl: payment._links?.checkout?.href, paymentId: payment.id });
  }

  return err('Unknown action');
}

async function mollieGet(path) {
  const res = await fetch(`https://api.mollie.com/${path}`, {
    headers: { Authorization: `Bearer ${MOLLIE_API_KEY}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Mollie GET ${path}: ${res.status}`);
  return res.json();
}
