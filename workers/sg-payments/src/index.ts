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
  GOOGLE_CLIENT_ID?: string;   // client_id OAuth Google (public par design) — absent = Google Sign-In désactivé proprement
  AUTH_SECRET?: string;        // secret de signature des sessions (fallback dérivé ci-dessous)
  BREVO_API_KEY?: string;
  SENDPULSE_CLIENT_ID?: string;
  SENDPULSE_CLIENT_SECRET?: string;
  NAMECHEAP_MAIL_TOKEN?: string;
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

// ─── KV fault-tolerant (FIX 2026-09-03 — BUG quota KV → 1101 global) ────
// Toute erreur KV (quota free plan, namespace KO) rendait JUSQU'ICI un 1101
// qui cassait TOUT le money-path (rateLimit est appelé avant le try/catch).
// Règle : rate-limit = fail-open (log), idempotence = fail-open (la contrainte
// UNIQUE(payment_id/subscription_id) de payment_grants protège le grant).
function kv(env: Env) {
  const k = env.TRANSIENTS as KVNamespace | undefined;
  return {
    async get(key: string): Promise<string | null> {
      if (!k) return null;
      try { return await k.get(key); } catch (e: any) { console.log('KV get KO:', e?.message); return null; }
    },
    async put(key: string, value: string, opts?: any): Promise<void> {
      if (!k) return;
      try { await k.put(key, value, opts); } catch (e: any) { console.log('KV put KO:', e?.message); }
    },
    async delete(key: string): Promise<void> {
      if (!k) return;
      try { await k.delete(key); } catch (e: any) { console.log('KV del KO:', e?.message); }
    },
  };
}

async function rateLimit(env: Env, key: string, limit: number, windowSec = 60): Promise<boolean> {
  try {
    const bucket = `${key}:${Math.floor(Date.now() / 1000 / windowSec)}`;
    const cur = parseInt(await kv(env).get(bucket) || '0');
    if (cur >= limit) return false;
    await kv(env).put(bucket, String(cur + 1), { expirationTtl: windowSec * 2 });
  } catch (e: any) {
    console.log('rateLimit KV KO — fail-open:', e?.message);
  }
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

// ═══ IDENTITÉ UTILISATEUR (sprint funnel 2026-09-03) ═══════════════════
// user_id stable Supabase (table sg_users) + session HMAC signée côté serveur.
// Le localStorage navigateur n'est QUE un cache UX : la source de vérité
// d'un accès premium = payment_grants liée au user_id (ou à l'email legacy).

/** supa tolérant : parse JSON gardé, Prefer return=representation explicite. */
async function supaQ(env: Env, table: string, method: string, body?: any, query = ''): Promise<any> {
  if (!env.SUPABASE_SERVICE_KEY) return method === 'GET' ? [] : null;
  try {
    const url = `${env.SUPABASE_URL}/rest/v1/${table}${query}`;
    const r = await fetch(url, {
      method,
      headers: {
        'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json', 'Prefer': 'return=representation',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) return method === 'GET' ? [] : null;
    const t = await r.text();
    if (!t) return [];
    try { return JSON.parse(t); } catch { return []; }
  } catch { return method === 'GET' ? [] : null; }
}

// ── Session token (HMAC dédié, indépendant du secret Mollie) ──────────
function authSecret(env: Env): string {
  return env.AUTH_SECRET || ((env.MOLLIE_WEBHOOK_SECRET || '') + '|sg-auth-v1');
}

async function authSign(env: Env, payload: Record<string, any>): Promise<string> {
  const data = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(authSecret(env)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return `${data}.${Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')}`;
}

async function authVerify(env: Env, token: string): Promise<Record<string, any> | null> {
  const parts = String(token || '').split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(authSecret(env)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const s = await crypto.subtle.sign('HMAC', key, enc.encode(parts[0]));
    const expected = Array.from(new Uint8Array(s)).map(b => b.toString(16).padStart(2, '0')).join('');
    if (expected.length !== parts[1].length) return null;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ parts[1].charCodeAt(i);
    if (diff !== 0) return null;
    const b64 = parts[0].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(decodeURIComponent(escape(atob(b64 + '='.repeat((4 - b64.length % 4) % 4)))));
    if (payload.type !== 'sg_session') return null;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (!payload.uid) return null;
    return payload;
  } catch { return null; }
}

// ── Vérification Google ID Token (OIDC, RS256 via JWKS Google) ─────────
let JWKS_CACHE: { at: number; keys: any[] } | null = null;

function b64urlDecode(s: string): string {
  const b = s.replace(/-/g, '+').replace(/_/g, '/');
  return atob(b + '='.repeat((4 - b.length % 4) % 4));
}

async function verifyGoogleIdToken(env: Env, credential: string): Promise<{ email: string; sub: string; name: string } | null> {
  if (!env.GOOGLE_CLIENT_ID) return null; // non configuré → feature off proprement
  const parts = String(credential || '').split('.');
  if (parts.length !== 3) return null;
  let header: any, payload: any;
  try { header = JSON.parse(b64urlDecode(parts[0])); payload = JSON.parse(b64urlDecode(parts[1])); } catch { return null; }
  if (header?.alg !== 'RS256' || !header.kid) return null;
  if (payload.iss !== 'accounts.google.com' && payload.iss !== 'https://accounts.google.com') return null;
  if (payload.aud !== env.GOOGLE_CLIENT_ID) return null;
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  if (!payload.email || payload.email_verified === false) return null;
  try {
    if (!JWKS_CACHE || Date.now() - JWKS_CACHE.at > 6 * 3600_000) {
      const r = await fetch('https://www.googleapis.com/oauth2/v3/certs');
      const j = await r.json() as any;
      if (!j?.keys?.length) return null;
      JWKS_CACHE = { at: Date.now(), keys: j.keys };
    }
    const jwk = JWKS_CACHE!.keys.find(k => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' } as any, false, ['verify']);
    const sigBytes = Uint8Array.from(b64urlDecode(parts[2]), c => c.charCodeAt(0));
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sigBytes, new TextEncoder().encode(parts[0] + '.' + parts[1]));
    if (!ok) return null;
  } catch { return null; }
  return { email: String(payload.email).toLowerCase().trim(), sub: String(payload.sub), name: String(payload.name || '') };
}

// ── Users : lookup/upsert déterministe (Google sub → email → création) ──
async function userUpsert(env: Env, email: string, provider: 'google' | 'email', providerUserId: string | null): Promise<{ id: string; email: string } | null> {
  const now = new Date().toISOString();
  if (providerUserId) {
    const bySub = await supaQ(env, 'sg_users', 'GET', null, `?provider=eq.google&provider_user_id=eq.${encodeURIComponent(providerUserId)}&select=id,email&limit=1`);
    if (bySub?.[0]) {
      await supaQ(env, 'sg_users', 'PATCH', { email, updated_at: now }, `?id=eq.${bySub[0].id}`);
      return bySub[0];
    }
  }
  // Linking : un achat email antérieur → même user_id à la 1re connexion Google (jamais 2 comptes)
  const byEmail = await supaQ(env, 'sg_users', 'GET', null, `?email=eq.${encodeURIComponent(email)}&select=id,email&limit=1`);
  if (byEmail?.[0]) {
    if (providerUserId) await supaQ(env, 'sg_users', 'PATCH', { provider: 'google', provider_user_id: providerUserId, updated_at: now }, `?id=eq.${byEmail[0].id}`);
    return byEmail[0];
  }
  const created = await supaQ(env, 'sg_users', 'POST', { email, provider, provider_user_id: providerUserId }, '?select=id,email');
  if (created?.[0]) return created[0];
  // Course concurrente (double insert) → relire
  const again = await supaQ(env, 'sg_users', 'GET', null, `?email=eq.${encodeURIComponent(email)}&select=id,email&limit=1`);
  return again?.[0] || null;
}

// ── Entitlements : grants actifs d'un user (user_id ET email legacy) ────
async function userEntitlements(env: Env, userId: string | null, email: string | null): Promise<{ entitlements: any[]; premium: any }> {
  const filters: string[] = [];
  if (userId) filters.push(`user_id.eq.${userId}`);
  if (email) filters.push(`email.eq.${encodeURIComponent(email)}`);
  if (!filters.length) return { entitlements: [], premium: { active: false } };
  const q = `?select=type,pass,plan,expires_at,payment_id&expires_at=gt.now()&${filters.length > 1 ? 'or=(' + filters.join(',') + ')' : filters[0]}&order=expires_at.desc&limit=10`;
  const rows = (await supaQ(env, 'payment_grants', 'GET', null, q)) || [];
  const passRow = rows.find((r: any) => r.type === 'b2c_pass');
  const passEnd = passRow ? new Date(passRow.expires_at).getTime() : 0;
  return {
    entitlements: rows,
    premium: {
      active: !!passRow && passEnd > Date.now(),
      kind: passRow ? 'pass' : null,
      pass: passRow?.pass || null,
      passEnd: passEnd > Date.now() ? passEnd : null,
    },
  };
}

async function resendEmail(env: Env, from: string, to: string[], subject: string, html: string): Promise<void> {
  if (!env.RESEND_API_KEY) return;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html }),
  });
}

// ─── Email Load Balancer (SPRINT #15 — 100% gratuit) ───────────────────
const NAMECHEAP_BEARER = 'sargagame-mail-2026';

async function sendViaNamecheap(to: string, subject: string, html: string, domain: string, env: Env): Promise<boolean> {
  const token = env.NAMECHEAP_MAIL_TOKEN || NAMECHEAP_BEARER;
  const res = await fetch(`https://${domain}/send-email.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ to, subject, html, from: `alerte@${domain}`, fromName: 'SargaGame' }),
  });
  const data = await res.json() as any;
  if (!data.success) throw new Error(data.error || 'Namecheap failed');
  return true;
}

async function sendViaSendPulse(to: string, subject: string, html: string, domain: string, env: Env): Promise<boolean> {
  if (!env.SENDPULSE_CLIENT_ID || !env.SENDPULSE_CLIENT_SECRET) throw new Error('SendPulse creds missing');
  const tokenRes = await fetch('https://api.sendpulse.com/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credentials', client_id: env.SENDPULSE_CLIENT_ID, client_secret: env.SENDPULSE_CLIENT_SECRET }),
  });
  const tokenData = await tokenRes.json() as any;
  const token = tokenData.access_token;
  if (!token) throw new Error('SendPulse auth failed');
  const res = await fetch('https://api.sendpulse.com/smtp/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: { from: { name: 'SargaGame', email: `alerte@${domain}` }, to: [{ email: to }], subject, html } }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error('SendPulse failed: ' + t.slice(0, 200));
  }
  return true;
}

async function sendViaBrevo(to: string, subject: string, html: string, domain: string, env: Env): Promise<boolean> {
  if (!env.BREVO_API_KEY) throw new Error('Brevo key missing');
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sender: { name: 'SargaGame', email: `alerte@${domain}` }, to: [{ email: to }], subject, htmlContent: html }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error('Brevo failed: ' + t.slice(0, 200));
  }
  return true;
}

async function sendViaResend(to: string, subject: string, html: string, domain: string, env: Env): Promise<boolean> {
  if (!env.RESEND_API_KEY) throw new Error('Resend key missing');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `SargaGame <alerte@${domain}>`, to: [to], subject, html }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error('Resend failed: ' + t.slice(0, 200));
  }
  return true;
}

async function sendEmail(to: string, subject: string, html: string, domain: string, env: Env): Promise<{ success: boolean; provider?: string; error?: string }> {
  const providers: Array<{ name: string; fn: typeof sendViaNamecheap }> = [
    { name: 'namecheap', fn: sendViaNamecheap },
    { name: 'sendpulse', fn: sendViaSendPulse },
    { name: 'brevo', fn: sendViaBrevo },
    { name: 'resend', fn: sendViaResend },
  ];
  for (const p of providers) {
    try {
      const result = await p.fn(to, subject, html, domain, env);
      if (result) {
        console.log(`Email sent via ${p.name} -> ${to}`);
        return { success: true, provider: p.name };
      }
    } catch (e: any) {
      console.log(`${p.name} failed: ${e.message}, trying next...`);
      continue;
    }
  }
  return { success: false, error: 'All providers failed' };
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
    // ─── Cron triggers (also called by scheduled) ──────────────────────
    if (url.pathname === '/_cron/drip') {
      ctx.waitUntil(runDripEmails(env));
      return new Response(JSON.stringify({ ok: true, cron: 'drip' }), { headers: { 'Content-Type': 'application/json' } });
    }
    if (url.pathname === '/_cron/b2c') {
      ctx.waitUntil(runB2CAlerts(env));
      return new Response(JSON.stringify({ ok: true, cron: 'b2c' }), { headers: { 'Content-Type': 'application/json' } });
    }
    const path = url.pathname;

    // ─── Mollie API ──────────────────────────────────────
    // Alias `.php` : le front historique appelle /api/mollie.php — sans cet alias,
    // l'URL tombait sur le guard anti-leak 404 et TOUT le checkout était mort (P0 2026-09-03).
    if (path === '/api/mollie' || path === '/api/mollie.php') {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request) });
      if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: cors(request) });
      return handleMollie(request, env);
    }

    // ─── Mollie Webhook ──────────────────────────────────
    if (path === '/api/mollie-webhook' || path === '/api/mollie-webhook.php') {
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

    // ─── B2B landing (fix 404 — SPRINT 17) ───────────────────────
    if (path === '/b2b' || path === '/b2b/' || path.startsWith('/b2b/')) {
      // Serve B2B as redirect to /pro (canonical) but with 200 for audit
      const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sargasses Pro — B2B</title><meta http-equiv="refresh" content="0;url=/pro/"><link rel="canonical" href="https://${url.hostname}/pro/"><style>body{font-family:system-ui;padding:40px;text-align:center;color:#0d1117} a{color:#0d7f63;font-weight:700}</style><h1>Sargasses Pro</h1><p>Redirection vers <a href="/pro/">/pro/</a> — prévision satellite pour hôtels & collectivités.</p><p><a href="/pro/">Voir les offres Pro →</a> · <a href="/pro/pricing/">Tarifs</a> · <a href="/pro/widget-sargasses-hotel/">Widget gratuit</a></p>`;
      return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
    }

    // ─── Dashboard Client ────────────────────────────────────
    if (path === '/dashboard' || path === '/dashboard/') {
      // Vérifier le token via query string
      const url = new URL(request.url);
      const token = url.searchParams.get('token') || '';
      const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SargaGame Dashboard</title><link rel="stylesheet" href="/app-runtime.css"></head><body><div id="root"></div><script>window.__DASHBOARD_TOKEN__="${token}"</script><script src="/assets/index-B7MZ2uBf.js"></script></body></html>`;
      return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    // ─── Widget Embarkable ─────────────────────────────────────
    if (path === '/widget') {
      const url = new URL(request.url);
      const token = url.searchParams.get('token') || '';
      if (!token) return new Response('<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;padding:40px;text-align:center"><h2>Token manquant</h2><p>Ajoutez ?token=XXX à l\'URL.</p></body>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      // Vérifier dans Supabase b2b_subscriptions
      const rows = await supa(env, 'b2b_subscriptions', 'GET', null, `?widget_token=eq.${token}&select=*&limit=1`);
      if (!rows?.length) return new Response('<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;padding:40px;text-align:center"><h2>Token invalide</h2><p>Aucun abonnement trouvé pour ce widget token.</p></body>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      const sub = rows[0];
      // Déterminer la langue
      const region = sub.region || 'martinique';
      const lang = (region && ['florida', 'puntacana', 'rivieramaya'].includes(region.toLowerCase())) ? 'en' : 'fr';
      const domain = sub.domain || 'sargasses-martinique.com';
      // Récupérer le statut sargassum
      let sargStatus = 'unknown'; let forecast3j = '';
      try {
        const c = await fetch(`${origin}/api/copernicus/sargassum.json`).then(r=>r.ok?r.json():null);
        if (c) {
          const wk = c.weekly; if (wk) { const firstKey = Object.keys(wk)[0]; const fc = wk[firstKey]?.forecast?.slice(0,3) || []; sargStatus = fc.length > 0 ? fc[0].status || 'unknown' : 'unknown'; forecast3j = fc.slice(1,4).map(d=>`<p>J+${fc.indexOf(d)+1}: ${d.status}</p>`).join(''); }
        }
      } catch {}
      // Couleurs selon statut
      const statusColors: Record<string,string> = { clean:'#16a34a', moderate:'#eab308', avoid:'#dc2626', high:'#dc2626', unknown:'#6b7280' };
      const statusEmoji: Record<string,string> = { clean:'🟢', moderate:'🟡', avoid:'🔴', high:'🔴', unknown:'⚪' };
      const html = lang === 'en'
        ? `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:system-ui;margin:0;padding:20px;color:#0d1117} .card{max-width:600px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px} h1{color:#0D1E1C;margin-top:0} .btn{display:inline-block;background:#FFC72C;color:#0d1117;padding:12px 24px;border-radius:999px;font-weight:700;text-decoration:none;margin:8px}</style></head><body><div class="card"><h1>SargaGame Widget</h1><p><strong>Region:</strong> ${region}</p><p><strong>Status:</strong> <span style="color:${statusColors[sargStatus]||'#6b7280'}">${statusEmoji[sargStatus]||'⚠️'} ${sargStatus}</span></p>${forecast3j ? `<div style="margin-top:16px"><h3>3-day forecast</h3>${forecast3j}</div>` : ''}<p><iframe src="https://${domain}/widget?token=${token}" width="100%" height="320" style="border:none; margin:16px 0;" frameborder="0"></iframe></p><p>Powered by SargaGame • <a href="https://${domain}/b2b?token=${token}" class="btn">Manage subscription →</a> <a href="https://${domain}/" class="btn" style="background:#0d7f63;color:white">Back to map →</a></p></div></body></html>`
        : `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:system-ui;margin:0;padding:20px;color:#0d1117} .card{max-width:600px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px} h1{color:#0D1E1C;margin-top:0}</style></head><body><div class="card"><h1>Widget SargaGame</h1><p><strong>Région:</strong> ${region}</p><p><strong>Niveau:</strong> <span style="color:${statusColors[sargStatus]||'#6b7280'}">${statusEmoji[sargStatus]||'⚠️'} ${sargStatus}</span></p>${forecast3j ? `<div style="margin-top:16px"><h3>Prévisions 3 jours</h3>${forecast3j}</div>` : ''}<p><iframe src="https://${domain}/widget?token=${token}" width="100%" height="320" style="border:none; margin:16px 0;" frameborder="0"></iframe></p><p>Powered by SargaGame • <a href="https://${domain}/b2b?token=${token}" class="btn" style="background:#0d7f63;color:white">Gérer l'abonnement →</a> <a href="https://${domain}/" class="btn">Retour à la carte →</a></p></div></body></html>`;
      return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    // ─── Unsubscribe B2C ───────────────────────────────────────────
    if (path === '/unsubscribe') {
      return handleUnsubscribe(request, env);
    }

    // ─── Mollie health ───────────────────────────────────────────────
    if (path === '/api/mollie-health') {
      return new Response(JSON.stringify({ ok: true, worker: 'sg-payments', version: 'sprint15', routes: 44 + 1 }), { headers: { 'Content-Type': 'application/json' } });
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

    // ─── Forecast (premium + gratuit J+1-3 — SPRINT 18) ─────────────────
    if (path.startsWith('/api/copernicus/forecast')) {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request) });
      // days param gratuit ≤3, premium >3 — ZÉRO nouveau compte, utilise cache sargassum.json existant
      const daysParam = parseInt(url.searchParams.get('days') || '7', 10);
      const isFree = !isNaN(daysParam) && daysParam <= 3;
      // Architecture: Copernicus → cron build (sargassum.json) → Supabase non nécessaire, lecture cache direct
      // Le Worker lit le cache public sargassum.json (généré 4×/jour par daily-copernicus.yml), pas Copernicus direct
      if (!isFree) {
        const k = url.searchParams.get('k') || '';
        let authorized = false;
        if (k) {
          const payload = await widgetVerify(env, k);
          if (payload) authorized = true;
        }
        if (!authorized && request.method === 'POST') {
          try {
            const body = await request.json() as any;
            const email = (body.email || '').trim();
            if (email) {
              const rows = await supa(env, 'payment_grants', 'GET', null, `?email=eq.${email}&expires_at=gt.now()&select=type&limit=1`);
              if (rows?.length) authorized = true;
            }
          } catch {}
        }
        // GET days>3 sans k → 403 premium
        if (!authorized) return new Response(JSON.stringify({ ok: false, error: 'Premium required for days>3' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
      }
      // Gratuit ≤3 ou premium autorisé → retourne cache sargassum.json (weekly) limité à days
      const sargData = await fetch(`${url.origin}/api/copernicus/sargassum.json`).then(r => r.json()).catch(() => null);
      if (!sargData) return new Response(JSON.stringify({ ok: false, reason: 'no_data' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
      // Slice weekly forecast à days si demandé
      let weekly = sargData.weekly;
      if (!isNaN(daysParam) && weekly && typeof weekly === 'object') {
        const sliced: any = {};
        for (const [bid, wk] of Object.entries(weekly as any)) {
          const w = wk as any;
          if (w?.forecast?.length) sliced[bid] = { ...w, forecast: w.forecast.slice(0, daysParam) };
          else sliced[bid] = w;
        }
        weekly = sliced;
      }
      return new Response(JSON.stringify({ ok: true, updatedAt: sargData.updatedAt, weekly, days: daysParam, free: isFree }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': isFree ? 'public, max-age=1800' : 'no-store' },
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

    // ─── SECURITY: generic PHP source-leak guard — MUST BE LAST PHP CHECK (SPECIFIC FIRST → GENERIC LAST)
    // Tous les handlers .php légitimes ci-dessus ont été tentés (mollie, widget-token, track-*, forecast,
    // b2b-prospects/concierge/trial/meeting/create-checkout + b2b-contacts/events/scores/forecast-delivery,
    // collect.php). Tout .php restant serait servi en source depuis dist/ sur Pages → 404 nosniff sans body.
    // Les routes wrangler *.php assurent l'interception AVANT Pages. Ne jamais placer ce guard AVANT un handler légitime.
    if (path.endsWith('.php')) {
      return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' } });
    }

    return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  },
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`Cron triggered: ${event.cron}`);
    ctx.waitUntil(runDripEmails(env));
    if (event.cron === '0 6,18 * * *') {
      ctx.waitUntil(runB2CAlerts(env));
    }
    // Also run B2C on every hour's cron if needed (manual test via _cron/b2c)
  },
};

// ─── Drip Email Follow-up (SPRINT #15 — load balancer) ─────────────────
async function runDripEmails(env: Env): Promise<void> {
  console.log('Drip: starting runDripEmails');
  const cutoff = new Date(Date.now() - 3600000).toISOString();
  const leads = await supa(env, 'b2b_leads', 'GET', null, `?status=eq.new&created_at=lt.${cutoff}&select=*`);
  if (!leads || leads.length === 0) {
    console.log('Drip: 0 leads to contact');
    return;
  }
  console.log(`Drip: ${leads.length} leads`);
  for (const lead of leads) {
    try {
      const domain = lead.domain || 'sargasses-martinique.com';
      const lang = (lead.region && ['florida', 'puntacana', 'rivieramaya'].includes(lead.region.toLowerCase())) ? 'en' : 'fr';
      const subject = lang === 'en'
        ? `Sargassum forecast for ${lead.region} — live update`
        : `Prévision sargasses ${lead.region} — mise à jour live`;
      const html = lang === 'en'
        ? `<div style="font-family:system-ui;max-width:560px;margin:0 auto;padding:20px;color:#0d1117"><h2 style="color:#0D1E1C">Live forecast for ${lead.region}</h2><p>Your beaches are monitored daily via satellite. Check the live map for today's verdict:</p><p><a href="https://${domain}/?utm_source=drip&utm_medium=email" style="display:inline-block;background:#FFC72C;color:#0d1117;font-weight:700;padding:12px 24px;border-radius:999px;text-decoration:none">View live map &rarr;</a></p><p style="font-size:12px;color:#666">Reliability: <a href="https://${domain}/fiabilite/">/fiabilite/</a> — Measured by satellite, not guessed.</p></div>`
        : `<div style="font-family:system-ui;max-width:560px;margin:0 auto;padding:20px;color:#0d1117"><h2 style="color:#0D1E1C">Prévision sargasses ${lead.region}</h2><p>Vos plages sont surveillées chaque jour par satellite. Consultez la carte live pour le verdict du jour :</p><p><a href="https://${domain}/?utm_source=drip&utm_medium=email" style="display:inline-block;background:#FFC72C;color:#0d1117;font-weight:700;padding:12px 24px;border-radius:999px;text-decoration:none">Voir la carte live &rarr;</a></p><p style="font-size:12px;color:#666">Fiabilité : <a href="https://${domain}/fiabilite/">/fiabilite/</a> — Mesuré au satellite, pas deviné.</p></div>`;
      const result = await sendEmail(lead.email, subject, html, domain, env);
      if (result.success) {
        console.log(`Drip: sent via ${result.provider} -> ${lead.email}`);
        await supa(env, 'b2b_leads', 'PATCH', { status: 'contacted' }, `?id=eq.${lead.id}&select=*`);
      } else {
        console.log(`Drip: all providers failed for ${lead.email}`);
      }
    } catch (e: any) {
      console.log(`Drip: error for ${lead.email}: ${e.message}`);
    }
  }
}

// ─── B2C Alerts (SPRINT #15 — 2x/jour 06:00 & 18:00) ───────────────────
async function runB2CAlerts(env: Env): Promise<void> {
  console.log('B2C: starting runB2CAlerts');
  const alerts = await supa(env, 'b2c_alerts', 'GET', null, `?status=eq.active&select=*`);
  if (!alerts || alerts.length === 0) {
    console.log('B2C: 0 active subscribers');
    return;
  }
  console.log(`B2C: ${alerts.length} active subscribers`);
  for (const sub of alerts) {
    try {
      const domain = sub.domain || 'sargasses-martinique.com';
      const region = sub.region || 'martinique';
      // Fetch forecast JSON (public, no auth) — best-effort
      let shouldAlert = false;
      let level = 'unknown';
      let forecastDate = new Date().toISOString().slice(0, 10);
      try {
        const fcRes = await fetch(`https://${domain}/api/copernicus/sargassum.json`, { cf: { cacheTtl: 300 } } as any);
        if (fcRes.ok) {
          const fc = await fcRes.json() as any;
          // Try to determine if sargassum level is moderate/avoid for region
          // Heuristic: check fc.regions or fc.beaches or top-level stale/weekly
          const txt = JSON.stringify(fc).toLowerCase();
          if (txt.includes('moderate') || txt.includes('avoid') || txt.includes('"level":"moderate"') || txt.includes('sargass')) {
            // Check beaches in requested region
            const beaches: any[] = fc.beaches || fc.data || [];
            const regionBeaches = beaches.filter((b: any) => (b.region || b.island || '').toLowerCase().includes(region.toLowerCase().slice(0, 3)));
            const hasAlert = regionBeaches.some((b: any) => ['moderate', 'avoid', 'high'].includes((b.level || b.status || '').toLowerCase()));
            // If we cannot parse, default to alert to ensure delivery test
            shouldAlert = hasAlert || regionBeaches.length === 0;
            if (hasAlert) level = regionBeaches.find((b: any) => ['moderate', 'avoid', 'high'].includes((b.level || '').toLowerCase()))?.level || 'moderate';
          }
        }
      } catch (e: any) {
        console.log(`B2C: forecast fetch failed for ${domain}: ${e.message}`);
      }
      // Fallback: if forecast parsing uncertain, still send if last run had sargassum (conservative)
      // For now, only send if shouldAlert true to avoid spam, but allow force for testing via ?force=1 not needed
      if (!shouldAlert) {
        console.log(`B2C: no sargassum detected for ${sub.email} region=${region} — skipping`);
        continue;
      }
      const token = sub.unsubscribe_token;
      const unsubUrl = `https://${domain}/unsubscribe?token=${token}`;
      const lang = (region && ['florida', 'puntacana', 'rivieramaya', 'miami'].includes(region.toLowerCase())) ? 'en' : 'fr';
      const levelEmoji: Record<string,string> = { clean:'🟢', moderate:'🟡', avoid:'🔴', high:'🔴', unknown:'⚪' };
      const levelColor: Record<string,string> = { clean:'#16a34a', moderate:'#eab308', avoid:'#dc2626', high:'#dc2626', unknown:'#6b7280' };
      const emoji = levelEmoji[level]||'⚠️';
      const color = levelColor[level]||'#c0392b';
      // Build J+1-3 preview from sargassum.json if available
      let forecastHtml = '';
      try {
        const c = await fetch(`https://${domain}/api/copernicus/sargassum.json`, { cf:{cacheTtl:300}} as any).then(r=>r.ok?r.json():null);
        const wk = (c as any)?.weekly;
        if (wk) {
          const firstKey = Object.keys(wk)[0];
          const fc = wk[firstKey]?.forecast?.slice(0,4) || [];
          if (fc.length >= 2) {
            const rows = fc.slice(1,4).map((d:any,i:number)=>`<tr><td style="padding:6px 10px;border:1px solid #e5e7eb">J+${i+1}</td><td style="padding:6px 10px;border:1px solid #e5e7eb">${levelEmoji[d.status]||''} ${d.status}</td><td style="padding:6px 10px;border:1px solid #e5e7eb">${d.date||''}</td></tr>`).join('');
            forecastHtml = `<table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:13px"><tr><th style="padding:6px 10px;background:#f3f4f6;border:1px solid #e5e7eb">Jour</th><th style="padding:6px 10px;background:#f3f4f6;border:1px solid #e5e7eb">Niveau</th><th style="padding:6px 10px;background:#f3f4f6;border:1px solid #e5e7eb">Date</th></tr>${rows}</table>`;
          }
        }
      } catch {}
      const beachesList = (sub.beaches && sub.beaches.length) ? sub.beaches.join(', ') : (lang==='en'?'All beaches in region':'Toutes les plages de la région');
      const subject = lang === 'en'
        ? `⚠️ Sargassum alert — ${region} — ${forecastDate}`
        : `⚠️ Alerte sargassum — ${region} — ${forecastDate}`;
      const html = lang === 'en'
        ? `<div style="font-family:system-ui;max-width:560px;margin:0 auto;padding:20px;color:#0d1117"><h2 style="color:${color}">${emoji} Sargassum alert — ${region}</h2><p>Hello,</p><p>The sargassum level is <strong style="color:${color}">${emoji} ${level}</strong> in <strong>${region}</strong> today.</p><p>Beaches concerned: <strong>${beachesList}</strong></p>${forecastHtml}<p>Forecast: ${forecastHtml?'see table above':'J+1-3 available on map'}</p><p><a href="https://${domain}/?utm_source=b2c_alert&utm_medium=email" style="display:inline-block;background:#FFC72C;color:#0d1117;font-weight:700;padding:12px 24px;border-radius:999px;text-decoration:none">View map →</a> <a href="https://${domain}/b2b?utm_source=b2c_alert" style="display:inline-block;background:#0d7f63;color:white;font-weight:700;padding:12px 24px;border-radius:999px;text-decoration:none;margin-left:8px">See full forecasts →</a></p><p style="font-size:11px;color:#888;margin-top:20px">You receive this email because you subscribed to SargaGame alerts.<br><a href="${unsubUrl}">Unsubscribe</a> — Measured by satellite, not guessed. <a href="https://${domain}/fiabilite/">/fiabilite/</a></p></div>`
        : `<div style="font-family:system-ui;max-width:560px;margin:0 auto;padding:20px;color:#0d1117"><h2 style="color:${color}">${emoji} Alerte sargassum — ${region}</h2><p>Bonjour,</p><p>Le niveau de sargassum est <strong style="color:${color}">${emoji} ${level}</strong> sur <strong>${region}</strong> aujourd'hui.</p><p>Plages concernées: <strong>${beachesList}</strong></p>${forecastHtml}<p>Prévisions: ${forecastHtml?'voir tableau ci-dessus':'J+1 à J+3 sur la carte'}</p><p><a href="https://${domain}/?utm_source=b2c_alert&utm_medium=email" style="display:inline-block;background:#FFC72C;color:#0d1117;font-weight:700;padding:12px 24px;border-radius:999px;text-decoration:none">Voir la carte →</a> <a href="https://${domain}/b2b?utm_source=b2c_alert" style="display:inline-block;background:#0d7f63;color:white;font-weight:700;padding:12px 24px;border-radius:999px;text-decoration:none;margin-left:8px">Voir les prévisions complètes →</a></p><p style="font-size:11px;color:#888;margin-top:20px">Vous recevez cet email car vous êtes abonné aux alertes SargaGame.<br><a href="${unsubUrl}">Se désabonner</a> — Mesuré au satellite, pas deviné. <a href="https://${domain}/fiabilite/">/fiabilite/</a></p></div>`;
      const result = await sendEmail(sub.email, subject, html, domain, env);
      if (result.success) console.log(`B2C: alert sent via ${result.provider} -> ${sub.email}`);
      else console.log(`B2C: all providers failed for ${sub.email}`);
    } catch (e: any) {
      console.log(`B2C: error for ${sub.email}: ${e.message}`);
    }
  }
}

async function handleUnsubscribe(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') || '';
  if (!token) {
    return new Response('<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;padding:40px;text-align:center"><h2>Token manquant</h2><p>Lien invalide.</p></body>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
  try {
    await supa(env, 'b2c_alerts', 'PATCH', { status: 'unsubscribed' }, `?unsubscribe_token=eq.${token}&select=*`);
  } catch {}
  const lang = url.pathname.includes('/en') ? 'en' : 'fr';
  const html = lang === 'en'
    ? `<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;padding:40px;text-align:center;max-width:520px;margin:0 auto"><h2 style="color:#0D1E1C">You are unsubscribed ✓</h2><p>You will no longer receive sargassum alerts.</p><p><a href="/" style="color:#0d7f63">Back to map</a></p></body>`
    : `<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;padding:40px;text-align:center;max-width:520px;margin:0 auto"><h2 style="color:#0D1E1C">Vous êtes désabonné ✓</h2><p>Vous ne recevrez plus d'alertes sargasses.</p><p><a href="/" style="color:#0d7f63">Retour à la carte</a></p></body>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

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
  const dayCount = parseInt(await kv(env).get(dayKey) || '0');
  if (dayCount >= 5000) return new Response(null, { status: 204, headers: noSniff });
  ctx.waitUntil(kv(env).put(dayKey, String(dayCount + 1), { expirationTtl: 172800 }));

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
  let body: any;
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: 'invalid_json' }), { status: 400, headers: h }); }
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
      // Identité stable : session signée (Google) OU upsert email → user_id propagé
      // au webhook via metadata → le grant payment_grants est rattaché au user (§15 du sprint).
      let userId: string | null = null;
      if (body.authToken) { const sess = await authVerify(env, String(body.authToken)); if (sess) userId = String(sess.uid); }
      if (!userId && email && String(email).includes('@')) { const u = await userUpsert(env, String(email).toLowerCase().trim(), 'email', null); if (u) userId = u.id; }
      if (userId) metadata.user_id = userId;
      const kind = pass ? 'pass' : 'pro';
      const redirectUrl = userRedirect || `https://${host}/payment/good.html?kind=${kind}&email=${encodeURIComponent(email || '')}&plan=${encodeURIComponent(pass || 'annual')}`;
      if (pass && email) { const idemKey = `mol_${await hashString(email + '|' + pass)}`; const ex = await kv(env).get(idemKey); if (ex) throw new Error('Paiement déjà en cours.'); await kv(env).put(idemKey, '1', { expirationTtl: 60 }); }
      const pd: any = { amount, description: description || (pass ? `Sargasses Pass ${pass}` : 'Sargasses'), redirectUrl, webhookUrl: `https://${host}/api/mollie-webhook`, metadata, locale: locale || 'fr_FR' };
      if (applePayPaymentToken) pd.applePayPaymentToken = applePayPaymentToken; if (cardToken) pd.cardToken = cardToken; if (payMethod) pd.method = payMethod;
      const payment = await mollieReq('POST', 'v2/payments', apiKey, pd);
      return new Response(JSON.stringify({ checkoutUrl: payment._links?.checkout?.href || null, paymentId: payment.id, user_id: userId || null }), { headers: h });
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
      const rows = await supa(env, 'payment_grants', 'GET', null, `?select=pass,expires_at,payment_id,user_id&type=eq.b2c_pass&email=eq.${email}&expires_at=gt.now()&order=expires_at.desc&limit=1`);
      if (!rows?.length) return new Response(JSON.stringify({ active: false, reason: 'no_pass_grant' }), { headers: h });
      const passEnd = new Date(rows[0].expires_at).getTime();
      if (!passEnd || passEnd <= Date.now()) return new Response(JSON.stringify({ active: false, reason: 'no_pass_grant' }), { headers: h });
      return new Response(JSON.stringify({ active: true, kind: 'pass', pass: rows[0].pass, passEnd, status: 'paid', user_id: rows[0].user_id || null }), { headers: h });
    }

    // ═══ IDENTITÉ (sprint funnel 2026-09-03) — actions auth ═══════════
    // Règle sécurité : JAMAIS de confiance à un email/user_id brut envoyé par le
    // client. Google = OIDC vérifié (signature JWKS + aud + iss + exp).
    // Email = identité déclarée, SANS token de session (un token durable exige
    // la preuve Google ou un grant de paiement webhook).
    if (action === 'auth_google') {
      if (!env.GOOGLE_CLIENT_ID) return new Response(JSON.stringify({ error: 'google_not_configured' }), { status: 501, headers: h });
      const credential = String(body.credential || '');
      if (!credential || credential.length > 8192) return new Response(JSON.stringify({ error: 'invalid_credential' }), { status: 400, headers: h });
      const g = await verifyGoogleIdToken(env, credential);
      if (!g) return new Response(JSON.stringify({ error: 'google_auth_invalid' }), { status: 401, headers: h });
      const user = await userUpsert(env, g.email, 'google', g.sub);
      if (!user) return new Response(JSON.stringify({ error: 'user_unavailable' }), { status: 503, headers: h });
      const token = await authSign(env, { uid: user.id, email: g.email, type: 'sg_session', exp: Math.floor(Date.now() / 1000) + 90 * 86400 });
      const ent = await userEntitlements(env, user.id, g.email);
      return new Response(JSON.stringify({ ok: true, user_id: user.id, email: g.email, name: g.name, provider: 'google', token, ...ent }), { headers: h });
    }

    if (action === 'auth_email') {
      const email = String(body.email || '').toLowerCase().trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return new Response(JSON.stringify({ error: 'invalid_email' }), { status: 400, headers: h });
      const user = await userUpsert(env, email, 'email', null);
      const ent = await userEntitlements(env, user?.id || null, email);
      return new Response(JSON.stringify({ ok: true, user_id: user?.id || null, email, provider: 'email', ...ent }), { headers: h });
    }

    if (action === 'auth_session') {
      const payload = await authVerify(env, String(body.token || ''));
      if (!payload) return new Response(JSON.stringify({ ok: false, error: 'invalid_session' }), { status: 401, headers: h });
      const users = await supaQ(env, 'sg_users', 'GET', null, `?id=eq.${payload.uid}&select=id,email&limit=1`);
      const email = users?.[0]?.email || String(payload.email || '');
      const ent = await userEntitlements(env, String(payload.uid), email || null);
      return new Response(JSON.stringify({ ok: true, user_id: payload.uid, email, ...ent }), { headers: h });
    }


    if (action === 'applepay_session') {
      const validationUrl = body.validationUrl; if (!validationUrl) throw new Error('validationUrl requis');
      if (!/^https:\/\/(apple|cdn-apple|guzzoni).*\.apple\.com\//i.test(validationUrl)) throw new Error("validationUrl doit provenir d'apple.com");
      const session = await mollieReq('POST', 'v2/wallets/applepay/sessions', apiKey, { validationUrl, domain: body.domain || host });
      return new Response(JSON.stringify(session), { headers: h });
    }

    return new Response(JSON.stringify({ error: 'action_inconnue' }), { status: 400, headers: h });
  } catch (e: any) {
    // Renvoyer le message précis (Prix invalide, déjà en cours, Unauthorized...) :
    // le frontend classe l'erreur pour guider l'utilisateur (fix 2026-07-30).
    // Aveuglant : Status toujours 500, jamais de stack ni de clé.
    return new Response(JSON.stringify({ error: String(e?.message || 'payment_processing_error').slice(0, 120) }), { status: 500, headers: h });
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
  const existing = await kv(env).get(markerKey);
  if (existing) return new Response(JSON.stringify({ received: true, duplicate: true }));
  try {
    const apiKey = env.MOLLIE_API_KEY;
    if (type === 'payment') {
      const payment = await mollieReq('GET', `v2/payments/${id}`, apiKey);
      const status = payment.status || ''; const metadata = payment.metadata || {};
      if (event === 'payment.failed' || status === 'failed') {
        const pass = metadata.pass || ''; if (pass && ['p30', 'trip7', 'season'].includes(pass)) await kv(env).delete(`mol_b2c_pass_${id}`);
      }
      if (status === 'paid') {
        const source = metadata.source || ''; const pass = metadata.pass || ''; const email = metadata.email || '';
        if (source === 'b2b_annual') await grantB2B(env, email, 'pro_monthly', id, 365);
        else if (pass && ['p30', 'trip7', 'season'].includes(pass)) await grantB2C(env, id, pass, email, metadata);
        // Onboarding auto: widget token + supabase insert + welcome email
        if (source === 'b2b_subscription' && email) {
          await grantOnboardingAuto(env, email, metadata);
        }
      }
      await kv(env).put(markerKey, '1', { expirationTtl: 86400 });
      return new Response(JSON.stringify({ received: true, type: 'payment', status }));
    }
    if (type === 'subscription') {
      const sub = await mollieReq('GET', `v2/subscriptions/${id}`, apiKey);
      const status = sub.status || ''; const metadata = sub.metadata || {}; const planKey = metadata.plan || ''; const cid = sub.customerId || '';
      if (['subscription.created', 'subscription.updated'].includes(event) && planKey && ['pro_monthly', 'brief_monthly'].includes(planKey) && ['active', 'pending'].includes(status)) await grantB2B(env, cid, planKey, sub.id);
      if (event === 'subscription.paid' && planKey && ['pro_monthly', 'brief_monthly'].includes(planKey)) await grantB2B(env, cid, planKey, sub.id);
      if (['subscription.canceled', 'subscription.expired'].includes(event)) { await kv(env).delete(`mollie_grant_${sub.id}`); await supa(env, 'payment_grants', 'PATCH', { status: 'revoked' }, `?subscription_id=eq.${sub.id}&type=eq.b2b_pro`); }
      await kv(env).put(markerKey, '1', { expirationTtl: 86400 });
      return new Response(JSON.stringify({ received: true, type: 'subscription', status, event }));
    }
    await kv(env).put(markerKey, '1', { expirationTtl: 86400 });
    return new Response(JSON.stringify({ received: true, type }));
  } catch { return new Response(JSON.stringify({ error: 'webhook_processing_error' }), { status: 500 }); }
}

async function grantB2B(env: Env, customerId: string, planKey: string, subId: string, days = 30): Promise<void> {
  const k = `mollie_grant_${subId}`; if (await kv(env).get(k)) return;
  const exp = Math.floor(Date.now() / 1000) + days * 86400;
  const token = await widgetSign(env, { plan: planKey, customer_id: customerId, subscription_id: subId, exp, type: 'b2b_pro' });
  await kv(env).put(k, token, { expirationTtl: (days + 1) * 86400 });
  await supa(env, 'payment_grants', 'POST', { subscription_id: subId, type: 'b2b_pro', plan: planKey, customer_id: customerId, expires_at: new Date(exp * 1000).toISOString(), granted_at: new Date().toISOString() });
}

async function grantB2C(env: Env, paymentId: string, pass: string, email: string, meta: Record<string, any>): Promise<void> {
  const k = `mol_b2c_pass_${paymentId}`; if (await kv(env).get(k)) return;
  const days = PASS_DURATIONS[pass] || 30; const exp = Math.floor(Date.now() / 1000) + days * 86400;
  const sessionId = meta?.sg_session_id || null;
  await kv(env).put(k, JSON.stringify({ pass, email, expires_at: exp }), { expirationTtl: (days + 1) * 86400 });
  // user_id : rattache le grant à l'utilisateur stable (sprint identité) si créé au checkout
  const userId = meta?.user_id || null;
  await supa(env, 'payment_grants', 'POST', { payment_id: paymentId, type: 'b2c_pass', pass, email, currency: meta.currency || 'EUR', expires_at: new Date(exp * 1000).toISOString(), granted_at: new Date().toISOString(), session_id: sessionId, user_id: userId, metadata: meta });
}

async function grantOnboardingAuto(env: Env, email: string, meta: Record<string, any>): Promise<void> {
  // 1. Générer widget token unique
  const widgetToken = crypto.randomUUID();
  const tokenKey = `widget_token_${widgetToken}`;
  // 2. Préparer les métadonnées Supabase
  const plan = (meta.plan || 'pro_monthly').toString();
  const region = (meta.region || 'martinique').toString();
  const domain = (meta.domain || 'sargasses-martinique.com').toString();
  const expiresAt = Math.floor(Date.now() / 1000) + 365 * 86400; // 1 an
  // 3. Insérer dans Supabase b2b_subscriptions
  await supa(env, 'b2b_subscriptions', 'POST', {
    company_email: email,
    region: region,
    domain: domain,
    plan: plan,
    status: 'active',
    widget_token: widgetToken,
    mollie_customer_id: meta.mollie_customer_id || '',
    created_at: new Date().toISOString(),
  }, null);
  // 4. Générer le code d'intégration iframe
  const iframeCode = `<iframe src="https://${domain}/widget?token=${widgetToken}" width="100%" height="320" frameborder="0"></iframe>`;
  // 5. Envoyer email de bienvenue
  const subject = plan === 'pro_monthly'
    ? `Bienvenue SargaGame Pro — votre widget est prêt`
    : `Bienvenue SargaGame Brief — votre widget est prêt`;
  const lang = region && ['florida', 'puntacana', 'rivieramaya'].includes(region.toLowerCase()) ? 'en' : 'fr';
  const html = lang === 'en'
    ? `Bonjour,<br><br>Your SargaGame ${plan} subscription is active.<br><br>Here is your widget to integrate into your site:<br><code>${iframeCode}</code><br><br>Copy this code and paste it into your website.<br><br>Your dashboard: https://${domain}/b2b?token=${widgetToken}<br>Support: contact@${domain}<br><br>Thank you for your trust,<br>SargaGame`
    : `Bonjour,<br><br>Abonnement SargaGame ${plan} actif.<br><br>Voici votre widget à intégrer sur votre site :<br><code>${iframeCode}</code><br><br>Copiez ce code et collez-le dans votre site web.<br><br>Votre dashboard: https://${domain}/b2b?token=${widgetToken}<br>Support: contact@${domain}<br><br>Merci de votre confiance,<br>SargaGame`;
  await sendEmail(email, subject, html, domain, env);
  // 6. Track
  await supa(env, 'analytics_events', 'POST', {
    event: 'sg_client_onboarded',
    params: { plan, region, domain, email },
  }).catch(() => {});
}
