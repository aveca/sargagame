// tests/unit/webhook-signature.test.cjs — Audit des logiques de signature webhook (Mollie + Stripe + PayPal)
// Aucun appel réseau, aucune valeur secrète affichée. Vérifie la présence du code de vérification.
// Lancement : node tests/unit/webhook-signature.test.cjs

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');

const MOLLIE_WH = path.join(process.cwd(), 'public', 'api', 'mollie-webhook.php');
const STRIPE_WH = path.join(process.cwd(), 'public', 'api', 'stripe-webhook.php');
const PAYPAL_WH = path.join(process.cwd(), 'public', 'api', 'paypal-webhook.php');

let passed = 0;
function check(name, cond) {
  assert.ok(cond, name);
  passed++;
  console.log('  ✓ ' + name);
}

console.log('Webhook signature — audit source (masqué)\n');

// --- Mollie : webhooks classiques, HMAC-SHA256, X-Mollie-Signature, fail-closed 503 ---
console.log('1. Mollie (webhooks classiques)');
const m = fs.readFileSync(MOLLIE_WH, 'utf8');
check('HMAC-SHA256 sur le body brut', /hash_hmac\('sha256',\s*\$raw/.test(m));
check('header X-Mollie-Signature lu', /HTTP_X_MOLLIE_SIGNATURE/.test(m));
check('fail-closed HTTP 503 si webhook_secret absent', /http_response_code\(503\)/.test(m));
check('comparaison à temps constante (hash_equals)', /hash_equals/.test(m));
check('préfixe sha256= retiré avant comparaison', m.includes("preg_replace('/^sha256=/i'"));

// --- Stripe : signature v1, t=..., v1=..., HMAC ---
console.log('\n2. Stripe (signature v1)');
const s = fs.readFileSync(STRIPE_WH, 'utf8');
check('header Stripe-Signature lu', /HTTP_STRIPE_SIGNATURE/.test(s));
check('format t=..., v1=...', /t=.*v1=/.test(s));
check('secret de signature depuis stripe-config.php', /webhook_secret/.test(s));

// --- PayPal : signature API officielle (PAYPAL-AUTH-ALGO, CERT-URL, TRANSMISSION-*) ---
console.log('\n3. PayPal (signature API officielle)');
const p = fs.readFileSync(PAYPAL_WH, 'utf8');
check('PAYPAL-AUTH-ALGO lu', /PAYPAL-AUTH-ALGO/.test(p));
check('PAYPAL-CERT-URL lu', /PAYPAL-CERT-URL/.test(p));
check('PAYPAL-TRANSMISSION-SIG lu', /PAYPAL-TRANSMISSION-SIG/.test(p));
check('webhook_id pour vérification API', /webhook_id/.test(p));

console.log('\n' + passed + ' test(s) Webhook signature : TOUS PASSÉS');
process.exit(0);
