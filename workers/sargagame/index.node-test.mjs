// Lancer : node --test workers/sargagame/index.node-test.mjs
// Dépendance zéro (node:test). Nom volontairement hors du motif *.test.* pour ne pas être
// ramassé par vitest/Playwright.
import test from "node:test";
import assert from "node:assert/strict";

const SRC = process.env.WORKER_SRC || "./index.js";
const worker = (await import(SRC)).default;
const ORIGIN = "https://sargasses-martinique.com";

const baseEnv = () => ({
  MOLLIE_WEBHOOK_SECRET: "s3cret",
  MOLLIE_API_KEY: "test_key",
  SUPABASE_URL: "https://sb.example",
  SUPABASE_SERVICE_KEY: "svc",
  ASSETS: { fetch: async () => new Response("asset") },
});
const call = (path, init = {}, env = baseEnv()) =>
  worker.fetch(new Request("https://worker.test" + path, { headers: { Origin: ORIGIN, ...(init.headers || {}) }, ...init }), env);
const post = (path, body, env) =>
  call(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, env);

test("b2b-trial : email valide -> jeton, vérifiable par widget-token", async () => {
  const r = await post("/api/b2b-trial", { email: "contact@hotel-exemple.fr" });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.ok, true);
  assert.equal(j.days, 30);
  const v = await (await call("/api/widget-token?k=" + encodeURIComponent(j.token))).json();
  assert.equal(v.pro, true);
  assert.equal(v.host, "contact@hotel-exemple.fr");
});

test("b2b-trial : emails invalides rejetés", async () => {
  for (const email of ["", "abc", "a@b", "a b@c.fr", "@x.fr"]) {
    const r = await post("/api/b2b-trial", { email });
    assert.equal(r.status, 400, email);
  }
});

test("b2b-trial : sans secret -> 503 ; OPTIONS -> 204 ; GET -> 405", async () => {
  const env = baseEnv(); delete env.MOLLIE_WEBHOOK_SECRET;
  assert.equal((await post("/api/b2b-trial", { email: "a@b.fr" }, env)).status, 503);
  assert.equal((await call("/api/b2b-trial", { method: "OPTIONS" })).status, 204);
  assert.equal((await call("/api/b2b-trial")).status, 405);
});

test("widget-token : jeton expiré, falsifié ou absent -> pro:false", async () => {
  const realNow = Date.now;
  Date.now = () => 10 * 86400 * 1000; // émis en 1970 => expiré
  const old = await (await post("/api/b2b-trial", { email: "a@b.fr" })).json();
  Date.now = realNow;
  assert.equal((await (await call("/api/widget-token?k=" + encodeURIComponent(old.token))).json()).pro, false);
  const fresh = await (await post("/api/b2b-trial", { email: "a@b.fr" })).json();
  const [p, s] = fresh.token.split(".");
  assert.equal((await (await call("/api/widget-token?k=" + p + ".x" + s.slice(1))).json()).pro, false);
  assert.equal((await (await call("/api/widget-token")).json()).pro, false);
});

function stubFetch(handlers) {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    for (const [prefix, fn] of handlers) if (String(url).startsWith(prefix)) return fn(url, init);
    throw new Error("unexpected fetch " + url);
  };
  return { calls, restore: () => (globalThis.fetch = real) };
}
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
const form = (id) => ({ method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "id=" + id });

test("webhook Mollie (non signé, comme Mollie l'envoie) : paiement payé -> pass accordé", async () => {
  const s = stubFetch([
    ["https://api.mollie.com/v2/payments/", () => json({ id: "tr_1", status: "paid", amount: { currency: "EUR" }, metadata: { pass: "p30", email: "x@y.fr" } })],
    ["https://sb.example/rest/v1/payment_grants", () => new Response(null, { status: 201 })],
  ]);
  try {
    const r = await call("/api/mollie-webhook", form("tr_1"));
    assert.equal(r.status, 200);
    assert.equal((await r.json()).status, "paid");
    const grant = s.calls.find((c) => c.url.includes("payment_grants"));
    assert.ok(grant, "grant Supabase attendu");
    assert.equal(JSON.parse(grant.init.body).email, "x@y.fr");
  } finally { s.restore(); }
});

test("webhook Mollie : paiement non payé -> aucun pass ; lookup en échec -> 502 (Mollie réessaie)", async () => {
  let s = stubFetch([["https://api.mollie.com/v2/payments/", () => json({ id: "tr_2", status: "open" })]]);
  try {
    const r = await call("/api/mollie-webhook", form("tr_2"));
    assert.equal(r.status, 200);
    assert.equal(s.calls.some((c) => c.url.includes("payment_grants")), false);
  } finally { s.restore(); }
  s = stubFetch([["https://api.mollie.com/v2/payments/", () => json({ detail: "boom" }, 500)]]);
  try { assert.equal((await call("/api/mollie-webhook", form("tr_3"))).status, 502); } finally { s.restore(); }
});

test("webhook Mollie : id manquant -> 400 ; GET -> 405", async () => {
  assert.equal((await call("/api/mollie-webhook", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "" })).status, 400);
  assert.equal((await call("/api/mollie-webhook")).status, 405);
});
