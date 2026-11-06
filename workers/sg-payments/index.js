var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.ts
var ALLOWED_ORIGINS = [
  "https://sargasses-martinique.com",
  "https://sargasses-guadeloupe.com",
  "https://sargassumpuntacana.com",
  "https://sargassummiami.com",
  "https://sargassumcancun.com"
];
var ALLOWED_HOSTS = [
  "sargasses-martinique.com",
  "sargasses-guadeloupe.com",
  "sargassumpuntacana.com",
  "sargassummiami.com",
  "sargassumcancun.com"
];
var PASS_PRICES = {
  p30: { EUR: 14.99, USD: 11.99 },
  trip7: { EUR: 4.99, USD: null },
  season: { EUR: 19.99, USD: null }
};
var B2B_PLANS = {
  pro_monthly: { amount: 79, currency: "EUR", description: "Sargasses Pro \u2014 mensuel (79 \u20AC/mois)", interval: "1 month" },
  brief_monthly: { amount: 29, currency: "EUR", description: "Sargasses Brief \u2014 mensuel (29 \u20AC/mois)", interval: "1 month" },
  pro_monthly_usd: { amount: 89, currency: "USD", description: "Sargassum Pro \u2014 monthly ($89/mo)", interval: "1 month" },
  brief_monthly_usd: { amount: 39, currency: "USD", description: "Sargassum Brief \u2014 monthly ($39/mo)", interval: "1 month" }
};
var PASS_DURATIONS = { p30: 30, trip7: 7, season: 210 };
var CLICK_REDIRECT_HOSTS = ["sargasses-martinique.com", "sargasses-guadeloupe.com", "sargassumpuntacana.com", "sargassummiami.com", "sargassumcancun.com"];
var COLLECT_HOSTS = [
  "sargasses-martinique.com",
  "sargasses-guadeloupe.com",
  "sargassumpuntacana.com",
  "sargassummiami.com",
  "sargassumcancun.com",
  "sargazotulum.com"
];
var PIXEL_GIF = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"), (c) => c.charCodeAt(0));
async function mollieReq(method, path, apiKey, body) {
  const resp = await fetch(`https://api.mollie.com/${path}`, {
    method,
    headers: { "Authorization": `Bearer ${apiKey}`, "Accept": "application/json", "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : void 0
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`Mollie: ${data?.detail || data?.title || resp.status}`);
  return data;
}
__name(mollieReq, "mollieReq");
function cors(request) {
  const origin2 = request.headers.get("Origin") || "";
  const h = { "Content-Type": "application/json; charset=utf-8" };
  if (ALLOWED_ORIGINS.includes(origin2)) h["Access-Control-Allow-Origin"] = origin2;
  return h;
}
__name(cors, "cors");
function kv(env) {
  const k = env.TRANSIENTS;
  return {
    async get(key) {
      if (!k) return null;
      try {
        return await k.get(key);
      } catch (e) {
        console.log("KV get KO:", e?.message);
        return null;
      }
    },
    async put(key, value, opts) {
      if (!k) return;
      try {
        await k.put(key, value, opts);
      } catch (e) {
        console.log("KV put KO:", e?.message);
      }
    },
    async delete(key) {
      if (!k) return;
      try {
        await k.delete(key);
      } catch (e) {
        console.log("KV del KO:", e?.message);
      }
    }
  };
}
__name(kv, "kv");
var RATE_LIMIT_CACHE = /* @__PURE__ */ new Map();
var FLUSH_INTERVAL_MS = 6e4;
var FLUSH_THRESHOLD = 100;
async function rateLimit(env, key, limit, windowSec = 86400) {
  const day = Math.floor(Date.now() / 864e5);
  const bucketKey = `ratelimit:${key}:${day}`;
  let entry = RATE_LIMIT_CACHE.get(bucketKey);
  if (!entry || entry.day !== day) {
    try {
      const kvVal = await kv(env).get(bucketKey);
      const count = kvVal ? parseInt(kvVal, 10) : 0;
      entry = { count, lastFlush: Date.now(), day };
      RATE_LIMIT_CACHE.set(bucketKey, entry);
    } catch (e) {
      console.log("rateLimit KV init KO \u2014 fail-open:", e?.message);
      entry = { count: 0, lastFlush: Date.now(), day };
      RATE_LIMIT_CACHE.set(bucketKey, entry);
    }
  }
  if (entry.count >= limit) return false;
  entry.count++;
  const now = Date.now();
  const shouldFlush = entry.count % FLUSH_THRESHOLD === 0 || now - entry.lastFlush > FLUSH_INTERVAL_MS;
  if (shouldFlush) {
    entry.lastFlush = now;
    kv(env).put(bucketKey, String(entry.count), { expirationTtl: 86400 * 2 }).catch((e) => {
      console.log("rateLimit KV flush KO:", e?.message);
    });
  }
  return true;
}
__name(rateLimit, "rateLimit");
function cleanupRateLimitCache() {
  const now = Date.now();
  const day = Math.floor(now / 864e5);
  for (const [key, entry] of RATE_LIMIT_CACHE.entries()) {
    if (entry.day !== day || now - entry.lastFlush > 3e5) {
      RATE_LIMIT_CACHE.delete(key);
    }
  }
}
__name(cleanupRateLimitCache, "cleanupRateLimitCache");
function normalizeMollieSignature(sig) {
  // P0.118 §6 — normalisation de la signature Mollie.
  //   Next-gen : en-tete "X-Mollie-Signature: sha256=<hex 64>"
  //   Classique: hex 64 nu
  // La version live comparait la signature BRUTE : toute requete Next-gen
  // officielle etait donc rejetee en 403 (le prefixe "sha256=" n'etait pas
  // retire). On normalise, on refuse tout ce qui n'est pas 64 hex, et on
  // compare a temps constant.
  const v = String(sig || "").trim();
  const prefixed = /^sha256=([0-9a-fA-F]{64})$/.exec(v);
  if (prefixed) return prefixed[1].toLowerCase();
  if (/^[0-9a-fA-F]{64}$/.test(v)) return v.toLowerCase();
  return "";
}
__name(normalizeMollieSignature, "normalizeMollieSignature");
async function verifyHmac(body, sig, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const s = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  const expected = Array.from(new Uint8Array(s)).map((b) => b.toString(16).padStart(2, "0")).join("");
  const provided = normalizeMollieSignature(sig);
  if (!provided) return false;
  const a = enc.encode(expected);
  const b = enc.encode(provided);
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a[i] ^ b[i];
  return r === 0;
}
__name(verifyHmac, "verifyHmac");
async function supa(env, table, method, body, query = "") {
  if (!env.SUPABASE_SERVICE_KEY) return method === "GET" ? [] : null;
  const url = `${env.SUPABASE_URL}/rest/v1/${table}${query}`;
  const opts = { method, headers: {
    "apikey": env.SUPABASE_SERVICE_KEY,
    "Authorization": `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    "Content-Type": "application/json",
    "Prefer": method === "GET" ? "return=representation" : "return=minimal"
  } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  if (!r.ok) return method === "GET" ? [] : null;
  if (r.status === 204) return [];
  return await r.json();
}
__name(supa, "supa");
async function widgetSign(env, payload) {
  const data = btoa(JSON.stringify(payload));
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(env.MOLLIE_WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return `${data}.${Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}
__name(widgetSign, "widgetSign");
async function widgetVerify(env, k) {
  const parts = k.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(env.MOLLIE_WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const s = await crypto.subtle.sign("HMAC", key, enc.encode(parts[0]));
  const expected = Array.from(new Uint8Array(s)).map((b) => b.toString(16).padStart(2, "0")).join("");
  if (expected !== parts[1]) return null;
  const payload = JSON.parse(atob(parts[0].replace(/-/g, "+").replace(/_/g, "/")));
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1e3)) return null;
  return payload;
}
__name(widgetVerify, "widgetVerify");
async function supaQ(env, table, method, body, query = "") {
  if (!env.SUPABASE_SERVICE_KEY) return method === "GET" ? [] : null;
  try {
    const url = `${env.SUPABASE_URL}/rest/v1/${table}${query}`;
    const r = await fetch(url, {
      method,
      headers: {
        "apikey": env.SUPABASE_SERVICE_KEY,
        "Authorization": `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation"
      },
      body: body !== void 0 ? JSON.stringify(body) : void 0
    });
    if (!r.ok) return method === "GET" ? [] : null;
    const t = await r.text();
    if (!t) return [];
    try {
      return JSON.parse(t);
    } catch {
      return [];
    }
  } catch {
    return method === "GET" ? [] : null;
  }
}
__name(supaQ, "supaQ");
function authSecret(env) {
  return env.AUTH_SECRET || (env.MOLLIE_WEBHOOK_SECRET || "") + "|sg-auth-v1";
}
__name(authSecret, "authSecret");
async function authSign(env, payload) {
  const data = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(authSecret(env)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return `${data}.${Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}
__name(authSign, "authSign");
async function authVerify(env, token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(authSecret(env)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const s = await crypto.subtle.sign("HMAC", key, enc.encode(parts[0]));
    const expected = Array.from(new Uint8Array(s)).map((b) => b.toString(16).padStart(2, "0")).join("");
    if (expected.length !== parts[1].length) return null;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ parts[1].charCodeAt(i);
    if (diff !== 0) return null;
    const b64 = parts[0].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(decodeURIComponent(escape(atob(b64 + "=".repeat((4 - b64.length % 4) % 4)))));
    if (payload.type !== "sg_session") return null;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1e3)) return null;
    if (!payload.uid) return null;
    return payload;
  } catch {
    return null;
  }
}
__name(authVerify, "authVerify");
var JWKS_CACHE = null;
function b64urlDecode(s) {
  const b = s.replace(/-/g, "+").replace(/_/g, "/");
  return atob(b + "=".repeat((4 - b.length % 4) % 4));
}
__name(b64urlDecode, "b64urlDecode");
async function verifyGoogleIdToken(env, credential) {
  if (!env.GOOGLE_CLIENT_ID) return null;
  const parts = String(credential || "").split(".");
  if (parts.length !== 3) return null;
  let header, payload;
  try {
    header = JSON.parse(b64urlDecode(parts[0]));
    payload = JSON.parse(b64urlDecode(parts[1]));
  } catch {
    return null;
  }
  if (header?.alg !== "RS256" || !header.kid) return null;
  if (payload.iss !== "accounts.google.com" && payload.iss !== "https://accounts.google.com") return null;
  if (payload.aud !== env.GOOGLE_CLIENT_ID) return null;
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1e3)) return null;
  if (!payload.email || payload.email_verified === false) return null;
  try {
    if (!JWKS_CACHE || Date.now() - JWKS_CACHE.at > 6 * 36e5) {
      const r = await fetch("https://www.googleapis.com/oauth2/v3/certs");
      const j = await r.json();
      if (!j?.keys?.length) return null;
      JWKS_CACHE = { at: Date.now(), keys: j.keys };
    }
    const jwk = JWKS_CACHE.keys.find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const sigBytes = Uint8Array.from(b64urlDecode(parts[2]), (c) => c.charCodeAt(0));
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, sigBytes, new TextEncoder().encode(parts[0] + "." + parts[1]));
    if (!ok) return null;
  } catch {
    return null;
  }
  return { email: String(payload.email).toLowerCase().trim(), sub: String(payload.sub), name: String(payload.name || "") };
}
__name(verifyGoogleIdToken, "verifyGoogleIdToken");
async function userUpsert(env, email, provider, providerUserId) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  if (providerUserId) {
    const bySub = await supaQ(env, "sg_users", "GET", null, `?provider=eq.google&provider_user_id=eq.${encodeURIComponent(providerUserId)}&select=id,email&limit=1`);
    if (bySub?.[0]) {
      await supaQ(env, "sg_users", "PATCH", { email, updated_at: now }, `?id=eq.${bySub[0].id}`);
      return bySub[0];
    }
  }
  const byEmail = await supaQ(env, "sg_users", "GET", null, `?email=eq.${encodeURIComponent(email)}&select=id,email&limit=1`);
  if (byEmail?.[0]) {
    if (providerUserId) await supaQ(env, "sg_users", "PATCH", { provider: "google", provider_user_id: providerUserId, updated_at: now }, `?id=eq.${byEmail[0].id}`);
    return byEmail[0];
  }
  const created = await supaQ(env, "sg_users", "POST", { email, provider, provider_user_id: providerUserId }, "?select=id,email");
  if (created?.[0]) return created[0];
  const again = await supaQ(env, "sg_users", "GET", null, `?email=eq.${encodeURIComponent(email)}&select=id,email&limit=1`);
  return again?.[0] || null;
}
__name(userUpsert, "userUpsert");
async function userEntitlements(env, userId, email) {
  const filters = [];
  // P0.118 §7 — `public.payment_grants` n'a PAS de colonne `user_id`
  // (cf. supabase/schema.sql) : le filtre `user_id.eq.` faisait echouer la
  // requete (400 PostgREST) et les droits n'etaient jamais lus. Le user_id
  // est stocke dans metadata (jsonb).
  if (userId) filters.push(`metadata->>user_id.eq.${userId}`);
  if (email) filters.push(`email.eq.${encodeURIComponent(email)}`);
  if (!filters.length) return { entitlements: [], premium: { active: false } };
  const q = `?select=type,pass,plan,expires_at,payment_id&expires_at=gt.now()&${filters.length > 1 ? "or=(" + filters.join(",") + ")" : filters[0]}&order=expires_at.desc&limit=10`;
  const rows = await supaQ(env, "payment_grants", "GET", null, q) || [];
  const passRow = rows.find((r) => r.type === "b2c_pass");
  const passEnd = passRow ? new Date(passRow.expires_at).getTime() : 0;
  return {
    entitlements: rows,
    premium: {
      active: !!passRow && passEnd > Date.now(),
      kind: passRow ? "pass" : null,
      pass: passRow?.pass || null,
      passEnd: passEnd > Date.now() ? passEnd : null
    }
  };
}
__name(userEntitlements, "userEntitlements");
async function resendEmail(env, from, to, subject, html) {
  if (!env.RESEND_API_KEY) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html })
  });
}
__name(resendEmail, "resendEmail");
async function sendViaNamecheap(to, subject, html, domain, env) {
  // P0.118 §5 — AUCUN credential en dur.
  // Le bearer Namecheap vient EXCLUSIVEMENT du secret NAMECHEAP_MAIL_TOKEN.
  // S'il est absent on leve une erreur : le runner d'emails passe alors au
  // provider suivant (sendpulse -> brevo -> resend) au lieu d'authentifier
  // avec un token fige dans le code source (qui constituait un secret
  // partageable et non rotatif).
  const token = env.NAMECHEAP_MAIL_TOKEN;
  if (!token) throw new Error("NAMECHEAP_MAIL_TOKEN absent");
  const res = await fetch(`https://${domain}/send-email.php`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
    body: JSON.stringify({ to, subject, html, from: `alerte@${domain}`, fromName: "SargaGame" })
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Namecheap failed");
  return true;
}
__name(sendViaNamecheap, "sendViaNamecheap");
async function sendViaSendPulse(to, subject, html, domain, env) {
  if (!env.SENDPULSE_CLIENT_ID || !env.SENDPULSE_CLIENT_SECRET) throw new Error("SendPulse creds missing");
  const tokenRes = await fetch("https://api.sendpulse.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials", client_id: env.SENDPULSE_CLIENT_ID, client_secret: env.SENDPULSE_CLIENT_SECRET })
  });
  const tokenData = await tokenRes.json();
  const token = tokenData.access_token;
  if (!token) throw new Error("SendPulse auth failed");
  const res = await fetch("https://api.sendpulse.com/smtp/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email: { from: { name: "SargaGame", email: `alerte@${domain}` }, to: [{ email: to }], subject, html } })
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error("SendPulse failed: " + t.slice(0, 200));
  }
  return true;
}
__name(sendViaSendPulse, "sendViaSendPulse");
async function sendViaBrevo(to, subject, html, domain, env) {
  if (!env.BREVO_API_KEY) throw new Error("Brevo key missing");
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ sender: { name: "SargaGame", email: `alerte@${domain}` }, to: [{ email: to }], subject, htmlContent: html })
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error("Brevo failed: " + t.slice(0, 200));
  }
  return true;
}
__name(sendViaBrevo, "sendViaBrevo");
async function sendViaResend(to, subject, html, domain, env) {
  if (!env.RESEND_API_KEY) throw new Error("Resend key missing");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: `SargaGame <alerte@${domain}>`, to: [to], subject, html })
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error("Resend failed: " + t.slice(0, 200));
  }
  return true;
}
__name(sendViaResend, "sendViaResend");
async function sendEmail(to, subject, html, domain, env) {
  const providers = [
    { name: "namecheap", fn: sendViaNamecheap },
    { name: "sendpulse", fn: sendViaSendPulse },
    { name: "brevo", fn: sendViaBrevo },
    { name: "resend", fn: sendViaResend }
  ];
  for (const p of providers) {
    try {
      const result = await p.fn(to, subject, html, domain, env);
      if (result) {
        console.log(`Email sent via ${p.name} -> ${to}`);
        return { success: true, provider: p.name };
      }
    } catch (e) {
      console.log(`${p.name} failed: ${e.message}, trying next...`);
      continue;
    }
  }
  return { success: false, error: "All providers failed" };
}
__name(sendEmail, "sendEmail");
async function hashString(s) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(hashString, "hashString");
async function b2bProspects(env, request) {
  const h = cors(request);
  const url = new URL(request.url);
  const method = request.method;
  if (method === "POST") {
    const input = await request.json();
    if (!input.name) return new Response(JSON.stringify({ error: "name required" }), { status: 400, headers: h });
    const rows = await supa(env, "b2b_prospects", "POST", { name: input.name, beach: input.beach, island: input.island, phone: input.phone, email: input.email, grade: input.grade || "A" });
    const p = rows?.[0];
    if (p) await supa(env, "b2b_events", "POST", { prospect_id: p.id, type: "PROSPECT_CREATED", actor: "system", metadata: { name: p.name } });
    return new Response(JSON.stringify(p || { error: "create_failed" }), { status: p ? 200 : 500, headers: h });
  }
  if (method === "GET") {
    const id = url.searchParams.get("id");
    if (id) {
      const rows2 = await supa(env, "b2b_prospects", "GET", null, `?id=eq.${id}&select=*`);
      return new Response(JSON.stringify(rows2?.[0] || { error: "not_found" }), { status: rows2?.[0] ? 200 : 404, headers: h });
    }
    const status = url.searchParams.get("status");
    let q = "?select=*&order=created_at.desc";
    if (status) q += `&status=eq.${status}`;
    const rows = await supa(env, "b2b_prospects", "GET", null, q);
    return new Response(JSON.stringify(rows), { headers: h });
  }
  if (method === "PATCH") {
    const id = url.searchParams.get("id");
    if (!id) return new Response(JSON.stringify({ error: "id required" }), { status: 400, headers: h });
    const input = await request.json();
    const rows = await supa(env, "b2b_prospects", "PATCH", input, `?id=eq.${id}&select=*`);
    return new Response(JSON.stringify(rows?.[0] || { error: "not_found" }), { status: rows?.[0] ? 200 : 404, headers: h });
  }
  return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: h });
}
__name(b2bProspects, "b2bProspects");
async function b2bConcierge(env, request) {
  const h = cors(request);
  const url = new URL(request.url);
  const method = request.method;
  if (method === "POST") {
    const input = await request.json();
    if (!input.prospect_id) return new Response(JSON.stringify({ error: "prospect_id required" }), { status: 400, headers: h });
    const existing = await supa(env, "b2b_concierge", "GET", null, `?prospect_id=eq.${input.prospect_id}&status=eq.active&select=*&limit=1`);
    if (existing?.[0]) return new Response(JSON.stringify({ error: "active_exists", concierge: existing[0] }), { status: 409, headers: h });
    const start = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const end = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
    const rows = await supa(env, "b2b_concierge", "POST", { prospect_id: input.prospect_id, start_date: start, end_date: end, status: "active", current_day: 0 });
    return new Response(JSON.stringify(rows?.[0] || { error: "failed" }), { status: rows?.[0] ? 200 : 500, headers: h });
  }
  if (method === "GET") {
    const pid = url.searchParams.get("prospect_id");
    if (!pid) return new Response(JSON.stringify({ error: "prospect_id required" }), { status: 400, headers: h });
    const rows = await supa(env, "b2b_concierge", "GET", null, `?prospect_id=eq.${pid}&status=eq.active&select=*&limit=1`);
    return new Response(JSON.stringify(rows?.[0] || null), { headers: h });
  }
  if (method === "PATCH") {
    const id = url.searchParams.get("id");
    if (!id) return new Response(JSON.stringify({ error: "id required" }), { status: 400, headers: h });
    const input = await request.json();
    const action = input.action;
    if (action === "advance_day") {
      const rows = await supa(env, "b2b_concierge", "PATCH", { current_day: input.day }, `?id=eq.${id}&select=*`);
      return new Response(JSON.stringify(rows?.[0]), { headers: h });
    }
    if (action === "payment_requested") {
      const rows = await supa(env, "b2b_concierge", "PATCH", { payment_requested: true }, `?id=eq.${id}&select=*`);
      return new Response(JSON.stringify(rows?.[0]), { headers: h });
    }
    if (action === "payment_confirmed") {
      const rows = await supa(env, "b2b_concierge", "PATCH", { payment_confirmed: true, status: "completed" }, `?id=eq.${id}&select=*`);
      return new Response(JSON.stringify(rows?.[0]), { headers: h });
    }
  }
  return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: h });
}
__name(b2bConcierge, "b2bConcierge");
var JEV_INTENTS = ["today_verdict", "when_later", "trip_planning", "which_beach", "avoid_seaweed", "b2b", "off_topic"];
async function handleJevIntent(request, env) {
  const J = { "Content-Type": "application/json" };
  const fb = /* @__PURE__ */ __name(() => new Response(JSON.stringify({ ok: false, fallback: true }), { headers: J }), "fb");
  const key = (env.TYPESAFE_API_KEY || "").trim();
  if (!key || key.startsWith("test")) return fb();
  let body = null;
  try {
    body = await request.json();
  } catch {
    return fb();
  }
  const text = String(body?.text || "").trim();
  if (text.length < 6 || text.length > 220) return fb();
  const lang = ["fr", "en", "es"].includes(body?.lang) ? body.lang : "fr";
  const region = String(body?.region || "").replace(/[^a-z_]/gi, "").slice(0, 24);
  const payload = {
    model: "jev-latest",
    state: {
      user_text: text,
      lang,
      region,
      context: "Beach decision app (sargassum/seaweed forecast per beach). The typed text was NOT recognized as a beach name by the deterministic search."
    },
    questions: {
      intent: {
        type: "choice",
        instructions: "Classify what this app visitor most wants right now. They could not find a beach by name search.",
        criteria: {
          today_verdict: "Wants to know where to swim / which beach is clean TODAY (implicit location ok)",
          when_later: 'Asks about tomorrow, the weekend, "when", or a future moment',
          trip_planning: 'Planning a stay/trip: several days, accommodation, "I am staying\u2026", itinerary',
          which_beach: 'Undecided between beaches / asks "which beach should I choose" without a day',
          avoid_seaweed: "Fears seaweed (sargasses) ruining a plan \u2014 wants reassurance or a safe option",
          b2b: "Speaks as a business: hotel, villa, tour operator, concierge, agency",
          off_topic: "Unrelated to beaches / sargassum / travel decision"
        }
      }
    }
  };
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), 4e3);
  try {
    const r = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify(payload),
      signal: ctl.signal
    });
    if (!r.ok) return fb();
    const j = await r.json();
    const a = j?.answers?.intent;
    if (!a || a.type !== "choice" || !a.choice || !JEV_INTENTS.includes(a.choice)) return fb();
    return new Response(JSON.stringify({ ok: true, intent: a.choice, confidence: typeof a.confidence === "number" ? Math.round(a.confidence * 1e3) / 1e3 : null }), { headers: J });
  } catch {
    return fb();
  } finally {
    clearTimeout(to);
  }
}
__name(handleJevIntent, "handleJevIntent");
var index_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/_cron/drip") {
      ctx.waitUntil(runDripEmails(env));
      return new Response(JSON.stringify({ ok: true, cron: "drip" }), { headers: { "Content-Type": "application/json" } });
    }
    if (url.pathname === "/_cron/b2c") {
      // No authenticated manual-cron contract or secret binding exists.
      // Keep the scheduled() trigger; deny public/manual invocation by default.
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
      });
    }
    const path = url.pathname;
    if (path === "/api/jev-intent" || path === "/api/jev-intent.php") {
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(request) });
      if (request.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: cors(request) });
      return handleJevIntent(request, env);
    }
    if (path === "/api/mollie" || path === "/api/mollie.php") {
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(request) });
      if (request.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: cors(request) });
      return handleMollie(request, env);
    }
    if (path === "/api/mollie-webhook" || path === "/api/mollie-webhook.php") {
      if (request.method === "GET") return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
      return handleWebhook(request, env, ctx);
    }
    if (path === "/api/widget-token.php") {
      const k = url.searchParams.get("k") || "";
      const payload = await widgetVerify(env, k);
      return new Response(JSON.stringify(payload ? { pro: true, host: payload.h } : { pro: false }), {
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
      });
    }
    if (path === "/b2b" || path === "/b2b/" || path.startsWith("/b2b/")) {
      const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sargasses Pro \u2014 B2B</title><meta http-equiv="refresh" content="0;url=/pro/"><link rel="canonical" href="https://${url.hostname}/pro/"><style>body{font-family:system-ui;padding:40px;text-align:center;color:#0d1117} a{color:#0d7f63;font-weight:700}</style><h1>Sargasses Pro</h1><p>Redirection vers <a href="/pro/">/pro/</a> \u2014 pr\xE9vision satellite pour h\xF4tels & collectivit\xE9s.</p><p><a href="/pro/">Voir les offres Pro \u2192</a> \xB7 <a href="/pro/pricing/">Tarifs</a> \xB7 <a href="/pro/widget-sargasses-hotel/">Widget gratuit</a></p>`;
      return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (path === "/dashboard" || path === "/dashboard/") {
      const url2 = new URL(request.url);
      const token = url2.searchParams.get("token") || "";
      const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SargaGame Dashboard</title><link rel="stylesheet" href="/app-runtime.css"></head><body><div id="root"></div><script>window.__DASHBOARD_TOKEN__="${token}"<\/script><script src="/assets/index-B7MZ2uBf.js"><\/script></body></html>`;
      return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    if (path === "/widget") {
      const url2 = new URL(request.url);
      const token = url2.searchParams.get("token") || "";
      if (!token) return new Response(`<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;padding:40px;text-align:center"><h2>Token manquant</h2><p>Ajoutez ?token=XXX \xE0 l'URL.</p></body>`, { headers: { "Content-Type": "text/html; charset=utf-8" } });
      const rows = await supa(env, "b2b_subscriptions", "GET", null, `?widget_token=eq.${token}&select=*&limit=1`);
      if (!rows?.length) return new Response('<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;padding:40px;text-align:center"><h2>Token invalide</h2><p>Aucun abonnement trouv\xE9 pour ce widget token.</p></body>', { headers: { "Content-Type": "text/html; charset=utf-8" } });
      const sub = rows[0];
      const region = sub.region || "martinique";
      const lang = region && ["florida", "puntacana", "rivieramaya"].includes(region.toLowerCase()) ? "en" : "fr";
      const domain = sub.domain || "sargasses-martinique.com";
      let sargStatus = "unknown";
      let forecast3j = "";
      try {
        const c = await fetch(`${origin}/api/copernicus/sargassum.json`).then((r) => r.ok ? r.json() : null);
        if (c) {
          const wk = c.weekly;
          if (wk) {
            const firstKey = Object.keys(wk)[0];
            const fc = wk[firstKey]?.forecast?.slice(0, 3) || [];
            sargStatus = fc.length > 0 ? fc[0].status || "unknown" : "unknown";
            forecast3j = fc.slice(1, 4).map((d) => `<p>J+${fc.indexOf(d) + 1}: ${d.status}</p>`).join("");
          }
        }
      } catch {
      }
      const statusColors = { clean: "#16a34a", moderate: "#eab308", avoid: "#dc2626", high: "#dc2626", unknown: "#6b7280" };
      const statusEmoji = { clean: "\u{1F7E2}", moderate: "\u{1F7E1}", avoid: "\u{1F534}", high: "\u{1F534}", unknown: "\u26AA" };
      const html = lang === "en" ? `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:system-ui;margin:0;padding:20px;color:#0d1117} .card{max-width:600px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px} h1{color:#0D1E1C;margin-top:0} .btn{display:inline-block;background:#FFC72C;color:#0d1117;padding:12px 24px;border-radius:999px;font-weight:700;text-decoration:none;margin:8px}</style></head><body><div class="card"><h1>SargaGame Widget</h1><p><strong>Region:</strong> ${region}</p><p><strong>Status:</strong> <span style="color:${statusColors[sargStatus] || "#6b7280"}">${statusEmoji[sargStatus] || "\u26A0\uFE0F"} ${sargStatus}</span></p>${forecast3j ? `<div style="margin-top:16px"><h3>3-day forecast</h3>${forecast3j}</div>` : ""}<p><iframe src="https://${domain}/widget?token=${token}" width="100%" height="320" style="border:none; margin:16px 0;" frameborder="0"></iframe></p><p>Powered by SargaGame \u2022 <a href="https://${domain}/b2b?token=${token}" class="btn">Manage subscription \u2192</a> <a href="https://${domain}/" class="btn" style="background:#0d7f63;color:white">Back to map \u2192</a></p></div></body></html>` : `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:system-ui;margin:0;padding:20px;color:#0d1117} .card{max-width:600px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px} h1{color:#0D1E1C;margin-top:0}</style></head><body><div class="card"><h1>Widget SargaGame</h1><p><strong>R\xE9gion:</strong> ${region}</p><p><strong>Niveau:</strong> <span style="color:${statusColors[sargStatus] || "#6b7280"}">${statusEmoji[sargStatus] || "\u26A0\uFE0F"} ${sargStatus}</span></p>${forecast3j ? `<div style="margin-top:16px"><h3>Pr\xE9visions 3 jours</h3>${forecast3j}</div>` : ""}<p><iframe src="https://${domain}/widget?token=${token}" width="100%" height="320" style="border:none; margin:16px 0;" frameborder="0"></iframe></p><p>Powered by SargaGame \u2022 <a href="https://${domain}/b2b?token=${token}" class="btn" style="background:#0d7f63;color:white">G\xE9rer l'abonnement \u2192</a> <a href="https://${domain}/" class="btn">Retour \xE0 la carte \u2192</a></p></div></body></html>`;
      return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    if (path === "/unsubscribe") {
      return handleUnsubscribe(request, env);
    }
    if (path === "/api/mollie-health") {
      return new Response(JSON.stringify({ ok: true, worker: "sg-payments", version: "sprint15", routes: 44 + 1 }), { headers: { "Content-Type": "application/json" } });
    }
    if (path === "/api/mollie-kv-test") {
      const k = env.TRANSIENTS;
      const hasBinding = !!k;
      let testResult = "no-test";
      if (k) {
        try {
          await k.put("diag-test", "ok", { expirationTtl: 60 });
          const val = await k.get("diag-test");
          testResult = val === "ok" ? "ok" : "mismatch";
        } catch (e) {
          testResult = `error: ${e?.message?.slice(0, 80) || "unknown"}`;
        }
      }
      return new Response(JSON.stringify({
        ok: true,
        kv_binding: hasBinding,
        test: testResult,
        kv_id: "528c05c792e046029a84e2fdb84f4ae6"
      }), { headers: { "Content-Type": "application/json" } });
    }
    if (path === "/api/mollie-health") {
      return new Response(JSON.stringify({ ok: true, worker: "sg-payments", version: "sprint15", routes: 44 + 1 }), { headers: { "Content-Type": "application/json" } });
    }
    if (path === "/collect.php") {
      return handleCollect(request, env, ctx);
    }
    if (path === "/api/track-click.php") {
      const id = (url.searchParams.get("id") || "").replace(/[^a-zA-Z0-9_-]/g, "");
      let redirectUrl = url.searchParams.get("url") || "/";
      redirectUrl = decodeURIComponent(redirectUrl).replace(/[\r\n]/g, "");
      if (!/^https?:\/\//i.test(redirectUrl)) redirectUrl = "/";
      const parsed = new URL(redirectUrl, "https://dummy");
      const host = parsed.hostname.replace(/^www\./, "");
      if (!CLICK_REDIRECT_HOSTS.some((h) => host === h || host.endsWith("." + h))) redirectUrl = "/";
      ctx.waitUntil(supa(env, "analytics_events", "POST", { event: "email_clicked", params: { email_id: id, url: redirectUrl } }));
      return Response.redirect(redirectUrl, 302);
    }
    if (path === "/api/track-open.php") {
      const id = (url.searchParams.get("id") || "").replace(/[^a-zA-Z0-9_-]/g, "");
      if (id) ctx.waitUntil(supa(env, "analytics_events", "POST", { event: "email_opened", params: { email_id: id } }));
      return new Response(PIXEL_GIF, {
        headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" }
      });
    }
    if (path.startsWith("/api/copernicus/forecast")) {
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(request) });
      const daysParam = parseInt(url.searchParams.get("days") || "7", 10);
      const isFree = !isNaN(daysParam) && daysParam <= 3;
      if (!isFree) {
        const k = url.searchParams.get("k") || "";
        let authorized = false;
        if (k) {
          const payload = await widgetVerify(env, k);
          if (payload) authorized = true;
        }
        if (!authorized && request.method === "POST") {
          try {
            const body = await request.json();
            const email = (body.email || "").trim();
            if (email) {
              const rows = await supa(env, "payment_grants", "GET", null, `?email=eq.${email}&expires_at=gt.now()&select=type&limit=1`);
              if (rows?.length) authorized = true;
            }
          } catch {
          }
        }
        if (!authorized) return new Response(JSON.stringify({ ok: false, error: "Premium required for days>3" }), { status: 403, headers: { "Content-Type": "application/json" } });
      }
      const sargData = await fetch(`${url.origin}/api/copernicus/sargassum.json`).then((r) => r.json()).catch(() => null);
      if (!sargData) return new Response(JSON.stringify({ ok: false, reason: "no_data" }), { status: 503, headers: { "Content-Type": "application/json" } });
      let weekly = sargData.weekly;
      if (!isNaN(daysParam) && weekly && typeof weekly === "object") {
        const sliced = {};
        for (const [bid, wk] of Object.entries(weekly)) {
          const w = wk;
          if (w?.forecast?.length) sliced[bid] = { ...w, forecast: w.forecast.slice(0, daysParam) };
          else sliced[bid] = w;
        }
        weekly = sliced;
      }
      return new Response(JSON.stringify({ ok: true, updatedAt: sargData.updatedAt, weekly, days: daysParam, free: isFree }), {
        headers: { "Content-Type": "application/json", "Cache-Control": isFree ? "public, max-age=1800" : "no-store" }
      });
    }
    if (path === "/api/b2b-prospects.php") return b2bProspects(env, request);
    if (path === "/api/b2b-concierge.php") return b2bConcierge(env, request);
    if (path === "/api/b2b-trial.php") {
      if (request.method !== "POST") return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: cors(request) });
      if (!await rateLimit(env, "b2b_trial", 50)) return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: cors(request) });
      const input = await request.json();
      const email = (input.email || "").trim();
      if (!email || !email.includes("@")) return new Response(JSON.stringify({ error: "invalid_email" }), { status: 400, headers: cors(request) });
      const name = (input.name || "").replace(/[<>"]/g, "").slice(0, 60);
      const beach = (input.beach || "").replace(/[^A-Za-z0-9-]/g, "").toLowerCase().slice(0, 60);
      const island = (input.island || "mq").replace(/[^A-Za-z]/g, "").toLowerCase();
      const ISLAND_MAP = { mq: "MQ", gp: "GP", florida: "florida", puntacana: "puntacana", rivieramaya: "rivieramaya" };
      const islandNorm = ISLAND_MAP[island] || "MQ";
      const token = await widgetSign(env, { exp: Math.floor(Date.now() / 1e3) + 30 * 86400, type: "b2b_pro" });
      const domainMap = { MQ: "sargasses-martinique.com", GP: "sargasses-guadeloupe.com", florida: "sargassummiami.com", puntacana: "sargassumpuntacana.com", rivieramaya: "sargassumcancun.com" };
      const domain = domainMap[islandNorm] || "sargasses-martinique.com";
      const lang = ["florida", "puntacana", "rivieramaya"].includes(islandNorm) ? "en" : "fr";
      const accessUrl = `https://${domain}/?k=${token}${beach ? `&beach=${beach}` : ""}${name ? `&name=${encodeURIComponent(name)}` : ""}`;
      const title = lang === "en" ? "Your PRO trial is active" : "Ton essai PRO est actif";
      const bodyText = lang === "en" ? `Hi ${name} Your 30-day PRO trial is ready.` : `Bonjour ${name} Ton essai PRO de 30 jours est actif.`;
      const cta = lang === "en" ? "Open my dashboard" : "Ouvrir mon espace";
      const html = `<div style="font-family:system-ui;max-width:520px;margin:0 auto;padding:20px;font-size:15px;color:#1a1a1a"><h2 style="margin:0 0 12px;color:#0D1E1C">${title}</h2><p>${bodyText}</p><p><a href="${accessUrl}" style="display:inline-block;background:linear-gradient(135deg,#FFC72C,#E8A800);color:#0D1E1C;font-weight:700;padding:14px 32px;border-radius:999px;text-decoration:none;font-size:16px">${cta} &rarr;</a></p></div>`;
      ctx.waitUntil(resendEmail(env, `Sargasses Pro <alerte@${domain}>`, [email], title, html).catch(() => {
      }));
      ctx.waitUntil(fetch("https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "email_signup", email, source: "b2b_trial", island: islandNorm, org: name }) }).catch(() => {
      }));
      ctx.waitUntil(supa(env, "analytics_events", "POST", { event: "b2b_trial_started", params: { org: name, beach }, island: islandNorm }).catch(() => {
      }));
      return new Response(JSON.stringify({ ok: true, token, days: 30 }), { headers: cors(request) });
    }
    if (path === "/api/b2b-meeting.php") {
      if (request.method !== "POST") return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: cors(request) });
      if (!await rateLimit(env, "b2b_meeting", 50)) return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: cors(request) });
      const input = await request.json();
      const email = (input.email || "").trim();
      if (!email || !email.includes("@")) return new Response(JSON.stringify({ error: "invalid_email" }), { status: 400, headers: cors(request) });
      const org = (input.org || "").replace(/[<>"]/g, "").slice(0, 80);
      const littoral = (input.littoral || "").replace(/[<>"]/g, "").slice(0, 120);
      const phone = (input.phone || "").replace(/[^0-9 +().-]/g, "").slice(0, 30);
      const island = (input.island || "").replace(/[^A-Za-z]/g, "").toUpperCase();
      const html = `<div style="font-family:system-ui;max-width:520px;margin:0 auto;padding:20px;font-size:15px;color:#1a1a1a"><h2>Nouvelle demande B2B \u2014 ${org}</h2><table style="width:100%;border-collapse:collapse"><tr><td style="padding:6px 0;font-weight:700;width:100px">Email</td><td>${email}</td></tr><tr><td style="padding:6px 0;font-weight:700">Organisation</td><td>${org}</td></tr><tr><td style="padding:6px 0;font-weight:700">Littoral</td><td>${littoral}</td></tr><tr><td style="padding:6px 0;font-weight:700">T\xE9l\xE9phone</td><td>${phone}</td></tr><tr><td style="padding:6px 0;font-weight:700">\xCEle</td><td>${island}</td></tr></table></div>`;
      ctx.waitUntil(resendEmail(env, "Sargasses B2B <alerte@sargasses-martinique.com>", ["contact@sargasses-martinique.com"], `Nouvelle demande B2B \u2014 ${org}`, html).catch(() => {
      }));
      ctx.waitUntil(fetch("https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "email_signup", email, source: "b2b_territoire_meeting", island: island || "MQ", org }) }).catch(() => {
      }));
      return new Response(JSON.stringify({ ok: true }), { headers: cors(request) });
    }
    if (path === "/api/b2b-create-checkout.php") {
      if (request.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: cors(request) });
      if (!await rateLimit(env, "b2b_checkout", 100)) return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: cors(request) });
      const input = await request.json();
      if (!input.prospect_id || !input.concierge_id || !input.email) {
        return new Response(JSON.stringify({ error: "prospect_id, concierge_id, email required" }), { status: 400, headers: cors(request) });
      }
      try {
        const apiKey = env.MOLLIE_API_KEY;
        const plan = B2B_PLANS.brief_monthly;
        const customers = await mollieReq("GET", "v2/customers?limit=50", apiKey);
        let cid = null;
        for (const c of customers._embedded?.customers || []) {
          if (c.email === input.email) {
            cid = c.id;
            break;
          }
        }
        if (!cid) {
          const nc = await mollieReq("POST", "v2/customers", apiKey, { email: input.email, name: input.name || "", metadata: { source: "b2b_concierge_checkout" } });
          cid = nc.id;
        }
        const host = request.headers.get("Host") || ALLOWED_HOSTS[0];
        const subscription = await mollieReq("POST", `v2/customers/${cid}/subscriptions`, apiKey, {
          amount: { value: plan.amount.toFixed(2), currency: plan.currency },
          description: plan.description,
          webhookUrl: `https://${host}/api/mollie-webhook`,
          metadata: { source: "b2b_concierge", prospect_id: input.prospect_id, concierge_id: input.concierge_id, plan: "brief_monthly" },
          interval: plan.interval
        });
        const checkoutUrl = subscription._links?.checkout?.href || null;
        await supa(env, "b2b_payments", "POST", { prospect_id: input.prospect_id, concierge_id: input.concierge_id, amount: plan.amount, status: "pending", mollie_payment_id: subscription.id });
        return new Response(JSON.stringify({ checkoutUrl, customerId: cid, subscriptionId: subscription.id }), { headers: cors(request) });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors(request) });
      }
    }
    if (path === "/api/b2b-contacts.php" || path === "/api/b2b-events.php" || path === "/api/b2b-scores.php" || path === "/api/b2b-forecast-delivery.php") {
      const table = path.includes("contacts") ? "b2b_contacts" : path.includes("events") ? "b2b_events" : path.includes("scores") ? "b2b_scores" : "b2b_forecast_deliveries";
      const h = cors(request);
      if (request.method === "GET") {
        const qs = url.searchParams.toString();
        const rows = await supa(env, table, "GET", null, `?${qs}&select=*`);
        return new Response(JSON.stringify(rows), { headers: h });
      }
      if (request.method === "POST") {
        const input = await request.json();
        const rows = await supa(env, table, "POST", input);
        return new Response(JSON.stringify(rows?.[0] || { ok: true }), { headers: h });
      }
      if (request.method === "PATCH") {
        const id = url.searchParams.get("id");
        if (!id) return new Response(JSON.stringify({ error: "id required" }), { status: 400, headers: h });
        const input = await request.json();
        const rows = await supa(env, table, "PATCH", input, `?id=eq.${id}&select=*`);
        return new Response(JSON.stringify(rows?.[0]), { headers: h });
      }
      return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: h });
    }
    if (path.startsWith("/api/partner/")) {
      return handlePartnerCommerce(request, env, ctx, path);
    }
    if (path.endsWith(".php")) {
      return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: { "Content-Type": "application/json", "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" } });
    }
    if (request.method === "GET" && path === "/api/b2b-paylinks.json") return fetch(request);
    return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: { "Content-Type": "application/json" } });
  },
  async scheduled(event, env, ctx) {
    console.log(`Cron triggered: ${event.cron}`);
    cleanupRateLimitCache();
    ctx.waitUntil(runDripEmails(env));
    if (event.cron === "0 6,18 * * *") {
      ctx.waitUntil(runB2CAlerts(env));
    }
  }
};
async function runDripEmails(env) {
  console.log("Drip: starting runDripEmails");
  const cutoff = new Date(Date.now() - 36e5).toISOString();
  const leads = await supa(env, "b2b_leads", "GET", null, `?status=eq.new&created_at=lt.${cutoff}&select=*`);
  if (!leads || leads.length === 0) {
    console.log("Drip: 0 leads to contact");
    return;
  }
  console.log(`Drip: ${leads.length} leads`);
  for (const lead of leads) {
    try {
      const domain = lead.domain || "sargasses-martinique.com";
      const lang = lead.region && ["florida", "puntacana", "rivieramaya"].includes(lead.region.toLowerCase()) ? "en" : "fr";
      const subject = lang === "en" ? `Sargassum forecast for ${lead.region} \u2014 live update` : `Pr\xE9vision sargasses ${lead.region} \u2014 mise \xE0 jour live`;
      const html = lang === "en" ? `<div style="font-family:system-ui;max-width:560px;margin:0 auto;padding:20px;color:#0d1117"><h2 style="color:#0D1E1C">Live forecast for ${lead.region}</h2><p>Your beaches are monitored daily via satellite. Check the live map for today's verdict:</p><p><a href="https://${domain}/?utm_source=drip&utm_medium=email" style="display:inline-block;background:#FFC72C;color:#0d1117;font-weight:700;padding:12px 24px;border-radius:999px;text-decoration:none">View live map &rarr;</a></p><p style="font-size:12px;color:#666">Reliability: <a href="https://${domain}/fiabilite/">/fiabilite/</a> \u2014 Measured by satellite, not guessed.</p></div>` : `<div style="font-family:system-ui;max-width:560px;margin:0 auto;padding:20px;color:#0d1117"><h2 style="color:#0D1E1C">Pr\xE9vision sargasses ${lead.region}</h2><p>Vos plages sont surveill\xE9es chaque jour par satellite. Consultez la carte live pour le verdict du jour :</p><p><a href="https://${domain}/?utm_source=drip&utm_medium=email" style="display:inline-block;background:#FFC72C;color:#0d1117;font-weight:700;padding:12px 24px;border-radius:999px;text-decoration:none">Voir la carte live &rarr;</a></p><p style="font-size:12px;color:#666">Fiabilit\xE9 : <a href="https://${domain}/fiabilite/">/fiabilite/</a> \u2014 Mesur\xE9 au satellite, pas devin\xE9.</p></div>`;
      const result = await sendEmail(lead.email, subject, html, domain, env);
      if (result.success) {
        console.log(`Drip: sent via ${result.provider} -> ${lead.email}`);
        await supa(env, "b2b_leads", "PATCH", { status: "contacted" }, `?id=eq.${lead.id}&select=*`);
      } else {
        console.log(`Drip: all providers failed for ${lead.email}`);
      }
    } catch (e) {
      console.log(`Drip: error for ${lead.email}: ${e.message}`);
    }
  }
}
__name(runDripEmails, "runDripEmails");
var B2C_REGION_CONFIG = {
  mq: { domain: "sargasses-martinique.com", label: "Martinique", lang: "fr" },
  martinique: { domain: "sargasses-martinique.com", label: "Martinique", lang: "fr" },
  gp: { domain: "sargasses-guadeloupe.com", label: "Guadeloupe", lang: "fr" },
  guadeloupe: { domain: "sargasses-guadeloupe.com", label: "Guadeloupe", lang: "fr" },
  us: { domain: "sargassummiami.com", label: "Florida", lang: "en" },
  florida: { domain: "sargassummiami.com", label: "Florida", lang: "en" },
  do: { domain: "sargassumpuntacana.com", label: "Punta Cana", lang: "en" },
  puntacana: { domain: "sargassumpuntacana.com", label: "Punta Cana", lang: "en" },
  mx: { domain: "sargassumcancun.com", label: "Riviera Maya", lang: "en" },
  rivieramaya: { domain: "sargassumcancun.com", label: "Riviera Maya", lang: "en" },
  tulum: { domain: "sargazotulum.com", label: "Tulum", lang: "en" }
};
var B2C_ALERT_STATUSES = ["moderate", "avoid", "high"];
function b2cObservationIsFresh(payload, now = Date.now()) {
  if (!payload || payload.stale !== false || !Array.isArray(payload.levels) || payload.levels.length === 0) return false;
  const observedAt = Date.parse(payload.erddapTimestamp);
  if (!Number.isFinite(observedAt) || observedAt > now) return false;
  return now - observedAt <= 900 * 60 * 1000;
}
__name(b2cObservationIsFresh, "b2cObservationIsFresh");
function b2cSelectedAlertLevels(subscription, payload) {
  if (!Array.isArray(subscription.beaches) || subscription.beaches.length === 0) return [];
  const selectedIds = subscription.beaches.map((id) => typeof id === "string" ? id.trim() : "");
  if (selectedIds.some((id) => !id) || new Set(selectedIds).size !== selectedIds.length) return [];
  const byId = new Map();
  for (const level of payload.levels) {
    if (!level || typeof level.id !== "string" || !level.id.trim() || byId.has(level.id)) return [];
    byId.set(level.id, level);
  }
  if (selectedIds.some((id) => !byId.has(id))) return [];
  return selectedIds.map((id) => byId.get(id)).filter((level) => B2C_ALERT_STATUSES.includes(String(level.status || "").toLowerCase()));
}
__name(b2cSelectedAlertLevels, "b2cSelectedAlertLevels");
function escapeB2CHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}
__name(escapeB2CHtml, "escapeB2CHtml");
async function runB2CAlerts(env) {
  console.log("B2C: starting runB2CAlerts");
  const alerts = await supa(env, "b2c_alerts", "GET", null, "?status=eq.active&select=*");
  if (!Array.isArray(alerts) || alerts.length === 0) {
    console.log("B2C: 0 active subscribers");
    return;
  }
  console.log("B2C: active subscriber count=" + alerts.length);
  for (const sub of alerts) {
    try {
      const region = String(sub.region || "").trim().toLowerCase();
      const regionInfo = B2C_REGION_CONFIG[region];
      const domain = String(sub.domain || "").trim().toLowerCase();
      if (!regionInfo || !domain || domain !== regionInfo.domain) {
        console.log("B2C: invalid region/domain contract subscription=" + String(sub.id || "unknown"));
        continue;
      }
      if (typeof sub.email !== "string" || !sub.email.includes("@") || /\\s/.test(sub.email) ||
          typeof sub.unsubscribe_token !== "string" || !sub.unsubscribe_token.trim()) {
        console.log("B2C: invalid subscriber contact subscription=" + String(sub.id || "unknown"));
        continue;
      }
      // PostgreSQL text[] is expected. Empty, NULL, display-name or unknown selections never imply consent for all beaches.
      if (!Array.isArray(sub.beaches) || sub.beaches.length === 0) {
        console.log("B2C: no explicit beach selection subscription=" + String(sub.id || "unknown"));
        continue;
      }
      let payload;
      try {
        const response = await fetch("https://" + domain + "/api/copernicus/sargassum.json", { cf: { cacheTtl: 300 } });
        if (!response.ok) {
          console.log("B2C: forecast HTTP failure subscription=" + String(sub.id || "unknown"));
          continue;
        }
        payload = await response.json();
      } catch (e) {
        console.log("B2C: forecast fetch failed subscription=" + String(sub.id || "unknown") + ": " + e.message);
        continue;
      }
      if (!b2cObservationIsFresh(payload)) {
        console.log("B2C: observation missing, stale, future or older than 900m subscription=" + String(sub.id || "unknown"));
        continue;
      }
      const selectedAlerts = b2cSelectedAlertLevels(sub, payload);
      if (selectedAlerts.length === 0) {
        console.log("B2C: no exact selected-beach alert subscription=" + String(sub.id || "unknown"));
        continue;
      }
      const severity = { moderate: 1, avoid: 2, high: 3 };
      const level = selectedAlerts.reduce((worst, beach) => {
        const status = String(beach.status).toLowerCase();
        return severity[status] > severity[worst] ? status : worst;
      }, "moderate");
      const forecastDate = new Date(payload.erddapTimestamp).toISOString().slice(0, 10);
      const token = sub.unsubscribe_token;
      const unsubUrl = "https://" + domain + "/unsubscribe?token=" + encodeURIComponent(token);
      const lang = regionInfo.lang;
      const regionLabel = regionInfo.label;
      const levelEmoji = { clean: "🟢", moderate: "🟡", avoid: "🔴", high: "🔴", unknown: "⚪" };
      const levelColor = { clean: "#16a34a", moderate: "#eab308", avoid: "#dc2626", high: "#dc2626", unknown: "#6b7280" };
      const emoji = levelEmoji[level] || "⚠️";
      const color = levelColor[level] || "#c0392b";
      const beachesList = selectedAlerts.map((beach) => escapeB2CHtml(beach.id)).join(", ");
      const weekly = payload.weekly && typeof payload.weekly === "object" ? payload.weekly : {};
      const forecastRows = [];
      for (const beach of selectedAlerts) {
        const beachForecast = weekly[beach.id] && weekly[beach.id].forecast;
        if (!Array.isArray(beachForecast)) continue;
        for (let i = 1; i < Math.min(beachForecast.length, 4); i++) {
          const day = beachForecast[i];
          if (!day || typeof day.status !== "string") continue;
          const dayStatus = String(day.status).toLowerCase();
          forecastRows.push("<tr><td style='padding:6px 10px;border:1px solid #e5e7eb'>" +
            escapeB2CHtml(beach.id) + "</td><td style='padding:6px 10px;border:1px solid #e5e7eb'>J+" + i +
            "</td><td style='padding:6px 10px;border:1px solid #e5e7eb'>" +
            (levelEmoji[dayStatus] || "") + " " + escapeB2CHtml(dayStatus) +
            "</td><td style='padding:6px 10px;border:1px solid #e5e7eb'>" +
            escapeB2CHtml(day.date || "") + "</td></tr>");
        }
      }
      const forecastHtml = forecastRows.length
        ? "<table style='width:100%;border-collapse:collapse;margin:12px 0;font-size:13px'><tr><th>Plage</th><th>Jour</th><th>Niveau</th><th>Date</th></tr>" + forecastRows.join("") + "</table>"
        : "";
      const subject = lang === "en"
        ? "⚠️ Sargassum alert — " + regionLabel + " — " + forecastDate
        : "⚠️ Alerte sargassum — " + regionLabel + " — " + forecastDate;
      const html = lang === "en"
        ? '<div style="font-family:system-ui;max-width:560px;margin:0 auto;padding:20px;color:#0d1117"><h2 style="color:' + color + '">' + emoji + ' Sargassum alert — ' + escapeB2CHtml(regionLabel) + '</h2><p>Hello,</p><p>The sargassum level is <strong style="color:' + color + '">' + emoji + " " + level + '</strong> in <strong>' + escapeB2CHtml(regionLabel) + '</strong> today.</p><p>Beaches concerned: <strong>' + beachesList + '</strong></p>' + forecastHtml + '<p><a href="https://' + domain + '/?utm_source=b2c_alert&utm_medium=email" style="display:inline-block;background:#FFC72C;color:#0d1117;font-weight:700;padding:12px 24px;border-radius:999px;text-decoration:none">View map →</a> <a href="https://' + domain + '/b2b?utm_source=b2c_alert" style="display:inline-block;background:#0d7f63;color:white;font-weight:700;padding:12px 24px;border-radius:999px;text-decoration:none;margin-left:8px">See full forecasts →</a></p><p style="font-size:11px;color:#888;margin-top:20px">You receive this email because you subscribed to SargaGame alerts.<br><a href="' + unsubUrl + '">Unsubscribe</a> — Measured by satellite, not guessed. <a href="https://' + domain + '/fiabilite/">/fiabilite/</a></p></div>'
        : '<div style="font-family:system-ui;max-width:560px;margin:0 auto;padding:20px;color:#0d1117"><h2 style="color:' + color + '">' + emoji + ' Alerte sargassum — ' + escapeB2CHtml(regionLabel) + '</h2><p>Bonjour,</p><p>Le niveau de sargassum est <strong style="color:' + color + '">' + emoji + " " + level + '</strong> sur <strong>' + escapeB2CHtml(regionLabel) + '</strong> aujourd’hui.</p><p>Plages concernées : <strong>' + beachesList + '</strong></p>' + forecastHtml + '<p><a href="https://' + domain + '/?utm_source=b2c_alert&utm_medium=email" style="display:inline-block;background:#FFC72C;color:#0d1117;font-weight:700;padding:12px 24px;border-radius:999px;text-decoration:none">Voir la carte →</a> <a href="https://' + domain + '/b2b?utm_source=b2c_alert" style="display:inline-block;background:#0d7f63;color:white;font-weight:700;padding:12px 24px;border-radius:999px;text-decoration:none;margin-left:8px">Voir les prévisions complètes →</a></p><p style="font-size:11px;color:#888;margin-top:20px">Vous recevez cet email car vous êtes abonné aux alertes SargaGame.<br><a href="' + unsubUrl + '">Se désabonner</a> — Mesuré au satellite, pas deviné. <a href="https://' + domain + '/fiabilite/">/fiabilite/</a></p></div>';
      const result = await sendEmail(sub.email, subject, html, domain, env);
      if (result.success) console.log("B2C: alert sent subscription=" + String(sub.id || "unknown") + " provider=" + result.provider);
      else console.log("B2C: all email providers failed subscription=" + String(sub.id || "unknown"));
    } catch (e) {
      console.log("B2C: error subscription=" + String(sub.id || "unknown") + ": " + e.message);
    }
  }
}
__name(runB2CAlerts, "runB2CAlerts");
async function handleUnsubscribe(request, env) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";
  if (!token) {
    return new Response('<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;padding:40px;text-align:center"><h2>Token manquant</h2><p>Lien invalide.</p></body>', { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
  try {
    await supa(env, "b2c_alerts", "PATCH", { status: "unsubscribed" }, `?unsubscribe_token=eq.${token}&select=*`);
  } catch {
  }
  const lang = url.pathname.includes("/en") ? "en" : "fr";
  const html = lang === "en" ? `<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;padding:40px;text-align:center;max-width:520px;margin:0 auto"><h2 style="color:#0D1E1C">You are unsubscribed \u2713</h2><p>You will no longer receive sargassum alerts.</p><p><a href="/" style="color:#0d7f63">Back to map</a></p></body>` : `<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;padding:40px;text-align:center;max-width:520px;margin:0 auto"><h2 style="color:#0D1E1C">Vous \xEAtes d\xE9sabonn\xE9 \u2713</h2><p>Vous ne recevrez plus d'alertes sargasses.</p><p><a href="/" style="color:#0d7f63">Retour \xE0 la carte</a></p></body>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
__name(handleUnsubscribe, "handleUnsubscribe");
async function handleCollect(request, env, ctx) {
  const noSniff = { "X-Content-Type-Options": "nosniff" };
  if (request.method !== "POST") return new Response(null, { status: 405, headers: noSniff });
  const hostOk = /* @__PURE__ */ __name((u) => {
    if (!u) return null;
    try {
      const h = new URL(u).hostname.toLowerCase();
      return COLLECT_HOSTS.some((d) => h === d || h.endsWith("." + d));
    } catch {
      return false;
    }
  }, "hostOk");
  let ok = hostOk(request.headers.get("Origin"));
  if (ok === null) ok = hostOk(request.headers.get("Referer"));
  if (ok === false) return new Response(null, { status: 403, headers: noSniff });
  const raw2 = await request.text().catch(() => "");
  if (raw2.length > 65536 || raw2.length < 2) return new Response(null, { status: 204, headers: noSniff });
  let data = null;
  try {
    data = JSON.parse(raw2);
  } catch {
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return new Response(null, { status: 204, headers: noSniff });
  const day = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const ip = request.headers.get("CF-Connecting-IP") || "";
  const ua = (request.headers.get("User-Agent") || "").slice(0, 120);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${day}|${ip}|${ua}`));
  const vh = Array.from(new Uint8Array(digest)).slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
  if (!await rateLimit(env, `collect:global`, 5e3)) return new Response(null, { status: 204, headers: noSniff });
  if (!await rateLimit(env, `collect:${vh}`, 100)) return new Response(null, { status: 204, headers: noSniff });
  const region = typeof data.region === "string" ? data.region.slice(0, 20) : "";
  ctx.waitUntil(supa(env, "analytics_events", "POST", {
    event: "sg_session",
    params: { vh, d: data },
    island: region || new URL(request.url).hostname
  }));
  return new Response(null, { status: 204, headers: noSniff });
}
__name(handleCollect, "handleCollect");
async function handleMollie(request, env) {
  const h = cors(request);
  let body;
  try {
    const raw2 = await request.text();
    body = raw2 ? JSON.parse(raw2) : {};
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json", raw_preview: raw?.slice(0, 100) || "empty" }), { status: 400, headers: { ...h, "X-Diag-Source": "worker" } });
  }
  const action = body.action || "";
  if (!await rateLimit(env, `mol_${action}`, 100)) return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: h });
  try {
    const apiKey = env.MOLLIE_API_KEY;
    const profileId = env.MOLLIE_PROFILE_ID || "pfl_t8KCk4Cm2C";
    const host = request.headers.get("Host") || ALLOWED_HOSTS[0];
    if (action === "create_payment") {
      const { pass, email, source, description, method: payMethod, cardToken, cents, amount: amountObj, locale, metadata: userMeta, applePayPaymentToken, redirectUrl: userRedirect, referredBy, myReferralCode, lang } = body;
      let amount;
      let amountVal;
      let currency;
      if (cents != null) {
        const c = parseInt(cents);
        if (c <= 0) throw new Error("cents invalide");
        currency = (body.cur || "EUR").toUpperCase();
        if (!["EUR", "USD"].includes(currency)) currency = "EUR";
        amountVal = c / 100;
        amount = { value: amountVal.toFixed(2), currency };
      } else if (amountObj?.value && amountObj?.currency) {
        amount = amountObj;
        currency = amount.currency;
        amountVal = parseFloat(amount.value);
      } else throw new Error("cents ou amount requis");
      if (pass && PASS_PRICES[pass]) {
        const expected = PASS_PRICES[pass][currency];
        if (expected !== null && Math.abs(amountVal - expected) >= 0.02) throw new Error("Prix invalide");
        if (expected === null && (amountVal <= 0.5 || amountVal >= 50)) throw new Error("Prix invalide");
      } else if (!pass && (amountVal <= 0 || amountVal >= 300)) throw new Error("Prix invalide");
      if (currency === "USD" && pass && pass !== "trip7") {
        const m = (/* @__PURE__ */ new Date()).getMonth() + 1;
        if (m >= 6 && m <= 11) amount.value = (parseFloat(amount.value) * 1.15).toFixed(2);
      }
      const metadata = userMeta || {};
      metadata.source = source || "unknown";
      metadata.pass = pass || "";
      metadata.email = email || "";
      metadata.lang = lang || "fr";
      if (referredBy) metadata.referredBy = referredBy;
      if (myReferralCode) metadata.myReferralCode = myReferralCode;
      let userId = null;
      if (body.authToken) {
        const sess = await authVerify(env, String(body.authToken));
        if (sess) userId = String(sess.uid);
      }
      if (!userId && email && String(email).includes("@")) {
        const u = await userUpsert(env, String(email).toLowerCase().trim(), "email", null);
        if (u) userId = u.id;
      }
      if (userId) metadata.user_id = userId;
      const kind = pass ? "pass" : "pro";
      const redirectUrl = userRedirect || `https://${host}/payment/good.html?kind=${kind}&email=${encodeURIComponent(email || "")}&plan=${encodeURIComponent(pass || "annual")}`;
      if (pass && email) {
        const idemKey = `mol_${await hashString(email + "|" + pass)}`;
        const ex = await kv(env).get(idemKey);
        if (ex) throw new Error("Paiement d\xE9j\xE0 en cours.");
        await kv(env).put(idemKey, "1", { expirationTtl: 60 });
      }
      const pd = { amount, description: description || (pass ? `Sargasses Pass ${pass}` : "Sargasses"), redirectUrl, webhookUrl: `https://${host}/api/mollie-webhook`, metadata, locale: locale || "fr_FR" };
      if (applePayPaymentToken) pd.applePayPaymentToken = applePayPaymentToken;
      if (cardToken) pd.cardToken = cardToken;
      if (payMethod) pd.method = payMethod;
      const payment = await mollieReq("POST", "v2/payments", apiKey, pd);
      return new Response(JSON.stringify({ checkoutUrl: payment._links?.checkout?.href || null, paymentId: payment.id, user_id: userId || null }), { headers: h });
    }
    if (action === "create_subscription") {
      const { plan: planKey, hosted = true, customerId, email, name, mandateId, method: payMethod, metadata: userMeta } = body;
      const plan = B2B_PLANS[planKey];
      if (!plan) throw new Error(`Plan inconnu: ${planKey}`);
      let cid = customerId;
      if (!cid && email) {
        const customers = await mollieReq("GET", "v2/customers?limit=50", apiKey);
        const existing = (customers._embedded?.customers || []).find((c) => c.email === email);
        if (existing) cid = existing.id;
        else {
          const nc = await mollieReq("POST", "v2/customers", apiKey, { email, name: name || "", metadata: { source: "b2b_monthly_signup" } });
          cid = nc.id;
        }
      }
      if (!cid) throw new Error("customerId ou email requis");
      const sub = await mollieReq("POST", `v2/customers/${cid}/subscriptions`, apiKey, {
        amount: { value: plan.amount.toFixed(2), currency: plan.currency },
        description: plan.description,
        webhookUrl: `https://${host}/api/mollie-webhook`,
        metadata: { ...userMeta || {}, source: "b2b_monthly", plan: planKey },
        interval: plan.interval,
        ...mandateId ? { mandateId } : {},
        ...payMethod ? { method: payMethod } : {}
      });
      const result = { subscriptionId: sub.id, customerId: cid, status: sub.status };
      if (hosted && sub._links?.checkout?.href) result.checkoutUrl = sub._links.checkout.href;
      return new Response(JSON.stringify(result), { headers: h });
    }
    if (action === "payment_status") {
      const paymentId = body.paymentId;
      if (!paymentId) throw new Error("paymentId requis");
      const p = await mollieReq("GET", `v2/payments/${paymentId}`, apiKey);
      const status = p.status || "unknown";
      return new Response(JSON.stringify({ paid: ["paid", "settled"].includes(status), status, paymentId, terminal: ["canceled", "expired", "failed"].includes(status) }), { headers: h });
    }
    if (action === "verify_subscription") {
      const email = (body.email || "").trim();
      if (!email || !email.includes("@")) return new Response(JSON.stringify({ error: "Missing email" }), { status: 400, headers: h });
      // P0.118 §7 — `user_id` n'est pas une colonne de public.payment_grants :
      // il est lu dans metadata (jsonb), ou create_payment l'a depose.
      const rows = await supa(env, "payment_grants", "GET", null, `?select=pass,expires_at,payment_id,metadata&type=eq.b2c_pass&email=eq.${email}&expires_at=gt.now()&order=expires_at.desc&limit=1`);
      if (!rows?.length) return new Response(JSON.stringify({ active: false, reason: "no_pass_grant" }), { headers: h });
      const passEnd = new Date(rows[0].expires_at).getTime();
      if (!passEnd || passEnd <= Date.now()) return new Response(JSON.stringify({ active: false, reason: "no_pass_grant" }), { headers: h });
      const grantUserId = rows[0].metadata?.user_id || null;
      return new Response(JSON.stringify({ active: true, kind: "pass", pass: rows[0].pass, passEnd, status: "paid", user_id: grantUserId }), { headers: h });
    }
    if (action === "auth_google") {
      if (!env.GOOGLE_CLIENT_ID) return new Response(JSON.stringify({ error: "google_not_configured" }), { status: 501, headers: h });
      const credential = String(body.credential || "");
      if (!credential || credential.length > 8192) return new Response(JSON.stringify({ error: "invalid_credential" }), { status: 400, headers: h });
      const g = await verifyGoogleIdToken(env, credential);
      if (!g) return new Response(JSON.stringify({ error: "google_auth_invalid" }), { status: 401, headers: h });
      const user = await userUpsert(env, g.email, "google", g.sub);
      if (!user) return new Response(JSON.stringify({ error: "user_unavailable" }), { status: 503, headers: h });
      const token = await authSign(env, { uid: user.id, email: g.email, type: "sg_session", exp: Math.floor(Date.now() / 1e3) + 90 * 86400 });
      const ent = await userEntitlements(env, user.id, g.email);
      return new Response(JSON.stringify({ ok: true, user_id: user.id, email: g.email, name: g.name, provider: "google", token, ...ent }), { headers: h });
    }
    if (action === "auth_email") {
      const email = String(body.email || "").toLowerCase().trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return new Response(JSON.stringify({ error: "invalid_email" }), { status: 400, headers: h });
      const user = await userUpsert(env, email, "email", null);
      const ent = await userEntitlements(env, user?.id || null, email);
      return new Response(JSON.stringify({ ok: true, user_id: user?.id || null, email, provider: "email", ...ent }), { headers: h });
    }
    if (action === "auth_session") {
      const payload = await authVerify(env, String(body.token || ""));
      if (!payload) return new Response(JSON.stringify({ ok: false, error: "invalid_session" }), { status: 401, headers: h });
      const users = await supaQ(env, "sg_users", "GET", null, `?id=eq.${payload.uid}&select=id,email&limit=1`);
      const email = users?.[0]?.email || String(payload.email || "");
      const ent = await userEntitlements(env, String(payload.uid), email || null);
      return new Response(JSON.stringify({ ok: true, user_id: payload.uid, email, ...ent }), { headers: h });
    }
    if (action === "applepay_session" || action === "applepay_merchant_session") {
      const validationUrl = body.validationUrl || body.validationURL;
      if (!validationUrl) throw new Error("validationUrl requis");
      if (!/^https:\/\/(apple|cdn-apple|guzzoni).*\.apple\.com\//i.test(validationUrl)) throw new Error("validationUrl doit provenir d'apple.com");
      const session = await mollieReq("POST", "v2/wallets/applepay/sessions", apiKey, { validationUrl, domain: body.domain || host });
      return new Response(JSON.stringify(session), { headers: h });
    }
    if (action === "claim_referral_credit") {
      const code = String(body.code || "");
      if (!/^REF-[A-Z0-9]{6}$/.test(code)) return new Response(JSON.stringify({ error: "Code de parrainage invalide" }), { status: 400, headers: h });
      return new Response(JSON.stringify({ days: 0, code, enabled: false }), { headers: h });
    }
    return new Response(JSON.stringify({ error: "action_inconnue" }), { status: 400, headers: h });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || "payment_processing_error").slice(0, 120) }), { status: 500, headers: h });
  }
}
__name(handleMollie, "handleMollie");
// ─────────────────────────────────────────────────────────────────────────────
// P0.118 §6/§7 — Webhook Mollie : adapters, validation autoritative et
// fulfillment durable (grant durable VERIFIE avant tout marqueur KV).
//
// DEUX generations de webhook coexistent chez Mollie :
//   CLASSIQUE : POST application/x-www-form-urlencoded, corps
//               "id=tr_xxx&event=payment.paid". L'identifiant de l'evenement
//               EST l'identifiant de l'entite. (La version live faisait
//               JSON.parse() sur ce corps : le webhook Classique levait une
//               exception et le paiement n'etait jamais honore.)
//   NEXT-GEN  : POST application/json, corps
//               { "resource": "payment", "id": "event_xxx",
//                 "type": "payment.paid", "entityId": "tr_xxx" }.
//               `id` est l'IDENTIFIANT D'EVENEMENT, `entityId` l'identifiant
//               de l'ENTITE. Confondre les deux marque un evenement comme
//               traite alors que l'entite n'a pas ete honoree.
//
// REGLES non negociables :
//   1. Le statut n'est JAMAIS lu dans le corps du webhook : l'etat de
//      l'entite est recupere depuis l'API Mollie (source autoritative).
//   2. Un evenement inconnu ne cree AUCUN grant et n'est PAS marque comme
//      traite (un rejeu ulterieur ne doit pas etre perdu).
//   3. Le grant durable (RPC / ecriture Supabase) est ecrit ET VERIFIE
//      AVANT tout marqueur KV. Un marqueur pose sans grant durable = argent
//      paye sans droit servi, et plus de rejeu possible.
// ─────────────────────────────────────────────────────────────────────────────
function parseMollieWebhook(request, raw) {
  const contentType = String(request.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(raw);
    const id = String(params.get("id") || "").trim();
    const event = String(params.get("event") || params.get("type") || "").trim();
    const resource = event.startsWith("subscription.") ? "subscription" : "payment";
    return {
      generation: "classic",
      eventId: id,
      entityId: id,
      resource,
      event,
      type: event,
      malformed: !id
    };
  }
  let data = null;
  try {
    data = JSON.parse(raw);
  } catch {
    data = null;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { generation: "unknown", eventId: "", entityId: "", resource: "", event: "", type: "", malformed: true };
  }
  const eventId = String(data.id || "").trim();
  const type = String(data.type || "").trim();
  let entityId = String(data.entityId || data.entity_id || "").trim();
  // Un identifiant d'evenement ("event_xxx") n'est JAMAIS un identifiant
  // d'entite ("tr_xxx" / "sub_xxx") : on ne confond pas les deux.
  if (!entityId && /^(tr|sub)_/.test(eventId)) entityId = eventId;
  const resource = String(data.resource || (type.startsWith("subscription.") ? "subscription" : type.startsWith("payment.") ? "payment" : "")).trim();
  return {
    generation: "nextgen",
    eventId,
    entityId,
    resource,
    event: type,
    type,
    malformed: !eventId || !type || !entityId
  };
}
__name(parseMollieWebhook, "parseMollieWebhook");
function classifyPayment(metadata) {
  const source = String(metadata?.source || "");
  if (source === "b2b_annual") return "b2b_annual";
  if (source === "b2b_subscription") return "b2b_onboarding";
  if (source === "b2b_monthly" || source === "b2b_concierge") return "b2b_subscription_only";
  return "b2c";
}
__name(classifyPayment, "classifyPayment");
function validateMollieAmount(payment, pass) {
  const currency = String(payment?.amount?.currency || "").toUpperCase();
  const cents = Math.round(Number.parseFloat(payment?.amount?.value || "") * 100);
  if (!Number.isFinite(cents) || cents <= 0) return { ok: false, reason: "amount_invalid" };
  const expected = PASS_PRICES[pass];
  if (!expected) return { ok: false, reason: "unknown_sku" };
  const base = expected[currency];
  if (base == null) {
    const upper = currency === "USD" && pass !== "trip7" ? 5750 : 5000;
    if (cents <= 50 || cents >= upper) return { ok: false, reason: "amount_out_of_range" };
    return { ok: true, currency, cents };
  }
  const acceptable = [Math.round(base * 100)];
  // create_payment applique un ajustement saisonnier de +15 % en USD sur les
  // pass hors trip7 : le webhook doit accepter le meme montant.
  if (currency === "USD" && pass !== "trip7") acceptable.push(Math.round(acceptable[0] * 1.15));
  if (!acceptable.some((n) => Math.abs(cents - n) <= 2)) return { ok: false, reason: "amount_mismatch" };
  return { ok: true, currency, cents };
}
__name(validateMollieAmount, "validateMollieAmount");
function validateB2BAmount(payment, planKey) {
  const currency = String(payment?.amount?.currency || "").toUpperCase();
  const cents = Math.round(Number.parseFloat(payment?.amount?.value || "") * 100);
  if (!Number.isFinite(cents) || cents <= 0) return { ok: false, reason: "amount_invalid" };
  if (!["EUR", "USD"].includes(currency)) return { ok: false, reason: "currency_invalid" };
  const plan = B2B_PLANS[planKey];
  if (!plan) return { ok: false, reason: "unknown_plan" };
  if (String(plan.currency).toUpperCase() !== currency) return { ok: false, reason: "currency_mismatch" };
  const base = Math.round(plan.amount * 100);
  // 1x (periode) .. 12x (prepaiement annuel) : jamais un montant arbitraire.
  const multiples = [];
  for (let i = 1; i <= 12; i++) multiples.push(base * i);
  if (!multiples.some((n) => Math.abs(cents - n) <= 2)) return { ok: false, reason: "amount_mismatch" };
  return { ok: true, currency, cents };
}
__name(validateB2BAmount, "validateB2BAmount");
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
function validatePaymentForFulfillment(payment, metadata) {
  const problems = [];
  const mode = String(payment?.mode || "");
  const status = String(payment?.status || "");
  const kind = classifyPayment(metadata);
  const pass = String(metadata?.pass || "");
  const email = String(metadata?.email || "");
  const currency = String(payment?.amount?.currency || "").toUpperCase();
  const cents = Math.round(Number.parseFloat(payment?.amount?.value || "") * 100);

  if (mode !== "live") problems.push("not_live_mode");
  if (status !== "paid" && status !== "settled") problems.push("not_paid");
  if (!payment?.paidAt) problems.push("missing_paid_at");
  if (!Number.isFinite(cents) || cents <= 0) problems.push("amount_invalid");
  if (!["EUR", "USD"].includes(currency)) problems.push("currency_invalid");

  if (kind === "b2c") {
    if (!pass || !PASS_PRICES[pass]) problems.push("invalid_sku");
    else {
      const amt = validateMollieAmount(payment, pass);
      if (!amt.ok) problems.push(amt.reason);
    }
    if (!EMAIL_RE.test(email)) problems.push("invalid_email");
  } else if (kind === "b2b_annual") {
    const amt = validateB2BAmount(payment, String(metadata?.plan || "pro_monthly"));
    if (!amt.ok) problems.push(amt.reason);
    if (!EMAIL_RE.test(email)) problems.push("invalid_email");
  } else if (kind === "b2b_onboarding") {
    if (!EMAIL_RE.test(email)) problems.push("invalid_email");
  } else {
    problems.push("unsupported_source");
  }
  return { kind, ok: problems.length === 0, problems, mode, status, pass, email, currency, cents };
}
__name(validatePaymentForFulfillment, "validatePaymentForFulfillment");
async function supaExec(env, table, method, body, query = "") {
  // Ecriture Supabase VERIFIEE : le statut HTTP et le corps sont exposes.
  // L'ancien helper `supa` renvoyait `null` sur erreur, ce qui rendait TOUTE
  // ecriture ratsee silencieusement indiscernable d'un succes.
  if (!env.SUPABASE_SERVICE_KEY) return { ok: false, status: 0, data: null, error: "SUPABASE_SERVICE_KEY absent" };
  try {
    const url = `${env.SUPABASE_URL}/rest/v1/${table}${query}`;
    const r = await fetch(url, {
      method,
      headers: {
        "apikey": env.SUPABASE_SERVICE_KEY,
        "Authorization": `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation"
      },
      body: body !== void 0 ? JSON.stringify(body) : void 0
    });
    const text = await r.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!r.ok) return { ok: false, status: r.status, data, error: `http_${r.status}:${text.slice(0, 160)}` };
    return { ok: true, status: r.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: null, error: String(e?.message || e).slice(0, 160) };
  }
}
__name(supaExec, "supaExec");
async function supaGetChecked(env, table, query) {
  if (!env.SUPABASE_SERVICE_KEY) return { ok: false, status: 0, rows: [], error: "SUPABASE_SERVICE_KEY absent" };
  try {
    const url = `${env.SUPABASE_URL}/rest/v1/${table}${query}`;
    const r = await fetch(url, {
      method: "GET",
      headers: {
        "apikey": env.SUPABASE_SERVICE_KEY,
        "Authorization": `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation"
      }
    });
    const text = await r.text();
    if (!r.ok) return { ok: false, status: r.status, rows: [], error: `http_${r.status}:${text.slice(0, 160)}` };
    let rows = [];
    try {
      rows = text ? JSON.parse(text) : [];
    } catch {
      rows = [];
    }
    return { ok: true, status: r.status, rows: Array.isArray(rows) ? rows : [] };
  } catch (e) {
    return { ok: false, status: 0, rows: [], error: String(e?.message || e).slice(0, 160) };
  }
}
__name(supaGetChecked, "supaGetChecked");
async function callPaymentGrantRpc(env, args) {
  // P0.118 §7 — le grant B2C passe par la fonction SQL
  // public.sg_upsert_payment_grant(...) : ecriture idempotente et atomique
  // (ON CONFLICT (payment_id) DO NOTHING). Les 7 arguments sont EXACTS
  // (cf. scripts/migrations/001_idempotent_payment_grant.sql).
  // Les colonnes `session_id` / `user_id` N'EXISTENT PAS dans
  // public.payment_grants : le POST direct de la version live echouait
  // silencieusement. Le user_id est conserve dans metadata (jsonb).
  if (!env.SUPABASE_SERVICE_KEY) return { ok: false, status: 0, error: "SUPABASE_SERVICE_KEY absent" };
  try {
    const url = `${env.SUPABASE_URL}/rest/v1/rpc/sg_upsert_payment_grant`;
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "apikey": env.SUPABASE_SERVICE_KEY,
        "Authorization": `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      body: JSON.stringify({
        p_payment_id: args.paymentId,
        p_pass: args.pass,
        p_email: args.email,
        p_currency: args.currency,
        p_expires_at: args.expiresAt,
        p_granted_at: args.grantedAt,
        p_metadata: args.metadata
      })
    });
    if (!r.ok) {
      const t = await r.text();
      return { ok: false, status: r.status, error: `rpc_http_${r.status}:${t.slice(0, 160)}` };
    }
    return { ok: true, status: r.status };
  } catch (e) {
    return { ok: false, status: 0, error: String(e?.message || e).slice(0, 160) };
  }
}
__name(callPaymentGrantRpc, "callPaymentGrantRpc");
async function handleWebhook(request, env, ctx) {
  const raw2 = await request.text();
  const secret = env.MOLLIE_WEBHOOK_SECRET;
  if (!secret) return new Response(JSON.stringify({ error: "webhook_unavailable" }), { status: 503 });
  const sig = request.headers.get("X-Mollie-Signature") || request.headers.get("x-mollie-signature") || "";
  if (!await verifyHmac(raw2, sig, secret)) return new Response(JSON.stringify({ error: "invalid_signature" }), { status: 403 });

  const parsed = parseMollieWebhook(request, raw2);
  if (parsed.malformed) return new Response(JSON.stringify({ error: "invalid_payload" }), { status: 400 });

  // Idempotence : Next-gen -> identifiant d'EVENEMENT, Classique ->
  // identifiant d'entite (seul identifiant disponible dans ce format).
  const markerSource = parsed.generation === "nextgen" ? parsed.eventId : parsed.entityId;
  const markerKey = `mollie_${String(markerSource).replace(/[^A-Za-z0-9_.-]/g, "_")}`;
  const existing = await kv(env).get(markerKey);
  if (existing) return new Response(JSON.stringify({ received: true, duplicate: true }));

  try {
    const apiKey = env.MOLLIE_API_KEY;
    if (parsed.resource === "payment") {
      // Etat AUTORITATIVE : jamais le corps du webhook.
      const payment = await mollieReq("GET", `v2/payments/${parsed.entityId}`, apiKey);
      const status = String(payment.status || "");
      const metadata = payment.metadata && typeof payment.metadata === "object" && !Array.isArray(payment.metadata) ? payment.metadata : {};
      const event = parsed.event || "";
      const pass = String(metadata.pass || "");

      // Type d'evenement reconnu ? Un evenement inconnu ne cree AUCUN grant
      // et n'est PAS marque comme traite (le rejeu doit rester possible).
      const knownEvents = ["payment.paid", "payment.failed", "payment.canceled", "payment.expired", "payment.refunded"];
      if (event && !knownEvents.includes(event)) {
        return new Response(JSON.stringify({ received: true, type: "payment", status, event, processed: false, granted: false, reasons: ["unsupported_event"] }));
      }

      // Remboursement : on retire l'acces (revocation par expiration du
      // grant durable — `public.payment_grants` n'a pas de colonne `status`)
      // et on supprime la clef KV du pass.
      if (event === "payment.refunded") {
        if (pass && PASS_PRICES[pass]) await kv(env).delete(`mol_b2c_pass_${parsed.entityId}`);
        const rev = await supaExec(env, "payment_grants", "PATCH", { expires_at: new Date().toISOString() }, `?payment_id=eq.${encodeURIComponent(parsed.entityId)}&type=eq.b2c_pass`);
        if (!rev.ok) throw new Error(`b2c_revoke_failed:${rev.error}`);
        await kv(env).put(markerKey, "1", { expirationTtl: 86400 });
        return new Response(JSON.stringify({ received: true, type: "payment", status, event, processed: true, granted: false, revoked: true }));
      }

      // Etat terminal negatif : on libere un pass en attente et l'evenement
      // est definitif -> marqueur pose.
      if (status === "failed" || status === "canceled" || status === "expired") {
        if (pass && PASS_PRICES[pass]) await kv(env).delete(`mol_b2c_pass_${parsed.entityId}`);
        await kv(env).put(markerKey, "1", { expirationTtl: 86400 });
        return new Response(JSON.stringify({ received: true, type: "payment", status, event, processed: true, granted: false }));
      }

      const check = validatePaymentForFulfillment(payment, metadata);
      if (!check.ok) {
        // Aucun grant et AUCUN marqueur "traite" : l'evenement reste
        // rejouable et on ne pretend pas avoir honore le paiement.
        console.log(`[sg] mollie payment non honore ${parsed.entityId}: ${check.problems.join(",")}`);
        // Evenement "paye" contredit par l'etat autoritaire : etat
        // transitoire -> on repond en erreur pour que Mollie rejoue.
        if (event === "payment.paid" && !check.problems.includes("not_live_mode")) {
          return new Response(JSON.stringify({ error: "payment_not_settled_yet", reasons: check.problems }), { status: 409 });
        }
        return new Response(JSON.stringify({ received: true, type: "payment", status, event, processed: false, granted: false, reasons: check.problems }));
      }

      if (check.kind === "b2b_annual") {
        const planKey = String(metadata.plan || "pro_monthly");
        await grantB2B(env, check.email, planKey, parsed.entityId, 365, { metadata });
        await kv(env).put(markerKey, "1", { expirationTtl: 86400 });
        return new Response(JSON.stringify({ received: true, type: "payment", status, processed: true, granted: true, kind: "b2b_annual" }));
      }
      if (check.kind === "b2b_onboarding") {
        const onboarding = await grantOnboardingAuto(env, check.email, metadata);
        await kv(env).put(markerKey, "1", { expirationTtl: 86400 });
        return new Response(JSON.stringify({ received: true, type: "payment", status, processed: true, granted: true, kind: "b2b_onboarding", email: onboarding.email_sent ? "sent" : "failed" }));
      }
      await grantB2C(env, parsed.entityId, check.pass, check.email, metadata, check.currency);
      await kv(env).put(markerKey, "1", { expirationTtl: 86400 });
      return new Response(JSON.stringify({ received: true, type: "payment", status, processed: true, granted: true, kind: "b2c_pass" }));
    }
    if (parsed.resource === "subscription") {
      const sub = await mollieReq("GET", `v2/subscriptions/${parsed.entityId}`, apiKey);
      const status = String(sub.status || "");
      const metadata = sub.metadata && typeof sub.metadata === "object" && !Array.isArray(sub.metadata) ? sub.metadata : {};
      const planKey = String(metadata.plan || "");
      const cid = String(sub.customerId || "");
      const event = parsed.event || "";

      if (["subscription.canceled", "subscription.expired"].includes(event)) {
        await kv(env).delete(`mollie_grant_${sub.id}`);
        // `public.payment_grants` n'a PAS de colonne `status` (cf.
        // supabase/schema.sql) : la revocation par PATCH status echouait
        // silencieusement. On expire le grant (colonne reelle) et on
        // conserve la ligne pour l'audit.
        const rev = await supaExec(env, "payment_grants", "PATCH", { expires_at: new Date().toISOString() }, `?subscription_id=eq.${encodeURIComponent(sub.id)}&type=eq.b2b_pro`);
        if (!rev.ok) throw new Error(`b2b_revoke_failed:${rev.error}`);
        await kv(env).put(markerKey, "1", { expirationTtl: 86400 });
        return new Response(JSON.stringify({ received: true, type: "subscription", status, event, processed: true, granted: false, revoked: true }));
      }

      const knownPlan = !!B2B_PLANS[planKey];
      const grantable = ["subscription.created", "subscription.updated", "subscription.paid"].includes(event) && knownPlan;
      if (grantable) {
        const allowedStatuses = event === "subscription.paid" ? ["active", "pending", "paid"] : ["active", "pending"];
        if (!allowedStatuses.includes(status)) {
          return new Response(JSON.stringify({ received: true, type: "subscription", status, event, processed: false, granted: false, reasons: ["subscription_not_active"] }));
        }
        const amount = validateB2BAmount(sub, planKey);
        if (!amount.ok) {
          return new Response(JSON.stringify({ received: true, type: "subscription", status, event, processed: false, granted: false, reasons: [amount.reason] }));
        }
        await grantB2B(env, cid, planKey, sub.id, 30, { metadata });
        await kv(env).put(markerKey, "1", { expirationTtl: 86400 });
        if (event === "subscription.created") {
          try {
            ctx?.waitUntil(supa(env, "analytics_events", "POST", { event: "subscription_created", params: { plan: planKey, subscription_id: sub.id } }).catch(() => {
            }));
          } catch (_) {
          }
        }
        if (event === "subscription.paid") {
          try {
            ctx?.waitUntil(supa(env, "analytics_events", "POST", { event: "b2b_trial_to_paid", params: { plan: planKey, subscription_id: sub.id } }).catch(() => {
            }));
          } catch (_) {
          }
        }
        return new Response(JSON.stringify({ received: true, type: "subscription", status, event, processed: true, granted: true, kind: "b2b_subscription" }));
      }
      // Evenement inconnu / plan inconnu : AUCUN grant et AUCUN marqueur.
      return new Response(JSON.stringify({ received: true, type: "subscription", status, event, processed: false, granted: false, reasons: ["unsupported_event"] }));
    }
    // Ressource inconnue : aucun grant, aucun marqueur "traite" (le rejeu
    // doit rester possible si Mollie rejoue un evenement ulterieusement
    // reconnu).
    return new Response(JSON.stringify({ received: true, type: parsed.resource || "unknown", processed: false, granted: false, reasons: ["unsupported_resource"] }));
  } catch (error) {
    console.log("[sg] mollie webhook error:", String(error?.message || error).slice(0, 160));
    return new Response(JSON.stringify({ error: "webhook_processing_error" }), { status: 500 });
  }
}
__name(handleWebhook, "handleWebhook");
async function grantB2B(env, customerId, planKey, subId, days = 30, options = {}) {
  const k = `mollie_grant_${subId}`;
  if (await kv(env).get(k)) return { ok: true, already: true };
  const exp = Math.floor(Date.now() / 1e3) + days * 86400;
  const expiresAt = new Date(exp * 1e3).toISOString();
  const grantedAt = (/* @__PURE__ */ new Date()).toISOString();

  // P0.118 §7 — colonnes REELLES de public.payment_grants (cf.
  // supabase/schema.sql) : subscription_id, type, plan, customer_id,
  // expires_at, granted_at (+ metadata jsonb). Aucune colonne inventee.
  // L'ecriture est VERIFIEE : l'ancien helper `supa` renvoyait `null` sur
  // erreur, donc un echec d'ecriture etait indiscernable d'un succes.
  const write = await supaExec(env, "payment_grants", "POST", {
    subscription_id: subId,
    type: "b2b_pro",
    plan: planKey,
    customer_id: customerId,
    expires_at: expiresAt,
    granted_at: grantedAt,
    metadata: options.metadata || {}
  });
  if (!write.ok) throw new Error(`b2b_grant_write_failed:${write.error}`);

  // Verification du grant durable AVANT le marqueur KV.
  const read = await supaGetChecked(env, "payment_grants", `?subscription_id=eq.${encodeURIComponent(subId)}&type=eq.b2b_pro&select=subscription_id,type,plan,customer_id,expires_at&limit=1`);
  if (!read.ok) throw new Error(`b2b_grant_verify_read_failed:${read.error}`);
  const row = read.rows[0];
  if (!row) throw new Error("b2b_grant_verify_missing_row");
  if (String(row.plan || "") !== String(planKey)) throw new Error("b2b_grant_verify_plan_mismatch");

  // SEULEMENT maintenant : jeton KV d'acces.
  const token = await widgetSign(env, { plan: planKey, customer_id: customerId, subscription_id: subId, exp, type: "b2b_pro" });
  await kv(env).put(k, token, { expirationTtl: (days + 1) * 86400 });
  return { ok: true };
}
__name(grantB2B, "grantB2B");
async function grantB2C(env, paymentId, pass, email, meta, currency) {
  const k = `mol_b2c_pass_${paymentId}`;
  if (await kv(env).get(k)) return { ok: true, already: true };
  const days = PASS_DURATIONS[pass] || 30;
  const exp = Math.floor(Date.now() / 1e3) + days * 86400;
  const expiresAt = new Date(exp * 1e3).toISOString();
  const grantedAt = (/* @__PURE__ */ new Date()).toISOString();
  const cur = String(currency || meta?.currency || "").toUpperCase() || "EUR";

  // P0.118 §7 — le grant durable passe par la fonction SQL
  // public.sg_upsert_payment_grant(...) : idempotente et atomique
  // (ON CONFLICT (payment_id) DO NOTHING). Les 7 arguments sont EXACTS
  // (cf. scripts/migrations/001_idempotent_payment_grant.sql).
  // Les colonnes `session_id` / `user_id` N'EXISTENT PAS dans
  // public.payment_grants : le POST direct de la version live echouait
  // silencieusement. Le user_id reste dans metadata (jsonb).
  const rpc = await callPaymentGrantRpc(env, {
    paymentId,
    pass,
    email,
    currency: cur,
    expiresAt,
    grantedAt,
    metadata: meta || {}
  });
  if (!rpc.ok) throw new Error(`b2c_grant_rpc_failed:${rpc.error}`);

  // Verification du grant durable AVANT tout marqueur KV.
  const read = await supaGetChecked(env, "payment_grants", `?payment_id=eq.${encodeURIComponent(paymentId)}&select=payment_id,type,pass,email,currency,expires_at,granted_at&limit=1`);
  if (!read.ok) throw new Error(`b2c_grant_verify_read_failed:${read.error}`);
  const row = read.rows[0];
  if (!row) throw new Error("b2c_grant_verify_missing_row");
  if (String(row.type || "") !== "b2c_pass") throw new Error("b2c_grant_verify_type_mismatch");
  if (String(row.pass || "") !== String(pass)) throw new Error("b2c_grant_verify_pass_mismatch");
  if (String(row.email || "") !== String(email || "")) throw new Error("b2c_grant_verify_email_mismatch");
  if (String(row.currency || "").toUpperCase() !== cur) throw new Error("b2c_grant_verify_currency_mismatch");

  // SEULEMENT maintenant : marqueur KV (deduplication cote Worker).
  await kv(env).put(k, JSON.stringify({ pass, email, expires_at: exp }), { expirationTtl: (days + 1) * 86400 });
  return { ok: true };
}
__name(grantB2C, "grantB2C");
async function grantOnboardingAuto(env, email, meta) {
  let widgetToken = crypto.randomUUID();
  const plan = (meta.plan || "pro_monthly").toString();
  const region = (meta.region || "martinique").toString();
  let domain = (meta.domain || "sargasses-martinique.com").toString();
  const expiresAt = Math.floor(Date.now() / 1e3) + 365 * 86400;
  // P0.118 §7 — ecriture VERIFIEE avant l'email et avant tout marqueur :
  // on ne peut pas annoncer un onboarding reussi si la ligne n'existe pas.
  // Idempotence : si un abonnement actif existe deja pour cette adresse, on
  // le REUTILISE (pas de doublon lors d'un rejeu de l'evenement).
  let existing = null;
  try {
    const found = await supaGetChecked(env, "b2b_subscriptions", `?company_email=eq.${encodeURIComponent(email)}&status=eq.active&select=company_email,plan,region,domain,widget_token&limit=1`);
    if (found.ok && found.rows[0]) existing = found.rows[0];
  } catch (_) {
    existing = null;
  }
  if (existing) {
    widgetToken = String(existing.widget_token || widgetToken);
    domain = String(existing.domain || domain);
  } else {
    const write = await supaExec(env, "b2b_subscriptions", "POST", {
      company_email: email,
      region,
      domain,
      plan,
      status: "active",
      widget_token: widgetToken,
      mollie_customer_id: meta.mollie_customer_id || "",
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    });
    if (!write.ok) throw new Error(`b2b_onboarding_write_failed:${write.error}`);
  }
  const iframeCode = `<iframe src="https://${domain}/widget?token=${widgetToken}" width="100%" height="320" frameborder="0"></iframe>`;
  const subject = plan === "pro_monthly" ? `Bienvenue SargaGame Pro \u2014 votre widget est pr\xEAt` : `Bienvenue SargaGame Brief \u2014 votre widget est pr\xEAt`;
  const lang = region && ["florida", "puntacana", "rivieramaya"].includes(region.toLowerCase()) ? "en" : "fr";
  const html = lang === "en" ? `Bonjour,<br><br>Your SargaGame ${plan} subscription is active.<br><br>Here is your widget to integrate into your site:<br><code>${iframeCode}</code><br><br>Copy this code and paste it into your website.<br><br>Your dashboard: https://${domain}/b2b?token=${widgetToken}<br>Support: contact@${domain}<br><br>Thank you for your trust,<br>SargaGame` : `Bonjour,<br><br>Abonnement SargaGame ${plan} actif.<br><br>Voici votre widget \xE0 int\xE9grer sur votre site :<br><code>${iframeCode}</code><br><br>Copiez ce code et collez-le dans votre site web.<br><br>Votre dashboard: https://${domain}/b2b?token=${widgetToken}<br>Support: contact@${domain}<br><br>Merci de votre confiance,<br>SargaGame`;
  // Le droit durable (ligne b2b_subscriptions) existe deja et est verifie :
  // l'email est une NOTIFICATION. Son echec est signale explicitement dans
  // la reponse du webhook, il ne doit pas faire mentir le fulfillment.
  const mail = await sendEmail(email, subject, html, domain, env);
  if (!mail?.success) console.log(`[sg] onboarding email non envoye (${email})`);
  await supa(env, "analytics_events", "POST", {
    event: "sg_client_onboarded",
    params: { plan, region, domain, email }
  }).catch(() => {
  });
  return { ok: true, email_sent: !!mail?.success, provider: mail?.provider || null };
}
__name(grantOnboardingAuto, "grantOnboardingAuto");
async function handlePartnerCommerce(request, env, ctx, path) {
  const h = cors(request);
  const url = new URL(request.url);
  const subPath = path.replace("/api/partner/", "");
  if (!await rateLimit(env, "partner_commerce", 200)) {
    return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: h });
  }
  if (request.method === "GET" && subPath === "catalog") {
    const region = url.searchParams.get("region");
    const partnerTrackingId = url.searchParams.get("partner");
    if (!region) return new Response(JSON.stringify({ error: "region required" }), { status: 400, headers: h });
    return new Response(JSON.stringify({ ok: true, catalog: [], message: "Catalog API not yet implemented for this partner" }), { headers: h });
  }
  if (request.method === "POST" && subPath === "quote") {
    const body = await request.json();
    const { partner_id, product_id, quantity, variants, beach_context } = body;
    if (!partner_id || !product_id) return new Response(JSON.stringify({ error: "partner_id, product_id required" }), { status: 400, headers: h });
    return new Response(JSON.stringify({ ok: false, error: "CAPABILITY_MISSING", capability: "quote", partner: partner_id }), { status: 501, headers: h });
  }
  if (request.method === "POST" && subPath === "availability") {
    const body = await request.json();
    const { partner_id, product_id, quantity, variants, dates } = body;
    if (!partner_id || !product_id) return new Response(JSON.stringify({ error: "partner_id, product_id required" }), { status: 400, headers: h });
    return new Response(JSON.stringify({ ok: false, error: "CAPABILITY_MISSING", capability: "availability", partner: partner_id }), { status: 501, headers: h });
  }
  if (request.method === "POST" && subPath === "create-order") {
    const body = await request.json();
    const { cart, customer_email, customer_name, region, beach_id, lang = "fr" } = body;
    if (!cart || !cart.length || !customer_email || !region) {
      return new Response(JSON.stringify({ error: "cart, customer_email, region required" }), { status: 400, headers: h });
    }
    const orderId = `SG-ORDER-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const total_cents = cart.reduce((sum, item) => sum + (item.price_cents || 0) * (item.quantity || 1), 0);
    const currency = cart[0]?.currency || "EUR";
    const firstItem = cart[0];
    await supa(env, "partner_orders", "POST", {
      order_id: orderId,
      partner_id: firstItem.partner_id,
      partner_name: firstItem.partner_name || firstItem.partner_id,
      product_id: firstItem.product_id,
      product_name: firstItem.product_name || firstItem.product_id,
      quantity: firstItem.quantity || 1,
      unit_price_cents: firstItem.price_cents || 0,
      total_cents,
      currency,
      customer_email,
      customer_name: customer_name || "",
      region_id: region,
      beach_id: beach_id || null,
      mollie_payment_id: null,
      partner_reference: null,
      status: "PENDING",
      gross_amount_cents: total_cents,
      partner_cost_cents: null,
      sargagame_margin_cents: null,
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    }).catch((e) => {
      console.log("partner_orders insert failed (table may not exist):", e?.message);
    });
    const host = request.headers.get("Host") || "sargasses-martinique.com";
    const apiKey = env.MOLLIE_API_KEY;
    const description = `Commande partenaire ${firstItem.partner_id} \u2014 ${cart.length} article(s)`;
    const redirectUrl = `https://${host}/?partner_order_success=1&order_id=${orderId}`;
    const pd = {
      amount: { value: (total_cents / 100).toFixed(2), currency },
      description,
      redirectUrl,
      webhookUrl: `https://${host}/api/mollie-webhook`,
      metadata: {
        source: "partner_commerce",
        partner_order_id: orderId,
        partner_id: firstItem.partner_id,
        product_id: firstItem.product_id,
        region,
        beach_id: beach_id || "",
        customer_name: customer_name || "",
        cart: JSON.stringify(cart.map((i) => ({
          partner_id: i.partner_id,
          product_id: i.product_id,
          quantity: i.quantity,
          price_cents: i.price_cents
        })))
      },
      locale: lang === "en" ? "en_US" : lang === "es" ? "es_ES" : "fr_FR"
    };
    try {
      const payment = await mollieReq("POST", "v2/payments", apiKey, pd);
      const checkoutUrl = payment._links?.checkout?.href || null;
      const paymentId = payment.id || null;
      await supa(env, "partner_orders", "PATCH", {
        mollie_payment_id: paymentId,
        status: "PAYMENT_PENDING",
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      }, `?order_id=eq.${orderId}`).catch(() => {
      });
      ctx.waitUntil(supa(env, "analytics_events", "POST", {
        event: "sg_checkout_start",
        params: { order_id: orderId, partner_id: firstItem.partner_id, total_cents, currency },
        island: region
      }).catch(() => {
      }));
      return new Response(JSON.stringify({ ok: true, order_id: orderId, payment_id: paymentId, checkout_url: checkoutUrl, total_cents, currency }), { headers: h });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: h });
    }
  }
  if (request.method === "POST" && subPath === "confirm-order") {
    const body = await request.json();
    const { order_id, payment_id } = body;
    if (!order_id) return new Response(JSON.stringify({ error: "order_id required" }), { status: 400, headers: h });
    let paid = false;
    if (payment_id) {
      try {
        const apiKey = env.MOLLIE_API_KEY;
        const payment = await mollieReq("GET", `v2/payments/${payment_id}`, apiKey);
        paid = ["paid", "settled"].includes(payment.status || "");
      } catch {
      }
    }
    const newStatus = paid ? "PAID" : "PAYMENT_PENDING";
    await supa(env, "partner_orders", "PATCH", {
      status: newStatus,
      mollie_payment_id: payment_id || null,
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    }, `?order_id=eq.${order_id}`).catch(() => {
    });
    if (paid) {
      ctx.waitUntil(supa(env, "analytics_events", "POST", {
        event: "sg_order_paid",
        params: { order_id, payment_id },
        island: null
      }).catch(() => {
      }));
    }
    return new Response(JSON.stringify({ ok: true, order_id, status: newStatus, paid }), { headers: h });
  }
  if (request.method === "POST" && subPath === "cancel-order") {
    const body = await request.json();
    const { order_id, reason } = body;
    if (!order_id) return new Response(JSON.stringify({ error: "order_id required" }), { status: 400, headers: h });
    await supa(env, "partner_orders", "PATCH", {
      status: "CANCELLED",
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    }, `?order_id=eq.${order_id}`).catch(() => {
    });
    ctx.waitUntil(supa(env, "analytics_events", "POST", {
      event: "sg_order_cancelled",
      params: { order_id, reason },
      island: null
    }).catch(() => {
    }));
    return new Response(JSON.stringify({ ok: true, order_id, status: "CANCELLED" }), { headers: h });
  }
  return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: h });
}
__name(handlePartnerCommerce, "handlePartnerCommerce");
export {
  index_default as default
};
