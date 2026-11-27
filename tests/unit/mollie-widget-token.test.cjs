const assert = require("node:assert/strict");
const { webcrypto } = require("node:crypto");
globalThis.crypto ||= webcrypto;

/**
 * mollie-widget-token.test.cjs — contrat du token Pro (Worker régional).
 *
 * 2026-11-11 (issue #1273) : ce Worker NE PERSISTE aucun lead. Il rendait
 * `{ok:true,token}` sur `/api/b2b-trial` → l'UI affichait « essai activé »
 * alors que PERSONNE n'était enregistré (prospect perdu en silence). Le
 * handler qui persiste est `sg-payments` (vérifié sur les 6 domaines live).
 * Le Worker régional REFUSE donc désormais explicitement (fail-closed).
 *
 * La vérification du token (`/api/widget-token`) reste couverte : les tokens
 * sont signs à la main (même dérivation que le Worker) — le test vérifie
 * l'URL-safe base64, l'hôte restitué et le rejet des tokens expirés.
 */
(async () => {
  const { default: worker } = await import("../../workers/sargagame/index.js");
  const secret = "test-only-widget-token-secret";
  const env = { MOLLIE_WEBHOOK_SECRET: secret };

  const signToken = async (payloadObj) => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret + "|sgwidget-pro-v1"));
    const signingKey = await crypto.subtle.importKey("raw", digest, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const payload = Buffer.from(JSON.stringify(payloadObj)).toString("base64url");
    const sig = Buffer.from(await crypto.subtle.sign("HMAC", signingKey, new TextEncoder().encode(payload))).toString("base64url");
    return payload + "." + sig;
  };

  try {
    // ── 1. Le Worker régional REFUSE d'émettre un trial sans persistance ────
    const refused = await worker.fetch(new Request("https://worker.test/api/b2b-trial", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "hotel@example.com" })
    }), env);
    assert.equal(refused.status, 503);
    const body = await refused.json();
    assert.equal(body.ok, false, "aucun faux succès : ok doit être false");
    assert.equal(body.error, "b2b_trial_not_persisted_here");
    assert.ok(!body.token, "aucun token ne doit être émis sans persistance");

    // ── 2. La validation d'email reste stricte (400) ────────────────────────
    const invalid = await worker.fetch(new Request("https://worker.test/api/b2b-trial", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "not-an-email" })
    }), env);
    assert.equal(invalid.status, 400);
    assert.deepEqual(await invalid.json(), { error: "invalid_email" });

    // ── 3. La vérification du token reste intacte (URL-safe base64 + hôte) ──
    // Multiple tokens exercise base64url substitutions in both payload and signature.
    for (let i = 0; i < 24; i++) {
      const host = "hotel" + i + "@example.com";
      const token = await signToken({ h: host, exp: Math.floor(Date.now() / 1000) + 3600 });
      assert.ok(!/[+/]/.test(token), "token must use URL-safe base64 alphabet");

      const checked = await worker.fetch(new Request("https://worker.test/api/widget-token?k=" + encodeURIComponent(token)), env);
      assert.equal(checked.status, 200);
      assert.deepEqual(await checked.json(), { pro: true, host });
    }

    const expiredToken = await signToken({
      h: "expired@example.com",
      exp: Math.floor(Date.now() / 1000) - 60
    });
    const expired = await worker.fetch(new Request("https://worker.test/api/widget-token?k=" + encodeURIComponent(expiredToken)), env);
    assert.deepEqual(await expired.json(), { pro: false });

    console.log("PASS: regional worker refuse le trial sans persistance (fail-closed), validation email stricte, token URL-safe vérifié, token expiré rejeté");
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
})();
