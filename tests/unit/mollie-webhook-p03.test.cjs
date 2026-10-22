const assert = require("node:assert/strict");

(async () => {
  const { default: worker } = await import("../../workers/sargagame/index.js");
  const env = {
    MOLLIE_API_KEY: "test_only_key",
    SUPABASE_URL: "https://supabase.test",
    SUPABASE_SERVICE_KEY: "test_only_service_key"
  };
  const state = { payment: null, apiStatus: 200, rpcStatus: 204, rpcCalls: [] };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.startsWith("https://api.mollie.com/v2/payments/")) {
      state.mollieLookups = (state.mollieLookups || 0) + 1;
      state.lastMollieHeaders = init.headers;
      return new Response(JSON.stringify(state.payment || {}), {
        status: state.apiStatus, headers: { "content-type": "application/json" }
      });
    }
    if (url === env.SUPABASE_URL + "/rest/v1/rpc/sg_upsert_payment_grant") {
      state.rpcCalls.push({ url, body: JSON.parse(init.body) });
      if (state.rpcStatus === 204) return new Response(null, { status: 204 });
      return new Response(JSON.stringify({ code: "rpc_test_failure" }), {
        status: state.rpcStatus, headers: { "content-type": "application/json" }
      });
    }
    throw new Error("Unexpected fetch URL: " + url);
  };

  function makePayment(overrides = {}) {
    return {
      id: "tr_classictest",
      status: "paid",
      amount: { currency: "EUR", value: "14.99" },
      metadata: { pass: "p30", email: "buyer@example.com", source: "test" },
      ...overrides
    };
  }
  function classicRequest(id = "tr_classictest", contentType = "application/x-www-form-urlencoded") {
    return new Request("https://worker.test/api/mollie-webhook", {
      method: "POST",
      headers: { "content-type": contentType },
      body: "id=" + encodeURIComponent(id)
    });
  }
  async function webhook(payment, request = classicRequest()) {
    state.payment = payment;
    state.apiStatus = 200;
    state.rpcStatus = 204;
    state.rpcCalls = [];
    state.mollieLookups = 0;
    const response = await worker.fetch(request, env);
    return { response, body: await response.json() };
  }

  try {
    // Classic Mollie webhook has no HMAC header; the API lookup is the authority.
    let result = await webhook(makePayment());
    assert.equal(result.response.status, 200);
    assert.equal(result.body.granted, true);
    assert.equal(state.mollieLookups, 1);
    assert.equal(state.lastMollieHeaders.Authorization, "Bearer test_only_key");
    assert.equal(state.rpcCalls.length, 1);
    assert.equal(state.rpcCalls[0].body.p_payment_id, "tr_classictest");

    // Repeated webhook reaches the same atomic RPC with the same Mollie payment ID.
    result = await webhook(makePayment());
    assert.equal(result.response.status, 200);
    assert.equal(state.rpcCalls.length, 1);
    assert.equal(state.rpcCalls[0].body.p_payment_id, "tr_classictest");

    // Non-paid payment is acknowledged but never grants.
    result = await webhook(makePayment({ status: "open" }));
    assert.equal(result.response.status, 200);
    assert.equal(result.body.granted, false);
    assert.equal(state.rpcCalls.length, 0);

    // Unknown pass or mismatched amount never grants.
    result = await webhook(makePayment({ metadata: { pass: "unknown", email: "buyer@example.com" } }));
    assert.equal(result.response.status, 200);
    assert.equal(result.body.granted, false);
    assert.equal(state.rpcCalls.length, 0);
    result = await webhook(makePayment({ amount: { currency: "EUR", value: "1.00" } }));
    assert.equal(result.body.granted, false);
    assert.equal(state.rpcCalls.length, 0);

    // Wrong content type and malformed IDs are rejected before any API lookup.
    result = await webhook(makePayment(), new Request("https://worker.test/api/mollie-webhook", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "tr_classictest" })
    }));
    assert.equal(result.response.status, 415);
    assert.equal(state.mollieLookups, 0);
    result = await webhook(makePayment(), classicRequest("not-a-payment-id"));
    assert.equal(result.response.status, 400);
    assert.equal(state.mollieLookups, 0);

    // RPC failure leaves the grant pending and requests Mollie retry (HTTP 503).
    state.payment = makePayment();
    state.rpcStatus = 500;
    const rpcFail = await worker.fetch(classicRequest(), env);
    assert.equal(rpcFail.status, 503);

    // Mollie API 404 propagates as not found without granting.
    state.payment = { title: "Not found" };
    state.apiStatus = 404;
    state.rpcStatus = 204;
    state.rpcCalls = [];
    const lookupFail = await worker.fetch(classicRequest(), env);
    assert.equal(lookupFail.status, 404);
    assert.equal(state.rpcCalls.length, 0);

    console.log("PASS: classic webhook without signature, authenticated lookup, validation, malformed input, retries on RPC outage");
  } finally {
    globalThis.fetch = originalFetch;
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
