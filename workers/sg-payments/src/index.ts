/**
 * sg-payments — All-in-one Worker pour Sargagame
 * Remplace : mollie.php, mollie-webhook.php, mollie-lib.php, widget-token.php,
 *            track-click.php, track-open.php, copernicus/forecast.php,
 *            b2b-*.php
 *
 * Routes:
 *   POST /api/mollie                 → Mollie checkout
 *   POST /api/mollie-webhook         → Mollie webhook
 *   GET  /api/widget-token.php       → Widget token verify
 *   GET  /api/track-click.php        → Email click redirect
 *   GET  /api/track-open.php         → Email open pixel
 *   POST /collect.php                → Collecte analytics first-party (ex PHP, cf. DEC-2026-08-27 P2-008b)
 *   POST /api/copernicus/forecast.php → Premium forecast
 *   *    /api/b2b-prospects.php      → B2B prospects CRUD
 *   *    /api/b2b-concierge.php      → B2B concierge
 *   POST /api/b2b-trial.php          → B2B trial
 *   POST /api/b2b-meeting.php        → B2B meeting
 *   POST /api/b2b-create-checkout.php → B2B checkout
 */

const ALLOWED_ORIGINS = [
  'https://sargasses-martinique.com',
  'https://sargasses-guadeloupe.com',
  'https://sargassumpuntacana.com',
  'https://sargassummiami.com',
  'https://sargassumcancun.com',
];

const ALLOWED_HOSTS = [
  'sargasses-martinique.com',
  'sargasses-guadeloupe.com',
  'sargassumpuntacana.com',
  'sargassummiami.com',
  'sargassumcancun.com',
];

const PASS_PRICES: Record<string, Record<string, number | null>> = {
  p30:    { EUR: 14.99, USD: 11.99 },
  trip7:  { EUR: 4.99,  USD: null },
  season: { EUR: 19.99, USD: null },
};

const B2B_PLANS: Record<string, { amount: number; currency: string; description: string; interval: string }> = {
  pro_monthly: { amount: 79.00, currency: 'EUR', description: 'Sargasses Pro — mensuel (79 €/mois)', interval: '1 month' },
  brief_monthly: { amount: 29.00, currency: 'EUR', description: 'Sargasses Brief — mensuel (29 €/mois)', interval: '1 month' },
};

const PASS_DURATIONS: Record<string, number> = { p30: 30, trip7: 7, season: 210 };

const CLICK_REDIRECT_HOSTS = ['sargasses-martinique.com','sargasses-guadeloupe.com','sargassumpuntacana.com','sargassummiami.com','sargassumcancun.com'];

// Collecte first-party (/collect.php) — 5 domaines historiques (parité collect.php PHP)
// + sargazotulum.com : 6ᵉ domaine live du produit, son trafic était droppé 403 par
// l'ancienne allowlist PHP. Restaurer la collecte sur les 6 (cf. DEC-2026-08-27 P2-008b).
const COLLECT_HOSTS = [
  'sargasses-martinique.com',
  'sargasses-guadeloupe.com',
  'sargassumpuntacana.com',
  'sargassummiami.com',
  'sargassumcancun.com',
  'sargazotulum.com',
];

const PIXEL_GIF = Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'), c => c.charCodeAt(0));

interface Env {
  MOLLIE_API_KEY: string;
  MOLLIE_PROFILE_ID: string;
  MOLLIE_WEBHOOK_SECRET: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  RESEND_API_KEY: string;
  TRANSIENTS: KVNamespace;
}

// ─── Mollie HTTP Client ──────────────────────────────────────────────

async function mollieReq(method: string, path: string, apiKey: string, body?: object): Promise<any> {
  const resp = await fetch(`https://api.mollie.com/${path}`, {
    method,
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await resp.json() as any;
  if (!resp.ok) throw new Error(`Mollie: ${data?.detail || data?.title || resp.status}`);
  return data;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function cors(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') || '';
  const h: Record<string, string> = { 'Content-Type': 'application/json; charset=utf-8' };
  if (ALLOWED_ORIGINS.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

async function rateLimit(env: Env, key: string, limit: number, windowSec = 60): Promise<boolean> {
  const bucket = `${key}:${Math.floor(Date.now() / 1000 / windowSec)}`;
  const cur = parseInt(await env.TRANSIENTS.get(bucket) || '0');
  if (cur >= limit) return false;
  await env.TRANSIENTS.put(bucket, String(cur + 1), { expirationTtl: windowSec * 2 });
  return true;
}

async function verifyHmac(body: string, sig: string, secret: string): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const s = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  const expected = Array.from(new Uint8Array(s)).map(b => b.toString(16).padStart(2, '0')).join('');
  if (expected.length !== sig.length) return false;
  let r = 0;
  for (let i = 0; i < expected.length; i++) r |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return r === 0;
}

async function supa(env: Env, table: string, method: string, body?: any, query = ''): Promise<any> {
  if (!env.SUPABASE_SERVICE_KEY) return method === 'GET' ? [] : null;
  const url = `${env.SUPABASE_URL}/rest/v1/${table}${query}`;
  const opts: RequestInit = { method, headers: {
    'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json', 'Prefer': method === 'GET' ? 'return=representation' : 'return=minimal',
  }};
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  if (!r.ok) return method === 'GET' ? [] : null;
  if (r.status === 204) return [];
  return await r.json() as any;
}

async function widgetSign(env: Env, payload: Record<string, any>): Promise<string> {
  const data = btoa(JSON.stringify(payload));
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(env.MOLLIE_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return `${data}.${Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')}`;
}

async function widgetVerify(env: Env, k: string): Promise<Record<string, any> | null> {
  const parts = k.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(env.MOLLIE_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const s = await crypto.subtle.sign('HMAC', key, enc.encode(parts[0]));
  const expected = Array.from(new Uint8Array(s)).map(b => b.toString(16).padStart(2, '0')).join('');
  if (expected !== parts[1]) return null;
  const payload = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')));
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

async function resendEmail(env: Env, from: string, to: string[], subject: string, html: string): Promise<void> {
  if (!env.RESEND_API_KEY) return;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html }),
  });
}

async function hashString(s: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── B2B Helpers ─────────────────────────────────────────────────────

async function b2bProspects(env: Env, request: Request): Promise<Response> {
  const h = cors(request);
  const url = new URL(request.url);
  const method = request.method;

  if (method === 'POST') {
    const input = await request.json() as any;
    if (!input.name) return new Response(JSON.stringify({ error: 'name required' }), { status: 400, headers: h });
    const rows = await supa(env, 'b2b_prospects', 'POST', { name: input.name, beach: input.beach, island: input.island, phone: input.phone, email: input.email, grade: input.grade || 'A' });
    const p = rows?.[0];
    if (p) await supa(env, 'b2b_events', 'POST', { prospect_id: p.id, type: 'PROSPECT_CREATED', actor: 'system', metadata: { name: p.name } });
    return new Response(JSON.stringify(p || { error: 'create_failed' }), { status: p ? 200 : 500, headers: h });
  }
  if (method === 'GET') {
    const id = url.searchParams.get('id');
    if (id) {
      const rows = await supa(env, 'b2b_prospects', 'GET', null, `?id=eq.${id}&select=*`);
      return new Response(JSON.stringify(rows?.[0] || { error: 'not_found' }), { status: rows?.[0] ? 200 : 404, headers: h });
    }
    const status = url.searchParams.get('status');
    let q = '?select=*&order=created_at.desc';
    if (status) q += `&status=eq.${status}`;
    const rows = await supa(env, 'b2b_prospects', 'GET', null, q);
    return new Response(JSON.stringify(rows), { headers: h });
  }
  if (method === 'PATCH') {
    const id = url.searchParams.get('id');
    if (!id) return new Response(JSON.stringify({ error: 'id required' }), { status: 400, headers: h });
    const input = await request.json() as any;
    const rows = await supa(env, 'b2b_prospects', 'PATCH', input, `?id=eq.${id}&select=*`);
    return new Response(JSON.stringify(rows?.[0] || { error: 'not_found' }), { status: rows?.[0] ? 200 : 404, headers: h });
  }
  return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: h });
}

async function b2bConcierge(env: Env, request: Request): Promise<Response> {
  const h = cors(request);
  const url = new URL(request.url);
  const method = request.method;

  if (method === 'POST') {
    const input = await request.json() as any;
    if (!input.prospect_id) return new Response(JSON.stringify({ error: 'prospect_id required' }), { status: 400, headers: h });
    const existing = await supa(env, 'b2b_concierge', 'GET', null, `?prospect_id=eq.${input.prospect_id}&status=eq.active&select=*&limit=1`);
    if (existing?.[0]) return new Response(JSON.stringify({ error: 'active_exists', concierge: existing[0] }), { status: 409, headers: h });
    const start = new Date().toISOString().slice(0, 10);
    const end = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const rows = await supa(env, 'b2b_concierge', 'POST', { prospect_id: input.prospect_id, start_date: start, end_date: end, status: 'active', current_day: 0 });
    return new Response(JSON.stringify(rows?.[0] || { error: 'failed' }), { status: rows?.[0] ? 200 : 500, headers: h });
  }
  if (method === 'GET') {
    const pid = url.searchParams.get('prospect_id');
    if (!pid) return new Response(JSON.stringify({ error: 'prospect_id required' }), { status: 400, headers: h });
    const rows = await supa(env, 'b2b_concierge', 'GET', null, `?prospect_id=eq.${pid}&status=eq.active&select=*&limit=1`);
    return new Response(JSON.stringify(rows?.[0] || null), { headers: h });
  }
  if (method === 'PATCH') {
    const id = url.searchParams.get('id');
    if (!id) return new Response(JSON.stringify({ error: 'id required' }), { status: 400, headers: h });
    const input = await request.json() as any;
    const action = input.action;
    if (action === 'advance_day') {
      const rows = await supa(env, 'b2b_concierge', 'PATCH', { current_day: input.day }, `?id=eq.${id}&select=*`);
      return new Response(JSON.stringify(rows?.[0]), { headers: h });
    }
    if (action === 'payment_requested') {
      const rows = await supa(env, 'b2b_concierge', 'PATCH', { payment_requested: true }, `?id=eq.${id}&select=*`);
      return new Response(JSON.stringify(rows?.[0]), { headers: h });
    }
    if (action === 'payment_confirmed') {
      const rows = await supa(env, 'b2b_concierge', 'PATCH', { payment_confirmed: true, status: 'completed' }, `?id=eq.${id}&select=*`);
      return new Response(JSON.stringify(rows?.[0]), { headers: h });
    }
  }
  return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: h });
}

// ─── Route Handler ───────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // ─── Mollie API ──────────────────────────────────────
    if (path === '/api/mollie') {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request) });
      if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: cors(request) });
      return handleMollie(request, env);
    }

    // ─── Mollie Webhook ──────────────────────────────────
    if (path === '/api/mollie-webhook') {
      if (request.method === 'GET') return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
      return handleWebhook(request, env);
    }

    // ─── Widget Token ────────────────────────────────────
    if (path === '/api/widget-token.php') {
      const k = url.searchParams.get('k') || '';
      const payload = await widgetVerify(env, k);
      return new Response(JSON.stringify(payload ? { pro: true, host: payload.h } : { pro: false }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }

    // ─── Collecte first-party (ex public/collect.php PHP → Worker, DEC-2026-08-27 P2-008b)
    // La route intercepte GET comme POST AVANT les assets Pages : le source PHP
    // n'est plus jamais servi ; le fichier public/collect.php a été supprimé.
    if (path === '/collect.php') {
      return handleCollect(request, env, ctx);
    }

    // ─── Track Click ─────────────────────────────────────
    if (path === '/api/track-click.php') {
      const id = (url.searchParams.get('id') || '').replace(/[^a-zA-Z0-9_-]/g, '');
      let redirectUrl = url.searchParams.get('url') || '/';
      redirectUrl = decodeURIComponent(redirectUrl).replace(/[\r\n]/g, '');
      if (!/^https?:\/\//i.test(redirectUrl)) redirectUrl = '/';
      const parsed = new URL(redirectUrl, 'https://dummy');
      const host = parsed.hostname.replace(/^www\./, '');
      if (!CLICK_REDIRECT_HOSTS.some(h => host === h || host.endsWith('.' + h))) redirectUrl = '/';
      // Fire-and-forget analytics
      ctx.waitUntil(supa(env, 'analytics_events', 'POST', { event: 'email_clicked', params: { email_id: id, url: redirectUrl } }));
      return Response.redirect(redirectUrl, 302);
    }

    // ─── Track Open ──────────────────────────────────────
    if (path === '/api/track-open.php') {
      const id = (url.searchParams.get('id') || '').replace(/[^a-zA-Z0-9_-]/g, '');
      if (id) ctx.waitUntil(supa(env, 'analytics_events', 'POST', { event: 'email_opened', params: { email_id: id } }));
      return new Response(PIXEL_GIF, {
        headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' },
      });
    }

    // ─── Forecast (premium) ──────────────────────────────
    if (path === '/api/copernicus/forecast.php') {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request) });
      const k = url.searchParams.get('k') || '';
      let authorized = false;
      if (k) {
        const payload = await widgetVerify(env, k);
        if (payload) authorized = true;
      }
      if (!authorized && request.method === 'POST') {
        const body = await request.json() as any;
        const email = (body.email || '').trim();
        if (email) {
          const rows = await supa(env, 'payment_grants', 'GET', null, `?email=eq.${email}&expires_at=gt.now()&select=type&limit=1`);
          if (rows?.length) authorized = true;
        }
      }
      if (!authorized) return new Response(JSON.stringify({ ok: false }), { status: 403, headers: { 'Content-Type': 'application/json' } });
      // Return public forecast data (the private file isn't available on Pages)
      const sargData = await fetch(`${url.origin}/api/copernicus/sargassum.json`).then(r => r.json()).catch(() => null);
      if (!sargData) return new Response(JSON.stringify({ ok: false, reason: 'no_data' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify({ ok: true, updatedAt: sargData.updatedAt, weekly: sargData.weekly }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }

    // ─── B2B Prospects ───────────────────────────────────
    if (path === '/api/b2b-prospects.php') return b2bProspects(env, request);

    // ─── B2B Concierge ───────────────────────────────────
    if (path === '/api/b2b-concierge.php') return b2bConcierge(env, request);

    // ─── B2B Trial ───────────────────────────────────────
    if (path === '/api/b2b-trial.php') {
      if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: cors(request) });
      if (!(await rateLimit(env, 'b2b_trial', 6))) return new Response(JSON.stringify({ error: 'rate_limited' }), { status: 429, headers: cors(request) });
      const input = await request.json() as any;
      const email = (input.email || '').trim();
      if (!email || !email.includes('@')) return new Response(JSON.stringify({ error: 'invalid_email' }), { status: 400, headers: cors(request) });
      const name = (input.name || '').replace(/[<>"]/g, '').slice(0, 60);
      const beach = (input.beach || '').replace(/[^A-Za-z0-9-]/g, '').toLowerCase().slice(0, 60);
      const island = (input.island || 'mq').replace(/[^A-Za-z]/g, '').toLowerCase();
      const ISLAND_MAP: Record<string, string> = { mq: 'MQ', gp: 'GP', florida: 'florida', puntacana: 'puntacana', rivieramaya: 'rivieramaya' };
      const islandNorm = ISLAND_MAP[island] || 'MQ';
      const token = await widgetSign(env, { exp: Math.floor(Date.now() / 1000) + 30 * 86400, type: 'b2b_pro' });
      // Best-effort: email + apps script + analytics
      const domainMap: Record<string, string> = { MQ: 'sargasses-martinique.com', GP: 'sargasses-guadeloupe.com', florida: 'sargassummiami.com', puntacana: 'sargassumpuntacana.com', rivieramaya: 'sargassumcancun.com' };
      const domain = domainMap[islandNorm] || 'sargasses-martinique.com';
      const lang = ['florida', 'puntacana', 'rivieramaya'].includes(islandNorm) ? 'en' : 'fr';
      const accessUrl = `https://${domain}/?k=${token}${beach ? `&beach=${beach}` : ''}${name ? `&name=${encodeURIComponent(name)}` : ''}`;
      const title = lang === 'en' ? 'Your PRO trial is active' : 'Ton essai PRO est actif';
      const bodyText = lang === 'en' ? `Hi ${name} Your 30-day PRO trial is ready.` : `Bonjour ${name} Ton essai PRO de 30 jours est actif.`;
      const cta = lang === 'en' ? 'Open my dashboard' : 'Ouvrir mon espace';
      const html = `<div style="font-family:system-ui;max-width:520px;margin:0 auto;padding:20px;font-size:15px;color:#1a1a1a"><h2 style="margin:0 0 12px;color:#0D1E1C">${title}</h2><p>${bodyText}</p><p><a href="${accessUrl}" style="display:inline-block;background:linear-gradient(135deg,#FFC72C,#E8A800);color:#0D1E1C;font-weight:700;padding:14px 32px;border-radius:999px;text-decoration:none;font-size:16px">${cta} &rarr;</a></p></div>`;
      ctx.waitUntil(resendEmail(env, `Sargasses Pro <alerte@${domain}>`, [email], title, html).catch(() => {}));
      ctx.waitUntil(fetch('https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'email_signup', email, source: 'b2b_trial', island: islandNorm, org: name }) }).catch(() => {}));
      ctx.waitUntil(supa(env, 'analytics_events', 'POST', { event: 'b2b_trial_started', params: { org: name, beach }, island: islandNorm }).catch(() => {}));
      return new Response(JSON.stringify({ ok: true, token, days: 30 }), { headers: cors(request) });
    }

    // ─── B2B Meeting ─────────────────────────────────────
    if (path === '/api/b2b-meeting.php') {
      if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: cors(request) });
      if (!(await rateLimit(env, 'b2b_meeting', 6))) return new Response(JSON.stringify({ error: 'rate_limited' }), { status: 429, headers: cors(request) });
      const input = await request.json() as any;
      const email = (input.email || '').trim();
      if (!email || !email.includes('@')) return new Response(JSON.stringify({ error: 'invalid_email' }), { status: 400, headers: cors(request) });
      const org = (input.org || '').replace(/[<>"]/g, '').slice(0, 80);
      const littoral = (input.littoral || '').replace(/[<>"]/g, '').slice(0, 120);
      const phone = (input.phone || '').replace(/[^0-9 +().-]/g, '').slice(0, 30);
      const island = (input.island || '').replace(/[^A-Za-z]/g, '').toUpperCase();
      const html = `<div style="font-family:system-ui;max-width:520px;margin:0 auto;padding:20px;font-size:15px;color:#1a1a1a"><h2>Nouvelle demande B2B — ${org}</h2><table style="width:100%;border-collapse:collapse"><tr><td style="padding:6px 0;font-weight:700;width:100px">Email</td><td>${email}</td></tr><tr><td style="padding:6px 0;font-weight:700">Organisation</td><td>${org}</td></tr><tr><td style="padding:6px 0;font-weight:700">Littoral</td><td>${littoral}</td></tr><tr><td style="padding:6px 0;font-weight:700">Téléphone</td><td>${phone}</td></tr><tr><td style="padding:6px 0;font-weight:700">Île</td><td>${island}</td></tr></table></div>`;
      ctx.waitUntil(resendEmail(env, 'Sargasses B2B <alerte@sargasses-martinique.com>', ['contact@sargasses-martinique.com'], `Nouvelle demande B2B — ${org}`, html).catch(() => {}));
      ctx.waitUntil(fetch('https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'email_signup', email, source: 'b2b_territoire_meeting', island: island || 'MQ', org }) }).catch(() => {}));
      return new Response(JSON.stringify({ ok: true }), { headers: cors(request) });
    }

    // ─── B2B Create Checkout ─────────────────────────────
    if (path === '/api/b2b-create-checkout.php') {
      if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: cors(request) });
      if (!(await rateLimit(env, 'b2b_checkout', 10))) return new Response(JSON.stringify({ error: 'rate_limited' }), { status: 429, headers: cors(request) });
      const input = await request.json() as any;
      if (!input.prospect_id || !input.concierge_id || !input.email) {
        return new Response(JSON.stringify({ error: 'prospect_id, concierge_id, email required' }), { status: 400, headers: cors(request) });
      }
      try {
        const apiKey = env.MOLLIE_API_KEY;
        const plan = B2B_PLANS.brief_monthly;
        // Find or create customer
        const customers = await mollieReq('GET', 'v2/customers?limit=50', apiKey);
        let cid: string | null = null;
        for (const c of customers._embedded?.customers || []) {
          if (c.email === input.email) { cid = c.id; break; }
        }
        if (!cid) {
          const nc = await mollieReq('POST', 'v2/customers', apiKey, { email: input.email, name: input.name || '', metadata: { source: 'b2b_concierge_checkout' } });
          cid = nc.id;
        }
        const host = request.headers.get('Host') || ALLOWED_HOSTS[0];
        const subscription = await mollieReq('POST', `v2/customers/${cid}/subscriptions`, apiKey, {
          amount: { value: plan.amount.toFixed(2), currency: plan.currency },
          description: plan.description,
          webhookUrl: `https://${host}/api/mollie-webhook`,
          metadata: { source: 'b2b_concierge', prospect_id: input.prospect_id, concierge_id: input.concierge_id, plan: 'brief_monthly' },
          interval: plan.interval,
        });
        const checkoutUrl = subscription._links?.checkout?.href || null;
        await supa(env, 'b2b_payments', 'POST', { prospect_id: input.prospect_id, concierge_id: input.concierge_id, amount: plan.amount, status: 'pending', mollie_payment_id: subscription.id });
        return new Response(JSON.stringify({ checkoutUrl, customerId: cid, subscriptionId: subscription.id }), { headers: cors(request) });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors(request) });
      }
    }

    // ─── B2B Contacts / Events / Scores / Forecast Delivery ───
    if (path === '/api/b2b-contacts.php' || path === '/api/b2b-events.php' || path === '/api/b2b-scores.php' || path === '/api/b2b-forecast-delivery.php') {
      const table = path.includes('contacts') ? 'b2b_contacts' : path.includes('events') ? 'b2b_events' : path.includes('scores') ? 'b2b_scores' : 'b2b_forecast_deliveries';
      const h = cors(request);
      if (request.method === 'GET') {
        const qs = url.searchParams.toString();
        const rows = await supa(env, table, 'GET', null, `?${qs}&select=*`);
        return new Response(JSON.stringify(rows), { headers: h });
      }
      if (request.method === 'POST') {
        const input = await request.json() as any;
        const rows = await supa(env, table, 'POST', input);
        return new Response(JSON.stringify(rows?.[0] || { ok: true }), { headers: h });
      }
      if (request.method === 'PATCH') {
        const id = url.searchParams.get('id');
        if (!id) return new Response(JSON.stringify({ error: 'id required' }), { status: 400, headers: h });
        const input = await request.json() as any;
        const rows = await supa(env, table, 'PATCH', input, `?id=eq.${id}&select=*`);
        return new Response(JSON.stringify(rows?.[0]), { headers: h });
      }
      return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: h });
    }

    return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  },
};

// ─── Collecte first-party (parité public/collect.php PHP — DEC-2026-08-27 P2-008b)
// Contrat : POST-only (405 sinon, source leak impossible), Origin/Referer allowlist
// (403 si étranger, toléré si absent), body JSON ≤ 64 Ko (204 drop sinon), vh =
// sha256(jourUTC|ip|ua)[:16] (anonymat quotidien, pas de PII), rate-limit 60/60s par
// vh (KV TRANSIENTS), cap global 5000 inserts/j (KV, remplace le cap disque 25 Mo/j),
// succès 204 No Content toujours silencieux — jamais 4xx sur un drop : le client
// (sendBeacon/fetch, Sargasses_PROD.jsx) stash + rejoue sur non-2xx → éviter l'amplification.
async function handleCollect(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const noSniff = { 'X-Content-Type-Options': 'nosniff' };
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: noSniff });

  const hostOk = (u: string | null): boolean | null => {
    if (!u) return null; // header absent → indéterminé (parité PHP : on tolère)
    try {
      const h = new URL(u).hostname.toLowerCase();
      return COLLECT_HOSTS.some(d => h === d || h.endsWith('.' + d));
    } catch { return false; }
  };
  let ok = hostOk(request.headers.get('Origin'));
  if (ok === null) ok = hostOk(request.headers.get('Referer'));
  if (ok === false) return new Response(null, { status: 403, headers: noSniff });

  const raw = await request.text().catch(() => '');
  if (raw.length > 65536 || raw.length < 2) return new Response(null, { status: 204, headers: noSniff });
  let data: any = null;
  try { data = JSON.parse(raw); } catch { /* drop */ }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return new Response(null, { status: 204, headers: noSniff });

  const day = new Date().toISOString().slice(0, 10);
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const ua = (request.headers.get('User-Agent') || '').slice(0, 120);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${day}|${ip}|${ua}`));
  const vh = Array.from(new Uint8Array(digest)).slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');

  if (!(await rateLimit(env, `collect:${vh}`, 60, 60))) return new Response(null, { status: 204, headers: noSniff });

  // Cap global quotidien (remplace le cap disque 25 Mo/j du PHP — pas de disque sous Pages)
  const dayKey = `collect:day:${day}`;
  const dayCount = parseInt(await env.TRANSIENTS.get(dayKey) || '0');
  if (dayCount >= 5000) return new Response(null, { status: 204, headers: noSniff });
  ctx.waitUntil(env.TRANSIENTS.put(dayKey, String(dayCount + 1), { expirationTtl: 172800 }));

  const region = typeof data.region === 'string' ? data.region.slice(0, 20) : '';
  ctx.waitUntil(supa(env, 'analytics_events', 'POST', {
    event: 'sg_session',
    params: { vh, d: data },
    island: region || (new URL(request.url).hostname),
  }));

  return new Response(null, { status: 204, headers: noSniff });
}

// ─── Mollie Handler ──────────────────────────────────────────────────

async function handleMollie(request: Request, env: Env): Promise<Response> {
  const h = cors(request);
  const body = await request.json() as any;
  const action = body.action || '';
  if (!(await rateLimit(env, `mol_${action}`, 20))) return new Response(JSON.stringify({ error: 'rate_limited' }), { status: 429, headers: h });

  try {
    const apiKey = env.MOLLIE_API_KEY;
    const profileId = env.MOLLIE_PROFILE_ID || 'pfl_t8KCk4Cm2C';
    const host = request.headers.get('Host') || ALLOWED_HOSTS[0];

    if (action === 'create_payment') {
      const { pass, email, source, description, method: payMethod, cardToken, cents, amount: amountObj, locale, metadata: userMeta, applePayPaymentToken, redirectUrl: userRedirect, referredBy, myReferralCode, lang } = body;
      let amount: { value: string; currency: string }; let amountVal: number; let currency: string;
      if (cents != null) {
        const c = parseInt(cents); if (c <= 0) throw new Error('cents invalide');
        currency = (body.cur || 'EUR').toUpperCase(); if (!['EUR', 'USD'].includes(currency)) currency = 'EUR';
        amountVal = c / 100; amount = { value: amountVal.toFixed(2), currency };
      } else if (amountObj?.value && amountObj?.currency) {
        amount = amountObj; currency = amount.currency; amountVal = parseFloat(amount.value);
      } else throw new Error('cents ou amount requis');
      if (pass && PASS_PRICES[pass]) {
        const expected = PASS_PRICES[pass][currency];
        if (expected !== null && Math.abs(amountVal - expected) >= 0.02) throw new Error('Prix invalide');
        if (expected === null && (amountVal <= 0.50 || amountVal >= 50)) throw new Error('Prix invalide');
      } else if (!pass && (amountVal <= 0 || amountVal >= 300)) throw new Error('Prix invalide');
      if (currency === 'USD' && pass && pass !== 'trip7') { const m = new Date().getMonth() + 1; if (m >= 6 && m <= 11) amount.value = (parseFloat(amount.value) * 1.15).toFixed(2); }
      const metadata: Record<string, any> = userMeta || {}; metadata.source = source || 'unknown'; metadata.pass = pass || ''; metadata.email = email || ''; metadata.lang = lang || 'fr';
      if (referredBy) metadata.referredBy = referredBy; if (myReferralCode) metadata.myReferralCode = myReferralCode;
      const kind = pass ? 'pass' : 'pro';
      const redirectUrl = userRedirect || `https://${host}/payment/good.html?kind=${kind}&email=${encodeURIComponent(email || '')}&plan=${encodeURIComponent(pass || 'annual')}`;
      if (pass && email) { const idemKey = `mol_${await hashString(email + '|' + pass)}`; const ex = await env.TRANSIENTS.get(idemKey); if (ex) throw new Error('Paiement déjà en cours.'); await env.TRANSIENTS.put(idemKey, '1', { expirationTtl: 60 }); }
      const pd: any = { amount, description: description || (pass ? `Sargasses Pass ${pass}` : 'Sargasses'), redirectUrl, webhookUrl: `https://${host}/api/mollie-webhook`, metadata, locale: locale || 'fr_FR' };
      if (applePayPaymentToken) pd.applePayPaymentToken = applePayPaymentToken; if (cardToken) pd.cardToken = cardToken; if (payMethod) pd.method = payMethod;
      const payment = await mollieReq('POST', 'v2/payments', apiKey, pd);
      return new Response(JSON.stringify({ checkoutUrl: payment.checkoutUrl, paymentId: payment.id }), { headers: h });
    }

    if (action === 'create_subscription') {
      const { plan: planKey, hosted = true, customerId, email, name, mandateId, method: payMethod, metadata: userMeta } = body;
      const plan = B2B_PLANS[planKey]; if (!plan) throw new Error(`Plan inconnu: ${planKey}`);
      let cid = customerId;
      if (!cid && email) {
        const customers = await mollieReq('GET', 'v2/customers?limit=50', apiKey);
        const existing = (customers._embedded?.customers || []).find((c: any) => c.email === email);
        if (existing) cid = existing.id;
        else { const nc = await mollieReq('POST', 'v2/customers', apiKey, { email, name: name || '', metadata: { source: 'b2b_monthly_signup' } }); cid = nc.id; }
      }
      if (!cid) throw new Error('customerId ou email requis');
      const sub = await mollieReq('POST', `v2/customers/${cid}/subscriptions`, apiKey, {
        amount: { value: plan.amount.toFixed(2), currency: plan.currency }, description: plan.description,
        webhookUrl: `https://${host}/api/mollie-webhook`, metadata: { ...(userMeta || {}), source: 'b2b_monthly', plan: planKey },
        interval: plan.interval, ...(mandateId ? { mandateId } : {}), ...(payMethod ? { method: payMethod } : {}),
      });
      const result: any = { subscriptionId: sub.id, customerId: cid, status: sub.status };
      if (hosted && sub._links?.checkout?.href) result.checkoutUrl = sub._links.checkout.href;
      return new Response(JSON.stringify(result), { headers: h });
    }

    if (action === 'payment_status') {
      const paymentId = body.paymentId; if (!paymentId) throw new Error('paymentId requis');
      const p = await mollieReq('GET', `v2/payments/${paymentId}`, apiKey);
      const status = p.status || 'unknown';
      return new Response(JSON.stringify({ paid: ['paid', 'settled'].includes(status), status, paymentId, terminal: ['canceled', 'expired', 'failed'].includes(status) }), { headers: h });
    }

    if (action === 'verify_subscription') {
      const email = (body.email || '').trim();
      if (!email || !email.includes('@')) return new Response(JSON.stringify({ error: 'Missing email' }), { status: 400, headers: h });
      const rows = await supa(env, 'payment_grants', 'GET', null, `?select=pass,expires_at,payment_id&type=eq.b2c_pass&email=eq.${email}&expires_at=gt.now()&order=expires_at.desc&limit=1`);
      if (!rows?.length) return new Response(JSON.stringify({ active: false, reason: 'no_pass_grant' }), { headers: h });
      const passEnd = new Date(rows[0].expires_at).getTime();
      if (!passEnd || passEnd <= Date.now()) return new Response(JSON.stringify({ active: false, reason: 'no_pass_grant' }), { headers: h });
      return new Response(JSON.stringify({ active: true, kind: 'pass', pass: rows[0].pass, passEnd, status: 'paid' }), { headers: h });
    }

    if (action === 'applepay_session') {
      const validationUrl = body.validationUrl; if (!validationUrl) throw new Error('validationUrl requis');
      if (!/^https:\/\/(apple|cdn-apple|guzzoni).*\.apple\.com\//i.test(validationUrl)) throw new Error("validationUrl doit provenir d'apple.com");
      const session = await mollieReq('POST', 'v2/wallets/applepay/sessions', apiKey, { validationUrl, domain: body.domain || host });
      return new Response(JSON.stringify(session), { headers: h });
    }

    return new Response(JSON.stringify({ error: 'action_inconnue' }), { status: 400, headers: h });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: 'payment_processing_error' }), { status: 500, headers: h });
  }
}

// ─── Webhook Handler ─────────────────────────────────────────────────

async function handleWebhook(request: Request, env: Env): Promise<Response> {
  const raw = await request.text();
  const secret = env.MOLLIE_WEBHOOK_SECRET;
  if (!secret) return new Response(JSON.stringify({ error: 'webhook_unavailable' }), { status: 503 });
  const sig = request.headers.get('X-Mollie-Signature') || '';
  if (!(await verifyHmac(raw, sig, secret))) return new Response(JSON.stringify({ error: 'invalid_signature' }), { status: 403 });
  const data = JSON.parse(raw);
  const { id, type, event } = data;
  if (!id || !type) return new Response(JSON.stringify({ error: 'id + type requis' }), { status: 400 });
  const markerKey = `mollie_${id.replace(/[^A-Za-z0-9_.-]/g, '_')}`;
  const existing = await env.TRANSIENTS.get(markerKey);
  if (existing) return new Response(JSON.stringify({ received: true, duplicate: true }));
  try {
    const apiKey = env.MOLLIE_API_KEY;
    if (type === 'payment') {
      const payment = await mollieReq('GET', `v2/payments/${id}`, apiKey);
      const status = payment.status || ''; const metadata = payment.metadata || {};
      if (event === 'payment.failed' || status === 'failed') {
        const pass = metadata.pass || ''; if (pass && ['p30', 'trip7', 'season'].includes(pass)) await env.TRANSIENTS.delete(`mol_b2c_pass_${id}`);
      }
      if (status === 'paid') {
        const source = metadata.source || ''; const pass = metadata.pass || ''; const email = metadata.email || '';
        if (source === 'b2b_annual') await grantB2B(env, email, 'pro_monthly', id, 365);
        else if (pass && ['p30', 'trip7', 'season'].includes(pass)) await grantB2C(env, id, pass, email, metadata);
      }
      await env.TRANSIENTS.put(markerKey, '1', { expirationTtl: 86400 });
      return new Response(JSON.stringify({ received: true, type: 'payment', status }));
    }
    if (type === 'subscription') {
      const sub = await mollieReq('GET', `v2/subscriptions/${id}`, apiKey);
      const status = sub.status || ''; const metadata = sub.metadata || {}; const planKey = metadata.plan || ''; const cid = sub.customerId || '';
      if (['subscription.created', 'subscription.updated'].includes(event) && planKey && ['pro_monthly', 'brief_monthly'].includes(planKey) && ['active', 'pending'].includes(status)) await grantB2B(env, cid, planKey, sub.id);
      if (event === 'subscription.paid' && planKey && ['pro_monthly', 'brief_monthly'].includes(planKey)) await grantB2B(env, cid, planKey, sub.id);
      if (['subscription.canceled', 'subscription.expired'].includes(event)) { await env.TRANSIENTS.delete(`mollie_grant_${sub.id}`); await supa(env, 'payment_grants', 'PATCH', { status: 'revoked' }, `?subscription_id=eq.${sub.id}&type=eq.b2b_pro`); }
      await env.TRANSIENTS.put(markerKey, '1', { expirationTtl: 86400 });
      return new Response(JSON.stringify({ received: true, type: 'subscription', status, event }));
    }
    await env.TRANSIENTS.put(markerKey, '1', { expirationTtl: 86400 });
    return new Response(JSON.stringify({ received: true, type }));
  } catch { return new Response(JSON.stringify({ error: 'webhook_processing_error' }), { status: 500 }); }
}

async function grantB2B(env: Env, customerId: string, planKey: string, subId: string, days = 30): Promise<void> {
  const k = `mollie_grant_${subId}`; if (await env.TRANSIENTS.get(k)) return;
  const exp = Math.floor(Date.now() / 1000) + days * 86400;
  const token = await widgetSign(env, { plan: planKey, customer_id: customerId, subscription_id: subId, exp, type: 'b2b_pro' });
  await env.TRANSIENTS.put(k, token, { expirationTtl: (days + 1) * 86400 });
  await supa(env, 'payment_grants', 'POST', { subscription_id: subId, type: 'b2b_pro', plan: planKey, customer_id: customerId, expires_at: new Date(exp * 1000).toISOString(), granted_at: new Date().toISOString() });
}

async function grantB2C(env: Env, paymentId: string, pass: string, email: string, meta: Record<string, any>): Promise<void> {
  const k = `mol_b2c_pass_${paymentId}`; if (await env.TRANSIENTS.get(k)) return;
  const days = PASS_DURATIONS[pass] || 30; const exp = Math.floor(Date.now() / 1000) + days * 86400;
  const sessionId = meta?.sg_session_id || null;
  await env.TRANSIENTS.put(k, JSON.stringify({ pass, email, expires_at: exp }), { expirationTtl: (days + 1) * 86400 });
  await supa(env, 'payment_grants', 'POST', { payment_id: paymentId, type: 'b2c_pass', pass, email, currency: meta.currency || 'EUR', expires_at: new Date(exp * 1000).toISOString(), granted_at: new Date().toISOString(), session_id: sessionId, metadata: meta });
}
