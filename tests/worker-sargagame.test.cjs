const assert = require("node:assert/strict");
const { webcrypto } = require("node:crypto");
globalThis.crypto ||= webcrypto;

const base64url = (value) => Buffer.from(value).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

(async () => {
  const { default: worker } = await import("../workers/sargagame/index.js");
  const secret = "test-only-webhook-secret";
  const env = { MOLLIE_WEBHOOK_SECRET: secret, MOLLIE_API_KEY: "test_api_key" };
  const originalFetch = globalThis.fetch;
  const fetched = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    fetched.push({ url, init });
    if (url.startsWith("https://api.mollie.com/v2/payments/")) {
      const id = decodeURIComponent(url.split("/").pop());
      return new Response(JSON.stringify({ id, status: "open", metadata: {} }), {
        status: 200, headers: { "content-type": "application/json" }
      });
    }
    throw new Error("Unexpected fetch in test: " + url);
  };

  try {
    // Valid B2B trial token can be verified by the widget-token endpoint.
    let response = await worker.fetch(new Request("https://worker.test/api/b2b-trial", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "hotel@example.com" })
    }), env);
    assert.equal(response.status, 200);
    const issued = await response.json();
    assert.equal(issued.ok, true);
    assert.equal(issued.days, 30); // Existing clients keep the 30-day default.
    assert.ok(issued.token);

    response = await worker.fetch(new Request("https://worker.test/api/b2b-trial", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "pilot@example.com", days: 14 })
    }), env);
    assert.equal(response.status, 200);
    const hotelTrial = await response.json();
    assert.equal(hotelTrial.days, 14);
    assert.ok(hotelTrial.token);

    response = await worker.fetch(new Request("https://worker.test/api/widget-token?k=" + encodeURIComponent(issued.token)), env);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { pro: true, host: "hotel@example.com" });

    // Expired token is rejected even when its HMAC is otherwise valid.
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret + "|sgwidget-pro-v1"));
    const key = await crypto.subtle.importKey("raw", digest, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const expiredPayload = base64url(JSON.stringify({ h: "expired@example.com", exp: Math.floor(Date.now() / 1000) - 60 }));
    const expiredSignature = base64url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(expiredPayload)));
    const expiredToken = expiredPayload + "." + expiredSignature;
    response = await worker.fetch(new Request("https://worker.test/api/widget-token?k=" + encodeURIComponent(expiredToken)), env);
    assert.deepEqual(await response.json(), { pro: false });

    // Invalid email is rejected before issuing a token.
    response = await worker.fetch(new Request("https://worker.test/api/b2b-trial", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "not-an-email" })
    }), env);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "invalid_email" });

    // Legacy Mollie webhook: id-only form body, no signature, then authoritative API lookup.
    response = await worker.fetch(new Request("https://worker.test/api/mollie-webhook", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "id=tr_legacy_test"
    }), env);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).paymentId, "tr_legacy_test");
    assert.ok(fetched.some(x => x.url.endsWith("/tr_legacy_test")));

    // Next-gen webhook: HMAC-SHA256 signature in Mollie's documented sha256=<hex> format.
    const body = JSON.stringify({ resource: "event", id: "event_test", type: "payment.paid", entityId: "tr_signed_test" });
    const signingKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = Buffer.from(await crypto.subtle.sign("HMAC", signingKey, new TextEncoder().encode(body))).toString("hex");
    response = await worker.fetch(new Request("https://worker.test/api/mollie-webhook", {
      method: "POST", headers: { "content-type": "application/json", "x-mollie-signature": "sha256=" + sig },
      body
    }), env);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).paymentId, "tr_signed_test");

    // Signed-style event without a signature must be rejected.
    response = await worker.fetch(new Request("https://worker.test/api/mollie-webhook", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ resource: "event", id: "event_forged", type: "payment.paid", entityId: "tr_forged" })
    }), env);
    assert.equal(response.status, 403);

    console.log("PASS: trial valid token, expired token, invalid email, legacy webhook lookup, signed next-gen webhook, unsigned event rejection");
  } finally {
    globalThis.fetch = originalFetch;
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
