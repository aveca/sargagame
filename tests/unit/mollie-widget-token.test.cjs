const assert = require("node:assert/strict");
const { webcrypto } = require("node:crypto");
globalThis.crypto ||= webcrypto;

(async () => {
  const { default: worker } = await import("../../workers/sargagame/index.js");
  const secret = "test-only-widget-token-secret";
  const env = { MOLLIE_WEBHOOK_SECRET: secret };

  try {
    let validTokens = [];
    // Multiple tokens exercise base64url substitutions in both payload and signature.
    for (let i = 0; i < 24; i++) {
      const response = await worker.fetch(new Request("https://worker.test/api/b2b-trial", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "hotel" + i + "@example.com" })
      }), env);
      assert.equal(response.status, 200);
      const issued = await response.json();
      assert.equal(issued.ok, true);
      assert.ok(issued.token);
      assert.ok(!/[+/]/.test(issued.token), "token must use URL-safe base64 alphabet");
      validTokens.push(issued.token);

      const checked = await worker.fetch(new Request("https://worker.test/api/widget-token?k=" + encodeURIComponent(issued.token)), env);
      assert.equal(checked.status, 200);
      assert.deepEqual(await checked.json(), { pro: true, host: "hotel" + i + "@example.com" });
    }

    const invalid = await worker.fetch(new Request("https://worker.test/api/b2b-trial", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "not-an-email" })
    }), env);
    assert.equal(invalid.status, 400);
    assert.deepEqual(await invalid.json(), { error: "invalid_email" });

    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret + "|sgwidget-pro-v1"));
    const signingKey = await crypto.subtle.importKey("raw", digest, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const payload = Buffer.from(JSON.stringify({
      h: "expired@example.com",
      exp: Math.floor(Date.now() / 1000) - 60
    })).toString("base64url");
    const sig = Buffer.from(await crypto.subtle.sign("HMAC", signingKey, new TextEncoder().encode(payload))).toString("base64url");
    const expired = await worker.fetch(new Request("https://worker.test/api/widget-token?k=" + encodeURIComponent(payload + "." + sig)), env);
    assert.deepEqual(await expired.json(), { pro: false });

    console.log("PASS: URL-safe widget token issue/verify, malformed email rejection, expired token rejection");
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
})();
