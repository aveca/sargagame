// Cycle 2 — P0 fulfillment recovery for sargagame regional Worker.
// Covers: paid/not paid, cancelled, wrong currency, legacy p7 alias EUR 7.99/USD 5.99,
//          legacy p7 amount mismatch, new-payment creation rejects p7, cross-path retry,
//          RPC failure retry, network failure, and idempotent replay.
const assert = require("node:assert/strict");

(async () => {
  const { default: worker } = await import("../../workers/sargagame/index.js");

  const env = {
    MOLLIE_API_KEY: "test_only_key",
    SUPABASE_URL: "https://supabase.test",
    SUPABASE_SERVICE_KEY: "test_only_service_key",
  };

  const state = {
    payments: {},      // id -> payment object (Mollie)
    paymentExists: {}, // id -> boolean (404)
    rpcStatus: 204,    // 204; set to 500/401/404 to simulate failures
    rpcFailCode: "rpc_test_failure",
    rpcCalls: [],      // { body }
    mollieLookups: 0,
    mollieNetworkError: false,
    rpcNetworkError: false,
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);

    if (url.startsWith("https://api.mollie.com/v2/payments/")) {
      state.mollieLookups++;
      if (state.mollieNetworkError) throw new Error("mollie network down");
      const id = decodeURIComponent(url.split("/").pop());
      if (!state.paymentExists[id] && !state.payments[id]) {
        return new Response(JSON.stringify({ title: "Not found" }), { status: 404, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify(state.payments[id] || {}), { status: 200, headers: { "content-type": "application/json" } });
    }

    if (url === env.SUPABASE_URL + "/rest/v1/rpc/sg_upsert_payment_grant") {
      if (state.rpcNetworkError) throw new Error("supabase network down");
      state.rpcCalls.push({ body: JSON.parse(init.body) });
      if (state.rpcStatus === 204) return new Response(null, { status: 204 });
      return new Response(JSON.stringify({ code: state.rpcFailCode }), {
        status: state.rpcStatus, headers: { "content-type": "application/json" },
      });
    }

    throw new Error("Unexpected fetch URL: " + url);
  };

  function classicRequest(id) {
    return new Request("https://worker.test/api/mollie-webhook", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "id=" + encodeURIComponent(id),
    });
  }

  function resetState() {
    state.payments = {};
    state.paymentExists = {};
    state.rpcStatus = 204;
    state.rpcFailCode = "rpc_test_failure";
    state.rpcCalls = [];
    state.mollieLookups = 0;
    state.mollieNetworkError = false;
    state.rpcNetworkError = false;
  }

  let passed = 0;
  async function test(name, fn) {
    resetState();
    await fn();
    passed++;
    console.log("  ✓", name);
  }

  try {
    await test("webhook paid → RPC call and granted=true (classic contract form id)", async () => {
      state.payments["tr_paid"] = { id: "tr_paid", status: "paid", amount: { currency: "EUR", value: "14.99" }, metadata: { pass: "p30", email: "buyer@example.com", source: "test" } };
      const r = await worker.fetch(classicRequest("tr_paid"), env);
      assert.equal(r.status, 200);
      const b = await r.json();
      assert.equal(b.granted, true);
      assert.equal(b.status, "paid");
      assert.equal(state.rpcCalls.length, 1);
      assert.equal(state.rpcCalls[0].body.p_payment_id, "tr_paid");
    });

    await test("replay same webhook → still 1 RPC per request, idempotent by payment_id", async () => {
      state.payments["tr_replay"] = { id: "tr_replay", status: "paid", amount: { currency: "EUR", value: "4.99" }, metadata: { pass: "trip7", email: "b@example.com", source: "test" } };
      const r1 = await worker.fetch(classicRequest("tr_replay"), env);
      assert.equal((await r1.json()).granted, true);
      const r2 = await worker.fetch(classicRequest("tr_replay"), env);
      assert.equal((await r2.json()).granted, true);
      // Each webhook performs exactly one RPC call; the DB enforces uniqueness via payment_id.
      assert.equal(state.rpcCalls.length, 2);
      assert.equal(state.rpcCalls[0].body.p_payment_id, "tr_replay");
      assert.equal(state.rpcCalls[1].body.p_payment_id, "tr_replay");
      assert.equal(state.rpcCalls[0].body.p_pass, "trip7");
    });

    await test("webhook non-paid (open / authorized / pending) → granted:false, no RPC", async () => {
      for (const st of ["open", "authorized", "pending", "canceled", "failed", "expired", "refunded"]) {
        state.payments["tr_np"] = { id: "tr_np", status: st, amount: { currency: "EUR", value: "14.99" }, metadata: { pass: "p30", email: "b@example.com" } };
        const r = await worker.fetch(classicRequest("tr_np"), env);
        assert.equal(r.status, 200, `status ${st}`);
        const b = await r.json();
        assert.equal(b.granted, false);
        assert.equal(b.status, st);
        assert.equal(state.rpcCalls.length, 0, `no RPC for ${st}`);
      }
    });

    await test("webhook canceled → no grant, acknowledged 200", async () => {
      state.payments["tr_can"] = { id: "tr_can", status: "canceled", amount: { currency: "EUR", value: "14.99" }, metadata: { pass: "p30", email: "b@example.com" } };
      const r = await worker.fetch(classicRequest("tr_can"), env);
      assert.equal(r.status, 200);
      const b = await r.json();
      assert.equal(b.granted, false);
      assert.equal(state.rpcCalls.length, 0);
    });

    await test("wrong currency → amount_mismatch / unsupported_currency, no RPC", async () => {
      // p30 EUR payment paid in EUR is valid; p30 USD with USD should be accepted (current prices)
      // Fraud: p30 EUR amount but USD currency (or vice-versa swapped without matching price)
      state.payments["tr_cur"] = { id: "tr_cur", status: "paid", amount: { currency: "EUR", value: "11.99" }, metadata: { pass: "p30", email: "b@example.com" } };
      const r1 = await worker.fetch(classicRequest("tr_cur"), env);
      assert.equal(r1.status, 200);
      assert.equal((await r1.json()).granted, false);
      assert.equal(state.rpcCalls.length, 0);

      state.payments["tr_cur2"] = { id: "tr_cur2", status: "paid", amount: { currency: "USD", value: "14.99" }, metadata: { pass: "p30", email: "b@example.com" } };
      const r2 = await worker.fetch(classicRequest("tr_cur2"), env);
      assert.equal((await r2.json()).granted, false);
      assert.equal(state.rpcCalls.length, 0);

      state.payments["tr_cur3"] = { id: "tr_cur3", status: "paid", amount: { currency: "EUR", value: "14.99" }, metadata: { pass: "p30", email: "b@example.com" } };
      const r3 = await worker.fetch(classicRequest("tr_cur3"), env);
      assert.equal((await r3.json()).granted, true);
      assert.equal(state.rpcCalls.length, 1);
    });

    await test("unknown pass → granted:false, no RPC", async () => {
      state.payments["tr_unk"] = { id: "tr_unk", status: "paid", amount: { currency: "EUR", value: "14.99" }, metadata: { pass: "vip666", email: "b@example.com" } };
      const r = await worker.fetch(classicRequest("tr_unk"), env);
      assert.equal(r.status, 200);
      const b = await r.json();
      assert.equal(b.granted, false);
      assert.equal(b.reason, "unknown_pass");
      assert.equal(state.rpcCalls.length, 0);
    });

    await test("legacy p7 EUR 7.99 → canonical trip7 grant (7 days)", async () => {
      state.payments["tr_p7eur"] = { id: "tr_p7eur", status: "paid", amount: { currency: "EUR", value: "7.99" }, metadata: { pass: "p7", email: "legacy@example.com", source: "test" } };
      const r = await worker.fetch(classicRequest("tr_p7eur"), env);
      assert.equal(r.status, 200);
      const b = await r.json();
      assert.equal(b.granted, true);
      assert.equal(state.rpcCalls.length, 1);
      assert.equal(state.rpcCalls[0].body.p_pass, "trip7"); // canonical
      assert.equal(state.rpcCalls[0].body.p_email, "legacy@example.com");
      assert.equal(state.rpcCalls[0].body.p_currency, "EUR");
      const days = (Date.parse(state.rpcCalls[0].body.p_expires_at) - Date.parse(state.rpcCalls[0].body.p_granted_at)) / 86400000;
      assert.ok(Math.abs(days - 7) < 0.01, `days=${days}`);
    });

    await test("legacy p7 USD 5.99 → canonical trip7 grant", async () => {
      state.payments["tr_p7usd"] = { id: "tr_p7usd", status: "paid", amount: { currency: "USD", value: "5.99" }, metadata: { pass: "p7", email: "legacy@example.com" } };
      const r = await worker.fetch(classicRequest("tr_p7usd"), env);
      assert.equal((await r.json()).granted, true);
      assert.equal(state.rpcCalls.length, 1);
      assert.equal(state.rpcCalls[0].body.p_pass, "trip7");
      assert.equal(state.rpcCalls[0].body.p_currency, "USD");
    });

    await test("legacy p7 with wrong amount (EUR 4.99) → amount_mismatch, no grant", async () => {
      // Prevents confusion between current trip7 price and legacy p7 price.
      state.payments["tr_p7bad"] = { id: "tr_p7bad", status: "paid", amount: { currency: "EUR", value: "4.99" }, metadata: { pass: "p7", email: "legacy@example.com" } };
      const r = await worker.fetch(classicRequest("tr_p7bad"), env);
      const b = await r.json();
      assert.equal(b.granted, false);
      assert.equal(b.reason, "amount_mismatch");
      assert.equal(state.rpcCalls.length, 0);
    });

    await test("new trip7 EUR 4.99 → granted (current price)", async () => {
      state.payments["tr_trip7"] = { id: "tr_trip7", status: "paid", amount: { currency: "EUR", value: "4.99" }, metadata: { pass: "trip7", email: "b@example.com" } };
      const r = await worker.fetch(classicRequest("tr_trip7"), env);
      assert.equal((await r.json()).granted, true);
      assert.equal(state.rpcCalls.length, 1);
      assert.equal(state.rpcCalls[0].body.p_pass, "trip7");
    });

    await test("fraud: p30 at 0.01 EUR → amount_mismatch", async () => {
      state.payments["tr_fraud"] = { id: "tr_fraud", status: "paid", amount: { currency: "EUR", value: "0.01" }, metadata: { pass: "p30", email: "fraud@example.com" } };
      const r = await worker.fetch(classicRequest("tr_fraud"), env);
      const b = await r.json();
      assert.equal(b.granted, false);
      assert.equal(b.reason, "amount_mismatch");
      assert.equal(state.rpcCalls.length, 0);
    });

    await test("RPC 500 → 503 grant_sync_failed; retry later succeeds", async () => {
      state.payments["tr_rpc"] = { id: "tr_rpc", status: "paid", amount: { currency: "EUR", value: "14.99" }, metadata: { pass: "p30", email: "b@example.com" } };
      state.rpcStatus = 500;
      const r1 = await worker.fetch(classicRequest("tr_rpc"), env);
      assert.equal(r1.status, 503);
      assert.equal((await r1.json()).error, "grant_sync_failed");
      // Mollie retries the webhook later → success
      state.rpcStatus = 204;
      const r2 = await worker.fetch(classicRequest("tr_rpc"), env);
      assert.equal(r2.status, 200);
      assert.equal((await r2.json()).granted, true);
    });

    await test("RPC 401 (invalid service role) → 503, no false success", async () => {
      state.payments["tr_401"] = { id: "tr_401", status: "paid", amount: { currency: "EUR", value: "14.99" }, metadata: { pass: "p30", email: "b@example.com" } };
      state.rpcStatus = 401;
      state.rpcFailCode = "invalid_api_key";
      const r = await worker.fetch(classicRequest("tr_401"), env);
      assert.equal(r.status, 503);
      const body = await r.json();
      assert.equal(body.error, "grant_sync_failed");
      // Worker must NOT claim granted:true
      if (body.granted) throw new Error("False success on RPC failure");
    });

    await test("RPC 404 PGRST202 → rpc_unavailable 503", async () => {
      state.payments["tr_404"] = { id: "tr_404", status: "paid", amount: { currency: "EUR", value: "14.99" }, metadata: { pass: "p30", email: "b@example.com" } };
      state.rpcStatus = 404;
      state.rpcFailCode = "PGRST202";
      const r = await worker.fetch(classicRequest("tr_404"), env);
      assert.equal(r.status, 503);
      assert.equal((await r.json()).error, "rpc_unavailable");
    });

    await test("Supabase network error → 503 grant_sync_failed (no silent success)", async () => {
      state.payments["tr_net"] = { id: "tr_net", status: "paid", amount: { currency: "EUR", value: "14.99" }, metadata: { pass: "p30", email: "b@example.com" } };
      state.rpcNetworkError = true;
      const r = await worker.fetch(classicRequest("tr_net"), env);
      assert.equal(r.status, 503);
      assert.equal((await r.json()).error, "grant_sync_failed");
    });

    await test("Mollie network error → 503 mollie_api_unavailable", async () => {
      state.mollieNetworkError = true;
      const r = await worker.fetch(classicRequest("tr_any"), env);
      assert.equal(r.status, 503);
      assert.equal((await r.json()).error, "mollie_api_unavailable");
    });

    await test("Mollie 404 → 404 without grant", async () => {
      state.payments["tr_missing"] = null;
      delete state.payments["tr_missing"];
      const r = await worker.fetch(classicRequest("tr_missing"), env);
      assert.equal(r.status, 404);
      assert.equal(state.rpcCalls.length, 0);
    });

    await test("wrong content-type → 415 (signed JSON contract rejected by regional worker)", async () => {
      state.payments["tr_signed"] = { id: "tr_signed", status: "paid", amount: { currency: "EUR", value: "14.99" }, metadata: { pass: "p30", email: "b@example.com" } };
      const r = await worker.fetch(new Request("https://worker.test/api/mollie-webhook", {
        method: "POST",
        headers: { "content-type": "application/json", "X-Mollie-Signature": "deadbeef" },
        body: JSON.stringify({ id: "tr_signed", type: "payment" }),
      }), env);
      assert.equal(r.status, 415);
      assert.equal(state.mollieLookups, 0);
    });

    await test("payment_status path also grants legacy p7 via RPC", async () => {
      state.payments["tr_statusp7"] = { id: "tr_statusp7", status: "paid", amount: { currency: "EUR", value: "7.99" }, metadata: { pass: "p7", email: "legacy@example.com" } };
      const r = await worker.fetch(new Request("https://worker.test/api/mollie", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "payment_status", paymentId: "tr_statusp7", email: "legacy@example.com" }),
      }), env);
      assert.equal(r.status, 200);
      const b = await r.json();
      assert.equal(b.paid, true);
      assert.equal(b.granted, true);
      assert.equal(state.rpcCalls.length, 1);
      assert.equal(state.rpcCalls[0].body.p_pass, "trip7");
    });

    await test("create_payment rejects legacy p7 pass (new purchases cannot use old price)", async () => {
      state.payments["tr_unused"] = { id: "tr_unused", status: "paid", amount: { currency: "EUR", value: "7.99" }, metadata: { pass: "p7", email: "x@example.com" } };
      // create_payment with pass=p7 must NOT create a payment at legacy price.
      // Worker validates against PASS_PRICES only; p7 is not in DAYS_TABLE/PASS_PRICES → treated as no-pass → falls to generic amount check.
      // Our assertion: creating with pass="p7" at EUR 7.99 does not yield a payment with legacy metadata pass p7 (worker will either 400 or create with pass="")
      // Current implementation: prices[pass] undefined → valid = cents<30000 && !pass? Actually: if(pass && prices[pass]) check... else valid = valid && !pass && cents<30000 → pass="p7" → valid=false → "Prix invalide" 400.
      const r = await worker.fetch(new Request("https://worker.test/api/mollie", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create_payment", pass: "p7", cents: 799, cur: "EUR", email: "legacy@example.com" }),
      }), env);
      // Worker should reject (400 Prices invalide) because p7 is not a sellable pass anymore.
      assert.equal(r.status, 400);
    });

    console.log(`\nPASS: ${passed} cycle-2 fulfillment cases`);
  } finally {
    globalThis.fetch = originalFetch;
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
