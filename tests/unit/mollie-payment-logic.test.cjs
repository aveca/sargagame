const assert = require("node:assert/strict");

(async () => {
  const { default: worker } = await import("../../workers/sargagame/index.js");
  const env = {
    MOLLIE_API_KEY: "test_only_key",
    SUPABASE_URL: "https://supabase.test",
    SUPABASE_SERVICE_KEY: "test_only_service_key"
  };
  const state = { payment: null, apiStatus: 200, rpcStatus: 204, rpcBody: null, rpcCalls: [] };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.startsWith("https://api.mollie.com/v2/payments/")) {
      return new Response(JSON.stringify(state.payment || {}), {
        status: state.apiStatus, headers: { "content-type": "application/json" }
      });
    }
    if (url === env.SUPABASE_URL + "/rest/v1/rpc/sg_upsert_payment_grant") {
      state.rpcCalls.push({ url, init, body: JSON.parse(init.body) });
      if (state.rpcStatus === 204) return new Response(null, { status: 204 });
      return new Response(JSON.stringify(state.rpcBody || { code: "test_error" }), {
        status: state.rpcStatus, headers: { "content-type": "application/json" }
      });
    }
    throw new Error("Unexpected fetch URL: " + url);
  };

  function makePayment(overrides = {}) {
    return {
      id: "tr_test_paid",
      status: "paid",
      amount: { currency: "EUR", value: "14.99" },
      metadata: { pass: "p30", email: "buyer@example.com", source: "test" },
      ...overrides
    };
  }
  async function paymentStatus(payment, payload = {}) {
    state.payment = payment;
    state.apiStatus = 200;
    state.rpcStatus = 204;
    state.rpcBody = null;
    state.rpcCalls = [];
    const response = await worker.fetch(new Request("https://worker.test/api/mollie", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "payment_status", paymentId: payment.id || "tr_test_paid", ...payload })
    }), env);
    return { response, body: await response.json() };
  }

  try {
    // Paid EUR p30 payment grants through the RPC with its named parameters.
    let result = await paymentStatus(makePayment(), { email: "buyer@example.com" });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.paid, true);
    assert.equal(state.rpcCalls.length, 1);
    assert.equal(state.rpcCalls[0].url, env.SUPABASE_URL + "/rest/v1/rpc/sg_upsert_payment_grant");
    assert.deepEqual(Object.keys(state.rpcCalls[0].body).sort(), [
      "p_currency", "p_email", "p_expires_at", "p_granted_at", "p_metadata", "p_pass", "p_payment_id"
    ].sort());
    assert.equal(state.rpcCalls[0].body.p_payment_id, "tr_test_paid");
    assert.equal(state.rpcCalls[0].body.p_pass, "p30");
    assert.equal(state.rpcCalls[0].body.p_email, "buyer@example.com");
    assert.equal(state.rpcCalls[0].body.p_currency, "EUR");
    assert.ok(Number.isFinite(Date.parse(state.rpcCalls[0].body.p_expires_at)));

    // A paid payment with an amount inconsistent with the configured p30 EUR price never grants.
    result = await paymentStatus(makePayment({ amount: { currency: "EUR", value: "1.00" } }));
    assert.equal(result.response.status, 409);
    assert.equal(result.body.paid, false);
    assert.equal(state.rpcCalls.length, 0);

    // SOS is the only B2C pass allowed to have an empty email.
    result = await paymentStatus(makePayment({
      id: "tr_sos_test",
      amount: { currency: "EUR", value: "1.00" },
      metadata: { pass: "sos", email: "", source: "sos_plage" }
    }));
    assert.equal(result.response.status, 200);
    assert.equal(result.body.paid, true);
    assert.equal(state.rpcCalls.length, 1);
    assert.equal(state.rpcCalls[0].body.p_pass, "sos");
    assert.equal(state.rpcCalls[0].body.p_email, "");

    // Email ownership mismatch blocks a grant.
    result = await paymentStatus(makePayment(), { email: "attacker@example.com" });
    assert.equal(result.response.status, 403);
    assert.equal(state.rpcCalls.length, 0);

    // A missing RPC fails closed rather than granting without idempotence.
    state.payment = makePayment();
    state.rpcStatus = 404;
    state.rpcBody = { code: "PGRST202" };
    const response = await worker.fetch(new Request("https://worker.test/api/mollie", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "payment_status", paymentId: "tr_test_paid", email: "buyer@example.com" })
    }), env);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, "rpc_unavailable");

    // Non-paid Mollie statuses cannot grant.
    state.payment = makePayment({ status: "open" });
    state.rpcStatus = 204;
    state.rpcCalls = [];
    const pending = await worker.fetch(new Request("https://worker.test/api/mollie", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "payment_status", paymentId: "tr_test_paid" })
    }), env);
    assert.equal(pending.status, 200);
    assert.equal((await pending.json()).paid, false);
    assert.equal(state.rpcCalls.length, 0);

    console.log("PASS: payment_status RPC arguments, amount validation, SOS no-email, owner mismatch, RPC fail-closed, pending status");
  } finally {
    globalThis.fetch = originalFetch;
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
